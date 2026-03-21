'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', green:'#22c55e', pink:'#f472b6',
  red:'#ef4444', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

// Unified event type covering both calendar_events + workout_sessions
type CalItem = {
  id: string
  title: string
  date: string        // YYYY-MM-DD
  start_at?: string   // full ISO for calendar events
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
  source_id?: string  // workout session id for linking
}

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const SHORT_DAYS = ['S','M','T','W','T','F','S']

const EVENT_TYPE_META: Record<string, { label:string, icon:string, color:string }> = {
  session:       { label:'Training',    icon:'🏋️', color:'#00c9b1' },
  check_in_call: { label:'Check-in',   icon:'📞', color:'#8b5cf6' },
  consultation:  { label:'Consult',    icon:'🤝', color:'#f472b6' },
  rest_day:      { label:'Rest Day',   icon:'😴', color:'#5a5a78' },
  milestone:     { label:'Milestone',  icon:'🎯', color:'#22c55e' },
  note:          { label:'Note',       icon:'📝', color:'#f5a623' },
  other:         { label:'Event',      icon:'📌', color:'#38bdf8' },
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })
}
function fmtDate(d: string) {
  return new Date(d+'T00:00:00').toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })
}
function fmtDur(s: number) {
  return s ? `${Math.floor(s/60)}m` : ''
}

