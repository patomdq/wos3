'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  CHECKLIST_ITEMS,
  ChecklistDocumentacion,
  ChecklistItemEstado,
  getItemEstado,
  getBloqueantesPendientes,
  getAlertasConfirmadas,
} from '@/lib/checklist-documentacion'

// ─── Tipos ────────────────────────────────────────────────
type Gastos = Record<string, { estimado: number; real: number }>
type JvJugador = { id: string; nombre: string; rol: 'gestor' | 'inversor' | 'mixto'; gestorPct?: number; capital: number }

type Unidad = {
  id: string
  inmueble_id: string
  tipo: string
  planta?: string
  superficie?: number
  origen: string
  ocupacion: string
  renta_mensual?: number
  precio_venta_est?: number
  reforma_estimada?: number
  notas?: string
}

// ─── Constantes ───────────────────────────────────────────
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

function emptyGastos(): Gastos {
  const g: Gastos = {}
  CONCEPTOS_GASTOS.forEach(c => { g[c.id] = { estimado: 0, real: 0 } })
  return g
}

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return isNaN(v) || !isFinite(v) ? 0 : v
  const n = parseFloat(String(v).replace(/€/g, '').replace(/\s/g, '').replace(/\./g, '').replace(/,/g, '.'))
  return isNaN(n) || !isFinite(n) ? 0 : n
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtPct = (n: number) => (isFinite(n) ? n.toFixed(2) : '0.00') + '%'
const today = () => new Date().toISOString().split('T')[0]

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
  const anual: (number | null)[] = meses > 0
    ? rent.map(r => (Math.pow(1 + r / 100, 12 / meses) - 1) * 100)
    : [null, null, null]
  return { totalEst, totalReal, ben, rent, anual }
}

function calcJvReparto(jugadores: JvJugador[], beneficio: number | null, meses: number) {
  const fracGestor = (j: JvJugador) => j.rol === 'gestor' ? 1 : j.rol === 'inversor' ? 0 : (j.gestorPct ?? 50) / 100
  const fracInversor = (j: JvJugador) => 1 - fracGestor(j)
  const capitalTotal = jugadores.reduce((s, j) => s + j.capital, 0)
  const totalFracGestor = jugadores.reduce((s, j) => s + fracGestor(j), 0)
  const capitalInversores = jugadores.reduce((s, j) => s + j.capital * fracInversor(j), 0)
  return jugadores.map(j => {
    const poolPctGestor = totalFracGestor > 0 ? 0.5 * (fracGestor(j) / totalFracGestor) : 0
    const poolPctInversor = capitalInversores > 0 ? 0.5 * ((j.capital * fracInversor(j)) / capitalInversores) : 0
    const poolPct = poolPctGestor + poolPctInversor
    const jBeneficio = beneficio !== null ? poolPct * beneficio : null
    const roi = (jBeneficio !== null && j.capital > 0) ? (jBeneficio / j.capital) * 100 : null
    const roiAnual = (roi !== null && meses > 0) ? (Math.pow(1 + roi / 100, 12 / meses) - 1) * 100 : null
    const pctCapital = capitalTotal > 0 ? (j.capital / capitalTotal) * 100 : null
    const pctBeneficio = poolPct * 100
    return { ...j, beneficio: jBeneficio, roi, roiAnual, pctCapital, pctBeneficio }
  })
}

function calcJvBono(jugadores: JvJugador[], excedente: number, pctGestor: number, pctInversor: number) {
  const fracGestor = (j: JvJugador) => j.rol === 'gestor' ? 1 : j.rol === 'inversor' ? 0 : (j.gestorPct ?? 50) / 100
  const fracInversor = (j: JvJugador) => 1 - fracGestor(j)
  const totalFracGestor = jugadores.reduce((s, j) => s + fracGestor(j), 0)
  const capitalInversores = jugadores.reduce((s, j) => s + j.capital * fracInversor(j), 0)
  return jugadores.map(j => {
    const poolPctGestor = totalFracGestor > 0 ? (pctGestor / 100) * (fracGestor(j) / totalFracGestor) : 0
    const poolPctInversor = capitalInversores > 0 ? (pctInversor / 100) * ((j.capital * fracInversor(j)) / capitalInversores) : 0
    const poolPct = poolPctGestor + poolPctInversor
    return { ...j, bono: poolPct * excedente, pctBono: poolPct * 100 }
  })
}

// ─── Props ────────────────────────────────────────────────
interface Props {
  inmuebleId: string
  tipologia: string
  onSaved?: () => void
}

