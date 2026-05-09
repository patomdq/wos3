'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'

type GCalEvent = {
  id: string; summary: string; description?: string
  start: { dateTime?: string; date?: string }
  end:   { dateTime?: string; date?: string }
}
type ViewMode = 'dia' | 'semana' | 'mes'
type TaskCat  = 'personal' | 'trabajo'
type TaskState = 'pendiente' | 'en_proceso' | 'hecho'
type Task = { id: string; texto: string; categoria: TaskCat; estado: TaskState }

const DAYS_ES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

function dateKey(y: number, m: number, d: number) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function evDate(ev: GCalEvent) { return (ev.start.dateTime || ev.start.date || '').slice(0,10) }
function evTime(ev: GCalEvent) {
  if (!ev.start.dateTime) return 'Todo el día'
  return new Date(ev.start.dateTime).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
}
function evEndTime(ev: GCalEvent) {
  if (!ev.end?.dateTime) return ''
  return new Date(ev.end.dateTime).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})
}
function getWeekStart(date: Date) {
  const d = new Date(date); d.setHours(0,0,0,0)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d
}

const CARD  = { background:'#141414', border:'1px solid rgba(255,255,255,0.08)' }
const INPUT = { background:'#0A0A0A', border:'1.5px solid rgba(255,255,255,0.12)', color:'#fff' }

const STATE_NEXT: Record<TaskState, TaskState> = { pendiente:'en_proceso', en_proceso:'hecho', hecho:'pendiente' }
const STATE_ICON: Record<TaskState, string>    = { pendiente:'○', en_proceso:'◑', hecho:'✓' }
const STATE_COLOR: Record<TaskState, string>   = { pendiente:'rgba(255,255,255,0.3)', en_proceso:'#F59E0B', hecho:'#22C55E' }
const STATE_LABEL: Record<TaskState, string>   = { pendiente:'Pendiente', en_proceso:'En proceso', hecho:'Hecho' }

function loadTasks(): Task[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem('hasu_tasks') || '[]') } catch { return [] }
}
function saveTasks(tasks: Task[]) {
  if (typeof window !== 'undefined') localStorage.setItem('hasu_tasks', JSON.stringify(tasks))
}

