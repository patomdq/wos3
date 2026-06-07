'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'

const fmt  = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const fmtK = (n: number) => Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(0)}k€` : `${n}€`

const STEPS = ['Compra', 'Planificación', 'Reforma', 'Comercial', 'Liquidación']
const ESTADO_STEP: Record<string, number> = {
  captado: 0, analisis: 0, ofertado: 0,
  comprado: 1, reforma: 2, venta: 3, cerrado: 4, vendido: 5,
}

const ORANGE = '#E8621A'
const GREEN  = '#2D7A4F'
const SAND   = '#C9A96E'
const BG     = '#F5F3EF'
const CARD   = '#FFFFFF'

export default function PortalInversorPage() {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [inversor, setInversor]       = useState<any>(null)
  const [operacion, setOperacion]     = useState<any>(null)
  const [proyecto, setProyecto]       = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [bitacora, setBitacora]       = useState<any[]>([])
  const [loading, setLoading]         = useState(true)
  const [authError, setAuthError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const init = async () => {
      try {
        let session = null
        for (let i = 0; i < 5; i++) {
          const { data } = await supabase.auth.getSession()
          session = data.session
          if (session) break
          if (i < 4) await new Promise(r => setTimeout(r, 600))
        }
        if (cancelled) return
        if (!session) { router.replace('/inversor'); return }

        const { data: roleByUid } = await supabase.from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle()
        const { data: roleByEmail } = !roleByUid ? await supabase.from('user_roles').select('role').eq('email', session.user.email!).maybeSingle() : { data: null }
        const isAdmin = (roleByUid || roleByEmail)?.role === 'admin' || (roleByUid || roleByEmail)?.role === 'pm'

        const { data: invByUid } = await supabase.from('inversores').select('*').eq('user_id', session.user.id).maybeSingle()
        const { data: invByEmail } = !invByUid && session.user.email ? await supabase.from('inversores').select('*').eq('email', session.user.email).maybeSingle() : { data: null }
        const inv = invByUid || invByEmail

        if (cancelled) return
        if (!inv && !isAdmin) { setAuthError(`Tu cuenta (${session.user.email}) no tiene acceso. Contactá a patricio@wallest.pro`); setLoading(false); return }

        const inversorData = inv || { id: null, nombre: session.user.email?.split('@')[0] || 'Admin' }
        setInversor(inversorData)

        if (inversorData.id) {
          const { data: op } = await supabase.from('proyecto_inversores').select('*, proyectos(*)').eq('inversor_id', inversorData.id).single()
          if (op && !cancelled) {
            // Fetch imagen_portada separately in case PostgREST schema cache is stale
            const { data: imgRow } = await supabase.from('proyectos').select('imagen_portada').eq('id', op.proyecto_id).single()
            setOperacion(op)
            setProyecto({ ...op.proyectos, imagen_portada: imgRow?.imagen_portada ?? null })
            const [{ data: movs }, { data: bit }] = await Promise.all([
              supabase.from('movimientos').select('*').eq('proyecto_id', op.proyecto_id).order('fecha', { ascending: false }),
              supabase.from('bitacora').select('*').eq('proyecto_id', op.proyecto_id).order('created_at', { ascending: false }),
            ])
            if (!cancelled) { setMovimientos(movs || []); setBitacora(bit || []) }
          }
        }
        if (!cancelled) setLoading(false)
      } catch { if (!cancelled) router.replace('/inversor') }
    }
    init()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!operacion?.proyecto_id) return
    const pid = operacion.proyecto_id
    const ch = supabase.channel(`portal-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos', filter: `proyecto_id=eq.${pid}` },
        async () => { const { data } = await supabase.from('movimientos').select('*').eq('proyecto_id', pid).order('fecha', { ascending: false }); setMovimientos(data || []) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora', filter: `proyecto_id=eq.${pid}` },
        async () => { const { data } = await supabase.from('bitacora').select('*').eq('proyecto_id', pid).order('created_at', { ascending: false }); setBitacora(data || []) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proyectos', filter: `id=eq.${pid}` },
        (payload) => setProyecto((prev: any) => ({ ...prev, ...payload.new })))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [operacion?.proyecto_id])

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/inversor') }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white" style={{ background: ORANGE }}>W</div>
        <div className="text-sm font-medium animate-pulse" style={{ color: '#AAA' }}>Cargando tu inversión...</div>
      </div>
    </div>
  )

  if (authError) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: BG }}>
      <div className="w-full max-w-sm text-center p-8 rounded-2xl" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
        <div className="font-black text-lg mb-2" style={{ color: '#111' }}>Sin acceso</div>
        <div className="text-sm mb-6" style={{ color: '#888' }}>{authError}</div>
        <button onClick={() => { supabase.auth.signOut(); router.replace('/inversor') }}
          className="w-full py-3 rounded-xl text-sm font-black" style={{ background: BG, color: '#888' }}>Volver</button>
      </div>
    </div>
  )

  // ── Computed ──────────────────────────────────────────────────
  const TABS = ['Resumen', 'Movimientos', 'Bitácora']
  const ingresos = movimientos.filter(m => m.monto > 0 || m.tipo === 'Ingreso').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
  const gastos   = movimientos.filter(m => m.monto < 0 || m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || 0), 0)

  const participacion  = operacion?.participacion || 50
  const capital        = operacion?.capital_invertido || 0
  const inversion      = proyecto?.valor_total_operacion || proyecto?.precio_compra || 0
  const ventaEst       = proyecto?.precio_venta_estimado || 0
  const vendido        = !!proyecto?.precio_venta_real && proyecto.precio_venta_real > 0

  const ventaReal = vendido ? proyecto.precio_venta_real : (proyecto?.precio_venta_realista || ventaEst)
  const benefTotal = ventaReal - inversion
  const roi        = inversion > 0 ? (benefTotal / inversion) * 100 : 0
  const benefInv   = benefTotal * (participacion / 100)
  const currentStep = ESTADO_STEP[proyecto?.estado] ?? 0

  // Datos para gráficos
  const pieData = [
    { name: 'Tu aportación', value: capital, color: ORANGE },
    { name: 'Socio HASU',    value: inversion - capital > 0 ? inversion - capital : 0, color: SAND },
  ]
  const barData = [
    { name: 'Invertido', value: capital, color: ORANGE },
    { name: vendido ? 'Retorno real' : 'Retorno est.', value: Math.max(0, benefInv), color: GREEN },
  ]

  // Escenarios (solo cuando no está vendido)
  const escenarios = vendido ? [] : [
    { label: 'Conserv.',  v: proyecto?.precio_venta_conservador || ventaEst * 0.9,  mult: 0.9  },
    { label: 'Realista',  v: proyecto?.precio_venta_realista    || ventaEst,         mult: 1.0  },
    { label: 'Optimista', v: proyecto?.precio_venta_optimista   || ventaEst * 1.1,  mult: 1.1  },
  ].map(s => {
    const b = (s.v - inversion) * (participacion / 100)
    const r = inversion > 0 ? ((s.v - inversion) / inversion) * 100 : 0
    return { ...s, benefInv: b, roi: r }
  })

  return (
    <div className="min-h-screen" style={{ background: BG, fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Navbar ── */}
      <nav style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)', borderBottom: '1px solid #E8E4DC', position: 'sticky', top: 0, zIndex: 20 }}>
        <div className="max-w-6xl mx-auto px-5 py-3 flex items-center gap-4">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white flex-shrink-0"
            style={{ background: ORANGE }}>W</div>
          <div className="flex-1 min-w-0">
            <span className="font-black text-[13px]" style={{ color: '#111' }}>Wallest</span>
            <span className="mx-1.5 text-[#DDD]">·</span>
            <span className="text-[13px]" style={{ color: '#AAA' }}>Portal de Inversores</span>
          </div>
          <span className="text-xs font-medium hidden sm:block" style={{ color: '#AAA' }}>{inversor?.nombre}</span>
          <button onClick={handleLogout} className="text-xs font-black px-3 py-1.5 rounded-lg"
            style={{ background: BG, border: '1px solid #E8E4DC', color: '#888' }}>Salir</button>
        </div>
      </nav>

      <div className="w-full max-w-[1400px] mx-auto px-4 md:px-8 py-6">
        <div className="lg:grid lg:grid-cols-[1fr_300px] lg:gap-6" style={{ alignItems: 'start' }}>

          {/* ══ CONTENIDO PRINCIPAL ══ */}
          <div className="space-y-4">

            {/* Hero card */}
            <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: '1px solid #E8E4DC', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              {/* Franja superior con degradado / imagen */}
              <div style={proyecto?.imagen_portada ? {
                position: 'relative',
                minHeight: 100,
                padding: '20px 24px 20px',
                backgroundImage: `url(${proyecto.imagen_portada})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              } : {
                position: 'relative',
                minHeight: 100,
                padding: '20px 24px 20px',
                background: `linear-gradient(135deg, ${ORANGE} 0%, #C9A96E 100%)`,
              }}>
                {/* Overlay when image is present */}
                {proyecto?.imagen_portada && (
                  <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, rgba(232,98,26,0.82) 0%, rgba(201,169,110,0.70) 100%)` }} />
                )}
                <div style={{ position: 'relative', zIndex: 1 }} className="flex items-start justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest mb-1 opacity-80 text-white">
                      Joint Venture · {participacion}% participación
                    </div>
                    <h1 className="font-black text-[26px] md:text-[30px] text-white leading-none" style={{ letterSpacing: -1 }}>
                      {proyecto?.nombre || 'Sin proyecto asignado'}
                    </h1>
                    <div className="text-sm mt-1 text-white opacity-75">
                      {proyecto?.ciudad || '—'} · Entrada {operacion?.fecha_entrada || '—'}
                    </div>
                  </div>
                  {vendido && (
                    <div className="px-3 py-1.5 rounded-xl text-xs font-black text-white flex-shrink-0"
                      style={{ background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.3)', backdropFilter: 'blur(8px)' }}>
                      ✓ Vendido
                    </div>
                  )}
                </div>
              </div>

              {/* KPIs */}
              <div className="grid grid-cols-3 divide-x" style={{ borderTop: '1px solid #F0EDE7' }}>
                {[
                  { l: 'Tu inversión', v: fmt(capital), sub: `${participacion}% del capital`, c: '#111' },
                  { l: vendido ? 'Retorno real' : 'Retorno est.', v: `+${fmt(benefInv)}`, sub: 'beneficio neto', c: GREEN },
                  { l: 'ROI', v: `${roi.toFixed(0)}%`, sub: vendido ? '✓ confirmado' : 'estimado', c: vendido ? GREEN : ORANGE },
                ].map(k => (
                  <div key={k.l} className="px-5 py-4 text-center">
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>{k.l}</div>
                    <div className="font-black text-[22px] leading-none" style={{ color: k.c }}>{k.v}</div>
                    <div className="text-[11px] font-medium mt-1" style={{ color: '#AAA' }}>{k.sub}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b" style={{ borderColor: '#E8E4DC' }}>
              {TABS.map((t, i) => (
                <button key={t} onClick={() => setTab(i)}
                  className="px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-colors"
                  style={{
                    color: tab === i ? ORANGE : '#AAA',
                    borderBottom: `2px solid ${tab === i ? ORANGE : 'transparent'}`,
                    marginBottom: -1,
                  }}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Tab 0: RESUMEN ── */}
            {tab === 0 && (
              <div className="space-y-4">

                {/* Gráficos: torta + barras */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                  {/* Torta — composición del capital */}
                  <div className="rounded-2xl p-5" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                    <div className="font-black text-[13px] mb-1" style={{ color: '#111' }}>Composición del capital</div>
                    <div className="text-xs mb-3" style={{ color: '#AAA' }}>Sobre {fmt(inversion)} total invertido</div>
                    <div className="flex items-center gap-4">
                      <ResponsiveContainer width={110} height={110}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={32} outerRadius={50}
                            dataKey="value" strokeWidth={0}>
                            {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: any) => fmt(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-2.5 flex-1">
                        {pieData.map(d => (
                          <div key={d.name} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                            <div>
                              <div className="text-[11px] font-bold" style={{ color: '#111' }}>{fmt(d.value)}</div>
                              <div className="text-[10px]" style={{ color: '#AAA' }}>{d.name}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Barras — inversión vs retorno */}
                  <div className="rounded-2xl p-5" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                    <div className="font-black text-[13px] mb-1" style={{ color: '#111' }}>Tu inversión vs retorno</div>
                    <div className="text-xs mb-3" style={{ color: '#AAA' }}>{vendido ? 'Resultado real' : 'Escenario realista'}</div>
                    <ResponsiveContainer width="100%" height={110}>
                      <BarChart data={barData} barCategoryGap="30%" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="#F0EDE7" />
                        <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                          {barData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Resultado final (vendido) o escenarios */}
                <div className="rounded-2xl p-5" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                  {vendido ? (
                    <>
                      <div className="font-black text-[14px] mb-1" style={{ color: '#111' }}>Resultado final de la operación</div>
                      <div className="text-xs mb-4" style={{ color: '#AAA' }}>Tu {participacion}% sobre {fmt(capital)} aportados</div>
                      <div className="rounded-xl p-5 flex items-center justify-between"
                        style={{ background: 'linear-gradient(135deg,rgba(45,122,79,0.07),rgba(45,122,79,0.03))', border: '1.5px solid rgba(45,122,79,0.18)' }}>
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: GREEN }}>Precio de venta real</div>
                          <div className="font-black text-[32px] leading-none" style={{ color: '#111', letterSpacing: -1 }}>{fmt(proyecto.precio_venta_real)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: GREEN }}>Tu beneficio</div>
                          <div className="font-black text-[32px] leading-none" style={{ color: GREEN, letterSpacing: -1 }}>+{fmt(benefInv)}</div>
                          <div className="font-black text-sm mt-1" style={{ color: GREEN }}>+{roi.toFixed(0)}% ROI</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="font-black text-[14px] mb-1" style={{ color: '#111' }}>Escenarios de venta</div>
                      <div className="text-xs mb-4" style={{ color: '#AAA' }}>Tu {participacion}% sobre {fmt(capital)} aportados</div>
                      <div className="grid grid-cols-3 gap-2.5">
                        {escenarios.map((s, i) => {
                          const isMain = i === 1
                          return (
                            <div key={s.label} className="rounded-xl p-4 text-center"
                              style={{
                                background: isMain ? `rgba(232,98,26,0.07)` : BG,
                                border: `1.5px solid ${isMain ? 'rgba(232,98,26,0.25)' : '#E8E4DC'}`,
                              }}>
                              <div className="text-[10px] font-black uppercase tracking-wide mb-2"
                                style={{ color: isMain ? ORANGE : '#AAA' }}>{s.label}</div>
                              <div className="font-black text-[16px]" style={{ color: '#111' }}>{fmt(s.v)}</div>
                              <div className="font-bold text-sm mt-0.5" style={{ color: s.benefInv >= 0 ? GREEN : '#EF4444' }}>
                                +{fmt(Math.max(0, s.benefInv))}
                              </div>
                              <div className="font-black text-xs" style={{ color: isMain ? ORANGE : '#AAA' }}>+{s.roi.toFixed(0)}% ROI</div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* Nota */}
                <div className="rounded-xl p-4 flex gap-3 items-center"
                  style={{ background: `rgba(232,98,26,0.05)`, border: `1px solid rgba(232,98,26,0.12)` }}>
                  <span className="text-lg">📧</span>
                  <div>
                    <div className="text-sm font-black" style={{ color: '#111' }}>Informe semanal automático</div>
                    <div className="text-xs mt-0.5" style={{ color: '#888' }}>Cada viernes: avance, gastos y próximos pasos.</div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tab 1: MOVIMIENTOS ── */}
            {tab === 1 && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { l: 'Ingresos', v: fmt(ingresos), c: GREEN },
                    { l: 'Egresos',  v: fmt(gastos),   c: '#EF4444' },
                    { l: 'Saldo',    v: fmt(ingresos - gastos), c: ingresos >= gastos ? GREEN : '#EF4444' },
                  ].map(k => (
                    <div key={k.l} className="rounded-xl p-4 text-center" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>{k.l}</div>
                      <div className="font-black text-[20px]" style={{ color: k.c }}>{k.v}</div>
                    </div>
                  ))}
                </div>

                {/* Gráfico de barras de movimientos por mes */}
                {movimientos.length > 0 && (() => {
                  const byMonth: Record<string, number> = {}
                  movimientos.forEach(m => {
                    const key = m.fecha?.slice(0, 7) || 'N/A'
                    const val = m.tipo === 'Ingreso' || m.monto > 0 ? Math.abs(m.monto) : -Math.abs(m.monto)
                    byMonth[key] = (byMonth[key] || 0) + val
                  })
                  const chartData = Object.entries(byMonth).sort().map(([k, v]) => ({ mes: k.slice(5), value: v }))
                  if (chartData.length < 2) return null
                  return (
                    <div className="rounded-2xl p-5" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                      <div className="font-black text-[13px] mb-4" style={{ color: '#111' }}>Flujo mensual</div>
                      <ResponsiveContainer width="100%" height={120}>
                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }} barCategoryGap="35%">
                          <CartesianGrid vertical={false} stroke="#F0EDE7" />
                          <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#AAA' }} axisLine={false} tickLine={false} tickFormatter={fmtK} />
                          <Tooltip formatter={(v: any) => fmt(Math.abs(v))} />
                          <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                            {chartData.map((d, i) => <Cell key={i} fill={d.value >= 0 ? GREEN : '#EF4444'} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )
                })()}

                <div className="rounded-2xl overflow-hidden" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                  <div className="px-5 py-4 font-black text-[13px]" style={{ color: '#111', borderBottom: `1px solid ${BG}` }}>
                    Detalle de movimientos
                  </div>
                  {movimientos.length === 0 ? (
                    <div className="p-8 text-sm text-center" style={{ color: '#CCC' }}>Sin movimientos registrados</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr style={{ background: BG }}>
                          {['Fecha', 'Concepto', 'Importe'].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wide"
                              style={{ color: '#AAA', borderBottom: `1px solid #E8E4DC` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, i) => {
                          const isIng = m.tipo === 'Ingreso' || m.monto > 0
                          return (
                            <tr key={m.id} style={{ borderBottom: i < movimientos.length - 1 ? `1px solid ${BG}` : 'none' }}>
                              <td className="px-5 py-3.5 text-xs font-medium" style={{ color: '#AAA' }}>{m.fecha?.slice(5)}</td>
                              <td className="px-5 py-3.5 text-sm font-medium" style={{ color: '#111' }}>{m.concepto}</td>
                              <td className="px-5 py-3.5 text-sm font-black font-mono" style={{ color: isIng ? GREEN : '#EF4444' }}>
                                {isIng ? '+' : '-'}{fmt(Math.abs(m.monto))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* ── Tab 2: BITÁCORA ── */}
            {tab === 2 && (
              <div className="rounded-2xl p-6" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
                <div className="font-black text-[14px] mb-5" style={{ color: '#111' }}>Novedades del proyecto</div>
                {bitacora.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: '#CCC' }}>Sin novedades publicadas todavía</div>
                ) : (
                  <div className="space-y-5">
                    {bitacora.map((b, i) => (
                      <div key={b.id} className="flex gap-4">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full mt-1.5" style={{ background: ORANGE }} />
                          {i < bitacora.length - 1 && <div className="w-px flex-1 mt-1.5" style={{ background: '#E8E4DC' }} />}
                        </div>
                        <div className="pb-2 min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#CCC' }}>
                            {new Date(b.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </div>
                          <div className="text-sm leading-relaxed" style={{ color: '#333' }}>{b.contenido}</div>
                          {b.autor && <div className="text-xs font-bold mt-1.5" style={{ color: ORANGE }}>{b.autor}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ══ SIDEBAR ══ */}
          <div className="mt-4 lg:mt-0 space-y-4 lg:sticky lg:top-[58px]">

            {/* Progreso */}
            <div className="rounded-2xl p-5"
              style={{ background: CARD, border: '1px solid #E8E4DC', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
              <div className="font-black text-[13px] mb-4" style={{ color: '#111' }}>Estado de la operación</div>
              <div>
                {STEPS.map((s, i) => {
                  const done   = i < currentStep
                  const active = i === currentStep
                  return (
                    <div key={s}>
                      <div className="flex items-center gap-3 py-1.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0"
                          style={{
                            background: done ? 'rgba(45,122,79,0.12)' : active ? 'rgba(232,98,26,0.12)' : BG,
                            border: `1.5px solid ${done ? GREEN : active ? ORANGE : '#E8E4DC'}`,
                            color: done ? GREEN : active ? ORANGE : '#CCC',
                          }}>
                          {done ? '✓' : active ? '⚡' : i + 1}
                        </div>
                        <span className="text-sm font-bold" style={{ color: done ? GREEN : active ? ORANGE : '#CCC' }}>{s}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="ml-[13px] w-px h-3" style={{ background: done ? 'rgba(45,122,79,0.25)' : '#E8E4DC' }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {proyecto?.estado !== 'vendido' && (
                <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BG}` }}>
                  <div className="flex justify-between text-xs font-bold mb-2" style={{ color: '#AAA' }}>
                    <span>Avance de obra</span>
                    <span style={{ color: ORANGE }}>{proyecto?.avance_reforma || 0}%</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: BG }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${proyecto?.avance_reforma || 0}%`, background: `linear-gradient(90deg,${ORANGE},${SAND})` }} />
                  </div>
                </div>
              )}

              {/* Gestor */}
              <div className="mt-4 pt-4" style={{ borderTop: `1px solid ${BG}` }}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2.5" style={{ color: '#CCC' }}>Gestionado por</div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-black text-sm text-white flex-shrink-0"
                    style={{ background: `linear-gradient(135deg,${ORANGE},${SAND})` }}>H</div>
                  <div>
                    <div className="text-[12px] font-black" style={{ color: '#111' }}>Hasu Activos Inmobiliarios SL</div>
                    <a href="mailto:patricio@wallest.pro" className="text-[11px] font-medium" style={{ color: ORANGE }}>patricio@wallest.pro</a>
                  </div>
                </div>
              </div>
            </div>

            {/* Mini resumen numérico */}
            <div className="rounded-2xl p-5" style={{ background: CARD, border: '1px solid #E8E4DC' }}>
              <div className="font-black text-[13px] mb-4" style={{ color: '#111' }}>Resumen financiero</div>
              <div className="space-y-3">
                {[
                  { l: 'Precio de compra',   v: fmt(proyecto?.precio_compra || 0),  c: '#111' },
                  { l: 'Inversión total',     v: fmt(inversion),                     c: '#111' },
                  { l: 'Precio de venta',     v: fmt(vendido ? proyecto.precio_venta_real : ventaEst), c: vendido ? GREEN : '#AAA' },
                  { l: 'Tu aportación',       v: fmt(capital),                       c: ORANGE },
                  { l: 'Tu beneficio',        v: `+${fmt(benefInv)}`,               c: GREEN },
                  { l: 'ROI',                 v: `${roi.toFixed(1)}%`,              c: vendido ? GREEN : ORANGE },
                ].map(r => (
                  <div key={r.l} className="flex justify-between items-center">
                    <span className="text-xs font-medium" style={{ color: '#AAA' }}>{r.l}</span>
                    <span className="text-xs font-black" style={{ color: r.c }}>{r.v}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
