'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt  = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmtK = (n: number) => `€${(Math.abs(n)/1000).toFixed(1)}k`
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

function monthsUntilDec2027() {
  const now = new Date()
  const target = new Date(2027, 11, 1)
  return Math.max(1, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()))
}

function duracionMeses(inicio: string | null, fin: string | null): number | null {
  if (!inicio || !fin) return null
  const d = (new Date(fin).getTime() - new Date(inicio).getTime()) / (30.44 * 86400000)
  return Math.max(1, Math.round(d))
}

function roiAnualizado(roi: number, meses: number | null): number | null {
  if (!meses || meses <= 0) return null
  return ((Math.pow(1 + roi / 100, 12 / meses)) - 1) * 100
}

type TrackRow = {
  id: string; nombre: string; tipo: string; estado: string
  inversor: string | null
  fecha_compra: string | null; fecha_salida_estimada: string | null
  valor_total_operacion: number | null; precio_compra: number | null
  precio_venta_real: number | null; precio_venta_estimado: number | null
  porcentaje_hasu: number
  movimientos?: { tipo: string; monto: number }[]
}

type SortKey = 'roi' | 'fecha' | 'duracion'
type FilterKey = 'todos' | 'en_curso' | 'finalizado'

const EN_CURSO = ['comprado','reforma','venta','reservado','con_oferta','en_arras']
const VENDIDOS = ['vendido','cerrado']

