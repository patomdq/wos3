'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Proveedor = { id: string; nombre: string; rubro: string; contacto?: string; email?: string; telefono?: string; cif?: string }

const emptyForm = () => ({ nombre:'', rubro:'', contacto:'', email:'', telefono:'', cif:'' })

export default function ProveedoresPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('proveedores').select('*').order('nombre').then(({ data }) => {
      setProveedores(data || [])
      setLoading(false)
    })
  }, [])

  const openAdd = () => {
    setForm(emptyForm())
    setEditingId(null)
    setShowForm(true)
  }

  const openEdit = (p: Proveedor) => {
    setForm({ nombre: p.nombre, rubro: p.rubro || '', contacto: p.contacto || '', email: p.email || '', telefono: p.telefono || '', cif: p.cif || '' })
    setEditingId(p.id)
    setShowForm(true)
  }

  const save = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    const payload = {
      nombre: form.nombre, rubro: form.rubro, contacto: form.contacto || null,
      email: form.email || null, telefono: form.telefono || null, cif: form.cif || null,
    }
    if (editingId) {
      const { data } = await supabase.from('proveedores').update(payload).eq('id', editingId).select().single()
      if (data) setProveedores(prev => prev.map(p => p.id === editingId ? data : p))
    } else {
      const { data } = await supabase.from('proveedores').insert([payload]).select().single()
      if (data) setProveedores(prev => [...prev, data])
    }
    setShowForm(false)
    setForm(emptyForm())
    setEditingId(null)
    setSaving(false)
  }

  const deleteProveedor = async (p: Proveedor) => {
    if (!confirm(`¿Eliminar a ${p.nombre}?`)) return
    const { error } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (!error) setProveedores(prev => prev.filter(x => x.id !== p.id))
  }

  const INP = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)', color: '#fff' } as const

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()}
          className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-base text-white"
          style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)' }}>←</button>
        <div className="flex-1 font-bold text-[17px] text-white">Proveedores</div>
        <button onClick={openAdd}
          className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
          style={{ background: '#F26E1F' }}>+ Agregar</button>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background:'#141414' }} />)}</div>
      ) : proveedores.length === 0 ? (
        <div className="text-center py-12" style={{ color:'#555' }}>
          <div className="text-4xl mb-3">🔧</div>
          <div className="text-sm font-semibold">No hay proveedores todavía</div>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.08)' }}>
          {proveedores.map((p, i) => (
            <div key={p.id} className="px-4 py-3.5 flex gap-3 items-center"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.07)' : undefined }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center text-lg flex-shrink-0" style={{ background:'rgba(242,110,31,0.18)' }}>🔧</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{p.nombre}</div>
                <div className="text-xs font-medium mt-0.5 truncate" style={{ color:'#888' }}>{p.rubro}{p.contacto ? ` · ${p.contacto}` : ''}</div>
              </div>
              {p.telefono && <a href={`tel:${p.telefono}`} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background:'rgba(34,197,94,0.12)', color:'#22C55E', flexShrink:0 }}>📞</a>}
              {p.email && <a href={`mailto:${p.email}`} className="text-xs font-bold px-2.5 py-1.5 rounded-lg" style={{ background:'rgba(96,165,250,0.12)', color:'#60A5FA', flexShrink:0 }}>✉</a>}
              <button onClick={() => openEdit(p)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background:'rgba(255,255,255,0.08)', color:'#fff' }}>✎</button>
              <button onClick={() => deleteProveedor(p)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-sm flex-shrink-0"
                style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-40" style={{ background:'rgba(0,0,0,0.7)' }} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-8"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.08)', maxWidth:480, margin:'0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="font-black text-[17px] text-white mb-5">{editingId ? 'Editar proveedor' : 'Nuevo proveedor'}</div>

            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Nombre *</label>
                <input type="text" value={form.nombre} onChange={e => setForm(f=>({...f,nombre:e.target.value}))}
                  placeholder="Ej. Electricidad García SL"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Rubro</label>
                <input type="text" value={form.rubro} onChange={e => setForm(f=>({...f,rubro:e.target.value}))}
                  placeholder="Ej. Electricidad"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Contacto</label>
                <input type="text" value={form.contacto} onChange={e => setForm(f=>({...f,contacto:e.target.value}))}
                  placeholder="Nombre del contacto"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Teléfono</label>
                  <input type="text" value={form.telefono} onChange={e => setForm(f=>({...f,telefono:e.target.value}))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>CIF</label>
                <input type="text" value={form.cif} onChange={e => setForm(f=>({...f,cif:e.target.value}))}
                  placeholder="B12345678"
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium" style={INP} />
              </div>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)}
                className="flex-1 py-3.5 rounded-xl text-sm font-black"
                style={{ background:'#282828', color:'#888' }}>Cancelar</button>
              <button onClick={save} disabled={saving || !form.nombre.trim()}
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
