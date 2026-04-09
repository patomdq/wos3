'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type UserRole = { id: string; user_id: string; role: string; email?: string; nombre?: string }

const ROLE_LABEL: Record<string,string> = { admin: 'Admin', pm: 'PM', inversor: 'Inversor', viewer: 'Viewer' }
const ROLE_COLOR: Record<string,string> = { admin: '#F26E1F', pm: '#60A5FA', inversor: '#22C55E', viewer: '#888' }
const ROLE_BG:    Record<string,string> = { admin: 'rgba(242,110,31,0.18)', pm: 'rgba(96,165,250,0.15)', inversor: 'rgba(34,197,94,0.15)', viewer: '#282828' }
const AVATAR_COLORS = ['#E8621A','#7C3AED','#2563EB','#16A34A','#DC2626','#0891B2']

const initials = (s: string) => s.split(/[\s@]+/).slice(0,2).map(n => n[0]?.toUpperCase() || '').join('') || '?'

const USERS_FALLBACK: UserRole[] = [
  { id: '1', user_id: '1', role: 'admin',    email: 'patricio@wallest.pro',    nombre: 'Patricio Fávora' },
  { id: '2', user_id: '2', role: 'admin',    email: 'silvia@wallest.pro',      nombre: 'Silvia' },
  { id: '3', user_id: '3', role: 'inversor', email: 'joseluisxp123@gmail.com', nombre: 'José Luis' },
]

export default function AdminPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteNombre, setInviteNombre] = useState('')
  const [inviteRole, setInviteRole] = useState('inversor')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')

  useEffect(() => {
    supabase.from('user_roles').select('*').then(({ data }) => {
      if (data && data.length > 0 && data.some((r: any) => r.email || r.nombre)) setRoles(data)
      setLoading(false)
    })
  }, [])

  const displayUsers = roles.length > 0 ? roles : USERS_FALLBACK

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
            {roles.length > 0 && (
              <button onClick={() => deleteUser(u)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>✕</button>
            )}
          </div>
        ))}
      </div>

      {/* Invite modal */}
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
