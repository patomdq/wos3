'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { calcCostoTotal, calcROI, calcEscenarios } from '@/lib/formulas'
import { calcularSemaforo } from '@/lib/analizarInmueble'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const fmt = (n: number) =>
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

const fmtPct = (n: number) =>
  (n >= 0 ? '+' : '') + n.toFixed(1) + '%'

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

const GASTO_ORDER = [
  'precio_compra','gastos_compraventa','itp','certificado_energetico',
  'comisiones_inmobiliarias','reforma','seguros','suministros_basura',
  'deuda_ibi','deuda_comunidad','cuotas_comunidad','gastos_cancelacion',
  'honorarios_profesionales','honorarios_complementaria',
]

type Inmueble = {
  id: string
  tipologia: string | null
  titulo: string | null
  direccion: string | null
  ciudad: string | null
  superficie: number | null
  habitaciones: number | null
  banos: number | null
  precio_compra: number
  reforma_estimada: number | null
  precio_venta_conservador: number | null
  precio_venta_realista: number | null
  precio_venta_optimista: number | null
  roi_calculado: number | null
  precio_max_30: number | null
  precio_max_50: number | null
  precio_max_70: number | null
  semaforo: string | null
  gastos_json: GastosJson | null
  duracion_meses: number | null
  estado: string
  url: string | null
  created_at: string
}

const SEMAFORO_COLOR: Record<string, string> = { verde: '#22C55E', amarillo: '#F59E0B', rojo: '#EF4444' }
const SEMAFORO_ICON:  Record<string, string> = { verde: '🟢', amarillo: '🟡', rojo: '🔴' }
const SEMAFORO_LABEL: Record<string, string> = {
  verde:    'Operación fuerte — entra según criterios Wallest',
  amarillo: 'Analizar bien antes de avanzar',
  rojo:     'No entra según criterios Wallest',
}

