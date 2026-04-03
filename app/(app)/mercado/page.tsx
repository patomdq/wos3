'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmtPct = (n: number) => n.toFixed(1) + '%'

type Radar = { id: string; precio: number; direccion: string; ciudad: string; habitaciones: number; superficie: number; fuente: string; fecha_recibido: string; estado: string }
type Estudio = { id: string; nombre?: string; precio_compra: number; precio_venta_objetivo: number; roi_estimado: number; direccion: string; ciudad: string; analizado_en: string }

type CalcData = { precio: number; addr: string; reforma: number; gastosCompra: number; precioVenta: number; gastosVenta: number; alquiler: number }
type CalcResult = { inv: number; ben: number; roi: number; yield: number; cashflow: number }

function calcular(d: CalcData): CalcResult | null {
  if (!d.precio || !d.precioVenta) return null
  const gastosCompraEur = d.precio * d.gastosCompra / 100
  const gastosVentaEur = d.precioVenta * d.gastosVenta / 100
  const inv = d.precio + d.reforma + gastosCompraEur
  const ingresoNeto = d.precioVenta - gastosVentaEur
  const ben = ingresoNeto - inv
  const roi = (ben / inv) * 100
  const yieldAnual = d.alquiler > 0 ? (d.alquiler * 12 / inv) * 100 : 0
  return { inv, ben, roi, yield: yieldAnual, cashflow: d.alquiler }
}

