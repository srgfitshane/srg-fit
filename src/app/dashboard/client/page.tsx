'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import RichMessageThread from '@/components/messaging/RichMessageThread'
import NotificationBell from '@/components/notifications/NotificationBell'

const TENOR_KEY = process.env.NEXT_PUBLIC_TENOR_KEY || ''

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
  { id:'training',  label:'Training', icon:'💪' },
  { id:'nutrition', label:'Nutrition',icon:'🥗' },
  { id:'metrics',   label:'Metrics',  icon:'📈' },
  { id:'calendar',  label:'Calendar', icon:'📅' },
  { id:'messages',  label:'Messages', icon:'💬' },
  { id:'billing',   label:'Billing',  icon:'💳' },
]

const TRAINING_SUBNAV = [
  { id:'workouts',  label:'Workouts' },
  { id:'programs',  label:'Programs' },
]

export default function ClientDashboard() {
  const [profile,      setProfile]      = useState<any>(null)
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [coachProfileId, setCoachProfileId] = useState<string|null>(null)
  const [habits,       setHabits]       = useState<any[]>([])
  const [habitLogs,    setHabitLogs]    = useState<Record<string,number>>({})
  const [milestones,   setMilestones]   = useState<any[]>([])
  const [recentPRs,    setRecentPRs]    = useState<any[]>([])
  const [workoutLogs,  setWorkoutLogs]  = useState<any[]>([])
  const [nextSession,  setNextSession]  = useState<any>(null)
  const [pendingCheckins, setPendingCheckins] = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeNav,    setActiveNav]    = useState('today')
  const [trainingTab,  setTrainingTab]  = useState('workouts')
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
        // Fetch coach's profile ID for messaging
        const { data: coachProf } = await supabase
          .from('profiles').select('id').eq('id', clientData.coach_id).single()
        if (coachProf) setCoachProfileId(coachProf.id)
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

        // Next upcoming workout session
        const { data: nextSess } = await supabase
          .from('workout_sessions')
          .select('id, title, scheduled_date')
          .eq('client_id', clientData.id)
          .in('status', ['assigned', 'in_progress'])
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .single()
        setNextSession(nextSess || null)

        // Pending check-in form assignments
        const { data: pendingCI } = await supabase
          .from('client_form_assignments')
          .select('id, note, form:onboarding_forms(title, is_checkin_type)')
          .eq('client_id', clientData.id)
          .eq('status', 'pending')
          .eq('onboarding_forms.is_checkin_type', true)
          .limit(3)
        setPendingCheckins((pendingCI || []).filter((a: any) => a.form?.is_checkin_type))
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
          <div style={{ fontSize:12, color:t.textMuted, marginRight:8 }}>{profile?.full_name?.split(' ')[0]}</div>
          {profile?.id && <NotificationBell userId={profile.id} accentColor={t.teal} />}
          <button onClick={handleSignOut} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", marginLeft:8 }}>Sign out</button>
        </div>

        {/* Nav */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, display:'flex', overflowX:'auto', flexShrink:0, padding:'0 6px' }}>
          {NAV.map(n => (
            <div key={n.id} onClick={()=>{ if(n.id==='calendar') router.push('/dashboard/client/calendar'); else setActiveNav(n.id) }}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'10px 12px', cursor:'pointer', borderBottom:'2px solid '+(activeNav===n.id ? t.teal : 'transparent'), transition:'all 0.15s ease', flexShrink:0 }}>
              <span style={{ fontSize:15 }}>{n.icon}</span>
              <span style={{ fontSize:10, fontWeight:activeNav===n.id ? 700 : 500, color:activeNav===n.id ? t.teal : t.textDim, whiteSpace:'nowrap' }}>{n.label}</span>
            </div>
          ))}
        </div>


        {/* Main content */}
        <div style={{ flex:1, overflowY: activeNav === 'messages' ? 'hidden' : 'auto', padding: activeNav === 'messages' ? 0 : '18px 16px' }}>

          {/* Today content — hidden when messages OR training OR nutrition tab active */}
          {activeNav !== 'messages' && activeNav !== 'training' && activeNav !== 'nutrition' && <>

          {/* Greeting */}
          <div style={{ marginBottom:18 }} className="fade">
            <div style={{ fontSize:22, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.2, marginBottom:4 }}>
              {getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋
            </div>
            <div style={{ fontSize:12, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>

          {/* Profile completion nudge */}
          <ProfileNudge clientId={clientRecord?.id} onOpen={()=>router.push('/dashboard/client/profile')} />

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


          {/* Pending custom check-in forms */}
          {pendingCheckins.map((a: any) => (
            <div key={a.id} style={{ background:t.surface, border:'1px solid '+t.purple+'50', borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
              <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.teal+')' }} />
              <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>{a.form?.title || 'Check-in'}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{a.note || 'Your coach sent you a check-in to complete'}</div>
                </div>
                <button onClick={()=>router.push('/dashboard/client/forms/'+a.id)}
                  style={{ background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', border:'none', borderRadius:9, padding:'8px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                  Fill out →
                </button>
              </div>
            </div>
          ))}

          {/* Default weekly check-in card */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.pink+')' }} />
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>Weekly Check-in</div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Reflect on your week & keep Shane in the loop</div>
              </div>
              <button onClick={()=>router.push('/dashboard/client/checkin')}
                style={{ background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', border:'none', borderRadius:9, padding:'8px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                Check in →
              </button>
            </div>
          </div>

          {/* Today's workout */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.orange+')' }} />
            <div style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>💪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>{nextSession ? nextSession.title : "Today's Workout"}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                    {nextSession
                      ? nextSession.scheduled_date ? `Scheduled ${nextSession.scheduled_date}` : 'Ready when you are'
                      : 'No workout assigned yet'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => nextSession && router.push(`/dashboard/client/workout/${nextSession.id}`)}
                disabled={!nextSession}
                style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background: nextSession ? 'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)' : t.surfaceHigh, color: nextSession ? '#000' : t.textMuted, fontSize:13, fontWeight:800, cursor: nextSession ? 'pointer' : 'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                {nextSession ? 'Start Workout 💪' : 'No Workout Assigned'}
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

          {/* Progress quick link */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }} />
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:t.teal+'18', border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📈</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>My Progress</div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Charts, measurements & progress photos</div>
              </div>
              <button onClick={()=>router.push('/dashboard/client/progress')}
                style={{ background:t.teal+'22', color:t.teal, border:'1px solid '+t.teal+'44',
                  borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                View →
              </button>
            </div>
          </div>

          {/* Resources quick link */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.orange+','+t.purple+')' }} />
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:t.orange+'18', border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📚</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>Resource Library</div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Guides, videos & articles from your coach</div>
              </div>
              <button onClick={()=>router.push('/dashboard/client/resources')}
                style={{ background:t.orange+'22', color:t.orange, border:'1px solid '+t.orange+'44',
                  borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                Browse →
              </button>
            </div>
          </div>

          {/* Community quick link */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.orange+')' }} />
            <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:12, background:t.teal+'18', border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🏘️</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>SRG Fit Community</div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Share wins & hype up your crew</div>
              </div>
              <button onClick={()=>router.push('/dashboard/client/community')}
                style={{ background:t.teal+'22', color:t.teal, border:'1px solid '+t.teal+'44',
                  borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                Join →
              </button>
            </div>
          </div>

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

          </> /* end today content */}

          {/* ── TODAY TAB (explicit) ── */}
          {activeNav === 'today' && (
            <div style={{ textAlign:'center', padding:'8px 0 24px', fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
              Be Kind to Yourself & Stay Awesome 💪
            </div>
          )}

          {/* ── TRAINING TAB ── */}
          {activeNav === 'training' && (
            <TrainingTab clientRecord={clientRecord} supabase={supabase} router={router} t={t} />
          )}

          {/* ── NUTRITION TAB ── */}
          {activeNav === 'nutrition' && (
            <NutritionTab clientRecord={clientRecord} supabase={supabase} t={t} />
          )}

          {/* ── MESSAGES TAB ── */}
          {activeNav === 'messages' && (
            <div style={{ margin:'-18px -16px', height:'calc(100vh - 112px)' }}>
              {profile && coachProfileId ? (
                <RichMessageThread
                  myId={profile.id}
                  otherId={coachProfileId}
                  otherName="Coach Shane"
                  tenorKey={TENOR_KEY}
                  height="100%"
                />
              ) : (
                <div style={{ padding:40, textAlign:'center', color:t.textMuted, fontSize:13 }}>
                  {!clientRecord ? 'No coach assigned yet.' : 'Loading messages...'}
                </div>
              )}
            </div>
          )}

          {/* ── Billing Tab ── */}
          {activeNav === 'billing' && (
            <BillingTab clientRecord={clientRecord} supabase={supabase} />
          )}

          {/* Tagline */}
          {activeNav !== 'messages' && activeNav !== 'billing' && activeNav !== 'training' && activeNav !== 'today' && activeNav !== 'nutrition' && (
          <div style={{ textAlign:'center', padding:'8px 0 24px', fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>
          )}

        </div>
      </div>
    </>
  )
}


// ── BillingTab ────────────────────────────────────────────────────────────
function BillingTab({ clientRecord, supabase }: { clientRecord: any, supabase: any }) {
  const [sub, setSub] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  const tc = {
    bg:'#0f0f0f', surface:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
    accent:'#00c9b1', text:'#eeeef8', textDim:'#8888a8', textMuted:'#5a5a78',
    success:'#22c55e', warn:'#f59e0b', danger:'#ef4444'
  }

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const { data: subData } = await supabase
        .from('subscriptions').select('*')
        .eq('client_id', clientRecord.id)
        .order('created_at', { ascending: false })
        .limit(1).single()
      setSub(subData)

      if (subData?.plan_id) {
        const { data: planData } = await supabase
          .from('coaching_plans').select('*').eq('id', subData.plan_id).single()
        setPlan(planData)
      }
      setLoading(false)
    }
    load()
  }, [clientRecord])

  async function openPortal() {
    setPortalLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ return_url: window.location.href })
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert('Could not open billing portal: ' + (data.error || 'Unknown error'))
    setPortalLoading(false)
  }

  const statusColors: Record<string, string> = {
    active: tc.success, trialing: tc.accent, past_due: tc.warn,
    canceled: tc.danger, unpaid: tc.danger, paused: tc.textDim, none: tc.textMuted
  }

  const statusLabel: Record<string, string> = {
    active: '✅ Active', trialing: '🔄 Trial', past_due: '⚠️ Past Due',
    canceled: '❌ Canceled', unpaid: '❌ Unpaid', paused: '⏸ Paused', none: '— No subscription'
  }

  const status = clientRecord?.subscription_status || 'none'
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'
  const fmtAmt = (cents: number, interval: string) => {
    if (!cents) return '—'
    const amt = `$${(cents / 100).toFixed(2)}`
    if (interval === 'month') return `${amt}/mo`
    if (interval === 'year') return `${amt}/yr`
    return amt
  }

  return (
    <div style={{ padding:'0 0 32px' }}>
      <h2 style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>Billing & Subscription</h2>

      {loading ? (
        <p style={{ color:tc.textMuted, fontSize:13 }}>Loading billing info...</p>
      ) : (
        <>
          {/* Status Card */}
          <div style={{ background:tc.surface, border:`1px solid ${tc.border}`, borderRadius:14, padding:'20px 22px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: sub ? 16 : 0 }}>
              <div>
                <p style={{ fontSize:12, color:tc.textMuted, margin:'0 0 4px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Status</p>
                <p style={{ fontSize:20, fontWeight:800, margin:0, color: statusColors[status] || tc.textDim }}>
                  {statusLabel[status] || status}
                </p>
              </div>
              {plan && (
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:12, color:tc.textMuted, margin:'0 0 4px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Plan</p>
                  <p style={{ fontSize:15, fontWeight:800, margin:0, color:tc.accent }}>{fmtAmt(plan.amount_cents, plan.interval)}</p>
                  <p style={{ fontSize:11, color:tc.textDim, margin:'2px 0 0' }}>{plan.name}</p>
                </div>
              )}
            </div>

            {sub && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Current Period', value: sub.current_period_end ? `Renews ${fmtDate(sub.current_period_end)}` : '—' },
                  { label:'Started', value: fmtDate(sub.created_at) },
                  ...(sub.trial_end ? [{ label:'Trial Ends', value: fmtDate(sub.trial_end) }] : []),
                  ...(sub.cancel_at_period_end ? [{ label:'Cancels', value: fmtDate(sub.current_period_end) }] : []),
                  ...(sub.grace_period_end ? [{ label:'Grace Period Ends', value: fmtDate(sub.grace_period_end) }] : []),
                ].map(item => (
                  <div key={item.label} style={{ background:tc.surfaceHigh, borderRadius:8, padding:'10px 12px' }}>
                    <p style={{ fontSize:11, color:tc.textMuted, margin:'0 0 3px', fontWeight:600 }}>{item.label}</p>
                    <p style={{ fontSize:13, fontWeight:700, margin:0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {status === 'past_due' && (
              <div style={{ background:'#f59e0b18', border:'1px solid #f59e0b44', borderRadius:10, padding:'10px 14px', marginTop:14 }}>
                <p style={{ margin:0, fontSize:13, color:tc.warn, fontWeight:700 }}>⚠️ Payment Past Due</p>
                <p style={{ margin:'4px 0 0', fontSize:12, color:tc.textDim }}>Please update your payment method to keep your access.</p>
              </div>
            )}
          </div>

          {/* Manage Button */}
          {clientRecord?.stripe_customer_id && (
            <button onClick={openPortal} disabled={portalLoading}
              style={{ width:'100%', background:'linear-gradient(135deg,#00c9b1,#00a090)', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontWeight:700, color:'#000', cursor: portalLoading ? 'default' : 'pointer', opacity: portalLoading ? 0.7 : 1, fontFamily:"'DM Sans',sans-serif" }}>
              {portalLoading ? 'Opening...' : '💳 Manage Billing & Payment Method'}
            </button>
          )}

          {status === 'none' && (
            <div style={{ background:tc.surface, border:`1px solid ${tc.border}`, borderRadius:14, padding:'32px 22px', textAlign:'center' }}>
              <p style={{ fontSize:24, marginBottom:8 }}>💳</p>
              <p style={{ color:tc.textDim, fontSize:13, margin:0 }}>No active subscription. Contact your coach to get set up.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── ProfileNudge: shown on dashboard if intake not filled ──────────────────
function ProfileNudge({ clientId, onOpen }: { clientId: string|null, onOpen: ()=>void }) {
  const supabase = createClient()
  const [pct, setPct] = useState<number|null>(null)

  useEffect(() => {
    if (!clientId) return
    const check = async () => {
      const { data } = await supabase.from('client_intake_profiles').select('primary_goal,training_experience,activity_level,dietary_approach,date_of_birth,starting_weight_lbs').eq('client_id', clientId).single()
      if (!data) { setPct(0); return }
      const fields = [data.primary_goal, data.training_experience, data.activity_level, data.dietary_approach, data.date_of_birth, data.starting_weight_lbs]
      setPct(Math.round(fields.filter(Boolean).length / fields.length * 100))
    }
    check()
  }, [clientId])

  if (pct === null || pct === 100) return null

  const colors = { teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', surface:'#0f0f1a', border:'#252538', text:'#eeeef8', textMuted:'#5a5a78' }
  const c = colors

  return (
    <div style={{ background:'linear-gradient(135deg,'+c.teal+'18,'+c.orange+'08)', border:'1px solid '+c.teal+'30', borderRadius:16, padding:'14px 16px', marginBottom:14 }} className="fade">
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:22, flexShrink:0 }}>📋</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:2 }}>Complete your intake profile</div>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:8 }}>Help your coach build the perfect program for you — {pct}% complete</div>
          <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+c.teal+','+c.orange+')', borderRadius:4 }} />
          </div>
        </div>
        <button onClick={onOpen} style={{ background:'linear-gradient(135deg,'+c.teal+','+c.teal+'cc)', border:'none', borderRadius:9, padding:'8px 14px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
          {pct === 0 ? 'Get Started' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}


// ── TrainingTab ───────────────────────────────────────────────────────────
function TrainingTab({ clientRecord, supabase, router, t }: any) {
  const [program, setProgram] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'program'|'workouts'>('program')

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const [{ data: prog }, { data: sess }] = await Promise.all([
        supabase.from('programs').select('id, name, description, goal, duration_weeks, difficulty')
          .eq('client_id', clientRecord.id).eq('is_template', false)
          .order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('workout_sessions')
          .select('id, title, status, scheduled_date, day_label, session_rpe, mood, completed_at, duration_seconds, notes_coach')
          .eq('client_id', clientRecord.id)
          .order('scheduled_date', { ascending: true })
          .limit(50),
      ])
      setProgram(prog || null)
      setSessions(sess || [])
      setLoading(false)
    }
    load()
  }, [clientRecord?.id])

  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')
  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m` : null

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading training...</div>

  if (view === 'workouts') return (
    <div style={{ paddingBottom:32 }}>
      {/* Back to program */}
      <button onClick={() => setView('program')}
        style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6, marginBottom:18, padding:0 }}>
        ← {program?.name || 'Program'}
      </button>

      {/* Upcoming sessions */}
      <div style={{ marginBottom:20 }}>
        <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
          Upcoming ({upcoming.length})
        </p>
        {upcoming.length === 0 ? (
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
            <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>All caught up!</p>
          </div>
        ) : upcoming.map(s => (
          <div key={s.id} onClick={() => router.push(`/dashboard/client/workout/${s.id}`)}
            style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', marginBottom:10, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:s.status==='in_progress'?t.tealDim:t.orangeDim, border:'1px solid '+(s.status==='in_progress'?t.teal:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {s.status === 'in_progress' ? '▶️' : '💪'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{s.title}</div>
              <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>
                {s.scheduled_date}{s.day_label ? ` · ${s.day_label}` : ''}
              </div>
              {s.notes_coach && <div style={{ fontSize:11, color:t.orange, marginTop:4 }}>📌 {s.notes_coach.slice(0,60)}{s.notes_coach.length>60?'...':''}</div>}
            </div>
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:s.status==='in_progress'?t.tealDim:t.orangeDim, color:s.status==='in_progress'?t.teal:t.orange, border:`1px solid ${s.status==='in_progress'?t.teal:t.orange}30` }}>
              {s.status === 'in_progress' ? 'Resume' : 'Start'}
            </span>
          </div>
        ))}
      </div>

      {/* Completed sessions */}
      {completed.length > 0 && (
        <div>
          <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
            Completed ({completed.length})
          </p>
          <div style={{ display:'grid', gap:8 }}>
            {completed.map(s => (
              <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>✅</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:t.textDim }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : s.scheduled_date}</div>
                </div>
                <div style={{ textAlign:'right' as const }}>
                  {fmtDur(s.duration_seconds) && <div style={{ fontSize:12, fontWeight:700, color:t.orange }}>{fmtDur(s.duration_seconds)}</div>}
                  {s.session_rpe && <div style={{ fontSize:11, color:t.textMuted }}>RPE {s.session_rpe}</div>}
                  {s.mood && <div style={{ fontSize:14 }}>{{ great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }[s.mood as 'great'|'good'|'okay'|'tired'|'awful']}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Default view: program card
  return (
    <div style={{ paddingBottom:32 }}>
      {!program ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💪</div>
          <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>No program assigned yet</div>
          <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Your coach is building your program. Check back soon!</div>
        </div>
      ) : (
        <>
          {/* Program card */}
          <div style={{ background:t.surface, border:'1px solid '+t.teal+'30', borderRadius:16, overflow:'hidden', marginBottom:16 }}>
            <div style={{ height:4, background:`linear-gradient(90deg,${t.teal},${t.orange})` }} />
            <div style={{ padding:'20px 20px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:16 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>💪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>{program.name}</div>
                  {program.description && <div style={{ fontSize:13, color:t.textDim, lineHeight:1.6 }}>{program.description}</div>}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { label:'Duration', val: program.duration_weeks ? `${program.duration_weeks}w` : '—', color:t.teal },
                  { label:'Difficulty', val: program.difficulty || '—', color:t.orange },
                  { label:'Goal', val: program.goal || '—', color:t.green },
                ].map(s => (
                  <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'12px', textAlign:'center' as const }}>
                    <div style={{ fontSize:15, fontWeight:800, color:s.color, marginBottom:2 }}>{s.val}</div>
                    <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', fontWeight:700 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Sessions summary + CTA */}
              <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>
                    {upcoming.length > 0
                      ? `${upcoming.length} workout${upcoming.length!==1?'s':''} scheduled`
                      : sessions.length > 0 ? 'All workouts completed! 🎉' : 'No sessions yet'}
                  </div>
                  {upcoming.length > 0 && (
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                      Next: {upcoming[0]?.scheduled_date}
                    </div>
                  )}
                  {completed.length > 0 && (
                    <div style={{ fontSize:11, color:t.green, marginTop:2 }}>✅ {completed.length} completed</div>
                  )}
                </div>
                <button onClick={() => setView('workouts')}
                  style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                  View All →
                </button>
              </div>
            </div>
          </div>

          {/* Quick-start: next session */}
          {upcoming.length > 0 && (
            <div onClick={() => router.push(`/dashboard/client/workout/${upcoming[0].id}`)}
              style={{ background:t.surface, border:'1px solid '+t.orange+'40', borderRadius:16, overflow:'hidden', cursor:'pointer' }}>
              <div style={{ height:3, background:`linear-gradient(90deg,${t.orange},${t.yellow})` }} />
              <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {upcoming[0].status === 'in_progress' ? '▶️' : '💪'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>
                    {upcoming[0].status === 'in_progress' ? 'Resume Workout' : 'Up Next'}
                  </div>
                  <div style={{ fontSize:13, color:t.text, marginTop:2 }}>{upcoming[0].title}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{upcoming[0].scheduled_date}{upcoming[0].day_label ? ` · ${upcoming[0].day_label}` : ''}</div>
                </div>
                <div style={{ background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:800, color:'#000', whiteSpace:'nowrap' as const }}>
                  {upcoming[0].status === 'in_progress' ? 'Resume ▶' : 'Start 💪'}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── WorkoutsTab ───────────────────────────────────────────────────────────
function WorkoutsTab({ clientRecord, supabase, router, t }: any) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientRecord?.id) return
    supabase.from('workout_sessions')
      .select('id, title, status, scheduled_date, day_label, mood, session_rpe, completed_at, duration_seconds, notes_coach')
      .eq('client_id', clientRecord.id)
      .order('scheduled_date', { ascending: false })
      .limit(30)
      .then(({ data }: any) => { setSessions(data || []); setLoading(false) })
  }, [clientRecord?.id])

  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')

  const statusStyle = (s: string) => ({
    background: s === 'completed' ? t.greenDim : s === 'in_progress' ? t.tealDim : t.orangeDim,
    color: s === 'completed' ? t.green : s === 'in_progress' ? t.teal : t.orange,
    border: `1px solid ${s === 'completed' ? t.green : s === 'in_progress' ? t.teal : t.orange}30`
  })

  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m` : null

  if (!clientRecord) return (
    <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>No coach assigned yet.</div>
  )

  return (
    <div style={{ paddingBottom:32 }}>
      {loading ? (
        <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading workouts...</div>
      ) : (
        <>
          {/* Upcoming */}
          <div style={{ marginBottom:24 }}>
            <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
              Upcoming ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💤</div>
                <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>No workouts assigned yet</p>
                <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your next session here</p>
              </div>
            ) : upcoming.map(s => (
              <div key={s.id}
                onClick={() => router.push(`/dashboard/client/workout/${s.id}`)}
                style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', marginBottom:10, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {s.status === 'in_progress' ? '▶️' : '💪'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{s.title}</div>
                  <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>
                    {s.scheduled_date || 'No date'}{s.day_label ? ` · ${s.day_label}` : ''}
                  </div>
                  {s.notes_coach && (
                    <div style={{ fontSize:11, color:t.orange, marginTop:4 }}>📌 {s.notes_coach.slice(0,60)}{s.notes_coach.length>60?'...':''}</div>
                  )}
                </div>
                <div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, ...statusStyle(s.status) }}>
                    {s.status === 'in_progress' ? 'In Progress' : 'Start'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
                Completed ({completed.length})
              </p>
              <div style={{ display:'grid', gap:8 }}>
                {completed.map(s => (
                  <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>✅</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{s.title}</div>
                      <div style={{ fontSize:11, color:t.textDim }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : s.scheduled_date}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      {fmtDur(s.duration_seconds) && <div style={{ fontSize:12, fontWeight:700, color:t.orange }}>{fmtDur(s.duration_seconds)}</div>}
                      {s.session_rpe && <div style={{ fontSize:11, color:t.textMuted }}>RPE {s.session_rpe}</div>}
                      {s.mood && <div style={{ fontSize:14 }}>{{ great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }[s.mood as 'great'|'good'|'okay'|'tired'|'awful']}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── ProgramsTab ───────────────────────────────────────────────────────────
function ProgramsTab({ clientRecord, supabase, router, t }: any) {
  const [programs, setPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    supabase.from('programs')
      .select('id, name, description, duration_weeks, days_per_week, goal, level, active, start_date')
      .eq('client_id', clientRecord.id)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => { setPrograms(data || []); setLoading(false) })
  }, [clientRecord?.id])

  const levelColor = (l: string) => ({
    beginner: t.green, intermediate: t.orange, advanced: t.red
  }[l?.toLowerCase()] || t.textDim)

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading...</div>

  return (
    <div style={{ paddingBottom:32 }}>
      {programs.length === 0 ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>No program assigned yet</p>
          <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your program here</p>
        </div>
      ) : programs.map((p: any) => (
        <div key={p.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
            <div style={{ fontSize:32 }}>📋</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>{p.name}</div>
              {p.description && <div style={{ fontSize:13, color:t.textDim, lineHeight:1.5 }}>{p.description}</div>}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { label:'Duration', value: p.duration_weeks ? `${p.duration_weeks} weeks` : '—' },
              { label:'Frequency', value: p.days_per_week ? `${p.days_per_week}x/week` : '—' },
              { label:'Level', value: p.level || '—', color: levelColor(p.level) },
            ].map(stat => (
              <div key={stat.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:(stat as any).color || t.accent }}>{stat.value}</div>
                <div style={{ fontSize:11, color:t.textMuted }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {p.goal && (
            <div style={{ marginTop:12, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px' }}>
              <span style={{ fontSize:12, color:t.teal }}>🎯 Goal: {p.goal}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── ExercisesTab ──────────────────────────────────────────────────────────
function ExercisesTab({ supabase, t }: any) {
  const [exercises, setExercises] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [expanded, setExpanded] = useState<string|null>(null)
  const [groups, setGroups] = useState<string[]>([])

  useEffect(() => {
    supabase.from('exercises')
      .select('id, name, muscle_group, exercise_type, description, instructions, video_url')
      .order('name')
      .then(({ data }: any) => {
        setExercises(data || [])
        const g = [...new Set((data || []).map((e: any) => e.muscle_group).filter(Boolean))] as string[]
        setGroups(g.sort())
        setLoading(false)
      })
  }, [])

  const filtered = exercises.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscle_group?.toLowerCase().includes(search.toLowerCase())
    const matchGroup = filterGroup === 'all' || e.muscle_group === filterGroup
    return matchSearch && matchGroup
  })

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading library...</div>

  return (
    <div style={{ paddingBottom:32 }}>
      <div style={{ marginBottom:12, display:'flex', gap:8, flexDirection:'column' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises..."
          style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
          <button onClick={() => setFilterGroup('all')}
            style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background: filterGroup==='all' ? t.teal : t.surfaceHigh, color: filterGroup==='all' ? '#0f0f0f' : t.textDim, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            All
          </button>
          {groups.map(g => (
            <button key={g} onClick={() => setFilterGroup(g)}
              style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background: filterGroup===g ? t.teal : t.surfaceHigh, color: filterGroup===g ? '#0f0f0f' : t.textDim, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize:12, color:t.textMuted, marginBottom:10 }}>{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</div>
      <div style={{ display:'grid', gap:6 }}>
        {filtered.map(ex => (
          <div key={ex.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, overflow:'hidden' }}>
            <div onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
              style={{ padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{ex.name}</div>
                {ex.muscle_group && <div style={{ fontSize:11, color:t.textMuted }}>{ex.muscle_group}{ex.exercise_type ? ` · ${ex.exercise_type}` : ''}</div>}
              </div>
              <span style={{ fontSize:12, color:t.textDim }}>{expanded === ex.id ? '▲' : '▼'}</span>
            </div>
            {expanded === ex.id && (ex.description || ex.instructions || ex.video_url) && (
              <div style={{ padding:'0 16px 14px', borderTop:'1px solid '+t.border }}>
                {ex.description && <p style={{ fontSize:13, color:t.textDim, lineHeight:1.6, marginTop:10 }}>{ex.description}</p>}
                {ex.instructions && <p style={{ fontSize:12, color:t.textMuted, lineHeight:1.6, marginTop:6 }}>{ex.instructions}</p>}
                {ex.video_url && (
                  <a href={ex.video_url} target="_blank" rel="noreferrer"
                    style={{ display:'inline-block', marginTop:10, fontSize:12, color:t.teal, fontWeight:700 }}>
                    ▶ Watch Demo
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NutritionTab ──────────────────────────────────────────────────────────
const MEAL_TIMES = [
  { id:'breakfast',       label:'Breakfast',       icon:'🌅' },
  { id:'morning_snack',   label:'Morning Snack',   icon:'🍎' },
  { id:'lunch',           label:'Lunch',           icon:'🥙' },
  { id:'afternoon_snack', label:'Afternoon Snack', icon:'🥜' },
  { id:'pre_workout',     label:'Pre-Workout',     icon:'⚡' },
  { id:'dinner',          label:'Dinner',          icon:'🍽' },
  { id:'post_workout',    label:'Post-Workout',    icon:'💪' },
  { id:'evening_snack',   label:'Evening Snack',   icon:'🌙' },
]

function NutritionTab({ clientRecord, supabase, t }: any) {
  const today = new Date().toISOString().split('T')[0]
  const [plan, setPlan] = useState<any>(null)
  const [log, setLog] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addingMeal, setAddingMeal] = useState<string|null>(null)
  const [newEntry, setNewEntry] = useState({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving', meal_time:'breakfast' })
  const [saving, setSaving] = useState(false)
  const [waterTaps, setWaterTaps] = useState(0)
  const [selectedDate, setSelectedDate] = useState(today)

  useEffect(() => { if (clientRecord?.id) loadData() }, [clientRecord?.id, selectedDate])

  async function loadData() {
    setLoading(true)
    const [{ data: activePlan }, { data: dailyLog }] = await Promise.all([
      supabase.from('nutrition_plans').select('*').eq('client_id', clientRecord.id).eq('is_active', true).single(),
      supabase.from('nutrition_daily_logs').select('*').eq('client_id', clientRecord.id).eq('log_date', selectedDate).single()
    ])
    setPlan(activePlan)
    if (dailyLog) {
      setLog(dailyLog)
      setWaterTaps(dailyLog.water_oz_logged || 0)
      const { data: ents } = await supabase.from('food_entries').select('*').eq('daily_log_id', dailyLog.id).order('logged_at')
      setEntries(ents || [])
    } else {
      setLog(null)
      setEntries([])
      setWaterTaps(0)
    }
    setLoading(false)
  }

  async function ensureLog() {
    if (log) return log
    const { data: newLog } = await supabase.from('nutrition_daily_logs').upsert({
      client_id: clientRecord.id,
      coach_id: clientRecord.coach_id,
      plan_id: plan?.id || null,
      log_date: selectedDate,
    }, { onConflict: 'client_id,log_date' }).select().single()
    setLog(newLog)
    return newLog
  }

  async function addEntry() {
    if (!newEntry.food_name) return
    setSaving(true)
    const currentLog = await ensureLog()
    const entry = {
      daily_log_id: currentLog.id,
      client_id: clientRecord.id,
      meal_time: addingMeal || 'other',
      food_name: newEntry.food_name,
      serving_size: newEntry.serving_size,
      serving_qty: 1,
      calories: parseFloat(newEntry.calories) || null,
      protein_g: parseFloat(newEntry.protein_g) || null,
      carbs_g: parseFloat(newEntry.carbs_g) || null,
      fat_g: parseFloat(newEntry.fat_g) || null,
    }
    const { data: saved } = await supabase.from('food_entries').insert(entry).select().single()
    if (saved) {
      setEntries(prev => [...prev, saved])
      await recalcTotals(currentLog.id, [...entries, saved])
    }
    setNewEntry({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving', meal_time:'breakfast' })
    setAddingMeal(null)
    setSaving(false)
  }

  async function removeEntry(id: string) {
    await supabase.from('food_entries').delete().eq('id', id)
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    if (log) await recalcTotals(log.id, updated)
  }

  async function recalcTotals(logId: string, ents: any[]) {
    const totals = ents.reduce((acc, e) => ({
      total_calories: acc.total_calories + (e.calories || 0),
      total_protein:  acc.total_protein  + (e.protein_g || 0),
      total_carbs:    acc.total_carbs    + (e.carbs_g   || 0),
      total_fat:      acc.total_fat      + (e.fat_g     || 0),
    }), { total_calories:0, total_protein:0, total_carbs:0, total_fat:0 })
    const { data: updated } = await supabase.from('nutrition_daily_logs').update(totals).eq('id', logId).select().single()
    if (updated) setLog(updated)
  }

  async function updateWater(oz: number) {
    const newOz = Math.max(0, oz)
    setWaterTaps(newOz)
    const currentLog = await ensureLog()
    await supabase.from('nutrition_daily_logs').update({ water_oz_logged: newOz }).eq('id', currentLog.id)
  }

  const totals = {
    calories: log?.total_calories || 0,
    protein:  log?.total_protein  || 0,
    carbs:    log?.total_carbs    || 0,
    fat:      log?.total_fat      || 0,
  }

  const pct = (val: number, target: number) => target > 0 ? Math.min(100, Math.round((val/target)*100)) : 0

  const macros = [
    { label:'Calories', val: Math.round(totals.calories), target: plan?.calories_target, unit:'kcal', color: '#c8f545' },
    { label:'Protein',  val: Math.round(totals.protein),  target: plan?.protein_g,       unit:'g',    color: '#60a5fa' },
    { label:'Carbs',    val: Math.round(totals.carbs),    target: plan?.carbs_g,         unit:'g',    color: '#f5a623' },
    { label:'Fat',      val: Math.round(totals.fat),      target: plan?.fat_g,           unit:'g',    color: '#f472b6' },
  ]

  const entriesByMeal: Record<string, any[]> = {}
  for (const e of entries) {
    const key = e.meal_time || 'other'
    if (!entriesByMeal[key]) entriesByMeal[key] = []
    entriesByMeal[key].push(e)
  }

  if (!clientRecord) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>No coach assigned.</div>

  return (
    <div style={{ paddingBottom:40 }}>

      {/* Date picker */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'7px 12px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        {selectedDate !== today && (
          <button onClick={()=>setSelectedDate(today)}
            style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.textDim, cursor:'pointer' }}>
            Today
          </button>
        )}
        {plan && <span style={{ fontSize:12, color:t.teal, marginLeft:'auto' }}>📋 {plan.name}</span>}
      </div>

      {loading ? (
        <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted }}>Loading...</div>
      ) : (
        <>
          {/* No plan state */}
          {!plan && (
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'20px', marginBottom:16, textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🥗</div>
              <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>No active nutrition plan yet</p>
              <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your nutrition targets. You can still log food below!</p>
            </div>
          )}

          {/* Coach notes */}
          {plan?.notes && (
            <div style={{ background:'#1a1a0a', border:'1px solid #3a3a1a', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', gap:8 }}>
              <span style={{ fontSize:16 }}>📌</span>
              <p style={{ fontSize:13, color:t.orange, lineHeight:1.5 }}>{plan.notes}</p>
            </div>
          )}

          {/* Macro rings */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
            {macros.map(m => {
              const p = pct(m.val, m.target)
              const r = 22, circ = 2*Math.PI*r
              return (
                <div key={m.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 8px', textAlign:'center' }}>
                  <svg width="60" height="60" style={{ display:'block', margin:'0 auto 6px' }}>
                    <circle cx="30" cy="30" r={r} fill="none" stroke={t.surfaceHigh} strokeWidth="4"/>
                    <circle cx="30" cy="30" r={r} fill="none" stroke={m.color} strokeWidth="4"
                      strokeDasharray={circ}
                      strokeDashoffset={circ - (circ * p / 100)}
                      strokeLinecap="round"
                      transform="rotate(-90 30 30)"
                      style={{ transition:'stroke-dashoffset 0.5s ease' }}/>
                    <text x="30" y="35" textAnchor="middle" fontSize="11" fontWeight="700" fill={m.color}>{p}%</text>
                  </svg>
                  <div style={{ fontSize:13, fontWeight:700 }}>{m.val}<span style={{ fontSize:10, color:t.textMuted }}>{m.unit}</span></div>
                  {m.target && <div style={{ fontSize:10, color:t.textMuted }}>/{m.target}{m.unit}</div>}
                  <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{m.label}</div>
                </div>
              )
            })}
          </div>

          {/* Water tracker */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <span style={{ fontSize:16 }}>💧</span>
              <span style={{ fontSize:13, fontWeight:700 }}>Water</span>
              <span style={{ fontSize:13, color:t.teal, marginLeft:'auto', fontWeight:700 }}>
                {waterTaps} / {plan?.water_oz || 64} oz
              </span>
            </div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {Array.from({length: Math.ceil((plan?.water_oz || 64) / 8)}).map((_,i) => (
                <button key={i} onClick={()=>updateWater(waterTaps === (i+1)*8 ? waterTaps-8 : (i+1)*8)}
                  style={{ fontSize:18, background:'none', border:'none', cursor:'pointer', opacity: waterTaps >= (i+1)*8 ? 1 : 0.3, transition:'opacity 0.2s' }}>
                  💧
                </button>
              ))}
            </div>
          </div>

          {/* Food log by meal */}
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em' }}>Food Log</p>
              <span style={{ fontSize:12, color:t.textMuted }}>{entries.length} item{entries.length!==1?'s':''}</span>
            </div>

            {MEAL_TIMES.map(meal => {
              const mealEntries = entriesByMeal[meal.id] || []
              const mealCals = mealEntries.reduce((a,e) => a+(e.calories||0), 0)
              const isAdding = addingMeal === meal.id
              return (
                <div key={meal.id} style={{ marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', cursor:'pointer' }}
                    onClick={()=>setAddingMeal(isAdding ? null : meal.id)}>
                    <span style={{ fontSize:16 }}>{meal.icon}</span>
                    <span style={{ fontSize:13, fontWeight:700 }}>{meal.label}</span>
                    {mealEntries.length > 0 && (
                      <span style={{ fontSize:11, color:t.orange, marginLeft:'auto' }}>{Math.round(mealCals)} kcal</span>
                    )}
                    <span style={{ fontSize:14, color:t.teal, marginLeft: mealEntries.length?'8px':'auto' }}>+</span>
                  </div>

                  {mealEntries.map((e: any) => (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:t.surface, borderRadius:8, marginBottom:4, marginLeft:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{e.food_name}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>
                          {e.serving_size}{[e.calories&&`${Math.round(e.calories)} kcal`,e.protein_g&&`${e.protein_g}g P`].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <button onClick={()=>removeEntry(e.id)}
                        style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16, padding:'2px 4px' }}>×</button>
                    </div>
                  ))}

                  {isAdding && (
                    <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:12, padding:'14px', marginBottom:6 }}>
                      <input value={newEntry.food_name} onChange={e=>setNewEntry(p=>({...p,food_name:e.target.value}))}
                        placeholder="Food name..." autoFocus
                        style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', color:t.text, fontSize:14, marginBottom:8, fontFamily:"'DM Sans',sans-serif" }}/>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:8 }}>
                        {[
                          {f:'calories',  p:'kcal', label:'Calories'},
                          {f:'protein_g', p:'g',    label:'Protein'},
                          {f:'carbs_g',   p:'g',    label:'Carbs'},
                          {f:'fat_g',     p:'g',    label:'Fat'},
                        ].map(field=>(
                          <div key={field.f}>
                            <label style={{ fontSize:10, color:t.textMuted, display:'block', marginBottom:2 }}>{field.label}</label>
                            <input type="number" value={(newEntry as any)[field.f]}
                              onChange={e=>setNewEntry(p=>({...p,[field.f]:e.target.value}))}
                              placeholder={field.p}
                              style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:7, padding:'6px 8px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
                          </div>
                        ))}
                      </div>
                      <input value={newEntry.serving_size} onChange={e=>setNewEntry(p=>({...p,serving_size:e.target.value}))}
                        placeholder="Serving size (e.g. 100g, 1 cup)"
                        style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'7px 12px', color:t.text, fontSize:13, marginBottom:8, fontFamily:"'DM Sans',sans-serif" }}/>
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={addEntry} disabled={!newEntry.food_name||saving}
                          style={{ flex:1, background:t.teal, border:'none', borderRadius:9, padding:'9px', fontSize:13, fontWeight:700, color:'#0f0f0f', cursor:'pointer' }}>
                          {saving ? '...' : 'Add Food'}
                        </button>
                        <button onClick={()=>setAddingMeal(null)}
                          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'9px 14px', fontSize:13, color:t.textDim, cursor:'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Daily summary footer */}
          {entries.length > 0 && (
            <div style={{ background:`linear-gradient(135deg,${t.teal}12,${t.accent}08)`, border:`1px solid ${t.teal}25`, borderRadius:14, padding:'14px 18px' }}>
              <p style={{ fontSize:12, fontWeight:700, color:t.textDim, marginBottom:8 }}>Today's Summary</p>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, textAlign:'center' }}>
                {macros.map(m=>(
                  <div key={m.label}>
                    <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{m.val}</div>
                    <div style={{ fontSize:10, color:t.textMuted }}>{m.unit} {m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
