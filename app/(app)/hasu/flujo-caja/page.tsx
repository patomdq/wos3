'use client'
import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt  = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)
const fmtS = (n: number) => (n >= 0 ? '+' : '') + fmt(n)

const CATS_CAPITAL = ['Transferencia', 'Aportación']

type Movimiento = {
  id: string; concepto: string; monto: number; fecha: string
  tipo: string; categoria: string; proyecto_id: string | null; cuenta: string | null
  proyectos?: { nombre: string; porcentaje_hasu: number }
}

const CATEGORIAS = ['Materiales','Mano de obra','Honorarios','Impuestos','Venta','Arras','Compra','Reforma','Transferencia','Aportación','Suministros','Servicios','Gestoría','Otros']
const emptyForm = () => ({ concepto:'', monto:'', fecha: new Date().toISOString().split('T')[0], tipo:'Gasto', categoria:'Otros', proyecto_id:'', cuenta:'' })

export default function FlujoCajaPage() {
  const router = useRouter()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [proyectos,   setProyectos]   = useState<{id:string;nombre:string}[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filtroCuenta, setFiltroCuenta] = useState('CaixaBank HASU')

  const [showForm,  setShowForm]  = useState(false)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [form,      setForm]      = useState(emptyForm())
  const [saving,    setSaving]    = useState(false)

  const loadMovimientos = async () => {
    const { data } = await supabase
      .from('movimientos')
      .select('*, proyectos(nombre, porcentaje_hasu)')
      .order('fecha', { ascending: false })
      .limit(500)
    setMovimientos(data || [])
  }

  useEffect(() => {
    Promise.all([
      supabase.from('movimientos').select('*, proyectos(nombre, porcentaje_hasu)').order('fecha', { ascending: false }).limit(500),
      supabase.from('proyectos').select('id,nombre').order('nombre'),
    ]).then(([{ data: movs }, { data: projs }]) => {
      setMovimientos(movs || [])
      setProyectos(projs || [])
      setLoading(false)
    })
  }, [])

  // Cuentas disponibles (orden: HASU primero, resto alfabético)
  const cuentas = useMemo(() => {
    const set = new Set<string>()
    movimientos.forEach(m => { if (m.cuenta) set.add(m.cuenta) })
    const arr = Array.from(set).sort((a, b) => {
      if (a === 'CaixaBank HASU') return -1
      if (b === 'CaixaBank HASU') return 1
      return a.localeCompare(b)
    })
    return arr
  }, [movimientos])

  // Movimientos de la cuenta seleccionada
  const filtered = useMemo(() =>
    movimientos.filter(m => filtroCuenta === 'todas' ? true : m.cuenta === filtroCuenta)
  , [movimientos, filtroCuenta])

  // ── Totales ────────────────────────────────────────────────────
  // Agrupa por proyecto para aplicar porcentaje_hasu al beneficio.
  // Ingresos/Gastos "HASU" = ingresos_op/gastos × pct (proporcional al beneficio)
  // Capital (Transferencia/Aportación) excluido de ingresos operativos
  const totals = useMemo(() => {
    const byProject: Record<string, { ingresos: number; gastos: number; pct: number }> = {}

    filtered.forEach(m => {
      const pid = m.proyecto_id || '__hasu__'
      const pct = (m.proyectos as any)?.porcentaje_hasu ?? 100
      if (!byProject[pid]) byProject[pid] = { ingresos: 0, gastos: 0, pct }
      if (m.monto > 0 && !CATS_CAPITAL.includes(m.categoria)) {
        byProject[pid].ingresos += m.monto
      } else if (m.monto < 0) {
        byProject[pid].gastos += Math.abs(m.monto)
      }
    })

    let ingresos = 0, gastos = 0, ingresosHasu = 0, gastosHasu = 0
    Object.values(byProject).forEach(({ ingresos: ing, gastos: gas, pct }) => {
      const p = pct / 100
      ingresos     += ing
      gastos       += gas
      ingresosHasu += ing * p
      gastosHasu   += gas * p
    })
    return { ingresos, gastos, balance: ingresos - gastos, ingresosHasu, gastosHasu, balanceHasu: ingresosHasu - gastosHasu }
  }, [filtered])

  // Porcentaje y proyecto de la cuenta seleccionada (para label)
  const cuentaInfo = useMemo(() => {
    if (filtroCuenta === 'todas') return null
    const m = filtered.find(m => m.proyectos?.porcentaje_hasu != null)
    const pct  = (m?.proyectos as any)?.porcentaje_hasu ?? 100
    const proj = (m?.proyectos as any)?.nombre ?? null
    return { pct, proj, esJV: pct < 100 }
  }, [filtroCuenta, filtered])

  const isHasu = filtroCuenta === 'CaixaBank HASU'

  const openEdit = (m: Movimiento) => {
    setForm({ concepto: m.concepto, monto: Math.abs(m.monto).toString(), fecha: m.fecha,
      tipo: m.tipo || (m.monto > 0 ? 'Ingreso' : 'Gasto'), categoria: m.categoria,
      proyecto_id: m.proyecto_id || '', cuenta: m.cuenta || '' })
    setEditingId(m.id)
    setShowForm(true)
  }

  const saveForm = async () => {
    if (!form.concepto.trim() || !form.monto) return
    setSaving(true)
    const montoNum = parseFloat(form.monto) || 0
    const monto = form.tipo === 'Gasto' ? -Math.abs(montoNum) : Math.abs(montoNum)
    const payload = { concepto: form.concepto, monto, fecha: form.fecha, tipo: form.tipo,
      categoria: form.categoria, proyecto_id: form.proyecto_id || null, cuenta: form.cuenta || null }
    if (editingId) await supabase.from('movimientos').update(payload).eq('id', editingId)
    else           await supabase.from('movimientos').insert([payload])
    await loadMovimientos()
    setShowForm(false); setEditingId(null); setForm(emptyForm()); setSaving(false)
  }

  const deleteMov = async (m: Movimiento) => {
    if (!confirm(`¿Eliminar "${m.concepto}"?`)) return
    await supabase.from('movimientos').delete().eq('id', m.id)
    setMovimientos(prev => prev.filter(x => x.id !== m.id))
  }

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg"
          style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1">
          <div className="font-bold text-[17px] text-white">Flujo de caja</div>
          {cuentaInfo?.esJV && (
            <div className="text-xs font-semibold mt-0.5" style={{ color: '#F26E1F' }}>
              {cuentaInfo.proj} · JV {cuentaInfo.pct}% HASU
            </div>
          )}
        </div>
        <button onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true) }}
          className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
          style={{ background: '#F26E1F' }}>+ Mov.</button>
      </div>

      {/* Filtro cuenta */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {loading ? (
          <div className="h-9 w-40 rounded-xl animate-pulse" style={{ background: '#141414' }} />
        ) : (
          ['todas', ...cuentas].map(c => (
            <button key={c} onClick={() => setFiltroCuenta(c)}
              className="flex-shrink-0 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
              style={{
                background: filtroCuenta === c ? '#F26E1F' : '#141414',
                color: filtroCuenta === c ? '#fff' : '#888',
                border: `1px solid ${filtroCuenta === c ? '#F26E1F' : 'rgba(255,255,255,0.08)'}`,
              }}>
              {c === 'todas' ? 'Todas' : c}
            </button>
          ))
        )}
      </div>

      {/* KPIs — 6 tarjetas: Total | HASU */}
      {loading ? (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : (
        <>
          {/* Cabeceras columnas */}
          <div className="grid grid-cols-2 gap-2 mb-1 px-1">
            <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-center" style={{ color: '#555' }}>
              Total operativo
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[1.5px] text-center" style={{ color: isHasu ? '#555' : '#F26E1F' }}>
              {isHasu ? 'HASU 100%' : `HASU ${cuentaInfo?.pct ?? '—'}%`}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            {/* Ingresos */}
            <div className="rounded-xl p-3.5" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Ingresos</div>
              <div className="font-black text-[16px]" style={{ color: '#22C55E' }}>{fmt(totals.ingresos)}</div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>excl. capital inversores</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: '#141414', border: `1px solid ${isHasu ? 'rgba(255,255,255,0.08)' : 'rgba(242,110,31,0.2)'}` }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Ingresos HASU</div>
              <div className="font-black text-[16px]" style={{ color: '#22C55E' }}>{fmt(totals.ingresosHasu)}</div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>
                {isHasu ? '100%' : `× ${cuentaInfo?.pct}%`}
              </div>
            </div>

            {/* Gastos */}
            <div className="rounded-xl p-3.5" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Gastos</div>
              <div className="font-black text-[16px]" style={{ color: '#EF4444' }}>{fmt(totals.gastos)}</div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>totales</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: '#141414', border: `1px solid ${isHasu ? 'rgba(255,255,255,0.08)' : 'rgba(242,110,31,0.2)'}` }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Gastos HASU</div>
              <div className="font-black text-[16px]" style={{ color: '#EF4444' }}>{fmt(totals.gastosHasu)}</div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>
                {isHasu ? '100%' : `× ${cuentaInfo?.pct}%`}
              </div>
            </div>

            {/* Balance */}
            <div className="rounded-xl p-3.5" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>Balance total</div>
              <div className="font-black text-[16px]" style={{ color: totals.balance >= 0 ? '#22C55E' : '#EF4444' }}>
                {fmtS(totals.balance)}
              </div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>beneficio JV</div>
            </div>
            <div className="rounded-xl p-3.5" style={{ background: isHasu ? '#141414' : '#1a1000', border: `1px solid ${isHasu ? 'rgba(255,255,255,0.08)' : 'rgba(242,110,31,0.35)'}` }}>
              <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: isHasu ? '#888' : '#F26E1F' }}>Balance HASU</div>
              <div className="font-black text-[16px]" style={{ color: totals.balanceHasu >= 0 ? (isHasu ? '#22C55E' : '#F26E1F') : '#EF4444' }}>
                {fmtS(totals.balanceHasu)}
              </div>
              <div className="text-[9px] mt-0.5 font-medium" style={{ color: '#555' }}>
                {isHasu ? '100%' : `benef. × ${cuentaInfo?.pct}%`}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Lista movimientos */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin movimientos</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          {filtered.map((m, i) => {
            const esCapital = CATS_CAPITAL.includes(m.categoria)
            const pct = (m.proyectos as any)?.porcentaje_hasu ?? 100
            return (
              <div key={m.id} className="px-4 py-3 flex items-center gap-3"
                style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: esCapital ? 'rgba(96,165,250,0.12)' : m.monto > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}>
                  {esCapital ? '⇄' : m.monto > 0 ? '↗' : '↙'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{m.concepto}</div>
                  <div className="text-xs font-medium mt-0.5 flex flex-wrap gap-x-2" style={{ color: '#555' }}>
                    <span>{m.fecha}</span>
                    {(m as any).proyectos?.nombre && <span>· {(m as any).proyectos.nombre}</span>}
                    {m.categoria && <span>· {m.categoria}</span>}
                    {esCapital && <span style={{ color: '#60A5FA' }}>· capital</span>}
                    {!esCapital && pct < 100 && <span style={{ color: '#F26E1F' }}>· JV {pct}%</span>}
                  </div>
                </div>
                <div className="font-black text-sm flex-shrink-0"
                  style={{ color: esCapital ? '#60A5FA' : m.monto > 0 ? '#22C55E' : '#EF4444' }}>
                  {m.monto > 0 ? '+' : ''}{fmt(m.monto)}
                </div>
                <button onClick={() => openEdit(m)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.08)', color: '#fff' }}>✎</button>
                <button onClick={() => deleteMov(m)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                  style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-8"
            style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="font-black text-[17px] text-white mb-5">{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Concepto *</label>
                <input type="text" value={form.concepto} onChange={e => setForm(f=>({...f,concepto:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                    <option>Gasto</option><option>Ingreso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Monto (€) *</label>
                  <input type="number" step="0.01" value={form.monto} onChange={e => setForm(f=>({...f,monto:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f=>({...f,categoria:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Proyecto</label>
                  <select value={form.proyecto_id} onChange={e => setForm(f=>({...f,proyecto_id:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                    <option value="">Sin proyecto</option>
                    {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>Cuenta</label>
                  <input type="text" value={form.cuenta} onChange={e => setForm(f=>({...f,cuenta:e.target.value}))}
                    placeholder="CaixaBank HASU" list="cuentas-list"
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                  <datalist id="cuentas-list">
                    {cuentas.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-black"
                style={{ background: '#282828', color: '#888' }}>Cancelar</button>
              <button onClick={saveForm} disabled={saving || !form.concepto.trim() || !form.monto}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{ background: '#F26E1F' }}>
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
