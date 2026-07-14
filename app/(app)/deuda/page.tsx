'use client'
import { useEffect, useMemo, useState, useRef } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import DeudaFiltros, { FILTROS_INICIALES, DeudaFiltrosState } from '@/components/DeudaFiltros'
import DeudaListado from '@/components/DeudaListado'
import DeudaFichaModal from '@/components/DeudaFichaModal'
import DeudaImportWizard from '@/components/DeudaImportWizard'
import { DeudaPosicion, ESTADO_INTERNO_CFG, calcRatioRiesgoCargas, agruparPorContrato } from '@/lib/deuda-schema'

// Leaflet necesita `window` — no puede pasar por el render de servidor.
const DeudaMapa = dynamic(() => import('@/components/DeudaMapa'), { ssr: false, loading: () => <div className="rounded-2xl animate-pulse" style={{ height: 560, background: '#E2E0D8' }} /> })

const ESTADO_TABS = ['todos', ...Object.keys(ESTADO_INTERNO_CFG)]

const unicos = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b, 'es'))

export default function DeudaPage() {
  const [posiciones, setPosiciones] = useState<DeudaPosicion[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtros, setFiltros] = useState<DeudaFiltrosState>(FILTROS_INICIALES)
  const [vista, setVista] = useState<'lista' | 'mapa'>('lista')
  const [contratoAbierto, setContratoAbierto] = useState<string | null>(null)
  const [geocodificando, setGeocodificando] = useState(false)
  const [geocodProgreso, setGeocodProgreso] = useState({ hecho: 0, total: 0 })
  const cancelarGeocod = useRef(false)

  const fetchPosiciones = async () => {
    const { data } = await supabase.from('deuda_posiciones').select('*').order('created_at', { ascending: false })
    setPosiciones((data as DeudaPosicion[]) || [])
    setLoading(false)
  }

  useEffect(() => { fetchPosiciones() }, [])

  const onUpdateEstado = async (id: string, estado: string) => {
    setPosiciones(ps => ps.map(p => p.id === id ? { ...p, estado_interno: estado } : p))
    await supabase.from('deuda_posiciones').update({ estado_interno: estado }).eq('id', id)
  }

  const onUpdateImagen = async (id: string, file: File) => {
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `deuda_${id}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('portadas').upload(fileName, file, { cacheControl: '3600', upsert: false })
    if (upErr) return
    const { data: { publicUrl } } = supabase.storage.from('portadas').getPublicUrl(fileName)
    setPosiciones(ps => ps.map(p => p.id === id ? { ...p, imagen_url: publicUrl } : p))
    await supabase.from('deuda_posiciones').update({ imagen_url: publicUrl }).eq('id', id)
  }

  // Geocodifica UNA posición (botón "📍 Ubicar en mapa" en la ficha) — vía Nominatim/OSM, gratis, sin API key.
  const onGeocodear = async (id: string) => {
    const p = posiciones.find(x => x.id === id)
    if (!p) return
    const hermanas = posiciones.filter(x => x.direccion === p.direccion && x.ciudad === p.ciudad && x.zip === p.zip)
    const res = await authFetch('/api/deuda/geocode', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: hermanas.map(h => h.id), direccion: p.direccion, ciudad: p.ciudad, provincia: p.provincia, zip: p.zip }),
    })
    const data = await res.json()
    if (data.lat != null && data.lng != null) {
      const idsSet = new Set(hermanas.map(h => h.id))
      setPosiciones(ps => ps.map(x => idsSet.has(x.id) ? { ...x, lat: data.lat, lng: data.lng } : x))
    }
  }

  // Geocodifica en lote todas las direcciones sin coordenadas (agrupando por dirección para no repetir
  // llamadas). Respeta el límite de Nominatim de 1 req/seg espaciando las llamadas desde el cliente.
  const geocodificarPendientes = async () => {
    const pendientes = posiciones.filter(p => (p.lat == null || p.lng == null) && p.direccion)
    const grupos = new Map<string, DeudaPosicion[]>()
    pendientes.forEach(p => {
      const key = [p.direccion, p.ciudad, p.zip].join('|')
      const arr = grupos.get(key) || []
      arr.push(p)
      grupos.set(key, arr)
    })
    const entradas = Array.from(grupos.values())
    if (entradas.length === 0) return

    cancelarGeocod.current = false
    setGeocodificando(true)
    setGeocodProgreso({ hecho: 0, total: entradas.length })

    for (let i = 0; i < entradas.length; i++) {
      if (cancelarGeocod.current) break
      const grupo = entradas[i]
      const p = grupo[0]
      try {
        const res = await authFetch('/api/deuda/geocode', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: grupo.map(g => g.id), direccion: p.direccion, ciudad: p.ciudad, provincia: p.provincia, zip: p.zip }),
        })
        const data = await res.json()
        if (data.lat != null && data.lng != null) {
          const idsSet = new Set(grupo.map(g => g.id))
          setPosiciones(ps => ps.map(x => idsSet.has(x.id) ? { ...x, lat: data.lat, lng: data.lng } : x))
        }
      } catch {}
      setGeocodProgreso({ hecho: i + 1, total: entradas.length })
      // Nominatim: máx. 1 req/seg — se espacian las llamadas desde el cliente
      if (i < entradas.length - 1) await new Promise(r => setTimeout(r, 1100))
    }
    setGeocodificando(false)
  }

  const provincias = useMemo(() => unicos(posiciones.map(p => p.provincia)), [posiciones])
  const ciudades = useMemo(() => unicos(posiciones.map(p => p.ciudad)), [posiciones])
  const brokers = useMemo(() => unicos(posiciones.map(p => p.broker_origen)), [posiciones])
  const tiposColateral = useMemo(() => unicos(posiciones.map(p => p.tipo_colateral)), [posiciones])
  const subtiposColateral = useMemo(() => unicos(posiciones.map(p => p.subtipo_colateral)), [posiciones])

  const porEstado = useMemo(
    () => filtroEstado === 'todos' ? posiciones : posiciones.filter(p => p.estado_interno === filtroEstado),
    [posiciones, filtroEstado]
  )

  const filtradas = useMemo(() => {
    const buscar = filtros.buscar.trim().toLowerCase()
    return porEstado.filter(p => {
      if (buscar) {
        const haystack = [p.contract_id, p.direccion, p.titular_deuda, p.ciudad].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(buscar)) return false
      }
      if (filtros.provincia !== 'todos' && p.provincia !== filtros.provincia) return false
      if (filtros.ciudad !== 'todos' && p.ciudad !== filtros.ciudad) return false
      if (filtros.broker !== 'todos' && p.broker_origen !== filtros.broker) return false
      if (filtros.tipoColateral !== 'todos' && p.tipo_colateral !== filtros.tipoColateral) return false
      if (filtros.subtipoColateral !== 'todos' && p.subtipo_colateral !== filtros.subtipoColateral) return false
      if (filtros.precioMin && (p.asking_price ?? -Infinity) < Number(filtros.precioMin)) return false
      if (filtros.precioMax && (p.asking_price ?? Infinity) > Number(filtros.precioMax)) return false
      if (filtros.obMin && (p.deuda_ob ?? -Infinity) < Number(filtros.obMin)) return false
      if (filtros.obMax && (p.deuda_ob ?? Infinity) > Number(filtros.obMax)) return false
      if (filtros.estadosJudiciales.length > 0 && (!p.estado_judicial_normalizado || !filtros.estadosJudiciales.includes(p.estado_judicial_normalizado))) return false
      if (filtros.ocultarRiesgoCargas && calcRatioRiesgoCargas(p.cargas_previas, p.asking_price).alerta) return false
      return true
    })
  }, [porEstado, filtros])

  const grupos = useMemo(() => agruparPorContrato(filtradas), [filtradas])
  const grupoAbierto = contratoAbierto ? grupos.find(g => g.contractId === contratoAbierto) : null
  const pendientesGeocod = useMemo(() => posiciones.filter(p => (p.lat == null || p.lng == null) && p.direccion).length, [posiciones])

  return (
    <div style={{ background: '#F4F4F4', minHeight: '100vh' }}>
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ position: 'relative', height: 160, overflow: 'hidden', borderRadius: 20 }}>
          <img
            src="https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1400&h=500&fit=crop&q=80"
            alt="Deuda"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(20,17,12,0.82) 0%, rgba(166,133,90,0.55) 100%)' }} />
          <div className="absolute inset-0 flex items-end justify-between" style={{ padding: '20px 24px' }}>
            <div>
              <h1 className="font-black text-[28px] text-white leading-tight" style={{ letterSpacing: '-0.5px' }}>Deuda</h1>
              <p className="text-[13px] font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Posiciones de deuda / NPL — brokers y servicers</p>
            </div>
            <button onClick={() => setWizardOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-black text-white"
              style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.3)' }}>
              + Importar planilla
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 40px' }}>
        <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
          <div className="flex gap-2 overflow-x-auto">
            {ESTADO_TABS.map(e => {
              const cfg = e === 'todos' ? null : ESTADO_INTERNO_CFG[e]
              const active = filtroEstado === e
              const count = e === 'todos' ? posiciones.length : posiciones.filter(p => p.estado_interno === e).length
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

          <div className="flex rounded-xl p-1 flex-shrink-0" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
            {(['lista', 'mapa'] as const).map(v => (
              <button key={v} onClick={() => setVista(v)}
                className="px-3.5 py-1.5 rounded-lg text-[13px] font-black"
                style={{ background: vista === v ? '#A6855A' : 'transparent', color: vista === v ? '#14110C' : '#666' }}>
                {v === 'lista' ? '☰ Lista' : '🗺️ Mapa'}
              </button>
            ))}
          </div>
        </div>

        <DeudaFiltros
          filtros={filtros} setFiltros={setFiltros}
          provincias={provincias} ciudades={ciudades} brokers={brokers}
          tiposColateral={tiposColateral} subtiposColateral={subtiposColateral}
        />

        {vista === 'mapa' && pendientesGeocod > 0 && (
          <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3 mb-4 flex-wrap" style={{ background: 'rgba(166,133,90,0.1)', border: '1px solid rgba(166,133,90,0.3)' }}>
            <div className="text-[13px] font-bold" style={{ color: '#8A6D45' }}>
              {geocodificando
                ? `Ubicando direcciones en el mapa... ${geocodProgreso.hecho}/${geocodProgreso.total}`
                : `${pendientesGeocod} posiciones sin ubicar en el mapa todavía`}
            </div>
            {geocodificando ? (
              <button onClick={() => { cancelarGeocod.current = true }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-black" style={{ background: '#fff', color: '#666', border: '1px solid #ECEAE4' }}>
                Cancelar
              </button>
            ) : (
              <button onClick={geocodificarPendientes}
                className="px-3 py-1.5 rounded-lg text-[12px] font-black" style={{ background: '#A6855A', color: '#14110C' }}>
                📍 Ubicar todas (gratis, vía OpenStreetMap)
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: '#E2E0D8' }} />)}
          </div>
        ) : vista === 'mapa' ? (
          <DeudaMapa grupos={grupos} onAbrir={setContratoAbierto} />
        ) : (
          <DeudaListado grupos={grupos} onAbrir={setContratoAbierto} />
        )}
      </div>

      {grupoAbierto && (
        <DeudaFichaModal
          grupo={grupoAbierto}
          onClose={() => setContratoAbierto(null)}
          onUpdateEstado={onUpdateEstado}
          onUpdateImagen={onUpdateImagen}
          onGeocodear={onGeocodear}
        />
      )}

      {wizardOpen && (
        <DeudaImportWizard
          onClose={() => setWizardOpen(false)}
          onImported={() => { fetchPosiciones() }}
        />
      )}
    </div>
  )
}
