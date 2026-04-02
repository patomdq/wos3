'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.replace('/bot')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#0A0A0A' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="font-black text-white leading-none mb-1" style={{ fontSize: 52, letterSpacing: -3 }}>WOS</div>
          <div className="text-sm font-medium" style={{ color: '#888' }}>Wallest · Hasu Activos Inmobiliarios SL</div>
        </div>
        <form onSubmit={handleLogin} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}
          className="w-full rounded-2xl p-6 mb-4">
          <div className="mb-4">
            <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#ccc' }}>
              Correo electrónico
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="tu@wallest.pro" required
              className="w-full rounded-xl px-4 py-3 text-base text-white outline-none font-medium placeholder:text-[#555]"
              style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
              onFocus={e => e.target.style.borderColor = '#F26E1F'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
          </div>
          <div className="mb-4">
            <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#ccc' }}>
              Contraseña
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required
              className="w-full rounded-xl px-4 py-3 text-base text-white outline-none font-medium placeholder:text-[#555]"
              style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
              onFocus={e => e.target.style.borderColor = '#F26E1F'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
          </div>
          {error && <div className="text-sm font-medium mb-3" style={{ color: '#EF4444' }}>{error}</div>}
          <div className="flex justify-end mb-4">
            <span className="text-sm font-bold cursor-pointer" style={{ color: '#F26E1F' }}>¿Olvidaste tu contraseña?</span>
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-4 text-white rounded-xl text-base font-black disabled:opacity-50 transition-colors"
            style={{ background: '#F26E1F' }}>
            {loading ? 'Ingresando...' : 'Iniciar sesión →'}
          </button>
        </form>
        <div className="text-center text-xs" style={{ color: '#888' }}>
          Desarrollado por <span style={{ color: '#F26E1F' }} className="font-bold">Berciamedia</span> para <span style={{ color: '#F26E1F' }} className="font-bold">Hasu SL</span>
        </div>
      </div>
    </div>
  )
}
