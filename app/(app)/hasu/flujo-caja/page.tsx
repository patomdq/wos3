'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const fmt = (n: number) => new Intl.NumberFormat('es-ES',{style:'currency',currency:'EUR',maximumFractionDigits:0}).format(n)

type Movimiento = { id: string; concepto: string; monto: number; fecha: string; tipo: string; categoria: string; proyecto_id: string; proyectos?: { nombre: string } }

const CATEGORIAS = ['Materiales','Mano de obra','Honorarios','Impuestos','Venta','Arras','Compra','Reforma','Otros']
const emptyForm = (proyectoId = '') => ({ concepto:'', monto:'', fecha: new Date().toISOString().split('T')[0], tipo:'Gasto', categoria:'Otros', proyecto_id: proyectoId })

export default function FlujoCajaPage() {
  const router = useRouter()
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [proyectos, setProyectos] = useState<{id:string;nombre:string}[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProyecto, setFiltroProyecto] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')

  // Edit/delete
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  const loadMovimientos = async () => {
    const { data } = await supabase.from('movimientos').select('*, proyectos(nombre)').order('fecha', { ascending: false }).limit(200)
    setMovimientos(data || [])
  }

  useEffect(() => {
    Promise.all([
      supabase.from('movimientos').select('*, proyectos(nombre)').order('fecha', { ascending: false }).limit(200),
      supabase.from('proyectos').select('id,nombre').order('nombre')
    ]).then(([{ data: movs }, { data: projs }]) => {
      setMovimientos(movs || [])
      setProyectos(projs || [])
      setLoading(false)
    })
  }, [])

  const filtered = movimientos.filter(m => {
    if (filtroProyecto !== 'todos' && m.proyecto_id !== filtroProyecto) return false
    if (filtroTipo !== 'todos' && m.tipo !== filtroTipo) return false
    return true
  })

  const totalIngresos = filtered.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0)
  const totalGastos = filtered.filter(m => m.monto < 0).reduce((s, m) => s + Math.abs(m.monto), 0)
  const balance = totalIngresos - totalGastos

  const openEdit = (m: Movimiento) => {
    setForm({
      concepto: m.concepto,
      monto: Math.abs(m.monto).toString(),
      fecha: m.fecha,
      tipo: m.tipo || (m.monto > 0 ? 'Ingreso' : 'Gasto'),
      categoria: m.categoria,
      proyecto_id: m.proyecto_id,
    })
    setEditingId(m.id)
    setShowForm(true)
  }

  const saveForm = async () => {
    if (!form.concepto.trim() || !form.monto) return
    setSaving(true)
    const montoNum = parseFloat(form.monto) || 0
    const monto = form.tipo === 'Gasto' ? -Math.abs(montoNum) : Math.abs(montoNum)
    const payload = {
      concepto: form.concepto,
      monto,
      fecha: form.fecha,
      tipo: form.tipo,
      categoria: form.categoria,
      proyecto_id: form.proyecto_id || null,
    }
    if (editingId) {
      await supabase.from('movimientos').update(payload).eq('id', editingId)
    } else {
      await supabase.from('movimientos').insert([payload])
    }
    await loadMovimientos()
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm())
    setSaving(false)
  }

  const deleteMov = async (m: Movimiento) => {
    if (!confirm(`¿Eliminar "${m.concepto}"?`)) return
    await supabase.from('movimientos').delete().eq('id', m.id)
    setMovimientos(prev => prev.filter(x => x.id !== m.id))
  }

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  return (
    <div className="p-4" style={{ background:'#0A0A0A', minHeight:'100vh' }}>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg" style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1 font-bold text-[17px] text-white">Flujo de caja</div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Ingresos', value: fmt(totalIngresos), color: '#22C55E' },
          { label: 'Gastos', value: fmt(totalGastos), color: '#EF4444' },
          { label: 'Balance', value: fmt(balance), color: balance >= 0 ? '#22C55E' : '#EF4444' },
        ].map(k => (
          <div key={k.label} className="rounded-xl p-3" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: '#888' }}>{k.label}</div>
            <div className="font-black text-[14px] leading-none" style={{ color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto -mx-4 px-4">
        <select value={filtroProyecto} onChange={e => setFiltroProyecto(e.target.value)}
          className="text-sm font-bold rounded-xl px-3 py-2 outline-none flex-shrink-0"
          style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>
          <option value="todos">Todos los proyectos</option>
          {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {['todos','Ingreso','Gasto'].map(t => (
          <button key={t} onClick={() => setFiltroTipo(t)}
            className="flex-shrink-0 px-3 py-2 rounded-xl text-sm font-bold whitespace-nowrap"
            style={{ background: filtroTipo === t ? '#F26E1F' : '#141414', color: filtroTipo === t ? '#fff' : '#888', border: '1px solid rgba(255,255,255,0.08)' }}>
            {t === 'todos' ? 'Todo' : t + 's'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-xl animate-pulse" style={{ background: '#141414' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm" style={{ color: '#555' }}>Sin movimientos</div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          {filtered.map((m, i) => (
            <div key={m.id} className="px-4 py-3 flex items-center gap-3"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: m.monto > 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}>
                {m.monto > 0 ? '↗' : '↙'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">{m.concepto}</div>
                <div className="text-xs font-medium mt-0.5 flex gap-2" style={{ color: '#555' }}>
                  <span>{m.fecha}</span>
                  {(m as any).proyectos?.nombre && <span>· {(m as any).proyectos.nombre}</span>}
                  {m.categoria && <span>· {m.categoria}</span>}
                </div>
              </div>
              <div className="font-black text-sm flex-shrink-0" style={{ color: m.monto > 0 ? '#22C55E' : '#EF4444' }}>
                {m.monto > 0 ? '+' : ''}{fmt(m.monto)}
              </div>
              <button onClick={() => openEdit(m)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.08)', color:'#fff' }}>✎</button>
              <button onClick={() => deleteMov(m)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Edit/Add form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.7)' }} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-8"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="font-black text-[17px] text-white mb-5">{editingId ? 'Editar movimiento' : 'Nuevo movimiento'}</div>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Concepto *</label>
                <input type="text" value={form.concepto} onChange={e => setForm(f=>({...f,concepto:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Tipo</label>
                  <select value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                    <option>Gasto</option><option>Ingreso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Monto (€) *</label>
                  <input type="number" step="0.01" value={form.monto} onChange={e => setForm(f=>({...f,monto:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Categoría</label>
                  <select value={form.categoria} onChange={e => setForm(f=>({...f,categoria:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                    {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Proyecto</label>
                <select value={form.proyecto_id} onChange={e => setForm(f=>({...f,proyecto_id:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP}>
                  <option value="">Sin proyecto</option>
                  {proyectos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-black"
                style={{ background:'#282828', color:'#888' }}>Cancelar</button>
              <button onClick={saveForm} disabled={saving || !form.concepto.trim() || !form.monto}
                className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-40"
                style={{ background:'#F26E1F' }}>
                {saving ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
