// Generador de dossier multi-inmueble para inversores
// Landscape A4 (297x210mm), estilo presentación profesional

const ORANGE  = '#F26E1F'
const SAND    = '#C9A96E'
const BLACK   = '#1A1A1A'
const DARK    = '#111111'
const GRAY    = '#666666'
const GRAY_L  = '#F5F4F0'
const CREAM   = '#F2F1ED'
const BORDER  = '#ECEAE4'
const WHITE   = '#FFFFFF'
const GREEN   = '#16A34A'

function fmt(v: number | null | undefined, suffix = '€'): string {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M${suffix}`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(Math.abs(v) < 10_000 ? 1 : 0)}k${suffix}`
  return `${v}${suffix}`
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2]
  return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]
}

export interface DossierInmueble {
  nombre: string
  ubicacion: string        // ej: "Huércal-Overa, Almería"
  descripcion: string      // texto libre
  precio: number           // precio de compra €
  alquiler: number         // alquiler mensual €
  comunidad?: number       // gasto mensual comunidad €
  ibi?: number             // IBI anual €
  hab?: number
  banos?: number
  tipologia?: string       // "Piso", "Dúplex", "Local"...
  imagen?: string          // URL (opcional)
  notas?: string           // planta, extras, etc.
}

export interface DossierConfig {
  titulo: string           // ej: "Cartera de Oportunidades — Julio 2025"
  subtitulo?: string
  inversora?: string       // nombre del inversor (opcional)
  inmuebles: DossierInmueble[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function generateDossierPDF(config: DossierConfig, jsPDF: any, filename = 'dossier-inversion-hasu.pdf'): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const H = 210

  // ── helpers ─────────────────────────────────────────────────────────────────
  function setFill(hex: string) { const [r,g,b]=hexToRgb(hex); doc.setFillColor(r,g,b) }
  function setTxt(hex: string)  { const [r,g,b]=hexToRgb(hex); doc.setTextColor(r,g,b)  }
  function setDraw(hex: string) { const [r,g,b]=hexToRgb(hex); doc.setDrawColor(r,g,b)  }

  function rect(x:number,y:number,w:number,h:number,hex:string) {
    setFill(hex); doc.rect(x,y,w,h,'F')
  }
  function txt(str:string, x:number, y:number, opts?: {
    size?:number; bold?:boolean; color?:string; align?:'left'|'right'|'center'; maxWidth?:number
  }) {
    doc.setFontSize(opts?.size??9)
    doc.setFont('helvetica', opts?.bold?'bold':'normal')
    setTxt(opts?.color??BLACK)
    const a = opts?.align??'left'
    if (opts?.maxWidth) doc.text(str,x,y,{align:a, maxWidth:opts.maxWidth})
    else doc.text(str,x,y,{align:a})
  }

  const fecha = new Date().toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'})

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINA 1 — PORTADA
  // ══════════════════════════════════════════════════════════════════════════

  // Fondo izquierdo oscuro (60%)
  rect(0, 0, W * 0.60, H, DARK)

  // Franja naranja vertical decorativa
  rect(W * 0.60, 0, 5, H, ORANGE)

  // Fondo derecho crema
  rect(W * 0.60 + 5, 0, W * 0.40 - 5, H, CREAM)

  // WALLEST en naranja
  txt('WALLEST', 22, 38, { size: 11, bold: true, color: ORANGE })
  txt('HASU ACTIVOS INMOBILIARIOS SL', 22, 45, { size: 7.5, color: '#888888' })

  // Línea naranja bajo el logo
  setFill(ORANGE); doc.rect(22, 48, 40, 0.8, 'F')

  // Título principal
  const titleLines = doc.splitTextToSize(config.titulo, W * 0.52)
  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  setTxt(WHITE)
  doc.text(titleLines, 22, 78)

  if (config.subtitulo) {
    txt(config.subtitulo, 22, 78 + titleLines.length * 12 + 4, { size: 12, color: SAND })
  }

  // Número de inmuebles
  const nOps = config.inmuebles.length
  const investment = config.inmuebles.reduce((s,p)=>s+p.precio,0)

  txt(`${nOps} ${nOps===1?'inmueble':'inmuebles'}`, 22, H - 42, { size: 10, color: SAND })
  txt(fmt(investment), 22, H - 34, { size: 18, bold: true, color: WHITE })
  txt('inversión total estimada', 22, H - 27, { size: 7.5, color: '#888888' })

  // Fecha + info derecha
  txt(fecha, W * 0.60 + 5 + 14, 38, { size: 8.5, color: GRAY })
  if (config.inversora) {
    txt('Presentado para', W * 0.60 + 5 + 14, 52, { size: 7, color: GRAY })
    txt(config.inversora, W * 0.60 + 5 + 14, 59, { size: 11, bold: true, color: DARK })
  }

  // KPIs en la parte derecha de portada
  const alqTotal = config.inmuebles.reduce((s,p)=>s+p.alquiler,0)
  const gastosTotal = config.inmuebles.reduce((s,p)=>{
    const com = (p.comunidad??0)*12
    const ibi = p.ibi??0
    return s+com+ibi
  },0)
  const rentBruta = investment > 0 ? (alqTotal*12/investment)*100 : 0
  const rentNeta  = investment > 0 ? ((alqTotal*12-gastosTotal)/investment)*100 : 0

  const kpis = [
    { label: 'Alquiler mensual', value: fmt(alqTotal) + '/mes' },
    { label: 'Rentabilidad bruta', value: rentBruta.toFixed(1) + '%' },
    { label: 'Rentabilidad neta', value: rentNeta.toFixed(1) + '%' },
  ]

  let ky = H - 80
  kpis.forEach(k => {
    txt(k.label.toUpperCase(), W * 0.60 + 5 + 14, ky, { size: 6.5, bold: true, color: GRAY })
    txt(k.value, W * 0.60 + 5 + 14, ky + 7, { size: 14, bold: true, color: ORANGE })
    setFill(BORDER); doc.rect(W * 0.60 + 5 + 14, ky + 11, 50, 0.4, 'F')
    ky += 18
  })

  // Footer portada
  txt('Documento confidencial · Uso exclusivo del destinatario', W/2, H - 8, { size: 6.5, color: '#888888', align: 'center' })

  // ══════════════════════════════════════════════════════════════════════════
  // PÁGINAS DE INMUEBLES — una por propiedad
  // ══════════════════════════════════════════════════════════════════════════

  for (let idx = 0; idx < config.inmuebles.length; idx++) {
    const p = config.inmuebles[idx]
    doc.addPage()

    // --- Layout: panel izquierdo (imagen/color) + panel derecho (datos) ---
    const LEFT_W = 118   // ~40% del ancho
    const RIGHT_X = LEFT_W + 1
    const RIGHT_W = W - RIGHT_X
    const ml = RIGHT_X + 14
    const mr = W - 14
    const cw = mr - ml

    // Panel izquierdo: fondo oscuro con degradado simulado
    rect(0, 0, LEFT_W, H, DARK)

    // Si hay imagen, la cargamos
    if (p.imagen) {
      try {
        // Detectar formato por extensión o intentar con JPEG
        const ext = p.imagen.split('.').pop()?.toLowerCase() ?? 'jpeg'
        const fmt2 = ext === 'png' ? 'PNG' : 'JPEG'
        doc.addImage(p.imagen, fmt2, 0, 0, LEFT_W, H, undefined, 'FAST')
        // Overlay semitransparente encima
        setFill(DARK)
        doc.setGState(new (doc as unknown as {GState: new (o:{opacity:number})=>unknown}).GState({opacity:0.45}))
        doc.rect(0, 0, LEFT_W, H, 'F')
        doc.setGState(new (doc as unknown as {GState: new (o:{opacity:number})=>unknown}).GState({opacity:1}))
      } catch(_) {
        // Si falla la imagen, solo el fondo oscuro
      }
    } else {
      // Sin imagen: franja naranja decorativa
      rect(0, 0, LEFT_W, 6, ORANGE)
    }

    // Número de inmueble (ej: 01)
    const num = String(idx + 1).padStart(2, '0')
    txt(num, 14, H - 40, { size: 42, bold: true, color: ORANGE })
    txt(`de ${String(nOps).padStart(2,'0')}`, 14 + 30, H - 26, { size: 10, color: SAND })

    // Precio en panel izquierdo
    txt(fmt(p.precio), LEFT_W - 14, H - 18, { size: 14, bold: true, color: WHITE, align: 'right' })
    txt('precio de adquisición', LEFT_W - 14, H - 12, { size: 6.5, color: SAND, align: 'right' })

    // ── Panel derecho ────────────────────────────────────────────────────────
    rect(RIGHT_X, 0, RIGHT_W, H, WHITE)

    // Header derecho
    txt('WALLEST', ml, 16, { size: 8, bold: true, color: ORANGE })
    txt('·', ml + 21, 16, { size: 8, color: SAND })
    txt('HASU ACTIVOS INMOBILIARIOS SL', ml + 24, 16, { size: 7, color: GRAY })

    // Línea separadora
    setFill(BORDER); doc.rect(ml, 20, cw, 0.4, 'F')

    // Nombre del inmueble
    const titleT = doc.splitTextToSize(p.nombre, cw)
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    setTxt(DARK)
    doc.text(titleT, ml, 30)

    // Ubicación
    txt(p.ubicacion, ml, 30 + titleT.length * 8 + 2, { size: 8.5, color: ORANGE })

    // Tipología + notas
    let yy = 30 + titleT.length * 8 + 10
    if (p.tipologia || p.notas) {
      const badge = [p.tipologia, p.notas].filter(Boolean).join(' · ')
      txt(badge, ml, yy, { size: 7.5, color: GRAY, maxWidth: cw })
      yy += 7
    }

    // Línea naranja
    setFill(ORANGE); doc.rect(ml, yy, 30, 1, 'F')
    yy += 6

    // Descripción
    const descLines = doc.splitTextToSize(p.descripcion, cw)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    setTxt('#444444')
    doc.text(descLines, ml, yy)
    yy += descLines.length * 4.5 + 6

    // ── Características (pills) ──────────────────────────────────────────────
    const chars: string[] = []
    if (p.hab)    chars.push(`${p.hab} hab.`)
    if (p.banos)  chars.push(`${p.banos} baños`)
    if (p.tipologia) chars.push(p.tipologia)

    if (chars.length) {
      let cx = ml
      chars.forEach(c => {
        const tw = doc.getTextWidth(c) + 8
        rect(cx, yy - 3.5, tw, 6.5, GRAY_L)
        setFill(BORDER); doc.setLineWidth(0.3); doc.rect(cx, yy - 3.5, tw, 6.5, 'S')
        txt(c, cx + 4, yy + 1.5, { size: 7, color: DARK })
        cx += tw + 3
      })
      yy += 10
    }

    // ── KPIs financieros ─────────────────────────────────────────────────────
    const gastosMes = p.comunidad ?? 0
    const gastosAn  = (p.ibi ?? 0) + gastosMes * 12
    const ingresosAn = p.alquiler * 12
    const rentB = (ingresosAn / p.precio) * 100
    const rentN = ((ingresosAn - gastosAn) / p.precio) * 100

    const kpisData = [
      { label: 'Alquiler mensual', value: fmt(p.alquiler) + '/mes', highlight: true },
      { label: 'Rent. bruta', value: rentB.toFixed(1) + '%', highlight: false },
      { label: 'Rent. neta', value: rentN.toFixed(1) + '%', highlight: false },
      { label: 'Comunidad', value: p.comunidad ? fmt(p.comunidad) + '/mes' : 'Sin gastos', highlight: false },
      { label: 'IBI anual', value: p.ibi ? fmt(p.ibi) : '—', highlight: false },
    ]

    // Grid de KPIs — 2 filas
    const kpiW = cw / 3
    const kpiH = 18
    const kpiY = H - 58
    const row1 = kpisData.slice(0, 3)
    const row2 = kpisData.slice(3, 5)

    // Fondo gris claro para la sección KPI
    rect(ml - 6, kpiY - 6, cw + 12, 54, CREAM)
    setFill(BORDER); doc.rect(ml - 6, kpiY - 6, cw + 12, 54, 'S')

    txt('DATOS FINANCIEROS', ml, kpiY - 1, { size: 6.5, bold: true, color: GRAY })

    row1.forEach((k,i) => {
      const kx = ml + i * kpiW
      const ky = kpiY + 4
      if (k.highlight) {
        rect(kx, ky - 3, kpiW - 2, kpiH, ORANGE)
        txt(k.label.toUpperCase(), kx + 4, ky + 2, { size: 5.5, bold: true, color: '#FFFFFF' })
        txt(k.value, kx + 4, ky + 11, { size: 14, bold: true, color: WHITE })
      } else {
        rect(kx, ky - 3, kpiW - 2, kpiH, WHITE)
        setFill(BORDER); doc.setLineWidth(0.3); doc.rect(kx, ky - 3, kpiW - 2, kpiH, 'S')
        txt(k.label.toUpperCase(), kx + 4, ky + 2, { size: 5.5, bold: true, color: GRAY })
        txt(k.value, kx + 4, ky + 11, { size: 12, bold: true, color: k.value.includes('%') && parseFloat(k.value) >= 6 ? GREEN : DARK })
      }
    })

    row2.forEach((k,i) => {
      const kx = ml + i * kpiW
      const ky = kpiY + 4 + kpiH + 2
      rect(kx, ky - 3, kpiW - 2, kpiH - 4, WHITE)
      setFill(BORDER); doc.setLineWidth(0.3); doc.rect(kx, ky - 3, kpiW - 2, kpiH - 4, 'S')
      txt(k.label.toUpperCase(), kx + 4, ky + 2, { size: 5.5, bold: true, color: GRAY })
      txt(k.value, kx + 4, ky + 9, { size: 10, bold: true, color: DARK })
    })

    // Número de página
    txt(`${idx + 2} / ${nOps + 2}`, W - 14, H - 6, { size: 6.5, color: GRAY, align: 'right' })
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ÚLTIMA PÁGINA — CIERRE / CONTACTO
  // ══════════════════════════════════════════════════════════════════════════
  doc.addPage()

  // Fondo bicolor
  rect(0, 0, W, H * 0.65, DARK)
  rect(0, H * 0.65, W, H * 0.35, CREAM)

  // Franja naranja central
  rect(0, H * 0.65 - 3, W, 6, ORANGE)

  // Texto central
  txt('Gracias.', W/2, H * 0.30, { size: 40, bold: true, color: WHITE, align: 'center' })
  txt('Activos seleccionados, asesoramiento estratégico, operaciones en entorno confidencial.',
    W/2, H * 0.42, { size: 9, color: SAND, align: 'center' })

  // Datos de contacto
  txt('HASU ACTIVOS INMOBILIARIOS SL', W/2, H * 0.75, { size: 10, bold: true, color: DARK, align: 'center' })
  txt('patricio@wallest.pro', W/2, H * 0.75 + 9, { size: 9, color: ORANGE, align: 'center' })
  txt('wos.wallest.pro', W/2, H * 0.75 + 17, { size: 8.5, color: GRAY, align: 'center' })

  // Pie
  txt('Documento confidencial · ' + fecha, W/2, H - 8, { size: 6.5, color: GRAY, align: 'center' })

  doc.save(filename)
}
