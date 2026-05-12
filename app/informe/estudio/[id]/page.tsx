'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

const fmtPct = (n: number) =>
  (n >= 0 ? '+' : '') + n.toFixed(2) + '%'

type GastosJson = Record<string, { estimado: number; real: number }>

const GASTO_LABELS: Record<string, string> = {
  precio_compra:              'Precio de compra',
  itp:                        'Impuesto de compra ITP',
  gastos_compraventa:         'Gastos de compraventa (notario, registro, gestoría)',
  certificado_energetico:     'Certificado energético',
  comisiones_inmobiliarias:   'Comisiones inmobiliarias',
  reforma:                    'Reforma',
  seguros:                    'Seguros',
  suministros_basura:         'Suministros / basura',
  deuda_ibi:                  'Deuda IBI',
  deuda_comunidad:            'Deuda comunidad',
  cuotas_comunidad:           'Cuotas comunidad',
  gastos_cancelacion:         'Gastos cancelación hipoteca',
  honorarios_profesionales:   'Honorarios profesionales',
  honorarios_complementaria:  'Honorarios complementaria',
}

// Orden de aparición en la tabla
const GASTO_ORDER = [
  'precio_compra','gastos_compraventa','itp','certificado_energetico',
  'comisiones_inmobiliarias','reforma','seguros','suministros_basura',
  'deuda_ibi','deuda_comunidad','cuotas_comunidad','gastos_cancelacion',
  'honorarios_profesionales','honorarios_complementaria',
]

type Estudio = {
  id: string
  nombre: string | null
  titulo: string | null
  direccion: string | null
  ciudad: string | null
  superficie: number | null
  habitaciones: number | null
  precio_compra: number
  inversion_total: number | null
  precio_venta_conservador: number | null
  precio_venta_realista: number | null
  precio_venta_optimista: number | null
  duracion_meses: number | null
  gastos_json: GastosJson | null
  url: string | null
  analizado_en: string | null
}