export default function HasuPage() {
  const router = useRouter()
  const [cuentas,    setCuentas]    = useState<any[]>([])
  const [proyectos,  setProyectos]  = useState<any[]>([])
  const [trackRows,  setTrackRows]  = useState<TrackRow[]>([])
  const [inversores, setInversores] = useState<number>(0)
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<FilterKey>('todos')
  const [sortBy,     setSortBy]     = useState<SortKey>('fecha')

  useEffect(() => {
    Promise.all([
      supabase.from('cuentas_bancarias').select('*').eq('activa', true).order('created_at'),
      supabase.from('proyectos').select('id,nombre,estado,precio_compra,precio_venta_estimado'),
      supabase.from('inversores').select('id', { count: 'exact' }),
      // track record — all projects + inversor info
      supabase.from('proyectos').select('id,nombre,tipo,estado,porcentaje_hasu,precio_compra,precio_venta_estimado,precio_venta_real,valor_total_operacion,fecha_compra,fecha_salida_estimada,movimientos(tipo,monto)').order('created_at',{ascending:false}),
      supabase.from('proyecto_inversores').select('proyecto_id,inversores(nombre)'),
    ]).then(([c, p, inv, tr, pi]) => {
      setCuentas(c.data || [])
      setProyectos(p.data || [])
      setInversores(inv.count || 0)

      // Build inversor lookup
      const invMap: Record<string, string> = {}
      ;(pi.data || []).forEach((r: any) => {
        if (r.inversores?.nombre) invMap[r.proyecto_id] = r.inversores.nombre
      })

      setTrackRows((tr.data || []).map((row: any) => ({
        ...row,
        inversor: invMap[row.id] || null,
      })))

      setLoading(false)
    })
  }, [])

  // ── Derived ──────────────────────────────────────────────
  const activos    = proyectos.filter(p => EN_CURSO.includes(p.estado))

  // Track record metrics
  const cerrados = trackRows.filter(r => VENDIDOS.includes(r.estado))
  const getInv   = (r: TrackRow) => {
    if (r.movimientos?.length) return r.movimientos.filter(m => m.monto < 0 || m.tipo === 'Gasto').reduce((s, m) => s + Math.abs(m.monto || 0), 0)
    return r.valor_total_operacion || r.precio_compra || 0
  }
  const getVenta    = (r: TrackRow) => r.precio_venta_real || r.precio_venta_estimado || 0
  const getBenef    = (r: TrackRow) => getVenta(r) - getInv(r)
  // HASU share: en JV solo contamos el % de Hasu; HASU 100% = beneficio completo
  const getBenefHasu = (r: TrackRow) => getBenef(r) * ((r.porcentaje_hasu || 100) / 100)
  const getRoi   = (r: TrackRow) => { const i = getInv(r); return i > 0 ? (getBenef(r) / i) * 100 : 0 }
  const getDur   = (r: TrackRow) => duracionMeses(r.fecha_compra, r.fecha_salida_estimada)

  // Capital invertido HASU: operaciones cerradas aplicando % HASU
  const totalInvertido  = cerrados.reduce((s, r) => s + getInv(r) * ((r.porcentaje_hasu || 100) / 100), 0)
  // Capital total operaciones (suma JV completa, sin aplicar %)
  const totalInvOps     = cerrados.reduce((s, r) => s + getInv(r), 0)
  // Tracker 1M€: beneficio HASU (aplicando % en JVs)
  const totalBenef      = cerrados.reduce((s, r) => s + getBenefHasu(r), 0)
  // Beneficio total operaciones (suma JV completa, sin aplicar %)
  const totalBenefOps   = cerrados.reduce((s, r) => s + getBenef(r), 0)
  const roiMedio        = cerrados.length > 0 ? cerrados.reduce((s, r) => s + getRoi(r), 0) / cerrados.length : 0

  // Tracker objetivo 1M€ — usa beneficio neto de operaciones cerradas
  const OBJETIVO   = 1_000_000
  const pct        = Math.min((totalBenef / OBJETIVO) * 100, 100)
  const mesesRest  = monthsUntilDec2027()
  const porMes     = Math.max(0, (OBJETIVO - totalBenef) / mesesRest)
  const tiempoMedio     = (() => {
    const durs = trackRows.map(getDur).filter(Boolean) as number[]
    return durs.length > 0 ? Math.round(durs.reduce((a,b)=>a+b,0)/durs.length) : null
  })()

  // Filter + sort
  const filtered = trackRows
    .filter(r => {
      if (filter === 'en_curso')   return EN_CURSO.includes(r.estado)
      if (filter === 'finalizado') return VENDIDOS.includes(r.estado)
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'roi')      return getRoi(b) - getRoi(a)
      if (sortBy === 'duracion') return (getDur(b) ?? 0) - (getDur(a) ?? 0)
      // fecha
      return (b.fecha_compra || '').localeCompare(a.fecha_compra || '')
    })

  const FINANZAS_MOD = { icon: '📊', bg: 'rgba(34,197,94,0.15)', nombre: 'Finanzas', desc: 'Flujo de caja · todos los proyectos', href: '/hasu/flujo-caja' }
  const MODULOS = [
    { icon: '🔧', bg: 'rgba(96,165,250,0.15)',  nombre: 'Proveedores',        desc: 'Gestión de proveedores y contactos',  href: '/hasu/proveedores' },
    { icon: '🧾', bg: 'rgba(245,158,11,0.15)',  nombre: 'Fiscal y gestoría',  desc: 'IVA, IRPF, documentos legales',       href: '/hasu/fiscal' },
    { icon: '⚙',  bg: 'rgba(242,110,31,0.18)', nombre: 'Usuarios y permisos', desc: 'Roles · accesos · proyectos',         href: '/admin' },
    { icon: '📁', bg: '#282828',                nombre: 'Docs de empresa',    desc: 'Estatutos · contratos · CIF',         href: '/hasu/docs' },
    { icon: '📅', bg: 'rgba(96,165,250,0.12)', nombre: 'Calendario',          desc: 'Google Calendar · hola@hasu.in',      href: '/hasu/calendario' },
  ]

  const ESTADO_COLOR: Record<string,string> = { comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', reservado:'#F59E0B', con_oferta:'#F26E1F', en_arras:'#22C55E', vendido:'#22C55E', cerrado:'#22C55E', captado:'#555', analisis:'#60A5FA', ofertado:'#F59E0B' }
  const ESTADO_LABEL: Record<string,string> = { comprado:'Comprado', reforma:'En reforma', venta:'En venta', reservado:'Reservado', con_oferta:'Ofertado', en_arras:'En arras', vendido:'Vendido', cerrado:'Vendido', captado:'Captado', analisis:'Análisis', ofertado:'Ofertado' }

  return (
    <div className="p-4">
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white">HASU</div>
      </div>

      {/* Objetivo hero */}
      {loading ? (
        <div className="h-32 rounded-2xl animate-pulse mb-5" style={{ background: '#141414' }} />
      ) : (
        <div className="rounded-2xl p-5 mb-5 relative overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="absolute right-[-30px] top-[-30px] w-[130px] h-[130px] rounded-full pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(242,110,31,0.12) 0%, transparent 70%)' }} />
          <div className="text-[11px] font-bold uppercase tracking-[1.5px] mb-2" style={{ color: '#888' }}>Objetivo Hasu · Dic 2027</div>
          <div className="font-black text-[38px] text-white leading-none tracking-tight mb-1">{fmt(totalBenef)}</div>
          <div className="text-sm font-semibold mb-3" style={{ color: '#555' }}>beneficio acumulado de {fmt(OBJETIVO)}</div>
          <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: '#282828' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: pct < 20 ? '#EF4444' : pct < 50 ? '#F59E0B' : '#22C55E' }} />
          </div>
          <div className="flex justify-between items-center">
            <div className="text-xs font-black" style={{ color: pct < 20 ? '#EF4444' : pct < 50 ? '#F59E0B' : '#22C55E' }}>{pct.toFixed(1)}%</div>
            <div className="text-xs font-semibold" style={{ color: '#555' }}>{mesesRest} meses · {fmt(porMes)}/mes necesario</div>
          </div>
        </div>
      )}

      <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{ color: '#888' }}>Salud de la empresa</div>

      {/* KPIs */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {[
            { l: 'Beneficio HASU',     v: cerrados.length > 0 ? fmt(totalBenef) : '—', s: 'beneficio acumulado', sc: '#22C55E' },
            { l: 'Faltan para 1M€',    v: fmt(Math.max(0, OBJETIVO - totalBenef)), s: `${pct.toFixed(1)}% alcanzado`, sc: '#888' },
            { l: 'Proyectos activos',  v: String(activos.length),                  s: `${proyectos.length} total`, sc: '#888' },
            { l: 'ROI medio',          v: cerrados.length > 0 ? fmtPct(roiMedio) : '—', s: 'proyectos vendidos',   sc: '#888' },
            { l: 'Inversores',         v: String(inversores),                      s: 'JV activos',               sc: '#888' },
            { l: 'Cuentas',            v: String(cuentas.length),                  s: 'activas',                  sc: '#888' },
          ].map(k => (
            <div key={k.l} className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{k.l}</div>
              <div className="font-black text-[21px] text-white leading-none">{k.v}</div>
              {k.s && <div className="text-xs font-semibold mt-1" style={{ color: k.sc || '#888' }}>{k.s}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Finanzas */}
      <button onClick={() => router.push(FINANZAS_MOD.href)}
        className="w-full flex items-center gap-3.5 p-4 rounded-xl mb-5 text-left transition-colors active:opacity-70"
        style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: FINANZAS_MOD.bg }}>{FINANZAS_MOD.icon}</div>
        <div className="flex-1">
          <div className="text-sm font-bold text-white">{FINANZAS_MOD.nombre}</div>
          <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{FINANZAS_MOD.desc}</div>
        </div>
        <div className="text-xl font-light" style={{ color: '#888' }}>›</div>
      </button>

      {/* ═══════════ TRACK RECORD ═══════════ */}
      <div className="mt-6 mb-2">
        <div className="text-[11px] font-bold uppercase tracking-[1px] mb-4" style={{ color: '#888' }}>Track Record</div>

        {/* Resumen acumulado */}
        {loading ? (
          <div className="grid grid-cols-2 gap-2 mb-4">
            {[1,2,3,4,5,6,7].map(i => <div key={i} className="h-18 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}
          </div>
        ) : (
          <>
            {/* Bloque operaciones generales */}
            <div className="text-[10px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#555' }}>Operaciones (total JV)</div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { l: 'Total operaciones',  v: String(trackRows.length),                                                       sub: `${cerrados.length} finalizadas` },
                { l: 'Capital total',      v: totalInvOps > 0 ? fmtK(totalInvOps) : '—',                                     sub: 'invertido JV' },
                { l: 'Benef. total',       v: cerrados.length > 0 ? (totalBenefOps >= 0 ? '+' : '') + fmtK(totalBenefOps) : '—', sub: 'operaciones cerradas', c: totalBenefOps >= 0 ? '#22C55E' : '#EF4444' },
                { l: 'ROI medio',          v: cerrados.length > 0 ? fmtPct(roiMedio) : '—',                                  sub: 'media vendidos', c: roiMedio >= 0 ? '#22C55E' : '#EF4444' },
                { l: 'Tiempo medio',       v: tiempoMedio !== null ? `${tiempoMedio}m` : '—',                                 sub: 'por operación' },
              ].map((k, i) => (
                <div key={k.l} className={`rounded-xl p-3.5${i === 4 ? ' col-span-2' : ''}`} style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{k.l}</div>
                  <div className="font-black text-[20px] leading-none" style={{ color: (k as any).c || '#fff' }}>{k.v}</div>
                  <div className="text-[11px] font-medium mt-1" style={{ color: '#555' }}>{k.sub}</div>
                </div>
              ))}
            </div>

            {/* Bloque HASU */}
            <div className="text-[10px] font-bold uppercase tracking-[1px] mb-2" style={{ color: '#F26E1F' }}>Hasu</div>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {[
                { l: 'Capital HASU',      v: totalInvertido > 0 ? fmtK(totalInvertido) : '—',                              sub: 'parte HASU invertida' },
                { l: 'Beneficio HASU',    v: cerrados.length > 0 ? (totalBenef >= 0 ? '+' : '') + fmtK(totalBenef) : '—',  sub: 'beneficio acumulado', c: totalBenef >= 0 ? '#F26E1F' : '#EF4444' },
              ].map((k) => (
                <div key={k.l} className="rounded-xl p-3.5" style={{ background: '#1E1E1E', border: '1px solid rgba(242,110,31,0.18)' }}>
                  <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{k.l}</div>
                  <div className="font-black text-[20px] leading-none" style={{ color: (k as any).c || '#fff' }}>{k.v}</div>
                  <div className="text-[11px] font-medium mt-1" style={{ color: '#555' }}>{k.sub}</div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Filtros y orden */}
        <div className="flex flex-wrap gap-2 mb-3">
          <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
            {([['todos','Todos'],['en_curso','En curso'],['finalizado','Finalizados']] as [FilterKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setFilter(k)}
                className="px-3 py-1.5 text-xs font-bold"
                style={{ background: filter === k ? '#F26E1F' : 'transparent', color: filter === k ? '#fff' : '#888' }}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] font-bold" style={{ color: '#666' }}>Ordenar:</span>
            {([['roi','ROI'],['fecha','Fecha'],['duracion','Duración']] as [SortKey,string][]).map(([k,l]) => (
              <button key={k} onClick={() => setSortBy(k)}
                className="px-2.5 py-1 text-xs font-bold rounded-lg"
                style={{ background: sortBy === k ? 'rgba(242,110,31,0.2)' : 'rgba(255,255,255,0.06)', color: sortBy === k ? '#F26E1F' : '#888' }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {/* Tabla */}
        {loading ? (
          <div className="h-32 rounded-xl animate-pulse" style={{ background: '#141414' }} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-sm" style={{ color: '#555' }}>Sin operaciones</div>
        ) : (
          <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="overflow-x-auto">
              <table className="w-full" style={{ minWidth: 780 }}>
                <thead>
                  <tr style={{ background: '#1E1E1E', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                    {['Proyecto','Tipo','Estructura','P. Compra','P. Venta','Dur.','Inv. Total','Benef. Total','Benef. HASU','ROI','ROI Anual.','Estado'].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                        style={{ color: 'rgba(255,255,255,0.35)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const inv     = getInv(r)
                    const benef   = getBenef(r)
                    const roi     = getRoi(r)
                    const dur     = getDur(r)
                    const roiAnu  = roiAnualizado(roi, dur)
                    const estColor = ESTADO_COLOR[r.estado] || '#888'
                    const ventaDate = r.fecha_salida_estimada
                      ? new Date(r.fecha_salida_estimada).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})
                      : '—'
                    const compraDate = r.fecha_compra
                      ? new Date(r.fecha_compra).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'})
                      : '—'
                    return (
                      <tr key={r.id} style={{ borderBottom: i < filtered.length-1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                        <td className="px-3 py-2.5 text-sm font-bold text-white whitespace-nowrap max-w-[140px]">
                          <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.nombre}</div>
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {r.tipo || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          {r.porcentaje_hasu >= 100
                            ? <span className="font-bold px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(34,197,94,0.12)', color: '#22C55E' }}>HASU 100%</span>
                            : <span className="font-bold px-2 py-0.5 rounded-full text-[11px]" style={{ background: 'rgba(242,110,31,0.12)', color: '#F26E1F' }}>JV {r.porcentaje_hasu}%</span>
                          }
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          <div className="font-mono font-bold" style={{ color: '#fff' }}>
                            {r.precio_compra ? fmtK(r.precio_compra) : '—'}
                          </div>
                          {compraDate !== '—' && <div className="text-[10px] mt-0.5" style={{ color: '#555' }}>{compraDate}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                          <div className="font-mono font-bold" style={{ color: r.precio_venta_real ? '#22C55E' : 'rgba(255,255,255,0.5)' }}>
                            {getVenta(r) > 0 ? fmtK(getVenta(r)) : '—'}
                            {!r.precio_venta_real && getVenta(r) > 0 && <span className="ml-1 text-[9px]" style={{ color: '#F59E0B' }}>est.</span>}
                          </div>
                          {ventaDate !== '—' && <div className="text-[10px] mt-0.5" style={{ color: '#555' }}>{ventaDate}</div>}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold whitespace-nowrap text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>
                          {dur !== null ? `${dur}m` : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap" style={{ color: '#fff' }}>
                          {inv > 0 ? fmtK(inv) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap" style={{ color: benef >= 0 ? '#22C55E' : '#EF4444' }}>
                          {inv > 0 ? (benef >= 0 ? '+' : '') + fmtK(benef) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-mono font-bold whitespace-nowrap" style={{ color: benef >= 0 ? '#F26E1F' : '#EF4444' }}>
                          {inv > 0 ? (benef >= 0 ? '+' : '') + fmtK(benef * (r.porcentaje_hasu || 100) / 100) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold whitespace-nowrap" style={{ color: roi >= 0 ? '#22C55E' : '#EF4444' }}>
                          {inv > 0 ? fmtPct(roi) : '—'}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-bold whitespace-nowrap" style={{ color: (roiAnu ?? 0) >= 0 ? '#60A5FA' : '#EF4444' }}>
                          {roiAnu !== null ? fmtPct(roiAnu) : '—'}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                            style={{ background: `${estColor}20`, color: estColor }}>
                            {ESTADO_LABEL[r.estado] || r.estado}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Módulos empresa */}
      <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3 mt-2" style={{ color: '#888' }}>Módulos empresa</div>
      {MODULOS.map(m => (
        <button key={m.nombre} onClick={() => router.push(m.href)}
          className="w-full flex items-center gap-3.5 p-4 rounded-xl mb-2 text-left transition-colors active:opacity-70"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="w-[42px] h-[42px] rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: m.bg }}>{m.icon}</div>
          <div className="flex-1">
            <div className="text-sm font-bold text-white">{m.nombre}</div>
            <div className="text-xs font-medium mt-0.5" style={{ color: '#888' }}>{m.desc}</div>
          </div>
          <div className="text-xl font-light" style={{ color: '#888' }}>›</div>
        </button>
      ))}

    </div>
  )
}
