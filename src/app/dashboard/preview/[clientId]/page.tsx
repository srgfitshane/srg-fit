'use client'

// ── Coach Proxy Mode ──────────────────────────────────────────────────────
// Loads the actual client dashboard for a specific client, fully interactive.
// Coach stays authenticated as themselves — data is loaded by clientId directly.
// Used for in-person sessions so the coach can log on the client's behalf.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
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

const NAV = [
  { id:'today',     label:'Today',    icon:'⚡' },
  { id:'training',  label:'Training', icon:'💪' },
  { id:'nutrition', label:'Nutrition',icon:'🥗' },
  { id:'metrics',   label:'Metrics',  icon:'📈' },
  { id:'calendar',  label:'Calendar', icon:'📅' },
  { id:'messages',  label:'Messages', icon:'💬' },
  { id:'billing',   label:'Billing',  icon:'💳' },
]

export default function CoachProxyDashboard() {
  const supabase = createClient()
  const router   = useRouter()
  const { clientId } = useParams()

  const [clientProfile, setClientProfile] = useState<any>(null)
  const [clientRecord,  setClientRecord]  = useState<any>(null)
  const [coachProfileId, setCoachProfileId] = useState<string|null>(null)
  const [habits,        setHabits]        = useState<any[]>([])
  const [habitLogs,     setHabitLogs]     = useState<Record<string,number>>({})
  const [milestones,    setMilestones]    = useState<any[]>([])
  const [recentPRs,     setRecentPRs]     = useState<any[]>([])
  const [workoutLogs,   setWorkoutLogs]   = useState<any[]>([])
  const [nextSession,   setNextSession]   = useState<any>(null)
  const [pendingCheckins, setPendingCheckins] = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)
  const [activeNav,     setActiveNav]     = useState('today')
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!clientId) return
    const load = async () => {
      // Verify coach is logged in
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      // Load the target client record directly by ID
      const { data: clientData } = await supabase
        .from('clients').select('*').eq('id', clientId).single()
      if (!clientData) { router.push('/dashboard/coach'); return }
      setClientRecord(clientData)

      // Load client's profile (their name/avatar, not the coach's)
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', clientData.profile_id).single()
      setClientProfile(prof)

      // Coach profile ID for messaging (coach = clientData.coach_id)
      setCoachProfileId(clientData.coach_id)

      const [
        { data: habitData },
        { data: habitLogData },
        { data: milestoneData },
        { data: prData },
        { data: wlData },
        { data: nextSess },
        { data: pendingCI },
      ] = await Promise.all([
        supabase.from('habits').select('*').eq('client_id', clientId).eq('active', true),
        supabase.from('habit_logs').select('*').eq('client_id', clientId).eq('logged_date', today),
        supabase.from('milestones').select('*').eq('client_id', clientId).eq('seen', false).order('created_at', { ascending: false }),
        supabase.from('personal_records').select('*, exercise:exercises(name)').eq('client_id', clientId).order('logged_date', { ascending: false }).limit(3),
        supabase.from('workout_logs').select('*').eq('client_id', clientId).order('started_at', { ascending: false }).limit(5),
        supabase.from('workout_sessions').select('id, title, scheduled_date').eq('client_id', clientId).in('status', ['assigned', 'in_progress']).order('scheduled_date', { ascending: true }).limit(1).single(),
        supabase.from('client_form_assignments').select('id, note, form:onboarding_forms(title, is_checkin_type)').eq('client_id', clientId).eq('status', 'pending').eq('onboarding_forms.is_checkin_type', true).limit(3),
      ])

      setHabits(habitData || [])
      const logMap: Record<string,number> = {}
      habitLogData?.forEach((l:any) => { logMap[l.habit_id] = l.value })
      setHabitLogs(logMap)
      setMilestones(milestoneData || [])
      setRecentPRs(prData || [])
      setWorkoutLogs(wlData || [])
      setNextSession(nextSess || null)
      setPendingCheckins((pendingCI || []).filter((a:any) => a.form?.is_checkin_type))
      setLoading(false)
    }
    load()
  }, [clientId])

  const logHabit = async (habitId: string, value: number) => {
    if (!clientRecord) return
    setHabitLogs(prev => ({ ...prev, [habitId]: value }))
    const existing = await supabase.from('habit_logs').select('id')
      .eq('habit_id', habitId).eq('client_id', clientRecord.id).eq('logged_date', today).single()
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

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading client dashboard...</div>
    </div>
  )

  const doneTasks = habits.filter(h => {
    const val = habitLogs[h.id] || 0
    return h.habit_type === 'check' ? val >= 1 : val >= h.target
  }).length
  const progressPct = Math.round((doneTasks / Math.max(habits.length + 3, 1)) * 100)

  const firstName = clientProfile?.full_name?.split(' ')[0] || 'Client'

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

        {/* ── Coach banner — always visible ── */}
        <div style={{ background:`linear-gradient(135deg,${t.orange}ee,${t.orange}bb)`, padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>🎽</span>
            <div>
              <div style={{ fontSize:12, fontWeight:800, color:'#000', lineHeight:1.3 }}>
                Logging for {clientProfile?.full_name}
              </div>
              <div style={{ fontSize:10, color:'rgba(0,0,0,0.6)', fontWeight:600 }}>
                Coach mode — fully interactive
              </div>
            </div>
          </div>
          <button onClick={() => router.push(`/dashboard/coach/clients/${clientRecord?.id}`)}
            style={{ background:'rgba(0,0,0,0.15)', border:'1px solid rgba(0,0,0,0.2)', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
            ← Back
          </button>
        </div>

        {/* Top bar (styled as client sees it) */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:52, flexShrink:0 }}>
          <div style={{ fontSize:15, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:12, color:t.textMuted }}>{firstName}</div>
        </div>

        {/* Nav */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, display:'flex', overflowX:'auto', flexShrink:0, padding:'0 6px' }}>
          {NAV.map(n => (
            <div key={n.id} onClick={() => {
              if (n.id === 'calendar') router.push(`/dashboard/client/calendar`)
              else setActiveNav(n.id)
            }}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2, padding:'9px 12px', cursor:'pointer', borderBottom:'2px solid '+(activeNav===n.id ? t.teal : 'transparent'), transition:'all 0.15s ease', flexShrink:0 }}>
              <span style={{ fontSize:14 }}>{n.icon}</span>
              <span style={{ fontSize:10, fontWeight:activeNav===n.id ? 700 : 500, color:activeNav===n.id ? t.teal : t.textDim, whiteSpace:'nowrap' }}>{n.label}</span>
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex:1, overflowY: activeNav === 'messages' ? 'hidden' : 'auto', padding: activeNav === 'messages' ? 0 : '16px 16px' }}>

          {/* ── TODAY ── */}
          {activeNav === 'today' && <>

            {/* Greeting */}
            <div style={{ marginBottom:16 }} className="fade">
              <div style={{ fontSize:20, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.2, marginBottom:4 }}>
                {(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' })()}, {firstName} 👋
              </div>
              <div style={{ fontSize:12, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
            </div>

            {/* Milestones */}
            {milestones.map(m => (
              <div key={m.id} className="fade" style={{ background:'linear-gradient(135deg,'+t.yellow+'20,'+t.orange+'08)', border:'1px solid '+t.yellow+'30', borderRadius:16, padding:'16px 18px', marginBottom:12, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:-8, right:-8, fontSize:60, opacity:0.07 }}>🏆</div>
                <div style={{ fontSize:20, marginBottom:6 }}>🎉</div>
                <div style={{ fontSize:14, fontWeight:700, color:t.yellow, lineHeight:1.4, marginBottom:10 }}>{m.message}</div>
                <button onClick={() => dismissMilestone(m.id)}
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
            </div>

            {/* Pending check-in forms */}
            {pendingCheckins.map((a:any) => (
              <div key={a.id} style={{ background:t.surface, border:'1px solid '+t.purple+'50', borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
                <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.teal+')' }} />
                <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:40, height:40, borderRadius:12, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800 }}>{a.form?.title || 'Check-in'}</div>
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{a.note || 'Pending check-in'}</div>
                  </div>
                  <button onClick={() => router.push('/dashboard/client/forms/'+a.id)}
                    style={{ background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', border:'none', borderRadius:9, padding:'8px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                    Fill out →
                  </button>
                </div>
              </div>
            ))}

            {/* Weekly check-in */}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
              <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.pink+')' }} />
              <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:12, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>Weekly Check-in</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Reflect on your week & keep Shane in the loop</div>
                </div>
                <button onClick={() => router.push('/dashboard/client/checkin')}
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
                      {nextSession ? (nextSession.scheduled_date ? `Scheduled ${nextSession.scheduled_date}` : 'Ready when you are') : 'No workout assigned yet'}
                    </div>
                  </div>
                </div>
                <button onClick={() => nextSession && router.push(`/dashboard/client/workout/${nextSession.id}`)} disabled={!nextSession}
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
                      <div key={h.id} onClick={() => logHabit(h.id, val?0:1)}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13, cursor:'pointer', transition:'all 0.2s ease' }}>
                        <div style={{ width:34, height:34, borderRadius:10, background:done?'linear-gradient(135deg,'+color+','+color+'aa)':t.surfaceHigh, border:'1px solid '+(done?color+'60':t.border), display:'flex', alignItems:'center', justifyContent:'center', fontSize:done?14:16, flexShrink:0 }}>
                          {done ? '✓' : h.icon||'✅'}
                        </div>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>{done?'Done! 🎉':'Tap to complete'}</div>
                        </div>
                      </div>
                    )
                    return (
                      <div key={h.id} style={{ padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                          <span style={{ fontSize:18 }}>{h.icon||'📊'}</span>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                            <div style={{ fontSize:11, color:t.textMuted }}>Target: {h.target}{h.unit}</div>
                          </div>
                          <div style={{ fontSize:15, fontWeight:800, color:done?color:t.textDim }}>{val||0}<span style={{ fontSize:10, color:t.textMuted }}>{h.unit}</span></div>
                        </div>
                        <div style={{ height:5, background:t.surfaceHigh, borderRadius:3, marginBottom:8, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+color+','+color+'bb)', borderRadius:3 }} />
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <input type="number" placeholder={'Enter '+h.unit+'...'} defaultValue={val||''}
                            onBlur={e => logHabit(h.id, +e.target.value||0)}
                            style={{ flex:1, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                          <button onClick={e => { const inp = e.currentTarget.previousElementSibling as HTMLInputElement; logHabit(h.id, +inp.value||0) }}
                            style={{ background:'linear-gradient(135deg,'+color+','+color+'cc)', border:'none', borderRadius:8, padding:'7px 14px', fontSize:11, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Log</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {habits.length === 0 && (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'20px 16px', marginBottom:14, textAlign:'center' }} className="fade">
                <div style={{ fontSize:24, marginBottom:8 }}>📋</div>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>No habits assigned yet</div>
              </div>
            )}

            {/* Recent PRs */}
            {recentPRs.length > 0 && (
              <div style={{ background:'linear-gradient(135deg,'+t.yellow+'12,'+t.orange+'08)', border:'1px solid '+t.yellow+'25', borderRadius:14, padding:'14px 16px', marginBottom:14 }} className="fade">
                <div style={{ fontSize:12, fontWeight:800, color:t.yellow, marginBottom:10 }}>🏆 Recent PRs</div>
                {recentPRs.map((pr:any, i:number) => (
                  <div key={pr.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 0', borderBottom: i < recentPRs.length-1 ? '1px solid '+t.yellow+'15' : 'none' }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:t.yellow, flexShrink:0 }} />
                    <div style={{ flex:1, fontSize:12 }}>{pr.exercise?.name}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:t.yellow }}>{pr.weight_pr}lbs</div>
                  </div>
                ))}
              </div>
            )}

            {workoutLogs.length === 0 && recentPRs.length === 0 && habits.length === 0 && (
              <div style={{ background:'linear-gradient(135deg,'+t.teal+'12,'+t.orange+'08)', border:'1px solid '+t.teal+'25', borderRadius:16, padding:'24px 18px', textAlign:'center', marginBottom:14 }} className="fade">
                <div style={{ fontSize:32, marginBottom:10 }}>🚀</div>
                <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>All set!</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Program is being set up.</div>
              </div>
            )}
          </>}

          {/* ── TRAINING ── */}
          {activeNav === 'training' && (
            <TrainingTab clientRecord={clientRecord} supabase={supabase} router={router} t={t} />
          )}

          {/* ── NUTRITION ── */}
          {activeNav === 'nutrition' && (
            <NutritionTab clientRecord={clientRecord} supabase={supabase} t={t} />
          )}

          {/* ── METRICS ── */}
          {activeNav === 'metrics' && (
            <div style={{ paddingBottom:32 }}>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:16 }}>📈 Metrics</div>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' as const, marginBottom:14 }}>
                <div style={{ fontSize:32, marginBottom:10 }}>📊</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Log measurements</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:20, lineHeight:1.6 }}>Track weight, body fat, and measurements over time</div>
                <button onClick={() => router.push('/dashboard/client/metrics')}
                  style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'11px 24px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Open Metrics →
                </button>
              </div>
              <button onClick={() => router.push('/dashboard/client/progress')}
                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 20px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const }}>
                <div style={{ width:44, height:44, borderRadius:12, background:t.teal+'18', border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📸</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Progress Photos & Charts</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>Full progress history</div>
                </div>
                <span style={{ color:t.textMuted, fontSize:16 }}>→</span>
              </button>
            </div>
          )}

          {/* ── MESSAGES ── */}
          {activeNav === 'messages' && (
            <div style={{ margin:'-16px -16px', height:'calc(100vh - 140px)' }}>
              {coachProfileId ? (
                <RichMessageThread
                  myId={clientRecord.profile_id}
                  otherId={coachProfileId}
                  otherName="Coach Shane"
                  tenorKey={TENOR_KEY}
                  height="100%"
                />
              ) : (
                <div style={{ padding:40, textAlign:'center', color:t.textMuted, fontSize:13 }}>No coach assigned.</div>
              )}
            </div>
          )}

          {/* ── BILLING ── */}
          {activeNav === 'billing' && (
            <BillingTab clientRecord={clientRecord} supabase={supabase} />
          )}

          {activeNav !== 'today' && activeNav !== 'messages' && activeNav !== 'billing' && activeNav !== 'training' && (
            <div style={{ textAlign:'center', padding:'8px 0 24px', fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
              Be Kind to Yourself & Stay Awesome 💪
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── BillingTab ─────────────────────────────────────────────────────────────
function BillingTab({ clientRecord, supabase }: { clientRecord: any, supabase: any }) {
  const [sub, setSub] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const tc = { surface:'#161624', surfaceHigh:'#1d1d2e', border:'#252538', accent:'#00c9b1', text:'#eeeef8', textDim:'#8888a8', textMuted:'#5a5a78', success:'#22c55e', warn:'#f59e0b', danger:'#ef4444' }
  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const { data: subData } = await supabase.from('subscriptions').select('*').eq('client_id', clientRecord.id).order('created_at', { ascending: false }).limit(1).single()
      setSub(subData)
      if (subData?.plan_id) { const { data: planData } = await supabase.from('coaching_plans').select('*').eq('id', subData.plan_id).single(); setPlan(planData) }
      setLoading(false)
    }
    load()
  }, [clientRecord])
  const status = clientRecord?.subscription_status || 'none'
  const statusLabel: Record<string,string> = { active:'✅ Active', trialing:'🔄 Trial', past_due:'⚠️ Past Due', canceled:'❌ Canceled', unpaid:'❌ Unpaid', paused:'⏸ Paused', none:'— No subscription' }
  const statusColor: Record<string,string> = { active:tc.success, trialing:tc.accent, past_due:tc.warn, canceled:tc.danger, unpaid:tc.danger, paused:tc.textDim, none:tc.textMuted }
  return (
    <div style={{ paddingBottom:32 }}>
      <h2 style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>Billing & Subscription</h2>
      {loading ? <p style={{ color:tc.textMuted, fontSize:13 }}>Loading...</p> : (
        <div style={{ background:tc.surface, border:`1px solid ${tc.border}`, borderRadius:14, padding:'20px 22px' }}>
          <p style={{ fontSize:12, color:tc.textMuted, margin:'0 0 4px', fontWeight:700, textTransform:'uppercase' as const }}>Status</p>
          <p style={{ fontSize:20, fontWeight:800, margin:'0 0 8px', color: statusColor[status]||tc.textDim }}>{statusLabel[status]||status}</p>
          {plan && <p style={{ fontSize:13, color:tc.accent, fontWeight:700, margin:0 }}>{plan.name}</p>}
          {sub?.current_period_end && <p style={{ fontSize:12, color:tc.textMuted, marginTop:8, marginBottom:0 }}>Renews {new Date(sub.current_period_end).toLocaleDateString()}</p>}
        </div>
      )}
    </div>
  )
}

// ── TrainingTab ────────────────────────────────────────────────────────────
function TrainingTab({ clientRecord, supabase, router, t }: any) {
  const [program, setProgram] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'program'|'workouts'>('program')
  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const [{ data: prog }, { data: sess }] = await Promise.all([
        supabase.from('programs').select('id, name, description, goal, duration_weeks, difficulty').eq('client_id', clientRecord.id).eq('is_template', false).order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('workout_sessions').select('id, title, status, scheduled_date, day_label, session_rpe, mood, completed_at, duration_seconds, notes_coach').eq('client_id', clientRecord.id).order('scheduled_date', { ascending: true }).limit(50),
      ])
      setProgram(prog || null); setSessions(sess || []); setLoading(false)
    }
    load()
  }, [clientRecord?.id])
  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')
  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m` : null
  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading training...</div>
  if (view === 'workouts') return (
    <div style={{ paddingBottom:32 }}>
      <button onClick={() => setView('program')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6, marginBottom:18, padding:0 }}>← {program?.name || 'Program'}</button>
      <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:12 }}>Upcoming ({upcoming.length})</p>
      {upcoming.length === 0
        ? <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}><div style={{ fontSize:28, marginBottom:8 }}>✅</div><p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>All caught up!</p></div>
        : upcoming.map(s => (
          <div key={s.id} onClick={() => router.push(`/dashboard/client/workout/${s.id}`)} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', marginBottom:10, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:s.status==='in_progress'?t.tealDim:t.orangeDim, border:'1px solid '+(s.status==='in_progress'?t.teal:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{s.status==='in_progress'?'▶️':'💪'}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{s.title}</div>
              <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>{s.scheduled_date}{s.day_label?` · ${s.day_label}`:''}</div>
            </div>
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:s.status==='in_progress'?t.tealDim:t.orangeDim, color:s.status==='in_progress'?t.teal:t.orange }}>{s.status==='in_progress'?'Resume':'Start'}</span>
          </div>
        ))
      }
      {completed.length > 0 && <>
        <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase' as const, letterSpacing:'0.08em', margin:'20px 0 12px' }}>Completed ({completed.length})</p>
        {completed.map(s => (
          <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <span style={{ fontSize:18 }}>✅</span>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14 }}>{s.title}</div><div style={{ fontSize:11, color:t.textDim }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : s.scheduled_date}</div></div>
            <div style={{ textAlign:'right' as const }}>{fmtDur(s.duration_seconds) && <div style={{ fontSize:12, fontWeight:700, color:t.orange }}>{fmtDur(s.duration_seconds)}</div>}{s.session_rpe && <div style={{ fontSize:11, color:t.textMuted }}>RPE {s.session_rpe}</div>}</div>
          </div>
        ))}
      </>}
    </div>
  )
  return (
    <div style={{ paddingBottom:32 }}>
      {!program ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💪</div><div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>No program assigned yet</div>
        </div>
      ) : <>
        <div style={{ background:t.surface, border:'1px solid '+t.teal+'30', borderRadius:16, overflow:'hidden', marginBottom:16 }}>
          <div style={{ height:4, background:`linear-gradient(90deg,${t.teal},${t.orange})` }} />
          <div style={{ padding:'20px' }}>
            <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>{program.name}</div>
            {program.description && <div style={{ fontSize:13, color:t.textDim, lineHeight:1.6, marginBottom:16 }}>{program.description}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
              {[{label:'Duration',val:program.duration_weeks?`${program.duration_weeks}w`:'—',color:t.teal},{label:'Difficulty',val:program.difficulty||'—',color:t.orange},{label:'Goal',val:program.goal||'—',color:t.green}].map(s=>(
                <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'12px', textAlign:'center' as const }}>
                  <div style={{ fontSize:15, fontWeight:800, color:s.color, marginBottom:2 }}>{s.val}</div>
                  <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', fontWeight:700 }}>{s.label}</div>
                </div>
              ))}
            </div>
            <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:13, fontWeight:700 }}>{upcoming.length > 0 ? `${upcoming.length} workout${upcoming.length!==1?'s':''} scheduled` : sessions.length > 0 ? 'All workouts done! 🎉' : 'No sessions yet'}</div>
              <button onClick={() => setView('workouts')} style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>View All →</button>
            </div>
          </div>
        </div>
        {upcoming.length > 0 && (
          <div onClick={() => router.push(`/dashboard/client/workout/${upcoming[0].id}`)} style={{ background:t.surface, border:'1px solid '+t.orange+'40', borderRadius:16, overflow:'hidden', cursor:'pointer' }}>
            <div style={{ height:3, background:`linear-gradient(90deg,${t.orange},${t.yellow})` }} />
            <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
              <div style={{ width:44, height:44, borderRadius:12, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>{upcoming[0].status==='in_progress'?'▶️':'💪'}</div>
              <div style={{ flex:1 }}><div style={{ fontSize:14, fontWeight:800 }}>{upcoming[0].status==='in_progress'?'Resume Workout':'Up Next'}</div><div style={{ fontSize:13, color:t.text, marginTop:2 }}>{upcoming[0].title}</div><div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{upcoming[0].scheduled_date}{upcoming[0].day_label?` · ${upcoming[0].day_label}`:''}</div></div>
              <div style={{ background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:800, color:'#000' }}>{upcoming[0].status==='in_progress'?'Resume ▶':'Start 💪'}</div>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}

// ── NutritionTab ───────────────────────────────────────────────────────────
const MEAL_TIMES = [
  { id:'breakfast', label:'Breakfast', icon:'🌅' }, { id:'morning_snack', label:'Morning Snack', icon:'🍎' },
  { id:'lunch', label:'Lunch', icon:'☀️' }, { id:'afternoon_snack', label:'Afternoon Snack', icon:'🥜' },
  { id:'pre_workout', label:'Pre-Workout', icon:'⚡' }, { id:'dinner', label:'Dinner', icon:'🍽' },
  { id:'post_workout', label:'Post-Workout', icon:'💪' }, { id:'evening_snack', label:'Evening Snack', icon:'🌙' },
]

function NutritionTab({ clientRecord, supabase, t }: any) {
  const today = new Date().toISOString().split('T')[0]
  const [plan, setPlan] = useState<any>(null)
  const [log, setLog] = useState<any>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [addingMeal, setAddingMeal] = useState<string|null>(null)
  const [newEntry, setNewEntry] = useState({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
  const [saving, setSaving] = useState(false)
  const [selectedDate, setSelectedDate] = useState(today)
  useEffect(() => { if (clientRecord?.id) loadData() }, [clientRecord?.id, selectedDate])
  async function loadData() {
    setLoading(true)
    const [{ data: activePlan }, { data: dailyLog }] = await Promise.all([
      supabase.from('nutrition_plans').select('*').eq('client_id', clientRecord.id).eq('is_active', true).single(),
      supabase.from('nutrition_daily_logs').select('*').eq('client_id', clientRecord.id).eq('log_date', selectedDate).single()
    ])
    setPlan(activePlan)
    if (dailyLog) { setLog(dailyLog); const { data: ents } = await supabase.from('food_entries').select('*').eq('daily_log_id', dailyLog.id).order('logged_at'); setEntries(ents || []) }
    else { setLog(null); setEntries([]) }
    setLoading(false)
  }
  async function ensureLog() {
    if (log) return log
    const { data: newLog } = await supabase.from('nutrition_daily_logs').upsert({ client_id: clientRecord.id, coach_id: clientRecord.coach_id, plan_id: plan?.id||null, log_date: selectedDate }, { onConflict: 'client_id,log_date' }).select().single()
    setLog(newLog); return newLog
  }
  async function addEntry() {
    if (!newEntry.food_name) return
    setSaving(true)
    const currentLog = await ensureLog()
    const entry = { daily_log_id: currentLog.id, client_id: clientRecord.id, meal_time: addingMeal||'other', food_name: newEntry.food_name, serving_size: newEntry.serving_size, serving_qty: 1, calories: parseFloat(newEntry.calories)||null, protein_g: parseFloat(newEntry.protein_g)||null, carbs_g: parseFloat(newEntry.carbs_g)||null, fat_g: parseFloat(newEntry.fat_g)||null }
    const { data: saved } = await supabase.from('food_entries').insert(entry).select().single()
    if (saved) { const updated = [...entries, saved]; setEntries(updated); const totals = updated.reduce((a,e)=>({total_calories:a.total_calories+(e.calories||0),total_protein:a.total_protein+(e.protein_g||0),total_carbs:a.total_carbs+(e.carbs_g||0),total_fat:a.total_fat+(e.fat_g||0)}),{total_calories:0,total_protein:0,total_carbs:0,total_fat:0}); const { data: updatedLog } = await supabase.from('nutrition_daily_logs').update(totals).eq('id', currentLog.id).select().single(); if (updatedLog) setLog(updatedLog) }
    setNewEntry({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' }); setAddingMeal(null); setSaving(false)
  }
  async function removeEntry(id: string) { await supabase.from('food_entries').delete().eq('id', id); setEntries(entries.filter(e=>e.id!==id)) }
  const totals = { calories: log?.total_calories||0, protein: log?.total_protein||0, carbs: log?.total_carbs||0, fat: log?.total_fat||0 }
  const entriesByMeal: Record<string,any[]> = {}
  for (const e of entries) { const k=e.meal_time||'other'; if(!entriesByMeal[k]) entriesByMeal[k]=[]; entriesByMeal[k].push(e) }
  return (
    <div style={{ paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'7px 12px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        {selectedDate !== today && <button onClick={()=>setSelectedDate(today)} style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.textDim, cursor:'pointer' }}>Today</button>}
      </div>
      {loading ? <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted }}>Loading...</div> : <>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          {[{label:'Cal',val:Math.round(totals.calories),target:plan?.calories_target,color:'#c8f545'},{label:'Pro',val:Math.round(totals.protein),target:plan?.protein_g,color:'#60a5fa'},{label:'Carb',val:Math.round(totals.carbs),target:plan?.carbs_g,color:t.orange},{label:'Fat',val:Math.round(totals.fat),target:plan?.fat_g,color:'#f472b6'}].map(m=>(
            <div key={m.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 8px', textAlign:'center' as const }}>
              <div style={{ fontSize:16, fontWeight:800, color:m.color }}>{m.val}</div>
              {m.target && <div style={{ fontSize:10, color:t.textMuted }}>/{m.target}</div>}
              <div style={{ fontSize:10, color:t.textMuted }}>{m.label}</div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:16 }}>
          {MEAL_TIMES.map(meal => {
            const mealEntries = entriesByMeal[meal.id] || []
            const isAdding = addingMeal === meal.id
            return (
              <div key={meal.id} style={{ marginBottom:10 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', cursor:'pointer' }} onClick={()=>setAddingMeal(isAdding?null:meal.id)}>
                  <span style={{ fontSize:16 }}>{meal.icon}</span>
                  <span style={{ fontSize:13, fontWeight:700 }}>{meal.label}</span>
                  {mealEntries.length > 0 && <span style={{ fontSize:11, color:t.orange, marginLeft:'auto' }}>{Math.round(mealEntries.reduce((a,e)=>a+(e.calories||0),0))} kcal</span>}
                  <span style={{ fontSize:14, color:t.teal, marginLeft:mealEntries.length?'8px':'auto' }}>+</span>
                </div>
                {mealEntries.map((e:any)=>(
                  <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:t.surface, borderRadius:8, marginBottom:4, marginLeft:8 }}>
                    <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:600 }}>{e.food_name}</div><div style={{ fontSize:11, color:t.textMuted }}>{e.serving_size}{e.calories?` · ${Math.round(e.calories)} kcal`:''}</div></div>
                    <button onClick={()=>removeEntry(e.id)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16 }}>✕</button>
                  </div>
                ))}
                {isAdding && (
                  <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:12, padding:'14px', marginBottom:6 }}>
                    <input value={newEntry.food_name} onChange={e=>setNewEntry(p=>({...p,food_name:e.target.value}))} placeholder="Food name..." autoFocus style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'8px 12px', color:t.text, fontSize:14, marginBottom:8, fontFamily:"'DM Sans',sans-serif" }}/>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:8 }}>
                      {[['calories','kcal'],['protein_g','P'],['carbs_g','C'],['fat_g','F']].map(([f,p])=>(
                        <input key={f} type="number" value={(newEntry as any)[f]} onChange={e=>setNewEntry(prev=>({...prev,[f]:e.target.value}))} placeholder={p} style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:7, padding:'6px 8px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
                      ))}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={addEntry} disabled={!newEntry.food_name||saving} style={{ flex:1, background:t.teal, border:'none', borderRadius:9, padding:'9px', fontSize:13, fontWeight:700, color:'#0f0f0f', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{saving?'...':'Add Food'}</button>
                      <button onClick={()=>setAddingMeal(null)} style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'9px 14px', fontSize:13, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </>}
    </div>
  )
}