// ─── Componente ───────────────────────────────────────────
export default function InmuebleCalculadora({ inmuebleId, tipologia: tipologiaProp, onSaved }: Props) {
  const [loading, setLoading] = useState(true)

  // Estado de la calculadora
  const [tituloEstudio, setTituloEstudio] = useState('')
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [notasEstudio, setNotasEstudio] = useState('')
  const [urlEstudio, setUrlEstudio] = useState('')
  const [duracionMeses, setDuracionMeses] = useState(0)
  const [gastos, setGastos] = useState<Gastos>(emptyGastos)
  const [pvPes, setPvPes] = useState(0)
  const [pvReal, setPvReal] = useState(0)
  const [pvOpt, setPvOpt] = useState(0)
  const [calcTipologia, setCalcTipologia] = useState(tipologiaProp)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Multi-estrategia
  const [unidadesEst, setUnidadesEst] = useState(1)
  const [costoRefUnidad, setCostoRefUnidad] = useState(0)
  const [pvPorUnidad, setPvPorUnidad] = useState(0)
  const [alqUnidad, setAlqUnidad] = useState(0)
  const [reformaMin, setReformaMin] = useState(0)
  const [alqMensual, setAlqMensual] = useState(0)
  const [pvRentando, setPvRentando] = useState(0)
  const [feeInbruto, setFeeInbruto] = useState(0)
  const [feeGestionObra, setFeeGestionObra] = useState(0)

  // JV
  const [jvModo, setJvModo] = useState<'solo' | 'jv'>('solo')
  const [jvJugadores, setJvJugadores] = useState<JvJugador[]>([])
  const [jvBonoPctGestor, setJvBonoPctGestor] = useState(60)
  const [jvBonoPctInversor, setJvBonoPctInversor] = useState(40)
  const [jvBonoBeneficioCcp, setJvBonoBeneficioCcp] = useState(0)
  const [jvBonoBeneficioFinal, setJvBonoBeneficioFinal] = useState(0)
  const [jvBonoLiquidacion, setJvBonoLiquidacion] = useState('')

  // Checklist
  const [checklistDoc, setChecklistDoc] = useState<ChecklistDocumentacion>({})

  // Unidades edificio
  const [unidadesCalc, setUnidadesCalc] = useState<Unidad[]>([])
  const [unidadesOpen, setUnidadesOpen] = useState(false)

  // ─── Cargar datos ──────────────────────────────────────
  useEffect(() => {
    supabase.from('inmuebles').select('*').eq('id', inmuebleId).single().then(({ data: item }) => {
      if (!item) { setLoading(false); return }
      const g = item.gastos_json
        ? { ...emptyGastos(), ...item.gastos_json }
        : (() => { const eg = emptyGastos(); eg.precio_compra.estimado = item.precio_compra || 0; return eg })()
      setGastos(g)
      setTituloEstudio(item.titulo || '')
      setNotasEstudio(item.notas || '')
      setUrlEstudio(item.url || '')
      setNombre(item.titulo || item.direccion || '')
      setCiudad(item.ciudad || '')
      setPvPes(item.precio_venta_conservador || 0)
      setPvReal(item.precio_venta_realista || 0)
      setPvOpt(item.precio_venta_optimista || 0)
      setDuracionMeses(item.duracion_meses || 0)
      setCalcTipologia(item.tipologia || tipologiaProp)
      setUnidadesEst(item.unidades_estimadas ?? 1)
      setCostoRefUnidad(item.costo_reforma_por_unidad ?? 0)
      setPvPorUnidad(item.precio_venta_por_unidad ?? 0)
      setAlqUnidad(item.alquiler_estimado_unidad ?? 0)
      setReformaMin(item.reforma_minima_estimada ?? 0)
      setAlqMensual(item.alquiler_mensual_estimado ?? 0)
      setPvRentando(item.precio_venta_rentando ?? 0)
      setFeeInbruto(item.fee_inbruto_estimado ?? 0)
      setFeeGestionObra(item.fee_gestion_obra_estimado ?? 0)
      const jugadoresIniciales = item.jv_jugadores && item.jv_jugadores.length > 0 ? item.jv_jugadores : []
      setJvJugadores(jugadoresIniciales)
      setJvModo(jugadoresIniciales.length > 0 ? 'jv' : 'solo')
      setJvBonoPctGestor(item.jv_bono_pct_gestor ?? 60)
      setJvBonoPctInversor(item.jv_bono_pct_inversor ?? 40)
      setJvBonoBeneficioCcp(item.jv_bono_beneficio_ccp ?? 0)
      setJvBonoBeneficioFinal(item.jv_bono_beneficio_final ?? 0)
      setJvBonoLiquidacion(item.jv_bono_liquidacion || '')
      setChecklistDoc(item.checklist_documentacion || {})
      setSavedId(null)
      // Cargar unidades si edificio
      if (item.tipologia === 'edificio') {
        supabase.from('inmueble_unidades').select('*').eq('inmueble_id', item.id).order('created_at').then(({ data }) => {
          if (data) setUnidadesCalc(data)
        })
      }
      setLoading(false)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inmuebleId])

  // ─── Handlers ─────────────────────────────────────────
  const updateGasto = (id: string, tipo: 'estimado' | 'real', val: string) => {
    setGastos(prev => ({ ...prev, [id]: { ...prev[id], [tipo]: parseFloat(val) || 0 } }))
    setSavedId(null)
  }

  const jvSetInversionTotal = (val: string) => {
    const nuevoTotal = parseFloat(val) || 0
    const otrosGastos = CONCEPTOS_GASTOS.filter(c => c.id !== 'precio_compra').reduce((s, c) => {
      const r = toNum(gastos[c.id].real); const e = toNum(gastos[c.id].estimado)
      return s + (r > 0 ? r : e)
    }, 0)
    const pcReal = toNum(gastos['precio_compra'].real)
    const tipo: 'estimado' | 'real' = pcReal > 0 ? 'real' : 'estimado'
    updateGasto('precio_compra', tipo, String(Math.max(0, nuevoTotal - otrosGastos)))
  }

  const addJugador = () => {
    setJvJugadores(prev => [...prev, { id: `${Date.now()}-${prev.length}`, nombre: '', rol: prev.length === 0 ? 'gestor' : 'inversor', capital: 0 }])
    setSavedId(null)
  }
  const removeJugador = (id: string) => { setJvJugadores(prev => prev.filter(j => j.id !== id)); setSavedId(null) }
  const setBonoPctGestor = (val: string) => { const n = Math.max(0, Math.min(100, parseFloat(val) || 0)); setJvBonoPctGestor(n); setJvBonoPctInversor(100 - n); setSavedId(null) }
  const setBonoPctInversor = (val: string) => { const n = Math.max(0, Math.min(100, parseFloat(val) || 0)); setJvBonoPctInversor(n); setJvBonoPctGestor(100 - n); setSavedId(null) }
  const updateJugador = (id: string, campo: keyof JvJugador, val: string) => {
    setJvJugadores(prev => prev.map(j => {
      if (j.id !== id) return j
      if (campo === 'nombre') return { ...j, nombre: val }
      if (campo === 'rol') return { ...j, rol: val as JvJugador['rol'], gestorPct: val === 'mixto' ? (j.gestorPct ?? 50) : undefined }
      if (campo === 'gestorPct') return { ...j, gestorPct: Math.max(0, Math.min(100, parseFloat(val) || 0)) }
      return { ...j, capital: parseFloat(val) || 0 }
    }))
    setSavedId(null)
  }
  const setChecklistItem = (key: string, estado: ChecklistItemEstado | 'pendiente') => {
    setChecklistDoc(prev => {
      const items = { ...(prev.items || {}) }
      if (estado === 'pendiente') delete items[key]
      else items[key] = estado
      return { ...prev, items }
    })
    setSavedId(null)
  }
  const setChecklistNota = (key: string, nota: string) => {
    setChecklistDoc(prev => ({ ...prev, notas: { ...(prev.notas || {}), [key]: nota } }))
    setSavedId(null)
  }

  const guardar = async () => {
    if (!res) return
    setSaving(true)
    const payload: Record<string, unknown> = {
      titulo: tituloEstudio || null,
      direccion: nombre,
      ciudad: ciudad || null,
      precio_compra: toNum(gastos.precio_compra.estimado) || toNum(gastos.precio_compra.real),
      precio_venta_conservador: pvPes || null,
      precio_venta_realista: pvReal || null,
      precio_venta_optimista: pvOpt || null,
      roi_estimado: res.rent[1] || res.rent[0],
      notas: notasEstudio || null,
      url: urlEstudio || null,
      duracion_meses: duracionMeses || null,
      gastos_json: gastos,
      analizado_en: today(),
      unidades_estimadas: unidadesEst || 1,
      costo_reforma_por_unidad: costoRefUnidad || null,
      precio_venta_por_unidad: pvPorUnidad || null,
      alquiler_estimado_unidad: alqUnidad || null,
      reforma_minima_estimada: reformaMin || null,
      alquiler_mensual_estimado: alqMensual || null,
      precio_venta_rentando: pvRentando || null,
      fee_inbruto_estimado: feeInbruto || null,
      fee_gestion_obra_estimado: feeGestionObra || null,
      jv_jugadores: jvModo === 'jv' ? jvJugadores : [],
      jv_bono_pct_gestor: jvModo === 'jv' ? jvBonoPctGestor : null,
      jv_bono_pct_inversor: jvModo === 'jv' ? jvBonoPctInversor : null,
      jv_bono_beneficio_ccp: jvModo === 'jv' ? (jvBonoBeneficioCcp || null) : null,
      jv_bono_beneficio_final: jvModo === 'jv' ? (jvBonoBeneficioFinal || null) : null,
      jv_bono_liquidacion: jvModo === 'jv' ? (jvBonoLiquidacion || null) : null,
      checklist_documentacion: checklistDoc,
    }
    const { data, error } = await supabase.from('inmuebles').update(payload).eq('id', inmuebleId).select().single()
    setSaving(false)
    if (error) { alert(`Error al guardar: ${error.message}`); return }
    if (data) {
      setSavedId(data.id)
      onSaved?.()
    }
  }

  // ─── Variables derivadas ───────────────────────────────
  const res = calcResultados(gastos, pvPes, pvReal, pvOpt, duracionMeses)
  const precioCompraVal = toNum(gastos.precio_compra.real) || toNum(gastos.precio_compra.estimado)
  const gastosSimples = precioCompraVal * 0.02 + 1000

  const caavBen = res ? pvReal - res.totalReal : null
  const caavRoi = (res && res.totalReal > 0) ? (caavBen! / res.totalReal) * 100 : null

  const patReformaTotal = unidadesEst * costoRefUnidad
  const patPvTotal = unidadesEst * pvPorUnidad
  const patCost = precioCompraVal + patReformaTotal + gastosSimples
  const patBen = (pvPorUnidad > 0 && precioCompraVal > 0) ? patPvTotal - patCost : null
  const patRoi = (patBen !== null && patCost > 0) ? (patBen / patCost) * 100 : null
  const roiBrutoInversor = (alqUnidad > 0 && pvPorUnidad > 0) ? (alqUnidad * 12 / pvPorUnidad) * 100 : null

  const alqCost = precioCompraVal + reformaMin + gastosSimples
  const roiAlqAnual = (alqMensual > 0 && alqCost > 0) ? (alqMensual * 12 / alqCost) * 100 : null
  const benVentaRentando = (pvRentando > 0 && precioCompraVal > 0) ? pvRentando - alqCost : null
  const roiVentaRentando = (benVentaRentando !== null && alqCost > 0) ? (benVentaRentando / alqCost) * 100 : null

  const inbrutoBen = (feeInbruto > 0 || feeGestionObra > 0) ? feeInbruto + feeGestionObra : null

  const jvFracGestor = (j: JvJugador) => j.rol === 'gestor' ? 1 : j.rol === 'inversor' ? 0 : (j.gestorPct ?? 50) / 100
  const jvFracInversor = (j: JvJugador) => 1 - jvFracGestor(j)
  const jvCapitalTotal = jvJugadores.reduce((s, j) => s + j.capital, 0)
  const jvGestores = jvJugadores.filter(j => jvFracGestor(j) > 0)
  const jvInversores = jvJugadores.filter(j => jvFracInversor(j) > 0)
  const jvCapitalInversores = jvJugadores.reduce((s, j) => s + j.capital * jvFracInversor(j), 0)
  const jvResultados = calcJvReparto(jvJugadores, caavBen, duracionMeses)

  const semaforoColor = (roi: number | null) => {
    if (roi === null) return '#CCC'
    if (roi >= 50) return '#22C55E'
    if (roi >= 30) return '#F59E0B'
    return '#EF4444'
  }
  const semaforoEmoji = (roi: number | null) => roi === null ? '⬜' : roi >= 50 ? '🟢' : roi >= 30 ? '🟡' : '🔴'

  const escenarios = [
    { id: 'caav', nombre: 'CAAV', subtitulo: 'Compra → Reforma → Venta', ben: caavBen, roi: caavRoi, extras: null },
    { id: 'patrimonio', nombre: 'PatrimonioIN', subtitulo: 'Fraccionamiento', ben: patBen, roi: patRoi, extras: roiBrutoInversor !== null ? `ROI bruto inversor: ${roiBrutoInversor.toFixed(1)}%` : null },
    { id: 'alquiler', nombre: 'Alquiler', subtitulo: 'Activo rentando', ben: benVentaRentando, roi: roiVentaRentando ?? roiAlqAnual, extras: roiAlqAnual !== null ? `Yield bruto: ${roiAlqAnual.toFixed(1)}%/año` : null },
    { id: 'inbruto', nombre: 'INbruto', subtitulo: 'Venta del deal', ben: inbrutoBen, roi: null, extras: null },
  ]
  const mejorEscenario = escenarios.reduce((best, esc) => {
    if (esc.ben === null) return best
    if (best === null || esc.ben > (best.ben ?? -Infinity)) return esc
    return best
  }, null as typeof escenarios[0] | null)

  const INP_L = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333' }
  const ESC_UI = [
    { label: 'Conservador', pv: pvPes, idx: 0, color: '#EF4444' },
    { label: 'Realista', pv: pvReal, idx: 1, color: '#F59E0B' },
    { label: 'Optimista', pv: pvOpt, idx: 2, color: '#22C55E' },
  ]

  // ─── Render ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="p-6 text-center rounded-2xl" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
        <div className="text-sm" style={{ color: '#bbb' }}>Cargando calculadora…</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#F5F4F0', borderRadius: 16, padding: 0 }}>
      <div className="p-4 pb-10">
        {/* Metadatos */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="col-span-2">
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
            <input type="text" value={tituloEstudio} onChange={e => { setTituloEstudio(e.target.value); setSavedId(null) }} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
          <div className="col-span-2">
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
            <input type="text" value={nombre} onChange={e => { setNombre(e.target.value); setSavedId(null) }} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
            <input type="text" value={ciudad} onChange={e => { setCiudad(e.target.value); setSavedId(null) }} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#A6855A' }}>Duración (meses) *</label>
            <input type="number" value={duracionMeses || ''} onChange={e => { setDuracionMeses(parseFloat(e.target.value) || 0); setSavedId(null) }} placeholder="ej: 6" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
        </div>

        {/* Gastos */}
        <div className="text-[12px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Gastos estimados y reales</div>
        <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #ECEAE4' }}>
          <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
            <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Concepto</div>
            <div className="text-[12px] font-black uppercase tracking-wide text-center" style={{ color: '#888' }}>Estimado</div>
            <div className="text-[12px] font-black uppercase tracking-wide text-center" style={{ color: '#22C55E' }}>Real</div>
          </div>
          {CONCEPTOS_GASTOS.map((c, i) => (
            <div key={c.id} className="grid grid-cols-[1fr_80px_80px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid #F0EEE8' : undefined, background: '#fff' }}>
              <div className="text-xs font-medium pr-2" style={{ color: '#444', lineHeight: 1.3 }}>{c.nombre}</div>
              <div className="px-1"><input type="number" value={gastos[c.id].estimado || ''} onChange={e => updateGasto(c.id, 'estimado', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4', color: '#333' }} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} /></div>
              <div className="px-1"><input type="number" value={gastos[c.id].real || ''} onChange={e => updateGasto(c.id, 'real', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid rgba(34,197,94,0.4)', color: '#22C55E' }} onFocus={e => e.target.style.borderColor = '#22C55E'} onBlur={e => e.target.style.borderColor = 'rgba(34,197,94,0.4)'} /></div>
            </div>
          ))}
          {res && (
            <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2.5" style={{ background: '#ECEAE4', borderTop: '1px solid #E2E0D8' }}>
              <div className="text-xs font-black uppercase" style={{ color: '#A6855A' }}>TOTAL INVERSIÓN</div>
              <div className="text-xs font-black font-mono text-right" style={{ color: '#666' }}>{fmt(res.totalEst)}</div>
              <div className="text-xs font-black font-mono text-right" style={{ color: '#333' }}>{fmt(res.totalReal)}</div>
            </div>
          )}
        </div>

        {/* Precios de venta */}
        <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Precio de venta por escenario</div>
        <div className="grid grid-cols-3 gap-2 mb-5">
          <div>
            <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#EF4444' }}>Conservador</label>
            <input type="number" value={pvPes || ''} onChange={e => { setPvPes(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FEF2F2', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444' }} onFocus={e => e.target.style.borderColor = '#EF4444'} onBlur={e => e.target.style.borderColor = 'rgba(239,68,68,0.3)'} placeholder="€" />
          </div>
          <div>
            <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#F59E0B' }}>Realista</label>
            <input type="number" value={pvReal || ''} onChange={e => { setPvReal(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FFFBEB', border: '1.5px solid rgba(245,158,11,0.3)', color: '#D97706' }} onFocus={e => e.target.style.borderColor = '#F59E0B'} onBlur={e => e.target.style.borderColor = 'rgba(245,158,11,0.3)'} placeholder="€" />
          </div>
          <div>
            <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#22C55E' }}>Optimista</label>
            <input type="number" value={pvOpt || ''} onChange={e => { setPvOpt(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#F0FDF4', border: '1.5px solid rgba(34,197,94,0.3)', color: '#16A34A' }} onFocus={e => e.target.style.borderColor = '#22C55E'} onBlur={e => e.target.style.borderColor = 'rgba(34,197,94,0.3)'} placeholder="€" />
          </div>
        </div>

        {/* Unidades edificio */}
        {calcTipologia === 'edificio' && (
          <div className="mb-5">
            <button onClick={() => setUnidadesOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
              <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Unidades del edificio {unidadesCalc.length > 0 ? `(${unidadesCalc.length})` : ''}</span>
              <span style={{ color: '#aaa' }}>{unidadesOpen ? '▲' : '▼'}</span>
            </button>
            {unidadesOpen && (
              <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #ECEAE4' }}>
                {unidadesCalc.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs" style={{ color: '#aaa' }}>Sin unidades. Agregalas desde el chat WOS3.</div>
                ) : (
                  <>
                    <div className="grid grid-cols-[1fr_60px_70px_70px] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                      <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Unidad</div>
                      <div className="text-[12px] font-black uppercase tracking-wide text-center" style={{ color: '#888' }}>m²</div>
                      <div className="text-[12px] font-black uppercase tracking-wide text-right" style={{ color: '#A6855A' }}>Reforma</div>
                      <div className="text-[12px] font-black uppercase tracking-wide text-right" style={{ color: '#22C55E' }}>P. Venta Est.</div>
                    </div>
                    {unidadesCalc.map((u, i) => (
                      <div key={u.id} className="grid grid-cols-[1fr_60px_70px_70px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid #F0EEE8' : undefined, background: '#fff' }}>
                        <div className="text-xs font-medium" style={{ color: '#444' }}>{u.tipo}{u.planta ? ` P${u.planta}` : ''}</div>
                        <div className="text-xs font-mono text-center" style={{ color: '#888' }}>{u.superficie || '—'}</div>
                        <div className="text-xs font-mono text-right" style={{ color: '#A6855A' }}>{u.reforma_estimada ? fmt(u.reforma_estimada) : '—'}</div>
                        <div className="text-xs font-black font-mono text-right" style={{ color: '#22C55E' }}>{u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}</div>
                      </div>
                    ))}
                    <div className="grid grid-cols-[1fr_60px_70px_70px] px-3 py-2" style={{ background: '#ECEAE4', borderTop: '1px solid #E2E0D8' }}>
                      <div className="text-xs font-black uppercase" style={{ color: '#A6855A' }}>TOTAL</div>
                      <div />
                      <div className="text-xs font-black font-mono text-right" style={{ color: '#A6855A' }}>{fmt(unidadesCalc.reduce((s, u) => s + (u.reforma_estimada || 0), 0))}</div>
                      <div className="text-xs font-black font-mono text-right" style={{ color: '#22C55E' }}>{fmt(unidadesCalc.reduce((s, u) => s + (u.precio_venta_est || 0), 0))}</div>
                    </div>
                    {unidadesCalc.some(u => u.reforma_estimada) && (
                      <div className="px-3 py-2.5" style={{ borderTop: '1px solid #E2E0D8', background: '#fff' }}>
                        <button
                          onClick={() => updateGasto('reforma', 'estimado', String(unidadesCalc.reduce((s, u) => s + (u.reforma_estimada || 0), 0)))}
                          className="w-full text-xs font-black py-2 rounded-lg"
                          style={{ background: 'rgba(166,133,90,0.1)', color: '#A6855A', border: '1px solid rgba(166,133,90,0.3)' }}
                        >
                          Aplicar suma ({fmt(unidadesCalc.reduce((s, u) => s + (u.reforma_estimada || 0), 0))}) al gasto de Reforma
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Link y notas */}
        <div className="grid grid-cols-1 gap-3 mb-5">
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link fuente</label>
            <input type="url" value={urlEstudio} onChange={e => { setUrlEstudio(e.target.value); setSavedId(null) }} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Observaciones</label>
            <textarea value={notasEstudio} onChange={e => { setNotasEstudio(e.target.value); setSavedId(null) }} placeholder="Notas, condiciones, contacto..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor = '#A6855A'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
          </div>
        </div>

        {/* Resultados por escenario */}
        {res && (
          <>
            <div className="text-[12px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados por escenario</div>
            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #ECEAE4' }}>
              <div className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                <div />
                {ESC_UI.map(esc => <div key={esc.label} className="text-[12px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>{esc.label}</div>)}
              </div>
              {[
                { label: 'P. Venta', vals: ESC_UI.map(e => fmt(toNum(e.pv))), colors: ESC_UI.map(() => '#333'), bold: false },
                { label: 'Gastos totales', vals: ESC_UI.map(() => fmt(res.totalReal)), colors: ESC_UI.map(() => '#666'), bold: false },
                { label: 'Beneficio', vals: ESC_UI.map((_, i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])), colors: ESC_UI.map((_, i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444'), bold: true },
                { label: 'ROI oper.', vals: ESC_UI.map((_, i) => fmtPct(res.rent[i])), colors: ESC_UI.map((_, i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444'), bold: true },
                { label: `ROI anual${duracionMeses > 0 ? ` (${duracionMeses}m)` : ''}`, vals: ESC_UI.map((_, i) => res.anual[i] !== null ? fmtPct(res.anual[i]!) : '—'), colors: ESC_UI.map((_, i) => res.anual[i] === null ? '#aaa' : res.anual[i]! >= 15 ? '#22C55E' : res.anual[i]! >= 0 ? '#F59E0B' : '#EF4444'), bold: true },
              ].map((row, ri) => (
                <div key={row.label} className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2.5 items-center" style={{ borderTop: ri > 0 ? '1px solid #F0EEE8' : undefined, background: ri === 1 ? '#FAFAF8' : '#fff' }}>
                  <div className="text-xs" style={{ color: '#888', fontWeight: row.bold ? 700 : 500 }}>{row.label}</div>
                  {row.vals.map((v, i) => <div key={i} className="text-xs font-mono text-center" style={{ color: row.colors[i], fontWeight: row.bold ? 800 : 500 }}>{v}</div>)}
                </div>
              ))}
            </div>
          </>
        )}

        {/* Multi-estrategia */}
        <div className="mb-2 mt-2">
          <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Análisis multi-estrategia</div>

          {/* PatrimonioIN */}
          <div className="rounded-xl p-4 mb-3" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
            <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#6366F1' }}>PatrimonioIN — Fraccionamiento</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Unidades estimadas</label>
                <input type="number" min="1" value={unidadesEst || ''} onChange={e => { setUnidadesEst(parseInt(e.target.value) || 1); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono text-center" style={INP_L} onFocus={e => e.target.style.borderColor = '#6366F1'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Reforma por unidad (€)</label>
                <input type="number" value={costoRefUnidad || ''} onChange={e => { setCostoRefUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#6366F1'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>P. venta por unidad (€)</label>
                <input type="number" value={pvPorUnidad || ''} onChange={e => { setPvPorUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#6366F1'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Alquiler por unidad/mes (€)</label>
                <input type="number" value={alqUnidad || ''} onChange={e => { setAlqUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#6366F1'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€ (para ROI inversor)" />
              </div>
            </div>
          </div>

          {/* Alquiler directo */}
          <div className="rounded-xl p-4 mb-3" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
            <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#0EA5E9' }}>Alquiler directo</div>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Reforma mínima (€)</label>
                <input type="number" value={reformaMin || ''} onChange={e => { setReformaMin(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#0EA5E9'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Alquiler mensual (€)</label>
                <input type="number" value={alqMensual || ''} onChange={e => { setAlqMensual(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#0EA5E9'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€/mes" />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>P. venta ya rentando (€) — opcional</label>
                <input type="number" value={pvRentando || ''} onChange={e => { setPvRentando(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#0EA5E9'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€ si se vende con inquilino" />
              </div>
            </div>
          </div>

          {/* INbruto */}
          <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
            <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#F59E0B' }}>INbruto — Venta del deal</div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Fee INbruto (€)</label>
                <input type="number" value={feeInbruto || ''} onChange={e => { setFeeInbruto(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#F59E0B'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="ref: 4.000–6.000€" />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Fee gestión obra (€)</label>
                <input type="number" value={feeGestionObra || ''} onChange={e => { setFeeGestionObra(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#F59E0B'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="ref: 2.000€+" />
              </div>
            </div>
          </div>

          {/* JV / Gestor */}
          <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#A855F7' }}>JV / Gestor — Reparto entre partes</div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #ECEAE4' }}>
                <button onClick={() => { setJvModo('solo'); setSavedId(null) }} className="text-[12px] font-black uppercase px-2.5 py-1.5" style={{ background: jvModo === 'solo' ? '#A855F7' : '#fff', color: jvModo === 'solo' ? '#fff' : '#888' }}>Solo HASU</button>
                <button onClick={() => { setJvModo('jv'); setSavedId(null) }} className="text-[12px] font-black uppercase px-2.5 py-1.5" style={{ background: jvModo === 'jv' ? '#A855F7' : '#fff', color: jvModo === 'jv' ? '#fff' : '#888' }}>Joint Venture</button>
              </div>
            </div>

            {jvModo === 'jv' && (
              <>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Inversión total (€)</label>
                    <input type="number" value={res ? Math.round(res.totalReal) : ''} onChange={e => jvSetInversionTotal(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#A855F7'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Tiempo (meses)</label>
                    <input type="number" value={duracionMeses || ''} onChange={e => { setDuracionMeses(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#A855F7'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="ej: 6" />
                  </div>
                </div>
                <div className="text-[12px] font-medium mb-3" style={{ color: '#888', lineHeight: 1.4 }}>
                  Regla fija: <b style={{ color: '#A855F7' }}>50% del beneficio</b> para gestores (en partes iguales entre ellos, sin importar su capital) · <b style={{ color: '#A855F7' }}>50%</b> para inversores (a prorrata de su capital aportado)
                </div>
                {jvJugadores.length === 0 ? (
                  <div className="text-center py-4 text-xs" style={{ color: '#aaa' }}>Sin jugadores. Agregá HASU y los inversores.</div>
                ) : (
                  <div className="flex flex-col gap-2 mb-3">
                    {jvResultados.map(j => (
                      <div key={j.id} className="rounded-lg p-3" style={{ background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                        <div className="grid grid-cols-[1fr_90px_20px] gap-2 mb-2 items-center">
                          <input type="text" value={j.nombre} onChange={e => updateJugador(j.id, 'nombre', e.target.value)} placeholder="Nombre" className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor = '#A855F7'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
                          <select value={j.rol} onChange={e => updateJugador(j.id, 'rol', e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-bold uppercase" style={INP_L}>
                            <option value="gestor">Gestor</option>
                            <option value="inversor">Inversor</option>
                            <option value="mixto">Mixto</option>
                          </select>
                          <button onClick={() => removeJugador(j.id)} className="text-sm font-black" style={{ color: '#EF4444' }}>✕</button>
                        </div>
                        <div className="mb-2">
                          <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Capital aportado (€)</label>
                          <input type="number" value={j.capital || ''} onChange={e => updateJugador(j.id, 'capital', e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor = '#A855F7'} onBlur={e => e.target.style.borderColor = '#ECEAE4'} placeholder="€" />
                        </div>
                        {j.rol === 'mixto' && (
                          <div className="mb-2">
                            <label className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>
                              <span>% como Gestor</span>
                              <span style={{ color: '#A855F7' }}>{j.gestorPct ?? 50}% Gestor · {100 - (j.gestorPct ?? 50)}% Inversor</span>
                            </label>
                            <input type="range" min="0" max="100" step="5" value={j.gestorPct ?? 50} onChange={e => updateJugador(j.id, 'gestorPct', e.target.value)} className="w-full" style={{ accentColor: '#A855F7' }} />
                          </div>
                        )}
                        <div className="grid grid-cols-5 gap-1 pt-2" style={{ borderTop: '1px solid #ECEAE4' }}>
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#aaa' }}>% capital</div>
                            <div className="text-[12px] font-mono font-bold" style={{ color: '#666' }}>{j.pctCapital !== null ? `${j.pctCapital.toFixed(0)}%` : '—'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#aaa' }}>% beneficio</div>
                            <div className="text-[12px] font-mono font-bold" style={{ color: '#A855F7' }}>{j.pctBeneficio.toFixed(0)}%</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#aaa' }}>Beneficio</div>
                            <div className="text-[12px] font-mono font-bold" style={{ color: j.beneficio !== null && j.beneficio >= 0 ? '#22C55E' : '#EF4444' }}>{j.beneficio !== null ? fmt(j.beneficio) : '—'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#aaa' }}>ROI</div>
                            <div className="text-[12px] font-mono font-bold" style={{ color: semaforoColor(j.roi) }}>{j.roi !== null ? `${semaforoEmoji(j.roi)} ${j.roi.toFixed(1)}%` : '—'}</div>
                          </div>
                          <div className="text-center">
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#aaa' }}>ROI anual</div>
                            <div className="text-[12px] font-mono font-bold" style={{ color: j.roiAnual !== null ? semaforoColor(j.roiAnual) : '#ccc' }}>{j.roiAnual !== null ? `${j.roiAnual.toFixed(1)}%` : '—'}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button onClick={addJugador} className="w-full text-xs font-black py-2 rounded-lg mb-2" style={{ background: 'rgba(168,85,247,0.1)', color: '#A855F7', border: '1px solid rgba(168,85,247,0.3)' }}>+ Agregar jugador</button>

                {jvJugadores.length > 0 && (
                  <div className="flex flex-col gap-1">
                    {jvGestores.length === 0 && (
                      <div className="text-[12px] font-bold" style={{ color: '#EF4444' }}>⚠ No hay ningún jugador con parte de Gestor — el 50% de gestión queda sin asignar</div>
                    )}
                    {jvInversores.length > 0 && jvCapitalInversores === 0 && (
                      <div className="text-[12px] font-bold" style={{ color: '#EF4444' }}>⚠ Los inversores no tienen capital cargado — no se puede repartir su 50%</div>
                    )}
                    {res && Math.abs(jvCapitalTotal - res.totalReal) > 1 && (
                      <div className="text-[12px] font-bold" style={{ color: '#EF4444' }}>⚠ El capital aportado suma {fmt(jvCapitalTotal)}, la inversión total es {fmt(res.totalReal)}</div>
                    )}
                  </div>
                )}

                {/* BONUS CCP */}
                <div className="rounded-xl p-3 mt-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                  <div className="text-[12px] font-black uppercase tracking-wide mb-1" style={{ color: '#B45309' }}>BONUS — reparto del excedente sobre el CCP</div>
                  <div className="text-[12px] font-medium mb-3" style={{ color: '#92400E', lineHeight: 1.4 }}>
                    Si el beneficio final supera al acordado en el CCP, el excedente se reparte en el % indicado: gestor(es) en partes iguales, inversor(es) a prorrata de capital.
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#92400E' }}>% Gestor (bonus)</label>
                      <input type="number" value={jvBonoPctGestor || ''} onChange={e => setBonoPctGestor(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={{ background: '#fff', border: '1px solid #FDE68A', color: '#333' }} placeholder="60" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#92400E' }}>% Inversor (bonus)</label>
                      <input type="number" value={jvBonoPctInversor || ''} onChange={e => setBonoPctInversor(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={{ background: '#fff', border: '1px solid #FDE68A', color: '#333' }} placeholder="40" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#92400E' }}>Beneficio acordado en el CCP (€)</label>
                      <input type="number" value={jvBonoBeneficioCcp || ''} onChange={e => { setJvBonoBeneficioCcp(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={{ background: '#fff', border: '1px solid #FDE68A', color: '#333' }} placeholder="€" />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#92400E' }}>Beneficio final (€)</label>
                      <input type="number" value={jvBonoBeneficioFinal || ''} onChange={e => { setJvBonoBeneficioFinal(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={{ background: '#fff', border: '1px solid #FDE68A', color: '#333' }} placeholder="€ (al cerrar la operación)" />
                    </div>
                  </div>

                  {jvBonoBeneficioFinal > 0 && (() => {
                    const excedente = jvBonoBeneficioFinal - jvBonoBeneficioCcp
                    if (excedente <= 0) {
                      return <div className="text-[12px] font-bold mt-1" style={{ color: '#92400E' }}>El beneficio final no supera al acordado en el CCP — no hay excedente, no aplica bonus.</div>
                    }
                    const bonoRes = calcJvBono(jvJugadores, excedente, jvBonoPctGestor, jvBonoPctInversor)
                    return (
                      <div className="rounded-lg p-2 mt-1" style={{ background: '#fff', border: '1px solid #FDE68A' }}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#92400E' }}>Excedente</div>
                          <div className="text-[13px] font-mono font-black" style={{ color: '#B45309' }}>{fmt(excedente)}</div>
                        </div>
                        <div className="grid grid-cols-[1fr_64px_64px] gap-x-2 pb-1 mb-1" style={{ borderBottom: '1px solid #FDE68A' }}>
                          <div className="text-[10px] font-black uppercase" style={{ color: '#C99' }}>Jugador</div>
                          <div className="text-[10px] font-black uppercase text-right" style={{ color: '#C99' }}>% bonus</div>
                          <div className="text-[10px] font-black uppercase text-right" style={{ color: '#C99' }}>Bonus (€)</div>
                        </div>
                        {bonoRes.map(j => (
                          <div key={j.id} className="grid grid-cols-[1fr_64px_64px] items-center py-1">
                            <div className="text-[12px] font-bold truncate" style={{ color: '#333' }}>{j.nombre || '—'}</div>
                            <div className="text-[12px] font-mono text-right" style={{ color: '#92400E' }}>{j.pctBono.toFixed(0)}%</div>
                            <div className="text-[12px] font-mono font-black text-right" style={{ color: '#B45309' }}>{fmt(j.bono)}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>

                {/* Liquidación */}
                <div className="rounded-xl p-3 mt-3" style={{ background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                  <div className="text-[12px] font-black uppercase tracking-wide mb-1" style={{ color: '#666' }}>Liquidación final</div>
                  <div className="text-[12px] font-medium mb-2" style={{ color: '#999', lineHeight: 1.4 }}>
                    Completar cuando la operación se cierre y se liquide el reparto real (bonus incluido, si aplica).
                  </div>
                  <textarea value={jvBonoLiquidacion} onChange={e => { setJvBonoLiquidacion(e.target.value); setSavedId(null) }} rows={3} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-medium" style={{ background: '#fff', border: '1px solid #ECEAE4', color: '#333' }} placeholder="Ej: Beneficio real 140.000€. Excedente sobre CCP: 40.000€. Bonus gestor 24.000€ (HASU), bonus inversor 16.000€ (José Luis). Liquidado el .../.../..." />
                </div>
              </>
            )}
          </div>

          {/* Checklist de documentación */}
          <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#B45309' }}>📋 Checklist de documentación</div>
              <div className="flex gap-1.5">
                {getAlertasConfirmadas(checklistDoc).length > 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>🔴 {getAlertasConfirmadas(checklistDoc).length} alerta(s)</span>
                )}
                {getBloqueantesPendientes(checklistDoc).length > 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.12)', color: '#B45309' }}>⚠ {getBloqueantesPendientes(checklistDoc).length} por verificar</span>
                )}
                {getAlertasConfirmadas(checklistDoc).length === 0 && getBloqueantesPendientes(checklistDoc).length === 0 && (
                  <span className="text-[11px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.12)', color: '#16A34A' }}>✓ Todo verificado</span>
                )}
              </div>
            </div>
            <div className="text-[12px] font-medium mb-3" style={{ color: '#999', lineHeight: 1.4 }}>
              Marcá cada ítem antes de pasar a Comprado. Los ítems con 🔒 frenan la compra hasta que estén en OK o N/A.
            </div>
            <div className="flex flex-col gap-1">
              {CHECKLIST_ITEMS.map(it => {
                const estado = getItemEstado(checklistDoc, it.key)
                const BTN = (activo: boolean, color: string, bg: string) => ({ background: activo ? bg : '#F5F4F0', color: activo ? color : '#AAA', border: `1.5px solid ${activo ? color + '50' : '#ECEAE4'}` })
                return (
                  <div key={it.key} className="py-1.5" style={{ borderBottom: '1px solid #F5F4F0' }}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[13px] font-bold flex items-center gap-1" style={{ color: '#333' }}>
                        {it.bloqueante && <span title="Frena el paso a Comprado" style={{ fontSize: 11 }}>🔒</span>}
                        {it.label}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => setChecklistItem(it.key, estado === 'ok' ? 'pendiente' : 'ok')} className="text-[11px] font-black px-2 py-1 rounded-lg" style={BTN(estado === 'ok', '#16A34A', 'rgba(34,197,94,0.15)')}>OK</button>
                        <button onClick={() => setChecklistItem(it.key, estado === 'alerta' ? 'pendiente' : 'alerta')} className="text-[11px] font-black px-2 py-1 rounded-lg" style={BTN(estado === 'alerta', '#EF4444', 'rgba(239,68,68,0.15)')}>Alerta</button>
                        <button onClick={() => setChecklistItem(it.key, estado === 'no_aplica' ? 'pendiente' : 'no_aplica')} className="text-[11px] font-black px-2 py-1 rounded-lg" style={BTN(estado === 'no_aplica', '#888', '#ECEAE4')}>N/A</button>
                      </div>
                    </div>
                    {estado === 'alerta' && (
                      <input type="text" value={checklistDoc.notas?.[it.key] || ''} onChange={e => setChecklistNota(it.key, e.target.value)} placeholder="Detalle de la alerta (opcional)" className="w-full mt-1.5 rounded-lg px-2 py-1.5 text-xs outline-none font-medium" style={{ background: '#FEF2F2', border: '1px solid rgba(239,68,68,0.25)', color: '#333' }} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Comparativa de escenarios */}
          {escenarios.some(e => e.ben !== null || e.roi !== null) && (
            <div className="mb-5">
              <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Comparativa de escenarios</div>
              <div className="grid grid-cols-2 gap-2">
                {escenarios.map(esc => {
                  const esMejor = mejorEscenario?.id === esc.id
                  const sinDatos = esc.ben === null && esc.roi === null
                  return (
                    <div key={esc.id} className="rounded-xl p-3" style={{
                      background: esMejor ? '#FFF7ED' : '#fff',
                      border: `1.5px solid ${esMejor ? '#A6855A' : '#ECEAE4'}`,
                    }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[12px] font-black" style={{ color: esMejor ? '#A6855A' : '#555' }}>{esc.nombre}</div>
                        {esMejor && <div className="text-[11px] font-black px-1.5 py-0.5 rounded-full" style={{ background: '#A6855A', color: '#14110C' }}>MEJOR</div>}
                      </div>
                      <div className="text-[12px] mb-2" style={{ color: '#aaa' }}>{esc.subtitulo}</div>
                      {sinDatos ? (
                        <div className="text-[12px]" style={{ color: '#CCC' }}>— Faltan datos</div>
                      ) : (
                        <>
                          <div className="text-[16px] font-black font-mono" style={{ color: esc.ben !== null ? (esc.ben >= 0 ? '#22C55E' : '#EF4444') : '#CCC' }}>
                            {esc.ben !== null ? (esc.ben >= 0 ? '+' : '') + fmt(esc.ben) : '—'}
                          </div>
                          {esc.id !== 'inbruto' && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[12px]">{semaforoEmoji(esc.roi)}</span>
                              <span className="text-[13px] font-black font-mono" style={{ color: semaforoColor(esc.roi) }}>
                                {esc.roi !== null ? fmtPct(esc.roi) : '—'}
                              </span>
                            </div>
                          )}
                          {esc.extras && (
                            <div className="text-[12px] mt-1" style={{ color: '#888' }}>{esc.extras}</div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Botón guardar */}
        <div className="flex gap-2">
          <button
            onClick={guardar}
            disabled={saving || !res || !!savedId}
            className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-50"
            style={{ background: savedId ? '#22C55E' : '#14110C', color: '#fff' }}
          >
            {saving ? 'Guardando...' : savedId ? '✓ Guardado' : 'Actualizar análisis'}
          </button>
        </div>
      </div>
    </div>
  )
}
