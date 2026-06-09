#!/usr/bin/env node
/**
 * Generador de Informe de Operación — Wallest / Hasu Activos Inmobiliarios SL
 * Estilo: Los Gallardos + dashboard con gráficos.
 *
 * USO:
 *   node scripts/generar-informe-operacion.js datos.json
 *   node scripts/generar-informe-operacion.js datos.json --output informe.pdf
 */

const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')

const NARANJA = '#E8621A'
const GRIS10  = '#1A1A1A'
const GRIS40  = '#666666'
const GRIS70  = '#999999'
const GRIS80  = '#CCCCCC'
const GRIS_BG = '#F5F3EF'
const VERDE   = '#2D7A4F'
const ROJO    = '#C0392B'
const AMARILLO= '#B7791F'

function fmt(n) {
  if (n == null) return '—'
  if (Math.abs(n) >= 1000000) return `${(n/1000000).toFixed(2)}M€`
  if (Math.abs(n) >= 1000) return `${(n/1000).toFixed(Math.abs(n) < 10000 ? 1 : 0)}k€`
  return `${n}€`
}

function colorRiesgo(nivel) {
  if (nivel === 'ALTO')  return ROJO
  if (nivel === 'MEDIO') return AMARILLO
  return VERDE
}

// ── PROYECCIÓN 36 MESES con incremento anual ──────────────────────────────────
function calcProyeccion(escAlquilerHab, inversion, incremento = 0.05, meses = 36, ocupacion = 0.8) {
  const gastos = escAlquilerHab.gastos_mes.total
  const precioBase = escAlquilerHab.precio_hab * escAlquilerHab.hab_ocupadas
  const labels = []
  const ingresos = []
  const netos = []
  const acumulado = []
  let acum = -inversion

  for (let m = 1; m <= meses; m++) {
    const año = Math.floor((m - 1) / 12)
    const factor = Math.pow(1 + incremento, año)
    const bruto = Math.round(precioBase * factor * ocupacion)
    const neto = bruto - gastos
    acum += neto
    labels.push(m % 6 === 0 || m === 1 ? `M${m}` : '')
    ingresos.push(bruto)
    netos.push(neto)
    acumulado.push(Math.round(acum))
  }
  return { labels, ingresos, netos, acumulado }
}

// ── ESCENARIO CARD ────────────────────────────────────────────────────────────
function renderEscenario(e) {
  if (e.division_horizontal) {
    return `
    <div class="escenario ${e.destacado ? 'escenario-destacado' : ''}">
      <div class="esc-titulo">${e.nombre}</div>
      <div class="esc-roi">${e.roi}</div>
      <div class="esc-roi-label">ROI post IS 25%</div>
      <table class="esc-tabla">
        <tr><td>Bajo</td><td>${fmt(e.venta_bajo)}</td></tr>
        <tr><td>Dúplex</td><td>${fmt(e.venta_duplex)}</td></tr>
        <tr class="tr-total"><td>Venta total</td><td>${fmt(e.venta_total)}</td></tr>
        <tr><td>Inversión</td><td>${fmt(e.inversion_total)}</td></tr>
        <tr><td>Benef. bruto</td><td>${fmt(e.beneficio_bruto)}</td></tr>
        <tr class="tr-neg"><td>IS 25%</td><td>−${fmt(e.is_25)}</td></tr>
        <tr class="tr-total"><td>Benef. neto</td><td>${fmt(e.beneficio_neto)}</td></tr>
      </table>
      ${e.nota ? `<p class="esc-nota">${e.nota}</p>` : ''}
    </div>`
  }
  if (e.ingreso_neto_mes_100 != null) {
    return `
    <div class="escenario ${e.destacado ? 'escenario-destacado' : ''}">
      <div class="esc-titulo">${e.nombre}</div>
      <div class="esc-roi">${e.yield_bruto_anual}</div>
      <div class="esc-roi-label">Yield bruto anual</div>
      <table class="esc-tabla">
        <tr><td>${e.hab_ocupadas} hab × ${fmt(e.precio_hab)}/mes</td><td>${fmt(e.ingreso_bruto_mes)}/mes</td></tr>
        <tr class="tr-neg"><td>Gastos fijos</td><td>−${fmt(e.gastos_mes.total)}/mes</td></tr>
        <tr class="tr-total"><td>Neto 100% ocup.</td><td>${fmt(e.ingreso_neto_mes_100)}/mes</td></tr>
        <tr class="tr-total"><td>Neto 80% ocup.</td><td>${fmt(e.ingreso_neto_mes_80)}/mes</td></tr>
        <tr><td>Yield neto 100%</td><td>${e.yield_neto_100}</td></tr>
        <tr><td>Yield neto 80%</td><td>${e.yield_neto_80}</td></tr>
        <tr><td>Payback</td><td>${e.payback_años}</td></tr>
      </table>
      ${e.nota ? `<p class="esc-nota">${e.nota}</p>` : ''}
    </div>`
  }
  return `
  <div class="escenario ${e.destacado ? 'escenario-destacado' : ''}">
    <div class="esc-titulo">${e.nombre}</div>
    <div class="esc-roi">${e.yield_bruto_anual}</div>
    <div class="esc-roi-label">Yield bruto anual</div>
    <table class="esc-tabla">
      <tr><td>Bajo</td><td>${fmt(e.bajo_mes)}/mes</td></tr>
      <tr><td>Dúplex</td><td>${fmt(e.duplex_mes)}/mes</td></tr>
      <tr class="tr-total"><td>Ingreso bruto</td><td>${fmt(e.ingreso_bruto_mes)}/mes</td></tr>
      <tr class="tr-neg"><td>Gastos</td><td>−${fmt(e.gastos_mes)}/mes</td></tr>
      <tr class="tr-total"><td>Ingreso neto</td><td>${fmt(e.ingreso_neto_mes)}/mes</td></tr>
      <tr><td>Yield neto</td><td>${e.yield_neto_anual}</td></tr>
    </table>
    ${e.nota ? `<p class="esc-nota">${e.nota}</p>` : ''}
  </div>`
}

