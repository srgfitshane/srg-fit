'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

// ── Preview As Client ──────────────────────────────────────────────────────
// Coach-only view. Renders a read-only replica of the client dashboard
// using the selected client's data. Clearly badged so you know you're
// in preview mode, not actually logged in as them.

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444',
  green:'#22c55e', greenDim:'#22c55e15', yellow:'#eab308', blue:'#60a5fa',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8', pink:'#f472b6',
}

const MEAL_TIMES = ['breakfast','morning_snack','lunch','afternoon_snack','pre_workout','dinner','post_workout','evening_snack']

export default function PreviewAsClient() {
  const supabase  = createClient()
  const router    = useRouter()
  const { clientId } = useParams()
  const [client,   setClient]   = useState<any>(null)
  const [profile,  setProfile]  = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [habits,   setHabits]   = useState<any[]>([])
  const [habitLogs,setHabitLogs]= useState<Record<string,number>>({})
  const [metrics,  setMetrics]  = useState<any>(null)
  const [checkin,  setCheckin]  = useState<any>(null)
  const [nutrition,setNutrition]= useState<any>(null)
  const [entries,  setEntries]  = useState<any[]>([])
  const [calItems, setCalItems] = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [activeTab,setActiveTab]= useState<'today'|'training'|'nutrition'|'metrics'|'calendar'>('today')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => { if (clientId) load() }, [clientId])

  const load = async () => {
    // Verify coach is logged in
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Load client record
    const { data: clientData } = await supabase
      .from('clients').select('*').eq('id', clientId).single()
    if (!clientData) { router.push('/dashboard/coach'); return }
    setClient(clientData)

    // Load client's profile
    const { data: prof } = await supabase
      .from('profiles').select('*').eq('id', clientData.profile_id).single()
    setProfile(prof)

    const [
      { data: sessionData },
      { data: habitData },
      { data: habitLogData },
      { data: metricsData },
      { data: checkinData },
      { data: nutritionData },
      { data: calData },
    ] = await Promise.all([
      supabase.from('workout_sessions').select('*')
        .eq('client_id', clientId).order('scheduled_date', { ascending: false }).limit(15),
      supabase.from('habits').select('*')
        .eq('client_id', clientId).eq('active', true),
      supabase.from('habit_logs').select('*')
        .eq('client_id', clientId).eq('logged_date', today),
      supabase.from('metrics').select('*')
        .eq('client_id', clientId).order('logged_date', { ascending: false }).limit(1),
      supabase.from('checkins').select('*')
        .eq('client_id', clientId).order('created_at', { ascending: false }).limit(1),
      supabase.from('nutrition_daily_logs').select('*')
        .eq('client_id', clientId).eq('log_date', today).single(),
      supabase.from('calendar_events').select('*')
        .eq('client_id', clientId).order('start_at').limit(50),
    ])

    setSessions(sessionData || [])
    setHabits(habitData || [])
    const logMap: Record<string,number> = {}
    habitLogData?.forEach((l:any) => { logMap[l.habit_id] = l.value })
    setHabitLogs(logMap)
    setMetrics(metricsData?.[0] || null)
    setCheckin(checkinData?.[0] || null)
    setNutrition(nutritionData || null)

    // Build merged calendar items
    const merged: any[] = []
    for (const e of calData || []) {
      merged.push({ id:e.id, title:e.title, date:e.start_at.split('T')[0], start_at:e.start_at, end_at:e.end_at, color:e.color||'#8b5cf6', label:e.event_type?.replace('_',' ')||'Event', type:'calendar', description:e.description })
    }
    for (const s of sessionData || []) {
      if (!s.scheduled_date) continue
      merged.push({ id:'ws_'+s.id, title:s.title||'Workout', date:s.scheduled_date, color:s.status==='completed'?'#22c55e':s.status==='in_progress'?'#00c9b1':'#f5a623', label:s.status==='completed'?'Completed':'Workout', type:'workout', status:s.status, session_rpe:s.session_rpe, mood:s.mood })
    }
    merged.sort((a,b)=>a.date.localeCompare(b.date))
    setCalItems(merged)

    if (nutritionData) {
      const { data: entryData } = await supabase.from('food_entries')
        .select('*').eq('daily_log_id', nutritionData.id).order('logged_at')
      setEntries(entryData || [])
    }

    setLoading(false)
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading preview...</div>
  )

  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')
  const doneTasks = habits.filter(h => {
    const val = habitLogs[h.id] || 0
    return h.habit_type === 'check' ? val >= 1 : val >= h.target
  }).length
  const progressPct = Math.round((doneTasks / Math.max(habits.length, 1)) * 100)

  const TABS = [
    { id:'today',    label:'Today',     icon:'⚡' },
    { id:'training', label:'Training',  icon:'💪' },
    { id:'nutrition',label:'Nutrition', icon:'🥗' },
    { id:'metrics',  label:'Metrics',   icon:'📈' },
    { id:'calendar', label:'Calendar',  icon:'📅' },
  ]

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Preview banner */}
        <div style={{ background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', padding:'10px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>👁️</span>
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:'#fff' }}>
                Preview Mode — {profile?.full_name}'s Dashboard
              </div>
              <div style={{ fontSize:11, color:'rgba(255,255,255,0.7)' }}>
                Read-only view · Data is live · You are not logged in as this client
              </div>
            </div>
          </div>
          <button onClick={() => router.back()}
            style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
            ← Exit Preview
          </button>
        </div>

        {/* Simulated client top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, gap:12 }}>
          <div style={{ fontSize:16, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:12, color:t.textMuted }}>{profile?.full_name?.split(' ')[0]}</div>
          <div style={{ fontSize:11, background:t.purple+'22', color:t.purple, border:'1px solid '+t.purple+'40', borderRadius:20, padding:'3px 10px', fontWeight:700 }}>
            👁️ Preview
          </div>
        </div>

        {/* Tab nav */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, display:'flex', overflowX:'auto', padding:'0 6px' }}>
          {TABS.map(tab => (
            <div key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'10px 16px', cursor:'pointer', borderBottom:'2px solid '+(activeTab===tab.id?t.teal:'transparent'), flexShrink:0 }}>
              <span style={{ fontSize:15 }}>{tab.icon}</span>
              <span style={{ fontSize:10, fontWeight:activeTab===tab.id?700:500, color:activeTab===tab.id?t.teal:t.textDim, whiteSpace:'nowrap' }}>{tab.label}</span>
            </div>
          ))}
        </div>

        <div style={{ maxWidth:480, margin:'0 auto', padding:'18px 16px' }}>

          {/* ── TODAY ── */}
          {activeTab === 'today' && (
            <div>
              {/* Greeting */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:22, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.2, marginBottom:4 }}>
                  Hey, {profile?.full_name?.split(' ')[0]} 👋
                </div>
                <div style={{ fontSize:12, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
              </div>

              {/* Day progress */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>Today's Progress</div>
                  <div style={{ fontSize:15, fontWeight:900, color:progressPct===100?t.green:t.teal }}>{progressPct}%</div>
                </div>
                <div style={{ height:7, background:t.surfaceHigh, borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:progressPct+'%', background:'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:4 }}/>
                </div>
              </div>

              {/* Habits */}
              {habits.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Today's Habits</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {habits.map(h => {
                      const val = habitLogs[h.id] || 0
                      const pct = h.habit_type==='check' ? (val?100:0) : Math.min(100, Math.round((val/h.target)*100))
                      const done = pct >= 100
                      const color = h.color || t.teal
                      return (
                        <div key={h.id} style={{ padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:18 }}>{h.icon||'✅'}</span>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                              <div style={{ fontSize:11, color:t.textMuted }}>
                                {h.habit_type==='check' ? (done?'✓ Done':'Not logged') : `${val||0}${h.unit} / ${h.target}${h.unit}`}
                              </div>
                            </div>
                            {done && <span style={{ fontSize:16 }}>✓</span>}
                          </div>
                          {h.habit_type !== 'check' && (
                            <div style={{ height:4, background:t.surfaceHigh, borderRadius:2, marginTop:8, overflow:'hidden' }}>
                              <div style={{ height:'100%', width:pct+'%', background:color, borderRadius:2 }}/>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {habits.length === 0 && (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'20px 16px', marginBottom:14, textAlign:'center' }}>
                  <div style={{ fontSize:13, color:t.textMuted }}>No habits assigned to this client yet</div>
                </div>
              )}

              {/* Latest check-in summary */}
              {checkin && (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Latest Check-in</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                    {[
                      { label:'Energy', val:checkin.energy_score, color:t.yellow },
                      { label:'Mood', val:checkin.mood_score, color:t.pink },
                      { label:'Sleep', val:checkin.sleep_quality||checkin.sleep_score, color:t.purple },
                      { label:'Stress', val:checkin.stress||checkin.stress_score, color:t.red, invert:true },
                      { label:'Pain', val:checkin.pain_score, color:t.red, invert:true },
                      { label:'Workout %', val:checkin.workout_adherence ? checkin.workout_adherence+'%' : null, color:t.teal },
                    ].filter(s=>s.val!=null).map(s=>(
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px', textAlign:'center' }}>
                        <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
                        <div style={{ fontSize:10, color:t.textMuted }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {checkin.wins && <div style={{ fontSize:12, color:t.green, marginTop:10 }}>🏆 {checkin.wins}</div>}
                  {checkin.struggles && <div style={{ fontSize:12, color:t.orange, marginTop:6 }}>⚡ {checkin.struggles}</div>}
                </div>
              )}
            </div>
          )}

          {/* ── TRAINING ── */}
          {activeTab === 'training' && (
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
                Assigned Workouts ({upcoming.length} upcoming, {completed.length} completed)
              </div>
              {sessions.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'40px 20px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
                  No workout sessions assigned yet
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {sessions.map(s => (
                    <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:13, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:s.status==='completed'?t.greenDim:t.tealDim, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                        {s.status==='completed'?'✅':'💪'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{s.title}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{s.scheduled_date||'—'}{s.day_label?' · '+s.day_label:''}</div>
                        {s.session_rpe && <div style={{ fontSize:10, color:t.orange }}>RPE {s.session_rpe}{s.mood?' · '+s.mood:''}</div>}
                      </div>
                      <div style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20,
                        background:s.status==='completed'?t.greenDim:s.status==='in_progress'?t.tealDim:t.orangeDim,
                        color:s.status==='completed'?t.green:s.status==='in_progress'?t.teal:t.orange }}>
                        {s.status}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── NUTRITION ── */}
          {activeTab === 'nutrition' && (
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
                Today's Food Log — {today}
              </div>
              {!nutrition ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'40px 20px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
                  No nutrition logged today
                </div>
              ) : (
                <>
                  {/* Macro summary */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
                    {[
                      { label:'Calories', val:Math.round(nutrition.total_calories||0), color:t.orange },
                      { label:'Protein', val:`${Math.round(nutrition.total_protein||0)}g`, color:t.teal },
                      { label:'Carbs', val:`${Math.round(nutrition.total_carbs||0)}g`, color:t.yellow },
                      { label:'Fat', val:`${Math.round(nutrition.total_fat||0)}g`, color:t.purple },
                    ].map(s => (
                      <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px', textAlign:'center' }}>
                        <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
                        <div style={{ fontSize:10, color:t.textMuted }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {/* Food entries */}
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {MEAL_TIMES.map(mt => {
                      const mealEntries = entries.filter(e => e.meal_time === mt)
                      if (!mealEntries.length) return null
                      return (
                        <div key={mt} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:13, padding:'12px 14px' }}>
                          <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'capitalize', marginBottom:8 }}>
                            {mt.replace('_',' ')}
                          </div>
                          {mealEntries.map((e:any) => (
                            <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid '+t.border+'33' }}>
                              <div style={{ fontSize:13 }}>{e.food_name}</div>
                              <div style={{ fontSize:11, color:t.textMuted }}>{e.calories ? `${e.calories} cal` : ''}</div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── METRICS ── */}
          {activeTab === 'metrics' && (
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
                Latest Metrics
              </div>
              {!metrics ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'40px 20px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
                  No metrics logged yet
                </div>
              ) : (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16 }}>
                  <div style={{ fontSize:11, color:t.textMuted, marginBottom:12 }}>As of {metrics.logged_date}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    {[
                      { label:'Weight', val:metrics.weight ? `${metrics.weight} lbs` : null, color:t.teal },
                      { label:'Body Fat', val:metrics.body_fat ? `${metrics.body_fat}%` : null, color:t.orange },
                      { label:'Waist', val:metrics.waist ? `${metrics.waist}"` : null, color:t.purple },
                      { label:'Hips', val:metrics.hips ? `${metrics.hips}"` : null, color:t.pink },
                      { label:'Chest', val:metrics.chest ? `${metrics.chest}"` : null, color:t.blue },
                      { label:'Left Arm', val:metrics.left_arm ? `${metrics.left_arm}"` : null, color:t.green },
                    ].filter(m=>m.val).map(m => (
                      <div key={m.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'12px 14px' }}>
                        <div style={{ fontSize:18, fontWeight:800, color:m.color }}>{m.val}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  {metrics.notes && (
                    <div style={{ marginTop:12, fontSize:12, color:t.textDim, borderTop:'1px solid '+t.border, paddingTop:10 }}>{metrics.notes}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── CALENDAR ── */}
          {activeTab === 'calendar' && (
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
                Schedule — {calItems.length} event{calItems.length!==1?'s':''}
              </div>

              {/* Legend */}
              <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  { color:'#f5a623', label:'Upcoming workout' },
                  { color:'#22c55e', label:'Completed' },
                  { color:'#8b5cf6', label:'Coach event' },
                ].map(l => (
                  <div key={l.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:t.textMuted }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:l.color }}/>
                    {l.label}
                  </div>
                ))}
              </div>

              {calItems.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'40px 20px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
                  Nothing scheduled yet
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {calItems.map(item => {
                    const isPast = item.date < today
                    return (
                      <div key={item.id} style={{ background:t.surface, border:'1px solid '+(item.color+'30'), borderRadius:13, padding:'12px 16px', display:'flex', gap:12, alignItems:'flex-start', opacity:isPast?0.7:1 }}>
                        <div style={{ width:3, minHeight:40, borderRadius:2, background:item.color, flexShrink:0, marginTop:2 }}/>
                        <div style={{ flex:1 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                            <div style={{ fontSize:13, fontWeight:700 }}>{item.title}</div>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background:item.color+'20', color:item.color, textTransform:'capitalize' }}>{item.label}</span>
                          </div>
                          <div style={{ fontSize:11, color:t.textMuted }}>
                            📅 {new Date(item.date+'T00:00:00').toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' })}
                            {item.start_at && item.type==='calendar' && (
                              <span> · 🕐 {new Date(item.start_at).toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}</span>
                            )}
                          </div>
                          {item.session_rpe && <div style={{ fontSize:11, color:t.orange, marginTop:3 }}>RPE {item.session_rpe}{item.mood ? ' · '+item.mood : ''}</div>}
                          {item.description && <div style={{ fontSize:11, color:t.textDim, marginTop:4, lineHeight:1.5 }}>{item.description.slice(0,100)}{item.description.length>100?'...':''}</div>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  )
}
