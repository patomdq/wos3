'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

type Msg = { role: 'bot' | 'user'; text: string; time: string }

const QUICK = ['📄 Factura', '💰 Saldo', '🔨 Estado obra', '📋 Liquidación', '📅 Tareas']

const RESPONSES: Record<string, string> = {
  saldo: 'Saldo cuenta principal HASU: <strong style="color:#22C55E">cargando...</strong> — revisá la sección HASU para el detalle actualizado.',
  factura: '¿De qué proyecto y cuánto? Podés mandarme foto de la factura directamente.',
  obra: 'Revisando el estado de reforma... <br><br>Accedé a <strong>Proyectos</strong> para ver el avance detallado de cada obra.',
  tarea: 'Tus pendientes activos están en cada proyecto. <br><br>Abrí un proyecto → tab Pendientes para ver las tareas asignadas.',
  liquidación: '📋 Generando borrador de liquidación parcial... <br><br>El informe estará listo para el próximo viernes.',
  default: 'Entendido. ¿A qué proyecto lo asigno?',
}

function now() {
  const d = new Date()
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0')
}

export default function BotPage() {
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [proyectosActivos, setProyectosActivos] = useState<number>(0)
  const endRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    supabase.from('proyectos').select('id', { count: 'exact' })
      .in('estado', ['comprado', 'reforma', 'venta'])
      .then(({ count }) => {
        const n = count ?? 0
        setProyectosActivos(n)
        setMsgs([{
          role: 'bot',
          text: `Hola Pato 👋<br><br>Tenés <strong>${n > 0 ? n : '...'} proyecto${n !== 1 ? 's' : ''} activo${n !== 1 ? 's' : ''}</strong>.<br><br>¿Qué arrancamos hoy?`,
          time: now()
        }])
      })
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs, typing])

  const send = (text: string) => {
    if (!text.trim()) return
    const t = now()
    setMsgs(m => [...m, { role: 'user', text, time: t }])
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setTyping(true)
    setTimeout(() => {
      setTyping(false)
      const low = text.toLowerCase()
      let resp = RESPONSES.default
      for (const [k, v] of Object.entries(RESPONSES)) {
        if (k !== 'default' && low.includes(k)) { resp = v; break }
      }
      setMsgs(m => [...m, { role: 'bot', text: resp, time: now() }])
    }, 900)
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 70px)' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 h-[54px] flex-shrink-0" style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center font-black text-sm text-white" style={{ background: '#F26E1F' }}>W</div>
        <div className="flex-1 font-bold text-[17px] text-white tracking-[-0.3px]">Bot</div>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-base cursor-pointer" style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>◎</div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {msgs.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className="w-7 h-7 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-xs font-black"
              style={{ background: m.role === 'bot' ? '#F26E1F' : '#282828', color: '#fff', border: m.role === 'user' ? '1px solid rgba(255,255,255,0.14)' : 'none' }}>
              {m.role === 'bot' ? 'W' : 'P'}
            </div>
            <div>
              <div className="text-sm font-medium leading-relaxed px-3.5 py-2.5 rounded-2xl max-w-[calc(100vw-100px)] md:max-w-md"
                style={{
                  background: m.role === 'bot' ? '#1E1E1E' : '#F26E1F',
                  border: m.role === 'bot' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                  color: '#fff',
                  borderRadius: m.role === 'bot' ? '4px 14px 14px 14px' : '14px 4px 14px 14px',
                }}
                dangerouslySetInnerHTML={{ __html: m.text }} />
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
            className="flex-shrink-0 text-xs font-bold px-3.5 py-2 rounded-full whitespace-nowrap transition-colors"
            style={{ background: '#1E1E1E', border: '1px solid rgba(255,255,255,0.08)', color: '#ccc' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2 px-3.5 py-2.5 flex-shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.08)', background: '#141414' }}>
        <textarea ref={taRef} value={input} onChange={e => { setInput(e.target.value); e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px' }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input) } }}
          placeholder="Escribí, grabá o mandá foto…" rows={1}
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
