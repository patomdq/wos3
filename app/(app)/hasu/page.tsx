'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

function monthsUntilDec2027() {
  const now = new Date()
  const target = new Date(2027, 11, 1) // Dec 2027
  return Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()))
}

export default function HasuPage() {
  const router = useRouter()
  const [cuentas, setCuentas] = useState<any[]>([])
  const [proyectos, setProyectos] = useState<any[]>([])
  const [inversores, setInversores] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('cuentas_bancarias').select('*').eq('activa', true).order('created_at'),
      supabase.from('proyectos').select('id,nombre,estado,precio_compra,precio_venta_estimado'),
      supabase.from('inversores').select('id', { count: 'exact' }),
    ]).then(([c, p, inv]) => {
      setCuentas(c.data || [])
      setProyectos(p.data || [])
      setInversores(inv.count || 0)
      setLoading(false)
    })
  }, [])

  const activos = proyectos.filter(p => ['comprado','reforma','venta'].includes(p.estado))
  const totalCapital = cuentas.reduce((s, c) => s + (c.saldo_actual || 0), 0)
  const OBJETIVO = 1_000_000
  const pct = Math.min((totalCapital / OBJETIVO) * 100, 100)
  const mesesRestantes = monthsUntilDec2027()
  const porMes = Math.max(0, (OBJETIVO - totalCapital) / mesesRestantes)

  const MODULOS = [
    { icon: '🔧', bg: 'rgba(96,165,250,0.15)', nombre: 'Proveedores', desc: 'Gestión de proveedores y contactos', href: '/hasu/proveedores' },
    { icon: '🧾', bg: 'rgba(245,158,11,0.15)', nombre: 'Fiscal y gestoría', desc: 'IVA, IRPF, documentos legales', href: '/hasu/fiscal' },
    { icon: '📊', bg: 'rgba(34,197,94,0.15)', nombre: 'Flujo de caja global', desc: 'Todos los proyectos consolidados', href: '/hasu/flujo-caja' },
    { icon: '⚙', bg: 'rgba(242,110,31,0.18)', nombre: 'Usuarios y permisos', desc: 'Roles · accesos · proyectos', href: '/admin' },
    { icon: '📁', bg: '#282828', nombre: 'Docs de empresa', desc: 'Estatutos · contratos · CIF', href: '/hasu/docs' },
  ]

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">HASU</div>
      </div>

      {/* Objetivo hero */}
      {loading ? (
        <div className="h-32 rounded-2xl animate-pulse mb-5" style={{ background: '#141414' }} />
      ) : (
        <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          {/* decorative ring */}
          <div className="absolute right-[-30px] top-[-30px] w-[130px] h-[130px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(242,110,31,0.12) 0%, transparent 70%)' }} />
          <div className="text-[11px] font-bold uppercase tracking-[1.5px] mb-2" style={{ color: '#888' }}>Objetivo Hasu · Dic 2027</div>
          <div className="font-black text-[38px] text-white leading-none tracking-tight mb-1">
            {fmt(totalCapital)}
          </div>
          <div className="text-sm font-semibold mb-3" style={{ color: '#555' }}>de {fmt(OBJETIVO)}</div>

          {/* Progress bar */}
          <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: '#282828' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: pct < 20 ? '#EF4444' : pct < 50 ? '#F59E0B' : '#22C55E' }} />
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs font-black" style={{ color: pct < 20 ? '#EF4444' : pct < 50 ? '#F59E0B' : '#22C55E' }}>
              {pct.toFixed(1)}%
            </div>
            <div className="text-xs font-semibold text-right" style={{ color: '#555' }}>
              {mesesRestantes} meses · {fmt(porMes)}/mes necesario
            </div>
          </div>
        </div>
      )}

      <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Salud de la empresa</div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[
            { l: 'Capital HASU', v: fmt(totalCapital), s: '▲ actualizado', sc: '#22C55E' },
            { l: 'Faltan para 1M€', v: fmt(Math.max(0, OBJETIVO - totalCapital)), s: `${pct.toFixed(1)}% alcanzado`, sc: '#888' },
            { l: 'Proyectos activos', v: String(activos.length), s: `${proyectos.length} total`, sc: '#888' },
            { l: 'ROI medio', v: '—', s: 'activos', sc: '#888' },
            { l: 'Inversores', v: String(inversores), s: 'JV activos', sc: '#888' },
            { l: 'Cuentas', v: String(cuentas.length), s: 'activas', sc: '#888' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{k.l}</div>
              <div className="font-black text-[21px] text-white leading-none">{k.v}</div>
              {k.s && <div className="text-xs font-semibold mt-1" style={{ color: k.sc || '#888' }}>{k.s}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Cuentas bancarias */}
      <div className="rounded-2xl mb-5" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 pb-0 flex items-center justify-between">
          <div className="font-black text-[15px] text-white">Cuentas bancarias</div>
          <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Cuenta</span>
        </div>
        {loading ? (
          <div className="p-4 text-sm" style={{ color: '#555' }}>Cargando...</div>
        ) : cuentas.length === 0 ? (
          <div className="p-4 text-sm text-center" style={{ color: '#555' }}>Sin cuentas registradas</div>
        ) : cuentas.map((c, i) => (
          <div key={c.id} className="px-4 py-3.5 flex justify-between items-center"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
            <div>
              <div className="text-sm font-bold text-white">{c.nombre}</div>
              <div className="text-xs font-medium mt-0.5 font-mono" style={{ color: '#888' }}>{c.banco}{c.iban_parcial ? ` · ****${c.iban_parcial}` : ''}</div>
            </div>
            <div className="font-black text-base" style={{ color: '#22C55E' }}>{fmt(c.saldo_actual || 0)}</div>
          </div>
        ))}
      </div>

      {/* Módulos */}
      <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Módulos empresa</div>
      {MODULOS.map(m => (
        <button key={m.nombre} onClick={() => router.push(m.href)}
          className="w-full flex items-center gap-3.5 p-4 rounded-xl mb-2 text-left transition-colors active:opacity-70"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: m.bg }}>{m.icon}</div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">{m.nombre}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{m.desc}</div>
          </div>
          <div className="text-xl font-light" style={{ color: '#888' }}>›</div>
        </button>
      ))}
    </div>
  )
}
