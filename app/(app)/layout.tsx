'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace('/login')
      else setLoading(false)
    })
  }, [router])

  if (loading) return (
    <div className="h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
      <div style={{ color: '#888' }} className="text-sm font-semibold animate-pulse">Cargando WOS...</div>
    </div>
  )

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#0A0A0A' }}>
      <Nav />
      <main className="flex-1 overflow-y-auto overflow-x-hidden pb-[70px] md:pb-0">
        {children}
      </main>
    </div>
  )
}
