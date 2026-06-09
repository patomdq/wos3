#!/usr/bin/env node
/**
 * Generador de Informe WIP — Wallest / Hasu Activos Inmobiliarios SL
 * Produce un PDF con diseño fijo y consistente.
 *
 * USO:
 *   node scripts/generar-informe-wip.js datos.json
 *   node scripts/generar-informe-wip.js datos.json --output /ruta/informe.pdf
 *
 * FORMATO del JSON de entrada: ver ejemplo al final de este archivo.
 */

const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')

// ── PALETA WALLEST ────────────────────────────────────────────────────────────
const NARANJA = '#E8621A'
const ARENA   = '#C9A96E'
const GRIS10  = '#1A1A1A'
const GRIS40  = '#666666'
const GRIS80  = '#CCCCCC'
const GRIS_BG = '#F5F3EF'
const ROJO    = '#C0392B'

// ── HTML TEMPLATE ─────────────────────────────────────────────────────────────
function renderActivo(activo, index) {
  const campos = [
    ['ID Servicer',     activo.id_servicer],
    ['Dirección',       activo.direccion],
    ['Tipología',       activo.tipologia],
    ['PVP',             activo.pvp],
    ['Estado',          activo.estado],
    ['Nº Viviendas',    activo.num_viviendas],
    ['Avance obra',     activo.avance_obra ?? '—'],
    ['Sup. Suelo',      activo.sup_suelo ?? '—'],
    ['Edificabilidad',  activo.edificabilidad ?? '—'],
    ['Tipo Suelo',      activo.tipo_suelo ?? '—'],
    ['Ref. Catastral',  activo.ref_catastral ?? '—'],
    ['Finca Registral', activo.finca_registral ?? '—'],
    ['Comentarios',     activo.comentarios_data_tape ?? 'Sin comentarios adicionales.'],
  ]

  const filas = campos.map(([label, valor], i) => `
    <tr class="${i % 2 === 0 ? 'fila-par' : 'fila-impar'}">
      <td class="td-label">${label}</td>
      <td class="td-valor">${valor ?? '—'}</td>
    </tr>`).join('')

  const alerta = activo.alerta
    ? `<p class="alerta">⚠ <strong>Dato a verificar:</strong> ${activo.alerta}</p>`
    : ''

  return `
    <div class="activo ${index > 0 ? 'page-break' : ''}">
      <h2 class="zona-titulo">
        <span class="zona-num">${index + 1}.</span>
        ${activo.zona.toUpperCase()}
      </h2>
      <p class="zona-subtitulo">${activo.tipo_descripcion}</p>
      <div class="divisor"></div>

      <table class="tabla-datos">
        <tbody>${filas}</tbody>
      </table>

      <p class="analisis-label">Análisis Wallest</p>
      <p class="analisis-texto">${activo.analisis}</p>
      ${alerta}
    </div>`
}

