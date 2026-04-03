'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type Proveedor = { id: string; nombre: string; rubro: string; contacto: string; email: string; telefono: string; cif: string }

const RUBRO_COLOR: Record<string,string> = {
  'obra': '#60A5FA', 'fontanería': '#34D399', 'electricidad': '#F59E0B',
  'materiales': '#A78BFA', 'pintura': '#F472B6', 'carpintería': '#FB923C',
}

export default function ProveedoresPage() {
  const router = useRouter()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', rubro: '', contacto: '', email: '', telefono: '', cif: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('proveedores').select('*').order('nombre').then(({ data }) => {
      setProveedores(data || [])
      setLoading(false)
    })
  }, [])

  const filtered = proveedores.filter(p =>
    p.nombre?.toLowerCase().includes(search.toLowerCase()) ||
    p.rubro?.toLowerCase().includes(search.toLowerCase())
  )

  const save = async () => {
    if (!form.nombre.trim()) return
    setSaving(true)
    const { data, error } = await supabase.from('proveedores').insert([form]).select().single()
    if (!error && data) setProveedores(p => [data, ...p])
    setShowForm(false)
    setForm({ nombre: '', rubro: '', contacto: '', email: '', telefono: '', cif: '' })
    setSaving(false)
  }

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-lg" style={{ background: '#1E1E1E' }}>‹</button>
        <div className="flex-1 font-bold text-[17px] text-white">Proveedores</div>
        <button onClick={() => setShowForm(true)} className="text-sm font-black px-3 py-1.5 rounded-xl text-white" style={{ background: '#F26E1F' }}>+ Nuevo</button>
      </div>

      <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre o rubro…"
        className="w-full rounded-xl px-4 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555] mb-4"
        style={{ background: '#141414', border: '1.5px solid rgba(255,255,255,0.08)' }}
        onFocus={e => e.target.style.borderColor = '#F26E1F'}
        onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-16 rounded-2xl animate-pulse" style={{ background: '#141414' }} />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">🔧</div>
          <div className="text-sm font-semibold" style={{ color: '#555' }}>Sin proveedores todavía</div>
          <button onClick={() => setShowForm(true)} className="mt-4 text-sm font-black px-4 py-2 rounded-xl text-white" style={{ background: '#F26E1F' }}>Agregar primero</button>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)' }}>
          {filtered.map((p, i) => (
            <div key={p.id} className="px-4 py-3.5 flex items-center gap-3"
              style={{ borderTop: i > 0 ? '1px solid rgba(255,255,255,0.08)' : undefined }}>
              <div className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-base flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                🔧
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white truncate">{p.nombre}</div>
                <div className="text-xs font-medium mt-0.5 flex items-center gap-2">
                  {p.rubro && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{ background: 'rgba(255,255,255,0.08)', color: RUBRO_COLOR[p.rubro?.toLowerCase()] || '#888' }}>
                      {p.rubro}
                    </span>
                  )}
                  {p.contacto && <span style={{ color: '#555' }}>{p.contacto}</span>}
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                {p.telefono && <a href={`tel:${p.telefono}`} className="text-xs font-mono" style={{ color: '#F26E1F' }}>{p.telefono}</a>}
                {p.email && <div className="text-[10px] font-mono mt-0.5 truncate max-w-[120px]" style={{ color: '#555' }}>{p.email}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">Nuevo proveedor</div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background: '#282828', color: '#888' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              {[
                { label: 'Nombre *', field: 'nombre', placeholder: 'Ej. Fontanería García' },
                { label: 'Rubro', field: 'rubro', placeholder: 'Ej. fontanería, obra, pintura' },
                { label: 'Contacto', field: 'contacto', placeholder: 'Nombre de contacto' },
                { label: 'Teléfono', field: 'telefono', placeholder: '+34 600 000 000' },
                { label: 'Email', field: 'email', placeholder: 'proveedor@email.com' },
                { label: 'CIF', field: 'cif', placeholder: 'B12345678' },
              ].map(f => (
                <div key={f.field}>
                  <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>{f.label}</label>
                  <input type="text" value={(form as any)[f.field]} placeholder={f.placeholder}
                    onChange={e => setForm(prev => ({ ...prev, [f.field]: e.target.value }))}
                    className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium placeholder:text-[#555]"
                    style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)' }} />
                </div>
              ))}
            </div>
            <button onClick={save} disabled={saving || !form.nombre.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background: '#F26E1F' }}>
              {saving ? 'Guardando...' : 'Guardar proveedor'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
