'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const TABS = [
  { id:'overview',   label:'Overview',   icon:'👤' },
  { id:'program',    label:'Program',    icon:'💪' },
  { id:'nutrition',  label:'Nutrition',  icon:'🥗' },
  { id:'checkins',   label:'Check-ins',  icon:'✅' },
  { id:'metrics',    label:'Metrics',    icon:'📈' },
  { id:'messages',   label:'Messages',   icon:'💬' },
]


export default function ClientDetail() {
  const [coachId,  setCoachId]  = useState<string | null>(null)
  const [client,   setClient]   = useState<any>(null)
  const [checkins, setCheckins] = useState<any[]>([])
  const [metrics,  setMetrics]  = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [nutritionPlan, setNutritionPlan] = useState<any>(null)
  const [program, setProgram] = useState<any>(null)
  const [showArchive, setShowArchive] = useState(false)
  const [showDelete,  setShowDelete]  = useState(false)
  const [actioning,   setActioning]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [flagNote, setFlagNote] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const clientId = params.id as string

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCoachId(user.id)

      const { data: clientData } = await supabase
        .from('clients')
        .select(`*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)`)
        .eq('id', clientId)
        .single()
      setClient(clientData)

      const { data: checkinData } = await supabase
        .from('checkins')
        .select('*')
        .eq('client_id', clientId)
        .order('submitted_at', { ascending: false })
        .limit(10)
      setCheckins(checkinData || [])

      const { data: metricsData } = await supabase
        .from('metrics')
        .select('*')
        .eq('client_id', clientId)
        .order('logged_date', { ascending: false })
        .limit(10)
      setMetrics(metricsData || [])

      const { data: workoutData } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('client_id', clientId)
        .order('scheduled_date', { ascending: false })
        .limit(5)
      setWorkouts(workoutData || [])

      const { data: nutritionData } = await supabase
        .from('nutrition_plans')
        .select('*')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .single()
      setNutritionPlan(nutritionData || null)

      const { data: programData } = await supabase
        .from('programs')
        .select('*')
        .eq('id', (await supabase.from('clients').select('program_id').eq('id', clientId).single()).data?.program_id)
        .single()
      setProgram(programData || null)

      setLoading(false)
    }
    load()
  }, [clientId])

  const handleFlag = async () => {
    await supabase.from('clients').update({ flagged: true, flag_note: flagNote }).eq('id', clientId)
    setClient((prev:any) => ({ ...prev, flagged: true, flag_note: flagNote }))
    setShowFlag(false)
  }

  const handleUnflag = async () => {
    await supabase.from('clients').update({ flagged: false, flag_note: null }).eq('id', clientId)
    setClient((prev:any) => ({ ...prev, flagged: false, flag_note: null }))
  }

  const handleArchive = async () => {
    setActioning(true)
    await supabase.from('clients').update({ active: false }).eq('id', clientId)
    router.push('/dashboard/coach')
  }

  const handleDelete = async () => {
    setActioning(true)
    // Deactivate habits, then remove client record (keeps auth user + profile intact)
    await supabase.from('habits').update({ active: false }).eq('client_id', clientId)
    await supabase.from('clients').delete().eq('id', clientId)
    router.push('/dashboard/coach')
  }


  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading client...</div>
    </div>
  )

  if (!client) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.red, fontSize:14, fontWeight:700 }}>Client not found</div>
    </div>
  )

  const initials = client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'
  const latestMetric = metrics[0]
  const latestCheckin = checkins[0]

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
            ← Back
          </button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>Client Profile</div>
          <div style={{ flex:1 }} />
          {client.flagged
            ? <button onClick={handleUnflag} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>🚩 Unflag</button>
            : <button onClick={()=>setShowFlag(true)} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>🚩 Flag Client</button>
          }
          <button onClick={()=>router.push('/dashboard/coach/clients/'+clientId+'/habits')}
            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            ✅ Manage Habits
          </button>
          <button onClick={()=>setShowArchive(true)}
            style={{ background:t.yellowDim, border:'1px solid '+t.yellow+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.yellow, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            📦 Archive
          </button>
          <button onClick={()=>setShowDelete(true)}
            style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            🗑 Delete
          </button>
        </div>


        {/* Client hero */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'24px 28px' }}>
          <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', alignItems:'center', gap:20 }}>
            <div style={{ width:64, height:64, borderRadius:18, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, fontWeight:900, color:'#000', flexShrink:0 }}>
              {initials}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                <div style={{ fontSize:22, fontWeight:900 }}>{client.profile?.full_name}</div>
                {client.flagged && <div style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'2px 10px', fontSize:11, fontWeight:700, color:t.red }}>🚩 Flagged</div>}
              </div>
              <div style={{ fontSize:13, color:t.textMuted }}>{client.profile?.email} · Client since {new Date(client.start_date).toLocaleDateString([], { month:'long', day:'numeric', year:'numeric' })}</div>
              {client.flag_note && <div style={{ fontSize:12, color:t.red, marginTop:4, fontStyle:'italic' }}>Note: {client.flag_note}</div>}
            </div>
            {/* Quick stats */}
            <div style={{ display:'flex', gap:12 }}>
              {[
                { label:'Check-ins',    val:checkins.length,  color:t.teal   },
                { label:'Workouts',     val:workouts.length,  color:t.orange },
                { label:'Current Weight', val: latestMetric?.weight ? latestMetric.weight+'lbs' : '—', color:t.purple },
              ].map(s => (
                <div key={s.label} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', textAlign:'center', minWidth:90 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:s.color, marginBottom:2 }}>{s.val}</div>
                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border }}>
          <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', padding:'0 28px', overflowX:'auto' }}>
            {TABS.map(tab => (
              <div key={tab.id} onClick={()=>setActiveTab(tab.id)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'14px 18px', cursor:'pointer', borderBottom:'2px solid '+(activeTab===tab.id ? t.teal : 'transparent'), fontSize:13, fontWeight:activeTab===tab.id ? 700 : 500, color:activeTab===tab.id ? t.teal : t.textDim, transition:'all 0.15s ease', whiteSpace:'nowrap', flexShrink:0 }}>
                <span>{tab.icon}</span>{tab.label}
              </div>
            ))}
          </div>
        </div>


        {/* Tab content */}
        <div style={{ maxWidth:1200, margin:'0 auto', padding:28 }}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

              {/* Latest check-in */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Latest Check-in</div>
                {latestCheckin ? (
                  <div>
                    <div style={{ fontSize:11, color:t.textMuted, marginBottom:12 }}>{new Date(latestCheckin.submitted_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:12 }}>
                      {[
                        { label:'Weight',     val: latestCheckin.weight ? latestCheckin.weight+'lbs' : '—', color:t.teal   },
                        { label:'Sleep',      val: latestCheckin.sleep_hours ? latestCheckin.sleep_hours+'hrs' : '—', color:t.purple },
                        { label:'Motivation', val: latestCheckin.motivation ? latestCheckin.motivation+'/10' : '—', color:t.orange },
                        { label:'Stress',     val: latestCheckin.stress ? latestCheckin.stress+'/10' : '—', color:t.red    },
                      ].map(s => (
                        <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                          <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {latestCheckin.wins && <div style={{ background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green, marginBottom:8 }}><strong>Wins:</strong> {latestCheckin.wins}</div>}
                    {latestCheckin.struggles && <div style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.red }}><strong>Struggles:</strong> {latestCheckin.struggles}</div>}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'20px 0', color:t.textMuted, fontSize:13 }}>No check-ins yet</div>
                )}
              </div>

              {/* Latest metrics */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Latest Metrics</div>
                {latestMetric ? (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                    {[
                      { label:'Weight',  val: latestMetric.weight ? latestMetric.weight+'lbs' : '—'  },
                      { label:'Chest',   val: latestMetric.chest  ? latestMetric.chest+'"'  : '—'    },
                      { label:'Waist',   val: latestMetric.waist  ? latestMetric.waist+'"'  : '—'    },
                      { label:'Hips',    val: latestMetric.hips   ? latestMetric.hips+'"'   : '—'    },
                      { label:'L Arm',   val: latestMetric.left_arm ? latestMetric.left_arm+'"' : '—' },
                      { label:'R Arm',   val: latestMetric.right_arm ? latestMetric.right_arm+'"' : '—' },
                    ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                        <div style={{ fontSize:16, fontWeight:800, color:t.orange }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign:'center', padding:'20px 0', color:t.textMuted, fontSize:13 }}>No metrics logged yet</div>
                )}
              </div>

              {/* Recent workouts */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Recent Workouts</div>
                {workouts.length > 0 ? workouts.map((w:any, i:number) => (
                  <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 0', borderBottom: i < workouts.length-1 ? '1px solid '+t.border : 'none' }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>💪</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{w.name || 'Workout Session'}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{new Date(w.scheduled_date || w.completed_at || w.created_at).toLocaleDateString()}</div>
                    </div>
                    {w.status && <div style={{ fontSize:11, color: w.status==='completed' ? t.green : t.orange, fontWeight:700, textTransform:'capitalize' }}>
                      {w.status}
                    </div>}
                  </div>
                )) : (
                  <div style={{ textAlign:'center', padding:'20px 0', color:t.textMuted, fontSize:13 }}>No workouts logged yet</div>
                )}
              </div>

              {/* Coach notes */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Coach Notes</div>
                <textarea placeholder="Private notes about this client..." rows={6}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.6 }} />
                <button style={{ marginTop:10, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Save Note</button>
              </div>

            </div>
          )}


          {/* CHECK-INS TAB */}
          {activeTab === 'checkins' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {checkins.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No check-ins yet</div>
                  <div style={{ fontSize:13, color:t.textMuted }}>Check-ins will appear here once the client submits them</div>
                </div>
              ) : checkins.map((c:any) => (
                <div key={c.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{new Date(c.submitted_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{new Date(c.submitted_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:12 }}>
                    {[
                      { label:'Weight',     val: c.weight ? c.weight+'lbs' : '—',           color:t.teal   },
                      { label:'Sleep',      val: c.sleep_hours ? c.sleep_hours+'hrs' : '—', color:t.purple },
                      { label:'Motivation', val: c.motivation ? c.motivation+'/10' : '—',   color:t.orange },
                      { label:'Stress',     val: c.stress ? c.stress+'/10' : '—',           color:t.red    },
                    ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                  {c.wins && <div style={{ background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.green, marginBottom:8 }}><strong>Wins:</strong> {c.wins}</div>}
                  {c.struggles && <div style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:8 }}><strong>Struggles:</strong> {c.struggles}</div>}
                  {c.coach_note && <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.teal }}><strong>Your note:</strong> {c.coach_note}</div>}
                </div>
              ))}
            </div>
          )}

          {/* METRICS TAB */}
          {activeTab === 'metrics' && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden' }}>
              {metrics.length === 0 ? (
                <div style={{ padding:'48px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>📈</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No metrics yet</div>
                  <div style={{ fontSize:13, color:t.textMuted }}>Metrics will appear here once the client logs them</div>
                </div>
              ) : (
                <div>
                  <div style={{ display:'grid', gridTemplateColumns:'auto repeat(6,1fr)', gap:0 }}>
                    {['Date','Weight','Chest','Waist','Hips','L Arm','R Arm'].map(h => (
                      <div key={h} style={{ padding:'12px 16px', fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'1px solid '+t.border, background:t.surfaceHigh }}>{h}</div>
                    ))}
                    {metrics.map((m:any, i:number) => (
                      [
                        new Date(m.logged_date).toLocaleDateString([], { month:'short', day:'numeric' }),
                        m.weight ? m.weight+'lbs' : '—',
                        m.chest  ? m.chest+'"'   : '—',
                        m.waist  ? m.waist+'"'   : '—',
                        m.hips   ? m.hips+'"'    : '—',
                        m.left_arm  ? m.left_arm+'"'  : '—',
                        m.right_arm ? m.right_arm+'"' : '—',
                      ].map((val, j) => (
                        <div key={j} style={{ padding:'12px 16px', fontSize:13, fontWeight: j===0 ? 600 : 700, color: j===0 ? t.textMuted : t.orange, borderBottom: i < metrics.length-1 ? '1px solid '+t.border : 'none', background: i%2===0 ? 'transparent' : t.surfaceUp+'44' }}>{val}</div>
                      ))
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PROGRAM TAB */}
          {activeTab === 'program' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {program ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>{program.name}</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:16 }}>{program.description}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
                    {[
                      { label:'Duration',  val: program.duration_weeks ? program.duration_weeks+'w' : '—', color:t.teal },
                      { label:'Frequency', val: program.sessions_per_week ? program.sessions_per_week+'x/wk' : '—', color:t.orange },
                      { label:'Level',     val: program.difficulty || '—', color:t.purple },
                      { label:'Goal',      val: program.goal || '—', color:t.green },
                    ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{s.label}</div>
                        <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>💪</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No program assigned</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Assign a program from the Programs page</div>
                  <button onClick={()=>router.push('/dashboard/coach/programs')}
                    style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Go to Programs
                  </button>
                </div>
              )}
              {/* Recent workouts */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Recent Workout Sessions</div>
                {workouts.length > 0 ? workouts.map((w:any, i:number) => (
                  <div key={w.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < workouts.length-1 ? '1px solid '+t.border : 'none' }}>
                    <div style={{ width:36, height:36, borderRadius:10, background: w.status==='completed' ? t.greenDim : t.orangeDim, border:'1px solid '+(w.status==='completed'?t.green:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
                      {w.status==='completed' ? '✅' : '📋'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{w.name || 'Workout'}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{new Date(w.scheduled_date || w.created_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}</div>
                    </div>
                    <div style={{ fontSize:11, fontWeight:700, color: w.status==='completed' ? t.green : t.orange, textTransform:'capitalize' }}>{w.status}</div>
                  </div>
                )) : (
                  <div style={{ textAlign:'center', padding:'20px 0', color:t.textMuted, fontSize:13 }}>No workout sessions yet</div>
                )}
              </div>
            </div>
          )}

          {/* NUTRITION TAB */}
          {activeTab === 'nutrition' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {nutritionPlan ? (
                <>
                  <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800 }}>{nutritionPlan.name}</div>
                        <div style={{ fontSize:12, color:t.textMuted, marginTop:2, textTransform:'capitalize' }}>{nutritionPlan.approach} approach</div>
                      </div>
                      <button onClick={()=>router.push('/dashboard/coach/nutrition')}
                        style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Edit Plan
                      </button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10 }}>
                      {[
                        { label:'Calories',  val: nutritionPlan.calories_target ? nutritionPlan.calories_target+'kcal' : '—', color:t.orange },
                        { label:'Protein',   val: nutritionPlan.protein_g ? nutritionPlan.protein_g+'g' : '—', color:t.teal },
                        { label:'Carbs',     val: nutritionPlan.carbs_g ? nutritionPlan.carbs_g+'g' : '—', color:t.yellow },
                        { label:'Fat',       val: nutritionPlan.fat_g ? nutritionPlan.fat_g+'g' : '—', color:t.purple },
                        { label:'Water',     val: nutritionPlan.water_oz ? nutritionPlan.water_oz+'oz' : '—', color:'#38bdf8' },
                      ].map(s => (
                        <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{s.label}</div>
                          <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {nutritionPlan.notes && (
                      <div style={{ marginTop:16, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'12px 16px', fontSize:13, color:t.teal, lineHeight:1.5 }}>
                        <strong>Coach notes:</strong> {nutritionPlan.notes}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🥗</div>
                  <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No nutrition plan assigned</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Create a nutrition plan for this client</div>
                  <button onClick={()=>router.push('/dashboard/coach/nutrition')}
                    style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Go to Nutrition
                  </button>
                </div>
              )}
            </div>
          )}

          {/* MESSAGES TAB */}
          {activeTab === 'messages' && client && (
            <MiniThread coachId={coachId!} client={client} />
          )}

        </div>


        {/* Flag modal */}
        {showFlag && (
          <div onClick={()=>setShowFlag(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:440, padding:28 }}>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>🚩 Flag Client</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:16 }}>Add a note about why you're flagging this client. Only you can see this.</div>
              <textarea value={flagNote} onChange={e=>setFlagNote(e.target.value)} placeholder="e.g. Missed last 3 check-ins, need to follow up..." rows={3}
                style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.5, marginBottom:16 }} />
              <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
                <button onClick={()=>setShowFlag(false)} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                <button onClick={handleFlag} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Flag Client</button>
              </div>
            </div>
          </div>
        )}

        {/* Archive modal */}
        {showArchive && (
          <div onClick={()=>setShowArchive(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>📦</div>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:8 }}>Archive {client?.profile?.full_name}?</div>
              <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6, marginBottom:24 }}>
                Archiving removes them from your active client list but keeps all their data intact. You can reactivate them anytime from Supabase.
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowArchive(false)}
                  style={{ flex:1, padding:'11px', borderRadius:11, border:'1px solid '+t.border, background:t.surfaceHigh, fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={handleArchive} disabled={actioning}
                  style={{ flex:1, padding:'11px', borderRadius:11, border:'none', background:'linear-gradient(135deg,'+t.yellow+','+t.yellow+'cc)', fontSize:13, fontWeight:800, color:'#000', cursor:actioning?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:actioning?0.6:1 }}>
                  {actioning ? 'Archiving...' : '📦 Archive Client'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Delete modal */}
        {showDelete && (
          <div onClick={()=>setShowDelete(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.red+'40', borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ fontSize:32, marginBottom:12 }}>⚠️</div>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:8, color:t.red }}>Delete {client?.profile?.full_name}?</div>
              <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6, marginBottom:8 }}>
                This removes the client relationship and deactivates their habits. Their auth account stays intact so they can be re-invited later.
              </div>
              <div style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:10, padding:'10px 14px', fontSize:12, color:t.red, marginBottom:24, fontWeight:600 }}>
                ⚠️ This cannot be undone. All check-ins, workout logs, and metrics will remain in the database but will be unlinked.
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowDelete(false)}
                  style={{ flex:1, padding:'11px', borderRadius:11, border:'1px solid '+t.border, background:t.surfaceHigh, fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={handleDelete} disabled={actioning}
                  style={{ flex:1, padding:'11px', borderRadius:11, border:'none', background:t.red, fontSize:13, fontWeight:800, color:'#fff', cursor:actioning?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:actioning?0.6:1 }}>
                  {actioning ? 'Deleting...' : '🗑 Delete Client'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}


// ── MiniThread: embedded in client profile ────────────────────────────────
function MiniThread({ coachId, client }: { coachId: string; client: any }) {
  const supabase  = createClient()
  const [thread,  setThread]  = useState<any[]>([])
  const [draft,   setDraft]   = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const profileId = client.profile?.id

  const colors = {
    bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
    teal:"#00c9b1", tealDim:"#00c9b115", text:"#eeeef8", textMuted:"#5a5a78",
  }

  useEffect(() => {
    if (!profileId) return
    const load = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${coachId},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${coachId})`)
        .order('created_at', { ascending: true })
      setThread(data || [])
      // Mark incoming as read
      await supabase.from('messages').update({ read: true })
        .eq('sender_id', profileId).eq('recipient_id', coachId).eq('read', false)
    }
    load()
  }, [profileId])

  // Realtime
  useEffect(() => {
    if (!profileId) return
    const channel = supabase.channel('mini-thread-' + profileId)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:`recipient_id=eq.${coachId}` }, (payload) => {
        const msg = payload.new as any
        if (msg.sender_id === profileId) {
          setThread(prev => [...prev, msg])
          supabase.from('messages').update({ read:true }).eq('id', msg.id)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profileId, coachId])

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [thread])

  const send = async () => {
    if (!draft.trim() || !profileId) return
    setSending(true)
    const { data } = await supabase.from('messages')
      .insert({ sender_id: coachId, recipient_id: profileId, body: draft.trim(), read: false })
      .select().single()
    if (data) setThread(prev => [...prev, data])
    setDraft('')
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const c = colors
  return (
    <div style={{ background:c.surface, border:'1px solid '+c.border, borderRadius:16, overflow:'hidden', display:'flex', flexDirection:'column', height:500 }}>
      {/* Header */}
      <div style={{ padding:'14px 18px', borderBottom:'1px solid '+c.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div style={{ fontSize:13, fontWeight:800 }}>💬 Messages</div>
        <a href={`/dashboard/coach/messages?client=${client.id}`}
          style={{ fontSize:11, fontWeight:700, color:c.teal, textDecoration:'none' }}>
          Open full view →
        </a>
      </div>

      {/* Thread */}
      <div style={{ flex:1, overflowY:'auto', padding:'16px 18px', display:'flex', flexDirection:'column', gap:8 }}>
        {thread.length === 0 && (
          <div style={{ textAlign:'center', marginTop:40, color:c.textMuted, fontSize:13 }}>No messages yet. Send the first one!</div>
        )}
        {thread.map((msg, i) => {
          const isMe = msg.sender_id === coachId
          return (
            <div key={msg.id || i} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'72%', background: isMe ? c.teal : c.surfaceHigh, color: isMe ? '#000' : c.text,
                borderRadius: isMe ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                padding:'9px 13px', fontSize:13, fontWeight:500, wordBreak:'break-word', lineHeight:1.5,
              }}>
                {msg.body}
                <div style={{ fontSize:10, marginTop:3, opacity:0.6, textAlign: isMe ? 'right' : 'left' }}>
                  {new Date(msg.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}
                  {isMe && <span style={{ marginLeft:4 }}>{msg.read ? ' ✓✓' : ' ✓'}</span>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop:'1px solid '+c.border, padding:'12px 16px', display:'flex', gap:8, alignItems:'flex-end' }}>
        <textarea ref={inputRef}
          value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={handleKey}
          placeholder={`Message ${client.profile?.full_name?.split(' ')[0] || 'client'}...`}
          rows={1}
          style={{ flex:1, background:c.surfaceUp, border:'1px solid '+c.border, borderRadius:10, padding:'9px 12px', fontSize:13, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5, maxHeight:100, overflowY:'auto' }}
          onInput={e=>{ const el=e.currentTarget; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,100)+'px' }}
        />
        <button onClick={send} disabled={!draft.trim()||sending}
          style={{ background:c.teal, border:'none', borderRadius:9, width:36, height:36, display:'flex', alignItems:'center', justifyContent:'center', cursor:!draft.trim()||sending?'not-allowed':'pointer', opacity:!draft.trim()||sending?0.4:1, flexShrink:0 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
