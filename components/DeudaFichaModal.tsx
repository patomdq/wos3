'use client'
import { useState } from 'react'
import {
  GrupoDeuda, ESTADO_INTERNO_CFG, ESTADO_JUDICIAL_LABEL, ESTADO_JUDICIAL_COLOR,
  calcRatioRiesgoCargas, calcDescuento,
} from '@/lib/deuda-schema'

const fmt = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '—'
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (n: number | null) => n === null ? '—' : `${(n * 100).toFixed(0)}%`

export default function DeudaFichaModal({
  grupo, onClose, onUpdateEstado, onUpdateImagen, onGeocodear,
}: {
  grupo: GrupoDeuda
  onClose: () => void
  onUpdateEstado: (id: string, estado: string) => void
  onUpdateImagen: (id: string, file: File) => Promise<void>
  onGeocodear: (id: string) => Promise<void>
}) {
  const [subiendoId, setSubiendoId] = useState<string | null>(null)
  const [ubicandoId, setUbicandoId] = useState<string | null>(null)

  const subirImagen = async (id: string, file: File) => {
    setSubiendoId(id)
    await onUpdateImagen(id, file)
    setSubiendoId(null)
  }

  const geocodear = async (id: string) => {
    setUbicandoId(id)
    await onGeocodear(id)
    setUbicandoId(null)
  }

  return (
    <>
      <div className="fixed inset-x-0 top-0 z-40" style={{ bottom: 70, background: 'rgba(0,0,0,0.45)' }} onClick={onClose} />
      <div className="fixed inset-x-0 top-0 z-50 flex items-end sm:items-center justify-center pointer-events-none" style={{ bottom: 70 }}>
        <div className="w-full rounded-t-[20px] sm:rounded-2xl flex flex-col pointer-events-auto"
          style={{ background: '#ffffff', border: '1px solid #E8E6E0', boxShadow: '0 24px 64px rgba(0,0,0,0.18)', maxHeight: 'calc(100% - 8px)', maxWidth: 760 }}>
          <div className="flex-shrink-0 px-5 pt-4 pb-3" style={{ borderBottom: '1px solid #F0EEE8' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-4" style={{ background: '#DCDAD4' }} />
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-black text-[16px] truncate" style={{ color: '#111' }}>
                  {[grupo.ciudad, grupo.provincia].filter(Boolean).join(', ') || 'Sin ubicación'}
                  {grupo.tieneAlerta && (
                    <span className="ml-2 px-1.5 py-0.5 rounded-md text-[12px] font-black align-middle" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                      🔴 Cargas &gt; precio
                    </span>
                  )}
                </div>
                <div className="text-[12px] mt-0.5 font-mono truncate" style={{ color: '#999' }}>{grupo.contractId} · {grupo.broker || 'Sin broker'}</div>
              </div>
              <button onClick={onClose} className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#F5F4F0', color: '#666', border: '1px solid #ECEAE4' }}>✕</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {grupo.items.map(p => {
              const riesgo = calcRatioRiesgoCargas(p.cargas_previas, p.asking_price)
              const descuento = calcDescuento(p.deuda_ob, p.asking_price)
              const estCfg = ESTADO_INTERNO_CFG[p.estado_interno] || ESTADO_INTERNO_CFG.nuevo
              const judCfg = p.estado_judicial_normalizado ? ESTADO_JUDICIAL_COLOR[p.estado_judicial_normalizado] : null
              const tieneCoords = p.lat != null && p.lng != null
              return (
                <div key={p.id} className="px-5 py-4" style={{ borderTop: '1px solid #F5F4F0' }}>
                  {/* Imagen del inmueble — igual que la portada en Mercado */}
                  <label className="block relative rounded-xl overflow-hidden mb-3 cursor-pointer"
                    style={{ height: 120, background: p.imagen_url ? undefined : '#F9F8F5', border: p.imagen_url ? 'none' : '1.5px dashed #DCDAD4' }}>
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) subirImagen(p.id, f) }} />
                    {p.imagen_url ? (
                      <>
                        <img src={p.imagen_url} alt="" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 flex items-end justify-end p-2" style={{ background: 'linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.45) 100%)' }}>
                          <span className="px-2 py-1 rounded-lg text-[12px] font-black" style={{ background: 'rgba(255,255,255,0.85)', color: '#111' }}>
                            {subiendoId === p.id ? 'Subiendo...' : '📷 Cambiar'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[12px] font-bold" style={{ color: '#AAA' }}>
                        {subiendoId === p.id ? 'Subiendo...' : '📷 Agregar imagen del inmueble'}
                      </div>
                    )}
                  </label>

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
                        {!tieneCoords && p.direccion && (
                          <button onClick={() => geocodear(p.id)} disabled={ubicandoId === p.id}
                            className="px-1.5 py-0.5 rounded-md text-[12px] font-black" style={{ background: '#F0EEE8', color: '#888' }}>
                            {ubicandoId === p.id ? 'Ubicando...' : '📍 Ubicar en mapa'}
                          </button>
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
      <div className="space-y-2">{children}</div>
    </div>
  )
}

// Label arriba / valor abajo (en vez de label-valor en la misma línea con truncate) — con
// referencias catastrales, contract IDs largos o titulares con nombre completo, la versión en
// una sola línea los cortaba con "..." y no había forma de leerlos sin copiar el HTML.
function Field({ label, value, mono, danger }: { label: string; value: string | null | undefined; mono?: boolean; danger?: boolean }) {
  return (
    <div>
      <div className="text-[11px] font-semibold" style={{ color: '#999' }}>{label}</div>
      <div className={`text-[12.5px] font-bold break-words ${mono ? 'font-mono' : ''}`} style={{ color: danger ? '#EF4444' : '#333' }}>
        {value || '—'}
      </div>
    </div>
  )
}
