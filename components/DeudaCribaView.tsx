'use client'
import { useState, useMemo } from 'react'
import {
  GrupoDeuda, DeudaPosicion, inferirRatingsCesion, RATING_COLOR,
  RatingDificultad, calcDescuentoDeuda, calcRatioRiesgoCargas,
  calcularScoreActivo, semaforo,
} from '@/lib/deuda-schema'

const fmt = (n: number | null | undefined) => {
  if (n == null) return '—'
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M€`
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k€`
  return `${n.toLocaleString('es-ES')}€`
}
const pct = (n: number | null) => n == null ? '—' : `${(n * 100).toFixed(0)}%`

type Decision = 'seleccionado' | 'revisar' | 'descartado' | null
const SEMAFORO_CFG = {
  verde:    { label: 'Comprar',   bg: 'rgba(22,163,74,0.1)',   border: 'rgba(22,163,74,0.3)',   dot: '#16A34A' },
  amarillo: { label: 'Revisar',   bg: 'rgba(245,158,11,0.1)',  border: 'rgba(245,158,11,0.3)',  dot: '#F59E0B' },
  rojo:     { label: 'Descartar', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.25)',  dot: '#EF4444' },
}

function RatingDot({ r }: { r: RatingDificultad | null }) {
  if (r == null) return <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#DDD' }} />
  const { color } = RATING_COLOR[r]
  return <span title={`${r}/5`} style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color }} />
}

function ScoreBadge({ score }: { score: number }) {
  const s = semaforo(score)
  const cfg = SEMAFORO_CFG[s]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: 999, padding: '2px 8px',
      fontSize: 12, fontWeight: 700, color: cfg.dot, fontFamily: 'Hanken Grotesk, sans-serif',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, display: 'inline-block' }} />
      {score}
    </span>
  )
}

interface FilaActivo {
  grupo: GrupoDeuda
  posicion: DeudaPosicion
  score: number
  sem: 'verde' | 'amarillo' | 'rojo'
  ratings: ReturnType<typeof inferirRatingsCesion>
  descuento: number | null
}

