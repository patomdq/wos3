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
    router.replace(section === 'inversor' ? '/inversor/portal' : '/proyectos')
  }

  const isWos = section === 'wos'

  return (
    <div style={{ minHeight: '100vh', background: '#F2F1ED', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#111', letterSpacing: -2, lineHeight: 1 }}>WALLEST</div>
          <div style={{ fontSize: 10, color: '#BBB', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', marginTop: 5 }}>
            Hasu Activos Inmobiliarios SL
          </div>
        </div>

        {/* Toggle */}
        <div style={{ display: 'flex', background: '#E8E6E0', borderRadius: 12, padding: 4, gap: 4, marginBottom: 20 }}>
          {(['wos', 'inversor'] as Section[]).map(s => (
            <button key={s} onClick={() => { setSection(s); setError('') }} style={{
              flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 800,
              background: section === s ? '#F26E1F' : 'transparent',
              color: section === s ? '#fff' : '#111',
              transition: 'all 0.15s',
            }}>
              {s === 'wos' ? 'WOS' : 'Portal Inversor'}
            </button>
          ))}
        </div>

        {/* Form card */}
        <div style={{ background: '#fff', border: '1px solid #ECEAE4', borderRadius: 18, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#111', marginBottom: 3 }}>
            {isWos ? 'Acceso operativo' : 'Acceso inversor'}
          </div>
          <div style={{ fontSize: 11, color: '#BBB', marginBottom: 20 }}>
            {isWos ? 'Panel de gestión interno de HASU' : 'Consultá el estado de tu inversión en tiempo real'}
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#CCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                Correo electrónico
              </div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder={isWos ? 'tu@wallest.pro' : 'tu@email.com'} required
                style={{ width: '100%', background: '#F2F1ED', border: '1.5px solid #ECEAE4', borderRadius: 11, padding: '11px 14px', fontSize: 13, color: '#111', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = '#F26E1F'}
                onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#CCC', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>
                Contraseña
              </div>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
                style={{ width: '100%', background: '#F2F1ED', border: '1.5px solid #ECEAE4', borderRadius: 11, padding: '11px 14px', fontSize: 13, color: '#111', outline: 'none', fontFamily: 'inherit' }}
                onFocus={e => e.target.style.borderColor = '#F26E1F'}
                onBlur={e => e.target.style.borderColor = '#ECEAE4'} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#F26E1F', cursor: 'pointer' }}>¿Olvidaste tu contraseña?</span>
            </div>

            {section === 'inversor' && (
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', background: '#F9F8F5', border: '1px solid #ECEAE4', borderRadius: 10, padding: '10px 12px', marginBottom: 16 }}>
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
                  style={{ marginTop: 1, flexShrink: 0, width: 15, height: 15, accentColor: '#F26E1F', cursor: 'pointer' }} />
                <span style={{ fontSize: 11, color: '#AAA', lineHeight: 1.4 }}>
                  Acepto los <span style={{ color: '#F26E1F', fontWeight: 700 }}>términos y condiciones</span> de Wallest
                </span>
              </label>
            )}

            {error && <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 12, fontWeight: 600 }}>{error}</div>}

            <button type="submit" disabled={loading} style={{
              width: '100%', background: '#F26E1F', color: '#fff', border: 'none',
              borderRadius: 11, padding: '13px', fontSize: 13, fontWeight: 900,
              cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Verificando...' : isWos ? 'Iniciar sesión →' : 'Ver mi inversión →'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', fontSize: 10, color: '#CCC', marginTop: 16 }}>
          Portal seguro · <span style={{ color: '#F26E1F', fontWeight: 700 }}>Berciamedia</span> para <span style={{ color: '#F26E1F', fontWeight: 700 }}>Hasu SL</span>
        </div>
      </div>
    </div>
  )
}
