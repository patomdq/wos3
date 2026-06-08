'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Section = 'wos' | 'inversor'

export default function LoginPage() {
  const router = useRouter()
  const [section, setSection] = useState<Section>('wos')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [terms, setTerms] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (section === 'inversor' && !terms) {
      setError('Debés aceptar los términos y condiciones.')
      return
    }
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }
    if (section === 'inversor') {
      router.replace('/inversor/portal')
    } else {
      router.replace('/proyectos')
    }
  }

  const isWos = section === 'wos'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ background: isWos ? '#0A0A0A' : '#F2F1ED', transition: 'background 0.3s ease' }}>
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-[52px] h-[52px] rounded-2xl flex items-center justify-center font-black text-[22px] text-white mx-auto mb-4"
            style={{ background: '#F26E1F', boxShadow: '0 4px 16px rgba(242,110,31,0.3)' }}>W</div>
          <div className="font-black text-[28px] leading-tight"
            style={{ color: isWos ? '#fff' : '#111', letterSpacing: -1 }}>Wallest</div>
          <div className="text-sm font-medium mt-1" style={{ color: isWos ? '#666' : '#AAA' }}>
            Hasu Activos Inmobiliarios SL
          </div>
        </div>

        {/* Selector de acceso */}
        <div className="flex rounded-2xl p-1 mb-6"
          style={{ background: isWos ? '#141414' : '#E8E6E0', border: isWos ? '1px solid rgba(255,255,255,0.08)' : '1px solid #DEDAD2' }}>
          <button
            onClick={() => { setSection('wos'); setError('') }}
            className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: isWos ? '#F26E1F' : 'transparent',
              color: isWos ? '#fff' : '#888',
            }}>
            🏗️ WOS
          </button>
          <button
            onClick={() => { setSection('inversor'); setError('') }}
            className="flex-1 py-2.5 rounded-xl text-sm font-black transition-all"
            style={{
              background: !isWos ? '#F26E1F' : 'transparent',
              color: !isWos ? '#fff' : '#888',
            }}>
            📊 Portal Inversor
          </button>
        </div>

        {/* Card formulario */}
        <div className="w-full rounded-2xl p-6 mb-4"
          style={{
            background: isWos ? '#141414' : '#fff',
            border: isWos ? '1px solid rgba(255,255,255,0.08)' : '1px solid #ECEAE4',
            boxShadow: isWos ? 'none' : '0 1px 3px rgba(0,0,0,0.06),0 4px 16px rgba(0,0,0,0.04)',
          }}>

          <div className="font-black text-[18px] mb-0.5"
            style={{ color: isWos ? '#fff' : '#111' }}>
            {isWos ? 'Acceso operativo' : 'Acceso inversor'}
          </div>
          <div className="text-sm font-medium mb-5"
            style={{ color: isWos ? '#666' : '#AAA' }}>
            {isWos ? 'Panel de gestión interno de HASU' : 'Consultá el estado de tu inversión en tiempo real'}
          </div>

          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5"
                style={{ color: isWos ? '#ccc' : '#AAA' }}>
                Correo electrónico
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={isWos ? 'tu@wallest.pro' : 'tu@email.com'} required
                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-medium"
                style={{
                  background: isWos ? '#1E1E1E' : '#F2F1ED',
                  border: `1.5px solid ${isWos ? 'rgba(255,255,255,0.08)' : '#ECEAE4'}`,
                  color: isWos ? '#fff' : '#111',
                }}
                onFocus={e => e.target.style.borderColor = '#F26E1F'}
                onBlur={e => e.target.style.borderColor = isWos ? 'rgba(255,255,255,0.08)' : '#ECEAE4'} />
            </div>
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5"
                style={{ color: isWos ? '#ccc' : '#AAA' }}>
                Contraseña
              </label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                className="w-full rounded-xl px-4 py-3 text-sm outline-none font-medium"
                style={{
                  background: isWos ? '#1E1E1E' : '#F2F1ED',
                  border: `1.5px solid ${isWos ? 'rgba(255,255,255,0.08)' : '#ECEAE4'}`,
                  color: isWos ? '#fff' : '#111',
                }}
                onFocus={e => e.target.style.borderColor = '#F26E1F'}
                onBlur={e => e.target.style.borderColor = isWos ? 'rgba(255,255,255,0.08)' : '#ECEAE4'} />
            </div>

            <div className="flex justify-end mb-4">
              <span className="text-sm font-bold cursor-pointer" style={{ color: '#F26E1F' }}>
                ¿Olvidaste tu contraseña?
              </span>
            </div>

            {section === 'inversor' && (
              <label className="flex items-start gap-2.5 cursor-pointer mb-5 p-3.5 rounded-xl"
                style={{ background: '#F2F1ED', border: '1px solid #ECEAE4' }}>
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
                  className="mt-0.5 flex-shrink-0 w-[18px] h-[18px] cursor-pointer"
                  style={{ accentColor: '#F26E1F' }} />
                <span className="text-sm font-medium leading-snug" style={{ color: '#555' }}>
                  Acepto los <span style={{ color: '#F26E1F' }} className="font-bold">términos y condiciones</span> de Wallest
                </span>
              </label>
            )}

            {error && (
              <div className="text-sm font-medium mb-3" style={{ color: '#EF4444' }}>{error}</div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-4 text-white rounded-xl text-sm font-black disabled:opacity-50 transition-opacity"
              style={{ background: '#F26E1F' }}>
              {loading ? 'Verificando...' : isWos ? 'Iniciar sesión →' : 'Ver mi inversión →'}
            </button>
          </form>
        </div>

        <div className="text-center text-xs" style={{ color: isWos ? '#555' : '#AAA' }}>
          Portal seguro · <span style={{ color: '#F26E1F' }} className="font-bold">Berciamedia</span> para{' '}
          <span style={{ color: '#F26E1F' }} className="font-bold">Hasu SL</span>
        </div>
      </div>
    </div>
  )
}
