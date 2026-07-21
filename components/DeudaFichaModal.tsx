'use client'
import { useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import {
  GrupoDeuda, DeudaPosicion, ESTADO_INTERNO_CFG, ESTADO_JUDICIAL_LABEL, ESTADO_JUDICIAL_COLOR,
  calcRatioRiesgoCargas, calcRatioColateral, calcDescuentoDeuda,
  OCUPACION_ESTADOS, OCUPACION_LABEL, OCUPACION_COLOR, OcupacionEstado,
  MOTIVOS_DESCARTE, MOTIVO_DESCARTE_LABEL, MotivoDescarte, CargaDetalle,
  CAMPOS_CANONICOS,
  AnalisisCesion, RatingDificultad, RATING_LABEL, RATING_COLOR, inferirRatingsCesion, calcBeneficioCesion,
  DatosCatastro,
} from '@/lib/deuda-schema'

// Campos agregados 17/07/2026 (mapeo ampliado de brokers) — se muestran dinámicamente en una
// sección colapsable "Datos adicionales del broker", solo los que tengan valor cargado en esta
// posición puntual, para no ensuciar la ficha con 47 campos vacíos cuando el broker no los manda.
const CAMPOS_ADICIONALES_IDS = [
  'portfolio', 'bucket', 'contract_id_secundario', 'id_bien', 'juzgado', 'num_autos',
  'num_procedimiento', 'tipo_procedimiento', 'tipo_via', 'numero_via', 'n_finca_registral',
  'fecha_subasta', 'fecha_cobro', 'estado_subasta', 'resultado_subasta', 'flag_nuevo',
  'flag_eliminado', 'vpo', 'planta', 'parcela', 'comarca', 'id_portal_subasta',
  'fecha_cesion_remate', 'fecha_precio_referencia', 'dev_id', 'subfase', 'ocupacion_broker',
  'status_final', 'estado_colateral', 'registro', 'fr', 'connection', 'afectado_terceros',
  'motivo_paralizacion', 'fecha_solicitud_adjudicacion', 'fecha_cdr', 'fecha_firma_cdr_closing',
  'propuesta_formalizada_closing', 'fecha_firma_closing', 'estado_broker', 'estado_proc_flag',
  'principal', 'precio_subasta', 'importe_adjudicacion', 'superficie_m2',
  'deuda_responsabilidad_hipotecaria', 'n_contratos_activos',
] as const
const CAMPO_LABEL = Object.fromEntries(CAMPOS_CANONICOS.map(c => [c.id, c.label])) as Record<string, string>
const CAMPO_TIPO = Object.fromEntries(CAMPOS_CANONICOS.map(c => [c.id, c.tipo])) as Record<string, 'texto' | 'numero'>

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(0)}%`

export default function DeudaFichaModal({
  grupo, onClose, onUpdateEstado, onUpdateImagen, onGeocodear, onUpdateCampo,
}: {
  grupo: GrupoDeuda
  onClose: () => void
  onUpdateEstado: (id: string, estado: string) => void
  onUpdateImagen: (id: string, file: File) => Promise<void>
  onGeocodear: (id: string) => Promise<void>
  onUpdateCampo: (id: string, patch: Partial<DeudaPosicion>) => void
}) {
  const [subiendoId, setSubiendoId] = useState<string | null>(null)
  const [ubicandoId, setUbicandoId] = useState<string | null>(null)

  const subirImagen = async (id: string, file: File) => {
    setSubiendoId(id)
    await onUpdateImagen(id, file)
    setSubiendoId(null)
  }

  const geocodear = async (id: string) => {
    setUbicandoId(id)
    await onGeocodear(id)
    setUbicandoId(null)
  }

  const toggleFavorito = () => {
    const nuevoValor = !grupo.esFavorito
    grupo.items.forEach(p => onUpdateCampo(p.id, { favorito: nuevoValor }))
  }

  const descargarInforme = () => {
    if (!grupo.items.length) return
    const fecha = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })

    // ── Helpers ──
    const fmtN = (n: number | null | undefined) => n == null ? '—' : n.toLocaleString('es-ES') + ' €'
    const fmtK = (n: number | null | undefined) => {
      if (n == null) return '—'
      return Math.abs(n) >= 1000 ? (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k€' : n.toLocaleString('es-ES') + ' €'
    }
    const pctFmt = (n: number | null) => n == null ? '—' : (n * 100).toFixed(0) + '%'
    const field = (label: string, val: string | number | null | undefined) =>
      val != null && val !== '' && val !== '—'
        ? `<tr><td style="padding:5px 0;color:#888;font-size:12.5px;width:46%;padding-right:8px;vertical-align:top">${label}</td><td style="padding:5px 0;font-weight:600;font-size:12.5px;color:#1A1A1A;text-align:right;vertical-align:top">${val}</td></tr>`
        : ''
    const rC: Record<string, string> = { bajo:'#16a34a', medio:'#d97706', alto:'#dc2626', muy_alto:'#7c2d12' }
    const rL: Record<string, string> = { bajo:'Bajo', medio:'Medio', alto:'Alto', muy_alto:'Muy alto' }
    const ratingBox = (label: string, val: RatingDificultad | null) => !val ? '' :
      `<div style="flex:1;min-width:90px;text-align:center;padding:14px 8px;background:#F9F8F5;border-radius:12px;border:1px solid rgba(0,0,0,0.05)">
        <div style="font-size:10px;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">${label}</div>
        <div style="display:inline-block;padding:3px 12px;border-radius:999px;font-size:12px;font-weight:800;background:${rC[val]}18;color:${rC[val]}">${rL[val] ?? val}</div>
      </div>`

    // ── Totales del grupo ──
    const ubicacion = [grupo.ciudad, grupo.provincia].filter(Boolean).join(', ') || 'Sin ubicación'
    const deudaTot   = grupo.deudaTotTotal || null
    const deudaOB    = grupo.obTotal || null
    const askingTot  = grupo.askingTotal || null
    const descuento  = deudaTot && askingTot ? (1 - askingTot / deudaTot) : null
    const imgUrl     = grupo.imagenUrl || grupo.items[0]?.imagen_url || ''

    // Cesión del primer ítem que tenga análisis (o del primero)
    const itemCesion = grupo.items.find(i => i.analisis_cesion) ?? grupo.items[0]
    const inferido   = inferirRatingsCesion(itemCesion)
    const cesion: AnalisisCesion = {
      rating_deudor:        itemCesion.analisis_cesion?.rating_deudor        ?? inferido.rating_deudor,
      rating_posesion:      itemCesion.analisis_cesion?.rating_posesion      ?? inferido.rating_posesion,
      rating_juzgado:       itemCesion.analisis_cesion?.rating_juzgado       ?? inferido.rating_juzgado,
      rating_procedimiento: itemCesion.analisis_cesion?.rating_procedimiento ?? inferido.rating_procedimiento,
      precio_cesion:        itemCesion.analisis_cesion?.precio_cesion        ?? askingTot ?? null,
      valor_mercado_garantia: itemCesion.analisis_cesion?.valor_mercado_garantia ?? null,
      gastos_inscripcion:   itemCesion.analisis_cesion?.gastos_inscripcion   ?? null,
      impuestos_cesion:     itemCesion.analisis_cesion?.impuestos_cesion     ?? null,
      comisiones:           itemCesion.analisis_cesion?.comisiones           ?? null,
      impuestos_adjudicacion: itemCesion.analisis_cesion?.impuestos_adjudicacion ?? null,
      novada_hipoteca:      itemCesion.analisis_cesion?.novada_hipoteca      ?? null,
      vivienda_habitual:    itemCesion.analisis_cesion?.vivienda_habitual    ?? null,
      hay_que_pagar_deudor: itemCesion.analisis_cesion?.hay_que_pagar_deudor ?? null,
      importe_pago_deudor:  itemCesion.analisis_cesion?.importe_pago_deudor  ?? null,
      notas_analisis:       itemCesion.analisis_cesion?.notas_analisis       ?? null,
    }
    const beneficio = calcBeneficioCesion(cesion)

    // ── HTML de cada colateral ──
    const colateralHTML = grupo.items.map((item, idx) => {
      const estadoJud = item.estado_judicial_normalizado
        ? (ESTADO_JUDICIAL_LABEL[item.estado_judicial_normalizado] ?? item.estado_judicial_normalizado)
        : (item.estado_judicial_raw || null)
      const previas    = (item.cargas_detalle || []).filter(c => c.tipo === 'previa')
      const posteriores = (item.cargas_detalle || []).filter(c => c.tipo === 'posterior')
      const sumPrev    = previas.reduce((s, c) => s + (c.importe || 0), 0)
      const sumPost    = posteriores.reduce((s, c) => s + (c.importe || 0), 0)
      const cargaRow = (c: CargaDetalle) =>
        `<tr><td style="padding:4px 0;font-size:12px;color:#444;width:60%">${c.concepto||'—'}</td><td style="padding:4px 0;font-size:12px;font-weight:600;text-align:right;color:#1A1A1A">${c.importe != null ? c.importe.toLocaleString('es-ES') + ' €' : '—'}</td></tr>`

      const cat = item.datos_catastro
      // Dirección: priorizar datos catastrales si existen
      const dirPrincipal = cat?.direccion_completa || item.direccion || item.municipio || '(sin dirección)'
      const dirSub = cat ? null : (item.municipio && item.direccion ? [item.municipio, item.provincia].filter(Boolean).join(', ') : null)

      return `
      <div style="background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:20px;margin-bottom:14px;break-inside:avoid">
        <!-- colateral header -->
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div>
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#A6855A;margin-bottom:4px">Colateral ${idx + 1} de ${grupo.items.length}</div>
            <div style="font-size:15px;font-weight:800;color:#1A1A1A">${dirPrincipal}</div>
            ${dirSub ? `<div style="font-size:12px;color:#888;margin-top:2px">${dirSub}</div>` : ''}
          </div>
          ${item.imagen_url ? `<img src="${item.imagen_url}" style="width:120px;height:80px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,0.08);flex-shrink:0;margin-left:16px" alt="">` : ''}
        </div>
        <!-- datos en 2 cols -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px">Inmueble</div>
            <table style="width:100%;border-collapse:collapse">
              ${field('Tipo', [cat?.tipo_construccion || item.tipo_colateral, item.subtipo_colateral].filter(Boolean).join(' · '))}
              ${field('Uso', cat?.uso || null)}
              ${field('Ref. catastral', item.ref_catastral)}
              ${field('Superficie', cat?.superficie_construida ? cat.superficie_construida + ' m²' : ((item as any).superficie_m2 ? (item as any).superficie_m2 + ' m²' : null))}
              ${field('Año construcción', cat?.año_construccion ? String(cat.año_construccion) : null)}
              ${field('Planta / Puerta', [cat?.planta, cat?.puerta].filter(Boolean).join(' / ') || null)}
              ${field('Ocupación', item.ocupacion_estado ? (OCUPACION_LABEL[item.ocupacion_estado as OcupacionEstado] ?? item.ocupacion_estado) : null)}
              ${field('Finca registral', (item as any).n_finca_registral)}
            </table>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px">Situación</div>
            <table style="width:100%;border-collapse:collapse">
              ${field('Estado judicial', estadoJud)}
              ${field('Nº procedimiento', (item as any).num_procedimiento)}
              ${field('Juzgado', (item as any).juzgado)}
              ${field('Fecha subasta', (item as any).fecha_subasta)}
              ${field('ID portal subasta', (item as any).id_portal_subasta)}
              ${field('Deuda total', fmtN(item.deuda_tot))}
              ${field('Asking price', fmtN(item.asking_price))}
            </table>
          </div>
        </div>
        <!-- cargas -->
        ${(previas.length || posteriores.length) ? `
        <div style="margin-top:14px;padding-top:14px;border-top:1px solid rgba(0,0,0,0.06)">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px">Cargas</div>
          <div style="display:grid;grid-template-columns:${previas.length && posteriores.length ? '1fr 1fr' : '1fr'};gap:16px">
            ${previas.length ? `<div><div style="font-size:11px;color:#BBB;font-weight:600;margin-bottom:4px">Previas</div><table style="width:100%;border-collapse:collapse">${previas.map(cargaRow).join('')}</table>${previas.length>1?`<div style="text-align:right;font-size:12px;font-weight:800;margin-top:4px;color:#dc2626">Total: ${sumPrev.toLocaleString('es-ES')} €</div>`:''}</div>` : ''}
            ${posteriores.length ? `<div><div style="font-size:11px;color:#BBB;font-weight:600;margin-bottom:4px">Posteriores</div><table style="width:100%;border-collapse:collapse">${posteriores.map(cargaRow).join('')}</table>${posteriores.length>1?`<div style="text-align:right;font-size:12px;font-weight:800;margin-top:4px;color:#555">Total: ${sumPost.toLocaleString('es-ES')} €</div>`:''}</div>` : ''}
          </div>
        </div>` : ''}
      </div>`
    }).join('')

    // Reseña IA grupal — primer ítem que la tenga
    const resumenIA = grupo.items.find(i => i.resumen_ia)?.resumen_ia ?? null

    // ── Ratings del grupo (del ítem que tenga análisis) ──
    const tiposColateral = [...new Set(grupo.items.map(i => i.tipo_colateral).filter(Boolean))].join(' · ')
    const brokerStr = grupo.broker || ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Informe · ${grupo.contractId}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Marcellus&family=Hanken+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
  body{background:#F2F1ED;font-family:'Hanken Grotesk',sans-serif;color:#1A1A1A}
  .page{max-width:860px;margin:0 auto;padding:36px 40px 56px}

  /* Aviso en pantalla (oculto al imprimir) */
  .print-notice{display:flex;align-items:center;gap:10px;background:#FEF9EC;border:1px solid #F0D080;border-radius:10px;padding:10px 14px;margin-bottom:20px;font-size:12px;color:#7A5A00}
  .print-notice strong{font-weight:800}
  @media print{.print-notice{display:none!important}}

  /* HEADER */
  .hdr{display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;border-bottom:1px solid rgba(0,0,0,0.10);margin-bottom:28px}
  .hdr-logo{font-family:'Marcellus',serif;font-size:20px;color:#A6855A;letter-spacing:2px}
  .hdr-sub{font-size:11px;color:#AAA;font-weight:500;margin-top:2px}
  .hdr-right{text-align:right}
  .hdr-tipo{font-size:11px;color:#AAA;font-weight:600;text-transform:uppercase;letter-spacing:1px}
  .hdr-fecha{font-size:13px;color:#555;font-weight:600;margin-top:2px}
  .hdr-id{font-family:monospace;font-size:11px;color:#BBB;margin-top:1px}

  /* HERO */
  .hero{display:grid;grid-template-columns:1fr 280px;gap:24px;align-items:start;margin-bottom:24px}
  .hero-titulo{font-family:'Marcellus',serif;font-size:28px;color:#1A1A1A;line-height:1.2;margin-bottom:6px}
  .hero-sub{font-size:13px;color:#666;font-weight:500;margin-bottom:16px}
  .badge{display:inline-block;padding:4px 12px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(166,133,90,0.10);border:1px solid rgba(166,133,90,0.25);color:#A6855A;margin:0 4px 4px 0}
  .hero-img-wrap{border-radius:16px;overflow:hidden;border:1px solid rgba(0,0,0,0.08);background:#E8E6E0}
  .hero-img{width:100%;height:200px;object-fit:cover;object-position:center;display:block}
  .hero-img-empty{width:100%;height:200px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#E8E6E0,#D8D5CE);color:#BBB;font-size:13px;font-weight:600}

  /* DASHBOARD */
  .dash{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px}
  .hl-dark{background:#14110C!important;border-radius:14px;padding:16px 18px}
  .hl-label{font-size:10px;color:rgba(199,168,119,0.85)!important;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px}
  .hl-value{font-family:'Marcellus',serif;font-size:20px;color:#F8F3E9!important;line-height:1.1}
  .hl-light{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:16px 18px}
  .hl-label-l{font-size:10px;color:#999;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:6px}
  .hl-value-l{font-family:'Marcellus',serif;font-size:20px;color:#1A1A1A;line-height:1.1}

  /* CARDS */
  .card{background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:20px;margin-bottom:14px}
  .sec{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;color:#A6855A;margin-bottom:14px}
  table{width:100%;border-collapse:collapse}
  .tr td{padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.04);vertical-align:top}
  .tr:last-child td{border-bottom:none}
  .td-l{color:#888;font-size:12px;width:48%;padding-right:8px}
  .td-r{font-weight:600;font-size:12px;color:#1A1A1A;text-align:right}
  .sep{border:none;border-top:1px solid rgba(0,0,0,0.06);margin:12px 0}
  .footer{text-align:center;font-size:11px;color:#CCC;padding:20px 40px 32px;border-top:1px solid rgba(0,0,0,0.06)}
  @media print{
    @page{size:A4;margin:0}
    body{background:#F2F1ED!important}
    .page{padding:20px 28px 40px;max-width:100%}
    .card,.hl-dark,.hl-light{break-inside:avoid}
  }
</style>
</head>
<body>
<div class="page">

<!-- AVISO PANTALLA (oculto al imprimir) -->
<div class="print-notice">
  ⚠️ <span>En el diálogo de impresión: activa <strong>Gráficos de fondo</strong> y desactiva <strong>Encabezados y pies de página</strong> para que el PDF quede exactamente igual a esta vista.</span>
</div>

<!-- HEADER -->
<div class="hdr">
  <div>
    <div class="hdr-logo">WALLEST</div>
    <div class="hdr-sub">HASU Activos Inmobiliarios SL</div>
  </div>
  <div class="hdr-right">
    <div class="hdr-tipo">Informe de cesión de crédito</div>
    <div class="hdr-fecha">${fecha}</div>
    <div class="hdr-id">${grupo.contractId}${brokerStr ? ' · ' + brokerStr : ''}</div>
  </div>
</div>

<!-- HERO -->
<div class="hero">
  <div>
    <div class="hero-titulo">${ubicacion}</div>
    <div class="hero-sub">${tiposColateral || 'Activo inmobiliario'} · ${grupo.items.length} colateral${grupo.items.length !== 1 ? 'es' : ''}</div>
    <div style="margin-bottom:16px">
      ${grupo.titular ? `<span class="badge">${grupo.titular}</span>` : ''}
      ${tiposColateral ? tiposColateral.split(' · ').map((t: string) => `<span class="badge">${t}</span>`).join('') : ''}
    </div>
    <table>
      ${field('Titular', grupo.titular)}
      ${field('Broker / Servicer', brokerStr)}
      ${field('Nº colaterales', grupo.items.length.toString())}
    </table>
  </div>
  <div>
    <div class="hero-img-wrap">
      ${imgUrl ? `<img class="hero-img" src="${imgUrl}" alt="">` : `<div class="hero-img-empty">Sin imagen</div>`}
    </div>
  </div>
</div>

<!-- DASHBOARD ECONÓMICO -->
<div class="dash">
  <div class="hl-dark">
    <div class="hl-label">Deuda total</div>
    <div class="hl-value">${fmtK(deudaTot)}</div>
  </div>
  <div class="hl-dark">
    <div class="hl-label">Deuda OB</div>
    <div class="hl-value">${fmtK(deudaOB)}</div>
  </div>
  <div class="hl-dark">
    <div class="hl-label">Asking price</div>
    <div class="hl-value">${fmtK(askingTot)}</div>
  </div>
  <div class="hl-dark" style="background:${descuento !== null && descuento > 0.4 ? '#1A3A14' : '#14110C'}">
    <div class="hl-label">Descuento s/ deuda</div>
    <div class="hl-value" style="color:${descuento !== null && descuento > 0.4 ? '#4ade80' : '#F8F3E9'}">${pctFmt(descuento)}</div>
  </div>
</div>

<!-- RATINGS CESIÓN -->
${(cesion.rating_deudor || cesion.rating_posesion || cesion.rating_juzgado || cesion.rating_procedimiento) ? `
<div class="card">
  <div class="sec">Análisis de cesión — Ratings de dificultad</div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:${cesion.notas_analisis ? '14px' : '0'}">
    ${ratingBox('Deudor (D)', cesion.rating_deudor)}
    ${ratingBox('Posesión (P)', cesion.rating_posesion)}
    ${ratingBox('Juzgado (J)', cesion.rating_juzgado)}
    ${ratingBox('Procedimiento (Pr)', cesion.rating_procedimiento)}
  </div>
  ${cesion.notas_analisis ? `<div style="padding:12px 14px;background:#F9F8F5;border-radius:10px;font-size:13px;color:#444;line-height:1.7;border-left:3px solid #A6855A">${cesion.notas_analisis}</div>` : ''}
  ${beneficio !== null ? `<hr class="sep"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:12px;color:#888;font-weight:700">Beneficio estimado cesión</span><span style="font-family:'Marcellus',serif;font-size:22px;color:${beneficio >= 0 ? '#16a34a' : '#dc2626'}">${beneficio >= 0 ? '+' : ''}${beneficio.toLocaleString('es-ES')} €</span></div>` : ''}
