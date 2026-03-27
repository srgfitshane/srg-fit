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

// Always-visible nav — things you touch every session
const NAV_ESSENTIALS = [
  { label:'Reviews',    icon:'⏰', path:'/dashboard/coach/reviews'  },
  { label:'Messages',   icon:'💬', path:'/dashboard/coach/messages'  },
  { label:'Community',  icon:'🏘️', path:'/dashboard/coach/community' },
  { label:'Programs',   icon:'📋', path:'/dashboard/coach/programs'  },
  { label:'Workouts',   icon:'💪', path:'/dashboard/coach/workouts'  },
]

// Shown when expanded — tools you need occasionally
const NAV_EXPANDED = [
  { label:'Outreach',    icon:'📣', path:'/dashboard/coach/outreach'  },
  { label:'Calendar',    icon:'📅', path:'/dashboard/coach/calendar'   },
  { label:'Resources',   icon:'📚', path:'/dashboard/coach/resources'  },
  { label:'Check-ins',   icon:'✅', path:'/dashboard/coach/checkins'   },
  { label:'AI Insights', icon:'🧠', path:'/dashboard/coach/insights'   },
  { label:'Exercises',   icon:'🏋️', path:'/dashboard/coach/exercises'  },
  { label:'Forms',       icon:'📝', path:'/dashboard/coach/onboarding' },
  { label:'Plans',       icon:'💳', path:'/dashboard/coach/plans'      },
  { label:'Invites',     icon:'📨', path:'/dashboard/coach/invites'    },
]

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
  const [lifecycleClient, setLifecycleClient] = useState<any>(null)
  const [lifecycleAction, setLifecycleAction] = useState<'pause'|'resume'|'archive'|'delete'|null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [clientFilter, setClientFilter] = useState<'active'|'paused'>('active')
  const [navExpanded, setNavExpanded] = useState(false)
  const [pendingReviews, setPendingReviews] = useState(0)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: clientList } = await supabase
        .from('clients')
        .select(`*, profile:profiles!profile_id(full_name, email, avatar_url)`)
        .eq('coach_id', user.id)
        .neq('archived', true)
      setClients(clientList || [])
      const insights = await getUnreadInsights(user.id)
      setAiInsights(insights)
      // Pending workout reviews
      const { count } = await supabase
        .from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .eq('status', 'completed')
        .is('coach_reviewed_at', null)
        .not('review_due_at', 'is', null)
      setPendingReviews(count || 0)
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
    setInviting(true); setInviteMsg('')
    const { data: { user } } = await supabase.auth.getUser()
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
      .from('clients').select(`*, profile:profiles!profile_id(full_name, email, avatar_url)`)
      .eq('coach_id', user?.id!).neq('archived', true)
    setClients(clientList || [])
  }

  const NavBtn = ({ item }: { item: { label:string, icon:string, path:string } }) => (
    <button onClick={()=>router.push(item.path)}
      style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 11px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceUp, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, width:'100%', minWidth:0 }}
      onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceHigh)}
      onMouseLeave={e=>(e.currentTarget.style.background=t.surfaceUp)}>
      <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
      <span style={{ fontSize:12, fontWeight:600, color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{item.label}</span>
    </button>
  )

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  const filteredClients = clients.filter(c => clientFilter === 'active' ? !c.paused : c.paused)

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};overflow-x:hidden;}
        button{-webkit-tap-highlight-color:transparent;}
        .coach-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        /* coach-main: right col wide enough to hold 2-col nav comfortably */
        .coach-main{display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start;}
        .client-actions{display:flex;gap:5px;flex-shrink:0;}
        .coach-topbar-label{display:block;}
        /* nav grid: 2 cols by default inside the right sidebar */
        .nav-grid-essential{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
        .nav-grid-expanded{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
        /* wider screens: go 3 cols in the nav sidebar */
        @media(min-width:1400px){
          .coach-main{grid-template-columns:1fr 420px;}
          .nav-grid-essential{grid-template-columns:repeat(3,1fr);}
          .nav-grid-expanded{grid-template-columns:repeat(3,1fr);}
        }
        /* below 1100px: stack main layout */
        @media(max-width:1100px){
          .coach-main{grid-template-columns:1fr;}
          .nav-grid-essential{grid-template-columns:repeat(3,1fr);}
          .nav-grid-expanded{grid-template-columns:repeat(3,1fr);}
        }
        @media(max-width:900px){
          .coach-stats{grid-template-columns:repeat(2,1fr);}
        }
        @media(max-width:700px){
          .coach-topbar-name{display:none;}
          .coach-topbar-label{display:none;}
          .coach-pad{padding:14px!important;}
        }
        @media(max-width:600px){
          .client-row{flex-wrap:wrap;gap:8px;}
          .client-actions{width:100%;justify-content:flex-end;}
          .client-since{display:none;}
          .coach-stats{grid-template-columns:repeat(2,1fr);gap:8px;}
          .nav-grid-essential{grid-template-columns:repeat(2,1fr);}
        }
        @media(max-width:420px){
          .client-actions button .btn-label{display:none;}
        }
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 16px', display:'flex', alignItems:'center', height:56, gap:8, overflowX:'hidden' }}>
          <div style={{ fontSize:18, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', flexShrink:0 }}>SRG FIT</div>
          <div style={{ width:1, height:28, background:t.border, margin:'0 8px', flexShrink:0 }} />
          <div style={{ fontSize:14, fontWeight:700, flexShrink:0 }} className="coach-topbar-label">Coach</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:13, color:t.textMuted, marginRight:8 }} className="coach-topbar-name">{profile?.full_name}</div>
          {profile?.id && <NotificationBell userId={profile.id} accentColor={t.teal} />}
          <button onClick={()=>setShowInsights(true)} title="AI Coaching Insights"
            style={{ position:'relative', background:aiInsights.length>0?t.purpleDim:'none', border:'1px solid '+(aiInsights.length>0?t.purple+'40':t.border), borderRadius:8, padding:'6px 10px', fontSize:16, cursor:'pointer', marginRight:4, display:'flex', alignItems:'center', flexShrink:0 }}>
            🧠
            {aiInsights.length > 0 && (
              <span style={{ position:'absolute', top:-4, right:-4, background:t.orange, borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:900, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>{aiInsights.length}</span>
            )}
          </button>
          <button onClick={handleSignOut} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>Out</button>
        </div>

        <div style={{ padding:28, maxWidth:1200, margin:'0 auto' }} className="coach-pad">

          {/* Greeting */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:26, fontWeight:900, marginBottom:4 }}>{getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋</div>
            <div style={{ fontSize:13, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>

          {/* Pending reviews banner */}
          {pendingReviews > 0 && (
            <button onClick={()=>router.push('/dashboard/coach/reviews')}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:'linear-gradient(135deg,#1a0a0a,#1a0808)', border:`1px solid ${t.red}50`, borderRadius:14, padding:'14px 18px', cursor:'pointer', marginBottom:24, fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const }}>
              <div style={{ fontSize:28, flexShrink:0 }}>⏰</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800, color:t.red, marginBottom:2 }}>
                  {pendingReviews} workout{pendingReviews !== 1 ? 's' : ''} pending review
                </div>
                <div style={{ fontSize:12, color:t.textMuted }}>24-hour SLA — tap to review</div>
              </div>
              <div style={{ fontSize:20, color:t.red }}>›</div>
            </button>
          )}

          {/* Stats */}
          <div className="coach-stats" style={{ marginBottom:28 }}>
            {[
              { label:'Active Clients', val:clients.length,                      color:t.teal,   icon:'👥' },
              { label:'Flagged',        val:clients.filter(c=>c.flagged).length, color:t.red,    icon:'🚩' },
              { label:'Check-ins Due',  val:'—',                                 color:t.orange, icon:'✅' },
              { label:'Unread Msgs',    val:'—',                                 color:t.purple, icon:'💬' },
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
          <div className="coach-main">

            {/* LEFT: Clients */}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden' }}>
              <div style={{ padding:'20px 24px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                <div style={{ fontSize:15, fontWeight:800 }}>
                  Clients <span style={{ fontSize:13, color:t.textMuted, fontWeight:500 }}>
                    ({clients.filter(c=>!c.paused).length} active{clients.filter(c=>c.paused).length > 0 ? ', '+clients.filter(c=>c.paused).length+' paused' : ''})
                  </span>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>router.push('/dashboard/coach/clients/archived')}
                    style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Archived
                  </button>
                  <button onClick={()=>router.push('/dashboard/coach/invites')}
                    style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Add Client
                  </button>
                </div>
              </div>

              {clients.length === 0 ? (
                <div style={{ padding:'56px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>No clients yet</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Invite your first client to get started</div>
                  <button onClick={()=>router.push('/dashboard/coach/invites')} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Add Client
                  </button>
                </div>
              ) : (
                <>
                  {/* Filter tabs */}
                  <div style={{ display:'flex', gap:6, padding:'10px 16px', borderBottom:'1px solid '+t.border }}>
                    {(['active','paused'] as const).map(f => (
                      <button key={f} onClick={()=>setClientFilter(f)}
                        style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer', border:'1px solid '+(clientFilter===f?t.teal+'60':t.border), background:clientFilter===f?t.tealDim:'transparent', color:clientFilter===f?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                        {f} ({clients.filter(c => f==='active' ? !c.paused : c.paused).length})
                      </button>
                    ))}
                  </div>

                  {/* Client rows */}
                  {filteredClients.map((client:any, i:number) => {
                    const initials = client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'
                    const color = CLIENT_COLORS[i % CLIENT_COLORS.length]
                    return (
                      <div key={client.id}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom: i < filteredClients.length-1 ? '1px solid '+t.border : 'none', transition:'background 0.15s' }}
                        className="client-row"
                        onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ width:42, height:42, borderRadius:13, background:'linear-gradient(135deg,'+color+','+color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#000', flexShrink:0, cursor:'pointer' }}>
                          {initials}
                        </div>
                        <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                            <span style={{ fontSize:14, fontWeight:700 }}>{client.profile?.full_name || 'Unknown'}</span>
                            {client.paused   && <span style={{ fontSize:10, fontWeight:800, color:t.orange, background:t.orangeDim, borderRadius:6, padding:'2px 7px' }}>⏸ PAUSED</span>}
                            {client.flagged  && <span style={{ fontSize:10, fontWeight:800, color:t.red, background:t.redDim, borderRadius:6, padding:'2px 7px' }}>🚩</span>}
                          </div>
                          <div style={{ fontSize:12, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{client.profile?.email}</div>
                        </div>
                        <div style={{ fontSize:11, color:t.textMuted, flexShrink:0 }} className="client-since">
                          {new Date(client.start_date).toLocaleDateString([], { month:'short', year:'numeric' })}
                        </div>
                        <div className="client-actions" onClick={e=>e.stopPropagation()}>
                          {client.paused ? (
                            <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('resume') }}
                              style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.green+'40', background:t.greenDim, color:t.green, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>▶ <span className="btn-label">Resume</span></button>
                          ) : (
                            <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('pause') }}
                              style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.orange+'40', background:t.orangeDim, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>⏸ <span className="btn-label">Pause</span></button>
                          )}
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('archive') }}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>📦</button>
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('delete') }}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                          <button onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>View →</button>
                          <button onClick={()=>router.push('/dashboard/preview/'+client.id)}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.purple+'40', background:t.purpleDim, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>👁️</button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* RIGHT: Quick access */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>Quick Access</div>
                  <button onClick={()=>setNavExpanded(p=>!p)}
                    style={{ background:navExpanded?t.tealDim:'transparent', border:'1px solid '+(navExpanded?t.teal+'40':t.border), borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, color:navExpanded?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {navExpanded ? '▲ Less' : '▼ More'}
                  </button>
                </div>
                <div className="nav-grid-essential">
                  {NAV_ESSENTIALS.map(item => <NavBtn key={item.label} item={item} />)}
                </div>
                {navExpanded && (
                  <div className="nav-grid-expanded" style={{ marginTop:8 }}>
                    {NAV_EXPANDED.map(item => <NavBtn key={item.label} item={item} />)}
                  </div>
                )}
              </div>
            </div>

          </div>{/* end 2-col */}
        </div>


        {/* Invite modal */}
        {showInvite && (
          <div onClick={()=>setShowInvite(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:440, padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>Invite a Client</div>
                <span onClick={()=>setShowInvite(false)} style={{ cursor:'pointer', color:t.textMuted, fontSize:24 }}>×</span>
              </div>
              {inviteMsg ? (
                <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:12, padding:16, fontSize:14, color:t.teal, textAlign:'center', marginBottom:16 }}>
                  {inviteMsg}
                  <div style={{ marginTop:12 }}>
                    <button onClick={()=>{ setShowInvite(false); setInviteEmail(''); setInviteName(''); setInviteMsg('') }}
                      style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Done</button>
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

        {/* Lifecycle confirm modal */}
        {lifecycleAction && lifecycleClient && (() => {
          const name = lifecycleClient.profile?.full_name || lifecycleClient.profile?.email || 'this client'
          const cfg: Record<string, { icon:string; title:string; desc:string; confirmLabel:string; confirmColor:string; showReason:boolean }> = {
            pause:   { icon:'⏸', title:`Pause ${name}?`, desc:"They won't lose any data. You can resume them any time.", confirmLabel:'Pause Client', confirmColor:t.orange, showReason:true },
            resume:  { icon:'▶', title:`Resume ${name}?`, desc:'Their access will be restored immediately.', confirmLabel:'Resume Client', confirmColor:t.green, showReason:false },
            archive: { icon:'📦', title:`Archive ${name}?`, desc:"All data is kept. They won't be able to log in. You can unarchive later.", confirmLabel:'Archive Client', confirmColor:t.textMuted, showReason:false },
            delete:  { icon:'⚠️', title:`Permanently delete ${name}?`, desc:'This cannot be undone. All data will be deleted.', confirmLabel:'Yes, Delete Everything', confirmColor:t.red, showReason:false },
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
                    <input value={lifecycleReason} onChange={e=>setLifecycleReason(e.target.value)} placeholder="e.g. Taking a break..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any }} />
                  </div>
                )}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>{ setLifecycleClient(null); setLifecycleAction(null); setLifecycleReason('') }}
                    style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={confirmLifecycle} disabled={lifecycleLoading}
                    style={{ flex:2, background:c.confirmColor, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:lifecycleAction==='delete'?'#fff':'#000', cursor:lifecycleLoading?'not-allowed':'pointer', opacity:lifecycleLoading?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
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