export default function InformeInmueblePage() {
  const { id } = useParams<{ id: string }>()
  const [inm, setInm] = useState<Inmueble | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('inmuebles').select('*').eq('id', id).single()
      .then(({ data, error }) => {
        if (error || !data) { setError('Inmueble no encontrado'); setLoading(false); return }
        setInm(data)
        setLoading(false)
        if (typeof window !== 'undefined' && window.location.search.includes('pdf=1')) {
          setTimeout(() => window.print(), 800)
        }
      })
  }, [id])

  if (loading) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#888', fontFamily: 'system-ui', fontSize: 14 }}>Cargando análisis...</div>
    </div>
  )
  if (error || !inm) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#EF4444', fontFamily: 'system-ui', fontSize: 14 }}>{error}</div>
    </div>
  )

  const esProfundo = !['borrador', 'sin_analizar'].includes(inm.estado)
  const titulo = inm.titulo || inm.direccion || inm.ciudad || 'Inmueble'
  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  const compra = inm.precio_compra
  const reforma = inm.reforma_estimada ?? 0

  // ── Vista de análisis profundo (En Estudio en adelante) — usa gastos_json si existe ──
  const gastos = inm.gastos_json || {}
  const totalEstimado = GASTO_ORDER.reduce((sum, key) => sum + (gastos[key]?.estimado || 0), 0)
  const totalReal     = GASTO_ORDER.reduce((sum, key) => sum + (gastos[key]?.real || 0), 0)
  const hayGastosDetallados = totalEstimado > 0
  const inversionProfunda = hayGastosDetallados ? totalEstimado : calcCostoTotal(compra, reforma)
  const partidasVisibles = GASTO_ORDER.filter(k => (gastos[k]?.estimado || 0) > 0 || (gastos[k]?.real || 0) > 0)

  const ventaC = inm.precio_venta_conservador ?? 0
  const ventaR = inm.precio_venta_realista ?? 0
  const ventaO = inm.precio_venta_optimista ?? 0

  const calcEscProfundo = (venta: number) => {
    const benef = venta - inversionProfunda
    const roi = inversionProfunda > 0 ? (benef / inversionProfunda) * 100 : 0
    const roiA = inm.duracion_meses && inm.duracion_meses > 0
      ? (Math.pow(1 + roi / 100, 12 / inm.duracion_meses) - 1) * 100
      : null
    return { venta, benef, roi, roiA }
  }
  const escenariosProfundo = [
    { label: 'Conservador', color: '#888' },
    { label: 'Realista',    color: '#A6855A' },
    { label: 'Optimista',   color: '#22C55E' },
  ].map((e, i) => ({ ...e, ...calcEscProfundo([ventaC, ventaR, ventaO][i]) }))

  const roiProfundoRealista = escenariosProfundo[1].roi / 100
  const semProfundo = calcularSemaforo(roiProfundoRealista)

  // ── Vista rápida (Radar) — un único precio de venta estimado, precio máximo por ROI ──
  const ventaBase = inm.precio_venta_realista ?? 0
  const costoTotalRapido = calcCostoTotal(compra, reforma)
  const roiRapido = ventaBase > 0 ? calcROI(ventaBase, compra, reforma) : (inm.roi_calculado ?? 0) / 100
  const semRapido = calcularSemaforo(roiRapido)
  const escenariosMax = ventaBase > 0 ? calcEscenarios(ventaBase, reforma) : null
  const max30 = inm.precio_max_30 ?? escenariosMax?.find(e => e.roiTarget === 0.30)?.precioMaxCompra ?? null
  const max50 = inm.precio_max_50 ?? escenariosMax?.find(e => e.roiTarget === 0.50)?.precioMaxCompra ?? null
  const max70 = inm.precio_max_70 ?? escenariosMax?.find(e => e.roiTarget === 0.70)?.precioMaxCompra ?? null

  const roiBadge = esProfundo ? escenariosProfundo[1].roi / 100 : roiRapido
  const semBadge = esProfundo ? semProfundo : semRapido

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
        .header-date { font-size: 12px; color: #555; }
        .roi-badge { position: absolute; right: 40px; top: 36px; background: #A6855A; border-radius: 16px; padding: 16px 22px; text-align: center; min-width: 110px; }
        .roi-badge .num { font-size: 30px; font-weight: 900; color: #14110C; line-height: 1; }
        .roi-badge .lbl { font-size: 10px; color: rgba(20,17,12,0.75); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }

        .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #eee; }
        .kpi { padding: 20px 28px; border-right: 1px solid #eee; }
        .kpi:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #999; margin-bottom: 6px; }
        .kpi-value { font-size: 20px; font-weight: 900; color: #111; }
        .kpi-sub { font-size: 11px; color: #bbb; margin-top: 2px; }

        .body { padding: 28px 40px 40px; }
        .section { margin-bottom: 22px; }
        .section-header { display: flex; align-items: center; gap: 10px; background: #1a1a1a; padding: 11px 16px; border-radius: 8px 8px 0 0; }
        .section-num { background: #A6855A; color: #14110C; font-size: 11px; font-weight: 900; width: 20px; height: 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #fff; }

        .table { width: 100%; border-collapse: collapse; border: 1px solid #e5e5e5; border-top: none; }
        .table th { background: #f8f8f8; font-size: 10px; font-weight: 700; color: #888; text-transform: uppercase; letter-spacing: 0.8px; padding: 9px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        .table th.right { text-align: right; }
        .table td { padding: 11px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
        .table td.right { text-align: right; font-variant-numeric: tabular-nums; }
        .table td.muted { color: #bbb; text-align: right; }
        .table tr:last-child td { border-bottom: none; }
        .table tr.total td { background: #fafafa; font-weight: 900; font-size: 14px; color: #111; border-top: 2px solid #e5e5e5; }
        .table tr.total .orange { color: #A6855A; }

        .escenarios { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #e5e5e5; border-top: none; }
        .esc { padding: 18px 16px; border-right: 1px solid #e5e5e5; }
        .esc:last-child { border-right: none; }
        .esc-label { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 12px; }
        .esc-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .esc-key { font-size: 11px; color: #999; }
        .esc-val { font-size: 12px; font-weight: 700; color: #333; }
        .esc-roi { font-size: 22px; font-weight: 900; margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(0,0,0,0.06); }
        .esc-roi-label { font-size: 10px; color: #999; margin-top: 2px; }

        .semaforo { border: 1px solid #e5e5e5; border-top: none; padding: 13px 20px; display: flex; align-items: center; gap: 10px; }
        .sem-text { font-size: 12px; font-weight: 700; }

        .maxcompra { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #e5e5e5; border-top: none; }
        .mc-item { padding: 14px 16px; border-right: 1px solid #e5e5e5; text-align: center; }
        .mc-item:last-child { border-right: none; }
        .mc-roi { font-size: 10px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; color: #999; margin-bottom: 4px; }
        .mc-price { font-size: 18px; font-weight: 900; color: #A6855A; }
        .mc-diff { font-size: 11px; color: #bbb; margin-top: 3px; }

        .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #e5e5e5; border-top: none; }
        .info-item { padding: 12px 16px; border-right: 1px solid #e5e5e5; }
        .info-item:last-child { border-right: none; }
        .info-key { font-size: 10px; color: #999; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 3px; }
        .info-val { font-size: 14px; font-weight: 800; color: #111; }

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
          style={{ background: '#14110C', color: '#F8F3E9', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 14, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Descargar PDF ↓
        </button>
      </div>

      <div className="page">

        {/* HEADER */}
        <div className="header">
          <div className="header-brand">Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; Wallest</div>
          <div className="header-title">Análisis de<br />{esProfundo ? 'Rentabilidad' : 'Inversión'}</div>
          <div className="header-sub">{titulo}</div>
          {inm.ciudad && inm.ciudad !== inm.titulo && <div className="header-sub" style={{ color: '#555' }}>{inm.ciudad}</div>}
          <div className="header-date">{hoy}{inm.duracion_meses ? ` · Duración estimada: ${inm.duracion_meses} meses` : ''}</div>
          {(esProfundo ? ventaR > 0 : ventaBase > 0) && (
            <div className="roi-badge">
              <div className="num">{fmtPct(roiBadge * 100)}</div>
              <div className="lbl">ROI realista</div>
            </div>
          )}
        </div>

        {/* KPIs */}
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">Precio de compra</div>
            <div className="kpi-value">{fmt(compra)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">{esProfundo ? 'Total inversión' : 'Coste total'}</div>
            <div className="kpi-value">{fmt(esProfundo ? inversionProfunda : costoTotalRapido)}</div>
            <div className="kpi-sub">{esProfundo ? 'incluye todos los gastos' : 'compra + reforma + gastos'}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Venta {esProfundo ? 'realista' : 'estimada'}</div>
            <div className="kpi-value">{(esProfundo ? ventaR : ventaBase) > 0 ? fmt(esProfundo ? ventaR : ventaBase) : '—'}</div>
          </div>
        </div>

        <div className="body">

          {!esProfundo && (inm.superficie || inm.habitaciones || inm.banos) && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">1</div>
                <div className="section-title">Datos del inmueble</div>
              </div>
              <div className="info-grid">
                {inm.superficie && <div className="info-item"><div className="info-key">Superficie</div><div className="info-val">{inm.superficie} m²</div></div>}
                {inm.habitaciones && <div className="info-item"><div className="info-key">Habitaciones</div><div className="info-val">{inm.habitaciones}</div></div>}
                {inm.banos && <div className="info-item"><div className="info-key">Baños</div><div className="info-val">{inm.banos}</div></div>}
              </div>
            </div>
          )}

          {esProfundo ? (
            <>
              {/* Desglose de costes (deep) */}
              <div className="section">
                <div className="section-header">
                  <div className="section-num">1</div>
                  <div className="section-title">Desglose de costes</div>
                </div>
                {hayGastosDetallados ? (
                  <table className="table">
                    <thead>
                      <tr><th>Concepto</th><th className="right">Estimado</th><th className="right">Real</th></tr>
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
                ) : (
                  <table className="table">
                    <thead><tr><th>Concepto</th><th className="right">Importe</th></tr></thead>
                    <tbody>
                      <tr><td>Precio de compra</td><td className="right">{fmt(compra)}</td></tr>
                      <tr><td>Reforma estimada</td><td className="right">{fmt(reforma)}</td></tr>
                      <tr><td>Gastos fijos (ITP + notaría + registro)</td><td className="right">{fmt(inversionProfunda - compra - reforma)}</td></tr>
                      <tr className="total"><td><strong>Total invertido</strong></td><td className="right orange"><strong>{fmt(inversionProfunda)}</strong></td></tr>
                    </tbody>
                  </table>
                )}
              </div>

              {/* Escenarios (deep) */}
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
                        {inm.duracion_meses && <th className="right">ROI Anualizado</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {escenariosProfundo.map(esc => (
                        <tr key={esc.label}>
                          <td style={{ fontWeight: 700, color: esc.color }}>{esc.label}</td>
                          <td className="right">{fmt(esc.venta)}</td>
                          <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 600 }}>{fmt(esc.benef)}</td>
                          <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{fmtPct(esc.roi)}</td>
                          {inm.duracion_meses && <td className="right" style={{ color: esc.benef >= 0 ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{esc.roiA !== null ? fmtPct(esc.roiA) : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="semaforo">
                    <span style={{ fontSize: 18 }}>{semProfundo.emoji}</span>
                    <span className="sem-text" style={{ color: SEMAFORO_COLOR[semProfundo.color] }}>{SEMAFORO_LABEL[semProfundo.color]}</span>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Desglose de costes (rápido) */}
              <div className="section">
                <div className="section-header">
                  <div className="section-num">{inm.superficie || inm.habitaciones ? '2' : '1'}</div>
                  <div className="section-title">Desglose de costes</div>
                </div>
                <table className="table">
                  <thead><tr><th>Concepto</th><th className="right">Importe</th></tr></thead>
                  <tbody>
                    <tr><td>Precio de compra</td><td className="right">{fmt(compra)}</td></tr>
                    <tr><td>Reforma estimada</td><td className="right">{fmt(reforma)}</td></tr>
                    <tr><td>Gastos fijos (ITP + notaría + registro)</td><td className="right">{fmt(costoTotalRapido - compra - reforma)}</td></tr>
                    <tr className="total"><td><strong>Total invertido</strong></td><td className="right orange"><strong>{fmt(costoTotalRapido)}</strong></td></tr>
                  </tbody>
                </table>
              </div>

              {/* Semáforo rápido (venta única) */}
              {ventaBase > 0 && (
                <div className="section">
                  <div className="section-header">
                    <div className="section-num">{inm.superficie || inm.habitaciones ? '3' : '2'}</div>
                    <div className="section-title">Rentabilidad estimada</div>
                  </div>
                  <table className="table">
                    <thead><tr><th>Venta estimada</th><th className="right">Beneficio</th><th className="right">ROI</th></tr></thead>
                    <tbody>
                      <tr>
                        <td>{fmt(ventaBase)}</td>
                        <td className="right" style={{ color: ventaBase - costoTotalRapido >= 0 ? '#22C55E' : '#EF4444', fontWeight: 600 }}>{fmt(ventaBase - costoTotalRapido)}</td>
                        <td className="right" style={{ color: ventaBase - costoTotalRapido >= 0 ? '#22C55E' : '#EF4444', fontWeight: 700 }}>{fmtPct(roiRapido * 100)}</td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="semaforo">
                    <span style={{ fontSize: 18 }}>{semRapido.emoji}</span>
                    <span className="sem-text" style={{ color: SEMAFORO_COLOR[semRapido.color] }}>{SEMAFORO_LABEL[semRapido.color]}</span>
                  </div>
                </div>
              )}

              {/* Precio máximo de compra */}
              {(max30 !== null && max50 !== null && max70 !== null) && (
                <div className="section">
                  <div className="section-header">
                    <div className="section-num">{inm.superficie || inm.habitaciones ? '4' : '3'}</div>
                    <div className="section-title">Precio máximo de compra</div>
                  </div>
                  <div className="maxcompra">
                    {[
                      { roi: '30%', precio: max30, color: '#888' },
                      { roi: '50%', precio: max50, color: '#A6855A' },
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
            </>
          )}

        </div>

        <div className="footer">
          <p>Wallest &nbsp;·&nbsp; Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; hola@hasu.in &nbsp;·&nbsp; wallest.pro</p>
          {inm.url && <p style={{ marginTop: 4 }}>Ref: <span style={{ color: '#aaa' }}>{inm.url}</span></p>}
        </div>
      </div>
    </>
  )
}
