'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'

type UserRole = { id: string; user_id: string; role: string; email?: string; nombre?: string; permisos?: any }
type Proyecto = { id: string; nombre: string }

const ROLE_LABEL: Record<string,string> = { admin: 'Admin', pm: 'PM', inversor: 'Inversor', viewer: 'Viewer' }
const ROLE_COLOR: Record<string,string> = { admin: '#A6855A', pm: '#60A5FA', inversor: '#22C55E', viewer: '#888' }
const ROLE_BG:    Record<string,string> = { admin: 'rgba(166,133,90,0.18)', pm: 'rgba(96,165,250,0.15)', inversor: 'rgba(34,197,94,0.15)', viewer: '#282828' }
const AVATAR_COLORS = ['#A6855A','#7C3AED','#2563EB','#16A34A','#DC2626','#0891B2']

const ALL_PAGES = [
  { id: 'bot',       label: 'Bot' },
  { id: 'proyectos', label: 'Proyectos' },
  { id: 'mercado',   label: 'Mercado' },
  { id: 'deuda',     label: 'Deuda' },
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
      const res = await authFetch('/api/invite', {
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
  const INP = { background: '#F2F1ED', border: '1.5px solid #ECEAE4', color: '#111' } as const
  const card = { background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)' }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '28px 20px 40px' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()}
          className="w-[32px] h-[32px] rounded-xl flex items-center justify-center font-black text-base"
          style={{ background: '#fff', border: '1px solid #ECEAE4', color: '#555', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>←</button>
        <div className="flex-1 font-black text-[22px]" style={{ color: '#111', letterSpacing: '-0.02em' }}>Usuarios y permisos</div>
      </div>

      {/* Users list */}
      <div style={{ ...card, overflow: 'hidden', marginBottom: 16 }}>
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: '1px solid #F2F1ED' }}>
          <div>
            <div className="font-black text-[15px]" style={{ color: '#111' }}>Usuarios</div>
            <div className="text-xs mt-0.5" style={{ color: '#AAA' }}>{displayUsers.length} miembro{displayUsers.length !== 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setInviteOpen(true)}
            className="text-sm font-black px-4 py-2 rounded-xl"
            style={{ background: '#A6855A', color: '#14110C' }}>
            + Invitar
          </button>
        </div>

        {loading ? (
          [1,2,3].map(i => <div key={i} className="mx-5 my-3 h-14 rounded-xl animate-pulse" style={{ background: '#F2F1ED' }} />)
        ) : displayUsers.map((u, i) => (
          <div key={u.id} className="px-5 py-4 flex items-center gap-3"
            style={{ borderTop: i > 0 ? '1px solid #F2F1ED' : 'none' }}>
            <div className="w-[40px] h-[40px] rounded-full flex items-center justify-center text-[14px] font-black flex-shrink-0"
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length], color: AVATAR_COLORS[i % AVATAR_COLORS.length] === '#A6855A' ? '#14110C' : '#fff' }}>
              {initials(u.nombre || u.email || '?')}
            </div>
            <div className="flex-1 min-w-0">
              {u.nombre && <div className="text-sm font-bold truncate" style={{ color: '#111' }}>{u.nombre}</div>}
              <div className="text-xs font-mono mt-0.5 truncate" style={{ color: '#AAA' }}>{u.email || u.user_id}</div>
            </div>
            <span className="text-[12px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide flex-shrink-0"
              style={{ background: ROLE_BG[u.role] || '#F2F1ED', color: ROLE_COLOR[u.role] || '#888' }}>
              {ROLE_LABEL[u.role] || u.role}
            </span>
            <button onClick={() => openEdit(u)}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
              style={{ background: '#F2F1ED', color: '#555' }}>✎</button>
            {roles.length > 0 && (
              <button onClick={() => deleteUser(u)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.08)', color: '#EF4444' }}>✕</button>
            )}
          </div>
        ))}
      </div>

      {/* ── EDIT MODAL ── */}
      {editUser && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setEditUser(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[24px] overflow-y-auto"
            style={{ background: '#fff', maxWidth: 520, margin: '0 auto', maxHeight: '90vh' }}>
            <div className="p-5 pb-10">
              <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#ECEAE4' }} />
              <div className="font-black text-[17px] mb-5" style={{ color: '#111' }}>Editar usuario</div>

              <div className="space-y-3 mb-5">
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Nombre</label>
                  <input type="text" value={editForm.nombre} onChange={e => setEditForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Email</label>
                  <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Rol</label>
                  <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium"
                    style={{ ...INP, appearance: 'none' } as any}>
                    <option value="admin">Admin — acceso total</option>
                    <option value="pm">PM — acceso total</option>
                    <option value="inversor">Inversor — acceso restringido</option>
                    <option value="viewer">Viewer — acceso restringido</option>
                  </select>
                </div>
              </div>

              {isRestricted && (
                <div className="mb-5 rounded-2xl p-4" style={{ background: '#FFF7F0', border: '1.5px solid rgba(166,133,90,0.2)' }}>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#A6855A' }} />
                    <div className="text-[13px] font-black uppercase tracking-wide" style={{ color: '#A6855A' }}>Control de acceso</div>
                  </div>
                  <div className="mb-4">
                    <div className="text-[12px] font-bold uppercase tracking-wide mb-2" style={{ color: '#AAA' }}>Páginas visibles</div>
                    <div className="grid grid-cols-2 gap-2">
                      {ALL_PAGES.map(p => {
                        const on = editPages.includes(p.id)
                        return (
                          <button key={p.id} onClick={() => togglePage(p.id)}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-bold"
                            style={{
                              background: on ? 'rgba(166,133,90,0.10)' : '#F2F1ED',
                              border: `1.5px solid ${on ? '#A6855A' : '#ECEAE4'}`,
                              color: on ? '#A6855A' : '#888',
                            }}>
                            <span>{on ? '✓' : '○'}</span>
                            <span>{p.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {editPages.includes('proyectos') && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[12px] font-bold uppercase tracking-wide" style={{ color: '#AAA' }}>Proyectos permitidos</div>
                        <button onClick={() => setEditProjectIds(editProjectIds === null ? [] : null)}
                          className="text-xs font-black px-2.5 py-1 rounded-lg"
                          style={{
                            background: editProjectIds === null ? 'rgba(34,197,94,0.10)' : '#F2F1ED',
                            color: editProjectIds === null ? '#16A34A' : '#888',
                            border: `1px solid ${editProjectIds === null ? 'rgba(34,197,94,0.3)' : '#ECEAE4'}`,
                          }}>
                          {editProjectIds === null ? '✓ Todos' : 'Seleccionar'}
                        </button>
                      </div>
                      {editProjectIds !== null && (
                        <div className="space-y-1.5 max-h-44 overflow-y-auto">
                          {proyectos.length === 0 ? (
                            <div className="text-xs text-center py-4" style={{ color: '#AAA' }}>Sin proyectos</div>
                          ) : proyectos.map(p => {
                            const sel = editProjectIds.includes(p.id)
                            return (
                              <button key={p.id} onClick={() => toggleProject(p.id)}
                                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-left"
                                style={{
                                  background: sel ? 'rgba(166,133,90,0.08)' : '#F2F1ED',
                                  border: `1px solid ${sel ? 'rgba(166,133,90,0.35)' : '#ECEAE4'}`,
                                  color: sel ? '#A6855A' : '#888',
                                }}>
                                <span>{sel ? '✓' : '○'}</span>
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

              {editMsg && <div className="mb-4 text-sm font-bold text-center" style={{ color: '#EF4444' }}>{editMsg}</div>}

              <div className="flex gap-2">
                <button onClick={() => setEditUser(null)}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black"
                  style={{ background: '#F2F1ED', color: '#888' }}>Cancelar</button>
                <button onClick={saveEdit} disabled={savingEdit}
                  className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40"
                  style={{ background: '#14110C', color: '#F8F3E9' }}>
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
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setInviteOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[24px] p-5 pb-10"
            style={{ background: '#fff', maxWidth: 520, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#ECEAE4' }} />
            <div className="font-black text-[17px] mb-5" style={{ color: '#111' }}>Invitar usuario</div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Email *</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="usuario@ejemplo.com"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor='#A6855A'}
                  onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Nombre</label>
                <input type="text" value={inviteNombre} onChange={e => setInviteNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium"
                  style={INP}
                  onFocus={e => e.target.style.borderColor='#A6855A'}
                  onBlur={e => e.target.style.borderColor='#ECEAE4'} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#AAA' }}>Rol</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium"
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
                style={{ background: '#F2F1ED', color: '#888' }}>Cancelar</button>
              <button onClick={handleInvite} disabled={inviting || !inviteEmail}
                className="flex-1 py-3.5 rounded-xl text-sm font-black disabled:opacity-40"
                style={{ background: '#14110C', color: '#F8F3E9' }}>
                {inviting ? 'Enviando...' : 'Invitar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
