'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmt2 = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2,maximumFractionDigits:2}).format(n)
const fmtPct = (n: number) => (isFinite(n) ? n.toFixed(2) : '0.00') + '%'

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
type Radar = { id: string; precio: number; direccion: string; ciudad: string; habitaciones: number; superficie: number; fuente: string; fecha_recibido: string; estado: string }
type Estudio = { id: string; nombre?: string; precio_compra: number; precio_venta_objetivo: number; roi_estimado: number; direccion: string; ciudad: string; analizado_en: string }

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
    const r = toNum(gastos[c.id].real)
    const e = toNum(gastos[c.id].estimado)
    totalReal += r > 0 ? r : e
  })
  let totalEst = 0
  CONCEPTOS_GASTOS.forEach(c => { totalEst += toNum(gastos[c.id].estimado) })

  if (totalReal <= 0) return null

  const pv = [pvPes, pvReal, pvOpt]
  const ben = pv.map(p => toNum(p) - totalReal)
  const rent = ben.map(b => (b / totalReal) * 100)
  const m = Math.max(1, toNum(meses))
  const anual = rent.map(r => {
    const a = (Math.pow(1 + r / 100, 12 / m) - 1) * 100
    return isFinite(a) ? a : 0
  })

  return { totalEst, totalReal, ben, rent, anual }
}

