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

type CatTab = 'todos' | 'inmuebles_varios' | 'edificios' | 'extranjero'

type TrackRow = {
  id: string; nombre: string; tipo: string; estado: string
  inversor: string | null
  fecha_compra: string | null; fecha_salida_estimada: string | null
  valor_total_operacion: number | null; precio_compra: number | null
  precio_venta_real: number | null; precio_venta_estimado: number | null
  porcentaje_hasu: number
  inversion_hasu: number | null
  categoria: string
  codigo: string | null
  movimientos?: { tipo: string; monto: number }[]
}

type SortKey = 'roi' | 'fecha' | 'duracion'
type FilterKey = 'todos' | 'en_curso' | 'finalizado'

const EN_CURSO = ['comprado','reforma','venta','reservado','con_oferta','en_arras']
const VENDIDOS = ['vendido','cerrado']

const card: React.CSSProperties = {
  background: '#fff',
  borderRadius: 18,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
}

export default function HasuPage() {
  const router = useRouter()
  const [cuentas,    setCuentas]    = useState<any[]>([])
  const [proyectos,  setProyectos]  = useState<any[]>([])
  const [trackRows,  setTrackRows]  = useState<TrackRow[]>([])
  const [inversores, setInversores] = useState<number>(0)
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState<FilterKey>('todos')
  const [sortBy,     setSortBy]     = useState<SortKey>('fecha')
  const [catTab,     setCatTab]     = useState<CatTab>('todos')

  useEffect(() => {
    Promise.all([
      supabase.from('cuentas_bancarias').select('*').eq('activa', true).order('created_at'),
      supabase.from('proyectos').select('id,nombre,estado,precio_compra,precio_venta_estimado'),
      supabase.from('inversores').select('id', { count: 'exact' }),
      supabase.from('proyectos').select('id,nombre,tipo,estado,porcentaje_hasu,precio_compra,precio_venta_estimado,precio_venta_real,valor_total_operacion,inversion_hasu,fecha_compra,fecha_salida_estimada,categoria,codigo,movimientos(tipo,monto)').order('created_at',{ascending:false}),
      supabase.from('proyecto_inversores').select('proyecto_id,inversores(nombre)'),
    ]).then(([c, p, inv, tr, pi]) => {
      setCuentas(c.data || [])
      setProyectos(p.data || [])
      setInversores(inv.count || 0)

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

  const activos = proyectos.filter(p => EN_CURSO.includes(p.estado))

  const getInv     = (r: TrackRow) => r.valor_total_operacion || r.precio_compra || 0
  const getInvHasu = (r: TrackRow): number | null => {
    if (r.inversion_hasu && r.inversion_hasu > 0) return r.inversion_hasu
    if ((r.porcentaje_hasu || 0) >= 100) return r.valor_total_operacion || r.precio_compra || 0
    return null
  }
  const getVenta     = (r: TrackRow) => r.precio_venta_real || r.precio_venta_estimado || 0
  const getBenef     = (r: TrackRow) => getVenta(r) - getInv(r)
  const getBenefHasu = (r: TrackRow) => getBenef(r) * ((r.porcentaje_hasu || 100) / 100)
  const getRoi       = (r: TrackRow) => { const i = getInvHasu(r) ?? getInv(r); return i > 0 ? (getBenefHasu(r) / i) * 100 : 0 }
  const getDur       = (r: TrackRow) => duracionMeses(r.fecha_compra, r.fecha_salida_estimada)

  const cerradosReal   = trackRows.filter(r => r.precio_venta_real && r.precio_venta_real > 0)
  const totalBenefReal = cerradosReal.reduce((s, r) => s + getBenefHasu(r), 0)
  const ebitda         = cerradosReal.reduce((s, r) => s + getBenef(r), 0)
  const OBJETIVO       = 1_000_000
  const pct            = Math.min((totalBenefReal / OBJETIVO) * 100, 100)
  const mesesRest      = monthsUntilDec2027()
  const porMes         = Math.max(0, (OBJETIVO - totalBenefReal) / mesesRest)

  const catFiltered = catTab === 'todos' ? trackRows : trackRows.filter(r => r.categoria === catTab)

  const trWithVenta  = catFiltered.filter(r => getVenta(r) > 0 && getInv(r) > 0)
  const trCapTotal   = catFiltered.reduce((s, r) => s + getInv(r), 0)
  const trCapHasu    = catFiltered.reduce((s, r) => s + (getInvHasu(r) ?? 0), 0)
  const trBenefTotal = trWithVenta.reduce((s, r) => s + getBenef(r), 0)
  const trBenefHasu  = trWithVenta.reduce((s, r) => s + getBenefHasu(r), 0)
  const trRoiMedio   = trWithVenta.length > 0 ? trWithVenta.reduce((s, r) => s + getRoi(r), 0) / trWithVenta.length : 0
  const trDurMedia   = (() => {
    const durs = catFiltered.map(getDur).filter(Boolean) as number[]
    return durs.length > 0 ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : null
  })()
  const trRoiAnual   = (() => {
    const rows = trWithVenta.filter(r => getDur(r) !== null)
    if (!rows.length) return null
    return rows.reduce((s, r) => s + (roiAnualizado(getRoi(r), getDur(r)) ?? 0), 0) / rows.length
  })()

  const filtered = catFiltered
    .filter(r => {
      if (filter === 'en_curso')   return EN_CURSO.includes(r.estado)
      if (filter === 'finalizado') return VENDIDOS.includes(r.estado)
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'roi')      return getRoi(b) - getRoi(a)
      if (sortBy === 'duracion') return (getDur(b) ?? 0) - (getDur(a) ?? 0)
      return (b.fecha_compra || '').localeCompare(a.fecha_compra || '')
    })

  const FINANZAS_MOD = { icon: '📊', bg: 'rgba(34,197,94,0.12)', nombre: 'Finanzas', desc: 'Flujo de caja · todos los proyectos', href: '/hasu/flujo-caja' }
  const MODULOS = [
    { icon: '🔧', bg: 'rgba(96,165,250,0.12)',  nombre: 'Proveedores',        desc: 'Gestión de proveedores y contactos',  href: '/hasu/proveedores' },
    { icon: '🧾', bg: 'rgba(245,158,11,0.12)',  nombre: 'Fiscal y gestoría',  desc: 'IVA, IRPF, documentos legales',       href: '/hasu/fiscal' },
    { icon: '⚙',  bg: 'rgba(242,110,31,0.12)', nombre: 'Usuarios y permisos', desc: 'Roles · accesos · proyectos',         href: '/admin' },
    { icon: '📁', bg: 'rgba(167,139,250,0.12)', nombre: 'Docs de empresa',    desc: 'Estatutos · contratos · CIF',         href: '/hasu/docs' },
    { icon: '📅', bg: 'rgba(96,165,250,0.12)', nombre: 'Calendario',          desc: 'Google Calendar · hola@hasu.in',      href: '/hasu/calendario' },
  ]

  const ESTADO_COLOR: Record<string,string> = { comprado:'#22C55E', reforma:'#F26E1F', venta:'#a78bfa', reservado:'#F59E0B', con_oferta:'#F26E1F', en_arras:'#22C55E', vendido:'#22C55E', cerrado:'#22C55E', captado:'#555', analisis:'#60A5FA', ofertado:'#F59E0B' }
  const ESTADO_LABEL: Record<string,string> = { comprado:'Comprado', reforma:'En reforma', venta:'En venta', reservado:'Reservado', con_oferta:'Ofertado', en_arras:'En arras', vendido:'Vendido', cerrado:'Vendido', captado:'Captado', analisis:'Análisis', ofertado:'Ofertado' }

  return (
    <div style={{ background: '#F2F1ED', minHeight: '100vh', paddingBottom: 90 }}>

      {/* ── HERO ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ position: 'relative', height: 160, overflow: 'hidden', borderRadius: 20 }}>
          <img
            src="https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1400&q=80"
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 40%' }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(232,98,26,0.82) 0%, rgba(201,169,110,0.70) 100%)' }} />
          <div style={{ position: 'absolute', inset: 0, padding: '20px 24px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em' }}>HASU</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 4, fontWeight: 600 }}>Control de empresa · Track Record · Módulos</div>
          </div>
        </div>
      </div>

      {/* ── CONTENIDO ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* ── KPI ROW ── */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28, marginBottom: 28 }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 130, borderRadius: 18, background: '#E8E6E0' }} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28, marginBottom: 28 }}>
            {[
              { icon: '🏆', val: fmt(totalBenefReal), label: 'BENEFICIO HASU', sub: 'acumulado real', color: '#22C55E' },
              { icon: '📊', val: fmt(ebitda), label: 'RESULTADO OPERATIVO', sub: `${cerradosReal.length} operaciones`, color: ebitda >= 0 ? '#22C55E' : '#EF4444' },
              { icon: '📈', val: trWithVenta.length > 0 ? fmtPct(trRoiMedio) : '—', label: 'ROI MEDIO', sub: 'media operaciones', color: '#a78bfa' },
              { icon: '⏱', val: trDurMedia !== null ? `${trDurMedia} meses` : '—', label: 'DURACIÓN MEDIA', sub: 'por operación', color: '#60A5FA' },
            ].map(k => (
              <div key={k.label} style={{ ...card, padding: '28px 24px' }}>
                <div style={{ fontSize: 24, marginBottom: 12 }}>{k.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginTop: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{k.label}</div>
                <div style={{ fontSize: 11, color: '#BBB', marginTop: 4 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── OBJETIVO + ROI CHART ── */}
        {!loading && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 48 }}>

            {/* Objetivo 1M€ */}
            <div style={{ ...card, padding: '28px 32px' }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 4 }}>Objetivo 1.000.000 € · Dic 2027</div>
              <div style={{ fontSize: 11, color: '#BBB', marginBottom: 16 }}>Beneficio acumulado de operaciones con venta real</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <div style={{ fontSize: 34, fontWeight: 900, color: '#F26E1F', letterSpacing: '-0.03em', lineHeight: 1 }}>{fmt(totalBenefReal)}</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#F26E1F' }}>{pct.toFixed(1)}%</div>
              </div>
              <div style={{ height: 8, background: '#F2F1ED', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
                <div style={{ height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#F26E1F,#FBBF24)', borderRadius: 99, transition: 'width 0.8s ease' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#CCC', fontWeight: 700, marginBottom: 20 }}>
                <span>0€</span><span>→ 1M€</span>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1, background: '#FAFAF8', borderRadius: 12, padding: '12px 14px', border: '1px solid #ECEAE4' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#BBB', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Meses restantes</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#111' }}>{mesesRest}</div>
                </div>
                <div style={{ flex: 1, background: '#FAFAF8', borderRadius: 12, padding: '12px 14px', border: '1px solid #ECEAE4' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#BBB', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 4 }}>Necesario/mes</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#F26E1F' }}>{fmt(porMes)}</div>
                </div>
              </div>
            </div>

            {/* ROI por operación */}
            <div style={{ ...card, padding: 24 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 4 }}>ROI por operación</div>
              <div style={{ fontSize: 11, color: '#BBB', marginBottom: 20 }}>Naranja = activo · Verde = vendido</div>
              {trackRows.filter(r => getRoi(r) !== 0).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#CCC', fontSize: 12, padding: '20px 0' }}>Sin datos de ROI todavía</div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 90 }}>
                  {trackRows.filter(r => getRoi(r) !== 0).slice(0, 8).map(r => {
                    const roi = getRoi(r)
                    const h = Math.max(12, Math.min(90, Math.abs(roi) * 0.9))
                    const isVendido = VENDIDOS.includes(r.estado)
                    return (
                      <div key={r.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 800, color: isVendido ? '#22C55E' : '#F26E1F' }}>{roi.toFixed(0)}%</div>
                        <div style={{ width: '100%', height: h, borderRadius: '6px 6px 0 0', background: isVendido ? 'linear-gradient(180deg,#22C55E,#16A34A)' : 'linear-gradient(180deg,#F26E1F,#F59E0B)' }} />
                        <div style={{ fontSize: 8, color: '#BBB', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: 50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.nombre.split(' ').slice(-1)[0]}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TRACK RECORD ── */}
        <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em', marginBottom: 20 }}>TRACK RECORD</div>

        {/* Solapas categoría */}
        <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid #ECEAE4', marginBottom: 28, background: '#fff' }}>
          {([
            ['todos',            'Todos'],
            ['inmuebles_varios', 'Inmuebles'],
            ['edificios',        'Edificios'],
            ['extranjero',       'Extranjero'],
          ] as [CatTab, string][]).map(([k, l]) => (
            <button key={k} onClick={() => setCatTab(k)}
              style={{ flex: 1, padding: '10px 16px', fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer', background: catTab === k ? '#F26E1F' : 'transparent', color: catTab === k ? '#fff' : '#999' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Track KPIs 4 col */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28, marginBottom: 28 }}>
            {[1,2,3,4,5,6,7,8].map(i => <div key={i} style={{ height: 110, borderRadius: 18, background: '#E8E6E0' }} />)}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28, marginBottom: 28 }}>
            {[
              { icon: '📊', val: String(catFiltered.length), label: 'OPERACIONES', sub: `${catFiltered.filter(r => r.precio_venta_real && r.precio_venta_real > 0).length} con venta real`, color: '#111' },
              { icon: '⏱', val: trDurMedia !== null ? `${trDurMedia}m` : '—', label: 'DURACIÓN MEDIA', sub: 'por operación', color: '#111' },
              { icon: '💰', val: trCapHasu > 0 ? fmtK(trCapHasu) : '—', label: 'CAPITAL HASU', sub: 'parte HASU invertida', color: '#60A5FA' },
              { icon: '⚡', val: trRoiAnual !== null ? fmtPct(trRoiAnual) : '—', label: 'ROI ANUALIZADO', sub: 'media anualizada', color: '#a78bfa' },
              { icon: '🏦', val: trCapTotal > 0 ? fmtK(trCapTotal) : '—', label: 'CAPITAL TOTAL JV', sub: 'invertido en operaciones', color: '#111' },
              { icon: '💵', val: trWithVenta.length > 0 ? (trBenefTotal >= 0 ? '+' : '') + fmtK(trBenefTotal) : '—', label: 'BENEF. TOTAL JV', sub: 'suma operaciones con venta', color: trBenefTotal >= 0 ? '#22C55E' : '#EF4444' },
              { icon: '✨', val: trWithVenta.length > 0 ? (trBenefHasu >= 0 ? '+' : '') + fmtK(trBenefHasu) : '—', label: 'BENEF. HASU', sub: 'parte HASU del beneficio', color: trBenefHasu >= 0 ? '#22C55E' : '#EF4444' },
              { icon: '📉', val: trWithVenta.length > 0 ? fmtPct(trRoiMedio) : '—', label: 'ROI HASU MEDIO', sub: 'media operaciones', color: '#a78bfa' },
            ].map(k => (
              <div key={k.label} style={{ ...card, padding: '24px' }}>
                <div style={{ fontSize: 20, marginBottom: 10 }}>{k.icon}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: k.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.val}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#999', marginTop: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{k.label}</div>
                <div style={{ fontSize: 11, color: '#BBB', marginTop: 3 }}>{k.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── TABLA OPERACIONES ── */}
        <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em', marginBottom: 20 }}>OPERACIONES</div>

        {loading ? (
          <div style={{ height: 200, borderRadius: 18, background: '#E8E6E0' }} />
        ) : filtered.length === 0 ? (
          <div style={{ ...card, padding: 40, textAlign: 'center', color: '#BBB', fontSize: 13 }}>Sin operaciones</div>
        ) : (
          <div style={{ ...card, marginBottom: 48, overflow: 'hidden' }}>
            {/* Filtros dentro de la card */}
            <div style={{ padding: '16px 20px 12px', display: 'flex', gap: 8, alignItems: 'center', borderBottom: '1px solid #F2F1ED', flexWrap: 'wrap' as const }}>
              <div style={{ display: 'flex', borderRadius: 10, overflow: 'hidden', border: '1px solid #ECEAE4' }}>
                {([['todos','Todos'],['en_curso','En curso'],['finalizado','Finalizados']] as [FilterKey,string][]).map(([k,l]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{ padding: '6px 14px', fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer', background: filter === k ? '#F26E1F' : 'transparent', color: filter === k ? '#fff' : '#999' }}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: '#BBB' }}>Ordenar:</span>
                {([['roi','ROI'],['fecha','Fecha'],['duracion','Duración']] as [SortKey,string][]).map(([k,l]) => (
                  <button key={k} onClick={() => setSortBy(k)}
                    style={{ padding: '4px 10px', borderRadius: 8, fontSize: 10, fontWeight: 800, border: 'none', cursor: 'pointer', background: sortBy === k ? 'rgba(242,110,31,0.12)' : '#F2F1ED', color: sortBy === k ? '#F26E1F' : '#BBB' }}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 880, fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #ECEAE4' }}>
                    {['#','Proyecto','Tipo','Estructura','P. Compra','P. Venta','Dur.','Inv. Total','Inv. HASU','Benef. Total','Benef. HASU','ROI HASU','ROI Anual.','Estado'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#BBB', whiteSpace: 'nowrap' as const }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => {
                    const inv       = getInv(r)
                    const invHasu   = getInvHasu(r)
                    const hasVenta  = getVenta(r) > 0
                    const benef     = getBenef(r)
                    const benefHasu = benef * ((r.porcentaje_hasu || 100) / 100)
                    const roi       = getRoi(r)
                    const dur       = getDur(r)
                    const roiAnu    = roiAnualizado(roi, dur)
                    const estColor  = ESTADO_COLOR[r.estado] || '#888'
                    const ventaDate  = r.fecha_salida_estimada ? new Date(r.fecha_salida_estimada).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'}) : '—'
                    const compraDate = r.fecha_compra ? new Date(r.fecha_compra).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'}) : '—'
                    return (
                      <tr key={r.id} style={{ borderBottom: i < filtered.length-1 ? '1px solid #F2F1ED' : 'none' }}>
                        <td style={{ padding: '11px 14px', fontSize: 10, fontWeight: 700, color: '#CCC', whiteSpace: 'nowrap' as const }}>{r.codigo || '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 800, color: '#111', whiteSpace: 'nowrap' as const }}>{r.nombre}</td>
                        <td style={{ padding: '11px 14px', color: '#888', whiteSpace: 'nowrap' as const }}>{r.tipo || '—'}</td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' as const }}>
                          {r.porcentaje_hasu >= 100
                            ? <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: '#F2F1ED', color: '#888' }}>100%</span>
                            : <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: 'rgba(242,110,31,0.1)', color: '#F26E1F' }}>JV {r.porcentaje_hasu}%</span>
                          }
                        </td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' as const }}>
                          <div style={{ fontWeight: 700, color: '#111' }}>{r.precio_compra ? fmtK(r.precio_compra) : '—'}</div>
                          {compraDate !== '—' && <div style={{ fontSize: 10, color: '#CCC', marginTop: 1 }}>{compraDate}</div>}
                        </td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' as const }}>
                          <div style={{ fontWeight: 700, color: '#111' }}>
                            {getVenta(r) > 0 ? fmtK(getVenta(r)) : '—'}
                            {!r.precio_venta_real && getVenta(r) > 0 && <span style={{ fontSize: 9, color: '#CCC', marginLeft: 3 }}>est.</span>}
                          </div>
                          {ventaDate !== '—' && <div style={{ fontSize: 10, color: '#CCC', marginTop: 1 }}>{ventaDate}</div>}
                        </td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: '#888', textAlign: 'center', whiteSpace: 'nowrap' as const }}>{dur !== null ? `${dur}m` : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' as const }}>{inv > 0 ? fmtK(inv) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: invHasu !== null ? '#111' : '#DDD', whiteSpace: 'nowrap' as const }}>{invHasu !== null ? fmtK(invHasu) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' as const }}>{inv > 0 && hasVenta ? (benef >= 0 ? '+' : '') + fmtK(benef) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 700, color: '#111', whiteSpace: 'nowrap' as const }}>{inv > 0 && hasVenta ? (benefHasu >= 0 ? '+' : '') + fmtK(benefHasu) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 900, color: hasVenta ? (roi >= 0 ? '#22C55E' : '#EF4444') : '#DDD', whiteSpace: 'nowrap' as const }}>{inv > 0 && hasVenta ? fmtPct(roi) : '—'}</td>
                        <td style={{ padding: '11px 14px', fontWeight: 900, color: hasVenta && roiAnu !== null ? (roiAnu >= 0 ? '#22C55E' : '#EF4444') : '#DDD', whiteSpace: 'nowrap' as const }}>{roiAnu !== null && hasVenta ? fmtPct(roiAnu) : '—'}</td>
                        <td style={{ padding: '11px 14px', whiteSpace: 'nowrap' as const }}>
                          <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100, background: `${estColor}18`, color: estColor }}>{ESTADO_LABEL[r.estado] || r.estado}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {(() => {
                  const withVenta  = filtered.filter(r => getVenta(r) > 0 && getInv(r) > 0)
                  const withDur    = filtered.filter(r => getDur(r) !== null)
                  const withRoiAnu = filtered.filter(r => { const d = getDur(r); return getVenta(r) > 0 && d !== null && roiAnualizado(getRoi(r), d) !== null })
                  const totalInv    = filtered.reduce((s, r) => s + getInv(r), 0)
                  const totalInvH   = filtered.reduce((s, r) => s + (getInvHasu(r) ?? 0), 0)
                  const totalBenef  = withVenta.reduce((s, r) => s + getBenef(r), 0)
                  const totalBenefH = withVenta.reduce((s, r) => s + getBenefHasu(r), 0)
                  const roiMedioTbl = withVenta.length > 0 ? withVenta.reduce((s, r) => s + getRoi(r), 0) / withVenta.length : null
                  const roiAnuMedio = withRoiAnu.length > 0 ? withRoiAnu.reduce((s, r) => { const d = getDur(r); return s + (roiAnualizado(getRoi(r), d) ?? 0) }, 0) / withRoiAnu.length : null
                  const durMedia    = withDur.length > 0 ? Math.round(withDur.reduce((s, r) => s + (getDur(r) ?? 0), 0) / withDur.length) : null
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid #ECEAE4', background: '#FAFAF8' }}>
                        <td style={{ padding: '10px 14px' }} />
                        <td style={{ padding: '10px 14px', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' as const, color: '#BBB' }}>{filtered.length} operaciones</td>
                        <td colSpan={2} />
                        <td style={{ padding: '10px 14px' }} /><td style={{ padding: '10px 14px' }} />
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#888', textAlign: 'center' }}>{durMedia !== null ? `${durMedia}m` : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#111' }}>{totalInv > 0 ? fmtK(totalInv) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#111' }}>{totalInvH > 0 ? fmtK(totalInvH) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#111' }}>{withVenta.length > 0 ? (totalBenef >= 0 ? '+' : '') + fmtK(totalBenef) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: '#111' }}>{withVenta.length > 0 ? (totalBenefH >= 0 ? '+' : '') + fmtK(totalBenefH) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: roiMedioTbl !== null ? (roiMedioTbl >= 0 ? '#22C55E' : '#EF4444') : '#DDD' }}>{roiMedioTbl !== null ? fmtPct(roiMedioTbl) : '—'}</td>
                        <td style={{ padding: '10px 14px', fontWeight: 900, color: roiAnuMedio !== null ? (roiAnuMedio >= 0 ? '#22C55E' : '#EF4444') : '#DDD' }}>{roiAnuMedio !== null ? fmtPct(roiAnuMedio) : '—'}</td>
                        <td style={{ padding: '10px 14px' }} />
                      </tr>
                    </tfoot>
                  )
                })()}
              </table>
            </div>
          </div>
        )}

        {/* ── MÓDULOS EMPRESA ── */}
        <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em', marginBottom: 20 }}>MÓDULOS EMPRESA</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28 }}>
          {[FINANZAS_MOD, ...MODULOS].map(m => (
            <button key={m.nombre} onClick={() => router.push(m.href)}
              style={{ ...card, padding: 22, display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', textAlign: 'left', border: 'none', transition: 'box-shadow 0.15s' }}>
              <div style={{ width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0, background: m.bg }}>{m.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#111' }}>{m.nombre}</div>
                <div style={{ fontSize: 11, color: '#BBB', marginTop: 3 }}>{m.desc}</div>
              </div>
              <div style={{ fontSize: 20, color: '#DDD', flexShrink: 0 }}>›</div>
            </button>
          ))}
        </div>

      </div>
    </div>
  )
}