export default function InformeEstudioPage() {
  const { id } = useParams<{ id: string }>()
  const [e, setE] = useState<Estudio | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('inmuebles_estudio').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { setError('Estudio no encontrado'); setLoading(false); return }
        setE(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#888', fontFamily: 'system-ui', fontSize: 14 }}>Cargando análisis...</div>
    </div>
  )
  if (error || !e) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#EF4444', fontFamily: 'system-ui', fontSize: 14 }}>{error}</div>
    </div>
  )

  // ── Calcular total desde gastos_json ─────────────────────────────────────────
  const gastos = e.gastos_json || {}
  const totalEstimado = GASTO_ORDER.reduce((sum, key) => sum + (gastos[key]?.estimado || 0), 0)
  const totalReal     = GASTO_ORDER.reduce((sum, key) => sum + (gastos[key]?.real || 0), 0)
  const inversion     = e.inversion_total || totalEstimado || e.precio_compra

  // Partidas visibles (estimado > 0 o real > 0)
  const partidasVisibles = GASTO_ORDER.filter(k => (gastos[k]?.estimado || 0) > 0 || (gastos[k]?.real || 0) > 0)

  // ── Escenarios ───────────────────────────────────────────────────────────────
  const ventaC = e.precio_venta_conservador ?? 0
  const ventaR = e.precio_venta_realista    ?? 0
  const ventaO = e.precio_venta_optimista   ?? 0

  const calcEsc = (venta: number) => {
    const benef = venta - inversion
    const roi   = inversion > 0 ? (benef / inversion) * 100 : 0
    const roiA  = e.duracion_meses && e.duracion_meses > 0
      ? (Math.pow(1 + roi / 100, 12 / e.duracion_meses) - 1) * 100
      : null
    return { venta, benef, roi, roiA }
  }

  const escenarios = [
    { label: 'Conservador', color: '#888',    bg: 'rgba(136,136,136,0.08)', ...calcEsc(ventaC) },
    { label: 'Realista',    color: '#F26E1F', bg: 'rgba(242,110,31,0.08)',  ...calcEsc(ventaR) },
    { label: 'Optimista',   color: '#22C55E', bg: 'rgba(34,197,94,0.08)',   ...calcEsc(ventaO) },
  ]

  const roiR = escenarios[1].roi
  const semColor = roiR >= 50 ? '#22C55E' : roiR >= 30 ? '#F59E0B' : '#EF4444'
  const semIcon  = roiR >= 50 ? '🟢' : roiR >= 30 ? '🟡' : '🔴'
  const semLabel = roiR >= 50 ? 'Operación fuerte — entra según criterios Wallest'
                 : roiR >= 30 ? 'Analizar bien antes de avanzar'
                 : 'No entra según criterios Wallest'

  const titulo = e.titulo || e.nombre || e.direccion || 'Inmueble'
  const hoy    = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f0f0f0; font-family: 'Inter', -apple-system, sans-serif; }
        .page { max-width: 780px; margin: 32px auto; background: #fff; box-shadow: 0 4px 40px rgba(0,0,0,0.12); }

        .header { background: #111; padding: 36px 40px 32px; position: relative; overflow: hidden; }
        .header-brand { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #999; text-transform: uppercase; margin-bottom: 8px; }
        .header-title { font-size: 32px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 6px; }
        .header-sub { font-size: 13px; color: #666; font-weight: 500; margin-bottom: 3px; }
        .roi-badge { position: absolute; right: 40px; top: 36px; background: #F26E1F; border-radius: 16px; padding: 16px 22px; text-align: center; min-width: 110px; }
        .roi-badge .num { font-size: 30px; font-weight: 900; color: #fff; line-height: 1; }
        .roi-badge .lbl { font-size: 10px; color: rgba(255,255,255,0.8); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }

        .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #eee; }
        .kpi { padding: 20px 28px; border-right: 1px solid #eee; }
        .kpi:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
        .kpi-value { font-size: 20px; font-weight: 900; color: #111; }
        .kpi-sub { font-size: 11px; color: #bbb; margin-top: 2px; }

        .body { padding: 28px 40px 40px; }
        .section { margin-bottom: 22px; }
        .section-header { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 11px 16px; border-radius: 8px 8px 0 0; }
        .section-num { background: #F26E1F; color: #fff; font-size: 11px; font-weight: 900; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #fff; }

        .table { width: 100%; border-collapse: collapse; border: 1px solid #e5e5e5; border-top: none; }
        .table th { background: #f8f8f8; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.8px; padding: 9px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        .table th.right { text-align: right; }
        .table td { padding: 11px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
        .table td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .table td.muted { color: #bbb; text-align: right; }
        .table tr:last-child td { border-bottom: none; }
        .table tr.total td { background: #fafafa; font-weight: 900; font-size: 14px; color: #111; border-top: 2px solid #e5e5e5; }
        .table tr.total .orange { color: #F26E1F; }

        .escenarios { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #e5e5e5; border-top: none; }
        .esc { padding: 18px 16px; border-right: 1px solid #e5e5e5; }
        .esc:last-child { border-right: none; }
        .esc-label { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
        .esc-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .esc-key { font-size: 11px; color: #999; }
        .esc-val { font-size: 12px; font-weight: 700; color: #333; }
        .esc-roi { font-size: 22px; font-weight: 900; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.06); }
        .esc-roi-a { font-size: 13px; font-weight: 700; margin-top: 3px; }
        .esc-roi-label { font-size: 10px; color: #999; margin-top: 2px; }

        .semaforo { border: 1px solid #e5e5e5; border-top: none; padding: 13px 20px; display: flex; align-items: center; gap: 10px; }
        .sem-text { font-size: 12px; font-weight: 700; }

        .footer { border-top: 1px solid #e5e5e5; padding: 14px 40px; text-align: center; }
        .footer p { font-size: 11px; color: #bbb; }

        .print-bar { display: flex; justify-content: flex-end; padding: 16px 0; max-width: 780px; margin: 0 auto; }
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
          <div className="header-title">Análisis de<br />Rentabilidad</div>
          <div className="header-sub">{titulo}</div>
          {e.ciudad && <div className="header-sub" style={{ color: '#555' }}>{e.ciudad}</div>}
          <div className="header-sub" style={{ color: '#555', fontSize: 12 }}>{hoy}{e.duracion_meses ? ` · Duración estimada: ${e.duracion_meses} meses` : ''}</div>
          {ventaR > 0 && (
            <div className="roi-badge">
              <div className="num">{fmtPct(roiR)}</div>
              <div className="lbl">ROI realista</div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">Precio de compra</div>
            <div className="kpi-value">{fmt(e.precio_compra)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Total inversión</div>
            <div className="kpi-value">{fmt(inversion)}</div>
            <div className="kpi-sub">incluye todos los gastos</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Venta realista</div>
            <div className="kpi-value">{ventaR > 0 ? fmt(ventaR) : '—'}</div>
          </div>
        </div>

        <div className="body">

          {/* 1. Desglose de costes */}
          <div className="section">
            <div className="section-header">
              <div className="section-num">1</div>
              <div className="section-title">Desglose de costes</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="right">Estimado</th>
                  <th className="right">Real</th>
                </tr>
              </thead>
              <tbody>
                {partidasVisibles.map(key => (
                  <tr key={key}>
                    <td>{GASTO_LABELS[key] || key}</td>
                    <td className="right">{gastos[key]?.estimado > 0 ? fmt(gastos[key].estimado) : <span style={{ color: '#ddd' }}>—</span>}</td>
                    <td className="muted">{gastos[key]?.real > 0 ? fmt(gastos[key].real) : '-'}</td>
                  </tr>
                ))}
                <tr className="total">
                  <td><strong>TOTAL INVERSIÓN</strong></td>
                  <td className="right orange"><strong>{fmt(totalEstimado)}</strong></td>
                  <td className="right orange"><strong>{totalReal > 0 ? fmt(totalReal) : fmt(totalEstimado)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2. Escenarios */}
          {ventaR > 0 && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">2</div>
                <div className="section-title">Escenarios de rentabilidad</div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th className="right">Precio venta</th>
                    <th className="right">Beneficio</th>
                    <th className="right">ROI</th>
                    {e.duracion_meses && <th className="right">ROI Anualizado</th>}
                  </tr>
                </thead>
                <tbody>
                  {escenarios.map(esc => (
                    <tr key={esc.label}>
                      <td style={{ fontWeight: 700, color: esc.color }}>{esc.label}</td>
                      <td className="right">{fmt(esc.venta)}</td>
                      <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 600 }}>{fmt(esc.benef)}</td>
                      <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{fmtPct(esc.roi)}</td>
                      {e.duracion_meses && <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{esc.roiA !== null ? fmtPct(esc.roiA) : '—'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="semaforo">
                <span style={{ fontSize: 18 }}>{semIcon}</span>
                <span className="sem-text" style={{ color: semColor }}>{semLabel}</span>
              </div>
            </div>
          )}

        </div>

        <div className="footer">
          <p>Wallest &nbsp;·&nbsp; Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; hola@hasu.in &nbsp;·&nbsp; wallest.pro</p>
        </div>
      </div>
    </>
  )
}
