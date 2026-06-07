'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const STEPS = ['Compra', 'Planificación', 'Reforma', 'Comercial', 'Liquidación']
const ESTADO_STEP: Record<string, number> = {
  captado: 0, analisis: 0, ofertado: 0,
  comprado: 1,
  reforma: 2,
  venta: 3,
  cerrado: 4,
  vendido: 5,
}

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

        const { data: roleByUid } = await supabase
          .from('user_roles').select('role').eq('user_id', session.user.id).maybeSingle()
        const { data: roleByEmail } = !roleByUid ? await supabase
          .from('user_roles').select('role').eq('email', session.user.email!).maybeSingle()
          : { data: null }
        const roleData = roleByUid || roleByEmail
        const isAdmin = roleData?.role === 'admin' || roleData?.role === 'pm'

        const { data: invByUid } = await supabase
          .from('inversores').select('*').eq('user_id', session.user.id).maybeSingle()
        const { data: invByEmail } = !invByUid && session.user.email ? await supabase
          .from('inversores').select('*').eq('email', session.user.email).maybeSingle()
          : { data: null }
        const inv = invByUid || invByEmail

        if (cancelled) return
        if (!inv && !isAdmin) {
          setAuthError(`Tu cuenta (${session.user.email}) no tiene acceso al portal inversor. Contactá a patricio@wallest.pro`)
          setLoading(false)
          return
        }

        const inversorData = inv || { id: null, nombre: session.user.email?.split('@')[0] || 'Admin', desde: null }
        setInversor(inversorData)

        if (inversorData.id) {
          const { data: op } = await supabase
            .from('proyecto_inversores').select('*, proyectos(*)')
            .eq('inversor_id', inversorData.id).single()

          if (op && !cancelled) {
            setOperacion(op)
            setProyecto(op.proyectos)
            const [{ data: movs }, { data: bit }] = await Promise.all([
              supabase.from('movimientos').select('*').eq('proyecto_id', op.proyecto_id).order('fecha', { ascending: false }),
              supabase.from('bitacora').select('*').eq('proyecto_id', op.proyecto_id).order('created_at', { ascending: false }),
            ])
            if (!cancelled) { setMovimientos(movs || []); setBitacora(bit || []) }
          }
        }
        if (!cancelled) setLoading(false)
      } catch (err) {
        console.error('[Portal] error:', err)
        if (!cancelled) router.replace('/inversor')
      }
    }
    init()
    return () => { cancelled = true }
  }, [router])

  useEffect(() => {
    if (!operacion?.proyecto_id) return
    const pid = operacion.proyecto_id
    const channel = supabase.channel(`portal-${pid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'movimientos', filter: `proyecto_id=eq.${pid}` },
        async () => { const { data } = await supabase.from('movimientos').select('*').eq('proyecto_id', pid).order('fecha', { ascending: false }); setMovimientos(data || []) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bitacora', filter: `proyecto_id=eq.${pid}` },
        async () => { const { data } = await supabase.from('bitacora').select('*').eq('proyecto_id', pid).order('created_at', { ascending: false }); setBitacora(data || []) })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'proyectos', filter: `id=eq.${pid}` },
        (payload) => setProyecto((prev: any) => ({ ...prev, ...payload.new })))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [operacion?.proyecto_id])

  const handleLogout = async () => { await supabase.auth.signOut(); router.replace('/inversor') }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F2F1ED' }}>
      <div className="text-sm font-semibold animate-pulse" style={{ color: '#AAA' }}>Cargando tu portal...</div>
    </div>
  )

  if (authError) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F2F1ED' }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl mx-auto mb-5"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>✕</div>
        <div className="font-black text-lg mb-2" style={{ color: '#111' }}>Sin acceso</div>
        <div className="text-sm font-medium mb-6 leading-relaxed" style={{ color: '#888' }}>{authError}</div>
        <button onClick={() => { supabase.auth.signOut(); router.replace('/inversor') }}
          className="w-full py-3 rounded-xl text-sm font-black"
          style={{ background: '#fff', border: '1px solid #ECEAE4', color: '#888' }}>Volver al login</button>
      </div>
    </div>
  )

  // ── Computed ─────────────────────────────────────────────────
  const TABS = ['Resumen', 'Movimientos', 'Bitácora']
  const ingresos = movimientos.filter(m => m.monto > 0 || m.tipo === 'Ingreso').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
  const gastos   = movimientos.filter(m => m.monto < 0 || m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
  const saldo    = ingresos - gastos

  const participacion = operacion?.participacion || 50
  const inversion     = proyecto?.valor_total_operacion || proyecto?.precio_compra || 0
  const ventaEst      = proyecto?.precio_venta_estimado || 0
  const vendido       = !!proyecto?.precio_venta_real && proyecto.precio_venta_real > 0

  const escenarios = vendido
    ? (() => {
        const venta = proyecto.precio_venta_real
        const benefTotal = venta - inversion
        const roi = inversion > 0 ? (benefTotal / inversion) * 100 : 0
        const benefInv = benefTotal * (participacion / 100)
        return [{ label: 'Real', color: '#16A34A', real: true, venta, benefTotal, roi, benefInv }]
      })()
    : [
        { label: 'Conserv.', stored: proyecto?.precio_venta_conservador, mult: 0.90, color: '#888',    real: false },
        { label: 'Realista', stored: proyecto?.precio_venta_realista,    mult: 1.00, color: '#F26E1F', real: true  },
        { label: 'Optimista',stored: proyecto?.precio_venta_optimista,   mult: 1.10, color: '#16A34A', real: false },
      ].map(s => {
        const venta = s.stored ?? (ventaEst * s.mult)
        const benefTotal = venta - inversion
        const roi = inversion > 0 ? (benefTotal / inversion) * 100 : 0
        const benefInv = benefTotal * (participacion / 100)
        return { label: s.label, color: s.color, real: s.real, venta, benefTotal, roi, benefInv }
      })

  const currentStep = ESTADO_STEP[proyecto?.estado] ?? 0
  const roiDisplay  = escenarios[0]?.roi.toFixed(0) || '0'
  const retornoDisplay = escenarios[0]?.benefInv || 0

  return (
    <div className="min-h-screen" style={{ background: '#F2F1ED' }}>

      {/* Header */}
      <div className="sticky top-0 z-20 flex items-center gap-3 px-5 py-3"
        style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(12px)', borderBottom: '1px solid #ECEAE4' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white"
          style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 min-w-0">
          <span className="font-black text-[13px]" style={{ color: '#111' }}>Portal Inversores</span>
          <span className="mx-2 text-[#ECEAE4]">·</span>
          <span className="text-[13px] font-medium" style={{ color: '#AAA' }}>Hasu Activos Inmobiliarios SL</span>
        </div>
        <div className="text-xs font-medium mr-2 hidden sm:block" style={{ color: '#AAA' }}>{inversor?.nombre}</div>
        <button onClick={handleLogout} className="text-xs font-black px-3 py-1.5 rounded-xl"
          style={{ background: '#F2F1ED', border: '1px solid #ECEAE4', color: '#888' }}>Salir</button>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6">
        <div className="md:grid md:grid-cols-[1fr_300px] md:gap-6 md:items-start">

          {/* ── Columna izquierda ── */}
          <div className="space-y-4">

            {/* Hero — nombre + badge estado */}
            <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #ECEAE4', boxShadow: '0 1px 3px rgba(0,0,0,0.05),0 8px 24px rgba(0,0,0,0.06)' }}>
              {/* Franja naranja superior */}
              <div className="h-1.5 w-full" style={{ background: 'linear-gradient(90deg,#F26E1F,#F5A742)' }} />
              <div className="p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#F26E1F' }}>
                      Joint Venture · {participacion}% participación
                    </div>
                    <h1 className="font-black text-[28px] md:text-[32px] leading-none" style={{ color: '#111', letterSpacing: -1 }}>
                      {proyecto?.nombre || 'Sin proyecto asignado'}
                    </h1>
                    <div className="text-sm font-medium mt-1.5" style={{ color: '#AAA' }}>
                      {proyecto?.ciudad || '—'} · Entrada {operacion?.fecha_entrada || '—'}
                    </div>
                  </div>
                  {vendido && (
                    <div className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-black"
                      style={{ background: 'rgba(22,163,74,0.10)', color: '#16A34A', border: '1px solid rgba(22,163,74,0.2)' }}>
                      ✓ Vendido
                    </div>
                  )}
                </div>

                {/* KPIs principales */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl p-4" style={{ background: '#F2F1ED', border: '1px solid #ECEAE4' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>Tu inversión</div>
                    <div className="font-black text-[20px] leading-none" style={{ color: '#111' }}>{fmt(operacion?.capital_invertido || 0)}</div>
                    <div className="text-[11px] font-medium mt-1" style={{ color: '#AAA' }}>{participacion}% del total</div>
                  </div>
                  <div className="rounded-xl p-4" style={{ background: vendido ? 'rgba(22,163,74,0.07)' : '#F2F1ED', border: vendido ? '1px solid rgba(22,163,74,0.2)' : '1px solid #ECEAE4' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>{vendido ? 'Retorno real' : 'Retorno est.'}</div>
                    <div className="font-black text-[20px] leading-none" style={{ color: '#16A34A' }}>+{fmt(retornoDisplay)}</div>
                    <div className="text-[11px] font-medium mt-1" style={{ color: '#AAA' }}>sobre aportado</div>
                  </div>
                  <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: vendido ? 'rgba(22,163,74,0.07)' : 'rgba(242,110,31,0.07)', border: vendido ? '1px solid rgba(22,163,74,0.25)' : '1px solid rgba(242,110,31,0.25)' }}>
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#AAA' }}>ROI</div>
                    <div className="font-black text-[28px] leading-none" style={{ color: vendido ? '#16A34A' : '#F26E1F' }}>{roiDisplay}%</div>
                    <div className="text-[11px] font-medium mt-1" style={{ color: '#AAA' }}>{vendido ? 'confirmado' : 'estimado'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ borderBottom: '1.5px solid #ECEAE4' }}>
              <div className="flex gap-1">
                {TABS.map((t, i) => (
                  <button key={t} onClick={() => setTab(i)}
                    className="px-5 py-2.5 text-sm font-bold whitespace-nowrap transition-colors"
                    style={{
                      color: tab === i ? '#F26E1F' : '#AAA',
                      borderBottom: tab === i ? '2px solid #F26E1F' : '2px solid transparent',
                      marginBottom: -1.5,
                    }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab 0: RESUMEN */}
            {tab === 0 && (
              <div className="space-y-3">
                {/* Resultado / Escenarios */}
                <div className="rounded-2xl p-5" style={{ background: '#fff', border: '1px solid #ECEAE4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                  <div className="font-black text-[15px] mb-0.5" style={{ color: '#111' }}>
                    {vendido ? 'Resultado final de la operación' : 'Escenarios de venta'}
                  </div>
                  <div className="text-xs font-medium mb-4" style={{ color: '#AAA' }}>
                    Tu {participacion}% sobre {fmt(operacion?.capital_invertido || 0)} aportados
                  </div>
                  <div className={`grid gap-2.5 ${vendido ? 'grid-cols-1' : 'grid-cols-3'}`}>
                    {escenarios.map(s => (
                      <div key={s.label} className="rounded-xl p-4"
                        style={{
                          background: vendido ? 'rgba(22,163,74,0.05)' : s.real ? 'rgba(242,110,31,0.06)' : '#F2F1ED',
                          border: `1.5px solid ${vendido ? 'rgba(22,163,74,0.2)' : s.real ? 'rgba(242,110,31,0.2)' : '#ECEAE4'}`,
                        }}>
                        {vendido ? (
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#16A34A' }}>Precio de venta real</div>
                              <div className="font-black text-[28px] leading-none" style={{ color: '#111' }}>{fmt(s.venta)}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: '#AAA' }}>Tu beneficio</div>
                              <div className="font-black text-[28px] leading-none" style={{ color: '#16A34A' }}>+{fmt(s.benefInv)}</div>
                              <div className="text-sm font-black mt-1" style={{ color: '#16A34A' }}>+{s.roi.toFixed(0)}% ROI</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="text-[10px] font-black uppercase tracking-wide mb-2" style={{ color: s.color }}>{s.label}</div>
                            <div className="font-black text-[17px]" style={{ color: '#111' }}>{fmt(s.venta)}</div>
                            <div className="font-bold text-sm mt-0.5" style={{ color: s.benefInv >= 0 ? '#16A34A' : '#EF4444' }}>
                              {s.benefInv >= 0 ? '+' : ''}{fmt(s.benefInv)}
                            </div>
                            <div className="font-black text-xs" style={{ color: s.color }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}% ROI</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Nota informe */}
                <div className="rounded-xl p-4 flex gap-3 items-center"
                  style={{ background: 'rgba(242,110,31,0.05)', border: '1px solid rgba(242,110,31,0.15)' }}>
                  <span className="text-lg flex-shrink-0">📧</span>
                  <div>
                    <div className="text-sm font-black" style={{ color: '#111' }}>Informe semanal automático</div>
                    <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>
                      Cada viernes recibís un resumen con avance, gastos y próximos pasos.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 1: MOVIMIENTOS */}
            {tab === 1 && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { l: 'Ingresos', v: fmt(ingresos), c: '#16A34A' },
                    { l: 'Egresos',  v: fmt(gastos),   c: '#EF4444' },
                    { l: 'Saldo',    v: fmt(saldo),     c: saldo >= 0 ? '#16A34A' : '#EF4444' },
                  ].map(k => (
                    <div key={k.l} className="rounded-xl p-4" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                      <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>{k.l}</div>
                      <div className="font-black text-[18px]" style={{ color: k.c }}>{k.v}</div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                  <div className="px-5 py-4 font-black text-[14px]" style={{ color: '#111', borderBottom: '1px solid #F2F1ED' }}>
                    {proyecto?.nombre}
                  </div>
                  {movimientos.length === 0 ? (
                    <div className="p-8 text-sm text-center" style={{ color: '#CCC' }}>Sin movimientos registrados</div>
                  ) : (
                    <table className="w-full border-collapse">
                      <thead>
                        <tr style={{ background: '#F2F1ED' }}>
                          {['Fecha', 'Concepto', 'Importe'].map(h => (
                            <th key={h} className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-wide"
                              style={{ color: '#AAA', borderBottom: '1px solid #ECEAE4' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {movimientos.map((m, i) => {
                          const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                          return (
                            <tr key={m.id} style={{ borderBottom: i < movimientos.length - 1 ? '1px solid #F2F1ED' : 'none' }}>
                              <td className="px-5 py-3.5 text-xs font-medium" style={{ color: '#AAA' }}>{m.fecha?.slice(5)}</td>
                              <td className="px-5 py-3.5 text-sm font-medium" style={{ color: '#111' }}>{m.concepto}</td>
                              <td className="px-5 py-3.5 text-sm font-black font-mono"
                                style={{ color: isIngreso ? '#16A34A' : '#EF4444' }}>
                                {isIngreso ? '+' : '-'}{fmt(Math.abs(m.monto))}
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

            {/* Tab 2: BITÁCORA */}
            {tab === 2 && (
              <div className="rounded-2xl p-6" style={{ background: '#fff', border: '1px solid #ECEAE4' }}>
                <div className="font-black text-[15px] mb-5" style={{ color: '#111' }}>Novedades del proyecto</div>
                {bitacora.length === 0 ? (
                  <div className="text-center py-10 text-sm" style={{ color: '#CCC' }}>Sin novedades publicadas todavía</div>
                ) : (
                  <div className="space-y-5">
                    {bitacora.map((b, i) => (
                      <div key={b.id} className="flex gap-4">
                        <div className="flex flex-col items-center flex-shrink-0">
                          <div className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#F26E1F' }} />
                          {i < bitacora.length - 1 && <div className="w-[1.5px] flex-1 mt-1" style={{ background: '#ECEAE4' }} />}
                        </div>
                        <div className="pb-1">
                          <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#CCC' }}>
                            {new Date(b.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                          </div>
                          <div className="text-sm font-medium leading-relaxed" style={{ color: '#111' }}>{b.contenido}</div>
                          {b.autor && <div className="text-xs font-bold mt-1.5" style={{ color: '#F26E1F' }}>{b.autor}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Columna derecha: Progreso sticky ── */}
          <div className="mt-4 md:mt-0">
            <div className="rounded-2xl p-5 md:sticky md:top-[58px]"
              style={{ background: '#fff', border: '1px solid #ECEAE4', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
              <div className="font-black text-[14px] mb-5" style={{ color: '#111' }}>Progreso</div>
              <div className="space-y-1">
                {STEPS.map((s, i) => {
                  const done   = i < currentStep
                  const active = i === currentStep
                  return (
                    <div key={s}>
                      <div className="flex items-center gap-3 py-2">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black flex-shrink-0 transition-all"
                          style={{
                            background: done ? 'rgba(22,163,74,0.12)' : active ? 'rgba(242,110,31,0.12)' : '#F2F1ED',
                            border: `1.5px solid ${done ? '#16A34A' : active ? '#F26E1F' : '#ECEAE4'}`,
                            color: done ? '#16A34A' : active ? '#F26E1F' : '#CCC',
                          }}>
                          {done ? '✓' : active ? '⚡' : i + 1}
                        </div>
                        <span className="text-sm font-bold transition-colors"
                          style={{ color: done ? '#16A34A' : active ? '#F26E1F' : '#CCC' }}>{s}</span>
                      </div>
                      {i < STEPS.length - 1 && (
                        <div className="ml-[13px] w-[1.5px] h-3" style={{ background: done ? '#16A34A' : '#ECEAE4', opacity: done ? 0.3 : 1 }} />
                      )}
                    </div>
                  )
                })}
              </div>

              {proyecto?.estado !== 'vendido' && (
                <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F2F1ED' }}>
                  <div className="flex justify-between text-xs font-bold mb-2" style={{ color: '#AAA' }}>
                    <span>Avance de obra</span>
                    <span style={{ color: '#F26E1F' }}>{proyecto?.avance_reforma || 0}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#F2F1ED' }}>
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${proyecto?.avance_reforma || 0}%`, background: 'linear-gradient(90deg,#F26E1F,#F5A742)' }} />
                  </div>
                </div>
              )}

              {/* Contacto */}
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid #F2F1ED' }}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color: '#AAA' }}>Gestor de operación</div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center font-black text-xs text-white"
                    style={{ background: '#F26E1F' }}>P</div>
                  <div>
                    <div className="text-xs font-black" style={{ color: '#111' }}>Patricio Fávora</div>
                    <div className="text-[10px] font-medium" style={{ color: '#AAA' }}>patricio@wallest.pro</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
