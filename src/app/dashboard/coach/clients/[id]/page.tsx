'use client'

import { useState, useEffect, useRef } from 'react'
import ScheduleTab from '@/components/coach/ScheduleTab'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const TABS = [
  { id:'overview',  label:'Overview',  icon:'👤' },
  { id:'training',  label:'Training',  icon:'🏋' },
  { id:'program',   label:'Program',   icon:'📋' },
  { id:'schedule',  label:'Schedule',  icon:'📅' },
  { id:'nutrition', label:'Nutrition', icon:'🥦' },
  { id:'checkins',  label:'Check-ins', icon:'✓' },
  { id:'goals',     label:'Goals',           icon:'🎯' },
  { id:'pulse',     label:'Pulse & Journal', icon:'❤' },
  { id:'messages',  label:'Messages',  icon:'💬' },
  { id:'intake',    label:'Intake',    icon:'📊' },
]


export default function ClientDetail() {
  const [coachId,  setCoachId]  = useState<string | null>(null)
  const [client,   setClient]   = useState<any>(null)
  const [checkins, setCheckins] = useState<any[]>([])
  const [metrics,  setMetrics]  = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [expandedWorkout,    setExpandedWorkout]    = useState<string|null>(null)
  const [workoutDetails,     setWorkoutDetails]     = useState<Record<string,any>>({}) // sessionId → {exercises, sets}
  const [nutritionPlan, setNutritionPlan] = useState<any>(null)
  const [nutritionEdit, setNutritionEdit] = useState(false)
  const [nutritionForm, setNutritionForm] = useState({ calories:'', protein:'', carbs:'', fat:'', water:'64', notes:'' })
  const [nutritionSaving, setNutritionSaving] = useState(false)
  const [program,       setProgram]       = useState<any>(null)
  const [dailyPulse,    setDailyPulse]    = useState<any[]>([])
  const [journalEntries,setJournalEntries]= useState<any[]>([])
  const [showArchive, setShowArchive] = useState(false)
  const [showDelete,  setShowDelete]  = useState(false)
  const [actioning,   setActioning]   = useState(false)
  // Check-in schedule
  const [checkinSchedule,     setCheckinSchedule]     = useState<any>(null)
  const [checkinAssignments,  setCheckinAssignments]  = useState<any[]>([])
  const [scheduleForm,        setScheduleForm]        = useState({ send_day:0, send_time:'08:00', active:true, form_id:'' })
  const [scheduleSaving,      setScheduleSaving]      = useState(false)
  const [scheduleSaved,       setScheduleSaved]       = useState(false)
  const [sendingNow,          setSendingNow]          = useState(false)
  const [expandedCheckin,     setExpandedCheckin]     = useState<string|null>(null)
  const [respondingTo,        setRespondingTo]        = useState<string|null>(null)
  const [responseText,        setResponseText]        = useState('')
  const [savingResponse,      setSavingResponse]      = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [intake,        setIntake]        = useState<any>(null)
  const [callRequests,  setCallRequests]  = useState<any[]>([])
  const [approvingCall, setApprovingCall] = useState<string|null>(null)
  const [zoomLink,      setZoomLink]      = useState('')
  const [goals,         setGoals]         = useState<any[]>([])
  const [showAddGoal,   setShowAddGoal]   = useState(false)
  const [goalForm,      setGoalForm]      = useState({ title:'', description:'', goal_type:'custom', target_value:'', unit:'', target_date:'' })
  const [goalSaving,    setGoalSaving]    = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [flagNote, setFlagNote] = useState('')
  const [showFlag, setShowFlag] = useState(false)
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const clientId = params.id as string

  async function loadWorkoutDetail(sessionId: string) {
    if (workoutDetails[sessionId]) { setExpandedWorkout(sessionId); return }
    const [{ data: exs }, { data: sets }] = await Promise.all([
      supabase.from('session_exercises').select('*').eq('session_id', sessionId).order('order_index'),
      supabase.from('exercise_sets').select('*').eq('session_id', sessionId).order('set_number'),
    ])
    setWorkoutDetails(prev => ({ ...prev, [sessionId]: { exercises: exs||[], sets: sets||[] } }))
    setExpandedWorkout(sessionId)
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCoachId(user.id)

      const { data: clientData } = await supabase
        .from('clients')
        .select('*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)')
        .eq('id', clientId)
        .single()
      setClient(clientData)
      if (clientData?.coach_notes) setCoachNotes(clientData.coach_notes)
      if (clientData?.gender) setClientGender(clientData.gender)

      // Fire all secondary queries in parallel
      const [
        { data: formData },
        { data: checkinData },
        { data: metricsData },
        { data: workoutData },
        { data: nutritionData },
        { data: programData },
        { data: pulseData },
        { data: journalData },
        { data: intakeData },
        { data: schedData },
        { data: assignData },
      ] = await Promise.all([
        supabase.from('onboarding_forms').select('id,title,form_type,is_default,is_checkin_type').eq('coach_id', user.id),
        supabase.from('checkins').select('*').eq('client_id', clientId).order('submitted_at', { ascending: false }).limit(10),
        supabase.from('metrics').select('*').eq('client_id', clientId).order('logged_date', { ascending: false }).limit(10),
        supabase.from('workout_sessions').select('*').eq('client_id', clientId).order('scheduled_date', { ascending: false }).limit(20),
        supabase.from('nutrition_plans').select('*').eq('client_id', clientId).eq('is_active', true).single(),
        supabase.from('programs').select('*').eq('client_id', clientId).eq('is_template', false).order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('daily_checkins').select('*').eq('client_id', clientId).order('checkin_date', { ascending: false }).limit(30),
        supabase.from('journal_entries').select('*').eq('client_id', clientId).eq('is_private', false).order('entry_date', { ascending: false }).limit(30),
        supabase.from('client_intake_profiles').select('*').eq('client_id', clientId).single(),
        supabase.from('check_in_schedules').select('*').eq('client_id', clientId).eq('coach_id', user.id).order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('client_form_assignments').select('*, form:onboarding_forms(title)').eq('client_id', clientId).not('checkin_schedule_id', 'is', null).order('assigned_at', { ascending: false }).limit(20),
      ])

      setForms(formData || [])
      setCheckins(checkinData || [])
      setMetrics(metricsData || [])
      setWorkouts(workoutData || [])
      setNutritionPlan(nutritionData || null)
      if (nutritionData) {
        setNutritionForm({
          calories: String(nutritionData.calories_target || ''),
          protein:  String(nutritionData.protein_g || ''),
          carbs:    String(nutritionData.carbs_g || ''),
          fat:      String(nutritionData.fat_g || ''),
          water:    String(nutritionData.water_oz || '64'),
          notes:    nutritionData.notes || '',
        })
      }
      setProgram(programData || null)
      setDailyPulse(pulseData || [])
      setJournalEntries(journalData || [])
      setIntake(intakeData || null)
      setCheckinSchedule(schedData || null)
      if (schedData) {
        setScheduleForm({
          send_day:  schedData.send_day  ?? 0,
          send_time: schedData.send_time ?? '08:00',
          active:    schedData.active    ?? true,
          form_id:   schedData.form_id   ?? '',
        })
      }
      setCheckinAssignments(assignData || [])

      // Load pending call requests
      const { data: callData } = await supabase
        .from('call_requests').select('*')
        .eq('client_id', clientId).eq('status','pending')
        .order('created_at', { ascending: false })
      setCallRequests(callData || [])

      // Load active goals
      const { data: goalsData } = await supabase
        .from('client_goals').select('*')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
      setGoals(goalsData || [])

      setLoading(false)
    }
    load()
  }, [clientId])

  const [coachNotes, setCoachNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
  const [clientGender, setClientGender] = useState('')
  const [genderSaved, setGenderSaved] = useState(false)
  const [forms,        setForms]        = useState<any[]>([])
  const [showAssignForm, setShowAssignForm] = useState(false)
  const [assignFormId,   setAssignFormId]   = useState('')
  const [assignNote,     setAssignNote]     = useState('')
  const [assigning,      setAssigning]      = useState(false)
  const [assignedDone,   setAssignedDone]   = useState(false)
  const [resending,      setResending]      = useState(false)
  const [resendDone,     setResendDone]     = useState(false)

  const assignForm = async () => {
    if (!assignFormId || !coachId) return
    setAssigning(true)
    await supabase.from('client_form_assignments').insert({
      coach_id: coachId,
      client_id: clientId,
      form_id: assignFormId,
      note: assignNote || null,
      status: 'pending',
    })
    setAssigning(false)
    setAssignedDone(true)
    setTimeout(() => { setShowAssignForm(false); setAssignedDone(false); setAssignFormId(''); setAssignNote('') }, 1800)
  }

  const resendInvite = async () => {
    if (!coachId) return
    setResending(true)
    // Find the most recent pending invite for this client's email
    const email = client?.profile?.email
    if (email) {
      const { data: inv } = await supabase
        .from('client_invites')
        .select('id')
        .eq('coach_id', coachId)
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (inv) {
        await supabase.from('client_invites').update({
          status: 'pending',
          expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString()
        }).eq('id', inv.id)
        await supabase.functions.invoke('send-invite-email', { body: { invite_id: inv.id } })
      } else {
        // Create a fresh invite if none found
        const { data: newInv } = await supabase.from('client_invites').insert({
          coach_id: coachId, email, full_name: client?.profile?.full_name
        }).select().single()
        if (newInv) await supabase.functions.invoke('send-invite-email', { body: { invite_id: newInv.id } })
      }
    }
    setResending(false)
    setResendDone(true)
    setTimeout(() => setResendDone(false), 2500)
  }

  const saveAndBack = async () => {
    if (coachNotes.trim()) {
      await supabase.from('clients').update({ coach_notes: coachNotes }).eq('id', clientId)
    }
    router.push('/dashboard/coach')
  }

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
    <>      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};}
        .tab-content{padding:28px;max-width:1200px;margin:0 auto;}
        .overview-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
        .client-topbar{padding:0 28px;}
        @media(max-width:768px){
          .tab-content{padding:14px 12px;}
          .overview-grid{grid-template-columns:1fr!important;}
          .client-topbar{padding:0 14px;}
          .tab-bar{padding:0 10px!important;}
          .tab-item{padding:12px 12px!important;font-size:12px!important;}
          .sticky-bar{padding:10px 12px!important;}
        }
        @media(max-width:500px){
          .tab-item span:first-child{display:none;}
        }
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div className="client-topbar" style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
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
          <button onClick={resendInvite} disabled={resending || resendDone}
            style={{ background:resendDone?t.greenDim:t.orangeDim, border:'1px solid '+(resendDone?t.green:t.orange)+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:resendDone?t.green:t.orange, cursor:resending||resendDone?'default':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {resendDone ? '✓ Sent!' : resending ? 'Sending...' : '📨 Resend Invite'}
          </button>
          <button onClick={()=>setShowAssignForm(true)}
            style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            📝 Send Form
          </button>
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
          <div className="tab-bar" style={{ maxWidth:1200, margin:'0 auto', display:'flex', padding:'0 28px', overflowX:'auto', WebkitOverflowScrolling:'touch' }}>
            {TABS.map(tab => (
              <div key={tab.id} onClick={()=>setActiveTab(tab.id)}
                className="tab-item" style={{ display:'flex', alignItems:'center', gap:6, padding:'14px 18px', cursor:'pointer', borderBottom:'2px solid '+(activeTab===tab.id ? t.teal : 'transparent'), fontSize:13, fontWeight:activeTab===tab.id ? 700 : 500, color:activeTab===tab.id ? t.teal : t.textDim, transition:'all 0.15s ease', whiteSpace:'nowrap', flexShrink:0 }}>
                <span>{tab.icon}</span>{tab.label}
              </div>
            ))}
          </div>
        </div>


        {/* Tab content */}
        <div className="tab-content" style={{ paddingBottom:80 }}>

          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="overview-grid" style={{ display:"grid" }}>

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

                {/* Gender */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>Demo Video Gender</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <select value={clientGender} onChange={e => { setClientGender(e.target.value); setGenderSaved(false) }}
                      style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:clientGender ? t.text : t.textMuted, fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as any, outline:'none' }}>
                      <option value="">Not set (defaults to male)</option>
                      <option value="male">♂ Male</option>
                      <option value="female">♀ Female</option>
                      <option value="non-binary">Non-binary</option>
                      <option value="prefer_not_to_say">Prefer not to say</option>
                    </select>
                    <button onClick={async () => {
                      await supabase.from('clients').update({ gender: clientGender || null }).eq('id', clientId)
                      setGenderSaved(true)
                      setTimeout(() => setGenderSaved(false), 2000)
                    }}
                      style={{ background: genderSaved ? t.green : t.tealDim, border:'1px solid '+(genderSaved ? t.green : t.teal)+'40', borderRadius:9, padding:'9px 16px', fontSize:12, fontWeight:700, color: genderSaved ? '#000' : t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0, transition:'background .3s' }}>
                      {genderSaved ? '✓ Saved!' : 'Save'}
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:5 }}>Controls which demo video this client sees during workouts</div>
                </div>

                <textarea placeholder="Private notes about this client..." rows={5}
                  value={coachNotes}
                  onChange={e=>{ setCoachNotes(e.target.value); setNotesSaved(false) }}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.6 }} />
                <button onClick={async ()=>{ await supabase.from('clients').update({ coach_notes: coachNotes }).eq('id', clientId); setNotesSaved(true); setTimeout(()=>setNotesSaved(false),2000) }}
                  style={{ marginTop:10, background:notesSaved?t.green:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'background .3s' }}>
                  {notesSaved ? '✓ Saved!' : 'Save Note'}
                </button>
              </div>

            </div>
          )}


          {/* ── WORKOUTS TAB ── */}
          {activeTab === 'training' && (
            <div>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>Workout Sessions</div>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Tap any session to see the full set-by-set log.</div>
              {workouts.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'48px 20px', textAlign:'center' as const, color:t.textMuted, fontSize:13 }}>
                  No workout sessions yet.
                </div>
              ) : workouts.map((w:any) => {
                const isExpanded = expandedWorkout === w.id
                const detail = workoutDetails[w.id]
                const statusColor = w.status === 'completed' ? t.green : w.status === 'in_progress' ? t.orange : t.textMuted
                const fmtDuration = (s:number) => s ? Math.floor(s/60)+'m '+s%60+'s' : null
                return (
                  <div key={w.id} style={{ background:t.surface, border:'1px solid '+(isExpanded?t.teal+'50':t.border), borderRadius:16, marginBottom:10, overflow:'hidden', transition:'border-color 0.15s' }}>
                    {/* Session header — tap to expand */}
                    <div onClick={()=>{ isExpanded ? setExpandedWorkout(null) : loadWorkoutDetail(w.id) }}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 18px', cursor:'pointer' }}>
                      <div style={{ width:40, height:40, borderRadius:12, background:w.status==='completed'?t.greenDim:t.orangeDim, border:'1px solid '+(w.status==='completed'?t.green+'40':t.orange+'40'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                        {w.status==='completed'?'✅':'💪'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{w.title || w.name || 'Workout Session'}</div>
                        <div style={{ fontSize:11, color:t.textMuted, display:'flex', gap:10, flexWrap:'wrap' as const }}>
                          <span>{new Date(w.scheduled_date||w.created_at).toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</span>
                          {w.duration_seconds && <span>⏱ {fmtDuration(w.duration_seconds)}</span>}
                          {w.session_rpe && <span>RPE {w.session_rpe}/10</span>}
                          {w.mood && <span>{w.mood}</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:statusColor, textTransform:'capitalize' as const }}>{w.status}</span>
                        <span style={{ color:t.textMuted, fontSize:14, transform: isExpanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s' }}>▼</span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div style={{ borderTop:'1px solid '+t.border, padding:'16px 18px' }}>
                        {!detail ? (
                          <div style={{ color:t.textMuted, fontSize:13, textAlign:'center' as const }}>Loading...</div>
                        ) : detail.exercises.length === 0 ? (
                          <div style={{ color:t.textMuted, fontSize:13, textAlign:'center' as const }}>No exercises logged for this session.</div>
                        ) : detail.exercises.map((ex:any) => {
                          const exSets = detail.sets.filter((s:any) => s.session_exercise_id === ex.id)
                          const hasVideo = ex.client_video_url
                          return (
                            <div key={ex.id} style={{ marginBottom:16 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                <div style={{ fontSize:13, fontWeight:800, color:t.teal }}>{ex.exercise_name}</div>
                                <div style={{ fontSize:11, color:t.textMuted }}>Target: {ex.sets_prescribed}×{ex.reps_prescribed}{ex.weight_prescribed?' @ '+ex.weight_prescribed:''}</div>
                                {hasVideo && (
                                  <a href={ex.client_video_url} target="_blank" rel="noreferrer"
                                    style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:4, fontSize:11, fontWeight:700, color:t.purple, background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:20, padding:'3px 10px', textDecoration:'none' }}>
                                    📹 Form Check
                                  </a>
                                )}
                              </div>
                              {exSets.length > 0 ? (
                                <div style={{ background:t.surfaceHigh, borderRadius:10, overflow:'hidden' }}>
                                  <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 1fr 1fr 1fr', gap:0, padding:'6px 12px', borderBottom:'1px solid '+t.border }}>
                                    {['Set','Reps','Weight','RPE','Notes'].map(h=>(
                                      <div key={h} style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.05em' }}>{h}</div>
                                    ))}
                                  </div>
                                  {exSets.map((s:any,i:number)=>(
                                    <div key={s.id} style={{ display:'grid', gridTemplateColumns:'40px 1fr 1fr 1fr 1fr', gap:0, padding:'8px 12px', borderBottom: i<exSets.length-1?'1px solid '+t.border+'66':'none', background: s.is_warmup?t.orangeDim:'transparent' }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:s.is_warmup?t.orange:t.textDim }}>{s.is_warmup?'W':s.set_number}</div>
                                      <div style={{ fontSize:13, fontWeight:700 }}>{s.reps_completed||'—'}</div>
                                      <div style={{ fontSize:13, fontWeight:700 }}>{s.weight_value!=null ? s.weight_value+(s.weight_unit||'lbs') : s.weight_unit==='bw' ? 'BW' : '—'}</div>
                                      <div style={{ fontSize:13, fontWeight:700, color:s.rpe>=8?t.red:s.rpe>=6?t.orange:t.green }}>{s.rpe||'—'}</div>
                                      <div style={{ fontSize:11, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{s.notes||'—'}</div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize:12, color:t.textMuted, fontStyle:'italic' }}>Sets not logged individually</div>
                              )}
                            </div>
                          )
                        })}
                        {/* Client notes */}
                        {w.notes_client && (
                          <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.teal, marginTop:8 }}>
                            <strong>Client note:</strong> {w.notes_client}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* CHECK-INS TAB */}
          {activeTab === 'checkins' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

              {/* ── Schedule Card ── */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800 }}>📅 Weekly Schedule</div>
                    <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>
                      {checkinSchedule?.active
                        ? `Sends every ${['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][scheduleForm.send_day]} at ${scheduleForm.send_time}`
                        : 'No active schedule — check-ins are manual only'}
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (!coachId) return
                      setScheduleSaving(true)
                      const now = new Date()
                      // Calculate next send date
                      const next = new Date()
                      next.setDate(now.getDate() + ((scheduleForm.send_day - now.getDay() + 7) % 7 || 7))
                      const [h, m] = scheduleForm.send_time.split(':')
                      next.setHours(+h, +m, 0, 0)
                      if (checkinSchedule) {
                        await supabase.from('check_in_schedules').update({
                          send_day:  scheduleForm.send_day,
                          send_time: scheduleForm.send_time,
                          active:    scheduleForm.active,
                          form_id:   scheduleForm.form_id || null,
                          next_send_at: next.toISOString(),
                        }).eq('id', checkinSchedule.id)
                        setCheckinSchedule((p:any) => ({ ...p, ...scheduleForm, next_send_at: next.toISOString() }))
                      } else {
                        const { data: newSched } = await supabase.from('check_in_schedules').insert({
                          coach_id: coachId, client_id: clientId,
                          send_day:  scheduleForm.send_day,
                          send_time: scheduleForm.send_time,
                          active:    scheduleForm.active,
                          form_id:   scheduleForm.form_id || null,
                          frequency: 'weekly',
                          next_send_at: next.toISOString(),
                        }).select().single()
                        setCheckinSchedule(newSched)
                      }
                      setScheduleSaving(false)
                      setScheduleSaved(true)
                      setTimeout(() => setScheduleSaved(false), 2000)
                    }}
                    style={{ background:scheduleSaved?t.greenDim:t.tealDim, border:'1px solid '+(scheduleSaved?t.green:t.teal)+'40', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:scheduleSaved?t.green:t.teal, cursor:scheduleSaving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {scheduleSaved ? '✓ Saved!' : scheduleSaving ? 'Saving...' : 'Save Schedule'}
                  </button>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                  {/* Day picker */}
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Send Day</div>
                    <select value={scheduleForm.send_day}
                      onChange={e => setScheduleForm(p => ({ ...p, send_day: +e.target.value }))}
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', outline:'none' }}>
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d,i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                  {/* Time picker */}
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Send Time</div>
                    <input type="time" value={scheduleForm.send_time}
                      onChange={e => setScheduleForm(p => ({ ...p, send_time: e.target.value }))}
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', outline:'none' }} />
                  </div>
                  {/* Active toggle */}
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Status</div>
                    <button onClick={() => setScheduleForm(p => ({ ...p, active: !p.active }))}
                      style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid '+(scheduleForm.active?t.teal+'40':t.border), background:scheduleForm.active?t.tealDim:t.surfaceHigh, fontSize:13, fontWeight:700, color:scheduleForm.active?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {scheduleForm.active ? '✓ Active' : '⏸ Paused'}
                    </button>
                  </div>
                </div>

                {/* Form picker */}
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.06em' }}>Check-in Form</div>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <select
                      value={scheduleForm.form_id}
                      onChange={e => setScheduleForm(p => ({ ...p, form_id: e.target.value }))}
                      style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', outline:'none' }}>
                      <option value="">Default (Weekly Check In)</option>
                      {forms.filter(f => f.form_type === 'check_in' || f.is_checkin_type).map((f:any) => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => {
                        const target = scheduleForm.form_id || forms.find((f:any) => f.form_type === 'check_in' || f.is_checkin_type)?.id
                        if (target) router.push(`/dashboard/coach/onboarding?edit=${target}`)
                        else router.push('/dashboard/coach/onboarding')
                      }}
                      style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:9, padding:'10px 14px', fontSize:12, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                      ✏️ Edit Form
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:5 }}>
                    Edit questions in the form builder. Changes apply to all future check-ins using this form.
                  </div>
                </div>
                <div style={{ marginTop:16, paddingTop:16, borderTop:'1px solid '+t.border }}>
                  <button
                    disabled={sendingNow}
                    onClick={async () => {
                      if (!coachId || !checkinSchedule) return
                      setSendingNow(true)
                      // Use the schedule's form_id if set, otherwise find first check_in type form
                      let ciFormId = checkinSchedule?.form_id
                      if (!ciFormId) {
                        const { data: ciForm } = await supabase
                          .from('onboarding_forms').select('id')
                          .eq('coach_id', coachId)
                          .or('form_type.eq.check_in,is_checkin_type.eq.true')
                          .limit(1).single()
                        ciFormId = ciForm?.id
                      }
                      if (ciFormId) {
                        const { data: newAssign } = await supabase.from('client_form_assignments').insert({
                          coach_id: coachId, client_id: clientId,
                          form_id: ciFormId,
                          checkin_schedule_id: checkinSchedule.id,
                          status: 'pending',
                          note: 'Sent manually by coach',
                        }).select().single()
                        if (newAssign) {
                          setCheckinAssignments(p => [newAssign, ...p])
                          // Push notification to client
                          const clientProfile = client?.profile_id
                          if (clientProfile) {
                            await supabase.functions.invoke('send-notification', {
                              body: {
                                user_id: clientProfile,
                                notification_type: 'checkin_due',
                                title: 'Check-in time! 📋',
                                body: 'Coach Shane sent your weekly check-in. Tap to fill it out.',
                                link_url: '/dashboard/client/checkin',
                              }
                            })
                          }
                        }
                      }
                      setSendingNow(false)
                    }}
                    style={{ background:checkinSchedule?t.orangeDim:'transparent', border:'1px solid '+(checkinSchedule?t.orange+'40':t.border), borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:checkinSchedule?t.orange:t.textMuted, cursor:sendingNow||!checkinSchedule?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!checkinSchedule?0.5:1 }}>
                    {sendingNow ? 'Sending...' : '📤 Send Check-in Now'}
                  </button>
                  {!checkinSchedule && <span style={{ fontSize:11, color:t.textMuted, marginLeft:10 }}>Save a schedule first to enable manual sends</span>}
                </div>
              </div>

              {/* ── History ── */}
              <div style={{ fontSize:13, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                History ({checkinAssignments.length})
              </div>

              {checkinAssignments.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center' }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>📋</div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No check-ins sent yet</div>
                  <div style={{ fontSize:13, color:t.textMuted }}>Save a schedule above or use "Send Now" to send the first one</div>
                </div>
              ) : checkinAssignments.map((a:any) => {
                const isExpanded = expandedCheckin === a.id
                const response = a.response || {}
                const statusColor = a.status === 'completed' ? t.green : a.status === 'pending' ? t.orange : t.textMuted
                const snoozed = a.snoozed_until && new Date(a.snoozed_until) > new Date()
                return (
                  <div key={a.id} style={{ background:t.surface, border:'1px solid '+(isExpanded?t.teal+'40':t.border), borderRadius:16, overflow:'hidden' }}>
                    {/* Header */}
                    <div onClick={() => setExpandedCheckin(isExpanded ? null : a.id)}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer' }}>
                      <div style={{ width:38, height:38, borderRadius:11, background:a.status==='completed'?t.greenDim:t.orangeDim, border:'1px solid '+(a.status==='completed'?t.green+'40':t.orange+'40'), display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                        {a.status === 'completed' ? '✅' : snoozed ? '⏰' : '📋'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>
                          {new Date(a.assigned_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}
                        </div>
                        <div style={{ fontSize:11, color:t.textMuted }}>
                          {a.status === 'completed' && a.completed_at
                            ? `Submitted ${new Date(a.completed_at).toLocaleDateString([], { month:'short', day:'numeric' })} at ${new Date(a.completed_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`
                            : snoozed ? `Snoozed until ${new Date(a.snoozed_until).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}` : 'Pending response'}
                        </div>
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:11, fontWeight:700, color:statusColor, textTransform:'capitalize' }}>{a.status}</span>
                        {a.coach_response && <span style={{ fontSize:10, color:t.teal, background:t.tealDim, borderRadius:20, padding:'2px 8px' }}>Replied</span>}
                        <span style={{ color:t.textMuted, fontSize:12, transform:isExpanded?'rotate(180deg)':'rotate(0)', transition:'transform 0.2s' }}>▼</span>
                      </div>
                    </div>

                    {/* Expanded response */}
                    {isExpanded && a.status === 'completed' && (
                      <div style={{ borderTop:'1px solid '+t.border, padding:'16px 20px' }}>
                        {/* Render response fields */}
                        {Object.entries(response).length > 0 ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:16 }}>
                            {Object.entries(response).map(([key, val]: any) => (
                              <div key={key} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 14px' }}>
                                <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{key.replace(/_/g,' ')}</div>
                                <div style={{ fontSize:13, color:t.text, lineHeight:1.6 }}>{String(val)}</div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize:13, color:t.textMuted, marginBottom:16 }}>No response data</div>
                        )}

                        {/* Coach response */}
                        {a.coach_response ? (
                          <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'12px 16px', fontSize:13, color:t.teal, lineHeight:1.6 }}>
                            <strong>Your response:</strong> {a.coach_response}
                            <button onClick={() => { setRespondingTo(a.id); setResponseText(a.coach_response) }}
                              style={{ marginLeft:10, background:'none', border:'none', color:t.teal, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", textDecoration:'underline' }}>
                              Edit
                            </button>
                          </div>
                        ) : respondingTo === a.id ? (
                          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                            <textarea value={responseText} onChange={e => setResponseText(e.target.value)} rows={3}
                              placeholder="Write your response to this check-in..."
                              style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.6 }} />
                            <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                              <button onClick={() => { setRespondingTo(null); setResponseText('') }}
                                style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                Cancel
                              </button>
                              <button disabled={savingResponse || !responseText.trim()}
                                onClick={async () => {
                                  setSavingResponse(true)
                                  await supabase.from('client_form_assignments').update({
                                    coach_response: responseText,
                                    coach_responded_at: new Date().toISOString(),
                                  }).eq('id', a.id)
                                  setCheckinAssignments(p => p.map(x => x.id === a.id ? { ...x, coach_response: responseText } : x))
                                  setRespondingTo(null); setResponseText(''); setSavingResponse(false)
                                }}
                                style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:700, color:'#000', cursor:savingResponse||!responseText.trim()?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                {savingResponse ? 'Saving...' : '✓ Send Response'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setRespondingTo(a.id); setResponseText('') }}
                            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                            💬 Respond to Check-in
                          </button>
                        )}
                      </div>
                    )}

                    {/* Pending — show pending state */}
                    {isExpanded && a.status === 'pending' && (
                      <div style={{ borderTop:'1px solid '+t.border, padding:'16px 20px', color:t.textMuted, fontSize:13 }}>
                        {snoozed
                          ? `Client snoozed this check-in until ${new Date(a.snoozed_until).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}.`
                          : 'Waiting for client to submit this check-in.'}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* METRICS TAB */}
          {activeTab === 'training' && (
            <CoachMetricsTab metrics={metrics} t={t} />
          )}

          {/* PROGRAM TAB */}
          {activeTab === 'program' && (
            <ProgramTab
              clientId={clientId}
              coachId={coachId!}
              program={program}
              workouts={workouts}
              supabase={supabase}
              router={router}
              t={t}
              onProgramChange={setProgram}
            />
          )}

          {/* SCHEDULE TAB */}
          {activeTab === 'schedule' && client && (
            <ScheduleTab
              clientId={client.id}
              coachId={coachId!}
              clientName={client.profiles?.full_name || ''}
              supabase={supabase}
              t={t}
            />
          )}

          {/* NUTRITION TAB */}
          {activeTab === 'nutrition' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>

                {/* Header */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800 }}>🥗 Nutrition Targets</div>
                    <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>
                      {nutritionPlan ? 'Active plan · tap Edit to adjust' : 'No plan set yet'}
                    </div>
                  </div>
                  <button onClick={() => {
                    if (!nutritionEdit && nutritionPlan) {
                      setNutritionForm({
                        calories: String(nutritionPlan.calories_target || ''),
                        protein:  String(nutritionPlan.protein_g || ''),
                        carbs:    String(nutritionPlan.carbs_g || ''),
                        fat:      String(nutritionPlan.fat_g || ''),
                        water:    String(nutritionPlan.water_oz || '64'),
                        notes:    nutritionPlan.notes || '',
                      })
                    }
                    setNutritionEdit(e => !e)
                  }}
                    style={{ background:nutritionEdit?t.surfaceHigh:t.tealDim, border:'1px solid '+(nutritionEdit?t.border:t.teal+'40'), borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:nutritionEdit?t.textMuted:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {nutritionEdit ? 'Cancel' : nutritionPlan ? 'Edit' : '+ Set Plan'}
                  </button>
                </div>

                {/* View mode — macro tiles */}
                {!nutritionEdit && nutritionPlan && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom: nutritionPlan.notes ? 16 : 0 }}>
                      {[
                        { label:'Calories', val: nutritionPlan.calories_target ? nutritionPlan.calories_target+'kcal' : '—', color:t.orange },
                        { label:'Protein',  val: nutritionPlan.protein_g  ? nutritionPlan.protein_g+'g'  : '—', color:t.teal   },
                        { label:'Carbs',    val: nutritionPlan.carbs_g    ? nutritionPlan.carbs_g+'g'    : '—', color:t.yellow },
                        { label:'Fat',      val: nutritionPlan.fat_g      ? nutritionPlan.fat_g+'g'      : '—', color:t.purple },
                        { label:'Water',    val: nutritionPlan.water_oz   ? nutritionPlan.water_oz+'oz'  : '—', color:'#38bdf8' },
                      ].map(s => (
                        <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{s.label}</div>
                          <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
                        </div>
                      ))}
                    </div>
                    {nutritionPlan.notes && (
                      <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'12px 16px', fontSize:13, color:t.teal, lineHeight:1.6 }}>
                        <strong>Notes:</strong> {nutritionPlan.notes}
                      </div>
                    )}
                  </>
                )}

                {/* Empty state */}
                {!nutritionEdit && !nutritionPlan && (
                  <div style={{ textAlign:'center', padding:'32px 0', color:t.textMuted }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>🥗</div>
                    <div style={{ fontSize:13 }}>No nutrition plan set. Hit "+ Set Plan" to add targets.</div>
                  </div>
                )}

                {/* Edit mode — inline form */}
                {nutritionEdit && (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
                      {[
                        { label:'Calories (kcal)', key:'calories', placeholder:'2000', color:t.orange },
                        { label:'Protein (g)',      key:'protein',  placeholder:'150',  color:t.teal   },
                        { label:'Carbs (g)',        key:'carbs',    placeholder:'200',  color:t.yellow },
                        { label:'Fat (g)',          key:'fat',      placeholder:'65',   color:t.purple },
                        { label:'Water (oz)',       key:'water',    placeholder:'64',   color:'#38bdf8' },
                      ].map(f => (
                        <div key={f.key}>
                          <div style={{ fontSize:11, fontWeight:700, color:f.color, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>{f.label}</div>
                          <input
                            type="number"
                            value={(nutritionForm as any)[f.key]}
                            onChange={e => setNutritionForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:14, fontWeight:700, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }}
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, marginBottom:5, textTransform:'uppercase', letterSpacing:'0.06em' }}>Coach Notes (visible to client)</div>
                      <textarea
                        value={nutritionForm.notes}
                        onChange={e => setNutritionForm(prev => ({ ...prev, notes: e.target.value }))}
                        placeholder="Focus on hitting protein first. Don't stress about exact calories..."
                        rows={3}
                        style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', resize:'none', lineHeight:1.6, boxSizing:'border-box' as any }}
                      />
                    </div>
                    <button
                      disabled={nutritionSaving}
                      onClick={async () => {
                        if (!coachId) return
                        setNutritionSaving(true)
                        const payload = {
                          client_id: clientId, coach_id: coachId,
                          name: 'Nutrition Plan',
                          calories_target: parseInt(nutritionForm.calories) || null,
                          protein_g:  parseInt(nutritionForm.protein)  || null,
                          carbs_g:    parseInt(nutritionForm.carbs)    || null,
                          fat_g:      parseInt(nutritionForm.fat)      || null,
                          water_oz:   parseInt(nutritionForm.water)    || 64,
                          notes:      nutritionForm.notes || null,
                          is_active: true,
                        }
                        if (nutritionPlan) {
                          await supabase.from('nutrition_plans').update(payload).eq('id', nutritionPlan.id)
                          setNutritionPlan({ ...nutritionPlan, ...payload })
                        } else {
                          const { data: newPlan } = await supabase.from('nutrition_plans').insert(payload).select().single()
                          setNutritionPlan(newPlan)
                        }
                        setNutritionSaving(false)
                        setNutritionEdit(false)
                      }}
                      style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:nutritionSaving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:nutritionSaving?0.6:1 }}>
                      {nutritionSaving ? 'Saving...' : '✓ Save Nutrition Plan'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FORMS TAB */}
          {activeTab === 'checkins' && (
            <FormsTab clientId={clientId} coachId={coachId!} forms={forms} onAssign={() => setShowAssignForm(true)} supabase={supabase} router={router} t={t} />
          )}

          {/* MESSAGES TAB */}
          {activeTab === 'messages' && client && (
            <div>
            {/* Pending Call Requests */}
            {callRequests.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#f5a623', marginBottom:12 }}>
                  📞 Pending Call Requests
                </div>
                {callRequests.map(req => (
                  <div key={req.id} style={{ background:'#0f0f1a', border:'1px solid #f5a62330', borderRadius:14, padding:16, marginBottom:10 }}>
                    <div style={{ fontSize:12, color:'#5a5a78', marginBottom:8 }}>
                      Requested {new Date(req.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#eeeef8', marginBottom:6 }}>Proposed times:</div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:12 }}>
                      {(req.proposed_times||[]).map((slot:any,i:number) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:18, height:18, borderRadius:'50%', background:'#f5a62320', border:'1px solid #f5a62340', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#f5a623', flexShrink:0 }}>{i+1}</div>
                          <div style={{ fontSize:13, color:'#eeeef8' }}>{slot.date} at {slot.time}</div>
                        </div>
                      ))}
                    </div>
                    {req.client_note && (
                      <div style={{ background:'#161624', borderRadius:9, padding:'8px 12px', marginBottom:12, fontSize:12, color:'#8888a8', lineHeight:1.5 }}>
                        &ldquo;{req.client_note}&rdquo;
                      </div>
                    )}
                    {approvingCall === req.id ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                        <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.06em' }}>Zoom Link</div>
                        <input type="text" value={zoomLink} onChange={e=>setZoomLink(e.target.value)}
                          placeholder="https://zoom.us/j/..."
                          style={{ width:'100%', background:'#161624', border:'1px solid #252538', borderRadius:9, padding:'9px 12px', fontSize:13, color:'#eeeef8', outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const }}/>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={()=>{setApprovingCall(null);setZoomLink('')}}
                            style={{ flex:1, padding:'9px', borderRadius:9, border:'1px solid #252538', background:'transparent', color:'#5a5a78', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                            Cancel
                          </button>
                          <button disabled={!zoomLink.trim()} onClick={async()=>{
                            await supabase.from('call_requests').update({
                              status:'approved', zoom_link: zoomLink.trim(), updated_at: new Date().toISOString()
                            }).eq('id', req.id)
                            setCallRequests(p=>p.filter(r=>r.id!==req.id))
                            setApprovingCall(null); setZoomLink('')
                          }}
                            style={{ flex:2, padding:'9px', borderRadius:9, border:'none', background: zoomLink.trim()?'linear-gradient(135deg,#00c9b1,#00c9b1cc)':'#1d1d2e', color: zoomLink.trim()?'#000':'#5a5a78', fontSize:12, fontWeight:800, cursor: zoomLink.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                            ✓ Confirm &amp; Send Link
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display:'flex', gap:8 }}>
                        <button onClick={async()=>{
                          await supabase.from('call_requests').update({status:'declined',updated_at:new Date().toISOString()}).eq('id',req.id)
                          setCallRequests(p=>p.filter(r=>r.id!==req.id))
                        }}
                          style={{ flex:1, padding:'9px', borderRadius:9, border:'1px solid #ef444430', background:'#ef444415', color:'#ef4444', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          Decline
                        </button>
                        <button onClick={()=>setApprovingCall(req.id)}
                          style={{ flex:2, padding:'9px', borderRadius:9, border:'none', background:'linear-gradient(135deg,#00c9b1,#00c9b1cc)', color:'#000', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          ✓ Approve + Add Link
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <MiniThread coachId={coachId!} client={client} />
            </div>
          )}

        </div>



        {/* Add Goal Modal */}
        {showAddGoal && (
          <>
            <div onClick={()=>{if(!goalSaving)setShowAddGoal(false)}}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', backdropFilter:'blur(6px)', zIndex:200 }}/>
            <div style={{ position:'fixed', bottom:0, left:0, right:0, background:t.surface, borderTop:'1px solid '+t.border, borderRadius:'20px 20px 0 0', zIndex:201, padding:'24px 24px 40px', fontFamily:"'DM Sans',sans-serif", maxHeight:'90vh', overflowY:'auto' }}>
              <div style={{ width:36, height:4, borderRadius:2, background:t.border, margin:'0 auto 20px' }}/>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>New Goal</div>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Set a target for {client?.profile?.full_name?.split(' ')[0]}</div>

              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                {/* Title */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Goal *</div>
                  <input value={goalForm.title} onChange={e=>setGoalForm(p=>({...p,title:e.target.value}))}
                    placeholder="e.g. Hit 200lb squat, Lose 15 lbs, Complete 30 workouts"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' as const }}/>
                </div>

                {/* Type */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Type</div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const }}>
                    {(['strength','weight','consistency','custom'] as const).map(type => (
                      <button key={type} onClick={()=>setGoalForm(p=>({...p,goal_type:type}))}
                        style={{ padding:'6px 14px', borderRadius:20, border:'1px solid '+(goalForm.goal_type===type?t.teal:t.border), background:goalForm.goal_type===type?t.teal+'20':'transparent', color:goalForm.goal_type===type?t.teal:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' as const }}>
                        {type}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Target value + unit */}
                <div style={{ display:'flex', gap:10 }}>
                  <div style={{ flex:2 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Target Value</div>
                    <input type="number" value={goalForm.target_value} onChange={e=>setGoalForm(p=>({...p,target_value:e.target.value}))}
                      placeholder="e.g. 200"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' as const }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Unit</div>
                    <input value={goalForm.unit} onChange={e=>setGoalForm(p=>({...p,unit:e.target.value}))}
                      placeholder="lbs, kg, %..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' as const }}/>
                  </div>
                </div>

                {/* Target date */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Target Date (optional)</div>
                  <input type="date" value={goalForm.target_date} onChange={e=>setGoalForm(p=>({...p,target_date:e.target.value}))}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:goalForm.target_date?t.text:t.textMuted, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' as const, colorScheme:'dark' as any }}/>
                </div>

                {/* Description */}
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Notes (optional)</div>
                  <textarea value={goalForm.description} onChange={e=>setGoalForm(p=>({...p,description:e.target.value}))} rows={2}
                    placeholder="Any extra context for this goal..."
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', resize:'none' as any, boxSizing:'border-box' as const }}/>
                </div>

                <div style={{ display:'flex', gap:10, marginTop:4 }}>
                  <button onClick={()=>setShowAddGoal(false)}
                    style={{ flex:1, padding:'12px', borderRadius:11, border:'1px solid '+t.border, background:'transparent', color:t.textMuted, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button disabled={!goalForm.title.trim()||goalSaving} onClick={async()=>{
                    if (!goalForm.title.trim()) return
                    setGoalSaving(true)
                    const { data: newGoal } = await supabase.from('client_goals').insert({
                      client_id: clientId,
                      coach_id: coachId,
                      title: goalForm.title.trim(),
                      description: goalForm.description || null,
                      goal_type: goalForm.goal_type,
                      target_value: goalForm.target_value ? parseFloat(goalForm.target_value) : null,
                      unit: goalForm.unit || null,
                      target_date: goalForm.target_date || null,
                      status: 'active',
                    }).select().single()
                    if (newGoal) setGoals(p => [newGoal, ...p])
                    setGoalSaving(false)
                    setShowAddGoal(false)
                    setGoalForm({ title:'', description:'', goal_type:'custom', target_value:'', unit:'', target_date:'' })
                  }}
                    style={{ flex:2, padding:'12px', borderRadius:11, border:'none', background: goalForm.title.trim() ? 'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)' : t.surfaceHigh, color: goalForm.title.trim() ? '#000' : t.textMuted, fontSize:13, fontWeight:800, cursor: goalForm.title.trim() ? 'pointer' : 'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                    {goalSaving ? 'Saving...' : 'Add Goal'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Assign form modal */}
        {showAssignForm && (
          <div onClick={()=>setShowAssignForm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:440, padding:28 }}>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>📝 Send a Form</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>
                Assign a form to {client?.profile?.full_name} — they'll see it in their client dashboard.
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Choose Form *</div>
                <select value={assignFormId} onChange={e=>setAssignFormId(e.target.value)}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:assignFormId?t.text:t.textMuted, outline:'none', fontFamily:"'DM Sans',sans-serif", appearance:'none' as any, colorScheme:'dark', boxSizing:'border-box' as any }}>
                  <option value="">Select a form...</option>
                  {forms.map(f => <option key={f.id} value={f.id} style={{ background:t.surfaceHigh }}>{f.title}{f.is_default?' (default)':''}</option>)}
                </select>
                {forms.length === 0 && (
                  <div style={{ fontSize:12, color:t.orange, marginTop:6 }}>
                    No forms yet. <span onClick={()=>router.push('/dashboard/coach/onboarding')} style={{ cursor:'pointer', textDecoration:'underline' }}>Create one first →</span>
                  </div>
                )}
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Note to Client (optional)</div>
                <input value={assignNote} onChange={e=>setAssignNote(e.target.value)} placeholder="e.g. Please fill this out before our next session"
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any }} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowAssignForm(false)}
                  style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={assignForm} disabled={!assignFormId || assigning || assignedDone}
                  style={{ flex:2, background:assignedDone?t.green:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:assignedDone?'#000':'#fff', cursor:!assignFormId||assigning||assignedDone?'not-allowed':'pointer', opacity:!assignFormId||assigning?0.5:1, fontFamily:"'DM Sans',sans-serif", transition:'background .3s' }}>
                  {assignedDone ? '✓ Form Sent!' : assigning ? 'Sending...' : '📝 Send Form'}
                </button>
              </div>
            </div>
          </div>
        )}



          {/* INTAKE TAB */}
          {activeTab === 'intake' && (
            <div style={{ paddingBottom:32 }}>
              <div style={{ fontSize:20, fontWeight:900, marginBottom:4 }}>Intake Profile</div>
              <div style={{ fontSize:13, color:'#5a5a78', marginBottom:24 }}>
                {intake?.intake_completed_at
                  ? `Completed ${new Date(intake.intake_completed_at).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}`
                  : 'Not yet completed'}
              </div>

              {!intake ? (
                <div style={{ background:'#161624', border:'1px solid #252538', borderRadius:14, padding:32, textAlign:'center', color:'#5a5a78' }}>
                  Client has not completed intake yet.
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                  {/* Personal */}
                  <IntakeSection title="Personal Info" color="#00c9b1">
                    <IntakeRow label="Date of Birth"    value={intake.date_of_birth} />
                    <IntakeRow label="Phone"            value={intake.phone} />
                    <IntakeRow label="Gender"           value={intake.gender} />
                    <IntakeRow label="Pronouns"         value={intake.pronouns} />
                    <IntakeRow label="Timezone"         value={intake.timezone} />
                  </IntakeSection>

                  {/* Stats */}
                  <IntakeSection title="Starting Stats" color="#f5a623">
                    <IntakeRow label="Height"          value={intake.height_inches ? `${intake.height_inches}"` : null} />
                    <IntakeRow label="Starting Weight" value={intake.starting_weight_lbs ? `${intake.starting_weight_lbs} lbs` : null} />
                    <IntakeRow label="Current Weight"  value={intake.current_weight_lbs ? `${intake.current_weight_lbs} lbs` : null} />
                    <IntakeRow label="Goal Weight"     value={intake.goal_weight_lbs ? `${intake.goal_weight_lbs} lbs` : null} />
                    <IntakeRow label="Body Fat %"      value={intake.body_fat_pct ? `${intake.body_fat_pct}%` : null} />
                  </IntakeSection>

                  {/* Training */}
                  <IntakeSection title="Training Background" color="#8b5cf6">
                    <IntakeRow label="Experience"       value={intake.training_experience} />
                    <IntakeRow label="Days/Week"        value={intake.training_frequency ? `${intake.training_frequency} days` : null} />
                    <IntakeRow label="Preferred Days"   value={intake.preferred_days?.join(', ')} />
                    <IntakeRow label="Equipment"        value={intake.equipment_access?.join(', ')} />
                    <IntakeRow label="Cardio"           value={intake.cardio_preference} />
                    <IntakeRow label="Injuries"         value={intake.injuries_limitations} long />
                    <IntakeRow label="Past Injuries"    value={intake.past_injuries} long />
                  </IntakeSection>

                  {/* Goals */}
                  <IntakeSection title="Goals" color="#f5a623">
                    <IntakeRow label="Primary Goal"     value={intake.primary_goal} />
                    <IntakeRow label="Secondary Goal"   value={intake.secondary_goal} />
                    <IntakeRow label="Target Date"      value={intake.goal_target_date} />
                    <IntakeRow label="Motivation"       value={intake.motivation_why} long />
                    <IntakeRow label="Biggest Obstacle" value={intake.biggest_obstacle} long />
                  </IntakeSection>

                  {/* Lifestyle */}
                  <IntakeSection title="Lifestyle" color="#00c9b1">
                    <IntakeRow label="Activity Level"   value={intake.activity_level} />
                    <IntakeRow label="Avg Sleep"        value={intake.avg_sleep_hours ? `${intake.avg_sleep_hours} hrs` : null} />
                    <IntakeRow label="Stress Level"     value={intake.stress_level ? `${intake.stress_level} / 10` : null} />
                    <IntakeRow label="Alcohol"          value={intake.alcohol_frequency} />
                  </IntakeSection>

                  {/* Nutrition */}
                  <IntakeSection title="Nutrition" color="#22c55e">
                    <IntakeRow label="Dietary Approach"  value={intake.dietary_approach} />
                    <IntakeRow label="Allergies"         value={intake.allergies_restrictions} />
                    <IntakeRow label="Foods Disliked"    value={intake.foods_disliked} />
                    <IntakeRow label="Supplements"       value={intake.supplement_use} />
                  </IntakeSection>

                  {/* Health */}
                  <IntakeSection title="Health" color="#ef4444">
                    <IntakeRow label="Medical Conditions" value={intake.medical_conditions} long />
                    <IntakeRow label="Medications"        value={intake.current_medications} long />
                    <IntakeRow label="Surgeries"          value={intake.recent_surgeries} />
                  </IntakeSection>

                </div>
              )}
            </div>
          )}

        {/* Sticky save & back bar */}
        <div className="sticky-bar" style={{ position:'fixed', bottom:0, left:0, right:0, background:t.surface, borderTop:'1px solid '+t.border, padding:'12px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:50, backdropFilter:'blur(10px)', gap:10, flexWrap:'wrap' as const }}>
          <div style={{ fontSize:12, color:t.textMuted }}>
            Viewing {client?.profile?.full_name}'s profile
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <button onClick={()=>router.push('/dashboard/preview/'+clientId)}
              style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              👁️ Preview as Client
            </button>
            <button onClick={saveAndBack}
              style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ← Save & Back
            </button>
          </div>
        </div>


          {/* GOALS TAB */}
          {activeTab === 'goals' && (
            <div className="tab-content">
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>Client Goals</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>Set targets. Track progress. Celebrate wins.</div>
                </div>
                <button onClick={()=>setShowAddGoal(true)}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'9px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Add Goal
                </button>
              </div>

              {/* Goals list */}
              {goals.length === 0 ? (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'40px 20px', textAlign:'center' as const, color:t.textMuted }}>
                  <div style={{ fontSize:32, marginBottom:12 }}>🎯</div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No goals set yet</div>
                  <div style={{ fontSize:12, lineHeight:1.6 }}>Add a goal to give your client something concrete to work toward.</div>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  {goals.map((goal:any) => {
                    const pct = goal.target_value && goal.current_value
                      ? Math.min(100, Math.round((Number(goal.current_value) / Number(goal.target_value)) * 100))
                      : null
                    const isCompleted = goal.status === 'completed'
                    const isPast = goal.target_date && new Date(goal.target_date) < new Date() && !isCompleted
                    return (
                      <div key={goal.id} style={{ background:t.surface, border:'1px solid '+(isCompleted ? t.teal+'50' : isPast ? t.red+'30' : t.border), borderRadius:16, padding:18, opacity: isCompleted ? 0.8 : 1 }}>
                        <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom: pct !== null ? 14 : 0 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                              <div style={{ fontSize:14, fontWeight:800, color: isCompleted ? t.teal : t.text }}>
                                {isCompleted ? '\u2713 ' : ''}{goal.title}
                              </div>
                              {isPast && !isCompleted && (
                                <span style={{ fontSize:10, fontWeight:700, color:t.red, background:t.red+'15', borderRadius:20, padding:'2px 8px' }}>Overdue</span>
                              )}
                            </div>
                            {goal.description && (
                              <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5, marginBottom:6 }}>{goal.description}</div>
                            )}
                            <div style={{ display:'flex', gap:12, flexWrap:'wrap' as const }}>
                              {goal.target_value && (
                                <span style={{ fontSize:11, color:t.textDim }}>
                                  Target: <strong style={{color:t.text}}>{goal.target_value}{goal.unit ? ' '+goal.unit : ''}</strong>
                                  {goal.current_value ? <> · Now: <strong style={{color:t.teal}}>{goal.current_value}{goal.unit ? ' '+goal.unit : ''}</strong></> : null}
                                </span>
                              )}
                              {goal.target_date && (
                                <span style={{ fontSize:11, color: isPast ? t.red : t.textDim }}>
                                  📅 {new Date(goal.target_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                                </span>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                            {!isCompleted && (
                              <button onClick={async()=>{
                                const val = prompt('Update current value for ' + goal.title + ':')
                                if (val === null) return
                                const num = parseFloat(val)
                                if (isNaN(num)) return
                                await supabase.from('client_goals').update({ current_value: num, updated_at: new Date().toISOString() }).eq('id', goal.id)
                                setGoals(p => p.map(g => g.id === goal.id ? {...g, current_value: num} : g))
                              }}
                                style={{ padding:'6px 10px', borderRadius:8, border:'1px solid '+t.border, background:'transparent', color:t.textMuted, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                Update
                              </button>
                            )}
                            {!isCompleted && (
                              <button onClick={async()=>{
                                if (!confirm('Mark "' + goal.title + '" as complete?')) return
                                const now = new Date().toISOString()
                                await supabase.from('client_goals').update({ status:'completed', completed_at: now, current_value: goal.target_value, updated_at: now }).eq('id', goal.id)
                                // Fire milestone
                                await supabase.from('milestones').insert({ client_id: clientId, milestone_type:'goal', message: '🏆 Goal achieved: ' + goal.title + '!', seen: false })
                                setGoals(p => p.map(g => g.id === goal.id ? {...g, status:'completed', completed_at: now} : g))
                              }}
                                style={{ padding:'6px 10px', borderRadius:8, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:11, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                ✓ Done
                              </button>
                            )}
                            <button onClick={async()=>{
                              if (!confirm('Delete this goal?')) return
                              await supabase.from('client_goals').delete().eq('id', goal.id)
                              setGoals(p => p.filter(g => g.id !== goal.id))
                            }}
                              style={{ padding:'6px 10px', borderRadius:8, border:'1px solid '+t.red+'30', background:t.red+'10', color:t.red, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        {pct !== null && (
                          <div>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginBottom:4 }}>
                              <span>Progress</span>
                              <span style={{ fontWeight:700, color: pct >= 100 ? t.teal : t.text }}>{pct}%</span>
                            </div>
                            <div style={{ height:6, borderRadius:4, background:t.surfaceHigh, overflow:'hidden' }}>
                              <div style={{ height:'100%', width: pct+'%', borderRadius:4, background: pct>=100 ? t.teal : 'linear-gradient(90deg,'+t.orange+','+t.yellow+')', transition:'width 0.4s ease' }}/>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

        {/* ── DAILY PULSE TAB ── */}
        {activeTab === 'pulse' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>Daily Morning Pulse</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Sleep quality, energy, mood and journal entries logged daily. Last 30 days.</div>
            {dailyPulse.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'48px 20px', textAlign:'center' as const, color:t.textMuted, fontSize:13 }}>
                No morning pulse data yet — client logs this from their Home tab each day.
              </div>
            ) : (<>
              {/* Summary stat tiles */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
                {([
                  { key:'sleep_quality', label:'Sleep',  color:t.purple,  unit:'★', max:5 },
                  { key:'energy_score',  label:'Energy', color:t.yellow,  unit:'⚡', max:5 },
                ] as { key:string, label:string, color:string, unit:string, max:number }[]).map(({ key, label, color, unit, max }) => {
                  const vals = dailyPulse.map((d:any) => d[key]).filter((v:any) => v != null)
                  if (!vals.length) return null
                  const latest = vals[0]
                  const avg = +(vals.reduce((a:number,b:number)=>a+b,0)/vals.length).toFixed(1)
                  const trend = vals.length > 1 ? +(vals[0]-vals[1]).toFixed(1) : 0
                  return (
                    <div key={key} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>{label}</div>
                      <div style={{ display:'flex', gap:2, marginBottom:4 }}>
                        {Array.from({length:max}).map((_,i) => (
                          <span key={i} style={{ fontSize:16, opacity: i < latest ? 1 : 0.2 }}>{unit}</span>
                        ))}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ fontSize:11, color:t.textMuted }}>avg {avg}/{max}</div>
                        {trend !== 0 && <div style={{ fontSize:11, fontWeight:700, color:trend>0?t.green:t.red }}>{trend>0?'+':''}{trend}</div>}
                      </div>
                    </div>
                  )
                })}
                {/* Mood distribution */}
                {(() => {
                  const moods = dailyPulse.map((d:any) => d.mood_emoji).filter(Boolean)
                  if (!moods.length) return null
                  const counts: Record<string,number> = {}
                  moods.forEach((m:string) => counts[m] = (counts[m]||0)+1)
                  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1])[0]
                  return (
                    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>Mood (most common)</div>
                      <div style={{ fontSize:32, marginBottom:4 }}>{top[0]}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{top[1]}x this month</div>
                    </div>
                  )
                })()}
                {/* Journal entries this month */}
                {(() => {
                  const withJournal = dailyPulse.filter((d:any) => d.body && !d.is_private)
                  return (
                    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>Shared Journal</div>
                      <div style={{ fontSize:22, fontWeight:900, color:t.teal, marginBottom:2 }}>{withJournal.length}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>entries shared</div>
                    </div>
                  )
                })()}
              </div>

              {/* Charts */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Sleep & Energy Trend</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={[...dailyPulse].reverse()} margin={{ top:5, right:10, left:0, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                    <XAxis dataKey="checkin_date" tick={{ fill:t.textMuted, fontSize:10 }} tickFormatter={(v:string)=>new Date(v+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'})} axisLine={false} tickLine={false} />
                    <YAxis domain={[0,5]} ticks={[1,2,3,4,5]} tick={{ fill:t.textMuted, fontSize:10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text, fontSize:12 }} />
                    <Legend wrapperStyle={{ paddingTop:10, color:t.textMuted, fontSize:12 }} />
                    <Line type="monotone" dataKey="sleep_quality" name="Sleep ★" stroke={t.purple} strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="energy_score"  name="Energy ⚡" stroke={t.yellow} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Raw log table */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Daily Log</div>
                <div style={{ overflowX:'auto' as const }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid '+t.border }}>
                      {['Date','Sleep','Energy','Mood','Journal'].map(h=>(
                        <th key={h} style={{ padding:'6px 10px', color:t.textMuted, fontWeight:700, textAlign:'left' as const }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{dailyPulse.map((d:any)=>(
                      <tr key={d.id} style={{ borderBottom:'1px solid '+t.border+'44' }}>
                        <td style={{ padding:'8px 10px', color:t.teal, fontWeight:600 }}>{new Date(d.checkin_date+'T00:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</td>
                        <td style={{ padding:'8px 10px', color:t.purple }}>{d.sleep_quality ? '★'.repeat(d.sleep_quality)+'☆'.repeat(5-d.sleep_quality) : '—'}</td>
                        <td style={{ padding:'8px 10px', color:t.yellow }}>{d.energy_score ? '⚡'.repeat(d.energy_score) : '—'}</td>
                        <td style={{ padding:'8px 10px', fontSize:18 }}>{d.mood_emoji ?? '—'}</td>
                        <td style={{ padding:'8px 10px', color:t.textDim, maxWidth:300, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                          {d.is_private ? <span style={{ color:t.textMuted, fontStyle:'italic' }}>🔒 Private</span> : d.body ? d.body : '—'}
                        </td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </>)}
          </div>
        )}

        {/* ── JOURNAL TAB ── */}
        {activeTab === 'pulse' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>Client Journal</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Only entries the client marked "Visible to Coach" appear here. Private entries are never shown.</div>
            {journalEntries.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'48px 20px', textAlign:'center' as const }}>
                <div style={{ fontSize:32, marginBottom:10 }}>🔒</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No shared entries yet</div>
                <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.6 }}>When the client shares a journal entry it will appear here.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {journalEntries.map((entry:any) => (
                  <div key={entry.id} style={{ background:t.surface, border:'1px solid '+t.teal+'30', borderRadius:16, padding:'18px 20px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:13, fontWeight:800, color:t.teal }}>
                        {new Date(entry.entry_date+'T00:00:00').toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})}
                      </div>
                      <div style={{ fontSize:11, color:t.teal, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:20, padding:'3px 10px' }}>
                        Shared with you
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:t.textDim, lineHeight:1.7, whiteSpace:'pre-wrap' as const }}>{entry.body}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom padding for sticky bar */}
        <div style={{ height:64 }} />
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


// ── CoachMetricsTab ───────────────────────────────────────────────────────
function CoachMetricsTab({ metrics, t }: { metrics: any[], t: any }) {
  const [activeChart, setActiveChart] = useState<'weight'|'bodyfat'|'measurements'>('weight')

  if (metrics.length === 0) return (
    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center' }}>
      <div style={{ fontSize:32, marginBottom:12 }}>📈</div>
      <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No metrics yet</div>
      <div style={{ fontSize:13, color:t.textMuted }}>Metrics will appear here once the client logs them</div>
    </div>
  )

  const sorted = [...metrics].sort((a,b) => a.logged_date.localeCompare(b.logged_date))
  const fmt = (d: string) => new Date(d+'T00:00:00').toLocaleDateString('en-US', { month:'short', day:'numeric' })

  const chartData = sorted.map(m => ({
    date: fmt(m.logged_date),
    weight: m.weight ?? null,
    body_fat: m.body_fat ?? null,
    waist: m.waist ?? null,
    hips: m.hips ?? null,
    chest: m.chest ?? null,
    left_arm: m.left_arm ?? null,
    right_arm: m.right_arm ?? null,
  }))

  const MCOLORS: Record<string, string> = {
    waist: t.teal, hips: t.pink, chest: '#60a5fa', left_arm: t.green, right_arm: t.purple,
  }

  const latest = sorted[sorted.length - 1]
  const first  = sorted[0]
  const wChange = latest?.weight && first?.weight ? +(latest.weight - first.weight).toFixed(1) : null
  const bfChange = latest?.body_fat && first?.body_fat ? +(latest.body_fat - first.body_fat).toFixed(1) : null

  const TABS = [
    { id: 'weight',       label: 'Weight',       color: t.teal   },
    { id: 'bodyfat',      label: 'Body Fat',     color: t.orange  },
    { id: 'measurements', label: 'Measurements', color: t.purple  },
  ] as const

  const tooltipStyle = {
    contentStyle: { background: t.surfaceHigh, border: '1px solid '+t.border, borderRadius: 10, color: t.text, fontSize: 12 },
    cursor: { stroke: t.border },
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Summary stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(130px, 1fr))', gap:10 }}>
        {[
          { label:'Current Weight', val: latest?.weight ? latest.weight+' lbs' : '—', color: t.teal },
          { label:'Weight Change', val: wChange !== null ? (wChange > 0 ? '+' : '')+wChange+' lbs' : '—', color: wChange !== null ? (wChange < 0 ? t.green : t.red) : t.textMuted },
          { label:'Body Fat', val: latest?.body_fat ? latest.body_fat+'%' : '—', color: t.orange },
          { label:'BF% Change', val: bfChange !== null ? (bfChange > 0 ? '+' : '')+bfChange+'%' : '—', color: bfChange !== null ? (bfChange < 0 ? t.green : t.red) : t.textMuted },
          { label:'Entries', val: metrics.length, color: t.purple },
        ].map(s => (
          <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
        <div style={{ display:'flex', gap:6, marginBottom:18, flexWrap:'wrap' }}>
          {TABS.map(tab => (
            <button key={tab.id} onClick={()=>setActiveChart(tab.id)}
              style={{ padding:'6px 14px', borderRadius:20, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:600, fontFamily:"'DM Sans',sans-serif", transition:'all .15s',
                borderColor: activeChart===tab.id ? tab.color : t.border,
                background:  activeChart===tab.id ? tab.color+'22' : 'transparent',
                color:       activeChart===tab.id ? tab.color : t.textMuted }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeChart === 'weight' && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} unit=" lbs" />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="weight" stroke={t.teal} strokeWidth={2.5} dot={{ r:4, fill:t.teal }} connectNulls activeDot={{ r:6 }} name="Weight (lbs)" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeChart === 'bodyfat' && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} unit="%" />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="body_fat" stroke={t.orange} strokeWidth={2.5} dot={{ r:4, fill:t.orange }} connectNulls activeDot={{ r:6 }} name="Body Fat %" />
            </LineChart>
          </ResponsiveContainer>
        )}

        {activeChart === 'measurements' && (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} unit='"' />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ paddingTop:10, fontSize:11, color:t.textMuted }} />
              {(['waist','hips','chest','left_arm','right_arm'] as const).map(f => (
                <Line key={f} type="monotone" dataKey={f} stroke={MCOLORS[f]} strokeWidth={2} dot={{ r:3 }} connectNulls name={f.replace('_',' ')} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* History table */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', fontSize:12, fontWeight:700, color:t.textMuted, borderBottom:'1px solid '+t.border, textTransform:'uppercase', letterSpacing:'0.06em' }}>Raw Data</div>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:12 }}>
            <thead>
              <tr style={{ background:t.surfaceHigh }}>
                {['Date','Weight','BF%','Waist','Hips','Chest','L Arm','R Arm','Neck','Calves'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left' as const, fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...metrics].sort((a,b)=>b.logged_date.localeCompare(a.logged_date)).map((m, i) => (
                <tr key={m.id} style={{ borderTop:'1px solid '+t.border, background: i%2===0 ? 'transparent' : t.surfaceUp+'44' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600, color:t.textDim, whiteSpace:'nowrap' }}>{fmt(m.logged_date)}</td>
                  {[
                    m.weight     ? m.weight+'lbs'     : '—',
                    m.body_fat   ? m.body_fat+'%'     : '—',
                    m.waist      ? m.waist+'"'        : '—',
                    m.hips       ? m.hips+'"'         : '—',
                    m.chest      ? m.chest+'"'        : '—',
                    m.left_arm   ? m.left_arm+'"'     : '—',
                    m.right_arm  ? m.right_arm+'"'    : '—',
                    m.neck       ? m.neck+'"'         : '—',
                    m.calves     ? m.calves+'"'       : '—',
                  ].map((val, j) => (
                    <td key={j} style={{ padding:'10px 14px', fontWeight: val==='—' ? 400 : 700, color: val==='—' ? t.textMuted : t.orange }}>{val}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}


// ── FormsTab: coach view of assigned forms + check-in schedules ──────────
function FormsTab({ clientId, coachId, forms, onAssign, supabase, router, t }: any) {
  const [assignments, setAssignments] = useState<any[]>([])
  const [schedules,   setSchedules]   = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showSchedule, setShowSchedule] = useState(false)
  const [schedFormId,  setSchedFormId]  = useState('')
  const [schedFreq,    setSchedFreq]    = useState('weekly')
  const [schedNote,    setSchedNote]    = useState('')
  const [scheduling,   setScheduling]   = useState(false)

  const checkinForms = forms.filter((f: any) => f.form_type === 'check_in' || f.is_checkin_type)

  useEffect(() => {
    const load = async () => {
      const [{ data: asgns }, { data: scheds }] = await Promise.all([
        supabase.from('client_form_assignments').select('*, form:onboarding_forms(title, form_type, is_checkin_type)').eq('client_id', clientId).order('assigned_at', { ascending: false }),
        supabase.from('check_in_schedules').select('*, form:onboarding_forms(title)').eq('client_id', clientId).order('created_at'),
      ])
      setAssignments(asgns || [])
      setSchedules(scheds || [])
      setLoading(false)
    }
    load()
  }, [clientId])

  const saveSchedule = async () => {
    if (!schedFormId || !coachId) return
    setScheduling(true)
    const { data } = await supabase.from('check_in_schedules').upsert({
      coach_id: coachId, client_id: clientId, form_id: schedFormId,
      frequency: schedFreq, active: true, note: schedNote || null,
    }, { onConflict: 'client_id,form_id' }).select('*, form:onboarding_forms(title)').single()
    if (data) setSchedules(p => { const exists = p.find(s=>s.form_id===schedFormId); return exists ? p.map(s=>s.form_id===schedFormId?data:s) : [...p,data] })
    setScheduling(false)
    setShowSchedule(false)
    setSchedFormId(''); setSchedFreq('weekly'); setSchedNote('')
  }

  const deleteSchedule = async (id: string) => {
    await supabase.from('check_in_schedules').delete().eq('id', id)
    setSchedules(p => p.filter(s => s.id !== id))
  }

  const deleteAssignment = async (id: string) => {
    await supabase.from('client_form_assignments').delete().eq('id', id)
    setAssignments(p => p.filter(a => a.id !== id))
  }

  const sty = { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const, boxSizing:'border-box' as const, appearance:'none' as const }

  if (loading) return <div style={{ padding:'40px', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>

      {/* ── Check-in Schedules section ── */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:800 }}>✅ Check-in Schedule</div>
            <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>Recurring check-in forms sent on a schedule</div>
          </div>
          {checkinForms.length > 0 && (
            <button onClick={()=>setShowSchedule(true)}
              style={{ background:'linear-gradient(135deg,${t.purple},${t.purple}cc)', border:'none', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              + Schedule Check-in
            </button>
          )}
        </div>

        {checkinForms.length === 0 && (
          <div style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'14px 16px', fontSize:12, color:t.textMuted }}>
            No check-in forms yet. Go to <span onClick={()=>router.push('/dashboard/coach/onboarding')} style={{ color:t.teal, cursor:'pointer', textDecoration:'underline' }}>Form Builder</span> → create a form → toggle "Check-in Form" on.
          </div>
        )}

        {schedules.length > 0 && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {schedules.map((s: any) => (
              <div key={s.id} style={{ background:s.active ? t.purpleDim : t.surfaceUp, border:'1px solid '+(s.active ? t.purple+'40' : t.border), borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:20 }}>📅</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{s.form?.title}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2, textTransform:'capitalize' }}>{s.frequency} · {s.active ? 'Active' : 'Paused'}</div>
                  {s.note && <div style={{ fontSize:11, color:t.textDim, marginTop:2, fontStyle:'italic' }}>"{s.note}"</div>}
                </div>
                <button onClick={()=>deleteSchedule(s.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:7, padding:'5px 8px', fontSize:11, color:t.red, cursor:'pointer' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Schedule modal */}
        {showSchedule && (
          <div onClick={()=>setShowSchedule(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>📅 Schedule Check-in</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Client will be prompted on this schedule. A new form assignment is created each cycle.</div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Check-in Form *</label>
                <select value={schedFormId} onChange={e=>setSchedFormId(e.target.value)} style={sty}>
                  <option value="">Select a check-in form...</option>
                  {checkinForms.map((f: any) => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Frequency</label>
                <select value={schedFreq} onChange={e=>setSchedFreq(e.target.value)} style={sty}>
                  <option value="weekly">Weekly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Note (optional)</label>
                <input value={schedNote} onChange={e=>setSchedNote(e.target.value)} placeholder="e.g. Please fill this out every Monday morning" style={sty} />
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowSchedule(false)} style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                <button onClick={saveSchedule} disabled={!schedFormId||scheduling} style={{ flex:2, background:'linear-gradient(135deg,${t.purple},${t.purple}cc)', border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#fff', cursor:!schedFormId||scheduling?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!schedFormId||scheduling?.5:1 }}>
                  {scheduling ? 'Saving...' : '📅 Save Schedule'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── One-off form assignments ── */}
      <div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
          <div style={{ fontSize:14, fontWeight:800 }}>📝 Sent Forms ({assignments.length})</div>
          <button onClick={onAssign} style={{ background:'linear-gradient(135deg,${t.purple},${t.purple}cc)', border:'none', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Send Form</button>
        </div>

        {assignments.length === 0 ? (
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'40px', textAlign:'center' }}>
            <div style={{ fontSize:32, marginBottom:10 }}>📝</div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No forms sent yet</div>
            <div style={{ fontSize:12, color:t.textMuted }}>Send a one-off form — intake, waiver, survey, whatever you need.</div>
          </div>
        ) : assignments.map((a: any) => (
          <div key={a.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:a.status==='completed'?t.greenDim:t.purpleDim, border:'1px solid '+(a.status==='completed'?t.green:t.purple)+'40', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
              {a.status==='completed' ? '✅' : (a.form?.form_type === 'check_in' || a.form?.is_checkin_type) ? '📋' : '📝'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>{a.form?.title}</div>
              <div style={{ fontSize:11, color:t.textMuted }}>
                Sent {new Date(a.assigned_at).toLocaleDateString()} · {a.status==='completed' ? <span style={{ color:t.green }}>Completed {new Date(a.completed_at).toLocaleDateString()}</span> : <span style={{ color:t.orange }}>Pending</span>}
              </div>
              {a.note && <div style={{ fontSize:11, color:t.textDim, fontStyle:'italic' }}>"{a.note}"</div>}
            </div>
            <button onClick={()=>deleteAssignment(a.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:7, padding:'5px 8px', fontSize:11, color:t.red, cursor:'pointer' }}>✕</button>
          </div>
        ))}
      </div>
    </div>
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
        .or('and(sender_id.eq.${coachId},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${coachId})')
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
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'messages', filter:'recipient_id=eq.${coachId}' }, (payload) => {
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
        <a href={'/dashboard/coach/messages?client=${client.id}'}
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
          placeholder={'Message '+(client.profile?.full_name?.split(' ')[0] || 'client')+'...'}
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

// ── ProgramTab ────────────────────────────────────────────────────────────
function ProgramTab({ clientId, coachId, program, workouts, supabase, router, t, onProgramChange }: any) {
  const [clientPrograms, setClientPrograms] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string|null>(null)
  const [editName, setEditName] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string|null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [assignId, setAssignId] = useState('')
  const [assigning, setAssigning] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  // Start date + scheduling
  const [startDates, setStartDates] = useState<Record<string,string>>({})
  const [scheduling, setScheduling] = useState<string|null>(null)
  const [scheduleMode, setScheduleMode] = useState<Record<string,'add'|'replace'>>({})
  const [scheduleDone, setScheduleDone] = useState<string|null>(null)

  const load = async () => {
    const { data: clientProgs } = await supabase.from('programs')
      .select('id, name, goal, duration_weeks, difficulty, status, created_at, active, start_date')
      .eq('client_id', clientId).eq('is_template', false)
      .order('created_at', { ascending: false })
    setClientPrograms(clientProgs || [])
    // Pre-fill start dates
    const dates: Record<string,string> = {}
    for (const p of (clientProgs || [])) {
      if (p.start_date) dates[p.id] = p.start_date
    }
    setStartDates(dates)
    const { data: tmpl } = await supabase.from('programs')
      .select('id, name, goal, duration_weeks')
      .eq('coach_id', coachId).eq('is_template', true)
      .order('name')
    setTemplates(tmpl || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [clientId])

  const saveRename = async (id: string) => {
    if (!editName.trim()) return
    setEditSaving(true)
    await supabase.from('programs').update({ name: editName.trim() }).eq('id', id)
    setClientPrograms(prev => prev.map(p => p.id === id ? { ...p, name: editName.trim() } : p))
    if (program?.id === id) onProgramChange({ ...program, name: editName.trim() })
    setEditingId(null)
    setEditSaving(false)
  }

  const saveStartDate = async (id: string, date: string) => {
    await supabase.from('programs').update({ start_date: date || null }).eq('id', id)
    setClientPrograms(prev => prev.map(p => p.id === id ? { ...p, start_date: date } : p))
  }

  const scheduleProgram = async (progId: string) => {
    const startDate = startDates[progId]
    if (!startDate) return
    setScheduling(progId)
    const mode = scheduleMode[progId] || 'add'

    // Fetch blocks for this program
    const { data: blocks } = await supabase.from('workout_blocks')
      .select('*, block_exercises(*)')
      .eq('program_id', progId)
      .order('week_number').order('order_index')

    const { data: { user } } = await supabase.auth.getUser()

    // Delete old assigned sessions if replace mode
    if (mode === 'replace') {
      const { data: oldSessions } = await supabase.from('workout_sessions').select('id')
        .eq('program_id', progId).eq('status', 'assigned')
      for (const sess of (oldSessions || [])) {
        await supabase.from('session_exercises').delete().eq('session_id', sess.id)
      }
      await supabase.from('workout_sessions').delete().eq('program_id', progId).eq('status', 'assigned')
    }

    // Calculate week start (Monday of the start date's week)
    const start = new Date(startDate + 'T12:00:00')
    const dayOfWeek = start.getDay()
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const weekStart = new Date(start)
    weekStart.setDate(weekStart.getDate() + diffToMonday)

    const DAY_OFFSETS: Record<string,number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 }
    const sessionsToInsert: any[] = []

    for (const block of (blocks || [])) {
      if (!block.day_of_week || !(block.day_of_week in DAY_OFFSETS)) continue
      const weekOffset = (block.week_number - 1) * 7
      const dayOffset = DAY_OFFSETS[block.day_of_week]
      const sessionDate = new Date(weekStart)
      sessionDate.setDate(sessionDate.getDate() + weekOffset + dayOffset)
      sessionsToInsert.push({
        client_id: clientId,
        program_id: progId,
        block_id: block.id,
        coach_id: user?.id,
        title: block.day_label || block.name,
        scheduled_date: sessionDate.toISOString().split('T')[0],
        date: sessionDate.toISOString().split('T')[0],
        status: 'assigned',
        week_number: block.week_number,
        day_label: block.day_of_week,
      })
    }

    if (sessionsToInsert.length > 0) {
      const { data: insertedSessions } = await supabase.from('workout_sessions').insert(sessionsToInsert).select()
      // Populate session_exercises from each block
      for (const session of (insertedSessions || [])) {
        const block = (blocks || []).find((b:any) => b.id === session.block_id)
        const exes = (block?.block_exercises || []).sort((a:any,b:any) => a.order_index - b.order_index)
        if (exes.length === 0) continue
        await supabase.from('session_exercises').insert(
          exes.map((ex:any) => ({
            session_id: session.id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise?.name || '',
            sets_prescribed: ex.sets || 3,
            reps_prescribed: ex.reps || '',
            weight_prescribed: ex.target_weight || '',
            rest_seconds: ex.rest_seconds || null,
            notes_coach: ex.notes || null,
            order_index: ex.order_index,
          }))
        )
      }
      // Save the start date on the program
      await saveStartDate(progId, startDate)
    }

    setScheduling(null)
    setScheduleDone(progId)
    setTimeout(() => setScheduleDone(null), 3000)
  }

  const deleteProgram = async (id: string) => {
    setDeleting(true)
    const { data: sessions } = await supabase.from('workout_sessions').select('id').eq('program_id', id)
    for (const sess of (sessions || [])) {
      await supabase.from('session_exercises').delete().eq('session_id', sess.id)
      await supabase.from('exercise_sets').delete().eq('session_id', sess.id)
    }
    await supabase.from('workout_sessions').delete().eq('program_id', id)
    const { data: blocks } = await supabase.from('workout_blocks').select('id').eq('program_id', id)
    for (const b of (blocks || [])) {
      await supabase.from('block_exercises').delete().eq('block_id', b.id)
    }
    await supabase.from('workout_blocks').delete().eq('program_id', id)
    await supabase.from('programs').delete().eq('id', id)
    setClientPrograms(prev => prev.filter(p => p.id !== id))
    if (program?.id === id) onProgramChange(null)
    setDeleteConfirm(null)
    setDeleting(false)
  }

  const assignProgram = async () => {
    if (!assignId) return
    setAssigning(true)
    await supabase.from('programs').update({ client_id: null }).eq('client_id', clientId).neq('id', assignId)
    await supabase.from('programs').update({ client_id: clientId }).eq('id', assignId)
    const { data: newProg } = await supabase.from('programs').select('*').eq('id', assignId).single()
    onProgramChange(newProg)
    await load()
    setShowAssign(false)
    setAssignId('')
    setAssigning(false)
  }

  const createFromTemplate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const srcId = assignId
    const { data: newProg } = await supabase.from('programs').insert({
      coach_id: coachId, client_id: clientId,
      name: newName.trim(), is_template: false, status: 'active',
    }).select().single()
    if (newProg && srcId) {
      const { data: srcBlocks } = await supabase.from('workout_blocks')
        .select('*, block_exercises(*)')
        .eq('program_id', srcId)
      for (const b of (srcBlocks || [])) {
        const { data: nb } = await supabase.from('workout_blocks').insert({
          program_id: newProg.id, name: b.name, day_label: b.day_label,
          week_number: b.week_number, order_index: b.order_index,
          day_of_week: b.day_of_week, group_types: b.group_types || {},
        }).select().single()
        if (nb) {
          for (const ex of (b.block_exercises || [])) {
            await supabase.from('block_exercises').insert({
              block_id: nb.id, exercise_id: ex.exercise_id,
              sets: ex.sets, reps: ex.reps, target_weight: ex.target_weight,
              rest_seconds: ex.rest_seconds, rpe: ex.rpe, notes: ex.notes,
              order_index: ex.order_index, exercise_role: ex.exercise_role,
            })
          }
        }
      }
    }
    if (newProg) onProgramChange(newProg)
    await load()
    setShowCreate(false)
    setNewName('')
    setAssignId('')
    setCreating(false)
  }

  if (loading) return <div style={{ color:t.textMuted, fontSize:13, padding:20 }}>Loading programs...</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Header actions */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800 }}>Programs</div>
          <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>
            {clientPrograms.length} program{clientPrograms.length !== 1 ? 's' : ''} for this client
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>{ setShowAssign(true); setShowCreate(false) }}
            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Assign Template
          </button>
          <button onClick={()=>{ setShowCreate(true); setShowAssign(false) }}
            style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Program
          </button>
        </div>
      </div>

      {/* Assign template panel */}
      {showAssign && (
        <div style={{ background:t.surface, border:'1px solid '+t.teal+'40', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>Assign a template to this client</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>Creates a copy of the template for this client. Changes won't affect the original.</div>
          <select value={assignId} onChange={e=>setAssignId(e.target.value)}
            style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const, marginBottom:10 }}>
            <option value="">— Choose a template —</option>
            {templates.map(p => <option key={p.id} value={p.id}>📐 {p.name}{p.goal ? ' · '+p.goal : ''}</option>)}
            {templates.length === 0 && <option disabled>No templates yet — create one in Programs</option>}
          </select>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>setShowAssign(false)}
              style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:9, padding:'9px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Cancel
            </button>
            <button onClick={assignProgram} disabled={!assignId || assigning}
              style={{ flex:2, background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:9, padding:'9px', fontSize:12, fontWeight:800, color:'#000', cursor:!assignId||assigning?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!assignId||assigning?0.5:1 }}>
              {assigning ? 'Assigning...' : '✓ Assign Template'}
            </button>
          </div>
        </div>
      )}

      {/* Create new program panel */}
      {showCreate && (
        <div style={{ background:t.surface, border:'1px solid '+t.orange+'40', borderRadius:14, padding:18 }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:10 }}>Create new program for this client</div>
          <div style={{ marginBottom:10 }}>
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Program Name *</div>
            <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. Phase 1 — Strength Foundation"
              style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const, boxSizing:'border-box' as const }} />
          </div>
          <div style={{ marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Start from template (optional)</div>
            <select value={assignId} onChange={e=>setAssignId(e.target.value)}
              style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}>
              <option value="">— Start blank —</option>
              {templates.map(p => <option key={p.id} value={p.id}>📐 {p.name}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{ setShowCreate(false); setNewName(''); setAssignId('') }}
              style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:9, padding:'9px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Cancel
            </button>
            <button onClick={createFromTemplate} disabled={!newName.trim() || creating}
              style={{ flex:2, background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, border:'none', borderRadius:9, padding:'9px', fontSize:12, fontWeight:800, color:'#000', cursor:!newName.trim()||creating?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newName.trim()||creating?0.5:1 }}>
              {creating ? 'Creating...' : '✓ Create Program'}
            </button>
          </div>
        </div>
      )}

      {/* Program cards */}
      {clientPrograms.length === 0 ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px 20px', textAlign:'center' as const }}>
          <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No programs yet</div>
          <div style={{ fontSize:13, color:t.textMuted }}>Create a new program or assign a template above.</div>
        </div>
      ) : clientPrograms.map((p: any) => {
        const isActive = program?.id === p.id
        const isEditing = editingId === p.id
        const isDeleteConfirm = deleteConfirm === p.id
        const isScheduling = scheduling === p.id
        const isDone = scheduleDone === p.id
        const currentStartDate = startDates[p.id] || ''
        const currentMode = scheduleMode[p.id] || 'add'

        return (
          <div key={p.id} style={{ background:t.surface, border:'1px solid '+(isActive ? t.teal+'60' : t.border), borderRadius:16, overflow:'hidden' }}>
            {isActive && <div style={{ height:3, background:`linear-gradient(90deg,${t.teal},${t.orange})` }} />}
            <div style={{ padding:18 }}>

              {/* Name row */}
              <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                <div style={{ flex:1 }}>
                  {isEditing ? (
                    <input autoFocus value={editName} onChange={e=>setEditName(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter') saveRename(p.id); if(e.key==='Escape') setEditingId(null) }}
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.orange+'60', borderRadius:8, padding:'7px 10px', fontSize:14, fontWeight:700, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const }} />
                  ) : (
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{p.name}</div>
                      {isActive && <span style={{ fontSize:10, fontWeight:800, color:t.teal, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:20, padding:'2px 8px' }}>ACTIVE</span>}
                    </div>
                  )}
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:3 }}>
                    {[p.goal, p.duration_weeks ? p.duration_weeks+'w' : null, p.difficulty].filter(Boolean).join(' · ') || 'No details set'}
                  </div>
                </div>

                {/* Action buttons */}
                <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' as const, justifyContent:'flex-end' }}>
                  {isEditing ? (
                    <>
                      <button onClick={()=>saveRename(p.id)} disabled={editSaving}
                        style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'5px 12px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        {editSaving ? '...' : '✓ Save'}
                      </button>
                      <button onClick={()=>setEditingId(null)}
                        style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:7, padding:'5px 10px', fontSize:11, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      {!isActive && (
                        <button onClick={async ()=>{
                          await supabase.from('programs').update({ client_id: null }).eq('client_id', clientId).neq('id', p.id)
                          await supabase.from('programs').update({ client_id: clientId }).eq('id', p.id)
                          const { data: newProg } = await supabase.from('programs').select('*').eq('id', p.id).single()
                          onProgramChange(newProg)
                          await load()
                        }}
                          style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          Set Active
                        </button>
                      )}
                      <button onClick={()=>router.push('/dashboard/coach/programs/'+p.id)}
                        style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        ✏️ Edit Program
                      </button>
                      <button onClick={()=>{ setEditingId(p.id); setEditName(p.name) }}
                        style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:7, padding:'5px 10px', fontSize:11, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Rename
                      </button>
                      <button onClick={()=>setDeleteConfirm(p.id)}
                        style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'5px 10px', fontSize:11, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        🗑
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* ── Schedule Section ── */}
              <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px' }}>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:10 }}>Schedule Sessions</div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
                  {/* Start date */}
                  <div>
                    <div style={{ fontSize:11, color:t.textMuted, marginBottom:4 }}>Start Date</div>
                    <input type="date"
                      value={currentStartDate}
                      onChange={e => setStartDates(prev => ({ ...prev, [p.id]: e.target.value }))}
                      style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }} />
                    <div style={{ fontSize:10, color:t.textMuted, marginTop:3 }}>Week 1 starts on the Monday of this week</div>
                  </div>

                  {/* Mode toggle */}
                  <div>
                    <div style={{ fontSize:11, color:t.textMuted, marginBottom:4 }}>If sessions exist</div>
                    <div style={{ display:'flex', gap:6 }}>
                      {(['add','replace'] as const).map(mode => (
                        <button key={mode} onClick={()=>setScheduleMode(prev=>({...prev,[p.id]:mode}))}
                          style={{ flex:1, padding:'8px 4px', borderRadius:8, border:'1px solid '+(currentMode===mode?t.teal+'60':t.border), background:currentMode===mode?t.tealDim:'transparent', fontSize:11, fontWeight:700, color:currentMode===mode?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          {mode === 'add' ? '➕ Add' : '🔄 Replace'}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize:10, color:t.textMuted, marginTop:3 }}>
                      {currentMode === 'replace' ? 'Removes existing assigned sessions first' : 'Keeps existing sessions'}
                    </div>
                  </div>
                </div>

                {/* Schedule button */}
                {isDone ? (
                  <div style={{ background:t.greenDim, border:'1px solid '+t.green+'40', borderRadius:9, padding:'10px 14px', fontSize:13, fontWeight:700, color:t.green, textAlign:'center' as const }}>
                    ✓ Sessions scheduled!
                  </div>
                ) : (
                  <button onClick={()=>scheduleProgram(p.id)} disabled={!currentStartDate || isScheduling}
                    style={{ width:'100%', background:currentStartDate?`linear-gradient(135deg,${t.orange},${t.orange}cc)`:'transparent', border:'1px solid '+(currentStartDate?'transparent':t.border), borderRadius:9, padding:'10px', fontSize:13, fontWeight:800, color:currentStartDate?'#000':t.textMuted, cursor:!currentStartDate||isScheduling?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!currentStartDate?0.5:1 }}>
                    {isScheduling ? '⏳ Scheduling...' : currentStartDate ? '📤 Schedule Sessions' : 'Set a start date first'}
                  </button>
                )}
              </div>

              {/* Delete confirm */}
              {isDeleteConfirm && (
                <div style={{ marginTop:12, background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:t.red, marginBottom:10 }}>
                    Delete "{p.name}"? This removes all workout sessions too. Cannot be undone.
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <button onClick={()=>setDeleteConfirm(null)}
                      style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:8, padding:'8px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Cancel
                    </button>
                    <button onClick={()=>deleteProgram(p.id)} disabled={deleting}
                      style={{ flex:2, background:t.red, border:'none', borderRadius:8, padding:'8px', fontSize:12, fontWeight:800, color:'#fff', cursor:deleting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:deleting?0.7:1 }}>
                      {deleting ? 'Deleting...' : '🗑 Yes, Delete'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {/* Recent workout sessions */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Recent Workout Sessions</div>
        {workouts.length > 0 ? workouts.slice(0,10).map((w:any, i:number) => (
          <div key={w.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i < Math.min(workouts.length,10)-1 ? '1px solid '+t.border : 'none' }}>
            <div style={{ width:34, height:34, borderRadius:9, background: w.status==='completed' ? t.greenDim : t.orangeDim, border:'1px solid '+(w.status==='completed'?t.green:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>
              {w.status==='completed' ? '✅' : '💪'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:600 }}>{w.title || w.name || 'Workout'}</div>
              <div style={{ fontSize:11, color:t.textMuted }}>{new Date(w.scheduled_date || w.created_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' })}</div>
            </div>
            <div style={{ fontSize:11, fontWeight:700, color: w.status==='completed' ? t.green : t.orange, textTransform:'capitalize' as const }}>{w.status}</div>
          </div>
        )) : (
          <div style={{ textAlign:'center' as const, padding:'20px 0', color:t.textMuted, fontSize:13 }}>No workout sessions yet</div>
        )}
      </div>
    </div>
  )
}

// ── Intake display helpers ──────────────────────────────────────────────────
function IntakeSection({ title, color, children }: { title:string, color:string, children:React.ReactNode }) {
  return (
    <div style={{ background:'#0f0f1a', border:`1px solid ${color}25`, borderRadius:14, overflow:'hidden' }}>
      <div style={{ background:`${color}15`, padding:'10px 16px', fontSize:11, fontWeight:800, color, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>{title}</div>
      <div style={{ padding:'12px 16px', display:'flex', flexDirection:'column', gap:8 }}>{children}</div>
    </div>
  )
}
function IntakeRow({ label, value, long=false }: { label:string, value:any, long?:boolean }) {
  if (value === null || value === undefined || value === '') return null
  const display = Array.isArray(value) ? value.join(', ') : String(value)
  return (
    <div style={{ display: long ? 'block' : 'flex', gap:8, alignItems:'baseline' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase' as const, letterSpacing:'0.05em', minWidth:140, flexShrink:0, marginBottom: long ? 3 : 0 }}>{label}</div>
      <div style={{ fontSize:13, color:'#eeeef8', lineHeight:1.6 }}>{display}</div>
    </div>
  )
}
