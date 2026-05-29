'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useUser, canAccessProject } from '@/lib/user-context'
import { authFetch } from '@/lib/auth-fetch'

const ESTADOS_PIPELINE  = ['captado','analisis','ofertado']
const ESTADOS_ACTIVOS   = ['comprado','reforma','venta','reservado','con_oferta','en_arras']
const ESTADOS_VENDIDOS  = ['vendido','cerrado']
const ESTADOS_TODOS     = [...ESTADOS_PIPELINE, ...ESTADOS_ACTIVOS, ...ESTADOS_VENDIDOS]

const ESTADO_LABEL: Record<string,string> = {
  captado:'Captado', analisis:'Análisis', ofertado:'Ofertado',
  comprado:'Comprado', reforma:'Reforma',
  venta:'En venta', reservado:'Reservado', con_oferta:'Ofertado', en_arras:'En arras',
  vendido:'Vendido', cerrado:'Vendido',
}
const ESTADO_COLOR: Record<string,string> = {
  captado:'#888', analisis:'#60A5FA', ofertado:'#F59E0B',
  comprado:'#22C55E', reforma:'#F26E1F',
  venta:'#a78bfa', reservado:'#F59E0B', con_oferta:'#F26E1F', en_arras:'#22C55E',
  vendido:'#22C55E', cerrado:'#22C55E',
}

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

type Proyecto = {
  id: string; nombre: string; direccion?: string; ciudad: string; tipo: string; estado: string
  porcentaje_hasu: number; socio_nombre: string | null; avance_reforma: number
  precio_compra: number | null; precio_venta_estimado: number | null; precio_venta_real: number | null
  precio_venta_conservador: number | null; precio_venta_realista: number | null; precio_venta_optimista: number | null
  valor_total_operacion: number | null; inversion_hasu: number | null
  fecha_compra: string | null; fecha_salida_estimada: string | null
}

const getInv     = (p: Proyecto) => p.valor_total_operacion || p.precio_compra || 0
const getInvHasu = (p: Proyecto): number => {
  if (p.inversion_hasu && p.inversion_hasu > 0) return p.inversion_hasu
  if ((p.porcentaje_hasu || 100) >= 100) return getInv(p)
  return getInv(p) * (p.porcentaje_hasu || 100) / 100
}
const getVenta     = (p: Proyecto) => p.precio_venta_real || p.precio_venta_realista || p.precio_venta_estimado || 0
const getBenef     = (p: Proyecto) => getVenta(p) - getInv(p)
const getBenefHasu = (p: Proyecto) => getBenef(p) * ((p.porcentaje_hasu || 100) / 100)
const getRoi       = (p: Proyecto) => { const i = getInvHasu(p); return i > 0 ? (getBenefHasu(p) / i) * 100 : 0 }

function calcSemaforo(p: Proyecto, gastos: number): 'verde' | 'naranja' | 'rojo' {
  const presupuesto = p.valor_total_operacion || 0
  const hoy = new Date()
  const finEst = p.fecha_salida_estimada ? new Date(p.fecha_salida_estimada) : null
  const diasRetraso = finEst && finEst < hoy ? Math.floor((hoy.getTime() - finEst.getTime()) / 86400000) : 0
  const desvPct = presupuesto > 0 ? ((gastos - presupuesto) / presupuesto) * 100 : 0
  if (diasRetraso > 30 || desvPct > 20) return 'rojo'
  if (diasRetraso > 0 || desvPct > 10) return 'naranja'
  return 'verde'
}

const SEM_CFG = {
  verde:   { color: '#22C55E', bg: 'rgba(34,197,94,0.10)',   label: 'Dentro de presupuesto y plazo' },
  naranja: { color: '#F59E0B', bg: 'rgba(245,158,11,0.10)',  label: 'Desviación de presupuesto >10%' },
  rojo:    { color: '#EF4444', bg: 'rgba(239,68,68,0.10)',   label: 'Retraso >30 días o desviación >20%' },
}

