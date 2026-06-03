'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── helpers ──────────────────────────────────────────────────────────────────
function fmt(v: number | null | undefined, suffix = '€'): string {
  if (v == null) return '—'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M${suffix}`
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(Math.abs(v) < 10_000 ? 1 : 0)}k${suffix}`
  return `${v}${suffix}`
}
function toNum(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? 0 : n }
  return 0
}

const CONCEPTOS_GASTOS = [
  { id: 'precio_compra', label: 'Precio de compra' },
  { id: 'reforma', label: 'Reforma' },
  { id: 'itp', label: 'ITP (2%)' },
  { id: 'notaria', label: 'Notaría + Registro' },
  { id: 'honorarios_api', label: 'Honorarios API' },
  { id: 'certificado_energetico', label: 'Cert. Energético' },
  { id: 'comision_venta', label: 'Comisión venta' },
  { id: 'seguros', label: 'Seguros' },
  { id: 'suministros', label: 'Suministros / Basura' },
  { id: 'otros', label: 'Otros gastos' },
]

type Gastos = Record<string, { estimado: number | string; real: number | string }>

interface Inmueble {
  id: string
  titulo: string | null
  direccion: string | null
  ciudad: string | null
  tipologia: string | null
  estado: string | null
  precio_compra: number | null
  superficie: number | null
  habitaciones: number | null
  imagen_portada: string | null
  precio_venta_conservador: number | null
  precio_venta_realista: number | null
  precio_venta_optimista: number | null
  duracion_meses: number | null
  gastos_json: Gastos | null
  analizado_en: string | null
  notas: string | null
  fuente: string | null
}