export default function CalendarioPage() {
  const router = useRouter()
  const params = useSearchParams()
  const now    = new Date()

  const [connected,  setConnected]  = useState(false)
  const [loading,    setLoading]    = useState(true)
  const [events,     setEvents]     = useState<GCalEvent[]>([])
  const [syncing,    setSyncing]    = useState(false)
  const [toast,      setToast]      = useState('')
  const [view,       setView]       = useState<ViewMode>('mes')
  const [year,       setYear]       = useState(now.getFullYear())
  const [month,      setMonth]      = useState(now.getMonth())
  const [weekStart,  setWeekStart]  = useState(() => getWeekStart(now))
  const [selectedDay,setSelectedDay] = useState<string>(dateKey(now.getFullYear(),now.getMonth(),now.getDate()))
  const [showForm,   setShowForm]   = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [form, setForm] = useState({ titulo:'', descripcion:'', fecha:now.toISOString().split('T')[0], hora_inicio:'10:00', hora_fin:'11:00', todo_el_dia:false })

  // Tasks
  const [tasks,     setTasks]     = useState<Task[]>([])
  const [taskCat,   setTaskCat]   = useState<TaskCat>('personal')
  const [newTask,   setNewTask]   = useState('')

  useEffect(() => { setTasks(loadTasks()) }, [])

  const mutateTasks = (next: Task[]) => { setTasks(next); saveTasks(next) }
  const addTask = () => {
    if (!newTask.trim()) return
    mutateTasks([...tasks, { id: Date.now().toString(), texto: newTask.trim(), categoria: taskCat, estado: 'pendiente' }])
    setNewTask('')
  }
  const toggleTask = (id: string) => mutateTasks(tasks.map(t => t.id === id ? { ...t, estado: STATE_NEXT[t.estado] } : t))
  const deleteTask = (id: string) => mutateTasks(tasks.filter(t => t.id !== id))

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const loadCalendar = useCallback(async (y = year, m = month) => {
    setLoading(true)
    const s = await fetch('/api/google/status'); const { connected: conn } = await s.json()
    setConnected(conn)
    if (conn) {
      const tMin = new Date(y, m, 1).toISOString()
      const tMax = new Date(y, m+1, 0, 23, 59, 59).toISOString()
      const r = await authFetch(`/api/google/sync?timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
      const { events: evs } = await r.json()
      setEvents(evs || [])
    }
    setLoading(false)
  }, [year, month])

  useEffect(() => { loadCalendar() }, [loadCalendar])
  useEffect(() => {
    if (params.get('google_connected') === 'true') { showToast('Google Calendar conectado'); loadCalendar() }
    if (params.get('google_error')) showToast(`Error: ${params.get('google_error')}`)
  }, [params]) // eslint-disable-line

  const connectGoogle = async () => {
    const r = await fetch('/api/google/auth'); const { url } = await r.json()
    window.location.href = url
  }
  const disconnectGoogle = async () => {
    if (!confirm('¿Desconectar Google Calendar?')) return
    await authFetch('/api/google/disconnect', { method:'POST' })
    setConnected(false); setEvents([]); showToast('Desconectado')
  }
  const syncNow = async () => { setSyncing(true); await loadCalendar(); setSyncing(false); showToast('Actualizado') }

  const saveEvent = async () => {
    if (!form.titulo.trim()) return
    setSaving(true)
    const start = form.todo_el_dia ? form.fecha : `${form.fecha}T${form.hora_inicio}:00`
    const end   = form.todo_el_dia ? form.fecha : `${form.fecha}T${form.hora_fin}:00`
    await authFetch('/api/google/create-event', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ partida_id:null, proyecto_nombre:'HASU', nombre:form.titulo,
        fecha_inicio:start, fecha_fin_estimada:end, allDay:form.todo_el_dia, descripcion:form.descripcion }) })
    setSaving(false); setShowForm(false)
    setForm({ titulo:'', descripcion:'', fecha:now.toISOString().split('T')[0], hora_inicio:'10:00', hora_fin:'11:00', todo_el_dia:false })
    await loadCalendar(); showToast('Evento creado')
  }

  // Derived
  const todayStr = dateKey(now.getFullYear(), now.getMonth(), now.getDate())
  const eventsByDay: Record<string, GCalEvent[]> = {}
  for (const ev of events) {
    const k = evDate(ev); if (!eventsByDay[k]) eventsByDay[k] = []; eventsByDay[k].push(ev)
  }
  const selEvents = eventsByDay[selectedDay] || []

  // Nav
  const prevMes = () => {
    const nm = month===0?11:month-1, ny = month===0?year-1:year
    setMonth(nm); setYear(ny); loadCalendar(ny, nm)
  }
  const nextMes = () => {
    const nm = month===11?0:month+1, ny = month===11?year+1:year
    setMonth(nm); setYear(ny); loadCalendar(ny, nm)
  }
  const prevSemana = () => { const d = new Date(weekStart); d.setDate(d.getDate()-7); setWeekStart(d) }
  const nextSemana = () => { const d = new Date(weekStart); d.setDate(d.getDate()+7); setWeekStart(d) }
  const prevDia = () => {
    const parts = selectedDay.split('-')
    const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]))
    d.setDate(d.getDate()-1)
    setSelectedDay(dateKey(d.getFullYear(), d.getMonth(), d.getDate()))
  }
  const nextDia = () => {
    const parts = selectedDay.split('-')
    const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]))
    d.setDate(d.getDate()+1)
    setSelectedDay(dateKey(d.getFullYear(), d.getMonth(), d.getDate()))
  }

  // Mes grid
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month+1, 0).getDate()

  // Semana days
  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date(weekStart); d.setDate(d.getDate()+i)
    return { date: d, key: dateKey(d.getFullYear(), d.getMonth(), d.getDate()), dayNum: d.getDate(), dayName: DAYS_ES[d.getDay()] }
  })

  // Selected day label
  const selParts = selectedDay.split('-')
  const selDayNum = parseInt(selParts[2])
  const selMonthIdx = parseInt(selParts[1])-1
  const selYearNum = parseInt(selParts[0])
  const selDayName = DAYS_ES[new Date(selYearNum, selMonthIdx, selDayNum).getDay()]
  const selLabel = `${selDayName} ${selDayNum} ${MONTHS_SHORT[selMonthIdx]}`

  const catTasks = tasks.filter(t => t.categoria === taskCat)

  return (
    <div style={{ background:'#0A0A0A', minHeight:'100vh' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={() => router.back()} className="text-sm font-bold opacity-50 hover:opacity-100" style={{color:'#fff'}}>← Volver</button>
        <div className="flex-1 font-black text-[17px] text-white">Calendario</div>
        <div className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:'rgba(255,255,255,0.06)',color:'#888'}}>hola@hasu.in</div>
      </div>

      {/* Toast */}
      {toast && <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-black text-white shadow-lg" style={{background:'#F26E1F'}}>{toast}</div>}

      {/* Google connection */}
      <div className="mx-4 mb-4 rounded-2xl p-3.5 flex items-center gap-3" style={CARD}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{background: connected ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)'}}>📅</div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-white">Google Calendar</div>
          <div className="text-xs font-medium mt-0.5" style={{color: connected ? '#22C55E' : '#888'}}>
            {connected ? 'Conectado · hola@hasu.in' : 'No conectado'}
          </div>
        </div>
        {connected ? (
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={syncing} className="text-xs font-black px-3 py-1.5 rounded-xl" style={{background:'rgba(255,255,255,0.08)',color:'#fff'}}>
              {syncing ? '...' : '↻ Sync'}
            </button>
            <button onClick={disconnectGoogle} className="text-xs font-black px-3 py-1.5 rounded-xl" style={{background:'rgba(239,68,68,0.12)',color:'#EF4444'}}>
              Desconectar
            </button>
          </div>
        ) : (
          <button onClick={connectGoogle} className="text-sm font-black px-4 py-2 rounded-xl text-white" style={{background:'#F26E1F'}}>
            Conectar
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className="mx-4 mb-4 flex rounded-xl overflow-hidden" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
        {(['dia','semana','mes'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex-1 py-2.5 text-xs font-black uppercase tracking-wide"
            style={{background: view===v ? '#F26E1F' : 'transparent', color: view===v ? '#fff' : '#555'}}>
            {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {!connected ? (
        <div className="text-center py-16 text-sm px-4" style={{color:'rgba(255,255,255,0.3)'}}>
          Conectá Google Calendar para ver y gestionar eventos desde WOS
        </div>
      ) : (
        <>
          {/* ── MES ── */}
          {view === 'mes' && (
            <div className="px-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMes} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>‹</button>
                <div className="font-black text-[17px] text-white">{MONTHS_ES[month]} {year}</div>
                <button onClick={nextMes} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>›</button>
              </div>
              <div className="rounded-2xl overflow-hidden mb-4" style={CARD}>
                <div className="grid grid-cols-7" style={{background:'#1E1E1E',borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  {DAYS_ES.map(d => <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide" style={{color:'rgba(255,255,255,0.4)'}}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({length:firstDay}).map((_,i) => <div key={`e${i}`} className="h-11" style={{borderBottom:'1px solid rgba(255,255,255,0.04)'}} />)}
                  {Array.from({length:daysInMonth}).map((_,i) => {
                    const dn = i+1, k = dateKey(year,month,dn)
                    const evs = eventsByDay[k]||[]
                    const isToday = k===todayStr, isSel = k===selectedDay
                    return (
                      <div key={k} onClick={() => setSelectedDay(k)}
                        className="h-11 flex flex-col items-center justify-start pt-1 cursor-pointer"
                        style={{borderBottom:'1px solid rgba(255,255,255,0.04)', background: isSel ? 'rgba(242,110,31,0.12)' : 'transparent'}}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-bold"
                          style={{background: isToday ? '#F26E1F' : 'transparent', color: isToday ? '#fff' : isSel ? '#F26E1F' : 'rgba(255,255,255,0.8)', fontWeight: isToday||isSel ? 900 : 600}}>
                          {dn}
                        </div>
                        {evs.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5">
                            {evs.slice(0,3).map((_,di) => <div key={di} className="w-1 h-1 rounded-full" style={{background:'#F26E1F'}} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── SEMANA ── */}
          {view === 'semana' && (
            <div className="px-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevSemana} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>‹</button>
                <div className="font-black text-[15px] text-white">
                  {weekDays[0].dayNum} {MONTHS_SHORT[weekDays[0].date.getMonth()]} – {weekDays[6].dayNum} {MONTHS_SHORT[weekDays[6].date.getMonth()]} {weekDays[6].date.getFullYear()}
                </div>
                <button onClick={nextSemana} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>›</button>
              </div>
              <div className="rounded-2xl overflow-hidden mb-4" style={CARD}>
                <div className="grid grid-cols-7">
                  {weekDays.map(wd => {
                    const evs = eventsByDay[wd.key]||[]
                    const isToday = wd.key===todayStr, isSel = wd.key===selectedDay
                    return (
                      <div key={wd.key} onClick={() => setSelectedDay(wd.key)}
                        className="flex flex-col items-center py-3 cursor-pointer gap-1"
                        style={{background: isSel ? 'rgba(242,110,31,0.12)' : 'transparent', borderRight:'1px solid rgba(255,255,255,0.04)'}}>
                        <div className="text-[10px] font-bold uppercase tracking-wide" style={{color:'rgba(255,255,255,0.4)'}}>{wd.dayName}</div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black"
                          style={{background: isToday ? '#F26E1F' : 'transparent', color: isToday ? '#fff' : isSel ? '#F26E1F' : 'rgba(255,255,255,0.85)'}}>
                          {wd.dayNum}
                        </div>
                        {evs.length > 0 && (
                          <div className="flex gap-0.5">
                            {evs.slice(0,3).map((_,di) => <div key={di} className="w-1 h-1 rounded-full" style={{background:'#F26E1F'}} />)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ── DÍA ── */}
          {view === 'dia' && (
            <div className="px-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevDia} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>‹</button>
                <div className="text-center">
                  <div className="font-black text-[17px] text-white">{selLabel}</div>
                  {selectedDay===todayStr && <div className="text-[11px] font-bold" style={{color:'#F26E1F'}}>Hoy</div>}
                </div>
                <button onClick={nextDia} className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-white" style={{background:'#1E1E1E'}}>›</button>
              </div>
            </div>
          )}

          {/* ── EVENTOS del día seleccionado ── */}
          <div className="px-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-black text-[15px] text-white">{selLabel}</div>
                <div className="text-xs font-bold mt-0.5" style={{color:'#555'}}>
                  {selEvents.length === 0 ? 'Sin eventos' : `${selEvents.length} evento${selEvents.length!==1?'s':''}`}
                </div>
              </div>
              <button onClick={() => { setForm(f=>({...f, fecha:selectedDay})); setShowForm(true) }}
                className="text-sm font-black px-3 py-1.5 rounded-xl text-white" style={{background:'#F26E1F'}}>
                + Evento
              </button>
            </div>

            {loading ? (
              <div className="h-16 rounded-2xl animate-pulse" style={{background:'#141414'}} />
            ) : selEvents.length === 0 ? (
              <div className="rounded-2xl px-4 py-5 text-center text-sm" style={{...CARD, color:'rgba(255,255,255,0.25)'}}>
                Sin eventos · toca + Evento para agregar
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {selEvents
                  .slice()
                  .sort((a,b) => (a.start.dateTime||'').localeCompare(b.start.dateTime||''))
                  .map(ev => (
                  <div key={ev.id} className="rounded-2xl p-4 flex gap-3 items-start" style={CARD}>
                    <div className="flex-shrink-0 mt-0.5">
                      <div className="w-1.5 h-full min-h-[2.5rem] rounded-full" style={{background:'#F26E1F'}} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black text-white leading-snug">{ev.summary || 'Sin título'}</div>
                      <div className="text-xs font-bold mt-1" style={{color:'rgba(255,255,255,0.4)'}}>
                        {evTime(ev)}{evEndTime(ev) ? ` → ${evEndTime(ev)}` : ''}
                      </div>
                      {ev.description && (
                        <div className="text-xs mt-1.5 leading-relaxed" style={{color:'rgba(255,255,255,0.35)'}}>
                          {ev.description.slice(0,120)}{ev.description.length>120?'…':''}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ TAREAS ══ */}
      <div className="px-4 pb-10">
        <div className="text-[11px] font-bold uppercase tracking-[1px] mb-3" style={{color:'#888'}}>Tareas</div>

        {/* Cat tabs */}
        <div className="flex rounded-xl overflow-hidden mb-4" style={{border:'1px solid rgba(255,255,255,0.1)'}}>
          {(['personal','trabajo'] as TaskCat[]).map(cat => (
            <button key={cat} onClick={() => setTaskCat(cat)}
              className="flex-1 py-2.5 text-xs font-black uppercase tracking-wide"
              style={{background: taskCat===cat ? '#F26E1F' : 'transparent', color: taskCat===cat ? '#fff' : '#555'}}>
              {cat === 'personal' ? 'Personal' : 'Trabajo'}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex flex-col gap-2 mb-3">
          {catTasks.length === 0 && (
            <div className="text-sm text-center py-4" style={{color:'rgba(255,255,255,0.2)'}}>Sin tareas</div>
          )}
          {catTasks.map(t => (
            <div key={t.id} className="rounded-2xl px-4 py-3.5 flex items-center gap-3" style={CARD}>
              <button onClick={() => toggleTask(t.id)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 transition-all"
                style={{background: t.estado==='hecho' ? 'rgba(34,197,94,0.15)' : t.estado==='en_proceso' ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)', color: STATE_COLOR[t.estado]}}>
                {STATE_ICON[t.estado]}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white leading-snug" style={{textDecoration: t.estado==='hecho' ? 'line-through' : 'none', opacity: t.estado==='hecho' ? 0.4 : 1}}>
                  {t.texto}
                </div>
                <div className="text-[11px] font-bold mt-0.5" style={{color: STATE_COLOR[t.estado]}}>
                  {STATE_LABEL[t.estado]}
                </div>
              </div>
              <button onClick={() => deleteTask(t.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.25)'}}>✕</button>
            </div>
          ))}
        </div>

        {/* New task input */}
        <div className="flex gap-2">
          <input value={newTask} onChange={e => setNewTask(e.target.value)}
            onKeyDown={e => e.key==='Enter' && addTask()}
            placeholder="+ Nueva tarea..."
            className="flex-1 rounded-xl px-4 py-3 text-sm outline-none font-medium" style={INPUT} />
          <button onClick={addTask} disabled={!newTask.trim()}
            className="px-4 py-3 rounded-xl text-sm font-black text-white disabled:opacity-30"
            style={{background:'#F26E1F'}}>
            +
          </button>
        </div>
      </div>

      {/* ── New event form ── */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-50" style={{background:'rgba(0,0,0,0.8)'}} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10 overflow-y-auto"
            style={{background:'#141414', border:'1px solid rgba(255,255,255,0.10)', maxWidth:480, margin:'0 auto', maxHeight:'90vh'}}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{background:'#333'}} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px] text-white">Nuevo evento</div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{background:'#282828',color:'#fff'}}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#888'}}>Título *</label>
                <input type="text" value={form.titulo} placeholder="Ej. Reunión con José Luis"
                  onChange={e => setForm(f=>({...f,titulo:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#888'}}>Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={e => setForm(f=>({...f,descripcion:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT} />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#888'}}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
              </div>
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" id="all_day" checked={form.todo_el_dia} onChange={e => setForm(f=>({...f,todo_el_dia:e.target.checked}))} />
                <label htmlFor="all_day" className="text-sm font-bold text-white cursor-pointer">Todo el día</label>
              </div>
              {!form.todo_el_dia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#888'}}>Inicio</label>
                    <input type="time" value={form.hora_inicio} onChange={e => setForm(f=>({...f,hora_inicio:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#888'}}>Fin</label>
                    <input type="time" value={form.hora_fin} onChange={e => setForm(f=>({...f,hora_fin:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
                  </div>
                </div>
              )}
            </div>
            <button onClick={saveEvent} disabled={saving||!form.titulo.trim()}
              className="w-full py-4 text-white rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{background:'#F26E1F'}}>
              {saving ? 'Creando...' : 'Crear evento'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
