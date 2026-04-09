'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type UserRole = { id: string; user_id: string; role: string; email?: string; nombre?: string; permisos?: any }
type Proyecto = { id: string; nombre: string }

const ROLE_LABEL: Record<string,string> = { admin: 'Admin', pm: 'PM', inversor: 'Inversor', viewer: 'Viewer' }
const ROLE_COLOR: Record<string,string> = { admin: '#F26E1F', pm: '#60A5FA', inversor: '#22C55E', viewer: '#888' }
const ROLE_BG:    Record<string,string> = { admin: 'rgba(242,110,31,0.18)', pm: 'rgba(96,165,250,0.15)', inversor: 'rgba(34,197,94,0.15)', viewer: '#282828' }
const AVATAR_COLORS = ['#E8621A','#7C3AED','#2563EB','#16A34A','#DC2626','#0891B2']

const ALL_PAGES = [
  { id: 'bot',       label: 'Bot' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'mercado',   label: 'Mercado' },
  { id: 'hasu',      label: 'HASU' },
]

const initials = (s: string) => s.split(/[\s@]+/).slice(0,2).map(n => n[0]?.toUpperCase() || '').join('') || '?'

const USERS_FALLBACK: UserRole[] = [
  { id: '1', user_id: '1', role: 'admin',    email: 'patricio@wallest.pro',    nombre: 'Patricio Fávora' },
  { id: '2', user_id: '2', role: 'admin',    email: 'silvia@wallest.pro',      nombre: 'Silvia Bergoglio' },
  { id: '3', user_id: '3', role: 'inversor', email: 'joseluisxp123@gmail.com', nombre: 'José Luis Zurán Parra' },
]

