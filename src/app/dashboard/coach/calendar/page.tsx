'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", pink:"#f472b6",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const TYPE_META: Record<string, { label:string, icon:string, color:string }> = {
  session:       { label:'Session',     icon:'🏋️', color:'#00c9b1' },
  check_in_call: { label:'Check-in',   icon:'📞', color:'#8b5cf6' },
  consultation:  { label:'Consult',    icon:'💬', color:'#f472b6' },
  rest_day:      { label:'Rest Day',   icon:'😴', color:'#5a5a78' },
  milestone:     { label:'Milestone',  icon:'🏆', color:'#22c55e' },
  note:          { label:'Note/Block', icon:'📌', color:'#f5a623' },
  other:         { label:'Other',      icon:'📅', color:'#38bdf8' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function formatTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
}
function formatDuration(start: string, end?: string) {
  if (!end) return ''
  const m = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000)
  return m < 60 ? `${m}m` : `${Math.floor(m/60)}h${m%60?` ${m%60}m`:''}`
}

// ── Event Modal (calendar_events) ────────────────────────────────────────────
function EventModal({ event, clients, onSave, onDelete, onClose, defaultDate }: any) {
  const isNew = !event?.id
  const inp = { background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', colorScheme:'dark' as const }
  const [title,    setTitle]    = useState(event?.title || '')
  const [type,     setType]     = useState(event?.event_type || 'session')
  const [clientId, setClientId] = useState(event?.client_id || '')
  const [startAt,  setStartAt]  = useState(event?.start_at ? new Date(event.start_at).toISOString().slice(0,16) : (defaultDate ? defaultDate+'T10:00' : ''))
  const [endAt,    setEndAt]    = useState(event?.end_at   ? new Date(event.end_at).toISOString().slice(0,16)   : (defaultDate ? defaultDate+'T10:30' : ''))
  const [desc,     setDesc]     = useState(event?.description || '')
  const [color,    setColor]    = useState(event?.color || TYPE_META[type]?.color || '#00c9b1')
  const [saving,   setSaving]   = useState(false)

  const handleSave = async () => {
    if (!title || !startAt) return
    setSaving(true)
    await onSave({ title, event_type:type, client_id:clientId||null, start_at:startAt, end_at:endAt||null, description:desc, color })
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#00000088', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>{isNew ? '📅 New Event' : '✏️ Edit Event'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Title *</div>
            <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Event title..." style={inp} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Type</div>
              <select value={type} onChange={e=>{setType(e.target.value);setColor(TYPE_META[e.target.value]?.color||'#00c9b1')}} style={inp}>
                {Object.entries(TYPE_META).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Client</div>
              <select value={clientId} onChange={e=>setClientId(e.target.value)} style={inp}>
                <option value="">— All clients —</option>
                {clients.map((c:any) => {
                  const name = Array.isArray(c.profiles) ? c.profiles[0]?.full_name : c.profiles?.full_name || 'Client'
                  return <option key={c.id} value={c.id}>{name}</option>
                })}
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Start *</div>
              <input type="datetime-local" value={startAt} onChange={e=>setStartAt(e.target.value)} style={inp} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>End</div>
              <input type="datetime-local" value={endAt} onChange={e=>setEndAt(e.target.value)} style={inp} />
            </div>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Notes</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={2} placeholder="Optional notes..." style={{ ...inp, resize:'vertical' as const }} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:4 }}>
            <button onClick={handleSave} disabled={saving||!title||!startAt}
              style={{ flex:1, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving||!title||!startAt?0.5:1 }}>
              {saving ? 'Saving...' : isNew ? 'Create Event' : 'Save Changes'}
            </button>
            {!isNew && (
              <button onClick={()=>onDelete(event.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:10, padding:'11px 16px', fontSize:13, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Schedule Workout Modal (workout_sessions) ─────────────────────────────────
function ScheduleWorkoutModal({ clients, coachId, defaultDate, onSave, onClose }: any) {
  const supabase = createClient()
  const inp = { background:'#1d1d2e', border:'1px solid #252538', borderRadius:8, padding:'9px 12px', fontSize:13, color:'#eeeef8', outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', colorScheme:'dark' as const }

  const [clientId,   setClientId]   = useState('')
  const [date,       setDate]       = useState(defaultDate || '')
  const [mode,       setMode]       = useState<'blank'|'template'>('blank')
  const [title,      setTitle]      = useState('')
  const [templates,  setTemplates]  = useState<any[]>([])
  const [templateId, setTemplateId] = useState('')
  const [loadingTpl, setLoadingTpl] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  // Load templates when mode switches
  useEffect(() => {
    if (mode === 'template' && templates.length === 0) loadTemplates()
  }, [mode])

  const loadTemplates = async () => {
    setLoadingTpl(true)
    const { data } = await supabase.from('programs').select('id, name').eq('is_template', true).order('name')
    setTemplates(data || [])
    setLoadingTpl(false)
  }

  const handleSchedule = async () => {
    if (!clientId || !date) { setError('Client and date are required.'); return }
    if (mode === 'blank' && !title.trim()) { setError('Workout title is required.'); return }
    if (mode === 'template' && !templateId) { setError('Please select a template.'); return }
    setSaving(true); setError('')

    if (mode === 'blank') {
      // Create a single blank workout session
      const { error: err } = await supabase.from('workout_sessions').insert({
        client_id: clientId,
        coach_id:  coachId,
        title:     title.trim(),
        scheduled_date: date,
        status: 'scheduled',
      })
      if (err) { setError(err.message); setSaving(false); return }
    } else {
      // Copy all sessions from the template program to this client + date
      const { data: tplSessions } = await supabase
        .from('workout_sessions')
        .select('id, title, day_number, day_label')
        .eq('program_id', templateId)
        .eq('status', 'template')
        .order('day_number')

      if (!tplSessions?.length) {
        // Template has no sessions — create a single named session
        const tpl = templates.find(t => t.id === templateId)
        await supabase.from('workout_sessions').insert({
          client_id: clientId, coach_id: coachId,
          title: tpl?.name || 'Workout',
          scheduled_date: date, status: 'scheduled',
        })
      } else if (tplSessions.length === 1) {
        // Single session template — schedule on the picked date
        const s = tplSessions[0]
        const { data: newSession } = await supabase.from('workout_sessions').insert({
          client_id: clientId, coach_id: coachId,
          title: s.title || s.day_label || 'Workout',
          scheduled_date: date, status: 'scheduled',
        }).select().single()
        if (newSession) await copyExercises(s.id, newSession.id)
      } else {
        // Multi-session template — schedule each session on consecutive days
        for (let i = 0; i < tplSessions.length; i++) {
          const s = tplSessions[i]
          const d = new Date(date)
          d.setDate(d.getDate() + i)
          const scheduledDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
          const { data: newSession } = await supabase.from('workout_sessions').insert({
            client_id: clientId, coach_id: coachId,
            title: s.title || s.day_label || `Day ${i+1}`,
            scheduled_date: scheduledDate, status: 'scheduled',
          }).select().single()
          if (newSession) await copyExercises(s.id, newSession.id)
        }
      }
    }
    setSaving(false)
    onSave()
  }

  const copyExercises = async (fromSessionId: string, toSessionId: string) => {
    const { data: exs } = await supabase.from('session_exercises').select('*').eq('session_id', fromSessionId).order('order_index')
    if (!exs?.length) return
    await supabase.from('session_exercises').insert(
      exs.map(({ id: _id, session_id: _sid, created_at: _ca, ...rest }: any) => ({ ...rest, session_id: toSessionId }))
    )
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#00000088', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'#0f0f1a', border:'1px solid #252538', borderRadius:20, padding:28, width:'100%', maxWidth:440, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>🏋️ Schedule Workout</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#5a5a78', cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

          {/* Client */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', marginBottom:5, textTransform:'uppercase' }}>Client *</div>
            <select value={clientId} onChange={e=>setClientId(e.target.value)} style={inp}>
              <option value="">— Select client —</option>
              {clients.map((c:any) => {
                const name = Array.isArray(c.profiles) ? c.profiles[0]?.full_name : c.profiles?.full_name || 'Client'
                return <option key={c.id} value={c.id}>{name}</option>
              })}
            </select>
          </div>

          {/* Date */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', marginBottom:5, textTransform:'uppercase' }}>Date *</div>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp} />
          </div>

          {/* Mode toggle */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', marginBottom:8, textTransform:'uppercase' }}>Workout</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
              {(['blank','template'] as const).map(m => (
                <button key={m} onClick={()=>setMode(m)}
                  style={{ padding:'10px', borderRadius:10, border:'1px solid '+(mode===m ? '#00c9b1' : '#252538'), background:mode===m ? '#00c9b115' : 'transparent', color:mode===m ? '#00c9b1' : '#8888a8', fontWeight:700, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {m === 'blank' ? '✏️ Blank Workout' : '📋 From Template'}
                </button>
              ))}
            </div>
            {mode === 'blank' && (
              <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Workout title (e.g. Upper Body A)..." style={inp} />
            )}
            {mode === 'template' && (
              loadingTpl
                ? <div style={{ fontSize:12, color:'#5a5a78', padding:'10px 0' }}>Loading templates...</div>
                : templates.length === 0
                  ? <div style={{ fontSize:12, color:'#5a5a78', padding:'10px 0' }}>No templates yet. Create one in Programs.</div>
                  : <select value={templateId} onChange={e=>setTemplateId(e.target.value)} style={inp}>
                      <option value="">— Select template —</option>
                      {templates.map(tpl => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                    </select>
            )}
          </div>

          {mode === 'template' && templateId && (
            <div style={{ fontSize:11, color:'#5a5a78', background:'#1d1d2e', borderRadius:8, padding:'8px 12px' }}>
              Multi-session templates schedule each session on consecutive days starting from the date above.
            </div>
          )}

          {error && <div style={{ fontSize:12, color:'#ef4444', background:'#ef444415', borderRadius:8, padding:'8px 12px' }}>{error}</div>}

          <button onClick={handleSchedule} disabled={saving}
            style={{ background:'linear-gradient(135deg,#00c9b1,#00c9b1cc)', border:'none', borderRadius:10, padding:'12px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1, marginTop:4 }}>
            {saving ? 'Scheduling...' : '📅 Schedule Workout'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CoachCalendar() {
  const today    = new Date()
  const supabase = createClient()
  const router   = useRouter()

  const [calEvents,   setCalEvents]   = useState<any[]>([])
  const [sessions,    setSessions]    = useState<any[]>([])
  const [clients,     setClients]     = useState<any[]>([])
  const [coachId,     setCoachId]     = useState('')
  const [loading,     setLoading]     = useState(true)
  const [viewMonth,   setViewMonth]   = useState(today.getMonth())
  const [viewYear,    setViewYear]    = useState(today.getFullYear())
  const [eventModal,  setEventModal]  = useState<any>(null)   // { event? } | { newDate }
  const [wkModal,     setWkModal]     = useState<any>(null)   // { defaultDate }
  const [selected,    setSelected]    = useState<any>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)
    const [{ data: evts }, { data: cls }, { data: sess }] = await Promise.all([
      supabase.from('calendar_events').select('*').eq('coach_id', user.id).order('start_at'),
      supabase.from('clients').select('id, profiles!profile_id(full_name)').eq('coach_id', user.id),
      supabase.from('workout_sessions')
        .select('id, title, scheduled_date, status, client_id')
        .eq('coach_id', user.id)
        .not('scheduled_date', 'is', null)
        .neq('status', 'template')
        .order('scheduled_date'),
    ])
    setCalEvents(evts   || [])
    setClients(cls      || [])
    setSessions(sess    || [])
    setLoading(false)
  }

  const reloadEvents = async () => {
    const { data } = await supabase.from('calendar_events').select('*').eq('coach_id', coachId).order('start_at')
    setCalEvents(data || [])
  }
  const reloadSessions = async () => {
    const { data } = await supabase.from('workout_sessions')
      .select('id, title, scheduled_date, status, client_id')
      .eq('coach_id', coachId)
      .not('scheduled_date', 'is', null)
      .neq('status', 'template')
      .order('scheduled_date')
    setSessions(data || [])
  }

  const handleEventSave = async (payload: any) => {
    if (eventModal?.event?.id) {
      await supabase.from('calendar_events').update(payload).eq('id', eventModal.event.id)
    } else {
      await supabase.from('calendar_events').insert({ ...payload, coach_id: coachId })
    }
    await reloadEvents(); setEventModal(null); setSelected(null)
  }
  const handleEventDelete = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id)
    await reloadEvents(); setEventModal(null); setSelected(null)
  }

  const clientName = (id: string) => {
    const c = clients.find(c => c.id === id)
    const p = c?.profiles
    return (Array.isArray(p) ? p[0]?.full_name : p?.full_name) || null
  }

  // Merge calendar events + sessions into unified list per day
  type DayItem = { id:string, title:string, color:string, type:'event'|'session', status?:string, raw:any }
  const itemsForDay = (d: Date): DayItem[] => {
    const evts: DayItem[] = calEvents
      .filter(e => isSameDay(new Date(e.start_at), d))
      .map(e => ({ id:e.id, title:e.title, color:e.color || TYPE_META[e.event_type]?.color || t.teal, type:'event', raw:e }))
    const sess: DayItem[] = sessions
      .filter(s => s.scheduled_date === `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)
      .map(s => ({
        id:s.id, title:s.title||'Workout', type:'session',
        color: s.status==='completed' ? '#22c55e' : s.status==='in_progress' ? '#f5a623' : t.teal,
        status:s.status, raw:s,
      }))
    return [...evts, ...sess]
  }

  // Build grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth+1, 0)
  const cells: (Date|null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_,i) => new Date(viewYear, viewMonth, i+1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  // Upcoming: events + sessions in the future
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const upcomingEvts  = calEvents.filter(e => e.start_at >= todayStr).slice(0, 5)
  const upcomingSess  = sessions.filter(s  => s.scheduled_date >= todayStr).slice(0, 5)
  const upcoming = [
    ...upcomingEvts.map(e => ({ ...e, _type:'event', _date: e.start_at.split('T')[0], _color: e.color||t.teal })),
    ...upcomingSess.map(s => ({ ...s, _type:'session', _date: s.scheduled_date, _color: s.status==='completed'?'#22c55e':t.teal })),
  ].sort((a,b) => a._date.localeCompare(b._date)).slice(0, 8)

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .cal-grid{display:grid;grid-template-columns:1fr 270px;gap:0;max-width:1200px;margin:0 auto;padding:16px 12px;}
        .cal-cell{min-height:80px;}
        .cal-sidebar{}
        @media(max-width:750px){.cal-grid{grid-template-columns:1fr;}.cal-sidebar{display:none;}.cal-cell{min-height:52px;}}
        @media(max-width:480px){.cal-cell{min-height:44px;padding:4px 5px!important;}.cal-chip{display:none!important;}.cal-cell-date{font-size:11px!important;}}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 16px', display:'flex', alignItems:'center', height:56, gap:10 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>←</button>
          <div style={{ width:1, height:26, background:t.border }}/>
          <div style={{ fontSize:14, fontWeight:700 }}>📅 Calendar</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>setWkModal({ defaultDate: todayStr })}
            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'7px 13px', fontSize:12, fontWeight:800, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Workout
          </button>
          <button onClick={()=>setEventModal({ newDate: todayStr })}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'7px 13px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Event
          </button>
        </div>

        <div className="cal-grid">
          <div style={{ paddingRight:20 }}>

            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
              <button onClick={()=>{ const d=new Date(viewYear,viewMonth-1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
                style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', color:t.text, cursor:'pointer', fontSize:16 }}>‹</button>
              <div style={{ fontSize:16, fontWeight:900, flex:1, textAlign:'center' }}>{MONTHS[viewMonth]} {viewYear}</div>
              <button onClick={()=>{ const d=new Date(viewYear,viewMonth+1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
                style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', color:t.text, cursor:'pointer', fontSize:16 }}>›</button>
              <button onClick={()=>{ setViewMonth(today.getMonth()); setViewYear(today.getFullYear()) }}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>Today</button>
            </div>

            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
              {['S','M','T','W','T','F','S'].map((d,i) => (
                <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 0' }}>{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {cells.map((d, i) => {
                const isToday  = d ? isSameDay(d, today) : false
                const dayItems = d ? itemsForDay(d) : []
                const dateStr  = d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : ''
                return (
                  <div key={i}
                    onClick={()=>{ if(d) setWkModal({ defaultDate: dateStr }) }}
                    className="cal-cell"
                    style={{ background:isToday?t.surfaceHigh:t.surface, border:'1px solid '+(isToday?t.teal+'40':t.border), borderRadius:8, padding:'5px 6px', cursor:d?'pointer':'default', opacity:d?1:0.3, overflow:'hidden' }}>
                    {d && <>
                      <div className="cal-cell-date" style={{ fontSize:12, fontWeight:isToday?900:600, color:isToday?t.teal:t.textDim, marginBottom:3 }}>{d.getDate()}</div>
                      {dayItems.length > 0 && (
                        <div style={{ display:'flex', gap:2, flexWrap:'wrap', marginBottom:2 }}>
                          {dayItems.slice(0,3).map(item => (
                            <div key={item.id} style={{ width:5, height:5, borderRadius:'50%', background:item.color, flexShrink:0 }}/>
                          ))}
                          {dayItems.length > 3 && <div style={{ fontSize:8, color:t.textMuted, fontWeight:700 }}>+{dayItems.length-3}</div>}
                        </div>
                      )}
                      {dayItems.slice(0,2).map(item => (
                        <div key={item.id} className="cal-chip"
                          onClick={ev=>{ ev.stopPropagation(); setSelected(item) }}
                          style={{ fontSize:9, fontWeight:700, background:item.color+'22', color:item.color, borderRadius:4, padding:'2px 4px', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                          {item.type==='session' ? '🏋️' : '📅'} {item.title}
                        </div>
                      ))}
                    </>}
                  </div>
                )
              })}
            </div>

            {/* Selected detail (mobile) */}
            {selected && (
              <div style={{ background:t.surface, border:'1px solid '+selected.color+'50', borderRadius:14, padding:16, marginTop:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:15, fontWeight:800 }}>{selected.type==='session'?'🏋️':'📅'} {selected.title}</div>
                  <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
                <div style={{ fontSize:12, color:t.textDim }}>
                  {selected.type==='session' ? selected.raw.scheduled_date : selected.raw.start_at?.split('T')[0]}
                  {selected.raw.client_id && ` · ${clientName(selected.raw.client_id)}`}
                </div>
                {selected.type==='session' && (
                  <div style={{ marginTop:8 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:selected.color+'22', color:selected.color }}>{selected.status}</span>
                  </div>
                )}
                {selected.type==='event' && (
                  <button onClick={()=>{ setEventModal({ event:selected.raw }); setSelected(null) }}
                    style={{ marginTop:10, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>
                    Edit Event ✏️
                  </button>
                )}
              </div>
            )}

            {/* Mobile upcoming */}
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Upcoming</div>
              {upcoming.length === 0
                ? <div style={{ color:t.textMuted, fontSize:12, textAlign:'center', padding:20 }}>Nothing scheduled</div>
                : upcoming.map((item, i) => (
                  <div key={i} style={{ display:'flex', gap:10, padding:'10px 12px', background:t.surface, border:'1px solid '+t.border, borderRadius:12, marginBottom:8, alignItems:'center' }}>
                    <div style={{ width:3, minHeight:32, borderRadius:2, background:item._color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item._type==='session'?'🏋️':'📅'} {item.title}
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted }}>
                        {item._date}{item.client_id ? ` · ${clientName(item.client_id)}` : ''}
                      </div>
                    </div>
                  </div>
                ))
              }
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:8 }}>
                <button onClick={()=>setWkModal({ defaultDate:todayStr })}
                  style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'11px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer' }}>
                  + Schedule Workout
                </button>
                <button onClick={()=>setEventModal({ newDate:todayStr })}
                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'11px', fontSize:12, fontWeight:700, color:t.text, cursor:'pointer' }}>
                  + Add Event
                </button>
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="cal-sidebar">
            {selected && (
              <div style={{ background:t.surface, border:'1px solid '+selected.color+'50', borderRadius:14, padding:18, marginBottom:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>{selected.type==='session'?'🏋️':'📅'} {selected.title}</div>
                  <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:14 }}>✕</button>
                </div>
                <div style={{ fontSize:12, color:t.textDim, marginBottom:6 }}>
                  {selected.type==='session' ? selected.raw.scheduled_date : new Date(selected.raw.start_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}
                  {selected.raw.client_id && ` · ${clientName(selected.raw.client_id)}`}
                </div>
                {selected.type==='session' && <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:selected.color+'22', color:selected.color }}>{selected.status}</span>}
                {selected.type==='event' && (
                  <>
                    {selected.raw.description && <div style={{ fontSize:12, color:t.textMuted, borderTop:'1px solid '+t.border, paddingTop:8, marginTop:8 }}>{selected.raw.description}</div>}
                    <button onClick={()=>{ setEventModal({ event:selected.raw }); setSelected(null) }}
                      style={{ marginTop:10, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>
                      Edit Event ✏️
                    </button>
                  </>
                )}
              </div>
            )}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, overflow:'hidden', marginBottom:12 }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid '+t.border, fontSize:12, fontWeight:800 }}>⏰ Upcoming</div>
              {upcoming.length === 0
                ? <div style={{ padding:20, textAlign:'center', color:t.textMuted, fontSize:12 }}>Nothing scheduled</div>
                : upcoming.map((item, i) => (
                  <div key={i} onClick={()=>setSelected(item)}
                    style={{ padding:'10px 16px', borderBottom:'1px solid '+t.border, cursor:'pointer', display:'flex', gap:10, alignItems:'center' }}>
                    <div style={{ width:3, height:32, borderRadius:2, background:item._color, flexShrink:0 }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                        {item._type==='session'?'🏋️':'📅'} {item.title}
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted }}>
                        {item._date}{item.client_id ? ` · ${clientName(item.client_id)}` : ''}
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={()=>setWkModal({ defaultDate:todayStr })}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'11px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer' }}>
                🏋️ Schedule Workout
              </button>
              <button onClick={()=>setEventModal({ newDate:todayStr })}
                style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer' }}>
                📅 Add Event
              </button>
            </div>
          </div>
        </div>

        {/* Modals */}
        {eventModal && (
          <EventModal
            event={eventModal.event || null}
            clients={clients}
            defaultDate={eventModal.newDate}
            onSave={handleEventSave}
            onDelete={handleEventDelete}
            onClose={()=>setEventModal(null)}
          />
        )}
        {wkModal && (
          <ScheduleWorkoutModal
            clients={clients}
            coachId={coachId}
            defaultDate={wkModal.defaultDate}
            onSave={async ()=>{ await reloadSessions(); setWkModal(null) }}
            onClose={()=>setWkModal(null)}
          />
        )}
      </div>
    </>
  )
}
