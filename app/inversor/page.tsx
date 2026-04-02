'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function InversorLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!terms) { setError('Debés aceptar los términos y condiciones.'); return }
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
    else router.replace('/inversor/portal')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#0A0A0A' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-[52px] h-[52px] rounded-xl flex items-center justify-center font-black text-[22px] text-white mx-auto mb-3" style={{ background: '#F26E1F' }}>W</div>
          <div className="font-black text-[28px] text-white leading-tight" style={{ letterSpacing: -1 }}>Wallest</div>
          <div className="text-sm font-medium mt-1 leading-snug" style={{ color: '#888' }}>Portal de Inversores<br />Hasu Activos Inmobiliarios SL</div>
        </div>

        <form onSubmit={handleLogin} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }} className="w-full rounded-2xl p-6 mb-4">
          <div className="font-black text-[18px] text-white mb-0.5">Acceso inversor</div>
          <div className="text-sm font-medium mb-5" style={{ color: '#888' }}>Consultá el estado de tu inversión en tiempo real</div>

          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" required
              className="w-full rounded-xl px-4 py-3 text-base text-white outline-none font-medium placeholder:text-[#555]"
              style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
              onFocus={e => e.target.style.borderColor = '#F26E1F'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
          </div>
          <div className="mb-3">
            <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
              className="w-full rounded-xl px-4 py-3 text-base text-white outline-none font-medium placeholder:text-[#555]"
              style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
              onFocus={e => e.target.style.borderColor = '#F26E1F'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
          </div>

          <div className="flex justify-end mb-4">
            <span className="text-sm font-bold cursor-pointer" style={{ color: '#F26E1F' }}>¿Olvidaste tu contraseña?</span>
          </div>

          {/* Terms checkbox */}
          <label className="flex items-start gap-2.5 cursor-pointer mb-5 p-3.5 rounded-xl" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
            <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
              className="mt-0.5 flex-shrink-0 w-[18px] h-[18px] cursor-pointer" style={{ accentColor: '#F26E1F' }} />
            <span className="text-sm font-medium leading-snug" style={{ color: '#ccc' }}>
              Acepto los <span style={{ color: '#F26E1F' }} className="font-bold">términos y condiciones</span> de Wallest
            </span>
          </label>

          {error && <div className="text-sm font-medium mb-3" style={{ color: '#EF4444' }}>{error}</div>}

          <button type="submit" disabled={loading}
            className="w-full py-4 text-white rounded-xl text-base font-black disabled:opacity-50 transition-colors"
            style={{ background: '#F26E1F' }}>
            {loading ? 'Verificando...' : 'Ver mi inversión →'}
          </button>
        </form>

        <div className="text-center text-xs" style={{ color: '#888' }}>
          Portal seguro · <span style={{ color: '#F26E1F' }} className="font-bold">Berciamedia</span> para <span style={{ color: '#F26E1F' }} className="font-bold">Hasu SL</span>
        </div>
      </div>
    </div>
  )
}
