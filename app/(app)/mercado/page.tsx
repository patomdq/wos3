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
  const [loadingUnidades, setLoadingUnidades] = useState<Record<string, boolean>>({})
  const [addingUnidadId, setAddingUnidadId] = useState<string | null>(null)
  const [nuevaUnidad, setNuevaUnidad] = useState({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
  const [savingUnidad, setSavingUnidad] = useState(false)
  const [importandoUrl, setImportandoUrl] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [expandedDetalle, setExpandedDetalle] = useState<string | null>(null)
  const [creando, setCreando] = useState<string | null>(null)
  const [updatingEstado, setUpdatingEstado] = useState<string | null>(null)
  const [confirmandoCompra, setConfirmandoCompra] = useState<string | null>(null)

  // Nuevo inmueble
  const [nuevoOpen, setNuevoOpen] = useState(false)
  const [nuevoForm, setNuevoForm] = useState(emptyNuevoForm())
  const [savingNuevo, setSavingNuevo] = useState(false)
  const [nuevoUnidades, setNuevoUnidades] = useState<any[]>([])
  const [addingNuevoUnidad, setAddingNuevoUnidad] = useState(false)
  const [importandoNuevoUrl, setImportandoNuevoUrl] = useState(false)
  const [nuevoImportUrl, setNuevoImportUrl] = useState('')
  const [nuevoPortada, setNuevoPortada] = useState<File | null>(null)
  const [nuevoPortadaPreview, setNuevoPortadaPreview] = useState<string | null>(null)

  // Editar inmueble
  const [editInmueble, setEditInmueble] = useState<Inmueble | null>(null)
  const [editForm, setEditForm] = useState(emptyNuevoForm())
  const [savingEdit, setSavingEdit] = useState(false)
  const [editPortada, setEditPortada] = useState<File | null>(null)
  const [editPortadaPreview, setEditPortadaPreview] = useState<string | null>(null)

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
      supabase.from('inmuebles').select('*').or('fuente.is.null,fuente.not.ilike.telegram%').order('created_at', { ascending: false }),
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
    if (nuevoPortada) {
      const ext = nuevoPortada.name.split('.').pop() || 'jpg'
      const fileName = `portada_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('portadas').upload(fileName, nuevoPortada, { cacheControl: '3600', upsert: false })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('portadas').getPublicUrl(fileName)
        payload.imagen_portada = publicUrl
      }
    }
    const { data, error } = await supabase.from('inmuebles').insert([payload]).select().single()
    setSavingNuevo(false)
    if (error) { alert(`Error al guardar: ${error.message}`); return }
    if (data) {
      if (nuevoForm.tipologia === 'edificio' && nuevoUnidades.length > 0) {
        const rows = nuevoUnidades.map((u: any) => ({
          inmueble_id: data.id,
          tipo: u.tipo || 'Piso',
          planta: u.planta || null,
          superficie: typeof u.superficie === 'number' ? u.superficie : null,
          ocupacion: u.ocupacion === 'ocupado' ? 'ocupado' : 'libre',
          origen: 'manual',
          renta_mensual: typeof u.renta_mensual === 'number' ? u.renta_mensual : null,
          precio_venta_est: typeof u.precio_venta_est === 'number' ? u.precio_venta_est : null,
          reforma_estimada: typeof u.reforma_estimada === 'number' ? u.reforma_estimada : null,
          notas: u.notas || null,
        }))
        await supabase.from('inmueble_unidades').insert(rows)
        setUnidades(prev => ({ ...prev, [data.id]: rows.map((r: any, i: number) => ({ ...r, id: `temp-${i}` })) }))
      }
      setInmuebles(prev => [data, ...prev])
      setNuevoOpen(false)
      setNuevoForm(emptyNuevoForm())
      setNuevoUnidades([])
      setAddingNuevoUnidad(false)
      setNuevoPortada(null)
      setNuevoPortadaPreview(null)
    }
  }

  // ── Importar URL en modal Agregar (guarda edificio primero, luego importa) ──
  const importarYGuardar = async () => {
    if (!nuevoImportUrl.trim() || !nuevoForm.direccion || !nuevoForm.precio) return
    setImportLoading(true)
    try {
      const payload: Record<string, unknown> = {
        titulo: nuevoForm.titulo || null,
        tipologia: 'edificio',
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
      const { data: edificio, error: errEdificio } = await supabase.from('inmuebles').insert([payload]).select().single()
      if (errEdificio || !edificio) { alert(`Error al guardar: ${errEdificio?.message}`); return }

      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/unidades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ inmueble_id: edificio.id, url: nuevoImportUrl.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        setUnidades(prev => ({ ...prev, [edificio.id]: json.unidades || [] }))
      } else {
        alert(`Edificio guardado, pero error al importar: ${json.error}`)
      }
      setInmuebles(prev => [edificio, ...prev])
      setNuevoOpen(false)
      setNuevoForm(emptyNuevoForm())
      setNuevoUnidades([])
      setAddingNuevoUnidad(false)
      setImportandoNuevoUrl(false)
      setNuevoImportUrl('')
    } catch (err: any) {
      alert(`Error: ${err.message}`)
    } finally {
      setImportLoading(false)
    }
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
    setAddingUnidadId(null)
    setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
    setEditPortada(null)
    setEditPortadaPreview(null)
    if (item.tipologia === 'edificio' && !unidades[item.id]) fetchUnidades(item.id)
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
    if (editPortada) {
      const ext = editPortada.name.split('.').pop() || 'jpg'
      const fileName = `portada_${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('portadas').upload(fileName, editPortada, { cacheControl: '3600', upsert: false })
      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage.from('portadas').getPublicUrl(fileName)
        payload.imagen_portada = publicUrl
      }
    }
    const { data, error } = await supabase.from('inmuebles').update(payload).eq('id', editInmueble.id).select().single()
    setSavingEdit(false)
    if (error) { alert(`Error: ${error.message}`); return }
    if (data) {
      setInmuebles(prev => prev.map(x => x.id === editInmueble.id ? data : x))
      setEditInmueble(null)
      setEditPortada(null)
      setEditPortadaPreview(null)
    }
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

  // ── Unidades de edificio ──────────────────────────────────
  const fetchUnidades = async (inmuebleId: string) => {
    if (loadingUnidades[inmuebleId]) return
    setLoadingUnidades(prev => ({ ...prev, [inmuebleId]: true }))
    const { data } = await supabase.from('inmueble_unidades').select('*').eq('inmueble_id', inmuebleId).order('planta').order('tipo')
    setUnidades(prev => ({ ...prev, [inmuebleId]: data || [] }))
    setLoadingUnidades(prev => ({ ...prev, [inmuebleId]: false }))
  }
  const toggleDetalle = (id: string) => {
    const closing = expandedDetalle === id
    setExpandedDetalle(closing ? null : id)
    if (!closing && !unidades[id]) fetchUnidades(id)
  }
  const saveUnidad = async (inmuebleId: string) => {
    if (!nuevaUnidad.tipo) return
    setSavingUnidad(true)
    const payload: Record<string, unknown> = {
      inmueble_id: inmuebleId,
      tipo: nuevaUnidad.tipo,
      planta: nuevaUnidad.planta || null,
      superficie: nuevaUnidad.superficie ? parseFloat(nuevaUnidad.superficie) : null,
      ocupacion: nuevaUnidad.ocupacion,
      origen: 'manual',
      renta_mensual: nuevaUnidad.renta_mensual ? parseFloat(nuevaUnidad.renta_mensual) : null,
      precio_venta_est: nuevaUnidad.precio_venta_est ? parseFloat(nuevaUnidad.precio_venta_est) : null,
      reforma_estimada: nuevaUnidad.reforma_estimada ? parseFloat(nuevaUnidad.reforma_estimada) : null,
      notas: nuevaUnidad.notas || null,
    }
    const { data, error } = await supabase.from('inmueble_unidades').insert([payload]).select().single()
    setSavingUnidad(false)
    if (error) { alert(error.message); return }
    setUnidades(prev => ({ ...prev, [inmuebleId]: [...(prev[inmuebleId] || []), data] }))
    setAddingUnidadId(null)
    setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
  }
  const deleteUnidad = async (unidadId: string, inmuebleId: string) => {
    if (!confirm('¿Eliminar esta unidad?')) return
    await supabase.from('inmueble_unidades').delete().eq('id', unidadId)
    setUnidades(prev => ({ ...prev, [inmuebleId]: (prev[inmuebleId] || []).filter(u => u.id !== unidadId) }))
  }

  const importarUnidades = async (inmuebleId: string) => {
    if (!importUrl.trim()) return
    setImportLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/unidades/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ inmueble_id: inmuebleId, url: importUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok) { alert(`Error: ${json.error}`); return }
      setUnidades(prev => ({ ...prev, [inmuebleId]: [...(prev[inmuebleId] || []), ...(json.unidades || [])] }))
      setImportandoUrl(null)
      setImportUrl('')
      alert(`✓ ${json.total} unidades importadas correctamente`)
    } catch (err: any) {
      alert(`Error de red: ${err.message}`)
    } finally {
      setImportLoading(false)
    }
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

  const CARD  = { background: '#ffffff', border: '1px solid #EAEAE8', boxShadow: '0 2px 12px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.03)' }
  const INP   = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' }
  const INP_L = { background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#333' }
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
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #F0EEE8', background: '#FAFAF8' }}>
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8' }}>
          Bitácora{bitacora[item.id] ? ` (${(bitacora[item.id] || []).length})` : ''}
        </span>
        <button onClick={() => toggleBitacora(item.id)}
          className="text-[11px] font-black px-2.5 py-1 rounded-lg"
          style={{ background: openBitacoraId === item.id ? 'rgba(242,110,31,0.09)' : '#ECEAE4', color: openBitacoraId === item.id ? '#F26E1F' : '#888', border: `1.5px solid ${openBitacoraId === item.id ? 'rgba(242,110,31,0.25)' : '#E2E0D8'}` }}>
          {openBitacoraId === item.id ? '▲ Cerrar' : '▼ Bitácora'}
        </button>
      </div>
      {openBitacoraId === item.id && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid #F0EEE8', background: '#F9F8F5' }}>
          <div className="mb-4 rounded-xl p-3" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
            <div className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: '#888' }}>
              {editingBitacoraId ? 'Editar entrada' : 'Nueva entrada'}
            </div>
            <textarea value={bitacoraForm.contenido} onChange={ev => setBitacoraForm(f => ({ ...f, contenido: ev.target.value }))}
              placeholder="Visita realizada, llamada con API, precio negociable..." rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none mb-2"
              style={INP_L}
              onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Tipo</label>
                <select value={bitacoraForm.tipo} onChange={ev => setBitacoraForm(f => ({ ...f, tipo: ev.target.value }))}
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                  style={{ ...INP_L, appearance: 'none' as const }}>
                  <option value="nota">📝 Nota</option>
                  <option value="llamada">📞 Llamada</option>
                  <option value="email">✉️ Email</option>
                  <option value="visita">🏠 Visita</option>
                  <option value="documento">📄 Documento</option>
                  <option value="api">🤝 API</option>
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Autor</label>
                <input type="text" value={bitacoraForm.autor} onChange={ev => setBitacoraForm(f => ({ ...f, autor: ev.target.value }))}
                  placeholder="Patricio"
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                  style={INP_L}
                  onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
              </div>
            </div>
            <div className="mb-2">
              <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Link externo</label>
              <input type="url" value={bitacoraForm.url} onChange={ev => setBitacoraForm(f => ({ ...f, url: ev.target.value }))} placeholder="https://..."
                className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                style={INP_L}
                onFocus={ev => ev.target.style.borderColor='#F26E1F'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
            </div>
            {proveedores.length > 0 && (
              <div className="mb-2">
                <label className="block text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Proveedor</label>
                <select value={bitacoraForm.proveedor_id} onChange={ev => setBitacoraForm(f => ({ ...f, proveedor_id: ev.target.value }))}
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                  style={{ ...INP_L, appearance: 'none' as const }}>
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            )}
            <div className="flex gap-2">
              {editingBitacoraId && (
                <button onClick={() => { setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' }); setEditingBitacoraId(null) }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ background: '#F0EEE8', color: '#888', border: '1px solid #ECEAE4' }}>Cancelar</button>
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
              <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#E5E3DE' }} />
              {(bitacora[item.id] || []).map((b: unknown) => {
                const entry = b as Record<string, unknown>
                return (
                  <div key={entry.id as string} className="relative mb-4">
                    <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background: '#F26E1F', border: '2px solid #F9F8F5' }} />
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="text-[10px] font-bold font-mono tracking-wide" style={{ color: '#AAA' }}>
                        {new Date(entry.created_at as string).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                        {' · '}{TIPO_ICON[entry.tipo as string] || '📝'} {((entry.tipo as string) || 'nota').toUpperCase()}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => openEditBitacora(entry)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: '#ECEAE4', color: '#666' }}>✎</button>
                        <button onClick={() => deleteBitacoraEntry(entry.id as string, item.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>✕</button>
                      </div>
                    </div>
                    <div className="text-sm font-bold leading-relaxed" style={{ color: '#1a1a1a' }}>{entry.contenido as string}</div>
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
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #F0EEE8', background: '#FAFAF8' }}>
        <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8' }}>
          Visitas{visitas[item.id] ? ` (${visitas[item.id].length})` : ''}
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => { setAgendandoVisitaId(item.id); setVisitaForm(emptyVisitaForm()) }}
            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(242,110,31,0.09)', color: '#F26E1F', border: '1.5px solid rgba(242,110,31,0.25)' }}>+ Agendar</button>
          <button onClick={() => toggleVisitas(item.id)}
            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: openVisitasId === item.id ? 'rgba(242,110,31,0.09)' : '#ECEAE4', color: openVisitasId === item.id ? '#F26E1F' : '#888', border: `1.5px solid ${openVisitasId === item.id ? 'rgba(242,110,31,0.25)' : '#E2E0D8'}` }}>
            {openVisitasId === item.id ? '▲' : '▼ Ver'}
          </button>
        </div>
      </div>
      {openVisitasId === item.id && (
        <div className="px-4 py-3" style={{ borderTop: '1px solid #F0EEE8', background: '#F9F8F5' }}>
          {loadingVisitas === item.id
            ? <div className="text-xs py-2" style={{ color: '#AAA' }}>Cargando...</div>
            : (visitas[item.id] || []).length === 0
              ? <div className="text-xs py-2" style={{ color: '#AAA' }}>Sin visitas agendadas todavía.</div>
              : (visitas[item.id] || []).map(v => (
                <div key={v.id} className="rounded-xl p-3 mb-2" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-sm font-black" style={{ color: '#111' }}>{v.fecha} · {v.hora}</div>
                      <div className="text-xs mt-0.5" style={{ color: '#888' }}>Resp: {v.responsable}</div>
                      {v.notas_previas && <div className="text-xs mt-0.5" style={{ color: '#AAA' }}>{v.notas_previas}</div>}
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      {v.gcal_event_id && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6' }}>📅</span>}
                      {!v.estado_post && (
                        <button onClick={() => { setPostVisitaId(v.id); setPostVisitaInmuebleId(item.id); setPostVisitaForm({ estado_post: 'sigue_activo', notas_post: '', fotos_url: '' }) }}
                          className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(242,110,31,0.09)', color: '#F26E1F', border: '1.5px solid rgba(242,110,31,0.25)' }}>Post-visita</button>
                      )}
                    </div>
                  </div>
                  {v.estado_post && (
                    <div className="mt-2 pt-2 flex gap-2 items-start" style={{ borderTop: '1px solid #F0EEE8' }}>
                      <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0"
                        style={{ background: v.estado_post === 'descartado' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)', color: v.estado_post === 'descartado' ? '#EF4444' : '#D97706' }}>
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
    <div style={{ background: '#F4F4F4', minHeight: '100vh' }}>
      {/* ── Banner cabecera ── */}
      <div className="relative w-full" style={{ height: 250, overflow: 'visible' }}>
        <div style={{ height: 250, overflow: 'hidden', position: 'relative' }}>
          <img
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1400&h=500&fit=crop&q=80"
            alt="Mercado"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.65) 70%, rgba(244,244,244,0) 100%)' }} />
          <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 flex items-end justify-between">
            <div>
              <h1 className="font-black text-[26px] text-white leading-tight" style={{ letterSpacing: '-0.5px' }}>Mercado</h1>
              <p className="text-[13px] font-medium mt-1" style={{ color: 'rgba(255,255,255,0.55)' }}>Inmuebles en estudio</p>
            </div>
            <button onClick={() => setNuevoOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white"
              style={{ background: '#F26E1F' }}>
              + Agregar
            </button>
          </div>
        </div>
        {/* Difuminado de integración con la página */}
        <div className="absolute left-0 right-0" style={{ bottom: -1, height: 60, background: 'linear-gradient(to bottom, transparent, #F4F4F4)', pointerEvents: 'none' }} />
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 40px' }}>
      {/* Filtros */}
      <div className="flex gap-2 mb-8 overflow-x-auto -mx-5 px-5">
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltroTipologia(f)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
            style={{ background: filtroTipologia === f ? '#F26E1F' : '#E8E8E8', color: filtroTipologia === f ? '#fff' : '#555', border: filtroTipologia === f ? '1px solid #F26E1F' : '1px solid #DCDCDC' }}>
            {FILTRO_LABELS[f]}{f !== 'todos' ? ` (${inmuebles.filter(x => x.tipologia === f).length})` : ` (${inmuebles.length})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {[1,2,3].map(i => <div key={i} className="h-52 rounded-2xl animate-pulse" style={{ background: '#D8D8D8' }} />)}
        </div>
      ) : inmueblesFiltrados.length === 0 ? (
        <div className="text-center py-16 text-sm" style={{ color: '#999' }}>Sin inmuebles todavía</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
          {inmueblesFiltrados.map(item => {
            const isAnalizado = !!item.analizado_en
            const cfg = SUBESTADO_CFG[item.estado] || SUBESTADO_CFG.sin_analizar
            const tipLabel = TIPOLOGIA_LABELS[item.tipologia] || item.tipologia
            return (
              <div key={item.id} className="rounded-2xl overflow-hidden flex flex-col transition-all duration-200 hover:-translate-y-1 hover:shadow-lg" style={CARD}>
                {/* Imagen / placeholder */}
                <div className="relative cursor-pointer" style={{ height: 160, background: item.imagen_portada ? 'transparent' : 'linear-gradient(135deg,#F5F4F0,#ECEAE4)', overflow: 'hidden' }}
                  onClick={() => openEdit(item)}>
                  {item.imagen_portada
                    ? <img src={item.imagen_portada} alt="" className="w-full h-full object-cover" />
                    : <div className="flex items-center justify-center h-full text-5xl" style={{ color: '#D0CFC8' }}>{item.tipologia === 'edificio' ? '🏢' : item.tipologia === 'suelo' ? '🏗' : item.tipologia === 'nave' ? '🏭' : '🏠'}</div>
                  }
                  <div className="absolute top-2.5 left-2.5 flex gap-1.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>{tipLabel}</span>
                    {item.fuente && <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.55)', color: '#ddd', backdropFilter: 'blur(4px)' }}>{item.fuente}</span>}
                  </div>
                  <div className="absolute top-2.5 right-2.5">
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                  </div>
                </div>

                {/* Contenido */}
                <div className="p-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(item)}>
                      <div className="font-black text-[15px] leading-tight truncate hover:text-[#F26E1F] transition-colors" style={{ color: '#111' }}>{item.titulo || item.direccion}</div>
                      {item.titulo && <div className="text-xs mt-0.5 truncate" style={{ color: '#999' }}>{item.direccion}{item.ciudad ? ` · ${item.ciudad}` : ''}</div>}
                      {!item.titulo && item.ciudad && <div className="text-xs mt-0.5" style={{ color: '#999' }}>{item.ciudad}</div>}
                    </div>
                    <div className="text-sm font-black font-mono flex-shrink-0" style={{ color: '#F26E1F' }}>{fmt(item.precio_compra || 0)}</div>
                  </div>

                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {item.superficie && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: '#666' }}>{item.superficie} m²</span>}
                    {item.habitaciones && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: '#666' }}>{item.habitaciones} hab</span>}
                    {item.num_plantas && <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: '#666' }}>{item.num_plantas} plantas</span>}
                  </div>

                  {/* Para edificios: grid métricas compacto */}
                  {item.tipologia === 'edificio' && (
                    <div className="grid grid-cols-3 mt-3 rounded-xl overflow-hidden" style={{ background: '#ECEAE4' }}>
                      {[
                        { label: 'Precio', val: fmt(item.precio_compra || 0) },
                        { label: 'Unidades', val: unidades[item.id] ? String(unidades[item.id].length) : '—' },
                        { label: 'm²', val: item.superficie ? String(item.superficie) : '—' },
                      ].map((m, i) => (
                        <div key={m.label} className="text-center py-2.5" style={{ background: '#F9F8F5', borderLeft: i > 0 ? '1px solid #ECEAE4' : 'none' }}>
                          <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#AAA' }}>{m.label}</div>
                          <div className="text-[12px] font-black" style={{ color: '#222' }}>{m.val}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Para no-edificios: ROI y precios si analizado */}
                  {item.tipologia !== 'edificio' && isAnalizado && (
                    <div className="grid grid-cols-3 mt-3 rounded-xl overflow-hidden" style={{ background: '#ECEAE4' }}>
                      {[
                        { label: 'Pesimista', val: item.precio_venta_conservador, color: '#EF4444' },
                        { label: 'Realista',  val: item.precio_venta_realista,    color: '#F59E0B' },
                        { label: 'Optimista', val: item.precio_venta_optimista,   color: '#22C55E' },
                      ].map((s, i) => (
                        <div key={s.label} className="text-center py-2.5" style={{ background: '#F9F8F5', borderLeft: i > 0 ? '1px solid #ECEAE4' : 'none' }}>
                          <div className="text-[9px] font-bold uppercase tracking-wide mb-0.5" style={{ color: s.color }}>{s.label}</div>
                          <div className="text-[11px] font-black font-mono" style={{ color: s.color }}>{s.val ? fmt(s.val) : '—'}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.tipologia !== 'edificio' && isAnalizado && item.roi_estimado !== undefined && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-xs font-black" style={{ color: '#22C55E' }}>↗ ROI {item.roi_estimado?.toFixed(1)}%</span>
                      {item.analizado_en && <span className="text-[10px]" style={{ color: '#BBB' }}>· {item.analizado_en}</span>}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold" style={{ color: '#3B82F6' }}>🔗 Ver anuncio</a>}
                    {item.drive_url && <a href={item.drive_url} target="_blank" rel="noopener noreferrer" className="text-[11px] font-black px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.2)' }}>📁 Drive</a>}
                  </div>
                  {item.tipologia !== 'edificio' && item.notas && <div className="mt-2 text-xs leading-relaxed" style={{ color: '#888' }}>{item.notas}</div>}

                  {/* Ver detalle (edificios) */}
                  {item.tipologia === 'edificio' && (
                    <button onClick={() => toggleDetalle(item.id)}
                      className="mt-3 w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
                      style={{ background: expandedDetalle === item.id ? 'rgba(242,110,31,0.08)' : '#F5F4F0', color: expandedDetalle === item.id ? '#F26E1F' : '#888', border: `1.5px solid ${expandedDetalle === item.id ? 'rgba(242,110,31,0.3)' : '#ECEAE4'}` }}>
                      {expandedDetalle === item.id ? '▲ Cerrar detalle' : `▼ Ver detalle${unidades[item.id] ? ` · ${unidades[item.id].length} unidades` : ''}`}
                    </button>
                  )}

                  {/* Panel detalle expandido (edificios) — solo lectura */}
                  {item.tipologia === 'edificio' && expandedDetalle === item.id && (
                    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1.5px solid #ECEAE4' }}>
                      {item.notas && (
                        <div className="px-3 pt-3 pb-2.5" style={{ borderBottom: '1px solid #F0EEE8' }}>
                          <div className="text-[9px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#BBB' }}>Descripción</div>
                          <div className="text-[12px] leading-relaxed" style={{ color: '#555' }}>{item.notas}</div>
                        </div>
                      )}
                      <div>
                        <div className="px-3 py-2.5">
                          <div className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#BBB' }}>
                            Unidades{unidades[item.id] ? ` (${unidades[item.id].length})` : ''}
                          </div>
                        </div>
                        {loadingUnidades[item.id] && (
                          <div className="px-3 py-3 text-xs" style={{ color: '#AAA' }}>Cargando unidades...</div>
                        )}
                        {!loadingUnidades[item.id] && unidades[item.id] && unidades[item.id].length === 0 && (
                          <div className="px-3 pb-3 text-xs" style={{ color: '#CCC' }}>Sin unidades. Ábrelo para agregar.</div>
                        )}
                        {!loadingUnidades[item.id] && unidades[item.id] && unidades[item.id].length > 0 && (
                          <>
                            <div className="grid px-3 py-1.5" style={{ gridTemplateColumns: '1fr 44px 68px 80px', background: '#FAFAF8', borderTop: '1px solid #F0EEE8' }}>
                              {['Unidad','m²','Estado','Venta est.'].map((h,i) => (
                                <div key={i} className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                              ))}
                            </div>
                            {unidades[item.id].map((u, ui) => {
                              const isLibre = !u.ocupacion || u.ocupacion === 'libre' || u.ocupacion === 'Libre'
                              return (
                                <div key={u.id} className="grid px-3 py-2 items-center" style={{ gridTemplateColumns: '1fr 44px 68px 80px', borderTop: '1px solid #F0EEE8' }}>
                                  <div>
                                    <div className="text-[12px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                    {u.renta_mensual ? <div className="text-[10px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                  </div>
                                  <div className="text-[11px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                  <div>
                                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                      {isLibre ? 'Libre' : 'Ocupado'}
                                    </span>
                                  </div>
                                  <div className="text-[11px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                    {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                  </div>
                                </div>
                              )
                            })}
                            <div className="flex justify-between items-center px-3 py-2.5" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                              <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
                              <span className="text-[13px] font-black" style={{ color: '#22C55E' }}>
                                {fmt(unidades[item.id].reduce((acc, u) => acc + (u.precio_venta_est || 0), 0))}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Botones principales */}
                <div className="flex gap-1.5 px-3 py-2.5" style={{ borderTop: '1px solid #F0EEE8' }}>
                  <button onClick={() => openCalc(item.precio_compra || 0, item.titulo || item.direccion, item.ciudad || '', item)}
                    className="flex-1 text-xs font-black px-2 py-2 rounded-xl"
                    style={{ background: 'rgba(242,110,31,0.09)', color: '#F26E1F', border: '1.5px solid rgba(242,110,31,0.25)' }}>
                    {isAnalizado ? '✎ Análisis' : '⊕ Calcular'}
                  </button>
                  <button onClick={() => openEdit(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1.5px solid #ECEAE4' }}>✎</button>
                  <button onClick={() => deleteInmueble(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444', border: '1.5px solid rgba(239,68,68,0.18)' }}>🗑</button>
                </div>

                {/* Estado */}
                {item.estado !== 'sin_analizar' && item.estado !== 'comprado' && (
                  <div className="flex gap-2 px-3 py-2 flex-wrap" style={{ borderTop: '1px solid #F0EEE8' }}>
                    <span className="text-[10px] font-bold self-center flex-shrink-0 uppercase tracking-wide" style={{ color: '#BBB' }}>Estado:</span>
                    {(['ofertado', 'en_arras'] as const).map(s => {
                      const c = SUBESTADO_CFG[s]; const activo = item.estado === s
                      return (
                        <button key={s} onClick={() => updateEstado(item.id, activo ? 'en_estudio' : s)} disabled={!!updatingEstado}
                          className="text-[11px] font-black px-2.5 py-1 rounded-lg disabled:opacity-50"
                          style={{ background: activo ? c.bg : '#F3F2EE', color: activo ? c.color : '#888', border: `1.5px solid ${activo ? c.color+'50' : '#ECEAE4'}` }}>
                          {updatingEstado === item.id+'_'+(activo?'en_estudio':s) ? '...' : c.label}
                        </button>
                      )
                    })}
                    {confirmandoCompra === item.id ? (
                      <div className="flex gap-1.5 ml-auto">
                        <button onClick={() => crearProyecto(item)} disabled={creando === item.id} className="text-[11px] font-black px-2.5 py-1 rounded-lg disabled:opacity-50" style={{ background: 'rgba(34,197,94,0.15)', color: '#16A34A', border: '1.5px solid rgba(34,197,94,0.4)' }}>{creando === item.id ? '...' : '✓ Confirmar'}</button>
                        <button onClick={() => setConfirmandoCompra(null)} className="text-[11px] font-black px-2 py-1 rounded-lg" style={{ background: '#F3F2EE', color: '#888' }}>✕</button>
                      </div>
                    ) : (
                      <button onClick={() => crearProyecto(item)} disabled={creando === item.id} className="text-[11px] font-black px-2.5 py-1 rounded-lg ml-auto disabled:opacity-50" style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1.5px solid rgba(34,197,94,0.3)' }}>{creando === item.id ? '...' : 'Comprado →'}</button>
                    )}
                  </div>
                )}
                {item.estado === 'comprado' && (
                  <div className="flex items-center gap-2 px-3 py-2" style={{ borderTop: '1px solid #F0EEE8', background: 'rgba(34,197,94,0.05)' }}>
                    <span className="text-[11px] font-bold" style={{ color: '#16A34A' }}>✓ Proyecto creado</span>
                    <button onClick={() => router.push('/proyectos')} className="text-[11px] font-black px-2.5 py-1 rounded-lg ml-auto" style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1.5px solid rgba(34,197,94,0.3)' }}>Ver →</button>
                  </div>
                )}

                {renderVisitas(item)}
                {renderBitacora(item)}
              </div>
            )
          })}
        </div>
      )}
      </div>{/* /content wrapper */}

      {/* ═══ MODAL NUEVO ═══ */}
      {nuevoOpen && (
        <>
          <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={() => { setNuevoOpen(false); setNuevoUnidades([]); setAddingNuevoUnidad(false); setImportandoNuevoUrl(false); setNuevoImportUrl(''); setNuevoPortada(null); setNuevoPortadaPreview(null) }} />
          <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
          <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto" style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 1000 }}>
            {/* Header fijo */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
              <div className="flex items-center justify-between mb-3">
                <div className="font-black text-[17px]" style={{ color: '#111' }}>Agregar inmueble</div>
                <button onClick={() => { setNuevoOpen(false); setNuevoUnidades([]); setAddingNuevoUnidad(false); setImportandoNuevoUrl(false); setNuevoImportUrl(''); setNuevoPortada(null); setNuevoPortadaPreview(null) }} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
              </div>
              {/* Tipo — fila completa fuera del grid */}
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto pb-1">
                <span className="text-[10px] font-black uppercase tracking-wide shrink-0 mr-1" style={{ color: '#666' }}>Tipo *</span>
                {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                  <button key={t} onClick={() => setNuevoForm(f => ({ ...f, tipologia: t }))}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap flex-shrink-0"
                    style={{ background: nuevoForm.tipologia === t ? '#F26E1F' : '#F5F4F0', color: nuevoForm.tipologia === t ? '#fff' : '#666', border: nuevoForm.tipologia === t ? '1.5px solid #F26E1F' : '1.5px solid #ECEAE4' }}>
                    {TIPOLOGIA_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5">
              <div className="sm:grid sm:grid-cols-2 sm:gap-6 pb-4">
                {/* Columna izquierda */}
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Título</label>
                    <input type="text" value={nuevoForm.titulo} onChange={e => setNuevoForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Dirección *</label>
                    <input type="text" value={nuevoForm.direccion} onChange={e => setNuevoForm(f => ({ ...f, direccion: e.target.value }))} placeholder="C/ Mayor 4" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Municipio</label>
                    <input type="text" value={nuevoForm.ciudad} onChange={e => setNuevoForm(f => ({ ...f, ciudad: e.target.value }))} placeholder="Zurgena" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Precio (€) *</label>
                    <input type="number" value={nuevoForm.precio} onChange={e => setNuevoForm(f => ({ ...f, precio: e.target.value }))} placeholder="65000" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Habitaciones</label>
                    <input type="number" value={nuevoForm.habitaciones} onChange={e => setNuevoForm(f => ({ ...f, habitaciones: e.target.value }))} placeholder="3" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>m²</label>
                    <input type="number" value={nuevoForm.superficie} onChange={e => setNuevoForm(f => ({ ...f, superficie: e.target.value }))} placeholder="85" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Link anuncio</label>
                    <input type="url" value={nuevoForm.url} onChange={e => setNuevoForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>📁 Drive</label>
                    <input type="url" value={nuevoForm.drive_url} onChange={e => setNuevoForm(f => ({ ...f, drive_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Notas</label>
                    <textarea value={nuevoForm.notas} onChange={e => setNuevoForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                </div>

                {/* Columna derecha */}
                <div className="mt-6 sm:mt-0 sm:flex sm:flex-col">
                  {nuevoForm.tipologia === 'edificio' && (
                    <div className="rounded-2xl overflow-hidden mb-3" style={{ border: '1.5px solid #ECEAE4' }}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: '#F9F8F5', borderBottom: '1px solid #ECEAE4' }}>
                        <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#777' }}>
                          Unidades{nuevoUnidades.length > 0 ? ` (${nuevoUnidades.length})` : ''}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setImportandoNuevoUrl(v => !v); setAddingNuevoUnidad(false) }}
                            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: importandoNuevoUrl ? 'rgba(59,130,246,0.09)' : '#ECEAE4', color: importandoNuevoUrl ? '#3B82F6' : '#888', border: `1.5px solid ${importandoNuevoUrl ? 'rgba(59,130,246,0.3)' : '#DDDBD5'}` }}>
                            {importandoNuevoUrl ? '✕' : '🔗 Importar URL'}
                          </button>
                          <button
                            onClick={() => { setAddingNuevoUnidad(v => !v); setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' }); setImportandoNuevoUrl(false) }}
                            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: addingNuevoUnidad ? 'rgba(242,110,31,0.09)' : '#ECEAE4', color: addingNuevoUnidad ? '#F26E1F' : '#888', border: `1.5px solid ${addingNuevoUnidad ? 'rgba(242,110,31,0.3)' : '#DDDBD5'}` }}>
                            {addingNuevoUnidad ? '✕' : '+ Manual'}
                          </button>
                        </div>
                      </div>
                      {/* Panel importar URL */}
                      {importandoNuevoUrl && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#F0F4FF' }}>
                          <div className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: '#3B82F6' }}>Importar unidades desde URL</div>
                          <div className="text-[11px] mb-3" style={{ color: '#666' }}>Pega un link de Idealista, Fotocasa u otro portal. Se guardará el edificio y se importarán todas las unidades automáticamente.</div>
                          <input
                            type="url"
                            value={nuevoImportUrl}
                            onChange={e => setNuevoImportUrl(e.target.value)}
                            placeholder="https://www.idealista.com/inmueble/..."
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium mb-2"
                            style={{ background: '#fff', border: '1.5px solid #BFDBFE', color: '#333' }}
                            onFocus={e => e.target.style.borderColor='#3B82F6'} onBlur={e => e.target.style.borderColor='#BFDBFE'}
                          />
                          {(!nuevoForm.direccion || !nuevoForm.precio) && (
                            <div className="text-[10px] mb-2" style={{ color: '#F26E1F' }}>⚠ Completa Dirección y Precio antes de importar</div>
                          )}
                          <button
                            onClick={importarYGuardar}
                            disabled={importLoading || !nuevoImportUrl.trim() || !nuevoForm.direccion || !nuevoForm.precio}
                            className="w-full py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ background: '#3B82F6' }}>
                            {importLoading ? <><span className="animate-spin">⟳</span> Guardando y cargando...</> : '🔗 Guardar edificio e importar unidades'}
                          </button>
                        </div>
                      )}
                      {/* Formulario nueva unidad */}
                      {addingNuevoUnidad && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#FAFAF8' }}>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tipo</label>
                              <select value={nuevaUnidad.tipo} onChange={e => setNuevaUnidad(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                {['Piso','Local','Ático','Garaje','Trastero','Estudio','Oficina'].map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Planta</label>
                              <input type="text" value={nuevaUnidad.planta} onChange={e => setNuevaUnidad(f => ({ ...f, planta: e.target.value }))} placeholder="1ª, PB, Ático..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>m²</label>
                              <input type="number" value={nuevaUnidad.superficie} onChange={e => setNuevaUnidad(f => ({ ...f, superficie: e.target.value }))} placeholder="60"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Ocupación</label>
                              <select value={nuevaUnidad.ocupacion} onChange={e => setNuevaUnidad(f => ({ ...f, ocupacion: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                <option value="libre">Libre</option>
                                <option value="ocupado">Ocupado</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Renta/mes (€)</label>
                              <input type="number" value={nuevaUnidad.renta_mensual} onChange={e => setNuevaUnidad(f => ({ ...f, renta_mensual: e.target.value }))} placeholder="450"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>P. Venta est. (€)</label>
                              <input type="number" value={nuevaUnidad.precio_venta_est} onChange={e => setNuevaUnidad(f => ({ ...f, precio_venta_est: e.target.value }))} placeholder="55000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Reforma est. (€)</label>
                              <input type="number" value={nuevaUnidad.reforma_estimada} onChange={e => setNuevaUnidad(f => ({ ...f, reforma_estimada: e.target.value }))} placeholder="8000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Notas</label>
                              <input type="text" value={nuevaUnidad.notas} onChange={e => setNuevaUnidad(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setNuevoUnidades(prev => [...prev, {
                                tipo: nuevaUnidad.tipo,
                                planta: nuevaUnidad.planta || null,
                                superficie: nuevaUnidad.superficie ? parseInt(nuevaUnidad.superficie) : null,
                                ocupacion: nuevaUnidad.ocupacion,
                                renta_mensual: nuevaUnidad.renta_mensual ? parseFloat(nuevaUnidad.renta_mensual) : null,
                                precio_venta_est: nuevaUnidad.precio_venta_est ? parseFloat(nuevaUnidad.precio_venta_est) : null,
                                reforma_estimada: nuevaUnidad.reforma_estimada ? parseFloat(nuevaUnidad.reforma_estimada) : null,
                                notas: nuevaUnidad.notas || null,
                              }])
                              setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
                              setAddingNuevoUnidad(false)
                            }}
                            className="w-full py-2.5 rounded-xl text-xs font-black text-white"
                            style={{ background: '#F26E1F' }}>
                            + Agregar unidad
                          </button>
                        </div>
                      )}
                      {/* Lista unidades temporales */}
                      {nuevoUnidades.length === 0 && !addingNuevoUnidad && (
                        <div className="px-4 py-5 text-center text-xs" style={{ color: '#BBB' }}>Sin unidades todavía. Agrega la primera.</div>
                      )}
                      {nuevoUnidades.length > 0 && (
                        <>
                          <div className="grid px-4 py-2" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px', background: '#F9F8F5', borderBottom: '1px solid #F0EEE8' }}>
                            {['Unidad','m²','Estado','Venta est.',''].map((h,i) => (
                              <div key={i} className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                            ))}
                          </div>
                          {nuevoUnidades.map((u, ui) => {
                            const isLibre = !u.ocupacion || u.ocupacion === 'libre'
                            return (
                              <div key={ui} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px', borderTop: ui > 0 ? '1px solid #F0EEE8' : 'none' }}>
                                <div>
                                  <div className="text-[12px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                  {u.renta_mensual ? <div className="text-[10px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                  {u.reforma_estimada ? <div className="text-[10px]" style={{ color: '#BBB' }}>Reforma {fmt(u.reforma_estimada)}</div> : null}
                                  {u.notas ? <div className="text-[10px]" style={{ color: '#BBB' }}>{u.notas}</div> : null}
                                </div>
                                <div className="text-[11px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                <div>
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                    {isLibre ? 'Libre' : 'Ocupado'}
                                  </span>
                                </div>
                                <div className="text-[11px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                  {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                </div>
                                <button onClick={() => setNuevoUnidades(prev => prev.filter((_, i) => i !== ui))}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ml-auto"
                                  style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444' }}>✕</button>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center px-4 py-3" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                            <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
                            <span className="text-[14px] font-black" style={{ color: '#22C55E' }}>
                              {fmt(nuevoUnidades.reduce((acc, u) => acc + (u.precio_venta_est || 0), 0))}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {/* Foto portada para tipos no-edificio */}
                  {nuevoForm.tipologia !== 'edificio' && (
                    <label
                      className="flex-1 flex flex-col items-center justify-center rounded-2xl cursor-pointer transition-colors mb-3"
                      style={{ border: nuevoPortadaPreview ? 'none' : '2px dashed #DDDBD5', background: nuevoPortadaPreview ? 'transparent' : '#FAFAF8', minHeight: 200, overflow: 'hidden', position: 'relative' }}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) { setNuevoPortada(f); setNuevoPortadaPreview(URL.createObjectURL(f)) } }}>
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { setNuevoPortada(f); setNuevoPortadaPreview(URL.createObjectURL(f)) } }} />
                      {nuevoPortadaPreview ? (
                        <>
                          <img src={nuevoPortadaPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.4)' }}>
                            <span className="text-white text-xs font-bold">Cambiar foto</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2.5 pointer-events-none">
                          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style={{ background: '#ECEAE4' }}>📷</div>
                          <div className="text-[13px] font-bold" style={{ color: '#888' }}>Foto de portada</div>
                          <div className="text-[11px] text-center" style={{ color: '#BBB' }}>Click o arrastrá una imagen<br/>Se usará como portada de la card</div>
                        </div>
                      )}
                    </label>
                  )}
                </div>
              </div>
            </div>
            {/* Footer fijo con botones — siempre visible */}
            <div className="flex-shrink-0 flex gap-3 px-5 py-4" style={{ borderTop: '1px solid #ECEAE4' }}>
              <button onClick={() => { setNuevoOpen(false); setNuevoUnidades([]); setAddingNuevoUnidad(false); setImportandoNuevoUrl(false); setNuevoImportUrl(''); setNuevoPortada(null); setNuevoPortadaPreview(null) }} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#F5F4F0', color: '#666', border: '1.5px solid #ECEAE4' }}>Cancelar</button>
              <button onClick={saveNuevo} disabled={savingNuevo || !nuevoForm.direccion || !nuevoForm.precio} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40" style={{ background: '#F26E1F' }}>{savingNuevo ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
          </div>
        </>
      )}

      {/* ═══ MODAL EDITAR ═══ */}
      {editInmueble && (
        <>
          <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={() => setEditInmueble(null)} />
          <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
          <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto" style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 1000 }}>
            {/* Header fijo */}
            <div className="flex-shrink-0 px-5 pt-4 pb-3">
              <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-black text-[17px]" style={{ color: '#111' }}>Editar inmueble</div>
                  <div className="text-xs mt-0.5" style={{ color: '#999' }}>{editInmueble.titulo || editInmueble.direccion}</div>
                </div>
                <button onClick={() => setEditInmueble(null)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
              </div>
              {/* Tipo — fila completa fuera del grid */}
              <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto pb-1">
                <span className="text-[10px] font-black uppercase tracking-wide shrink-0 mr-1" style={{ color: '#666' }}>Tipo</span>
                {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                  <button key={t} onClick={() => setEditForm(f => ({ ...f, tipologia: t }))}
                    className="px-2.5 py-1 rounded-xl text-[11px] font-black whitespace-nowrap flex-shrink-0"
                    style={{ background: editForm.tipologia === t ? '#F26E1F' : '#F5F4F0', color: editForm.tipologia === t ? '#fff' : '#666', border: editForm.tipologia === t ? '1.5px solid #F26E1F' : '1.5px solid #ECEAE4' }}>
                    {TIPOLOGIA_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Contenido scrollable */}
            <div className="flex-1 overflow-y-auto px-5">
              {/* Layout: 2 columnas en desktop */}
              <div className="sm:grid sm:grid-cols-2 sm:gap-6 pb-4">
                {/* Columna izquierda: datos básicos */}
                <div className="grid grid-cols-2 gap-3 content-start">
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Título</label>
                    <input type="text" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Dirección</label>
                    <input type="text" value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Municipio</label>
                    <input type="text" value={editForm.ciudad} onChange={e => setEditForm(f => ({ ...f, ciudad: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Precio (€)</label>
                    <input type="number" value={editForm.precio} onChange={e => setEditForm(f => ({ ...f, precio: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Habitaciones</label>
                    <input type="number" value={editForm.habitaciones} onChange={e => setEditForm(f => ({ ...f, habitaciones: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>m²</label>
                    <input type="number" value={editForm.superficie} onChange={e => setEditForm(f => ({ ...f, superficie: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Link anuncio</label>
                    <input type="url" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>📁 Drive</label>
                    <input type="url" value={editForm.drive_url} onChange={e => setEditForm(f => ({ ...f, drive_url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Notas</label>
                    <textarea value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>

                </div>

                {/* Columna derecha: unidades (edificios) o espacio vacío */}
                <div className="mt-6 sm:mt-0 flex flex-col gap-3">
                  {/* Imagen de portada — siempre visible para todos los tipos */}
                  <div>
                    <input type="file" accept="image/*" id="editPortadaInput" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (!f) return
                        setEditPortada(f)
                        const reader = new FileReader()
                        reader.onload = ev => setEditPortadaPreview(ev.target?.result as string)
                        reader.readAsDataURL(f)
                      }} />
                    <div
                      className="rounded-2xl overflow-hidden cursor-pointer relative flex flex-col items-center justify-center"
                      style={{
                        height: 110,
                        border: (editPortadaPreview || editInmueble.imagen_portada) ? '1.5px solid #ECEAE4' : '2px dashed #DDDBD5',
                        background: (editPortadaPreview || editInmueble.imagen_portada) ? 'transparent' : '#FAFAF8',
                      }}
                      onClick={() => document.getElementById('editPortadaInput')?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => {
                        e.preventDefault()
                        const f = e.dataTransfer.files?.[0]
                        if (!f || !f.type.startsWith('image/')) return
                        setEditPortada(f)
                        const reader = new FileReader()
                        reader.onload = ev => setEditPortadaPreview(ev.target?.result as string)
                        reader.readAsDataURL(f)
                      }}
                    >
                      {(editPortadaPreview || editInmueble.imagen_portada) ? (
                        <>
                          <img src={editPortadaPreview || editInmueble.imagen_portada!} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity" style={{ background: 'rgba(0,0,0,0.4)' }}>
                            <span className="text-white text-xs font-black">📷 Cambiar foto</span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-2xl mb-1 opacity-30">📷</div>
                          <div className="text-[12px] font-bold" style={{ color: '#888' }}>Foto de portada</div>
                          <div className="text-[10px] mt-0.5" style={{ color: '#BBB' }}>Click o arrastrá una imagen</div>
                        </>
                      )}
                    </div>
                  </div>

                  {editForm.tipologia === 'edificio' ? (
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #ECEAE4' }}>
                      {/* Header unidades */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: '#F9F8F5', borderBottom: '1px solid #ECEAE4' }}>
                        <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#777' }}>
                          Unidades{unidades[editInmueble.id] ? ` (${unidades[editInmueble.id].length})` : ''}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setImportandoUrl(importandoUrl === editInmueble.id ? null : editInmueble.id); setImportUrl(''); setAddingUnidadId(null) }}
                            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: importandoUrl === editInmueble.id ? 'rgba(59,130,246,0.09)' : '#ECEAE4', color: importandoUrl === editInmueble.id ? '#3B82F6' : '#888', border: `1.5px solid ${importandoUrl === editInmueble.id ? 'rgba(59,130,246,0.3)' : '#DDDBD5'}` }}>
                            {importandoUrl === editInmueble.id ? '✕' : '🔗 Importar URL'}
                          </button>
                          <button
                            onClick={() => { setAddingUnidadId(addingUnidadId === editInmueble.id ? null : editInmueble.id); setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' }); setImportandoUrl(null) }}
                            className="text-[11px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: addingUnidadId === editInmueble.id ? 'rgba(242,110,31,0.09)' : '#ECEAE4', color: addingUnidadId === editInmueble.id ? '#F26E1F' : '#888', border: `1.5px solid ${addingUnidadId === editInmueble.id ? 'rgba(242,110,31,0.3)' : '#DDDBD5'}` }}>
                            {addingUnidadId === editInmueble.id ? '✕' : '+ Manual'}
                          </button>
                        </div>
                      </div>

                      {/* Panel importar URL */}
                      {importandoUrl === editInmueble.id && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#F0F4FF' }}>
                          <div className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: '#3B82F6' }}>Importar unidades desde URL</div>
                          <div className="text-[11px] mb-3" style={{ color: '#666' }}>Pega un link de Idealista, Fotocasa u otro portal con el listado del edificio. Claude extrae todas las unidades automáticamente.</div>
                          <input
                            type="url"
                            value={importUrl}
                            onChange={e => setImportUrl(e.target.value)}
                            placeholder="https://www.idealista.com/inmueble/..."
                            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium mb-2"
                            style={{ background: '#fff', border: '1.5px solid #BFDBFE', color: '#333' }}
                            onFocus={e => e.target.style.borderColor='#3B82F6'} onBlur={e => e.target.style.borderColor='#BFDBFE'}
                          />
                          <button
                            onClick={() => importarUnidades(editInmueble.id)}
                            disabled={importLoading || !importUrl.trim()}
                            className="w-full py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50 flex items-center justify-center gap-2"
                            style={{ background: '#3B82F6' }}>
                            {importLoading ? (
                              <><span className="animate-spin">⟳</span> Cargando unidades...</>
                            ) : '🔗 Importar todas las unidades'}
                          </button>
                        </div>
                      )}

                      {/* Formulario nueva unidad */}
                      {addingUnidadId === editInmueble.id && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#FAFAF8' }}>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tipo</label>
                              <select value={nuevaUnidad.tipo} onChange={e => setNuevaUnidad(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                {['Piso','Local','Ático','Garaje','Trastero','Estudio','Oficina'].map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Planta</label>
                              <input type="text" value={nuevaUnidad.planta} onChange={e => setNuevaUnidad(f => ({ ...f, planta: e.target.value }))} placeholder="1ª, PB, Ático..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>m²</label>
                              <input type="number" value={nuevaUnidad.superficie} onChange={e => setNuevaUnidad(f => ({ ...f, superficie: e.target.value }))} placeholder="60"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Ocupación</label>
                              <select value={nuevaUnidad.ocupacion} onChange={e => setNuevaUnidad(f => ({ ...f, ocupacion: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                <option value="libre">Libre</option>
                                <option value="ocupado">Ocupado</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Renta/mes (€)</label>
                              <input type="number" value={nuevaUnidad.renta_mensual} onChange={e => setNuevaUnidad(f => ({ ...f, renta_mensual: e.target.value }))} placeholder="450"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>P. Venta est. (€)</label>
                              <input type="number" value={nuevaUnidad.precio_venta_est} onChange={e => setNuevaUnidad(f => ({ ...f, precio_venta_est: e.target.value }))} placeholder="55000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Reforma est. (€)</label>
                              <input type="number" value={nuevaUnidad.reforma_estimada} onChange={e => setNuevaUnidad(f => ({ ...f, reforma_estimada: e.target.value }))} placeholder="8000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[9px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Notas</label>
                              <input type="text" value={nuevaUnidad.notas} onChange={e => setNuevaUnidad(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                          </div>
                          <button onClick={() => saveUnidad(editInmueble.id)} disabled={savingUnidad}
                            className="w-full py-2.5 rounded-xl text-xs font-black text-white disabled:opacity-50"
                            style={{ background: '#F26E1F' }}>
                            {savingUnidad ? 'Guardando...' : '+ Guardar unidad'}
                          </button>
                        </div>
                      )}

                      {/* Lista unidades */}
                      {loadingUnidades[editInmueble.id] && (
                        <div className="px-4 py-4 text-xs" style={{ color: '#AAA' }}>Cargando unidades...</div>
                      )}
                      {!loadingUnidades[editInmueble.id] && (!unidades[editInmueble.id] || unidades[editInmueble.id].length === 0) && (
                        <div className="px-4 py-5 text-center text-xs" style={{ color: '#BBB' }}>Sin unidades todavía. Agrega la primera.</div>
                      )}
                      {!loadingUnidades[editInmueble.id] && unidades[editInmueble.id] && unidades[editInmueble.id].length > 0 && (
                        <>
                          <div className="grid px-4 py-2" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px', background: '#F9F8F5', borderBottom: '1px solid #F0EEE8' }}>
                            {['Unidad','m²','Estado','Venta est.',''].map((h,i) => (
                              <div key={i} className="text-[9px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                            ))}
                          </div>
                          {unidades[editInmueble.id].map((u, ui) => {
                            const isLibre = !u.ocupacion || u.ocupacion === 'libre' || u.ocupacion === 'Libre'
                            return (
                              <div key={u.id} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px', borderTop: ui > 0 ? '1px solid #F0EEE8' : 'none' }}>
                                <div>
                                  <div className="text-[12px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                  {u.renta_mensual ? <div className="text-[10px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                  {u.reforma_estimada ? <div className="text-[10px]" style={{ color: '#BBB' }}>Reforma {fmt(u.reforma_estimada)}</div> : null}
                                  {u.notas ? <div className="text-[10px]" style={{ color: '#BBB' }}>{u.notas}</div> : null}
                                </div>
                                <div className="text-[11px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                <div>
                                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                    {isLibre ? 'Libre' : 'Ocupado'}
                                  </span>
                                </div>
                                <div className="text-[11px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                  {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                </div>
                                <button onClick={() => deleteUnidad(u.id, editInmueble.id)}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] ml-auto"
                                  style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444' }}>✕</button>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center px-4 py-3" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                            <span className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
                            <span className="text-[14px] font-black" style={{ color: '#22C55E' }}>
                              {fmt(unidades[editInmueble.id].reduce((acc, u) => acc + (u.precio_venta_est || 0), 0))}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}

                </div>
              </div>
            </div>
            {/* Footer fijo con botones — siempre visible */}
            <div className="flex-shrink-0 flex gap-3 px-5 py-4" style={{ borderTop: '1px solid #ECEAE4' }}>
              <button onClick={() => setEditInmueble(null)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#F5F4F0', color: '#666', border: '1.5px solid #ECEAE4' }}>Cancelar</button>
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
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: '#F5F4F0' }}>
          <div className="sticky top-0 z-10 flex items-center gap-3 px-4 h-[54px]" style={{ background: '#fff', borderBottom: '1px solid #ECEAE4' }}>
            <button onClick={() => setCalcOpen(false)} className="font-black text-xl" style={{ color: '#888' }}>←</button>
            <div className="flex-1 font-black text-[16px]" style={{ color: '#1a1a1a' }}>{calcInmuebleId ? 'Editar análisis' : 'Calculadora de Rentabilidad'}</div>
            <button onClick={exportarPDF} disabled={!res} className="text-xs font-black px-3 py-1.5 rounded-lg disabled:opacity-30" style={{ background: '#F0EEE8', border: '1px solid #DEDAD2', color: '#666' }}>PDF</button>
          </div>
          <div className="p-4 pb-10">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
                <input type="text" value={tituloEstudio} onChange={e => setTituloEstudio(e.target.value)} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#F26E1F' }}>Duración (meses) *</label>
                <input type="number" value={duracionMeses || ''} onChange={e => setDuracionMeses(parseFloat(e.target.value) || 0)} placeholder="ej: 6" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
            </div>

            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Gastos estimados y reales</div>
            <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #ECEAE4' }}>
              <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Concepto</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#888' }}>Estimado</div>
                <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#22C55E' }}>Real</div>
              </div>
              {CONCEPTOS_GASTOS.map((c, i) => (
                <div key={c.id} className="grid grid-cols-[1fr_80px_80px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid #F0EEE8' : undefined, background: '#fff' }}>
                  <div className="text-xs font-medium pr-2" style={{ color: '#444', lineHeight: 1.3 }}>{c.nombre}</div>
                  <div className="px-1"><input type="number" value={gastos[c.id].estimado || ''} onChange={e => updateGasto(c.id, 'estimado', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4', color: '#333' }} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} /></div>
                  <div className="px-1"><input type="number" value={gastos[c.id].real || ''} onChange={e => updateGasto(c.id, 'real', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid rgba(34,197,94,0.4)', color: '#22C55E' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.4)'} /></div>
                </div>
              ))}
              {res && (
                <div className="grid grid-cols-[1fr_80px_80px] px-3 py-2.5" style={{ background: '#ECEAE4', borderTop: '1px solid #E2E0D8' }}>
                  <div className="text-xs font-black uppercase" style={{ color: '#F26E1F' }}>TOTAL INVERSIÓN</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#666' }}>{fmt(res.totalEst)}</div>
                  <div className="text-xs font-black font-mono text-right" style={{ color: '#333' }}>{fmt(res.totalReal)}</div>
                </div>
              )}
            </div>

            <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Precio de venta por escenario</div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#EF4444' }}>Conservador</label>
                <input type="number" value={pvPes || ''} onChange={e => setPvPes(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FEF2F2', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444' }} onFocus={e => e.target.style.borderColor='#EF4444'} onBlur={e => e.target.style.borderColor='rgba(239,68,68,0.3)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#F59E0B' }}>Realista</label>
                <input type="number" value={pvReal || ''} onChange={e => setPvReal(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FFFBEB', border: '1.5px solid rgba(245,158,11,0.3)', color: '#D97706' }} onFocus={e => e.target.style.borderColor='#F59E0B'} onBlur={e => e.target.style.borderColor='rgba(245,158,11,0.3)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#22C55E' }}>Optimista</label>
                <input type="number" value={pvOpt || ''} onChange={e => setPvOpt(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#F0FDF4', border: '1.5px solid rgba(34,197,94,0.3)', color: '#16A34A' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.3)'} placeholder="€" />
              </div>
            </div>

            {/* Unidades edificio */}
            {calcTipologia === 'edificio' && (
              <div className="mb-5">
                <button onClick={() => setUnidadesOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 rounded-xl" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                  <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Unidades del edificio {unidadesCalc.length > 0 ? `(${unidadesCalc.length})` : ''}</span>
                  <span style={{ color: '#aaa' }}>{unidadesOpen ? '▲' : '▼'}</span>
                </button>
                {unidadesOpen && (
                  <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #ECEAE4' }}>
                    {unidadesCalc.length === 0 ? (
                      <div className="px-4 py-6 text-center text-xs" style={{ color: '#aaa' }}>Sin unidades. Agregalas desde el chat WOS3.</div>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1fr_70px_80px] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                          <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: '#888' }}>Unidad</div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: '#888' }}>m²</div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-right" style={{ color: '#22C55E' }}>P. Venta Est.</div>
                        </div>
                        {unidadesCalc.map((u, i) => (
                          <div key={u.id} className="grid grid-cols-[1fr_70px_80px] px-3 py-2 items-center" style={{ borderTop: i > 0 ? '1px solid #F0EEE8' : undefined, background: '#fff' }}>
                            <div className="text-xs font-medium" style={{ color: '#444' }}>{u.tipo}{u.planta ? ` P${u.planta}` : ''}</div>
                            <div className="text-xs font-mono text-center" style={{ color: '#888' }}>{u.superficie || '—'}</div>
                            <div className="text-xs font-black font-mono text-right" style={{ color: '#22C55E' }}>{u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}</div>
                          </div>
                        ))}
                        <div className="grid grid-cols-[1fr_70px_80px] px-3 py-2" style={{ background: '#ECEAE4', borderTop: '1px solid #E2E0D8' }}>
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
                <input type="url" value={urlEstudio} onChange={e => setUrlEstudio(e.target.value)} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Observaciones</label>
                <textarea value={notasEstudio} onChange={e => setNotasEstudio(e.target.value)} placeholder="Notas, condiciones, contacto..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#F26E1F'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
            </div>

            {res && (
              <>
                <div className="text-[11px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados por escenario</div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #ECEAE4' }}>
                  <div className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                    <div />
                    {ESC_UI.map(esc => <div key={esc.label} className="text-[10px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>{esc.label}</div>)}
                  </div>
                  {[
                    { label: 'P. Venta',   vals: ESC_UI.map(e => fmt(toNum(e.pv))),                                            colors: ESC_UI.map(() => '#333') },
                    { label: 'Beneficio',  vals: ESC_UI.map((_,i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])),         colors: ESC_UI.map((_,i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444') },
                    { label: 'ROI oper.',  vals: ESC_UI.map((_,i) => fmtPct(res.rent[i])),                                    colors: ESC_UI.map((_,i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444') },
                    { label: `ROI anual${duracionMeses > 0 ? ` (${duracionMeses}m)` : ''}`, vals: ESC_UI.map((_,i) => res.anual[i] !== null ? fmtPct(res.anual[i]!) : '—'), colors: ESC_UI.map((_,i) => res.anual[i] === null ? '#aaa' : res.anual[i]! >= 15 ? '#22C55E' : res.anual[i]! >= 0 ? '#F59E0B' : '#EF4444') },
                  ].map((row, ri) => (
                    <div key={row.label} className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2.5 items-center" style={{ borderTop: ri > 0 ? '1px solid #F0EEE8' : undefined, background: '#fff' }}>
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
