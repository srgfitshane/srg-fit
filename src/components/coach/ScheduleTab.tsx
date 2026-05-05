'use client'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}

// Quick-add modal. Date is editable inline so the coach can open this from
// a top-bar shortcut (today's date as default) and pick a different day
// without leaving the modal — saves the scroll-to-day-cell flow.
function AddDayModal({ date: initialDate, clientId, coachId, supabase, t, onSave, onClose, returnUrl }: any) {
  const router = useRouter()
  const inp = { background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', colorScheme:'dark' as const }
  const [date,       setDate]       = useState<string>(initialDate)
  const [mode,       setMode]       = useState<'pick'|'workout'|'event'>('pick')
  const [wkMode,     setWkMode]     = useState<'template'|'build'>('template')
  const [title,      setTitle]      = useState('')
  const [templates,  setTemplates]  = useState<any[]>([])
  const [templateId, setTemplateId] = useState('')
  const [eventType,  setEventType]  = useState('check_in_call')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  useEffect(() => { if (mode === 'workout') loadTemplates() }, [mode])

  const loadTemplates = async () => {
    const { data } = await supabase.from('workout_templates').select('id, title').order('title')
    setTemplates(data || [])
  }

  const EVENT_TYPES = [
    { id:'check_in_call', label:'Check-in Call', icon:'📞', color:'#8b5cf6' },
    { id:'consultation',  label:'Consultation',  icon:'💬', color:'#f472b6' },
    { id:'rest_day',      label:'Rest Day',       icon:'😴', color:'#5a5a78' },
    { id:'note',          label:'Coach Note',     icon:'📌', color:'#f5a623' },
  ]

  const handleSave = async () => {
    setSaving(true); setError('')
    try {
      if (mode === 'workout') {
        if (!templateId) { setError('Select a template'); setSaving(false); return }
        const res = await fetch('/api/workouts/assign-template', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: templateId, client_id: clientId, scheduled_date: date }),
        })
        if (!res.ok) { setError('Failed to assign template'); setSaving(false); return }
      } else if (mode === 'event') {
        const meta = EVENT_TYPES.find(e => e.id === eventType)
        await supabase.from('calendar_events').insert({
          coach_id:coachId, client_id:clientId,
          title:title.trim()||meta?.label||'Event', event_type:eventType,
          start_at:date+'T10:00:00', color:meta?.color||'#8b5cf6',
        })
      }
      onSave()
    } catch(e: any) { setError(e.message); setSaving(false) }
  }

  // pick screen
  if (mode === 'pick') return (
    <div style={{ position:'fixed', inset:0, background:'#00000090', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:420 }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6, textAlign:'center' as const }}>
            Schedule for
          </div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ ...inp, fontSize:14, fontWeight:800, textAlign:'center' as const }} />
          <div style={{ fontSize:11, color:t.textMuted, marginTop:6, textAlign:'center' as const }}>
            {new Date(date+'T12:00').toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}
          </div>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <button onClick={()=>setMode('workout')}
            style={{ padding:'18px 12px', borderRadius:14, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, fontWeight:800, fontSize:13, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:24 }}>🏋️</span>Workout
          </button>
          <button onClick={()=>setMode('event')}
            style={{ padding:'18px 12px', borderRadius:14, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, fontWeight:800, fontSize:13, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:24 }}>📅</span>Event / Note
          </button>
        </div>
      </div>
    </div>
  )

  // workout screen
  if (mode === 'workout') return (
    <div style={{ position:'fixed', inset:0, background:'#00000090', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:420, maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <button onClick={()=>setMode('pick')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13 }}>← Back</button>
          <div style={{ fontSize:13, fontWeight:800 }}>Schedule Workout</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {(['template','build'] as const).map(m=>(
              <button key={m} onClick={()=>setWkMode(m as any)}
                style={{ padding:'10px', borderRadius:10, border:'1px solid '+(wkMode===m?t.teal:t.border), background:wkMode===m?t.tealDim:'transparent', color:wkMode===m?t.teal:t.textDim, fontWeight:700, fontSize:12, cursor:'pointer' }}>
                {m==='template' ? '📋 Template' : '🔨 Build New'}
              </button>
            ))}
          </div>
          {wkMode==='build' && (
            <div style={{ textAlign:'center' as const, padding:'8px 0' }}>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:12, lineHeight:1.6 }}>
                Build a new workout in the library.<br/>It will be saved and auto-assigned to this client on this date.
              </div>
              <button onClick={()=>{
                onClose()
                router.push(`/dashboard/coach/workouts?auto_client=${clientId}&auto_date=${date}&return=${encodeURIComponent(returnUrl||'/dashboard/coach')}`)
              }} style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'11px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                🔨 Open Workout Builder
              </button>
            </div>
          )}
          {wkMode==='template' && (
            templates.length===0
              ? <div style={{ fontSize:12, color:t.textMuted, padding:'8px 0' }}>No templates yet. Create one in Programs.</div>
              : <select value={templateId} onChange={e=>setTemplateId(e.target.value)} style={inp}>
                  <option value="">— Select template —</option>
                  {templates.map(tpl=><option key={tpl.id} value={tpl.id}>{tpl.title}</option>)}
                </select>
          )}
          {error && <div style={{ fontSize:12, color:t.red, background:t.redDim, borderRadius:8, padding:'8px 12px' }}>{error}</div>}
          <button onClick={handleSave} disabled={saving}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', opacity:saving?0.6:1 }}>
            {saving ? 'Scheduling...' : '📅 Schedule Workout'}
          </button>
        </div>
      </div>
    </div>
  )

  // event screen
  return (
    <div style={{ position:'fixed', inset:0, background:'#00000090', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:420, maxHeight:'85vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
          <button onClick={()=>setMode('pick')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13 }}>← Back</button>
          <div style={{ fontSize:13, fontWeight:800 }}>Add Event</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18 }}>✕</button>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
            {EVENT_TYPES.map(et=>(
              <button key={et.id} onClick={()=>setEventType(et.id)}
                style={{ padding:'10px', borderRadius:10, border:'1px solid '+(eventType===et.id?et.color:t.border), background:eventType===et.id?et.color+'22':'transparent', color:eventType===et.id?et.color:t.textDim, fontWeight:700, fontSize:12, cursor:'pointer', textAlign:'left' }}>
                {et.icon} {et.label}
              </button>
            ))}
          </div>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title (optional — defaults to type)" style={inp} />
          {error && <div style={{ fontSize:12, color:t.red, background:t.redDim, borderRadius:8, padding:'8px 12px' }}>{error}</div>}
          <button onClick={handleSave} disabled={saving}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', opacity:saving?0.6:1 }}>
            {saving ? 'Saving...' : '📅 Add to Schedule'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ScheduleTab component ────────────────────────────────────────────────
export default function ScheduleTab({ clientId, coachId, clientName, supabase, t, refreshKey }: {
  clientId: string
  coachId: string
  clientName: string
  supabase: any
  t: any
  refreshKey?: number
}) {
  const router = useRouter()
  const today = new Date()
  const [viewMonth,  setViewMonth]  = useState(today.getMonth())
  const [viewYear,   setViewYear]   = useState(today.getFullYear())
  const [sessions,   setSessions]   = useState<any[]>([])
  const [calEvents,  setCalEvents]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [addModal,   setAddModal]   = useState<string|null>(null) // date string or null
  const [delConfirm, setDelConfirm] = useState<any>(null) // item to delete
  const [reschedDate, setReschedDate] = useState('')      // new date when rescheduling
  const [clipboard, setClipboard] = useState<{ sessionId: string; title: string; sourceDate: string } | null>(null)
  const [pasting, setPasting] = useState(false)

  useEffect(() => { load() }, [clientId, refreshKey])

  const handlePaste = async (targetDate: string) => {
    if (!clipboard || pasting) return
    setPasting(true)
    try {
      const res = await fetch('/api/workouts/clone-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_session_id: clipboard.sessionId,
          target_date: targetDate,
          target_client_id: clientId,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert('Paste failed: ' + (err.error || 'Unknown error'))
        setPasting(false)
        return
      }
      setClipboard(null)
      await load()
    } catch (e: any) {
      alert('Paste failed: ' + e.message)
    } finally {
      setPasting(false)
    }
  }

  const load = async () => {
    setLoading(true)
    const [{ data: sess }, { data: evts }] = await Promise.all([
      supabase.from('workout_sessions')
        .select('id, title, scheduled_date, status, session_exercises(id, is_open_slot, slot_constraint, exercise_name, order_index)')
        .eq('client_id', clientId)
        .not('scheduled_date', 'is', null)
        .neq('status', 'template')
        .order('scheduled_date'),
      supabase.from('calendar_events')
        .select('id, title, event_type, start_at, color')
        .eq('client_id', clientId)
        .order('start_at'),
    ])
    setSessions(sess || [])
    setCalEvents(evts || [])
    setLoading(false)
  }

  const deleteSession = async (id: string) => {
    await supabase.from('workout_sessions').delete().eq('id', id)
    setSessions(p => p.filter(s => s.id !== id))
    setDelConfirm(null)
  }
  const deleteEvent = async (id: string) => {
    await supabase.from('calendar_events').delete().eq('id', id)
    setCalEvents(p => p.filter(e => e.id !== id))
    setDelConfirm(null)
  }
  const rescheduleSession = async () => {
    if (!reschedDate || !delConfirm?.id) return
    await supabase.from('workout_sessions').update({ scheduled_date: reschedDate }).eq('id', delConfirm.id)
    setSessions(p => p.map(s => s.id === delConfirm.id ? { ...s, scheduled_date: reschedDate } : s))
    setDelConfirm(null)
    setReschedDate('')
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth + 1, 0)
  const cells: (Date|null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_, i) => new Date(viewYear, viewMonth, i + 1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const itemsForDay = (d: Date) => {
    const ds = toDateStr(d)
    const sess = sessions
      .filter(s => s.scheduled_date === ds)
      .map(s => ({ ...s, _type: 'session', _color: s.status === 'completed' ? '#22c55e' : s.status === 'in_progress' ? '#f5a623' : t.teal }))
    const evts = calEvents
      .filter(e => e.start_at?.startsWith(ds))
      .map(e => ({ ...e, _type: 'event', _color: e.color || '#8b5cf6' }))
    return [...sess, ...evts]
  }

  const STATUS_LABEL: Record<string,string> = {
    scheduled: 'Scheduled', in_progress: 'In Progress',
    completed: 'Done', skipped: 'Skipped',
  }
  const EVENT_ICON: Record<string,string> = {
    check_in_call:'📞', consultation:'💬', rest_day:'😴', note:'📌', session:'🏋️', other:'📅',
  }

  if (loading) return (
    <div style={{ padding:40, textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading schedule...</div>
  )

  return (
    <div style={{ padding:'16px 12px', maxWidth:900, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>📅 Schedule</div>
          <div style={{ fontSize:12, color:t.textMuted }}>Tap any day, or use the buttons below</div>
        </div>
        <button onClick={()=>{ setViewMonth(today.getMonth()); setViewYear(today.getFullYear()) }}
          style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer' }}>
          Today
        </button>
      </div>

      {/* Quick actions — saves scrolling around the calendar to find a day cell.
          "+ Schedule" opens the AddDayModal pre-filled with today; the modal lets
          you change the date inline. "💪 Log Today" is shown when an assigned or
          in-progress session exists for today, so logging-on-behalf-of is one tap. */}
      {(() => {
        const todayStr = toDateStr(today)
        const todayLoggable = sessions.find(s =>
          s.scheduled_date === todayStr && (s.status === 'assigned' || s.status === 'in_progress')
        )
        return (
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button onClick={()=>setAddModal(todayStr)}
              style={{ flex:1, background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              + Schedule Workout / Event
            </button>
            {todayLoggable && (
              <button onClick={()=>{
                const returnUrl = encodeURIComponent(`/dashboard/coach/clients/${clientId}?tab=calendar`)
                router.push(`/dashboard/client/workout/${todayLoggable.id}?return=${returnUrl}`)
              }}
                title={todayLoggable.title}
                style={{ flex:1, background:`linear-gradient(135deg,#f5a623,#f5a623cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                {todayLoggable.status === 'in_progress' ? '▶ Continue Today' : '💪 Log Today'}
              </button>
            )}
          </div>
        )
      })()}

      {/* Month nav */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
        <button onClick={()=>{ const d=new Date(viewYear,viewMonth-1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
          style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', color:t.text, cursor:'pointer', fontSize:16 }}>‹</button>
        <div style={{ fontSize:15, fontWeight:800, flex:1, textAlign:'center' }}>{MONTHS[viewMonth]} {viewYear}</div>
        <button onClick={()=>{ const d=new Date(viewYear,viewMonth+1,1); setViewMonth(d.getMonth()); setViewYear(d.getFullYear()) }}
          style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', color:t.text, cursor:'pointer', fontSize:16 }}>›</button>
      </div>

      {/* Clipboard banner — shown only when a session has been copied */}
      {clipboard && (
        <div style={{ display:'flex', alignItems:'center', gap:10, background:t.tealDim, border:'1px solid '+t.teal+'60', borderRadius:10, padding:'10px 14px', marginBottom:10 }}>
          <span style={{ fontSize:14 }}>📋</span>
          <div style={{ flex:1, fontSize:12, fontWeight:700, color:t.teal, lineHeight:1.4 }}>
            {pasting ? (
              <>Pasting {clipboard.title}...</>
            ) : (
              <>Copied <strong>{clipboard.title}</strong> — tap any day to paste</>
            )}
          </div>
          <button onClick={()=>setClipboard(null)} disabled={pasting}
            style={{ background:'transparent', border:'1px solid '+t.teal+'40', borderRadius:6, padding:'4px 10px', color:t.teal, fontSize:11, fontWeight:700, cursor:pasting?'not-allowed':'pointer', opacity:pasting?0.5:1 }}>
            Cancel
          </button>
        </div>
      )}

      {/* Day headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', padding:'4px 0' }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:3 }}>
        {cells.map((d, i) => {
          const isToday   = d ? isSameDay(d, today) : false
          const dayItems  = d ? itemsForDay(d) : []
          const dateStr   = d ? toDateStr(d) : ''
          return (
            <div key={i}
              onClick={() => {
                if (!d) return
                if (clipboard) { handlePaste(dateStr); return }
                setAddModal(dateStr)
              }}
              style={{ minHeight:56, background:isToday?t.surfaceHigh:t.surface, border:'1px solid '+(isToday?t.teal+'50':t.border), borderRadius:8, padding:'4px 4px', cursor:d?'pointer':'default', opacity:d?1:0.25, position:'relative', overflow:'hidden' }}>
              {d && <>
                <div style={{ fontSize:11, fontWeight:isToday?900:600, color:isToday?t.teal:t.textDim, marginBottom:3 }}>{d.getDate()}</div>
                {dayItems.map(item => {
                  const openSlots = item._type==='session' ? (item.session_exercises||[]).filter((e:any)=>e.is_open_slot).length : 0
                  return (
                    <div key={item.id}
                      onClick={e => { e.stopPropagation(); setDelConfirm(item) }}
                      style={{ fontSize:9, fontWeight:700, background:item._color+'22', color:item._color, border:'1px solid '+item._color+'40', borderRadius:4, padding:'2px 5px', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer', display:'flex', alignItems:'center', gap:3 }}
                      title={item.title}>
                      {item._type==='session' ? '🏋️' : (EVENT_ICON[item.event_type]||'📅')} {item.title}
                      {openSlots > 0 && <span style={{fontSize:8,background:'#f5a62333',color:'#f5a623',borderRadius:3,padding:'1px 3px',flexShrink:0}}>🎲{openSlots}</span>}
                    </div>
                  )
                })}
                {/* + button always visible on hover via JS alternative — show on empty days */}
                {dayItems.length === 0 && (
                  <div style={{ position:'absolute', bottom:4, right:4, width:16, height:16, borderRadius:'50%', background:t.border, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, color:t.textMuted, fontWeight:700 }}>+</div>
                )}
              </>}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div style={{ display:'flex', gap:16, marginTop:16, flexWrap:'wrap' }}>
        {[{color:t.teal,label:'Scheduled'},{color:'#f5a623',label:'In Progress'},{color:'#22c55e',label:'Completed'},{color:'#8b5cf6',label:'Event'}].map(l=>(
          <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:t.textDim }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:l.color }}/>
            {l.label}
          </div>
        ))}
      </div>

      {/* Add modal — portal to body so position:fixed works on mobile */}
      {addModal && typeof document !== 'undefined' && createPortal(
        <AddDayModal
          date={addModal}
          clientId={clientId}
          coachId={coachId}
          supabase={supabase}
          t={t}
          onSave={async () => { setAddModal(null); await load() }}
          onClose={() => setAddModal(null)}
          returnUrl={`/dashboard/coach/clients/${clientId}?tab=calendar`}
        />,
        document.body
      )}

      {/* Delete / detail confirm — portal to body */}
      {delConfirm && typeof document !== 'undefined' && createPortal(
        <div style={{ position:'fixed', inset:0, background:'#00000090', zIndex:1000, display:'flex', alignItems:'flex-end', justifyContent:'center', padding:16 }} onClick={()=>{ setDelConfirm(null); setReschedDate('') }}>
          <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:420, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ fontSize:14, fontWeight:800, marginBottom:8 }}>
              {delConfirm._type==='session' ? '🏋️' : (EVENT_ICON[delConfirm.event_type]||'📅')} {delConfirm.title}
            </div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:6 }}>
              {delConfirm._type==='session' ? delConfirm.scheduled_date : delConfirm.start_at?.split('T')[0]}
            </div>
            {delConfirm._type==='session' && (
              <div style={{ marginBottom:16 }}>
                <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:5, background:delConfirm._color+'22', color:delConfirm._color }}>
                  {STATUS_LABEL[delConfirm.status] || delConfirm.status}
                </span>
              </div>
            )}
            {/* Open slots — show if any */}
            {delConfirm._type==='session' && (() => {
              const slots = (delConfirm.session_exercises||[]).filter((e:any)=>e.is_open_slot)
              if (slots.length === 0) return null
              return (
                <div style={{ marginBottom:16, background:'#f5a62310', border:'1px solid #f5a62330', borderRadius:10, padding:'10px 12px' }}>
                  <div style={{ fontSize:11, fontWeight:800, color:'#f5a623', marginBottom:6 }}>🎲 {slots.length} Open Slot{slots.length!==1?'s':''} — Client Chooses</div>
                  {slots.map((s:any) => (
                    <div key={s.id} style={{ fontSize:11, color:'#f5a623', opacity:0.8, marginBottom:2 }}>
                      · {s.slot_constraint || 'Client\'s choice'}
                    </div>
                  ))}
                </div>
              )
            })()}
            {/* Reschedule — sessions only */}
            {delConfirm._type==='session' && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>Reschedule to</div>
                <input type="date" value={reschedDate} onChange={e=>setReschedDate(e.target.value)}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, colorScheme:'dark', boxSizing:'border-box' as const, fontFamily:"'DM Sans',sans-serif" }}/>
                {reschedDate && (
                  <button onClick={rescheduleSession}
                    style={{ marginTop:8, width:'100%', background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    📅 Move to {reschedDate}
                  </button>
                )}
              </div>
            )}
            {/* Copy to another day — sessions only */}
            {delConfirm._type==='session' && (
              <button onClick={()=>{
                setClipboard({
                  sessionId: delConfirm.id,
                  title: delConfirm.title,
                  sourceDate: delConfirm.scheduled_date,
                })
                setDelConfirm(null)
                setReschedDate('')
              }}
                style={{ width:'100%', background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>
                📋 Copy to Another Day
              </button>
            )}

            {/* Log Workout — assigned/in_progress sessions only */}
            {delConfirm._type==='session' && (delConfirm.status==='assigned'||delConfirm.status==='in_progress') && (
              <button onClick={()=>{
                const returnUrl = encodeURIComponent(`/dashboard/coach/clients/${clientId}?tab=calendar`)
                router.push(`/dashboard/client/workout/${delConfirm.id}?return=${returnUrl}`)
              }}
                style={{ width:'100%', background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:8 }}>
                {delConfirm.status==='in_progress' ? '▶️ Continue Logging' : '💪 Log This Workout'}
              </button>
            )}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ setDelConfirm(null); setReschedDate('') }}
                style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px', fontSize:13, fontWeight:700, color:t.textDim, cursor:'pointer' }}>
                Cancel
              </button>
              <button onClick={()=>delConfirm._type==='session' ? deleteSession(delConfirm.id) : deleteEvent(delConfirm.id)}
                style={{ flex:1, background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:10, padding:'10px', fontSize:13, fontWeight:700, color:t.red, cursor:'pointer' }}>
                Remove
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
