'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const MercadoReoWizard = dynamic(() => import('@/components/MercadoReoWizard'), { ssr: false })
import RiesgosMatriz from '@/components/RiesgosMatriz'
import { PARTIDAS_PLANTILLA } from '@/lib/reforma-template'
import { generateReportePDF } from '@/lib/generateReportePDF'
import { CHECKLIST_ITEMS, ChecklistDocumentacion, ChecklistItemEstado, getItemEstado, getBloqueantesPendientes, getAlertasConfirmadas } from '@/lib/checklist-documentacion'

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
  fijado?: boolean
  fijado_en?: string | null
  // Multi-estrategia
  unidades_estimadas?: number
  costo_reforma_por_unidad?: number
  precio_venta_por_unidad?: number
  alquiler_estimado_unidad?: number
  reforma_minima_estimada?: number
  alquiler_mensual_estimado?: number
  precio_venta_rentando?: number
  fee_inbruto_estimado?: number
  fee_gestion_obra_estimado?: number
  jv_jugadores?: JvJugador[]
  jv_bono_pct_gestor?: number
  jv_bono_pct_inversor?: number
  jv_bono_beneficio_ccp?: number
  jv_bono_beneficio_final?: number
  jv_bono_liquidacion?: string
  checklist_documentacion?: ChecklistDocumentacion
  origen?: string
  provincia?: string
  ccaa?: string
  asset_id_servicer?: string
  portfolio_reo?: string
  estado_judicial_reo?: string
  fase_desahucio?: string
  proyecto_id?: string | null
  datos_catastro?: any
  vendedor_tipo?: string
  vendedor_nombre?: string
}

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
  referencia_catastral?: string
  notas?: string
}

type Proveedor = { id: string; nombre: string }
type Visita = { id: string; inmueble_id: string; fecha: string; hora: string; responsable: string; notas_previas?: string; estado_post?: string; notas_post?: string; fotos_url?: string; gcal_event_id?: string; created_at: string }