// ── HTML ──────────────────────────────────────────────────────────────────────
function buildHTML(data) {
  const inv = data.inversion
  const escAlqHab = data.escenarios.find(e => e.ingreso_neto_mes_100 != null)
  const escCAVV   = data.escenarios.find(e => e.division_horizontal)
  const proyeccion = escAlqHab ? calcProyeccion(escAlqHab, inv.total) : null

  // Hero: imagen o degradado
  const imagenPath = data.meta.imagen
  let heroBg = 'linear-gradient(135deg, #E8621A 0%, #C9A96E 100%)'
  if (imagenPath && fs.existsSync(imagenPath)) {
    const ext = path.extname(imagenPath).slice(1).toLowerCase()
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
    const b64 = fs.readFileSync(imagenPath).toString('base64')
    heroBg = `linear-gradient(135deg, rgba(232,98,26,0.85) 0%, rgba(201,169,110,0.70) 100%), url('data:${mime};base64,${b64}') center/cover no-repeat`
  }

  // KPIs
  const kpis = [
    { label: 'Yield Bruto', valor: escAlqHab?.yield_bruto_anual ?? '—', sub: 'Anual (100% ocup.)' },
    { label: 'Yield Neto', valor: escAlqHab?.yield_neto_80 ?? '—', sub: 'Anual (80% ocup.)' },
    { label: 'Payback', valor: escAlqHab?.payback_años?.split(' ')[0] ?? '—', sub: 'Con +5% anual' },
    { label: 'ROI CAVV', valor: escCAVV?.roi ?? '—', sub: 'Post IS 25%' },
  ]
  const kpiHTML = kpis.map(k => `
    <div class="kpi-card">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-valor">${k.valor}</div>
      <div class="kpi-sub">${k.sub}</div>
    </div>`).join('')

  const fichaFilas = [
    ['Unidades', data.ficha.unidades],
    ['Distribución actual', data.ficha.habitaciones_actuales],
    ['Objetivo reforma', data.ficha.habitaciones_objetivo],
    ['Distribución final', data.ficha.distribucion],
    ['Extras por hab', data.ficha.extras],
    ['Estado', data.ficha.estado],
  ].map(([l,v], i) => `
    <tr class="${i%2===0?'fila-par':'fila-impar'}">
      <td class="td-label">${l}</td><td class="td-valor">${v}</td>
    </tr>`).join('')

  const invFilas = [
    ['Precio de compra', fmt(inv.precio_compra)],
    ['Reforma + gastos compraventa', fmt(inv.reforma_y_gastos)],
  ].map(([l,v]) => `
    <tr>
      <td class="td-inv-label">${l}</td>
      <td class="td-inv-valor">${v}</td>
    </tr>`).join('')

  const escenarios = data.escenarios.map(renderEscenario).join('')

  const riesgos = data.riesgos.map(r => `
    <tr>
      <td class="td-riesgo" style="color:${colorRiesgo(r.nivel)};border-left:3px solid ${colorRiesgo(r.nivel)}">${r.nivel}</td>
      <td class="td-riesgo-desc"><strong>${r.titulo}:</strong> ${r.descripcion}</td>
    </tr>`).join('')

  const chartScript = proyeccion ? `
    <script>
    window.addEventListener('load', function() {
      var labels36 = ${JSON.stringify(Array.from({length:36},(_,i)=> i%6===0||i===0?'M'+(i+1):''))};

      // Gráfico 1: Ingresos mensuales
      new Chart(document.getElementById('chart-ingresos').getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels36,
          datasets: [
            { label: 'Ingreso bruto', data: ${JSON.stringify(proyeccion.ingresos)}, backgroundColor: 'rgba(232,98,26,0.3)', borderColor: '#E8621A', borderWidth: 1, borderRadius: 2 },
            { label: 'Ingreso neto',  data: ${JSON.stringify(proyeccion.netos)},    backgroundColor: 'rgba(45,122,79,0.35)', borderColor: '#2D7A4F', borderWidth: 1, borderRadius: 2 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: 'bottom', labels: { font: { size: 9, family: 'Arial' }, color: '#666', boxWidth: 10, padding: 8 } } },
          scales: {
            x: { ticks: { font: { size: 8, family: 'Arial' }, color: '#999', maxRotation: 0 }, grid: { display: false } },
            y: { ticks: { font: { size: 8, family: 'Arial' }, color: '#999', callback: function(v){ return v>=1000?(v/1000).toFixed(1)+'k€':v+'€'; } }, grid: { color: '#F0EDE8' } }
          }
        }
      });

      // Gráfico 2: Flujo acumulado
      var acumData = ${JSON.stringify(proyeccion.acumulado)};
      var colors = acumData.map(function(v){ return v >= 0 ? 'rgba(45,122,79,0.5)' : 'rgba(192,57,43,0.5)'; });
      new Chart(document.getElementById('chart-payback').getContext('2d'), {
        type: 'bar',
        data: {
          labels: labels36,
          datasets: [{ label: 'Flujo acumulado', data: acumData, backgroundColor: colors, borderWidth: 0, borderRadius: 2 }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { font: { size: 8, family: 'Arial' }, color: '#999', maxRotation: 0 }, grid: { display: false } },
            y: { ticks: { font: { size: 8, family: 'Arial' }, color: '#999', callback: function(v){ return (v>=0?'+':'')+Math.round(v/1000)+'k€'; } }, grid: { color: '#F0EDE8' } }
          }
        }
      });
    });
    </script>` : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: ${GRIS10}; background: white; }

  /* HEADER */
  .page-header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 48px 12px; border-bottom: 1px solid ${GRIS80}; }
  .header-marca { font-size: 18pt; font-weight: 900; color: ${GRIS10}; letter-spacing: -0.02em; }
  .header-meta { text-align: right; font-size: 8pt; color: ${GRIS40}; line-height: 1.7; }
  .header-meta strong { color: ${GRIS10}; }

  /* HERO */
  .hero {
    margin: 20px 48px 0;
    border-radius: 12px;
    padding: 24px 28px;
    color: white;
    min-height: 130px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .hero-tipo { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; opacity: 0.85; margin-bottom: 6px; }
  .hero-titulo { font-size: 20pt; font-weight: 700; line-height: 1.1; margin-bottom: 4px; }
  .hero-sub { font-size: 10pt; opacity: 0.85; }

  /* KPI CARDS */
  .kpi-grid { display: flex; gap: 12px; padding: 20px 48px 0; }
  .kpi-card { flex: 1; background: white; border: 1.5px solid ${GRIS80}; border-radius: 8px; padding: 14px 16px; text-align: center; }
  .kpi-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${GRIS40}; margin-bottom: 4px; }
  .kpi-valor { font-size: 20pt; font-weight: 700; color: ${NARANJA}; line-height: 1.1; }
  .kpi-sub { font-size: 7.5pt; color: ${GRIS70}; margin-top: 3px; }

  /* SECCIONES */
  .seccion { padding: 20px 48px 0; }
  .seccion-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: ${GRIS40}; margin-bottom: 10px; }

  /* FICHAS */
  .tabla-ficha { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .tabla-ficha td { padding: 6px 10px; border: 1px solid ${GRIS80}; vertical-align: top; line-height: 1.4; }
  .td-label { width: 28%; font-weight: 600; }
  .fila-par .td-label, .fila-par .td-valor { background: ${GRIS_BG}; }
  .fila-impar .td-label { background: #EDEBE6; }
  .fila-impar .td-valor { background: white; }

  /* INVERSIÓN */
  .tabla-inv { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .tabla-inv td { padding: 7px 12px; border: 1px solid ${GRIS80}; }
  .td-inv-label { background: ${GRIS_BG}; font-weight: 500; }
  .td-inv-valor { background: white; text-align: right; font-weight: 600; width: 25%; }
  .inv-total { background: ${GRIS10} !important; color: white !important; font-weight: 700 !important; font-size: 10.5pt; }
  .inv-total-val { background: ${GRIS10} !important; color: ${NARANJA} !important; font-weight: 700 !important; font-size: 13pt; text-align: right; }

  /* ESCENARIOS */
  .escenarios-grid { display: flex; gap: 14px; }
  .escenario { flex: 1; border: 1.5px solid ${GRIS80}; border-radius: 6px; padding: 14px; background: white; }
  .escenario-destacado { border-color: ${NARANJA}; border-width: 2px; background: #FFF9F6; }
  .esc-titulo { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: ${GRIS40}; margin-bottom: 5px; }
  .escenario-destacado .esc-titulo { color: ${NARANJA}; }
  .esc-roi { font-size: 24pt; font-weight: 700; color: ${NARANJA}; line-height: 1; }
  .esc-roi-label { font-size: 7.5pt; color: ${GRIS40}; margin-bottom: 10px; }
  .esc-tabla { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  .esc-tabla td { padding: 4px 0; border-bottom: 1px solid #F0EDE8; }
  .esc-tabla td:last-child { text-align: right; font-weight: 600; }
  .tr-total td { font-weight: 700; color: ${GRIS10}; border-top: 1.5px solid ${GRIS80}; border-bottom: 1.5px solid ${GRIS80}; }
  .tr-neg td { color: ${ROJO}; }
  .esc-nota { font-size: 7pt; color: ${GRIS70}; margin-top: 8px; line-height: 1.5; font-style: italic; }

  /* GRÁFICOS */
  .charts-grid { display: flex; gap: 16px; }
  .chart-box { flex: 1; border: 1.5px solid ${GRIS80}; border-radius: 6px; padding: 14px; }
  .chart-titulo { font-size: 8pt; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: ${GRIS40}; margin-bottom: 4px; }
  .chart-sub { font-size: 7.5pt; color: ${GRIS70}; margin-bottom: 10px; }
  .chart-wrap { height: 160px; position: relative; }

  /* RIESGOS */
  .tabla-riesgos { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  .td-riesgo { width: 60px; padding: 9px 10px; font-size: 7.5pt; font-weight: 700; letter-spacing: 0.06em; text-align: center; background: #FAFAFA; border: 1px solid ${GRIS80}; white-space: nowrap; }
  .td-riesgo-desc { padding: 9px 14px; border: 1px solid ${GRIS80}; line-height: 1.5; }

  /* VALORACIÓN */
  .valoracion-wrap { page-break-inside: avoid; break-inside: avoid; }
  .valoracion-box { border: 1.5px solid ${NARANJA}; border-radius: 6px; padding: 16px 20px; background: #FFF9F6; font-size: 10pt; line-height: 1.7; }

  /* FOOTER */
  .page-footer { padding: 10px 48px; border-top: 1px solid ${GRIS80}; display: flex; justify-content: space-between; font-size: 7.5pt; color: ${GRIS40}; margin-top: 28px; }

  @media print {
    @page { size: A4; margin: 0; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

<div class="page-header">
  <div class="header-marca">WALLEST</div>
  <div class="header-meta">
    <strong>${data.meta.tipo}</strong><br>
    Fecha: ${data.meta.fecha}<br>
    Ref: ${data.meta.ref} &nbsp;&nbsp; Confidencial
  </div>
</div>

<!-- HERO -->
<div class="hero" style="background: ${heroBg}">
  <div class="hero-tipo">${data.meta.tipo}</div>
  <div class="hero-titulo">${data.meta.titulo}</div>
  <div class="hero-sub">${data.meta.subtitulo}</div>
</div>

<!-- KPI CARDS -->
<div class="kpi-grid">${kpiHTML}</div>

<!-- FICHA -->
<div class="seccion" style="margin-top:20px">
  <p class="seccion-label">Ficha del Inmueble</p>
  <table class="tabla-ficha"><tbody>${fichaFilas}</tbody></table>
</div>

<!-- INVERSIÓN -->
<div class="seccion" style="margin-top:18px">
  <p class="seccion-label">Desglose de Inversión</p>
  <table class="tabla-inv">
    <tbody>
      ${invFilas}
      <tr>
        <td class="inv-total">INVERSIÓN TOTAL</td>
        <td class="inv-total-val">${fmt(inv.total)}</td>
      </tr>
    </tbody>
  </table>
  ${inv.nota_reforma ? `<p style="font-size:7.5pt;color:${GRIS40};margin-top:5px;line-height:1.5;font-style:italic">${inv.nota_reforma}</p>` : ''}
</div>

<!-- ESCENARIOS -->
<div class="seccion page-break" style="margin-top:20px">
  <p class="seccion-label">Escenarios de Salida</p>
  <div class="escenarios-grid">${escenarios}</div>
</div>

<!-- GRÁFICOS -->
${proyeccion ? `
<div class="seccion" style="margin-top:22px">
  <p class="seccion-label">Proyección Financiera — 36 meses · +5% anual · 80% ocupación</p>
  <div class="charts-grid">
    <div class="chart-box">
      <div class="chart-titulo">Ingresos mensuales</div>
      <div class="chart-sub">Bruto vs neto con ajuste anual del 5%</div>
      <div class="chart-wrap"><canvas id="chart-ingresos"></canvas></div>
    </div>
    <div class="chart-box">
      <div class="chart-titulo">Recuperación de inversión</div>
      <div class="chart-sub">Flujo acumulado · breakeven estimado</div>
      <div class="chart-wrap"><canvas id="chart-payback"></canvas></div>
    </div>
  </div>
</div>` : ''}

<!-- RIESGOS -->
<div class="seccion" style="margin-top:22px">
  <p class="seccion-label">Matriz de Riesgos</p>
  <table class="tabla-riesgos"><tbody>${riesgos}</tbody></table>
</div>

<!-- VALORACIÓN -->
<div class="seccion valoracion-wrap" style="margin-top:22px;padding-bottom:28px">
  <p class="seccion-label" style="color:${NARANJA}">Valoración Wallest</p>
  <div class="valoracion-box">${data.valoracion}</div>
</div>

<div class="page-footer">
  <span>${data.meta.empresa} &nbsp;·&nbsp; hola@hasu.in &nbsp;·&nbsp; wallest.pro</span>
  <span>Documento confidencial · ${data.meta.empresa}</span>
</div>

${chartScript}
</body>
</html>`
}

async function main() {
  const args = process.argv.slice(2)
  if (!args[0]) {
    console.error('Uso: node scripts/generar-informe-operacion.js datos.json [--output informe.pdf]')
    process.exit(1)
  }
  const inputPath = path.resolve(args[0])
  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx !== -1
    ? path.resolve(args[outputIdx + 1])
    : inputPath.replace(/\.json$/, '.pdf')

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
  const html = buildHTML(data)

  const browser = await puppeteer.launch({ headless: true })
  const page = await browser.newPage()
  await page.setContent(html, { waitUntil: 'networkidle0' })
  await page.pdf({
    path: outputPath,
    format: 'A4',
    margin: { top: '10mm', bottom: '14mm', left: '0', right: '0' },
    printBackground: true,
  })
  await browser.close()
  console.log(`✓ PDF generado: ${outputPath}`)
}

main().catch(e => { console.error(e); process.exit(1) })
