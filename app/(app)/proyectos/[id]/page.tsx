'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TABS = ['Finanzas','Reforma','Pendientes','Bitácora','Inversor','Docs']
const ESTADO_COLOR: Record<string,string> = { captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B', comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', cerrado:'#22C55E' }
const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n)
const fmtK = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

const CATEGORIAS_MOV = ['Materiales','Mano de obra','Honorarios','Impuestos','Venta','Arras','Compra','Reforma','Otros']
const ESTADO_PARTIDA: Record<string,{c:string;bg:string;label:string}> = {
  pendiente:  { c:'#888',     bg:'rgba(255,255,255,0.06)',   label:'Pendiente' },
  en_curso:   { c:'#60A5FA', bg:'rgba(96,165,250,0.15)',   label:'En curso' },
  ok:         { c:'#22C55E', bg:'rgba(34,197,94,0.15)',    label:'OK ✓' },
  retrasada:  { c:'#F59E0B', bg:'rgba(245,158,11,0.18)',   label:'Retrasada' },
}

type Movimiento = {
  id: string; fecha: string; tipo: string; categoria: string; concepto: string; descripcion?: string
  proveedor?: string; cantidad?: number; precio_unitario?: number; monto: number; total?: number
  forma_pago?: string; cuenta?: string; numero_factura?: string; observaciones?: string
}
type Partida = {
  id: string; nombre: string; categoria: string; estado: string
  presupuesto: number; ejecutado: number; orden: number; notas?: string
  fecha_inicio?: string; fecha_fin_estimada?: string; fecha_fin_real?: string
  depende_de?: string
}

const emptyForm = () => ({
  fecha: new Date().toISOString().split('T')[0],
  tipo: 'Gasto',
  categoria: 'Materiales',
  descripcion: '',
  proveedor: '',
  cantidad: '',
  precio_unitario: '',
  total: '',
  forma_pago: '',
  observaciones: '',
  cuenta: '',
  numero_factura: '',
})

