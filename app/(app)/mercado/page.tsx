'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PARTIDAS_PLANTILLA } from '@/lib/reforma-template'

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

type Inmueble = {
  id: string
  tipologia: string
  titulo?: string
  direccion: string
  ciudad?: string
  superficie?: number
  habitaciones?: number
  banos?: number
  num_plantas?: number
  tipo_finca?: string
  precio_compra?: number
  precio_venta_conservador?: number | null
  precio_venta_realista?: number | null
  precio_venta_optimista?: number | null
  roi_estimado?: number
  reforma_estimada?: number
  gastos_json?: Gastos
  analizado_en?: string
  duracion_meses?: number
  estado: string
  fuente?: string
  fecha_recibido?: string
  url?: string
  drive_url?: string
  imagen_portada?: string
  notas?: string
  created_at: string
}

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
  referencia_catastral?: string
  notas?: string
}

type Proveedor = { id: string; nombre: string }
type Visita = { id: string; inmueble_id: string; fecha: string; hora: string; responsable: string; notas_previas?: string; estado_post?: string; notas_post?: string; fotos_url?: string; gcal_event_id?: string; created_at: string }

const SUBESTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sin_analizar: { label: 'Sin analizar', color: '#888',    bg: 'rgba(136,136,136,0.12)' },
  en_estudio:   { label: 'En estudio',   color: '#60A5FA', bg: 'rgba(96,165,250,0.15)'  },
  ofertado:     { label: 'Ofertado',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)'  },
  en_arras:     { label: 'En arras',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  comprado:     { label: 'Comprado',     color: '#22C55E', bg: 'rgba(34,197,94,0.15)'   },
}

const TIPOLOGIA_LABELS: Record<string, string> = {
  piso: 'Piso', casa: 'Casa', duplex: 'Dúplex', edificio: 'Edificio', suelo: 'Suelo', nave: 'Nave',
}

function emptyGastos(): Gastos {
  const g: Gastos = {}
  CONCEPTOS_GASTOS.forEach(c => { g[c.id] = { estimado: 0, real: 0 } })
  return g
}

function toNum(v: unknown): number {
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
  const anual: (number | null)[] = meses > 0
    ? rent.map(r => (Math.pow(1 + r / 100, 12 / meses) - 1) * 100)
    : [null, null, null]
  return { totalEst, totalReal, ben, rent, anual }
}

const emptyNuevoForm = () => ({
  titulo: '', tipologia: 'piso', direccion: '', ciudad: '',
  precio: '', habitaciones: '', superficie: '',
  fuente: 'WhatsApp', notas: '', url: '', drive_url: '',
})

