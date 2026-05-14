'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtPct = (n: number) => (isFinite(n) ? n.toFixed(1) : '0.0') + '%'
const today = () => new Date().toISOString().split('T')[0]

// ── Types ─────────────────────────────────────────────────────────────────────
type Edificio = {
  id: string
  titulo?: string
  direccion: string
  ciudad?: string
  referencia_catastral?: string
  superficie_total?: number
  num_plantas?: number
  tipo_finca: 'bloque_independiente' | 'finca_unica'
  precio_compra: number
  precio_venta_conservador?: number | null
  precio_venta_realista?: number | null
  precio_venta_optimista?: number | null
  costes_json?: CostesJson | null
  estado: string
  duracion_meses?: number
  fuente?: string
  url?: string
  notas?: string
  created_at: string
}

type CostesJson = {
  reforma_override?: number | null   // null = usar suma de unidades
  licencia_obras?: number
  honorarios_tecnicos?: number
  deuda_ibi?: number
  gastos_varios?: number
}

type Unidad = {
  id: string
  edificio_id: string
  tipo: 'piso' | 'local' | 'parking' | 'trastero' | 'otro'
  planta?: string
  superficie?: number
  origen: 'existente' | 'proyectada'
  ocupacion: 'libre' | 'arrendado'
  renta_mensual?: number
  precio_venta_est?: number
  reforma_estimada?: number
  referencia_catastral?: string
  notas?: string
}

// ── Constantes ────────────────────────────────────────────────────────────────
const ESTADOS_ESTUDIO = ['en_estudio', 'ofertado', 'en_arras', 'comprado', 'descartado']

const SUBESTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  en_estudio: { label: 'En estudio', color: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
  ofertado:   { label: 'Ofertado',   color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  en_arras:   { label: 'En arras',   color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  comprado:   { label: 'Comprado',   color: '#22C55E', bg: 'rgba(34,197,94,0.15)' },
  descartado: { label: 'Descartado', color: '#888',    bg: 'rgba(136,136,136,0.12)' },
}

const TIPO_UNIDAD_LABEL: Record<string, string> = {
  piso: 'Piso', local: 'Local', parking: 'Parking', trastero: 'Trastero', otro: 'Otro',
}

const emptyEdificioForm = () => ({
  titulo: '', direccion: '', ciudad: '', referencia_catastral: '',
  superficie_total: '', num_plantas: '', tipo_finca: 'finca_unica' as const,
  precio_compra: '', fuente: 'Contacto directo', url: '', notas: '',
})

const emptyUnidadForm = () => ({
  tipo: 'piso' as Unidad['tipo'],
  planta: '', superficie: '', origen: 'existente' as const, ocupacion: 'libre' as const,
  renta_mensual: '', precio_venta_est: '', reforma_estimada: '', referencia_catastral: '', notas: '',
})

const emptyCostes = (): CostesJson => ({
  reforma_override: null, licencia_obras: 0, honorarios_tecnicos: 0, deuda_ibi: 0, gastos_varios: 0,
})

// ── ROI calculation ───────────────────────────────────────────────────────────
function calcEdificioROI(
  precio_compra: number,
  reforma: number,
  venta: number,
  costes: CostesJson,
) {
  const itp = Math.floor(precio_compra * 0.02)
  const notaria_registro = 1000
  const extras = (costes.licencia_obras || 0) + (costes.honorarios_tecnicos || 0) +
                 (costes.deuda_ibi || 0) + (costes.gastos_varios || 0)
  const total_inversion = precio_compra + reforma + itp + notaria_registro + extras
  if (total_inversion <= 0 || venta <= 0) return null
  const beneficio = venta - total_inversion
  const roi = (beneficio / total_inversion) * 100
  return { total_inversion, beneficio, roi, itp, notaria_registro, extras }
}

function roiSemaforo(roi: number) {
  if (roi >= 30) return { color: '#22C55E', label: 'Entra según criterios Wallest' }
  if (roi >= 15) return { color: '#F59E0B', label: 'Analizar bien antes de avanzar' }
  return { color: '#EF4444', label: 'No entra según criterios Wallest' }
}

// ─────────────────────────────────────────────────────────────────────────────
export default function EdificiosPage() {
  const [tab, setTab] = useState(0)
  const [edificios, setEdificios] = useState<Edificio[]>([])
  const [unidades, setUnidades] = useState<Record<string, Unidad[]>>({})
  const [loading, setLoading] = useState(true)

  // Alta / editar edificio
  const [altaOpen, setAltaOpen] = useState(false)
  const [editando, setEditando] = useState<Edificio | null>(null)
  const [form, setForm] = useState(emptyEdificioForm())
  const [saving, setSaving] = useState(false)

  // Gestión de unidades
  const [unidadesEdificioId, setUnidadesEdificioId] = useState<string | null>(null)
  const [unidadForm, setUnidadForm] = useState(emptyUnidadForm())
  const [editandoUnidadId, setEditandoUnidadId] = useState<string | null>(null)
  const [savingUnidad, setSavingUnidad] = useState(false)

  // Calculadora
  const [calcEdificioId, setCalcEdificioId] = useState<string | null>(null)
  const [costesForm, setCostesForm] = useState<CostesJson>(emptyCostes())
  const [pvPes, setPvPes] = useState(0)
  const [pvReal, setPvReal] = useState(0)
  const [pvOpt, setPvOpt] = useState(0)
  const [duracionMeses, setDuracionMeses] = useState(0)
  const [savingCalc, setSavingCalc] = useState(false)

  // Estado change
  const [updatingEstado, setUpdatingEstado] = useState<string | null>(null)

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.from('edificios_estudio').select('*').order('created_at', { ascending: false })
      .then(({ data }) => { setEdificios(data || []); setLoading(false) })
  }, [])

  const loadUnidades = async (edificioId: string) => {
    if (unidades[edificioId]) return
    const { data } = await supabase
      .from('edificio_unidades').select('*').eq('edificio_id', edificioId).order('created_at')
    setUnidades(prev => ({ ...prev, [edificioId]: data || [] }))
  }

  const radar   = edificios.filter(e => e.estado === 'radar')
  const estudio = edificios.filter(e => ESTADOS_ESTUDIO.includes(e.estado))

  // ── CRUD Edificio ──────────────────────────────────────────────────────────
  const openAlta = () => { setEditando(null); setForm(emptyEdificioForm()); setAltaOpen(true) }

  const openEditar = (e: Edificio) => {
    setEditando(e)
    setForm({
      titulo: e.titulo || '', direccion: e.direccion, ciudad: e.ciudad || '',
      referencia_catastral: e.referencia_catastral || '',
      superficie_total: String(e.superficie_total || ''),
      num_plantas: String(e.num_plantas || ''),
      tipo_finca: e.tipo_finca,
      precio_compra: String(e.precio_compra || ''),
      fuente: e.fuente || 'Contacto directo', url: e.url || '', notas: e.notas || '',
    })
    setAltaOpen(true)
  }

  const saveEdificio = async () => {
    if (!form.direccion || !form.precio_compra) return
    setSaving(true)
    const payload = {
      titulo: form.titulo || null,
      direccion: form.direccion,
      ciudad: form.ciudad || null,
      referencia_catastral: form.referencia_catastral || null,
      superficie_total: parseFloat(form.superficie_total) || null,
      num_plantas: parseInt(form.num_plantas) || null,
      tipo_finca: form.tipo_finca,
      precio_compra: parseFloat(form.precio_compra) || 0,
      fuente: form.fuente || null,
      url: form.url || null,
      notas: form.notas || null,
    }
    if (editando) {
      const { data, error } = await supabase.from('edificios_estudio')
        .update(payload).eq('id', editando.id).select().single()
      if (error) { alert(`Error: ${error.message}`); setSaving(false); return }
      if (data) setEdificios(prev => prev.map(x => x.id === editando.id ? data : x))
    } else {
      const { data, error } = await supabase.from('edificios_estudio')
        .insert([{ ...payload, estado: 'radar' }]).select().single()
      if (error) { alert(`Error: ${error.message}`); setSaving(false); return }
      if (data) setEdificios(prev => [data, ...prev])
    }
    setSaving(false)
    setAltaOpen(false)
    setEditando(null)
  }

  const deleteEdificio = async (e: Edificio) => {
    if (!confirm(`¿Eliminar "${e.titulo || e.direccion}"? Se eliminarán también sus unidades.`)) return
    await supabase.from('edificios_estudio').delete().eq('id', e.id)
    setEdificios(prev => prev.filter(x => x.id !== e.id))
  }

  const cambiarEstado = async (id: string, estado: string) => {
    setUpdatingEstado(id)
    const { data } = await supabase.from('edificios_estudio')
      .update({ estado }).eq('id', id).select().single()
    if (data) setEdificios(prev => prev.map(x => x.id === id ? data : x))
    setUpdatingEstado(null)
  }

  const pasarAEstudio = async (e: Edificio) => {
    await cambiarEstado(e.id, 'en_estudio')
    await loadUnidades(e.id)
    openCalculadora(e.id)
    setTab(1)
  }

  // ── CRUD Unidades ──────────────────────────────────────────────────────────
  const openUnidades = async (edificioId: string) => {
    await loadUnidades(edificioId)
    setUnidadForm(emptyUnidadForm())
    setEditandoUnidadId(null)
    setUnidadesEdificioId(edificioId)
  }

  const saveUnidad = async () => {
    if (!unidadesEdificioId) return
    setSavingUnidad(true)
    const payload = {
      edificio_id: unidadesEdificioId,
      tipo: unidadForm.tipo,
      planta: unidadForm.planta || null,
      superficie: parseFloat(unidadForm.superficie) || null,
      origen: unidadForm.origen,
      ocupacion: unidadForm.ocupacion,
      renta_mensual: parseFloat(unidadForm.renta_mensual) || null,
      precio_venta_est: parseFloat(unidadForm.precio_venta_est) || null,
      reforma_estimada: parseFloat(unidadForm.reforma_estimada) || null,
      referencia_catastral: unidadForm.referencia_catastral || null,
      notas: unidadForm.notas || null,
    }
    if (editandoUnidadId) {
      const { data } = await supabase.from('edificio_unidades')
        .update(payload).eq('id', editandoUnidadId).select().single()
      if (data) setUnidades(prev => ({
        ...prev,
        [unidadesEdificioId]: prev[unidadesEdificioId].map(u => u.id === editandoUnidadId ? data : u),
      }))
      setEditandoUnidadId(null)
    } else {
      const { data } = await supabase.from('edificio_unidades')
        .insert([payload]).select().single()
      if (data) setUnidades(prev => ({
        ...prev,
        [unidadesEdificioId]: [...(prev[unidadesEdificioId] || []), data],
      }))
    }
    setUnidadForm(emptyUnidadForm())
    setSavingUnidad(false)
  }

  const deleteUnidad = async (u: Unidad) => {
    if (!confirm('¿Eliminar esta unidad?')) return
    await supabase.from('edificio_unidades').delete().eq('id', u.id)
    setUnidades(prev => ({
      ...prev,
      [u.edificio_id]: prev[u.edificio_id].filter(x => x.id !== u.id),
    }))
  }

  const editarUnidad = (u: Unidad) => {
    setEditandoUnidadId(u.id)
    setUnidadForm({
      tipo: u.tipo, planta: u.planta || '', superficie: String(u.superficie || ''),
      origen: u.origen, ocupacion: u.ocupacion,
      renta_mensual: String(u.renta_mensual || ''),
      precio_venta_est: String(u.precio_venta_est || ''),
      reforma_estimada: String(u.reforma_estimada || ''),
      referencia_catastral: u.referencia_catastral || '', notas: u.notas || '',
    })
  }

  // ── Calculadora ────────────────────────────────────────────────────────────
  const openCalculadora = async (edificioId: string) => {
    await loadUnidades(edificioId)
    const ed = edificios.find(e => e.id === edificioId)
    if (!ed) return
    const costes = ed.costes_json ? { ...emptyCostes(), ...ed.costes_json } : emptyCostes()
    setCostesForm(costes)
    // Pre-fill precios venta desde suma de unidades si no hay override
    const uns = unidades[edificioId] || []
    const sumVenta = uns.reduce((a, u) => a + (u.precio_venta_est || 0), 0)
    setPvReal(ed.precio_venta_realista ?? sumVenta)
    setPvPes(ed.precio_venta_conservador ?? Math.round(sumVenta * 0.9))
    setPvOpt(ed.precio_venta_optimista ?? Math.round(sumVenta * 1.1))
    setDuracionMeses(ed.duracion_meses || 0)
    setCalcEdificioId(edificioId)
  }

  const saveCalculadora = async () => {
    if (!calcEdificioId) return
    setSavingCalc(true)
    const { data } = await supabase.from('edificios_estudio')
      .update({
        costes_json: costesForm,
        precio_venta_conservador: pvPes || null,
        precio_venta_realista: pvReal || null,
        precio_venta_optimista: pvOpt || null,
        duracion_meses: duracionMeses || null,
      })
      .eq('id', calcEdificioId).select().single()
    if (data) setEdificios(prev => prev.map(x => x.id === calcEdificioId ? data : x))
    setSavingCalc(false)
    setCalcEdificioId(null)
  }

  // ── Datos para calculadora activa ─────────────────────────────────────────
  const calcEd = calcEdificioId ? edificios.find(e => e.id === calcEdificioId) : null
  const calcUns = calcEdificioId ? (unidades[calcEdificioId] || []) : []
  const sumVentaUns = calcUns.reduce((a, u) => a + (u.precio_venta_est || 0), 0)
  const sumReformaUns = calcUns.reduce((a, u) => a + (u.reforma_estimada || 0), 0)
  const reformaUsada = costesForm.reforma_override != null ? costesForm.reforma_override : sumReformaUns
  const resCalc = calcEd ? {
    pes: calcEdificioROI(calcEd.precio_compra, reformaUsada, pvPes, costesForm),
    real: calcEdificioROI(calcEd.precio_compra, reformaUsada, pvReal, costesForm),
    opt: calcEdificioROI(calcEd.precio_compra, reformaUsada, pvOpt, costesForm),
  } : null

  // ── ROI badge para lista ──────────────────────────────────────────────────
  const roiBadge = (e: Edificio) => {
    if (!e.precio_venta_realista) return null
    const uns = unidades[e.id] || []
    const reforma = uns.reduce((a, u) => a + (u.reforma_estimada || 0), 0)
    const r = calcEdificioROI(e.precio_compra, reforma, e.precio_venta_realista, e.costes_json || emptyCostes())
    if (!r) return null
    const sem = roiSemaforo(r.roi)
    return { roi: r.roi, color: sem.color }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24" style={{ background: '#0A0A0A' }}>

      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <div className="flex items-center justify-between mb-1">
          <h1 className="font-black text-[22px] text-white">Edificios</h1>
          <button onClick={openAlta}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white"
            style={{ background: '#F26E1F' }}>
            <span className="text-base">+</span> Nuevo
          </button>
        </div>
        <p className="text-[12px] font-medium" style={{ color: '#555' }}>
          Pipeline de edificios y bloques de pisos
        </p>
      </div>

      {/* Tabs */}
      <div className="px-4 mt-4 mb-4 flex gap-2">
        {['Radar', 'En Estudio'].map((label, i) => (
          <button key={i} onClick={() => setTab(i)}
            className="px-4 py-2 rounded-xl text-sm font-black transition-colors"
            style={{
              background: tab === i ? '#F26E1F' : '#1A1A1A',
              color: tab === i ? '#fff' : '#666',
            }}>
            {label}
            <span className="ml-2 text-[11px] font-bold opacity-70">
              {i === 0 ? radar.length : estudio.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── TAB RADAR ── */}
      {tab === 0 && (
        <div className="px-4 space-y-3">
          {loading && <div className="text-center py-12 text-sm font-medium" style={{ color: '#555' }}>Cargando...</div>}
          {!loading && radar.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🏗️</div>
              <div className="text-sm font-semibold" style={{ color: '#555' }}>Sin edificios en radar</div>
              <div className="text-xs mt-1" style={{ color: '#444' }}>Pulsa "+ Nuevo" para añadir el primero</div>
            </div>
          )}
          {radar.map(e => (
            <EdificioCard
              key={e.id}
              edificio={e}
              unidades={unidades[e.id]}
              onLoadUnidades={() => loadUnidades(e.id)}
              onEditar={() => openEditar(e)}
              onEliminar={() => deleteEdificio(e)}
              onUnidades={() => openUnidades(e.id)}
              onPasarEstudio={() => pasarAEstudio(e)}
              isRadar
            />
          ))}
        </div>
      )}

      {/* ── TAB EN ESTUDIO ── */}
      {tab === 1 && (
        <div className="px-4 space-y-3">
          {!loading && estudio.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🔬</div>
              <div className="text-sm font-semibold" style={{ color: '#555' }}>Sin edificios en estudio</div>
              <div className="text-xs mt-1" style={{ color: '#444' }}>Pasa un edificio del Radar a Estudio para analizarlo</div>
            </div>
          )}
          {estudio.map(e => {
            const badge = roiBadge(e)
            const cfg = SUBESTADO_CFG[e.estado] || SUBESTADO_CFG.en_estudio
            return (
              <div key={e.id} className="rounded-2xl overflow-hidden"
                style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="p-4">
                  {/* Header fila */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-[15px] text-white truncate">
                        {e.titulo || e.direccion}
                      </div>
                      {e.titulo && (
                        <div className="text-[12px] mt-0.5 truncate" style={{ color: '#666' }}>{e.direccion}</div>
                      )}
                      {e.ciudad && (
                        <div className="text-[11px] mt-0.5" style={{ color: '#555' }}>{e.ciudad}</div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {badge && (
                        <div className="text-[11px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: badge.color + '22', color: badge.color }}>
                          ROI {fmtPct(badge.roi)}
                        </div>
                      )}
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="rounded-xl p-2.5 text-center" style={{ background: '#1E1E1E' }}>
                      <div className="text-[10px] font-bold uppercase" style={{ color: '#555' }}>Compra</div>
                      <div className="text-[13px] font-black text-white mt-0.5">{fmt(e.precio_compra)}</div>
                    </div>
                    <div className="rounded-xl p-2.5 text-center" style={{ background: '#1E1E1E' }}>
                      <div className="text-[10px] font-bold uppercase" style={{ color: '#555' }}>Realista</div>
                      <div className="text-[13px] font-black mt-0.5"
                        style={{ color: e.precio_venta_realista ? '#F26E1F' : '#444' }}>
                        {e.precio_venta_realista ? fmt(e.precio_venta_realista) : '—'}
                      </div>
                    </div>
                    <div className="rounded-xl p-2.5 text-center" style={{ background: '#1E1E1E' }}>
                      <div className="text-[10px] font-bold uppercase" style={{ color: '#555' }}>Tipo</div>
                      <div className="text-[11px] font-black text-white mt-0.5">
                        {e.tipo_finca === 'bloque_independiente' ? 'Bloque' : 'Finca'}
                      </div>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex gap-2 flex-wrap">
                    <button onClick={() => openCalculadora(e.id)}
                      className="flex-1 py-2.5 rounded-xl text-[12px] font-black text-white"
                      style={{ background: '#F26E1F', minWidth: 90 }}>
                      Calculadora
                    </button>
                    <button onClick={() => openUnidades(e.id)}
                      className="flex-1 py-2.5 rounded-xl text-[12px] font-black"
                      style={{ background: '#1E1E1E', color: '#aaa', minWidth: 80 }}>
                      Unidades
                      {unidades[e.id] ? ` (${unidades[e.id].length})` : ''}
                    </button>
                    <button onClick={() => openEditar(e)}
                      className="px-3 py-2.5 rounded-xl text-[12px] font-black"
                      style={{ background: '#1E1E1E', color: '#888' }}>
                      ✏️
                    </button>
                    <button onClick={() => deleteEdificio(e)}
                      className="px-3 py-2.5 rounded-xl text-[12px] font-black"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                      🗑
                    </button>
                  </div>

                  {/* Cambiar estado */}
                  <div className="mt-2">
                    <select
                      value={e.estado}
                      disabled={updatingEstado === e.id}
                      onChange={ev => cambiarEstado(e.id, ev.target.value)}
                      className="w-full rounded-xl px-3 py-2 text-xs font-bold outline-none"
                      style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.06)', color: '#888' }}>
                      {ESTADOS_ESTUDIO.map(s => (
                        <option key={s} value={s}>{SUBESTADO_CFG[s]?.label || s}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ═══ MODAL ALTA / EDITAR EDIFICIO ═══ */}
      {altaOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setAltaOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto', maxHeight: '90vh' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="font-black text-[18px] text-white mb-5">
                {editando ? 'Editar edificio' : 'Nuevo edificio'}
              </div>

              <div className="space-y-3">
                <Field label="Título (opcional)">
                  <input value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
                    placeholder="ej: Bloque C/ Mayor 12" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                </Field>
                <Field label="Dirección *">
                  <input value={form.direccion} onChange={e => setForm(p => ({ ...p, direccion: e.target.value }))}
                    placeholder="C/ Nombre 123" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                </Field>
                <Field label="Ciudad">
                  <input value={form.ciudad} onChange={e => setForm(p => ({ ...p, ciudad: e.target.value }))}
                    placeholder="Huércal-Overa" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Precio pedido (€) *">
                    <input type="number" value={form.precio_compra}
                      onChange={e => setForm(p => ({ ...p, precio_compra: e.target.value }))}
                      placeholder="180000" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                  </Field>
                  <Field label="Superficie total (m²)">
                    <input type="number" value={form.superficie_total}
                      onChange={e => setForm(p => ({ ...p, superficie_total: e.target.value }))}
                      placeholder="450" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Num. plantas">
                    <input type="number" value={form.num_plantas}
                      onChange={e => setForm(p => ({ ...p, num_plantas: e.target.value }))}
                      placeholder="3" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                  </Field>
                  <Field label="Ref. catastral">
                    <input value={form.referencia_catastral}
                      onChange={e => setForm(p => ({ ...p, referencia_catastral: e.target.value }))}
                      placeholder="1234567AB..." className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                  </Field>
                </div>

                <Field label="Tipo de finca">
                  <div className="flex gap-2">
                    {(['finca_unica', 'bloque_independiente'] as const).map(t => (
                      <button key={t} onClick={() => setForm(p => ({ ...p, tipo_finca: t }))}
                        className="flex-1 py-2.5 rounded-xl text-[12px] font-black transition-colors"
                        style={{
                          background: form.tipo_finca === t ? 'rgba(242,110,31,0.2)' : '#1E1E1E',
                          color: form.tipo_finca === t ? '#F26E1F' : '#666',
                          border: form.tipo_finca === t ? '1px solid rgba(242,110,31,0.4)' : '1px solid rgba(255,255,255,0.05)',
                        }}>
                        {t === 'finca_unica' ? 'Finca única' : 'Bloque independiente'}
                      </button>
                    ))}
                  </div>
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Fuente">
                    <select value={form.fuente} onChange={e => setForm(p => ({ ...p, fuente: e.target.value }))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none" style={{ ...INP }}>
                      {['Contacto directo', 'WhatsApp', 'Idealista', 'Fotocasa', 'Notaría', 'API'].map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="URL (opcional)">
                    <input value={form.url} onChange={e => setForm(p => ({ ...p, url: e.target.value }))}
                      placeholder="https://..." className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                  </Field>
                </div>

                <Field label="Notas">
                  <textarea value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))}
                    placeholder="Detalles relevantes, contacto, estado actual..."
                    rows={3} className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none resize-none" style={INP} />
                </Field>
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => { setAltaOpen(false); setEditando(null) }}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black"
                  style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveEdificio} disabled={saving || !form.direccion || !form.precio_compra}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{ background: '#F26E1F' }}>
                  {saving ? 'Guardando...' : editando ? 'Guardar cambios' : 'Añadir al radar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ SHEET GESTIÓN DE UNIDADES ═══ */}
      {unidadesEdificioId && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => { setUnidadesEdificioId(null); setEditandoUnidadId(null) }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto', maxHeight: '92vh' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#333' }} />
              {(() => {
                const ed = edificios.find(e => e.id === unidadesEdificioId)
                const uns = unidades[unidadesEdificioId] || []
                const sumM2 = uns.reduce((a, u) => a + (u.superficie || 0), 0)
                const sumVenta = uns.reduce((a, u) => a + (u.precio_venta_est || 0), 0)
                const sumReforma = uns.reduce((a, u) => a + (u.reforma_estimada || 0), 0)
                return (
                  <>
                    <div className="font-black text-[17px] text-white mb-1">
                      Unidades — {ed?.titulo || ed?.direccion}
                    </div>
                    <div className="text-[12px] mb-4" style={{ color: '#666' }}>
                      {ed?.tipo_finca === 'bloque_independiente' ? 'Bloque de pisos independientes' : 'Finca única'}
                    </div>

                    {/* Totales */}
                    {uns.length > 0 && (
                      <div className="grid grid-cols-3 gap-2 mb-4">
                        {[
                          { label: 'Total m²', val: sumM2 > 0 ? `${sumM2} m²` : '—' },
                          { label: 'Venta total', val: sumVenta > 0 ? fmt(sumVenta) : '—' },
                          { label: 'Reforma total', val: sumReforma > 0 ? fmt(sumReforma) : '—' },
                        ].map(({ label, val }) => (
                          <div key={label} className="rounded-xl p-2.5 text-center" style={{ background: '#1E1E1E' }}>
                            <div className="text-[10px] font-bold uppercase" style={{ color: '#555' }}>{label}</div>
                            <div className="text-[12px] font-black text-white mt-0.5">{val}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Lista de unidades */}
                    {uns.length === 0 && (
                      <div className="text-center py-6 mb-4 rounded-xl" style={{ background: '#1A1A1A' }}>
                        <div className="text-sm font-semibold" style={{ color: '#555' }}>Sin unidades añadidas</div>
                        <div className="text-xs mt-1" style={{ color: '#444' }}>
                          Añade pisos, locales, parking, etc.
                        </div>
                      </div>
                    )}

                    {uns.map(u => (
                      <div key={u.id} className="mb-2 rounded-xl p-3.5"
                        style={{ background: '#1E1E1E', border: editandoUnidadId === u.id ? '1px solid rgba(242,110,31,0.4)' : '1px solid rgba(255,255,255,0.05)' }}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className="text-[11px] font-black px-2 py-0.5 rounded-full"
                              style={{
                                background: u.origen === 'proyectada' ? 'rgba(167,139,250,0.2)' : 'rgba(96,165,250,0.15)',
                                color: u.origen === 'proyectada' ? '#a78bfa' : '#60A5FA',
                              }}>
                              {TIPO_UNIDAD_LABEL[u.tipo]}
                            </span>
                            {u.planta && <span className="text-[11px] font-bold" style={{ color: '#888' }}>P{u.planta}</span>}
                            {u.superficie && <span className="text-[11px]" style={{ color: '#666' }}>{u.superficie}m²</span>}
                            {u.origen === 'proyectada' && (
                              <span className="text-[10px] font-bold" style={{ color: '#a78bfa' }}>proyectada</span>
                            )}
                          </div>
                          <div className="flex gap-1.5 flex-shrink-0">
                            {u.precio_venta_est ? (
                              <span className="text-[11px] font-black" style={{ color: '#F26E1F' }}>{fmt(u.precio_venta_est)}</span>
                            ) : null}
                            <button onClick={() => editarUnidad(u)}
                              className="text-[11px] px-2 py-1 rounded-lg font-bold"
                              style={{ background: '#282828', color: '#888' }}>✏️</button>
                            <button onClick={() => deleteUnidad(u)}
                              className="text-[11px] px-2 py-1 rounded-lg font-bold"
                              style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>✕</button>
                          </div>
                        </div>
                        {u.ocupacion === 'arrendado' && u.renta_mensual ? (
                          <div className="text-[11px] mt-1.5" style={{ color: '#F59E0B' }}>
                            Arrendado — {fmt(u.renta_mensual)}/mes
                          </div>
                        ) : null}
                        {u.reforma_estimada ? (
                          <div className="text-[11px] mt-0.5" style={{ color: '#666' }}>
                            Reforma: {fmt(u.reforma_estimada)}
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {/* Formulario nueva unidad / editar */}
                    <div className="mt-4 rounded-xl p-4"
                      style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.07)' }}>
                      <div className="font-black text-[13px] text-white mb-3">
                        {editandoUnidadId ? 'Editar unidad' : '+ Añadir unidad'}
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Field label="Tipo">
                          <select value={unidadForm.tipo}
                            onChange={e => setUnidadForm(p => ({ ...p, tipo: e.target.value as Unidad['tipo'] }))}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...INP }}>
                            {Object.entries(TIPO_UNIDAD_LABEL).map(([v, l]) => (
                              <option key={v} value={v}>{l}</option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Planta">
                          <input value={unidadForm.planta}
                            onChange={e => setUnidadForm(p => ({ ...p, planta: e.target.value }))}
                            placeholder="1, PB, SS..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Field label="Superficie (m²)">
                          <input type="number" value={unidadForm.superficie}
                            onChange={e => setUnidadForm(p => ({ ...p, superficie: e.target.value }))}
                            placeholder="85" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                        </Field>
                        <Field label="Origen">
                          <select value={unidadForm.origen}
                            onChange={e => setUnidadForm(p => ({ ...p, origen: e.target.value as 'existente' | 'proyectada' }))}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...INP }}>
                            <option value="existente">Existente</option>
                            <option value="proyectada">Proyectada</option>
                          </select>
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <Field label="Precio venta est. (€)">
                          <input type="number" value={unidadForm.precio_venta_est}
                            onChange={e => setUnidadForm(p => ({ ...p, precio_venta_est: e.target.value }))}
                            placeholder="85000" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                        </Field>
                        <Field label="Reforma est. (€)">
                          <input type="number" value={unidadForm.reforma_estimada}
                            onChange={e => setUnidadForm(p => ({ ...p, reforma_estimada: e.target.value }))}
                            placeholder="15000" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                        </Field>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <Field label="Ocupación">
                          <select value={unidadForm.ocupacion}
                            onChange={e => setUnidadForm(p => ({ ...p, ocupacion: e.target.value as 'libre' | 'arrendado' }))}
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none" style={{ ...INP }}>
                            <option value="libre">Libre</option>
                            <option value="arrendado">Arrendado</option>
                          </select>
                        </Field>
                        {unidadForm.ocupacion === 'arrendado' && (
                          <Field label="Renta mensual (€)">
                            <input type="number" value={unidadForm.renta_mensual}
                              onChange={e => setUnidadForm(p => ({ ...p, renta_mensual: e.target.value }))}
                              placeholder="350" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                          </Field>
                        )}
                      </div>

                      <Field label="Ref. catastral (opcional)">
                        <input value={unidadForm.referencia_catastral}
                          onChange={e => setUnidadForm(p => ({ ...p, referencia_catastral: e.target.value }))}
                          placeholder="1234567AB..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none mb-2" style={INP} />
                      </Field>

                      <div className="flex gap-2 mt-2">
                        {editandoUnidadId && (
                          <button onClick={() => { setEditandoUnidadId(null); setUnidadForm(emptyUnidadForm()) }}
                            className="flex-1 py-2.5 rounded-xl text-sm font-black"
                            style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                        )}
                        <button onClick={saveUnidad} disabled={savingUnidad}
                          className="flex-1 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                          style={{ background: '#F26E1F' }}>
                          {savingUnidad ? 'Guardando...' : editandoUnidadId ? 'Actualizar' : 'Añadir unidad'}
                        </button>
                      </div>
                    </div>

                    <button onClick={() => { setUnidadesEdificioId(null); setEditandoUnidadId(null) }}
                      className="w-full mt-4 py-3 rounded-xl text-sm font-black"
                      style={{ background: '#1E1E1E', color: '#888' }}>
                      Cerrar
                    </button>
                  </>
                )
              })()}
            </div>
          </div>
        </>
      )}

      {/* ═══ SHEET CALCULADORA ROI ═══ */}
      {calcEdificioId && calcEd && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.75)' }}
            onClick={() => setCalcEdificioId(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto', maxHeight: '94vh' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#333' }} />
              <div className="font-black text-[18px] text-white mb-1">Calculadora ROI</div>
              <div className="text-[12px] mb-5" style={{ color: '#666' }}>
                {calcEd.titulo || calcEd.direccion}
              </div>

              {/* Resumen unidades */}
              {calcUns.length > 0 && (
                <div className="mb-4 rounded-xl p-3.5" style={{ background: '#1E1E1E' }}>
                  <div className="text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>
                    Resumen de unidades ({calcUns.length})
                  </div>
                  <div className="space-y-1.5">
                    {calcUns.map(u => (
                      <div key={u.id} className="flex items-center justify-between text-[12px]">
                        <span style={{ color: '#888' }}>
                          {TIPO_UNIDAD_LABEL[u.tipo]}{u.planta ? ` P${u.planta}` : ''}
                          {u.superficie ? ` · ${u.superficie}m²` : ''}
                          {u.origen === 'proyectada' ? ' ·  proj.' : ''}
                        </span>
                        <span style={{ color: u.precio_venta_est ? '#F26E1F' : '#444' }}>
                          {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                        </span>
                      </div>
                    ))}
                    <div className="flex justify-between text-[12px] font-black pt-1.5"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)', color: '#aaa' }}>
                      <span>Total venta estimada</span>
                      <span style={{ color: '#F26E1F' }}>{fmt(sumVentaUns)}</span>
                    </div>
                    <div className="flex justify-between text-[12px] font-bold" style={{ color: '#666' }}>
                      <span>Reforma total (suma unidades)</span>
                      <span>{fmt(sumReformaUns)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Costes fijos */}
              <div className="mb-4">
                <div className="text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>Costes fijos</div>
                <div className="rounded-xl overflow-hidden" style={{ background: '#1E1E1E' }}>
                  {[
                    { label: 'Precio de compra', val: fmt(calcEd.precio_compra) },
                    { label: 'ITP (2%)', val: fmt(Math.floor(calcEd.precio_compra * 0.02)) },
                    { label: 'Notaría + Registro', val: fmt(1000) },
                  ].map(({ label, val }) => (
                    <div key={label} className="flex items-center justify-between px-3.5 py-2.5"
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <span className="text-[13px]" style={{ color: '#888' }}>{label}</span>
                      <span className="text-[13px] font-black text-white">{val}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Costes variables */}
              <div className="mb-4">
                <div className="text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>Costes variables</div>
                <div className="space-y-2">
                  <div className="rounded-xl p-3" style={{ background: '#1E1E1E' }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[12px] font-bold" style={{ color: '#888' }}>
                        Reforma total (€)
                      </label>
                      {costesForm.reforma_override == null && (
                        <span className="text-[10px] font-bold" style={{ color: '#555' }}>
                          Auto: {fmt(sumReformaUns)}
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      value={costesForm.reforma_override ?? ''}
                      onChange={e => setCostesForm(p => ({
                        ...p,
                        reforma_override: e.target.value === '' ? null : parseFloat(e.target.value) || 0,
                      }))}
                      placeholder={`${sumReformaUns} (desde unidades)`}
                      className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                    {costesForm.reforma_override != null && (
                      <button onClick={() => setCostesForm(p => ({ ...p, reforma_override: null }))}
                        className="text-[11px] mt-1.5 font-bold" style={{ color: '#F26E1F' }}>
                        ↺ Usar suma de unidades
                      </button>
                    )}
                  </div>

                  {[
                    { key: 'licencia_obras', label: 'Licencia de obras (€)' },
                    { key: 'honorarios_tecnicos', label: 'Honorarios técnicos (arquitecto, etc.)' },
                    { key: 'deuda_ibi', label: 'Deuda IBI' },
                    { key: 'gastos_varios', label: 'Gastos varios' },
                  ].map(({ key, label }) => (
                    <div key={key}>
                      <label className="block text-[11px] font-bold mb-1.5" style={{ color: '#666' }}>{label}</label>
                      <input
                        type="number"
                        value={(costesForm as Record<string, number | null | undefined>)[key] || ''}
                        onChange={e => setCostesForm(p => ({
                          ...p, [key]: parseFloat(e.target.value) || 0,
                        }))}
                        placeholder="0"
                        className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none" style={INP} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Duración */}
              <div className="mb-4">
                <label className="block text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>
                  Duración estimada (meses)
                </label>
                <input type="number" value={duracionMeses || ''}
                  onChange={e => setDuracionMeses(parseInt(e.target.value) || 0)}
                  placeholder="18" className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
              </div>

              {/* Precios de venta */}
              <div className="mb-4">
                <div className="text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>
                  Escenarios de venta
                  {sumVentaUns > 0 && (
                    <span className="ml-2 normal-case font-medium" style={{ color: '#444' }}>
                      (Σ unidades: {fmt(sumVentaUns)})
                    </span>
                  )}
                </div>
                <div className="space-y-2">
                  {[
                    { label: 'Conservador (×0.9)', state: pvPes, setter: setPvPes, auto: Math.round(sumVentaUns * 0.9), color: '#888' },
                    { label: 'Realista', state: pvReal, setter: setPvReal, auto: sumVentaUns, color: '#F26E1F' },
                    { label: 'Optimista (×1.1)', state: pvOpt, setter: setPvOpt, auto: Math.round(sumVentaUns * 1.1), color: '#22C55E' },
                  ].map(({ label, state, setter, auto, color }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[12px] font-bold" style={{ color }}>{label}</label>
                        {sumVentaUns > 0 && state !== auto && (
                          <button onClick={() => setter(auto)}
                            className="text-[10px] font-bold" style={{ color: '#555' }}>
                            ↺ {fmt(auto)}
                          </button>
                        )}
                      </div>
                      <input type="number" value={state || ''}
                        onChange={e => setter(parseFloat(e.target.value) || 0)}
                        placeholder={auto > 0 ? String(auto) : '0'}
                        className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none" style={INP} />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tabla resultados */}
              {resCalc && (resCalc.pes || resCalc.real || resCalc.opt) && (() => {
                const rows = [
                  { label: 'Conservador', r: resCalc.pes, pv: pvPes, color: '#888' },
                  { label: 'Realista',    r: resCalc.real, pv: pvReal, color: '#F26E1F' },
                  { label: 'Optimista',   r: resCalc.opt, pv: pvOpt, color: '#22C55E' },
                ]
                const semReal = resCalc.real ? roiSemaforo(resCalc.real.roi) : null
                return (
                  <div className="mb-5">
                    <div className="text-[11px] font-black uppercase mb-2" style={{ color: '#555' }}>Resultados</div>
                    <div className="rounded-xl overflow-hidden" style={{ background: '#1E1E1E' }}>
                      <div className="grid grid-cols-4 gap-0 px-3 py-2"
                        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                        {['Escenario', 'Venta', 'Beneficio', 'ROI'].map(h => (
                          <div key={h} className="text-[10px] font-black uppercase" style={{ color: '#555' }}>{h}</div>
                        ))}
                      </div>
                      {rows.map(({ label, r, pv, color }) => r ? (
                        <div key={label} className="grid grid-cols-4 gap-0 px-3 py-2.5"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <div className="text-[12px] font-black" style={{ color }}>{label}</div>
                          <div className="text-[12px] font-bold text-white">{fmt(pv)}</div>
                          <div className="text-[12px] font-bold"
                            style={{ color: r.beneficio >= 0 ? '#22C55E' : '#EF4444' }}>
                            {fmt(r.beneficio)}
                          </div>
                          <div className="text-[12px] font-black"
                            style={{ color: r.roi >= 30 ? '#22C55E' : r.roi >= 15 ? '#F59E0B' : '#EF4444' }}>
                            {fmtPct(r.roi)}
                          </div>
                        </div>
                      ) : null)}
                    </div>

                    {/* Inversión total */}
                    {resCalc.real && (
                      <div className="mt-2 px-3 py-2 rounded-xl flex items-center justify-between"
                        style={{ background: '#1A1A1A' }}>
                        <span className="text-[12px] font-bold" style={{ color: '#666' }}>Total inversión</span>
                        <span className="text-[13px] font-black text-white">{fmt(resCalc.real.total_inversion)}</span>
                      </div>
                    )}

                    {/* Semáforo */}
                    {semReal && resCalc.real && (
                      <div className="mt-3 p-4 rounded-xl flex items-center gap-3"
                        style={{ background: semReal.color + '18', border: `1px solid ${semReal.color}44` }}>
                        <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: semReal.color }} />
                        <div>
                          <div className="text-[13px] font-black" style={{ color: semReal.color }}>
                            ROI realista: {fmtPct(resCalc.real.roi)}
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#888' }}>{semReal.label}</div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })()}

              <div className="flex gap-2">
                <button onClick={() => setCalcEdificioId(null)}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black"
                  style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveCalculadora} disabled={savingCalc}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{ background: '#F26E1F' }}>
                  {savingCalc ? 'Guardando...' : 'Guardar análisis'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Sub-componentes ──────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function EdificioCard({
  edificio: e, unidades, onLoadUnidades, onEditar, onEliminar, onUnidades, onPasarEstudio, isRadar,
}: {
  edificio: Edificio
  unidades?: Unidad[]
  onLoadUnidades: () => void
  onEditar: () => void
  onEliminar: () => void
  onUnidades: () => void
  onPasarEstudio: () => void
  isRadar?: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  const toggleExpand = () => {
    if (!expanded) onLoadUnidades()
    setExpanded(v => !v)
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.07)' }}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex-1 min-w-0">
            <div className="font-black text-[15px] text-white truncate">
              {e.titulo || e.direccion}
            </div>
            {e.titulo && (
              <div className="text-[12px] mt-0.5 truncate" style={{ color: '#666' }}>{e.direccion}</div>
            )}
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {e.ciudad && <span className="text-[11px]" style={{ color: '#555' }}>{e.ciudad}</span>}
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{
                  background: e.tipo_finca === 'bloque_independiente' ? 'rgba(96,165,250,0.15)' : 'rgba(34,197,94,0.12)',
                  color: e.tipo_finca === 'bloque_independiente' ? '#60A5FA' : '#22C55E',
                }}>
                {e.tipo_finca === 'bloque_independiente' ? 'Bloque indep.' : 'Finca única'}
              </span>
              {e.fuente && <span className="text-[10px]" style={{ color: '#444' }}>{e.fuente}</span>}
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <div className="font-black text-[16px] text-white">{fmt(e.precio_compra)}</div>
            {e.superficie_total && (
              <div className="text-[11px] mt-0.5" style={{ color: '#666' }}>{e.superficie_total} m²</div>
            )}
            {e.num_plantas && (
              <div className="text-[11px]" style={{ color: '#555' }}>{e.num_plantas} plantas</div>
            )}
          </div>
        </div>

        {e.notas && (
          <div className="text-[12px] mb-3 leading-relaxed" style={{ color: '#666' }}>{e.notas}</div>
        )}

        {/* Acciones radar */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={onPasarEstudio}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-black text-white"
            style={{ background: '#F26E1F', minWidth: 100 }}>
            Pasar a Estudio
          </button>
          <button onClick={onUnidades}
            className="flex-1 py-2.5 rounded-xl text-[12px] font-black"
            style={{ background: '#1E1E1E', color: '#aaa', minWidth: 80 }}>
            Unidades {unidades ? `(${unidades.length})` : ''}
          </button>
          <button onClick={onEditar}
            className="px-3 py-2.5 rounded-xl text-[12px] font-black"
            style={{ background: '#1E1E1E', color: '#888' }}>
            ✏️
          </button>
          <button onClick={onEliminar}
            className="px-3 py-2.5 rounded-xl text-[12px] font-black"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
            🗑
          </button>
        </div>

        {/* Expandir unidades en radar */}
        {unidades && unidades.length > 0 && (
          <button onClick={toggleExpand}
            className="w-full mt-2 py-2 rounded-xl text-[11px] font-bold"
            style={{ background: '#1A1A1A', color: '#555' }}>
            {expanded ? '▲ Ocultar unidades' : `▼ Ver ${unidades.length} unidades`}
          </button>
        )}
      </div>

      {expanded && unidades && unidades.length > 0 && (
        <div className="px-4 pb-4 space-y-1.5"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="pt-3 pb-1 text-[10px] font-black uppercase" style={{ color: '#444' }}>Unidades</div>
          {unidades.map(u => (
            <div key={u.id} className="flex items-center justify-between rounded-xl px-3 py-2"
              style={{ background: '#1A1A1A' }}>
              <div className="flex items-center gap-2 text-[12px]">
                <span className="font-bold" style={{ color: '#888' }}>{TIPO_UNIDAD_LABEL[u.tipo]}</span>
                {u.planta && <span style={{ color: '#555' }}>P{u.planta}</span>}
                {u.superficie && <span style={{ color: '#555' }}>{u.superficie}m²</span>}
                {u.origen === 'proyectada' && (
                  <span className="text-[10px] font-bold" style={{ color: '#a78bfa' }}>proj.</span>
                )}
                {u.ocupacion === 'arrendado' && (
                  <span className="text-[10px] font-bold" style={{ color: '#F59E0B' }}>arrendado</span>
                )}
              </div>
              {u.precio_venta_est ? (
                <span className="text-[12px] font-black" style={{ color: '#F26E1F' }}>{fmt(u.precio_venta_est)}</span>
              ) : null}
            </div>
          ))}
          <div className="flex justify-between pt-1.5 text-[11px] font-black"
            style={{ color: '#666' }}>
            <span>Total venta estimada</span>
            <span style={{ color: '#F26E1F' }}>
              {fmt(unidades.reduce((a, u) => a + (u.precio_venta_est || 0), 0))}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
