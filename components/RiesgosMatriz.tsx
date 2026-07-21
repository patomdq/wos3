'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

type Riesgo = {
  id: string
  orden: number
  naturaleza: string | null
  descripcion: string
  probabilidad: number | null
  impacto: number | null
  decision: string | null
  accion_mitigante: string | null
  riesgo_residual: string | null
  comentarios: string | null
  responsable: string | null
  fecha_accion: string | null
}

type Props = {
  inmuebleId?: string
  proyectoId?: string
}

const NATURALEZA_OPTS = ['Técnico', 'Legal', 'Financiero', 'Administrativo', 'Otro']
const DECISION_OPTS   = ['Aceptar', 'Eliminar', 'Reducir', 'Transferir']
const RESIDUAL_OPTS   = ['Bajo', 'Medio', 'Alto', 'Inasumible']

function scoreColor(score: number): { bg: string; color: string } {
  if (score >= 20) return { bg: 'rgba(239,68,68,0.12)',   color: '#DC2626' }
  if (score >= 10) return { bg: 'rgba(245,158,11,0.12)',  color: '#D97706' }
  if (score >= 5)  return { bg: 'rgba(234,179,8,0.12)',   color: '#CA8A04' }
  return               { bg: 'rgba(34,197,94,0.12)',   color: '#16A34A' }
}

function scoreLabel(score: number): string {
  if (score >= 20) return 'Inasumible'
  if (score >= 10) return 'Alto'
  if (score >= 5)  return 'Medio'
  return 'Bajo'
}

const EMPTY: Omit<Riesgo, 'id' | 'orden'> = {
  naturaleza: null, descripcion: '', probabilidad: null, impacto: null,
  decision: null, accion_mitigante: null, riesgo_residual: null,
  comentarios: null, responsable: null, fecha_accion: null,
}

