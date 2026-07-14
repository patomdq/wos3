'use client'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DeudaFiltros, { FILTROS_INICIALES, DeudaFiltrosState } from '@/components/DeudaFiltros'
import DeudaListado from '@/components/DeudaListado'
import DeudaImportWizard from '@/components/DeudaImportWizard'
import { DeudaPosicion, ESTADO_INTERNO_CFG, calcRatioRiesgoCargas } from '@/lib/deuda-schema'

const ESTADO_TABS = ['todos', ...Object.keys(ESTADO_INTERNO_CFG)]

const unicos = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b, 'es'))

export default function DeudaPage() {
  const [posiciones, setPosiciones] = useState<DeudaPosicion[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('todos')
  const [filtros, setFiltros] = useState<DeudaFiltrosState>(FILTROS_INICIALES)

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
              <p className="text-[12px] font-semibold mt-1" style={{ color: 'rgba(255,255,255,0.75)' }}>Posiciones de deuda / NPL — brokers y servicers</p>
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
        <div className="flex gap-2 mb-4 overflow-x-auto -mx-5 px-5">
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

        <DeudaFiltros
          filtros={filtros} setFiltros={setFiltros}
          provincias={provincias} ciudades={ciudades} brokers={brokers}
          tiposColateral={tiposColateral} subtiposColateral={subtiposColateral}
        />

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: '#E2E0D8' }} />)}
          </div>
        ) : (
          <DeudaListado posiciones={filtradas} onUpdateEstado={onUpdateEstado} />
        )}
      </div>

      {wizardOpen && (
        <DeudaImportWizard
          onClose={() => setWizardOpen(false)}
          onImported={() => { fetchPosiciones() }}
        />
      )}
    </div>
  )
}
