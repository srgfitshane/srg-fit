'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const localDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', green:'#22c55e', pink:'#f472b6',
  red:'#ef4444', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type CalItem = {
  id: string
  title: string
  date: string
  start_at?: string
  end_at?: string
  color: string
  icon: string
  label: string
  type: 'calendar' | 'workout'
  status?: string
  description?: string
  session_rpe?: number
  mood?: string
  duration_seconds?: number
  source_id?: string
}

type ClientTask = {
  id: string
  title: string
  repeat: 'once' | 'daily' | 'weekly'
  due_date: string | null
  last_completed_date: string | null
  icon: string | null
}

type JournalEntrySummary = { entry_date: string }

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SHORT_DAYS = ['S','M','T','W','T','F','S']
const FULL_DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

const MOOD_ICONS: Record<string,string> = { great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }

function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
}
function fmtDur(s: number) { return s ? `${Math.floor(s/60)}m` : '' }

export default function ClientCalendarPage() {
  const today   = new Date()
  const todayStr = localDateStr(today)
  const supabase = createClient()
  const router   = useRouter()

  const [items,        setItems]        = useState<CalItem[]>([])
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set())
  const [tasks,        setTasks]        = useState<ClientTask[]>([])
  const [loading,      setLoading]      = useState(true)
  const [viewMonth,    setViewMonth]    = useState(today.getMonth())
  const [viewYear,     setViewYear]     = useState(today.getFullYear())
  const [selectedDate, setSelectedDate] = useState<string>(todayStr)
  const [rescheduling, setRescheduling] = useState<string|null>(null)
  const [reschedPick,  setReschedPick]  = useState<string>('')
  const [clientId,     setClientId]     = useState<string|null>(null)
  // Task add modal
  const [showAddTask,  setShowAddTask]  = useState(false)
  const [taskIcon, setTaskIcon] = useState('✅')

  // Auto-open add task modal if navigated with ?addTask=1
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('addTask') === '1') {
        setShowAddTask(true)
        // Clean up the URL param without navigation
        const url = new URL(window.location.href)
        url.searchParams.delete('addTask')
        window.history.replaceState({}, '', url.toString())
      }
    }
  }, [])
  const [taskTitle,    setTaskTitle]    = useState('')
  const [taskRepeat,   setTaskRepeat]   = useState<'once'|'daily'|'weekly'>('once')
  const [taskDate,     setTaskDate]     = useState(todayStr)
  const [taskSaving,   setTaskSaving]   = useState(false)

  // Build the current week (Sun–Sat containing today)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: clientData } = await supabase
          .from('clients').select('id, coach_id').eq('profile_id', user.id).single()
        if (!clientData) { setLoading(false); return }
        setClientId(clientData.id)

        const [{ data: calEvts }, { data: sessions }, { data: journals }, { data: taskData }] = await Promise.all([
          supabase.from('calendar_events').select('*')
            .eq('coach_id', clientData.coach_id)
            .eq('client_id', clientData.id)
            .order('start_at'),
          supabase.from('workout_sessions')
            .select('id, title, status, scheduled_date, session_rpe, mood, duration_seconds, notes_coach, notes_client')
            .eq('client_id', clientData.id)
            .not('program_id', 'is', null)
            .order('scheduled_date'),
          supabase.from('journal_entries').select('entry_date')
            .eq('client_id', user.id)
            .order('entry_date', { ascending: false }).limit(365),
          supabase.from('client_tasks').select('*')
            .eq('client_id', clientData.id)
            .order('created_at'),
        ])

        setTasks((taskData || []) as ClientTask[])

        setJournalDates(new Set(((journals||[]) as JournalEntrySummary[]).map(j => j.entry_date)))

        const merged: CalItem[] = []
        for (const e of calEvts||[]) {
          const color = e.color || '#8b5cf6'
          merged.push({
            id: e.id, title: e.title,
            date: e.start_at.split('T')[0],
            start_at: e.start_at, end_at: e.end_at,
            color, icon: '📅', label: e.event_type || 'Event',
            type: 'calendar', description: e.description,
          })
        }
        for (const s of sessions||[]) {
          if (!s.scheduled_date) continue
          const done   = s.status === 'completed'
          const inProg = s.status === 'in_progress'
          merged.push({
            id: 'ws_'+s.id, title: s.title || 'Workout',
            date: s.scheduled_date,
            color: done ? '#22c55e' : inProg ? '#00c9b1' : '#f5a623',
            icon:  done ? '✅' : inProg ? '▶️' : '💪',
            label: done ? 'Completed' : inProg ? 'In Progress' : 'Scheduled',
            type: 'workout', status: s.status,
            session_rpe: s.session_rpe, mood: s.mood,
            duration_seconds: s.duration_seconds,
            description: s.notes_coach || undefined,
            source_id: s.id,
          })
        }
        merged.sort((a,b) => a.date.localeCompare(b.date))
        setItems(merged)
        setLoading(false)
      })()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [router, supabase])

  // Calendar grid helpers
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth+1, 0)
  const cells: (Date|null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_,i) => new Date(viewYear, viewMonth, i+1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsForDate = (ds: string) => items.filter(e => e.date === ds)
  const prevMonth = () => { const d=new Date(viewYear,viewMonth-1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }
  const nextMonth = () => { const d=new Date(viewYear,viewMonth+1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }

  const selectedItems = itemsForDate(selectedDate)
  const hasJournal    = journalDates.has(selectedDate)

  // Upcoming: next 6 workout sessions from today
  const upcomingWorkouts = items
    .filter(e => e.type === 'workout' && e.date >= todayStr && e.status !== 'completed')
    .slice(0, 6)

  const selectedDateObj = new Date(selectedDate + 'T00:00:00')
  const selectedLabel   = selectedDate === todayStr ? 'Today'
    : selectedDate === localDateStr(new Date(today.getTime() + 86400000)) ? 'Tomorrow'
    : selectedDateObj.toLocaleDateString([], { weekday:'long', month:'short', day:'numeric' })

  const isTaskDoneToday = (task: ClientTask) => {
    if (task.repeat === 'once')   return task.last_completed_date !== null
    if (task.repeat === 'daily')  return task.last_completed_date === todayStr
    if (task.repeat === 'weekly') {
      if (!task.last_completed_date) return false
      const last = new Date(task.last_completed_date + 'T00:00:00')
      const diff = Math.floor((new Date(todayStr + 'T00:00:00').getTime() - last.getTime()) / 86400000)
      return diff < 7
    }
    return false
  }

  const completeTask = async (task: ClientTask) => {
    await supabase.from('client_tasks').update({ last_completed_date: todayStr }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: todayStr } : t))
  }

  const uncompleteTask = async (task: ClientTask) => {
    await supabase.from('client_tasks').update({ last_completed_date: null }).eq('id', task.id)
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, last_completed_date: null } : t))
  }

  const deleteTask = async (id: string) => {
    await supabase.from('client_tasks').delete().eq('id', id)
    setTasks(prev => prev.filter(t => t.id !== id))
  }

  const saveTask = async () => {
    if (!taskTitle.trim() || !clientId) return
    setTaskSaving(true)
    const { data } = await supabase.from('client_tasks').insert({
      client_id: clientId,
      title: taskTitle.trim(),
      repeat: taskRepeat,
      due_date: taskRepeat === 'once' ? taskDate : null,
    }).select().single()
    if (data) setTasks(prev => [...prev, data as ClientTask])
    setTaskTitle(''); setTaskRepeat('once'); setTaskDate(todayStr)
    setShowAddTask(false); setTaskSaving(false); setTaskIcon('✅')
  }

  // Tasks visible on selected date
  const tasksForDate = (ds: string) => tasks.filter(t => {
    if (t.repeat === 'daily')  return true
    if (t.repeat === 'weekly') return true
    if (t.repeat === 'once')   return t.due_date === ds || (!t.due_date && ds === todayStr)
    return false
  })

  const rescheduleSession = async (sessionId: string, newDate: string) => {
    await supabase.from('workout_sessions').update({ scheduled_date: newDate }).eq('id', sessionId)
    setItems(prev => prev.map(e =>
      e.source_id === sessionId ? { ...e, date: newDate } : e
    ))
    setSelectedDate(newDate)
    setRescheduling(null)
    setReschedPick('')
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
  )

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};}
        .cal-cell{min-height:56px;padding:4px 5px;}
        @media(max-width:400px){.cal-cell{min-height:44px;padding:3px 4px;}}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, paddingBottom:80 }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, gap:12, position:'sticky', top:0, zIndex:10 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:26, background:t.border }}/>
          <div style={{ fontSize:14, fontWeight:700 }}>📅 My Schedule</div>
        </div>

        <div style={{ maxWidth:520, margin:'0 auto', padding:'16px 14px' }}>

          {/* ── WEEK STRIP ── */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'14px 12px', marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>
              This Week
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
              {weekDays.map((d, i) => {
                const ds      = localDateStr(d)
                const isToday = ds === todayStr
                const isSel   = ds === selectedDate
                const dayItems = itemsForDate(ds)
                const hasDone = dayItems.some(e => e.status === 'completed')
                const hasSched = dayItems.some(e => e.type === 'workout' && e.status !== 'completed')
                const hasEvt  = dayItems.some(e => e.type === 'calendar')
                return (
                  <div key={i} onClick={() => setSelectedDate(ds)}
                    style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 4px', borderRadius:12,
                      background: isSel ? t.teal+'20' : isToday ? t.surfaceHigh : 'transparent',
                      border: '1px solid ' + (isSel ? t.teal+'60' : isToday ? t.teal+'25' : 'transparent'),
                      cursor:'pointer' }}>
                    <div style={{ fontSize:10, fontWeight:700, color: isSel ? t.teal : t.textMuted }}>{FULL_DAYS[i]}</div>
                    <div style={{ fontSize:15, fontWeight:900, color: isSel ? t.teal : isToday ? t.text : t.textDim }}>{d.getDate()}</div>
                    {/* Status dot */}
                    <div style={{ width:6, height:6, borderRadius:'50%',
                      background: hasDone ? t.green : hasSched ? t.orange : hasEvt ? t.purple : 'transparent',
                      border: !hasDone && !hasSched && !hasEvt ? '1px solid '+t.border : 'none' }}/>
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── SELECTED DAY DETAIL ── */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <div style={{ fontSize:14, fontWeight:800, color: selectedDate === todayStr ? t.teal : t.text }}>
                {selectedLabel}
              </div>
              <button onClick={()=>{ setTaskDate(selectedDate); setShowAddTask(true) }}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 12px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Add Task
              </button>
            </div>
            {selectedItems.length === 0 && !hasJournal && tasksForDate(selectedDate).length === 0 ? (
              <div style={{ fontSize:13, color:t.textMuted, textAlign:'center', padding:'16px 0' }}>Nothing scheduled</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {selectedItems.map(e => (
                  <div key={e.id} style={{ background:t.surfaceHigh, border:'1px solid '+e.color+'30', borderRadius:12, padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: e.description || e.session_rpe ? 8 : 0 }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:e.color+'18', border:'1px solid '+e.color+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>
                        {e.icon}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.title}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:e.color }}>{e.label}
                          {e.duration_seconds ? <span style={{ color:t.textMuted, fontWeight:400 }}> · ⏱ {fmtDur(e.duration_seconds)}</span> : ''}
                        </div>
                      </div>
                      {e.start_at && <div style={{ fontSize:11, color:t.textMuted, flexShrink:0 }}>{fmtTime(e.start_at)}</div>}
                    </div>
                    {e.status==='completed' && (e.session_rpe || e.mood) && (
                      <div style={{ display:'flex', gap:10, marginBottom:8, paddingTop:8, borderTop:'1px solid '+t.border }}>
                        {e.session_rpe && <span style={{ fontSize:12, color:t.orange, fontWeight:700 }}>RPE {e.session_rpe}/10</span>}
                        {e.mood && <span style={{ fontSize:16 }}>{MOOD_ICONS[e.mood]||''}</span>}
                      </div>
                    )}
                    {e.description && (
                      <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.6, borderTop:'1px solid '+t.border, paddingTop:8, marginTop: e.session_rpe ? 0 : 0 }}>
                        📌 {e.description}
                      </div>
                    )}
                    {e.type==='workout' && e.source_id && e.status !== 'completed' && (
                      <button onClick={()=>router.push('/dashboard/client/workout/'+e.source_id)}
                        style={{ marginTop:10, width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        {e.status==='in_progress' ? '▶ Continue Workout' : '💪 Start Workout'}
                      </button>
                    )}
                    {e.type==='workout' && e.source_id && e.status !== 'completed' && (
                      rescheduling === e.source_id ? (
                        <div style={{ marginTop:8, display:'flex', flexDirection:'column' as const, gap:8 }}>
                          <div style={{ fontSize:11, fontWeight:700, color:t.textMuted }}>Move to:</div>
                          <input type="date" value={reschedPick} min={todayStr}
                            onChange={e2=>setReschedPick(e2.target.value)}
                            style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.teal+'50', borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }}
                          />
                          <div style={{ display:'flex', gap:6 }}>
                            <button
                              disabled={!reschedPick}
                              onClick={()=>{ if (reschedPick && e.source_id) rescheduleSession(e.source_id, reschedPick) }}
                              style={{ flex:1, background: reschedPick ? t.orange : t.surfaceHigh, border:'none', borderRadius:8, padding:'9px', fontSize:13, fontWeight:800, color: reschedPick ? '#000' : t.textMuted, cursor: reschedPick ? 'pointer' : 'default', fontFamily:"'DM Sans',sans-serif" }}>
                              Confirm
                            </button>
                            <button onClick={()=>{ setRescheduling(null); setReschedPick('') }}
                              style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:8, padding:'9px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={()=>{ setRescheduling(e.source_id!); setReschedPick('') }}
                          style={{ marginTop:6, width:'100%', background:'transparent', border:'1px solid '+t.border, borderRadius:10, padding:'8px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          🗓 Reschedule
                        </button>
                      )
                    )}
                    {e.type==='workout' && e.source_id && e.status==='completed' && (
                      <button onClick={()=>router.push('/dashboard/client/workout/'+e.source_id)}
                        style={{ marginTop:8, width:'100%', background:'transparent', border:'1px solid '+t.green+'40', borderRadius:10, padding:'9px', fontSize:12, fontWeight:700, color:t.green, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        ✏️ Review Session
                      </button>
                    )}
                  </div>
                ))}
                {hasJournal && (
                  <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17 }}>✍️</div>
                    <div style={{ fontSize:13, fontWeight:700 }}>Journal entry</div>
                  </div>
                )}
                {/* Tasks for this day */}
                {tasksForDate(selectedDate).map(task => {
                  const done = isTaskDoneToday(task)
                  const REPEAT_LABEL = { once:'One-time', daily:'Daily', weekly:'Weekly' }
                  return (
                    <div key={task.id} style={{ background:t.surfaceHigh, border:'1px solid '+(done ? t.green+'40' : t.teal+'30'), borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                      <button onClick={()=> done ? uncompleteTask(task) : completeTask(task)}
                        style={{ width:28, height:28, borderRadius:8, border:'2px solid '+(done?t.green:t.teal+'60'), background:done?t.green:t.tealDim, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', flexShrink:0, fontSize:14 }}>
                        {done ? '✓' : ''}
                      </button>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, textDecoration: done ? 'line-through' : 'none', color: done ? t.textMuted : t.text }}>{task.title}</div>
                        <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{REPEAT_LABEL[task.repeat]}</div>
                      </div>
                      <button onClick={()=>deleteTask(task.id)}
                        style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16, lineHeight:1, padding:4 }}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── MONTHLY CALENDAR ── */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'14px 10px', marginBottom:16 }}>
            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <button onClick={prevMonth} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'5px 12px', color:t.text, cursor:'pointer', fontSize:16, lineHeight:1 }}>‹</button>
              <div style={{ fontSize:14, fontWeight:900, flex:1, textAlign:'center' }}>{MONTHS[viewMonth]} {viewYear}</div>
              <button onClick={nextMonth} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'5px 12px', color:t.text, cursor:'pointer', fontSize:16, lineHeight:1 }}>›</button>
              <button onClick={()=>{ setViewMonth(today.getMonth()); setViewYear(today.getFullYear()); setSelectedDate(todayStr) }}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>
                Today
              </button>
            </div>
            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
              {SHORT_DAYS.map((d,i) => (
                <div key={i} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.04em', padding:'2px 0' }}>{d}</div>
              ))}
            </div>
            {/* Cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={i} className="cal-cell" style={{ opacity:0 }}/>
                const ds       = localDateStr(d)
                const isToday  = ds === todayStr
                const isSel    = ds === selectedDate
                const dayItems = itemsForDate(ds)
                const hasJ     = journalDates.has(ds)
                return (
                  <div key={i} onClick={() => setSelectedDate(ds)}
                    className="cal-cell"
                    style={{
                      background: isSel ? t.teal+'20' : isToday ? t.surfaceHigh : t.surfaceUp,
                      border: '1px solid '+(isSel ? t.teal+'60' : isToday ? t.teal+'30' : t.border),
                      borderRadius:8, cursor:'pointer',
                    }}>
                    <div style={{ fontSize:11, fontWeight: isToday ? 900 : 600, color: isSel ? t.teal : isToday ? t.text : t.textDim, lineHeight:1 }}>{d.getDate()}</div>
                    {(dayItems.length > 0 || hasJ) && (
                      <div style={{ display:'flex', gap:2, marginTop:3, flexWrap:'wrap' }}>
                        {dayItems.slice(0,3).map(e => (
                          <div key={e.id} style={{ width:5, height:5, borderRadius:'50%', background:e.color, flexShrink:0 }}/>
                        ))}
                        {hasJ && <span style={{ fontSize:6, lineHeight:1 }}>✍</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div style={{ display:'flex', gap:12, marginTop:12, justifyContent:'center', flexWrap:'wrap' }}>
              {[{ color:t.orange, label:'Workout' }, { color:t.green, label:'Done' }, { color:t.purple, label:'Event' }].map(l => (
                <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:t.textMuted }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', background:l.color }}/>
                  {l.label}
                </div>
              ))}
            </div>
          </div>

          {/* ── UPCOMING WORKOUTS ── */}
          {upcomingWorkouts.length > 0 && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:16 }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid '+t.border, fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>
                ⏭ Upcoming Workouts
              </div>
              {upcomingWorkouts.map((e, i) => {
                const d = new Date(e.date+'T00:00:00')
                const isToday = e.date === todayStr
                const isTmrw  = e.date === localDateStr(new Date(today.getTime() + 86400000))
                const dayLabel = isToday ? 'Today' : isTmrw ? 'Tomorrow'
                  : d.toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })
                return (
                  <div key={e.id} onClick={()=>{ setSelectedDate(e.date); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
                    style={{ padding:'12px 16px', borderBottom: i < upcomingWorkouts.length-1 ? '1px solid '+t.border : 'none',
                      cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:4, height:36, borderRadius:2, background:e.color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {e.icon} {e.title}
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{dayLabel}</div>
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background:e.color+'18', color:e.color }}>{e.label}</div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      </div>
      <ClientBottomNav />

      {/* Add Task Modal */}
      {showAddTask && (
        <>
          <div onClick={()=>setShowAddTask(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:50 }}/>
          <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:t.surface, borderTop:'1px solid '+t.border, borderRadius:'20px 20px 0 0', zIndex:51, padding:'24px 20px 48px', fontFamily:"'DM Sans',sans-serif" }}>
            <div style={{ width:36, height:4, borderRadius:2, background:t.border, margin:'0 auto 20px' }}/>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:20 }}>Add Task</div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>Task</div>
              <input autoFocus value={taskTitle} onChange={e=>setTaskTitle(e.target.value)}
                placeholder="e.g. Take medication, Call doctor..."
                style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:15, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', colorScheme:'dark', boxSizing:'border-box' as const }}/>
            </div>

            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>Repeat</div>
              <div style={{ display:'flex', gap:8 }}>
                {(['once','daily','weekly'] as const).map(r => (
                  <button key={r} onClick={()=>setTaskRepeat(r)}
                    style={{ flex:1, padding:'9px', borderRadius:10, border:'1px solid '+(taskRepeat===r?t.teal+'60':t.border), background:taskRepeat===r?t.tealDim:'transparent', fontSize:13, fontWeight:700, color:taskRepeat===r?t.teal:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' as const }}>
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {taskRepeat === 'once' && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>Date</div>
                <input type="date" value={taskDate} onChange={e=>setTaskDate(e.target.value)}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:14, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', colorScheme:'dark', boxSizing:'border-box' as const }}/>
              </div>
            )}


            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>Icon</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                {['✅','⭐','💊','💧','📖','🏃','🧘','💪','🥗','😴','🎯','🔔','📝','🛒','💰','🧹','📞','🚗','❤️','🔥'].map(e => (
                  <button key={e} onClick={()=>setTaskIcon(e)}
                    style={{ width:38, height:38, borderRadius:9, border:'2px solid '+(taskIcon===e?t.teal:t.border), background:taskIcon===e?t.tealDim:t.surfaceHigh, fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <button onClick={saveTask} disabled={!taskTitle.trim() || taskSaving}
              style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background: taskTitle.trim() ? `linear-gradient(135deg,${t.teal},${t.teal}cc)` : t.surfaceHigh, color: taskTitle.trim() ? '#000' : t.textMuted, fontSize:15, fontWeight:800, cursor: taskTitle.trim() ? 'pointer' : 'default', fontFamily:"'DM Sans',sans-serif" }}>
              {taskSaving ? 'Saving...' : 'Save Task'}
            </button>
          </div>
        </>
      )}
    </>
  )
}
