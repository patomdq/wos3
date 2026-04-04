'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type UserRole = { id: string; user_id: string; role: string; email?: string }

const ROLE_COLOR: Record<string,string> = { admin: '#F26E1F', pm: '#60A5FA', inversor: '#22C55E', viewer: '#888' }
const ROLE_BG: Record<string,string> = { admin: 'rgba(242,110,31,0.18)', pm: 'rgba(96,165,250,0.15)', inversor: 'rgba(34,197,94,0.15)', viewer: '#282828' }

const AVATAR_COLORS = ['#E8621A','#7C3AED','#2563EB','#16A34A','#DC2626','#0891B2']
const initials = (name: string) => name.split(' ').slice(0,2).map(n => n[0]).join('').toUpperCase()

export default function AdminPage() {
  const router = useRouter()
  const [roles, setRoles] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [perms, setPerms] = useState({ zurgena: true, cuevas: false, portal: true, finanzas: false })

  const USERS_FALLBACK = [
    { id: '1', user_id: '1', role: 'admin', email: 'pato@wallest.pro', nombre: 'Patricio Fávora' },
    { id: '2', user_id: '2', role: 'admin', email: 'silvia@wallest.pro', nombre: 'Silvia Bergoglio' },
    { id: '3', user_id: '3', role: 'pm', email: 'jlzurano@gmail.com', nombre: 'José Luis Zurano' },
    { id: '4', user_id: '4', role: 'pm', email: 'marcela@wallest.pro', nombre: 'Marcela Adorno' },
  ]

  useEffect(() => {
    supabase.from('user_roles').select('*').then(({ data }) => {
      if (data && data.length > 0) setRoles(data)
      setLoading(false)
    })
  }, [])

  const displayUsers = roles.length > 0 ? roles : USERS_FALLBACK

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-base text-white" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>←</button>
        <div className="flex-1 font-bold text-[17px] text-white">Usuarios y permisos</div>
      </div>

      {/* Users */}
      <div className="rounded-2xl mb-4" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 pb-0 flex items-center justify-between">
          <div className="font-black text-[15px] text-white">Usuarios</div>
          <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Invitar</span>
        </div>
        {displayUsers.map((u: any, i) => (
          <div key={u.id} className="px-4 py-3.5 flex items-center gap-3"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
            <div className="w-[38px] h-[38px] rounded-full flex items-center justify-center text-[13px] font-black text-white flex-shrink-0"
              style={{ background: AVATAR_COLORS[i % AVATAR_COLORS.length] }}>
              {initials(u.nombre || u.email || '?')}
            </div>
            <div className="flex-1">
              <div className="text-sm font-bold text-white">{u.nombre || '—'}</div>
              <div className="text-xs font-medium font-mono mt-0.5" style={{ color: '#888' }}>{u.email || u.user_id}</div>
            </div>
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide"
              style={{ background: ROLE_BG[u.role] || '#282828', color: ROLE_COLOR[u.role] || '#888' }}>
              {u.role}
            </span>
          </div>
        ))}
      </div>

      {/* Permisos */}
      <div className="rounded-2xl" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 pb-0">
          <div className="font-black text-[15px] text-white mb-0.5">Permisos — José Luis Zurano</div>
          <div className="text-xs font-medium mb-4" style={{ color: '#888' }}>PM · Inversor JV</div>
        </div>
        {[
          { key: 'zurgena', label: 'Zurgena 1', desc: 'Ver y cargar notas de campo' },
          { key: 'cuevas', label: 'Cuevas 1', desc: 'Sin acceso' },
          { key: 'portal', label: 'Portal inversor', desc: 'inversores.wallest.pro' },
          { key: 'finanzas', label: 'Finanzas HASU', desc: 'Siempre bloqueado', locked: true },
        ].map((p, i) => (
          <div key={p.key} className="px-4 py-3.5 flex items-center justify-between"
            style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <div className="text-sm font-bold" style={{ color: p.locked ? '#555' : '#fff' }}>{p.label}</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: '#555' }}>{p.desc}</div>
            </div>
            <button
              onClick={() => !p.locked && setPerms(prev => ({ ...prev, [p.key]: !prev[p.key as keyof typeof prev] }))}
              disabled={p.locked}
              className="w-[42px] h-6 rounded-full relative transition-colors flex-shrink-0"
              style={{
                background: (perms as any)[p.key] ? '#22C55E' : '#282828',
                opacity: p.locked ? 0.25 : 1,
                pointerEvents: p.locked ? 'none' : 'auto',
              }}>
              <div className="w-[18px] h-[18px] rounded-full bg-white absolute top-[3px] transition-all"
                style={{ left: (perms as any)[p.key] ? 21 : 3, boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