function buildHTML(data) {
  const zonasList = (data.meta.zonas || []).join(' · ')
  const activos = data.activos.map((a, i) => renderActivo(a, i)).join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', Arial, sans-serif;
    font-size: 11pt;
    color: ${GRIS10};
    background: white;
    padding: 0;
  }

  /* ── HEADER DE PÁGINA ── */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 48px 10px;
    border-bottom: 1px solid ${GRIS80};
    font-size: 8pt;
    color: ${GRIS40};
  }
  .page-header .brand {
    font-weight: 700;
    color: ${NARANJA};
    letter-spacing: 0.03em;
  }

  /* ── PORTADA ── */
  .portada {
    padding: 40px 48px 24px;
  }
  .portada .etiqueta {
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${GRIS40};
    margin-bottom: 10px;
  }
  .portada h1 {
    font-size: 22pt;
    font-weight: 700;
    color: ${GRIS10};
    line-height: 1.15;
    margin-bottom: 8px;
  }
  .portada .zonas {
    font-size: 11pt;
    color: ${GRIS40};
    margin-bottom: 8px;
  }
  .portada .meta-line {
    font-size: 9pt;
    color: ${GRIS40};
    margin-bottom: 4px;
  }
  .portada .meta-line strong { color: ${GRIS10}; }
  .portada .fuente {
    font-size: 8.5pt;
    color: ${GRIS40};
    margin-top: 4px;
  }
  .portada .fuente strong { color: ${GRIS40}; }
  .divisor-portada {
    height: 3px;
    background: ${NARANJA};
    margin: 20px 48px 0;
    border-radius: 2px;
  }

  /* ── ACTIVO ── */
  .activo {
    padding: 28px 48px 0;
  }
  .page-break {
    page-break-before: always;
    padding-top: 28px;
  }
  .zona-titulo {
    font-size: 16pt;
    font-weight: 700;
    color: ${GRIS10};
    margin-bottom: 4px;
  }
  .zona-num {
    color: ${NARANJA};
    margin-right: 4px;
  }
  .zona-subtitulo {
    font-size: 10pt;
    color: ${GRIS40};
    font-style: italic;
    margin-bottom: 12px;
  }
  .divisor {
    height: 2px;
    background: ${NARANJA};
    margin-bottom: 16px;
    border-radius: 1px;
    opacity: 0.6;
  }

  /* ── TABLA DATOS ── */
  .tabla-datos {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 18px;
    font-size: 9.5pt;
  }
  .tabla-datos td {
    padding: 6px 10px;
    border: 1px solid ${GRIS80};
    vertical-align: top;
    line-height: 1.4;
  }
  .td-label {
    width: 28%;
    font-weight: 600;
    color: ${GRIS10};
    background: ${GRIS_BG};
  }
  .td-valor {
    color: ${GRIS10};
    background: white;
  }
  .fila-par   .td-label, .fila-par   .td-valor { background: ${GRIS_BG}; }
  .fila-impar .td-label, .fila-impar .td-valor { background: white; }
  .fila-par   .td-label { background: #EDEBE6; }
  .fila-impar .td-label { background: ${GRIS_BG}; }

  /* ── ANÁLISIS ── */
  .analisis-label {
    font-size: 9pt;
    font-weight: 700;
    color: ${NARANJA};
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 6px;
  }
  .analisis-texto {
    font-size: 10pt;
    color: ${GRIS10};
    line-height: 1.6;
    margin-bottom: 14px;
  }

  /* ── ALERTA ── */
  .alerta {
    font-size: 9.5pt;
    color: ${ROJO};
    background: #FFF5F5;
    border-left: 3px solid ${ROJO};
    padding: 8px 12px;
    margin-bottom: 14px;
    line-height: 1.5;
  }

  /* ── FOOTER ── */
  .page-footer {
    position: fixed;
    bottom: 0;
    left: 0; right: 0;
    padding: 8px 48px;
    border-top: 1px solid ${GRIS80};
    display: flex;
    justify-content: space-between;
    font-size: 7.5pt;
    color: ${GRIS40};
  }

  @media print {
    @page {
      size: A4;
      margin: 0;
    }
    body { padding: 0; }
    .page-break { page-break-before: always; }
  }
</style>
</head>
<body>

<div class="page-header">
  <span class="brand">${data.meta.empresa ?? 'Hasu Activos Inmobiliarios SL'}</span>
  <span>${data.meta.titulo}</span>
</div>

<div class="portada">
  <p class="etiqueta">Informe Interno</p>
  <h1>${data.meta.titulo}</h1>
  <p class="zonas">${zonasList}</p>
  <p class="meta-line">
    <strong>${data.meta.empresa ?? 'Hasu Activos Inmobiliarios SL'}</strong>
    &nbsp;·&nbsp;
    ${data.meta.fecha}
  </p>
  ${data.meta.fuente ? `<p class="fuente"><strong>Fuente:</strong> ${data.meta.fuente}</p>` : ''}
</div>
<div class="divisor-portada"></div>

${activos}

<div class="page-footer">
  <span>Confidencial · Uso interno · ${data.meta.empresa ?? 'Hasu Activos Inmobiliarios SL'}</span>
  <span>${data.meta.fecha}</span>
</div>

</body>
</html>`
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2)
  if (!args[0]) {
    console.error('Uso: node scripts/generar-informe-wip.js datos.json [--output informe.pdf]')
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

/*
── EJEMPLO DE JSON DE ENTRADA ────────────────────────────────────────────────

{
  "meta": {
    "titulo": "WIP Almería — Selección de Zonas",
    "zonas": ["Garrucha", "Huércal de Almería", "Olula del Río", "Vícar"],
    "empresa": "Hasu Activos Inmobiliarios SL",
    "fecha": "09 de junio de 2026",
    "fuente": "Data Tape Producto Mayorista Comercial · Filtro: WIP + Almería + Comercialización/Preventa"
  },
  "activos": [
    {
      "zona": "Garrucha",
      "tipo_descripcion": "Edificio Plurifamiliar en Construcción",
      "id_servicer": "TST-02576",
      "direccion": "Cl. Francisca Molina Flores 15",
      "tipologia": "Plurifamiliar",
      "pvp": "575.000 €",
      "estado": "Comercialización",
      "num_viviendas": "42",
      "avance_obra": "—",
      "sup_suelo": "1.518 m²",
      "edificabilidad": "4.176 m²",
      "tipo_suelo": "Finalista",
      "ref_catastral": "4766703XG0146N0001HD",
      "finca_registral": "—",
      "comentarios_data_tape": "Sin comentarios adicionales.",
      "analisis": "Garrucha es uno de los municipios costeros del Levante almeriense con mayor demanda vacacional y de segunda residencia."
    }
  ]
}
*/
