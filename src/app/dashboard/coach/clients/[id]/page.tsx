'use client'

import { useState, useEffect, useRef } from 'react'
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
  { id:'overview',   label:'Overview',   icon:'👤' },
  { id:'program',    label:'Program',    icon:'💪' },
  { id:'nutrition',  label:'Nutrition',  icon:'🥗' },
  { id:'checkins',   label:'Check-ins',  icon:'✅' },
  { id:'pulse',      label:'Daily Pulse',icon:'🧠' },
  { id:'journal',    label:'Journal',    icon:'✍️' },
  { id:'metrics',    label:'Metrics',    icon:'📈' },
  { id:'forms',      label:'Forms',      icon:'📝' },
  { id:'messages',   label:'Messages',   icon:'💬' },
]


export default function ClientDetail() {
  const [coachId,  setCoachId]  = useState<string | null>(null)
  const [client,   setClient]   = useState<any>(null)
  const [checkins, setCheckins] = useState<any[]>([])
  const [metrics,  setMetrics]  = useState<any[]>([])
  const [workouts, setWorkouts] = useState<any[]>([])
  const [nutritionPlan, setNutritionPlan] = useState<any>(null)
  const [program,       setProgram]       = useState<any>(null)
  const [dailyPulse,    setDailyPulse]    = useState<any[]>([])
  const [journalEntries,setJournalEntries]= useState<any[]>([])
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
      if (clientData?.coach_notes) setCoachNotes(clientData.coach_notes)

      // Load forms for assign form feature
      const { data: formData } = await supabase
        .from('onboarding_forms')
        .select('id,title,is_default,is_checkin_type')
        .eq('coach_id', user.id)
      setForms(formData || [])

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
        .eq('client_id', clientId)
        .eq('is_template', false)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      setProgram(programData || null)

      const { data: pulseData } = await supabase
        .from('daily_checkins').select('*')
        .eq('client_id', clientId)
        .order('checkin_date', { ascending: false }).limit(30)
      setDailyPulse(pulseData || [])

      const { data: journalData } = await supabase
        .from('journal_entries').select('*')
        .eq('client_id', clientId).eq('is_private', false)
        .order('entry_date', { ascending: false }).limit(30)
      setJournalEntries(journalData || [])

      setLoading(false)
    }
    load()
  }, [clientId])

  const [coachNotes, setCoachNotes] = useState('')
  const [notesSaved, setNotesSaved] = useState(false)
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

          {/* FORMS TAB */}
          {activeTab === 'forms' && (
            <FormsTab clientId={clientId} coachId={coachId!} forms={forms} onAssign={() => setShowAssignForm(true)} supabase={supabase} router={router} t={t} />
          )}

          {/* MESSAGES TAB */}
          {activeTab === 'messages' && client && (
            <MiniThread coachId={coachId!} client={client} />
          )}

        </div>


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
                  style={{ flex:2, background:assignedDone?t.green:`linear-gradient(135deg,${t.purple},${t.purple}cc)`, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:assignedDone?'#000':'#fff', cursor:!assignFormId||assigning||assignedDone?'not-allowed':'pointer', opacity:!assignFormId||assigning?.5:1, fontFamily:"'DM Sans',sans-serif", transition:'background .3s' }}>
                  {assignedDone ? '✓ Form Sent!' : assigning ? 'Sending...' : '📝 Send Form'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Sticky save & back bar */}
        <div style={{ position:'fixed', bottom:0, left:0, right:0, background:t.surface, borderTop:'1px solid '+t.border, padding:'12px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', zIndex:50, backdropFilter:'blur(10px)' }}>
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

        {/* ── DAILY PULSE TAB ── */}
        {activeTab === 'pulse' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>Daily Pulse</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Mood, stress, energy, sleep, steps and water logged daily. Last 30 days.</div>
            {dailyPulse.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'48px 20px', textAlign:'center' as const, color:t.textMuted, fontSize:13 }}>
                No daily check-in data yet — client logs this from their Home tab.
              </div>
            ) : (<>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(155px,1fr))', gap:12, marginBottom:20 }}>
                {([
                  { key:'mood_score',   label:'Mood',   color:t.pink,    unit:'' },
                  { key:'stress_score', label:'Stress', color:t.red,     unit:'' },
                  { key:'energy_score', label:'Energy', color:t.yellow,  unit:'' },
                  { key:'sleep_hours',  label:'Sleep',  color:t.purple,  unit:'h' },
                  { key:'steps',        label:'Steps',  color:t.teal,    unit:'' },
                  { key:'water_oz',     label:'Water',  color:'#38bdf8', unit:'oz' },
                ] as { key:string, label:string, color:string, unit:string }[]).map(({ key, label, color, unit }) => {
                  const vals = dailyPulse.map((d:any) => d[key]).filter((v:any) => v != null)
                  if (!vals.length) return null
                  const latest = vals[0]
                  const avg = +(vals.reduce((a:number,b:number)=>a+b,0)/vals.length).toFixed(1)
                  const trend = vals.length > 1 ? +(vals[0]-vals[1]).toFixed(1) : 0
                  return (
                    <div key={key} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px' }}>
                      <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:8 }}>{label}</div>
                      <div style={{ fontSize:22, fontWeight:900, color, marginBottom:2 }}>{latest}{unit}</div>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ fontSize:11, color:t.textMuted }}>avg {avg}{unit}</div>
                        {trend !== 0 && <div style={{ fontSize:11, fontWeight:700, color:trend>0?t.green:t.red }}>{trend>0?'+':''}{trend}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Mood / Stress / Energy</div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={[...dailyPulse].reverse()} margin={{ top:5, right:10, left:0, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                    <XAxis dataKey="checkin_date" tick={{ fill:t.textMuted, fontSize:10 }} tickFormatter={(v:string)=>new Date(v+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'})} axisLine={false} tickLine={false} />
                    <YAxis domain={[1,10]} tick={{ fill:t.textMuted, fontSize:10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text, fontSize:12 }} />
                    <Legend wrapperStyle={{ paddingTop:10, color:t.textMuted, fontSize:12 }} />
                    <Line type="monotone" dataKey="mood_score"   name="Mood"   stroke={t.pink}   strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="stress_score" name="Stress" stroke={t.red}    strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="energy_score" name="Energy" stroke={t.yellow} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Sleep / Water</div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={[...dailyPulse].reverse()} margin={{ top:5, right:10, left:0, bottom:5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                    <XAxis dataKey="checkin_date" tick={{ fill:t.textMuted, fontSize:10 }} tickFormatter={(v:string)=>new Date(v+'T00:00:00').toLocaleDateString([],{month:'short',day:'numeric'})} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:t.textMuted, fontSize:10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text, fontSize:12 }} />
                    <Legend wrapperStyle={{ paddingTop:10, color:t.textMuted, fontSize:12 }} />
                    <Line type="monotone" dataKey="sleep_hours" name="Sleep hrs" stroke={t.purple} strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="water_oz"    name="Water oz"  stroke="#38bdf8"  strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Raw Data</div>
                <div style={{ overflowX:'auto' as const }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid '+t.border }}>
                      {['Date','Mood','Stress','Energy','Sleep','Steps','Water'].map(h=>(
                        <th key={h} style={{ padding:'6px 10px', color:t.textMuted, fontWeight:700, textAlign:'left' as const }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{dailyPulse.map((d:any)=>(
                      <tr key={d.id} style={{ borderBottom:'1px solid '+t.border+'44' }}>
                        <td style={{ padding:'8px 10px', color:t.teal, fontWeight:600 }}>{new Date(d.checkin_date+'T00:00:00').toLocaleDateString([],{weekday:'short',month:'short',day:'numeric'})}</td>
                        <td style={{ padding:'8px 10px', color:d.mood_score>=7?t.green:d.mood_score<=4?t.red:t.text }}>{d.mood_score??'--'}</td>
                        <td style={{ padding:'8px 10px', color:d.stress_score>=7?t.red:d.stress_score<=4?t.green:t.text }}>{d.stress_score??'--'}</td>
                        <td style={{ padding:'8px 10px', color:d.energy_score>=7?t.green:d.energy_score<=4?t.red:t.text }}>{d.energy_score??'--'}</td>
                        <td style={{ padding:'8px 10px', color:t.purple }}>{d.sleep_hours!=null?d.sleep_hours+'h':'--'}</td>
                        <td style={{ padding:'8px 10px', color:t.teal }}>{d.steps!=null?d.steps.toLocaleString():'--'}</td>
                        <td style={{ padding:'8px 10px', color:'#38bdf8' }}>{d.water_oz!=null?d.water_oz+'oz':'--'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            </>)}
          </div>
        )}

        {/* ── JOURNAL TAB ── */}
        {activeTab === 'journal' && (
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
          { label:'Current Weight', val: latest?.weight ? `${latest.weight} lbs` : '—', color: t.teal },
          { label:'Weight Change', val: wChange !== null ? `${wChange > 0 ? '+' : ''}${wChange} lbs` : '—', color: wChange !== null ? (wChange < 0 ? t.green : t.red) : t.textMuted },
          { label:'Body Fat', val: latest?.body_fat ? `${latest.body_fat}%` : '—', color: t.orange },
          { label:'BF% Change', val: bfChange !== null ? `${bfChange > 0 ? '+' : ''}${bfChange}%` : '—', color: bfChange !== null ? (bfChange < 0 ? t.green : t.red) : t.textMuted },
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

  const checkinForms = forms.filter((f: any) => f.is_checkin_type)

  useEffect(() => {
    const load = async () => {
      const [{ data: asgns }, { data: scheds }] = await Promise.all([
        supabase.from('client_form_assignments').select('*, form:onboarding_forms(title, is_checkin_type)').eq('client_id', clientId).order('assigned_at', { ascending: false }),
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
              style={{ background:`linear-gradient(135deg,${t.purple},${t.purple}cc)`, border:'none', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
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
                <button onClick={saveSchedule} disabled={!schedFormId||scheduling} style={{ flex:2, background:`linear-gradient(135deg,${t.purple},${t.purple}cc)`, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#fff', cursor:!schedFormId||scheduling?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!schedFormId||scheduling?.5:1 }}>
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
          <button onClick={onAssign} style={{ background:`linear-gradient(135deg,${t.purple},${t.purple}cc)`, border:'none', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Send Form</button>
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
              {a.status==='completed' ? '✅' : a.form?.is_checkin_type ? '📋' : '📝'}
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

// ── ProgramTab ────────────────────────────────────────────────────────────
function ProgramTab({ clientId, coachId, program, workouts, supabase, router, t, onProgramChange }: any) {
  const [allPrograms, setAllPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    supabase.from('programs')
      .select('id, name, goal, duration_weeks, is_template')
      .eq('coach_id', coachId)
      .order('is_template', { ascending: false })
      .order('name')
      .then(({ data }: any) => { setAllPrograms(data || []); setLoading(false) })
  }, [coachId])

  useEffect(() => {
    setSelectedId(program?.id || '')
    setDirty(false)
  }, [program?.id])

  const handleChange = (id: string) => {
    setSelectedId(id)
    setDirty(id !== (program?.id || ''))
    setSaved(false)
  }

  const saveAssignment = async () => {
    if (!dirty) return
    setSaving(true)
    if (selectedId) {
      // Link this program to the client
      await supabase.from('programs').update({ client_id: clientId }).eq('id', selectedId)
      // Unlink any previously assigned programs (set client_id to null) except the new one
      if (program?.id && program.id !== selectedId) {
        await supabase.from('programs').update({ client_id: null }).eq('id', program.id)
      }
      const { data: newProg } = await supabase.from('programs').select('*').eq('id', selectedId).single()
      onProgramChange(newProg)
    } else {
      // Unassign current program
      if (program?.id) {
        await supabase.from('programs').update({ client_id: null }).eq('id', program.id)
      }
      onProgramChange(null)
    }
    setSaving(false)
    setSaved(true)
    setDirty(false)
    setTimeout(() => setSaved(false), 2500)
  }

  const templates = allPrograms.filter(p => p.is_template)
  const clientProgs = allPrograms.filter(p => !p.is_template)

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Assignment card */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:2 }}>Assigned Program</div>
            <div style={{ fontSize:12, color:t.textMuted }}>
              {program ? `Currently: ${program.name}` : 'No program assigned yet'}
            </div>
          </div>
          <button onClick={() => router.push('/dashboard/coach/programs')}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Manage Programs →
          </button>
        </div>

        {loading ? (
          <div style={{ color:t.textMuted, fontSize:13 }}>Loading programs...</div>
        ) : (
          <>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:8 }}>
                Select Program
              </label>
              <select
                value={selectedId}
                onChange={e => handleChange(e.target.value)}
                style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+(dirty?t.orange:t.border), borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}>
                <option value="">— No program assigned —</option>
                {clientProgs.length > 0 && (
                  <optgroup label="Client Programs">
                    {clientProgs.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}{p.goal ? ` · ${p.goal}` : ''}</option>
                    ))}
                  </optgroup>
                )}
                {templates.length > 0 && (
                  <optgroup label="Templates (will assign a copy)">
                    {templates.map((p: any) => (
                      <option key={p.id} value={p.id}>📐 {p.name}{p.goal ? ` · ${p.goal}` : ''}</option>
                    ))}
                  </optgroup>
                )}
              </select>
              {allPrograms.length === 0 && (
                <div style={{ fontSize:12, color:t.orange, marginTop:8 }}>
                  No programs yet. <span onClick={() => router.push('/dashboard/coach/programs')} style={{ cursor:'pointer', textDecoration:'underline' }}>Create one first →</span>
                </div>
              )}
            </div>

            {dirty && (
              <button onClick={saveAssignment} disabled={saving}
                style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.7:1 }}>
                {saving ? 'Saving...' : '💾 Save Program Assignment'}
              </button>
            )}
            {saved && (
              <div style={{ background:t.greenDim, border:'1px solid '+t.green+'40', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.green, fontWeight:700, textAlign:'center' as const }}>
                ✓ Program assigned successfully!
              </div>
            )}
          </>
        )}
      </div>

      {/* Active program details */}
      {program && (
        <div style={{ background:t.surface, border:'1px solid '+t.teal+'30', borderRadius:16, padding:20 }}>
          <div style={{ height:3, background:`linear-gradient(90deg,${t.teal},${t.orange})`, borderRadius:3, marginBottom:16, marginTop:-20, marginLeft:-20, marginRight:-20 }} />
          <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>{program.name}</div>
          {program.description && <div style={{ fontSize:13, color:t.textMuted, marginBottom:14, lineHeight:1.6 }}>{program.description}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:14 }}>
            {[
              { label:'Duration',  val: program.duration_weeks ? program.duration_weeks+'w' : '—', color:t.teal },
              { label:'Frequency', val: program.sessions_per_week ? program.sessions_per_week+'x/wk' : '—', color:t.orange },
              { label:'Level',     val: program.difficulty || '—', color:t.purple },
              { label:'Goal',      val: program.goal || '—', color:t.green },
            ].map(s => (
              <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', textAlign:'center' as const }}>
                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>{s.label}</div>
                <div style={{ fontSize:16, fontWeight:800, color:s.color }}>{s.val}</div>
              </div>
            ))}
          </div>
          <button onClick={() => router.push('/dashboard/coach/programs/'+program.id)}
            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Open in Builder →
          </button>
        </div>
      )}

      {/* Recent workout sessions */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
        <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>Recent Workout Sessions</div>
        {workouts.length > 0 ? workouts.map((w:any, i:number) => (
          <div key={w.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 0', borderBottom: i < workouts.length-1 ? '1px solid '+t.border : 'none' }}>
            <div style={{ width:36, height:36, borderRadius:10, background: w.status==='completed' ? t.greenDim : t.orangeDim, border:'1px solid '+(w.status==='completed'?t.green:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>
              {w.status==='completed' ? '✅' : '📋'}
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
