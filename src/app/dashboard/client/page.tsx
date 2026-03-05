'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const NAV = [
  { id:'today',     label:'Today',    icon:'⚡' },
  { id:'workouts',  label:'Workouts', icon:'💪' },
  { id:'nutrition', label:'Nutrition',icon:'🥗' },
  { id:'metrics',   label:'Metrics',  icon:'📈' },
  { id:'library',   label:'Library',  icon:'📚' },
  { id:'messages',  label:'Messages', icon:'💬' },
]

export default function ClientDashboard() {
  const [profile,      setProfile]      = useState<any>(null)
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [habits,       setHabits]       = useState<any[]>([])
  const [habitLogs,    setHabitLogs]    = useState<Record<string,number>>({})
  const [milestones,   setMilestones]   = useState<any[]>([])
  const [recentPRs,    setRecentPRs]    = useState<any[]>([])
  const [workoutLogs,  setWorkoutLogs]  = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeNav,    setActiveNav]    = useState('today')
  const router   = useRouter()
  const supabase = createClient()
  const today    = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('profile_id', user.id)
        .eq('active', true)
        .single()
      setClientRecord(clientData)

      if (clientData) {
        const { data: habitData } = await supabase
          .from('habits')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('active', true)
        setHabits(habitData || [])

        const { data: habitLogData } = await supabase
          .from('habit_logs')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('logged_date', today)
        const logMap: Record<string,number> = {}
        habitLogData?.forEach((l:any) => { logMap[l.habit_id] = l.value })
        setHabitLogs(logMap)

        const { data: milestoneData } = await supabase
          .from('milestones')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('seen', false)
          .order('created_at', { ascending: false })
        setMilestones(milestoneData || [])

        const { data: prData } = await supabase
          .from('personal_records')
          .select('*, exercise:exercises(name)')
          .eq('client_id', clientData.id)
          .order('logged_date', { ascending: false })
          .limit(3)
        setRecentPRs(prData || [])

        const { data: wlData } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('client_id', clientData.id)
          .order('started_at', { ascending: false })
          .limit(5)
        setWorkoutLogs(wlData || [])
      }

      setLoading(false)
    }
    load()
  }, [])


  const logHabit = async (habitId: string, value: number) => {
    if (!clientRecord) return
    setHabitLogs(prev => ({ ...prev, [habitId]: value }))
    const existing = await supabase
      .from('habit_logs')
      .select('id')
      .eq('habit_id', habitId)
      .eq('client_id', clientRecord.id)
      .eq('logged_date', today)
      .single()
    if (existing.data) {
      await supabase.from('habit_logs').update({ value }).eq('id', existing.data.id)
    } else {
      await supabase.from('habit_logs').insert({ habit_id: habitId, client_id: clientRecord.id, logged_date: today, value })
    }
  }

  const dismissMilestone = async (id: string) => {
    await supabase.from('milestones').update({ seen: true }).eq('id', id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )


  const totalTasks = 3 + habits.length
  const doneTasks  = habits.filter(h => {
    const val = habitLogs[h.id] || 0
    return h.habit_type === 'check' ? val >= 1 : val >= h.target
  }).length
  const progressPct = Math.round((doneTasks / Math.max(totalTasks, 1)) * 100)

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .fade{animation:fadeUp 0.3s ease forwards;}
      `}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto' }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, flexShrink:0 }}>
          <div style={{ fontSize:16, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:12, color:t.textMuted, marginRight:12 }}>{profile?.full_name?.split(' ')[0]}</div>
          <button onClick={handleSignOut} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>Sign out</button>
        </div>

        {/* Nav */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, display:'flex', overflowX:'auto', flexShrink:0, padding:'0 6px' }}>
          {NAV.map(n => (
            <div key={n.id} onClick={()=>setActiveNav(n.id)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'10px 12px', cursor:'pointer', borderBottom:'2px solid '+(activeNav===n.id ? t.teal : 'transparent'), transition:'all 0.15s ease', flexShrink:0 }}>
              <span style={{ fontSize:15 }}>{n.icon}</span>
              <span style={{ fontSize:10, fontWeight:activeNav===n.id ? 700 : 500, color:activeNav===n.id ? t.teal : t.textDim, whiteSpace:'nowrap' }}>{n.label}</span>
            </div>
          ))}
        </div>


        {/* Main content */}
        <div style={{ flex:1, overflowY:'auto', padding:'18px 16px' }}>

          {/* Greeting */}
          <div style={{ marginBottom:18 }} className="fade">
            <div style={{ fontSize:22, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.2, marginBottom:4 }}>
              {getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋
            </div>
            <div style={{ fontSize:12, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>

          {/* Milestones / celebrations */}
          {milestones.map(m => (
            <div key={m.id} className="fade" style={{ background:'linear-gradient(135deg,'+t.yellow+'20,'+t.orange+'08)', border:'1px solid '+t.yellow+'30', borderRadius:16, padding:'16px 18px', marginBottom:12, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-8, right:-8, fontSize:60, opacity:0.07, lineHeight:1 }}>🏆</div>
              <div style={{ fontSize:20, marginBottom:6 }}>🎉</div>
              <div style={{ fontSize:14, fontWeight:700, color:t.yellow, lineHeight:1.4, marginBottom:10 }}>{m.message}</div>
              <button onClick={()=>dismissMilestone(m.id)}
                style={{ background:t.yellowDim, border:'1px solid '+t.yellow+'40', borderRadius:8, padding:'5px 14px', fontSize:11, fontWeight:700, color:t.yellow, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Thanks! ✓
              </button>
            </div>
          ))}

          {/* Day progress */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', marginBottom:14 }} className="fade">
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Today's Progress</div>
              <div style={{ fontSize:15, fontWeight:900, color:progressPct===100 ? t.green : t.teal }}>{progressPct}%</div>
            </div>
            <div style={{ height:7, background:t.surfaceHigh, borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:progressPct+'%', background:progressPct===100 ? 'linear-gradient(90deg,'+t.green+','+t.teal+')' : 'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:4, transition:'width 0.5s ease' }} />
            </div>
            {progressPct===100 && <div style={{ fontSize:11, color:t.green, fontWeight:700, marginTop:8, textAlign:'center' }}>You crushed today 💪 Be Kind to Yourself & Stay Awesome</div>}
          </div>


          {/* Today's workout */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.orange+')' }} />
            <div style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>💪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>Today's Workout</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                    {clientRecord?.program_id ? 'Assigned by Shane' : 'No workout assigned yet'}
                  </div>
                </div>
              </div>
              <button style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', color:'#000', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Start Workout 💪
              </button>
            </div>
          </div>

          {/* Habits */}
          {habits.length > 0 && (
            <div style={{ marginBottom:14 }} className="fade">
              <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Today's Habits</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {habits.map((h:any) => {
                  const val = habitLogs[h.id] || 0
                  const pct = h.habit_type==='check' ? (val?100:0) : Math.min(100, Math.round((val/h.target)*100))
                  const done = pct >= 100
                  const color = h.color || t.teal

                  if (h.habit_type === 'check') return (
                    <div key={h.id} onClick={()=>logHabit(h.id, val?0:1)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13, cursor:'pointer', transition:'all 0.2s ease' }}>
                      <div style={{ width:34, height:34, borderRadius:10, background:done?'linear-gradient(135deg,'+color+','+color+'aa)':t.surfaceHigh, border:'1px solid '+(done?color+'60':t.border), display:'flex', alignItems:'center', justifyContent:'center', fontSize:done?14:16, flexShrink:0, transition:'all 0.2s ease' }}>
                        {done ? '✓' : h.icon||'✅'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{done?'Done! 🎉':'Tap to complete'}</div>
                      </div>
                    </div>
                  )

                  return (
                    <div key={h.id} style={{ padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13, transition:'all 0.2s ease' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                        <span style={{ fontSize:18 }}>{h.icon||'📊'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>Target: {h.target}{h.unit}</div>
                        </div>
                        <div style={{ fontSize:15, fontWeight:800, color:done?color:t.textDim }}>{val||0}<span style={{ fontSize:10, color:t.textMuted }}>{h.unit}</span></div>
                      </div>
                      <div style={{ height:5, background:t.surfaceHigh, borderRadius:3, marginBottom:8, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+color+','+color+'bb)', borderRadius:3, transition:'width 0.4s ease' }} />
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <input type="number" placeholder={'Enter '+h.unit+'...'} defaultValue={val||''}
                          onBlur={e=>logHabit(h.id, +e.target.value||0)}
                          style={{ flex:1, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                        <button onClick={e=>{ const inp = e.currentTarget.previousElementSibling as HTMLInputElement; logHabit(h.id, +inp.value||0) }}
                          style={{ background:'linear-gradient(135deg,'+color+','+color+'cc)', border:'none', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Log</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}


          {/* No habits yet */}
          {habits.length === 0 && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'20px 16px', marginBottom:14, textAlign:'center' }} className="fade">
              <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>No habits assigned yet</div>
              <div style={{ fontSize:12, color:t.textMuted }}>Shane will set up your daily habits soon</div>
            </div>
          )}

          {/* Recent PRs */}
          {recentPRs.length > 0 && (
            <div style={{ background:'linear-gradient(135deg,'+t.yellow+'12,'+t.orange+'08)', border:'1px solid '+t.yellow+'25', borderRadius:14, padding:'14px 16px', marginBottom:14 }} className="fade">
              <div style={{ fontSize:12, fontWeight:800, color:t.yellow, marginBottom:10 }}>🏆 Recent PRs</div>
              {recentPRs.map((pr:any, i:number) => (
                <div key={pr.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom: i < recentPRs.length-1 ? '1px solid '+t.yellow+'15' : 'none' }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background:t.yellow, flexShrink:0 }} />
                  <div style={{ flex:1, fontSize:12, color:t.text }}>{pr.exercise?.name}</div>
                  <div style={{ fontSize:12, fontWeight:700, color:t.yellow }}>{pr.weight_pr}lbs</div>
                </div>
              ))}
            </div>
          )}

          {/* Recent workouts */}
          {workoutLogs.length > 0 && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', marginBottom:14 }} className="fade">
              <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Recent Workouts</div>
              {workoutLogs.map((w:any, i:number) => (
                <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom: i < workoutLogs.length-1 ? '1px solid '+t.border : 'none' }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, flexShrink:0 }}>💪</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600 }}>Workout Session</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{new Date(w.started_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}</div>
                  </div>
                  {w.finished_at && (
                    <div style={{ fontSize:11, color:t.orange, fontWeight:700 }}>
                      {Math.round((new Date(w.finished_at).getTime()-new Date(w.started_at).getTime())/60000)}m
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Empty state for new clients */}
          {workoutLogs.length === 0 && recentPRs.length === 0 && habits.length === 0 && (
            <div style={{ background:'linear-gradient(135deg,'+t.teal+'12,'+t.orange+'08)', border:'1px solid '+t.teal+'25', borderRadius:16, padding:'24px 18px', textAlign:'center', marginBottom:14 }} className="fade">
              <div style={{ fontSize:32, marginBottom:10 }}>🚀</div>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>You're all set!</div>
              <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Shane is setting up your program. Check back soon and let's get to work.</div>
            </div>
          )}

          {/* Tagline */}
          <div style={{ textAlign:'center', padding:'8px 0 24px', fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>

        </div>
      </div>
    </>
  )
}
