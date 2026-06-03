// Genera el PDF de un inmueble usando jsPDF de forma programática
// Devuelve un Blob listo para descargar o compartir vía Web Share API

const ORANGE = '#F26E1F'
const BLACK  = '#1A1A1A'
const GRAY   = '#666666'
const GRAY_L = '#F5F4F0'
const BORDER = '#ECEAE4'
const RED    = '#DC2626'
const YELLOW = '#D97706'
const GREEN  = '#16A34A'
const RED_BG   = '#FFF0EE'
const YEL_BG   = '#FFFBEB'
const GRN_BG   = '#F0FDF4'

function fmt(v: number | null | undefined, suffix = '€'): string {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M${suffix}`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(Math.abs(v) < 10_000 ? 1 : 0)}k${suffix}`
  return `${v}${suffix}`
}
function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  return 0
}

const CONCEPTOS_GASTOS = [
  { id: 'precio_compra', label: 'Precio de compra' },
  { id: 'reforma', label: 'Reforma' },
  { id: 'itp', label: 'ITP (2%)' },
  { id: 'notaria', label: 'Notaria + Registro' },
  { id: 'honorarios_api', label: 'Honorarios API' },
  { id: 'certificado_energetico', label: 'Cert. Energetico' },
  { id: 'comision_venta', label: 'Comision venta' },
  { id: 'seguros', label: 'Seguros' },
  { id: 'suministros', label: 'Suministros / Basura' },
  { id: 'otros', label: 'Otros gastos' },
]

type Gastos = Record<string, { estimado: number | string; real: number | string }>

export interface InmuebleReporte {
  id: string
  titulo: string | null
  direccion: string | null
  ciudad: string | null
  tipologia: string | null
  precio_compra: number | null
  superficie: number | null
  habitaciones: number | null
  imagen_portada: string | null
  precio_venta_conservador: number | null
  precio_venta_realista: number | null
  precio_venta_optimista: number | null
  duracion_meses: number | null
  gastos_json: unknown
  analizado_en: string | null
  notas: string | null
  fuente: string | null
}

function hexToRgb(hex: string): [number, number, number] {
  // Normalizar hex corto (#fff → #ffffff)
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return [r, g, b]
}

