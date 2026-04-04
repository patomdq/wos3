'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
const fmtPct = (n: number) => (isFinite(n) ? n.toFixed(2) : '0.00') + '%'
const today = () => new Date().toISOString().split('T')[0]

const CONCEPTOS_GASTOS = [
  { id: 'precio_compra', nombre: 'Precio de compra' },
  { id: 'gastos_compraventa', nombre: 'Gastos de compraventa (notario, registro, gestoría)' },
  { id: 'gastos_cancelacion', nombre: 'Gastos de cancelación (notario, registro, gestoría)' },
  { id: 'itp', nombre: 'Impuesto de compra ITP' },
  { id: 'honorarios_profesionales', nombre: 'Honorarios profesionales' },
  { id: 'honorarios_complementaria', nombre: 'Honorarios gestión complementaria' },
  { id: 'certificado_energetico', nombre: 'Certificado energético' },
  { id: 'comisiones_inmobiliarias', nombre: 'Comisiones inmobiliarias' },
  { id: 'reforma', nombre: 'Reforma' },
  { id: 'seguros', nombre: 'Seguros' },
  { id: 'suministros_basura', nombre: 'Suministros / basura' },
  { id: 'cuotas_comunidad', nombre: 'Cuotas comunidad propietarios' },
  { id: 'deuda_ibi', nombre: 'Deuda IBI' },
  { id: 'deuda_comunidad', nombre: 'Deuda comunidad propietarios' },
]

type Gastos = Record<string, { estimado: number; real: number }>
type Radar = { id: string; precio: number; direccion: string; ciudad: string; habitaciones: number; superficie: number; fuente: string; fecha_recibido: string; estado: string; notas?: string }
type Estudio = { id: string; nombre?: string; precio_compra: number; precio_venta_objetivo: number; roi_estimado: number; direccion: string; ciudad: string; analizado_en: string }

const SCRAPER_DATA = [
  { precio: 48000, dir: 'C/ Real 7', ciudad: 'Los Gallardos', hab: 3, m2: 85, tag: 'Reformar', epm: 565, fecha: 'hoy' },
  { precio: 95000, dir: 'C/ Constitución 18', ciudad: 'Zurgena', hab: 4, m2: 110, tag: 'Buen estado', epm: 863, fecha: 'hoy' },
  { precio: 62000, dir: 'Avda. Andalucía 4', ciudad: 'Cuevas del Almanzora', hab: 3, m2: 92, tag: 'Reformar', epm: 674, fecha: 'ayer' },
  { precio: 115000, dir: 'C/ Mayor 12', ciudad: 'Huércal-Overa', hab: 5, m2: 140, tag: 'Buen estado', epm: 821, fecha: 'ayer' },
  { precio: 35000, dir: 'C/ Nueva 3', ciudad: 'Albox', hab: 2, m2: 65, tag: 'Reformar', epm: 538, fecha: 'hace 2d' },
  { precio: 78000, dir: 'C/ Almería 9', ciudad: 'Vera', hab: 3, m2: 98, tag: 'Buen estado', epm: 796, fecha: 'hace 2d' },
]

function emptyGastos(): Gastos {
  const g: Gastos = {}
  CONCEPTOS_GASTOS.forEach(c => { g[c.id] = { estimado: 0, real: 0 } })
  return g
}

function toNum(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return isNaN(v) || !isFinite(v) ? 0 : v
  const n = parseFloat(String(v).replace(/€/g,'').replace(/\s/g,'').replace(/\./g,'').replace(/,/g,'.'))
  return isNaN(n) || !isFinite(n) ? 0 : n
}

function calcResultados(gastos: Gastos, pvPes: number, pvReal: number, pvOpt: number, meses: number) {
  let totalReal = 0
  CONCEPTOS_GASTOS.forEach(c => {
    const r = toNum(gastos[c.id].real); const e = toNum(gastos[c.id].estimado)
    totalReal += r > 0 ? r : e
  })
  let totalEst = 0
  CONCEPTOS_GASTOS.forEach(c => { totalEst += toNum(gastos[c.id].estimado) })
  if (totalReal <= 0) return null
  const pv = [pvPes, pvReal, pvOpt]
  const ben = pv.map(p => toNum(p) - totalReal)
  const rent = ben.map(b => (b / totalReal) * 100)
  const m = Math.max(1, toNum(meses))
  const anual = rent.map(r => { const a = (Math.pow(1 + r / 100, 12 / m) - 1) * 100; return isFinite(a) ? a : 0 })
  return { totalEst, totalReal, ben, rent, anual }
}

