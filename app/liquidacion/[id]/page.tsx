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
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + '%'

const fmtDate = (s: string | null) => {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
}

type Proyecto = {
  nombre: string
  direccion: string | null
  ciudad: string
  socio_nombre: string | null
  porcentaje_hasu: number
  precio_compra: number | null
  valor_total_operacion: number | null
  precio_venta_real: number | null
  fecha_compra: string | null
  fecha_salida_estimada: string | null
}

export default function LiquidacionPage() {
  const { id } = useParams<{ id: string }>()
  const [p, setP] = useState<Proyecto | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase
      .from('proyectos')
      .select('nombre,direccion,ciudad,socio_nombre,porcentaje_hasu,precio_compra,valor_total_operacion,precio_venta_real,fecha_compra,fecha_salida_estimada')
      .eq('id', id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setError('Proyecto no encontrado'); setLoading(false); return }
        setP(data)
        setLoading(false)
      })
  }, [id])

  if (loading) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#888', fontFamily: 'system-ui', fontSize: 14 }}>Cargando liquidación...</div>
    </div>
  )
  if (error || !p) return (
    <div style={{ background: '#0A0A0A', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#EF4444', fontFamily: 'system-ui', fontSize: 14 }}>{error}</div>
    </div>
  )

  // ── Cálculos ────────────────────────────────────────────────────────────────
  const pctHasu   = p.porcentaje_hasu || 100
  const pctSocio  = 100 - pctHasu
  const esJV      = pctSocio > 0 && p.socio_nombre
  const inversion = p.valor_total_operacion || p.precio_compra || 0
  const venta     = p.precio_venta_real || 0
  const benefTotal = venta - inversion
  const roi        = inversion > 0 ? (benefTotal / inversion) * 100 : 0

  const benefHasu  = benefTotal * pctHasu / 100
  const benefSocio = benefTotal * pctSocio / 100
  const retencion  = esJV ? benefSocio * 0.19 : 0
  const netoSocio  = benefSocio - retencion

  const hoy = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #f5f5f5; font-family: 'Inter', -apple-system, sans-serif; }

        .page { max-width: 780px; margin: 32px auto; background: #fff; box-shadow: 0 4px 40px rgba(0,0,0,0.12); }

        /* ── Header ── */
        .header { background: #111; padding: 36px 40px 32px; position: relative; overflow: hidden; }
        .header-brand { font-size: 10px; font-weight: 700; letter-spacing: 2px; color: #999; text-transform: uppercase; margin-bottom: 8px; }
        .header-title { font-size: 36px; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 10px; }
        .header-sub { font-size: 14px; color: #888; font-weight: 500; }
        .roi-badge {
          position: absolute; right: 40px; top: 36px;
          background: #F26E1F; border-radius: 16px; padding: 16px 22px; text-align: center; min-width: 110px;
        }
        .roi-badge .roi-num { font-size: 32px; font-weight: 900; color: #fff; line-height: 1; }
        .roi-badge .roi-label { font-size: 10px; color: rgba(255,255,255,0.8); font-weight: 600; letter-spacing: 1px; text-transform: uppercase; margin-top: 4px; }

        /* ── KPIs ── */
        .kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; border-bottom: 1px solid #eee; }
        .kpi { padding: 24px 40px; border-right: 1px solid #eee; }
        .kpi:last-child { border-right: none; }
        .kpi-label { font-size: 10px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; color: #999; margin-bottom: 8px; }
        .kpi-value { font-size: 22px; font-weight: 900; color: #111; }

        /* ── Body ── */
        .body { padding: 32px 40px 40px; }

        /* ── Section ── */
        .section { margin-bottom: 24px; }
        .section-header {
          display: flex; align-items: center; gap: 12px;
          background: #1a1a1a; padding: 12px 16px; border-radius: 8px 8px 0 0;
        }
        .section-num {
          background: #F26E1F; color: #fff; font-size: 11px; font-weight: 900;
          width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .section-title { font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #fff; }

        /* ── Table ── */
        .table { width: 100%; border-collapse: collapse; border: 1px solid #e5e5e5; border-top: none; }
        .table th { background: #f8f8f8; font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase; letter-spacing: 0.8px; padding: 10px 16px; text-align: left; border-bottom: 1px solid #e5e5e5; }
        .table th.right { text-align: right; }
        .table td { padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #f0f0f0; }
        .table td.right { text-align: right; }
        .table tr:last-child td { border-bottom: none; }
        .table tr.total td { background: #fafafa; font-weight: 800; font-size: 14px; color: #111; border-top: 2px solid #e5e5e5; }
        .table tr.total td.orange { color: #F26E1F; }
        .table td.orange { color: #F26E1F; font-weight: 700; }
        .table td.red { color: #EF4444; }
        .table td.green { color: #22C55E; font-weight: 700; }

        /* ── Nota ── */
        .nota { background: #fffbf5; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin-top: 24px; }
        .nota p { font-size: 12px; color: #78716c; line-height: 1.6; }
        .nota strong { color: #92400e; }

        /* ── Footer ── */
        .footer { border-top: 1px solid #e5e5e5; padding: 16px 40px; text-align: center; }
        .footer p { font-size: 11px; color: #bbb; letter-spacing: 0.5px; }

        /* ── Print button (no imprime) ── */
        .print-bar { display: flex; justify-content: flex-end; gap: 10px; padding: 16px 0; max-width: 780px; margin: 0 auto; }
        @media print {
          .print-bar { display: none !important; }
          .page { box-shadow: none; margin: 0; max-width: 100%; }
          body { background: #fff; }
        }
      `}</style>

      {/* Botón descargar */}
      <div className="print-bar">
        <button
          onClick={() => window.print()}
          style={{ background: '#F26E1F', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 22px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif' }}>
          Descargar PDF ↓
        </button>
      </div>

      <div className="page">

        {/* ── HEADER ── */}
        <div className="header">
          <div className="header-brand">Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; Wallest</div>
          <div className="header-title">Liquidación de<br />Operación</div>
          <div className="header-sub">
            {p.nombre}&nbsp;&nbsp;·&nbsp;&nbsp;
            {esJV ? `JV ${pctHasu}/${pctSocio}` : '100% HASU'}&nbsp;&nbsp;·&nbsp;&nbsp;
            {hoy}
          </div>
          <div className="roi-badge">
            <div className="roi-num">{fmtPct(roi)}</div>
            <div className="roi-label">sobre inversión total</div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div className="kpis">
          <div className="kpi">
            <div className="kpi-label">Precio de venta</div>
            <div className="kpi-value">{fmt(venta)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Inversión recuperada</div>
            <div className="kpi-value">{fmt(inversion)}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">Beneficio neto total</div>
            <div className="kpi-value">{fmt(benefTotal)}</div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="body">

          {/* 1 — Reparto */}
          <div className="section">
            <div className="section-header">
              <div className="section-num">1</div>
              <div className="section-title">Reparto de beneficio — Split {pctHasu}/{pctSocio}</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Parte</th>
                  <th className="right">%</th>
                  <th className="right">Importe bruto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Hasu Activos Inmobiliarios SL</td>
                  <td className="right">{pctHasu}%</td>
                  <td className="right orange">{fmt(benefHasu)}</td>
                </tr>
                {esJV && (
                  <tr>
                    <td>{p.socio_nombre}</td>
                    <td className="right">{pctSocio}%</td>
                    <td className="right">{fmt(benefSocio)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td><strong>Total operación</strong></td>
                  <td className="right">100%</td>
                  <td className="right">{fmt(benefTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 2 — Liquidación socio (solo JV) */}
          {esJV && (
            <div className="section">
              <div className="section-header">
                <div className="section-num">2</div>
                <div className="section-title">Liquidación {p.socio_nombre} — Retención 19%</div>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Concepto</th>
                    <th className="right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Beneficio bruto ({pctSocio}% de la operación)</td>
                    <td className="right">{fmt(benefSocio)}</td>
                  </tr>
                  <tr>
                    <td>Retención 19% a cuenta (IRPF / IS)</td>
                    <td className="right red">− {fmt(retencion)}</td>
                  </tr>
                  <tr className="total">
                    <td className="orange"><strong>Neto a transferir a {p.socio_nombre}</strong></td>
                    <td className="right orange"><strong>{fmt(netoSocio)}</strong></td>
                  </tr>
                  <tr>
                    <td style={{ color: '#888', fontSize: 12 }}>A ingresar en Hacienda en nombre de {p.socio_nombre}</td>
                    <td className="right" style={{ color: '#888', fontSize: 12 }}>{fmt(retencion)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* 3 — Resumen HASU */}
          <div className="section">
            <div className="section-header">
              <div className="section-num">{esJV ? '3' : '2'}</div>
              <div className="section-title">Resumen Hasu Activos Inmobiliarios SL</div>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Concepto</th>
                  <th className="right">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Beneficio propio Hasu ({pctHasu}%)</td>
                  <td className="right">{fmt(benefHasu)}</td>
                </tr>
                {esJV && (
                  <tr>
                    <td>Retención retenida (pendiente ingreso Hacienda)</td>
                    <td className="right">{fmt(retencion)}</td>
                  </tr>
                )}
                <tr className="total">
                  <td className="orange"><strong>Total gestionado por Hasu post-venta</strong></td>
                  <td className="right orange"><strong>{fmt(esJV ? benefHasu + retencion : benefHasu)}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Nota legal */}
          {esJV && (
            <div className="nota">
              <p><strong>NOTA:</strong> La retención del 19% debe ingresarse a Hacienda mediante el modelo correspondiente (Mod. 123 para rendimientos de capital mobiliario o Mod. 211 para ganancias patrimoniales). Confirmar con gestor el modelo aplicable según la estructura del contrato de cuentas en participación.</p>
            </div>
          )}

        </div>

        {/* ── FOOTER ── */}
        <div className="footer">
          <p>Wallest &nbsp;·&nbsp; Hasu Activos Inmobiliarios SL &nbsp;·&nbsp; hola@hasu.in &nbsp;·&nbsp; wallest.pro</p>
        </div>

      </div>
    </>
  )
}
