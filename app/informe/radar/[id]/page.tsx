'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) =>
  (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

type Radar = {
  id: string
  titulo: string | null
  direccion: string | null
  ciudad: string | null
  superficie: number | null
  habitaciones: number | null
  banos: number | null
  precio: number
  reforma_estimada: number | null
  precio_venta_est: number | null
  precio_max_30: number | null
  precio_max_50: number | null
  precio_max_70: number | null
  semaforo: string | null
  duracion_meses: number | null
  url: string | null
  created_at: string
}

export default function InformeRadarPage() {
  const { id } = useParams<{ id: string }>()
  const [r, setR] = useState<Radar | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('inmuebles_radar').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { setError('Inmueble no encontrado'); setLoading(false); return }
        setR(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#888', fontFamily: 'system-ui', fontSize: 14 }}>Cargando análisis...</div>
    </div>
  )
  if (error || !r) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#EF4444', fontFamily: 'system-ui', fontSize: 14 }}>{error}</div>
    </div>
  )

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const compra   = r.precio
  const reforma  = r.reforma_estimada ?? 0
  const itp      = Math.round(compra * 0.02)
  const notaria  = 1000
  const costoTotal = compra + reforma + itp + notaria
  const ventaBase  = r.precio_venta_est ?? 0

  const escenarios = [
    { label: 'Conservador', mult: 0.90, color: '#888',    bg: 'rgba(136,136,136,0.10)' },
    { label: 'Realista',    mult: 1.00, color: '#F26E1F', bg: 'rgba(242,110,31,0.10)'  },
    { label: 'Optimista',   mult: 1.10, color: '#22C55E', bg: 'rgba(34,197,94,0.10)'   },
  ].map(e => {
    const venta   = Math.round(ventaBase * e.mult)
    const benef   = venta - costoTotal
    const roi     = costoTotal > 0 ? (benef / costoTotal) * 100 : 0
    const roiAnual = r.duracion_meses && r.duracion_meses > 0
      ? (Math.pow(1 + roi / 100, 12 / r.duracion_meses) - 1) * 100
      : null
    return { ...e, venta, benef, roi, roiAnual }
  })

  const roiRealista = escenarios[1].roi
  const semColor = roiRealista >= 50 ? '#22C55E' : roiRealista >= 30 ? '#F59E0B' : '#EF4444'
  const semLabel = roiRealista >= 50 ? 'Operación fuerte — entra según criterios Wallest'
                 : roiRealista >= 30 ? 'Analizar bien antes de avanzar'
                 : 'No entra según criterios Wallest'
  const semIcon  = roiRealista >= 50 ? '🟢' : roiRealista >= 30 ? '🟡' : '🔴'

  const titulo  = r.titulo || r.direccion || r.ciudad || 'Inmueble'
  const hoy     = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const max30   = r.precio_max_30 ?? Math.round((ventaBase - reforma * 1.3 - notaria) / 1.32)
  const max50   = r.precio_max_50 ?? Math.round((ventaBase - reforma * 1.5 - notaria) / 1.52)
  const max70   = r.precio_max_70 ?? Math.round((ventaBase - reforma * 1.7 - notaria) / 1.72)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f0f0f0; font-family: 'Inter', -apple-system, sans-serif; }
        .page { max-width: 780px; margin: 32px auto; background: #fff; box-shadow: 0 4px 40px rgba(0,0,0,0.12); }

        /* Header */
        .header { background: #111; padding: 36px 40px 32px; position: relative; overflow: hidden; }
        .header-brand { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #999; text-transform: uppercase; margin-bottom: 8px; }
        .header-title { font-size: 32px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 6px; }
        .header-sub { font-size: 13px; color: #666; font-weight: 500; margin-bottom: 4px; }
        .header-date { font-size: 12px; color: #555; }
        .roi-badge { position: absolute; right: 40px; top: 36px; background: #F26E1F; border-radius: 16px; padding: 16px 22px; text-align: center; min-width: 110px; }
        .roi-badge .roi-num { font-size: 30px; font-weight: 900; color: #fff; line-height: 1; }
        .roi-badge .roi-label { font-size: 10px; color: rgba(255,255,255,0.8); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }

        /* KPIs */
        .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #eee; }
        .kpi { padding: 20px 28px; border-right: 1px solid #eee; }
        .kpi:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
        .kpi-value { font-size: 20px; font-weight: 900; color: #111; }
        .kpi-sub { font-size: 11px; color: #bbb; margin-top: 3px; }

        /* Body */
        .body { padding: 28px 40px 40px; }

        /* Section */
        .section { margin-bottom: 22px; }
        .section-header { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 11px 16px; border-radius: 8px 8px 0 0; }
        .section-num { background: #F26E1F; color: #fff; font-size: 11px; font-weight: 900; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #fff; }

        /* Table */
        .table { width: 100%; border-collapse: collapse; border: 1px solid #e5e5e5; border-top: none; }
        .table th { background: #f8f8f8; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.8px; padding: 9px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        .table th.right { text-align: right; }
        .table td { padding: 11px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
        .table td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .table td.sub { color: #999; font-size: 12px; padding-left: 28px; }
        .table tr:last-child td { border-bottom: none; }
        .table tr.total td { background: #fafafa; font-weight: 800; font-size: 14px; color: #111; border-top: 2px solid #e5e5e5; }
        .table tr.total td.orange { color: #F26E1F; }

        /* Escenarios */
        .escenarios { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e5e5e5; border-top: none; }
        .escenario { padding: 18px 16px; border-right: 1px solid #e5e5e5; }
        .escenario:last-child { border-right: none; }
        .esc-label { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
        .esc-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
        .esc-key { font-size: 11px; color: #999; }
        .esc-val { font-size: 12px; font-weight: 700; color: #333; }
        .esc-roi { font-size: 22px; font-weight: 900; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.06); }
        .esc-roi-label { font-size: 10px; color: #999; margin-top: 2px; }

        /* Semáforo */
        .semaforo { border: 1px solid #e5e5e5; border-top: none; padding: 14px 20px; display: flex; align-items: center; gap: 10px; }
        .sem-icon { font-size: 18px; }
        .sem-text { font-size: 12px; font-weight: 700; }

        /* Max compra */
        .maxcompra { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e5e5e5; border-top: none; }
        .mc-item { padding: 14px 16px; border-right: 1px solid #e5e5e5; text-align: center; }
        .mc-item:last-child { border-right: none; }
        .mc-roi { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #999; margin-bottom: 4px; }
        .mc-price { font-size: 18px; font-weight: 900; color: #F26E1F; }
        .mc-diff { font-size: 11px; color: #bbb; margin-top: 3px; }

        /* Inmueble info */
        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid #e5e5e5; border-top: none; }
        .info-item { padding: 12px 16px; border-right: 1px solid #e5e5e5; }
        .info-item:last-child { border-right: none; }
        .info-key { font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
        .info-val { font-size: 14px; font-weight: 800; color: #111; }

        /* Footer */
        .footer { border-top: 1px solid #e5e5e5; padding: 14px 40px; text-align: center; }
        .footer p { font-size: 11px; color: #bbb; letter-spacing: 0.5px; }

        /* Print */
        .print-bar { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 0; max-width: 780px; margin: 0 auto; }
        @media print {
          .print-bar { display: none !important; }
          .page { box-shadow: none; margin: 0; max-width: 100%; }
          body { background: #fff; }
        }
      `}</style>

      <div className="print-bar">
        <button onClick={() => window.print()}
          style={{ background: '#F26E1F', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Descargar PDF ↓
        </button>
      </div>

      <div className="page">

        {/* HEADER */}
        <div className="header">
          <div className="header-brand">Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; Wallest</div>
          <div className="header-title">Análisis de<br />Inversión</div>
          <div className="header-sub">{titulo}</div>
          {r.ciudad && r.ciudad !== r.titulo && <div className="header-sub" style={{ color: '#555' }}>{r.ciudad}</div>}
          <div className="header-date">{hoy}</div>
          {ventaBase > 0 && (
            <div className="roi-badge">
              <div className="roi-num">{fmtPct(roiRealista)}</div>
              <div className="roi-label">ROI realista</div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">Precio pedido</div>
            <div className="kpi-value">{fmt(compra)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Coste total</div>
            <div className="kpi-value">{fmt(costoTotal)}</div>
            <div className="kpi-sub">compra + reforma + gastos</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Venta estimada</div>
            <div className="kpi-value">{ventaBase > 0 ? fmt(ventaBase) : '—'}</div>
          </div>
        </div>

        <div className="body">

          {/* 1. Datos del inmueble */}
          {(r.superficie || r.habitaciones || r.banos) && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">1</div>
                <div className="section-title">Datos del inmueble</div>
              </div>
              <div className="info-grid">
                {r.superficie && <div className="info-item"><div className="info-key">Superficie</div><div className="info-val">{r.superficie} m²</div></div>}
                {r.habitaciones && <div className="info-item"><div className="info-key">Habitaciones</div><div className="info-val">{r.habitaciones}</div></div>}
                {r.banos && <div className="info-item"><div className="info-key">Baños</div><div className="info-val">{r.banos}</div></div>}
              </div>
            </div>
          )}

          {/* 2. Desglose de costes */}
          <div className="section">
            <div className="section-header">
              <div className="section-num">{r.superficie || r.habitaciones ? '2' : '1'}</div>
              <div className="section-title">Desglose de costes</div>
            </div>
            <table className="table">
              <thead><tr><th>Concepto</th><th className="right">Importe</th></tr></thead>
              <tbody>
                <tr><td>Precio de compra</td><td className="right">{fmt(compra)}</td></tr>
                <tr><td>Reforma estimada</td><td className="right">{fmt(reforma)}</td></tr>
                <tr><td>ITP (2% sobre compra)</td><td className="right">{fmt(itp)}</td></tr>
                <tr><td>Notaría + Registro</td><td className="right">{fmt(notaria)}</td></tr>
                <tr className="total"><td><strong>Total invertido</strong></td><td className="right orange"><strong>{fmt(costoTotal)}</strong></td></tr>
              </tbody>
            </table>
          </div>

          {/* 3. Escenarios */}
          {ventaBase > 0 && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">{r.superficie || r.habitaciones ? '3' : '2'}</div>
                <div className="section-title">Escenarios de venta</div>
              </div>
              <div className="escenarios">
                {escenarios.map(e => (
                  <div key={e.label} className="escenario" style={{ background: e.bg }}>
                    <div className="esc-label" style={{ color: e.color }}>{e.label}</div>
                    <div className="esc-row"><span className="esc-key">Venta</span><span className="esc-val">{fmt(e.venta)}</span></div>
                    <div className="esc-row"><span className="esc-key">Beneficio</span><span className="esc-val">{fmt(e.benef)}</span></div>
                    {e.roiAnual !== null && (
                      <div className="esc-row"><span className="esc-key">ROI anual ({r.duracion_meses}m)</span><span className="esc-val">{fmtPct(e.roiAnual)}</span></div>
                    )}
                    <div className="esc-roi" style={{ color: e.color }}>{fmtPct(e.roi)}</div>
                    <div className="esc-roi-label">ROI sobre inversión</div>
                  </div>
                ))}
              </div>
              {/* Semáforo */}
              <div className="semaforo">
                <span className="sem-icon">{semIcon}</span>
                <span className="sem-text" style={{ color: semColor }}>{semLabel}</span>
              </div>
            </div>
          )}

          {/* 4. Precio máximo de compra */}
          {ventaBase > 0 && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">{r.superficie || r.habitaciones ? '4' : '3'}</div>
                <div className="section-title">Precio máximo de compra</div>
              </div>
              <div className="maxcompra">
                {[
                  { roi: '30%', precio: max30, color: '#888' },
                  { roi: '50%', precio: max50, color: '#F26E1F' },
                  { roi: '70%', precio: max70, color: '#22C55E' },
                ].map(m => (
                  <div key={m.roi} className="mc-item">
                    <div className="mc-roi">Para ROI {m.roi}</div>
                    <div className="mc-price" style={{ color: m.color }}>{fmt(m.precio)}</div>
                    <div className="mc-diff">{m.precio < compra ? `${fmt(compra - m.precio)} por encima` : `${fmt(m.precio - compra)} de margen`}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="footer">
          <p>Wallest &nbsp;·&nbsp; Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; hola@hasu.in &nbsp;·&nbsp; wallest.pro</p>
          {r.url && <p style={{ marginTop: 4 }}>Ref: <span style={{ color: '#aaa' }}>{r.url}</span></p>}
        </div>

      </div>
    </>
  )
}
