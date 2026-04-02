'use client'
import { usePathname, useRouter } from 'next/navigation'

const items = [
  { id: 'bot', href: '/bot', icon: '◎', label: 'Bot' },
  { id: 'proyectos', href: '/proyectos', icon: '⊞', label: 'Proyectos' },
  { id: 'mercado', href: '/mercado', icon: '🔍', label: 'Mercado' },
  { id: 'hasu', href: '/hasu', icon: '🏢', label: 'HASU' },
]

export default function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const active = items.find(i => pathname.startsWith(i.href))?.id

  return (
    <>
      {/* Mobile bottom nav */}
      <nav style={{ background: '#141414', borderTop: '1px solid rgba(255,255,255,0.08)' }}
        className="md:hidden fixed bottom-0 left-0 right-0 h-[70px] flex items-center px-2 pb-1 z-20">
        {items.map(item => (
          <button key={item.id} onClick={() => router.push(item.href)}
            className="flex-1 flex flex-col items-center justify-center gap-1 min-h-[56px] rounded-xl transition-colors active:bg-white/5">
            <span className="text-[26px] leading-none">{item.icon}</span>
            <span className="text-[12px] font-bold uppercase tracking-wide"
              style={{ color: active === item.id ? '#F26E1F' : '#888' }}>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Desktop sidebar */}
      <nav style={{ background: '#141414', borderRight: '1px solid rgba(255,255,255,0.08)' }}
        className="hidden md:flex flex-col w-[220px] h-screen flex-shrink-0 p-3 gap-1">
        <div className="flex items-center gap-3 px-3 py-4 mb-2">
          <div style={{ background: '#F26E1F' }} className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm text-white">W</div>
          <span className="font-bold text-base text-white">WOS 3.0</span>
        </div>
        {items.map(item => (
          <button key={item.id} onClick={() => router.push(item.href)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors"
            style={{
              background: active === item.id ? 'rgba(242,110,31,0.18)' : 'transparent',
              color: active === item.id ? '#F26E1F' : '#888',
            }}>
            <span className="text-xl">{item.icon}</span>
            <span className="text-sm font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  )
}
