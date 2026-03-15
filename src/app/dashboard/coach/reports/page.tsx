'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

function StatCard({ label, value, sub, color }: { label:string, value:any, sub?:string, color?:string }) {
  return (
    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color:color||t.teal, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>{sub}</div>}
    </div>
  )
}

function Bar({ pct, color }: { pct:number, color:string }) {
  return (
    <div style={{ height:6, background:t.surfaceHigh, borderRadius:4, overflow:'hidden', flex:1 }}>
      <div style={{ height:'100%', width:Math.min(pct,100)+'%', background:color, borderRadius:4, transition:'width 0.6s ease' }} />
    </div>
  )
}

export default function CoachReportsPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [loading,   setLoading]   = useState(true)
  const [clients,   setClients]   = useState<any[]>([])
  const [roster,    setRoster]    = useState<any[]>([])
  const [selected,  setSelected]  = useState<string|null>(null)
  const [detail,    setDetail]    = useState<any>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: cls } = await supabase
      .from('clients')
      .select('id, profile_id, status, created_at, profiles!profile_id(full_name, avatar_url)')
      .eq('coach_id', user.id)
      .order('created_at')

    if (!cls?.length) { setLoading(false); return }
    setClients(cls)

    // Fetch aggregate data for each client in parallel
    const rosterData = await Promise.all(cls.map(async (c: any) => {
      const [
        { count: sessionCount },
        { count: checkinCount },
        { count: metricCount },
        { data: latestCheckin },
        { data: latestMetric },
        { data: firstMetric },
      ] = await Promise.all([
        supabase.from('workout_sessions').select('*', { count:'exact', head:true }).eq('client_id', c.id).eq('status','completed'),
        supabase.from('checkins').select('*', { count:'exact', head:true }).eq('client_id', c.id),
        supabase.from('metrics').select('*', { count:'exact', head:true }).eq('client_id', c.id),
        supabase.from('checkins').select('energy_score,stress_score,sleep_score,mood_score,pain_score,habit_completion_pct,notes,created_at')
          .eq('client_id', c.id).order('created_at', { ascending:false }).limit(1),
        supabase.from('metrics').select('weight,body_fat,logged_date')
          .eq('client_id', c.id).order('logged_date', { ascending:false }).limit(1),
        supabase.from('metrics').select('weight,body_fat,logged_date')
          .eq('client_id', c.id).order('logged_date', { ascending:true }).limit(1),
      ])

      const prof = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      const chk = latestCheckin?.[0]
      const met = latestMetric?.[0]
      const first = firstMetric?.[0]
      const weightChange = met?.weight && first?.weight ? +(met.weight - first.weight).toFixed(1) : null
      const avgScore = chk
        ? Math.round(([chk.energy_score,chk.sleep_score,chk.mood_score].filter(Boolean).reduce((a:number,b:number)=>a+b,0) / 3) * 10) / 10
        : null

      return {
        id: c.id, profile_id: c.profile_id, status: c.status, created_at: c.created_at,
        name: prof?.full_name || 'Unknown', avatar: prof?.avatar_url,
        sessions: sessionCount || 0,
        checkins: checkinCount || 0,
        metrics: metricCount || 0,
        latestWeight: met?.weight || null,
        weightChange,
        latestBodyFat: met?.body_fat || null,
        avgWellbeing: avgScore,
        latestStress: chk?.stress_score || null,
        latestPain: chk?.pain_score || null,
        habitPct: chk?.habit_completion_pct || null,
        lastActive: met?.logged_date || chk?.created_at?.split('T')[0] || null,
      }
    }))

    setRoster(rosterData)
    setLoading(false)
  }

  const loadDetail = async (clientId: string) => {
    const [
      { data: sessions },
      { data: checkins },
      { data: metrics },
    ] = await Promise.all([
      supabase.from('workout_sessions').select('scheduled_date, status, session_rpe, mood, duration_seconds, title')
        .eq('client_id', clientId).order('scheduled_date', { ascending:false }).limit(10),
      supabase.from('checkins').select('created_at, energy_score, sleep_score, stress_score, mood_score, pain_score, habit_completion_pct, notes')
        .eq('client_id', clientId).order('created_at', { ascending:false }).limit(8),
      supabase.from('metrics').select('logged_date, weight, body_fat, waist')
        .eq('client_id', clientId).order('logged_date', { ascending:false }).limit(8),
    ])
    setDetail({ sessions: sessions||[], checkins: checkins||[], metrics: metrics||[] })
  }

  const selectClient = async (id: string) => {
    if (selected === id) { setSelected(null); setDetail(null); return }
    setSelected(id); setDetail(null)
    await loadDetail(id)
  }

  const activeCount   = clients.filter(c => c.status === 'active').length
  const totalSessions = roster.reduce((a,c) => a+c.sessions, 0)
  const totalCheckins = roster.reduce((a,c) => a+c.checkins, 0)
  const avgWellbeing  = roster.filter(c=>c.avgWellbeing).length
    ? (roster.reduce((a,c) => a+(c.avgWellbeing||0), 0) / roster.filter(c=>c.avgWellbeing).length).toFixed(1)
    : '—'

  const fmt = (d:string) => new Date(d).toLocaleDateString([],{month:'short',day:'numeric'})
  const fmtDur = (s:number) => s ? `${Math.floor(s/60)}m` : '—'

  if (loading) return (
    <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>
      Loading...
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 24px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:700}}>📊 Reports & Analytics</div>
        </div>

        <div style={{maxWidth:1100,margin:'0 auto',padding:24}}>

          {/* Roster summary stats */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))',gap:12,marginBottom:28}}>
            <StatCard label="Active Clients" value={activeCount} sub={`${clients.length} total`} color={t.teal}/>
            <StatCard label="Total Sessions" value={totalSessions} sub="completed" color={t.orange}/>
            <StatCard label="Total Check-ins" value={totalCheckins} sub="submitted" color={t.purple}/>
            <StatCard label="Avg Wellbeing" value={avgWellbeing} sub="across roster" color={t.green}/>
          </div>

          {/* Client roster table */}
          <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:16,overflow:'hidden',marginBottom:20}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid '+t.border,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <div style={{fontSize:13,fontWeight:800}}>Client Roster</div>
              <div style={{fontSize:11,color:t.textMuted}}>Click a row to expand details</div>
            </div>
            {roster.length === 0 ? (
              <div style={{padding:'48px 20px',textAlign:'center',color:t.textMuted,fontSize:13}}>No client data yet.</div>
            ) : roster.map(c => {
              const isSelected = selected === c.id
              const wChange = c.weightChange
              return (
                <div key={c.id}>
                  {/* Row */}
                  <div onClick={()=>selectClient(c.id)}
                    style={{padding:'14px 20px',borderBottom:'1px solid '+t.border,cursor:'pointer',background:isSelected?t.tealDim:'transparent',display:'grid',gridTemplateColumns:'200px 80px 80px 80px 1fr 90px 80px',gap:12,alignItems:'center'}}
                    onMouseEnter={e=>{ if(!isSelected) e.currentTarget.style.background=t.surfaceUp }}
                    onMouseLeave={e=>{ if(!isSelected) e.currentTarget.style.background='transparent' }}>

                    {/* Name */}
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div style={{width:32,height:32,borderRadius:'50%',background:t.surfaceHigh,display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:800,color:t.teal,flexShrink:0,overflow:'hidden'}}>
                        {c.avatar ? <img src={c.avatar} style={{width:'100%',height:'100%',objectFit:'cover'}} alt=""/> : c.name.charAt(0)}
                      </div>
                      <div>
                        <div style={{fontSize:13,fontWeight:700}}>{c.name}</div>
                        <div style={{fontSize:10,color:t.textMuted,textTransform:'capitalize'}}>{c.status}</div>
                      </div>
                    </div>

                    {/* Sessions */}
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:800,color:t.orange}}>{c.sessions}</div>
                      <div style={{fontSize:9,color:t.textMuted}}>sessions</div>
                    </div>

                    {/* Check-ins */}
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:800,color:t.purple}}>{c.checkins}</div>
                      <div style={{fontSize:9,color:t.textMuted}}>check-ins</div>
                    </div>

                    {/* Metrics */}
                    <div style={{textAlign:'center'}}>
                      <div style={{fontSize:16,fontWeight:800,color:t.teal}}>{c.metrics}</div>
                      <div style={{fontSize:9,color:t.textMuted}}>entries</div>
                    </div>

                    {/* Weight + change */}
                    <div>
                      {c.latestWeight ? (
                        <div style={{display:'flex',alignItems:'center',gap:6}}>
                          <span style={{fontSize:13,fontWeight:700}}>{c.latestWeight} lbs</span>
                          {wChange !== null && (
                            <span style={{fontSize:11,fontWeight:700,color:wChange<0?t.green:wChange>0?t.red:t.textMuted}}>
                              {wChange>0?'+':''}{wChange} lbs
                            </span>
                          )}
                        </div>
                      ) : <span style={{fontSize:12,color:t.textMuted}}>—</span>}
                      {c.latestBodyFat && <div style={{fontSize:10,color:t.textMuted}}>{c.latestBodyFat}% BF</div>}
                    </div>

                    {/* Wellbeing */}
                    <div>
                      {c.avgWellbeing != null ? (
                        <>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3}}>
                            <span style={{fontSize:13,fontWeight:700,color:c.avgWellbeing>=7?t.green:c.avgWellbeing>=5?t.orange:t.red}}>{c.avgWellbeing}/10</span>
                          </div>
                          <Bar pct={c.avgWellbeing*10} color={c.avgWellbeing>=7?t.green:c.avgWellbeing>=5?t.orange:t.red}/>
                        </>
                      ) : <span style={{fontSize:12,color:t.textMuted}}>—</span>}
                    </div>

                    {/* Last active */}
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:11,color:t.textMuted}}>{c.lastActive ? fmt(c.lastActive) : '—'}</div>
                      <button onClick={e=>{e.stopPropagation();router.push('/dashboard/coach/clients/'+c.id)}}
                        style={{background:'none',border:'none',color:t.teal,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",padding:0,marginTop:3}}>
                        Profile →
                      </button>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isSelected && (
                    <div style={{padding:'0 20px 20px',background:t.tealDim,borderBottom:'1px solid '+t.border}}>
                      {!detail ? (
                        <div style={{padding:'20px 0',color:t.textMuted,fontSize:13}}>Loading...</div>
                      ) : (
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:16,paddingTop:16}}>

                          {/* Recent sessions */}
                          <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:12,padding:14}}>
                            <div style={{fontSize:11,fontWeight:800,color:t.orange,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Recent Sessions</div>
                            {detail.sessions.length===0
                              ? <div style={{fontSize:12,color:t.textMuted}}>No sessions yet</div>
                              : detail.sessions.slice(0,5).map((s:any,i:number) => (
                                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid '+t.border+'44'}}>
                                  <div>
                                    <div style={{fontSize:12,fontWeight:600}}>{s.title||'Session'}</div>
                                    <div style={{fontSize:10,color:t.textMuted}}>{s.scheduled_date ? fmt(s.scheduled_date) : '—'}</div>
                                  </div>
                                  <div style={{textAlign:'right'}}>
                                    <div style={{fontSize:11,fontWeight:700,color:s.status==='completed'?t.green:t.textMuted}}>{s.status}</div>
                                    {s.session_rpe && <div style={{fontSize:10,color:t.textMuted}}>RPE {s.session_rpe}</div>}
                                  </div>
                                </div>
                              ))}
                          </div>

                          {/* Recent check-ins */}
                          <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:12,padding:14}}>
                            <div style={{fontSize:11,fontWeight:800,color:t.purple,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Recent Check-ins</div>
                            {detail.checkins.length===0
                              ? <div style={{fontSize:12,color:t.textMuted}}>No check-ins yet</div>
                              : detail.checkins.slice(0,5).map((chk:any,i:number) => (
                                <div key={i} style={{padding:'5px 0',borderBottom:'1px solid '+t.border+'44'}}>
                                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:3}}>
                                    <div style={{fontSize:10,color:t.textMuted}}>{fmt(chk.created_at)}</div>
                                    <div style={{display:'flex',gap:6}}>
                                      {chk.energy_score&&<span style={{fontSize:10,color:t.teal}}>⚡{chk.energy_score}</span>}
                                      {chk.sleep_score&&<span style={{fontSize:10,color:t.blue}}>💤{chk.sleep_score}</span>}
                                      {chk.stress_score&&<span style={{fontSize:10,color:t.orange}}>🧠{chk.stress_score}</span>}
                                    </div>
                                  </div>
                                  {chk.notes&&<div style={{fontSize:10,color:t.textDim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{chk.notes}</div>}
                                </div>
                              ))}
                          </div>

                          {/* Metrics history */}
                          <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:12,padding:14}}>
                            <div style={{fontSize:11,fontWeight:800,color:t.teal,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Metrics History</div>
                            {detail.metrics.length===0
                              ? <div style={{fontSize:12,color:t.textMuted}}>No metrics yet</div>
                              : detail.metrics.slice(0,6).map((m:any,i:number) => (
                                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid '+t.border+'44'}}>
                                  <div style={{fontSize:10,color:t.textMuted}}>{fmt(m.logged_date)}</div>
                                  <div style={{display:'flex',gap:10}}>
                                    {m.weight&&<span style={{fontSize:11,fontWeight:700,color:t.teal}}>{m.weight} lbs</span>}
                                    {m.body_fat&&<span style={{fontSize:11,color:t.textMuted}}>{m.body_fat}%</span>}
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
