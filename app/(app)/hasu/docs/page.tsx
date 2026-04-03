'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DocEmpresa = { titulo: string; tipo: string; descripcion: string; fecha: string; disponible: boolean }

const DOCS: DocEmpresa[] = [
  { titulo: 'Escritura de constitución', tipo: 'Legal', descripcion: 'Hasu Activos Inmobiliarios SL', fecha: 'Mar 2024', disponible: true },
  { titulo: 'CIF', tipo: 'Legal', descripcion: 'Código de Identificación Fiscal', fecha: 'Mar 2024', disponible: true },
  { titulo: 'Estatutos sociales', tipo: 'Legal', descripcion: 'Documento completo de estatutos', fecha: 'Mar 2024', disponible: true },
  { titulo: 'Contrato JV Zurgena 1', tipo: 'JV', descripcion: 'Joint venture con José Luis Zurano', fecha: 'Ene 2026', disponible: true },
  { titulo: 'Contrato JV Cuevas 1', tipo: 'JV', descripcion: 'Joint venture pendiente', fecha: '—', disponible: false },
  { titulo: 'Seguro RC Profesional', tipo: 'Seguro', descripcion: 'Responsabilidad civil empresa', fecha: 'Dic 2025', disponible: false },
  { titulo: 'Alta IAE', tipo: 'Legal', descripcion: 'Impuesto Actividades Económicas', fecha: 'Mar 2024', disponible: true },
  { titulo: 'Poderes notariales', tipo: 'Legal', descripcion: 'CEO: Patricio Favora', fecha: 'Mar 2024', disponible: false },
]

const TIPO_COLOR: Record<string,{c:string;bg:string}> = {
  'Legal': { c: '#60A5FA', bg: 'rgba(96,165,250,0.15)' },
  'JV': { c: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
  'Seguro': { c: '#34D399', bg: 'rgba(52,211,153,0.15)' },
}

export default function DocsPage() {
  const router = useRouter()
  const [filtro, setFiltro] = useState('todos')

  const filtrados = filtro === 'todos' ? DOCS : DOCS.filter(d => d.tipo === filtro)

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg" style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1 font-bold text-[17px] text-white">Docs de empresa</div>
        <div className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F' }}>
          {DOCS.filter(d => d.disponible).length}/{DOCS.length}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        {['todos', 'Legal', 'JV', 'Seguro'].map(f => (
          <button key={f} onClick={() => setFiltro(f)}
            className="flex-shrink-0 px-3 py-2 rounded-full text-xs font-bold whitespace-nowrap"
            style={{ background: filtro === f ? '#F26E1F' : '#141414', color: filtro === f ? '#fff' : '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            {f === 'todos' ? 'Todos' : f}
          </button>
        ))}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        {filtrados.map((d, i) => (
          <div key={d.titulo} className="px-4 py-3.5 flex items-center gap-3"
            style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined, opacity: d.disponible ? 1 : 0.45 }}>
            <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-lg flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              📄
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-white">{d.titulo}</div>
              <div className="text-xs font-medium mt-0.5" style={{ color: '#555' }}>{d.descripcion}</div>
            </div>
            <div className="flex-shrink-0 flex flex-col items-end gap-1">
              <span className="text-[10px] font-black px-2 py-0.5 rounded-full"
                style={{ background: TIPO_COLOR[d.tipo]?.bg || '#282828', color: TIPO_COLOR[d.tipo]?.c || '#888' }}>
                {d.tipo}
              </span>
              <span className="text-[10px] font-semibold" style={{ color: d.disponible ? '#22C55E' : '#555' }}>
                {d.disponible ? d.fecha : 'Pendiente'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 p-4 rounded-xl text-center" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="text-xs font-medium" style={{ color: '#555' }}>Integración Google Drive próximamente</div>
        <div className="text-xs font-black mt-1" style={{ color: '#F26E1F' }}>Conectar Drive →</div>
      </div>
    </div>
  )
}