export default function MercadoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoOpenDone = useRef(false)

  const [inmuebles, setInmuebles] = useState<Inmueble[]>([])
  const [filtroTipologia, setFiltroTipologia] = useState('todos')
  const [loading, setLoading] = useState(true)
  const [unidades, setUnidades] = useState<Record<string, Unidad[]>>({})
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [expandedDetalle, setExpandedDetalle] = useState<string | null>(null)
  const [creando, setCreando] = useState<string | null>(null)
  const [updatingEstado, setUpdatingEstado] = useState<string | null>(null)
  const [confirmandoCompra, setConfirmandoCompra] = useState<string | null>(null)

  // Nuevo inmueble
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoForm, setNuevoForm] = useState(emptyNuevoForm())
  const [savingNuevo, setSavingNuevo] = useState(false)

  // Editar inmueble
  const [editInmueble, setEditInmueble] = useState<Inmueble | null>(null)
  const [editForm, setEditForm] = useState(emptyNuevoForm())
  const [savingEdit, setSavingEdit] = useState(false)

  // Calculadora
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcInmuebleId, setCalcInmuebleId] = useState<string | null>(null)
  const [calcTipologia, setCalcTipologia] = useState('piso')
  const [tituloEstudio, setTituloEstudio] = useState('')
  const [notasEstudio, setNotasEstudio] = useState('')
  const [urlEstudio, setUrlEstudio] = useState('')
  const [nombre, setNombre] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [duracionMeses, setDuracionMeses] = useState(0)
  const [gastos, setGastos] = useState<Gastos>(emptyGastos)
  const [pvPes, setPvPes] = useState(0)
  const [pvReal, setPvReal] = useState(0)
  const [pvOpt, setPvOpt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Unidades (para edificios en calculadora)
  const [unidadesCalc, setUnidadesCalc] = useState<Unidad[]>([])
  const [unidadesOpen, setUnidadesOpen] = useState(false)

  // Visitas
  const emptyVisitaForm = () => ({ fecha: today(), hora: '10:00', responsable: '', notas_previas: '' })
  const [openVisitasId, setOpenVisitasId] = useState<string | null>(null)
  const [visitas, setVisitas] = useState<Record<string, Visita[]>>({})
  const [loadingVisitas, setLoadingVisitas] = useState<string | null>(null)
  const [agendandoVisitaId, setAgendandoVisitaId] = useState<string | null>(null)
  const [visitaForm, setVisitaForm] = useState(emptyVisitaForm())
  const [savingVisita, setSavingVisita] = useState(false)
  const [postVisitaId, setPostVisitaId] = useState<string | null>(null)
  const [postVisitaInmuebleId, setPostVisitaInmuebleId] = useState<string | null>(null)
  const [postVisitaForm, setPostVisitaForm] = useState({ estado_post: 'sigue_activo', notas_post: '', fotos_url: '' })
  const [savingPostVisita, setSavingPostVisita] = useState(false)

  // Bitácora
  const [openBitacoraId, setOpenBitacoraId] = useState<string | null>(null)
  const [bitacora, setBitacora] = useState<Record<string, unknown[]>>({})
  const [loadingBitacora, setLoadingBitacora] = useState<string | null>(null)
  const [bitacoraForm, setBitacoraForm] = useState({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' })
  const [savingBitacora, setSavingBitacora] = useState(false)
  const [editingBitacoraId, setEditingBitacoraId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('inmuebles').select('*').not('fuente', 'ilike', 'telegram%').order('created_at', { ascending: false }),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([i, p]) => {
      setInmuebles(i.data || [])
      setProveedores(p.data || [])
      setLoading(false)
    })
  }, [])

  // Auto-abrir calculadora si viene ?estudio=ID en la URL
  useEffect(() => {
    if (loading || autoOpenDone.current) return
    const estudioId = searchParams.get('estudio')
    if (!estudioId) return
    const item = inmuebles.find(i => i.id === estudioId)
    if (!item) return
    autoOpenDone.current = true
    openCalc(item.precio_compra || 0, item.titulo || item.direccion || '', item.ciudad || '', item)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, inmuebles, searchParams])

  // ── Guardar nuevo inmueble ──────────────────────────────
  const saveNuevo = async () => {
    if (!nuevoForm.direccion || !nuevoForm.precio) return
    setSavingNuevo(true)
    const payload: Record<string, unknown> = {
      titulo: nuevoForm.titulo || null,
      tipologia: nuevoForm.tipologia || 'piso',
      direccion: nuevoForm.direccion,
      ciudad: nuevoForm.ciudad || null,
      precio_compra: parseFloat(nuevoForm.precio) || 0,
      habitaciones: parseInt(nuevoForm.habitaciones) || null,
      superficie: parseInt(nuevoForm.superficie) || null,
      estado: 'sin_analizar',
      fuente: nuevoForm.fuente,
      fecha_recibido: today(),
      notas: nuevoForm.notas || null,
      url: nuevoForm.url || null,
      drive_url: nuevoForm.drive_url || null,
    }
    const { data, error } = await supabase.from('inmuebles').insert([payload]).select().single()
    setSavingNuevo(false)
    if (error) { alert(`Error al guardar: ${error.message}`); return }
    if (data) { setInmuebles(prev => [data, ...prev]); setNuevoOpen(false); setNuevoForm(emptyNuevoForm()) }
  }

  // ── Editar inmueble ─────────────────────────────────────
  const openEdit = (item: Inmueble) => {
    setEditInmueble(item)
    setEditForm({
      titulo: item.titulo || '',
      tipologia: item.tipologia || 'piso',
      direccion: item.direccion || '',
      ciudad: item.ciudad || '',
      precio: String(item.precio_compra || ''),
      habitaciones: String(item.habitaciones || ''),
      superficie: String(item.superficie || ''),
      fuente: item.fuente || 'WhatsApp',
      notas: item.notas || '',
      url: item.url || '',
      drive_url: item.drive_url || '',
    })
  }
  const saveEdit = async () => {
    if (!editInmueble) return
    setSavingEdit(true)
    const payload: Record<string, unknown> = {
      titulo: editForm.titulo || null,
      tipologia: editForm.tipologia || 'piso',
      direccion: editForm.direccion,
      ciudad: editForm.ciudad || null,
      precio_compra: parseFloat(editForm.precio) || 0,
      habitaciones: parseInt(editForm.habitaciones) || null,
      superficie: parseInt(editForm.superficie) || null,
      fuente: editForm.fuente,
      notas: editForm.notas || null,
      url: editForm.url || null,
      drive_url: editForm.drive_url || null,
    }
    const { data, error } = await supabase.from('inmuebles').update(payload).eq('id', editInmueble.id).select().single()
    setSavingEdit(false)
    if (error) { alert(`Error: ${error.message}`); return }
    if (data) { setInmuebles(prev => prev.map(x => x.id === editInmueble.id ? data : x)); setEditInmueble(null) }
  }

  const deleteInmueble = async (item: Inmueble) => {
    if (!confirm(`¿Eliminar "${item.titulo || item.direccion}"?`)) return
    const { error } = await supabase.from('inmuebles').delete().eq('id', item.id)
    if (!error) setInmuebles(prev => prev.filter(x => x.id !== item.id))
  }

  // ── Calculadora ─────────────────────────────────────────
  const openCalc = (precio: number, addr: string, ciu = '', item?: Inmueble) => {
    const g = item?.gastos_json
      ? { ...emptyGastos(), ...item.gastos_json }
      : (() => { const eg = emptyGastos(); eg.precio_compra.estimado = precio; return eg })()
    setGastos(g)
    setTituloEstudio(item?.titulo || '')
    setNotasEstudio(item?.notas || '')
    setUrlEstudio(item?.url || '')
    setNombre(addr)
    setCiudad(ciu)
    setPvPes(item?.precio_venta_conservador || 0)
    setPvReal(item?.precio_venta_realista   || 0)
    setPvOpt(item?.precio_venta_optimista   || 0)
    setDuracionMeses(item?.duracion_meses || 0)
    setCalcInmuebleId(item?.id || null)
    setCalcTipologia(item?.tipologia || 'piso')
    setSavedId(null)
    setUnidadesCalc([])
    setUnidadesOpen(false)
    // Cargar unidades si es edificio
    if (item?.tipologia === 'edificio' && item.id) {
      supabase.from('inmueble_unidades').select('*').eq('inmueble_id', item.id).order('created_at').then(({ data }) => {
        if (data) setUnidadesCalc(data)
      })
    }
    setCalcOpen(true)
  }

  const updateGasto = (id: string, tipo: 'estimado' | 'real', val: string) => {
    setGastos(prev => ({ ...prev, [id]: { ...prev[id], [tipo]: parseFloat(val) || 0 } }))
  }

  const guardar = async () => {
    if (!res) return
    setSaving(true)
    const basePayload: Record<string, unknown> = {
      titulo: tituloEstudio || null,
      direccion: nombre,
      ciudad: ciudad || null,
      precio_compra: toNum(gastos.precio_compra.estimado) || toNum(gastos.precio_compra.real),
      precio_venta_conservador: pvPes || null,
      precio_venta_realista:    pvReal || null,
      precio_venta_optimista:   pvOpt || null,
      roi_estimado: res.rent[1] || res.rent[0],
      notas: notasEstudio || null,
      url: urlEstudio || null,
      duracion_meses: duracionMeses || null,
      gastos_json: gastos,
      analizado_en: today(),
    }
    let data: Inmueble | null = null, error: unknown = null
    if (calcInmuebleId) {
      const r = await supabase.from('inmuebles').update(basePayload).eq('id', calcInmuebleId).select().single()
      data = r.data; error = r.error
      if (!error && data) setInmuebles(prev => prev.map(x => x.id === calcInmuebleId ? data! : x))
    } else {
      const r = await supabase.from('inmuebles').insert([{ ...basePayload, tipologia: calcTipologia, estado: 'en_estudio' }]).select().single()
      data = r.data; error = r.error
      if (!error && data) { setInmuebles(prev => [data!, ...prev]); setCalcInmuebleId(data!.id) }
    }
    setSaving(false)
    if (error) { alert(`Error al guardar: ${(error as {message:string}).message}`); return }
    if (data) setSavedId(data.id)
  }

  const updateEstado = async (id: string, nuevoEstado: string) => {
    setUpdatingEstado(id + '_' + nuevoEstado)
    const { error } = await supabase.from('inmuebles').update({ estado: nuevoEstado }).eq('id', id)
    setUpdatingEstado(null)
    if (error) { alert(`Error: ${error.message}`); return }
    setInmuebles(prev => prev.map(x => x.id === id ? { ...x, estado: nuevoEstado } : x))
  }

  const crearProyecto = async (item: Inmueble) => {
    if (confirmandoCompra !== item.id) { setConfirmandoCompra(item.id); return }
    setConfirmandoCompra(null)
    setCreando(item.id)
    const { data: proyecto, error } = await supabase.from('proyectos').insert([{
      nombre: item.titulo || item.direccion,
      direccion: item.direccion,
      ciudad: item.ciudad || null,
      tipo: item.tipologia || 'piso',
      estado: 'comprado',
      precio_compra: item.precio_compra || null,
      precio_venta_conservador: item.precio_venta_conservador || null,
      precio_venta_realista:    item.precio_venta_realista    || null,
      precio_venta_optimista:   item.precio_venta_optimista   || null,
      precio_venta_estimado: item.precio_venta_realista || item.precio_venta_optimista || item.precio_venta_conservador || null,
      porcentaje_hasu: 100,
      fecha_compra: today(),
    }]).select().single()
    if (error) { alert(`Error: ${error.message}`); setCreando(null); return }
    const { data: partidasInsertadas } = await supabase.from('partidas_reforma')
      .insert(PARTIDAS_PLANTILLA.map(p => ({
        proyecto_id: proyecto.id, nombre: p.nombre, categoria: p.categoria,
        orden: p.orden, presupuesto: 0, ejecutado: 0, estado: 'pendiente',
      }))).select('id, nombre')
    if (partidasInsertadas) {
      const itemsRows: {partida_id:string;nombre:string;orden:number}[] = []
      for (const partida of partidasInsertadas) {
        const template = PARTIDAS_PLANTILLA.find(pt => pt.nombre === partida.nombre)
        if (template?.items) {
          for (const it of template.items) itemsRows.push({ partida_id: partida.id, nombre: it.nombre, orden: it.orden })
        }
      }
      if (itemsRows.length > 0) await supabase.from('items_partida').insert(itemsRows)
    }
    await supabase.from('inmuebles').update({ estado: 'comprado' }).eq('id', item.id)
    setInmuebles(prev => prev.map(x => x.id === item.id ? { ...x, estado: 'comprado' } : x))
    setCreando(null)
    router.push('/proyectos')
  }

  // ── Bitácora ─────────────────────────────────────────────
  const loadBitacora = async (inmuebleId: string) => {
    if (bitacora[inmuebleId]) return
    setLoadingBitacora(inmuebleId)
    const { data } = await supabase.from('bitacora_estudio').select('*, proveedores(nombre)').eq('inmueble_id', inmuebleId).order('created_at', { ascending: false })
    setBitacora(prev => ({ ...prev, [inmuebleId]: data || [] }))
    setLoadingBitacora(null)
  }
  const toggleBitacora = (id: string) => {
    if (openBitacoraId === id) { setOpenBitacoraId(null); return }
    setOpenBitacoraId(id)
    loadBitacora(id)
    setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' })
    setEditingBitacoraId(null)
  }
  const saveBitacoraEntry = async (inmuebleId: string) => {
    if (!bitacoraForm.contenido.trim()) return
    setSavingBitacora(true)
    const payload: Record<string,unknown> = {
      inmueble_id: inmuebleId,
      contenido: bitacoraForm.contenido,
      tipo: bitacoraForm.tipo || 'nota',
      autor: bitacoraForm.autor || 'Usuario',
      url: bitacoraForm.url || null,
      proveedor_id: bitacoraForm.proveedor_id || null,
    }
    let data: unknown = null, error: unknown = null
    if (editingBitacoraId) {
      const r = await supabase.from('bitacora_estudio').update({ contenido: payload.contenido, tipo: payload.tipo, url: payload.url, proveedor_id: payload.proveedor_id }).eq('id', editingBitacoraId).select('*, proveedores(nombre)').single()
      data = r.data; error = r.error
    } else {
      const r = await supabase.from('bitacora_estudio').insert([payload]).select('*, proveedores(nombre)').single()
      data = r.data; error = r.error
    }
    setSavingBitacora(false)
    if (error) { alert(`Error: ${(error as {message:string}).message}`); return }
    if (data) {
      setBitacora(prev => {
        const list = prev[inmuebleId] || []
        if (editingBitacoraId) return { ...prev, [inmuebleId]: list.map((x: unknown) => (x as {id:string}).id === editingBitacoraId ? data : x) }
        return { ...prev, [inmuebleId]: [data, ...list] }
      })
      setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' })
      setEditingBitacoraId(null)
    }
  }
  const deleteBitacoraEntry = async (entryId: string, inmuebleId: string) => {
    await supabase.from('bitacora_estudio').delete().eq('id', entryId)
    setBitacora(prev => ({ ...prev, [inmuebleId]: (prev[inmuebleId] || []).filter((b: unknown) => (b as {id:string}).id !== entryId) }))
  }
  const openEditBitacora = (b: Record<string,unknown>) => {
    setBitacoraForm({ contenido: b.contenido as string, tipo: (b.tipo as string) || 'nota', autor: (b.autor as string) || '', url: (b.url as string) || '', proveedor_id: (b.proveedor_id as string) || '' })
    setEditingBitacoraId(b.id as string)
  }

  // ── Visitas ───────────────────────────────────────────────
  const loadVisitas = async (inmuebleId: string) => {
    if (visitas[inmuebleId]) return
    setLoadingVisitas(inmuebleId)
    const { data } = await supabase.from('visitas_radar').select('*').eq('inmueble_id', inmuebleId).order('fecha').order('hora')
    setVisitas(prev => ({ ...prev, [inmuebleId]: data || [] }))
    setLoadingVisitas(null)
  }
  const toggleVisitas = (id: string) => {
    if (openVisitasId === id) { setOpenVisitasId(null); return }
    setOpenVisitasId(id)
    loadVisitas(id)
  }
  const saveVisita = async (item: Inmueble) => {
    if (!visitaForm.fecha || !visitaForm.hora || !visitaForm.responsable) return
    setSavingVisita(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res2 = await fetch('/api/visitas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ inmueble_id: item.id, direccion: `${item.direccion}${item.ciudad ? ', '+item.ciudad : ''}`, ...visitaForm }),
    })
    setSavingVisita(false)
    if (!res2.ok) { const j = await res2.json(); alert(j.error); return }
    const { visita } = await res2.json()
    setVisitas(prev => ({ ...prev, [item.id]: [visita, ...(prev[item.id] || [])] }))
    setAgendandoVisitaId(null)
    setVisitaForm(emptyVisitaForm())
  }
  const savePostVisita = async (visitaId: string, inmuebleId: string) => {
    setSavingPostVisita(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res2 = await fetch('/api/visitas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ id: visitaId, ...postVisitaForm }),
    })
    setSavingPostVisita(false)
    if (!res2.ok) { const j = await res2.json(); alert(j.error); return }
    const { visita } = await res2.json()
    setVisitas(prev => ({ ...prev, [inmuebleId]: (prev[inmuebleId] || []).map(v => v.id === visitaId ? visita : v) }))
    setPostVisitaId(null)
    setPostVisitaInmuebleId(null)
    setPostVisitaForm({ estado_post: 'sigue_activo', notas_post: '', fotos_url: '' })
  }

  // ── PDF ──────────────────────────────────────────────────
  const exportarPDF = () => {
    if (!res) return
    import('jspdf').then(({ jsPDF }) => {
      const doc = new jsPDF()
      const naranja = [230, 126, 34] as [number,number,number]
      const negro = [0, 0, 0] as [number,number,number]
      const gris = [100, 100, 100] as [number,number,number]
      const grisClaro = [240, 240, 240] as [number,number,number]
      let y = 15
      doc.setDrawColor(...naranja); doc.setLineWidth(1); doc.line(14, y, 196, y); y += 10
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...naranja); doc.text('WALLEST', 14, y); y += 7
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gris); doc.text('Hasu Activos Inmobiliarios SL', 14, y); y += 5
      doc.setDrawColor(...naranja); doc.setLineWidth(0.5); doc.line(14, y, 196, y); y += 10
      doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...negro)
      doc.text('Análisis de Rentabilidad', 14, y); y += 8
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...gris)
      if (nombre) { doc.text(`Dirección: ${nombre}`, 14, y); y += 6 }
      if (ciudad) { doc.text(`Municipio: ${ciudad}`, 14, y); y += 6 }
      doc.text(`Fecha del análisis: ${new Date().toLocaleDateString('es-ES', { day:'2-digit', month:'long', year:'numeric' })}`, 14, y); y += 6
      doc.text(`Duración estimada de la operación: ${duracionMeses} meses`, 14, y); y += 10
      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...negro)
      doc.text('Concepto', 16, y + 5.5); doc.text('Estimado', 130, y + 5.5, { align: 'right' }); doc.text('Real', 196, y + 5.5, { align: 'right' }); y += 8
      doc.setFont('helvetica', 'normal')
      CONCEPTOS_GASTOS.forEach(c => {
        const est = gastos[c.id].estimado; const rea = gastos[c.id].real
        if (est === 0 && rea === 0) return
        if (y > 270) { doc.addPage(); y = 20 }
        doc.setTextColor(...negro); doc.text(c.nombre, 16, y + 5)
        doc.text(est > 0 ? fmt2(est) : '-', 130, y + 5, { align: 'right' })
        doc.text(rea > 0 ? fmt2(rea) : '-', 196, y + 5, { align: 'right' })
        doc.setDrawColor(220,220,220); doc.line(14, y+8, 196, y+8); y += 9
      })
      y += 2
      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 9, 'F')
      doc.setFont('helvetica', 'bold'); doc.setTextColor(...naranja)
      doc.text('TOTAL INVERSIÓN', 16, y + 6); doc.text(fmt2(res.totalEst), 130, y + 6, { align: 'right' }); doc.text(fmt2(res.totalReal), 196, y + 6, { align: 'right' }); y += 18
      if (y > 230) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...negro)
      doc.text('Escenarios de Rentabilidad', 14, y); y += 8
      doc.setFillColor(...grisClaro); doc.rect(14, y, 182, 8, 'F')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...negro)
      doc.text('Escenario', 16, y + 5.5); doc.text('Precio Venta', 90, y + 5.5, { align: 'right' }); doc.text('Beneficio', 130, y + 5.5, { align: 'right' }); doc.text('ROI', 163, y + 5.5, { align: 'right' }); doc.text('ROI Anualizado', 196, y + 5.5, { align: 'right' }); y += 8
      const ESCS = [{ nombre: 'Conservador', pv: pvPes, idx: 0 }, { nombre: 'Realista', pv: pvReal, idx: 1 }, { nombre: 'Optimista', pv: pvOpt, idx: 2 }]
      doc.setFont('helvetica', 'normal')
      ESCS.forEach(esc => {
        doc.setTextColor(...negro); doc.text(esc.nombre, 16, y + 5); doc.text(fmt2(toNum(esc.pv)), 90, y + 5, { align: 'right' })
        const col = res.ben[esc.idx] >= 0 ? [22,163,74] as [number,number,number] : [220,38,38] as [number,number,number]
        doc.setTextColor(...col); doc.text(fmt2(res.ben[esc.idx]), 130, y + 5, { align: 'right' }); doc.text(fmtPct(res.rent[esc.idx]), 163, y + 5, { align: 'right' })
        const av = res.anual[esc.idx]; doc.text(av !== null ? fmtPct(av) : '—', 196, y + 5, { align: 'right' })
        doc.setDrawColor(220,220,220); doc.setTextColor(...negro); doc.line(14, y+8, 196, y+8); y += 9
      })
      const totalPages = doc.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i); doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...gris)
        doc.text('Wallest — Hasu Activos Inmobiliarios SL', 14, 290); doc.text(new Date().toLocaleDateString('es-ES'), 196, 290, { align: 'right' })
      }
      doc.save(`${(nombre || 'analisis').replace(/[^a-zA-Z0-9]/g,'-')}-rentabilidad.pdf`)
    })
  }

  // ── Derived ─────────────────────────────────────────────
  const inmueblesFiltrados = filtroTipologia === 'todos'
    ? inmuebles
    : inmuebles.filter(x => x.tipologia === filtroTipologia)

  const res = calcResultados(gastos, pvPes, pvReal, pvOpt, duracionMeses)

  const CARD = { background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }
  const INP  = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' }
  const ESC_UI = [
    { label: 'Conservador', pv: pvPes,  idx: 0, color: '#EF4444' },
    { label: 'Realista',    pv: pvReal, idx: 1, color: '#F59E0B' },
    { label: 'Optimista',   pv: pvOpt,  idx: 2, color: '#22C55E' },
  ]
  const FILTROS = ['todos', 'piso', 'casa', 'duplex', 'edificio', 'suelo', 'nave']
  const FILTRO_LABELS: Record<string, string> = { todos: 'Todos', piso: 'Piso', casa: 'Casa', duplex: 'Dúplex', edificio: 'Edificio', suelo: 'Suelo', nave: 'Nave' }
  const TIPO_ICON: Record<string, string> = { nota: '📝', llamada: '📞', email: '✉️', visita: '🏠', documento: '📄', api: '🤝' }

  // JSX helpers
  const renderBitacora = (item: Inmueble) => (
    <>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#111' }}>
        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#555' }}>
          Bitácora{bitacora[item.id] ? ` (${(bitacora[item.id] || []).length})` : ''}
        </span>
        <button onClick={() => toggleBitacora(item.id)}
          className="text-[11px] font-black px-2.5 py-1 rounded-lg"
          style={{ background: openBitacoraId === item.id ? 'rgba(242,110,31,0.18)' : 'rgba(255,255,255,0.06)', color: openBitacoraId === item.id ? '#F26E1F' : '#888', border: `1px solid ${openBitacoraId === item.id ? 'rgba(242,110,31,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
          {openBitacoraId === item.id ? '▲ Cerrar' : '▼ Bitácora'}
        </button>
      </div>
      {openBitacoraId === item.id && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0D0D0D' }}>
          <div className="mb-4 rounded-xl p-3" style={{ background: '#181818', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: '#555' }}>
              {editingBitacoraId ? 'Editar entrada' : 'Nueva entrada'}
            </div>
            <textarea value={bitacoraForm.contenido} onChange={ev => setBitacoraForm(f => ({ ...f, contenido: ev.target.value }))}
              placeholder="Visita realizada, llamada con API, precio negociable..." rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555] mb-2"
              style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)' }}
              onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='rgba(255,255,255,0.10)'} />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#555' }}>Tipo</label>
                <select value={bitacoraForm.tipo} onChange={ev => setBitacoraForm(f => ({ ...f, tipo: ev.target.value }))}
                  className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none font-medium"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', appearance: 'none' as const }}>
                  <option value="nota">📝 Nota</option>
                  <option value="llamada">📞 Llamada</option>
                  <option value="email">✉️ Email</option>
                  <option value="visita">🏠 Visita</option>
                  <option value="documento">📄 Documento</option>
                  <option value="api">🤝 API</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#555' }}>Autor</label>
                <input type="text" value={bitacoraForm.autor} onChange={ev => setBitacoraForm(f => ({ ...f, autor: ev.target.value }))}
                  placeholder="Patricio"
                  className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none font-medium placeholder:text-[#555]"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)' }}
                  onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
            </div>
            <div className="mb-2">
              <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#555' }}>Link externo</label>
              <input type="url" value={bitacoraForm.url} onChange={ev => setBitacoraForm(f => ({ ...f, url: ev.target.value }))} placeholder="https://..."
                className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none font-medium placeholder:text-[#555]"
                style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)' }}
                onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='rgba(255,255,255,0.10)'} />
            </div>
            {proveedores.length > 0 && (
              <div className="mb-2">
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#555' }}>Proveedor</label>
                <select value={bitacoraForm.proveedor_id} onChange={ev => setBitacoraForm(f => ({ ...f, proveedor_id: ev.target.value }))}
                  className="w-full rounded-lg px-2 py-2 text-xs text-white outline-none font-medium"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', appearance: 'none' as const }}>
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              {editingBitacoraId && (
                <button onClick={() => { setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' }); setEditingBitacoraId(null) }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
              )}
              <button onClick={() => saveBitacoraEntry(item.id)} disabled={savingBitacora || !bitacoraForm.contenido.trim()}
                className="flex-1 py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>
                {savingBitacora ? '...' : editingBitacoraId ? 'Guardar' : '+ Agregar'}
              </button>
            </div>
          </div>
          {loadingBitacora === item.id ? (
            <div className="py-4 text-center text-xs" style={{ color: '#555' }}>Cargando...</div>
          ) : !(bitacora[item.id] || []).length ? (
            <div className="py-3 text-center text-xs" style={{ color: '#555' }}>Sin entradas todavía.</div>
          ) : (
            <div className="pl-5 relative">
              <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#282828' }} />
              {(bitacora[item.id] || []).map((b: unknown) => {
                const entry = b as Record<string, unknown>
                return (
                  <div key={entry.id as string} className="relative mb-4">
                    <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background: '#F26E1F', border: '2px solid #0A0A0A' }} />
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-[10px] font-bold font-mono tracking-wide" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        {new Date(entry.created_at as string).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                        {' · '}{TIPO_ICON[entry.tipo as string] || '📝'} {((entry.tipo as string) || 'nota').toUpperCase()}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditBitacora(entry)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>✎</button>
                        <button onClick={() => deleteBitacoraEntry(entry.id as string, item.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>✕</button>
                      </div>
                    </div>
                    <div className="text-sm font-bold text-white leading-relaxed">{entry.contenido as string}</div>
                    {entry.url && (
                      <a href={entry.url as string} target="_blank" rel="noopener noreferrer" className="text-xs font-bold inline-flex items-center gap-1 mt-1" style={{ color: '#60A5FA' }}>🔗 Ver link</a>
                    )}
                    <div className="flex items-center gap-2 mt-0.5">
                      {entry.autor && <div className="text-xs font-bold" style={{ color: '#F26E1F' }}>{entry.autor as string}</div>}
                      {(entry.proveedores as {nombre:string})?.nombre && <div className="text-xs font-medium" style={{ color: '#888' }}>· {(entry.proveedores as {nombre:string}).nombre}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </>
  )

  const renderVisitas = (item: Inmueble) => (
    <>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#111' }}>
        <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#555' }}>
          Visitas{visitas[item.id] ? ` (${visitas[item.id].length})` : ''}
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => { setAgendandoVisitaId(item.id); setVisitaForm(emptyVisitaForm()) }}
            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>+ Agendar</button>
          <button onClick={() => toggleVisitas(item.id)}
            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: openVisitasId === item.id ? 'rgba(242,110,31,0.18)' : 'rgba(255,255,255,0.06)', color: openVisitasId === item.id ? '#F26E1F' : '#888', border: `1px solid ${openVisitasId === item.id ? 'rgba(242,110,31,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
            {openVisitasId === item.id ? '▲' : '▼ Ver'}
          </button>
        </div>
      </div>
      {openVisitasId === item.id && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0D0D0D' }}>
          {loadingVisitas === item.id
            ? <div className="text-xs py-2" style={{ color: '#555' }}>Cargando...</div>
            : (visitas[item.id] || []).length === 0
              ? <div className="text-xs py-2" style={{ color: '#555' }}>Sin visitas agendadas todavía.</div>
              : (visitas[item.id] || []).map(v => (
                <div key={v.id} className="rounded-xl p-3 mb-2" style={{ background: '#181818', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-black text-white">{v.fecha} · {v.hora}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#ccc' }}>Resp: {v.responsable}</div>
                      {v.notas_previas && <div className="text-xs mt-0.5" style={{ color: '#888' }}>{v.notas_previas}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      {v.gcal_event_id && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(96,165,250,0.15)', color: '#60A5FA' }}>📅</span>}
                      {!v.estado_post && (
                        <button onClick={() => { setPostVisitaId(v.id); setPostVisitaInmuebleId(item.id); setPostVisitaForm({ estado_post: 'sigue_activo', notas_post: '', fotos_url: '' }) }}
                          className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>Post-visita</button>
                      )}
                    </div>
                  </div>
                  {v.estado_post && (
                    <div className="mt-2 pt-2 flex gap-2 items-start" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: v.estado_post === 'descartado' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)', color: v.estado_post === 'descartado' ? '#EF4444' : '#F59E0B' }}>
                        {v.estado_post === 'descartado' ? 'Descartado' : 'Sigue activo'}
                      </span>
                      {v.notas_post && <span className="text-xs flex-1" style={{ color: '#888' }}>{v.notas_post}</span>}
                    </div>
                  )}
                </div>
              ))
          }
        </div>
      )}
    </>
  )

  return (
    <div>
      {/* ── Banner cabecera ── */}
      <div className="relative w-full" style={{ height: 160, overflow: 'hidden' }}>
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1200&h=320&fit=crop&q=80"
          alt="Mercado"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(10,10,10,0.75))' }} />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 flex items-end justify-between">
          <div>
            <h1 className="font-black text-[22px] text-white leading-tight">Mercado</h1>
            <p className="text-[12px] font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>Inmuebles en estudio</p>
          </div>
          <button onClick={() => setNuevoOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white"
            style={{ background: '#F26E1F' }}>
            + Agregar
          </button>
        </div>
      </div>

      <div className="p-4">
      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltroTipologia(f)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
            style={{ background: filtroTipologia === f ? '#F26E1F' : '#1E1E1E', color: filtroTipologia === f ? '#fff' : '#888', border: filtroTipologia === f ? '1px solid #F26E1F' : '1px solid rgba(255,255,255,0.08)' }}>
            {FILTRO_LABELS[f]}{f !== 'todos' ? ` (${inmuebles.filter(x => x.tipologia === f).length})` : ` (${inmuebles.length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
          {[1,2,3].map(i => <div key={i} className="h-52 rounded-2xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : inmueblesFiltrados.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: '#555' }}>Sin inmuebles todavía</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '12px' }}>
          {inmueblesFiltrados.map(item => {
            const isAnalizado = !!item.analizado_en
            const cfg = SUBESTADO_CFG[item.estado] || SUBESTADO_CFG.sin_analizar
            const tipLabel = TIPOLOGIA_LABELS[item.tipologia] || item.tipologia
            return (
              <div key={item.id} className="rounded-2xl overflow-hidden flex flex-col" style={CARD}>
                {/* Imagen / placeholder */}
                <div className="relative" style={{ height: 140, background: item.imagen_portada ? 'transparent' : '#1A1A1A', overflow: 'hidden' }}>
                  {item.imagen_portada
                    ? <img src={item.imagen_portada} alt="" className="w-full h-full object-cover" />
                    : <div className="flex items-center justify-center h-full text-4xl" style={{ color: '#2A2A2A' }}>{item.tipologia === 'edificio' ? '🏢' : item.tipologia === 'suelo' ? '🏗' : item.tipologia === 'nave' ? '🏭' : '🏠'}</div>
                  }
                  <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>{tipLabel}</span>
                    {item.fuente && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.7)', color: '#aaa' }}>{item.fuente}</span>}
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                </div>

                {/* Contenido */}
                <div className="p-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-[16px] text-white leading-tight truncate">{item.titulo || item.direccion}</div>
                      {item.titulo && <div className="text-xs mt-0.5 truncate" style={{ color: '#888' }}>{item.direccion}{item.ciudad ? ` · ${item.ciudad}` : ''}</div>}
                      {!item.titulo && item.ciudad && <div className="text-xs mt-0.5" style={{ color: '#888' }}>{item.ciudad}</div>}
                    </div>
                    <div className="text-sm font-black font-mono flex-shrink-0" style={{ color: '#F26E1F' }}>{fmt(item.precio_compra || 0)}</div>
                  </div>

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {item.superficie && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#ccc' }}>{item.superficie} m²</span>}
                    {item.habitaciones && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#ccc' }}>{item.habitaciones} hab</span>}
                    {item.num_plantas && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.06)', color: '#ccc' }}>{item.num_plantas} plantas</span>}
                  </div>

                  {/* Para edificios: grid métricas compacto */}
                  {item.tipologia === 'edificio' && (
                    <div className="grid grid-cols-3 gap-1.5 mt-3 rounded-xl" style={{ background: '#1A1A1A', padding: '10px 8px' }}>
                      {[
                        { label: 'Precio', val: fmt(item.precio_compra || 0) },
                        { label: 'Unidades', val: unidades[item.id] ? String(unidades[item.id].length) : '—' },
                        { label: 'm²', val: item.superficie ? String(item.superficie) : '—' },
                      ].map(m => (
                        <div key={m.label} className="text-center">
                          <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5 opacity-40 text-white">{m.label}</div>
                          <div className="text-[12px] font-black text-white">{m.val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Para no-edificios: ROI y precios si analizado */}
                  {item.tipologia !== 'edificio' && isAnalizado && (
                    <div className="grid grid-cols-3 gap-1.5 mt-3 rounded-xl p-2" style={{ background: '#1A1A1A' }}>
                      {[
                        { label: 'Pesimista', val: item.precio_venta_conservador, color: '#EF4444' },
                        { label: 'Realista',  val: item.precio_venta_realista,    color: '#F59E0B' },
                        { label: 'Optimista', val: item.precio_venta_optimista,   color: '#22C55E' },
                      ].map(s => (
                        <div key={s.label} className="text-center">
                          <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: s.color }}>{s.label}</div>
                          <div className="text-[11px] font-black font-mono" style={{ color: s.color }}>{s.val ? fmt(s.val) : '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.tipologia !== 'edificio' && isAnalizado && item.roi_estimado !== undefined && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-black" style={{ color: '#22C55E' }}>↗ ROI {item.roi_estimado?.toFixed(1)}%</span>
                      {item.analizado_en && <span className="text-[10px]" style={{ color: '#555' }}>· {item.analizado_en}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold" style={{ color: '#60A5FA' }}>🔗 Ver anuncio</a>}
                    {item.drive_url && <a href={item.drive_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)' }}>📁 Drive</a>}
                  </div>
                  {/* Notas: solo en pisos/casas (no edificios inline) */}
                  {item.tipologia !== 'edificio' && item.notas && <div className="mt-2 text-xs" style={{ color: '#888' }}>{item.notas}</div>}

                  {/* Ver detalle (edificios): expande notas + info adicional */}
                  {item.tipologia === 'edificio' && (
                    <button onClick={() => setExpandedDetalle(expandedDetalle === item.id ? null : item.id)}
                      className="mt-3 w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5"
                      style={{ background: expandedDetalle === item.id ? 'rgba(242,110,31,0.18)' : 'rgba(255,255,255,0.05)', color: expandedDetalle === item.id ? '#F26E1F' : '#888', border: `1px solid ${expandedDetalle === item.id ? 'rgba(242,110,31,0.3)' : 'rgba(255,255,255,0.08)'}` }}>
                      {expandedDetalle === item.id ? '▲ Cerrar detalle' : '▼ Ver detalle'}
                    </button>
                  )}

                  {/* Panel detalle expandido (edificios) */}
                  {item.tipologia === 'edificio' && expandedDetalle === item.id && (
                    <div className="mt-3 rounded-xl p-3" style={{ background: '#111', border: '1px solid rgba(255,255,255,0.07)' }}>
                      {item.notas && (
                        <>
                          <div className="text-[9px] font-black uppercase tracking-wide mb-1.5 opacity-40 text-white">Descripción</div>
                          <div className="text-[12px] leading-relaxed mb-3" style={{ color: '#ccc' }}>{item.notas}</div>
                        </>
                      )}
                      {/* Unidades del edificio */}
                      {unidades[item.id] && unidades[item.id].length > 0 && (
                        <>
                          <div className="text-[9px] font-black uppercase tracking-wide mb-1.5 opacity-40 text-white">Unidades ({unidades[item.id].length})</div>
                          <div className="flex flex-col gap-1">
                            {unidades[item.id].map(u => (
                              <div key={u.id} className="flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: '#1A1A1A' }}>
                                <span className="text-[11px] font-bold text-white">{u.tipo}{u.planta ? ` · P${u.planta}` : ''}</span>
                                <div className="flex gap-2">
                                  {u.superficie && <span className="text-[10px]" style={{ color: '#888' }}>{u.superficie}m²</span>}
                                  {u.precio_venta_est && <span className="text-[10px] font-bold" style={{ color: '#22C55E' }}>{fmt(u.precio_venta_est)}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Botones principales */}
                <div className="flex gap-1.5 px-3 py-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <button onClick={() => openCalc(item.precio_compra || 0, item.titulo || item.direccion, item.ciudad || '', item)}
                    className="flex-1 text-xs font-black px-2 py-2 rounded-xl"
                    style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                    {isAnalizado ? '✎ Análisis' : '⊕ Calcular'}
                  </button>
                  <button onClick={() => openEdit(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: 'rgba(255,255,255,0.06)', color: '#ccc', border: '1px solid rgba(255,255,255,0.10)' }}>✎</button>
                  <button onClick={() => deleteInmueble(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.22)' }}>🗑</button>
                </div>

                {/* Estado */}
                {item.estado !== 'sin_analizar' && item.estado !== 'comprado' && (
                  <div className="flex gap-2 px-3 py-2 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span className="text-[10px] font-bold self-center flex-shrink-0 uppercase tracking-wide" style={{ color: '#555' }}>Estado:</span>
                    {(['ofertado', 'en_arras'] as const).map(s => {
                      const c = SUBESTADO_CFG[s]; const activo = item.estado === s
                      return (
                        <button key={s} onClick={() => updateEstado(item.id, activo ? 'en_estudio' : s)} disabled={!!updatingEstado}
                          className="text-[11px] font-black px-2.5 py-1 rounded-lg disabled:opacity-50"
                          style={{ background: activo ? c.bg : 'rgba(255,255,255,0.05)', color: activo ? c.color : '#666', border: `1px solid ${activo ? c.color+'60' : 'rgba(255,255,255,0.08)'}` }}>
                          {updatingEstado === item.id+'_'+(activo?'en_estudio':s) ? '...' : c.label}
                        </button>
                      )
                    })}
                    {confirmandoCompra === item.id ? (
                      <div className="flex gap-1.5 ml-auto">
                        <button onClick={() => crearProyecto(item)} disabled={creando === item.id} className="text-[11px] font-black px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: 'rgba(34,197,94,0.3)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.6)' }}>{creando === item.id ? '...' : '✓ Confirmar'}</button>
                        <button onClick={() => setConfirmandoCompra(null)} className="text-[11px] font-black px-2 py-1 rounded-lg" style={{ background: '#282828', color: '#888' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => crearProyecto(item)} disabled={creando === item.id} className="text-[11px] font-black px-2.5 py-1 rounded-lg ml-auto disabled:opacity-50" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.35)' }}>{creando === item.id ? '...' : 'Comprado →'}</button>
                    )}
                  </div>
                )}
                {item.estado === 'comprado' && (
                  <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(34,197,94,0.06)' }}>
                    <span className="text-[11px] font-bold" style={{ color: '#22C55E' }}>✓ Proyecto creado</span>
                    <button onClick={() => router.push('/proyectos')} className="text-[11px] font-black px-2.5 py-1 rounded-lg ml-auto" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.35)' }}>Ver →</button>
                  </div>
                )}

                {renderVisitas(item)}
                {renderBitacora(item)}
              </div>
            )
          })}
        </div>
      )}
      </div>{/* /p-4 content wrapper */}

      {/* ═══ MODAL NUEVO ═══ */}
      {nuevoOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setNuevoOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', maxWidth: 480, margin: '0 auto' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="flex items-center justify-between mb-5">
                <div className="font-black text-[17px] text-white">Agregar inmueble</div>
                <button onClick={() => setNuevoOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Tipo *</label>
                  <div className="flex gap-2 flex-wrap">
                    {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                      <button key={t} onClick={() => setNuevoForm(f => ({ ...f, tipologia: t }))}
                        className="px-3 py-1.5 rounded-xl text-xs font-black"
                        style={{ background: nuevoForm.tipologia === t ? '#F26E1F' : '#282828', color: nuevoForm.tipologia === t ? '#fff' : '#888', border: nuevoForm.tipologia === t ? '1px solid #F26E1F' : '1px solid rgba(255,255,255,0.08)' }}>
                        {TIPOLOGIA_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
                  <input type="text" value={nuevoForm.titulo} onChange={e => setNuevoForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección *</label>
                  <input type="text" value={nuevoForm.direccion} onChange={e => setNuevoForm(f => ({ ...f, direccion: e.target.value }))} placeholder="C/ Mayor 4" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                  <input type="text" value={nuevoForm.ciudad} onChange={e => setNuevoForm(f => ({ ...f, ciudad: e.target.value }))} placeholder="Zurgena" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Precio (€) *</label>
                  <input type="number" value={nuevoForm.precio} onChange={e => setNuevoForm(f => ({ ...f, precio: e.target.value }))} placeholder="65000" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium font-mono placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Habitaciones</label>
                  <input type="number" value={nuevoForm.habitaciones} onChange={e => setNuevoForm(f => ({ ...f, habitaciones: e.target.value }))} placeholder="3" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>m²</label>
                  <input type="number" value={nuevoForm.superficie} onChange={e => setNuevoForm(f => ({ ...f, superficie: e.target.value }))} placeholder="85" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Fuente</label>
                  <select value={nuevoForm.fuente} onChange={e => setNuevoForm(f => ({ ...f, fuente: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={{ ...INP, appearance: 'none' as const }}>
                    <option value="WhatsApp">WhatsApp</option><option value="Idealista">Idealista</option><option value="Fotocasa">Fotocasa</option><option value="API">API</option><option value="otro">Otro</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link anuncio</label>
                  <input type="url" value={nuevoForm.url} onChange={e => setNuevoForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>📁 Carpeta Drive</label>
                  <input type="url" value={nuevoForm.drive_url} onChange={e => setNuevoForm(f => ({ ...f, drive_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas</label>
                  <textarea value={nuevoForm.notas} onChange={e => setNuevoForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setNuevoOpen(false)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveNuevo} disabled={savingNuevo || !nuevoForm.direccion || !nuevoForm.precio} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>{savingNuevo ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ MODAL EDITAR ═══ */}
      {editInmueble && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setEditInmueble(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', maxWidth: 480, margin: '0 auto' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="flex items-center justify-between mb-5">
                <div className="font-black text-[17px] text-white">Editar inmueble</div>
                <button onClick={() => setEditInmueble(null)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Tipo</label>
                  <div className="flex gap-2 flex-wrap">
                    {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                      <button key={t} onClick={() => setEditForm(f => ({ ...f, tipologia: t }))}
                        className="px-3 py-1.5 rounded-xl text-xs font-black"
                        style={{ background: editForm.tipologia === t ? '#F26E1F' : '#282828', color: editForm.tipologia === t ? '#fff' : '#888', border: editForm.tipologia === t ? '1px solid #F26E1F' : '1px solid rgba(255,255,255,0.08)' }}>
                        {TIPOLOGIA_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
                  <input type="text" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
                  <input type="text" value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                  <input type="text" value={editForm.ciudad} onChange={e => setEditForm(f => ({ ...f, ciudad: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Precio (€)</label>
                  <input type="number" value={editForm.precio} onChange={e => setEditForm(f => ({ ...f, precio: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium font-mono" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Habitaciones</label>
                  <input type="number" value={editForm.habitaciones} onChange={e => setEditForm(f => ({ ...f, habitaciones: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>m²</label>
                  <input type="number" value={editForm.superficie} onChange={e => setEditForm(f => ({ ...f, superficie: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link anuncio</label>
                  <input type="url" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>📁 Drive</label>
                  <input type="url" value={editForm.drive_url} onChange={e => setEditForm(f => ({ ...f, drive_url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                </div>
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setEditInmueble(null)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>{savingEdit ? 'Guardando...' : 'Guardar cambios'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ MODAL AGENDAR VISITA ═══ */}
      {agendandoVisitaId && (() => {
        const item = inmuebles.find(x => x.id === agendandoVisitaId)
        if (!item) return null
        return (
          <>
            <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setAgendandoVisitaId(null)} />
            <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', maxWidth: 480, margin: '0 auto' }}>
              <div className="p-5 pb-8">
                <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="font-black text-[17px] text-white">Agendar visita</div>
                    <div className="text-xs mt-0.5" style={{ color: '#888' }}>{item.titulo || item.direccion}{item.ciudad ? `, ${item.ciudad}` : ''}</div>
                  </div>
                  <button onClick={() => setAgendandoVisitaId(null)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Fecha *</label>
                    <input type="date" value={visitaForm.fecha} onChange={e => setVisitaForm(f => ({ ...f, fecha: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Hora *</label>
                    <input type="time" value={visitaForm.hora} onChange={e => setVisitaForm(f => ({ ...f, hora: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Responsable *</label>
                    <input type="text" value={visitaForm.responsable} onChange={e => setVisitaForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Patricio" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas previas</label>
                    <textarea value={visitaForm.notas_previas} onChange={e => setVisitaForm(f => ({ ...f, notas_previas: e.target.value }))} placeholder="Piso vacío, llave con el portero..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setAgendandoVisitaId(null)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                  <button onClick={() => saveVisita(item)} disabled={savingVisita || !visitaForm.responsable} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>{savingVisita ? 'Agendando...' : '📅 Agendar'}</button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ═══ MODAL POST-VISITA ═══ */}
      {postVisitaId && postVisitaInmuebleId && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => { setPostVisitaId(null); setPostVisitaInmuebleId(null) }} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '92vh', maxWidth: 480, margin: '0 auto' }}>
            <div className="p-5 pb-8">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="flex items-center justify-between mb-4">
                <div className="font-black text-[17px] text-white">Registrar resultado</div>
                <button onClick={() => { setPostVisitaId(null); setPostVisitaInmuebleId(null) }} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#888' }}>Estado post-visita</label>
                <div className="flex gap-2">
                  {[{ v: 'descartado', label: 'Descartado', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' }, { v: 'sigue_activo', label: 'Sigue activo', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' }].map(opt => (
                    <button key={opt.v} onClick={() => setPostVisitaForm(f => ({ ...f, estado_post: opt.v }))}
                      className="flex-1 py-2 rounded-xl text-[11px] font-black"
                      style={{ background: postVisitaForm.estado_post === opt.v ? opt.bg : 'rgba(255,255,255,0.05)', color: postVisitaForm.estado_post === opt.v ? opt.color : '#666', border: `1px solid ${postVisitaForm.estado_post === opt.v ? opt.color+'60' : 'rgba(255,255,255,0.08)'}` }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas</label>
                <textarea value={postVisitaForm.notas_post} onChange={e => setPostVisitaForm(f => ({ ...f, notas_post: e.target.value }))} placeholder="Piso en buen estado..." rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div className="mb-4">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link fotos (Drive)</label>
                <input type="url" value={postVisitaForm.fotos_url} onChange={e => setPostVisitaForm(f => ({ ...f, fotos_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPostVisitaId(null); setPostVisitaInmuebleId(null) }} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={() => savePostVisita(postVisitaId, postVisitaInmuebleId)} disabled={savingPostVisita} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>{savingPostVisita ? 'Guardando...' : 'Guardar'}</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ═══ CALCULADORA FULL SCREEN ═══ */}
      {calcOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#0A0A0A' }}>
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-[54px]" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <button onClick={() => setCalcOpen(false)} className="font-black text-xl" style={{ color: '#888' }}>←</button>
            <div className="flex-1 font-black text-[16px] text-white">{calcInmuebleId ? 'Editar análisis' : 'Calculadora de Rentabilidad'}</div>
            <button onClick={exportarPDF} disabled={!res} className="text-xs font-black px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}>PDF</button>
          </div>
          <div className="p-4 pb-10">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
                <input type="text" value={tituloEstudio} onChange={e => setTituloEstudio(e.target.value)} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#F26E1F' }}>Duración (meses) *</label>
                <input type="number" value={duracionMeses || ''} onChange={e => setDuracionMeses(parseFloat(e.target.value) || 0)} placeholder="ej: 6" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
            </div>

            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Gastos estimados y reales</div>
            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#555' }}>Concepto</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#555' }}>Estimado</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#22C55E' }}>Real</div>
              </div>
              {CONCEPTOS_GASTOS.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_80px_80px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined, background: '#141414' }}>
                  <div className="text-xs font-medium pr-2" style={{ color: '#ccc', lineHeight: 1.3 }}>{c.nombre}</div>
                  <div className="px-1"><input type="number" value={gastos[c.id].estimado || ''} onChange={e => updateGasto(c.id, 'estimado', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.10)', color: '#fff' }} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} /></div>
                  <div className="px-1"><input type="number" value={gastos[c.id].real || ''} onChange={e => updateGasto(c.id, 'real', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#0A0A0A', border: '1px solid rgba(34,197,94,0.3)', color: '#22C55E' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.3)'} /></div>
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

            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Precio de venta por escenario</div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#EF4444' }}>Conservador</label>
                <input type="number" value={pvPes || ''} onChange={e => setPvPes(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#0A0A0A', border: '1.5px solid rgba(239,68,68,0.4)', color: '#EF4444' }} onFocus={e => e.target.style.borderColor='#EF4444'} onBlur={e => e.target.style.borderColor='rgba(239,68,68,0.4)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#F59E0B' }}>Realista</label>
                <input type="number" value={pvReal || ''} onChange={e => setPvReal(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#0A0A0A', border: '1.5px solid rgba(245,158,11,0.4)', color: '#F59E0B' }} onFocus={e => e.target.style.borderColor='#F59E0B'} onBlur={e => e.target.style.borderColor='rgba(245,158,11,0.4)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#22C55E' }}>Optimista</label>
                <input type="number" value={pvOpt || ''} onChange={e => setPvOpt(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#0A0A0A', border: '1.5px solid rgba(34,197,94,0.4)', color: '#22C55E' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.4)'} placeholder="€" />
              </div>
            </div>

            {/* Unidades edificio */}
            {calcTipologia === 'edificio' && (
              <div className="mb-5">
                <button onClick={() => setUnidadesOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#1A1A1A', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Unidades del edificio {unidadesCalc.length > 0 ? `(${unidadesCalc.length})` : ''}</span>
                  <span style={{ color: '#555' }}>{unidadesOpen ? '▲' : '▼'}</span>
                </button>
                {unidadesOpen && (
                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    {unidadesCalc.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs" style={{ color: '#555' }}>Sin unidades. Agregalas desde el chat WOS3.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_70px_80px] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                          <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#555' }}>Unidad</div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#555' }}>m²</div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-right" style={{ color: '#22C55E' }}>P. Venta Est.</div>
                        </div>
                        {unidadesCalc.map((u, i) => (
                          <div key={u.id} className="grid grid-cols-[1fr_70px_80px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : undefined, background: '#141414' }}>
                            <div className="text-xs font-medium" style={{ color: '#ccc' }}>{u.tipo}{u.planta ? ` P${u.planta}` : ''}</div>
                            <div className="text-xs font-mono text-center" style={{ color: '#888' }}>{u.superficie || '—'}</div>
                            <div className="text-xs font-black font-mono text-right" style={{ color: '#22C55E' }}>{u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_70px_80px] px-3 py-2" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.10)' }}>
                          <div className="text-xs font-black uppercase" style={{ color: '#F26E1F' }}>TOTAL</div>
                          <div />
                          <div className="text-xs font-black font-mono text-right" style={{ color: '#22C55E' }}>{fmt(unidadesCalc.reduce((s, u) => s + (u.precio_venta_est || 0), 0))}</div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link fuente</label>
                <input type="url" value={urlEstudio} onChange={e => setUrlEstudio(e.target.value)} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Observaciones</label>
                <textarea value={notasEstudio} onChange={e => setNotasEstudio(e.target.value)} placeholder="Notas, condiciones, contacto..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
            </div>

            {res && (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados por escenario</div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    <div />
                    {ESC_UI.map(esc => <div key={esc.label} className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>{esc.label}</div>)}
                  </div>
                  {[
                    { label: 'P. Venta',   vals: ESC_UI.map(e => fmt(toNum(e.pv))),                                            colors: ESC_UI.map(() => '#fff') },
                    { label: 'Beneficio',  vals: ESC_UI.map((_,i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])),         colors: ESC_UI.map((_,i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444') },
                    { label: 'ROI oper.',  vals: ESC_UI.map((_,i) => fmtPct(res.rent[i])),                                    colors: ESC_UI.map((_,i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444') },
                    { label: `ROI anual${duracionMeses > 0 ? ` (${duracionMeses}m)` : ''}`, vals: ESC_UI.map((_,i) => res.anual[i] !== null ? fmtPct(res.anual[i]!) : '—'), colors: ESC_UI.map((_,i) => res.anual[i] === null ? '#555' : res.anual[i]! >= 15 ? '#22C55E' : res.anual[i]! >= 0 ? '#F59E0B' : '#EF4444') },
                  ].map((row, ri) => (
                    <div key={row.label} className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2.5 items-center" style={{ borderTop: ri > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined, background: '#141414' }}>
                      <div className="text-xs font-bold" style={{ color: '#888' }}>{row.label}</div>
                      {row.vals.map((v, i) => <div key={i} className="font-black text-xs font-mono text-center" style={{ color: row.colors[i] }}>{v}</div>)}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-2">
              <button onClick={guardar} disabled={saving || !res || !!savedId}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
                style={{ background: savedId ? '#22C55E' : '#F26E1F' }}>
                {saving ? 'Guardando...' : savedId ? '✓ Guardado' : calcInmuebleId ? 'Actualizar análisis' : 'Guardar análisis'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
