'use client'
import React, { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import InmuebleCalculadora from '@/components/InmuebleCalculadora'
import RiesgosMatriz from '@/components/RiesgosMatriz'

const TABS = ['Finanzas','Reforma','Pendientes','Bitácora','Inversor','Docs','Comercialización','Análisis']


const ESTADOS_PROSPECTO = ['Contactado','Visita programada','Visita realizada','Oferta recibida','En negociación','Descartado']
const ESTADO_PROSPECTO_COLOR: Record<string,string> = {
  'Contactado':'#60A5FA','Visita programada':'#F59E0B','Visita realizada':'#a78bfa',
  'Oferta recibida':'#A6855A','En negociación':'#22C55E','Descartado':'#EF4444',
}
const TIPOS_INTERACCION = ['llamada','visita','mensaje','email','nota']
const ESTADO_COLOR: Record<string,string> = { captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B', comprado:'#22C55E', reforma:'#A6855A', venta:'#a78bfa', reservado:'#F59E0B', con_oferta:'#A6855A', en_arras:'#22C55E', patrimonial:'#3B82F6', vendido:'#22C55E', cerrado:'#22C55E' }
const ESTADO_LABEL_MAP: Record<string,string> = { captado:'Captado', analisis:'Análisis', ofertado:'Ofertado', comprado:'Comprado', reforma:'Reforma', venta:'En venta', reservado:'Reservado', con_oferta:'Ofertado', en_arras:'En arras', patrimonial:'Patrimonial (alquiler)', vendido:'Vendido', cerrado:'Vendido' }
const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',minimumFractionDigits:2}).format(n)
const fmtK = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

const CATEGORIAS_MOV = ['Materiales','Mano de obra','Honorarios','Impuestos','Venta','Arras','Compra','Reforma','Otros']
const ESTADO_PARTIDA: Record<string,{c:string;bg:string;label:string}> = {
  pendiente:  { c:'#888',     bg:'rgba(0,0,0,0.04)',   label:'Pendiente' },
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
type ItemPartida = {
  id: string; partida_id: string; nombre: string; orden: number
  estancia?: string; proveedor?: string; coste?: number
  fecha_compra?: string; nota?: string
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
  const [ibanEdit, setIbanEdit] = useState<string | null>(null)
  const [ibanSaving, setIbanSaving] = useState(false)
  const [inmueble, setInmueble] = useState<any>(null)
  const [savingInmueble, setSavingInmueble] = useState(false)

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
  const [expandedPartidas, setExpandedPartidas] = useState<Set<string>>(new Set())
  const [itemsByPartida, setItemsByPartida] = useState<Record<string, ItemPartida[]>>({})
  const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set())
  // Item form
  const [showItemForm, setShowItemForm] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string|null>(null)
  const [itemFormPartidaId, setItemFormPartidaId] = useState<string>('')
  const [itemForm, setItemForm] = useState({ nombre:'', estancia:'', proveedor:'', coste:'', fecha_compra:'', nota:'' })
  const [savingItem, setSavingItem] = useState(false)

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

  // Comercialización - Prospectos
  const [prospectos, setProspectos] = useState<any[]>([])
  const [interacciones, setInteracciones] = useState<Record<string, any[]>>({})
  const [expandedProspecto, setExpandedProspecto] = useState<string|null>(null)
  const [showProspectoForm, setShowProspectoForm] = useState(false)
  const [editingProspectoId, setEditingProspectoId] = useState<string|null>(null)
  const [prospectoForm, setProspectoForm] = useState({ nombre:'', telefono:'', email:'', estado:'Contactado', mejor_oferta:'', proxima_visita:'', notas:'' })
  const [savingProspecto, setSavingProspecto] = useState(false)
  const [showInteraccionForm, setShowInteraccionForm] = useState(false)
  const [interaccionProspectoId, setInteraccionProspectoId] = useState<string>('')
  const [interaccionForm, setInteraccionForm] = useState({ tipo:'llamada', fecha: new Date().toISOString().split('T')[0], nota:'' })
  const [savingInteraccion, setSavingInteraccion] = useState(false)
  const [catastroLoadingInmueble, setCatastroLoadingInmueble] = useState(false)
  const [catastroErrorInmueble, setCatastroErrorInmueble] = useState<string | null>(null)
  const [refCatastralInput, setRefCatastralInput] = useState('')
  const [savingRefCatastral, setSavingRefCatastral] = useState(false)

  const saveRefCatastral = async () => {
    if (!inmueble?.id || !refCatastralInput.trim()) return
    setSavingRefCatastral(true)
    const ref = refCatastralInput.trim()
    const { error } = await supabase.from('inmuebles').update({ referencia_catastral: ref }).eq('id', inmueble.id)
    if (!error) {
      setInmueble((prev: any) => ({ ...prev, referencia_catastral: ref }))
      // Auto-fetch catastro tras guardar
      setCatastroLoadingInmueble(true)
      setCatastroErrorInmueble(null)
      try {
        const res = await fetch(`/api/catastro/inmueble?id=${inmueble.id}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error obteniendo catastro')
        setInmueble((prev: any) => ({ ...prev, referencia_catastral: ref, datos_catastro: json.datos }))
      } catch (e: any) {
        setCatastroErrorInmueble(e.message)
      } finally {
        setCatastroLoadingInmueble(false)
      }
    }
    setSavingRefCatastral(false)
  }

  const fetchCatastroProyecto = async () => {
    if (!inmueble?.id || !inmueble?.referencia_catastral) return
    setCatastroLoadingInmueble(true)
    setCatastroErrorInmueble(null)
    try {
      const res = await fetch(`/api/catastro/inmueble?id=${inmueble.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error obteniendo catastro')
      setInmueble((prev: any) => ({ ...prev, datos_catastro: json.datos }))
    } catch (e: any) {
      setCatastroErrorInmueble(e.message)
    } finally {
      setCatastroLoadingInmueble(false)
    }
  }

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
      supabase.from('prospectos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false }),
      supabase.from('inmuebles').select('*').eq('proyecto_id', id).maybeSingle(),
    ]).then(([p, m, pa, t, b, inv, d, pr, inm]) => {
      setProyecto(p.data)
      setMovimientos(m.data || [])
      setPartidas(pa.data || [])
      setTareas(t.data || [])
      setBitacora(b.data || [])
      setInversor(inv.data)
      setDocs(d.data || [])
      setProspectos(pr.data || [])
      setInmueble(inm.data || null)
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
    let savedId: string | null = editingPartidaId
    if (editingPartidaId) {
      await supabase.from('partidas_reforma').update(data).eq('id', editingPartidaId)
    } else {
      data.orden = partidas.length + 1
      const { data: inserted } = await supabase.from('partidas_reforma').insert([data]).select('id').single()
      savedId = inserted?.id || null
    }

    // Sync to Google Calendar if partida has a fecha_inicio
    if (savedId && nuevaPartida.fecha_inicio) {
      authFetch('/api/google/create-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partida_id: savedId,
          proyecto_nombre: proyecto?.nombre || '',
          nombre: nuevaPartida.nombre,
          fecha_inicio: nuevaPartida.fecha_inicio,
          fecha_fin_estimada: nuevaPartida.fecha_fin_estimada || nuevaPartida.fecha_inicio,
        }),
      }).catch(() => {/* silent — GCal may not be connected */})
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
    // Remove GCal event silently
    authFetch('/api/google/create-event', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partida_id: pid }),
    }).catch(() => {})
  }

  const cambiarEstadoPartida = async (pid: string, estado: string) => {
    await supabase.from('partidas_reforma').update({ estado }).eq('id', pid)
    setPartidas(p => p.map(x => x.id === pid ? { ...x, estado } : x))
  }

  // ─── Items handlers ──────────────────────────────────────
  const togglePartida = async (pid: string) => {
    const next = new Set(expandedPartidas)
    if (next.has(pid)) {
      next.delete(pid)
      setExpandedPartidas(next)
    } else {
      next.add(pid)
      setExpandedPartidas(next)
      if (!itemsByPartida[pid]) {
        setLoadingItems(s => new Set(s).add(pid))
        const { data } = await supabase.from('items_partida').select('*').eq('partida_id', pid).order('orden')
        setItemsByPartida(m => ({ ...m, [pid]: data || [] }))
        setLoadingItems(s => { const ns = new Set(s); ns.delete(pid); return ns })
      }
    }
  }

  const openItemForm = (partidaId: string, item?: ItemPartida) => {
    setItemFormPartidaId(partidaId)
    if (item) {
      setItemForm({ nombre: item.nombre, estancia: item.estancia||'', proveedor: item.proveedor||'', coste: item.coste?.toString()||'', fecha_compra: item.fecha_compra||'', nota: item.nota||'' })
      setEditingItemId(item.id)
    } else {
      setItemForm({ nombre:'', estancia:'', proveedor:'', coste:'', fecha_compra:'', nota:'' })
      setEditingItemId(null)
    }
    setShowItemForm(true)
  }

  const saveItem = async () => {
    if (!itemForm.nombre.trim()) return
    setSavingItem(true)
    const payload: any = {
      partida_id:   itemFormPartidaId,
      nombre:       itemForm.nombre,
      estancia:     itemForm.estancia || null,
      proveedor:    itemForm.proveedor || null,
      coste:        parseFloat(itemForm.coste) || null,
      fecha_compra: itemForm.fecha_compra || null,
      nota:         itemForm.nota || null,
    }
    if (editingItemId) {
      await supabase.from('items_partida').update(payload).eq('id', editingItemId)
    } else {
      const existing = itemsByPartida[itemFormPartidaId] || []
      payload.orden = existing.length + 1
      await supabase.from('items_partida').insert([payload])
    }
    const { data } = await supabase.from('items_partida').select('*').eq('partida_id', itemFormPartidaId).order('orden')
    setItemsByPartida(m => ({ ...m, [itemFormPartidaId]: data || [] }))
    // Update partida presupuesto from sum of item costes
    const total = (data || []).reduce((s: number, it: ItemPartida) => s + (it.coste || 0), 0)
    if (total > 0) {
      await supabase.from('partidas_reforma').update({ presupuesto: total }).eq('id', itemFormPartidaId)
      setPartidas(p => p.map(x => x.id === itemFormPartidaId ? { ...x, presupuesto: total } : x))
    }
    setShowItemForm(false)
    setEditingItemId(null)
    setSavingItem(false)
  }

  const deleteItem = async (item: ItemPartida) => {
    if (!confirm('¿Eliminar este ítem?')) return
    await supabase.from('items_partida').delete().eq('id', item.id)
    const updated = (itemsByPartida[item.partida_id] || []).filter(x => x.id !== item.id)
    setItemsByPartida(m => ({ ...m, [item.partida_id]: updated }))
    const total = updated.reduce((s, it) => s + (it.coste || 0), 0)
    if (total >= 0) {
      await supabase.from('partidas_reforma').update({ presupuesto: total }).eq('id', item.partida_id)
      setPartidas(p => p.map(x => x.id === item.partida_id ? { ...x, presupuesto: total } : x))
    }
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
      // Usar API route para que las @menciones se procesen server-side
      await fetch('/api/bitacora', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, proyecto_id: id, proyecto_nombre: proyecto?.nombre }),
      })
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

  // ─── Prospectos handlers ─────────────────────────────────
  const loadProspectos = async () => {
    const { data } = await supabase.from('prospectos').select('*').eq('proyecto_id', id).order('created_at', { ascending: false })
    setProspectos(data || [])
  }

  const openProspectoForm = (p?: any) => {
    if (p) {
      setProspectoForm({ nombre: p.nombre, telefono: p.telefono||'', email: p.email||'', estado: p.estado, mejor_oferta: p.mejor_oferta?.toString()||'', proxima_visita: p.proxima_visita||'', notas: p.notas||'' })
      setEditingProspectoId(p.id)
    } else {
      setProspectoForm({ nombre:'', telefono:'', email:'', estado:'Contactado', mejor_oferta:'', proxima_visita:'', notas:'' })
      setEditingProspectoId(null)
    }
    setShowProspectoForm(true)
  }

  const saveProspecto = async () => {
    if (!prospectoForm.nombre.trim()) return
    setSavingProspecto(true)
    const payload: any = {
      proyecto_id: id,
      nombre: prospectoForm.nombre,
      telefono: prospectoForm.telefono || null,
      email: prospectoForm.email || null,
      estado: prospectoForm.estado,
      mejor_oferta: parseFloat(prospectoForm.mejor_oferta) || null,
      proxima_visita: prospectoForm.proxima_visita || null,
      notas: prospectoForm.notas || null,
      updated_at: new Date().toISOString(),
    }
    if (editingProspectoId) {
      await supabase.from('prospectos').update(payload).eq('id', editingProspectoId)
    } else {
      await supabase.from('prospectos').insert([payload])
    }
    await loadProspectos()
    setShowProspectoForm(false)
    setEditingProspectoId(null)
    setSavingProspecto(false)
  }

  const deleteProspecto = async (pid: string) => {
    if (!confirm('¿Eliminar este prospecto?')) return
    await supabase.from('prospectos').delete().eq('id', pid)
    setProspectos(p => p.filter(x => x.id !== pid))
    if (expandedProspecto === pid) setExpandedProspecto(null)
  }

  const toggleProspecto = async (pid: string) => {
    if (expandedProspecto === pid) { setExpandedProspecto(null); return }
    setExpandedProspecto(pid)
    if (!interacciones[pid]) {
      const { data } = await supabase.from('interacciones_prospecto').select('*').eq('prospecto_id', pid).order('fecha', { ascending: false })
      setInteracciones(m => ({ ...m, [pid]: data || [] }))
    }
  }

  const saveInteraccion = async () => {
    if (!interaccionForm.nota.trim()) return
    setSavingInteraccion(true)
    await supabase.from('interacciones_prospecto').insert([{
      prospecto_id: interaccionProspectoId,
      tipo: interaccionForm.tipo,
      fecha: interaccionForm.fecha,
      nota: interaccionForm.nota,
    }])
    const { data } = await supabase.from('interacciones_prospecto').select('*').eq('prospecto_id', interaccionProspectoId).order('fecha', { ascending: false })
    setInteracciones(m => ({ ...m, [interaccionProspectoId]: data || [] }))
    setShowInteraccionForm(false)
    setInteraccionForm({ tipo:'llamada', fecha: new Date().toISOString().split('T')[0], nota:'' })
    setSavingInteraccion(false)
  }

  const deleteInteraccion = async (interaccionId: string, prospectoId: string) => {
    await supabase.from('interacciones_prospecto').delete().eq('id', interaccionId)
    setInteracciones(m => ({ ...m, [prospectoId]: (m[prospectoId]||[]).filter(x => x.id !== interaccionId) }))
  }

  if (loading) return (
    <div className="p-4">
      <div className="h-8 w-32 rounded-lg animate-pulse mb-4" style={{ background: '#F0EEE9' }} />
      <div className="h-32 rounded-2xl animate-pulse" style={{ background: '#F0EEE9' }} />
    </div>
  )
  if (!proyecto) return <div className="p-4 text-center" style={{ color:'#1A1A1A' }}>Proyecto no encontrado</div>

  const CATS_CAPITAL = ['Transferencia', 'Aportación']
  const ingresos       = movimientos.filter(m => (m.monto > 0 || m.tipo === 'Ingreso') && !CATS_CAPITAL.includes(m.categoria)).reduce((s, m) => s + Math.abs(m.monto || m.total || 0), 0)
  const capitalAportado = movimientos.filter(m => CATS_CAPITAL.includes(m.categoria)).reduce((s, m) => s + Math.abs(m.monto || m.total || 0), 0)
  const gastos         = movimientos.filter(m => m.monto < 0 || m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || m.total || 0), 0)
  const presupuestoTotal = partidas.reduce((s, p) => s + (p.presupuesto || 0), 0)
  const ejecutadoTotal = partidas.reduce((s, p) => s + (p.ejecutado || 0), 0)

  const tareasPrioridad = (p: string) => tareas.filter(t => t.prioridad === p && t.estado !== 'Completada')
  const tareasHechas = tareas.filter(t => t.estado === 'Completada')

  const CARD = { background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)' }
  const INPUT_STYLE = { background: '#F0EEE9', border: '1.5px solid rgba(0,0,0,0.12)', color: '#1A1A1A' }

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
    <div className="p-4" style={{ background: '#F2F1ED', minHeight: '100vh' }}>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm font-bold opacity-60 hover:opacity-100" style={{ color:'#1A1A1A' }}>
          ← Volver
        </button>
        <button onClick={() => router.push(`/bot?proyecto_id=${id}`)}
          className="flex items-center gap-1.5 text-sm font-black px-3 py-1.5 rounded-xl"
          style={{ background: '#A6855A', color: '#14110C' }}>
          🤖 Bot
        </button>
      </div>

      {/* Hero */}
      <div className="rounded-2xl p-4 mb-4 relative overflow-hidden" style={CARD}>
        <div className="absolute right-[-20px] top-[-20px] w-[100px] h-[100px] rounded-full" style={{ background: 'rgba(166,133,90,0.08)' }} />
        <div className="flex gap-3 items-start mb-4 relative">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(166,133,90,0.18)' }}>🏠</div>
          <div>
            <div className="font-black text-[22px] leading-tight tracking-tight" style={{ color:'#1A1A1A' }}>{proyecto.nombre}</div>
            <div className="text-xs font-bold mt-1" style={{ color:'#999999' }}>
              {proyecto.porcentaje_hasu < 100 ? `JV ${100-proyecto.porcentaje_hasu}%/${proyecto.porcentaje_hasu}% · ${proyecto.socio_nombre||'—'}` : '100% HASU'} · {proyecto.ciudad||'—'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 relative">
          {[
            { v: proyecto.estado ? (ESTADO_LABEL_MAP[proyecto.estado] || proyecto.estado.charAt(0).toUpperCase()+proyecto.estado.slice(1)) : '—', l:'Estado', c: ESTADO_COLOR[proyecto.estado]||'#1A1A1A' },
            { v: `${proyecto.avance_reforma||0}%`, l:'Avance', c:'#1A1A1A' },
            { v: proyecto.precio_venta_estimado ? fmtK(proyecto.precio_venta_estimado) : '—', l:'Venta est.', c:'#22C55E' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3 text-center" style={{ background: '#F0EEE9', border: '1px solid rgba(0,0,0,0.08)' }}>
              <div className="font-black text-[15px]" style={{ color: k.c }}>{k.v}</div>
              <div className="text-[12px] font-bold uppercase tracking-wide mt-1" style={{ color: '#888' }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto mb-4 -mx-4 px-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-bold whitespace-nowrap"
            style={{ color: tab===i ? '#A6855A' : '#999999', borderBottom: tab===i ? '2.5px solid #A6855A' : '2.5px solid transparent', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* ═══ Tab: FINANZAS ═══ */}
      {tab === 0 && (
        <div>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-2.5 mb-2.5">
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ingresos</div>
              <div className="font-black text-[22px]" style={{ color:'#1A1A1A' }}>{fmtK(ingresos)}</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#999999' }}>venta + devoluciones</div>
            </div>
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Gastos</div>
              <div className="font-black text-[22px]" style={{ color: '#EF4444' }}>{fmtK(gastos)}</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#999999' }}>compra + reforma + otros</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Beneficio</div>
              <div className="font-black text-[22px]" style={{ color: ingresos - gastos >= 0 ? '#22C55E' : '#EF4444' }}>{fmtK(ingresos - gastos)}</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#999999' }}>ingresos − gastos</div>
            </div>
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Capital aportado</div>
              <div className="font-black text-[22px]" style={{ color: '#60A5FA' }}>{fmtK(capitalAportado)}</div>
              <div className="text-[12px] mt-0.5" style={{ color: '#999999' }}>socios · no es ingreso</div>
            </div>
          </div>

          {/* IBAN de la cuenta del proyecto */}
          <div className="rounded-xl p-3.5 mb-3 flex items-center gap-3" style={CARD}>
            <div style={{ color: '#888', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>IBAN cuenta</div>
            {ibanEdit === null ? (
              <>
                <div className="flex-1 font-mono text-[13px]" style={{ color: proyecto?.iban ? '#1A1A1A' : '#BBB' }}>
                  {proyecto?.iban ? proyecto.iban.replace(/(.{4})/g, '$1 ').trim() : 'Sin IBAN cargado'}
                </div>
                <button onClick={() => setIbanEdit(proyecto?.iban || '')}
                  className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                  style={{ background: '#F2ECE0', color: '#A6855A', border: 'none', cursor: 'pointer' }}>
                  ✎ Editar
                </button>
              </>
            ) : (
              <>
                <input
                  value={ibanEdit}
                  onChange={e => setIbanEdit(e.target.value.replace(/\s/g, '').toUpperCase())}
                  placeholder="ES00 0000 0000 0000 0000 0000"
                  className="flex-1 font-mono text-[13px] rounded-lg px-2.5 py-1 outline-none"
                  style={{ border: '1.5px solid #A6855A', background: '#FAFAF8', color: '#1A1A1A' }}
                />
                <button
                  disabled={ibanSaving}
                  onClick={async () => {
                    setIbanSaving(true)
                    const clean = ibanEdit.replace(/\s/g, '')
                    await supabase.from('proyectos').update({ iban: clean || null }).eq('id', proyecto.id)
                    setProyecto((p: any) => ({ ...p, iban: clean || null }))
                    setIbanEdit(null)
                    setIbanSaving(false)
                  }}
                  className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                  style={{ background: '#14110C', color: '#F8F3E9', border: 'none', cursor: 'pointer' }}>
                  {ibanSaving ? '...' : 'Guardar'}
                </button>
                <button onClick={() => setIbanEdit(null)}
                  className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                  style={{ background: '#F2ECE0', color: '#888', border: 'none', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </>
            )}
          </div>

          {/* Tabla movimientos */}
          <div className="rounded-2xl overflow-hidden" style={CARD}>
            <div className="p-4 pb-0 flex items-center justify-between">
              <div className="font-black text-[15px]" style={{ color:'#1A1A1A' }}>Movimientos <span style={{ color:'#999999', fontSize:14 }}>({movimientos.length})</span></div>
              <button onClick={() => openMovForm()}
                className="text-sm font-black px-3 py-1.5 rounded-xl"
                style={{ background:'#A6855A', color: '#14110C' }}>
                + Agregar
              </button>
            </div>

            {movimientos.length === 0 ? (
              <div className="p-4 text-sm text-center" style={{ color:'#999999' }}>Sin movimientos registrados</div>
            ) : (
              <div>
                {/* Vista compacta — 3 columnas sin scroll */}
                {!tablaExpandida && (
                  <div className="mt-2">
                    {/* Header */}
                    <div className="flex px-3 py-2" style={{ borderBottom:'1px solid rgba(0,0,0,0.08)', background:'#F0EEE9' }}>
                      <div style={{ width:72, flexShrink:0, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#999999' }}>Fecha</div>
                      <div style={{ flex:1, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#999999' }}>Concepto</div>
                      <div style={{ width:96, textAlign:'right', flexShrink:0, fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', color:'#999999' }}>Total</div>
                    </div>
                    {movimientos.map((m, i) => {
                      const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                      const total = Math.abs(m.monto || m.total || 0)
                      const montoColor = isIngreso ? '#22C55E' : '#EF4444'
                      return (
                        <div key={m.id} className="flex items-center px-3 py-2.5"
                          style={{ borderBottom: i < movimientos.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                          <div style={{ width:72, flexShrink:0, fontSize:13, fontWeight:500, color:'#666666' }}>{m.fecha}</div>
                          <div style={{ flex:1, overflow:'hidden', paddingRight:8 }}>
                            <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:14, fontWeight:500, color:'#1A1A1A' }}>
                              {m.concepto || m.descripcion}
                            </div>
                          </div>
                          <div style={{ width:96, flexShrink:0, textAlign:'right', fontSize:14, fontWeight:900, fontFamily:'monospace', color: montoColor, whiteSpace:'nowrap' }}>
                            {isIngreso ? '+' : '-'}{fmt(total)}
                          </div>
                        </div>
                      )
                    })}
                    {/* Footer totales */}
                    <div style={{ borderTop:'2px solid rgba(0,0,0,0.08)', background:'#F0EEE9' }}>
                      <div className="flex px-3 py-2">
                        <div style={{ flex:1, textAlign:'right', fontSize:13, fontWeight:700, color:'#1A1A1A', paddingRight:8 }}>Total gastos:</div>
                        <div style={{ width:96, textAlign:'right', fontSize:14, fontWeight:900, fontFamily:'monospace', color:'#EF4444' }}>-{fmt(gastos)}</div>
                      </div>
                      <div className="flex px-3 py-2" style={{ borderTop:'1px solid rgba(0,0,0,0.04)' }}>
                        <div style={{ flex:1, textAlign:'right', fontSize:13, fontWeight:700, color:'#1A1A1A', paddingRight:8 }}>Total ingresos:</div>
                        <div style={{ width:96, textAlign:'right', fontSize:14, fontWeight:900, fontFamily:'monospace', color:'#22C55E' }}>+{fmt(ingresos)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Vista expandida — tabla completa con scroll */}
                {tablaExpandida && (
                  <div className="overflow-x-auto mt-3">
                    <table className="w-full border-collapse" style={{ minWidth:900 }}>
                      <thead>
                        <tr style={{ background:'#F0EEE9' }}>
                          {['Fecha','Tipo','Cat.','Descripción','Proveedor','Cant.','P.Unit.','Total','Forma pago','Obs.','Acciones'].map(h => (
                            <th key={h} className="px-3 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide whitespace-nowrap"
                              style={{ color:'#999999', borderBottom:'1px solid rgba(0,0,0,0.08)' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, i) => {
                          const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                          const total = Math.abs(m.monto || m.total || 0)
                          const montoColor = isIngreso ? '#22C55E' : '#EF4444'
                          return (
                            <tr key={m.id} style={{ borderBottom: i < movimientos.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', whiteSpace:'nowrap' }}>{m.fecha}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, fontWeight:700, whiteSpace:'nowrap', color: montoColor }}>{isIngreso ? 'Ingreso' : 'Gasto'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', whiteSpace:'nowrap' }}>{m.categoria||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:14, color:'#1A1A1A', maxWidth:160 }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.concepto || m.descripcion}</div>
                              </td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', whiteSpace:'nowrap' }}>{m.proveedor||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', textAlign:'right', whiteSpace:'nowrap' }}>{m.cantidad||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', textAlign:'right', whiteSpace:'nowrap' }}>{m.precio_unitario ? fmt(m.precio_unitario) : '—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:14, fontWeight:900, fontFamily:'monospace', textAlign:'right', whiteSpace:'nowrap', color: montoColor }}>
                                {isIngreso ? '+' : '-'}{fmt(total)}
                              </td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', whiteSpace:'nowrap' }}>{m.forma_pago||'—'}</td>
                              <td style={{ padding:'10px 12px', fontSize:13, color:'#666666', whiteSpace:'nowrap', maxWidth:100 }}>
                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.observaciones||'—'}</div>
                              </td>
                              <td style={{ padding:'10px 12px' }}>
                                <div style={{ display:'flex', gap:6, justifyContent:'center' }}>
                                  <button onClick={() => openMovForm(m)} style={{ fontSize:13, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'rgba(0,0,0,0.06)', color:'#1A1A1A', border:'none', cursor:'pointer' }}>✎</button>
                                  <button onClick={() => deleteMov(m.id)} style={{ fontSize:13, fontWeight:700, padding:'3px 8px', borderRadius:6, background:'rgba(239,68,68,0.18)', color:'#EF4444', border:'none', cursor:'pointer' }}>✕</button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop:'2px solid rgba(0,0,0,0.08)', background:'#F0EEE9' }}>
                          <td colSpan={7} style={{ padding:'10px 12px', fontSize:14, fontWeight:700, textAlign:'right', color:'#1A1A1A' }}>Total gastos:</td>
                          <td style={{ padding:'10px 12px', fontSize:14, fontWeight:900, fontFamily:'monospace', textAlign:'right', color:'#EF4444' }}>-{fmt(gastos)}</td>
                          <td colSpan={3}></td>
                        </tr>
                        <tr style={{ borderTop:'1px solid rgba(0,0,0,0.04)', background:'#F0EEE9' }}>
                          <td colSpan={7} style={{ padding:'10px 12px', fontSize:14, fontWeight:700, textAlign:'right', color:'#1A1A1A' }}>Total ingresos:</td>
                          <td style={{ padding:'10px 12px', fontSize:14, fontWeight:900, fontFamily:'monospace', textAlign:'right', color:'#22C55E' }}>+{fmt(ingresos)}</td>
                          <td colSpan={3}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}

                {/* Toggle */}
                <button onClick={() => setTablaExpandida(!tablaExpandida)}
                  style={{ width:'100%', padding:'11px 0', fontSize:13, fontWeight:900, textAlign:'center', background:'#F0EEE9', color:'#1A1A1A', borderTop:'1px solid rgba(0,0,0,0.08)', cursor:'pointer', border:'none' }}>
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
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Presupuesto</div>
              <div className="font-black text-[22px]" style={{ color:'#1A1A1A' }}>{fmtK(presupuestoTotal)}</div>
            </div>
            <div className="rounded-xl p-3.5" style={CARD}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Ejecutado</div>
              <div className="font-black text-[22px]" style={{ color:'#A6855A' }}>{fmtK(ejecutadoTotal)}</div>
              <div className="text-xs font-bold mt-1" style={{ color:'#999999' }}>resta {fmtK(Math.max(0,presupuestoTotal-ejecutadoTotal))}</div>
            </div>
          </div>
          {/* Vista toggle */}
          <div className="flex gap-2 mb-3">
            <button onClick={() => setReformaVista('tabla')}
              className="flex-1 py-2 rounded-xl text-sm font-black"
              style={{ background: reformaVista==='tabla' ? '#A6855A' : '#F0EEE9', color: reformaVista==='tabla' ? '#14110C' : '#888' }}>
              Tabla
            </button>
            <button onClick={() => setReformaVista('gantt')}
              className="flex-1 py-2 rounded-xl text-sm font-black"
              style={{ background: reformaVista==='gantt' ? '#A6855A' : '#F0EEE9', color: reformaVista==='gantt' ? '#14110C' : '#888' }}>
              Timeline
            </button>
          </div>

          {/* ── Vista Gantt ── */}
          {reformaVista === 'gantt' && (() => {
            const conFechas = partidas.filter(p => p.fecha_inicio && p.fecha_fin_estimada)
            if (conFechas.length === 0) return (
              <div className="rounded-2xl p-8 text-center text-sm" style={{ ...CARD, color:'#999999' }}>
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
            const BAR_COLOR: Record<string,string> = { ok:'#22C55E', retrasada:'#EF4444', en_curso:'#A6855A', pendiente:'#888' }
            return (
              <div className="rounded-2xl overflow-hidden" style={CARD}>
                {/* Eje de fechas */}
                <div className="flex px-4 pt-3 pb-1" style={{ borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
                  <div style={{ width:130, flexShrink:0 }} />
                  <div className="flex-1 relative" style={{ height:16 }}>
                    <span className="absolute left-0 text-[12px] font-bold" style={{ color:'#888' }}>{fmtDate(minMs)}</span>
                    <span className="absolute right-0 text-[12px] font-bold" style={{ color:'#888' }}>{fmtDate(maxMs)}</span>
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
                        style={{ borderBottom: i < partidas.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                        {/* Nombre */}
                        <div style={{ width:130, flexShrink:0, paddingRight:8 }}>
                          <div style={{ fontSize:12, fontWeight:700, color:'#1A1A1A', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre}</div>
                          {dep && <div style={{ fontSize:12, color:'#999999', marginTop:1 }}>↳ {dep.nombre}</div>}
                        </div>
                        {/* Canvas barra */}
                        <div className="flex-1 relative" style={{ height:22, background:'rgba(0,0,0,0.04)', borderRadius:4 }}>
                          {/* Línea hoy */}
                          {todayMs >= minMs && todayMs <= maxMs && (
                            <div style={{ position:'absolute', left:`${todayPct}%`, top:0, bottom:0, width:1.5, background:'rgba(0,0,0,0.2)', zIndex:2 }} />
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
                            <div style={{ position:'absolute', left:4, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#999999', fontStyle:'italic' }}>sin fechas</div>
                          )}
                        </div>
                        {/* Estado pill */}
                        <div style={{ width:68, flexShrink:0, textAlign:'right' }}>
                          <span style={{ fontSize:12, fontWeight:700, color, background:`${color}22`, padding:'2px 6px', borderRadius:4 }}>
                            {ESTADO_PARTIDA[p.estado]?.label || p.estado}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                {/* Leyenda */}
                <div className="flex gap-4 px-4 py-2.5" style={{ borderTop:'1px solid rgba(0,0,0,0.08)', background:'#F0EEE9' }}>
                  {Object.entries(BAR_COLOR).map(([k,c]) => (
                    <div key={k} className="flex items-center gap-1.5">
                      <div style={{ width:10, height:10, borderRadius:2, background:c }} />
                      <span style={{ fontSize:12, fontWeight:700, color:'#888', textTransform:'capitalize' }}>{k}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <div style={{ width:2, height:10, background:'rgba(0,0,0,0.2)' }} />
                    <span style={{ fontSize:12, fontWeight:700, color:'#888' }}>hoy</span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── Vista Tabla ── */}
          {reformaVista === 'tabla' && <div className="rounded-2xl overflow-hidden" style={CARD}>
            <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom:'1px solid rgba(0,0,0,0.08)' }}>
              <div className="font-black text-[15px]" style={{ color:'#1A1A1A' }}>Partidas <span style={{ color:'#999999', fontSize:14 }}>({partidas.length})</span></div>
              <button onClick={() => openPartidaForm()}
                className="text-sm font-black px-3 py-1.5 rounded-xl"
                style={{ background:'#A6855A', color: '#14110C' }}>
                + Partida
              </button>
            </div>
            {partidas.length === 0 ? (
              <div className="text-sm text-center py-8" style={{ color:'#999999' }}>Sin partidas de reforma</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse" style={{ minWidth:520 }}>
                  <thead>
                    <tr style={{ background:'#F0EEE9' }}>
                      {['','Partida','Categoría','Estado','Presupuesto','Ejecutado','%','Acciones'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-[12px] font-bold uppercase tracking-wide whitespace-nowrap"
                          style={{ color:'#999999', borderBottom:'1px solid rgba(0,0,0,0.08)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {partidas.map((p, i) => {
                      const pct = p.presupuesto > 0 ? Math.round((p.ejecutado/p.presupuesto)*100) : 0
                      const col = pct >= 100 ? '#22C55E' : pct > 50 ? '#F59E0B' : '#EF4444'
                      const ep = ESTADO_PARTIDA[p.estado] || ESTADO_PARTIDA.pendiente
                      const isExpanded = expandedPartidas.has(p.id)
                      const items = itemsByPartida[p.id] || []
                      const isLoadingItems = loadingItems.has(p.id)
                      return (
                        <React.Fragment key={p.id}>
                          <tr style={{ borderBottom: (!isExpanded && i < partidas.length-1) ? '1px solid rgba(0,0,0,0.04)' : 'none', background: isExpanded ? 'rgba(166,133,90,0.04)' : 'transparent' }}>
                            {/* Expand toggle */}
                            <td className="px-2 py-3" style={{ width:28 }}>
                              <button onClick={() => togglePartida(p.id)}
                                className="w-5 h-5 rounded flex items-center justify-center text-[12px] font-black"
                                style={{ background:'rgba(0,0,0,0.06)', color: isExpanded ? '#A6855A' : '#888' }}>
                                {isExpanded ? '▾' : '▸'}
                              </button>
                            </td>
                            <td className="px-3 py-3 text-sm font-bold" style={{ color:'#1A1A1A' }}>{p.nombre}</td>
                            <td className="px-3 py-3 text-xs whitespace-nowrap" style={{ color:'#666666' }}>{p.categoria}</td>
                            <td className="px-3 py-3">
                              <select value={p.estado}
                                onChange={e => cambiarEstadoPartida(p.id, e.target.value)}
                                className="text-[12px] font-bold px-2 py-1 rounded-full outline-none cursor-pointer"
                                style={{ background:ep.bg, color:ep.c, border:`1px solid ${ep.c}33` }}>
                                <option value="pendiente">Pendiente</option>
                                <option value="en_curso">En curso</option>
                                <option value="ok">OK ✓</option>
                                <option value="retrasada">Retrasada</option>
                              </select>
                            </td>
                            <td className="px-3 py-3 text-sm font-mono text-right whitespace-nowrap" style={{ color:'#1A1A1A' }}>{fmt(p.presupuesto||0)}</td>
                            <td className="px-3 py-3 text-sm font-mono text-right whitespace-nowrap" style={{ color:'#A6855A' }}>{fmt(p.ejecutado||0)}</td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 rounded-full overflow-hidden flex-shrink-0" style={{ background:'#ECEAE4' }}>
                                  <div className="h-full rounded-full" style={{ width:`${Math.min(pct,100)}%`, background:col }} />
                                </div>
                                <span className="text-xs font-black whitespace-nowrap" style={{ color:col }}>{pct}%</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex gap-1.5">
                                <button onClick={() => openPartidaForm(p)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(0,0,0,0.06)', color:'#1A1A1A' }}>✎</button>
                                <button onClick={() => deletePartida(p.id)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                              </div>
                            </td>
                          </tr>
                          {/* ── Items expandibles ── */}
                          {isExpanded && (
                            <tr key={`items-${p.id}`} style={{ borderBottom: i < partidas.length-1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                              <td colSpan={8} style={{ padding:'0 0 8px 0', background:'rgba(0,0,0,0.03)' }}>
                                {isLoadingItems ? (
                                  <div className="px-6 py-3 text-xs" style={{ color:'#999999' }}>Cargando ítems...</div>
                                ) : (
                                  <div>
                                    {/* Items list */}
                                    {items.length > 0 && (
                                      <table className="w-full border-collapse">
                                        <thead>
                                          <tr style={{ background:'rgba(0,0,0,0.03)' }}>
                                            {['Ítem','Estancia','Proveedor','Coste','F. Compra','Nota',''].map(h => (
                                              <th key={h} className="px-3 py-1.5 text-left text-[12px] font-bold uppercase tracking-wide"
                                                style={{ color:'#999999', borderBottom:'1px solid rgba(0,0,0,0.05)' }}>{h}</th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {items.map(item => (
                                            <tr key={item.id} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
                                              <td className="px-3 py-2 text-xs font-semibold" style={{ color:'#1A1A1A' }}>{item.nombre}</td>
                                              <td className="px-3 py-2 text-xs" style={{ color:'#666666' }}>{item.estancia||'—'}</td>
                                              <td className="px-3 py-2 text-xs" style={{ color:'#666666' }}>{item.proveedor||'—'}</td>
                                              <td className="px-3 py-2 text-xs font-mono text-right whitespace-nowrap" style={{ color: item.coste ? '#A6855A' : '#999999' }}>
                                                {item.coste ? fmt(item.coste) : '—'}
                                              </td>
                                              <td className="px-3 py-2 text-xs" style={{ color:'#666666' }}>{item.fecha_compra||'—'}</td>
                                              <td className="px-3 py-2 text-xs" style={{ color:'#666666', maxWidth:120 }}>
                                                <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.nota||'—'}</div>
                                              </td>
                                              <td className="px-2 py-2">
                                                <div className="flex gap-1">
                                                  <button onClick={() => openItemForm(p.id, item)} className="text-[12px] font-bold px-1.5 py-0.5 rounded" style={{ background:'rgba(0,0,0,0.06)', color:'#1A1A1A' }}>✎</button>
                                                  <button onClick={() => deleteItem(item)} className="text-[12px] font-bold px-1.5 py-0.5 rounded" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                                                </div>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                        <tfoot>
                                          <tr style={{ borderTop:'1px solid rgba(0,0,0,0.08)', background:'rgba(0,0,0,0.03)' }}>
                                            <td colSpan={3} className="px-3 py-1.5 text-[12px] font-bold text-right" style={{ color:'#999999' }}>Total ítems:</td>
                                            <td className="px-3 py-1.5 text-xs font-black font-mono text-right" style={{ color:'#A6855A' }}>
                                              {fmt(items.reduce((s,it) => s+(it.coste||0),0))}
                                            </td>
                                            <td colSpan={3}></td>
                                          </tr>
                                        </tfoot>
                                      </table>
                                    )}
                                    {items.length === 0 && (
                                      <div className="px-6 py-2 text-xs" style={{ color:'#999999' }}>Sin ítems — agregá el primero</div>
                                    )}
                                    <div className="px-3 pt-2">
                                      <button onClick={() => openItemForm(p.id)}
                                        className="text-xs font-black px-3 py-1.5 rounded-lg"
                                        style={{ color:'#A6855A', background:'rgba(166,133,90,0.25)', border:'1px solid rgba(166,133,90,0.4)' }}>
                                        + Ítem
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop:'2px solid rgba(0,0,0,0.08)', background:'#F0EEE9' }}>
                      <td colSpan={3} className="px-3 py-2.5 text-sm font-bold text-right" style={{ color:'#1A1A1A' }}>Totales:</td>
                      <td className="px-3 py-2.5 text-sm font-black font-mono text-right" style={{ color:'#1A1A1A' }}>{fmt(presupuestoTotal)}</td>
                      <td className="px-3 py-2.5 text-sm font-black font-mono text-right" style={{ color:'#A6855A' }}>{fmt(ejecutadoTotal)}</td>
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
              className="text-sm font-black px-3 py-1.5 rounded-xl"
              style={{ background:'#A6855A', color: '#14110C' }}>
              + Agregar
            </button>
          </div>
          {['Alta','Media','Baja'].map(p => {
            const ts = tareasPrioridad(p)
            if (ts.length === 0) return null
            return (
              <div key={p} className="mb-4">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="font-black text-[15px]" style={{ color:'#1A1A1A' }}>{p} prioridad</div>
                </div>
                {ts.map(t => (
                  <div key={t.id} className="rounded-xl p-3.5 mb-2 flex gap-2.5 items-center" style={CARD}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p==='Alta'?'#EF4444':p==='Media'?'#F59E0B':'#888' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold" style={{ color:'#1A1A1A' }}>{t.titulo}</div>
                      <div className="text-xs font-medium mt-0.5" style={{ color:'#999999' }}>{t.asignado_a||'Sin asignar'}{t.fecha_limite?` · ${t.fecha_limite}`:''}</div>
                    </div>
                    <button onClick={() => openTareaForm(t)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background:'rgba(0,0,0,0.06)', color:'#1A1A1A' }}>✎</button>
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
                  <div className="flex-1 text-sm font-semibold" style={{ color:'#1A1A1A' }}>{t.titulo}</div>
                  <button onClick={() => deleteTarea(t.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                </div>
              ))}
            </>
          )}
          {tareas.length === 0 && <div className="text-center py-12 text-sm" style={{ color:'#999999' }}>Sin tareas registradas</div>}
        </div>
      )}

      {/* ═══ Tab: BITÁCORA ═══ */}
      {tab === 3 && (
        <div className="rounded-2xl p-4" style={CARD}>
          <div className="flex items-center justify-between mb-4">
            <div className="font-black text-[15px]" style={{ color:'#1A1A1A' }}>Historial</div>
            <button onClick={() => openBitacoraForm()}
              className="text-sm font-black px-3 py-1.5 rounded-xl"
              style={{ background:'#A6855A', color: '#14110C' }}>
              + Agregar
            </button>
          </div>
          {bitacora.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color:'#999999' }}>Sin entradas en bitácora</div>
          ) : (
            <div className="pl-5 relative">
              <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background:'#ECEAE4' }} />
              {bitacora.map(b => (
                <div key={b.id} className="relative mb-4">
                  <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background:'#A6855A', border:'2px solid #F2F1ED' }} />
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-[12px] font-bold font-mono tracking-wide" style={{ color:'#999999' }}>
                      {new Date(b.created_at).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'numeric'}).toUpperCase()}
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => openBitacoraForm(b)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background:'rgba(0,0,0,0.06)', color:'#1A1A1A' }}>✎</button>
                      <button onClick={() => deleteBitacora(b.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                    </div>
                  </div>
                  <div className="text-sm font-medium leading-relaxed" style={{ color:'#1A1A1A' }}>{b.contenido}</div>
                  <div className="text-xs font-bold mt-1" style={{ color:'#A6855A' }}>{b.autor}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab: INVERSOR — JV / Gestor ═══ */}
      {tab === 4 && (
        inmueble
          ? <InmuebleCalculadora inmuebleId={inmueble.id} tipologia={inmueble.tipologia || 'piso'} mode="jv" />
          : <div className="text-center py-12 text-sm" style={{ color:'#999999' }}>Sin inmueble vinculado — JV no disponible</div>
      )}

      {/* ═══ Tab: DOCS ═══ */}
      {tab === 5 && (
        <div>
          <div className="flex justify-end mb-3">
            <button onClick={() => setShowDocForm(true)}
              className="text-sm font-black px-3 py-1.5 rounded-xl"
              style={{ background:'#A6855A', color: '#14110C' }}>
              + Agregar link
            </button>
          </div>
          {docs.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color:'#999999' }}>Sin documentos. Agregá links de Google Drive.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {docs.map(d => (
                <div key={d.id} className="rounded-xl p-3.5 flex gap-3 items-center justify-between" style={CARD}>
                  <a href={d.url} target="_blank" rel="noopener noreferrer"
                    className="flex gap-3 items-center flex-1 min-w-0">
                    <span className="text-xl flex-shrink-0">📄</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold truncate" style={{ color:'#1A1A1A' }}>{d.nombre}</div>
                      {d.tipo && <div className="text-xs font-medium mt-0.5" style={{ color:'#999999' }}>{d.tipo}</div>}
                    </div>
                    <span className="text-xs font-bold flex-shrink-0 px-2 py-1 rounded-lg" style={{ background:'rgba(166,133,90,0.18)', color:'#A6855A' }}>Abrir →</span>
                  </a>
                  <button onClick={() => deleteDoc(d.id)} className="ml-2 flex-shrink-0 text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══ Tab: COMERCIALIZACIÓN ═══ */}
      {tab === 6 && (() => {
        const activos = prospectos.filter(p => p.estado !== 'Descartado')
        const mejorOferta = prospectos.reduce((max: number, p: any) => p.mejor_oferta > max ? p.mejor_oferta : max, 0)
        const proximaVisita = prospectos
          .filter((p: any) => p.proxima_visita && p.estado !== 'Descartado')
          .sort((a: any, b: any) => a.proxima_visita.localeCompare(b.proxima_visita))[0]
        return (
          <div>
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="rounded-xl p-3.5" style={CARD}>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color:'#888' }}>Activos</div>
                <div className="font-black text-[22px]" style={{ color:'#1A1A1A' }}>{activos.length}</div>
              </div>
              <div className="rounded-xl p-3.5" style={CARD}>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color:'#888' }}>Mejor oferta</div>
                <div className="font-black text-[18px]" style={{ color:'#22C55E' }}>{mejorOferta ? fmtK(mejorOferta) : '—'}</div>
              </div>
              <div className="rounded-xl p-3.5" style={CARD}>
                <div className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color:'#888' }}>Próx. visita</div>
                <div className="font-black text-[14px]" style={{ color:'#1A1A1A' }}>{proximaVisita ? new Date(proximaVisita.proxima_visita).toLocaleDateString('es-ES',{day:'2-digit',month:'short'}) : '—'}</div>
                {proximaVisita && <div className="text-[12px] font-bold mt-0.5" style={{ color:'#999999' }}>{proximaVisita.nombre}</div>}
              </div>
            </div>

            {/* Botón agregar */}
            <div className="flex justify-end mb-3">
              <button onClick={() => openProspectoForm()}
                className="text-sm font-black px-3 py-1.5 rounded-xl"
                style={{ background:'#A6855A', color: '#14110C' }}>
                + Prospecto
              </button>
            </div>

            {/* Lista */}
            {prospectos.length === 0 ? (
              <div className="text-center py-12 text-sm" style={{ color:'#999999' }}>Sin prospectos. Agregá o usá el bot.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {prospectos.map((p: any) => {
                  const isExpanded = expandedProspecto === p.id
                  const ec = ESTADO_PROSPECTO_COLOR[p.estado] || '#888'
                  const ints = interacciones[p.id] || []
                  return (
                    <div key={p.id} className="rounded-2xl overflow-hidden" style={CARD}>
                      {/* Header */}
                      <div className="p-3.5 flex items-start gap-3">
                        <button onClick={() => toggleProspecto(p.id)}
                          className="w-6 h-6 rounded flex items-center justify-center text-[12px] font-black flex-shrink-0 mt-0.5"
                          style={{ background:'rgba(0,0,0,0.06)', color: isExpanded ? '#A6855A' : '#888' }}>
                          {isExpanded ? '▾' : '▸'}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-[15px]" style={{ color:'#1A1A1A' }}>{p.nombre}</span>
                            <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background:`${ec}22`, color:ec }}>
                              {p.estado}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-3 mt-1">
                            {p.telefono && <span className="text-xs font-bold" style={{ color:'#666666' }}>📞 {p.telefono}</span>}
                            {p.email && <span className="text-xs font-bold truncate" style={{ color:'#666666' }}>✉ {p.email}</span>}
                            {p.mejor_oferta && <span className="text-xs font-black" style={{ color:'#22C55E' }}>💰 {fmtK(p.mejor_oferta)}</span>}
                            {p.proxima_visita && p.estado !== 'Descartado' && <span className="text-xs font-bold" style={{ color:'#F59E0B' }}>📅 {new Date(p.proxima_visita).toLocaleDateString('es-ES',{day:'2-digit',month:'short'})}</span>}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button onClick={() => openProspectoForm(p)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(0,0,0,0.06)', color:'#1A1A1A' }}>✎</button>
                          <button onClick={() => deleteProspecto(p.id)} className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                        </div>
                      </div>
                      {/* Interacciones expandibles */}
                      {isExpanded && (
                        <div style={{ borderTop:'1px solid rgba(0,0,0,0.08)', background:'rgba(0,0,0,0.03)' }}>
                          <div className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-[12px] font-black uppercase tracking-wide" style={{ color:'#888' }}>Interacciones ({ints.length})</span>
                            <button
                              onClick={() => { setInteraccionProspectoId(p.id); setInteraccionForm({ tipo:'llamada', fecha: new Date().toISOString().split('T')[0], nota:'' }); setShowInteraccionForm(true) }}
                              className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                              style={{ background:'#A6855A', color: '#14110C' }}>
                              + Registrar
                            </button>
                          </div>
                          {ints.length === 0 ? (
                            <div className="px-4 pb-3 text-xs" style={{ color:'#999999' }}>Sin interacciones registradas</div>
                          ) : (
                            <div className="px-4 pb-3 flex flex-col gap-2">
                              {ints.map((int: any) => (
                                <div key={int.id} className="flex gap-3 items-start group">
                                  <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: ESTADO_PROSPECTO_COLOR[p.estado] || '#A6855A' }} />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[12px] font-black" style={{ color:'#A6855A', textTransform:'capitalize' }}>{int.tipo}</span>
                                      <span className="text-[12px]" style={{ color:'#999999' }}>{new Date(int.fecha).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})}</span>
                                    </div>
                                    {int.nota && <div className="text-xs font-medium mt-0.5" style={{ color:'#444444' }}>{int.nota}</div>}
                                  </div>
                                  <button onClick={() => deleteInteraccion(int.id, p.id)} className="text-[12px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100" style={{ background:'rgba(239,68,68,0.15)', color:'#EF4444' }}>✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ─────── FORM: Prospecto ─────── */}
      {showProspectoForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowProspectoForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] overflow-y-auto"
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto', maxHeight:'90vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
              <div className="flex justify-between items-center mb-5">
                <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingProspectoId ? 'Editar prospecto' : 'Nuevo prospecto'}</div>
                <button onClick={() => setShowProspectoForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                  <input type="text" value={prospectoForm.nombre} placeholder="Nombre completo"
                    onChange={e => setProspectoForm(f=>({...f,nombre:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Teléfono</label>
                    <input type="tel" value={prospectoForm.telefono} placeholder="612 345 678"
                      onChange={e => setProspectoForm(f=>({...f,telefono:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Email</label>
                    <input type="email" value={prospectoForm.email} placeholder="email@ejemplo.com"
                      onChange={e => setProspectoForm(f=>({...f,email:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Estado</label>
                  <select value={prospectoForm.estado} onChange={e => setProspectoForm(f=>({...f,estado:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    {ESTADOS_PROSPECTO.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Mejor oferta (€)</label>
                    <input type="number" step="1000" value={prospectoForm.mejor_oferta} placeholder="85000"
                      onChange={e => setProspectoForm(f=>({...f,mejor_oferta:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Próxima visita</label>
                    <input type="date" value={prospectoForm.proxima_visita}
                      onChange={e => setProspectoForm(f=>({...f,proxima_visita:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Notas</label>
                  <textarea rows={2} value={prospectoForm.notas} placeholder="Observaciones..."
                    onChange={e => setProspectoForm(f=>({...f,notas:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
                </div>
              </div>
              <button onClick={saveProspecto} disabled={savingProspecto || !prospectoForm.nombre.trim()}
                className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
                style={{ background:'#14110C', color: '#F8F3E9' }}>
                {savingProspecto ? 'Guardando...' : editingProspectoId ? 'Actualizar' : 'Agregar prospecto'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─────── FORM: Interacción ─────── */}
      {showInteraccionForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowInteraccionForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] overflow-y-auto"
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto', maxHeight:'80vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
              <div className="flex justify-between items-center mb-5">
                <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>Registrar interacción</div>
                <button onClick={() => setShowInteraccionForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
              </div>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
                    <select value={interaccionForm.tipo} onChange={e => setInteraccionForm(f=>({...f,tipo:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium capitalize" style={INPUT_STYLE}>
                      {TIPOS_INTERACCION.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha</label>
                    <input type="date" value={interaccionForm.fecha}
                      onChange={e => setInteraccionForm(f=>({...f,fecha:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nota *</label>
                  <textarea rows={3} value={interaccionForm.nota} placeholder="Descripción de la interacción..."
                    onChange={e => setInteraccionForm(f=>({...f,nota:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
                </div>
              </div>
              <button onClick={saveInteraccion} disabled={savingInteraccion || !interaccionForm.nota.trim()}
                className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
                style={{ background:'#14110C', color: '#F8F3E9' }}>
                {savingInteraccion ? 'Guardando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ─────── FORM: Movimiento ─────── */}
      {showMovForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowMovForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] overflow-y-auto"
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto', maxHeight:'90vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
              <div className="flex justify-between items-center mb-5">
                <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingMovId ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
                <button onClick={() => setShowMovForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
              </div>
              <form onSubmit={saveMov}>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha *</label>
                    <input type="date" required value={movForm.fecha} onChange={e => setMovForm(f=>({...f,fecha:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo *</label>
                    <select value={movForm.tipo} onChange={e => setMovForm(f=>({...f,tipo:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE}>
                      <option>Gasto</option><option>Ingreso</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Categoría *</label>
                    <select value={movForm.categoria} onChange={e => setMovForm(f=>({...f,categoria:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE}>
                      {CATEGORIAS_MOV.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Descripción *</label>
                    <input type="text" required value={movForm.descripcion} onChange={e => setMovForm(f=>({...f,descripcion:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Proveedor</label>
                    <input type="text" value={movForm.proveedor} onChange={e => setMovForm(f=>({...f,proveedor:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Cantidad</label>
                    <input type="number" step="0.01" value={movForm.cantidad}
                      onChange={e => {
                        const c = e.target.value
                        const total = c && movForm.precio_unitario ? (parseFloat(c)*parseFloat(movForm.precio_unitario)).toFixed(2) : movForm.total
                        setMovForm(f=>({...f,cantidad:c,total}))
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Precio unitario (€)</label>
                    <input type="number" step="0.01" value={movForm.precio_unitario}
                      onChange={e => {
                        const p = e.target.value
                        const total = p && movForm.cantidad ? (parseFloat(p)*parseFloat(movForm.cantidad)).toFixed(2) : movForm.total
                        setMovForm(f=>({...f,precio_unitario:p,total}))
                      }}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Total (€) *</label>
                    <input type="number" step="0.01" required value={movForm.total} onChange={e => setMovForm(f=>({...f,total:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-bold" style={{ ...INPUT_STYLE, borderColor:'rgba(166,133,90,0.5)' }} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Forma de pago</label>
                    <input type="text" value={movForm.forma_pago} onChange={e => setMovForm(f=>({...f,forma_pago:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nº Factura</label>
                    <input type="text" value={movForm.numero_factura} onChange={e => setMovForm(f=>({...f,numero_factura:e.target.value}))}
                      className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
                <div className="mb-4">
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Observaciones</label>
                  <textarea rows={2} value={movForm.observaciones} onChange={e => setMovForm(f=>({...f,observaciones:e.target.value}))}
                    className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={savingMov}
                    className="flex-1 py-4 rounded-xl text-base font-black disabled:opacity-50"
                    style={{ background:'#14110C', color: '#F8F3E9' }}>
                    {savingMov ? 'Guardando...' : 'Guardar'}
                  </button>
                  <button type="button" onClick={() => setShowMovForm(false)}
                    className="flex-1 py-4 rounded-xl text-base font-black"
                    style={{ background:'rgba(0,0,0,0.06)', border:'1px solid rgba(0,0,0,0.10)', color:'#1A1A1A' }}>
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
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingTareaId ? 'Editar tarea' : 'Nueva tarea'}</div>
              <button onClick={() => setShowTareaForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Título *</label>
                <input type="text" value={tareaForm.titulo} placeholder="Ej. Pedir presupuesto electricista"
                  onChange={e => setTareaForm(f=>({...f,titulo:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Prioridad</label>
                  <select value={tareaForm.prioridad} onChange={e => setTareaForm(f=>({...f,prioridad:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option>Alta</option><option>Media</option><option>Baja</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Estado</label>
                  <select value={tareaForm.estado} onChange={e => setTareaForm(f=>({...f,estado:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                    <option>Pendiente</option><option>En curso</option><option>Completada</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha límite</label>
                  <input type="date" value={tareaForm.fecha_limite} onChange={e => setTareaForm(f=>({...f,fecha_limite:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Asignado a</label>
                  <input type="text" value={tareaForm.asignado_a} placeholder="Nombre"
                    onChange={e => setTareaForm(f=>({...f,asignado_a:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
            </div>
            <button onClick={saveTarea} disabled={savingTarea || !tareaForm.titulo.trim()}
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#14110C', color: '#F8F3E9' }}>
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
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingBitacoraId ? 'Editar entrada' : 'Nueva entrada'}</div>
              <button onClick={() => setShowBitacoraForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Contenido *</label>
                <textarea rows={4} value={bitacoraForm.contenido} placeholder="Descripción de lo que ocurrió..."
                  onChange={e => setBitacoraForm(f=>({...f,contenido:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Autor</label>
                  <input type="text" value={bitacoraForm.autor} placeholder="Tu nombre"
                    onChange={e => setBitacoraForm(f=>({...f,autor:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
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
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#14110C', color: '#F8F3E9' }}>
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
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>Agregar documento</div>
              <button onClick={() => setShowDocForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={docForm.nombre} placeholder="Ej. Planos reforma cocina"
                  onChange={e => setDocForm(f=>({...f,nombre:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Link de Google Drive *</label>
                <input type="url" value={docForm.url} placeholder="https://drive.google.com/..."
                  onChange={e => setDocForm(f=>({...f,url:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
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
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#14110C', color: '#F8F3E9' }}>
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
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingPartidaId ? 'Editar partida' : 'Nueva partida'}</div>
              <button onClick={() => setShowPartidaForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={nuevaPartida.nombre} placeholder="Ej. Demolición interior"
                  onChange={e => setNuevaPartida(p=>({...p,nombre:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Categoría</label>
                <select value={nuevaPartida.categoria} onChange={e => setNuevaPartida(p=>({...p,categoria:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE}>
                  {['obra','materiales','mobiliario','electro','decoracion','otros'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Presupuesto (€)</label>
                  <input type="number" value={nuevaPartida.presupuesto} placeholder="0"
                    onChange={e => setNuevaPartida(p=>({...p,presupuesto:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Ejecutado (€)</label>
                  <input type="number" value={nuevaPartida.ejecutado} placeholder="0"
                    onChange={e => setNuevaPartida(p=>({...p,ejecutado:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Inicio</label>
                  <input type="date" value={nuevaPartida.fecha_inicio}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_inicio:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fin estimado</label>
                  <input type="date" value={nuevaPartida.fecha_fin_estimada}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_fin_estimada:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fin real</label>
                  <input type="date" value={nuevaPartida.fecha_fin_real}
                    onChange={e => setNuevaPartida(p=>({...p,fecha_fin_real:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Depende de</label>
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
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#14110C', color: '#F8F3E9' }}>
              {savingPartida ? 'Guardando...' : editingPartidaId ? 'Actualizar partida' : 'Agregar partida'}
            </button>
          </div>
        </>
      )}

      {/* ─────── FORM: Ítem de partida ─────── */}
      {showItemForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowItemForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10 overflow-y-auto"
            style={{ background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto', maxHeight:'85vh' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#ECEAE4' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{ color:'#1A1A1A' }}>{editingItemId ? 'Editar ítem' : 'Nuevo ítem'}</div>
              <button onClick={() => setShowItemForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#F0EEE9', color:'#1A1A1A' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={itemForm.nombre} placeholder="Ej. Cuadro eléctrico"
                  onChange={e => setItemForm(f=>({...f,nombre:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Estancia</label>
                  <input type="text" value={itemForm.estancia} placeholder="Cocina, Baño…"
                    onChange={e => setItemForm(f=>({...f,estancia:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Proveedor</label>
                  <input type="text" value={itemForm.proveedor} placeholder="Nombre empresa"
                    onChange={e => setItemForm(f=>({...f,proveedor:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Coste (€)</label>
                  <input type="number" step="0.01" value={itemForm.coste} placeholder="0.00"
                    onChange={e => setItemForm(f=>({...f,coste:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha compra</label>
                  <input type="date" value={itemForm.fecha_compra}
                    onChange={e => setItemForm(f=>({...f,fecha_compra:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                </div>
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nota</label>
                <textarea rows={2} value={itemForm.nota} placeholder="Observaciones…"
                  onChange={e => setItemForm(f=>({...f,nota:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
              </div>
            </div>
            <button onClick={saveItem} disabled={savingItem || !itemForm.nombre.trim()}
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#14110C', color: '#F8F3E9' }}>
              {savingItem ? 'Guardando...' : editingItemId ? 'Actualizar ítem' : 'Agregar ítem'}
            </button>
          </div>
        </>
      )}

      {/* ═══ Tab: ANÁLISIS (JV + Calculadora + Checklist desde inmueble vinculado) ═══ */}
      {tab === 7 && (
        <div>
          {/* Ficha registral del inmueble vinculado */}
          {inmueble && (
            <div className="mb-4 rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
              <div className="px-4 py-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
                <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: '#A6855A' }}>Ficha registral</div>
              </div>

              {/* Vendedor / Titular */}
              {(() => {
                const esReo = (inmueble.origen || 'directo') === 'reo'
                const tieneVendedor = esReo
                  ? !!(inmueble.portfolio_reo || inmueble.asset_id_servicer)
                  : !!(inmueble.vendedor_tipo || inmueble.vendedor_nombre)
                if (!tieneVendedor && !inmueble.referencia_catastral) return (
                  <div className="px-4 py-3 text-sm" style={{ color: '#BBB' }}>Sin referencia catastral ni datos de vendedor.</div>
                )
                return null
              })()}

              {(() => {
                const esReo = (inmueble.origen || 'directo') === 'reo'
                const tieneVendedor = esReo
                  ? !!(inmueble.portfolio_reo || inmueble.asset_id_servicer)
                  : !!(inmueble.vendedor_tipo || inmueble.vendedor_nombre)
                if (!tieneVendedor) return null
                return (
                  <div className="px-4 py-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
                    <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#A6855A' }}>
                      {esReo ? 'Fondo / Servicer' : 'Vendedor'}
                    </div>
                    {esReo ? (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                        {inmueble.portfolio_reo && <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>{inmueble.portfolio_reo}</span>}
                        {inmueble.asset_id_servicer && <span className="text-sm" style={{ color: '#666' }}>ID: {inmueble.asset_id_servicer}</span>}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-center">
                        {inmueble.vendedor_tipo && (
                          <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(166,133,90,0.12)', color: '#A6855A' }}>{inmueble.vendedor_tipo}</span>
                        )}
                        {inmueble.vendedor_nombre && <span className="text-sm font-bold" style={{ color: '#1A1A1A' }}>{inmueble.vendedor_nombre}</span>}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Catastro */}
              <div>
                {!inmueble.referencia_catastral ? (
                  <div className="px-4 py-3 flex items-center gap-2">
                    <div className="flex-1">
                      <div className="text-[9px] font-black uppercase tracking-widest mb-1" style={{ color: '#A6855A' }}>Referencia catastral</div>
                      <input
                        type="text"
                        value={refCatastralInput}
                        onChange={e => setRefCatastralInput(e.target.value)}
                        placeholder="Ej: 3897602XG0139N0024JI"
                        className="w-full text-[13px] font-mono px-2 py-1 rounded-lg outline-none"
                        style={{ border: '1px solid #DDDAD2', background: '#FAFAF8', color: '#1A1A1A' }}
                        onKeyDown={e => e.key === 'Enter' && saveRefCatastral()}
                      />
                    </div>
                    <button
                      onClick={saveRefCatastral}
                      disabled={savingRefCatastral || !refCatastralInput.trim()}
                      className="text-[11px] font-black px-3 py-1.5 rounded-xl mt-4 transition-colors"
                      style={{ background: '#F0EEE8', color: '#A6855A', border: '1px solid #DDDAD2', opacity: refCatastralInput.trim() ? 1 : 0.4 }}>
                      {savingRefCatastral ? '⟳' : 'Guardar'}
                    </button>
                  </div>
                ) : (() => {
                  const cat = inmueble.datos_catastro
                  return (
                    <div>
                      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: cat ? '1px solid #F0EEE8' : undefined }}>
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: '#A6855A' }}>Catastro</div>
                          <a href={`https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?pest=rc&i=es&buscar=S&RefC=${encodeURIComponent(inmueble.referencia_catastral)}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-[13px] font-mono font-bold hover:underline" style={{ color: '#3B82F6' }}>
                            {inmueble.referencia_catastral}
                          </a>
                        </div>
                        <button
                          onClick={fetchCatastroProyecto}
                          disabled={catastroLoadingInmueble}
                          className="text-[11px] font-black px-3 py-1.5 rounded-xl transition-colors"
                          style={{ background: cat ? '#E8F5E9' : '#F0EEE8', color: cat ? '#16A34A' : '#A6855A', border: '1px solid', borderColor: cat ? '#BBF7D0' : '#DDDAD2' }}>
                          {catastroLoadingInmueble ? '⟳' : cat ? '✓ Actualizar' : '⬇ Obtener datos'}
                        </button>
                      </div>
                      {catastroErrorInmueble && <div className="px-4 py-2 text-xs" style={{ color: '#dc2626' }}>{catastroErrorInmueble}</div>}
                      {cat && (
                        <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-1">
                          {cat.direccion_completa && <div className="col-span-2 text-sm font-semibold mb-1" style={{ color: '#1A1A1A' }}>{cat.direccion_completa}</div>}
                          {cat.uso && <div className="text-xs"><span style={{ color: '#999' }}>Uso: </span><span style={{ color: '#333' }}>{cat.uso}</span></div>}
                          {cat.superficie_construida && <div className="text-xs"><span style={{ color: '#999' }}>Sup. construida: </span><span style={{ color: '#333' }}>{cat.superficie_construida} m²</span></div>}
                          {cat.año_construccion && <div className="text-xs"><span style={{ color: '#999' }}>Año: </span><span style={{ color: '#333' }}>{cat.año_construccion}</span></div>}
                          {cat.tipo_construccion && <div className="text-xs"><span style={{ color: '#999' }}>Tipo: </span><span style={{ color: '#333' }}>{cat.tipo_construccion}</span></div>}
                          {cat.cp && <div className="text-xs"><span style={{ color: '#999' }}>CP: </span><span style={{ color: '#333' }}>{cat.cp}</span></div>}
                          {cat.municipio && <div className="text-xs"><span style={{ color: '#999' }}>Municipio: </span><span style={{ color: '#333' }}>{cat.municipio}</span></div>}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {inmueble
            ? <InmuebleCalculadora inmuebleId={inmueble.id} tipologia={inmueble.tipologia || 'piso'} mode="calculadora" />
            : <div className="rounded-2xl p-6 text-center" style={{ background:'#fff', border:'1.5px solid #ECEAE4' }}>
                <div className="text-3xl mb-3 opacity-30">🔗</div>
                <div className="font-bold text-sm" style={{ color:'#999' }}>Sin inmueble vinculado desde Mercado.</div>
                <div className="text-sm mt-1" style={{ color:'#bbb' }}>Al pasar un inmueble de Mercado a "En arras", queda automáticamente enlazado aquí.</div>
              </div>
          }
          <RiesgosMatriz proyectoId={proyecto?.id} />
        </div>
      )}
    </div>
  )
}
