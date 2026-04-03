'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Msg = { role: 'bot' | 'user'; text: string; time: string; action?: string }

const QUICK = ['📄 Factura', '💰 Saldo HASU', '🔨 Estado obra', '📋 Liquidación', '📅 Tareas pendientes']

function now() {
  const d = new Date()
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
}

const WELCOME: Msg = { role: 'bot', text: 'Hola 👋 ¿En qué puedo ayudarte hoy?', time: '—' }

export default function BotPage() {
  const [msgs, setMsgs] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [context, setContext] = useState('')
  const [historial, setHistorial] = useState<{role:string;content:string}[]>([])
  const [userId, setUserId] = useState<string>('')
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const contextRef = useRef('')

  useEffect(() => {
    async function init() {
      // Get current user
      const { data: { session } } = await supabase.auth.getSession()
      const uid = session?.user?.id || 'anon'
      setUserId(uid)

      // Load messages from localStorage
      const stored = localStorage.getItem(`wos3_chat_${uid}`)
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMsgs(parsed)
            // Rebuild historial from stored messages
            const hist = parsed
              .filter((m: Msg) => m.role !== 'bot' || msgs.indexOf(m) > 0)
              .map((m: Msg) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text.replace(/<[^>]+>/g, '') }))
            setHistorial(hist)
          }
        } catch {}
      }

      // Load context from Supabase
      const [
        { count: activos },
        { data: movs },
        { data: tareas },
        { data: proyectos }
      ] = await Promise.all([
        supabase.from('proyectos').select('id', { count: 'exact' }).in('estado', ['comprado','reforma','venta']),
        supabase.from('movimientos').select('concepto,monto,fecha').order('fecha', { ascending: false }).limit(5),
        supabase.from('tareas').select('titulo,prioridad,estado').eq('estado', 'Pendiente').limit(5),
        supabase.from('proyectos').select('id,nombre,estado,ciudad').order('created_at')
      ])

      const ctx = [
        `Proyectos activos: ${activos ?? 0}`,
        proyectos?.length ? `Lista de proyectos (ID | Nombre | Estado | Ciudad):\n${proyectos.map(p => `- ${p.id} | ${p.nombre} | ${p.estado} | ${p.ciudad}`).join('\n')}` : '',
        movs?.length ? `Últimos movimientos: ${movs.map(m => `${m.concepto} ${m.monto > 0 ? '+' : ''}${m.monto}€ (${m.fecha})`).join(' | ')}` : '',
        tareas?.length ? `Tareas pendientes: ${tareas.map(t => `${t.titulo} [${t.prioridad}]`).join(', ')}` : ''
      ].filter(Boolean).join('\n')

      setContext(ctx)
      contextRef.current = ctx
    }
    init()
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  // Save messages to localStorage
  useEffect(() => {
    if (userId && msgs.length > 1) {
      localStorage.setItem(`wos3_chat_${userId}`, JSON.stringify(msgs))
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

      // Build action summary if tools were used
      let actionSummary = ''
      if (toolResults?.length) {
        actionSummary = toolResults.map((r: { id: string; result: string }) => r.result).join(' ')
      }

      const botMsg: Msg = { role: 'bot', text: html, time: now(), action: actionSummary || undefined }
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

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 70px)' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 h-[54px] flex-shrink-0" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white tracking-[-0.3px]">Bot</div>
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
              {m.action && (
                <div className="mt-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)', color: '#22C55E' }}>
                  ✓ Guardado en Supabase
                </div>
              )}
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

      <style>{`@keyframes bounce{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1.1)}}`}</style>
    </div>
  )
}
