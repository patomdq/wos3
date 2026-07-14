'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  DeudaPosicion, ESTADO_INTERNO_CFG, ESTADO_JUDICIAL_LABEL, ESTADO_JUDICIAL_COLOR,
  EstadoJudicialNormalizado, calcRatioRiesgoCargas, calcDescuento,
} from '@/lib/deuda-schema'

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(0)}%`

const PAGINA_KEY = 'deuda_por_pagina'
const TAMANOS_PAGINA = [50, 100] as const

export default function DeudaListado({
  posiciones, onUpdateEstado,
}: {
  posiciones: DeudaPosicion[]
  onUpdateEstado: (id: string, estado: string) => void
}) {
  const [contratoAbierto, setContratoAbierto] = useState<string | null>(null)
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
      titular: items.find(i => i.titular_deuda)?.titular_deuda,
      estadoJudicial: items.find(i => i.estado_judicial_normalizado)?.estado_judicial_normalizado as EstadoJudicialNormalizado | undefined,
      tieneAlerta: items.some(i => calcRatioRiesgoCargas(i.cargas_previas, i.asking_price).alerta),
    }))
  }, [posiciones])

  useEffect(() => { setPagina(1) }, [posiciones])

  const totalPaginas = Math.max(1, Math.ceil(grupos.length / porPagina))
  const paginaActual = Math.min(pagina, totalPaginas)
  const desde = (paginaActual - 1) * porPagina
  const gruposPagina = grupos.slice(desde, desde + porPagina)
  const grupoAbierto = contratoAbierto ? grupos.find(g => g.contractId === contratoAbierto) : null

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
          <button key={g.contractId} onClick={() => setContratoAbierto(g.contractId)}
            className="text-left rounded-2xl overflow-hidden flex flex-col" style={{ background: '#fff', border: '1.5px solid #ECEAE4' }}>
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

      {grupoAbierto && (
        <>
          <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={() => setContratoAbierto(null)} />
          <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
            <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto"
              style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 760 }}>
              <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
                <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-[16px] truncate" style={{ color: '#111' }}>
                      {[grupoAbierto.ciudad, grupoAbierto.provincia].filter(Boolean).join(', ') || 'Sin ubicación'}
                      {grupoAbierto.tieneAlerta && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-md text-[12px] font-black align-middle" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                          🔴 Cargas &gt; precio
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] mt-0.5 font-mono truncate" style={{ color: '#999' }}>{grupoAbierto.contractId} · {grupoAbierto.broker || 'Sin broker'}</div>
                  </div>
                  <button onClick={() => setContratoAbierto(null)} className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {grupoAbierto.items.map(p => {
                  const riesgo = calcRatioRiesgoCargas(p.cargas_previas, p.asking_price)
                  const descuento = calcDescuento(p.deuda_ob, p.asking_price)
                  const estCfg = ESTADO_INTERNO_CFG[p.estado_interno] || ESTADO_INTERNO_CFG.nuevo
                  const judCfg = p.estado_judicial_normalizado ? ESTADO_JUDICIAL_COLOR[p.estado_judicial_normalizado] : null
                  return (
                    <div key={p.id} className="px-5 py-4" style={{ borderTop: '1px solid #F5F4F0' }}>
                      {/* Cabecera: dirección + tipo + badges + estado interno */}
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div className="min-w-[220px]">
                          <div className="text-[14px] font-bold" style={{ color: '#333' }}>{p.direccion || '(sin dirección)'}</div>
                          <div className="text-[12px] mt-0.5 flex items-center gap-1.5 flex-wrap" style={{ color: '#999' }}>
                            <span>{[p.tipo_colateral, p.subtipo_colateral].filter(Boolean).join(' · ') || 'Sin tipo'}</span>
                            {judCfg && p.estado_judicial_normalizado && (
                              <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: judCfg.bg, color: judCfg.color }}>
                                {ESTADO_JUDICIAL_LABEL[p.estado_judicial_normalizado]}
                              </span>
                            )}
                            {riesgo.alerta && (
                              <span className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }} title="Cargas previas superan el asking price">
                                🔴 Riesgo cargas
                              </span>
                            )}
                          </div>
                        </div>
                        <select value={p.estado_interno} onChange={e => onUpdateEstado(p.id, e.target.value)}
                          className="rounded-lg px-2 py-1.5 text-[12px] font-black outline-none flex-shrink-0" style={{ background: estCfg.bg, color: estCfg.color, border: 'none', appearance: 'none' as const }}>
                          {Object.entries(ESTADO_INTERNO_CFG).map(([k, cfg]) => <option key={k} value={k}>{cfg.label}</option>)}
                        </select>
                      </div>

                      {/* Resumen económico — estilo ficha de deuda (FENCIA) */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                        <Kpi label="Deuda OB" value={fmt(p.deuda_ob)} />
                        <Kpi label="Deuda total" value={fmt(p.deuda_tot)} />
                        <Kpi label="Asking price" value={fmt(p.asking_price)} highlight />
                        <Kpi label="Descuento" value={pct(descuento)} />
                      </div>

                      {/* Ficha detallada: Colateral / Deuda y titular / Estado judicial */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Ficha titulo="Colateral">
                          <Field label="Tipo" value={p.tipo_colateral} />
                          <Field label="Subtipo" value={p.subtipo_colateral} />
                          <Field label="Referencia catastral" value={p.ref_catastral} mono />
                          <Field label="Nº Registro" value={p.n_registro} mono />
                          <Field label="CCAA" value={p.ccaa} />
                          <Field label="Provincia" value={p.provincia} />
                          <Field label="Ciudad" value={p.ciudad} />
                          <Field label="Código postal" value={p.zip} />
                        </Ficha>

                        <Ficha titulo="Deuda">
                          <Field label="Titular de la deuda" value={p.titular_deuda} />
                          <Field label="Contract ID" value={p.contract_id} mono />
                          <Field label="Nº préstamos" value={p.n_loans != null ? String(p.n_loans) : null} />
                          <Field label="Cargas previas" value={fmt(p.cargas_previas)} />
                          <Field label="Cargas posteriores" value={fmt(p.cargas_posteriores)} />
                          <Field label="Broker de origen" value={p.broker_origen} />
                        </Ficha>

                        <Ficha titulo="Estado judicial">
                          <Field label="Estado normalizado" value={p.estado_judicial_normalizado ? ESTADO_JUDICIAL_LABEL[p.estado_judicial_normalizado] : null} />
                          <Field label="Estado (texto original del broker)" value={p.estado_judicial_raw} />
                          <Field label="Ratio cargas / precio" value={riesgo.sinPrecio ? 'Sin precio' : pct(riesgo.ratio)}
                            danger={riesgo.alerta} />
                        </Ficha>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Kpi({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: highlight ? 'rgba(166,133,90,0.1)' : '#F9F8F5', border: highlight ? '1px solid rgba(166,133,90,0.3)' : '1px solid #ECEAE4' }}>
      <div className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#999' }}>{label}</div>
      <div className="text-[15px] font-black mt-0.5" style={{ color: highlight ? '#A6855A' : '#111' }}>{value}</div>
    </div>
  )
}

function Ficha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-3" style={{ background: '#FAFAF8', border: '1px solid #F0EEE8' }}>
      <div className="text-[11px] font-black uppercase tracking-wide mb-2" style={{ color: '#A6855A' }}>{titulo}</div>
      <div className="space-y-1.5">{children}</div>
    </div>
  )
}

function Field({ label, value, mono, danger }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[12px] font-semibold flex-shrink-0" style={{ color: '#999' }}>{label}</span>
      <span className={`text-[12px] font-bold text-right truncate ${mono ? 'font-mono' : ''}`} style={{ color: danger ? '#EF4444' : '#333' }}>
        {value || '—'}
      </span>
    </div>
  )
}
