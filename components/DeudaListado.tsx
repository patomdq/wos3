'use client'
import { useMemo, useState } from 'react'
import {
  DeudaPosicion, ESTADO_INTERNO_CFG, ESTADO_JUDICIAL_LABEL, ESTADO_JUDICIAL_COLOR,
  calcRatioRiesgoCargas, calcDescuento,
} from '@/lib/deuda-schema'

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(0)}%`

export default function DeudaListado({
  posiciones, onUpdateEstado, onSelectContrato,
}: {
  posiciones: DeudaPosicion[]
  onUpdateEstado: (id: string, estado: string) => void
  onSelectContrato?: (contractId: string) => void
}) {
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())

  const grupos = useMemo(() => {
    const map = new Map<string, DeudaPosicion[]>()
    posiciones.forEach(p => {
      const arr = map.get(p.contract_id) || []
      arr.push(p)
      map.set(p.contract_id, arr)
    })
    return Array.from(map.entries()).map(([contractId, items]) => ({
      contractId,
      items,
      askingTotal: items.reduce((s, i) => s + (i.asking_price || 0), 0),
      obTotal: items.reduce((s, i) => s + (i.deuda_ob || 0), 0),
      ciudad: items[0]?.ciudad,
      provincia: items[0]?.provincia,
      broker: items[0]?.broker_origen,
      tieneAlerta: items.some(i => calcRatioRiesgoCargas(i.cargas_previas, i.asking_price).alerta),
    }))
  }, [posiciones])

  const toggle = (id: string) => setAbiertos(s => {
    const next = new Set(s)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  if (grupos.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3 opacity-30">⚖️</div>
        <div className="text-sm font-bold" style={{ color: '#999' }}>Sin posiciones que coincidan con los filtros</div>
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {grupos.map(g => {
        const abierto = abiertos.has(g.contractId)
        return (
          <div key={g.contractId} className="rounded-2xl overflow-hidden" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
            <button onClick={() => toggle(g.contractId)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
              <div className="text-lg">{abierto ? '▾' : '▸'}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-black text-[13px]" style={{ color: '#111' }}>{g.contractId}</span>
                  {g.items.length > 1 && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>
                      {g.items.length} garantías
                    </span>
                  )}
                  {g.tieneAlerta && (
                    <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                      🔴 Cargas &gt; precio
                    </span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: '#999' }}>
                  {[g.ciudad, g.provincia].filter(Boolean).join(', ') || 'Sin ubicación'} · {g.broker || 'Sin broker'}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-black text-[13px]" style={{ color: '#111' }}>{fmt(g.askingTotal)}</div>
                <div className="text-[10px]" style={{ color: '#999' }}>OB {fmt(g.obTotal)}</div>
              </div>
            </button>

            {abierto && (
              <div style={{ borderTop: '1px solid #F0EEE8' }}>
                {g.items.map(p => {
                  const riesgo = calcRatioRiesgoCargas(p.cargas_previas, p.asking_price)
                  const descuento = calcDescuento(p.deuda_ob, p.asking_price)
                  const estCfg = ESTADO_INTERNO_CFG[p.estado_interno] || ESTADO_INTERNO_CFG.nuevo
                  const judCfg = p.estado_judicial_normalizado ? ESTADO_JUDICIAL_COLOR[p.estado_judicial_normalizado] : null
                  return (
                    <div key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F5F4F0' }}>
                      <div className="flex-1 min-w-[220px]">
                        <div className="text-[12px] font-bold" style={{ color: '#333' }}>{p.direccion || '(sin dirección)'}</div>
                        <div className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#999' }}>
                          <span>{[p.tipo_colateral, p.subtipo_colateral].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                          {judCfg && p.estado_judicial_normalizado && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-black" style={{ background: judCfg.bg, color: judCfg.color }}>
                              {ESTADO_JUDICIAL_LABEL[p.estado_judicial_normalizado]}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right text-[11px]" style={{ color: '#666', minWidth: 90 }}>
                        <div className="font-black" style={{ color: '#111' }}>{fmt(p.asking_price)}</div>
                        <div>OB {fmt(p.deuda_ob)}</div>
                      </div>

                      <div className="text-right text-[11px]" style={{ color: '#666', minWidth: 70 }}>
                        <div>Desc. {pct(descuento)}</div>
                        <div style={{ color: riesgo.alerta ? '#EF4444' : riesgo.sinPrecio ? '#BBB' : '#666', fontWeight: riesgo.alerta ? 900 : 400 }}>
                          {riesgo.sinPrecio ? 'Sin precio' : `Cargas ${pct(riesgo.ratio)}`}
                        </div>
                      </div>

                      {riesgo.alerta && (
                        <span className="px-2 py-1 rounded-lg text-[10px] font-black" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }} title="Cargas previas superan el asking price">
                          🔴 Riesgo
                        </span>
                      )}

                      <select value={p.estado_interno} onChange={e => onUpdateEstado(p.id, e.target.value)}
                        className="rounded-lg px-2 py-1.5 text-[11px] font-black outline-none" style={{ background: estCfg.bg, color: estCfg.color, border: 'none', appearance: 'none' as const }}>
                        {Object.entries(ESTADO_INTERNO_CFG).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
                      </select>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
