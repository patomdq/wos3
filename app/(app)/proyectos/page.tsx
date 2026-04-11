'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser, canAccessProject } from '@/lib/user-context'

const ESTADOS = ['captado','analisis','ofertado','comprado','reforma','venta','cerrado']
const ESTADO_LABEL: Record<string,string> = { captado:'Captado', analisis:'Análisis', ofertado:'Ofertado', comprado:'Comprado', reforma:'Reforma', venta:'Venta', cerrado:'Cerrado' }
const ESTADO_COLOR: Record<string,string> = { captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B', comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', cerrado:'#22C55E' }
const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

type Proyecto = {
  id: string; nombre: string; direccion?: string; ciudad: string; tipo: string; estado: string
  porcentaje_hasu: number; socio_nombre: string | null; avance_reforma: number
  precio_compra: number | null; precio_venta_estimado: number | null; precio_venta_real: number | null
  precio_venta_conservador: number | null; precio_venta_realista: number | null; precio_venta_optimista: number | null
  valor_total_operacion: number | null; inversion_hasu: number | null
  fecha_compra: string | null; fecha_salida_estimada: string | null
}

function calcSemaforo(p: Proyecto, gastos: number): 'verde' | 'naranja' | 'rojo' {
  const presupuesto = p.valor_total_operacion || 0
  const hoy = new Date()
  const finEst = p.fecha_salida_estimada ? new Date(p.fecha_salida_estimada) : null
  const diasRetraso = finEst && finEst < hoy ? Math.floor((hoy.getTime() - finEst.getTime()) / 86400000) : 0
  const desvPct = presupuesto > 0 ? ((gastos - presupuesto) / presupuesto) * 100 : 0
  if (diasRetraso > 30 || desvPct > 20) return 'rojo'
  if (diasRetraso > 0 || desvPct > 10) return 'naranja'
  return 'verde'
}

const SEM_CFG = {
  verde:   { color: '#22C55E', bg: 'rgba(34,197,94,0.12)',   label: 'Dentro de presupuesto y plazo' },
  naranja: { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)',  label: 'Desviación de presupuesto >10%' },
  rojo:    { color: '#EF4444', bg: 'rgba(239,68,68,0.12)',   label: 'Retraso >30 días o desviación >20%' },
}

