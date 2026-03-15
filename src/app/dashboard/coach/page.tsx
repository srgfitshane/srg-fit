'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { getUnreadInsights } from '@/lib/ai-insights'
import AiInsightsPanel from '@/components/AiInsightsPanel'
import NotificationBell from '@/components/notifications/NotificationBell'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", green:"#22c55e", greenDim:"#22c55e15", pink:"#f472b6",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const CLIENT_COLORS = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]


export default function CoachDashboard() {
  const [profile,  setProfile]  = useState<any>(null)
  const [clients,  setClients]  = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName,  setInviteName]  = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteMsg, setInviteMsg] = useState('')
  const [aiInsights, setAiInsights] = useState<any[]>([])
  const [showInsights, setShowInsights] = useState(false)
  const [lifecycleClient, setLifecycleClient] = useState<any>(null)   // client being acted on
  const [lifecycleAction, setLifecycleAction] = useState<'pause'|'resume'|'archive'|'delete'|null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [clientFilter, setClientFilter] = useState<'active'|'paused'|'archived'>('active')
  const [navExpanded, setNavExpanded] = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: clientList, error: clientError } = await supabase
        .from('clients')
        .select(`*, profile:profiles!profile_id(full_name, email, avatar_url)`)
        .eq('coach_id', user.id)
        .neq('archived', true)   // show active + paused, not archived by default
      console.log('clients:', clientList)
      console.log('client error:', clientError)
      setClients(clientList || [])
      // Load AI insights silently
      const insights = await getUnreadInsights(user.id)
      setAiInsights(insights)
      setLoading(false)
    }
    load()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const confirmLifecycle = async () => {
    if (!lifecycleClient || !lifecycleAction) return
    setLifecycleLoading(true)
    const id = lifecycleClient.id
    if (lifecycleAction === 'pause') {
      await supabase.from('clients').update({ paused: true, active: true, paused_at: new Date().toISOString(), pause_reason: lifecycleReason || null }).eq('id', id)
      setClients(p => p.map(c => c.id === id ? { ...c, paused: true, pause_reason: lifecycleReason } : c))
    } else if (lifecycleAction === 'resume') {
      await supabase.from('clients').update({ paused: false, paused_at: null, pause_reason: null }).eq('id', id)
      setClients(p => p.map(c => c.id === id ? { ...c, paused: false } : c))
    } else if (lifecycleAction === 'archive') {
      await supabase.from('clients').update({ active: false, archived: true, archived_at: new Date().toISOString() }).eq('id', id)
      setClients(p => p.filter(c => c.id !== id))
    } else if (lifecycleAction === 'delete') {
      await supabase.from('clients').delete().eq('id', id)
      setClients(p => p.filter(c => c.id !== id))
    }
    setLifecycleLoading(false)
    setLifecycleClient(null)
    setLifecycleAction(null)
    setLifecycleReason('')
  }


  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return
    setInviting(true)
    setInviteMsg('')
    const { data: { user } } = await supabase.auth.getUser()
    console.log('inviting with coachId:', user?.id, 'email:', inviteEmail, 'name:', inviteName)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, fullName: inviteName, coachId: user?.id }),
    })
    const result = await res.json()
    if (!res.ok) { setInviteMsg('Error: ' + result.error); setInviting(false); return }
    setInviteMsg(result.message)
    setInviting(false)
    const { data: clientList } = await supabase
      .from('clients')
      .select(`*, profile:profiles!profile_id(full_name, email, avatar_url)`)
      .eq('coach_id', user?.id!)
      .neq('archived', true)
    setClients(clientList || [])
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
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, flexShrink:0 }}>
          <div style={{ fontSize:18, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ width:1, height:28, background:t.border, margin:'0 16px' }} />
          <div style={{ fontSize:14, fontWeight:700 }}>Coach Dashboard</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:13, color:t.textMuted, marginRight:16 }}>{profile?.full_name}</div>
          {/* Notification Bell */}
          {profile?.id && <NotificationBell userId={profile.id} accentColor={t.teal} />}
          {/* AI Insights bell */}
          <button onClick={()=>setShowInsights(true)} title="AI Coaching Insights"
            style={{ position:'relative', background:aiInsights.length>0?t.purpleDim:'none', border:'1px solid '+(aiInsights.length>0?t.purple+'40':t.border), borderRadius:8, padding:'6px 12px', fontSize:16, cursor:'pointer', marginRight:8, display:'flex', alignItems:'center' }}>
            🧠
            {aiInsights.length > 0 && (
              <span style={{ position:'absolute', top:-4, right:-4, background:aiInsights.some(i=>i.priority==='urgent'||i.priority==='high')?t.red:t.orange, borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:900, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                {aiInsights.length}
              </span>
            )}
          </button>
          <button onClick={handleSignOut} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Sign Out</button>
        </div>

        <div style={{ padding:28, maxWidth:1200, margin:'0 auto' }}>

          {/* Greeting */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:26, fontWeight:900, marginBottom:4 }}>{getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋</div>
            <div style={{ fontSize:13, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>


          {/* Stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:28 }}>
            {[
              { label:'Active Clients', val:clients.length,                          color:t.teal,   icon:'👥' },
              { label:'Flagged',        val:clients.filter(c=>c.flagged).length,     color:t.red,    icon:'🚩' },
              { label:'Check-ins Due',  val:'—',                                     color:t.orange, icon:'✅' },
              { label:'Unread Msgs',    val:'—',                                     color:t.purple, icon:'💬' },
            ].map(s => (
              <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</div>
                </div>
                <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* 2-col layout */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start' }}>

          {/* LEFT: Clients table */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:15, fontWeight:800 }}>Clients <span style={{ fontSize:13, color:t.textMuted, fontWeight:500 }}>({clients.filter(c=>!c.paused).length} active{clients.filter(c=>c.paused).length>0?', '+clients.filter(c=>c.paused).length+' paused':''})</span></div>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>router.push('/dashboard/coach/clients/archived')}
                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Archived
                </button>
                <button onClick={()=>{ setShowInvite(true); setInviteMsg(''); }}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Invite Client
                </button>
              </div>
            </div>


            {clients.length === 0 ? (
              <div style={{ padding:'56px', textAlign:'center' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
                <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>No clients yet</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Invite your first client to get started</div>
                <button onClick={()=>router.push('/dashboard/coach/programs')} style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:9, padding:'8px 16px', fontSize:13, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            📋 Programs
          </button>
          <button onClick={()=>setShowInvite(true)} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Invite Client
                </button>
              </div>
            ) : (
              <div>
                {/* Filter tabs */}
                <div style={{ display:'flex', gap:6, padding:'10px 16px', borderBottom:'1px solid '+t.border }}>
                  {(['active','paused'] as const).map(f => (
                    <button key={f} onClick={()=>setClientFilter(f)}
                      style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer', border:'1px solid '+(clientFilter===f?t.teal+'60':t.border), background:clientFilter===f?t.tealDim:'transparent', color:clientFilter===f?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                      {f} ({clients.filter(c => f==='active' ? !c.paused : c.paused).length})
                    </button>
                  ))}
                </div>
                {clients.filter(c => clientFilter==='active' ? !c.paused : c.paused).map((client:any, i:number, arr:any[]) => {
                  const initials = client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'
                  const color = CLIENT_COLORS[i % CLIENT_COLORS.length]
                  return (
                    <div key={client.id}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom: i < arr.length-1 ? '1px solid '+t.border : 'none', transition:'background 0.15s ease' }}
                      onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                      {/* Avatar — clicking navigates */}
                      <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ width:42, height:42, borderRadius:13, background:'linear-gradient(135deg,'+color+','+color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#000', flexShrink:0, cursor:'pointer' }}>
                        {initials}
                      </div>
                      {/* Name / email — clicking navigates */}
                      <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                          <span style={{ fontSize:14, fontWeight:700 }}>{client.profile?.full_name || 'Unknown'}</span>
                          {client.paused && <span style={{ fontSize:10, fontWeight:800, color:'#f5a623', background:'#f5a62315', borderRadius:6, padding:'2px 7px' }}>⏸ PAUSED</span>}
                          {client.flagged && <span style={{ fontSize:10, fontWeight:800, color:t.red, background:t.redDim, borderRadius:6, padding:'2px 7px' }}>🚩 FLAGGED</span>}
                          {!client.onboarding_completed && <span style={{ fontSize:10, fontWeight:800, color:t.purple, background:t.purpleDim, borderRadius:6, padding:'2px 7px' }}>📋 ONBOARDING</span>}
                        </div>
                        <div style={{ fontSize:12, color:t.textMuted }}>{client.profile?.email}</div>
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted, flexShrink:0, marginRight:4 }}>
                        Since {new Date(client.start_date).toLocaleDateString([], { month:'short', year:'numeric' })}
                      </div>
                      {/* Lifecycle action buttons */}
                      <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e=>e.stopPropagation()}>
                        {client.paused ? (
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('resume') }}
                            style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.green+'40', background:t.greenDim, color:t.green, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>▶ Resume</button>
                        ) : (
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('pause') }}
                            style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.orange+'40', background:t.orangeDim, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>⏸ Pause</button>
                        )}
                        <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('archive') }}
                          style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>📦 Archive</button>
                        <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('delete') }}
                          style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                        <button onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}
                          style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>View →</button>
                        <button onClick={()=>router.push('/dashboard/preview/'+client.id)}
                          style={{ padding:'5px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.purple+'40', background:t.purpleDim, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>👁️</button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Quick access panel */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

            {/* Quick nav */}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
              {/* Header row with toggle */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Quick Access</div>
                <button onClick={()=>setNavExpanded(p=>!p)}
                  style={{ background:navExpanded?t.tealDim:'transparent', border:'1px solid '+(navExpanded?t.teal+'40':t.border), borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, color:navExpanded?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {navExpanded ? '▲ Less' : '▼ More'}
                </button>
              </div>

              {/* Always-visible essentials */}
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { label:'Messages',   icon:'💬', path:'/dashboard/coach/messages'   },
                  { label:'Community',  icon:'🏘️', path:'/dashboard/coach/community'  },
                  { label:'Programs',   icon:'📋', path:'/dashboard/coach/programs'   },
                ].map(item => (
                  <button key={item.label} onClick={()=>router.push(item.path)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceUp, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as any, width:'100%' }}
                    onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceHigh)}
                    onMouseLeave={e=>(e.currentTarget.style.background=t.surfaceUp)}>
                    <span style={{ fontSize:16 }}>{item.icon}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{item.label}</span>
                    <span style={{ marginLeft:'auto', color:t.textMuted, fontSize:12 }}>→</span>
                  </button>
                ))}

                {/* Collapsible section */}
                {navExpanded && [
                  { label:'Workouts',   icon:'💪', path:'/dashboard/coach/workouts'   },
                  { label:'Nutrition',  icon:'🥗', path:'/dashboard/coach/nutrition'  },
                  { label:'Check-ins',  icon:'✅', path:'/dashboard/coach/checkins'   },
                  { label:'Habits',     icon:'🔁', path:'/dashboard/coach/habits'     },
                  { label:'Calendar',   icon:'📅', path:'/dashboard/coach/calendar'   },
                  { label:'Progress',   icon:'📈', path:'/dashboard/coach/progress'   },
                  { label:'Resources',  icon:'📚', path:'/dashboard/coach/resources'  },
                  { label:'AI Insights',icon:'🤖', path:'/dashboard/coach/insights'   },
                  { label:'Reports',    icon:'📊', path:'/dashboard/coach/reports'    },
                  { label:'Exercises',  icon:'🏋️', path:'/dashboard/coach/exercises'  },
                  { label:'Invites',    icon:'📨', path:'/dashboard/coach/invites'    },
                  { label:'Onboarding', icon:'📝', path:'/dashboard/coach/onboarding' },
                  { label:'Plans',      icon:'💳', path:'/dashboard/coach/plans'      },
                ].map(item => (
                  <button key={item.label} onClick={()=>router.push(item.path)}
                    style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceUp, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as any, width:'100%' }}
                    onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceHigh)}
                    onMouseLeave={e=>(e.currentTarget.style.background=t.surfaceUp)}>
                    <span style={{ fontSize:16 }}>{item.icon}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:t.text }}>{item.label}</span>
                    <span style={{ marginLeft:'auto', color:t.textMuted, fontSize:12 }}>→</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Invite shortcut */}
            <button onClick={()=>{ setShowInvite(true); setInviteMsg(''); }}
              style={{ width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:14, padding:'14px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              + Invite New Client
            </button>

          </div>

          </div>{/* end 2-col grid */}
        </div>


        {/* Invite modal */}
        {showInvite && (
          <div onClick={()=>setShowInvite(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:440, padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>Invite a Client</div>
                <span onClick={()=>setShowInvite(false)} style={{ cursor:'pointer', color:t.textMuted, fontSize:24, lineHeight:1 }}>×</span>
              </div>
              {inviteMsg ? (
                <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:12, padding:'16px', fontSize:14, color:t.teal, textAlign:'center', marginBottom:16 }}>
                  {inviteMsg}
                  <div style={{ marginTop:12 }}>
                    <button onClick={()=>{ setShowInvite(false); setInviteEmail(''); setInviteName(''); setInviteMsg(''); }}
                      style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Full Name</div>
                    <input value={inviteName} onChange={e=>setInviteName(e.target.value)} placeholder="Alex Rivera"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                  <div style={{ marginBottom:20 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Email Address</div>
                    <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} type="email" placeholder="client@email.com"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                  <button onClick={handleInvite} disabled={inviting||!inviteEmail||!inviteName}
                    style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:inviting||!inviteEmail||!inviteName?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:inviting||!inviteEmail||!inviteName?0.6:1 }}>
                    {inviting ? 'Inviting...' : 'Send Invite →'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* AI Insights Panel */}
        {showInsights && (
          <AiInsightsPanel
            insights={aiInsights}
            onDismiss={(id) => setAiInsights(prev => prev.filter(i => i.id !== id))}
            onClose={() => setShowInsights(false)}
          />
        )}

        {/* ── Lifecycle confirm modal ───────────────────────────────────── */}
        {lifecycleAction && lifecycleClient && (() => {
          const name = lifecycleClient.profile?.full_name || lifecycleClient.profile?.email || 'this client'
          const cfg: Record<string, { icon:string; title:string; desc:string; confirmLabel:string; confirmColor:string; showReason:boolean }> = {
            pause:   { icon:'⏸', title:`Pause ${name}?`, desc:'They won\'t lose any data. You can resume them any time.', confirmLabel:'Pause Client', confirmColor:t.orange, showReason:true },
            resume:  { icon:'▶', title:`Resume ${name}?`, desc:'Their access will be restored immediately.', confirmLabel:'Resume Client', confirmColor:t.green, showReason:false },
            archive: { icon:'📦', title:`Archive ${name}?`, desc:'All data is kept. They won\'t be able to log in. You can unarchive later.', confirmLabel:'Archive Client', confirmColor:t.textMuted, showReason:false },
            delete:  { icon:'⚠️', title:`Permanently delete ${name}?`, desc:'This cannot be undone. All data including workouts, check-ins, and messages will be deleted.', confirmLabel:'Yes, Delete Everything', confirmColor:t.red, showReason:false },
          }
          const c = cfg[lifecycleAction]
          return (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
              <div style={{ background:t.surface, border:'1px solid '+(lifecycleAction==='delete'?t.red+'60':t.border), borderRadius:20, padding:28, maxWidth:400, width:'100%' }}>
                <div style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>{c.icon}</div>
                <div style={{ fontSize:17, fontWeight:900, textAlign:'center', marginBottom:8 }}>{c.title}</div>
                <div style={{ fontSize:13, color:t.textMuted, textAlign:'center', marginBottom:20, lineHeight:1.6 }}>{c.desc}</div>
                {c.showReason && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Reason (optional)</div>
                    <input value={lifecycleReason} onChange={e=>setLifecycleReason(e.target.value)} placeholder="e.g. Taking a break, payment issue..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                  </div>
                )}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>{ setLifecycleClient(null); setLifecycleAction(null); setLifecycleReason('') }}
                    style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={confirmLifecycle} disabled={lifecycleLoading}
                    style={{ flex:2, background:c.confirmColor, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color: lifecycleAction==='delete'?'#fff':'#000', cursor:lifecycleLoading?'not-allowed':'pointer', opacity:lifecycleLoading?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
                    {lifecycleLoading ? 'Please wait...' : c.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </>
  )
}