export default function ProyectoDetalle() {
  const { id } = useParams()
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [proyecto, setProyecto] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [partidas, setPartidas] = useState<Partida[]>([])
  const [tareas, setTareas] = useState<any[]>([])
  const [bitacora, setBitacora] = useState<any[]>([])
  const [inversor, setInversor] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Movimientos
  const [showMovForm, setShowMovForm] = useState(false)
  const [editingMovId, setEditingMovId] = useState<string|null>(null)
  const [movForm, setMovForm] = useState(emptyForm())
  const [savingMov, setSavingMov] = useState(false)
  const [tablaExpandida, setTablaExpandida] = useState(false)

  // Partidas
  const [showPartidaForm, setShowPartidaForm] = useState(false)
  const [editingPartidaId, setEditingPartidaId] = useState<string|null>(null)
  const [nuevaPartida, setNuevaPartida] = useState({ nombre:'', categoria:'obra', presupuesto:'', ejecutado:'', fecha_inicio:'', fecha_fin_estimada:'', fecha_fin_real:'', depende_de:'' })
  const [savingPartida, setSavingPartida] = useState(false)
  const [reformaVista, setReformaVista] = useState<'tabla'|'gantt'>('tabla')

  // Tareas
  const [showTareaForm, setShowTareaForm] = useState(false)
  const [editingTareaId, setEditingTareaId] = useState<string|null>(null)
  const [tareaForm, setTareaForm] = useState({ titulo:'', prioridad:'Media', estado:'Pendiente', fecha_limite:'', asignado_a:'' })
  const [savingTarea, setSavingTarea] = useState(false)

  // Bitácora
  const [showBitacoraForm, setShowBitacoraForm] = useState(false)
  const [editingBitacoraId, setEditingBitacoraId] = useState<string|null>(null)
  const [bitacoraForm, setBitacoraForm] = useState({ contenido:'', autor:'', tipo:'nota' })
  const [savingBitacora, setSavingBitacora] = useState(false)

  // Docs
  const [showDocForm, setShowDocForm] = useState(false)
  const [docForm, setDocForm] = useState({ nombre:'', url:'', tipo:'' })
  const [savingDoc, setSavingDoc] = useState(false)

  const loadMovimientos = async () => {
    const { data } = await supabase.from('movimientos').select('*').eq('proyecto_id', id).order('fecha', { ascending: false })
    setMovimientos(data || [])
  }

  const loadPartidas = async () => {
    const { data } = await supabase.from('partidas_reforma').select('*').eq('proyecto_id', id).order('orden')
    setPartidas(data || [])
  }

  useEffect(() => {
    if (!id) return
    Promise.all([
      supabase.from('proyectos').select('*').eq('id', id).single(),
      supabase.from('movimientos').select('*').eq('proyecto_id', id).order('fecha', { ascending: false }),
      supabase.from('partidas_reforma').select('*').eq('proyecto_id', id).order('orden'),
      supabase.from('tareas').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
      supabase.from('bitacora').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
      supabase.from('proyecto_inversores').select('*, inversores(nombre, email)').eq('proyecto_id', id).single(),
      supabase.from('documentos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
    ]).then(([p, m, pa, t, b, inv, d]) => {
      setProyecto(p.data)
      setMovimientos(m.data || [])
      setPartidas(pa.data || [])
      setTareas(t.data || [])
      setBitacora(b.data || [])
      setInversor(inv.data)
      setDocs(d.data || [])
      setLoading(false)
    })
  }, [id])

  // ─── Movimientos handlers ────────────────────────────────
  const openMovForm = (m?: Movimiento) => {
    if (m) {
      setMovForm({
        fecha: m.fecha,
        tipo: m.tipo,
        categoria: m.categoria,
        descripcion: m.descripcion || m.concepto || '',
        proveedor: m.proveedor || '',
        cantidad: m.cantidad?.toString() || '',
        precio_unitario: m.precio_unitario?.toString() || '',
        total: Math.abs(m.monto || m.total || 0).toString(),
        forma_pago: m.forma_pago || '',
        observaciones: m.observaciones || '',
        cuenta: m.cuenta || '',
        numero_factura: m.numero_factura || '',
      })
      setEditingMovId(m.id)
    } else {
      setMovForm(emptyForm())
      setEditingMovId(null)
    }
    setShowMovForm(true)
  }

  const saveMov = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!movForm.descripcion.trim() && !movForm.total) return
    setSavingMov(true)
    const total = parseFloat(movForm.total) || 0
    const monto = movForm.tipo === 'Gasto' ? -Math.abs(total) : Math.abs(total)
    const data: any = {
      proyecto_id: id,
      fecha: movForm.fecha,
      tipo: movForm.tipo,
      categoria: movForm.categoria,
      concepto: movForm.descripcion,
      proveedor: movForm.proveedor || null,
      cantidad: parseFloat(movForm.cantidad) || null,
      precio_unitario: parseFloat(movForm.precio_unitario) || null,
      monto,
      forma_pago: movForm.forma_pago || null,
      observaciones: movForm.observaciones || null,
      cuenta: movForm.cuenta || null,
      numero_factura: movForm.numero_factura || null,
    }
    if (editingMovId) {
      await supabase.from('movimientos').update(data).eq('id', editingMovId)
    } else {
      await supabase.from('movimientos').insert([data])
    }
    await loadMovimientos()
    setShowMovForm(false)
    setMovForm(emptyForm())
    setEditingMovId(null)
    setSavingMov(false)
  }

  const deleteMov = async (id_mov: string) => {
    if (!confirm('¿Eliminar este movimiento?')) return
    await supabase.from('movimientos').delete().eq('id', id_mov)
    setMovimientos(m => m.filter(x => x.id !== id_mov))
  }

  // ─── Partidas handlers ───────────────────────────────────
  const openPartidaForm = (p?: Partida) => {
    if (p) {
      setNuevaPartida({
        nombre: p.nombre, categoria: p.categoria,
        presupuesto: p.presupuesto?.toString() || '', ejecutado: p.ejecutado?.toString() || '',
        fecha_inicio: p.fecha_inicio || '', fecha_fin_estimada: p.fecha_fin_estimada || '',
        fecha_fin_real: p.fecha_fin_real || '', depende_de: p.depende_de || '',
      })
      setEditingPartidaId(p.id)
    } else {
      setNuevaPartida({ nombre:'', categoria:'obra', presupuesto:'', ejecutado:'', fecha_inicio:'', fecha_fin_estimada:'', fecha_fin_real:'', depende_de:'' })
      setEditingPartidaId(null)
    }
    setShowPartidaForm(true)
  }

  const savePartida = async () => {
    if (!nuevaPartida.nombre.trim()) return
    setSavingPartida(true)
    const data: any = {
      proyecto_id: id,
      nombre: nuevaPartida.nombre,
      categoria: nuevaPartida.categoria,
      presupuesto: parseFloat(nuevaPartida.presupuesto) || 0,
      ejecutado: parseFloat(nuevaPartida.ejecutado) || 0,
      fecha_inicio: nuevaPartida.fecha_inicio || null,
      fecha_fin_estimada: nuevaPartida.fecha_fin_estimada || null,
      fecha_fin_real: nuevaPartida.fecha_fin_real || null,
      depende_de: nuevaPartida.depende_de || null,
    }
    if (editingPartidaId) {
      await supabase.from('partidas_reforma').update(data).eq('id', editingPartidaId)
    } else {
      data.orden = partidas.length + 1
      await supabase.from('partidas_reforma').insert([data])
    }
    await loadPartidas()
    setShowPartidaForm(false)
    setNuevaPartida({ nombre:'', categoria:'obra', presupuesto:'', ejecutado:'', fecha_inicio:'', fecha_fin_estimada:'', fecha_fin_real:'', depende_de:'' })
    setEditingPartidaId(null)
    setSavingPartida(false)
  }

  const deletePartida = async (pid: string) => {
    if (!confirm('¿Eliminar esta partida?')) return
    await supabase.from('partidas_reforma').delete().eq('id', pid)
    setPartidas(p => p.filter(x => x.id !== pid))
  }

  const cambiarEstadoPartida = async (pid: string, estado: string) => {
    await supabase.from('partidas_reforma').update({ estado }).eq('id', pid)
    setPartidas(p => p.map(x => x.id === pid ? { ...x, estado } : x))
  }

  const openTareaForm = (t?: any) => {
    if (t) {
      setTareaForm({ titulo: t.titulo, prioridad: t.prioridad, estado: t.estado, fecha_limite: t.fecha_limite || '', asignado_a: t.asignado_a || '' })
      setEditingTareaId(t.id)
    } else {
      setTareaForm({ titulo:'', prioridad:'Media', estado:'Pendiente', fecha_limite:'', asignado_a:'' })
      setEditingTareaId(null)
    }
    setShowTareaForm(true)
  }

  const saveTarea = async () => {
    if (!tareaForm.titulo.trim()) return
    setSavingTarea(true)
    const payload = {
      titulo: tareaForm.titulo,
      prioridad: tareaForm.prioridad,
      estado: tareaForm.estado,
      fecha_limite: tareaForm.fecha_limite || null,
      asignado_a: tareaForm.asignado_a || null,
    }
    if (editingTareaId) {
      await supabase.from('tareas').update(payload).eq('id', editingTareaId)
    } else {
      await supabase.from('tareas').insert([{ ...payload, proyecto_id: id }])
    }
    const { data } = await supabase.from('tareas').select('*').eq('proyecto_id', id).order('created_at', { ascending: false })
    setTareas(data || [])
    setTareaForm({ titulo:'', prioridad:'Media', estado:'Pendiente', fecha_limite:'', asignado_a:'' })
    setEditingTareaId(null)
    setShowTareaForm(false)
    setSavingTarea(false)
  }

  const deleteTarea = async (tid: string) => {
    if (!confirm('¿Eliminar esta tarea?')) return
    await supabase.from('tareas').delete().eq('id', tid)
    setTareas(t => t.filter(x => x.id !== tid))
  }

  const openBitacoraForm = (b?: any) => {
    if (b) {
      setBitacoraForm({ contenido: b.contenido, autor: b.autor || '', tipo: b.tipo || 'nota' })
      setEditingBitacoraId(b.id)
    } else {
      setBitacoraForm({ contenido:'', autor:'', tipo:'nota' })
      setEditingBitacoraId(null)
    }
    setShowBitacoraForm(true)
  }

  const saveBitacoraEntry = async () => {
    if (!bitacoraForm.contenido.trim()) return
    setSavingBitacora(true)
    const payload = {
      contenido: bitacoraForm.contenido,
      autor: bitacoraForm.autor || 'Usuario',
      tipo: bitacoraForm.tipo,
    }
    if (editingBitacoraId) {
      await supabase.from('bitacora').update(payload).eq('id', editingBitacoraId)
    } else {
      await supabase.from('bitacora').insert([{ ...payload, proyecto_id: id }])
    }
    const { data } = await supabase.from('bitacora').select('*').eq('proyecto_id', id).order('created_at', { ascending: false })
    setBitacora(data || [])
    setBitacoraForm({ contenido:'', autor:'', tipo:'nota' })
    setEditingBitacoraId(null)
    setShowBitacoraForm(false)
    setSavingBitacora(false)
  }

  const deleteBitacora = async (bid: string) => {
    if (!confirm('¿Eliminar esta entrada?')) return
    await supabase.from('bitacora').delete().eq('id', bid)
    setBitacora(b => b.filter(x => x.id !== bid))
  }

  const saveDoc = async () => {
    if (!docForm.nombre.trim() || !docForm.url.trim()) return
    setSavingDoc(true)
    await supabase.from('documentos').insert([{
      proyecto_id: id,
      nombre: docForm.nombre,
      url: docForm.url,
      tipo: docForm.tipo || 'drive',
      subido_por: 'Usuario',
    }])
    const { data } = await supabase.from('documentos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false })
    setDocs(data || [])
    setDocForm({ nombre:'', url:'', tipo:'' })
    setShowDocForm(false)
    setSavingDoc(false)
  }

  const deleteDoc = async (docId: string) => {
    if (!confirm('¿Eliminar este documento?')) return
    await supabase.from('documentos').delete().eq('id', docId)
    setDocs(d => d.filter(x => x.id !== docId))
  }

  if (loading) return (
    <div className="p-4">
      <div className="h-8 w-32 rounded-lg animate-pulse mb-4" style={{ background: '#141414' }} />
      <div className="h-32 rounded-2xl animate-pulse" style={{ background: '#141414' }} />
    </div>
  )
  if (!proyecto) return <div className="p-4 text-center text-white">Proyecto no encontrado</div>

  const ingresos = movimientos.filter(m => m.monto > 0 || m.tipo === 'Ingreso').reduce((s, m) => s + Math.abs(m.monto || m.total || 0), 0)
  const gastos = movimientos.filter(m => m.monto < 0 || m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || m.total || 0), 0)
  const presupuestoTotal = partidas.reduce((s, p) => s + (p.presupuesto || 0), 0)
  const ejecutadoTotal = partidas.reduce((s, p) => s + (p.ejecutado || 0), 0)

  const tareasPrioridad = (p: string) => tareas.filter(t => t.prioridad === p && t.estado !== 'Completada')
  const tareasHechas = tareas.filter(t => t.estado === 'Completada')

  const CARD = { background: '#141414', border: '1px solid rgba(255,255,255,0.10)' }
  const INPUT_STYLE = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.12)', color: '#fff' }

  // Alert detection for reforma tab
  const today = new Date().toISOString().split('T')[0]
  const partidasRetrasadas = partidas.filter(p => p.estado === 'retrasada')
  const partidasVencidas = partidas.filter(p =>
    p.estado !== 'ok' && p.fecha_fin_estimada && p.fecha_fin_estimada < today
  )
  const partidasBloqueadas = partidas.filter(p => {
    if (!p.depende_de) return false
    const dep = partidas.find(x => x.id === p.depende_de)
    return dep && dep.estado !== 'ok' && p.estado !== 'ok'
  })
  const alertPartidas = [...new Set([...partidasRetrasadas, ...partidasVencidas, ...partidasBloqueadas])]

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      <button onClick={() => router.back()} className="flex items-center gap-1.5 mb-4 text-sm font-bold text-white opacity-60 hover:opacity-100">
        ← Volver
      </button>

      {/* Hero */}
      <div className="rounded-2xl p-4 mb-4 relative overflow-hidden" style={CARD}>
        <div className="absolute right-[-20px] top-[-20px] w-[100px] h-[100px] rounded-full" style={{ background: 'rgba(242,110,31,0.08)' }} />
        <div className="flex gap-3 items-start mb-4 relative">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(242,110,31,0.18)' }}>🏠</div>
          <div>
            <div className="font-black text-[22px] text-white leading-tight tracking-tight">{proyecto.nombre}</div>
            <div className="text-xs font-bold mt-1 text-white opacity-50">
              {proyecto.porcentaje_hasu < 100 ? `JV ${100-proyecto.porcentaje_hasu}%/${proyecto.porcentaje_hasu}% · ${proyecto.socio_nombre||'—'}` : '100% HASU'} · {proyecto.ciudad||'—'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 relative">
          {[
            { v: proyecto.estado ? proyecto.estado.charAt(0).toUpperCase()+proyecto.estado.slice(1) : '—', l:'Estado', c: ESTADO_COLOR[proyecto.estado]||'#fff' },
            { v: `${proyecto.avance_reforma||0}%`, l:'Avance', c:'#fff' },
            { v: proyecto.precio_venta_estimado ? fmtK(proyecto.precio_venta_estimado) : '—', l:'Venta est.', c:'#22C55E' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3 text-center" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="font-black text-[15px]" style={{ color: k.c }}>{k.v}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: '#888' }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto mb-4 -mx-4 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-bold whitespace-nowrap"
            style={{ color: tab===i ? '#F26E1F' : 'rgba(255,255,255,0.4)', borderBottom: tab===i ? '2.5px solid #F26E1F' : '2.5px solid transparent', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ Tab: FINANZAS ═══ */}
      {tab === 0 && (
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ingresos</div>
              <div className="font-black text-[22px] text-white">{fmtK(ingresos)}</div>
            </div>
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Gastos</div>
              <div className="font-black text-[22px]" style={{ color: '#EF4444' }}>{fmtK(gastos)}</div>
            </div>
          </div>

          {/* Tabla movimientos */}
          <div className="rounded-2xl overflow-hidden" style={CARD}>
            <div className="p-4 pb-0 flex items-center justify-between">
              <div className="font-black text-[15px] text-white">Movimientos <span style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>({movimientos.length})</span></div>
              <button onClick={() => openMovForm()}
                className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
                style={{ background:'#F26E1F' }}>
                + Agregar
              </button>
            </div>

            {movimientos.length === 0 ? (
              <div className="p-4 text-sm text-center" style={{ color:'rgba(255,255,255,0.3)' }}>Sin movimientos registrados</div>
            ) : (
              <div>
                {/* Vista compacta — 3 columnas sin scroll */}
                {!tablaExpandida && (
                  <div className="mt-2">
                    {/* Header */}
                    <div className="flex px-3 py-2" style={{ borderBottom:'1px solid rgba(255,255,255,0.08)', background:'#1E1E1E' }}>
                      <div style={{ width:72, flexShrink:0, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'rgba(255,255,255,0.4)' }}>Fecha</div>
                      <div style={{ flex:1, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'rgba(255,255,255,0.4)' }}>Concepto</div>
                      <div style={{ width:96, textAlign:'right', flexShrink:0, fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'rgba(255,255,255,0.4)' }}>Total</div>
                    </div>
                    {movimientos.map((m, i) => {
                      const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                      const total = Math.abs(m.monto || m.total || 0)
                      const montoColor = isIngreso ? '#22C55E' : '#EF4444'
                      return (
                        <div key={m.id} className="flex items-center px-3 py-2.5"
                          style={{ borderBottom: i < movimientos.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <div style={{ width:72, flexShrink:0, fontSize:12, fontWeight:500, color:'rgba(255,255,255,0.55)' }}>{m.fecha}</div>
                          <div style={{ flex:1, overflow:'hidden', paddingRight:8 }}>
                            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:13, fontWeight:500, color:'#FFFFFF' }}>
                              {m.concepto || m.descripcion}
                            </div>
                          </div>
                          <div style={{ width:96, flexShrink:0, textAlign:'right', fontSize:13, fontWeight:900, fontFamily:'monospace', color: montoColor, whiteSpace:'nowrap' }}>
                            {isIngreso ? '+' : '-'}{fmt(total)}
                          </div>
                        </div>
                      )
                    })}
                    {/* Footer totales */}
                    <div style={{ borderTop:'2px solid rgba(255,255,255,0.10)', background:'#1E1E1E' }}>
                      <div className="flex px-3 py-2">
                        <div style={{ flex:1, textAlign:'right', fontSize:12, fontWeight:700, color:'#FFFFFF', paddingRight:8 }}>Total gastos:</div>
                        <div style={{ width:96, textAlign:'right', fontSize:13, fontWeight:900, fontFamily:'monospace', color:'#EF4444' }}>-{fmt(gastos)}</div>
                      </div>
                      <div className="flex px-3 py-2" style={{ borderTop:'1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ flex:1, textAlign:'right', fontSize:12, fontWeight:700, color:'#FFFFFF', paddingRight:8 }}>Total ingresos:</div>
                        <div style={{ width:96, textAlign:'right', fontSize:13, fontWeight:900, fontFamily:'monospace', color:'#22C55E' }}>+{fmt(ingresos)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vista expandida — tabla completa con scroll */}
                {tablaExpandida && (
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full border-collapse" style={{ minWidth:900 }}>
                      <thead>
                        <tr style={{ background:'#1E1E1E' }}>
                          {['Fecha','Tipo','Cat.','Descripción','Proveedor','Cant.','P.Unit.','Total','Forma pago','Obs.','Acciones'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
                              style={{ color:'rgba(255,255,255,0.4)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, i) => {
                          const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                          const total = Math.abs(m.monto || m.total || 0)
                          const montoColor = isIngreso ? '#22C55E' : '#EF4444'
                          return (
                            <tr key={m.id} style={{ borderBottom: i < movimientos.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.6)', whiteSpace:'nowrap' }}>{m.fecha}</td>
                              <td style={{ padding:'10px 12px', fontSize:12, fontWeight:700, whiteSpace:'nowrap', color: montoColor }}>{isIngreso ? 'Ingreso' : 'Gasto'}</td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.6)', whiteSpace:'nowrap' }}>{m.categoria||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#FFFFFF', maxWidth:160 }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.concepto || m.descripcion}</div>
                              </td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.5)', whiteSpace:'nowrap' }}>{m.proveedor||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'right', whiteSpace:'nowrap' }}>{m.cantidad||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.5)', textAlign:'right', whiteSpace:'nowrap' }}>{m.precio_unitario ? fmt(m.precio_unitario) : '—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, fontWeight:900, fontFamily:'monospace', textAlign:'right', whiteSpace:'nowrap', color: montoColor }}>
                                {isIngreso ? '+' : '-'}{fmt(total)}
                              </td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.5)', whiteSpace:'nowrap' }}>{m.forma_pago||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:12, color:'rgba(255,255,255,0.5)', whiteSpace:'nowrap', maxWidth:100 }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.observaciones||'—'}</div>
                              </td>
                              <td style={{ padding:'10px 12px' }}>
                                <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                                  <button onClick={() => openMovForm(m)} style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'rgba(255,255,255,0.08)', color:'#FFFFFF', border:'none', cursor:'pointer' }}>✎</button>
                                  <button onClick={() => deleteMov(m.id)} style={{ fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'rgba(239,68,68,0.18)', color:'#EF4444', border:'none', cursor:'pointer' }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid rgba(255,255,255,0.10)', background:'#1E1E1E' }}>
                          <td colSpan={7} style={{ padding:'10px 12px', fontSize:13, fontWeight:700, textAlign:'right', color:'#FFFFFF' }}>Total gastos:</td>
                          <td style={{ padding:'10px 12px', fontSize:13, fontWeight:900, fontFamily:'monospace', textAlign:'right', color:'#EF4444' }}>-{fmt(gastos)}</td>
                          <td colSpan={3}></td>
                        </tr>
                        <tr style={{ borderTop:'1px solid rgba(255,255,255,0.06)', background:'#1E1E1E' }}>
                          <td colSpan={7} style={{ padding:'10px 12px', fontSize:13, fontWeight:700, textAlign:'right', color:'#FFFFFF' }}>Total ingresos:</td>
                          <td style={{ padding:'10px 12px', fontSize:13, fontWeight:900, fontFamily:'monospace', textAlign:'right', color:'#22C55E' }}>+{fmt(ingresos)}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Toggle */}
                <button onClick={() => setTablaExpandida(!tablaExpandida)}
                  style={{ width:'100%', padding:'11px 0', fontSize:12, fontWeight:900, textAlign:'center', background:'#FFFFFF', color:'#000000', borderTop:'1px solid rgba(255,255,255,0.1)', cursor:'pointer', border:'none' }}>
                  {tablaExpandida ? '▲ Vista compacta' : '▼ Ver tabla completa'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ Tab: REFORMA ═══ */}
      {tab === 1 && (
        <div>
          {alertPartidas.length > 0 && (
            <div className="rounded-xl p-3.5 mb-3 flex gap-3 items-start"
              style={{ background:'rgba(245,158,11,0.12)', border:'1px solid rgba(245,158,11,0.35)' }}>
              <span className="text-lg flex-shrink-0">⚠️</span>
              <div>
                <div className="text-sm font-black" style={{ color:'#F59E0B' }}>
                  {alertPartidas.length} partida{alertPartidas.length > 1 ? 's' : ''} con alertas
                </div>
                <div className="text-xs font-medium mt-1" style={{ color:'rgba(245,158,11,0.8)' }}>
                  {alertPartidas.map(p => p.nombre).join(' · ')}
                </div>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Presupuesto</div>
              <div className="font-black text-[22px] text-white">{fmtK(presupuestoTotal)}</div>
            </div>
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Ejecutado</div>
              <div className="font-black text-[22px]" style={{ color:'#F26E1F' }}>{fmtK(ejecutadoTotal)}</div>
              <div className="text-xs font-bold mt-1" style={{ color:'rgba(255,255,255,0.4)' }}>resta {fmtK(Math.max(0,presupuestoTotal-ejecutadoTotal))}</div>
            </div>
          </div>
          {/* Vista toggle */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setReformaVista('tabla')}
              className="flex-1 py-2 rounded-xl text-sm font-black"
              style={{ background: reformaVista==='tabla' ? '#F26E1F' : '#1E1E1E', color: reformaVista==='tabla' ? '#fff' : '#888' }}>
              Tabla
            </button>
            <button onClick={() => setReformaVista('gantt')}
              className="flex-1 py-2 rounded-xl text-sm font-black"
              style={{ background: reformaVista==='gantt' ? '#F26E1F' : '#1E1E1E', color: reformaVista==='gantt' ? '#fff' : '#888' }}>
              Timeline
            </button>
          </div>

          {/* ── Vista Gantt ── */}
          {reformaVista === 'gantt' && (() => {
            const conFechas = partidas.filter(p => p.fecha_inicio && p.fecha_fin_estimada)
            if (conFechas.length === 0) return (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ ...CARD, color:'rgba(255,255,255,0.3)' }}>
                Asigná fechas de inicio y fin a las partidas para ver el timeline
              </div>
            )
            const toMs = (d: string) => new Date(d).getTime()
            const allDates = conFechas.flatMap(p => [toMs(p.fecha_inicio!), toMs(p.fecha_fin_estimada!)])
            const minMs = Math.min(...allDates)
            const maxMs = Math.max(...allDates)
            const totalMs = maxMs - minMs || 1
            const todayMs = new Date().setHours(0,0,0,0)
            const todayPct = Math.min(100, Math.max(0, ((todayMs - minMs) / totalMs) * 100))
            const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('es-ES',{day:'2-digit',month:'short'})
            const BAR_COLOR: Record<string,string> = { ok:'#22C55E', retrasada:'#EF4444', en_curso:'#F26E1F', pendiente:'#888' }
            return (
              <div className="rounded-2xl overflow-hidden" style={CARD}>
                {/* Eje de fechas */}
                <div className="flex px-4 pt-3 pb-1" style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ width:130, flexShrink:0 }} />
                  <div className="flex-1 relative" style={{ height:16 }}>
                    <span className="absolute left-0 text-[10px] font-bold" style={{ color:'#888' }}>{fmtDate(minMs)}</span>
                    <span className="absolute right-0 text-[10px] font-bold" style={{ color:'#888' }}>{fmtDate(maxMs)}</span>
                  </div>
                </div>
                {/* Filas */}
                <div>
                  {partidas.map((p, i) => {
                    const hasDates = p.fecha_inicio && p.fecha_fin_estimada
                    const left = hasDates ? ((toMs(p.fecha_inicio!) - minMs) / totalMs) * 100 : 0
                    const width = hasDates ? ((toMs(p.fecha_fin_estimada!) - toMs(p.fecha_inicio!)) / totalMs) * 100 : 0
                    const color = BAR_COLOR[p.estado] || '#888'
                    const dep = p.depende_de ? partidas.find(x => x.id === p.depende_de) : null
                    return (
                      <div key={p.id} className="flex items-center px-4 py-2"
                        style={{ borderBottom: i < partidas.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        {/* Nombre */}
                        <div style={{ width:130, flexShrink:0, paddingRight:8 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre}</div>
                          {dep && <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:1 }}>↳ {dep.nombre}</div>}
                        </div>
                        {/* Canvas barra */}
                        <div className="flex-1 relative" style={{ height:22, background:'rgba(255,255,255,0.04)', borderRadius:4 }}>
                          {/* Línea hoy */}
                          {todayMs >= minMs && todayMs <= maxMs && (
                            <div style={{ position:'absolute', left:`${todayPct}%`, top:0, bottom:0, width:1.5, background:'rgba(255,255,255,0.25)', zIndex:2 }} />
                          )}
                          {hasDates ? (
                            <div style={{
                              position:'absolute',
                              left:`${left}%`,
                              width:`${Math.max(width, 1.5)}%`,
                              top:3, bottom:3,
                              borderRadius:3,
                              background: color,
                              opacity: p.estado === 'ok' ? 0.85 : 1,
                            }} />
                          ) : (
                            <div style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'rgba(255,255,255,0.2)', fontStyle:'italic' }}>sin fechas</div>
                          )}
                        </div>
                        {/* Estado pill */}
                        <div style={{ width:68, flexShrink:0, textAlign:'right' }}>
                          <span style={{ fontSize:10, fontWeight:700, color, background:`${color}22`, padding:'2px 6px', borderRadius:4 }}>
                            {ESTADO_PARTIDA[p.estado]?.label || p.estado}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Leyenda */}
                <div className="flex gap-4 px-4 py-2.5" style={{ borderTop:'1px solid rgba(255,255,255,0.08)', background:'#1E1E1E' }}>
                  {Object.entries(BAR_COLOR).map(([k,c]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                      <span style={{ fontSize:10, fontWeight:700, color:'#888', textTransform:'capitalize' }}>{k}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <div style={{ width:2, height:10, background:'rgba(255,255,255,0.3)' }} />
                    <span style={{ fontSize:10, fontWeight:700, color:'#888' }}>hoy</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Vista Tabla ── */}
          {reformaVista === 'tabla' && <div className="rounded-2xl overflow-hidden" style={CARD}>
            <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              <div className="font-black text-[15px] text-white">Partidas <span style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>({partidas.length})</span></div>
              <button onClick={() => openPartidaForm()}
                className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
                style={{ background:'#F26E1F' }}>
                + Partida
              </button>
            </div>
            {partidas.length === 0 ? (
              <div className="text-sm text-center py-8" style={{ color:'rgba(255,255,255,0.3)' }}>Sin partidas de reforma</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth:520 }}>
                  <thead>
                    <tr style={{ background:'#1E1E1E' }}>
                      {['Partida','Categoría','Estado','Presupuesto','Ejecutado','%','Acciones'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
                          style={{ color:'rgba(255,255,255,0.4)', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partidas.map((p, i) => {
                      const pct = p.presupuesto > 0 ? Math.round((p.ejecutado/p.presupuesto)*100) : 0
                      const col = pct >= 100 ? '#22C55E' : pct > 50 ? '#F59E0B' : '#EF4444'
                      const ep = ESTADO_PARTIDA[p.estado] || ESTADO_PARTIDA.pendiente
                      return (
                        <tr key={p.id} style={{ borderBottom: i < partidas.length-1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <td className="px-3 py-3 text-sm font-bold text-white">{p.nombre}</td>
                          <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color:'rgba(255,255,255,0.5)' }}>{p.categoria}</td>
                          <td className="px-3 py-3">
                            <select value={p.estado}
                              onChange={e => cambiarEstadoPartida(p.id, e.target.value)}
                              className="text-[11px] font-bold px-2 py-1 rounded-full outline-none cursor-pointer"
                              style={{ background:ep.bg, color:ep.c, border:`1px solid ${ep.c}33` }}>
                              <option value="pendiente">Pendiente</option>
                              <option value="en_curso">En curso</option>
                              <option value="ok">OK ✓</option>
                              <option value="retrasada">Retrasada</option>
                            </select>
                          </td>
                          <td className="px-3 py-3 text-sm font-mono text-right text-white whitespace-nowrap">{fmt(p.presupuesto||0)}</td>
                          <td className="px-3 py-3 text-sm font-mono text-right whitespace-nowrap" style={{ color:'#F26E1F' }}>{fmt(p.ejecutado||0)}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full overflow-hidden flex-shrink-0" style={{ background:'#282828' }}>
                                <div className="h-full rounded-full" style={{ width:`${Math.min(pct,100)}%`, background:col }} />
                              </div>
                              <span className="text-xs font-black whitespace-nowrap" style={{ color:col }}>{pct}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex gap-1.5">
                              <button onClick={() => openPartidaForm(p)} className="text-xs font-bold px-2 py-1 rounded-lg text-white" style={{ background:'rgba(255,255,255,0.08)' }}>✎</button>
                              <button onClick={() => deletePartida(p.id)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid rgba(255,255,255,0.10)', background:'#1E1E1E' }}>
                      <td colSpan={3} className="px-3 py-2.5 text-sm font-bold text-right text-white">Totales:</td>
                      <td className="px-3 py-2.5 text-sm font-black font-mono text-right text-white">{fmt(presupuestoTotal)}</td>
                      <td className="px-3 py-2.5 text-sm font-black font-mono text-right" style={{ color:'#F26E1F' }}>{fmt(ejecutadoTotal)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>}
        </div>
      )}

      {/* ═══ Tab: PENDIENTES ═══ */}
      {tab === 2 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => openTareaForm()}
              className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
              style={{ background:'#F26E1F' }}>
              + Agregar
            </button>
          </div>
          {['Alta','Media','Baja'].map(p => {
            const ts = tareasPrioridad(p)
            if (ts.length === 0) return null
            return (
              <div key={p} className="mb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="font-black text-[15px] text-white">{p} prioridad</div>
                </div>
                {ts.map(t => (
                  <div key={t.id} className="rounded-xl p-3.5 mb-2 flex gap-2.5 items-center" style={CARD}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p==='Alta'?'#EF4444':p==='Media'?'#F59E0B':'#888' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white">{t.titulo}</div>
                      <div className="text-xs font-medium mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{t.asignado_a||'Sin asignar'}{t.fecha_limite?` · ${t.fecha_limite}`:''}</div>
                    </div>
                    <button onClick={() => openTareaForm(t)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background:'rgba(255,255,255,0.08)', color:'#fff' }}>✎</button>
                    <button onClick={() => deleteTarea(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                  </div>
                ))}
              </div>
            )
          })}
          {tareasHechas.length > 0 && (
            <>
              <div className="font-black text-[15px] mb-2.5 mt-2" style={{ color:'#22C55E' }}>Completado ✓</div>
              {tareasHechas.map(t => (
                <div key={t.id} className="rounded-xl p-3.5 mb-2 flex gap-2.5 items-center opacity-40" style={CARD}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background:'#22C55E' }} />
                  <div className="flex-1 text-sm font-semibold text-white">{t.titulo}</div>
                  <button onClick={() => deleteTarea(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                </div>
              ))}
            </>
          )}
          {tareas.length === 0 && <div className="text-center py-12 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>Sin tareas registradas</div>}
        </div>
      )}

      {/* ═══ Tab: BITÁCORA ═══ */}
      {tab === 3 && (
        <div className="rounded-2xl p-4" style={CARD}>
          <div className="flex items-center justify-between mb-4">
            <div className="font-black text-[15px] text-white">Historial</div>
            <button onClick={() => openBitacoraForm()}
              className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
              style={{ background:'#F26E1F' }}>
              + Agregar
            </button>
          </div>
          {bitacora.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>Sin entradas en bitácora</div>
          ) : (
            <div className="pl-5 relative">
              <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background:'#282828' }} />
              {bitacora.map(b => (
                <div key={b.id} className="relative mb-4">
                  <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background:'#F26E1F', border:'2px solid #0A0A0A' }} />
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[11px] font-bold font-mono tracking-wide" style={{ color:'rgba(255,255,255,0.4)' }}>
                      {new Date(b.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openBitacoraForm(b)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background:'rgba(255,255,255,0.08)', color:'#fff' }}>✎</button>
                      <button onClick={() => deleteBitacora(b.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-white leading-relaxed">{b.contenido}</div>
                  <div className="text-xs font-bold mt-1" style={{ color:'#F26E1F' }}>{b.autor}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab: INVERSOR ═══ */}
      {tab === 4 && (
        <div>
          {!inversor ? (
            <div className="text-center py-12 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>Sin inversor asociado</div>
          ) : (
            <>
              <div className="rounded-2xl p-4 mb-3" style={CARD}>
                <div className="font-black text-base text-white mb-0.5">{inversor.inversores?.nombre||'—'}</div>
                <div className="text-xs font-medium mb-4" style={{ color:'rgba(255,255,255,0.4)' }}>Portal inversor · {inversor.participacion}% participación</div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div className="rounded-xl p-3.5" style={CARD}>
                  <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Capital invertido</div>
                  <div className="font-black text-[22px] text-white">{fmtK(inversor.capital_invertido||0)}</div>
                </div>
                <div className="rounded-xl p-3.5" style={CARD}>
                  <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Retorno est.</div>
                  <div className="font-black text-[22px]" style={{ color:'#22C55E' }}>{fmtK(inversor.retorno_estimado||0)}</div>
                  <div className="text-xs font-bold mt-1" style={{ color:'rgba(255,255,255,0.4)' }}>ROI {inversor.roi||0}%</div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══ Tab: DOCS ═══ */}
      {tab === 5 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowDocForm(true)}
              className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
              style={{ background:'#F26E1F' }}>
              + Agregar link
            </button>
          </div>
          {docs.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>Sin documentos. Agregá links de Google Drive.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map(d => (
                <div key={d.id} className="rounded-xl p-3.5 flex gap-3 items-center justify-between" style={CARD}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 items-center flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0">📄</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">{d.nombre}</div>
                      {d.tipo && <div className="text-xs font-medium mt-0.5" style={{ color:'rgba(255,255,255,0.4)' }}>{d.tipo}</div>}
                    </div>
                    <span className="text-xs font-bold flex-shrink-0 px-2 py-1 rounded-lg" style={{ background:'rgba(242,110,31,0.18)', color:'#F26E1F' }}>Abrir →</span>
                  </a>
                  <button onClick={() => deleteDoc(d.id)} className="ml-2 flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─────── FORM: Movimiento ─────── */}
      {showMovForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowMovForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] overflow-y-auto"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto', maxHeight:'90vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
              <div className="flex justify-between items-center mb-5">
                <div className="font-black text-[17px] text-white">{editingMovId ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
                <button onClick={() => setShowMovForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
              </div>
              <form onSubmit={saveMov}>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha *</label>
                    <input type="date" required value={movForm.fecha} onChange={e => setMovForm(f=>({...f,fecha:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo *</label>
                    <select value={movForm.tipo} onChange={e => setMovForm(f=>({...f,tipo:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE}>
                      <option>Gasto</option><option>Ingreso</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Categoría *</label>
                    <select value={movForm.categoria} onChange={e => setMovForm(f=>({...f,categoria:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE}>
                      {CATEGORIAS_MOV.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Descripción *</label>
                    <input type="text" required value={movForm.descripcion} onChange={e => setMovForm(f=>({...f,descripcion:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Proveedor</label>
                    <input type="text" value={movForm.proveedor} onChange={e => setMovForm(f=>({...f,proveedor:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Cantidad</label>
                    <input type="number" step="0.01" value={movForm.cantidad}
                      onChange={e => {
                        const c = e.target.value
                        const total = c && movForm.precio_unitario ? (parseFloat(c)*parseFloat(movForm.precio_unitario)).toFixed(2) : movForm.total
                        setMovForm(f=>({...f,cantidad:c,total}))
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Precio unitario (€)</label>
                    <input type="number" step="0.01" value={movForm.precio_unitario}
                      onChange={e => {
                        const p = e.target.value
                        const total = p && movForm.cantidad ? (parseFloat(p)*parseFloat(movForm.cantidad)).toFixed(2) : movForm.total
                        setMovForm(f=>({...f,precio_unitario:p,total}))
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Total (€) *</label>
                    <input type="number" step="0.01" required value={movForm.total} onChange={e => setMovForm(f=>({...f,total:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-bold" style={{ ...INPUT_STYLE, borderColor:'rgba(242,110,31,0.5)' }} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Forma de pago</label>
                    <input type="text" value={movForm.forma_pago} onChange={e => setMovForm(f=>({...f,forma_pago:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nº Factura</label>
                    <input type="text" value={movForm.numero_factura} onChange={e => setMovForm(f=>({...f,numero_factura:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Observaciones</label>
                  <textarea rows={2} value={movForm.observaciones} onChange={e => setMovForm(f=>({...f,observaciones:e.target.value}))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={savingMov}
                    className="flex-1 py-4 text-white rounded-xl text-base font-black disabled:opacity-50"
                    style={{ background:'#F26E1F' }}>
                    {savingMov ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setShowMovForm(false)}
                    className="flex-1 py-4 rounded-xl text-base font-black text-white"
                    style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.12)' }}>
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}

      {/* ─────── FORM: Tarea ─────── */}
      {showTareaForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowTareaForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">{editingTareaId ? 'Editar tarea' : 'Nueva tarea'}</div>
              <button onClick={() => setShowTareaForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Título *</label>
                <input type="text" value={tareaForm.titulo} placeholder="Ej. Pedir presupuesto electricista"
                  onChange={e => setTareaForm(f=>({...f,titulo:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Prioridad</label>
                  <select value={tareaForm.prioridad} onChange={e => setTareaForm(f=>({...f,prioridad:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option>Alta</option><option>Media</option><option>Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Estado</label>
                  <select value={tareaForm.estado} onChange={e => setTareaForm(f=>({...f,estado:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option>Pendiente</option><option>En curso</option><option>Completada</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha límite</label>
                  <input type="date" value={tareaForm.fecha_limite} onChange={e => setTareaForm(f=>({...f,fecha_limite:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Asignado a</label>
                  <input type="text" value={tareaForm.asignado_a} placeholder="Nombre"
                    onChange={e => setTareaForm(f=>({...f,asignado_a:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
            </div>
            <button onClick={saveTarea} disabled={savingTarea || !tareaForm.titulo.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#F26E1F' }}>
              {savingTarea ? 'Guardando...' : editingTareaId ? 'Guardar cambios' : 'Agregar tarea'}
            </button>
          </div>
        </>
      )}

      {/* ─────── FORM: Bitácora ─────── */}
      {showBitacoraForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowBitacoraForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">{editingBitacoraId ? 'Editar entrada' : 'Nueva entrada'}</div>
              <button onClick={() => setShowBitacoraForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Contenido *</label>
                <textarea rows={4} value={bitacoraForm.contenido} placeholder="Descripción de lo que ocurrió..."
                  onChange={e => setBitacoraForm(f=>({...f,contenido:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Autor</label>
                  <input type="text" value={bitacoraForm.autor} placeholder="Tu nombre"
                    onChange={e => setBitacoraForm(f=>({...f,autor:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
                  <select value={bitacoraForm.tipo} onChange={e => setBitacoraForm(f=>({...f,tipo:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option value="nota">Nota</option>
                    <option value="hito">Hito</option>
                    <option value="alerta">Alerta</option>
                  </select>
                </div>
              </div>
            </div>
            <button onClick={saveBitacoraEntry} disabled={savingBitacora || !bitacoraForm.contenido.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#F26E1F' }}>
              {savingBitacora ? 'Guardando...' : editingBitacoraId ? 'Guardar cambios' : 'Guardar entrada'}
            </button>
          </div>
        </>
      )}

      {/* ─────── FORM: Doc ─────── */}
      {showDocForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowDocForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">Agregar documento</div>
              <button onClick={() => setShowDocForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={docForm.nombre} placeholder="Ej. Planos reforma cocina"
                  onChange={e => setDocForm(f=>({...f,nombre:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Link de Google Drive *</label>
                <input type="url" value={docForm.url} placeholder="https://drive.google.com/..."
                  onChange={e => setDocForm(f=>({...f,url:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
                <select value={docForm.tipo} onChange={e => setDocForm(f=>({...f,tipo:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                  <option value="">Drive</option>
                  <option value="planos">Planos</option>
                  <option value="contrato">Contrato</option>
                  <option value="presupuesto">Presupuesto</option>
                  <option value="factura">Factura</option>
                  <option value="foto">Fotos</option>
                  <option value="otros">Otros</option>
                </select>
              </div>
            </div>
            <button onClick={saveDoc} disabled={savingDoc || !docForm.nombre.trim() || !docForm.url.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#F26E1F' }}>
              {savingDoc ? 'Guardando...' : 'Agregar documento'}
            </button>
          </div>
        </>
      )}

      {/* ─────── FORM: Partida ─────── */}
      {showPartidaForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowPartidaForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">{editingPartidaId ? 'Editar partida' : 'Nueva partida'}</div>
              <button onClick={() => setShowPartidaForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={nuevaPartida.nombre} placeholder="Ej. Demolición interior"
                  onChange={e => setNuevaPartida(p=>({...p,nombre:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Categoría</label>
                <select value={nuevaPartida.categoria} onChange={e => setNuevaPartida(p=>({...p,categoria:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                  {['obra','materiales','mobiliario','electro','decoracion','otros'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Presupuesto (€)</label>
                  <input type="number" value={nuevaPartida.presupuesto} placeholder="0"
                    onChange={e => setNuevaPartida(p=>({...p,presupuesto:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Ejecutado (€)</label>
                  <input type="number" value={nuevaPartida.ejecutado} placeholder="0"
                    onChange={e => setNuevaPartida(p=>({...p,ejecutado:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Inicio</label>
                  <input type="date" value={nuevaPartida.fecha_inicio}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_inicio:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fin estimado</label>
                  <input type="date" value={nuevaPartida.fecha_fin_estimada}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_fin_estimada:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fin real</label>
                  <input type="date" value={nuevaPartida.fecha_fin_real}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_fin_real:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Depende de</label>
                  <select value={nuevaPartida.depende_de}
                    onChange={e => setNuevaPartida(p=>({...p,depende_de:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option value="">—</option>
                    {partidas.filter(p => p.id !== editingPartidaId).map(p => (
                      <option key={p.id} value={p.id}>{p.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <button onClick={savePartida} disabled={savingPartida || !nuevaPartida.nombre.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#F26E1F' }}>
              {savingPartida ? 'Guardando...' : editingPartidaId ? 'Actualizar partida' : 'Agregar partida'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
