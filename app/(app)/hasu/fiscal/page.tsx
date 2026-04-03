'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Doc = { titulo: string; tipo: string; periodo: string; estado: 'pendiente' | 'presentado' | 'vencido'; fecha: string }

const DOCS: Doc[] = [
  { titulo: 'IVA Trimestral Q1 2026', tipo: 'IVA', periodo: 'Enero–Marzo 2026', estado: 'pendiente', fecha: '20 abr 2026' },
  { titulo: 'IRPF Retenciones Q1 2026', tipo: 'IRPF', periodo: 'Enero–Marzo 2026', estado: 'pendiente', fecha: '20 abr 2026' },
  { titulo: 'IVA Trimestral Q4 2025', tipo: 'IVA', periodo: 'Oct–Dic 2025', estado: 'presentado', fecha: '20 ene 2026' },
  { titulo: 'IRPF Retenciones Q4 2025', tipo: 'IRPF', periodo: 'Oct–Dic 2025', estado: 'presentado', fecha: '20 ene 2026' },
  { titulo: 'Impuesto Sociedades 2024', tipo: 'IS', periodo: 'Ejercicio 2024', estado: 'presentado', fecha: '25 jul 2025' },
]

const ESTADO_COLOR: Record<string,string> = { pendiente: '#F59E0B', presentado: '#22C55E', vencido: '#EF4444' }
const ESTADO_BG: Record<string,string> = { pendiente: 'rgba(245,158,11,0.15)', presentado: 'rgba(34,197,94,0.15)', vencido: 'rgba(239,68,68,0.15)' }
const TIPO_ICON: Record<string,string> = { IVA: '💰', IRPF: '👤', IS: '🏢' }

export default function FiscalPage() {
  const router = useRouter()
  const [filtro, setFiltro] = useState('todos')

  const filtrados = filtro === 'todos' ? DOCS : DOCS.filter(d => d.estado === filtro || d.tipo === filtro)
  const pendientes = DOCS.filter(d => d.estado === 'pendiente').length

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg" style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1 font-bold text-[17px] text-white">Fiscal y gestoría</div>
      </div>

      {pendientes > 0 && (
        <div className="rounded-xl p-4 mb-4 flex items-center gap-3" style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)' }}>
          <span className="text-xl">⚠️</span>
          <div>
            <div className="text-sm font-black" style={{ color: '#F59E0B' }}>{pendientes} obligación{pendientes > 1 ? 'es' : ''} pendiente{pendientes > 1 ? 's' : ''}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>Revisá las fechas de presentación</div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        {['todos', 'pendiente', 'presentado', 'IVA', 'IRPF', 'IS'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className="flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: filtro === f ? '#F26E1F' : '#141414', color: filtro === f ? '#fff' : '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            {f === 'todos' ? 'Todos' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        {filtrados.map((d, i) => (
          <div key={d.titulo} className="px-4 py-3.5 flex items-center gap-3"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
            <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              {TIPO_ICON[d.tipo] || '📄'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{d.titulo}</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: '#555' }}>{d.periodo} · Vence {d.fecha}</div>
            </div>
            <span className="text-[11px] font-black px-2.5 py-1 rounded-full uppercase tracking-wide flex-shrink-0"
              style={{ background: ESTADO_BG[d.estado], color: ESTADO_COLOR[d.estado] }}>
              {d.estado}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 rounded-xl text-center" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-sm font-bold text-white mb-1">Gestoría Hasu</div>
        <div className="text-xs font-medium mb-3" style={{ color: '#888' }}>Documentación conectada próximamente</div>
        <a href="mailto:gestoria@hasuactivos.es" className="text-sm font-black" style={{ color: '#F26E1F' }}>Contactar gestoría →</a>
      </div>
    </div>
  )
}
