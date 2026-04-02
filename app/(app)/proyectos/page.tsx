'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ESTADOS = ['captado','analisis','ofertado','comprado','reforma','venta','cerrado']
const ESTADO_LABEL: Record<string,string> = { captado:'Captado', analisis:'Análisis', ofertado:'Ofertado', comprado:'Comprado', reforma:'Reforma', venta:'Venta', cerrado:'Cerrado' }
const ESTADO_COLOR: Record<string,string> = { captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B', comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', cerrado:'#22C55E' }

type Proyecto = { id: string; nombre: string; ciudad: string; tipo: string; estado: string; porcentaje_hasu: number; socio_nombre: string | null; avance_reforma: number; precio_compra: number | null; precio_venta_estimado: number | null }

export default function ProyectosPage() {
  const router = useRouter()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('proyectos').select('id,nombre,ciudad,tipo,estado,porcentaje_hasu,socio_nombre,avance_reforma,precio_compra,precio_venta_estimado')
      .order('created_at', { ascending: false })
      .then(({ data }) => { setProyectos(data || []); setLoading(false) })
  }, [])

  const activos = proyectos.filter(p => ['comprado','reforma','venta'].includes(p.estado))
  const pipeline = proyectos.filter(p => ['captado','analisis','ofertado'].includes(p.estado))

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">Proyectos</div>
        <button onClick={() => router.push('/bot')}
          className="text-sm font-bold px-3 py-1.5 rounded-xl" style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>+ Nuevo</button>
      </div>

      {/* Pipeline */}
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }} className="rounded-2xl mb-4 overflow-hidden">
        <div className="px-4 pt-4 pb-1">
          <div className="font-black text-[15px] text-white mb-0.5">Pipeline</div>
          <div className="text-xs font-medium" style={{ color: '#888' }}>Ciclo de vida de cada inmueble</div>
        </div>
        <div className="flex items-center overflow-x-auto px-4 py-4 gap-0">
          {ESTADOS.map((est, i) => {
            const hasProj = proyectos.some(p => p.estado === est)
            const isActive = ['comprado','reforma','venta'].includes(est)
            return (
              <div key={est} className="flex items-center flex-shrink-0">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: isActive ? `${ESTADO_COLOR[est]}20` : hasProj ? 'rgba(255,255,255,0.06)' : '#1E1E1E',
                      border: `1.5px solid ${isActive ? ESTADO_COLOR[est] : hasProj ? 'rgba(255,255,255,0.2)' : '#333'}`,
                      color: isActive ? ESTADO_COLOR[est] : hasProj ? '#fff' : '#555',
                    }}>
                    {isActive ? '●' : hasProj ? '✓' : '○'}
                  </div>
                  <div className="text-[10px] font-bold text-center" style={{ color: isActive ? ESTADO_COLOR[est] : '#555', maxWidth: 44, lineHeight: 1.3 }}>
                    {ESTADO_LABEL[est]}
                  </div>
                </div>
                {i < ESTADOS.length - 1 && (
                  <div className="w-4 h-[1.5px] flex-shrink-0 mb-4" style={{ background: isActive ? ESTADO_COLOR[est] : '#333' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Activos */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-24 rounded-2xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : activos.length === 0 && pipeline.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#555' }}>
          <div className="text-4xl mb-3">🏠</div>
          <div className="text-sm font-semibold">No hay proyectos todavía</div>
          <div className="text-xs mt-1">Usá el bot para crear el primero</div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-[15px] text-white">Proyectos activos</div>
            <button onClick={() => router.push('/bot')} className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Nuevo vía bot</button>
          </div>

          {activos.map(p => (
            <button key={p.id} onClick={() => router.push(`/proyectos/${p.id}`)}
              className="w-full text-left rounded-2xl mb-2.5 overflow-hidden transition-transform active:scale-[0.99]"
              style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="p-4 flex gap-3">
                <div className="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                  style={{ background: 'rgba(242,110,31,0.18)' }}>🏠</div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-base text-white leading-tight">{p.nombre}</div>
                  <div className="text-xs font-medium mt-1 mb-2" style={{ color: '#888' }}>📍 {p.ciudad || '—'}</div>
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>
                      {p.porcentaje_hasu < 100 ? `JV ${p.porcentaje_hasu}%` : '100% HASU'}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${ESTADO_COLOR[p.estado]}20`, color: ESTADO_COLOR[p.estado] }}>
                      {ESTADO_LABEL[p.estado]}
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="font-black text-[17px]" style={{ color: '#F26E1F' }}>
                    {p.precio_venta_estimado ? `€${(p.precio_venta_estimado/1000).toFixed(0)}k` : '—'}
                  </div>
                  <div className="text-[11px] font-medium mt-1" style={{ color: '#888' }}>venta est.</div>
                </div>
              </div>
              {p.estado === 'reforma' && (
                <div className="px-4 pb-4">
                  <div className="flex justify-between text-xs font-bold mb-1.5" style={{ color: '#888' }}>
                    <span>Reforma</span><span style={{ color: '#F26E1F' }}>{p.avance_reforma || 0}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#282828' }}>
                    <div className="h-full rounded-full" style={{ width: `${p.avance_reforma || 0}%`, background: '#F26E1F' }} />
                  </div>
                </div>
              )}
            </button>
          ))}

          {pipeline.length > 0 && (
            <>
              <div className="font-black text-[15px] text-white mb-3 mt-2">En pipeline</div>
              {pipeline.map(p => (
                <button key={p.id} onClick={() => router.push(`/proyectos/${p.id}`)}
                  className="w-full text-left rounded-2xl mb-2.5 p-4 flex gap-3 opacity-60 transition-opacity active:opacity-40"
                  style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: '#282828' }}>🏠</div>
                  <div className="flex-1">
                    <div className="font-black text-base text-white">{p.nombre}</div>
                    <div className="text-xs font-medium mt-1" style={{ color: '#888' }}>📍 {p.ciudad || '—'}</div>
                    <div className="flex gap-1.5 mt-2">
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#282828', color: '#888' }}>
                        {ESTADO_LABEL[p.estado]}
                      </span>
                    </div>
                  </div>
                  {p.precio_compra && (
                    <div className="text-right flex-shrink-0">
                      <div className="font-black text-[17px] text-white">€{(p.precio_compra/1000).toFixed(0)}k</div>
                      <div className="text-[11px] font-medium mt-1" style={{ color: '#888' }}>precio</div>
                    </div>
                  )}
                </button>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