export default function DeudaCribaView({
  grupos, onAbrir,
}: {
  grupos: GrupoDeuda[]
  onAbrir: (contractId: string) => void
}) {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [filtroSem, setFiltroSem] = useState<'verde' | 'amarillo' | 'rojo' | 'todos'>('todos')
  const [filtroDecision, setFiltroDecision] = useState<Decision | 'todos'>('todos')
  const [scoreMin, setScoreMin] = useState(0)
  const [soloConFechaSubasta, setSoloConFechaSubasta] = useState(false)

  // Calcular score para cada grupo (usando la primera posición como representativa)
  const filas: FilaActivo[] = useMemo(() => {
    return grupos.map(g => {
      const p = g.items[0]
      const score = calcularScoreActivo(p)
      return {
        grupo: g,
        posicion: p,
        score,
        sem: semaforo(score),
        ratings: inferirRatingsCesion(p),
        descuento: calcDescuentoDeuda(p.asking_price, p.deuda_ob),
      }
    }).sort((a, b) => b.score - a.score)
  }, [grupos])

  const conteos = useMemo(() => ({
    verde: filas.filter(f => f.sem === 'verde').length,
    amarillo: filas.filter(f => f.sem === 'amarillo').length,
    rojo: filas.filter(f => f.sem === 'rojo').length,
    seleccionado: Object.values(decisions).filter(d => d === 'seleccionado').length,
    revisar: Object.values(decisions).filter(d => d === 'revisar').length,
    descartado: Object.values(decisions).filter(d => d === 'descartado').length,
  }), [filas, decisions])

  const filasFiltradas = useMemo(() => {
    return filas.filter(f => {
      if (filtroSem !== 'todos' && f.sem !== filtroSem) return false
      if (scoreMin > 0 && f.score < scoreMin) return false
      const dec = decisions[f.grupo.contractId] ?? null
      if (filtroDecision !== 'todos' && dec !== filtroDecision) return false
      if (soloConFechaSubasta && !f.posicion.fecha_subasta) return false
      return true
    })
  }, [filas, filtroSem, scoreMin, filtroDecision, decisions, soloConFechaSubasta])

  const decidir = (contractId: string, dec: Decision) => {
    setDecisions(prev => {
      const actual = prev[contractId] ?? null
      return { ...prev, [contractId]: actual === dec ? null : dec }
    })
  }

  const exportarCSV = () => {
    const headers = ['Score', 'Semaforo', 'Contrato', 'Ciudad', 'Provincia', 'm2', 'OB', 'Asking', 'Descuento_pct', 'Rating_D', 'Rating_P', 'Rating_J', 'Rating_Pr', 'Alerta_cargas', 'Decision']
    const rows = filasFiltradas.map(f => {
      const { alerta } = calcRatioRiesgoCargas(f.posicion.cargas_previas, f.posicion.asking_price)
      const m2 = f.posicion.datos_catastro?.superficie_construida ?? f.posicion.metros_cuadrados ?? ''
      const desc = f.descuento != null ? (f.descuento * 100).toFixed(1) : ''
      const dec = decisions[f.grupo.contractId] ?? ''
      return [
        f.score,
        SEMAFORO_CFG[f.sem].label,
        f.grupo.contractId,
        f.posicion.datos_catastro?.municipio ?? f.grupo.ciudad ?? '',
        f.posicion.provincia ?? '',
        m2,
        f.grupo.obTotal ?? '',
        f.grupo.askingTotal ?? '',
        desc,
        f.ratings.rating_deudor ?? '',
        f.ratings.rating_posesion ?? '',
        f.ratings.rating_juzgado ?? '',
        f.ratings.rating_procedimiento ?? '',
        alerta ? 'Sí' : 'No',
        dec,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    })
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `criba-deuda-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ fontFamily: 'Hanken Grotesk, sans-serif' }}>

      {/* Resumen semáforo + decisiones */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {(['todos', 'verde', 'amarillo', 'rojo'] as const).map(s => {
          const cfg = s === 'todos' ? null : SEMAFORO_CFG[s]
          const count = s === 'todos' ? filas.length : conteos[s]
          const activo = filtroSem === s
          return (
            <button
              key={s}
              onClick={() => setFiltroSem(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                border: activo ? `2px solid ${cfg?.dot ?? '#A6855A'}` : '1.5px solid rgba(0,0,0,0.12)',
                background: activo ? (cfg?.bg ?? 'rgba(166,133,90,0.1)') : '#FFF',
                color: activo ? (cfg?.dot ?? '#A6855A') : '#666',
              }}
            >
              {cfg && <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.dot }} />}
              {s === 'todos' ? 'Todos' : cfg!.label} <span style={{ fontWeight: 800 }}>{count}</span>
            </button>
          )
        })}

        <div style={{ width: 1, background: 'rgba(0,0,0,0.1)', margin: '0 4px' }} />

        {/* Decisiones tomadas */}
        {conteos.seleccionado > 0 && (
          <button
            onClick={() => setFiltroDecision(filtroDecision === 'seleccionado' ? 'todos' : 'seleccionado')}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: filtroDecision === 'seleccionado' ? '2px solid #16A34A' : '1.5px solid rgba(0,0,0,0.12)',
              background: filtroDecision === 'seleccionado' ? 'rgba(22,163,74,0.1)' : '#FFF', color: '#16A34A' }}>
            ✅ Seleccionados {conteos.seleccionado}
          </button>
        )}
        {conteos.revisar > 0 && (
          <button
            onClick={() => setFiltroDecision(filtroDecision === 'revisar' ? 'todos' : 'revisar')}
            style={{ padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: filtroDecision === 'revisar' ? '2px solid #F59E0B' : '1.5px solid rgba(0,0,0,0.12)',
              background: filtroDecision === 'revisar' ? 'rgba(245,158,11,0.1)' : '#FFF', color: '#B45309' }}>
            ⏸ Revisar {conteos.revisar}
          </button>
        )}

        {/* Fecha subasta conocida */}
        <button
          onClick={() => setSoloConFechaSubasta(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600, cursor: 'pointer',
            border: soloConFechaSubasta ? '2px solid #7C3AED' : '1.5px solid rgba(0,0,0,0.12)',
            background: soloConFechaSubasta ? 'rgba(124,58,237,0.1)' : '#FFF',
            color: soloConFechaSubasta ? '#7C3AED' : '#666',
          }}
        >
          📅 Fecha subasta conocida
        </button>

        {/* Score mínimo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          <span style={{ fontSize: 12, color: '#888' }}>Score mín.</span>
          {[0, 40, 65].map(v => (
            <button key={v} onClick={() => setScoreMin(v)} style={{
              padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: scoreMin === v ? '2px solid #A6855A' : '1.5px solid rgba(0,0,0,0.12)',
              background: scoreMin === v ? 'rgba(166,133,90,0.1)' : '#FFF',
              color: scoreMin === v ? '#A6855A' : '#666',
            }}>{v === 0 ? 'Todos' : `≥${v}`}</button>
          ))}
        </div>
      </div>

      {/* Tabla densa */}
      <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid rgba(0,0,0,0.08)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F9F8F5', borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
              {['Score', 'Contrato', 'Ciudad', 'm²', 'OB', 'Asking', 'Desc%', 'D P J Pr', 'Alerta', 'Decisión'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700,
                  color: '#888', letterSpacing: '0.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filasFiltradas.length === 0 && (
              <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 13 }}>
                Sin activos con estos filtros
              </td></tr>
            )}
            {filasFiltradas.map((f, i) => {
              const dec = decisions[f.grupo.contractId] ?? null
              const { alerta } = calcRatioRiesgoCargas(f.posicion.cargas_previas, f.posicion.asking_price)
              const m2 = f.posicion.datos_catastro?.superficie_construida ?? f.posicion.metros_cuadrados
              const rowBg = dec === 'seleccionado' ? 'rgba(22,163,74,0.04)'
                : dec === 'descartado' ? 'rgba(0,0,0,0.03)'
                : i % 2 === 0 ? '#FFF' : '#FAFAF8'
              const rowOpacity = dec === 'descartado' ? 0.45 : 1

              return (
                <tr key={f.grupo.contractId}
                  style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: rowBg, opacity: rowOpacity, cursor: 'pointer' }}
                  onClick={() => onAbrir(f.grupo.contractId)}
                >
                  {/* Score */}
                  <td style={{ padding: '10px 12px' }}>
                    <ScoreBadge score={f.score} />
                  </td>

                  {/* Contrato */}
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1A1A1A', whiteSpace: 'nowrap' }}>
                    {f.grupo.contractId.length > 16 ? f.grupo.contractId.slice(0, 16) + '…' : f.grupo.contractId}
                    {f.grupo.items.length > 1 && (
                      <span style={{ marginLeft: 4, fontSize: 10, background: 'rgba(166,133,90,0.15)',
                        color: '#A6855A', borderRadius: 999, padding: '1px 5px' }}>
                        {f.grupo.items.length}
                      </span>
                    )}
                  </td>

                  {/* Ciudad */}
                  <td style={{ padding: '10px 12px', color: '#444', whiteSpace: 'nowrap' }}>
                    {f.posicion.datos_catastro?.municipio ?? f.grupo.ciudad ?? '—'}
                  </td>

                  {/* m² */}
                  <td style={{ padding: '10px 12px', color: '#444', textAlign: 'right' }}>
                    {m2 ? `${m2}` : '—'}
                  </td>

                  {/* OB */}
                  <td style={{ padding: '10px 12px', color: '#444', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmt(f.grupo.obTotal)}
                  </td>

                  {/* Asking */}
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1A1A1A', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {fmt(f.grupo.askingTotal)}
                  </td>

                  {/* Descuento */}
                  <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700,
                    color: f.descuento != null ? (f.descuento >= 0.3 ? '#16A34A' : f.descuento >= 0.15 ? '#F59E0B' : '#EF4444') : '#999' }}>
                    {pct(f.descuento)}
                  </td>

                  {/* Ratings D P J Pr */}
                  <td style={{ padding: '10px 12px' }}>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <RatingDot r={f.ratings.rating_deudor} />
                      <RatingDot r={f.ratings.rating_posesion} />
                      <RatingDot r={f.ratings.rating_juzgado} />
                      <RatingDot r={f.ratings.rating_procedimiento} />
                    </div>
                  </td>

                  {/* Alerta cargas */}
                  <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                    {alerta ? <span title="Cargas previas superan asking">🔴</span> : <span style={{ color: '#CCC' }}>—</span>}
                  </td>

                  {/* Acciones — no propagar click a la fila */}
                  <td style={{ padding: '10px 12px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {([
                        { d: 'seleccionado' as Decision, emoji: '✅', label: 'Seleccionar' },
                        { d: 'revisar' as Decision,      emoji: '⏸',  label: 'Revisar luego' },
                        { d: 'descartado' as Decision,   emoji: '❌', label: 'Descartar' },
                      ]).map(({ d, emoji, label }) => (
                        <button
                          key={d}
                          title={label}
                          onClick={() => decidir(f.grupo.contractId, d)}
                          style={{
                            fontSize: 14, cursor: 'pointer', padding: '2px 6px',
                            borderRadius: 6, border: dec === d ? '2px solid #A6855A' : '1.5px solid rgba(0,0,0,0.1)',
                            background: dec === d ? 'rgba(166,133,90,0.12)' : 'transparent',
                            opacity: dec !== null && dec !== d ? 0.3 : 1,
                          }}
                        >{emoji}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, color: '#AAA' }}>
          {filasFiltradas.length} de {filas.length} activos · haz clic en una fila para abrir la ficha
        </span>
        <button
          onClick={exportarCSV}
          disabled={filasFiltradas.length === 0}
          style={{
            fontSize: 12, fontWeight: 600, cursor: filasFiltradas.length === 0 ? 'default' : 'pointer',
            padding: '6px 14px', borderRadius: 999,
            border: '1.5px solid rgba(166,133,90,0.4)',
            background: 'rgba(166,133,90,0.08)', color: '#A6855A',
            opacity: filasFiltradas.length === 0 ? 0.4 : 1,
          }}
        >
          ↓ Exportar CSV ({filasFiltradas.length})
        </button>
      </div>
    </div>
  )
}
