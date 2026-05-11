'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser, canAccessPage } from '@/lib/user-context'

type Notification = {
  id: string
  de_nombre: string
  proyecto: string
  contenido: string
  tipo: string
  leida: boolean
  created_at: string
}

const ALL_ITEMS = [
  { id: 'bot',       href: '/bot',       icon: '◎',  label: 'Bot' },
  { id: 'proyectos', href: '/proyectos', icon: '⊞',  label: 'Proyectos' },
  { id: 'mercado',   href: '/mercado',   icon: '🔍', label: 'Mercado' },
  { id: 'hasu',      href: '/hasu',      icon: '🏢', label: 'HASU' },
]

const initials = (s: string) => s.split(/[\s@]+/).slice(0,2).map(n => n[0]?.toUpperCase() || '').join('') || '?'

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const user = useUser()

  const [profileOpen,  setProfileOpen]  = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [pw,    setPw]    = useState('')
  const [pw2,   setPw2]   = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // ── Notificaciones ──────────────────────────────────────────────────────────
  const [notifOpen,  setNotifOpen]  = useState(false)
  const [notifs,     setNotifs]     = useState<Notification[]>([])
  const [unread,     setUnread]     = useState(0)

  const loadNotifs = useCallback(async () => {
    if (!user?.handle) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('para_handle', user.handle)
      .order('created_at', { ascending: false })
      .limit(30)
    const list = (data || []) as Notification[]
    setNotifs(list)
    setUnread(list.filter(n => !n.leida).length)
  }, [user?.handle])

  useEffect(() => { loadNotifs() }, [loadNotifs])

  // Poll cada 60s para nuevas notificaciones
  useEffect(() => {
    const t = setInterval(loadNotifs, 60_000)
    return () => clearInterval(t)
  }, [loadNotifs])

  const openNotifs = async () => {
    setNotifOpen(true)
    // Marcar todas como leídas
    if (user?.handle && unread > 0) {
      await supabase
        .from('notifications')
        .update({ leida: true })
        .eq('para_handle', user.handle)
        .eq('leida', false)
      setUnread(0)
      setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
    }
  }

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1)   return 'ahora'
    if (mins < 60)  return `hace ${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24)   return `hace ${hrs}h`
    return `hace ${Math.floor(hrs / 24)}d`
  }

  const items = ALL_ITEMS.filter(item => canAccessPage(user?.permisos ?? null, item.id))
  const active = items.find(i => pathname.startsWith(i.href))?.id

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const changePassword = async () => {
    if (!pw || pw !== pw2) { setPwMsg('Las contraseñas no coinciden'); return }
    if (pw.length < 6) { setPwMsg('Mínimo 6 caracteres'); return }
    setSaving(true)
    setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      setPwMsg('Error: ' + error.message)
    } else {
      setPwMsg('✓ Contraseña actualizada')
      setTimeout(() => { setChangePwOpen(false); setPw(''); setPw2(''); setPwMsg('') }, 1500)
    }
    setSaving(false)
  }

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const
  const userName = user?.nombre || user?.email || ''
  const avatarBg = '#E8621A'

  return (
    <>
      {/* ── BOTTOM NAV (all screens) ── */}
      <nav style={{ background: '#141414', borderTop: '1px solid rgba(255,255,255,0.08)' }}
        className="fixed bottom-0 left-0 right-0 h-[70px] flex items-center px-2 pb-1 z-20">
        {items.map(item => (
          <button key={item.id} onClick={() => router.push(item.href)}
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5">
            <span className="text-[26px] leading-none">{item.icon}</span>
            <span className="text-[12px] font-bold uppercase tracking-wide"
              style={{ color: active === item.id ? '#F26E1F' : '#888' }}>{item.label}</span>
          </button>
        ))}
        {/* Bell button */}
        {user?.handle && (
          <button onClick={openNotifs}
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5 relative">
            <div className="relative">
              <span className="text-[24px] leading-none">🔔</span>
              {unread > 0 && (
                <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black text-white"
                  style={{ background: '#EF4444' }}>
                  {unread > 9 ? '9+' : unread}
                </div>
              )}
            </div>
            <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: unread > 0 ? '#EF4444' : '#888' }}>
              {unread > 0 ? `${unread} nueva${unread > 1 ? 's' : ''}` : 'Alertas'}
            </span>
          </button>
        )}

        {/* Profile button */}
        <button onClick={() => setProfileOpen(true)}
          className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white"
            style={{ background: avatarBg }}>
            {initials(userName)}
          </div>
          <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#888' }}>Cuenta</span>
        </button>
      </nav>

      {/* ── DESKTOP SIDEBAR (hidden for now) ── */}
      <nav style={{ background: '#141414', borderRight: '1px solid rgba(255,255,255,0.08)' }}
        className="hidden flex-col w-[220px] h-screen flex-shrink-0 p-3 gap-1">
        <div className="flex items-center gap-3 px-3 py-4 mb-2">
          <div style={{ background: '#F26E1F' }} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white">W</div>
          <span className="font-bold text-base text-white">WOS 3.0</span>
        </div>
        {items.map(item => (
          <button key={item.id} onClick={() => router.push(item.href)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
            style={{
              background: active === item.id ? 'rgba(242,110,31,0.18)' : 'transparent',
              color: active === item.id ? '#F26E1F' : '#888',
            }}>
            <span className="text-xl">{item.icon}</span>
            <span className="text-sm font-semibold">{item.label}</span>
          </button>
        ))}

        {/* Profile section — bottom of sidebar */}
        <div className="mt-auto pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl mb-1" style={{ background: '#1A1A1A' }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-black text-white flex-shrink-0"
              style={{ background: avatarBg }}>
              {initials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">{user?.nombre || 'Usuario'}</div>
              <div className="text-[10px] truncate" style={{ color: '#666' }}>{user?.email}</div>
            </div>
          </div>
          <button onClick={() => setChangePwOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ color: '#888' }}>
            <span>🔑</span><span>Cambiar contraseña</span>
          </button>
          <button onClick={logout}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold"
            style={{ color: '#EF4444' }}>
            <span>→</span><span>Cerrar sesión</span>
          </button>
        </div>
      </nav>

      {/* ── NOTIFICATIONS SHEET ── */}
      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setNotifOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] pb-10"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div className="p-5 pb-3 flex-shrink-0">
              <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#333' }} />
              <div className="font-black text-[17px] text-white">🔔 Notificaciones</div>
            </div>

            <div className="overflow-y-auto flex-1 px-5 pb-4">
              {notifs.length === 0 ? (
                <div className="text-center py-10">
                  <div className="text-4xl mb-3">🔔</div>
                  <div className="text-sm font-semibold" style={{ color: '#555' }}>Sin notificaciones</div>
                  <div className="text-xs mt-1" style={{ color: '#444' }}>Cuando alguien te mencione en la bitácora aparecerá acá</div>
                </div>
              ) : (
                <div className="space-y-2">
                  {notifs.map(n => (
                    <div key={n.id} className="rounded-2xl p-4"
                      style={{ background: n.leida ? '#1A1A1A' : '#1E1E1E', border: `1px solid ${n.leida ? 'rgba(255,255,255,0.05)' : 'rgba(242,110,31,0.25)'}` }}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          {!n.leida && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-0.5" style={{ background: '#F26E1F' }} />}
                          <div className="text-[12px] font-black" style={{ color: '#F26E1F' }}>{n.proyecto}</div>
                        </div>
                        <div className="text-[11px] flex-shrink-0" style={{ color: '#555' }}>{timeAgo(n.created_at)}</div>
                      </div>
                      <div className="text-[12px] font-bold mb-1" style={{ color: '#888' }}>{n.de_nombre}</div>
                      <div className="text-[13px] text-white leading-relaxed">{n.contenido}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── PROFILE SHEET ── */}
      {profileOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setProfileOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-10"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />

            {/* User info */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-black text-white flex-shrink-0"
                style={{ background: avatarBg }}>
                {initials(userName)}
              </div>
              <div>
                <div className="font-black text-base text-white">{user?.nombre || 'Usuario'}</div>
                <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{user?.email}</div>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide mt-1 inline-block"
                  style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>
                  {user?.role || 'viewer'}
                </span>
              </div>
            </div>

            <button onClick={() => { setProfileOpen(false); setChangePwOpen(true) }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold text-white mb-2"
              style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <span>🔑</span><span>Cambiar contraseña</span>
            </button>

            <button onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-bold mb-2"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#EF4444' }}>
              <span>→</span><span>Cerrar sesión</span>
            </button>
          </div>
        </>
      )}

      {/* ── CHANGE PASSWORD MODAL ── */}
      {changePwOpen && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.8)' }} onClick={() => setChangePwOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="font-black text-[17px] text-white mb-5">Cambiar contraseña</div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Nueva contraseña</label>
                <input type="password" value={pw} onChange={e => setPw(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Repetir contraseña</label>
                <input type="password" value={pw2} onChange={e => setPw2(e.target.value)}
                  placeholder="Repetí la contraseña"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
            </div>

            {pwMsg && (
              <div className="mb-4 text-sm font-bold text-center"
                style={{ color: pwMsg.startsWith('✓') ? '#22C55E' : '#EF4444' }}>
                {pwMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setChangePwOpen(false); setPw(''); setPw2(''); setPwMsg('') }}
                className="flex-1 py-3.5 rounded-xl text-sm font-black"
                style={{ background: '#282828', color: '#888' }}>Cancelar</button>
              <button onClick={changePassword} disabled={saving || !pw || !pw2}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{ background: '#F26E1F' }}>
                {saving ? 'Guardando...' : 'Actualizar'}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
