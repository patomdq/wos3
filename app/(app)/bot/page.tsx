'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type ToolData = { id: string; result: string; table?: string; recordId?: string; label?: string }
type Msg = { role: 'bot' | 'user'; text: string; time: string; toolData?: ToolData[] }

const QUICK = ['📄 Factura', '💰 Saldo HASU', '🔨 Estado obra', '📋 Liquidación', '📅 Tareas pendientes']

function now() {
  const d = new Date()
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
}

const WELCOME: Msg = { role: 'bot', text: 'Hola 👋 ¿En qué puedo ayudarte hoy?', time: '—' }

type EditState = { recordId: string; table: string; label: string; concepto: string; monto: string }

export default function BotPage() {
  const searchParams = useSearchParams()
  const proyectoId = searchParams.get('proyecto_id')

  const [msgs, setMsgs] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [historial, setHistorial] = useState<{role:string;content:string}[]>([])
  const [userId, setUserId] = useState<string>('')
  const [editState, setEditState] = useState<EditState | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [proyectoNombre, setProyectoNombre] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const contextRef = useRef('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || 'anon'
      setUserId(uid)

      const stored = localStorage.getItem(`wos3_chat_${uid}${proyectoId ? '_' + proyectoId : ''}`)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMsgs(parsed)
            const hist = parsed.map((m: Msg) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text.replace(/<[^>]+>/g, '') }))
            setHistorial(hist)
          }
        } catch {}
      }

      let ctx = ''

      if (proyectoId) {
        // Contexto específico del proyecto — mínimo de tokens
        const [{ data: proy }, { data: partidas }, { data: movs }, { data: tareas }] = await Promise.all([
          supabase.from('proyectos').select('id,nombre,estado,ciudad,precio_compra,avance_reforma').eq('id', proyectoId).single(),
          supabase.from('partidas_reforma').select('id,nombre,estado,presupuesto,ejecutado,fecha_inicio,fecha_fin_estimada').eq('proyecto_id', proyectoId).order('orden'),
          supabase.from('movimientos').select('id,concepto,monto,fecha').eq('proyecto_id', proyectoId).order('fecha', { ascending: false }).limit(8),
          supabase.from('tareas').select('id,titulo,prioridad,estado').eq('proyecto_id', proyectoId).eq('estado', 'Pendiente').limit(5),
        ])
        if (proy) setProyectoNombre(proy.nombre)
        ctx = [
          proy ? `Proyecto: ${proy.nombre} | ID: ${proy.id} | Estado: ${proy.estado} | Ciudad: ${proy.ciudad} | Compra: ${proy.precio_compra ?? '-'}€ | Avance: ${proy.avance_reforma ?? 0}%` : '',
          partidas?.length ? `Partidas (ID|Nombre|Estado|Presup|Ejecutado|Inicio|FinEst):\n${partidas.map(p => `- ${p.id}|${p.nombre}|${p.estado}|${p.presupuesto}€|${p.ejecutado}€|${p.fecha_inicio??'-'}|${p.fecha_fin_estimada??'-'}`).join('\n')}` : '',
          movs?.length ? `Movimientos (ID|Concepto|Monto|Fecha):\n${movs.map(m => `- ${m.id}|${m.concepto}|${m.monto}€|${m.fecha}`).join('\n')}` : '',
          tareas?.length ? `Tareas pendientes (ID|Título|Prioridad):\n${tareas.map(t => `- ${t.id}|${t.titulo}|${t.prioridad}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
      } else {
        // Contexto global
        const [{ count: activos }, { data: movs }, { data: tareas }, { data: proyectos }, { data: partidas }] = await Promise.all([
          supabase.from('proyectos').select('id', { count: 'exact' }).in('estado', ['comprado','reforma','venta']),
          supabase.from('movimientos').select('id,concepto,monto,fecha').order('fecha', { ascending: false }).limit(10),
          supabase.from('tareas').select('id,titulo,prioridad,estado').eq('estado', 'Pendiente').limit(5),
          supabase.from('proyectos').select('id,nombre,estado,ciudad').order('created_at'),
          supabase.from('partidas_reforma').select('id,nombre,presupuesto,estado').order('created_at', { ascending: false }).limit(10),
        ])
        ctx = [
          `Proyectos activos: ${activos ?? 0}`,
          proyectos?.length ? `Proyectos (ID|Nombre|Estado|Ciudad):\n${proyectos.map(p => `- ${p.id}|${p.nombre}|${p.estado}|${p.ciudad}`).join('\n')}` : '',
          movs?.length ? `Últimos movimientos (ID|Concepto|Monto|Fecha):\n${movs.map(m => `- ${m.id}|${m.concepto}|${m.monto}€|${m.fecha}`).join('\n')}` : '',
          tareas?.length ? `Tareas pendientes (ID|Título|Prioridad):\n${tareas.map(t => `- ${t.id}|${t.titulo}|${t.prioridad}`).join('\n')}` : '',
          partidas?.length ? `Partidas recientes (ID|Nombre|Presup|Estado):\n${partidas.map(p => `- ${p.id}|${p.nombre}|${p.presupuesto}€|${p.estado}`).join('\n')}` : '',
        ].filter(Boolean).join('\n')
      }

      contextRef.current = ctx
    }
    init()
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  useEffect(() => {
    if (userId && msgs.length > 1) {
      localStorage.setItem(`wos3_chat_${userId}${proyectoId ? '_' + proyectoId : ''}`, JSON.stringify(msgs))
    }
  }, [msgs, userId])

  const send = async (text: string) => {
    if (!text.trim()) return
    const t = now()
    const userMsg: Msg = { role: 'user', text, time: t }
    setMsgs(m => [...m, userMsg])
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setTyping(true)

    const newHistorial = [...historial, { role: 'user', content: text }]
    setHistorial(newHistorial)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistorial, context: contextRef.current })
      })
      const { text: resp, toolResults } = await res.json()
      setTyping(false)

      const html = resp.replace(/\n\n/g, '<br><br>').replace(/\n/g, '<br>')
      const botMsg: Msg = { role: 'bot', text: html, time: now(), toolData: toolResults?.length ? toolResults : undefined }
      setMsgs(m => [...m, botMsg])
      setHistorial(h => [...h, { role: 'assistant', content: resp }])
    } catch {
      setTyping(false)
      setMsgs(m => [...m, { role: 'bot', text: 'Error de conexión. Intentá de nuevo.', time: now() }])
    }
  }

  const clearChat = () => {
    setMsgs([WELCOME])
    setHistorial([])
    if (userId) localStorage.removeItem(`wos3_chat_${userId}`)
  }

  const deleteRecord = async (msgIdx: number, td: ToolData) => {
    if (!td.table || !td.recordId) return
    if (!confirm(`¿Eliminar "${td.label}"?`)) return
    const { error } = await supabase.from(td.table).delete().eq('id', td.recordId)
    if (!error) {
      setMsgs(prev => prev.map((m, i) => {
        if (i !== msgIdx) return m
        return { ...m, toolData: m.toolData?.filter(t => t.id !== td.id) }
      }))
    }
  }

  const openEdit = (td: ToolData) => {
    if (!td.table || !td.recordId) return
    const parts = (td.label || '').split(' · ')
    setEditState({
      recordId: td.recordId,
      table: td.table,
      label: td.label || '',
      concepto: parts[0] || '',
      monto: parts[1]?.replace('€','') || '',
    })
  }

  const saveEdit = async () => {
    if (!editState) return
    setEditSaving(true)
    const { table, recordId, concepto, monto } = editState
    let payload: Record<string,any> = {}
    if (table === 'movimientos') {
      const n = parseFloat(monto) || 0
      payload = { concepto, monto: n }
    } else if (table === 'partidas_reforma') {
      payload = { nombre: concepto, presupuesto: parseFloat(monto) || 0 }
    } else if (table === 'tareas') {
      payload = { titulo: concepto }
    }
    await supabase.from(table).update(payload).eq('id', recordId)
    setEditSaving(false)
    setEditState(null)
    // Update label in msgs
    const newLabel = `${concepto} · ${monto}€`
    setMsgs(prev => prev.map(m => ({
      ...m,
      toolData: m.toolData?.map(td => td.recordId === recordId ? { ...td, label: newLabel } : td)
    })))
  }

  const tableIcon = (table?: string) => {
    if (table === 'movimientos') return '💰'
    if (table === 'partidas_reforma') return '🔨'
    if (table === 'tareas') return '📋'
    return '✓'
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 70px)' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 h-[54px] flex-shrink-0" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white tracking-[-0.3px]">
          {proyectoNombre ? proyectoNombre : 'Bot'}
          {proyectoNombre && <span className="ml-2 text-xs font-medium opacity-40">Bot</span>}
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: '#22C55E' }} title="Conectado a Claude" />
          <button onClick={clearChat} className="text-xs font-bold px-2.5 py-1 rounded-lg" style={{ color: '#555', background: '#1E1E1E' }}>Limpiar</button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-xs font-black"
              style={{ background: m.role === 'bot' ? '#F26E1F' : '#282828', color: '#fff', border: m.role === 'user' ? '1px solid rgba(255,255,255,0.14)' : 'none' }}>
              {m.role === 'bot' ? 'W' : 'P'}
            </div>
            <div className="max-w-[calc(100vw-100px)] md:max-w-md">
              <div className="text-sm font-medium leading-relaxed px-3.5 py-2.5 rounded-2xl"
                style={{
                  background: m.role === 'bot' ? '#1E1E1E' : '#F26E1F',
                  border: m.role === 'bot' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  color: '#fff',
                  borderRadius: m.role === 'bot' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                }}
                dangerouslySetInnerHTML={{ __html: m.text }} />

              {/* Tool results with edit/delete */}
              {m.toolData?.map((td, ti) => (
                <div key={ti} className="mt-1.5 px-3 py-2 rounded-xl" style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)' }}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-sm">{tableIcon(td.table)}</span>
                      <span className="text-xs font-bold truncate" style={{ color: '#22C55E' }}>
                        {td.label || '✓ Guardado'}
                      </span>
                    </div>
                    {td.table && td.table !== 'tareas' && (
                      <div className="flex gap-1.5 flex-shrink-0">
                        <button onClick={() => openEdit(td)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(255,255,255,0.08)', color: '#ccc' }}
                          title="Editar">✎</button>
                        <button onClick={() => deleteRecord(i, td)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444' }}
                          title="Eliminar">✕</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              <div className="text-[10px] mt-1 font-semibold tracking-wide" style={{ color: '#555' }}>{m.time}</div>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-black" style={{ background: '#F26E1F' }}>W</div>
            <div className="px-3.5 py-3 rounded-2xl" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '4px 14px 14px 14px' }}>
              <div className="flex gap-1.5 items-center">
                {[0,1,2].map(i => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full"
                    style={{ background: '#555', animation: `bounce 0.9s ${i * 0.2}s infinite`, display: 'inline-block' }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick replies */}
      <div className="flex gap-2 px-3.5 py-2.5 overflow-x-auto flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#141414' }}>
        {QUICK.map(q => (
          <button key={q} onClick={() => send(q.replace(/^[^\s]+ /, ''))}
            className="flex-shrink-0 text-xs font-bold px-3.5 py-2 rounded-full whitespace-nowrap"
            style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-3.5 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#141414' }}>
        <textarea ref={taRef} value={input}
          onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px' }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Escribí un mensaje…" rows={1}
          className="flex-1 rounded-xl px-3.5 py-3 text-sm text-white outline-none resize-none font-medium placeholder:text-[#555]"
          style={{ background: '#1E1E1E', border: '1.5px solid rgba(255,255,255,0.08)', maxHeight: 80, lineHeight: 1.4 }}
          onFocus={e => e.target.style.borderColor = '#F26E1F'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'} />
        <button onClick={() => send(input)}
          className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg text-white flex-shrink-0"
          style={{ background: '#F26E1F' }}>↑</button>
      </div>

      {/* Edit sheet */}
      {editState && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setEditState(null)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[20px] p-5 pb-8" style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', maxWidth: 480, margin: '0 auto' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background: '#333' }} />
            <div className="font-black text-[16px] text-white mb-4">Editar registro</div>
            <div className="mb-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>
                {editState.table === 'movimientos' ? 'Concepto' : editState.table === 'partidas_reforma' ? 'Nombre' : 'Título'}
              </label>
              <input type="text" value={editState.concepto} onChange={e => setEditState(s => s ? { ...s, concepto: e.target.value } : s)}
                className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium"
                style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)' }}
                onFocus={e => e.target.style.borderColor = '#F26E1F'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
            </div>
            {editState.table !== 'tareas' && (
              <div className="mb-5">
                <label className="block text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: '#888' }}>
                  {editState.table === 'movimientos' ? 'Monto (€)' : 'Presupuesto (€)'}
                </label>
                <input type="number" value={editState.monto} onChange={e => setEditState(s => s ? { ...s, monto: e.target.value } : s)}
                  className="w-full rounded-xl px-3.5 py-3 text-sm text-white outline-none font-medium font-mono"
                  style={{ background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.10)' }}
                  onFocus={e => e.target.style.borderColor = '#F26E1F'}
                  onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.10)'} />
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setEditState(null)} className="flex-1 py-3.5 rounded-xl text-sm font-black" style={{ background: '#282828', color: '#888' }}>Cancelar</button>
              <button onClick={saveEdit} disabled={editSaving} className="flex-1 py-3.5 rounded-xl text-sm font-black text-white disabled:opacity-50" style={{ background: '#F26E1F' }}>
                {editSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes bounce{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}`}</style>
    </div>
  )
}
