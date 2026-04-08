'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

export default function PortalInversorPage() {
  const router = useRouter()
  const [tab, setTab] = useState(0)
  const [inversor, setInversor] = useState<any>(null)
  const [operacion, setOperacion] = useState<any>(null)
  const [proyecto, setProyecto] = useState<any>(null)
  const [movimientos, setMovimientos] = useState<any[]>([])
  const [bitacora, setBitacora] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      try {
        // Retry hasta 3 veces con 400ms de delay para manejar race condition post-login
        let session = null
        for (let i = 0; i < 3; i++) {
          const { data } = await supabase.auth.getSession()
          session = data.session
          if (session) break
          if (i < 2) await new Promise(r => setTimeout(r, 400))
        }

        if (cancelled) return
        if (!session) { router.replace('/inversor'); return }

        // Verificar rol admin
        const { data: roleData } = await supabase
          .from('user_roles').select('role').eq('user_id', session.user.id).single()
        const isAdmin = roleData?.role === 'admin'

        // Buscar fila inversor
        const { data: inv } = await supabase
          .from('inversores').select('*').eq('user_id', session.user.id).single()

        if (cancelled) return

        if (!inv && !isAdmin) {
          setAuthError(`Tu cuenta (${session.user.email}) no tiene acceso al portal inversor. Contactá a patricio@wallest.pro`)
          setLoading(false)
          return
        }

        const inversorData = inv || { id: null, nombre: session.user.email?.split('@')[0] || 'Admin', desde: null }
        setInversor(inversorData)

        // Cargar operación solo si hay id de inversor
        if (inversorData.id) {
          const { data: op } = await supabase.from('proyecto_inversores')
            .select('*, proyectos(*)').eq('inversor_id', inversorData.id).single()

          if (op && !cancelled) {
            setOperacion(op)
            setProyecto(op.proyectos)

            const [{ data: movs }, { data: bit }] = await Promise.all([
              supabase.from('movimientos').select('*').eq('proyecto_id', op.proyecto_id).order('fecha', { ascending: false }),
              supabase.from('bitacora_inversor').select('*').eq('proyecto_inversor_id', op.id).order('orden'),
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
        if (!cancelled) { router.replace('/inversor') }
      }
    }

    init()
    return () => { cancelled = true }
  }, [router])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.replace('/inversor')
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
      <div className="text-sm font-semibold animate-pulse" style={{ color: '#888' }}>Cargando tu portal...</div>
    </div>
  )

  if (authError) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#0A0A0A' }}>
      <div className="w-full max-w-sm text-center">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl mx-auto mb-5" style={{ background: '#EF444420', border: '1px solid #EF444440' }}>✕</div>
        <div className="font-black text-lg text-white mb-2">Sin acceso</div>
        <div className="text-sm font-medium mb-6 leading-relaxed" style={{ color: '#888' }}>{authError}</div>
        <button onClick={() => { supabase.auth.signOut(); router.replace('/inversor') }}
          className="w-full py-3 rounded-xl text-sm font-black"
          style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>
          Volver al login
        </button>
      </div>
    </div>
  )

  const TABS = ['Resumen', 'Movimientos', 'Bitácora']
  const ingresos = movimientos.filter(m => m.tipo === 'Ingreso').reduce((s, m) => s + (m.monto || 0), 0)
  const gastos = movimientos.filter(m => m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
  const saldo = ingresos - gastos

  return (
    <div className="min-h-screen" style={{ background: '#0A0A0A' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3.5" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm text-white flex-shrink-0" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1">
          <div className="font-black text-[15px] text-white">Portal Inversores</div>
          <div className="text-xs font-medium" style={{ color: '#888' }}>{inversor?.nombre || 'Inversor'}</div>
        </div>
        <button onClick={handleLogout} className="text-xs font-bold px-3 py-1.5 rounded-xl" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>
          Salir
        </button>
      </div>

      <div className="p-4">
        {/* Hero */}
        <div className="rounded-2xl p-5 mb-4 relative overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="absolute right-[-40px] top-[-40px] w-[180px] h-[180px] rounded-full" style={{ background: 'rgba(242,110,31,0.08)' }} />
          <span className="text-[11px] font-black px-3 py-1 rounded-full inline-block mb-3 relative"
            style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>
            JV {operacion?.participacion || 50}%
          </span>
          <div className="font-black text-[26px] text-white leading-none mb-1 relative" style={{ letterSpacing: -1 }}>
            {proyecto?.nombre || 'Sin proyecto'}
          </div>
          <div className="text-sm font-medium mb-5 relative" style={{ color: '#888' }}>
            {proyecto?.ciudad || '—'} · Entrada {operacion?.fecha_entrada || '—'}
          </div>
          <div className="grid grid-cols-3 gap-2 relative">
            {[
              { v: proyecto?.estado ? proyecto.estado.charAt(0).toUpperCase() + proyecto.estado.slice(1) : '—', l: 'Estado', c: '#F59E0B' },
              { v: `${proyecto?.avance_reforma || 0}%`, l: 'Avance', c: '#fff' },
              { v: fmt(operacion?.retorno_estimado || 0), l: 'Retorno est.', c: '#22C55E' },
            ].map(k => (
              <div key={k.l} className="rounded-xl p-3 text-center" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="font-black text-base" style={{ color: k.c }}>{k.v}</div>
                <div className="text-[10px] font-bold uppercase tracking-wide mt-1" style={{ color: '#888' }}>{k.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Progress */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="font-black text-[15px] text-white mb-4">Progreso de la operación</div>
          <div className="flex justify-between relative mb-2">
            <div className="absolute top-4 left-[5%] right-[5%] h-[1.5px]" style={{ background: '#282828' }} />
            {['Compra','Plan.','Reforma','Comercial','Liquid.'].map((s, i) => (
              <div key={s} className="flex flex-col items-center gap-1.5 z-10">
                <div className="w-[33px] h-[33px] rounded-full flex items-center justify-center text-xs font-black"
                  style={{
                    background: i < 2 ? 'rgba(34,197,94,0.15)' : i === 2 ? 'rgba(242,110,31,0.18)' : '#1E1E1E',
                    border: `1.5px solid ${i < 2 ? '#22C55E' : i === 2 ? '#F26E1F' : '#333'}`,
                    color: i < 2 ? '#22C55E' : i === 2 ? '#F26E1F' : '#555',
                  }}>
                  {i < 2 ? '✓' : i === 2 ? '⚡' : '○'}
                </div>
                <div className="text-[10px] font-bold uppercase text-center leading-tight" style={{ color: i === 2 ? '#F26E1F' : '#555', maxWidth: 44 }}>{s}</div>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs font-bold mt-3 mb-1.5" style={{ color: '#888' }}>
            <span>Avance de obra</span><span style={{ color: '#F26E1F' }}>{proyecto?.avance_reforma || 0}%</span>
          </div>
          <div className="h-1 rounded-full overflow-hidden" style={{ background: '#282828' }}>
            <div className="h-full rounded-full" style={{ width: `${proyecto?.avance_reforma || 0}%`, background: '#F26E1F' }} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex -mx-4 px-4 mb-4 overflow-x-auto" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          {TABS.map((t, i) => (
            <button key={t} onClick={() => setTab(i)}
              className="flex-shrink-0 px-5 py-2.5 text-sm font-bold whitespace-nowrap"
              style={{ color: tab === i ? '#F26E1F' : '#888', borderBottom: tab === i ? '2.5px solid #F26E1F' : '2.5px solid transparent', marginBottom: -1 }}>
              {t}
            </button>
          ))}
        </div>

        {/* Tab 0: Resumen */}
        {tab === 0 && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Tu aportación</div>
                <div className="font-black text-[22px] text-white">{fmt(operacion?.capital_invertido || 0)}</div>
                <div className="text-xs font-medium mt-1" style={{ color: '#888' }}>{operacion?.participacion || 50}% del capital</div>
              </div>
              <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Retorno est.</div>
                <div className="font-black text-[22px]" style={{ color: '#22C55E' }}>{fmt(operacion?.retorno_estimado || 0)}</div>
                <div className="text-xs font-semibold mt-1" style={{ color: '#888' }}>ROI {operacion?.roi || 0}%</div>
              </div>
            </div>

            <div className="rounded-2xl p-4 mb-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="font-black text-[15px] text-white mb-1">Escenarios</div>
              <div className="text-sm font-medium mb-4" style={{ color: '#888' }}>Sobre tu inversión de {fmt(operacion?.capital_invertido || 0)}</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { l: 'Conserv.', v: (operacion?.capital_invertido || 0) * 1.35, roi: 35 },
                  { l: 'Realista', v: operacion?.retorno_estimado, roi: operacion?.roi, real: true },
                  { l: 'Optimista', v: (operacion?.capital_invertido || 0) * 1.66, roi: 66 },
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

            <div className="rounded-xl p-4 flex gap-3 items-start" style={{ background: 'rgba(242,110,31,0.08)', border: '1px solid rgba(242,110,31,0.2)' }}>
              <span className="text-xl flex-shrink-0">📧</span>
              <div>
                <div className="text-sm font-black text-white mb-1">Informe semanal automático</div>
                <div className="text-sm font-medium leading-relaxed" style={{ color: '#888' }}>
                  Cada viernes recibís un resumen con el avance de la semana, gastos y próximos pasos.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 1: Movimientos */}
        {tab === 1 && (
          <div>
            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Ingresos</div>
                <div className="font-black text-[22px]" style={{ color: '#22C55E' }}>{fmt(ingresos)}</div>
              </div>
              <div className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Egresos</div>
                <div className="font-black text-[22px]" style={{ color: '#EF4444' }}>{fmt(gastos)}</div>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="p-4 pb-0 flex items-center justify-between">
                <div className="font-black text-[15px] text-white">Cuenta {proyecto?.nombre}</div>
                <span className="text-xs font-bold" style={{ color: '#888' }}>Saldo: <span style={{ color: '#22C55E' }} className="font-black">{fmt(saldo)}</span></span>
              </div>
              {movimientos.length === 0 ? (
                <div className="p-4 text-sm text-center" style={{ color: '#555' }}>Sin movimientos registrados</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr style={{ background: '#1E1E1E' }}>
                        {['Fecha','Concepto','Importe'].map(h => (
                          <th key={h} className="text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wide" style={{ color: '#888', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.slice(0, 20).map((m, i) => (
                        <tr key={m.id} style={{ borderBottom: i < movimientos.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none' }}>
                          <td className="px-3 py-3 text-xs font-medium" style={{ color: '#888' }}>{m.fecha?.slice(5)}</td>
                          <td className="px-3 py-3 text-sm font-medium text-white">{m.concepto}</td>
                          <td className="px-3 py-3 text-xs font-black font-mono" style={{ color: m.tipo === 'Ingreso' ? '#22C55E' : '#EF4444' }}>
                            {m.tipo === 'Ingreso' ? '+' : '-'}{fmt(Math.abs(m.monto))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Bitácora */}
        {tab === 2 && (
          <div className="rounded-2xl p-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="font-black text-[15px] text-white mb-4">Novedades del proyecto</div>
            {bitacora.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin novedades publicadas todavía</div>
            ) : (
              <div className="pl-5 relative">
                <div className="absolute left-1.5 top-1 bottom-1 w-[1.5px]" style={{ background: '#282828' }} />
                {bitacora.map(b => (
                  <div key={b.id} className="relative mb-4">
                    <div className="absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full"
                      style={{ background: b.estado === 'finalizada' ? '#22C55E' : b.estado === 'en_curso' ? '#F26E1F' : '#888', border: '2px solid #0A0A0A' }} />
                    <div className="text-[11px] font-bold mb-1 font-mono uppercase tracking-wide" style={{ color: '#888' }}>{b.fecha}</div>
                    <div className="text-sm font-medium text-white leading-relaxed">{b.partida}</div>
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
