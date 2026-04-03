'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

type Movimiento = { id: string; concepto: string; monto: number; fecha: string; tipo: string; categoria: string; proyecto_id: string; proyectos?: { nombre: string } }

export default function FlujoCajaPage() {
  const router = useRouter()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [proyectos, setProyectos] = useState<{id:string;nombre:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProyecto, setFiltroProyecto] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  useEffect(() => {
    Promise.all([
      supabase.from('movimientos').select('*, proyectos(nombre)').order('fecha', { ascending: false }).limit(200),
      supabase.from('proyectos').select('id,nombre').order('nombre')
    ]).then(([{ data: movs }, { data: projs }]) => {
      setMovimientos(movs || [])
      setProyectos(projs || [])
      setLoading(false)
    })
  }, [])

  const filtered = movimientos.filter(m => {
    if (filtroProyecto !== 'todos' && m.proyecto_id !== filtroProyecto) return false
    if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
    return true
  })

  const totalIngresos = filtered.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0)
  const totalGastos = filtered.filter(m => m.monto < 0).reduce((s, m) => s + Math.abs(m.monto), 0)
  const balance = totalIngresos - totalGastos

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg" style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1 font-bold text-[17px] text-white">Flujo de caja</div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Ingresos', value: fmt(totalIngresos), color: '#22C55E' },
          { label: 'Gastos', value: fmt(totalGastos), color: '#EF4444' },
          { label: 'Balance', value: fmt(balance), color: balance >= 0 ? '#22C55E' : '#EF4444' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>{k.label}</div>
            <div className="font-black text-[14px] leading-none" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)}
          className="text-sm font-bold rounded-xl px-3 py-2 outline-none flex-shrink-0"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>
          <option value="todos">Todos los proyectos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {['todos','Ingreso','Gasto'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap"
            style={{ background: filtroTipo === t ? '#F26E1F' : '#141414', color: filtroTipo === t ? '#fff' : '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            {t === 'todos' ? 'Todo' : t + 's'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin movimientos</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          {filtered.map((m, i) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: m.monto > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}>
                {m.monto > 0 ? '↗' : '↙'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{m.concepto}</div>
                <div className="text-xs font-medium mt-0.5 flex gap-2" style={{ color: '#555' }}>
                  <span>{m.fecha}</span>
                  {(m as any).proyectos?.nombre && <span>· {(m as any).proyectos.nombre}</span>}
                  {m.categoria && <span>· {m.categoria}</span>}
                </div>
              </div>
              <div className="font-black text-sm flex-shrink-0" style={{ color: m.monto > 0 ? '#22C55E' : '#EF4444' }}>
                {m.monto > 0 ? '+' : ''}{fmt(m.monto)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
