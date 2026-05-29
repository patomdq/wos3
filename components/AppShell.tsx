'use client'
import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser, canAccessPage } from '@/lib/user-context'
import BotChat from '@/components/BotChat'

type WosNotif = {
  id: string
  de_nombre: string
  proyecto: string
  contenido: string
  tipo: string
  leida: boolean
  created_at: string
}

const NAV_ITEMS = [
  { id: 'proyectos', href: '/proyectos', icon: '⊞', label: 'Proyectos' },
  { id: 'mercado',   href: '/mercado',   icon: '🔍', label: 'Mercado' },
  { id: 'hasu',      href: '/hasu',      icon: '🏢', label: 'HASU' },
  { id: 'bot',       href: '/bot',       icon: '◎',  label: 'Bot' },
]

const ALL_MOBILE_ITEMS = [
  { id: 'bot',       href: '/bot',       icon: '◎',  label: 'Bot' },
  { id: 'proyectos', href: '/proyectos', icon: '⊞',  label: 'Proyectos' },
  { id: 'mercado',   href: '/mercado',   icon: '🔍', label: 'Mercado' },
  { id: 'hasu',      href: '/hasu',      icon: '🏢', label: 'HASU' },
]

const initials = (s: string) => s.split(/[\s@]+/).slice(0,2).map(n => n[0]?.toUpperCase() || '').join('') || '?'

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const user = useUser()

  // Sidebar state
  const [collapsed, setCollapsed] = useState(false)
  const [botOpen, setBotOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Profile / pw
  const [profileOpen,  setProfileOpen]  = useState(false)
  const [changePwOpen, setChangePwOpen] = useState(false)
  const [pw,    setPw]    = useState('')
  const [pw2,   setPw2]   = useState('')
  const [pwMsg, setPwMsg] = useState('')
  const [saving, setSaving] = useState(false)

  // Notifications
  const [notifOpen,  setNotifOpen]  = useState(false)
  const [notifs,     setNotifs]     = useState<WosNotif[]>([])
  const [unread,     setUnread]     = useState(0)

  const loadNotifs = useCallback(async () => {
    if (!user?.handle) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('para_handle', user.handle)
      .order('created_at', { ascending: false })
      .limit(30)
    const list = (data || []) as WosNotif[]
    setNotifs(list)
    setUnread(list.filter(n => !n.leida).length)
  }, [user?.handle])

  useEffect(() => { loadNotifs() }, [loadNotifs])
  useEffect(() => {
    const t = setInterval(loadNotifs, 60_000)
    return () => clearInterval(t)
  }, [loadNotifs])

  const openNotifs = async () => {
    setNotifOpen(true)
    if (user?.handle && unread > 0) {
      await supabase.from('notifications').update({ leida: true }).eq('para_handle', user.handle).eq('leida', false)
      setUnread(0)
      setNotifs(prev => prev.map(n => ({ ...n, leida: true })))
    }
  }

  const timeAgo = (iso: string) => {
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 1) return 'ahora'
    if (mins < 60) return `hace ${mins}m`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `hace ${hrs}h`
    return `hace ${Math.floor(hrs / 24)}d`
  }

  const logout = async () => {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const changePassword = async () => {
    if (!pw || pw !== pw2) { setPwMsg('Las contraseñas no coinciden'); return }
    if (pw.length < 6) { setPwMsg('Mínimo 6 caracteres'); return }
    setSaving(true); setPwMsg('')
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) {
      setPwMsg('Error: ' + error.message)
    } else {
      setPwMsg('✓ Contraseña actualizada')
      setTimeout(() => { setChangePwOpen(false); setPw(''); setPw2(''); setPwMsg('') }, 1500)
    }
    setSaving(false)
  }

  const mobileItems = ALL_MOBILE_ITEMS.filter(item => canAccessPage(user?.permisos ?? null, item.id))
  const sidebarItems = NAV_ITEMS.filter(item => item.id !== 'bot' && canAccessPage(user?.permisos ?? null, item.id))
  const activeId = [...NAV_ITEMS].find(i => pathname.startsWith(i.href))?.id
  const userName = user?.nombre || user?.email || ''

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  return (
    <>
      {/* ══════════════════════════════════════════
          DESKTOP SIDEBAR (hidden on mobile)
      ══════════════════════════════════════════ */}
      <div className="hidden md:flex h-screen overflow-hidden flex-1">

        {/* Toggle button — fixed, always visible */}
        <button
          onClick={() => setCollapsed(c => !c)}
          style={{
            position: 'fixed',
            top: 18,
            left: collapsed ? 12 : 248,
            width: 26, height: 26,
            background: '#fff',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
            fontSize: 11, color: '#888',
            boxShadow: '0 1px 6px rgba(0,0,0,0.12)',
            zIndex: 30,
            border: '1px solid #ECEAE4',
            transition: 'left 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>

        {/* Sidebar */}
        <div style={{
          width: collapsed ? 0 : 240,
          minWidth: collapsed ? 0 : 240,
          height: '100vh',
          background: '#FAFAF8',
          borderRight: '1px solid #ECEAE4',
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)',
          overflow: 'hidden',
          flexShrink: 0,
          position: 'relative',
          zIndex: 20,
        }}>

          {/* Logo */}
          <div style={{ padding: '24px 20px 18px', borderBottom: '1px solid #ECEAE4', flexShrink: 0, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#111', letterSpacing: '-0.01em' }}>WALLEST</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#BBB', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1.4, marginTop: 2 }}>
              HASU ACTIVOS INMOBILIARIOS SL
            </div>
          </div>

          {/* Nav items */}
          <div style={{ padding: '10px 0', flex: 1, overflow: 'hidden' }}>
            {sidebarItems.map(item => {
              const isActive = activeId === item.id
              return (
                <button key={item.id}
                  onClick={() => router.push(item.href)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 20px', width: '100%',
                    cursor: 'pointer', background: isActive ? 'rgba(242,110,31,0.08)' : 'transparent',
                    border: 'none', textAlign: 'left',
                    whiteSpace: 'nowrap', overflow: 'hidden',
                    position: 'relative',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,0.04)' }}
                  onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                >
                  {isActive && (
                    <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, background: '#F26E1F', borderRadius: '0 3px 3px 0' }} />
                  )}
                  <div style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, color: isActive ? '#F26E1F' : undefined }}>
                    {item.icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 800 : 700, color: isActive ? '#111' : '#888' }}>
                    {item.label}
                  </div>
                </button>
              )
            })}
          </div>

          {/* User dropdown */}
          {dropdownOpen && (
            <div style={{
              position: 'absolute', bottom: 84, left: 12, right: 12,
              background: '#fff', borderRadius: 14, border: '1px solid #ECEAE4',
              padding: 8, display: 'flex', flexDirection: 'column', gap: 2,
              boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 50,
            }}>
              {user?.handle && (
                <button onClick={() => { setDropdownOpen(false); openNotifs() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#F59E0B', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}>
                  <span>🔔</span> Alertas
                  {unread > 0 && <span style={{ marginLeft: 'auto', background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 900, padding: '1px 5px', borderRadius: 99 }}>{unread}</span>}
                </button>
              )}
              <button onClick={() => { setDropdownOpen(false); setProfileOpen(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#888', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F2F1ED')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span>👤</span> Mi cuenta
              </button>
              <button onClick={() => { setDropdownOpen(false); setChangePwOpen(true) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#888', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#F2F1ED')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span>🔑</span> Ajustes
              </button>
              <button onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#EF4444', background: 'none', border: 'none', width: '100%', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#FEF2F2')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                <span>→</span> Cerrar sesión
              </button>
            </div>
          )}

          {/* User area */}
          <button
            onClick={() => setDropdownOpen(o => !o)}
            style={{
              padding: '16px 20px', borderTop: '1px solid #ECEAE4',
              display: 'flex', alignItems: 'center', gap: 12,
              cursor: 'pointer', position: 'relative', flexShrink: 0,
              overflow: 'hidden', whiteSpace: 'nowrap', background: 'none', border: 'none', width: '100%', textAlign: 'left',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.03)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <div style={{
              width: 42, height: 42, borderRadius: '50%',
              background: 'linear-gradient(135deg, #F26E1F, #FBBF24)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, fontWeight: 900, color: '#fff', flexShrink: 0, position: 'relative',
            }}>
              {initials(userName)}
              {unread > 0 && (
                <div style={{
                  position: 'absolute', top: -1, right: -1,
                  width: 12, height: 12, borderRadius: '50%',
                  background: '#EF4444', border: '2px solid #FAFAF8',
                  fontSize: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 900,
                }}>
                  {unread > 9 ? '9+' : unread}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{user?.nombre || 'Usuario'}</div>
              <div style={{ fontSize: 10, color: '#AAA', marginTop: 2 }}>{user?.email}</div>
            </div>
          </button>
        </div>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>

        {/* Bot panel */}
        <div style={{
          width: botOpen ? 380 : 0,
          minWidth: botOpen ? 380 : 0,
          height: '100vh',
          background: '#0A0A0A',
          borderLeft: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', flexDirection: 'column',
          transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s',
          overflow: 'hidden',
          flexShrink: 0,
        }}>
          {botOpen && <BotChat storageKeySuffix="_panel" />}
        </div>

        {/* Bot FAB */}
        {!botOpen && (
          <button
            onClick={() => setBotOpen(true)}
            style={{
              position: 'fixed', bottom: 24, right: 24,
              width: 62, height: 62, borderRadius: '50%',
              background: '#F26E1F',
              boxShadow: '0 4px 20px rgba(242,110,31,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, cursor: 'pointer', border: 'none',
              zIndex: 100,
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 6px 28px rgba(242,110,31,0.5)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 20px rgba(242,110,31,0.4)' }}
          >
            🤖
          </button>
        )}
        {botOpen && (
          <button
            onClick={() => setBotOpen(false)}
            style={{
              position: 'fixed', bottom: 24, right: 24,
              width: 36, height: 36, borderRadius: '50%',
              background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, color: '#888', cursor: 'pointer',
              zIndex: 100,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* ══════════════════════════════════════════
          MOBILE (bottom nav + full content)
      ══════════════════════════════════════════ */}
      <div className="flex flex-col md:hidden h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[70px]">
          {children}
        </main>

        <nav style={{ background: '#141414', borderTop: '1px solid rgba(255,255,255,0.08)' }}
          className="fixed bottom-0 left-0 right-0 h-[70px] flex items-center px-2 pb-1 z-20">
          {mobileItems.map(item => (
            <button key={item.id} onClick={() => router.push(item.href)}
              className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5">
              <span className="text-[26px] leading-none">{item.icon}</span>
              <span className="text-[12px] font-bold uppercase tracking-wide"
                style={{ color: activeId === item.id ? '#F26E1F' : '#888' }}>{item.label}</span>
            </button>
          ))}
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
                {unread > 0 ? `${unread}` : 'Alertas'}
              </span>
            </button>
          )}
          <button onClick={() => setProfileOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black text-white"
              style={{ background: '#E8621A' }}>
              {initials(userName)}
            </div>
            <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#888' }}>Cuenta</span>
          </button>
        </nav>
      </div>

      {/* ══════════════════════════════════════════
          SHARED MODALS (notifs, profile, pw)
      ══════════════════════════════════════════ */}

      {/* Notifications sheet */}
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

      {/* Profile sheet */}
      {profileOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setProfileOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-10"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 600, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-[16px] font-black text-white flex-shrink-0"
                style={{ background: '#E8621A' }}>
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

      {/* Change password */}
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
