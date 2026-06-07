'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

const STEPS = ['Compra', 'Plan.', 'Reforma', 'Comercial', 'Liquid.']
const ESTADO_STEP: Record<string, number> = {
  captado: 0, analisis: 0, ofertado: 0,
  comprado: 1,
  reforma: 2,
  venta: 3,
  cerrado: 4,
}

const CARD = {
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)',
  border: '1px solid #ECEAE4',
} as const

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
            .from('proyecto_inversores')
            .select('*, proyectos(*)')
            .eq('inversor_id', inversorData.id)
            .single()

          if (op && !cancelled) {
            setOperacion(op)
            setProyecto(op.proyectos)

            const [{ data: movs }, { data: bit }] = await Promise.all([
              supabase.from('movimientos').select('*')
                .eq('proyecto_id', op.proyecto_id)
                .order('fecha', { ascending: false }),
              supabase.from('bitacora').select('*')
                .eq('proyecto_id', op.proyecto_id)
                .order('created_at', { ascending: false }),
            ])
            if (!cancelled) {
              setMovimientos(movs || [])
              setBitacora(bit || [])
            }
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
    const channel = supabase
      .channel(`portal-${pid}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'movimientos', filter: `proyecto_id=eq.${pid}` },
        async () => {
          const { data } = await supabase.from('movimientos').select('*')
            .eq('proyecto_id', pid).order('fecha', { ascending: false })
          setMovimientos(data || [])
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'bitacora', filter: `proyecto_id=eq.${pid}` },
        async () => {
          const { data } = await supabase.from('bitacora').select('*')
            .eq('proyecto_id', pid).order('created_at', { ascending: false })
          setBitacora(data || [])
        }
      )
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'proyectos', filter: `id=eq.${pid}` },
        (payload) => setProyecto((prev: any) => ({ ...prev, ...payload.new }))
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [operacion?.proyecto_id])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/inversor')
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F2F1ED' }}>
      <div className="text-sm font-semibold animate-pulse" style={{ color: '#AAA' }}>Cargando tu portal...</div>
    </div>
  )

  // ── Error ────────────────────────────────────────────────────
  if (authError) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#F2F1ED' }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center font-black text-xl mx-auto mb-5"
          style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>✕</div>
        <div className="font-black text-lg mb-2" style={{ color: '#111' }}>Sin acceso</div>
        <div className="text-sm font-medium mb-6 leading-relaxed" style={{ color: '#888' }}>{authError}</div>
        <button onClick={() => { supabase.auth.signOut(); router.replace('/inversor') }}
          className="w-full py-3 rounded-xl text-sm font-black"
          style={{ background: '#fff', border: '1px solid #ECEAE4', color: '#888' }}>
          Volver al login
        </button>
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
        const venta      = proyecto.precio_venta_real
        const benefTotal = venta - inversion
        const roi        = inversion > 0 ? (benefTotal / inversion) * 100 : 0
        const benefInv   = benefTotal * (participacion / 100)
        return [{ label: 'Real', color: '#16A34A', real: true, venta, benefTotal, roi, benefInv }]
      })()
    : [
        { label: 'Conserv.',  stored: proyecto?.precio_venta_conservador, mult: 0.90, color: '#888',    real: false },
        { label: 'Realista',  stored: proyecto?.precio_venta_realista,    mult: 1.00, color: '#F26E1F', real: true  },
        { label: 'Optimista', stored: proyecto?.precio_venta_optimista,   mult: 1.10, color: '#16A34A', real: false },
      ].map(s => {
        const venta      = s.stored ?? (ventaEst * s.mult)
        const benefTotal = venta - inversion
        const roi        = inversion > 0 ? (benefTotal / inversion) * 100 : 0
        const benefInv   = benefTotal * (participacion / 100)
        return { label: s.label, color: s.color, real: s.real, venta, benefTotal, roi, benefInv }
      })

  const currentStep = ESTADO_STEP[proyecto?.estado] ?? 0

  return (
    <div className="min-h-screen pb-10" style={{ background: '#F2F1ED' }}>

      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3"
        style={{ background: '#fff', borderBottom: '1px solid #ECEAE4', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0"
          style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-[14px] leading-none" style={{ color: '#111' }}>Portal Inversores</div>
          <div className="text-[11px] font-medium mt-0.5 truncate" style={{ color: '#AAA' }}>{inversor?.nombre || 'Inversor'}</div>
        </div>
        <button onClick={handleLogout}
          className="text-xs font-black px-3 py-1.5 rounded-xl flex-shrink-0"
          style={{ background: '#F2F1ED', border: '1px solid #ECEAE4', color: '#888' }}>
          Salir
        </button>
      </div>

      <div className="p-4 max-w-lg mx-auto">

        {/* Hero card */}
        <div className="rounded-2xl p-5 mb-3 relative overflow-hidden" style={CARD}>
          <div className="absolute right-[-30px] top-[-30px] w-[140px] h-[140px] rounded-full"
            style={{ background: 'rgba(242,110,31,0.06)' }} />
          <span className="text-[10px] font-black px-3 py-1 rounded-full inline-block mb-3 relative"
            style={{ background: 'rgba(242,110,31,0.12)', color: '#F26E1F' }}>
            JV {participacion}%
          </span>
          <div className="font-black text-[24px] leading-none mb-1 relative" style={{ color: '#111', letterSpacing: -0.5 }}>
            {proyecto?.nombre || 'Sin proyecto asignado'}
          </div>
          <div className="text-sm font-medium mb-5 relative" style={{ color: '#AAA' }}>
            {proyecto?.ciudad || '—'} · Entrada {operacion?.fecha_entrada || '—'}
          </div>

          <div className="grid grid-cols-3 gap-2 relative">
            {[
              {
                v: proyecto?.estado
                  ? proyecto.estado.charAt(0).toUpperCase() + proyecto.estado.slice(1)
                  : '—',
                l: 'Estado',
                c: '#F59E0B',
              },
              { v: `${proyecto?.avance_reforma || 0}%`, l: 'Avance', c: '#111' },
              {
                v: fmt(escenarios[0]?.benefInv || 0),
                l: vendido ? 'Retorno real' : 'Retorno est.',
                c: '#16A34A',
              },
            ].map(k => (
              <div key={k.l} className="rounded-xl p-3 text-center"
                style={{ background: '#F2F1ED', border: '1px solid #ECEAE4' }}>
                <div className="font-black text-[13px] leading-tight" style={{ color: k.c }}>{k.v}</div>
                <div className="text-[9px] font-bold uppercase tracking-wide mt-1" style={{ color: '#AAA' }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progreso */}
        <div className="rounded-2xl p-4 mb-3" style={CARD}>
          <div className="font-black text-[14px] mb-4" style={{ color: '#111' }}>Progreso de la operación</div>
          <div className="flex justify-between relative mb-2">
            <div className="absolute top-4 left-[5%] right-[5%] h-[1.5px]" style={{ background: '#ECEAE4' }} />
            {STEPS.map((s, i) => {
              const done   = i < currentStep
              const active = i === currentStep
              return (
                <div key={s} className="flex flex-col items-center gap-1.5 z-10">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-black"
                    style={{
                      background: done ? 'rgba(22,163,74,0.10)' : active ? 'rgba(242,110,31,0.12)' : '#F2F1ED',
                      border: `1.5px solid ${done ? '#16A34A' : active ? '#F26E1F' : '#ECEAE4'}`,
                      color: done ? '#16A34A' : active ? '#F26E1F' : '#CCC',
                    }}>
                    {done ? '✓' : active ? '⚡' : '○'}
                  </div>
                  <div className="text-[9px] font-bold uppercase text-center leading-tight"
                    style={{ color: active ? '#F26E1F' : done ? '#16A34A' : '#CCC', maxWidth: 40 }}>{s}</div>
                </div>
              )
            })}
          </div>

          {proyecto?.estado !== 'vendido' && (
            <>
              <div className="flex justify-between text-xs font-bold mt-3 mb-1.5" style={{ color: '#AAA' }}>
                <span>Avance de obra</span>
                <span style={{ color: '#F26E1F' }}>{proyecto?.avance_reforma || 0}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#ECEAE4' }}>
                <div className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${proyecto?.avance_reforma || 0}%`, background: '#F26E1F' }} />
              </div>
            </>
          )}
        </div>

        {/* Tabs */}
        <div className="flex mb-3 overflow-x-auto"
          style={{ borderBottom: '1.5px solid #ECEAE4' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className="flex-shrink-0 px-5 py-2.5 text-sm font-bold whitespace-nowrap"
              style={{
                color: tab === i ? '#F26E1F' : '#AAA',
                borderBottom: tab === i ? '2.5px solid #F26E1F' : '2.5px solid transparent',
                marginBottom: -1.5,
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* ═══ Tab 0: RESUMEN ═══ */}
        {tab === 0 && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="rounded-xl p-4" style={CARD}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Tu aportación</div>
                <div className="font-black text-[22px]" style={{ color: '#111' }}>{fmt(operacion?.capital_invertido || 0)}</div>
                <div className="text-xs font-medium mt-1" style={{ color: '#AAA' }}>{participacion}% del capital</div>
              </div>
              <div className="rounded-xl p-4" style={CARD}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>
                  {vendido ? 'Retorno real' : 'Retorno est.'}
                </div>
                <div className="font-black text-[22px]" style={{ color: '#16A34A' }}>
                  {fmt(escenarios[0]?.benefInv || 0)}
                </div>
                <div className="text-xs font-semibold mt-1" style={{ color: '#AAA' }}>
                  ROI {escenarios[0]?.roi.toFixed(1) || 0}%
                </div>
              </div>
            </div>

            {/* Escenarios / Resultado */}
            <div className="rounded-2xl p-4 mb-3" style={CARD}>
              <div className="font-black text-[14px] mb-0.5" style={{ color: '#111' }}>
                {vendido ? 'Resultado final' : 'Escenarios de venta'}
              </div>
              <div className="text-xs font-medium mb-4" style={{ color: '#AAA' }}>
                Tu parte ({participacion}%) sobre {fmt(operacion?.capital_invertido || 0)} aportados
              </div>
              <div className={`grid gap-2 ${vendido ? 'grid-cols-1' : 'grid-cols-3'}`}>
                {escenarios.map(s => (
                  <div key={s.label} className="rounded-xl p-3 text-center"
                    style={{
                      background: s.real ? 'rgba(242,110,31,0.07)' : '#F2F1ED',
                      border: `1.5px solid ${s.real ? 'rgba(242,110,31,0.25)' : '#ECEAE4'}`,
                    }}>
                    <div className="text-[10px] font-black uppercase tracking-wide mb-1.5" style={{ color: s.color }}>{s.label}</div>
                    <div className="font-black text-[15px] leading-tight" style={{ color: '#111' }}>
                      {fmt(s.venta)}
                    </div>
                    <div className="text-[12px] font-bold mt-0.5" style={{ color: s.benefInv >= 0 ? '#16A34A' : '#EF4444' }}>
                      {s.benefInv >= 0 ? '+' : ''}{fmt(s.benefInv)}
                    </div>
                    <div className="text-[11px] font-black mt-0" style={{ color: s.color }}>
                      {s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}% ROI
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl p-4 flex gap-3 items-start"
              style={{ background: 'rgba(242,110,31,0.06)', border: '1.5px solid rgba(242,110,31,0.18)' }}>
              <span className="text-xl flex-shrink-0">📧</span>
              <div>
                <div className="text-sm font-black mb-0.5" style={{ color: '#111' }}>Informe semanal automático</div>
                <div className="text-xs font-medium leading-relaxed" style={{ color: '#888' }}>
                  Cada viernes recibís un resumen con el avance de la semana, gastos y próximos pasos.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ Tab 1: MOVIMIENTOS ═══ */}
        {tab === 1 && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="rounded-xl p-4" style={CARD}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Ingresos</div>
                <div className="font-black text-[22px]" style={{ color: '#16A34A' }}>{fmt(ingresos)}</div>
              </div>
              <div className="rounded-xl p-4" style={CARD}>
                <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Egresos</div>
                <div className="font-black text-[22px]" style={{ color: '#EF4444' }}>{fmt(gastos)}</div>
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={CARD}>
              <div className="px-4 py-3.5 flex items-center justify-between" style={{ borderBottom: '1px solid #F2F1ED' }}>
                <div className="font-black text-[14px]" style={{ color: '#111' }}>{proyecto?.nombre}</div>
                <span className="text-xs font-bold" style={{ color: '#AAA' }}>
                  Saldo: <span className="font-black" style={{ color: saldo >= 0 ? '#16A34A' : '#EF4444' }}>{fmt(saldo)}</span>
                </span>
              </div>
              {movimientos.length === 0 ? (
                <div className="p-6 text-sm text-center" style={{ color: '#CCC' }}>Sin movimientos registrados</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: '#F2F1ED' }}>
                        {['Fecha', 'Concepto', 'Importe'].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide"
                            style={{ color: '#AAA', borderBottom: '1px solid #ECEAE4' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m, i) => {
                        const isIngreso = m.tipo === 'Ingreso' || m.monto > 0
                        return (
                          <tr key={m.id} style={{ borderBottom: i < movimientos.length - 1 ? '1px solid #F2F1ED' : 'none' }}>
                            <td className="px-4 py-3 text-xs font-medium" style={{ color: '#AAA' }}>{m.fecha?.slice(5)}</td>
                            <td className="px-4 py-3 text-sm font-medium" style={{ color: '#111' }}>{m.concepto}</td>
                            <td className="px-4 py-3 text-xs font-black font-mono"
                              style={{ color: isIngreso ? '#16A34A' : '#EF4444' }}>
                              {isIngreso ? '+' : '-'}{fmt(Math.abs(m.monto))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ Tab 2: BITÁCORA ═══ */}
        {tab === 2 && (
          <div className="rounded-2xl p-5" style={CARD}>
            <div className="font-black text-[14px] mb-4" style={{ color: '#111' }}>Novedades del proyecto</div>
            {bitacora.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#CCC' }}>Sin novedades publicadas todavía</div>
            ) : (
              <div className="pl-5 relative">
                <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#ECEAE4' }} />
                {bitacora.map(b => (
                  <div key={b.id} className="relative mb-5">
                    <div className="absolute -left-[15px] top-1.5 w-2.5 h-2.5 rounded-full"
                      style={{ background: '#F26E1F', border: '2px solid #F2F1ED' }} />
                    <div className="text-[10px] font-bold mb-1 uppercase tracking-wide"
                      style={{ color: '#CCC' }}>
                      {new Date(b.created_at).toLocaleDateString('es-ES', {
                        day: '2-digit', month: 'short', year: 'numeric'
                      }).toUpperCase()}
                    </div>
                    <div className="text-sm font-medium leading-relaxed" style={{ color: '#111' }}>{b.contenido}</div>
                    {b.autor && (
                      <div className="text-xs font-bold mt-1" style={{ color: '#F26E1F' }}>{b.autor}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