const SUBESTADO_CFG: Record<string, { label: string; color: string; bg: string }> = {
  sin_analizar: { label: 'Radar',        color: '#888',    bg: 'rgba(136,136,136,0.12)' },
  en_estudio:   { label: 'En estudio',   color: '#60A5FA', bg: 'rgba(96,165,250,0.15)'  },
  ofertado:     { label: 'Ofertado',     color: '#F59E0B', bg: 'rgba(245,158,11,0.15)'  },
  en_arras:     { label: 'En arras',     color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  comprado:     { label: 'Comprado',     color: '#22C55E', bg: 'rgba(34,197,94,0.15)'   },
}

const TIPOLOGIA_LABELS: Record<string, string> = {
  piso: 'Piso', casa: 'Casa', duplex: 'Dúplex', edificio: 'Edificio', suelo: 'Suelo', nave: 'Nave',
}

const UNIDAD_TIPO_MAP: Record<string, string> = {
  'piso': 'piso', 'dúplex': 'duplex', 'duplex': 'duplex', 'local': 'local',
  'ático': 'atico', 'atico': 'atico', 'garaje': 'garaje', 'parking': 'parking',
  'trastero': 'trastero', 'estudio': 'estudio', 'oficina': 'oficina',
}
const normalizeUnidadTipo = (t: string) => UNIDAD_TIPO_MAP[t.toLowerCase()] ?? 'otro'
const UNIDAD_TIPO_OPTIONS = ['Piso','Dúplex','Local','Ático','Garaje','Trastero','Estudio','Oficina']
const unidadTipoLabel = (t: string) => UNIDAD_TIPO_OPTIONS.find(o => normalizeUnidadTipo(o) === t) ?? t

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

// JV / Gestor — regla fija: 50% del beneficio para gestores (partes iguales entre ellos),
// 50% para inversores (a prorrata de su capital dentro del pool de inversores).
// Rol 'mixto': el jugador participa de ambos pools según su % gestor/inversor (ej. 50/50)
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

// BONUS CCP — reparte el excedente (beneficio final - beneficio acordado en el CCP)
// entre gestores/inversores según el % de bonus (ej. 60/40), no el 50/50 fijo del reparto base
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
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtroOrigen, setFiltroOrigen] = useState('todos')
  const [filtroProvincia, setFiltroProvincia] = useState('todos')
  const [reoWizardOpen, setReoWizardOpen] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [loading, setLoading] = useState(true)
  const [unidades, setUnidades] = useState<Record<string, Unidad[]>>({})
  const [loadingUnidades, setLoadingUnidades] = useState<Record<string, boolean>>({})
  const [addingUnidadId, setAddingUnidadId] = useState<string | null>(null)
  const [nuevaUnidad, setNuevaUnidad] = useState({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
  const [savingUnidad, setSavingUnidad] = useState(false)
  const [editingUnidadId, setEditingUnidadId] = useState<string | null>(null)
  const [editUnidad, setEditUnidad] = useState({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
  const [savingEditUnidad, setSavingEditUnidad] = useState(false)
  const [importandoUrl, setImportandoUrl] = useState<string | null>(null)
  const [importUrl, setImportUrl] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [expandedDetalle, setExpandedDetalle] = useState<string | null>(null)
  const [creando, setCreando] = useState<string | null>(null)
  const [updatingEstado, setUpdatingEstado] = useState<string | null>(null)
  const [confirmandoCompra, setConfirmandoCompra] = useState<string | null>(null)
  const [compraOverrideOk, setCompraOverrideOk] = useState(false)
  const [confirmandoArras, setConfirmandoArras] = useState<string | null>(null)

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
  const [jvModo, setJvModo] = useState<'solo' | 'jv'>('solo')
  const [jvJugadores, setJvJugadores] = useState<JvJugador[]>([])
  // BONUS (CCP) — solo referencia/persistencia, no se calcula en esta fase
  const [jvBonoPctGestor, setJvBonoPctGestor] = useState(60)
  const [jvBonoPctInversor, setJvBonoPctInversor] = useState(40)
  const [jvBonoBeneficioCcp, setJvBonoBeneficioCcp] = useState(0)
  const [jvBonoBeneficioFinal, setJvBonoBeneficioFinal] = useState(0)
  const [jvBonoLiquidacion, setJvBonoLiquidacion] = useState('')
  const [checklistDoc, setChecklistDoc] = useState<ChecklistDocumentacion>({})
  const [catastroLoadingId, setCatastroLoadingId] = useState<string | null>(null)
  const [catastroError, setCatastroError] = useState<Record<string, string>>({})

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

  const fetchInmuebles = () =>
    supabase.from('inmuebles').select('*').neq('estado', 'borrador').order('created_at', { ascending: false })
      .then(({ data }) => setInmuebles(data || []))

  useEffect(() => {
    Promise.all([
      fetchInmuebles(),
      supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre'),
    ]).then(([, p]) => {
      setProveedores(p.data || [])
      setLoading(false)
    })
  }, [])

  // El chat WOS (panel lateral) puede insertar/editar/borrar en `inmuebles` sin que
  // esta página se entere — refresca la lista cuando el chat avisa que tocó esa tabla,
  // para no depender de recargar el navegador.
  useEffect(() => {
    const onRecordChanged = (e: Event) => {
      const table = (e as CustomEvent<{ table?: string }>).detail?.table
      if (table === 'inmuebles') fetchInmuebles()
    }
    window.addEventListener('wos:record-changed', onRecordChanged)
    return () => window.removeEventListener('wos:record-changed', onRecordChanged)
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
          tipo: normalizeUnidadTipo(u.tipo || 'piso'),
          planta: u.planta || null,
          superficie: typeof u.superficie === 'number' ? u.superficie : null,
          ocupacion: u.ocupacion === 'ocupado' ? 'ocupado' : 'libre',
          origen: 'directo',
          renta_mensual: typeof u.renta_mensual === 'number' ? u.renta_mensual : null,
          precio_venta_est: typeof u.precio_venta_est === 'number' ? u.precio_venta_est : null,
          reforma_estimada: typeof u.reforma_estimada === 'number' ? u.reforma_estimada : null,
          notas: u.notas || null,
        }))
        const { data: insertedUnidades } = await supabase.from('inmueble_unidades').insert(rows).select()
        if (insertedUnidades) setUnidades(prev => ({ ...prev, [data.id]: insertedUnidades }))
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
      vendedor_tipo: item.vendedor_tipo || '',
      vendedor_nombre: item.vendedor_nombre || '',
    } as any)
    setAddingUnidadId(null)
    setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' })
    setEditPortada(null)
    setEditPortadaPreview(null)
    if (item.tipologia === 'edificio') fetchUnidades(item.id)
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
      vendedor_tipo: (editForm as any).vendedor_tipo || null,
      vendedor_nombre: (editForm as any).vendedor_nombre || null,
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

  const fetchCatastroInmueble = async (item: Inmueble) => {
    if (!item.referencia_catastral) return
    setCatastroLoadingId(item.id)
    setCatastroError(prev => ({ ...prev, [item.id]: '' }))
    try {
      const res = await fetch(`/api/catastro/inmueble?id=${item.id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error obteniendo catastro')
      setInmuebles(prev => prev.map(x => x.id === item.id ? { ...x, datos_catastro: json.datos } : x))
    } catch (e: any) {
      setCatastroError(prev => ({ ...prev, [item.id]: e.message }))
    } finally {
      setCatastroLoadingId(null)
    }
  }

  const toggleFijado = async (item: Inmueble) => {
    const nuevoFijado = !item.fijado
    const payload = { fijado: nuevoFijado, fijado_en: nuevoFijado ? new Date().toISOString() : null }
    const { error } = await supabase.from('inmuebles').update(payload).eq('id', item.id)
    if (!error) setInmuebles(prev => prev.map(x => x.id === item.id ? { ...x, ...payload } : x))
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
    setUnidadesEst(item?.unidades_estimadas ?? 1)
    setCostoRefUnidad(item?.costo_reforma_por_unidad ?? 0)
    setPvPorUnidad(item?.precio_venta_por_unidad ?? 0)
    setAlqUnidad(item?.alquiler_estimado_unidad ?? 0)
    setReformaMin(item?.reforma_minima_estimada ?? 0)
    setAlqMensual(item?.alquiler_mensual_estimado ?? 0)
    setPvRentando(item?.precio_venta_rentando ?? 0)
    setFeeInbruto(item?.fee_inbruto_estimado ?? 0)
    setFeeGestionObra(item?.fee_gestion_obra_estimado ?? 0)
    const jugadoresIniciales = item?.jv_jugadores && item.jv_jugadores.length > 0 ? item.jv_jugadores : []
    setJvJugadores(jugadoresIniciales)
    setJvModo(jugadoresIniciales.length > 0 ? 'jv' : 'solo')
    setJvBonoPctGestor(item?.jv_bono_pct_gestor ?? 60)
    setJvBonoPctInversor(item?.jv_bono_pct_inversor ?? 40)
    setJvBonoBeneficioCcp(item?.jv_bono_beneficio_ccp ?? 0)
    setJvBonoBeneficioFinal(item?.jv_bono_beneficio_final ?? 0)
    setJvBonoLiquidacion(item?.jv_bono_liquidacion || '')
    setChecklistDoc(item?.checklist_documentacion || {})
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
    // Al marcar En Arras: mostrar confirmación para mover a Proyectos
    if (nuevoEstado === 'en_arras') {
      const item = inmuebles.find(x => x.id === id)
      if (item && !item.proyecto_id) { setConfirmandoArras(id); return }
    }
    // Si se desmarca arras (vuelve a en_estudio): quitar confirmación si estaba abierta
    if (confirmandoArras === id) setConfirmandoArras(null)
    setUpdatingEstado(id + '_' + nuevoEstado)
    const { error } = await supabase.from('inmuebles').update({ estado: nuevoEstado }).eq('id', id)
    setUpdatingEstado(null)
    if (error) { alert(`Error: ${error.message}`); return }
    setInmuebles(prev => prev.map(x => x.id === id ? { ...x, estado: nuevoEstado } : x))
  }

  const moverArrasAProyectos = async (item: Inmueble) => {
    setConfirmandoArras(null)
    setCreando(item.id)
    // 1. Cambiar estado del inmueble a en_arras
    await supabase.from('inmuebles').update({ estado: 'en_arras' }).eq('id', item.id)
    // 2. Calcular siguiente código OP-XXX
    const { data: codigos } = await supabase.from('proyectos').select('codigo').order('codigo', { ascending: false }).limit(1)
    const ultimoNum = codigos?.[0]?.codigo ? parseInt(codigos[0].codigo.replace('OP-', ''), 10) : 0
    const nuevoCodigo = `OP-${String(ultimoNum + 1).padStart(3, '0')}`
    // 3. Crear proyecto con estado en_arras
    const { data: proyecto, error } = await supabase.from('proyectos').insert([{
      codigo: nuevoCodigo,
      nombre: item.titulo || item.direccion,
      direccion: item.direccion,
      ciudad: item.ciudad || null,
      tipo: item.tipologia || 'piso',
      estado: 'en_arras',
      precio_compra: item.precio_compra || null,
      precio_venta_conservador: item.precio_venta_conservador || null,
      precio_venta_realista:    item.precio_venta_realista    || null,
      precio_venta_optimista:   item.precio_venta_optimista   || null,
      precio_venta_estimado: item.precio_venta_realista || item.precio_venta_optimista || item.precio_venta_conservador || null,
      porcentaje_hasu: 100,
      fecha_compra: today(),
    }]).select().single()
    if (error) { alert(`Error: ${error.message}`); setCreando(null); return }
    // 3. Guardar proyecto_id en el inmueble para no duplicar
    await supabase.from('inmuebles').update({ proyecto_id: proyecto.id }).eq('id', item.id)
    // 4. Crear partidas de reforma plantilla
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
    setInmuebles(prev => prev.map(x => x.id === item.id ? { ...x, estado: 'en_arras', proyecto_id: proyecto.id } : x))
    setCreando(null)
    router.push('/proyectos')
  }

  // Mantenemos crearProyecto solo como fallback por si hay inmuebles legacy en estado comprado sin proyecto_id
  const crearProyecto = async (item: Inmueble) => {
    if (confirmandoCompra !== item.id) { setConfirmandoCompra(item.id); setCompraOverrideOk(false); return }
    const pendientesChecklist = getBloqueantesPendientes(item.checklist_documentacion)
    if (pendientesChecklist.length > 0 && !compraOverrideOk) return
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
    await supabase.from('inmuebles').update({ estado: 'comprado', proyecto_id: proyecto.id }).eq('id', item.id)
    setInmuebles(prev => prev.map(x => x.id === item.id ? { ...x, estado: 'comprado', proyecto_id: proyecto.id } : x))
    setCompraOverrideOk(false)
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
      tipo: normalizeUnidadTipo(nuevaUnidad.tipo),
      planta: nuevaUnidad.planta || null,
      superficie: nuevaUnidad.superficie ? parseFloat(nuevaUnidad.superficie) : null,
      ocupacion: nuevaUnidad.ocupacion,
      origen: 'directo',
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
  const startEditUnidad = (u: Unidad) => {
    setEditingUnidadId(u.id)
    setEditUnidad({
      tipo: unidadTipoLabel(u.tipo),
      planta: u.planta || '',
      superficie: u.superficie != null ? String(u.superficie) : '',
      ocupacion: u.ocupacion || 'libre',
      renta_mensual: u.renta_mensual != null ? String(u.renta_mensual) : '',
      precio_venta_est: u.precio_venta_est != null ? String(u.precio_venta_est) : '',
      reforma_estimada: u.reforma_estimada != null ? String(u.reforma_estimada) : '',
      notas: u.notas || '',
    })
    setAddingUnidadId(null)
    setImportandoUrl(null)
  }
  const saveEditUnidad = async (inmuebleId: string) => {
    if (!editingUnidadId) return
    setSavingEditUnidad(true)
    const payload: Record<string, unknown> = {
      tipo: normalizeUnidadTipo(editUnidad.tipo),
      planta: editUnidad.planta || null,
      superficie: editUnidad.superficie ? parseFloat(editUnidad.superficie) : null,
      ocupacion: editUnidad.ocupacion,
      renta_mensual: editUnidad.renta_mensual ? parseFloat(editUnidad.renta_mensual) : null,
      precio_venta_est: editUnidad.precio_venta_est ? parseFloat(editUnidad.precio_venta_est) : null,
      reforma_estimada: editUnidad.reforma_estimada ? parseFloat(editUnidad.reforma_estimada) : null,
      notas: editUnidad.notas || null,
    }
    const { data, error } = await supabase.from('inmueble_unidades').update(payload).eq('id', editingUnidadId).select().single()
    setSavingEditUnidad(false)
    if (error) { alert(error.message); return }
    setUnidades(prev => ({ ...prev, [inmuebleId]: (prev[inmuebleId] || []).map(u => u.id === editingUnidadId ? data : u) }))
    setEditingUnidadId(null)
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
  const buscarNorm = buscar.trim().toLowerCase()
  const provinciasDisponibles = Array.from(new Set(inmuebles.map(x => x.provincia).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'es'))
  const inmueblesFiltrados = inmuebles.filter(x =>
    !x.proyecto_id &&  // ocultar los que ya pasaron a Proyectos
    (filtroTipologia === 'todos' || x.tipologia === filtroTipologia) &&
    (filtroEstado === 'todos' || x.estado === filtroEstado) &&
    (filtroOrigen === 'todos' || (x.origen || 'directo') === filtroOrigen) &&
    (filtroProvincia === 'todos' || x.provincia === filtroProvincia) &&
    (buscarNorm === '' || [x.titulo, x.direccion, x.ciudad, x.provincia].filter(Boolean).some(v => (v as string).toLowerCase().includes(buscarNorm)))
  ).sort((a, b) => {
    // Fijados primero (más recién fijado arriba dentro del grupo, como Instagram pero sin límite de 3).
    // Los no fijados van del más viejo al más nuevo — así lo nuevo entra abajo, no empuja lo importante.
    if (a.fijado && !b.fijado) return -1
    if (!a.fijado && b.fijado) return 1
    if (a.fijado && b.fijado) return new Date(b.fijado_en || 0).getTime() - new Date(a.fijado_en || 0).getTime()
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })

  const res = calcResultados(gastos, pvPes, pvReal, pvOpt, duracionMeses)

  // ── Multi-estrategia ──────────────────────────────────────
  const precioCompraVal = toNum(gastos.precio_compra.real) || toNum(gastos.precio_compra.estimado)
  const gastosSimples = precioCompraVal * 0.02 + 1000

  // CAAV: usa totalReal y pvReal del calculador existente
  const caavBen = res ? pvReal - res.totalReal : null
  const caavRoi = (res && res.totalReal > 0) ? (caavBen! / res.totalReal) * 100 : null

  // PatrimonioIN
  const patReformaTotal = unidadesEst * costoRefUnidad
  const patPvTotal = unidadesEst * pvPorUnidad
  const patCost = precioCompraVal + patReformaTotal + gastosSimples
  const patBen = (pvPorUnidad > 0 && precioCompraVal > 0) ? patPvTotal - patCost : null
  const patRoi = (patBen !== null && patCost > 0) ? (patBen / patCost) * 100 : null
  const roiBrutoInversor = (alqUnidad > 0 && pvPorUnidad > 0) ? (alqUnidad * 12 / pvPorUnidad) * 100 : null

  // Alquiler directo
  const alqCost = precioCompraVal + reformaMin + gastosSimples
  const roiAlqAnual = (alqMensual > 0 && alqCost > 0) ? (alqMensual * 12 / alqCost) * 100 : null
  const benVentaRentando = (pvRentando > 0 && precioCompraVal > 0) ? pvRentando - alqCost : null
  const roiVentaRentando = (benVentaRentando !== null && alqCost > 0) ? (benVentaRentando / alqCost) * 100 : null

  // INbruto
  const inbrutoBen = (feeInbruto > 0 || feeGestionObra > 0) ? feeInbruto + feeGestionObra : null

  // JV / Gestor — reparto de caavBen entre jugadores (ver calcJvReparto)
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
  const ESTADO_TABS = ['todos', 'sin_analizar', 'en_estudio', 'ofertado', 'en_arras', 'comprado']
  const TIPO_ICON: Record<string, string> = { nota: '📝', llamada: '📞', email: '✉️', visita: '🏠', documento: '📄', api: '🤝' }

  // JSX helpers
  const renderBitacora = (item: Inmueble) => null

  const renderBitacoraModal = () => {
    if (!openBitacoraId) return null
    const item = inmuebles.find(x => x.id === openBitacoraId)
    if (!item) return null
    const entradas = bitacora[item.id] || []
    return (
      <>
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.45)' }} onClick={() => { setOpenBitacoraId(null); setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' }); setEditingBitacoraId(null) }} />
        <div className="fixed inset-x-4 top-[5vh] bottom-[5vh] z-50 flex items-start justify-center pointer-events-none">
          <div className="w-full max-w-[600px] rounded-2xl flex flex-col pointer-events-auto" style={{ background: '#fff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: '90vh' }}>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F0EEE8' }}>
              <div>
                <div className="font-black text-[16px]" style={{ color: '#111' }}>📋 Bitácora</div>
                <div className="text-[12px] font-medium mt-0.5" style={{ color: '#999' }}>{item.titulo || item.direccion}</div>
              </div>
              <button onClick={() => { setOpenBitacoraId(null); setBitacoraForm({ contenido: '', tipo: 'nota', autor: '', url: '', proveedor_id: '' }); setEditingBitacoraId(null) }}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[14px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>✕</button>
            </div>

            {/* Formulario nueva entrada */}
            <div className="px-5 py-4 flex-shrink-0" style={{ borderBottom: '1px solid #F0EEE8' }}>
              <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>
                {editingBitacoraId ? 'Editar entrada' : 'Nueva entrada'}
              </div>
              <textarea value={bitacoraForm.contenido} onChange={ev => setBitacoraForm(f => ({ ...f, contenido: ev.target.value }))}
                placeholder="Visita realizada, llamada con API, precio negociable..." rows={4}
                className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none mb-3"
                style={INP_L}
                onFocus={ev => ev.target.style.borderColor='#A6855A'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Tipo</label>
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
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Autor</label>
                  <input type="text" value={bitacoraForm.autor} onChange={ev => setBitacoraForm(f => ({ ...f, autor: ev.target.value }))}
                    placeholder="Patricio"
                    className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                    style={INP_L}
                    onFocus={ev => ev.target.style.borderColor='#A6855A'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Link externo</label>
                <input type="url" value={bitacoraForm.url} onChange={ev => setBitacoraForm(f => ({ ...f, url: ev.target.value }))} placeholder="https://..."
                  className="w-full rounded-lg px-2 py-2 text-xs outline-none font-medium"
                  style={INP_L}
                  onFocus={ev => ev.target.style.borderColor='#A6855A'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
              </div>
              {proveedores.length > 0 && (
                <div className="mb-3">
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Proveedor</label>
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
                  className="flex-1 py-2.5 rounded-xl text-xs font-black disabled:opacity-40" style={{ background: '#14110C', color: '#F8F3E9' }}>
                  {savingBitacora ? '...' : editingBitacoraId ? 'Guardar cambios' : '+ Agregar entrada'}
                </button>
              </div>
            </div>

            {/* Timeline de entradas — scrolleable */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingBitacora === item.id ? (
                <div className="py-8 text-center text-sm" style={{ color: '#BBB' }}>Cargando...</div>
              ) : !entradas.length ? (
                <div className="py-8 text-center text-sm" style={{ color: '#BBB' }}>Sin entradas todavía. Escribí la primera arriba.</div>
              ) : (
                <div className="pl-5 relative">
                  <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#E5E3DE' }} />
                  {entradas.map((b: unknown) => {
                    const entry = b as Record<string, unknown>
                    return (
                      <div key={entry.id as string} className="relative mb-5">
                        <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background: '#A6855A', border: '2px solid #fff' }} />
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-[12px] font-bold font-mono tracking-wide" style={{ color: '#AAA' }}>
                            {new Date(entry.created_at as string).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                            {' · '}{TIPO_ICON[entry.tipo as string] || '📝'} {((entry.tipo as string) || 'nota').toUpperCase()}
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => openEditBitacora(entry)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: '#ECEAE4', color: '#666' }}>✎</button>
                            <button onClick={() => deleteBitacoraEntry(entry.id as string, item.id)} className="w-6 h-6 rounded-md flex items-center justify-center text-xs" style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>✕</button>
                          </div>
                        </div>
                        <div className="text-[14px] font-medium leading-relaxed" style={{ color: '#1a1a1a' }}>{entry.contenido as string}</div>
                        {entry.url && (
                          <a href={entry.url as string} target="_blank" rel="noopener noreferrer" className="text-xs font-bold inline-flex items-center gap-1 mt-1" style={{ color: '#60A5FA' }}>🔗 Ver link</a>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          {entry.autor && <div className="text-xs font-bold" style={{ color: '#A6855A' }}>{entry.autor as string}</div>}
                          {(entry.proveedores as {nombre:string})?.nombre && <div className="text-xs font-medium" style={{ color: '#888' }}>· {(entry.proveedores as {nombre:string}).nombre}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </>
    )
  }

  const renderVisitas = (item: Inmueble) => (
    <>
      <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #F0EEE8', background: '#FAFAF8' }}>
        <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8' }}>
          Visitas{visitas[item.id] ? ` (${visitas[item.id].length})` : ''}
        </span>
        <div className="flex gap-1.5">
          <button onClick={() => { setAgendandoVisitaId(item.id); setVisitaForm(emptyVisitaForm()) }}
            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: 'rgba(166,133,90,0.09)', color: '#A6855A', border: '1.5px solid rgba(166,133,90,0.25)' }}>+ Agendar</button>
          <button onClick={() => toggleVisitas(item.id)}
            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: openVisitasId === item.id ? 'rgba(166,133,90,0.09)' : '#ECEAE4', color: openVisitasId === item.id ? '#A6855A' : '#888', border: `1.5px solid ${openVisitasId === item.id ? 'rgba(166,133,90,0.25)' : '#E2E0D8'}` }}>
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
                      {v.gcal_event_id && <span className="text-[12px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.10)', color: '#3B82F6' }}>📅</span>}
                      {!v.estado_post && (
                        <button onClick={() => { setPostVisitaId(v.id); setPostVisitaInmuebleId(item.id); setPostVisitaForm({ estado_post: 'sigue_activo', notas_post: '', fotos_url: '' }) }}
                          className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                          style={{ background: 'rgba(166,133,90,0.09)', color: '#A6855A', border: '1.5px solid rgba(166,133,90,0.25)' }}>Post-visita</button>
                      )}
                    </div>
                  </div>
                  {v.estado_post && (
                    <div className="mt-2 pt-2 flex gap-2 items-start" style={{ borderTop: '1px solid #F0EEE8' }}>
                      <span className="text-[12px] font-black uppercase px-2 py-0.5 rounded-full flex-shrink-0"
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
      {renderBitacoraModal()}

      {/* Modal confirmación mover a Proyectos desde En Arras */}
      {confirmandoArras && (() => {
        const item = inmuebles.find(x => x.id === confirmandoArras)
        if (!item) return null
        return (
          <>
            <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setConfirmandoArras(null)} />
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
              <div className="w-full max-w-sm rounded-2xl p-6 pointer-events-auto" style={{ background: '#fff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)' }}>
                <div className="text-[18px] font-black mb-1" style={{ color: '#111' }}>¿Mover a Proyectos?</div>
                <div className="text-[13px] font-medium mb-1" style={{ color: '#666' }}>{item.titulo || item.direccion}</div>
                <div className="text-[12px] mb-5 leading-relaxed" style={{ color: '#999' }}>
                  El inmueble desaparece de Mercado y entra a Proyectos con estado <strong style={{ color: '#a78bfa' }}>En arras</strong>. Cuando se firme la escritura cambiás la etiqueta a Comprado desde Proyectos.
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmandoArras(null)}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>
                    Cancelar
                  </button>
                  <button onClick={() => moverArrasAProyectos(item)} disabled={creando === item.id}
                    className="flex-1 py-2.5 rounded-xl text-[13px] font-black disabled:opacity-50" style={{ background: '#14110C', color: '#F8F3E9' }}>
                    {creando === item.id ? '...' : 'Mover a Proyectos →'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )
      })()}

      {/* ── Banner cabecera ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ position: 'relative', height: 160, overflow: 'hidden', borderRadius: 20 }}>
          <img
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1400&h=500&fit=crop&q=80"
            alt="Mercado"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(20,17,12,0.82) 0%, rgba(166,133,90,0.55) 100%)' }} />
          <div className="absolute inset-0 flex items-end justify-between" style={{ padding: '20px 24px' }}>
            <div>
              <h1 className="font-black text-[28px] text-white leading-tight" style={{ letterSpacing: '-0.5px' }}>Mercado</h1>
              <p className="text-[13px] font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Inmuebles en estudio</p>
            </div>
            <button onClick={() => setNuevoOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white"
              style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              + Agregar
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 40px' }}>
      {/* Solapas por estado (pipeline) */}
      <div className="flex gap-2 mb-3 overflow-x-auto -mx-5 px-5">
        {ESTADO_TABS.map(e => {
          const cfg = e === 'todos' ? null : SUBESTADO_CFG[e]
          const active = filtroEstado === e
          const count = e === 'todos' ? inmuebles.length : inmuebles.filter(x => x.estado === e).length
          return (
            <button key={e} onClick={() => setFiltroEstado(e)}
              className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
              style={{
                background: active ? (cfg ? cfg.color : '#111') : '#fff',
                color: active ? '#fff' : (cfg ? cfg.color : '#555'),
                border: `1.5px solid ${active ? (cfg ? cfg.color : '#111') : '#E2E0D8'}`,
              }}>
              {e === 'todos' ? 'Todos' : cfg!.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input value={buscar} onChange={ev => setBuscar(ev.target.value)}
          placeholder="Buscar por título, dirección o ciudad..."
          className="w-full rounded-xl px-4 py-2.5 text-sm outline-none font-medium"
          style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }}
          onFocus={ev => ev.target.style.borderColor='#A6855A'} onBlur={ev => ev.target.style.borderColor='#ECEAE4'} />
      </div>

      {/* Filtros por tipología */}
      <div className="flex gap-2 mb-3 overflow-x-auto -mx-5 px-5">
        {FILTROS.map(f => (
          <button key={f} onClick={() => setFiltroTipologia(f)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
            style={{ background: filtroTipologia === f ? '#A6855A' : '#E8E8E8', color: filtroTipologia === f ? '#14110C' : '#555', border: filtroTipologia === f ? '1px solid #A6855A' : '1px solid #DCDCDC' }}>
            {FILTRO_LABELS[f]}{f !== 'todos' ? ` (${inmuebles.filter(x => x.tipologia === f).length})` : ` (${inmuebles.length})`}
          </button>
        ))}
      </div>

      {/* Filtros por origen */}
      <div className="flex gap-2 mb-8 overflow-x-auto -mx-5 px-5">
        {(['todos', 'directo', 'reo'] as const).map(o => {
          const count = o === 'todos' ? inmuebles.length : inmuebles.filter(x => (x.origen || 'directo') === o).length
          const label = o === 'todos' ? 'Todos los orígenes' : o === 'reo' ? '🏦 REO / Servicer' : '📋 Directo'
          return (
            <button key={o} onClick={() => setFiltroOrigen(o)}
              className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap"
              style={{ background: filtroOrigen === o ? '#14110C' : '#F0EEE8', color: filtroOrigen === o ? '#F8F3E9' : '#555', border: filtroOrigen === o ? '1px solid #14110C' : '1px solid #DCDCDC' }}>
              {label} ({count})
            </button>
          )
        })}
        {provinciasDisponibles.length > 0 && (
          <select value={filtroProvincia} onChange={e => setFiltroProvincia(e.target.value)}
            className="flex-shrink-0 text-sm font-bold rounded-full px-3 py-1.5"
            style={{ background: filtroProvincia !== 'todos' ? '#14110C' : '#F0EEE8', color: filtroProvincia !== 'todos' ? '#F8F3E9' : '#555', border: filtroProvincia !== 'todos' ? '1px solid #14110C' : '1px solid #DCDCDC', cursor: 'pointer' }}>
            <option value="todos">Todas las provincias</option>
            {provinciasDisponibles.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <button onClick={() => setReoWizardOpen(true)}
          className="flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-bold whitespace-nowrap ml-auto"
          style={{ background: '#A6855A', color: '#14110C', border: '1px solid #A6855A' }}>
          + Importar REOs
        </button>
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
                    {item.fijado && <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: '#A6855A', color: '#14110C', backdropFilter: 'blur(4px)' }}>📌 Fijado</span>}
                    <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.55)', color: '#fff', backdropFilter: 'blur(4px)' }}>{tipLabel}</span>
                    {item.fuente && <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.55)', color: '#ddd', backdropFilter: 'blur(4px)' }}>{item.fuente}</span>}
                    {item.jv_jugadores && item.jv_jugadores.length > 0 && (
                      <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(168,85,247,0.85)', color: '#fff', backdropFilter: 'blur(4px)' }}>JV · {item.jv_jugadores.length}</span>
                    )}
                  </div>
                  <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5">
                    <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    {['sin_analizar', 'en_estudio', 'ofertado', 'en_arras'].includes(item.estado) && (() => {
                      const alertas = getAlertasConfirmadas(item.checklist_documentacion)
                      const pendientes = getBloqueantesPendientes(item.checklist_documentacion)
                      if (alertas.length > 0) return <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.9)', color: '#fff', backdropFilter: 'blur(4px)' }}>🔴 {alertas.length} alerta{alertas.length>1?'s':''}</span>
                      if (pendientes.length > 0) return <span className="text-[12px] font-black px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.9)', color: '#fff', backdropFilter: 'blur(4px)' }}>⚠ {pendientes.length} por verificar</span>
                      return null
                    })()}
                  </div>
                </div>

                {/* Contenido */}
                <div className="p-3 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEdit(item)}>
                      <div className="font-black text-[15px] leading-tight truncate hover:text-[#A6855A] transition-colors" style={{ color: '#111' }}>{item.titulo || item.direccion}</div>
                      {item.titulo && <div className="text-xs mt-0.5 truncate" style={{ color: '#999' }}>{item.direccion}{item.ciudad ? ` · ${item.ciudad}` : ''}</div>}
                      {!item.titulo && item.ciudad && <div className="text-xs mt-0.5" style={{ color: '#999' }}>{item.ciudad}</div>}
                    </div>
                    <div className="text-sm font-black font-mono flex-shrink-0" style={{ color: '#A6855A' }}>{fmt(item.precio_compra || 0)}</div>
                  </div>

                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <span className="text-[12px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: item.superficie ? '#666' : '#CCC' }}>{item.superficie ? `${item.superficie} m²` : '— m²'}</span>
                    <span className="text-[12px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: item.habitaciones ? '#666' : '#CCC' }}>{item.habitaciones ? `${item.habitaciones} hab` : '— hab'}</span>
                    <span className="text-[12px] font-bold px-2 py-0.5 rounded-lg" style={{ background: '#F3F2EE', color: item.num_plantas ? '#666' : '#CCC' }}>{item.num_plantas ? `${item.num_plantas} plantas` : '— plantas'}</span>
                  </div>

                  {/* Grid métricas compacto — todas las tipologías, con — donde no aplique */}
                  <div className="grid grid-cols-3 mt-3 rounded-xl overflow-hidden" style={{ background: '#ECEAE4' }}>
                    {[
                      { label: 'Precio', val: fmt(item.precio_compra || 0) },
                      { label: 'Unidades', val: unidades[item.id] ? String(unidades[item.id].length) : '—' },
                      { label: 'm²', val: item.superficie ? String(item.superficie) : '—' },
                    ].map((m, i) => (
                      <div key={m.label} className="text-center py-2.5" style={{ background: '#F9F8F5', borderLeft: i > 0 ? '1px solid #ECEAE4' : 'none' }}>
                        <div className="text-[11px] font-bold uppercase tracking-wide mb-0.5" style={{ color: '#AAA' }}>{m.label}</div>
                        <div className="text-[13px] font-black" style={{ color: '#222' }}>{m.val}</div>
                      </div>
                    ))}
                  </div>

                  {/* Tabla de resultados si analizado (todos los tipos) */}
                  {isAnalizado && (() => {
                    const g = item.gastos_json as Gastos | undefined
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
                    const ESC = [
                      { label: 'Pesimista', color: '#EF4444' },
                      { label: 'Realista',  color: '#F59E0B' },
                      { label: 'Optimista', color: '#22C55E' },
                    ]
                    const roiColor = (v: number | null) =>
                      v === null ? '#BBB' : v >= 30 ? '#22C55E' : v >= 15 ? '#F59E0B' : '#EF4444'
                    return (
                      <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1px solid #ECEAE4' }}>
                        {/* Header escenarios */}
                        <div className="grid grid-cols-[72px_1fr_1fr_1fr]" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                          <div />
                          {ESC.map(s => (
                            <div key={s.label} className="text-center py-1.5">
                              <span className="text-[11px] font-black uppercase tracking-wide" style={{ color: s.color }}>{s.label}</span>
                            </div>
                          ))}
                        </div>
                        {/* P. Venta */}
                        <div className="grid grid-cols-[72px_1fr_1fr_1fr] border-b" style={{ borderColor: '#F0EEE8', background: '#fff' }}>
                          <div className="px-2.5 py-2 text-[12px] font-bold" style={{ color: '#AAA' }}>P. Venta</div>
                          {pvs.map((pv, i) => (
                            <div key={i} className="py-2 text-center text-[12px] font-black font-mono" style={{ color: '#333' }}>{pv ? fmt(pv) : '—'}</div>
                          ))}
                        </div>
                        {/* Gastos totales */}
                        {totalInv ? (
                          <div className="grid grid-cols-[72px_1fr_1fr_1fr] border-b" style={{ borderColor: '#F0EEE8', background: '#FAFAF8' }}>
                            <div className="px-2.5 py-2 text-[12px] font-bold" style={{ color: '#AAA' }}>Inv. total</div>
                            {ESC.map((_, i) => (
                              <div key={i} className="py-2 text-center text-[12px] font-mono" style={{ color: '#888' }}>{fmt(totalInv)}</div>
                            ))}
                          </div>
                        ) : null}
                        {/* Beneficio */}
                        <div className="grid grid-cols-[72px_1fr_1fr_1fr] border-b" style={{ borderColor: '#F0EEE8', background: '#fff' }}>
                          <div className="px-2.5 py-2 text-[12px] font-bold" style={{ color: '#AAA' }}>Beneficio</div>
                          {bens.map((b, i) => (
                            <div key={i} className="py-2 text-center text-[12px] font-black font-mono" style={{ color: b === null ? '#BBB' : b >= 0 ? '#22C55E' : '#EF4444' }}>
                              {b !== null ? (b >= 0 ? '+' : '') + fmt(b) : '—'}
                            </div>
                          ))}
                        </div>
                        {/* ROI operación */}
                        <div className="grid grid-cols-[72px_1fr_1fr_1fr] border-b" style={{ borderColor: '#F0EEE8', background: '#fff' }}>
                          <div className="px-2.5 py-2 text-[12px] font-bold" style={{ color: '#AAA' }}>ROI oper.</div>
                          {rois.map((r, i) => (
                            <div key={i} className="py-2 text-center text-[12px] font-black font-mono" style={{ color: roiColor(r) }}>
                              {r !== null ? r.toFixed(1) + '%' : '—'}
                            </div>
                          ))}
                        </div>
                        {/* ROI anualizado */}
                        <div className="grid grid-cols-[72px_1fr_1fr_1fr]" style={{ background: '#F9F8F5' }}>
                          <div className="px-2.5 py-2 text-[12px] font-bold leading-tight" style={{ color: '#AAA' }}>
                            ROI anual{dm ? <span className="block font-normal" style={{ color: '#CCC' }}>({dm}m)</span> : null}
                          </div>
                          {roisAnual.map((r, i) => (
                            <div key={i} className="py-2 text-center text-[12px] font-black font-mono" style={{ color: r === null ? '#BBB' : roiColor(r) }}>
                              {r !== null ? r.toFixed(1) + '%' : '—'}
                            </div>
                          ))}
                        </div>
                        {/* Fecha análisis */}
                        {item.analizado_en && (
                          <div className="px-2.5 py-1 text-[11px]" style={{ color: '#CCC', background: '#FAFAF8', borderTop: '1px solid #F0EEE8' }}>
                            {item.analizado_en}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold" style={{ color: '#3B82F6' }}>🔗 Ver anuncio</a>}
                    {item.drive_url && <a href={item.drive_url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-black px-2 py-0.5 rounded-lg" style={{ background: 'rgba(34,197,94,0.10)', color: '#16A34A', border: '1px solid rgba(34,197,94,0.2)' }}>📁 Drive</a>}
                  </div>
                  {item.tipologia !== 'edificio' && item.notas && <div className="mt-2 text-xs leading-relaxed" style={{ color: '#888' }}>{item.notas}</div>}

                  {/* Bloque vendedor/titular */}
                  {(() => {
                    const esReo = (item.origen || 'directo') === 'reo'
                    const tieneVendedor = esReo ? !!(item.portfolio_reo || item.asset_id_servicer) : !!(item.vendedor_tipo || item.vendedor_nombre)
                    if (!tieneVendedor) return null
                    return (
                      <div className="mt-2 rounded-xl px-3 py-2" style={{ background: '#F5F4F0', border: '1px solid #ECEAE4' }}>
                        <div className="text-[9px] font-black uppercase tracking-widest mb-1.5" style={{ color: '#A6855A' }}>
                          {esReo ? 'Fondo / Servicer' : 'Vendedor'}
                        </div>
                        {esReo ? (
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                            {item.portfolio_reo && <span className="text-[11px] font-bold" style={{ color: '#1A1A1A' }}>{item.portfolio_reo}</span>}
                            {item.asset_id_servicer && <span className="text-[11px]" style={{ color: '#666' }}>ID: {item.asset_id_servicer}</span>}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-x-4 gap-y-0.5 items-center">
                            {item.vendedor_tipo && (
                              <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded" style={{ background: 'rgba(166,133,90,0.12)', color: '#A6855A' }}>{item.vendedor_tipo}</span>
                            )}
                            {item.vendedor_nombre && <span className="text-[11px] font-bold" style={{ color: '#1A1A1A' }}>{item.vendedor_nombre}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Bloque catastro */}
                  {item.referencia_catastral && (() => {
                    const cat = item.datos_catastro
                    const isLoading = catastroLoadingId === item.id
                    const err = catastroError[item.id]
                    return (
                      <div className="mt-2 rounded-xl overflow-hidden" style={{ border: '1px solid #ECEAE4' }}>
                        <div className="flex items-center justify-between px-3 py-2" style={{ background: '#F5F4F0' }}>
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-widest" style={{ color: '#A6855A' }}>Catastro</div>
                            <a href={`https://www1.sedecatastro.gob.es/CYCBienInmueble/OVCBusqueda.aspx?pest=rc&i=es&buscar=S&RefC=${encodeURIComponent(item.referencia_catastral)}`}
                              target="_blank" rel="noopener noreferrer"
                              className="text-[11px] font-mono font-bold hover:underline" style={{ color: '#3B82F6' }}>
                              {item.referencia_catastral}
                            </a>
                          </div>
                          <button
                            onClick={() => fetchCatastroInmueble(item)}
                            disabled={isLoading}
                            className="text-[10px] font-black px-2.5 py-1 rounded-lg transition-colors"
                            style={{ background: cat ? '#E8F5E9' : '#F0EEE8', color: cat ? '#16A34A' : '#A6855A', border: '1px solid', borderColor: cat ? '#BBF7D0' : '#DDDAD2' }}>
                            {isLoading ? '⟳' : cat ? '✓ Actualizar' : '⬇ Obtener'}
                          </button>
                        </div>
                        {err && <div className="px-3 py-1 text-[10px]" style={{ color: '#dc2626', background: '#FEF2F2' }}>{err}</div>}
                        {cat && (
                          <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-0.5" style={{ background: '#F9FFF9' }}>
                            {cat.direccion_completa && <div className="col-span-2 text-[11px] font-semibold mb-0.5" style={{ color: '#1A1A1A' }}>{cat.direccion_completa}</div>}
                            {cat.uso && <div className="text-[10px]"><span style={{ color: '#999' }}>Uso: </span><span style={{ color: '#333' }}>{cat.uso}</span></div>}
                            {cat.superficie_construida && <div className="text-[10px]"><span style={{ color: '#999' }}>Sup: </span><span style={{ color: '#333' }}>{cat.superficie_construida} m²</span></div>}
                            {cat.año_construccion && <div className="text-[10px]"><span style={{ color: '#999' }}>Año: </span><span style={{ color: '#333' }}>{cat.año_construccion}</span></div>}
                            {cat.tipo_construccion && <div className="text-[10px]"><span style={{ color: '#999' }}>Tipo: </span><span style={{ color: '#333' }}>{cat.tipo_construccion}</span></div>}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Ver detalle (edificios y/o JV) — colapsado por default para no alargar la card */}
                  {(() => {
                    const tieneUnidades = item.tipologia === 'edificio'
                    const tieneJv = !!(item.jv_jugadores && item.jv_jugadores.length > 0)
                    if (!tieneUnidades && !tieneJv) return null
                    const partes = [
                      tieneJv ? 'JV' : '',
                      tieneUnidades && unidades[item.id] ? `${unidades[item.id].length} unidades` : '',
                    ].filter(Boolean).join(' · ')
                    return (
                      <button onClick={() => toggleDetalle(item.id)}
                        className="mt-3 w-full py-2 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-colors"
                        style={{ background: expandedDetalle === item.id ? 'rgba(166,133,90,0.08)' : '#F5F4F0', color: expandedDetalle === item.id ? '#A6855A' : '#888', border: `1.5px solid ${expandedDetalle === item.id ? 'rgba(166,133,90,0.3)' : '#ECEAE4'}` }}>
                        {expandedDetalle === item.id ? '▲ Cerrar detalle' : `▼ Ver detalle${partes ? ` · ${partes}` : ''}`}
                      </button>
                    )
                  })()}

                  {/* Panel detalle expandido — reparto JV + unidades (edificios), solo lectura */}
                  {expandedDetalle === item.id && (
                    <div className="mt-3 rounded-xl overflow-hidden" style={{ border: '1.5px solid #ECEAE4' }}>
                      {item.jv_jugadores && item.jv_jugadores.length > 0 && (() => {
                        const gDet = item.gastos_json as Gastos | undefined
                        const totalInvDet = gDet
                          ? CONCEPTOS_GASTOS.reduce((sum, c) => {
                              const gc = gDet[c.id] || { estimado: 0, real: 0 }
                              const r = toNum(gc.real); const e = toNum(gc.estimado)
                              return sum + (r > 0 ? r : e)
                            }, 0)
                          : null
                        const benRealistaDet = (item.precio_venta_realista && totalInvDet) ? item.precio_venta_realista - totalInvDet : null
                        const jvRes = calcJvReparto(item.jv_jugadores!, benRealistaDet, item.duracion_meses || 0)
                        const rolLabel = (r: JvJugador['rol']) => r === 'gestor' ? 'Gestor' : r === 'inversor' ? 'Inversor' : 'Mixto'
                        const rolColor = (r: JvJugador['rol']) => r === 'gestor' ? '#F59E0B' : r === 'inversor' ? '#3B82F6' : '#A855F7'
                        return (
                          <div className="px-3 py-2.5" style={{ background: 'rgba(168,85,247,0.06)', borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                            <div className="text-[11px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#A855F7' }}>Reparto JV (escenario Realista)</div>
                            <div className="grid grid-cols-[1fr_64px_64px] gap-x-2 pb-1 mb-1" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
                              <div className="text-[10px] font-black uppercase" style={{ color: '#BBB' }}>Jugador</div>
                              <div className="text-[10px] font-black uppercase text-right" style={{ color: '#BBB' }}>Capital</div>
                              <div className="text-[10px] font-black uppercase text-right" style={{ color: '#BBB' }}>Beneficio</div>
                            </div>
                            {jvRes.map(j => (
                              <div key={j.id} className="grid grid-cols-[1fr_64px_64px] gap-x-2 items-center py-1">
                                <div className="min-w-0">
                                  <div className="text-[12px] font-bold truncate" style={{ color: '#333' }}>{j.nombre || '—'}</div>
                                  <div className="text-[10px] font-black uppercase tracking-wide" style={{ color: rolColor(j.rol) }}>{rolLabel(j.rol)}{j.rol === 'mixto' ? ` ${(j.gestorPct ?? 50)}%` : ''}</div>
                                </div>
                                <div className="text-[12px] font-mono text-right" style={{ color: '#888' }}>{fmt(j.capital)}</div>
                                <div className="text-right">
                                  <div className="text-[12px] font-mono font-black" style={{ color: '#7C3AED' }}>{j.beneficio !== null ? fmt(j.beneficio) : '—'}</div>
                                  <div className="text-[10px] font-bold" style={{ color: '#A855F7' }}>{j.pctBeneficio.toFixed(0)}%</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      })()}
                      {item.tipologia === 'edificio' && item.notas && (
                        <div className="px-3 pt-3 pb-2.5" style={{ borderBottom: '1px solid #F0EEE8' }}>
                          <div className="text-[11px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#BBB' }}>Descripción</div>
                          <div className="text-[13px] leading-relaxed" style={{ color: '#555' }}>{item.notas}</div>
                        </div>
                      )}
                      {item.tipologia === 'edificio' && (
                        <div>
                          <div className="px-3 py-2.5">
                            <div className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#BBB' }}>
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
                                  <div key={i} className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                                ))}
                              </div>
                              {unidades[item.id].map((u, ui) => {
                                const isLibre = !u.ocupacion || u.ocupacion === 'libre' || u.ocupacion === 'Libre'
                                return (
                                  <div key={u.id} className="grid px-3 py-2 items-center" style={{ gridTemplateColumns: '1fr 44px 68px 80px', borderTop: '1px solid #F0EEE8' }}>
                                    <div>
                                      <div className="text-[13px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                      {u.renta_mensual ? <div className="text-[12px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                    </div>
                                    <div className="text-[12px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                    <div>
                                      <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                        {isLibre ? 'Libre' : 'Ocupado'}
                                      </span>
                                    </div>
                                    <div className="text-[12px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                      {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                    </div>
                                  </div>
                                )
                              })}
                              <div className="flex justify-between items-center px-3 py-2.5" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                                <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
                                <span className="text-[14px] font-black" style={{ color: '#22C55E' }}>
                                  {fmt(unidades[item.id].reduce((acc, u) => acc + (u.precio_venta_est || 0), 0))}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Botones principales */}
                {(() => {
                  // Texto WhatsApp — con o sin análisis
                  const g2 = item.gastos_json as Gastos | undefined
                  const inv2 = g2 ? CONCEPTOS_GASTOS.reduce((s, c) => {
                    const gc = g2[c.id] || { estimado: 0, real: 0 }
                    const r = toNum(gc.real); const e = toNum(gc.estimado)
                    return s + (r > 0 ? r : e)
                  }, 0) : null
                  const pvs2 = [item.precio_venta_conservador, item.precio_venta_realista, item.precio_venta_optimista]
                  const bens2 = pvs2.map(pv => (pv && inv2) ? pv - inv2 : null)
                  const rois2 = bens2.map(b => (b !== null && inv2) ? (b / inv2) * 100 : null)
                  const dm2 = item.duracion_meses
                  const roisA2 = rois2.map(r => (r !== null && dm2 && dm2 > 0) ? r * 12 / dm2 : null)
                  const nombre2 = item.titulo || item.direccion || 'Inmueble'
                  const escLines = pvs2.map((pv, i) => {
                    if (!pv) return ''
                    const esc = ['Pesimista','Realista','Optimista'][i]
                    const b = bens2[i]; const roi = rois2[i]; const roiA = roisA2[i]
                    return `*${esc}*: venta ${fmt(pv)} · benef. ${b !== null ? (b >= 0 ? '+' : '') + fmt(b) : '-'} · ROI ${roi !== null ? roi.toFixed(1) + '%' : '-'}${roiA !== null ? ` (${roiA.toFixed(1)}% anual)` : ''}`
                  }).filter(Boolean)
                  const lines = [
                    `*${nombre2}*`,
                    item.ciudad ? item.ciudad : '',
                    `Precio compra: *${fmt(item.precio_compra ?? 0)}*`,
                    inv2 ? `Inversion total: *${fmt(inv2)}*` : '',
                    escLines.length ? '' : '',
                    escLines.length ? '*Analisis de escenarios:*' : '',
                    ...escLines,
                    dm2 ? `Duracion estimada: ${dm2} meses` : '',
                    '',
                    'WALLEST - HASU Activos Inmobiliarios SL',
                  ].filter(l => l !== undefined && l !== '')
                  const waText = lines.join('\n').trim()
                  return (
                    <div className="flex gap-1.5 px-3 py-2.5" style={{ borderTop: '1px solid #F0EEE8' }}>
                      <button onClick={() => openCalc(item.precio_compra || 0, item.titulo || item.direccion, item.ciudad || '', item)}
                        className="flex-1 text-xs font-black px-2 py-2 rounded-xl"
                        style={{ background: 'rgba(166,133,90,0.09)', color: '#A6855A', border: '1.5px solid rgba(166,133,90,0.25)' }}>
                        {isAnalizado ? '✎ Análisis' : '⊕ Calcular'}
                      </button>
                      {/* Enviar — Web Share API con URL del reporte */}
                      <button
                        title="Compartir"
                        onClick={async (e) => {
                          const btn = e.currentTarget as HTMLButtonElement
                          const reporteUrl = `${window.location.origin}/reporte/${item.id}`
                          try {
                            if (navigator.share) {
                              await navigator.share({ url: reporteUrl, title: item.titulo || item.direccion || 'Reporte Wallest' })
                            } else {
                              await navigator.clipboard.writeText(reporteUrl)
                              btn.style.background = '#D1FAE5'
                              setTimeout(() => { btn.style.background = '#F5F4F0' }, 1400)
                            }
                          } catch(err) {
                            if (err instanceof Error && err.name === 'AbortError') return
                          }
                        }}
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: '#F5F4F0', border: '1.5px solid #ECEAE4', cursor: 'pointer', transition: 'background 0.3s' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                        </svg>
                      </button>
                      {/* Descargar PDF — abre página de reporte con auto-print */}
                      <button
                        title="Descargar PDF"
                        onClick={() => window.open(`/reporte/${item.id}`, '_blank')}
                        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                        style={{ background: '#F5F4F0', border: '1.5px solid #ECEAE4', cursor: 'pointer' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      </button>
                      <button onClick={() => openEdit(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1.5px solid #ECEAE4' }}>✎</button>
                      <button title={item.fijado ? 'Desfijar' : 'Fijar arriba'} onClick={() => toggleFijado(item)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center text-sm"
                        style={{ background: item.fijado ? 'rgba(166,133,90,0.15)' : '#F5F4F0', color: item.fijado ? '#A6855A' : '#888', border: `1.5px solid ${item.fijado ? 'rgba(166,133,90,0.4)' : '#ECEAE4'}` }}>📌</button>
                      <button onClick={() => deleteInmueble(item)} className="w-9 h-9 rounded-xl flex items-center justify-center text-sm" style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444', border: '1.5px solid rgba(239,68,68,0.18)' }}>🗑</button>
                    </div>
                  )
                })()}

                {/* Estado */}
                {item.estado !== 'sin_analizar' && item.estado !== 'comprado' && (() => {
                  const pendientesChecklist = getBloqueantesPendientes(item.checklist_documentacion)
                  return (
                  <div style={{ borderTop: '1px solid #F0EEE8' }}>
                    <div className="flex gap-2 px-3 py-2 flex-wrap">
                      <span className="text-[12px] font-bold self-center flex-shrink-0 uppercase tracking-wide" style={{ color: '#BBB' }}>Estado:</span>
                      {(['ofertado', 'en_arras'] as const).map(s => {
                        const c = SUBESTADO_CFG[s]; const activo = item.estado === s
                        return (
                          <button key={s} onClick={() => updateEstado(item.id, activo ? 'en_estudio' : s)} disabled={!!updatingEstado}
                            className="text-[12px] font-black px-2.5 py-1 rounded-lg disabled:opacity-50"
                            style={{ background: activo ? c.bg : '#F3F2EE', color: activo ? c.color : '#888', border: `1.5px solid ${activo ? c.color+'50' : '#ECEAE4'}` }}>
                            {updatingEstado === item.id+'_'+(activo?'en_estudio':s) ? '...' : c.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  )
                })()}

                {renderVisitas(item)}
                <div className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: '1px solid #F0EEE8', background: '#FAFAF8' }}>
                  <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8' }}>
                    Bitácora{bitacora[item.id] ? ` (${(bitacora[item.id] || []).length})` : ''}
                  </span>
                  <button onClick={() => toggleBitacora(item.id)}
                    className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                    style={{ background: '#ECEAE4', color: '#888', border: '1.5px solid #E2E0D8' }}>
                    📋 Abrir bitácora
                  </button>
                </div>
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
                <span className="text-[12px] font-black uppercase tracking-wide shrink-0 mr-1" style={{ color: '#666' }}>Tipo *</span>
                {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                  <button key={t} onClick={() => setNuevoForm(f => ({ ...f, tipologia: t }))}
                    className="px-2.5 py-1 rounded-xl text-[12px] font-black whitespace-nowrap flex-shrink-0"
                    style={{ background: nuevoForm.tipologia === t ? '#A6855A' : '#F5F4F0', color: nuevoForm.tipologia === t ? '#14110C' : '#666', border: nuevoForm.tipologia === t ? '1.5px solid #A6855A' : '1.5px solid #ECEAE4' }}>
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
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Título</label>
                    <input type="text" value={nuevoForm.titulo} onChange={e => setNuevoForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Dirección *</label>
                    <input type="text" value={nuevoForm.direccion} onChange={e => setNuevoForm(f => ({ ...f, direccion: e.target.value }))} placeholder="C/ Mayor 4" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Municipio</label>
                    <input type="text" value={nuevoForm.ciudad} onChange={e => setNuevoForm(f => ({ ...f, ciudad: e.target.value }))} placeholder="Zurgena" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Precio (€) *</label>
                    <input type="number" value={nuevoForm.precio} onChange={e => setNuevoForm(f => ({ ...f, precio: e.target.value }))} placeholder="65000" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Habitaciones</label>
                    <input type="number" value={nuevoForm.habitaciones} onChange={e => setNuevoForm(f => ({ ...f, habitaciones: e.target.value }))} placeholder="3" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>m²</label>
                    <input type="number" value={nuevoForm.superficie} onChange={e => setNuevoForm(f => ({ ...f, superficie: e.target.value }))} placeholder="85" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Link anuncio</label>
                    <input type="url" value={nuevoForm.url} onChange={e => setNuevoForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>📁 Drive</label>
                    <input type="url" value={nuevoForm.drive_url} onChange={e => setNuevoForm(f => ({ ...f, drive_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Notas</label>
                    <textarea value={nuevoForm.notas} onChange={e => setNuevoForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                </div>

                {/* Columna derecha */}
                <div className="mt-6 sm:mt-0 sm:flex sm:flex-col">
                  {nuevoForm.tipologia === 'edificio' && (
                    <div className="rounded-2xl overflow-hidden mb-3" style={{ border: '1.5px solid #ECEAE4' }}>
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: '#F9F8F5', borderBottom: '1px solid #ECEAE4' }}>
                        <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#777' }}>
                          Unidades{nuevoUnidades.length > 0 ? ` (${nuevoUnidades.length})` : ''}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setImportandoNuevoUrl(v => !v); setAddingNuevoUnidad(false) }}
                            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: importandoNuevoUrl ? 'rgba(59,130,246,0.09)' : '#ECEAE4', color: importandoNuevoUrl ? '#3B82F6' : '#888', border: `1.5px solid ${importandoNuevoUrl ? 'rgba(59,130,246,0.3)' : '#DDDBD5'}` }}>
                            {importandoNuevoUrl ? '✕' : '🔗 Importar URL'}
                          </button>
                          <button
                            onClick={() => { setAddingNuevoUnidad(v => !v); setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' }); setImportandoNuevoUrl(false) }}
                            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: addingNuevoUnidad ? 'rgba(166,133,90,0.09)' : '#ECEAE4', color: addingNuevoUnidad ? '#A6855A' : '#888', border: `1.5px solid ${addingNuevoUnidad ? 'rgba(166,133,90,0.3)' : '#DDDBD5'}` }}>
                            {addingNuevoUnidad ? '✕' : '+ Manual'}
                          </button>
                        </div>
                      </div>
                      {/* Panel importar URL */}
                      {importandoNuevoUrl && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#F0F4FF' }}>
                          <div className="text-[12px] font-black uppercase tracking-wide mb-2" style={{ color: '#3B82F6' }}>Importar unidades desde URL</div>
                          <div className="text-[12px] mb-3" style={{ color: '#666' }}>Pega un link de Idealista, Fotocasa u otro portal. Se guardará el edificio y se importarán todas las unidades automáticamente.</div>
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
                            <div className="text-[12px] mb-2" style={{ color: '#A6855A' }}>⚠ Completa Dirección y Precio antes de importar</div>
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
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tipo</label>
                              <select value={nuevaUnidad.tipo} onChange={e => setNuevaUnidad(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                {UNIDAD_TIPO_OPTIONS.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Planta</label>
                              <input type="text" value={nuevaUnidad.planta} onChange={e => setNuevaUnidad(f => ({ ...f, planta: e.target.value }))} placeholder="1ª, PB, Ático..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>m²</label>
                              <input type="number" value={nuevaUnidad.superficie} onChange={e => setNuevaUnidad(f => ({ ...f, superficie: e.target.value }))} placeholder="60"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Ocupación</label>
                              <select value={nuevaUnidad.ocupacion} onChange={e => setNuevaUnidad(f => ({ ...f, ocupacion: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                <option value="libre">Libre</option>
                                <option value="ocupado">Ocupado</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Renta/mes (€)</label>
                              <input type="number" value={nuevaUnidad.renta_mensual} onChange={e => setNuevaUnidad(f => ({ ...f, renta_mensual: e.target.value }))} placeholder="450"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>P. Venta est. (€)</label>
                              <input type="number" value={nuevaUnidad.precio_venta_est} onChange={e => setNuevaUnidad(f => ({ ...f, precio_venta_est: e.target.value }))} placeholder="55000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Reforma est. (€)</label>
                              <input type="number" value={nuevaUnidad.reforma_estimada} onChange={e => setNuevaUnidad(f => ({ ...f, reforma_estimada: e.target.value }))} placeholder="8000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Notas</label>
                              <input type="text" value={nuevaUnidad.notas} onChange={e => setNuevaUnidad(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              setNuevoUnidades(prev => [...prev, {
                                tipo: normalizeUnidadTipo(nuevaUnidad.tipo),
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
                            className="w-full py-2.5 rounded-xl text-xs font-black"
                            style={{ background: '#14110C', color: '#F8F3E9' }}>
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
                              <div key={i} className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                            ))}
                          </div>
                          {nuevoUnidades.map((u, ui) => {
                            const isLibre = !u.ocupacion || u.ocupacion === 'libre'
                            return (
                              <div key={ui} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px', borderTop: ui > 0 ? '1px solid #F0EEE8' : 'none' }}>
                                <div>
                                  <div className="text-[13px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                  {u.renta_mensual ? <div className="text-[12px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                  {u.reforma_estimada ? <div className="text-[12px]" style={{ color: '#BBB' }}>Reforma {fmt(u.reforma_estimada)}</div> : null}
                                  {u.notas ? <div className="text-[12px]" style={{ color: '#BBB' }}>{u.notas}</div> : null}
                                </div>
                                <div className="text-[12px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                <div>
                                  <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                    {isLibre ? 'Libre' : 'Ocupado'}
                                  </span>
                                </div>
                                <div className="text-[12px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                  {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                </div>
                                <button onClick={() => setNuevoUnidades(prev => prev.filter((_, i) => i !== ui))}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] ml-auto"
                                  style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444' }}>✕</button>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center px-4 py-3" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                            <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
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
                          <div className="text-[14px] font-bold" style={{ color: '#888' }}>Foto de portada</div>
                          <div className="text-[12px] text-center" style={{ color: '#BBB' }}>Click o arrastrá una imagen<br/>Se usará como portada de la card</div>
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
              <button onClick={saveNuevo} disabled={savingNuevo || !nuevoForm.direccion || !nuevoForm.precio} className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40" style={{ background: '#14110C', color: '#F8F3E9' }}>{savingNuevo ? 'Guardando...' : 'Guardar'}</button>
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
                <span className="text-[12px] font-black uppercase tracking-wide shrink-0 mr-1" style={{ color: '#666' }}>Tipo</span>
                {['piso','casa','duplex','edificio','suelo','nave'].map(t => (
                  <button key={t} onClick={() => setEditForm(f => ({ ...f, tipologia: t }))}
                    className="px-2.5 py-1 rounded-xl text-[12px] font-black whitespace-nowrap flex-shrink-0"
                    style={{ background: editForm.tipologia === t ? '#A6855A' : '#F5F4F0', color: editForm.tipologia === t ? '#14110C' : '#666', border: editForm.tipologia === t ? '1.5px solid #A6855A' : '1.5px solid #ECEAE4' }}>
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
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Título</label>
                    <input type="text" value={editForm.titulo} onChange={e => setEditForm(f => ({ ...f, titulo: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Dirección</label>
                    <input type="text" value={editForm.direccion} onChange={e => setEditForm(f => ({ ...f, direccion: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Municipio</label>
                    <input type="text" value={editForm.ciudad} onChange={e => setEditForm(f => ({ ...f, ciudad: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Precio (€)</label>
                    <input type="number" value={editForm.precio} onChange={e => setEditForm(f => ({ ...f, precio: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Habitaciones</label>
                    <input type="number" value={editForm.habitaciones} onChange={e => setEditForm(f => ({ ...f, habitaciones: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>m²</label>
                    <input type="number" value={editForm.superficie} onChange={e => setEditForm(f => ({ ...f, superficie: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Link anuncio</label>
                    <input type="url" value={editForm.url} onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>📁 Drive</label>
                    <input type="url" value={editForm.drive_url} onChange={e => setEditForm(f => ({ ...f, drive_url: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Vendedor tipo</label>
                    <select value={(editForm as any).vendedor_tipo || ''} onChange={e => setEditForm(f => ({ ...f, vendedor_tipo: e.target.value } as any))} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L}>
                      <option value="">—</option>
                      <option value="Particular">Particular</option>
                      <option value="Fondo">Fondo</option>
                      <option value="Banco">Banco</option>
                      <option value="Servicer">Servicer</option>
                      <option value="Promotora">Promotora</option>
                      <option value="Cooperativa">Cooperativa</option>
                      <option value="Herencia">Herencia</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Vendedor nombre</label>
                    <input type="text" value={(editForm as any).vendedor_nombre || ''} onChange={e => setEditForm(f => ({ ...f, vendedor_nombre: e.target.value } as any))} placeholder="Ej: Caixabank, Cerberus…" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#666' }}>Notas</label>
                    <textarea value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
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
                          <div className="text-[13px] font-bold" style={{ color: '#888' }}>Foto de portada</div>
                          <div className="text-[12px] mt-0.5" style={{ color: '#BBB' }}>Click o arrastrá una imagen</div>
                        </>
                      )}
                    </div>
                  </div>

                  {editForm.tipologia === 'edificio' ? (
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1.5px solid #ECEAE4' }}>
                      {/* Header unidades */}
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: '#F9F8F5', borderBottom: '1px solid #ECEAE4' }}>
                        <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#777' }}>
                          Unidades{unidades[editInmueble.id] ? ` (${unidades[editInmueble.id].length})` : ''}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => { setImportandoUrl(importandoUrl === editInmueble.id ? null : editInmueble.id); setImportUrl(''); setAddingUnidadId(null); setEditingUnidadId(null) }}
                            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: importandoUrl === editInmueble.id ? 'rgba(59,130,246,0.09)' : '#ECEAE4', color: importandoUrl === editInmueble.id ? '#3B82F6' : '#888', border: `1.5px solid ${importandoUrl === editInmueble.id ? 'rgba(59,130,246,0.3)' : '#DDDBD5'}` }}>
                            {importandoUrl === editInmueble.id ? '✕' : '🔗 Importar URL'}
                          </button>
                          <button
                            onClick={() => { setAddingUnidadId(addingUnidadId === editInmueble.id ? null : editInmueble.id); setNuevaUnidad({ tipo: 'Piso', planta: '', superficie: '', ocupacion: 'libre', renta_mensual: '', precio_venta_est: '', reforma_estimada: '', notas: '' }); setImportandoUrl(null); setEditingUnidadId(null) }}
                            className="text-[12px] font-black px-2.5 py-1 rounded-lg"
                            style={{ background: addingUnidadId === editInmueble.id ? 'rgba(166,133,90,0.09)' : '#ECEAE4', color: addingUnidadId === editInmueble.id ? '#A6855A' : '#888', border: `1.5px solid ${addingUnidadId === editInmueble.id ? 'rgba(166,133,90,0.3)' : '#DDDBD5'}` }}>
                            {addingUnidadId === editInmueble.id ? '✕' : '+ Manual'}
                          </button>
                        </div>
                      </div>

                      {/* Panel importar URL */}
                      {importandoUrl === editInmueble.id && (
                        <div className="p-4" style={{ borderBottom: '1px solid #ECEAE4', background: '#F0F4FF' }}>
                          <div className="text-[12px] font-black uppercase tracking-wide mb-2" style={{ color: '#3B82F6' }}>Importar unidades desde URL</div>
                          <div className="text-[12px] mb-3" style={{ color: '#666' }}>Pega un link de Idealista, Fotocasa u otro portal con el listado del edificio. Claude extrae todas las unidades automáticamente.</div>
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
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tipo</label>
                              <select value={nuevaUnidad.tipo} onChange={e => setNuevaUnidad(f => ({ ...f, tipo: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                {UNIDAD_TIPO_OPTIONS.map(t => <option key={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Planta</label>
                              <input type="text" value={nuevaUnidad.planta} onChange={e => setNuevaUnidad(f => ({ ...f, planta: e.target.value }))} placeholder="1ª, PB, Ático..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>m²</label>
                              <input type="number" value={nuevaUnidad.superficie} onChange={e => setNuevaUnidad(f => ({ ...f, superficie: e.target.value }))} placeholder="60"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Ocupación</label>
                              <select value={nuevaUnidad.ocupacion} onChange={e => setNuevaUnidad(f => ({ ...f, ocupacion: e.target.value }))}
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                <option value="libre">Libre</option>
                                <option value="ocupado">Ocupado</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Renta/mes (€)</label>
                              <input type="number" value={nuevaUnidad.renta_mensual} onChange={e => setNuevaUnidad(f => ({ ...f, renta_mensual: e.target.value }))} placeholder="450"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>P. Venta est. (€)</label>
                              <input type="number" value={nuevaUnidad.precio_venta_est} onChange={e => setNuevaUnidad(f => ({ ...f, precio_venta_est: e.target.value }))} placeholder="55000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Reforma est. (€)</label>
                              <input type="number" value={nuevaUnidad.reforma_estimada} onChange={e => setNuevaUnidad(f => ({ ...f, reforma_estimada: e.target.value }))} placeholder="8000"
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                            <div>
                              <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Notas</label>
                              <input type="text" value={nuevaUnidad.notas} onChange={e => setNuevaUnidad(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..."
                                className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                            </div>
                          </div>
                          <button onClick={() => saveUnidad(editInmueble.id)} disabled={savingUnidad}
                            className="w-full py-2.5 rounded-xl text-xs font-black disabled:opacity-50"
                            style={{ background: '#14110C', color: '#F8F3E9' }}>
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
                          <div className="grid px-4 py-2" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px 28px', background: '#F9F8F5', borderBottom: '1px solid #F0EEE8' }}>
                            {['Unidad','m²','Estado','Venta est.','',''].map((h,i) => (
                              <div key={i} className="text-[11px] font-black uppercase tracking-wide" style={{ color: '#C0BEB8', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</div>
                            ))}
                          </div>
                          {unidades[editInmueble.id].map((u, ui) => {
                            const isLibre = !u.ocupacion || u.ocupacion === 'libre' || u.ocupacion === 'Libre'
                            if (editingUnidadId === u.id) {
                              return (
                                <div key={u.id} className="p-4" style={{ background: '#FAFAF8', borderTop: ui > 0 ? '1px solid #F0EEE8' : 'none' }}>
                                  <div className="grid grid-cols-2 gap-2 mb-3">
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tipo</label>
                                      <select value={editUnidad.tipo} onChange={e => setEditUnidad(f => ({ ...f, tipo: e.target.value }))}
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                        {UNIDAD_TIPO_OPTIONS.map(t => <option key={t}>{t}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Planta</label>
                                      <input type="text" value={editUnidad.planta} onChange={e => setEditUnidad(f => ({ ...f, planta: e.target.value }))} placeholder="1ª, PB, Ático..."
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>m²</label>
                                      <input type="number" value={editUnidad.superficie} onChange={e => setEditUnidad(f => ({ ...f, superficie: e.target.value }))} placeholder="60"
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Ocupación</label>
                                      <select value={editUnidad.ocupacion} onChange={e => setEditUnidad(f => ({ ...f, ocupacion: e.target.value }))}
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333', appearance: 'none' as const }}>
                                        <option value="libre">Libre</option>
                                        <option value="ocupado">Ocupado</option>
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Renta/mes (€)</label>
                                      <input type="number" value={editUnidad.renta_mensual} onChange={e => setEditUnidad(f => ({ ...f, renta_mensual: e.target.value }))} placeholder="450"
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>P. Venta est. (€)</label>
                                      <input type="number" value={editUnidad.precio_venta_est} onChange={e => setEditUnidad(f => ({ ...f, precio_venta_est: e.target.value }))} placeholder="55000"
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Reforma est. (€)</label>
                                      <input type="number" value={editUnidad.reforma_estimada} onChange={e => setEditUnidad(f => ({ ...f, reforma_estimada: e.target.value }))} placeholder="8000"
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                    <div>
                                      <label className="block text-[11px] font-black uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Notas</label>
                                      <input type="text" value={editUnidad.notas} onChange={e => setEditUnidad(f => ({ ...f, notas: e.target.value }))} placeholder="Opcional..."
                                        className="w-full rounded-lg px-2 py-2 text-xs font-bold outline-none" style={{ background: '#fff', border: '1.5px solid #ECEAE4', color: '#333' }} />
                                    </div>
                                  </div>
                                  <div className="flex gap-2">
                                    <button onClick={() => setEditingUnidadId(null)}
                                      className="flex-1 py-2.5 rounded-xl text-xs font-black" style={{ background: '#ECEAE4', color: '#888' }}>Cancelar</button>
                                    <button onClick={() => saveEditUnidad(editInmueble.id)} disabled={savingEditUnidad}
                                      className="flex-1 py-2.5 rounded-xl text-xs font-black disabled:opacity-50" style={{ background: '#14110C', color: '#F8F3E9' }}>
                                      {savingEditUnidad ? 'Guardando...' : 'Guardar unidad'}
                                    </button>
                                  </div>
                                </div>
                              )
                            }
                            return (
                              <div key={u.id} className="grid px-4 py-2.5 items-center" style={{ gridTemplateColumns: '1fr 40px 62px 72px 28px 28px', borderTop: ui > 0 ? '1px solid #F0EEE8' : 'none' }}>
                                <div>
                                  <div className="text-[13px] font-bold" style={{ color: '#222' }}>{u.tipo}{u.planta ? ` · ${u.planta}` : ''}</div>
                                  {u.renta_mensual ? <div className="text-[12px]" style={{ color: '#AAA' }}>{fmt(u.renta_mensual)}/mes</div> : null}
                                  {u.reforma_estimada ? <div className="text-[12px]" style={{ color: '#BBB' }}>Reforma {fmt(u.reforma_estimada)}</div> : null}
                                  {u.notas ? <div className="text-[12px]" style={{ color: '#BBB' }}>{u.notas}</div> : null}
                                </div>
                                <div className="text-[12px]" style={{ color: '#AAA' }}>{u.superficie ?? '—'}</div>
                                <div>
                                  <span className="text-[11px] font-black px-1.5 py-0.5 rounded-full" style={{ background: isLibre ? 'rgba(34,197,94,0.10)' : 'rgba(245,158,11,0.10)', color: isLibre ? '#16A34A' : '#D97706' }}>
                                    {isLibre ? 'Libre' : 'Ocupado'}
                                  </span>
                                </div>
                                <div className="text-[12px] font-bold text-right" style={{ color: u.precio_venta_est ? '#22C55E' : '#CCC' }}>
                                  {u.precio_venta_est ? fmt(u.precio_venta_est) : '—'}
                                </div>
                                <button onClick={() => startEditUnidad(u)}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] mx-auto"
                                  style={{ background: 'rgba(59,130,246,0.08)', color: '#3B82F6' }}>✏️</button>
                                <button onClick={() => deleteUnidad(u.id, editInmueble.id)}
                                  className="w-6 h-6 rounded-lg flex items-center justify-center text-[12px] mx-auto"
                                  style={{ background: 'rgba(239,68,68,0.07)', color: '#EF4444' }}>✕</button>
                              </div>
                            )
                          })}
                          <div className="flex justify-between items-center px-4 py-3" style={{ borderTop: '1.5px solid #ECEAE4', background: '#F9F8F5' }}>
                            <span className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#AAA' }}>Total venta estimado</span>
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
              <button onClick={saveEdit} disabled={savingEdit} className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40" style={{ background: '#14110C', color: '#F8F3E9' }}>{savingEdit ? 'Guardando...' : 'Guardar cambios'}</button>
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
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Fecha *</label>
                    <input type="date" value={visitaForm.fecha} onChange={e => setVisitaForm(f => ({ ...f, fecha: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Hora *</label>
                    <input type="time" value={visitaForm.hora} onChange={e => setVisitaForm(f => ({ ...f, hora: e.target.value }))} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Responsable *</label>
                    <input type="text" value={visitaForm.responsable} onChange={e => setVisitaForm(f => ({ ...f, responsable: e.target.value }))} placeholder="Patricio" className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas previas</label>
                    <textarea value={visitaForm.notas_previas} onChange={e => setVisitaForm(f => ({ ...f, notas_previas: e.target.value }))} placeholder="Piso vacío, llave con el portero..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={() => setAgendandoVisitaId(null)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                  <button onClick={() => saveVisita(item)} disabled={savingVisita || !visitaForm.responsable} className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40" style={{ background: '#14110C', color: '#F8F3E9' }}>{savingVisita ? 'Agendando...' : '📅 Agendar'}</button>
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
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-2" style={{ color: '#888' }}>Estado post-visita</label>
                <div className="flex gap-2">
                  {[{ v: 'descartado', label: 'Descartado', color: '#EF4444', bg: 'rgba(239,68,68,0.15)' }, { v: 'sigue_activo', label: 'Sigue activo', color: '#F59E0B', bg: 'rgba(245,158,11,0.15)' }].map(opt => (
                    <button key={opt.v} onClick={() => setPostVisitaForm(f => ({ ...f, estado_post: opt.v }))}
                      className="flex-1 py-2 rounded-xl text-[12px] font-black"
                      style={{ background: postVisitaForm.estado_post === opt.v ? opt.bg : 'rgba(255,255,255,0.05)', color: postVisitaForm.estado_post === opt.v ? opt.color : '#666', border: `1px solid ${postVisitaForm.estado_post === opt.v ? opt.color+'60' : 'rgba(255,255,255,0.08)'}` }}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Notas</label>
                <textarea value={postVisitaForm.notas_post} onChange={e => setPostVisitaForm(f => ({ ...f, notas_post: e.target.value }))} placeholder="Piso en buen estado..." rows={3} className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium resize-none placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div className="mb-4">
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link fotos (Drive)</label>
                <input type="url" value={postVisitaForm.fotos_url} onChange={e => setPostVisitaForm(f => ({ ...f, fotos_url: e.target.value }))} placeholder="https://drive.google.com/..." className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-medium placeholder:text-[#555]" style={INP} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setPostVisitaId(null); setPostVisitaInmuebleId(null) }} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={() => savePostVisita(postVisitaId, postVisitaInmuebleId)} disabled={savingPostVisita} className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40" style={{ background: '#14110C', color: '#F8F3E9' }}>{savingPostVisita ? 'Guardando...' : 'Guardar'}</button>
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
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Título</label>
                <input type="text" value={tituloEstudio} onChange={e => setTituloEstudio(e.target.value)} placeholder="Ej: Piso Vera centro..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div className="col-span-2">
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Dirección</label>
                <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Municipio</label>
                <input type="text" value={ciudad} onChange={e => setCiudad(e.target.value)} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#A6855A' }}>Duración (meses) *</label>
                <input type="number" value={duracionMeses || ''} onChange={e => setDuracionMeses(parseFloat(e.target.value) || 0)} placeholder="ej: 6" className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
            </div>

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
                  <div className="px-1"><input type="number" value={gastos[c.id].estimado || ''} onChange={e => updateGasto(c.id, 'estimado', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid #ECEAE4', color: '#333' }} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} /></div>
                  <div className="px-1"><input type="number" value={gastos[c.id].real || ''} onChange={e => updateGasto(c.id, 'real', e.target.value)} className="w-full rounded-lg px-1.5 py-1.5 text-xs outline-none font-mono text-right" style={{ background: '#F9F8F5', border: '1px solid rgba(34,197,94,0.4)', color: '#22C55E' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.4)'} /></div>
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

            <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Precio de venta por escenario</div>
            <div className="grid grid-cols-3 gap-2 mb-5">
              <div>
                <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#EF4444' }}>Conservador</label>
                <input type="number" value={pvPes || ''} onChange={e => setPvPes(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FEF2F2', border: '1.5px solid rgba(239,68,68,0.3)', color: '#EF4444' }} onFocus={e => e.target.style.borderColor='#EF4444'} onBlur={e => e.target.style.borderColor='rgba(239,68,68,0.3)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#F59E0B' }}>Realista</label>
                <input type="number" value={pvReal || ''} onChange={e => setPvReal(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#FFFBEB', border: '1.5px solid rgba(245,158,11,0.3)', color: '#D97706' }} onFocus={e => e.target.style.borderColor='#F59E0B'} onBlur={e => e.target.style.borderColor='rgba(245,158,11,0.3)'} placeholder="€" />
              </div>
              <div>
                <label className="block text-[12px] font-black uppercase tracking-wide mb-1.5" style={{ color: '#22C55E' }}>Optimista</label>
                <input type="number" value={pvOpt || ''} onChange={e => setPvOpt(parseFloat(e.target.value) || 0)} className="w-full rounded-xl px-2 py-2.5 text-sm outline-none font-mono text-center" style={{ background: '#F0FDF4', border: '1.5px solid rgba(34,197,94,0.3)', color: '#16A34A' }} onFocus={e => e.target.style.borderColor='#22C55E'} onBlur={e => e.target.style.borderColor='rgba(34,197,94,0.3)'} placeholder="€" />
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

            <div className="grid grid-cols-1 gap-3 mb-5">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Link fuente</label>
                <input type="url" value={urlEstudio} onChange={e => setUrlEstudio(e.target.value)} placeholder="https://..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Observaciones</label>
                <textarea value={notasEstudio} onChange={e => setNotasEstudio(e.target.value)} placeholder="Notas, condiciones, contacto..." rows={2} className="w-full rounded-xl px-3 py-2.5 text-sm outline-none font-medium resize-none" style={INP_L} onFocus={e => e.target.style.borderColor='#A6855A'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
            </div>

            {res && (
              <>
                <div className="text-[12px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#888' }}>Resultados por escenario</div>
                <div className="rounded-xl overflow-hidden mb-5" style={{ border: '1px solid #ECEAE4' }}>
                  <div className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2" style={{ background: '#ECEAE4', borderBottom: '1px solid #E2E0D8' }}>
                    <div />
                    {ESC_UI.map(esc => <div key={esc.label} className="text-[12px] font-black uppercase tracking-wide text-center" style={{ color: esc.color }}>{esc.label}</div>)}
                  </div>
                  {[
                    { label: 'P. Venta',        vals: ESC_UI.map(e => fmt(toNum(e.pv))),                                                                                         colors: ESC_UI.map(() => '#333'),    bold: false },
                    { label: 'Gastos totales',   vals: ESC_UI.map(() => fmt(res.totalReal)),                                                                                      colors: ESC_UI.map(() => '#666'),    bold: false },
                    { label: 'Beneficio',        vals: ESC_UI.map((_,i) => (res.ben[i] >= 0 ? '+' : '') + fmt(res.ben[i])),                                                      colors: ESC_UI.map((_,i) => res.ben[i] >= 0 ? '#22C55E' : '#EF4444'),  bold: true },
                    { label: 'ROI oper.',        vals: ESC_UI.map((_,i) => fmtPct(res.rent[i])),                                                                                  colors: ESC_UI.map((_,i) => res.rent[i] >= 15 ? '#22C55E' : res.rent[i] >= 0 ? '#F59E0B' : '#EF4444'),  bold: true },
                    { label: `ROI anual${duracionMeses > 0 ? ` (${duracionMeses}m)` : ''}`, vals: ESC_UI.map((_,i) => res.anual[i] !== null ? fmtPct(res.anual[i]!) : '—'),     colors: ESC_UI.map((_,i) => res.anual[i] === null ? '#aaa' : res.anual[i]! >= 15 ? '#22C55E' : res.anual[i]! >= 0 ? '#F59E0B' : '#EF4444'),  bold: true },
                  ].map((row, ri) => (
                    <div key={row.label} className="grid grid-cols-[90px_1fr_1fr_1fr] px-3 py-2.5 items-center" style={{ borderTop: ri > 0 ? '1px solid #F0EEE8' : undefined, background: ri === 1 ? '#FAFAF8' : '#fff' }}>
                      <div className="text-xs" style={{ color: '#888', fontWeight: row.bold ? 700 : 500 }}>{row.label}</div>
                      {row.vals.map((v, i) => <div key={i} className="text-xs font-mono text-center" style={{ color: row.colors[i], fontWeight: row.bold ? 800 : 500 }}>{v}</div>)}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ═══ MULTI-ESTRATEGIA INPUTS ═══ */}
            <div className="mb-2 mt-2">
              <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Análisis multi-estrategia</div>

              {/* PatrimonioIN */}
              <div className="rounded-xl p-4 mb-3" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#6366F1' }}>PatrimonioIN — Fraccionamiento</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Unidades estimadas</label>
                    <input type="number" min="1" value={unidadesEst || ''} onChange={e => { setUnidadesEst(parseInt(e.target.value) || 1); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono text-center" style={INP_L} onFocus={e => e.target.style.borderColor='#6366F1'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Reforma por unidad (€)</label>
                    <input type="number" value={costoRefUnidad || ''} onChange={e => { setCostoRefUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#6366F1'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>P. venta por unidad (€)</label>
                    <input type="number" value={pvPorUnidad || ''} onChange={e => { setPvPorUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#6366F1'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Alquiler por unidad/mes (€)</label>
                    <input type="number" value={alqUnidad || ''} onChange={e => { setAlqUnidad(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#6366F1'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€ (para ROI inversor)" />
                  </div>
                </div>
              </div>

              {/* Alquiler directo */}
              <div className="rounded-xl p-4 mb-3" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#0EA5E9' }}>Alquiler directo</div>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Reforma mínima (€)</label>
                    <input type="number" value={reformaMin || ''} onChange={e => { setReformaMin(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#0EA5E9'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Alquiler mensual (€)</label>
                    <input type="number" value={alqMensual || ''} onChange={e => { setAlqMensual(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#0EA5E9'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€/mes" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>P. venta ya rentando (€) — opcional</label>
                    <input type="number" value={pvRentando || ''} onChange={e => { setPvRentando(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#0EA5E9'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€ si se vende con inquilino" />
                  </div>
                </div>
              </div>

              {/* INbruto */}
              <div className="rounded-xl p-4 mb-4" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                <div className="text-[12px] font-black uppercase tracking-wide mb-3" style={{ color: '#F59E0B' }}>INbruto — Venta del deal</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Fee INbruto (€)</label>
                    <input type="number" value={feeInbruto || ''} onChange={e => { setFeeInbruto(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#F59E0B'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="ref: 4.000–6.000€" />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Fee gestión obra (€)</label>
                    <input type="number" value={feeGestionObra || ''} onChange={e => { setFeeGestionObra(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-2 text-sm outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#F59E0B'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="ref: 2.000€+" />
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
                        <input type="number" value={res ? Math.round(res.totalReal) : ''} onChange={e => jvSetInversionTotal(e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#A855F7'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€" />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Tiempo (meses)</label>
                        <input type="number" value={duracionMeses || ''} onChange={e => { setDuracionMeses(parseFloat(e.target.value) || 0); setSavedId(null) }} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#A855F7'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="ej: 6" />
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
                              <input type="text" value={j.nombre} onChange={e => updateJugador(j.id, 'nombre', e.target.value)} placeholder="Nombre" className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-medium" style={INP_L} onFocus={e => e.target.style.borderColor='#A855F7'} onBlur={e => e.target.style.borderColor='#ECEAE4'} />
                              <select value={j.rol} onChange={e => updateJugador(j.id, 'rol', e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-bold uppercase" style={INP_L}>
                                <option value="gestor">Gestor</option>
                                <option value="inversor">Inversor</option>
                                <option value="mixto">Mixto</option>
                              </select>
                              <button onClick={() => removeJugador(j.id)} className="text-sm font-black" style={{ color: '#EF4444' }}>✕</button>
                            </div>
                            <div className="mb-2">
                              <label className="block text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Capital aportado (€)</label>
                              <input type="number" value={j.capital || ''} onChange={e => updateJugador(j.id, 'capital', e.target.value)} className="w-full rounded-lg px-2 py-1.5 text-xs outline-none font-mono" style={INP_L} onFocus={e => e.target.style.borderColor='#A855F7'} onBlur={e => e.target.style.borderColor='#ECEAE4'} placeholder="€" />
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

                    {/* BONUS — CCP (contrato de cuentas de participación) */}
                    <div className="rounded-xl p-3 mt-4" style={{ background: '#FFFBEB', border: '1px solid #FDE68A' }}>
                      <div className="text-[12px] font-black uppercase tracking-wide mb-1" style={{ color: '#B45309' }}>BONUS — reparto del excedente sobre el CCP</div>
                      <div className="text-[12px] font-medium mb-3" style={{ color: '#92400E', lineHeight: 1.4 }}>
                        Si el beneficio final supera al acordado en el CCP, el excedente se reparte en el % indicado: gestor(es) en partes iguales, inversor(es) a prorrata de capital.
                        <br />Ej: CCP = 100.000€ acordado, resultado real = 140.000€ → excedente 40.000€ → 60% (24.000€) gestor, 40% (16.000€) inversor(es).
                        <br />Mientras no se cargue el <b>Beneficio final</b> (la operación aún no cerró), no se calcula nada.
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

                    {/* Liquidación — a completar cuando se cierre la operación */}
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
                    const BTN = (activo: boolean, color: string, bg: string) => ({ background: activo ? bg : '#F5F4F0', color: activo ? color : '#AAA', border: `1.5px solid ${activo ? color+'50' : '#ECEAE4'}` })
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

              {/* Vista comparativa 4 escenarios */}
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

            {calcInmuebleId && (
              <div className="mt-2 mb-2">
                <RiesgosMatriz inmuebleId={calcInmuebleId} />
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={guardar} disabled={saving || !res || !!savedId}
                className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-50"
                style={{ background: savedId ? '#22C55E' : '#14110C', color: '#fff' }}>
                {saving ? 'Guardando...' : savedId ? '✓ Guardado' : calcInmuebleId ? 'Actualizar análisis' : 'Guardar análisis'}
              </button>
            </div>
          </div>
        </div>
      )}
      {reoWizardOpen && (
        <MercadoReoWizard
          onClose={() => setReoWizardOpen(false)}
          onImported={() => { setReoWizardOpen(false); fetchInmuebles() }}
        />
      )}
    </div>
  )
}
