'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", green:"#22c55e", pink:"#f472b6",
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
        .select(`*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)`)
        .eq('coach_id', user.id)
        .eq('active', true)
      console.log('clients:', clientList)
      console.log('client error:', clientError)
      setClients(clientList || [])
      setLoading(false)
    }
    load()
  }, [])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
      .select(`*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)`)
      .eq('coach_id', user?.id!)
      .eq('active', true)
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
          <button onClick={()=>router.push('/dashboard/coach/programs')} style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:8 }}>
            📋 Programs
          </button>
          <button onClick={()=>router.push('/dashboard/coach/exercises')} style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:8 }}>
            🏋️ Exercises
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

          {/* Clients table */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden' }}>
            <div style={{ padding:'20px 24px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:15, fontWeight:800 }}>Active Clients <span style={{ fontSize:13, color:t.textMuted, fontWeight:500 }}>({clients.length})</span></div>
              <button onClick={()=>{ setShowInvite(true); setInviteMsg(''); }}
                style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Invite Client
              </button>
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
                {clients.map((client:any, i:number) => {
                  const initials = client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'
                  const color = CLIENT_COLORS[i % CLIENT_COLORS.length]
                  return (
                    <div key={client.id}
                      style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 24px', borderBottom: i < clients.length-1 ? '1px solid '+t.border : 'none', cursor:'pointer', transition:'background 0.15s ease' }}
                      onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                      onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                      onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}>
                      <div style={{ width:42, height:42, borderRadius:13, background:'linear-gradient(135deg,'+color+','+color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#000', flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>{client.profile?.full_name || 'Unknown'}</div>
                        <div style={{ fontSize:12, color:t.textMuted }}>{client.profile?.email}</div>
                      </div>
                      {client.flagged && (
                        <div style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'3px 10px', fontSize:11, fontWeight:700, color:t.red, flexShrink:0 }}>🚩 Flagged</div>
                      )}
                      <div style={{ fontSize:12, color:t.textMuted, flexShrink:0 }}>
                        Since {new Date(client.start_date).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' })}
                      </div>
                      <div style={{ fontSize:12, color:t.teal, fontWeight:700, flexShrink:0 }}>View →</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
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

      </div>
    </>
  )
}