export default function ReportePage() {
  const { id } = useParams<{ id: string }>()
  const [item, setItem] = useState<Inmueble | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('inmuebles').select('*').eq('id', id).single()
      .then(({ data }) => { setItem(data); setLoading(false) })
  }, [id])

  useEffect(() => {
    if (!loading && item) {
      setTimeout(() => window.print(), 600)
    }
  }, [loading, item])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Helvetica, Arial, sans-serif', color: '#888' }}>
      Generando reporte...
    </div>
  )
  if (!item) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Helvetica, Arial, sans-serif', color: '#888' }}>
      Inmueble no encontrado.
    </div>
  )

  // ── Cálculos ─────────────────────────────────────────────────────────────
  const g = item.gastos_json
  const totalInv = g
    ? CONCEPTOS_GASTOS.reduce((sum, c) => {
        const gc = g[c.id] || { estimado: 0, real: 0 }
        const r = toNum(gc.real); const e = toNum(gc.estimado)
        return sum + (r > 0 ? r : e)
      }, 0)
    : null

  const pvs = [item.precio_venta_conservador, item.precio_venta_realista, item.precio_venta_optimista]
  const bens = pvs.map(pv => (pv && totalInv) ? pv - totalInv : null)
  const rois = bens.map(b => (b !== null && totalInv) ? (b / totalInv) * 100 : null)
  const dm = item.duracion_meses
  const roisAnual = rois.map(r => (r !== null && dm && dm > 0) ? r * 12 / dm : null)

  const ESC = [
    { label: 'Pesimista', bg: '#FFF0EE', color: '#DC2626' },
    { label: 'Realista',  bg: '#FFFBEB', color: '#D97706' },
    { label: 'Optimista', bg: '#F0FDF4', color: '#16A34A' },
  ]

  const roiColor = (v: number | null) =>
    v === null ? '#BBB' : v >= 30 ? '#16A34A' : v >= 15 ? '#D97706' : '#DC2626'

  const gastoRows = g
    ? CONCEPTOS_GASTOS.map(c => {
        const gc = g[c.id] || { estimado: 0, real: 0 }
        const r = toNum(gc.real); const e = toNum(gc.estimado)
        const val = r > 0 ? r : e
        return val > 0 ? { label: c.label, val } : null
      }).filter(Boolean) as { label: string; val: number }[]
    : []

  const nombre = item.titulo || item.direccion || 'Inmueble'
  const fecha = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Helvetica, Arial, sans-serif; background: #fff; color: #1A1A1A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>

      {/* Print button — solo visible en pantalla */}
      <div className="no-print" style={{ position: 'fixed', top: 16, right: 16, zIndex: 99, display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()}
          style={{ padding: '8px 18px', background: '#F26E1F', color: '#fff', border: 'none', borderRadius: 8, fontFamily: 'Helvetica,Arial,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Descargar PDF
        </button>
        <button onClick={() => window.close()}
          style={{ padding: '8px 14px', background: '#F5F4F0', color: '#888', border: 'none', borderRadius: 8, fontFamily: 'Helvetica,Arial,sans-serif', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          ✕
        </button>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 0' }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, color: '#F26E1F', textTransform: 'uppercase', marginBottom: 4 }}>
              WALLEST · HASU ACTIVOS INMOBILIARIOS SL
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A', lineHeight: 1.2, marginBottom: 4 }}>
              {nombre}
            </div>
            {item.ciudad && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>
                📍 {item.direccion && item.titulo ? item.direccion + ', ' : ''}{item.ciudad}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#AAA', marginTop: 6 }}>Análisis generado el {fecha}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 10, color: '#AAA', marginBottom: 2 }}>Precio de compra</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#F26E1F', fontVariantNumeric: 'tabular-nums' }}>
              {fmt(item.precio_compra)}
            </div>
          </div>
        </div>

        {/* Línea naranja separadora */}
        <div style={{ height: 3, background: 'linear-gradient(90deg,#F26E1F,#FBBF24)', borderRadius: 2, marginBottom: 20 }} />

        {/* ── Foto + datos básicos ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          {item.imagen_portada && (
            <div style={{ width: 200, height: 130, borderRadius: 10, overflow: 'hidden', flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.imagen_portada} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                { label: 'Tipología', val: item.tipologia || '—' },
                { label: 'Superficie', val: item.superficie ? `${item.superficie} m²` : '—' },
                { label: 'Habitaciones', val: item.habitaciones ? String(item.habitaciones) : '—' },
                { label: 'Duración operación', val: dm ? `${dm} meses` : '—' },
                { label: 'Fuente', val: item.fuente || '—' },
                { label: 'Estado', val: item.estado || '—' },
              ].map(r => (
                <div key={r.label} style={{ background: '#F5F4F0', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 8, fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>{r.label}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#222', textTransform: r.label === 'Tipología' || r.label === 'Estado' ? 'capitalize' : 'none' }}>{r.val}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Notas ────────────────────────────────────────────────────────── */}
        {item.notas && (
          <div style={{ marginBottom: 20, borderLeft: '4px solid #F26E1F', background: '#FFF8F4', borderRadius: '0 8px 8px 0', padding: '10px 14px', border: '1px solid #F5D5C0', borderLeftColor: '#F26E1F', borderLeftWidth: 4 }}>
            <div style={{ fontSize: 8, fontWeight: 700, color: '#F26E1F', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>Notas</div>
            <div style={{ fontSize: 11, color: '#555', lineHeight: 1.6 }}>{item.notas}</div>
          </div>
        )}

        {/* ── Tabla de escenarios ──────────────────────────────────────────── */}
        {totalInv && pvs.some(p => p) && (
          <>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Análisis de rentabilidad
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <thead>
                <tr style={{ background: '#F5F4F0' }}>
                  <th style={{ width: 120, padding: '8px 10px', textAlign: 'left', fontSize: 8, fontWeight: 700, color: '#AAA', textTransform: 'uppercase', letterSpacing: 1, border: '1px solid #ECEAE4' }}></th>
                  {ESC.map(s => (
                    <th key={s.label} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 9, fontWeight: 900, color: s.color, textTransform: 'uppercase', letterSpacing: 1, background: s.bg, border: '1px solid #ECEAE4' }}>
                      {s.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'P. Venta', vals: pvs.map(v => v ? fmt(v) : '—'), bg: '#fff', bold: true },
                  { label: 'Inv. Total', vals: pvs.map(() => fmt(totalInv)), bg: '#FAFAF8', bold: false },
                  { label: 'Beneficio neto', vals: bens.map((b, i) => b !== null ? (b >= 0 ? '+' : '') + fmt(b) : '—'), bg: '#fff', bold: true, colors: bens.map(b => b === null ? '#BBB' : b >= 0 ? '#16A34A' : '#DC2626') },
                  { label: 'ROI operación', vals: rois.map(r => r !== null ? r.toFixed(1) + '%' : '—'), bg: '#fff', bold: true, colors: rois.map(roiColor) },
                  { label: `ROI anualizado${dm ? ` (${dm}m)` : ''}`, vals: roisAnual.map(r => r !== null ? r.toFixed(1) + '%' : '—'), bg: '#F5F4F0', bold: true, colors: roisAnual.map(roiColor) },
                ].map(row => (
                  <tr key={row.label}>
                    <td style={{ padding: '8px 10px', fontSize: 10, fontWeight: 700, color: '#666', background: row.bg, border: '1px solid #ECEAE4' }}>{row.label}</td>
                    {row.vals.map((v, i) => (
                      <td key={i} style={{ padding: '8px 10px', textAlign: 'center', fontSize: 12, fontWeight: row.bold ? 900 : 400, fontVariantNumeric: 'tabular-nums', color: row.colors ? row.colors[i] : '#333', background: row.bg, border: '1px solid #ECEAE4' }}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* ── Desglose de gastos ───────────────────────────────────────────── */}
        {gastoRows.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#1A1A1A', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Desglose de inversión
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20 }}>
              <tbody>
                {gastoRows.map((r, i) => (
                  <tr key={r.label} style={{ background: i % 2 === 0 ? '#fff' : '#FAFAF8' }}>
                    <td style={{ padding: '7px 10px', fontSize: 10, color: '#555', border: '1px solid #ECEAE4' }}>{r.label}</td>
                    <td style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: '#222', textAlign: 'right', fontVariantNumeric: 'tabular-nums', border: '1px solid #ECEAE4' }}>{fmt(r.val)}</td>
                  </tr>
                ))}
                <tr style={{ background: '#1A1A1A' }}>
                  <td style={{ padding: '9px 10px', fontSize: 10, fontWeight: 900, color: '#fff', border: '1px solid #1A1A1A' }}>INVERSIÓN TOTAL</td>
                  <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 900, color: '#F26E1F', textAlign: 'right', fontVariantNumeric: 'tabular-nums', border: '1px solid #1A1A1A' }}>{fmt(totalInv)}</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ borderTop: '1px solid #ECEAE4', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 900, color: '#F26E1F' }}>WALLEST</div>
            <div style={{ fontSize: 8, color: '#AAA' }}>HASU Activos Inmobiliarios SL · wallest.pro</div>
          </div>
          <div style={{ fontSize: 8, color: '#CCC' }}>
            Documento de uso interno · {fecha}
          </div>
        </div>

      </div>
    </>
  )
}
