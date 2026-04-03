'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

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
  const pct = (totalCapital / OBJETIVO * 100).toFixed(1)

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
            { l: 'Objetivo 1M€', v: `${pct}%`, s: null, progress: parseFloat(pct) / 100 },
            { l: 'Proyectos', v: String(activos.length), s: `${proyectos.length} total`, sc: '#888' },
            { l: 'ROI medio', v: '—', s: 'activos', sc: '#888' },
            { l: 'Inversores', v: String(inversores), s: 'JV activos', sc: '#888' },
            { l: 'Cuentas', v: String(cuentas.length), s: 'activas', sc: '#888' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{k.l}</div>
              <div className="font-black text-[21px] text-white leading-none">{k.v}</div>
              {k.progress !== undefined && (
                <div className="h-[3px] rounded-full mt-2 overflow-hidden" style={{ background: '#282828' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(k.progress * 100, 100)}%`, background: '#F26E1F' }} />
                </div>
              )}
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
        <button key={m.nombre} onClick={() => m.href !== '#' && router.push(m.href)}
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
