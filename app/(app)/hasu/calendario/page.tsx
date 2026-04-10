'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

type GCalEvent = {
  id: string
  summary: string
  description?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
  status?: string
}

const DAYS_ES  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const CARD = { background: '#141414', border: '1px solid rgba(255,255,255,0.10)' }
const INPUT_STYLE = { background: '#0A0A0A', border: '1.5px solid rgba(255,255,255,0.12)', color: '#fff' }

function eventDate(ev: GCalEvent): string {
  return (ev.start.dateTime || ev.start.date || '').substring(0, 10)
}
function eventTime(ev: GCalEvent): string {
  const dt = ev.start.dateTime
  if (!dt) return 'Todo el día'
  return new Date(dt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}
function fmtDayKey(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}

export default function CalendarioPage() {
  const router = useRouter()
  const params = useSearchParams()

  const [connected,    setConnected]    = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [events,       setEvents]       = useState<GCalEvent[]>([])
  const [syncing,      setSyncing]      = useState(false)
  const [connecting,   setConnecting]   = useState(false)
  const [toast,        setToast]        = useState('')

  const now    = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())  // 0-indexed
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  // New event form
  const [showForm,  setShowForm]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [form, setForm] = useState({
    titulo: '', descripcion: '', fecha: new Date().toISOString().split('T')[0],
    hora_inicio: '10:00', hora_fin: '11:00', todo_el_dia: false,
  })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Check connection + load events
  const loadCalendar = useCallback(async (y = year, m = month) => {
    setLoading(true)
    const statusRes = await fetch('/api/google/status')
    const { connected: conn } = await statusRes.json()
    setConnected(conn)

    if (conn) {
      const timeMin = new Date(y, m, 1).toISOString()
      const timeMax = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
      const res = await fetch(`/api/google/sync?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}`)
      const { events: evs } = await res.json()
      setEvents(evs || [])
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { loadCalendar() }, [loadCalendar])

  // Handle OAuth redirect params
  useEffect(() => {
    if (params.get('google_connected') === 'true') {
      showToast('Google Calendar conectado')
      loadCalendar()
    }
    if (params.get('google_error')) {
      showToast(`Error: ${params.get('google_error')}`)
    }
  }, [params]) // eslint-disable-line

  const connectGoogle = async () => {
    setConnecting(true)
    const res = await fetch('/api/google/auth')
    const { url } = await res.json()
    window.location.href = url
  }

  const disconnectGoogle = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return
    await fetch('/api/google/disconnect', { method: 'POST' })
    setConnected(false)
    setEvents([])
    showToast('Google Calendar desconectado')
  }

  const syncNow = async () => {
    setSyncing(true)
    await loadCalendar()
    setSyncing(false)
    showToast('Calendario actualizado')
  }

  const saveEvent = async () => {
    if (!form.titulo.trim()) return
    setSaving(true)
    const startDT = form.todo_el_dia
      ? form.fecha
      : `${form.fecha}T${form.hora_inicio}:00`
    const endDT = form.todo_el_dia
      ? form.fecha
      : `${form.fecha}T${form.hora_fin}:00`

    const res = await fetch('/api/google/create-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        partida_id: null,
        proyecto_nombre: 'HASU',
        nombre: form.titulo,
        fecha_inicio: startDT,
        fecha_fin_estimada: endDT,
        allDay: form.todo_el_dia,
        descripcion: form.descripcion,
      }),
    })

    setSaving(false)
    setShowForm(false)
    setForm({ titulo:'', descripcion:'', fecha: new Date().toISOString().split('T')[0], hora_inicio:'10:00', hora_fin:'11:00', todo_el_dia: false })
    await loadCalendar()
    showToast('Evento creado')
  }

  // Build calendar grid
  const firstDay = new Date(year, month, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const todayStr = fmtDayKey(now.getFullYear(), now.getMonth(), now.getDate())

  // Map events by date key
  const eventsByDay: Record<string, GCalEvent[]> = {}
  for (const ev of events) {
    const key = eventDate(ev)
    if (!eventsByDay[key]) eventsByDay[key] = []
    eventsByDay[key].push(ev)
  }

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : []

  const prevMonth = () => {
    const newM = month === 0 ? 11 : month - 1
    const newY = month === 0 ? year - 1 : year
    setMonth(newM); setYear(newY); setSelectedDay(null)
    loadCalendar(newY, newM)
  }
  const nextMonth = () => {
    const newM = month === 11 ? 0 : month + 1
    const newY = month === 11 ? year + 1 : year
    setMonth(newM); setYear(newY); setSelectedDay(null)
    loadCalendar(newY, newM)
  }

  return (
    <div className="p-4" style={{ background: '#0A0A0A', minHeight: '100vh' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => router.back()} className="text-sm font-bold text-white opacity-50 hover:opacity-100">← Volver</button>
        <div className="flex-1 font-black text-[17px] text-white">Calendario</div>
        <div className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background:'rgba(255,255,255,0.06)', color:'#888' }}>
          hola@hasu.in
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-black text-white shadow-lg"
          style={{ background:'#F26E1F' }}>
          {toast}
        </div>
      )}

      {/* Connection card */}
      <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={CARD}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
          style={{ background: connected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)' }}>
          📅
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-white">Google Calendar</div>
          <div className="text-xs font-medium mt-0.5" style={{ color: connected ? '#22C55E' : '#888' }}>
            {connected ? 'Conectado · hola@hasu.in' : 'No conectado'}
          </div>
        </div>
        {connected ? (
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={syncing}
              className="text-xs font-black px-3 py-1.5 rounded-xl"
              style={{ background:'rgba(255,255,255,0.08)', color:'#fff' }}>
              {syncing ? '...' : '↻ Sync'}
            </button>
            <button onClick={disconnectGoogle}
              className="text-xs font-black px-3 py-1.5 rounded-xl"
              style={{ background:'rgba(239,68,68,0.12)', color:'#EF4444' }}>
              Desconectar
            </button>
          </div>
        ) : (
          <button onClick={connectGoogle} disabled={connecting}
            className="text-sm font-black px-4 py-2 rounded-xl text-white"
            style={{ background:'#F26E1F' }}>
            {connecting ? 'Redirigiendo...' : 'Conectar'}
          </button>
        )}
      </div>

      {!connected ? (
        <div className="text-center py-16 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>
          Conectá Google Calendar para ver y gestionar eventos desde WOS
        </div>
      ) : (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{ background:'#1E1E1E' }}>‹</button>
            <div className="font-black text-[17px] text-white">{MONTHS_ES[month]} {year}</div>
            <button onClick={nextMonth} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{ background:'#1E1E1E' }}>›</button>
          </div>

          {/* Calendar grid */}
          <div className="rounded-2xl overflow-hidden mb-4" style={CARD}>
            {/* Day headers */}
            <div className="grid grid-cols-7" style={{ background:'#1E1E1E', borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              {DAYS_ES.map(d => (
                <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide"
                  style={{ color:'rgba(255,255,255,0.4)' }}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells before first day */}
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`e${i}`} className="h-12" style={{ borderBottom:'1px solid rgba(255,255,255,0.05)' }} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1
                const key    = fmtDayKey(year, month, dayNum)
                const evs    = eventsByDay[key] || []
                const isToday   = key === todayStr
                const isSelected = key === selectedDay
                return (
                  <div key={key}
                    onClick={() => setSelectedDay(isSelected ? null : key)}
                    className="h-12 flex flex-col items-center justify-start pt-1.5 cursor-pointer relative"
                    style={{
                      borderBottom:'1px solid rgba(255,255,255,0.05)',
                      background: isSelected ? 'rgba(242,110,31,0.15)' : 'transparent',
                    }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[13px] font-bold"
                      style={{
                        background: isToday ? '#F26E1F' : 'transparent',
                        color: isToday ? '#fff' : isSelected ? '#F26E1F' : 'rgba(255,255,255,0.85)',
                        fontWeight: isToday || isSelected ? 900 : 600,
                      }}>
                      {dayNum}
                    </div>
                    {evs.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5">
                        {evs.slice(0, 3).map((_, di) => (
                          <div key={di} className="w-1 h-1 rounded-full" style={{ background:'#F26E1F' }} />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Selected day events or all events */}
          <div className="flex items-center justify-between mb-3">
            <div className="font-black text-[15px] text-white">
              {selectedDay
                ? `${parseInt(selectedDay.split('-')[2])} ${MONTHS_ES[parseInt(selectedDay.split('-')[1])-1]}`
                : `${MONTHS_ES[month]} — ${events.length} evento${events.length !== 1 ? 's' : ''}`}
            </div>
            <button onClick={() => setShowForm(true)}
              className="text-sm font-black px-3 py-1.5 rounded-xl text-white"
              style={{ background:'#F26E1F' }}>
              + Evento
            </button>
          </div>

          {loading ? (
            <div className="h-20 rounded-2xl animate-pulse" style={{ background:'#141414' }} />
          ) : (selectedDay ? selectedEvents : events).length === 0 ? (
            <div className="text-center py-10 text-sm" style={{ color:'rgba(255,255,255,0.3)' }}>
              {selectedDay ? 'Sin eventos este día' : 'Sin eventos este mes'}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(selectedDay ? selectedEvents : events).map(ev => (
                <div key={ev.id} className="rounded-xl p-3.5 flex gap-3 items-start" style={CARD}>
                  <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ background:'#F26E1F' }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-white truncate">{ev.summary || 'Sin título'}</div>
                    <div className="text-xs font-bold mt-0.5" style={{ color:'rgba(255,255,255,0.45)' }}>
                      {!selectedDay && `${eventDate(ev)} · `}{eventTime(ev)}
                    </div>
                    {ev.description && (
                      <div className="text-xs font-medium mt-1 leading-relaxed" style={{ color:'rgba(255,255,255,0.4)' }}>
                        {ev.description.slice(0, 100)}{ev.description.length > 100 ? '…' : ''}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── New event form ── */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-50" style={{ background:'rgba(0,0,0,0.8)' }} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10 overflow-y-auto"
            style={{ background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto', maxHeight:'90vh' }}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{ background:'#333' }} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">Nuevo evento</div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{ background:'#282828', color:'#fff' }}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Título *</label>
                <input type="text" value={form.titulo} placeholder="Ej. Reunión con José Luis"
                  onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Descripción</label>
                <textarea rows={2} value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT_STYLE} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Fecha</label>
                <input type="date" value={form.fecha}
                  onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
              </div>
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" id="toda_dia" checked={form.todo_el_dia}
                  onChange={e => setForm(f => ({ ...f, todo_el_dia: e.target.checked }))} />
                <label htmlFor="toda_dia" className="text-sm font-bold text-white cursor-pointer">Todo el día</label>
              </div>
              {!form.todo_el_dia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Hora inicio</label>
                    <input type="time" value={form.hora_inicio}
                      onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{ color:'#888' }}>Hora fin</label>
                    <input type="time" value={form.hora_fin}
                      onChange={e => setForm(f => ({ ...f, hora_fin: e.target.value }))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT_STYLE} />
                  </div>
                </div>
              )}
            </div>
            <button onClick={saveEvent} disabled={saving || !form.titulo.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{ background:'#F26E1F' }}>
              {saving ? 'Creando...' : 'Crear evento'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
