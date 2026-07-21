'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { authFetch } from '@/lib/auth-fetch'
import { supabase } from '@/lib/supabase'

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

const CARD  = { background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)' }
const INPUT = { background:'#F2F1ED', border:'1.5px solid rgba(0,0,0,0.10)', color:'#1A1A1A' }

const STATE_NEXT: Record<TaskState, TaskState> = { pendiente:'en_proceso', en_proceso:'hecho', hecho:'pendiente' }
const STATE_ICON: Record<TaskState, string>    = { pendiente:'○', en_proceso:'◑', hecho:'✓' }
const STATE_COLOR: Record<TaskState, string>   = { pendiente:'#999999', en_proceso:'#D97706', hecho:'#16A34A' }
const STATE_LABEL: Record<TaskState, string>   = { pendiente:'Pendiente', en_proceso:'En proceso', hecho:'Hecho' }

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

  useEffect(() => {
    supabase.from('agenda_tasks').select('id, title, category, status').order('created_at')
      .then(({ data }) => {
        if (data) setTasks(data.map(r => ({ id: r.id, texto: r.title, categoria: r.category as TaskCat, estado: r.status as TaskState })))
      })
  }, [])

  const addTask = async () => {
    if (!newTask.trim()) return
    const { data, error } = await supabase.from('agenda_tasks')
      .insert({ title: newTask.trim(), category: taskCat, status: 'pendiente' }).select().single()
    if (!error && data) {
      setTasks(prev => [...prev, { id: data.id, texto: data.title, categoria: data.category as TaskCat, estado: data.status as TaskState }])
      setNewTask('')
    }
  }
  const toggleTask = async (id: string) => {
    const task = tasks.find(t => t.id === id)
    if (!task) return
    const next = STATE_NEXT[task.estado]
    const { error } = await supabase.from('agenda_tasks').update({ status: next }).eq('id', id)
    if (!error) setTasks(prev => prev.map(t => t.id === id ? { ...t, estado: next } : t))
  }
  const deleteTask = async (id: string) => {
    const { error } = await supabase.from('agenda_tasks').delete().eq('id', id)
    if (!error) setTasks(prev => prev.filter(t => t.id !== id))
  }

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
    <div style={{ background:'#F2F1ED', minHeight:'100vh' }}>
      {/* Topbar */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <button onClick={() => router.back()} className="text-sm font-bold" style={{color:'#666666'}}>← Volver</button>
        <div className="flex-1 font-black text-[17px]" style={{color:'#1A1A1A'}}>Calendario</div>
        <div className="text-xs font-bold px-2 py-1 rounded-lg" style={{background:'rgba(0,0,0,0.06)', color:'#666666'}}>hola@hasu.in</div>
      </div>

      {/* Toast */}
      {toast && <div className="fixed top-4 left-1/2 z-[60] -translate-x-1/2 px-4 py-2.5 rounded-xl text-sm font-black shadow-lg" style={{background:'#A6855A', color:'#F8F3E9'}}>{toast}</div>}

      {/* Google connection */}
      <div className="mx-4 mb-4 rounded-2xl p-3.5 flex items-center gap-3" style={CARD}>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
          style={{background: connected ? 'rgba(22,163,74,0.10)' : 'rgba(0,0,0,0.05)'}}>📅</div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm" style={{color:'#1A1A1A'}}>Google Calendar</div>
          <div className="text-xs font-medium mt-0.5" style={{color: connected ? '#16A34A' : '#999999'}}>
            {connected ? 'Conectado · hola@hasu.in' : 'No conectado'}
          </div>
        </div>
        {connected ? (
          <div className="flex gap-2">
            <button onClick={syncNow} disabled={syncing} className="text-xs font-black px-3 py-1.5 rounded-xl" style={{background:'rgba(0,0,0,0.06)', color:'#1A1A1A'}}>
              {syncing ? '...' : '↻ Sync'}
            </button>
            <button onClick={disconnectGoogle} className="text-xs font-black px-3 py-1.5 rounded-xl" style={{background:'rgba(220,38,38,0.08)', color:'#DC2626'}}>
              Desconectar
            </button>
          </div>
        ) : (
          <button onClick={connectGoogle} className="text-sm font-black px-4 py-2 rounded-xl" style={{background:'#A6855A', color:'#F8F3E9'}}>
            Conectar
          </button>
        )}
      </div>

      {/* View tabs */}
      <div className="mx-4 mb-4 flex rounded-xl overflow-hidden" style={{border:'1px solid rgba(0,0,0,0.10)', background:'#FFFFFF'}}>
        {(['dia','semana','mes'] as ViewMode[]).map(v => (
          <button key={v} onClick={() => setView(v)}
            className="flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-colors"
            style={{background: view===v ? '#A6855A' : 'transparent', color: view===v ? '#F8F3E9' : '#999999'}}>
            {v === 'dia' ? 'Día' : v === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>

      {!connected ? (
        <div className="text-center py-16 text-sm px-4" style={{color:'#999999'}}>
          Conecta Google Calendar para ver y gestionar eventos desde WOS
        </div>
      ) : (
        <>
          {/* ── MES ── */}
          {view === 'mes' && (
            <div className="px-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={prevMes} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>‹</button>
                <div className="font-black text-[17px]" style={{color:'#1A1A1A'}}>{MONTHS_ES[month]} {year}</div>
                <button onClick={nextMes} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>›</button>
              </div>
              <div className="rounded-2xl overflow-hidden mb-4" style={CARD}>
                <div className="grid grid-cols-7" style={{background:'rgba(0,0,0,0.03)', borderBottom:'1px solid rgba(0,0,0,0.06)'}}>
                  {DAYS_ES.map(d => <div key={d} className="py-2 text-center text-[11px] font-bold uppercase tracking-wide" style={{color:'#999999'}}>{d}</div>)}
                </div>
                <div className="grid grid-cols-7">
                  {Array.from({length:firstDay}).map((_,i) => <div key={`e${i}`} className="h-11" style={{borderBottom:'1px solid rgba(0,0,0,0.04)'}} />)}
                  {Array.from({length:daysInMonth}).map((_,i) => {
                    const dn = i+1, k = dateKey(year,month,dn)
                    const evs = eventsByDay[k]||[]
                    const isToday = k===todayStr, isSel = k===selectedDay
                    return (
                      <div key={k} onClick={() => setSelectedDay(k)}
                        className="h-11 flex flex-col items-center justify-start pt-1 cursor-pointer"
                        style={{borderBottom:'1px solid rgba(0,0,0,0.04)', background: isSel ? 'rgba(166,133,90,0.08)' : 'transparent'}}>
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-[14px] font-bold"
                          style={{
                            background: isToday ? '#A6855A' : 'transparent',
                            color: isToday ? '#F8F3E9' : isSel ? '#A6855A' : '#1A1A1A',
                            fontWeight: isToday||isSel ? 900 : 500
                          }}>
                          {dn}
                        </div>
                        {evs.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5">
                            {evs.slice(0,3).map((_,di) => <div key={di} className="w-1 h-1 rounded-full" style={{background:'#A6855A'}} />)}
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
                <button onClick={prevSemana} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>‹</button>
                <div className="font-black text-[15px]" style={{color:'#1A1A1A'}}>
                  {weekDays[0].dayNum} {MONTHS_SHORT[weekDays[0].date.getMonth()]} – {weekDays[6].dayNum} {MONTHS_SHORT[weekDays[6].date.getMonth()]} {weekDays[6].date.getFullYear()}
                </div>
                <button onClick={nextSemana} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>›</button>
              </div>
              <div className="rounded-2xl overflow-hidden mb-4" style={CARD}>
                <div className="grid grid-cols-7">
                  {weekDays.map(wd => {
                    const evs = eventsByDay[wd.key]||[]
                    const isToday = wd.key===todayStr, isSel = wd.key===selectedDay
                    return (
                      <div key={wd.key} onClick={() => setSelectedDay(wd.key)}
                        className="flex flex-col items-center py-3 cursor-pointer gap-1"
                        style={{background: isSel ? 'rgba(166,133,90,0.08)' : 'transparent', borderRight:'1px solid rgba(0,0,0,0.05)'}}>
                        <div className="text-[11px] font-bold uppercase tracking-wide" style={{color:'#999999'}}>{wd.dayName}</div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black"
                          style={{background: isToday ? '#A6855A' : 'transparent', color: isToday ? '#F8F3E9' : isSel ? '#A6855A' : '#1A1A1A'}}>
                          {wd.dayNum}
                        </div>
                        {evs.length > 0 && (
                          <div className="flex gap-0.5">
                            {evs.slice(0,3).map((_,di) => <div key={di} className="w-1 h-1 rounded-full" style={{background:'#A6855A'}} />)}
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
                <button onClick={prevDia} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>‹</button>
                <div className="text-center">
                  <div className="font-black text-[17px]" style={{color:'#1A1A1A'}}>{selLabel}</div>
                  {selectedDay===todayStr && <div className="text-[12px] font-bold" style={{color:'#A6855A'}}>Hoy</div>}
                </div>
                <button onClick={nextDia} className="w-9 h-9 rounded-xl flex items-center justify-center font-black" style={{background:'#FFFFFF', border:'1px solid rgba(0,0,0,0.08)', color:'#1A1A1A'}}>›</button>
              </div>
            </div>
          )}

          {/* ── EVENTOS del día seleccionado ── */}
          <div className="px-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="font-black text-[15px]" style={{color:'#1A1A1A'}}>{selLabel}</div>
                <div className="text-xs font-bold mt-0.5" style={{color:'#999999'}}>
                  {selEvents.length === 0 ? 'Sin eventos' : `${selEvents.length} evento${selEvents.length!==1?'s':''}`}
                </div>
              </div>
              <button onClick={() => { setForm(f=>({...f, fecha:selectedDay})); setShowForm(true) }}
                className="text-sm font-black px-3 py-1.5 rounded-xl" style={{background:'#14110C', color:'#F8F3E9'}}>
                + Evento
              </button>
            </div>

            {loading ? (
              <div className="h-16 rounded-2xl animate-pulse" style={{background:'rgba(0,0,0,0.06)'}} />
            ) : selEvents.length === 0 ? (
              <div className="rounded-2xl px-4 py-5 text-center text-sm" style={{...CARD, color:'#BBBBBB'}}>
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
                      <div className="w-1 h-full min-h-[2.5rem] rounded-full" style={{background:'#A6855A'}} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black leading-snug" style={{color:'#1A1A1A'}}>{ev.summary || 'Sin título'}</div>
                      <div className="text-xs font-bold mt-1" style={{color:'#999999'}}>
                        {evTime(ev)}{evEndTime(ev) ? ` → ${evEndTime(ev)}` : ''}
                      </div>
                      {ev.description && (
                        <div className="text-xs mt-1.5 leading-relaxed" style={{color:'#666666'}}>
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
        <div className="text-[12px] font-bold uppercase tracking-[1px] mb-3" style={{color:'#999999'}}>Tareas</div>

        {/* Cat tabs */}
        <div className="flex rounded-xl overflow-hidden mb-4" style={{border:'1px solid rgba(0,0,0,0.10)', background:'#FFFFFF'}}>
          {(['personal','trabajo'] as TaskCat[]).map(cat => (
            <button key={cat} onClick={() => setTaskCat(cat)}
              className="flex-1 py-2.5 text-xs font-black uppercase tracking-wide transition-colors"
              style={{background: taskCat===cat ? '#A6855A' : 'transparent', color: taskCat===cat ? '#F8F3E9' : '#999999'}}>
              {cat === 'personal' ? 'Personal' : 'Trabajo'}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="flex flex-col gap-2 mb-3">
          {catTasks.length === 0 && (
            <div className="text-sm text-center py-4" style={{color:'#BBBBBB'}}>Sin tareas</div>
          )}
          {catTasks.map(t => (
            <div key={t.id} className="rounded-2xl px-4 py-3.5 flex items-center gap-3" style={CARD}>
              <button onClick={() => toggleTask(t.id)}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-base font-black flex-shrink-0 transition-all"
                style={{
                  background: t.estado==='hecho' ? 'rgba(22,163,74,0.10)' : t.estado==='en_proceso' ? 'rgba(217,119,6,0.10)' : 'rgba(0,0,0,0.05)',
                  color: STATE_COLOR[t.estado]
                }}>
                {STATE_ICON[t.estado]}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold leading-snug" style={{color:'#1A1A1A', textDecoration: t.estado==='hecho' ? 'line-through' : 'none', opacity: t.estado==='hecho' ? 0.4 : 1}}>
                  {t.texto}
                </div>
                <div className="text-[12px] font-bold mt-0.5" style={{color: STATE_COLOR[t.estado]}}>
                  {STATE_LABEL[t.estado]}
                </div>
              </div>
              <button onClick={() => deleteTask(t.id)} className="w-6 h-6 rounded-full flex items-center justify-center text-xs flex-shrink-0"
                style={{background:'rgba(0,0,0,0.05)', color:'#BBBBBB'}}>✕</button>
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
            className="px-4 py-3 rounded-xl text-sm font-black disabled:opacity-30"
            style={{background:'#14110C', color:'#F8F3E9'}}>
            +
          </button>
        </div>
      </div>

      {/* ── New event form ── */}
      {showForm && (
        <>
          <div className="fixed inset-0 z-50" style={{background:'rgba(0,0,0,0.4)'}} onClick={() => setShowForm(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-[51] rounded-t-[20px] p-5 pb-10 overflow-y-auto"
            style={{background:'#FFFFFF', borderTop:'1px solid rgba(0,0,0,0.08)', maxWidth:480, margin:'0 auto', maxHeight:'90vh'}}>
            <div className="w-9 h-1 rounded-full mx-auto mb-5" style={{background:'rgba(0,0,0,0.12)'}} />
            <div className="flex justify-between items-center mb-5">
              <div className="font-black text-[17px]" style={{color:'#1A1A1A'}}>Nuevo evento</div>
              <button onClick={() => setShowForm(false)} className="w-7 h-7 rounded-full flex items-center justify-center text-sm" style={{background:'rgba(0,0,0,0.06)', color:'#666666'}}>✕</button>
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#999999'}}>Título *</label>
                <input type="text" value={form.titulo} placeholder="Ej. Reunión con José Luis"
                  onChange={e => setForm(f=>({...f,titulo:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#999999'}}>Descripción</label>
                <textarea rows={2} value={form.descripcion} onChange={e => setForm(f=>({...f,descripcion:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium resize-none" style={INPUT} />
              </div>
              <div>
                <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#999999'}}>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm(f=>({...f,fecha:e.target.value}))}
                  className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
              </div>
              <div className="flex items-center gap-2 px-1">
                <input type="checkbox" id="all_day" checked={form.todo_el_dia} onChange={e => setForm(f=>({...f,todo_el_dia:e.target.checked}))} />
                <label htmlFor="all_day" className="text-sm font-bold cursor-pointer" style={{color:'#1A1A1A'}}>Todo el día</label>
              </div>
              {!form.todo_el_dia && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#999999'}}>Inicio</label>
                    <input type="time" value={form.hora_inicio} onChange={e => setForm(f=>({...f,hora_inicio:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
                  </div>
                  <div>
                    <label className="block text-[12px] font-bold uppercase tracking-wide mb-1.5" style={{color:'#999999'}}>Fin</label>
                    <input type="time" value={form.hora_fin} onChange={e => setForm(f=>({...f,hora_fin:e.target.value}))}
                      className="w-full rounded-xl px-3.5 py-3 text-sm outline-none font-medium" style={INPUT} />
                  </div>
                </div>
              )}
            </div>
            <button onClick={saveEvent} disabled={saving||!form.titulo.trim()}
              className="w-full py-4 rounded-xl text-base font-black mt-5 disabled:opacity-50"
              style={{background:'#14110C', color:'#F8F3E9'}}>
              {saving ? 'Creando...' : 'Crear evento'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