</div>` : ''}

<!-- DETALLE POR COLATERAL -->
<div style="margin-top:4px">
  <div class="sec" style="margin-bottom:12px">Detalle de colaterales</div>
  ${colateralHTML}
</div>

<!-- RESEÑA IA — una sola para el grupo -->
${resumenIA ? `
<div class="card" style="border-left:3px solid #A6855A;margin-top:4px">
  <div class="sec">Reseña del activo</div>
  <div style="font-size:13.5px;line-height:1.85;color:#333">${resumenIA.replace(/\n/g,'<br>')}</div>
</div>` : ''}

</div><!-- /page -->

<div class="footer">
  Generado por WOS3 · HASU Activos Inmobiliarios SL · ${fecha}
</div>

<script>
window.onload = () => {
  const imgs = Array.from(document.images)
  const fontReady = document.fonts.ready
  const imgsReady = imgs.length
    ? Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r })))
    : Promise.resolve()
  Promise.all([fontReady, imgsReady]).then(() => setTimeout(() => window.print(), 300))
}
</script>
</body>
</html>`

    const win = window.open('', '_blank')
    if (win) { win.document.write(html); win.document.close() }
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
        <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto"
          style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 760 }}>
          <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-black text-[16px] truncate" style={{ color: '#111' }}>
                  {[grupo.ciudad, grupo.provincia].filter(Boolean).join(', ') || 'Sin ubicación'}
                  {grupo.tieneAlerta && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-md text-[12px] font-black align-middle" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                      🔴 Cargas &gt; precio
                    </span>
                  )}
                </div>
                <div className="text-[12px] mt-0.5 font-mono truncate" style={{ color: '#999' }}>{grupo.contractId} · {grupo.broker || 'Sin broker'}</div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={toggleFavorito}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-base"
                  title={grupo.esFavorito ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                  style={{ background: grupo.esFavorito ? 'rgba(245,158,11,0.15)' : '#F5F4F0', border: `1px solid ${grupo.esFavorito ? 'rgba(245,158,11,0.4)' : '#ECEAE4'}` }}>
                  {grupo.esFavorito ? '⭐' : '☆'}
                </button>
                <button onClick={descargarInforme}
                  className="w-7 h-7 rounded-full flex items-center justify-center text-sm"
                  title="Descargar informe PDF"
                  style={{ background: '#F5F4F0', color: '#A6855A', border: '1px solid #ECEAE4' }}>
                  ↓
                </button>
                <button onClick={onClose} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {grupo.items.map(p => (
              <PosicionCard
                key={p.id}
                p={p}
                subiendo={subiendoId === p.id}
                ubicando={ubicandoId === p.id}
                onSubirImagen={f => subirImagen(p.id, f)}
                onGeocodear={() => geocodear(p.id)}
                onUpdateEstado={estado => onUpdateEstado(p.id, estado)}
                onUpdateCampo={patch => onUpdateCampo(p.id, patch)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function PosicionCard({
  p, subiendo, ubicando, onSubirImagen, onGeocodear, onUpdateEstado, onUpdateCampo,
}: {
  p: DeudaPosicion
  subiendo: boolean
  ubicando: boolean
  onSubirImagen: (f: File) => void
  onGeocodear: () => void
  onUpdateEstado: (estado: string) => void
  onUpdateCampo: (patch: Partial<DeudaPosicion>) => void
}) {
  const [catastroLoading, setCatastroLoading] = useState(false)
  const [catastroData, setCatastroData] = useState<DatosCatastro | null>(p.datos_catastro ?? null)
  const [catastroError, setCatastroError] = useState<string | null>(null)

  const fetchCatastro = async () => {
    setCatastroLoading(true)
    setCatastroError(null)
    try {
      const res = await authFetch(`/api/catastro/fetch?id=${p.id}`)
      const json = await res.json()
      if (json.ok && json.datos) {
        setCatastroData(json.datos)
        onUpdateCampo({ datos_catastro: json.datos } as any)
      } else {
        setCatastroError(json.error || 'Sin datos en el Catastro')
      }
    } catch {
      setCatastroError('Error de conexión')
    }
    setCatastroLoading(false)
  }

  const riesgo = calcRatioRiesgoCargas(p.cargas_previas, p.asking_price)
  const ratioColateral = calcRatioColateral(p.deuda_tot, p.valor_colateral)
  const descuentoDeuda = calcDescuentoDeuda(p.deuda_tot, p.asking_price)
  const estCfg = ESTADO_INTERNO_CFG[p.estado_interno] || ESTADO_INTERNO_CFG.nuevo

  // Si el broker no mandó estado judicial pero sí datos de subasta, inferimos que hay subasta en curso.
  // Evita el contradictorio "Sin estado" + "ID portal de subasta: XXX" que confundía al leer la ficha.
  const estadoJudicialEfectivo = p.estado_judicial_normalizado
    ?? (p.id_portal_subasta || p.fecha_subasta || p.estado_subasta ? 'subasta_pendiente' : null)
  const judCfg = estadoJudicialEfectivo ? ESTADO_JUDICIAL_COLOR[estadoJudicialEfectivo] : null
  const ocupCfg = p.ocupacion_estado ? OCUPACION_COLOR[p.ocupacion_estado] : null
  const tieneCoords = p.lat != null && p.lng != null

  // Buffer local para inputs de texto/número — se persiste recién al perder foco, para no
  // disparar un write a Supabase por cada tecla (mismo criterio que la ficha de análisis de Mercado).
  const [buf, setBuf] = useState({
    valor_colateral: p.valor_colateral != null ? String(p.valor_colateral) : '',
    tiempo_estimado_meses: p.tiempo_estimado_meses != null ? String(p.tiempo_estimado_meses) : '',
    estrategia_prevista: p.estrategia_prevista || '',
    coste_fiscal_estimado: p.coste_fiscal_estimado || '',
    visita_notas: p.visita_notas || '',
  })

  const [mostrarExtra, setMostrarExtra] = useState(false)
  const [resumen, setResumen] = useState<string | null>(p.resumen_ia ?? null)

  // Análisis cesión — se inicializa mergeando inferencia automática con lo guardado a mano
  const inferido = inferirRatingsCesion(p)
  const [cesion, setCesion] = useState<AnalisisCesion>({
    rating_deudor: p.analisis_cesion?.rating_deudor ?? inferido.rating_deudor,
    rating_posesion: p.analisis_cesion?.rating_posesion ?? inferido.rating_posesion,
    rating_juzgado: p.analisis_cesion?.rating_juzgado ?? inferido.rating_juzgado,
    rating_procedimiento: p.analisis_cesion?.rating_procedimiento ?? inferido.rating_procedimiento,
    novada_hipoteca: p.analisis_cesion?.novada_hipoteca ?? null,
    vivienda_habitual: p.analisis_cesion?.vivienda_habitual ?? null,
    hay_que_pagar_deudor: p.analisis_cesion?.hay_que_pagar_deudor ?? null,
    importe_pago_deudor: p.analisis_cesion?.importe_pago_deudor ?? null,
    valor_mercado_garantia: p.analisis_cesion?.valor_mercado_garantia ?? null,
    precio_cesion: p.analisis_cesion?.precio_cesion ?? p.asking_price ?? null,
    gastos_inscripcion: p.analisis_cesion?.gastos_inscripcion ?? null,
    impuestos_cesion: p.analisis_cesion?.impuestos_cesion ?? null,
    comisiones: p.analisis_cesion?.comisiones ?? null,
    impuestos_adjudicacion: p.analisis_cesion?.impuestos_adjudicacion ?? null,
    notas_analisis: p.analisis_cesion?.notas_analisis ?? null,
  })
  const persistCesion = (next: AnalisisCesion) => {
    setCesion(next)
    onUpdateCampo({ analisis_cesion: next })
  }
  const beneficioCesion = calcBeneficioCesion(cesion)
  const [mostrarCesion, setMostrarCesion] = useState(false)
  const [generandoResumen, setGenerandoResumen] = useState(false)

  const generarResumen = async () => {
    setGenerandoResumen(true)
    try {
      const res = await authFetch('/api/deuda/resumen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: p.id }),
      })
      const data = await res.json()
      if (data.resumen) {
        setResumen(data.resumen)
        onUpdateCampo({ resumen_ia: data.resumen })
      }
    } catch {}
    setGenerandoResumen(false)
  }
  const camposAdicionalesConValor = CAMPOS_ADICIONALES_IDS.filter(id => {
    const v = (p as any)[id]
    return v !== null && v !== undefined && v !== ''
  })

  const [cargas, setCargas] = useState<CargaDetalle[]>(p.cargas_detalle || [])
  const cargasTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const persistCargas = (next: CargaDetalle[]) => {
    if (cargasTimer.current) clearTimeout(cargasTimer.current)
    cargasTimer.current = setTimeout(() => onUpdateCampo({ cargas_detalle: next }), 600)
  }
  const addCarga = () => setCargas(prev => {
    const next = [...prev, { id: crypto.randomUUID(), concepto: '', importe: null, tipo: 'previa' as const, notas: '' }]
    persistCargas(next)
    return next
  })
  const updateCarga = (id: string, patch: Partial<CargaDetalle>) => setCargas(prev => {
    const next = prev.map(c => c.id === id ? { ...c, ...patch } : c)
    persistCargas(next)
    return next
  })
  const removeCarga = (id: string) => setCargas(prev => {
    const next = prev.filter(c => c.id !== id)
    persistCargas(next)
    return next
  })
  const sumaPrevias = cargas.filter(c => c.tipo === 'previa').reduce((s, c) => s + (c.importe || 0), 0)
  const sumaPosteriores = cargas.filter(c => c.tipo === 'posterior').reduce((s, c) => s + (c.importe || 0), 0)

  return (
    <div className="px-5 py-4" style={{ borderTop: '1px solid #F5F4F0' }}>

      {/* Resumen IA — preanálisis generado por Claude con todos los datos disponibles */}
      <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: 'rgba(166,133,90,0.07)', border: '1px solid rgba(166,133,90,0.25)' }}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#A6855A' }}>✨ Resumen IA</div>
          <button onClick={generarResumen} disabled={generandoResumen}
            className="px-2 py-1 rounded-lg text-[11px] font-black disabled:opacity-50"
            style={{ background: '#14110C', color: '#F8F3E9' }}>
            {generandoResumen ? 'Generando...' : resumen ? '↺ Regenerar' : 'Generar'}
          </button>
        </div>
        {resumen ? (
          <p className="text-[12.5px] leading-relaxed" style={{ color: '#444' }}>{resumen}</p>
        ) : (
          <p className="text-[12px] italic" style={{ color: '#BBB' }}>
            Todavía no hay resumen. Hacé clic en "Generar" para que Claude analice esta posición con todos los datos disponibles.
          </p>
        )}
      </div>

      {/* Imagen del inmueble — igual que la portada en Mercado */}
      <label className="block relative rounded-xl overflow-hidden mb-3 cursor-pointer"
        style={{ height: 120, background: p.imagen_url ? undefined : '#F9F8F5', border: p.imagen_url ? 'none' : '1.5px dashed #DCDAD4' }}>
        <input type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onSubirImagen(f) }} />
        {p.imagen_url ? (
          <>
            <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 flex items-end justify-end p-2" style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.45) 100%)' }}>
              <span className="px-2 py-1 rounded-lg text-[12px] font-black" style={{ background: 'rgba(255,255,255,0.85)', color: '#111' }}>
                {subiendo ? 'Subiendo...' : '📷 Cambiar'}
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[12px] font-bold" style={{ color: '#AAA' }}>
            {subiendo ? 'Subiendo...' : '📷 Agregar imagen del inmueble'}
          </div>
        )}
      </label>

      {/* Cabecera: dirección + tipo + badges + estado interno */}
      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
        <div className="min-w-[220px]">
          <div className="text-[14px] font-bold" style={{ color: '#333' }}>{p.direccion || '(sin dirección)'}</div>
          <div className="text-[12px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#999' }}>
            <span>{[p.tipo_colateral, p.subtipo_colateral].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
            {judCfg && estadoJudicialEfectivo && (
              <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: judCfg.bg, color: judCfg.color }}>
                {ESTADO_JUDICIAL_LABEL[estadoJudicialEfectivo]}
                {!p.estado_judicial_normalizado && ' (inferido)'}
              </span>
            )}
            {ocupCfg && p.ocupacion_estado && (
              <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: ocupCfg.bg, color: ocupCfg.color }}>
                {OCUPACION_LABEL[p.ocupacion_estado]}
              </span>
            )}
            {riesgo.alerta && (
              <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }} title="Cargas previas superan el asking price">
                🔴 Riesgo cargas
              </span>
            )}
            {!tieneCoords && p.direccion && (
              <button onClick={onGeocodear} disabled={ubicando}
                className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>
                {ubicando ? 'Ubicando...' : '📍 Ubicar en mapa'}
              </button>
            )}
          </div>
        </div>
        <select value={p.estado_interno} onChange={e => onUpdateEstado(e.target.value)}
          className="rounded-lg px-2 py-1.5 text-[12px] font-black outline-none flex-shrink-0" style={{ background: estCfg.bg, color: estCfg.color, border: 'none', appearance: 'none' as const }}>
          {Object.entries(ESTADO_INTERNO_CFG).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
        </select>
      </div>

      {/* Banner auto-descarte: aparece cuando el sistema descartó automáticamente al importar por matemática pura */}
      {p.estado_interno === 'descartado' && (p.motivo_descarte === 'descuento_insuficiente' || p.motivo_descarte === 'cargas_excesivas') && (
        <div className="rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between gap-3" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <div>
            <div className="text-[12px] font-black" style={{ color: '#92400E' }}>
              ⚡ Auto-descartado al importar
            </div>
            <div className="text-[11.5px] font-bold mt-0.5" style={{ color: '#B45309' }}>
              {p.motivo_descarte === 'descuento_insuficiente' ? 'Descuento sobre deuda total < 30%' : 'Cargas previas superan el asking price'}
            </div>
          </div>
          <button onClick={() => onUpdateEstado('nuevo')}
            className="flex-shrink-0 px-2.5 py-1.5 rounded-lg text-[12px] font-black"
            style={{ background: '#14110C', color: '#F8F3E9' }}>
            ↩ Volver a activo
          </button>
        </div>
      )}

      {/* Motivo de descarte — solo si el estado interno es "descartado" (punto 1: ~90% se descartan rápido, es normal) */}
      {p.estado_interno === 'descartado' && (
        <div className="rounded-xl px-3 py-2.5 mb-3" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4' }}>
          <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#999' }}>Motivo del descarte</div>
          <select value={p.motivo_descarte || ''} onChange={e => onUpdateCampo({ motivo_descarte: (e.target.value || null) as MotivoDescarte | null })}
            className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold outline-none" style={SEL}>
            <option value="">— Sin especificar —</option>
            {MOTIVOS_DESCARTE.map(m => <option key={m} value={m}>{MOTIVO_DESCARTE_LABEL[m]}</option>)}
          </select>
        </div>
      )}

      {/* Resumen económico — estilo ficha de deuda (FENCIA) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Kpi label="Deuda OB" value={fmt(p.deuda_ob)} />
        <Kpi label="Deuda total" value={fmt(p.deuda_tot)} />
        <Kpi label="Asking price" value={fmt(p.asking_price)} highlight />
        <Kpi label="Descuento s/ deuda" value={pct(descuentoDeuda)} semaforo={descuentoDeuda === null ? undefined : descuentoDeuda >= 0.3} />
      </div>

      {/* Due diligence NPL — puntos 2A/2B/3/4/6 del criterio del experto */}
      <div className="rounded-xl p-3 mb-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
        <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>Due diligence NPL</div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Valor del colateral (tasación)</label>
            <input type="number" value={buf.valor_colateral}
              onChange={e => setBuf(b => ({ ...b, valor_colateral: e.target.value }))}
              onBlur={() => onUpdateCampo({ valor_colateral: buf.valor_colateral === '' ? null : Number(buf.valor_colateral) })}
              placeholder="€" className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-mono font-bold outline-none" style={INP} />
          </div>
          <div>
            <div className="text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Ratio Deuda total / Colateral</div>
            <div className="rounded-lg px-2.5 py-1.5 text-[12.5px] font-black" style={{
              background: ratioColateral.sinValor ? '#F0EEE8' : (ratioColateral.bueno ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)'),
              color: ratioColateral.sinValor ? '#999' : (ratioColateral.bueno ? '#16A34A' : '#EF4444'),
            }}>
              {ratioColateral.sinValor ? 'Sin valor de colateral' : `${ratioColateral.bueno ? '🟢' : '🔴'} ${pct(ratioColateral.ratio)}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Ocupación</label>
            <select value={p.ocupacion_estado || ''} onChange={e => onUpdateCampo({ ocupacion_estado: (e.target.value || null) as OcupacionEstado | null })}
              className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-bold outline-none" style={SEL}>
              <option value="">— Sin verificar —</option>
              {OCUPACION_ESTADOS.map(o => <option key={o} value={o}>{OCUPACION_LABEL[o]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Tiempo estimado del expediente (meses)</label>
            <input type="number" value={buf.tiempo_estimado_meses}
              onChange={e => setBuf(b => ({ ...b, tiempo_estimado_meses: e.target.value }))}
              onBlur={() => onUpdateCampo({ tiempo_estimado_meses: buf.tiempo_estimado_meses === '' ? null : Number(buf.tiempo_estimado_meses) })}
              placeholder="meses" className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-mono font-bold outline-none" style={INP} />
          </div>
        </div>

        <div className="flex items-center gap-2 mb-2">
          <button onClick={() => onUpdateCampo({ visita_realizada: !p.visita_realizada })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-black"
            style={{ background: p.visita_realizada ? 'rgba(34,197,94,0.12)' : '#fff', color: p.visita_realizada ? '#16A34A' : '#666', border: '1.5px solid #ECEAE4' }}>
            {p.visita_realizada ? '✅ Visita realizada' : '⬜ Visita realizada'}
          </button>
          {p.visita_realizada && (
            <input type="date" value={p.visita_fecha ? p.visita_fecha.slice(0, 10) : ''}
              onChange={e => onUpdateCampo({ visita_fecha: e.target.value || null })}
              className="rounded-lg px-2.5 py-1.5 text-[12px] font-bold outline-none" style={INP} />
          )}
        </div>
        <textarea value={buf.visita_notas} onChange={e => setBuf(b => ({ ...b, visita_notas: e.target.value }))}
          onBlur={() => onUpdateCampo({ visita_notas: buf.visita_notas || null })}
          placeholder="Notas de la visita / inteligencia de campo (quién ocupa, estado real del inmueble, vecinos, etc.)"
          rows={2} className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium outline-none resize-none" style={INP} />
      </div>

      {/* Cargas detalladas — punto 5: valorar cada carga por separado, no solo el agregado */}
      <div className="rounded-xl p-3 mb-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#A6855A' }}>Cargas detalladas</div>
          <button onClick={addCarga} className="px-2 py-1 rounded-lg text-[12px] font-black" style={{ background: '#A6855A', color: '#14110C' }}>+ Agregar</button>
        </div>
        {cargas.length === 0 ? (
          <div className="text-[12px] font-semibold py-1" style={{ color: '#AAA' }}>Sin cargas cargadas individualmente — se usa el total de Cargas previas/posteriores del import.</div>
        ) : (
          <div className="space-y-1.5">
            {cargas.map(c => (
              <div key={c.id} className="flex items-center gap-1.5 flex-wrap">
                <input type="text" value={c.concepto} placeholder="Concepto"
                  onChange={e => updateCarga(c.id, { concepto: e.target.value })}
                  className="flex-1 min-w-[120px] rounded-lg px-2 py-1.5 text-[12px] font-medium outline-none" style={INP} />
                <select value={c.tipo} onChange={e => updateCarga(c.id, { tipo: e.target.value as 'previa' | 'posterior' })}
                  className="rounded-lg px-2 py-1.5 text-[12px] font-bold outline-none" style={SEL}>
                  <option value="previa">Previa</option>
                  <option value="posterior">Posterior</option>
                </select>
                <input type="number" value={c.importe ?? ''} placeholder="€"
                  onChange={e => updateCarga(c.id, { importe: e.target.value === '' ? null : Number(e.target.value) })}
                  className="w-[100px] rounded-lg px-2 py-1.5 text-[12px] font-mono font-bold outline-none" style={INP} />
                <button onClick={() => removeCarga(c.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-black flex-shrink-0" style={{ background: '#F5F4F0', color: '#999' }}>✕</button>
              </div>
            ))}
            <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
              <div className="text-[12px] font-bold" style={{ color: '#888' }}>Previas: {fmt(sumaPrevias)} · Posteriores: {fmt(sumaPosteriores)}</div>
              <div className="flex gap-1.5">
                <button onClick={() => onUpdateCampo({ cargas_previas: sumaPrevias })} className="px-2 py-1 rounded-lg text-[11px] font-black" style={{ background: '#F0EEE8', color: '#666' }}>Aplicar a Cargas previas</button>
                <button onClick={() => onUpdateCampo({ cargas_posteriores: sumaPosteriores })} className="px-2 py-1 rounded-lg text-[11px] font-black" style={{ background: '#F0EEE8', color: '#666' }}>Aplicar a Cargas posteriores</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Estrategia y coste fiscal — punto 6: el coste fiscal depende de qué estrategia se elija */}
      <div className="rounded-xl p-3 mb-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
        <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>Estrategia y fiscalidad</div>
        <label className="block text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Estrategia prevista</label>
        <input type="text" value={buf.estrategia_prevista} onChange={e => setBuf(b => ({ ...b, estrategia_prevista: e.target.value }))}
          onBlur={() => onUpdateCampo({ estrategia_prevista: buf.estrategia_prevista || null })}
          placeholder="ej. dación en pago, subasta, negociación con deudor..."
          className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium outline-none mb-2" style={INP} />
        <label className="block text-[11px] font-semibold mb-1" style={{ color: '#999' }}>Coste fiscal estimado</label>
        <textarea value={buf.coste_fiscal_estimado} onChange={e => setBuf(b => ({ ...b, coste_fiscal_estimado: e.target.value }))}
          onBlur={() => onUpdateCampo({ coste_fiscal_estimado: buf.coste_fiscal_estimado || null })}
          placeholder="Notas libres sobre el coste fiscal según la estrategia elegida (varía si es dación, subasta, cesión de remate, etc.)"
          rows={2} className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium outline-none resize-none" style={INP} />
      </div>

      {/* Análisis Cesión de Crédito (metodología Master IN+) */}
      <div className="mb-3">
        <button onClick={() => setMostrarCesion(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-[12px] font-black"
          style={{ background: 'rgba(166,133,90,0.08)', border: '1px solid rgba(166,133,90,0.25)', color: '#A6855A' }}>
          <span>📋 Análisis Cesión de Crédito (Master IN+)</span>
          <span>{mostrarCesion ? '▲' : '▼'}</span>
        </button>

        {mostrarCesion && (
          <div className="rounded-xl p-3 mt-2 space-y-4" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>

            {/* 4 ratings de dificultad */}
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>Rating de dificultad</div>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { key: 'rating_deudor', label: 'Deudor', infAuto: inferido.rating_deudor },
                  { key: 'rating_posesion', label: 'Posesión', infAuto: inferido.rating_posesion },
                  { key: 'rating_juzgado', label: 'Juzgado', infAuto: inferido.rating_juzgado },
                  { key: 'rating_procedimiento', label: 'Procedimiento', infAuto: inferido.rating_procedimiento },
                ] as { key: keyof AnalisisCesion; label: string; infAuto: RatingDificultad | null }[]).map(({ key, label, infAuto }) => {
                  const val = cesion[key] as RatingDificultad | null
                  const cfg = val ? RATING_COLOR[val] : null
                  const isInferido = val !== null && val === infAuto && p.analisis_cesion?.[key] == null
                  return (
                    <div key={key} className="rounded-lg p-2" style={{ background: cfg?.bg || 'rgba(0,0,0,0.04)', border: `1px solid ${cfg ? cfg.color + '44' : '#ECEAE4'}` }}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#888' }}>{label}</span>
                        {isInferido && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(166,133,90,0.15)', color: '#A6855A' }}>auto</span>}
                      </div>
                      <div className="flex gap-1">
                        {([1, 2, 3, 4, 5] as RatingDificultad[]).map(n => {
                          const active = val === n
                          const nCfg = RATING_COLOR[n]
                          return (
                            <button key={n} title={RATING_LABEL[n]}
                              onClick={() => persistCesion({ ...cesion, [key]: active ? null : n })}
                              className="flex-1 py-1 rounded text-[11px] font-black transition-all"
                              style={{ background: active ? nCfg.color : '#F0EEE8', color: active ? '#fff' : '#AAA', border: 'none' }}>
                              {n}
                            </button>
                          )
                        })}
                      </div>
                      {val && <div className="text-[11px] mt-1 font-semibold" style={{ color: cfg?.color }}>{RATING_LABEL[val]}</div>}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Flags críticos */}
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>Flags críticos</div>
              <div className="space-y-2">
                {([
                  { key: 'novada_hipoteca', label: 'Novada la hipoteca' },
                  { key: 'vivienda_habitual', label: 'Vivienda habitual del deudor' },
                  { key: 'hay_que_pagar_deudor', label: 'Hay que pagar al deudor' },
                ] as { key: keyof AnalisisCesion; label: string }[]).map(({ key, label }) => {
                  const val = cesion[key] as boolean | null
                  return (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold" style={{ color: '#555' }}>{label}</span>
                      <div className="flex gap-1">
                        {(['Sí', 'No'] as const).map(opt => {
                          const isActive = opt === 'Sí' ? val === true : val === false
                          return (
                            <button key={opt}
                              onClick={() => persistCesion({ ...cesion, [key]: opt === 'Sí' ? (val === true ? null : true) : (val === false ? null : false) })}
                              className="px-3 py-1 rounded-lg text-[11px] font-black"
                              style={{ background: isActive ? (opt === 'Sí' ? '#EF4444' : '#22C55E') : '#F0EEE8', color: isActive ? '#fff' : '#888' }}>
                              {opt}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {cesion.hay_que_pagar_deudor && (
                  <div className="flex items-center gap-2 pl-2">
                    <span className="text-[11px] font-semibold" style={{ color: '#999' }}>Importe a pagar al deudor (€)</span>
                    <input type="number" value={cesion.importe_pago_deudor ?? ''}
                      onChange={e => persistCesion({ ...cesion, importe_pago_deudor: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-[110px] rounded-lg px-2 py-1 text-[12px] font-mono font-bold outline-none" style={INP} />
                  </div>
                )}
              </div>
            </div>

            {/* P&L de la cesión */}
            <div>
              <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>P&L de la cesión</div>
              <div className="space-y-1.5">
                {([
                  { key: 'valor_mercado_garantia', label: 'Valor de mercado garantía (€)' },
                  { key: 'precio_cesion', label: 'Precio de cesión (€)' },
                  { key: 'gastos_inscripcion', label: 'Gastos de inscripción (€)' },
                  { key: 'impuestos_cesion', label: 'Impuestos cesión (€)' },
                  { key: 'comisiones', label: 'Comisiones (€)' },
                  { key: 'impuestos_adjudicacion', label: 'Impuestos adjudicación (€)' },
                ] as { key: keyof AnalisisCesion; label: string }[]).map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold" style={{ color: '#666' }}>{label}</span>
                    <input type="number" value={(cesion[key] as number | null) ?? ''}
                      onChange={e => persistCesion({ ...cesion, [key]: e.target.value === '' ? null : Number(e.target.value) })}
                      className="w-[120px] rounded-lg px-2 py-1.5 text-[12px] font-mono font-bold outline-none text-right" style={INP} />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-2 mt-1" style={{ borderTop: '1.5px solid #E8E6E0' }}>
                  <span className="text-[13px] font-black" style={{ color: '#333' }}>Beneficio estimado</span>
                  <span className="text-[15px] font-black font-mono"
                    style={{ color: beneficioCesion === null ? '#BBB' : beneficioCesion >= 0 ? '#16a34a' : '#EF4444' }}>
                    {beneficioCesion === null ? '—' : `${beneficioCesion >= 0 ? '+' : ''}${beneficioCesion.toLocaleString('es-ES')}€`}
                  </span>
                </div>
              </div>
            </div>

            {/* Notas de análisis */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#A6855A' }}>Notas del análisis</label>
              <textarea value={cesion.notas_analisis || ''}
                onChange={e => persistCesion({ ...cesion, notas_analisis: e.target.value || null })}
                placeholder="Observaciones del análisis, acuerdos verbales con el broker, aspectos a verificar..."
                rows={3} className="w-full rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium outline-none resize-none" style={INP} />
            </div>
          </div>
        )}
      </div>

      {/* Ficha detallada: Colateral / Deuda y titular / Estado judicial */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Ficha titulo="Colateral">
          <Field label="Tipo" value={p.tipo_colateral} />
          <Field label="Subtipo" value={p.subtipo_colateral} />
          <div>
            <div className="text-[11px] font-semibold mb-0.5" style={{ color: '#999' }}>Referencia catastral</div>
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12.5px] font-bold font-mono break-all" style={{ color: '#333' }}>{p.ref_catastral || '—'}</span>
              {p.ref_catastral && (
                <>
                  <a href={`https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?pest=rc&i=es&buscar=S&RefC=${encodeURIComponent(p.ref_catastral)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-black"
                    style={{ background: '#14110C', color: '#F8F3E9', textDecoration: 'none' }}>
                    ↗ Ver en Catastro
                  </a>
                  <button
                    onClick={fetchCatastro}
                    disabled={catastroLoading}
                    className="flex-shrink-0 px-2 py-0.5 rounded-lg text-[11px] font-black"
                    style={{ background: catastroData ? '#E8F5E9' : '#F0EEE8', color: catastroData ? '#16A34A' : '#A6855A', border: '1px solid', borderColor: catastroData ? '#BBF7D0' : '#DDDAD2' }}>
                    {catastroLoading ? '⟳ Cargando…' : catastroData ? '✓ Actualizar datos' : '⬇ Obtener datos'}
                  </button>
                  {catastroError && <span className="text-[11px]" style={{ color: '#dc2626' }}>{catastroError}</span>}
                </>
              )}
            </div>
          </div>
          <Field label="Nº Registro" value={p.n_registro} mono />
          <Field label="CCAA" value={p.ccaa} />
          <Field label="Provincia" value={p.provincia} />
          <Field label="Ciudad" value={p.ciudad} />
          <Field label="Código postal" value={p.zip} />
        </Ficha>

        <Ficha titulo="Deuda">
          <Field label="Titular de la deuda" value={p.titular_deuda} />
          <Field label="Contract ID" value={p.contract_id} mono />
          <Field label="Nº préstamos" value={p.n_loans != null ? String(p.n_loans) : null} />
          <Field label="Cargas previas" value={fmt(p.cargas_previas)} />
          <Field label="Cargas posteriores" value={fmt(p.cargas_posteriores)} />
          <Field label="Broker de origen" value={p.broker_origen} />
        </Ficha>

        <Ficha titulo="Estado judicial">
          <Field label="Estado normalizado"
            value={estadoJudicialEfectivo
              ? ESTADO_JUDICIAL_LABEL[estadoJudicialEfectivo] + (!p.estado_judicial_normalizado ? ' (inferido de datos de subasta)' : '')
              : null} />
          <Field label="Estado (texto original del broker)" value={p.estado_judicial_raw} />
          <Field label="Ratio cargas / precio" value={riesgo.sinPrecio ? 'Sin precio' : pct(riesgo.ratio)}
            danger={riesgo.alerta} />
        </Ficha>
      </div>

      {/* Datos catastrales */}
      {catastroData && (
        <div className="mt-3 rounded-xl p-3" style={{ background: '#F0F7F0', border: '1px solid #BBF7D0' }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: '#16A34A' }}>Datos Catastro</span>
            <span className="text-[10px]" style={{ color: '#999' }}>· actualizado {new Date(catastroData.obtenido_en).toLocaleDateString('es-ES')}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1">
            {catastroData.direccion_completa && <div className="col-span-2 sm:col-span-4 text-[12px] font-semibold mb-1" style={{ color: '#1A1A1A' }}>{catastroData.direccion_completa}</div>}
            {catastroData.uso && <Field label="Uso" value={catastroData.uso} />}
            {catastroData.tipo_construccion && <Field label="Tipo" value={catastroData.tipo_construccion} />}
            {catastroData.superficie_construida && <Field label="Superficie" value={`${catastroData.superficie_construida} m²`} />}
            {catastroData.año_construccion && <Field label="Año construcción" value={String(catastroData.año_construccion)} />}
            {catastroData.escalera && <Field label="Escalera" value={catastroData.escalera} />}
            {catastroData.planta && <Field label="Planta" value={catastroData.planta} />}
            {catastroData.puerta && <Field label="Puerta" value={catastroData.puerta} />}
            {catastroData.cp && <Field label="CP" value={catastroData.cp} />}
          </div>
          {catastroData.url_mapa && (
            <a href={catastroData.url_mapa} target="_blank" rel="noopener noreferrer"
              className="inline-block mt-2 text-[11px] font-bold px-2 py-1 rounded-lg"
              style={{ background: '#14110C', color: '#F8F3E9', textDecoration: 'none' }}>
              ↗ Ver mapa catastral
            </a>
          )}
        </div>
      )}

      {/* Datos adicionales del broker — 47 campos agregados 17/07/2026 al ampliar el mapeo de
          columnas de INMUBI/ANDALUCIA-CDR; solo se listan los que esta posición trae cargados. */}
      {camposAdicionalesConValor.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setMostrarExtra(v => !v)}
            className="text-[12px] font-black px-2.5 py-1.5 rounded-lg" style={{ background: '#F0EEE8', color: '#666' }}>
            {mostrarExtra ? '▲' : '▼'} Datos adicionales del broker · {camposAdicionalesConValor.length}
          </button>
          {mostrarExtra && (
            <div className="rounded-xl p-3 mt-2 grid grid-cols-1 sm:grid-cols-3 gap-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
              {camposAdicionalesConValor.map(id => {
                const raw = (p as any)[id]
                const value = CAMPO_TIPO[id] === 'numero' ? fmt(raw as number) : String(raw)
                return <Field key={id} label={CAMPO_LABEL[id] || id} value={value} />
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const SEL = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }
const INP = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333' }

function Kpi({ label, value, highlight, semaforo }: { label: string; value: string; highlight?: boolean; semaforo?: boolean }) {
  const color = semaforo === undefined ? (highlight ? '#A6855A' : '#111') : (semaforo ? '#16A34A' : '#EF4444')
  const bg = semaforo === undefined ? (highlight ? 'rgba(166,133,90,0.1)' : '#F9F8F5') : (semaforo ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.08)')
  const border = semaforo === undefined ? (highlight ? '1px solid rgba(166,133,90,0.3)' : '1px solid #ECEAE4') : `1px solid ${semaforo ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.25)'}`
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: bg, border }}>
      <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>{label}</div>
      <div className="text-[15px] font-black mt-0.5" style={{ color }}>{value}</div>
    </div>
  )
}

function Ficha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
      <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>{titulo}</div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// Label arriba / valor abajo (en vez de label-valor en la misma línea con truncate) — con
// referencias catastrales, contract IDs largos o titulares con nombre completo, la versión en
// una sola línea los cortaba con "..." y no había forma de leerlos sin copiar el HTML.
function Field({ label, value, mono, danger }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold" style={{ color: '#999' }}>{label}</div>
      <div className={`text-[12.5px] font-bold break-words ${mono ? 'font-mono' : ''}`} style={{ color: danger ? '#EF4444' : '#333' }}>
        {value || '—'}
      </div>
    </div>
  )
}
