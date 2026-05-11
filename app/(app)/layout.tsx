'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { UserContext, UserInfo } from '@/lib/user-context'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<UserInfo | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      const email = session.user.email || ''
      const { data } = await supabase.from('user_roles').select('*').eq('email', email).single()
      setUser({
        email,
        role:     data?.role    || 'viewer',
        nombre:   data?.nombre,
        handle:   data?.handle,
        permisos: data?.permisos ?? null,
      })
      setLoading(false)
    })
  }, [router])

  if (loading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
      <div style={{ color: '#888' }} className="text-sm font-semibold animate-pulse">Cargando WOS...</div>
    </div>
  )

  return (
    <UserContext.Provider value={user}>
      <div className="flex h-screen overflow-hidden" style={{ background: '#0A0A0A' }}>
        <Nav />
        <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[70px]">
          {children}
        </main>
      </div>
    </UserContext.Provider>
  )
}