const emptyRadarForm = () => ({ direccion: '', ciudad: '', precio: '', habitaciones: '', superficie: '', estado: 'reformar', fuente: 'WhatsApp', notas: '' })

export default function MercadoPage() {
  const [tab, setTab] = useState(0)
  const [radar, setRadar] = useState<Radar[]>([])
  const [estudio, setEstudio] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)

  // Radar form
  const [radarOpen, setRadarOpen] = useState(false)
  const [radarForm, setRadarForm] = useState(emptyRadarForm())
  const [savingRadar, setSavingRadar] = useState(false)

  // Calculadora
  const [calcOpen, setCalcOpen] = useState(false)
  const [editingEstudioId, setEditingEstudioId] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [duracionMeses, setDuracionMeses] = useState(12)
  const [gastos, setGastos] = useState<Gastos>(emptyGastos)
  const [pvPes, setPvPes] = useState(0)
  const [pvReal, setPvReal] = useState(0)
  const [pvOpt, setPvOpt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('inmuebles_radar').select('*').order('created_at', { ascending: false }),
      supabase.from('inmuebles_estudio').select('*').order('created_at', { ascending: false }),
    ]).then(([r, e]) => {
      setRadar(r.data || [])
      setEstudio(e.data || [])
      setLoading(false)
    })
  }, [])

  // Guardar radar
  const saveRadar = async () => {
    if (!radarForm.direccion || !radarForm.precio) return
    setSavingRadar(true)
    const { data, error } = await supabase.from('inmuebles_radar').insert([{
      direccion: radarForm.direccion,
      ciudad: radarForm.ciudad,
      precio: parseFloat(radarForm.precio) || 0,
      habitaciones: parseInt(radarForm.habitaciones) || 0,
      superficie: parseInt(radarForm.superficie) || 0,
      estado: radarForm.fuente === 'Idealista' ? 'activo' : 'activo',
      fuente: radarForm.fuente,
      fecha_recibido: today(),
      notas: radarForm.notas || null,
    }]).select().single()
    setSavingRadar(false)
    if (!error && data) {
      setRadar(prev => [data, ...prev])
      setRadarOpen(false)
      setRadarForm(emptyRadarForm())
    }
  }

  // Guardar scraper item en radar
  const saveScraperToRadar = async (item: typeof SCRAPER_DATA[0]) => {
    const { data, error } = await supabase.from('inmuebles_radar').insert([{
      direccion: item.dir,
      ciudad: item.ciudad,
      precio: item.precio,
      habitaciones: item.hab,
      superficie: item.m2,
      estado: 'activo',
      fuente: 'Idealista',
      fecha_recibido: today(),
    }]).select().single()
    if (!error && data) {
      setRadar(prev => [data, ...prev])
      setTab(0)
    }
  }

  // Abrir calculadora (nuevo o editar estudio)
  const openCalc = (precio: number, addr: string, ciu: string = '', estudioItem?: Estudio) => {
    const g = emptyGastos()
    g.precio_compra.estimado = precio
    setGastos(g)
    setNombre(addr)
    setCiudad(ciu)
    const pv = estudioItem?.precio_venta_objetivo || Math.round(precio * 1.45)
    setPvReal(pv)
    setPvPes(Math.round(pv * 0.85))
    setPvOpt(Math.round(pv * 1.15))
    setDuracionMeses(12)
    setEditingEstudioId(estudioItem?.id || null)
    setSavedId(null)
    setCalcOpen(true)
  }

  // Cuando cambia pvReal: auto-calcular ±15%
  const handlePvRealChange = (val: string) => {
    const n = parseFloat(val) || 0
    setPvReal(n)
    if (n > 0) {
      setPvPes(Math.round(n * 0.85))
      setPvOpt(Math.round(n * 1.15))
    }
  }

  const updateGasto = (id: string, tipo: 'estimado' | 'real', val: string) => {
    setGastos(prev => ({ ...prev, [id]: { ...prev[id], [tipo]: parseFloat(val) || 0 } }))
  }

  const res = calcResultados(gastos, pvPes, pvReal, pvOpt, duracionMeses)

  // Guardar / actualizar estudio
  const guardar = async () => {
    if (!res) return
    setSaving(true)
    const payload = {
      nombre,
      precio_compra: toNum(gastos.precio_compra.estimado) || toNum(gastos.precio_compra.real),
      precio_venta_objetivo: pvReal || pvOpt || pvPes,
      roi_estimado: res.rent[1] || res.rent[0],
      direccion: nombre,
      ciudad,
      estado: 'en_estudio',
      analizado_en: today(),
    }
    let data: any, error: any
    if (editingEstudioId) {
      ;({ data, error } = await supabase.from('inmuebles_estudio').update(payload).eq('id', editingEstudioId).select().single())
      if (!error && data) {
        setEstudio(prev => prev.map(e => e.id === editingEstudioId ? data : e))
        setSavedId(data.id)
      }
    } else {
      ;({ data, error } = await supabase.from('inmuebles_estudio').insert([payload]).select().single())
      if (!error && data) {
        setEstudio(prev => [data, ...prev])
        setSavedId(data.id)
      }
    }
    setSaving(false)
  }

  // Eliminar estudio
  const deleteEstudio = async (id: string) => {
    if (!confirm('¿Eliminar este análisis?')) return
    const { error } = await supabase.from('inmuebles_estudio').delete().eq('id', id)
    if (!error) setEstudio(prev => prev.filter(e => e.id !== id))
  }

  // PDF
  const exportarPDF = () => {
    if (!res) return
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF()
      const naranja = [230, 126, 34] as [number,number,number]
      const negro = [0, 0, 0] as [number,number,number]
      const gris = [100, 100, 100] as [number,number,number]
      const grisClaro = [240, 240, 240] as [number,number,number]
      let y = 15

      // Header con línea naranja
      doc.setDrawColor(...naranja); doc.setLineWidth(1); doc.line(14, y, 196, y); y += 10
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...naranja); doc.text('WALLEST', 14, y); y += 7
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gris); doc.text('Hasu Activos Inmobiliarios SL', 14, y); y += 5
      doc.setDrawColor(...naranja); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 10

      // Título
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...negro)
      doc.text('Análisis de Rentabilidad', 14, y); y += 8
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gris)
      if (nombre) { doc.text(`Dirección: ${nombre}`, 14, y); y += 6 }
      if (ciudad) { doc.text(`Municipio: ${ciudad}`, 14, y); y += 6 }
      doc.text(`Fecha del análisis: ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}`, 14, y); y += 6
      doc.text(`Duración estimada de la operación: ${duracionMeses} meses`, 14, y); y += 10

      // Tabla gastos
      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...negro)
      doc.text('Concepto', 16, y + 5.5)
      doc.text('Estimado', 130, y + 5.5, { align: 'right' })
      doc.text('Real', 196, y + 5.5, { align: 'right' }); y += 8

      doc.setFont('helvetica', 'normal')
      CONCEPTOS_GASTOS.forEach(c => {
        const est = gastos[c.id].estimado; const rea = gastos[c.id].real
        if (est === 0 && rea === 0) return
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setTextColor(...negro)
        doc.text(c.nombre, 16, y + 5)
        doc.text(est > 0 ? fmt2(est) : '-', 130, y + 5, { align: 'right' })
        doc.text(rea > 0 ? fmt2(rea) : '-', 196, y + 5, { align: 'right' })
        doc.setDrawColor(220,220,220); doc.line(14, y+8, 196, y+8); y += 9
      })

      y += 2
      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 9, 'F')
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...naranja)
      doc.text('TOTAL INVERSIÓN', 16, y + 6)
      doc.text(fmt2(res.totalEst), 130, y + 6, { align: 'right' })
      doc.text(fmt2(res.totalReal), 196, y + 6, { align: 'right' }); y += 18

      if (y > 230) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...negro)
      doc.text('Escenarios de Rentabilidad', 14, y); y += 8

      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...negro)
      doc.text('Escenario', 16, y + 5.5)
      doc.text('Precio Venta', 90, y + 5.5, { align: 'right' })
      doc.text('Beneficio', 130, y + 5.5, { align: 'right' })
      doc.text('ROI', 163, y + 5.5, { align: 'right' })
      doc.text('ROI Anualizado', 196, y + 5.5, { align: 'right' }); y += 8

      const ESC_PDF = [
        { nombre: 'Conservador (−15%)', pv: pvPes, idx: 0 },
        { nombre: 'Realista', pv: pvReal, idx: 1 },
        { nombre: 'Optimista (+15%)', pv: pvOpt, idx: 2 },
      ]
      doc.setFont('helvetica', 'normal')
      ESC_PDF.forEach(esc => {
        doc.setTextColor(...negro)
        doc.text(esc.nombre, 16, y + 5)
        doc.text(fmt2(toNum(esc.pv)), 90, y + 5, { align: 'right' })
        const col = res.ben[esc.idx] >= 0 ? [22,163,74] as [number,number,number] : [220,38,38] as [number,number,number]
        doc.setTextColor(...col)
        doc.text(fmt2(res.ben[esc.idx]), 130, y + 5, { align: 'right' })
        doc.text(fmtPct(res.rent[esc.idx]), 163, y + 5, { align: 'right' })
        doc.text(fmtPct(res.anual[esc.idx]), 196, y + 5, { align: 'right' })
        doc.setDrawColor(220,220,220); doc.setTextColor(...negro); doc.line(14, y+8, 196, y+8); y += 9
      })

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...gris)
        doc.text('Wallest — Hasu Activos Inmobiliarios SL', 14, 290)
        doc.text(new Date().toLocaleDateString('es-ES'), 196, 290, { align: 'right' })
      }
      doc.save(`${(nombre || 'analisis').replace(/[^a-zA-Z0-9]/g,'-')}-rentabilidad.pdf`)
    })
  }

  const TABS = ['🗂 En radar', '📊 En estudio', '🔍 Scraper']
  const CARD = { background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }
  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' }
  const ESC_UI = [
    { label: 'Conservador', sub: '−15%', pv: pvPes, setPv: setPvPes, idx: 0, color: '#EF4444' },
    { label: 'Realista', sub: 'base', pv: pvReal, setPv: (v: number) => {}, idx: 1, color: '#F59E0B' },
    { label: 'Optimista', sub: '+15%', pv: pvOpt, setPv: setPvOpt, idx: 2, color: '#22C55E' },
  ]

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">Mercado</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
            style={{ background: tab === i ? '#F26E1F' : '#1E1E1E', color: tab === i ? '#fff' : '#888', border: tab === i ? '1px solid #F26E1F' : '1px solid rgba(255,255,255,0.08)' }}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ Tab 0: EN RADAR ═══ */}
      {tab === 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="font-black text-[15px] text-white">En radar ({radar.length})</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>Vistos o recibidos. Sin análisis todavía.</div>
            </div>
            <button onClick={() => setRadarOpen(true)}
              className="text-sm font-black px-3 py-2 rounded-xl text-white"
              style={{ background: '#F26E1F' }}>+ Agregar</button>
          </div>
          {loading ? [1,2,3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            radar.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: '#555' }}>Sin inmuebles en radar todavía</div>
            ) : radar.map(r => (
              <div key={r.id} className="rounded-2xl p-4 mb-2" style={CARD}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-black text-[20px] text-white">{fmt(r.precio || 0)}</div>
                    <div className="text-sm font-medium mt-0.5" style={{ color: '#ccc' }}>{r.direccion}{r.ciudad ? ` · ${r.ciudad}` : ''}</div>
                    <div className="flex gap-3 mt-1">
                      {r.habitaciones > 0 && <span className="text-xs font-medium" style={{ color: '#888' }}>{r.habitaciones} hab</span>}
                      {r.superficie > 0 && <span className="text-xs font-medium" style={{ color: '#888' }}>{r.superficie} m²</span>}
                      {r.fuente && <span className="text-xs font-medium" style={{ color: '#888' }}>{r.fuente}</span>}
                    </div>
                  </div>
                  <button onClick={() => openCalc(r.precio || 0, `${r.direccion}${r.ciudad ? ' · '+r.ciudad : ''}`, r.ciudad)}
                    className="text-xs font-black px-3 py-2 rounded-xl flex-shrink-0 ml-3"
                    style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                    → Calcular
                  </button>
                </div>
                {r.notas && <div className="mt-2 text-xs" style={{ color: '#888' }}>{r.notas}</div>}
              </div>
            ))
          }
        </div>
      )}

      {/* ═══ Tab 1: EN ESTUDIO ═══ */}
      {tab === 1 && (
        <div>
          <div className="font-black text-[15px] text-white mb-1">En estudio ({estudio.length})</div>
          <div className="text-xs font-medium mb-4" style={{ color: '#888' }}>Pasaron por la calculadora. ROI calculado.</div>
          {loading ? [1,2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            estudio.length === 0 ? (
              <div className="text-center py-10 text-sm" style={{ color: '#555' }}>Sin análisis realizados todavía</div>
            ) : estudio.map(e => (
              <div key={e.id} className="rounded-2xl mb-3 overflow-hidden" style={CARD}>
                <div className="p-4">
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-black text-[22px] text-white tracking-tight">{fmt(e.precio_compra || 0)}</div>
                    <button onClick={() => deleteEstudio(e.id)} className="text-xs font-bold px-2.5 py-1.5 rounded-lg ml-2 flex-shrink-0"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                      Eliminar
                    </button>
                  </div>
                  <div className="text-sm font-medium mb-2" style={{ color: '#888' }}>{e.direccion}{e.ciudad ? ` · ${e.ciudad}` : ''}</div>
                  <div className="flex items-center gap-3">
                    <div className="font-black text-sm" style={{ color: '#22C55E' }}>↗ ROI {e.roi_estimado?.toFixed(1)}%</div>
                    <div className="text-xs" style={{ color: '#555' }}>· Venta obj. {fmt(e.precio_venta_objetivo || 0)}</div>
                  </div>
                </div>
                <div className="flex gap-2 px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs font-semibold flex-1" style={{ color: '#888' }}>Analizado {e.analizado_en}</span>
                  <button onClick={() => exportarPDF()}
                    className="text-xs font-black px-3 py-1.5 rounded-lg"
                    style={{ background: '#282828', color: '#ccc', border: '1px solid rgba(255,255,255,0.10)' }}>
                    PDF
                  </button>
                  <button onClick={() => openCalc(e.precio_compra, `${e.direccion}${e.ciudad ? ' · '+e.ciudad : ''}`, e.ciudad, e)}
                    className="text-xs font-black px-3 py-1.5 rounded-lg"
                    style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                    Editar análisis
                  </button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* ═══ Tab 2: SCRAPER ═══ */}
      {tab === 2 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
              <span className="text-xs font-bold font-mono" style={{ color: '#888' }}>IDEALISTA · {SCRAPER_DATA.length} RESULTADOS</span>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: '#1E1E1E', color: '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
              Demo
            </span>
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['Compra','€35k–€120k','+2 hab','Reformar','Almería'].map(f => (
              <span key={f} className="text-xs font-bold px-3 py-1.5 rounded-full" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>{f}</span>
            ))}
          </div>
          {SCRAPER_DATA.map((r, i) => (
            <div key={i} className="rounded-2xl mb-3 overflow-hidden" style={CARD}>
              <div className="p-4">
                <div className="flex justify-between items-start mb-1">
                  <div className="font-black text-[20px] text-white">{fmt(r.precio)}</div>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>{r.tag}</span>
                </div>
                <div className="text-sm font-medium mb-1" style={{ color: '#888' }}>{r.dir} · {r.ciudad}</div>
                <div className="flex gap-3">
                  <span className="text-xs font-medium" style={{ color: '#555' }}>{r.hab} hab</span>
                  <span className="text-xs font-medium" style={{ color: '#555' }}>{r.m2} m²</span>
                  <span className="text-xs font-medium" style={{ color: '#555' }}>€{r.epm}/m²</span>
                </div>
              </div>
              <div className="flex gap-2 px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-xs font-semibold flex-1 self-center" style={{ color: '#888' }}>Scrapeado {r.fecha}</span>
                <button onClick={() => saveScraperToRadar(r)}
                  className="text-xs font-black px-3 py-1.5 rounded-lg"
                  style={{ background: '#282828', color: '#ccc', border: '1px solid rgba(255,255,255,0.10)' }}>
                  + Radar
                </button>
                <button onClick={() => openCalc(r.precio, `${r.dir} · ${r.ciudad}`, r.ciudad)}
                  className="text-xs font-black px-3 py-1.5 rounded-lg"
                  style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                  Calcular →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ═══ FORMULARIO AGREGAR RADAR ═══ */}
      {radarOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setRadarOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', maxWidth: 480, margin: '0 auto' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="flex items-center justify-between mb-5">
                <div className="font-black text-[17px] text-white">Agregar inmueble</div>
                <button onClick={() => setRadarOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección *</label>
                  <input type="text" value={radarForm.direccion} onChange={e => setRadarForm(f => ({ ...f, direccion: e.target.value }))}
                    placeholder="C/ Mayor 4"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                  <input type="text" value={radarForm.ciudad} onChange={e => setRadarForm(f => ({ ...f, ciudad: e.target.value }))}
                    placeholder="Zurgena"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Precio pedido (€) *</label>
                  <input type="number" value={radarForm.precio} onChange={e => setRadarForm(f => ({ ...f, precio: e.target.value }))}
                    placeholder="65000"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium font-mono placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Habitaciones</label>
                  <input type="number" value={radarForm.habitaciones} onChange={e => setRadarForm(f => ({ ...f, habitaciones: e.target.value }))}
                    placeholder="3"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>m²</label>
                  <input type="number" value={radarForm.superficie} onChange={e => setRadarForm(f => ({ ...f, superficie: e.target.value }))}
                    placeholder="85"
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Estado</label>
                  <select value={radarForm.estado} onChange={e => setRadarForm(f => ({ ...f, estado: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                    style={{ ...INP, appearance: 'none' }}>
                    <option value="reformar">A reformar</option>
                    <option value="buen_estado">Buen estado</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Fuente</label>
                  <select value={radarForm.fuente} onChange={e => setRadarForm(f => ({ ...f, fuente: e.target.value }))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                    style={{ ...INP, appearance: 'none' }}>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="Idealista">Idealista</option>
                    <option value="API">API</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas</label>
                  <textarea value={radarForm.notas} onChange={e => setRadarForm(f => ({ ...f, notas: e.target.value }))}
                    placeholder="Observaciones, contacto, condiciones..."
                    rows={2}
                    className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]"
                    style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setRadarOpen(false)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveRadar} disabled={savingRadar || !radarForm.direccion || !radarForm.precio}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{ background: '#F26E1F' }}>
                  {savingRadar ? 'Guardando...' : 'Guardar en radar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ CALCULADORA FULL SCREEN ═══ */}
      {calcOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0A0A0A' }}>
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-[54px]" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setCalcOpen(false)} className="font-black text-xl" style={{ color: '#888' }}>←</button>
            <div className="flex-1 font-black text-[16px] text-white">
              {editingEstudioId ? 'Editar análisis' : 'Calculadora de Rentabilidad'}
            </div>
            <button onClick={exportarPDF} disabled={!res}
              className="text-xs font-black px-3 py-1.5 rounded-lg disabled:opacity-30"
              style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}>
              PDF
            </button>
          </div>

          <div className="p-4 pb-10">
            {/* Nombre y ciudad */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Duración (meses)</label>
                <input type="number" value={duracionMeses || ''} onChange={e => setDuracionMeses(parseFloat(e.target.value) || 12)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
            </div>

            {/* Tabla de gastos */}
            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Gastos estimados y reales</div>
            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#555' }}>Concepto</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#555' }}>Estimado</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#22C55E' }}>Real</div>
              </div>
              {CONCEPTOS_GASTOS.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_80px_80px] px-3 py-2 items-center"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined, background: '#141414' }}>
                  <div className="text-xs font-medium pr-2" style={{ color: '#ccc', lineHeight: 1.3 }}>{c.nombre}</div>
                  <div className="px-1">
                    <input type="number" value={gastos[c.id].estimado || ''}
                      onChange={e => updateGasto(c.id, 'estimado', e.target.value)}
                      className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right"
                      style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.10)', color: '#fff' }}
                      onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="px-1">
                    <input type="number" value={gastos[c.id].real || ''}
                      onChange={e => updateGasto(c.id, 'real', e.target.value)}
                      className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right"
                      style={{ background: '#0A0A0A', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E' }}
                      onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.3)'} />
                  </div>
                </div>
              ))}
              {res && (
                <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2.5" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                  <div className="text-xs font-black uppercase" style={{ color: '#F26E1F' }}>TOTAL INVERSIÓN</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#888' }}>{fmt(res.totalEst)}</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#fff' }}>{fmt(res.totalReal)}</div>
                </div>
              )}
            </div>

            {/* Precio realista + auto-escenarios */}
            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Precio de venta estimado</div>
            <div className="mb-2">
              <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#F59E0B' }}>Realista (base)</label>
              <input type="number" value={pvReal || ''}
                onChange={e => handlePvRealChange(e.target.value)}
                className="w-full rounded-xl px-3 py-3 text-base text-white outline-none font-black font-mono"
                style={{ background: '#1E1E1E', border: '2px solid #F59E0B' }}
                placeholder="Ej: 95000" />
            </div>
            <div className="text-[10px] font-medium mb-3" style={{ color: '#555' }}>
              Los escenarios conservador (−15%) y optimista (+15%) se calculan automáticamente. Podés ajustarlos manualmente.
            </div>
            <div className="grid grid-cols-2 gap-2 mb-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#EF4444' }}>Conservador (−15%)</label>
                <input type="number" value={pvPes || ''}
                  onChange={e => setPvPes(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl px-2 py-2.5 text-sm text-white outline-none font-mono text-center"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(239,68,68,0.4)', color: '#EF4444' }}
                  onFocus={e => e.target.style.borderColor='#EF4444'} onBlur={e => e.target.style.borderColor='rgba(239,68,68,0.4)'} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#22C55E' }}>Optimista (+15%)</label>
                <input type="number" value={pvOpt || ''}
                  onChange={e => setPvOpt(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl px-2 py-2.5 text-sm text-white outline-none font-mono text-center"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(34,197,94,0.4)', color: '#22C55E' }}
                  onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.4)'} />
              </div>
            </div>

            {/* Resultados */}
            {res && (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados por escenario</div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="grid grid-cols-[80px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div />
                    {ESC_UI.map(esc => (
                      <div key={esc.label} className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>
                        {esc.label}<div style={{ fontSize:9, opacity:0.7 }}>{esc.sub}</div>
                      </div>
                    ))}
                  </div>
                  {[
                    { label: 'P. Venta', vals: ESC_UI.map(e => fmt(toNum(e.pv))), colors: ESC_UI.map(() => '#fff') },
                    { label: 'Beneficio', vals: ESC_UI.map((e,i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])), colors: ESC_UI.map((_,i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444') },
                    { label: 'ROI', vals: ESC_UI.map((_,i) => fmtPct(res.rent[i])), colors: ESC_UI.map((_,i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444') },
                    { label: 'ROI anual', vals: ESC_UI.map((_,i) => fmtPct(res.anual[i])), colors: ESC_UI.map((_,i) => res.anual[i] >= 15 ? '#22C55E' : res.anual[i] >= 0 ? '#F59E0B' : '#EF4444') },
                  ].map((row, ri) => (
                    <div key={row.label} className="grid grid-cols-[80px_1fr_1fr_1fr] px-3 py-2.5 items-center"
                      style={{ borderTop: ri > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined, background: '#141414' }}>
                      <div className="text-xs font-bold" style={{ color: '#888' }}>{row.label}</div>
                      {row.vals.map((v, i) => (
                        <div key={i} className="font-black text-xs font-mono text-center" style={{ color: row.colors[i] }}>{v}</div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={guardar} disabled={saving || !res || !!savedId}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ background: savedId ? '#22C55E' : '#F26E1F' }}>
                {saving ? 'Guardando...' : savedId ? '✓ Guardado' : editingEstudioId ? 'Actualizar análisis' : 'Guardar análisis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
