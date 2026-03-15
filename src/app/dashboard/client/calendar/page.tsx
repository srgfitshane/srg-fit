'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623",
  purple:"#8b5cf6", green:"#22c55e", pink:"#f472b6",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const TYPE_META: Record<string, { label:string, icon:string }> = {
  session:       { label:'Training Session', icon:'🏋️' },
  check_in_call: { label:'Check-in Call',    icon:'📞' },
  consultation:  { label:'Consultation',     icon:'🤝' },
  rest_day:      { label:'Rest Day',         icon:'😴' },
  milestone:     { label:'Milestone',        icon:'🎯' },
  note:          { label:'Note',             icon:'📝' },
  other:         { label:'Event',            icon:'📌' },
}

const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function isSameDay(a:Date, b:Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate()
}
function formatTime(ts:string) { return new Date(ts).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' }) }

export default function ClientCalendar() {
  const today = new Date()
  const [events,    setEvents]    = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [selected,  setSelected]  = useState<any>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(()=>{ load() },[])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: clientData } = await supabase.from('clients').select('id,coach_id').eq('profile_id', user.id).single()
    if (!clientData) { setLoading(false); return }
    const { data: evts } = await supabase
      .from('calendar_events').select('*')
      .eq('coach_id', clientData.coach_id)
      .eq('client_id', clientData.id)
      .order('start_at')
    setEvents(evts || [])
    setLoading(false)
  }

  const firstDay = new Date(viewYear, viewMonth, 1)
  const lastDay  = new Date(viewYear, viewMonth+1, 0)
  const cells: (Date|null)[] = [
    ...Array(firstDay.getDay()).fill(null),
    ...Array.from({ length: lastDay.getDate() }, (_,i) => new Date(viewYear, viewMonth, i+1))
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const eventsForDay = (d:Date) => events.filter(e => isSameDay(new Date(e.start_at), d))
  const upcoming = events.filter(e => new Date(e.start_at) >= today).slice(0,6)

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

        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 20px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>📅 My Schedule</div>
        </div>

        <div style={{ maxWidth:900, margin:'0 auto', padding:24 }}>

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

          <div style={{ display:'grid', gridTemplateColumns:'1fr 220px', gap:20 }}>
            <div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', marginBottom:6 }}>
                {DAYS.map(d => <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', padding:'4px 0' }}>{d}</div>)}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
                {cells.map((d, i) => {
                  const isToday = d ? isSameDay(d, today) : false
                  const dayEvts = d ? eventsForDay(d) : []
                  return (
                    <div key={i} style={{ minHeight:70, background:isToday?t.surfaceHigh:t.surface, border:'1px solid '+(isToday?t.teal+'40':t.border), borderRadius:8, padding:'5px 6px', opacity:d?1:0.3 }}>
                      {d && (
                        <>
                          <div style={{ fontSize:11, fontWeight:isToday?900:600, color:isToday?t.teal:t.textDim, marginBottom:3 }}>{d.getDate()}</div>
                          {dayEvts.map(e => (
                            <div key={e.id} onClick={()=>setSelected(e)}
                              style={{ fontSize:9, fontWeight:700, background:(e.color||t.teal)+'22', color:e.color||t.teal, borderRadius:3, padding:'1px 4px', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', cursor:'pointer' }}>
                              {TYPE_META[e.event_type]?.icon} {e.title}
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Sidebar */}
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {selected && (
                <div style={{ background:t.surface, border:'1px solid '+(selected.color||t.teal)+'50', borderRadius:12, padding:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:selected.color||t.teal, textTransform:'uppercase' }}>
                      {TYPE_META[selected.event_type]?.icon} {TYPE_META[selected.event_type]?.label}
                    </div>
                    <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                  </div>
                  <div style={{ fontSize:13, fontWeight:800, marginBottom:6 }}>{selected.title}</div>
                  <div style={{ fontSize:11, color:t.textDim, marginBottom:4 }}>
                    {new Date(selected.start_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}
                  </div>
                  <div style={{ fontSize:11, color:t.textDim }}>
                    🕐 {formatTime(selected.start_at)}{selected.end_at && ` → ${formatTime(selected.end_at)}`}
                  </div>
                  {selected.description && <div style={{ fontSize:11, color:t.textMuted, marginTop:8, borderTop:'1px solid '+t.border, paddingTop:8 }}>{selected.description}</div>}
                </div>
              )}

              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 14px', borderBottom:'1px solid '+t.border, fontSize:11, fontWeight:800 }}>⏭ Upcoming</div>
                {upcoming.length === 0
                  ? <div style={{ padding:16, textAlign:'center', color:t.textMuted, fontSize:11 }}>No upcoming events</div>
                  : upcoming.map(e => (
                    <div key={e.id} onClick={()=>setSelected(e)} style={{ padding:'10px 14px', borderBottom:'1px solid '+t.border, cursor:'pointer', display:'flex', gap:8 }}>
                      <div style={{ width:3, borderRadius:2, background:e.color||t.teal, flexShrink:0 }} />
                      <div>
                        <div style={{ fontSize:11, fontWeight:700 }}>{e.title}</div>
                        <div style={{ fontSize:10, color:t.textMuted }}>
                          {new Date(e.start_at).toLocaleDateString([], { month:'short', day:'numeric' })} · {formatTime(e.start_at)}
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
    </>
  )
}