export default function MercadoPage() {
  const [tab, setTab] = useState(0)
  const [radar, setRadar] = useState<Radar[]>([])
  const [estudio, setEstudio] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [calcOpen, setCalcOpen] = useState(false)

  // Calc state
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
      supabase.from('inmuebles_radar').select('*').eq('estado', 'activo').order('created_at', { ascending: false }),
      supabase.from('inmuebles_estudio').select('*').order('created_at', { ascending: false }),
    ]).then(([r, e]) => {
      setRadar(r.data || [])
      setEstudio(e.data || [])
      setLoading(false)
    })
  }, [])

  const openCalc = (precio: number, addr: string, ciu: string = '') => {
    const g = emptyGastos()
    g.precio_compra.estimado = precio
    setGastos(g)
    setNombre(addr)
    setCiudad(ciu)
    setPvPes(0); setPvReal(Math.round(precio * 1.45)); setPvOpt(0)
    setDuracionMeses(12)
    setSavedId(null)
    setCalcOpen(true)
  }

  const updateGasto = (id: string, tipo: 'estimado' | 'real', val: string) => {
    setGastos(prev => ({ ...prev, [id]: { ...prev[id], [tipo]: parseFloat(val) || 0 } }))
  }

  const res = calcResultados(gastos, pvPes, pvReal, pvOpt, duracionMeses)

  const guardar = async () => {
    if (!res) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('inmuebles_estudio').insert([{
      nombre,
      precio_compra: toNum(gastos.precio_compra.estimado) || toNum(gastos.precio_compra.real),
      precio_venta_objetivo: pvReal || pvOpt || pvPes,
      roi_estimado: res.rent[1] || res.rent[0],
      direccion: nombre,
      ciudad,
      estado: 'en_estudio',
      analizado_en: today,
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setSavedId(data.id)
      setEstudio(e => [data, ...e])
    }
  }

  const exportarPDF = () => {
    if (!res) return
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF()
      const naranja = [230, 126, 34] as [number,number,number]
      const negro = [0, 0, 0] as [number,number,number]
      const gris = [100, 100, 100] as [number,number,number]
      const grisClaro = [240, 240, 240] as [number,number,number]
      let y = 20

      doc.setDrawColor(...naranja); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 8
      doc.setFont('helvetica', 'bold'); doc.setFontSize(28); doc.setTextColor(...negro); doc.text('Wallest', 14, y); y += 8
      doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(...gris); doc.text('Hasu Activos Inmobiliarios SL', 14, y); y += 6
      doc.setDrawColor(...naranja); doc.line(14, y, 196, y); y += 10

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(...negro)
      doc.text(`${nombre || 'Proyecto'} — Calculadora de Rentabilidad`, 14, y); y += 12

      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gris)
      if (ciudad) { doc.text(`Ciudad: ${ciudad}`, 14, y); y += 6 }
      doc.text(`Duración estimada: ${duracionMeses} meses`, 14, y); y += 10

      // Gastos table header
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
      doc.text('Rentabilidad', 163, y + 5.5, { align: 'right' })
      doc.text('Rent. Anual', 196, y + 5.5, { align: 'right' }); y += 8

      const ESCENARIOS = [
        { nombre: 'Pesimista', pv: pvPes, idx: 0 },
        { nombre: 'Realista', pv: pvReal, idx: 1 },
        { nombre: 'Optimista', pv: pvOpt, idx: 2 },
      ]
      doc.setFont('helvetica', 'normal')
      ESCENARIOS.forEach(esc => {
        doc.setTextColor(...negro)
        doc.text(esc.nombre, 16, y + 5)
        doc.text(fmt2(toNum(esc.pv)), 90, y + 5, { align: 'right' })
        const color = res.ben[esc.idx] >= 0 ? [22,163,74] as [number,number,number] : [220,38,38] as [number,number,number]
        doc.setTextColor(...color)
        doc.text(fmt2(res.ben[esc.idx]), 130, y + 5, { align: 'right' })
        doc.text(fmtPct(res.rent[esc.idx]), 163, y + 5, { align: 'right' })
        doc.text(fmtPct(res.anual[esc.idx]), 196, y + 5, { align: 'right' })
        doc.setDrawColor(220,220,220); doc.setTextColor(...negro)
        doc.line(14, y+8, 196, y+8); y += 9
      })

      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...gris)
        doc.text('Wallest — Hasu Activos Inmobiliarios SL', 14, 290)
        doc.text(new Date().toLocaleDateString('es-ES'), 196, 290, { align: 'right' })
      }
      doc.save(`${nombre || 'proyecto'}-rentabilidad.pdf`)
    })
  }

  const TABS = ['🗂 En radar', '📊 En estudio', '🔍 Scraper']
  const CARD = { background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }
  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' }

  const ESCENARIOS = [
    { label: 'Pesimista', pv: pvPes, setPv: setPvPes, idx: 0, color: '#EF4444' },
    { label: 'Realista', pv: pvReal, setPv: setPvReal, idx: 1, color: '#F59E0B' },
    { label: 'Optimista', pv: pvOpt, setPv: setPvOpt, idx: 2, color: '#22C55E' },
  ]

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">Mercado</div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input type="text" defaultValue="Cuevas del Almanzora" placeholder="Zona, municipio…"
          className="flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
          style={{ background: '#141414', border: '1.5px solid rgba(255,255,255,0.08)' }}
          onFocus={e => e.target.style.borderColor = '#F26E1F'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        <button className="px-4 py-3 rounded-xl text-sm font-black text-white" style={{ background: '#F26E1F' }}>Buscar</button>
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

      {/* Tab 0: En radar */}
      {tab === 0 && (
        <div>
          <div className="text-sm font-medium p-3.5 rounded-xl mb-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888', lineHeight: 1.5 }}>
            Inmuebles vistos o recibidos. Sin análisis — guardados para no perder el dato.
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-[15px] text-white">En radar ({radar.length})</div>
            <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Agregar</span>
          </div>
          {loading ? [1,2,3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            radar.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin inmuebles en radar todavía</div>
            ) : radar.map(r => (
              <div key={r.id} className="rounded-2xl p-4 mb-2 flex justify-between items-center" style={CARD}>
                <div>
                  <div className="font-black text-[18px] text-white">{fmt(r.precio || 0)}</div>
                  <div className="text-sm font-medium mt-0.5" style={{ color: '#888' }}>{r.direccion} · {r.habitaciones} hab · {r.superficie}m²</div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: '#555' }}>Recibido {r.fecha_recibido} · {r.fuente}</div>
                </div>
                <button onClick={() => openCalc(r.precio || 0, `${r.direccion} · ${r.ciudad}`, r.ciudad)}
                  className="text-xs font-black px-3 py-1.5 rounded-xl flex-shrink-0 ml-3"
                  style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                  → Calcular
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* Tab 1: En estudio */}
      {tab === 1 && (
        <div>
          <div className="text-sm font-medium p-3.5 rounded-xl mb-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888', lineHeight: 1.5 }}>
            Pasaron por la calculadora. Tienen ROI calculado.
          </div>
          {loading ? [1,2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            estudio.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin análisis realizados todavía</div>
            ) : estudio.map(e => (
              <div key={e.id} className="rounded-2xl mb-3 overflow-hidden" style={CARD}>
                <div className="p-4">
                  <div className="font-black text-[22px] text-white tracking-tight">{fmt(e.precio_compra || 0)}</div>
                  <div className="text-sm font-medium mt-1 mb-3" style={{ color: '#888' }}>{e.direccion}{e.ciudad ? ` · ${e.ciudad}` : ''}</div>
                  <div className="font-black text-sm" style={{ color: '#22C55E' }}>↗ ROI estimado {e.roi_estimado?.toFixed(1)}%</div>
                </div>
                <div className="flex justify-between items-center px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs font-semibold" style={{ color: '#888' }}>Analizado {e.analizado_en}</span>
                  <button onClick={() => openCalc(e.precio_compra, `${e.direccion}${e.ciudad ? ' · '+e.ciudad : ''}`, e.ciudad)}
                    className="text-sm font-black" style={{ color: '#F26E1F' }}>Recalcular →</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Tab 2: Scraper */}
      {tab === 2 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
            <span className="text-xs font-bold font-mono" style={{ color: '#888' }}>IDEALISTA · 24 RESULTADOS · €742/M² PROM.</span>
          </div>
          {[
            { precio: 48000, dir: 'C/ Real 7 · Los Gallardos · 3 hab · 85m²', ciu: 'Los Gallardos' },
            { precio: 95000, dir: 'C/ Constitución 18 · Zurgena · dúplex · 4 hab', ciu: 'Zurgena' },
          ].map((r, i) => (
            <div key={i} className="rounded-2xl mb-3 overflow-hidden" style={CARD}>
              <div className="p-4">
                <div className="font-black text-[22px] text-white tracking-tight">{fmt(r.precio)}</div>
                <div className="text-sm font-medium mt-1 mb-3" style={{ color: '#888' }}>{r.dir}</div>
              </div>
              <div className="flex justify-between items-center px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-xs font-semibold" style={{ color: '#888' }}>Scrapeado hoy</span>
                <button onClick={() => openCalc(r.precio, r.dir, r.ciu)} className="text-sm font-black" style={{ color: '#F26E1F' }}>Calcular →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ===== CALCULADORA FULL SCREEN ===== */}
      {calcOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0A0A0A' }}>
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-[54px]" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setCalcOpen(false)} className="font-black text-xl" style={{ color: '#888' }}>←</button>
            <div className="flex-1 font-black text-[16px] text-white">Calculadora de Rentabilidad</div>
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
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Nombre / Dirección</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ciudad</label>
                <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Duración (meses)</label>
                <input type="number" value={duracionMeses || ''} onChange={e => setDuracionMeses(parseFloat(e.target.value) || 12)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
              </div>
            </div>

            {/* Tabla de gastos */}
            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Gastos estimados y reales</div>
            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              {/* Header */}
              <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#555' }}>Concepto</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#555' }}>Estimado</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#555' }}>Real</div>
              </div>
              {CONCEPTOS_GASTOS.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_80px_80px] px-3 py-2 items-center"
                  style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined, background: '#141414' }}>
                  <div className="text-xs font-medium pr-2" style={{ color: '#ccc', lineHeight: 1.3 }}>{c.nombre}</div>
                  <div className="px-1">
                    <input type="number" value={gastos[c.id].estimado || ''}
                      onChange={e => updateGasto(c.id, 'estimado', e.target.value)}
                      className="w-full rounded-lg px-1.5 py-1.5 text-xs text-white outline-none font-mono text-right"
                      style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.10)', color: '#fff' }}
                      onFocus={e => e.target.style.borderColor = '#F26E1F'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="px-1">
                    <input type="number" value={gastos[c.id].real || ''}
                      onChange={e => updateGasto(c.id, 'real', e.target.value)}
                      className="w-full rounded-lg px-1.5 py-1.5 text-xs text-white outline-none font-mono text-right"
                      style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.10)', color: '#22C55E' }}
                      onFocus={e => e.target.style.borderColor = '#22C55E'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
                  </div>
                </div>
              ))}
              {/* Total */}
              {res && (
                <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2.5" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                  <div className="text-xs font-black uppercase" style={{ color: '#F26E1F' }}>TOTAL INVERSIÓN</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#888' }}>{fmt(res.totalEst)}</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#fff' }}>{fmt(res.totalReal)}</div>
                </div>
              )}
            </div>

            {/* Escenarios */}
            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Precios de venta por escenario</div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              {ESCENARIOS.map(esc => (
                <div key={esc.label}>
                  <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5 text-center" style={{ color: esc.color }}>{esc.label}</label>
                  <input type="number" value={esc.pv || ''}
                    onChange={e => esc.setPv(parseFloat(e.target.value) || 0)}
                    className="w-full rounded-xl px-2 py-2.5 text-sm text-white outline-none font-mono text-center"
                    style={INP}
                    onFocus={e => e.target.style.borderColor = esc.color}
                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
                </div>
              ))}
            </div>

            {/* Resultados por escenario */}
            {res && (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados</div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="grid grid-cols-[80px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#555' }}></div>
                    {ESCENARIOS.map(esc => (
                      <div key={esc.label} className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>{esc.label}</div>
                    ))}
                  </div>
                  {[
                    { label: 'Precio venta', vals: ESCENARIOS.map(e => fmt(toNum(e.pv))), colors: ESCENARIOS.map(() => '#fff') },
                    { label: 'Beneficio', vals: ESCENARIOS.map((e,i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])), colors: ESCENARIOS.map((e,i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444') },
                    { label: 'ROI', vals: ESCENARIOS.map((_,i) => fmtPct(res.rent[i])), colors: ESCENARIOS.map((_,i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444') },
                    { label: 'ROI anual', vals: ESCENARIOS.map((_,i) => fmtPct(res.anual[i])), colors: ESCENARIOS.map((_,i) => res.anual[i] >= 15 ? '#22C55E' : res.anual[i] >= 0 ? '#F59E0B' : '#EF4444') },
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
                {saving ? 'Guardando...' : savedId ? '✓ Guardado en estudio' : 'Guardar análisis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