export default function AdminPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<UserRole[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNombre, setInviteNombre] = useState('')
  const [inviteRole, setInviteRole] = useState('inversor')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  // Edit modal
  const [editUser, setEditUser] = useState<UserRole | null>(null)
  const [editForm, setEditForm] = useState({ nombre: '', email: '', role: 'inversor' })
  const [editPages, setEditPages] = useState<string[]>(['bot','proyectos','mercado','hasu'])
  const [editProjectIds, setEditProjectIds] = useState<string[] | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  useEffect(() => {
    Promise.all([
      supabase.from('user_roles').select('*'),
      supabase.from('proyectos').select('id,nombre').order('nombre'),
    ]).then(([{ data: users }, { data: projs }]) => {
      if (users && users.length > 0 && users.some((r: any) => r.email || r.nombre)) setRoles(users)
      setProyectos(projs || [])
      setLoading(false)
    })
  }, [])

  const displayUsers = roles.length > 0 ? roles : USERS_FALLBACK

  const openEdit = (u: UserRole) => {
    setEditForm({ nombre: u.nombre || '', email: u.email || '', role: u.role })
    const p = u.permisos
    if (p) {
      setEditPages(p.pages || [])
      setEditProjectIds(p.project_ids ?? null)
    } else {
      setEditPages(['bot','proyectos','mercado','hasu'])
      setEditProjectIds(null)
    }
    setEditMsg('')
    setEditUser(u)
  }

  const saveEdit = async () => {
    if (!editUser) return
    setSavingEdit(true)
    setEditMsg('')
    const isFullAccess = editForm.role === 'admin' || editForm.role === 'pm'
    const permisos = isFullAccess ? null : { pages: editPages, project_ids: editProjectIds }
    const payload = {
      nombre: editForm.nombre || null,
      email: editForm.email || null,
      role: editForm.role,
      permisos,
    }
    const { error } = await supabase.from('user_roles').update(payload).eq('id', editUser.id)
    if (error) {
      setEditMsg('Error: ' + error.message)
    } else {
      setRoles(prev => prev.map(r => r.id === editUser.id ? { ...r, ...payload } : r))
      setEditUser(null)
    }
    setSavingEdit(false)
  }

  const togglePage = (pageId: string) => {
    setEditPages(prev => prev.includes(pageId) ? prev.filter(p => p !== pageId) : [...prev, pageId])
  }

  const toggleProject = (pid: string) => {
    setEditProjectIds(prev => {
      const cur = prev || []
      return cur.includes(pid) ? cur.filter(p => p !== pid) : [...cur, pid]
    })
  }

  const handleInvite = async () => {
    if (!inviteEmail) return
    setInviting(true)
    setInviteMsg('')
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole, nombre: inviteNombre }),
      })
      const json = await res.json()
      if (json.error) {
        setInviteMsg(`Error: ${json.error}`)
      } else {
        setRoles(prev => [...prev, json.user])
        setInviteMsg(json.invited ? '✓ Invitación enviada por email' : '✓ Usuario agregado al sistema')
        setTimeout(() => { setInviteOpen(false); setInviteEmail(''); setInviteNombre(''); setInviteMsg('') }, 2000)
      }
    } catch {
      setInviteMsg('Error de conexión')
    }
    setInviting(false)
  }

  const deleteUser = async (u: UserRole) => {
    if (!confirm(`¿Quitar a ${u.email || u.nombre} del sistema?`)) return
    const { error } = await supabase.from('user_roles').delete().eq('id', u.id)
    if (!error) setRoles(prev => prev.filter(r => r.id !== u.id))
  }

  const isRestricted = editForm.role === 'inversor' || editForm.role === 'viewer'
  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()}
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-base text-white"
          style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>←</button>
        <div className="flex-1 font-bold text-[17px] text-white">Usuarios y permisos</div>
      </div>

      {/* Users list */}
      <div className="rounded-2xl mb-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 pb-3 flex items-center justify-between">
          <div>
            <div className="font-black text-[15px] text-white">Usuarios</div>
            <div className="text-xs mt-0.5" style={{ color: '#888' }}>{displayUsers.length} miembro{displayUsers.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setInviteOpen(true)}
            className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
            style={{ background: '#F26E1F' }}>
            + Invitar
          </button>
        </div>

        {loading ? (
          [1,2,3].map(i => <div key={i} className="mx-4 mb-2 h-14 rounded-xl animate-pulse" style={{ background: '#1E1E1E' }} />)
        ) : displayUsers.map((u, i) => (
          <div key={u.id} className="px-4 py-3.5 flex items-center gap-3"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[13px] font-black text-white flex-shrink-0"
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {initials(u.nombre || u.email || '?')}
            </div>
            <div className="flex-1 min-w-0">
              {u.nombre && <div className="text-sm font-bold text-white truncate">{u.nombre}</div>}
              <div className="text-xs font-mono mt-0.5 truncate" style={{ color: '#888' }}>{u.email || u.user_id}</div>
            </div>
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide flex-shrink-0"
              style={{ background: ROLE_BG[u.role] || '#282828', color: ROLE_COLOR[u.role] || '#888' }}>
              {ROLE_LABEL[u.role] || u.role}
            </span>
            <button onClick={() => openEdit(u)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>✎</button>
            {roles.length > 0 && (
              <button onClick={() => deleteUser(u)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>✕</button>
            )}
          </div>
        ))}
      </div>

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setEditUser(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] overflow-y-auto"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto', maxHeight: '90vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
              <div className="font-black text-[17px] text-white mb-5">Editar usuario</div>

              {/* Datos básicos */}
              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Nombre</label>
                  <input type="text" value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Rol</label>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                    style={{ ...INP, appearance: 'none' } as any}>
                    <option value="admin">Admin — acceso total</option>
                    <option value="pm">PM — acceso total</option>
                    <option value="inversor">Inversor — acceso restringido</option>
                    <option value="viewer">Viewer — acceso restringido</option>
                  </select>
                </div>
              </div>

              {/* Permisos (solo para inversor/viewer) */}
              {isRestricted && (
                <div className="mb-5 rounded-2xl p-4" style={{ background: '#1A1A1A', border: '1px solid rgba(242,110,31,0.2)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#F26E1F' }} />
                    <div className="text-[12px] font-black uppercase tracking-wide" style={{ color: '#F26E1F' }}>Control de acceso</div>
                  </div>

                  {/* Páginas */}
                  <div className="mb-4">
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: '#666' }}>Páginas visibles</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_PAGES.map(p => {
                        const on = editPages.includes(p.id)
                        return (
                          <button key={p.id} onClick={() => togglePage(p.id)}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold"
                            style={{
                              background: on ? 'rgba(242,110,31,0.15)' : '#111',
                              border: `1.5px solid ${on ? '#F26E1F' : 'rgba(255,255,255,0.07)'}`,
                              color: on ? '#F26E1F' : '#555',
                            }}>
                            <span style={{ fontSize: 16 }}>{on ? '✓' : '○'}</span>
                            <span>{p.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Proyectos */}
                  {editPages.includes('proyectos') && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#666' }}>Proyectos permitidos</div>
                        <button
                          onClick={() => setEditProjectIds(editProjectIds === null ? [] : null)}
                          className="text-xs font-black px-2.5 py-1 rounded-lg"
                          style={{
                            background: editProjectIds === null ? 'rgba(34,197,94,0.15)' : '#111',
                            color: editProjectIds === null ? '#22C55E' : '#888',
                            border: `1px solid ${editProjectIds === null ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.08)'}`,
                          }}>
                          {editProjectIds === null ? '✓ Todos' : 'Seleccionar'}
                        </button>
                      </div>
                      {editProjectIds !== null && (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {proyectos.length === 0 ? (
                            <div className="text-xs text-center py-4" style={{ color: '#444' }}>Sin proyectos en la base de datos</div>
                          ) : proyectos.map(p => {
                            const sel = editProjectIds.includes(p.id)
                            return (
                              <button key={p.id} onClick={() => toggleProject(p.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left"
                                style={{
                                  background: sel ? 'rgba(242,110,31,0.12)' : '#111',
                                  border: `1px solid ${sel ? 'rgba(242,110,31,0.35)' : 'rgba(255,255,255,0.06)'}`,
                                  color: sel ? '#F26E1F' : '#888',
                                }}>
                                <span style={{ fontSize: 15 }}>{sel ? '✓' : '○'}</span>
                                <span>{p.nombre}</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {editMsg && (
                <div className="mb-4 text-sm font-bold text-center" style={{ color: '#EF4444' }}>{editMsg}</div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setEditUser(null)}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black"
                  style={{ background: '#282828', color: '#888' }}>Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                  style={{ background: '#F26E1F' }}>
                  {savingEdit ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── INVITE MODAL ── */}
      {inviteOpen && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setInviteOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-8"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="font-black text-[17px] text-white mb-5">Invitar usuario</div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Email *</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor='#F26E1F'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Nombre</label>
                <input type="text" value={inviteNombre} onChange={e => setInviteNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor='#F26E1F'}
                  onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.10)'} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Rol</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                  style={{ ...INP, appearance: 'none' } as any}>
                  <option value="admin">Admin</option>
                  <option value="pm">PM</option>
                  <option value="inversor">Inversor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            {inviteMsg && (
              <div className="mb-4 text-sm font-bold text-center"
                style={{ color: inviteMsg.startsWith('Error') ? '#EF4444' : '#22C55E' }}>
                {inviteMsg}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setInviteOpen(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-black"
                style={{ background: '#282828', color: '#888' }}>Cancelar</button>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{ background: '#F26E1F' }}>
                {inviting ? 'Enviando...' : 'Invitar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