export default function ClientCalendarPage() {
  const today   = new Date()
  const supabase = createClient()
  const router   = useRouter()

  const [items,     setItems]     = useState<CalItem[]>([])
  const [journalDates, setJournalDates] = useState<Set<string>>(new Set())
  const [loading,   setLoading]   = useState(true)
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [selected,  setSelected]  = useState<CalItem|null>(null)
  const [mobile,    setMobile]    = useState(false)

  useEffect(() => {
    setMobile(window.innerWidth < 600)
    const handleResize = () => setMobile(window.innerWidth < 600)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: clientData } = await supabase
      .from('clients').select('id, coach_id').eq('profile_id', user.id).single()
    if (!clientData) { setLoading(false); return }

    // Load calendar events, workout sessions, and journal entries in parallel
    const [{ data: calEvts }, { data: sessions }, { data: journals }] = await Promise.all([
      supabase.from('calendar_events').select('*')
        .eq('coach_id', clientData.coach_id)
        .eq('client_id', clientData.id)
        .order('start_at'),
      supabase.from('workout_sessions').select('id, title, status, scheduled_date, session_rpe, mood, duration_seconds, notes_coach, notes_client')
        .eq('client_id', clientData.id)
        .order('scheduled_date'),
      supabase.from('journal_entries').select('entry_date, is_private')
        .eq('client_id', clientData.id)
        .order('entry_date', { ascending: false })
        .limit(365),
    ])

    // Store journal dates for dot indicators
    setJournalDates(new Set((journals || []).map((j:any) => j.entry_date)))

    const merged: CalItem[] = []

    // Calendar events from coach
    for (const e of calEvts || []) {
      const meta = EVENT_TYPE_META[e.event_type] || EVENT_TYPE_META.other
      merged.push({
        id: e.id, title: e.title,
        date: e.start_at.split('T')[0],
        start_at: e.start_at, end_at: e.end_at,
        color: e.color || meta.color,
        icon: meta.icon, label: meta.label,
        type: 'calendar',
        description: e.description,
      })
    }

    // Workout sessions from program
    for (const s of sessions || []) {
      if (!s.scheduled_date) continue
      const done = s.status === 'completed'
      const inProg = s.status === 'in_progress'
      merged.push({
        id: 'ws_'+s.id, title: s.title || 'Workout',
        date: s.scheduled_date,
        color: done ? '#22c55e' : inProg ? '#00c9b1' : '#f5a623',
        icon: done ? '✅' : inProg ? '▶️' : '💪',
        label: done ? 'Completed' : inProg ? 'In Progress' : 'Workout',
        type: 'workout', status: s.status,
        session_rpe: s.session_rpe, mood: s.mood,
        duration_seconds: s.duration_seconds,
        description: s.notes_coach || undefined,
        source_id: s.id,
      })
    }

    // Sort by date
    merged.sort((a,b) => a.date.localeCompare(b.date))
    setItems(merged)
    setLoading(false)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth+1, 0)
  const cells: (Date|null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_,i) => new Date(viewYear, viewMonth, i+1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsForDay = (d: Date) =>
    items.filter(e => e.date === d.toISOString().split('T')[0])

  const upcomingItems = items
    .filter(e => new Date(e.date+'T23:59:59') >= today)
    .slice(0, 8)

  const prevMonth = () => { const d=new Date(viewYear,viewMonth-1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }
  const nextMonth = () => { const d=new Date(viewYear,viewMonth+1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }

  const MOOD_ICONS: Record<string,string> = { great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>
      Loading...
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};}
        .cal-layout{display:grid;grid-template-columns:1fr 220px;gap:16px;}
        .cal-cell{min-height:72px;}
        @media(max-width:720px){
          .cal-layout{grid-template-columns:1fr;}
          .cal-sidebar{display:none;}
          .cal-cell{min-height:52px;}
        }
        @media(max-width:480px){
          .cal-cell{min-height:44px;padding:4px!important;}
          .cal-cell-date{font-size:12px!important;}
        }
        @media(max-width:380px){
          .cal-cell{min-height:38px;padding:3px!important;}
          .cal-cell-date{font-size:11px!important;}
        }
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:26, background:t.border }}/>
          <div style={{ fontSize:14, fontWeight:700 }}>📅 My Schedule</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:11, color:t.textMuted }}>{items.length} events</div>
        </div>

        <div style={{ maxWidth:860, margin:'0 auto', padding:'12px 8px' }}>

          {/* Legend */}
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:12 }}>
            {[
              { color:'#f5a623', label:'Workout' },
              { color:'#00c9b1', label:'In progress' },
              { color:'#22c55e', label:'Done' },
              { color:'#8b5cf6', label:'Event' },
            ].map(l => (
              <div key={l.label} style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:t.textMuted }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:l.color, flexShrink:0 }}/>
                {l.label}
              </div>
            ))}
          </div>

          {/* Month nav */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
            <button onClick={prevMonth}
              style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', color:t.text, cursor:'pointer', fontSize:16 }}>‹</button>
            <div style={{ fontSize:16, fontWeight:900, flex:1, textAlign:'center' }}>{MONTHS[viewMonth]} {viewYear}</div>
            <button onClick={nextMonth}
              style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', color:t.text, cursor:'pointer', fontSize:16 }}>›</button>
            <button onClick={()=>{ setViewMonth(today.getMonth()); setViewYear(today.getFullYear()) }}
              style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>
              Today
            </button>
          </div>

          <div className="cal-layout">

            {/* Calendar grid */}
            <div>
              {/* Day headers */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
                {SHORT_DAYS.map((d,i) => (
                  <div key={i} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', padding:'4px 0', letterSpacing:'0.04em' }}>{d}</div>
                ))}
              </div>

              {/* Cells */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {cells.map((d, i) => {
                  const isToday  = d ? isSameDay(d, today) : false
                  const dayItems = d ? itemsForDay(d) : []
                  const dateStr  = d ? d.toISOString().split('T')[0] : ''
                  const hasJournal = d ? journalDates.has(dateStr) : false
                  return (
                    <div key={i}
                      onClick={() => { if(d && (dayItems.length || hasJournal)) setSelected(dayItems[0] || null) }}
                      className="cal-cell"
                      style={{
                        background: isToday ? t.surfaceHigh : t.surface,
                        border: '1px solid '+(isToday ? t.teal+'50' : t.border),
                        borderRadius: 8,
                        padding: '5px 6px',
                        opacity: d ? 1 : 0.2,
                        cursor: d && (dayItems.length || hasJournal) ? 'pointer' : 'default',
                        position: 'relative' as const,
                        overflow: 'hidden',
                      }}>
                      {d && (
                        <>
                          <div className="cal-cell-date" style={{ fontSize:12, fontWeight: isToday ? 900 : 600, color: isToday ? t.teal : t.textDim, marginBottom:2, lineHeight:1 }}>
                            {d.getDate()}
                          </div>
                          {/* Dot indicators — compact on mobile */}
                          {(dayItems.length > 0 || hasJournal) && (
                            <div style={{ display:'flex', gap:2, flexWrap:'wrap' }}>
                              {dayItems.slice(0,3).map(e => (
                                <div key={e.id} style={{ width:5, height:5, borderRadius:'50%', background:e.color, flexShrink:0 }}/>
                              ))}
                              {hasJournal && <span style={{ fontSize:7, lineHeight:1 }}>✍️</span>}
                              {dayItems.length > 3 && <div style={{ fontSize:8, color:t.textMuted, fontWeight:700 }}>+{dayItems.length-3}</div>}
                            </div>
                          )}
                          {/* Chips only on wider desktop (>720px sidebar visible) */}
                          {!mobile && dayItems.slice(0,1).map(e => (
                            <div key={e.id} onClick={ev=>{ev.stopPropagation();setSelected(e)}}
                              style={{ fontSize:9, fontWeight:700, background:e.color+'22', color:e.color, borderRadius:4, padding:'1px 4px', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                              {e.icon} {e.title}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Mobile: selected event detail inline */}
              {mobile && selected && (
                <div style={{ background:t.surface, border:'1px solid '+(selected.color+'50'), borderRadius:14, padding:16, marginTop:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:selected.color, textTransform:'uppercase', marginBottom:4 }}>
                        {selected.icon} {selected.label}
                      </div>
                      <div style={{ fontSize:15, fontWeight:800 }}>{selected.title}</div>
                    </div>
                    <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16 }}>✕</button>
                  </div>
                  <div style={{ fontSize:12, color:t.textDim, marginBottom:6 }}>📅 {fmtDate(selected.date)}</div>
                  {selected.start_at && (
                    <div style={{ fontSize:12, color:t.textDim, marginBottom:6 }}>
                      🕐 {fmtTime(selected.start_at)}{selected.end_at && ` → ${fmtTime(selected.end_at)}`}
                    </div>
                  )}
                  {selected.type==='workout' && selected.status==='completed' && (
                    <div style={{ display:'flex', gap:10, marginBottom:6, flexWrap:'wrap' }}>
                      {selected.session_rpe && <span style={{ fontSize:11, color:t.orange }}>RPE {selected.session_rpe}</span>}
                      {selected.mood && <span style={{ fontSize:14 }}>{MOOD_ICONS[selected.mood]||''}</span>}
                      {selected.duration_seconds && <span style={{ fontSize:11, color:t.teal }}>⏱ {fmtDur(selected.duration_seconds)}</span>}
                    </div>
                  )}
                  {selected.description && (
                    <div style={{ fontSize:12, color:t.textMuted, borderTop:'1px solid '+t.border, paddingTop:8, marginTop:8, lineHeight:1.5 }}>{selected.description}</div>
                  )}
                  {selected.type==='workout' && selected.source_id && selected.status!=='completed' && (
                    <button onClick={()=>router.push('/dashboard/client/workout/'+selected.source_id)}
                      style={{ marginTop:10, width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'10px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {selected.status==='in_progress' ? '▶ Continue Workout' : '💪 Start Workout'}
                    </button>
                  )}
                </div>
              )}

              {/* Mobile: upcoming list */}
              {mobile && (
                <div style={{ marginTop:16 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>Upcoming</div>
                  {upcomingItems.length===0 ? (
                    <div style={{ color:t.textMuted, fontSize:12, textAlign:'center', padding:20 }}>Nothing coming up</div>
                  ) : upcomingItems.map(e => (
                    <div key={e.id} onClick={()=>setSelected(e)}
                      style={{ display:'flex', gap:10, padding:'10px 12px', background:t.surface, border:'1px solid '+t.border, borderRadius:12, marginBottom:8, cursor:'pointer', alignItems:'flex-start' }}>
                      <div style={{ width:3, minHeight:36, borderRadius:2, background:e.color, flexShrink:0, marginTop:2 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{e.title}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>
                          {new Date(e.date+'T00:00:00').toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}
                          {e.start_at ? ' · '+fmtTime(e.start_at) : ''}
                        </div>
                      </div>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:e.color+'18', color:e.color }}>{e.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sidebar — desktop only */}
            <div className="cal-sidebar" style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Selected detail */}
              {selected && (
                <div style={{ background:t.surface, border:'1px solid '+(selected.color+'50'), borderRadius:14, padding:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:selected.color, textTransform:'uppercase' }}>
                      {selected.icon} {selected.label}
                    </div>
                    <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13 }}>✕</button>
                  </div>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:6 }}>{selected.title}</div>
                  <div style={{ fontSize:11, color:t.textDim, marginBottom:4 }}>📅 {fmtDate(selected.date)}</div>
                  {selected.start_at && (
                    <div style={{ fontSize:11, color:t.textDim, marginBottom:4 }}>
                      🕐 {fmtTime(selected.start_at)}{selected.end_at && ` → ${fmtTime(selected.end_at)}`}
                    </div>
                  )}
                  {selected.type==='workout' && selected.status==='completed' && (
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                      {selected.session_rpe && <span style={{ fontSize:11, color:t.orange }}>RPE {selected.session_rpe}</span>}
                      {selected.mood && <span style={{ fontSize:14 }}>{MOOD_ICONS[selected.mood]||''}</span>}
                      {selected.duration_seconds && <span style={{ fontSize:11, color:t.teal }}>⏱ {fmtDur(selected.duration_seconds)}</span>}
                    </div>
                  )}
                  {selected.description && (
                    <div style={{ fontSize:11, color:t.textMuted, borderTop:'1px solid '+t.border, paddingTop:8, marginTop:8, lineHeight:1.5 }}>{selected.description}</div>
                  )}
                  {selected.type==='workout' && selected.source_id && selected.status!=='completed' && (
                    <button onClick={()=>router.push('/dashboard/client/workout/'+selected.source_id)}
                      style={{ marginTop:10, width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'9px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {selected.status==='in_progress' ? '▶ Continue' : '💪 Start'}
                    </button>
                  )}
                </div>
              )}

              {/* Upcoming */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, overflow:'hidden' }}>
                <div style={{ padding:'12px 14px', borderBottom:'1px solid '+t.border, fontSize:11, fontWeight:800 }}>⏭ Upcoming</div>
                {upcomingItems.length===0
                  ? <div style={{ padding:16, textAlign:'center', color:t.textMuted, fontSize:11 }}>Nothing coming up</div>
                  : upcomingItems.map(e => (
                    <div key={e.id} onClick={()=>setSelected(e)}
                      style={{ padding:'10px 14px', borderBottom:'1px solid '+t.border, cursor:'pointer', display:'flex', gap:8, alignItems:'flex-start' }}>
                      <div style={{ width:3, minHeight:32, borderRadius:2, background:e.color, flexShrink:0, marginTop:2 }}/>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.icon} {e.title}</div>
                        <div style={{ fontSize:10, color:t.textMuted }}>
                          {new Date(e.date+'T00:00:00').toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}
                          {e.start_at ? ' · '+fmtTime(e.start_at) : ''}
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>
        </div>
      </div>
      <ClientBottomNav />
    </>
  )
}
