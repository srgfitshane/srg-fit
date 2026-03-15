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
  session:       { label:'Session',      icon:'🏋️', color:'#00c9b1' },
  check_in_call: { label:'Check-in',     icon:'📞', color:'#8b5cf6' },
  consultation:  { label:'Consult',      icon:'🤝', color:'#f472b6' },
  rest_day:      { label:'Rest Day',     icon:'😴', color:'#5a5a78' },
  milestone:     { label:'Milestone',    icon:'🎯', color:'#22c55e' },
  note:          { label:'Note/Block',   icon:'📝', color:'#f5a623' },
  other:         { label:'Other',        icon:'📌', color:'#38bdf8' },
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
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

// ─── Event Form Modal ───────────────────────────────────────────────
function EventModal({ event, clients, onSave, onDelete, onClose, defaultDate }: any) {
  const isNew = !event?.id
  const [title,    setTitle]    = useState(event?.title || '')
  const [type,     setType]     = useState(event?.event_type || 'session')
  const [clientId, setClientId] = useState(event?.client_id || '')
  const [startAt,  setStartAt]  = useState(event?.start_at ? new Date(event.start_at).toISOString().slice(0,16) : (defaultDate ? defaultDate+'T10:00' : ''))
  const [endAt,    setEndAt]    = useState(event?.end_at   ? new Date(event.end_at).toISOString().slice(0,16)   : (defaultDate ? defaultDate+'T10:30' : ''))
  const [desc,     setDesc]     = useState(event?.description || '')
  const [color,    setColor]    = useState(event?.color || TYPE_META[type]?.color || '#00c9b1')
  const [saving,   setSaving]   = useState(false)

  const inp = { background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', colorScheme:'dark' as const }

  const handleSave = async () => {
    if (!title || !startAt) return
    setSaving(true)
    await onSave({ title, event_type:type, client_id:clientId||null, start_at:startAt, end_at:endAt||null, description:desc, color })
    setSaving(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'#00000088', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:440, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>{isNew ? '➕ New Event' : '✏️ Edit Event'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, fontFamily:"'DM Sans',sans-serif" }}>✕</button>
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
                <option value="">— No client —</option>
                {clients.map((c:any) => {
                  const prof = c?.profiles
                  const name = Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name || 'Client'
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
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase' }}>Description</div>
            <textarea value={desc} onChange={e=>setDesc(e.target.value)} rows={3} placeholder="Optional notes..." style={{ ...inp, resize:'vertical' as const }} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' }}>Color</div>
            <input type="color" value={color} onChange={e=>setColor(e.target.value)} style={{ background:'none', border:'1px solid '+t.border, borderRadius:6, width:36, height:28, cursor:'pointer', padding:2 }} />
            <div style={{ width:12, height:12, borderRadius:'50%', background:color }} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:6 }}>
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

// ─── Main Component ─────────────────────────────────────────────────
export default function CoachCalendar() {
  const today = new Date()
  const [events,    setEvents]    = useState<any[]>([])
  const [clients,   setClients]   = useState<any[]>([])
  const [coachId,   setCoachId]   = useState<string>('')
  const [loading,   setLoading]   = useState(true)
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [modal,     setModal]     = useState<any>(null)  // null | { event } | { newDate }
  const [selected,  setSelected]  = useState<any>(null)  // event detail pane
  const router   = useRouter()
  const supabase = createClient()

  useEffect(()=>{ load() },[])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)
    const [{ data: evts }, { data: cls }] = await Promise.all([
      supabase.from('calendar_events').select('*').eq('coach_id', user.id).order('start_at'),
      supabase.from('clients').select('id, profiles!profile_id(full_name)').eq('coach_id', user.id),
    ])
    setEvents(evts || [])
    setClients(cls  || [])
    setLoading(false)
  }

  const reload = async () => {
    const { data } = await supabase.from('calendar_events').select('*').eq('coach_id', coachId).order('start_at')
    setEvents(data || [])
  }

  const handleSave = async (payload: any) => {
    if (modal?.event?.id) {
      await supabase.from('calendar_events').update(payload).eq('id', modal.event.id)
    } else {
      await supabase.from('calendar_events').insert({ ...payload, coach_id: coachId })
    }
    await reload()
    setModal(null)
    setSelected(null)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id)
    await reload()
    setModal(null)
    setSelected(null)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth+1, 0)
  const startPad = firstDay.getDay()
  const cells: (Date|null)[] = [
    ...Array(startPad).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_,i) => new Date(viewYear, viewMonth, i+1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsForDay = (d: Date) =>
    events.filter(e => isSameDay(new Date(e.start_at), d))
      .sort((a,b) => a.start_at.localeCompare(b.start_at))

  const upcomingEvents = events
    .filter(e => new Date(e.start_at) >= today)
    .slice(0, 8)

  const clientName = (id: string) => {
    const c = clients.find(c=>c.id===id)
    const prof = c?.profiles
    return Array.isArray(prof) ? prof[0]?.full_name : prof?.full_name || null
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>📅 Calendar</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>setModal({ newDate: today.toISOString().split('T')[0] })}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Event
          </button>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:0, maxWidth:1200, margin:'0 auto', padding:24 }}>

          {/* Calendar grid */}
          <div style={{ paddingRight:24 }}>
            {/* Month nav */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
              <button onClick={()=>{ const d=new Date(viewYear,viewMonth-1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
                style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', color:t.text, cursor:'pointer', fontSize:16, fontFamily:"'DM Sans',sans-serif" }}>‹</button>
              <div style={{ fontSize:18, fontWeight:900, minWidth:200, textAlign:'center' }}>{MONTHS[viewMonth]} {viewYear}</div>
              <button onClick={()=>{ const d=new Date(viewYear,viewMonth+1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
                style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', color:t.text, cursor:'pointer', fontSize:16, fontFamily:"'DM Sans',sans-serif" }}>›</button>
              <button onClick={()=>{ setViewMonth(today.getMonth()); setViewYear(today.getFullYear()) }}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Today</button>
            </div>

            {/* Day headers */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:8 }}>
              {DAYS.map(d => (
                <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 0' }}>{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
              {cells.map((d, i) => {
                const isToday = d ? isSameDay(d, today) : false
                const dayEvts = d ? eventsForDay(d) : []
                const dateStr = d ? d.toISOString().split('T')[0] : ''
                return (
                  <div key={i} onClick={()=>{ if(d) setModal({ newDate: dateStr }) }}
                    style={{ minHeight:90, background:isToday?t.surfaceHigh:t.surface, border:'1px solid '+(isToday?t.teal+'40':t.border), borderRadius:10, padding:'6px 8px', cursor:d?'pointer':'default', opacity:d?1:0.3, transition:'background 0.1s' }}>
                    {d && (
                      <>
                        <div style={{ fontSize:12, fontWeight:isToday?900:600, color:isToday?t.teal:t.textDim, marginBottom:4 }}>{d.getDate()}</div>
                        {dayEvts.slice(0,3).map(e => (
                          <div key={e.id} onClick={ev=>{ ev.stopPropagation(); setSelected(e) }}
                            style={{ fontSize:10, fontWeight:700, background:(e.color||t.teal)+'22', color:e.color||t.teal, borderRadius:4, padding:'2px 5px', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                            {TYPE_META[e.event_type]?.icon} {e.title}
                          </div>
                        ))}
                        {dayEvts.length > 3 && (
                          <div style={{ fontSize:9, color:t.textMuted, fontWeight:600 }}>+{dayEvts.length-3} more</div>
                        )}
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Sidebar */}
          <div>
            {/* Selected event detail */}
            {selected && (
              <div style={{ background:t.surface, border:'1px solid '+(selected.color||t.teal)+'50', borderRadius:14, padding:18, marginBottom:16 }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:selected.color||t.teal, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>
                      {TYPE_META[selected.event_type]?.icon} {TYPE_META[selected.event_type]?.label}
                    </div>
                    <div style={{ fontSize:14, fontWeight:800 }}>{selected.title}</div>
                  </div>
                  <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:14, fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                </div>
                <div style={{ fontSize:12, color:t.textDim, marginBottom:6 }}>
                  📅 {new Date(selected.start_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })} · {formatTime(selected.start_at)}
                  {selected.end_at && ` → ${formatTime(selected.end_at)}`}
                  {selected.end_at && ` (${formatDuration(selected.start_at, selected.end_at)})`}
                </div>
                {selected.client_id && (
                  <div style={{ fontSize:12, color:t.textDim, marginBottom:6 }}>👤 {clientName(selected.client_id)}</div>
                )}
                {selected.description && (
                  <div style={{ fontSize:12, color:t.textMuted, borderTop:'1px solid '+t.border, paddingTop:8, marginTop:8 }}>{selected.description}</div>
                )}
                <button onClick={()=>{ setModal({ event: selected }); setSelected(null) }}
                  style={{ marginTop:10, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Edit Event →
                </button>
              </div>
            )}

            {/* Upcoming */}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, overflow:'hidden' }}>
              <div style={{ padding:'14px 16px', borderBottom:'1px solid '+t.border, fontSize:12, fontWeight:800 }}>⏭ Upcoming</div>
              {upcomingEvents.length === 0 ? (
                <div style={{ padding:20, textAlign:'center', color:t.textMuted, fontSize:12 }}>No upcoming events</div>
              ) : upcomingEvents.map(e => (
                <div key={e.id} onClick={()=>setSelected(e)}
                  style={{ padding:'10px 16px', borderBottom:'1px solid '+t.border, cursor:'pointer', display:'flex', gap:10, alignItems:'flex-start' }}>
                  <div style={{ width:3, minHeight:36, borderRadius:2, background:e.color||t.teal, flexShrink:0, marginTop:2 }} />
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{e.title}</div>
                    <div style={{ fontSize:10, color:t.textMuted }}>
                      {new Date(e.start_at).toLocaleDateString([], { month:'short', day:'numeric' })} · {formatTime(e.start_at)}
                      {e.client_id && ` · ${clientName(e.client_id)}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <EventModal
          event={modal.event}
          clients={clients}
          defaultDate={modal.newDate}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={()=>setModal(null)}
        />
      )}
    </>
  )
}
