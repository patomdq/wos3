'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

type Radar = { id: string; precio: number; direccion: string; ciudad: string; habitaciones: number; superficie: number; fuente: string; fecha_recibido: string; estado: string }
type Estudio = { id: string; nombre?: string; precio_compra: number; precio_venta_objetivo: number; roi_estimado: number; direccion: string; ciudad: string; analizado_en: string }

export default function MercadoPage() {
  const [tab, setTab] = useState(0)
  const [radar, setRadar] = useState<Radar[]>([])
  const [estudio, setEstudio] = useState<Estudio[]>([])
  const [loading, setLoading] = useState(true)
  const [calcOpen, setCalcOpen] = useState(false)
  const [calcData, setCalcData] = useState({ precio: 0, addr: '', reforma: 15000, venta: 0, gastos: 10 })
  const [calcResult, setCalcResult] = useState<{inv:number;ben:number;roi:string}|null>(null)

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
    const venta = Math.round(precio * 1.45)
    setCalcData({ precio, addr, reforma: 15000, venta, gastos: 10 })
    setCalcOpen(true)
    recalc(precio, 15000, venta, 10)
  }

  const recalc = (precio: number, reforma: number, venta: number, gastosPct: number) => {
    if (!precio || !venta) { setCalcResult(null); return }
    const gastosExtra = precio * gastosPct / 100
    const inv = precio + reforma + gastosExtra
    const ben = venta - inv
    const roi = (ben / inv * 100).toFixed(1)
    setCalcResult({ inv, ben, roi })
  }

  const updateCalc = (field: string, val: number) => {
    const next = { ...calcData, [field]: val }
    setCalcData(next)
    recalc(next.precio, next.reforma, next.venta, next.gastos)
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
            className="flex-shrink-0 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors"
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
            Pasaron por la calculadora. Tienen ROI calculado. Editables.
          </div>
          {loading ? [1,2].map(i => <div key={i} className="h-32 rounded-2xl animate-pulse mb-2" style={{ background: '#141414' }} />) :
            estudio.length === 0 ? (
              <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin análisis realizados todavía</div>
            ) : estudio.map(e => (
              <div key={e.id} className="rounded-2xl mb-3 overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="p-4">
                  <div className="font-black text-[22px] text-white tracking-tight">{fmt(e.precio_compra || 0)}</div>
                  <div className="text-sm font-medium mt-1 mb-3" style={{ color: '#888' }}>{e.direccion} · {e.ciudad}</div>
                  <div className="font-black text-sm" style={{ color: '#22C55E' }}>↗ ROI estimado {e.roi_estimado?.toFixed(1)}%</div>
                </div>
                <div className="flex justify-between items-center px-4 py-3" style={{ background: '#1E1E1E', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="text-xs font-semibold" style={{ color: '#888' }}>Analizado {e.analizado_en}</span>
                  <span className="text-sm font-black" style={{ color: '#F26E1F' }}>Editar análisis →</span>
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
                <span className="text-sm font-black" style={{ color: '#F26E1F' }}>Guardar / Calcular →</span>
              </div>
            </div>
          ))}
          <div className="text-center py-3 text-xs font-semibold" style={{ color: '#555' }}>Tocá un resultado para guardarlo como radar o calcularlo</div>
        </div>
      )}

      {/* Calc overlay */}
      {calcOpen && (
        <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }} onClick={() => setCalcOpen(false)} />
      )}

      {/* Calc sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-[51] transition-transform duration-300 ease-out"
        style={{ transform: calcOpen ? 'translateY(0)' : 'translateY(100%)', maxWidth: 480, margin: '0 auto' }}>
        <div className="rounded-t-[20px] p-5 pb-10" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}>
          <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
          <div className="flex justify-between items-center mb-2">
            <div className="font-black text-[17px] text-white">Calculadora de ROI</div>
            <button onClick={() => setCalcOpen(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
          </div>
          <div className="text-xs font-semibold mb-5" style={{ color: '#888' }}>{calcData.addr}</div>

          <div className="flex flex-col gap-3 mb-4">
            {[
              { label: 'Precio compra', field: 'precio' },
              { label: 'Reforma estimada', field: 'reforma' },
              { label: 'Precio venta objetivo', field: 'venta' },
              { label: 'Gastos adicionales (%)', field: 'gastos' },
            ].map(f => (
              <div key={f.field}>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{f.label}</label>
                <input type="number" value={(calcData as any)[f.field]}
                  onChange={e => updateCalc(f.field, parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl px-3.5 py-3 text-base text-white outline-none font-semibold"
                  style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
              </div>
            ))}
          </div>

          {calcResult && (
            <div className="rounded-xl p-4" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex justify-between py-1">
                <span className="text-sm font-medium" style={{ color: '#888' }}>Inversión total</span>
                <span className="text-sm font-black text-white font-mono">{fmt(calcResult.inv)}</span>
              </div>
              <div className="flex justify-between py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-sm font-medium" style={{ color: '#888' }}>Beneficio est.</span>
                <span className="text-sm font-black font-mono" style={{ color: calcResult.ben >= 0 ? '#22C55E' : '#EF4444' }}>
                  {calcResult.ben >= 0 ? '+' : ''}{fmt(calcResult.ben)}
                </span>
              </div>
              <div className="flex justify-between py-1" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="text-sm font-medium" style={{ color: '#888' }}>ROI estimado</span>
                <span className="font-black text-base" style={{ color: parseFloat(calcResult.roi) >= 15 ? '#22C55E' : parseFloat(calcResult.roi) >= 0 ? '#F59E0B' : '#EF4444' }}>
                  {calcResult.roi}%
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