export default function ProyectosPage() {
  const router = useRouter()
  const user = useUser()
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [gastosMap, setGastosMap] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  const [editAvance, setEditAvance]       = useState<Record<string, string>>({})
  const [editPrecios, setEditPrecios]     = useState<Record<string, { c: string; r: string; o: string }>>({})
  const [editFinalizado, setEditFinalizado] = useState<Record<string, { venta: string; inv: string }>>({})
  const [saving, setSaving]               = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([
      supabase.from('proyectos')
        .select('id,nombre,direccion,ciudad,tipo,estado,porcentaje_hasu,socio_nombre,avance_reforma,precio_compra,precio_venta_estimado,precio_venta_real,precio_venta_conservador,precio_venta_realista,precio_venta_optimista,valor_total_operacion,inversion_hasu,fecha_compra,fecha_salida_estimada')
        .order('created_at', { ascending: false }),
      supabase.from('movimientos').select('proyecto_id,monto,tipo'),
    ]).then(([p, m]) => {
      setProyectos(p.data || [])
      const map: Record<string, number> = {}
      ;(m.data || []).forEach((mov: any) => {
        if (mov.tipo === 'Gasto' || mov.monto < 0) {
          map[mov.proyecto_id] = (map[mov.proyecto_id] || 0) + Math.abs(mov.monto)
        }
      })
      setGastosMap(map)
      setLoading(false)
    })
  }, [])

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const cambiarEstado = async (pid: string, nuevoEstado: string) => {
    setSaving(s => ({ ...s, [pid]: true }))
    const { error } = await supabase.from('proyectos').update({ estado: nuevoEstado }).eq('id', pid)
    if (!error) setProyectos(prev => prev.map(x => x.id === pid ? { ...x, estado: nuevoEstado } : x))
    setSaving(s => ({ ...s, [pid]: false }))
  }

  const guardarAvance = async (pid: string, val: string) => {
    const n = Math.min(100, Math.max(0, parseInt(val) || 0))
    setSaving(s => ({ ...s, [pid + '_av']: true }))
    const { error } = await supabase.from('proyectos').update({ avance_reforma: n }).eq('id', pid)
    if (!error) setProyectos(prev => prev.map(x => x.id === pid ? { ...x, avance_reforma: n } : x))
    setEditAvance(e => { const n2 = { ...e }; delete n2[pid]; return n2 })
    setSaving(s => ({ ...s, [pid + '_av']: false }))
  }

  const guardarPrecios = async (pid: string) => {
    const ep = editPrecios[pid]
    if (!ep) return
    const updates: Record<string, number | null> = {
      precio_venta_conservador: ep.c ? parseFloat(ep.c.replace(/\./g,'').replace(',','.')) : null,
      precio_venta_realista:    ep.r ? parseFloat(ep.r.replace(/\./g,'').replace(',','.')) : null,
      precio_venta_optimista:   ep.o ? parseFloat(ep.o.replace(/\./g,'').replace(',','.')) : null,
    }
    setSaving(s => ({ ...s, [pid + '_pr']: true }))
    const { error } = await supabase.from('proyectos').update(updates).eq('id', pid)
    if (!error) setProyectos(prev => prev.map(x => x.id === pid ? {
      ...x,
      precio_venta_conservador: updates.precio_venta_conservador,
      precio_venta_realista:    updates.precio_venta_realista,
      precio_venta_optimista:   updates.precio_venta_optimista,
    } : x))
    setEditPrecios(e => { const n2 = { ...e }; delete n2[pid]; return n2 })
    setSaving(s => ({ ...s, [pid + '_pr']: false }))
  }

  const initEditPrecios = (p: Proyecto) => {
    setEditPrecios(e => ({
      ...e,
      [p.id]: {
        c: p.precio_venta_conservador ? String(p.precio_venta_conservador) : '',
        r: p.precio_venta_realista    ? String(p.precio_venta_realista)    : '',
        o: p.precio_venta_optimista   ? String(p.precio_venta_optimista)   : '',
      }
    }))
  }

  const guardarFinalizado = async (pid: string) => {
    const ef = editFinalizado[pid]
    if (!ef) return
    const updates: Record<string, number | null> = {
      precio_venta_real:    ef.venta ? parseFloat(ef.venta.replace(/\./g,'').replace(',','.')) : null,
      valor_total_operacion: ef.inv  ? parseFloat(ef.inv.replace(/\./g,'').replace(',','.'))  : null,
    }
    setSaving(s => ({ ...s, [pid + '_fin']: true }))
    const { error } = await supabase.from('proyectos').update(updates).eq('id', pid)
    if (!error) setProyectos(prev => prev.map(x => x.id === pid ? { ...x, ...updates } : x))
    setEditFinalizado(e => { const n2 = { ...e }; delete n2[pid]; return n2 })
    setSaving(s => ({ ...s, [pid + '_fin']: false }))
  }

  const deleteProyecto = async (p: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Eliminar el proyecto "${p.nombre}"? Esta acción no se puede deshacer.`)) return
    const res = await authFetch(`/api/proyectos/${p.id}`, { method: 'DELETE' })
    if (res.ok) setProyectos(prev => prev.filter(x => x.id !== p.id))
    else alert('Error al eliminar el proyecto.')
  }

  const marcarVendido = async (p: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`¿Marcar "${p.nombre}" como vendido?\nEl proyecto pasará a "Operaciones finalizadas".`)) return
    await cambiarEstado(p.id, 'vendido')
  }

  const visibles    = proyectos.filter(p => canAccessProject(user?.permisos ?? null, p.id))
  const activos     = visibles.filter(p => ESTADOS_ACTIVOS.includes(p.estado))
  const pipeline    = visibles.filter(p => ESTADOS_PIPELINE.includes(p.estado))
  const finalizados = visibles.filter(p => ESTADOS_VENDIDOS.includes(p.estado))

  // KPI calculations
  const capitalTotal = activos.reduce((s, p) => s + getInvHasu(p), 0)
  const roisValidos  = activos.filter(p => getInvHasu(p) > 0 && getVenta(p) > 0)
  const benefTotal   = roisValidos.reduce((s, p) => s + getBenefHasu(p), 0)
  const roiMedio     = roisValidos.length > 0
    ? roisValidos.reduce((s, p) => s + getRoi(p), 0) / roisValidos.length
    : null

  // Objetivo 1M — beneficio vendidos
  const benefVendidos = finalizados.reduce((s, p) => s + getBenefHasu(p), 0)
  const pctObjetivo   = Math.min(100, (benefVendidos / 1_000_000) * 100)

  return (
    <div style={{ background: '#F2F1ED', minHeight: '100vh', paddingBottom: 90 }}>

      {/* ── HERO ── */}
      <div style={{ position: 'relative', height: 250, overflow: 'hidden' }}>
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=1400&q=80"
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.55) 60%, rgba(242,241,237,1) 100%)' }} />
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '0 20px 14px' }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-0.03em', textShadow: '0 1px 8px rgba(0,0,0,0.3)' }}>
            Proyectos
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 3, fontWeight: 600 }}>
            {activos.length} activos · {finalizados.length} vendidos · Capital {capitalTotal > 0 ? fmt(capitalTotal) : '—'}
          </div>
        </div>
        <button
          onClick={() => router.push('/bot')}
          style={{ position: 'absolute', top: 16, right: 16, background: '#F26E1F', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 12, fontWeight: 800, cursor: 'pointer', letterSpacing: '0.02em' }}>
          + Nuevo
        </button>
      </div>

      {/* ── CONTENIDO ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 40px' }}>

        {/* ── KPI ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 28, marginBottom: 28 }}>
          {[
            { icon: '🏠', val: String(activos.length), label: 'ACTIVOS', sub: pipeline.length > 0 ? `+ ${pipeline.length} en pipeline` : 'En cartera', color: '#F26E1F' },
            { icon: '💰', val: capitalTotal > 0 ? fmt(capitalTotal) : '—', label: 'CAPITAL HASU', sub: `${activos.length} proyecto${activos.length !== 1 ? 's' : ''}`, color: '#60A5FA' },
            { icon: '📈', val: benefTotal !== 0 ? fmt(benefTotal) : '—', label: 'BENEFICIO EST.', sub: 'Escenario realista', color: benefTotal >= 0 ? '#22C55E' : '#EF4444' },
            { icon: '⚡', val: roiMedio !== null ? `${roiMedio >= 0 ? '+' : ''}${roiMedio.toFixed(1)}%` : '—', label: 'ROI MEDIO', sub: 'Sobre inversión', color: '#a78bfa' },
          ].map(k => (
            <div key={k.label} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', padding: '28px 24px' }}>
              <div style={{ fontSize: 24, marginBottom: 12 }}>{k.icon}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: k.color, letterSpacing: '-0.02em', lineHeight: 1 }}>{k.val}</div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#999', marginTop: 6, textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{k.label}</div>
              <div style={{ fontSize: 11, color: '#BBB', marginTop: 4 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── CHARTS ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, marginBottom: 48 }}>

          {/* Objetivo 1M€ */}
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 4 }}>Objetivo 1.000.000 €</div>
            <div style={{ fontSize: 11, color: '#BBB', marginBottom: 16 }}>Beneficio acumulado de operaciones vendidas</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#F26E1F', letterSpacing: '-0.03em' }}>{fmt(benefVendidos)}</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: '#F26E1F' }}>{pctObjetivo.toFixed(1)}%</div>
            </div>
            <div style={{ height: 8, background: '#F2F1ED', borderRadius: 99, overflow: 'hidden', marginBottom: 8 }}>
              <div style={{ height: '100%', width: `${pctObjetivo}%`, background: 'linear-gradient(90deg, #F26E1F, #FBBF24)', borderRadius: 99, transition: 'width 0.8s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#CCC', fontWeight: 700 }}>
              <span>0€</span>
              <span>{finalizados.length} vendidas</span>
              <span>1M€</span>
            </div>
          </div>

          {/* ROI por operación */}
          <div style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 4 }}>ROI por operación</div>
            <div style={{ fontSize: 11, color: '#BBB', marginBottom: 16 }}>Naranja = activo · Verde = vendido</div>
            {[...activos, ...finalizados].filter(p => getRoi(p) !== 0).length === 0 ? (
              <div style={{ textAlign: 'center', color: '#CCC', fontSize: 12, padding: '20px 0' }}>Sin datos de ROI todavía</div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 80 }}>
                {[...activos, ...finalizados].filter(p => getRoi(p) !== 0).slice(0, 7).map(p => {
                  const roi = getRoi(p)
                  const maxH = 80
                  const h = Math.max(12, Math.min(maxH, Math.abs(roi) * 1.2))
                  const isVendido = ESTADOS_VENDIDOS.includes(p.estado)
                  return (
                    <div key={p.id} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: isVendido ? '#22C55E' : '#F26E1F' }}>{roi.toFixed(0)}%</div>
                      <div style={{ width: '100%', height: h, borderRadius: '6px 6px 0 0', background: isVendido ? 'linear-gradient(180deg,#22C55E,#16A34A)' : 'linear-gradient(180deg,#F26E1F,#F59E0B)' }} />
                      <div style={{ fontSize: 8, color: '#BBB', fontWeight: 700, textAlign: 'center', lineHeight: 1.2, maxWidth: 40, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nombre.split(' ')[0]}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── PROYECTOS ACTIVOS ── */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28, marginBottom: 48 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 180, borderRadius: 18, background: '#E8E6E0', animation: 'pulse 2s infinite' }} />)}
          </div>
        ) : activos.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em' }}>PROYECTOS ACTIVOS</div>
              <button onClick={() => router.push('/bot')} style={{ fontSize: 12, fontWeight: 800, color: '#F26E1F', background: 'none', border: 'none', cursor: 'pointer' }}>+ Nuevo vía bot</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28, marginBottom: 48 }}>
              {activos.map(p => {
                const isExp     = expanded.has(p.id)
                const gastos    = gastosMap[p.id] || 0
                const inversion = getInv(p)
                const invHasu   = getInvHasu(p)
                const ventaBase = p.precio_venta_estimado || 0
                const ventaEst  = getVenta(p) > 0
                const pctHasu   = (p.porcentaje_hasu || 100) / 100
                const escenarios = [
                  { label: 'Conservador', stored: p.precio_venta_conservador, mult: 0.90, color: '#888', key: 'c' as const },
                  { label: 'Realista',    stored: p.precio_venta_realista,    mult: 1.00, color: '#F26E1F', key: 'r' as const },
                  { label: 'Optimista',   stored: p.precio_venta_optimista,   mult: 1.10, color: '#22C55E', key: 'o' as const },
                ].map(s => {
                  const venta     = s.stored ?? (ventaBase * s.mult)
                  const benefHasu = (venta - inversion) * pctHasu
                  const roi       = invHasu > 0 ? (benefHasu / invHasu) * 100 : 0
                  return { ...s, venta, benef: benefHasu, roi }
                })
                const roiReal   = escenarios[1].roi
                const fechaCompra = p.fecha_compra ? new Date(p.fecha_compra) : null
                const fechaFin    = p.fecha_salida_estimada ? new Date(p.fecha_salida_estimada) : null
                const diasDesde   = fechaCompra ? Math.floor((new Date().getTime() - fechaCompra.getTime()) / 86400000) : null
                const durMeses    = fechaCompra && fechaFin ? Math.round((fechaFin.getTime() - fechaCompra.getTime()) / (30.44 * 86400000)) : null
                const sem     = calcSemaforo(p, gastos)
                const semCfg  = SEM_CFG[sem]
                const ep      = editPrecios[p.id]
                const pct     = editAvance[p.id] !== undefined ? parseInt(editAvance[p.id]||'0') : p.avance_reforma || 0
                const pctColor = pct >= 75 ? '#22C55E' : pct >= 40 ? '#F26E1F' : '#60A5FA'

                return (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    {/* Card header */}
                    <div style={{ padding: '20px 20px 0' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#111', lineHeight: 1.3 }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>📍 {p.direccion || p.ciudad || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontSize: 18, fontWeight: 900, color: ventaEst ? (roiReal >= 0 ? '#22C55E' : '#EF4444') : '#CCC' }}>
                            {ventaEst ? `${roiReal >= 0 ? '+' : ''}${roiReal.toFixed(1)}%` : '—'}
                          </div>
                          <div style={{ fontSize: 10, color: '#BBB', fontWeight: 700 }}>ROI est.</div>
                        </div>
                      </div>

                      {/* Badges */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 14, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, background: 'rgba(242,110,31,0.12)', color: '#F26E1F' }}>
                          {p.porcentaje_hasu < 100 ? `JV ${p.porcentaje_hasu}%` : '100% HASU'}
                        </span>
                        <select
                          value={p.estado}
                          disabled={saving[p.id]}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); cambiarEstado(p.id, e.target.value) }}
                          style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, border: 'none', outline: 'none', cursor: 'pointer', background: `${ESTADO_COLOR[p.estado] || '#888'}18`, color: ESTADO_COLOR[p.estado] || '#888', WebkitAppearance: 'none', MozAppearance: 'none' } as React.CSSProperties}
                        >
                          {ESTADOS_TODOS.filter(e => e !== 'cerrado').map(e => (
                            <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                          ))}
                        </select>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: semCfg.color, boxShadow: `0 0 6px ${semCfg.color}` }} />
                      </div>

                      {/* Avance */}
                      <div style={{ marginBottom: 16 }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Avance reforma</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <button onClick={() => setEditAvance(e => ({ ...e, [p.id]: String(Math.max(0, pct - 5)) }))}
                              style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #E8E6E0', background: '#FAFAF8', color: '#888', fontSize: 11, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                            <input
                              type="number" min="0" max="100"
                              value={pct}
                              onChange={e => setEditAvance(prev => ({ ...prev, [p.id]: e.target.value }))}
                              onBlur={e => { if (editAvance[p.id] !== undefined) guardarAvance(p.id, e.target.value) }}
                              onKeyDown={e => { if (e.key === 'Enter') guardarAvance(p.id, editAvance[p.id] ?? String(p.avance_reforma||0)) }}
                              style={{ width: 36, textAlign: 'center', fontSize: 11, fontWeight: 900, color: '#111', border: '1px solid #E8E6E0', borderRadius: 6, outline: 'none', background: '#FAFAF8' }}
                            />
                            <button onClick={() => setEditAvance(e => ({ ...e, [p.id]: String(Math.min(100, pct + 5)) }))}
                              style={{ width: 18, height: 18, borderRadius: 4, border: '1px solid #E8E6E0', background: '#FAFAF8', color: '#F26E1F', fontSize: 11, fontWeight: 900, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            <span style={{ fontSize: 10, fontWeight: 900, color: pctColor }}>%</span>
                          </div>
                        </div>
                        <div style={{ height: 6, background: '#F2F1ED', borderRadius: 99, overflow: 'hidden', cursor: 'pointer' }}
                          onClick={() => { if (editAvance[p.id] !== undefined) guardarAvance(p.id, editAvance[p.id]) }}>
                          <div style={{ height: '100%', width: `${pct}%`, background: pctColor, borderRadius: 99, transition: 'width 0.4s ease' }} />
                        </div>
                      </div>
                    </div>

                    {/* Expanded */}
                    <div style={{ maxHeight: isExp ? 900 : 0, overflow: 'hidden', transition: 'max-height 0.38s cubic-bezier(0.4,0,0.2,1)' }}>
                      <div style={{ padding: '16px 20px 20px', borderTop: '1px solid #F2F1ED' }}>
                        {/* Escenarios */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#999' }}>Escenarios de venta</div>
                          {!ep ? (
                            <button onClick={() => initEditPrecios(p)}
                              style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: 'rgba(242,110,31,0.1)', color: '#F26E1F', border: 'none', cursor: 'pointer' }}>Editar ✎</button>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => setEditPrecios(e => { const n2 = { ...e }; delete n2[p.id]; return n2 })}
                                style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: '#F2F1ED', color: '#888', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                              <button onClick={() => guardarPrecios(p.id)} disabled={saving[p.id + '_pr']}
                                style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: '#F26E1F', color: '#fff', border: 'none', cursor: 'pointer', opacity: saving[p.id + '_pr'] ? 0.5 : 1 }}>Guardar</button>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                          {escenarios.map(s => (
                            <div key={s.label} style={{ borderRadius: 12, padding: '10px', textAlign: 'center', background: '#FAFAF8', border: `1px solid ${s.color}25` }}>
                              <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase' as const, color: s.color, marginBottom: 4 }}>{s.label}</div>
                              {ep ? (
                                <input type="number" value={ep[s.key]}
                                  onChange={e => setEditPrecios(prev => ({ ...prev, [p.id]: { ...prev[p.id], [s.key]: e.target.value } }))}
                                  placeholder="€"
                                  style={{ width: '100%', textAlign: 'center', fontSize: 11, fontWeight: 900, border: `1px solid ${s.color}50`, borderRadius: 6, outline: 'none', background: '#fff', padding: '2px 0' }}
                                />
                              ) : (
                                <>
                                  <div style={{ fontSize: 12, fontWeight: 900, color: '#111' }}>{fmt(s.venta)}</div>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: s.benef >= 0 ? '#22C55E' : '#EF4444' }}>{s.benef >= 0 ? '+' : ''}{fmt(s.benef)}</div>
                                  <div style={{ fontSize: 10, fontWeight: 800, color: s.color }}>{s.roi >= 0 ? '+' : ''}{s.roi.toFixed(1)}%</div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Financiero */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
                          {[
                            { l: 'Inv. HASU', v: invHasu ? fmt(invHasu) : '—', c: '#111' },
                            { l: 'Venta obj.', v: ventaBase ? fmt(ventaBase) : '—', c: '#22C55E' },
                            { l: 'Benef. HASU', v: ventaBase ? (escenarios[1].benef >= 0 ? '+' : '') + fmt(escenarios[1].benef) : '—', c: escenarios[1].benef >= 0 ? '#22C55E' : '#EF4444' },
                          ].map(k => (
                            <div key={k.l} style={{ borderRadius: 10, padding: '8px 10px', background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: '#BBB', marginBottom: 3 }}>{k.l}</div>
                              <div style={{ fontSize: 12, fontWeight: 900, color: k.c }}>{k.v}</div>
                            </div>
                          ))}
                        </div>

                        {/* Fechas */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                          <div style={{ borderRadius: 10, padding: '8px 10px', background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: '#BBB', marginBottom: 3 }}>F. compra · Duración</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>
                              {p.fecha_compra ? new Date(p.fecha_compra).toLocaleDateString('es-ES',{day:'2-digit',month:'short',year:'2-digit'}) : '—'}
                              {durMeses !== null ? ` · ${durMeses}m` : ''}
                            </div>
                          </div>
                          <div style={{ borderRadius: 10, padding: '8px 10px', background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: '#BBB', marginBottom: 3 }}>Días desde compra</div>
                            <div style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>{diasDesde !== null ? `${diasDesde} días` : '—'}</div>
                          </div>
                        </div>

                        {/* Semáforo */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderRadius: 12, padding: '10px 14px', background: semCfg.bg, border: `1px solid ${semCfg.color}30`, marginBottom: 12 }}>
                          <div style={{ width: 10, height: 10, borderRadius: '50%', background: semCfg.color, flexShrink: 0, boxShadow: `0 0 6px ${semCfg.color}` }} />
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 900, color: semCfg.color }}>{sem === 'verde' ? '✓ Proyecto saludable' : sem === 'naranja' ? '⚠ Atención' : '✕ Acción urgente'}</div>
                            <div style={{ fontSize: 10, color: '#888', marginTop: 1 }}>{semCfg.label}</div>
                          </div>
                        </div>

                        <button onClick={ev => marcarVendido(p, ev)}
                          style={{ width: '100%', padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 900, background: 'rgba(34,197,94,0.10)', color: '#22C55E', border: '1px solid rgba(34,197,94,0.25)', cursor: 'pointer', marginBottom: 8 }}>
                          Marcar como Vendido ✓
                        </button>
                        <button onClick={() => router.push(`/proyectos/${p.id}`)}
                          style={{ width: '100%', padding: '11px', borderRadius: 12, fontSize: 12, fontWeight: 900, background: '#F26E1F', color: '#fff', border: 'none', cursor: 'pointer' }}>
                          Abrir proyecto completo →
                        </button>
                      </div>
                    </div>

                    {/* Ver más */}
                    <button onClick={() => toggle(p.id)}
                      style={{ width: '100%', padding: '10px', fontSize: 11, fontWeight: 900, textAlign: 'center', borderTop: '1px solid #F2F1ED', background: 'none', border: 'none', borderTop: '1px solid #F2F1ED', color: isExp ? '#CCC' : '#F26E1F', cursor: 'pointer', letterSpacing: '0.04em' } as React.CSSProperties}>
                      {isExp ? 'Ver menos ↑' : 'Ver más ↓'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* ── PIPELINE ── */}
        {pipeline.length > 0 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em', marginBottom: 20 }}>EN PIPELINE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28, marginBottom: 48 }}>
              {pipeline.map(p => (
                <div key={p.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', padding: 20, opacity: 0.75 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div onClick={() => router.push(`/proyectos/${p.id}`)} style={{ cursor: 'pointer', flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#111' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>📍 {p.ciudad || '—'}</div>
                    </div>
                    <button onClick={e => deleteProyecto(p, e)}
                      style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#EF4444', border: 'none', cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <select
                      value={p.estado}
                      disabled={saving[p.id]}
                      onClick={e => e.stopPropagation()}
                      onChange={e => { e.stopPropagation(); cambiarEstado(p.id, e.target.value) }}
                      style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, border: 'none', outline: 'none', cursor: 'pointer', background: `${ESTADO_COLOR[p.estado] || '#888'}18`, color: ESTADO_COLOR[p.estado] || '#888', WebkitAppearance: 'none', MozAppearance: 'none' } as React.CSSProperties}
                    >
                      {ESTADOS_TODOS.filter(e => e !== 'cerrado').map(e => (
                        <option key={e} value={e}>{ESTADO_LABEL[e]}</option>
                      ))}
                    </select>
                    {p.precio_compra && (
                      <span style={{ fontSize: 12, fontWeight: 900, color: '#111' }}>{fmt(p.precio_compra)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── PROYECTOS VENDIDOS ── */}
        {finalizados.length > 0 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#111', letterSpacing: '-0.01em', marginBottom: 20 }}>PROYECTOS VENDIDOS · {finalizados.length}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 28, marginBottom: 48 }}>
              {finalizados.map(p => {
                const inversion = getInv(p)
                const invH      = getInvHasu(p)
                const benef     = getBenefHasu(p)
                const roi       = invH > 0 ? (benef / invH) * 100 : null
                const isExp     = expanded.has(p.id)
                const ef        = editFinalizado[p.id]

                return (
                  <div key={p.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)', overflow: 'hidden', opacity: 0.85 }}>
                    <div style={{ padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div onClick={() => router.push(`/proyectos/${p.id}`)} style={{ cursor: 'pointer', flex: 1, minWidth: 0, marginRight: 8 }}>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#111' }}>{p.nombre}</div>
                          <div style={{ fontSize: 11, color: '#999', marginTop: 3 }}>📍 {p.ciudad || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          {roi !== null && (
                            <>
                              <div style={{ fontSize: 18, fontWeight: 900, color: roi >= 0 ? '#22C55E' : '#EF4444' }}>{roi >= 0 ? '+' : ''}{roi.toFixed(1)}%</div>
                              <div style={{ fontSize: 10, color: '#BBB', fontWeight: 700 }}>ROI real</div>
                            </>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 100, background: 'rgba(34,197,94,0.10)', color: '#22C55E' }}>Vendido</span>
                        {benef > 0 && <span style={{ fontSize: 11, fontWeight: 900, color: '#22C55E' }}>+{fmt(benef)}</span>}
                      </div>
                    </div>

                    {/* Expanded edit */}
                    <div style={{ maxHeight: isExp ? 280 : 0, overflow: 'hidden', transition: 'max-height 0.3s ease' }}>
                      <div style={{ padding: '14px 20px 20px', borderTop: '1px solid #F2F1ED' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, color: '#999' }}>Editar datos reales</div>
                          {!ef ? (
                            <button onClick={() => setEditFinalizado(e => ({ ...e, [p.id]: { venta: p.precio_venta_real ? String(p.precio_venta_real) : '', inv: p.valor_total_operacion ? String(p.valor_total_operacion) : '' } }))}
                              style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: 'rgba(242,110,31,0.1)', color: '#F26E1F', border: 'none', cursor: 'pointer' }}>Editar ✎</button>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button onClick={() => setEditFinalizado(e => { const n2 = { ...e }; delete n2[p.id]; return n2 })}
                                style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: '#F2F1ED', color: '#888', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                              <button onClick={() => guardarFinalizado(p.id)} disabled={saving[p.id + '_fin']}
                                style={{ fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 8, background: '#F26E1F', color: '#fff', border: 'none', cursor: 'pointer' }}>Guardar</button>
                            </div>
                          )}
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {[
                            { label: 'Precio venta real', key: 'venta' as const, val: p.precio_venta_real },
                            { label: 'Inversión total', key: 'inv' as const, val: p.valor_total_operacion },
                          ].map(f => (
                            <div key={f.key} style={{ borderRadius: 10, padding: '8px 10px', background: '#FAFAF8', border: '1px solid #ECEAE4' }}>
                              <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase' as const, color: '#BBB', marginBottom: 4 }}>{f.label}</div>
                              {ef ? (
                                <input type="number" value={ef[f.key]}
                                  onChange={e => setEditFinalizado(prev => ({ ...prev, [p.id]: { ...prev[p.id], [f.key]: e.target.value } }))}
                                  style={{ width: '100%', fontSize: 12, fontWeight: 900, border: '1px solid rgba(242,110,31,0.4)', borderRadius: 6, outline: 'none', background: '#fff', padding: '2px 4px' }}
                                />
                              ) : (
                                <div style={{ fontSize: 12, fontWeight: 900, color: '#111' }}>{f.val ? fmt(f.val) : '—'}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <button onClick={() => toggle(p.id)}
                      style={{ width: '100%', padding: '10px', fontSize: 11, fontWeight: 900, background: 'none', border: 'none', borderTop: '1px solid #F2F1ED', color: isExp ? '#CCC' : '#F26E1F', cursor: 'pointer' } as React.CSSProperties}>
                      {isExp ? 'Cerrar ↑' : 'Editar datos ✎'}
                    </button>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Empty state */}
        {!loading && activos.length === 0 && pipeline.length === 0 && finalizados.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#BBB' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏠</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>No hay proyectos todavía</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Usá el bot para crear el primero</div>
          </div>
        )}
      </div>
    </div>
  )
}