export async function generateReportePDF(item: InmuebleReporte): Promise<Blob> {
  // Dynamic import — jsPDF es pesado, solo se carga cuando se necesita
  const { jsPDF } = await import('jspdf')

  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const W = 210
  const ml = 16  // margin left
  const mr = 16  // margin right
  const cw = W - ml - mr  // content width
  let y = 18

  // ── helpers ─────────────────────────────────────────────────────────────
  function setColor(hex: string, type: 'fill' | 'text' | 'draw' = 'fill') {
    const [r, g, b] = hexToRgb(hex)
    if (type === 'fill') doc.setFillColor(r, g, b)
    else if (type === 'text') doc.setTextColor(r, g, b)
    else doc.setDrawColor(r, g, b)
  }

  function rect(x: number, yy: number, w: number, h: number, hex: string) {
    setColor(hex, 'fill')
    doc.rect(x, yy, w, h, 'F')
  }

  function line(x1: number, y1: number, x2: number, y2: number, hex: string, lw = 0.3) {
    doc.setLineWidth(lw)
    setColor(hex, 'draw')
    doc.line(x1, y1, x2, y2)
  }

  function text(str: string, x: number, yy: number, opts?: { align?: 'left' | 'right' | 'center'; size?: number; bold?: boolean; color?: string; maxWidth?: number }) {
    const size = opts?.size ?? 9
    const bold = opts?.bold ?? false
    const color = opts?.color ?? BLACK
    setColor(color, 'text')
    doc.setFontSize(size)
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    if (opts?.maxWidth) {
      doc.text(str, x, yy, { align: opts?.align ?? 'left', maxWidth: opts.maxWidth })
    } else {
      doc.text(str, x, yy, { align: opts?.align ?? 'left' })
    }
  }

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const g = item.gastos_json as Gastos | null
  const totalInv = g
    ? CONCEPTOS_GASTOS.reduce((sum, c) => {
        const gc = g[c.id] || { estimado: 0, real: 0 }
        const r = toNum(gc.real); const e = toNum(gc.estimado)
        return sum + (r > 0 ? r : e)
      }, 0)
    : null

  const pvs = [item.precio_venta_conservador, item.precio_venta_realista, item.precio_venta_optimista]
  const bens = pvs.map(pv => (pv && totalInv) ? pv - totalInv : null)
  const rois = bens.map(b => (b !== null && totalInv) ? (b / totalInv) * 100 : null)
  const dm = item.duracion_meses
  const roisAnual = rois.map(r => (r !== null && dm && dm > 0) ? r * 12 / dm : null)
  const nombre = item.titulo || item.direccion || 'Inmueble'
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  const gastoRows = g
    ? CONCEPTOS_GASTOS.map(c => {
        const gc = g[c.id] || { estimado: 0, real: 0 }
        const r = toNum(gc.real); const e = toNum(gc.estimado)
        const val = r > 0 ? r : e
        return val > 0 ? { label: c.label, val } : null
      }).filter(Boolean) as { label: string; val: number }[]
    : []

  // ── HEADER ────────────────────────────────────────────────────────────────
  // Logo / marca
  text('WALLEST', ml, y, { size: 8, bold: true, color: ORANGE })
  text('HASU ACTIVOS INMOBILIARIOS SL', ml + 22, y, { size: 7, color: GRAY })
  text(fecha, W - mr, y, { size: 7, color: GRAY, align: 'right' })
  y += 6

  // Título inmueble
  text(nombre, ml, y, { size: 16, bold: true, color: BLACK, maxWidth: cw - 40 })
  // Precio destacado
  text(fmt(item.precio_compra ?? 0), W - mr, y, { size: 16, bold: true, color: ORANGE, align: 'right' })
  y += 5
  if (item.ciudad || item.direccion) {
    const dir = item.titulo && item.direccion ? `${item.direccion}, ${item.ciudad || ''}` : (item.ciudad || '')
    text(dir.trim().replace(/,$/, ''), ml, y, { size: 9, color: GRAY })
    y += 5
  }

  // Línea naranja
  setColor(ORANGE, 'fill')
  doc.rect(ml, y, cw, 1.2, 'F')
  y += 5

  // ── DATOS BÁSICOS (grid 3 col) ─────────────────────────────────────────
  const cols3 = [
    ['Tipologia', item.tipologia || '—'],
    ['Superficie', item.superficie ? `${item.superficie} m²` : '—'],
    ['Habitaciones', item.habitaciones ? String(item.habitaciones) : '—'],
    ['Duracion', dm ? `${dm} meses` : '—'],
    ['Fuente', item.fuente || '—'],
    ['Analizado', item.analizado_en || '—'],
  ]
  const cellW = cw / 3
  const cellH = 10
  cols3.forEach((col, i) => {
    const cx = ml + (i % 3) * cellW
    const cy = y + Math.floor(i / 3) * (cellH + 2)
    rect(cx, cy, cellW - 1, cellH, GRAY_L)
    text(col[0].toUpperCase(), cx + 3, cy + 3.5, { size: 6.5, bold: true, color: GRAY })
    text(col[1], cx + 3, cy + 7.5, { size: 9, bold: true, color: BLACK })
  })
  y += (Math.ceil(cols3.length / 3)) * (cellH + 2) + 5

  // ── NOTAS ──────────────────────────────────────────────────────────────
  if (item.notas) {
    setColor(ORANGE, 'fill')
    doc.rect(ml, y, 2.5, 14, 'F')
    rect(ml + 2.5, y, cw - 2.5, 14, '#FFF8F4')
    text('NOTAS', ml + 5, y + 4, { size: 6.5, bold: true, color: ORANGE })
    const wrapped = doc.splitTextToSize(item.notas, cw - 10)
    setColor('#555555', 'text')
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(wrapped.slice(0, 2), ml + 5, y + 9)
    y += 18
  }

  // ── TABLA DE ESCENARIOS ────────────────────────────────────────────────
  if (totalInv && pvs.some(p => p)) {
    text('ANALISIS DE RENTABILIDAD', ml, y, { size: 8, bold: true, color: BLACK })
    y += 5

    const ESC = [
      { label: 'Pesimista', bg: RED_BG,   color: RED },
      { label: 'Realista',  bg: YEL_BG,   color: YELLOW },
      { label: 'Optimista', bg: GRN_BG,   color: GREEN },
    ]
    const colW = (cw - 32) / 3
    const rowH = 8

    // Header
    rect(ml, y, 32, rowH, GRAY_L)
    ESC.forEach((s, i) => {
      rect(ml + 32 + i * colW, y, colW, rowH, s.bg)
      text(s.label.toUpperCase(), ml + 32 + i * colW + colW / 2, y + 5, { size: 7.5, bold: true, color: s.color, align: 'center' })
    })
    line(ml, y + rowH, ml + cw, y + rowH, BORDER)
    y += rowH

    // Filas
    const tableRows = [
      { label: 'P. Venta',        vals: pvs.map(v => v ? fmt(v) : '—'),         bg: '#fff', bold: true, colors: [BLACK,BLACK,BLACK] },
      { label: 'Inv. Total',      vals: pvs.map(() => fmt(totalInv)),            bg: GRAY_L, bold: false, colors: [GRAY,GRAY,GRAY] },
      { label: 'Beneficio',       vals: bens.map(b => b !== null ? (b >= 0 ? '+' : '') + fmt(b) : '—'), bg: '#fff', bold: true,
        colors: bens.map(b => b === null ? GRAY : b >= 0 ? GREEN : RED) },
      { label: 'ROI operacion',   vals: rois.map(r => r !== null ? r.toFixed(1) + '%' : '—'), bg: '#fff', bold: true,
        colors: rois.map(r => r === null ? GRAY : r >= 30 ? GREEN : r >= 15 ? YELLOW : RED) },
      { label: `ROI anual${dm ? ` (${dm}m)` : ''}`, vals: roisAnual.map(r => r !== null ? r.toFixed(1) + '%' : '—'), bg: GRAY_L, bold: true,
        colors: roisAnual.map(r => r === null ? GRAY : r >= 30 ? GREEN : r >= 15 ? YELLOW : RED) },
    ]

    tableRows.forEach(row => {
      rect(ml, y, 32, rowH, row.bg)
      text(row.label, ml + 3, y + 5.2, { size: 8, bold: false, color: GRAY })
      row.vals.forEach((v, i) => {
        rect(ml + 32 + i * colW, y, colW, rowH, row.bg)
        text(v, ml + 32 + i * colW + colW / 2, y + 5.2, { size: 9, bold: row.bold, color: row.colors[i], align: 'center' })
      })
      line(ml, y + rowH, ml + cw, y + rowH, BORDER)
      y += rowH
    })
    y += 8
  }

  // ── DESGLOSE GASTOS ────────────────────────────────────────────────────
  if (gastoRows.length > 0) {
    text('DESGLOSE DE INVERSION', ml, y, { size: 8, bold: true, color: BLACK })
    y += 5
    const rowH2 = 7
    gastoRows.forEach((r, i) => {
      rect(ml, y, cw, rowH2, i % 2 === 0 ? '#fff' : GRAY_L)
      text(r.label, ml + 3, y + 4.8, { size: 8.5, color: '#555' })
      text(fmt(r.val), W - mr, y + 4.8, { size: 9, bold: true, color: BLACK, align: 'right' })
      y += rowH2
    })
    // Total row
    rect(ml, y, cw, rowH2 + 1, BLACK)
    text('INVERSION TOTAL', ml + 3, y + 5.5, { size: 9, bold: true, color: '#fff' })
    text(fmt(totalInv), W - mr, y + 5.5, { size: 11, bold: true, color: ORANGE, align: 'right' })
    y += rowH2 + 9
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  const pageH = 297
  line(ml, pageH - 16, W - mr, pageH - 16, BORDER)
  text('WALLEST', ml, pageH - 10, { size: 10, bold: true, color: ORANGE })
  text('HASU Activos Inmobiliarios SL  ·  wallest.pro', ml + 23, pageH - 10, { size: 7.5, color: GRAY })
  text('Documento de uso interno', W - mr, pageH - 10, { size: 7, color: '#CCC', align: 'right' })

  return doc.output('blob')
}