export default function RiesgosMatriz({ inmuebleId, proyectoId }: Props) {
  const [filas, setFilas]     = useState<Riesgo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<Record<string, boolean>>({})

  const fetch = useCallback(async () => {
    const q = supabase.from('riesgos').select('*').order('orden')
    if (inmuebleId)  q.eq('inmueble_id', inmuebleId)
    else if (proyectoId) q.eq('proyecto_id', proyectoId)
    const { data } = await q
    setFilas(data || [])
    setLoading(false)
  }, [inmuebleId, proyectoId])

  useEffect(() => { fetch() }, [fetch])

  const addFila = async () => {
    const orden = filas.length
    const payload: Record<string, unknown> = { ...EMPTY, orden }
    if (inmuebleId)  payload.inmueble_id  = inmuebleId
    if (proyectoId)  payload.proyecto_id  = proyectoId
    const { data } = await supabase.from('riesgos').insert(payload).select().single()
    if (data) setFilas(prev => [...prev, data])
  }

  const deleteFila = async (id: string) => {
    await supabase.from('riesgos').delete().eq('id', id)
    setFilas(prev => prev.filter(r => r.id !== id))
  }

  const update = async (id: string, field: string, value: unknown) => {
    setFilas(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r))
    setSaving(s => ({ ...s, [id]: true }))
    await supabase.from('riesgos').update({ [field]: value }).eq('id', id)
    setSaving(s => ({ ...s, [id]: false }))
  }

  if (loading) return <div style={{ padding: 24, color: '#999', fontSize: 13 }}>Cargando matriz…</div>

  const totalScore = filas.reduce((s, r) => s + (r.probabilidad && r.impacto ? r.probabilidad * r.impacto : 0), 0)
  const { color: totalColor } = totalScore > 0 ? scoreColor(Math.round(totalScore / Math.max(filas.filter(r => r.probabilidad && r.impacto).length, 1))) : { color: '#999' }

  return (
    <div style={{ marginTop: 32 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#111', letterSpacing: '-0.01em' }}>Matriz de Análisis de Riesgos</div>
          {filas.length > 0 && (
            <div style={{ fontSize: 12, color: '#999', marginTop: 2 }}>
              {filas.length} riesgo{filas.length !== 1 ? 's' : ''} identificado{filas.length !== 1 ? 's' : ''} · Score medio{' '}
              <span style={{ fontWeight: 800, color: totalColor }}>
                {filas.filter(r => r.probabilidad && r.impacto).length > 0
                  ? Math.round(totalScore / filas.filter(r => r.probabilidad && r.impacto).length).toFixed(1)
                  : '—'}
              </span>
            </div>
          )}
        </div>
        <button
          onClick={addFila}
          style={{ fontSize: 12, fontWeight: 800, padding: '8px 14px', borderRadius: 10, background: '#14110C', color: '#F8F3E9', border: 'none', cursor: 'pointer' }}>
          + Añadir riesgo
        </button>
      </div>

      {filas.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '40px 0', background: '#fff', borderRadius: 16, border: '1.5px dashed #E0DDD7' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>🛡️</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#999' }}>Sin riesgos identificados todavía</div>
          <div style={{ fontSize: 12, color: '#bbb', marginTop: 4 }}>Añadí el primero para empezar la matriz</div>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <thead>
              <tr style={{ background: '#F2F1ED', borderBottom: '1.5px solid #ECEAE4' }}>
                {['#','Naturaleza','Descripción del riesgo','Prob. (1-5)','Impacto (1-5)','Score','Decisión','Acción mitigante','Riesgo residual','Comentarios','Responsable','Fecha',''].map(h => (
                  <th key={h} style={{ padding: '10px 12px', fontWeight: 800, color: '#666', textAlign: 'left', whiteSpace: 'nowrap', fontSize: 11, letterSpacing: '0.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map((r, i) => {
                const score = r.probabilidad && r.impacto ? r.probabilidad * r.impacto : null
                const { bg, color } = score ? scoreColor(score) : { bg: 'transparent', color: '#ccc' }
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid #F2F1ED' }}>
                    {/* ID */}
                    <td style={{ padding: '8px 12px', color: '#bbb', fontWeight: 700, minWidth: 28 }}>{i + 1}</td>

                    {/* Naturaleza */}
                    <td style={{ padding: '8px 8px', minWidth: 130 }}>
                      <select
                        value={r.naturaleza || ''}
                        onChange={e => update(r.id, 'naturaleza', e.target.value || null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', color: '#333', width: '100%', cursor: 'pointer' }}>
                        <option value="">—</option>
                        {NATURALEZA_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>

                    {/* Descripción */}
                    <td style={{ padding: '8px 8px', minWidth: 220 }}>
                      <input
                        value={r.descripcion}
                        onChange={e => update(r.id, 'descripcion', e.target.value)}
                        placeholder="Describe el riesgo…"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', width: '100%', outline: 'none', color: '#111' }}
                      />
                    </td>

                    {/* Probabilidad */}
                    <td style={{ padding: '8px 8px', minWidth: 80 }}>
                      <select
                        value={r.probabilidad || ''}
                        onChange={e => update(r.id, 'probabilidad', e.target.value ? Number(e.target.value) : null)}
                        style={{ fontSize: 12, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', color: '#333', width: '100%', cursor: 'pointer' }}>
                        <option value="">—</option>
                        {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                      </select>
                    </td>

                    {/* Impacto */}
                    <td style={{ padding: '8px 8px', minWidth: 80 }}>
                      <select
                        value={r.impacto || ''}
                        onChange={e => update(r.id, 'impacto', e.target.value ? Number(e.target.value) : null)}
                        style={{ fontSize: 12, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', color: '#333', width: '100%', cursor: 'pointer' }}>
                        <option value="">—</option>
                        {[1,2,3,4,5].map(n => <option key={n}>{n}</option>)}
                      </select>
                    </td>

                    {/* Score */}
                    <td style={{ padding: '8px 12px', minWidth: 80 }}>
                      {score ? (
                        <span style={{ fontWeight: 900, fontSize: 13, padding: '3px 10px', borderRadius: 100, background: bg, color }}>
                          {score} · {scoreLabel(score)}
                        </span>
                      ) : (
                        <span style={{ color: '#ddd', fontSize: 12 }}>—</span>
                      )}
                    </td>

                    {/* Decisión */}
                    <td style={{ padding: '8px 8px', minWidth: 110 }}>
                      <select
                        value={r.decision || ''}
                        onChange={e => update(r.id, 'decision', e.target.value || null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', color: '#333', width: '100%', cursor: 'pointer' }}>
                        <option value="">—</option>
                        {DECISION_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>

                    {/* Acción mitigante */}
                    <td style={{ padding: '8px 8px', minWidth: 200 }}>
                      <input
                        value={r.accion_mitigante || ''}
                        onChange={e => update(r.id, 'accion_mitigante', e.target.value || null)}
                        placeholder="Acción mitigante…"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', width: '100%', outline: 'none', color: '#111' }}
                      />
                    </td>

                    {/* Riesgo residual */}
                    <td style={{ padding: '8px 8px', minWidth: 110 }}>
                      <select
                        value={r.riesgo_residual || ''}
                        onChange={e => update(r.id, 'riesgo_residual', e.target.value || null)}
                        style={{ fontSize: 11, fontWeight: 700, padding: '4px 6px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', color: '#333', width: '100%', cursor: 'pointer' }}>
                        <option value="">—</option>
                        {RESIDUAL_OPTS.map(o => <option key={o}>{o}</option>)}
                      </select>
                    </td>

                    {/* Comentarios */}
                    <td style={{ padding: '8px 8px', minWidth: 160 }}>
                      <input
                        value={r.comentarios || ''}
                        onChange={e => update(r.id, 'comentarios', e.target.value || null)}
                        placeholder="Comentarios…"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', width: '100%', outline: 'none', color: '#111' }}
                      />
                    </td>

                    {/* Responsable */}
                    <td style={{ padding: '8px 8px', minWidth: 110 }}>
                      <input
                        value={r.responsable || ''}
                        onChange={e => update(r.id, 'responsable', e.target.value || null)}
                        placeholder="Responsable…"
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', width: '100%', outline: 'none', color: '#111' }}
                      />
                    </td>

                    {/* Fecha */}
                    <td style={{ padding: '8px 8px', minWidth: 130 }}>
                      <input
                        type="date"
                        value={r.fecha_accion || ''}
                        onChange={e => update(r.id, 'fecha_accion', e.target.value || null)}
                        style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1.5px solid #ECEAE4', background: '#FAFAF8', width: '100%', outline: 'none', color: '#111' }}
                      />
                    </td>

                    {/* Delete */}
                    <td style={{ padding: '8px 8px' }}>
                      <button
                        onClick={() => deleteFila(r.id)}
                        style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 900 }}>
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' as const }}>
        {[
          { range: '1–4', label: 'Bajo',       bg: 'rgba(34,197,94,0.12)',   color: '#16A34A' },
          { range: '5–9', label: 'Medio',      bg: 'rgba(234,179,8,0.12)',   color: '#CA8A04' },
          { range: '10–19', label: 'Alto',     bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
          { range: '20–25', label: 'Inasumible', bg: 'rgba(239,68,68,0.12)', color: '#DC2626' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#888' }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: l.bg, border: `1px solid ${l.color}` }} />
            <span style={{ fontWeight: 700, color: l.color }}>{l.label}</span>
            <span>({l.range})</span>
          </div>
        ))}
      </div>
    </div>
  )
}
