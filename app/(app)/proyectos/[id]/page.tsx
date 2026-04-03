'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const TABS = ['Finanzas','Reforma','Pendientes','Bitácora','Inversor','Docs']
const ESTADO_COLOR: Record<string,string> = { captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B', comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', cerrado:'#22C55E' }
const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

export default function ProyectoDetalle() {
  const { id } = useParams()
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [proyecto, setProyecto] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [partidas, setPartidas] = useState<any[]>([])
  const [tareas, setTareas] = useState<any[]>([])
  const [bitacora, setBitacora] = useState<any[]>([])
  const [inversor, setInversor] = useState<any>(null)
  const [docs, setDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // Movimientos table
  const [tablaExpandida, setTablaExpandida] = useState(false)

  // Partida form
  const [showPartidaForm, setShowPartidaForm] = useState(false)
  const [nuevaPartida, setNuevaPartida] = useState({ nombre: '', categoria: 'obra', presupuesto: '', ejecutado: '' })
  const [savingPartida, setSavingPartida] = useState(false)

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

  const guardarPartida = async () => {
    if (!nuevaPartida.nombre.trim()) return
    setSavingPartida(true)
    const { data, error } = await supabase.from('partidas_reforma').insert([{
      proyecto_id: id,
      nombre: nuevaPartida.nombre,
      categoria: nuevaPartida.categoria,
      presupuesto: parseFloat(nuevaPartida.presupuesto) || 0,
      ejecutado: parseFloat(nuevaPartida.ejecutado) || 0,
      orden: partidas.length + 1,
    }]).select().single()
    if (!error && data) setPartidas(p => [...p, data])
    setShowPartidaForm(false)
    setNuevaPartida({ nombre: '', categoria: 'obra', presupuesto: '', ejecutado: '' })
    setSavingPartida(false)
  }

  if (loading) return (
    <div className="p-4">
      <div className="h-8 w-32 rounded-lg animate-pulse mb-4" style={{ background: '#141414' }} />
      <div className="h-32 rounded-2xl animate-pulse" style={{ background: '#141414' }} />
    </div>
  )
  if (!proyecto) return <div className="p-4 text-center" style={{ color: '#888' }}>Proyecto no encontrado</div>

  const ingresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + (m.monto || 0), 0)
  const gastos = movimientos.filter(m => m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
  const presupuestoTotal = partidas.reduce((s, p) => s + (p.presupuesto || 0), 0)
  const ejecutadoTotal = partidas.reduce((s, p) => s + (p.ejecutado || 0), 0)

  const tareasPrioridad = (p: string) => tareas.filter(t => t.prioridad === p && t.estado !== 'Completada')
  const tareasHechas = tareas.filter(t => t.estado === 'Completada')

  return (
    <div className="p-4">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 mb-4 text-sm font-semibold" style={{ color: '#888' }}>
        ← Volver
      </button>

      {/* Hero */}
      <div className="rounded-2xl p-4 mb-4 relative overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="absolute right-[-20px] top-[-20px] w-[100px] h-[100px] rounded-full" style={{ background: 'rgba(242,110,31,0.08)' }} />
        <div className="flex gap-3 items-start mb-4 relative">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{ background: 'rgba(242,110,31,0.18)' }}>🏠</div>
          <div>
            <div className="font-black text-[22px] text-white leading-tight tracking-tight">{proyecto.nombre}</div>
            <div className="text-xs font-medium mt-1" style={{ color: '#888' }}>
              {proyecto.porcentaje_hasu < 100 ? `JV ${100 - proyecto.porcentaje_hasu}%/${proyecto.porcentaje_hasu}% · ${proyecto.socio_nombre || '—'}` : '100% HASU'} · {proyecto.ciudad || '—'}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 relative">
          {[
            { v: proyecto.estado ? proyecto.estado.charAt(0).toUpperCase() + proyecto.estado.slice(1) : '—', l: 'Estado', c: ESTADO_COLOR[proyecto.estado] },
            { v: `${proyecto.avance_reforma || 0}%`, l: 'Avance', c: '#fff' },
            { v: proyecto.precio_venta_estimado ? fmt(proyecto.precio_venta_estimado) : '—', l: 'Venta est.', c: '#22C55E' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3 text-center" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="font-black text-[15px]" style={{ color: k.c }}>{k.v}</div>
              <div className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: '#888' }}>{k.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto mb-4 -mx-4 px-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className="flex-shrink-0 px-4 py-2.5 text-sm font-bold whitespace-nowrap"
            style={{ color: tab === i ? '#F26E1F' : '#888', borderBottom: tab === i ? '2.5px solid #F26E1F' : '2.5px solid transparent', marginBottom: -1 }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab: Finanzas */}
      {tab === 0 && (
        <div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ingresos</div>
              <div className="font-black text-[22px] text-white">{fmt(ingresos)}</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Gastos</div>
              <div className="font-black text-[22px]" style={{ color: '#EF4444' }}>{fmt(gastos)}</div>
            </div>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="p-4 pb-0 flex items-center justify-between">
              <div className="font-black text-[15px] text-white">Movimientos <span style={{ color: '#555', fontSize: 13 }}>({movimientos.length})</span></div>
              <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Agregar</span>
            </div>
            {movimientos.length === 0 ? (
              <div className="p-4 text-sm text-center" style={{ color: '#555' }}>Sin movimientos registrados</div>
            ) : (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: '#1E1E1E' }}>
                        {(tablaExpandida
                          ? ['Fecha','Concepto','Categoría','Proveedor','Factura','Cuenta','Importe']
                          : ['Fecha','Concepto','Importe']
                        ).map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap"
                            style={{ color: '#888', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.slice(0, tablaExpandida ? 999 : 20).map((m, i) => (
                        <tr key={m.id} style={{ borderBottom: i < movimientos.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                          <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: '#888' }}>{m.fecha?.slice(5)}</td>
                          <td className="px-3 py-2.5 text-sm font-medium text-white" style={{ maxWidth: tablaExpandida ? 180 : 'unset' }}>
                            <div className="truncate">{m.concepto}</div>
                          </td>
                          {tablaExpandida && <>
                            <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: '#888' }}>{m.categoria || '—'}</td>
                            <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: '#888' }}>{m.proveedor || '—'}</td>
                            <td className="px-3 py-2.5 text-xs font-mono whitespace-nowrap" style={{ color: '#555' }}>{m.numero_factura || '—'}</td>
                            <td className="px-3 py-2.5 text-xs font-medium whitespace-nowrap" style={{ color: '#555', maxWidth: 120 }}>
                              <div className="truncate">{m.cuenta || '—'}</div>
                            </td>
                          </>}
                          <td className="px-3 py-2.5 text-xs font-black font-mono whitespace-nowrap" style={{ color: m.tipo === 'Ingreso' || m.monto > 0 ? '#22C55E' : '#EF4444' }}>
                            {m.monto > 0 ? '+' : ''}{fmt(m.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button onClick={() => setTablaExpandida(!tablaExpandida)}
                  className="w-full py-3 text-xs font-bold text-center"
                  style={{ color: '#F26E1F', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  {tablaExpandida ? 'Ver compacto ↑' : `Ver completo (fecha, concepto, categoría, proveedor, factura, cuenta) ↓`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Reforma */}
      {tab === 1 && (
        <div>
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Presupuesto</div>
              <div className="font-black text-[22px] text-white">{fmt(presupuestoTotal)}</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ejecutado</div>
              <div className="font-black text-[22px]" style={{ color: '#F26E1F' }}>{fmt(ejecutadoTotal)}</div>
              <div className="text-xs font-medium mt-1" style={{ color: '#888' }}>resta {fmt(Math.max(0, presupuestoTotal - ejecutadoTotal))}</div>
            </div>
          </div>
          <div className="rounded-2xl p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between mb-4">
              <div className="font-black text-[15px] text-white">Partidas</div>
              <button onClick={() => setShowPartidaForm(true)} className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Partida</button>
            </div>
            {partidas.length === 0 ? (
              <div className="text-sm text-center py-6" style={{ color: '#555' }}>Sin partidas de reforma</div>
            ) : partidas.map((p, i) => {
              const pct = p.presupuesto > 0 ? Math.round((p.ejecutado / p.presupuesto) * 100) : 0
              const col = pct >= 100 ? '#22C55E' : pct > 50 ? '#F59E0B' : '#EF4444'
              return (
                <div key={p.id} className="py-3" style={{ borderBottom: i < partidas.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-semibold text-white">{p.nombre}</span>
                    <span className="text-sm font-black font-mono" style={{ color: col }}>{pct}%{pct >= 100 ? ' ✓' : ''}</span>
                  </div>
                  <div className="text-xs font-medium mb-1.5" style={{ color: '#888' }}>
                    Pres. {fmt(p.presupuesto || 0)} · Ejec. {fmt(p.ejecutado || 0)}
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: '#282828' }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: col }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tab: Pendientes */}
      {tab === 2 && (
        <div>
          {['Alta','Media','Baja'].map(p => {
            const ts = tareasPrioridad(p)
            if (ts.length === 0) return null
            return (
              <div key={p}>
                <div className="flex items-center justify-between mb-2.5">
                  <div className="font-black text-[15px] text-white">{p} prioridad</div>
                  <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Tarea</span>
                </div>
                {ts.map(t => (
                  <div key={t.id} className="rounded-xl p-3.5 mb-2 flex gap-2.5 items-start" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: p === 'Alta' ? '#EF4444' : p === 'Media' ? '#F59E0B' : '#888' }} />
                    <div>
                      <div className="text-sm font-semibold text-white">{t.titulo}</div>
                      <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{t.asignado_a || 'Sin asignar'}{t.fecha_limite ? ` · ${t.fecha_limite}` : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
          {tareasHechas.length > 0 && (
            <>
              <div className="font-black text-[15px] mb-2.5 mt-2" style={{ color: '#22C55E' }}>Completado ✓</div>
              {tareasHechas.map(t => (
                <div key={t.id} className="rounded-xl p-3.5 mb-2 flex gap-2.5 items-start opacity-40" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#22C55E' }} />
                  <div className="text-sm font-semibold text-white">{t.titulo}</div>
                </div>
              ))}
            </>
          )}
          {tareas.length === 0 && <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin tareas registradas</div>}
        </div>
      )}

      {/* Tab: Bitácora */}
      {tab === 3 && (
        <div className="rounded-2xl p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center justify-between mb-4">
            <div className="font-black text-[15px] text-white">Historial</div>
            <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Entrada</span>
          </div>
          {bitacora.length === 0 ? (
            <div className="text-center py-6 text-sm" style={{ color: '#555' }}>Sin entradas en bitácora</div>
          ) : (
            <div className="pl-5 relative">
              <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#282828' }} />
              {bitacora.map((b) => (
                <div key={b.id} className="relative mb-4">
                  <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full" style={{ background: '#F26E1F', border: '2px solid #0A0A0A' }} />
                  <div className="text-[11px] font-bold mb-1 font-mono tracking-wide" style={{ color: '#888' }}>
                    {new Date(b.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
                  </div>
                  <div className="text-sm font-medium text-white leading-relaxed">{b.contenido}</div>
                  <div className="text-xs font-bold mt-1" style={{ color: '#F26E1F' }}>{b.autor}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Inversor */}
      {tab === 4 && (
        <div>
          {!inversor ? (
            <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin inversor asociado a este proyecto</div>
          ) : (
            <>
              <div className="rounded-2xl p-4 mb-3" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="font-black text-base text-white mb-0.5">{inversor.inversores?.nombre || '—'}</div>
                <div className="text-xs font-medium mb-4" style={{ color: '#888' }}>Portal inversor · {inversor.participacion}% participación</div>
                <div className="flex justify-between">
                  {['Compra','Plan.','Reforma','Comercial','Liquid.'].map((s, i) => (
                    <div key={s} className="flex flex-col items-center gap-1.5">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                        style={{ background: i < 2 ? 'rgba(34,197,94,0.15)' : i === 2 ? 'rgba(242,110,31,0.18)' : '#1E1E1E', border: `1.5px solid ${i < 2 ? '#22C55E' : i === 2 ? '#F26E1F' : '#333'}`, color: i < 2 ? '#22C55E' : i === 2 ? '#F26E1F' : '#555' }}>
                        {i < 2 ? '✓' : i === 2 ? '⚡' : '○'}
                      </div>
                      <div className="text-[9px] font-bold uppercase text-center leading-tight" style={{ color: '#555', maxWidth: 40 }}>{s}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-3">
                <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Capital invertido</div>
                  <div className="font-black text-[22px] text-white">{fmt(inversor.capital_invertido || 0)}</div>
                </div>
                <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Retorno est.</div>
                  <div className="font-black text-[22px]" style={{ color: '#22C55E' }}>{fmt(inversor.retorno_estimado || 0)}</div>
                  <div className="text-xs font-semibold mt-1" style={{ color: '#888' }}>ROI {inversor.roi || 0}%</div>
                </div>
              </div>
              <div className="rounded-2xl p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="font-black text-[15px] text-white mb-3">Escenarios</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { l: 'Conserv.', v: inversor.capital_invertido * 1.35, roi: 35 },
                    { l: 'Realista ★', v: inversor.retorno_estimado, roi: inversor.roi, real: true },
                    { l: 'Optimista', v: inversor.capital_invertido * 1.66, roi: 66 },
                  ].map(s => (
                    <div key={s.l} className="rounded-xl p-3 text-center"
                      style={{ background: s.real ? 'rgba(242,110,31,0.18)' : '#1E1E1E', border: `1px solid ${s.real ? 'rgba(242,110,31,0.35)' : 'rgba(255,255,255,0.08)'}` }}>
                      <div className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: s.real ? '#F26E1F' : '#888' }}>{s.l}</div>
                      <div className="font-black text-[15px]" style={{ color: s.real ? '#F26E1F' : '#fff' }}>{fmt(s.v || 0)}</div>
                      <div className="text-[11px] font-bold mt-1 font-mono" style={{ color: '#22C55E' }}>+{s.roi}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Tab: Docs */}
      {tab === 5 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-[15px] text-white">Documentos</div>
            <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Subir</span>
          </div>
          {docs.length === 0 ? (
            <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin documentos subidos</div>
          ) : docs.map(d => (
            <div key={d.id} className="rounded-xl p-3.5 mb-2 flex gap-3 items-center" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span className="text-xl">📄</span>
              <div>
                <div className="text-sm font-bold text-white">{d.nombre}</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{d.tipo} · {new Date(d.fecha_subida).toLocaleDateString('es-ES')}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Partida form bottom sheet */}
      {showPartidaForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setShowPartidaForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">Nueva partida</div>
              <button onClick={() => setShowPartidaForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Nombre *</label>
                <input type="text" value={nuevaPartida.nombre} placeholder="Ej. Demolición interior"
                  onChange={e => setNuevaPartida(p => ({ ...p, nombre: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                  style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Categoría</label>
                <select value={nuevaPartida.categoria} onChange={e => setNuevaPartida(p => ({ ...p, categoria: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                  style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}>
                  {['obra','materiales','mobiliario','electro','decoracion','otros'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Presupuesto (€)</label>
                  <input type="number" value={nuevaPartida.presupuesto} placeholder="0"
                    onChange={e => setNuevaPartida(p => ({ ...p, presupuesto: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ejecutado (€)</label>
                  <input type="number" value={nuevaPartida.ejecutado} placeholder="0"
                    onChange={e => setNuevaPartida(p => ({ ...p, ejecutado: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }} />
                </div>
              </div>
            </div>
            <button onClick={guardarPartida} disabled={savingPartida || !nuevaPartida.nombre.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background: '#F26E1F' }}>
              {savingPartida ? 'Guardando...' : 'Agregar partida'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