export default function ProyectosPage() {
  const router = useRouter()
  const user = useUser()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [gastosMap, setGastosMap] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('proyectos')
        .select('id,nombre,direccion,ciudad,tipo,estado,porcentaje_hasu,socio_nombre,avance_reforma,precio_compra,precio_venta_estimado,precio_venta_real,precio_venta_conservador,precio_venta_realista,precio_venta_optimista,valor_total_operacion,inversion_hasu,fecha_compra,fecha_salida_estimada')
        .order('created_at', { ascending: false }),
      supabase.from('movimientos').select('proyecto_id,monto,tipo'),
    ]).then(([p, m]) => {
      setProyectos(p.data || [])
      const map: Record<string, number> = {}
      ;(m.data || []).forEach((mov: any) => {
        if (mov.tipo === 'Gasto' || mov.monto < 0) {
          map[mov.proyecto_id] = (map[mov.proyecto_id] || 0) + Math.abs(mov.monto)
        }
      })
      setGastosMap(map)
      setLoading(false)
    })
  }, [])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const deleteProyecto = async (p: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}"? Esta acción no se puede deshacer.`)) return
    const res = await fetch(`/api/proyectos/${p.id}`, { method: 'DELETE' })
    if (res.ok) setProyectos(prev => prev.filter(x => x.id !== p.id))
    else alert('Error al eliminar el proyecto.')
  }

  const visibles = proyectos.filter(p => canAccessProject(user?.permisos ?? null, p.id))
  const activos  = visibles.filter(p => ['comprado','reforma','venta'].includes(p.estado))
  const pipeline = visibles.filter(p => ['captado','analisis','ofertado'].includes(p.estado))

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">Proyectos</div>
        <button onClick={() => router.push('/bot')}
          className="text-sm font-bold px-3 py-1.5 rounded-xl" style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>+ Nuevo</button>
      </div>

      {/* Dashboard */}
      {(() => {
        const capitalTotal   = activos.reduce((s, p) => s + (p.inversion_hasu || p.precio_compra || 0), 0)
        const benefTotal     = activos.reduce((s, p) => {
          const venta = p.precio_venta_realista || p.precio_venta_estimado || 0
          const inv   = p.valor_total_operacion || p.precio_compra || 0
          return s + (venta - inv)
        }, 0)
        const roisValidos    = activos.filter(p => {
          const inv = p.valor_total_operacion || p.precio_compra || 0
          return inv > 0
        })
        const roiMedio       = roisValidos.length > 0
          ? roisValidos.reduce((s, p) => {
              const venta = p.precio_venta_realista || p.precio_venta_estimado || 0
              const inv   = p.valor_total_operacion || p.precio_compra || 0
              return s + ((venta - inv) / inv * 100)
            }, 0) / roisValidos.length
          : null
        const enReforma      = activos.filter(p => p.estado === 'reforma')
        const avanceMedio    = enReforma.length > 0
          ? enReforma.reduce((s, p) => s + (p.avance_reforma || 0), 0) / enReforma.length
          : null

        const cards = [
          {
            icon: '🏠', label: 'Proyectos activos',
            value: activos.length.toString(),
            sub: pipeline.length > 0 ? `+ ${pipeline.length} en pipeline` : 'En cartera',
            color: '#F26E1F', bg: 'rgba(242,110,31,0.12)',
          },
          {
            icon: '💰', label: 'Capital HASU',
            value: capitalTotal > 0 ? fmt(capitalTotal) : '—',
            sub: `${activos.length} proyecto${activos.length !== 1 ? 's' : ''}`,
            color: '#60A5FA', bg: 'rgba(96,165,250,0.10)',
          },
          {
            icon: '📈', label: 'Beneficio est.',
            value: benefTotal !== 0 ? fmt(benefTotal) : '—',
            sub: 'Escenario realista',
            color: benefTotal >= 0 ? '#22C55E' : '#EF4444',
            bg: benefTotal >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)',
          },
          {
            icon: '⚡', label: roiMedio !== null ? 'ROI medio' : enReforma.length > 0 ? 'Avance medio' : 'ROI medio',
            value: roiMedio !== null
              ? `${roiMedio >= 0 ? '+' : ''}${roiMedio.toFixed(1)}%`
              : avanceMedio !== null
                ? `${Math.round(avanceMedio)}%`
                : '—',
            sub: roiMedio !== null ? 'Sobre inversión total' : enReforma.length > 0 ? 'Obras en curso' : 'Sin datos aún',
            color: roiMedio !== null ? (roiMedio >= 0 ? '#22C55E' : '#EF4444') : '#a78bfa',
            bg: roiMedio !== null ? (roiMedio >= 0 ? 'rgba(34,197,94,0.10)' : 'rgba(239,68,68,0.10)') : 'rgba(167,139,250,0.10)',
          },
        ]

        return (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {cards.map(c => (
              <div key={c.label} className="rounded-2xl p-4 flex flex-col gap-2"
                style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex items-center justify-between">
                  <div className="text-xl">{c.icon}</div>
                  <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                </div>
                <div className="font-black text-[22px] leading-none" style={{ color: c.color }}>{c.value}</div>
                <div>
                  <div className="text-[12px] font-black text-white">{c.label}</div>
                  <div className="text-[10px] font-medium mt-0.5" style={{ color: '#666' }}>{c.sub}</div>
                </div>
                {c.label === 'Avance medio' && avanceMedio !== null && (
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${avanceMedio}%`, background: c.color }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      })()}

      {/* Cards */}
      {loading ? (
        <div className="space-y-2">
          {[1,2].map(i => <div key={i} className="h-28 rounded-2xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : activos.length === 0 && pipeline.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#555' }}>
          <div className="text-4xl mb-3">🏠</div>
          <div className="text-sm font-semibold">No hay proyectos todavía</div>
          <div className="text-xs mt-1">Usá el bot para crear el primero</div>
        </div>
      ) : (
        <>
          {activos.length > 0 && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="font-black text-[15px] text-white">Proyectos activos</div>
                <button onClick={() => router.push('/bot')} className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Nuevo vía bot</button>
              </div>

              {activos.map(p => {
                const isExp = expanded.has(p.id)
                const gastos = gastosMap[p.id] || 0
                const inversion = p.valor_total_operacion || p.precio_compra || 0
                const ventaEst = p.precio_venta_estimado || 0

                // Usar escenarios almacenados si existen, sino calcular automáticamente desde precio_venta_estimado
                const escenarios = [
                  { label: 'Conservador', stored: p.precio_venta_conservador, mult: 0.90, color: '#888' },
                  { label: 'Realista',    stored: p.precio_venta_realista,    mult: 1.00, color: '#F26E1F' },
                  { label: 'Optimista',   stored: p.precio_venta_optimista,   mult: 1.10, color: '#22C55E' },
                ].map(s => {
                  const venta    = s.stored ?? (ventaEst * s.mult)
                  const benef    = venta - inversion
                  const roi      = inversion > 0 ? (benef / inversion) * 100 : 0
                  return { label: s.label, color: s.color, venta, benef, roi }
                })

                const roiReal = escenarios[1].roi

                const hoy = new Date()
                const fechaCompra = p.fecha_compra ? new Date(p.fecha_compra) : null
                const fechaFin    = p.fecha_salida_estimada ? new Date(p.fecha_salida_estimada) : null
                const diasDesde   = fechaCompra ? Math.floor((hoy.getTime() - fechaCompra.getTime()) / 86400000) : null
                const durMeses    = fechaCompra && fechaFin
                  ? Math.round((fechaFin.getTime() - fechaCompra.getTime()) / (30.44 * 86400000))
                  : null

                const sem    = calcSemaforo(p, gastos)
                const semCfg = SEM_CFG[sem]

                return (
                  <div key={p.id} className="rounded-2xl mb-2.5 overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>

                    {/* ── COMPACT ── */}
                    <div className="p-4">
                      <div className="flex gap-3">
                        <div className="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(242,110,31,0.18)' }}>🏠</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-base text-white leading-tight">{p.nombre}</div>
                          <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>
                            📍 {p.direccion || p.ciudad || '—'}
                          </div>
                          <div className="flex gap-1.5 flex-wrap mt-1.5">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>
                              {p.porcentaje_hasu < 100 ? `JV ${p.porcentaje_hasu}%` : '100% HASU'}
                            </span>
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${ESTADO_COLOR[p.estado]}20`, color: ESTADO_COLOR[p.estado] }}>
                              {ESTADO_LABEL[p.estado]}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <div className="font-black text-[18px]" style={{ color: roiReal >= 0 ? '#22C55E' : '#EF4444' }}>
                            {ventaEst ? `${roiReal >= 0 ? '+' : ''}${roiReal.toFixed(1)}%` : '—'}
                          </div>
                          <div className="text-[11px] font-medium" style={{ color: '#888' }}>ROI est.</div>
                          <button onClick={e => deleteProyecto(p, e)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm mt-1"
                            style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                        </div>
                      </div>

                      {/* Barra reforma */}
                      <div className="mt-3">
                        <div className="flex justify-between text-xs font-bold mb-1.5" style={{ color: '#888' }}>
                          <span>Avance reforma</span>
                          <span style={{ color: '#F26E1F' }}>{p.avance_reforma || 0}%</span>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#282828' }}>
                          <div className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${p.avance_reforma || 0}%`, background: '#F26E1F' }} />
                        </div>
                      </div>
                    </div>

                    {/* ── EXPANDED ── */}
                    <div style={{
                      maxHeight: isExp ? '900px' : '0',
                      overflow: 'hidden',
                      transition: 'max-height 0.38s cubic-bezier(0.4,0,0.2,1)',
                    }}>
                      <div className="px-4 pb-4 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>

                        {/* Escenarios */}
                        <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#888' }}>Escenarios de venta</div>
                        <div className="grid grid-cols-3 gap-1.5 mb-3">
                          {escenarios.map(s => (
                            <div key={s.label} className="rounded-xl p-2.5 text-center" style={{ background: '#1E1E1E', border: `1px solid ${s.color}30` }}>
                              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: s.color }}>{s.label}</div>
                              <div className="font-black text-[13px] text-white leading-tight">{fmt(s.venta)}</div>
                              <div className="text-[11px] font-semibold mt-0.5" style={{ color: '#aaa' }}>{s.benef >= 0 ? '+' : ''}{fmt(s.benef)}</div>
                              <div className="text-[11px] font-bold mt-0" style={{ color: s.color }}>
                                {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}% ROI
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Financiero */}
                        <div className="grid grid-cols-3 gap-1.5 mb-3">
                          {[
                            { l: 'Inv. total',    v: inversion ? fmt(inversion) : '—', c: '#fff' },
                            { l: 'Venta obj.',    v: ventaEst  ? fmt(ventaEst)  : '—', c: '#22C55E' },
                            { l: 'Benef. real.',  v: ventaEst  ? (escenarios[1].benef >= 0 ? '+' : '') + fmt(escenarios[1].benef) : '—', c: escenarios[1].benef >= 0 ? '#22C55E' : '#EF4444' },
                          ].map(k => (
                            <div key={k.l} className="rounded-xl p-2.5" style={{ background: '#1E1E1E' }}>
                              <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#666' }}>{k.l}</div>
                              <div className="font-black text-[13px] leading-tight" style={{ color: k.c }}>{k.v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Fechas */}
                        <div className="grid grid-cols-2 gap-1.5 mb-3">
                          <div className="rounded-xl p-2.5" style={{ background: '#1E1E1E' }}>
                            <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#666' }}>F. compra · Duración</div>
                            <div className="text-sm font-bold text-white">
                              {p.fecha_compra
                                ? new Date(p.fecha_compra).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})
                                : '—'}
                              {durMeses !== null ? ` · ${durMeses}m` : ''}
                            </div>
                          </div>
                          <div className="rounded-xl p-2.5" style={{ background: '#1E1E1E' }}>
                            <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#666' }}>Días desde compra</div>
                            <div className="text-sm font-bold text-white">{diasDesde !== null ? `${diasDesde} días` : '—'}</div>
                          </div>
                          <div className="rounded-xl p-2.5 col-span-2" style={{ background: '#1E1E1E' }}>
                            <div className="text-[9px] font-bold uppercase tracking-wide mb-1" style={{ color: '#666' }}>Fecha estimada fin de obra</div>
                            <div className="text-sm font-bold text-white">
                              {p.fecha_salida_estimada
                                ? new Date(p.fecha_salida_estimada).toLocaleDateString('es-ES',{day:'2-digit',month:'long',year:'numeric'})
                                : '—'}
                            </div>
                          </div>
                        </div>

                        {/* Semáforo */}
                        <div className="flex items-center gap-3 rounded-xl p-3 mb-4" style={{ background: semCfg.bg, border: `1px solid ${semCfg.color}33` }}>
                          <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: semCfg.color, boxShadow: `0 0 8px ${semCfg.color}80` }} />
                          <div>
                            <div className="text-sm font-black" style={{ color: semCfg.color }}>
                              {sem === 'verde' ? '✓ Proyecto saludable' : sem === 'naranja' ? '⚠ Atención' : '✕ Acción urgente'}
                            </div>
                            <div className="text-[11px] font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{semCfg.label}</div>
                          </div>
                        </div>

                        {/* Abrir completo */}
                        <button onClick={() => router.push(`/proyectos/${p.id}`)}
                          className="w-full py-3.5 rounded-xl text-sm font-black text-white"
                          style={{ background: '#F26E1F' }}>
                          Abrir proyecto completo →
                        </button>
                      </div>
                    </div>

                    {/* ── VER MÁS / MENOS ── */}
                    <button onClick={() => toggle(p.id)}
                      className="w-full py-2.5 text-xs font-black tracking-wide text-center transition-colors"
                      style={{ borderTop: '1px solid rgba(255,255,255,0.07)', color: isExp ? 'rgba(255,255,255,0.3)' : '#F26E1F' }}>
                      {isExp ? 'Ver menos ↑' : 'Ver más ↓'}
                    </button>
                  </div>
                )
              })}
            </>
          )}

          {pipeline.length > 0 && (
            <>
              <div className="font-black text-[15px] text-white mb-3 mt-2">En pipeline</div>
              {pipeline.map(p => (
                <div key={p.id} className="rounded-2xl mb-2.5 p-4 flex gap-3 opacity-60"
                  style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div onClick={() => router.push(`/proyectos/${p.id}`)} className="flex gap-3 flex-1 min-w-0 cursor-pointer">
                    <div className="w-[46px] h-[46px] rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: '#282828' }}>🏠</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-base text-white">{p.nombre}</div>
                      <div className="text-xs font-medium mt-1" style={{ color: '#888' }}>📍 {p.ciudad || '—'}</div>
                      <div className="flex gap-1.5 mt-2">
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#282828', color: '#888' }}>
                          {ESTADO_LABEL[p.estado]}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {p.precio_compra && (
                      <>
                        <div className="font-black text-[17px] text-white">€{(p.precio_compra/1000).toFixed(0)}k</div>
                        <div className="text-[11px] font-medium" style={{ color: '#888' }}>precio</div>
                      </>
                    )}
                    <button onClick={e => deleteProyecto(p, e)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-sm mt-auto"
                      style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
                  </div>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </div>
  )
}
