'use client'
import { useEffect, useState } from 'react'
import { GrupoDeuda, ESTADO_JUDICIAL_LABEL, ESTADO_JUDICIAL_COLOR } from '@/lib/deuda-schema'

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}

const PAGINA_KEY = 'deuda_por_pagina'
const TAMANOS_PAGINA = [50, 100] as const

export default function DeudaListado({
  grupos, onAbrir,
}: {
  grupos: GrupoDeuda[]
  onAbrir: (contractId: string) => void
}) {
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState<number>(50)

  useEffect(() => {
    const guardado = Number(localStorage.getItem(PAGINA_KEY))
    if (TAMANOS_PAGINA.includes(guardado as any)) setPorPagina(guardado)
  }, [])

  const cambiarPorPagina = (n: number) => {
    setPorPagina(n)
    setPagina(1)
    localStorage.setItem(PAGINA_KEY, String(n))
  }

  useEffect(() => { setPagina(1) }, [grupos])

  const totalPaginas = Math.max(1, Math.ceil(grupos.length / porPagina))
  const paginaActual = Math.min(pagina, totalPaginas)
  const desde = (paginaActual - 1) * porPagina
  const gruposPagina = grupos.slice(desde, desde + porPagina)

  if (grupos.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">⚖️</div>
        <div className="text-sm font-bold" style={{ color: '#999' }}>Sin posiciones que coincidan con los filtros</div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-[13px] font-bold" style={{ color: '#888' }}>
          {desde + 1}–{Math.min(desde + porPagina, grupos.length)} de {grupos.length} contratos
        </div>
        <div className="flex items-center gap-1.5">
          <select value={porPagina} onChange={e => cambiarPorPagina(Number(e.target.value))}
            className="rounded-lg px-2 py-1.5 text-[12px] font-bold outline-none" style={{ background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#666', appearance: 'none' as const }}>
            {TAMANOS_PAGINA.map(n => <option key={n} value={n}>{n} / página</option>)}
          </select>
          <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaActual === 1}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black disabled:opacity-30" style={{ background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#666' }}>‹</button>
          <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaActual === totalPaginas}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-black disabled:opacity-30" style={{ background: '#F9F8F5', border: '1.5px solid #ECEAE4', color: '#666' }}>›</button>
        </div>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {gruposPagina.map(g => (
          <button key={g.contractId} onClick={() => onAbrir(g.contractId)}
            className="text-left rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
            {g.imagenUrl && (
              <div className="relative" style={{ height: 90 }}>
                <img src={g.imagenUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="p-4 flex-1">
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="font-black text-[15px] truncate" style={{ color: '#111' }}>{g.ciudad || 'Sin ciudad'}</div>
                  <div className="text-[12px] font-bold truncate" style={{ color: '#999' }}>{g.provincia || 'Sin provincia'}</div>
                </div>
                {g.tieneAlerta && <span className="flex-shrink-0 text-base" title="Cargas previas superan el asking price">🔴</span>}
              </div>
              <div className="text-[12px] font-mono truncate mb-2" style={{ color: '#BBB' }}>{g.contractId}</div>
              <div className="flex flex-wrap items-center gap-1.5 mb-2">
                {g.items.length > 1 && (
                  <span className="inline-block px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>
                    {g.items.length} garantías
                  </span>
                )}
                {g.estadoJudicial && (
                  <span className="inline-block px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: ESTADO_JUDICIAL_COLOR[g.estadoJudicial].bg, color: ESTADO_JUDICIAL_COLOR[g.estadoJudicial].color }}>
                    {ESTADO_JUDICIAL_LABEL[g.estadoJudicial]}
                  </span>
                )}
              </div>
              {g.titular && <div className="text-[12px] font-bold truncate" style={{ color: '#666' }}>Titular: {g.titular}</div>}
              <div className="text-[12px] font-bold truncate" style={{ color: '#888' }}>{g.broker || 'Sin broker'}</div>
            </div>
            <div className="px-4 py-3" style={{ borderTop: '1px solid #F5F4F0', background: '#FAFAF8' }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>Asking price</span>
                <span className="font-black text-[15px]" style={{ color: '#111' }}>{fmt(g.askingTotal)}</span>
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>Deuda OB</span>
                <span className="text-[12px] font-bold" style={{ color: '#999' }}>{fmt(g.obTotal)}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