export default function MercadoPage() {
  const [tab, setTab] = useState(0)
  const [radar, setRadar] = useState<Radar[]>([])
  const [estudio, setEstudio] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcData, setCalcData] = useState<CalcData>({ precio: 0, addr: '', reforma: 15000, gastosCompra: 10, precioVenta: 0, gastosVenta: 5, alquiler: 0 })
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('inmuebles_radar').select('*').eq('estado', 'activo').order('created_at', { ascending: false }),
      supabase.from('inmuebles_estudio').select('*').order('created_at', { ascending: false }),
    ]).then(([r, e]) => {
      setRadar(r.data || [])
      setEstudio(e.data || [])
      setLoading(false)
    })
  }, [])

  const openCalc = (precio: number, addr: string) => {
    const next: CalcData = { precio, addr, reforma: 15000, gastosCompra: 10, precioVenta: Math.round(precio * 1.45), gastosVenta: 5, alquiler: 0 }
    setCalcData(next)
    setCalcResult(calcular(next))
    setSavedId(null)
    setCalcOpen(true)
  }

  const updateCalc = (field: keyof CalcData, val: number | string) => {
    const next = { ...calcData, [field]: typeof val === 'string' ? parseFloat(val as string) || 0 : val }
    setCalcData(next)
    setCalcResult(calcular(next))
  }

  const guardarAnalisis = async () => {
    if (!calcResult) return
    setSaving(true)
    const today = new Date().toISOString().split('T')[0]
    const parts = calcData.addr.split('·')
    const direccion = parts[0]?.trim() || calcData.addr
    const ciudad = parts[1]?.trim() || ''
    const { data, error } = await supabase.from('inmuebles_estudio').insert([{
      nombre: calcData.addr,
      precio_compra: calcData.precio,
      precio_venta_objetivo: calcData.precioVenta,
      roi_estimado: calcResult.roi,
      direccion,
      ciudad,
      estado: 'en_estudio',
      analizado_en: today,
    }]).select().single()
    setSaving(false)
    if (!error && data) {
      setSavedId(data.id)
      setEstudio(e => [data, ...e])
    }
  }

  const exportarPDF = () => {
    if (!calcResult) return
    const r = calcResult
    const d = calcData
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Análisis ROI — ${d.addr}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 40px auto; color: #111; }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: #888; font-size: 14px; margin-bottom: 24px; }
    .logo { font-weight: 900; color: #F26E1F; font-size: 18px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    td { padding: 10px 14px; border-bottom: 1px solid #eee; font-size: 14px; }
    td:last-child { text-align: right; font-weight: 700; }
    .section { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #888; padding: 14px 14px 6px; }
    .highlight { background: #fff7f0; }
    .green { color: #16a34a; }
    .red { color: #dc2626; }
    .footer { font-size: 11px; color: #aaa; margin-top: 32px; text-align: center; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
  <div class="logo">Wallest · Hasu Activos Inmobiliarios SL</div>
  <h1>Análisis de Rentabilidad</h1>
  <div class="sub">${d.addr} · ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
  <table>
    <tr><td class="section" colspan="2">Datos de entrada</td></tr>
    <tr><td>Precio de compra</td><td>${fmt(d.precio)}</td></tr>
    <tr><td>Coste de reforma</td><td>${fmt(d.reforma)}</td></tr>
    <tr><td>Gastos de compra (${d.gastosCompra}%)</td><td>${fmt(d.precio * d.gastosCompra / 100)}</td></tr>
    <tr><td>Precio de venta objetivo</td><td>${fmt(d.precioVenta)}</td></tr>
    <tr><td>Gastos de venta (${d.gastosVenta}%)</td><td>${fmt(d.precioVenta * d.gastosVenta / 100)}</td></tr>
    ${d.alquiler > 0 ? `<tr><td>Alquiler mensual estimado</td><td>${fmt(d.alquiler)}/mes</td></tr>` : ''}
    <tr><td class="section" colspan="2">Resultados</td></tr>
    <tr class="highlight"><td><strong>Inversión total</strong></td><td><strong>${fmt(r.inv)}</strong></td></tr>
    <tr class="highlight"><td><strong>Beneficio estimado</strong></td><td><strong class="${r.ben >= 0 ? 'green' : 'red'}">${r.ben >= 0 ? '+' : ''}${fmt(r.ben)}</strong></td></tr>
    <tr class="highlight"><td><strong>ROI sobre inversión</strong></td><td><strong class="${r.roi >= 15 ? 'green' : r.roi >= 0 ? '' : 'red'}">${r.roi.toFixed(1)}%</strong></td></tr>
    ${d.alquiler > 0 ? `<tr class="highlight"><td><strong>Yield bruto anual</strong></td><td><strong class="green">${r.yield.toFixed(1)}%</strong></td></tr>` : ''}
  </table>
  <div class="footer">Generado por Wallest · wos3.vercel.app · ${new Date().toISOString().split('T')[0]}</div>
</body>
</html>`
    const w = window.open('', '_blank')
    if (!w) return
    w.document.write(html)
    w.document.close()
    setTimeout(() => w.print(), 400)
  }

  const TABS = ['🗂 En radar', '📊 En estudio', '🔍 Scraper']

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">Mercado</div>
      </div>

      {/* Search */}
      <div className="flex gap-2 mb-4">
        <input type="text" defaultValue="Cuevas del Almanzora" placeholder="Zona, municipio…"
          className="flex-1 rounded-xl px-4 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
          style={{ background: '#141414', border: '1.5px solid rgba(255,255,255,0.08)' }}
          onFocus={e => e.target.style.borderColor = '#F26E1F'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        <button className="px-4 py-3 rounded-xl text-sm font-black text-white" style={{ background: '#F26E1F' }}>Buscar</button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap"
            style={{ background: tab === i ? '#F26E1F' : '#1E1E1E', color: tab === i ? '#fff' : '#888', border: tab === i ? '1px solid #F26E1F' : '1px solid rgba(255,255,255,0.08)' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Tab 0: En radar */}
      {tab === 0 && (
        <div>
          <div className="text-sm font-medium p-3.5 rounded-xl mb-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888', lineHeight: 1.5 }}>
            Inmuebles vistos o recibidos. Sin análisis — guardados para no perder el dato.
          </div>
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-[15px] text-white">En radar ({radar.length})</div>
            <span className="text-sm font-bold" style={{ color: '#F26E1F' }}>+ Agregar</span>
          </div>
          {loading ? [1,2,3].map(i => <div key={i} className="h-20 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            radar.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin inmuebles en radar todavía</div>
            ) : radar.map(r => (
              <div key={r.id} className="rounded-2xl p-4 mb-2 flex justify-between items-center" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div>
                  <div className="font-black text-[18px] text-white">{fmt(r.precio || 0)}</div>
                  <div className="text-sm font-medium mt-0.5" style={{ color: '#888' }}>{r.direccion} · {r.habitaciones} hab · {r.superficie}m²</div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: '#555' }}>Recibido {r.fecha_recibido} · {r.fuente}</div>
                </div>
                <button onClick={() => openCalc(r.precio || 0, `${r.direccion} · ${r.ciudad}`)}
                  className="text-xs font-black px-3 py-1.5 rounded-xl flex-shrink-0 ml-3"
                  style={{ background: 'rgba(242,110,31,0.18)', color: '#F26E1F', border: '1px solid rgba(242,110,31,0.3)' }}>
                  → Calcular
                </button>
              </div>
            ))
          }
        </div>
      )}

      {/* Tab 1: En estudio */}
      {tab === 1 && (
        <div>
          <div className="text-sm font-medium p-3.5 rounded-xl mb-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888', lineHeight: 1.5 }}>
            Pasaron por la calculadora. Tienen ROI calculado.
          </div>
          {loading ? [1,2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            estudio.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin análisis realizados todavía</div>
            ) : estudio.map(e => (
              <div key={e.id} className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="p-4">
                  <div className="font-black text-[22px] text-white tracking-tight">{fmt(e.precio_compra || 0)}</div>
                  <div className="text-sm font-medium mt-1 mb-3" style={{ color: '#888' }}>{e.direccion}{e.ciudad ? ` · ${e.ciudad}` : ''}</div>
                  <div className="font-black text-sm" style={{ color: '#22C55E' }}>↗ ROI estimado {e.roi_estimado?.toFixed(1)}%</div>
                </div>
                <div className="flex justify-between items-center px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs font-semibold" style={{ color: '#888' }}>Analizado {e.analizado_en}</span>
                  <button onClick={() => openCalc(e.precio_compra, `${e.direccion}${e.ciudad ? ' · '+e.ciudad : ''}`)}
                    className="text-sm font-black" style={{ color: '#F26E1F' }}>Recalcular →</button>
                </div>
              </div>
            ))
          }
        </div>
      )}

      {/* Tab 2: Scraper */}
      {tab === 2 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} />
            <span className="text-xs font-bold font-mono" style={{ color: '#888' }}>IDEALISTA · 24 RESULTADOS · €742/M² PROM.</span>
          </div>
          <div className="flex gap-2 mb-4 flex-wrap">
            {['Compra','€40k–€150k','+2 hab','Más baratos'].map(f => (
              <span key={f} className="text-xs font-bold px-3 py-1.5 rounded-full cursor-pointer" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#888' }}>{f}</span>
            ))}
          </div>
          {[
            { precio: 48000, dir: 'C/ Real 7 · Los Gallardos · 3 hab · 85m²', roi: 17.8, fecha: 'hoy', tag: 'Reformar', epm: '565' },
            { precio: 95000, dir: 'C/ Constitución 18 · Zurgena · dúplex · 4 hab', roi: 20.3, fecha: 'hoy', tag: '', epm: '863' },
          ].map((r, i) => (
            <div key={i} className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="p-4">
                <div className="font-black text-[22px] text-white tracking-tight">{fmt(r.precio)}</div>
                <div className="text-sm font-medium mt-1 mb-3" style={{ color: '#888' }}>{r.dir}</div>
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {r.tag && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(245,158,11,0.15)', color: '#F59E0B' }}>{r.tag}</span>}
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: '#282828', color: '#888' }}>€{r.epm}/m²</span>
                </div>
                <div className="font-black text-sm" style={{ color: '#22C55E' }}>↗ ROI estimado {r.roi}%</div>
              </div>
              <div className="flex justify-between items-center px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-xs font-semibold" style={{ color: '#888' }}>Scrapeado {r.fecha}</span>
                <button onClick={() => openCalc(r.precio, r.dir)} className="text-sm font-black" style={{ color: '#F26E1F' }}>Calcular →</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Calc overlay */}
      {calcOpen && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={() => setCalcOpen(false)} />
      )}

      {/* Calc sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[51] transition-transform duration-300 ease-out overflow-y-auto"
        style={{ transform: calcOpen ? 'translateY(0)' : 'translateY(100%)', maxWidth: 480, margin: '0 auto', maxHeight: '92vh' }}>
        <div className="rounded-t-[20px] p-5 pb-8" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}>
          <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
          <div className="flex justify-between items-center mb-1">
            <div className="font-black text-[17px] text-white">Calculadora de rentabilidad</div>
            <button onClick={() => setCalcOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
          </div>
          <div className="text-xs font-semibold mb-5 truncate" style={{ color: '#888' }}>{calcData.addr}</div>

          {/* Inputs */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            {[
              { label: 'Precio compra (€)', field: 'precio' },
              { label: 'Coste reforma (€)', field: 'reforma' },
              { label: 'Gastos compra (%)', field: 'gastosCompra' },
              { label: 'Precio venta (€)', field: 'precioVenta' },
              { label: 'Gastos venta (%)', field: 'gastosVenta' },
              { label: 'Alquiler/mes (€)', field: 'alquiler' },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{f.label}</label>
                <input type="number" value={(calcData as any)[f.field] || ''}
                  onChange={e => updateCalc(f.field as keyof CalcData, e.target.value)}
                  className="w-full rounded-xl px-3 py-2.5 text-sm text-white outline-none font-semibold"
                  style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
              </div>
            ))}
          </div>

          {/* Results */}
          {calcResult && (
            <div className="rounded-xl p-4 mb-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              {[
                { l: 'Inversión total', v: fmt(calcResult.inv), c: '#fff' },
                { l: 'Beneficio estimado', v: (calcResult.ben >= 0 ? '+' : '') + fmt(calcResult.ben), c: calcResult.ben >= 0 ? '#22C55E' : '#EF4444' },
                { l: 'ROI sobre inversión', v: fmtPct(calcResult.roi), c: calcResult.roi >= 15 ? '#22C55E' : calcResult.roi >= 0 ? '#F59E0B' : '#EF4444', big: true },
                ...(calcData.alquiler > 0 ? [
                  { l: 'Yield bruto anual', v: fmtPct(calcResult.yield), c: '#22C55E' },
                  { l: 'Cashflow mensual', v: fmt(calcData.alquiler), c: '#60A5FA' },
                ] : [])
              ].map((row, i) => (
                <div key={i} className="flex justify-between py-1.5" style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                  <span className="text-sm font-medium" style={{ color: '#888' }}>{row.l}</span>
                  <span className={`font-black font-mono ${row.big ? 'text-lg' : 'text-sm'}`} style={{ color: row.c }}>{row.v}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={guardarAnalisis} disabled={saving || !calcResult || !!savedId}
              className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-50"
              style={{ background: savedId ? '#22C55E' : '#F26E1F' }}>
              {saving ? 'Guardando...' : savedId ? '✓ Guardado' : 'Guardar análisis'}
            </button>
            <button onClick={exportarPDF} disabled={!calcResult}
              className="px-4 py-3.5 rounded-xl text-sm font-black disabled:opacity-30"
              style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.12)', color: '#ccc' }}>
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
