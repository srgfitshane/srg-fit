'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { localDateStr } from '@/lib/date'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  red:"#ef4444", redDim:"#ef444415", green:"#22c55e", greenDim:"#22c55e15",
  yellow:"#eab308", yellowDim:"#eab30815", purple:"#8b5cf6", purpleDim:"#8b5cf615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

type ClientRow = {
  id: string
  full_name: string | null
  display_name: string | null
  client_type: string | null
  last_checkin_at: string | null
  workouts_this_week: number
  workouts_this_month: number
  last_checkin: string | null
  total_checkins: number
  avg_stress: number | null
  avg_energy: number | null
  latest_weight: string | null
  pending_checkins: number
  days_since_checkin: number | null
  status: 'thriving' | 'watch' | 'quiet' | 'new'
  score: number
}

function computeStatus(row: Omit<ClientRow, 'status' | 'score'>): Pick<ClientRow, 'status' | 'score'> {
  const days = row.days_since_checkin
  const workouts = row.workouts_this_week
  const stress = row.avg_stress ?? 5
  const energy = row.avg_energy ?? 5

  // Score 0–100: higher = needs more attention
  let score = 0
  // Days since last check-in (heaviest signal)
  if (days === null)          score += 50  // never checked in
  else if (days >= 14)        score += 45
  else if (days >= 7)         score += 30
  else if (days >= 4)         score += 15
  // Workouts this week
  if (workouts === 0)         score += 20
  else if (workouts === 1)    score += 8
  // High stress
  if (stress >= 8)            score += 15
  else if (stress >= 6)       score += 7
  // Low energy
  if (energy <= 3)            score += 10
  else if (energy <= 5)       score += 4

  let status: ClientRow['status']
  if (row.total_checkins === 0 && (days === null || days >= 14)) status = 'new'
  else if (score >= 50) status = 'quiet'
  else if (score >= 25) status = 'watch'
  else status = 'thriving'

  return { status, score }
}

const STATUS_CONFIG = {
  thriving: { label:'Thriving',  color:t.green,  bg:t.greenDim,  icon:'🟢', desc:'Engaged and on track'      },
  watch:    { label:'Watch',     color:t.yellow, bg:t.yellowDim, icon:'🟡', desc:'May need a nudge'           },
  quiet:    { label:'Going Quiet',color:t.red,   bg:t.redDim,    icon:'🔴', desc:'Needs your attention now'  },
  new:      { label:'New',       color:t.purple, bg:t.purpleDim, icon:'🆕', desc:'Getting started'            },
}

export default function ClientLoadManagement() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<'all'|'quiet'|'watch'|'thriving'|'new'>('all')
  const router  = useRouter()
  const supabase = createClient()

  useEffect(() => { void load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: rawClients } = await supabase
      .from('clients')
      .select('id, display_name, client_type, last_checkin_at, profile:profiles!clients_profile_id_fkey(full_name)')
      .eq('coach_id', user.id)
      .eq('active', true)
      .order('last_checkin_at', { ascending: false, nullsFirst: false })

    if (!rawClients?.length) { setLoading(false); return }

    const now = Date.now()
    const clientIds = rawClients.map((c: any) => c.id)

    // Parallel fetch all the signal data
    const [
      { data: workoutsWeek },
      { data: workoutsMonth },
      { data: checkinData },
      { data: stressEnergy },
      { data: weights },
      { data: pendingCIs },
    ] = await Promise.all([
      // Workouts this week
      supabase.from('workout_sessions')
        .select('client_id')
        .in('client_id', clientIds)
        .eq('status', 'completed')
        .gte('scheduled_date', localDateStr(new Date(now - 7*86400000))),
      // Workouts this month
      supabase.from('workout_sessions')
        .select('client_id')
        .in('client_id', clientIds)
        .eq('status', 'completed')
        .gte('scheduled_date', localDateStr(new Date(now - 30*86400000))),
      // Last check-in + total per client
      supabase.from('client_form_assignments')
        .select('client_id, completed_at, response')
        .in('client_id', clientIds)
        .eq('status', 'completed')
        .not('checkin_schedule_id', 'is', null)
        .order('completed_at', { ascending: false }),
      // Avg stress + energy (last 30 days)
      supabase.from('client_form_assignments')
        .select('client_id, response')
        .in('client_id', clientIds)
        .eq('status', 'completed')
        .gte('completed_at', new Date(now - 30*86400000).toISOString()),
      // Latest weight per client
      supabase.from('metrics')
        .select('client_id, weight, logged_date')
        .in('client_id', clientIds)
        .not('weight', 'is', null)
        .order('logged_date', { ascending: false }),
      // Pending check-ins
      supabase.from('client_form_assignments')
        .select('client_id')
        .in('client_id', clientIds)
        .eq('status', 'pending')
        .not('checkin_schedule_id', 'is', null),
    ])

    // Aggregate per client
    const weekMap: Record<string,number> = {}
    ;(workoutsWeek || []).forEach((w: any) => weekMap[w.client_id] = (weekMap[w.client_id]||0)+1)

    const monthMap: Record<string,number> = {}
    ;(workoutsMonth || []).forEach((w: any) => monthMap[w.client_id] = (monthMap[w.client_id]||0)+1)

    const lastCIMap: Record<string,string|null> = {}
    const totalCIMap: Record<string,number> = {}
    ;(checkinData || []).forEach((ci: any) => {
      totalCIMap[ci.client_id] = (totalCIMap[ci.client_id]||0)+1
      if (!lastCIMap[ci.client_id]) lastCIMap[ci.client_id] = ci.completed_at
    })

    const stressMap: Record<string,number[]> = {}
    const energyMap: Record<string,number[]> = {}
    ;(stressEnergy || []).forEach((ci: any) => {
      const r = ci.response || {}
      const s = parseFloat(r.stress_score || r.stress)
      const e = parseFloat(r.energy_score)
      if (!isNaN(s)) { if (!stressMap[ci.client_id]) stressMap[ci.client_id] = []; stressMap[ci.client_id].push(s) }
      if (!isNaN(e)) { if (!energyMap[ci.client_id]) energyMap[ci.client_id] = []; energyMap[ci.client_id].push(e) }
    })

    const weightMap: Record<string,string> = {}
    ;(weights || []).forEach((m: any) => { if (!weightMap[m.client_id]) weightMap[m.client_id] = m.weight })

    const pendingMap: Record<string,number> = {}
    ;(pendingCIs || []).forEach((ci: any) => pendingMap[ci.client_id] = (pendingMap[ci.client_id]||0)+1)

    const rows: ClientRow[] = rawClients.map((c: any) => {
      const lastCI = lastCIMap[c.id] || c.last_checkin_at
      const daysSince = lastCI ? Math.floor((now - new Date(lastCI).getTime()) / 86400000) : null
      const avgS = stressMap[c.id]?.length ? stressMap[c.id].reduce((a,b)=>a+b,0)/stressMap[c.id].length : null
      const avgE = energyMap[c.id]?.length ? energyMap[c.id].reduce((a,b)=>a+b,0)/energyMap[c.id].length : null

      const base: Omit<ClientRow,'status'|'score'> = {
        id: c.id,
        full_name: c.profile?.full_name || null,
        display_name: c.display_name || null,
        client_type: c.client_type,
        last_checkin_at: c.last_checkin_at,
        workouts_this_week: weekMap[c.id] || 0,
        workouts_this_month: monthMap[c.id] || 0,
        last_checkin: lastCI,
        total_checkins: totalCIMap[c.id] || 0,
        avg_stress: avgS ? +avgS.toFixed(1) : null,
        avg_energy: avgE ? +avgE.toFixed(1) : null,
        latest_weight: weightMap[c.id] || null,
        pending_checkins: pendingMap[c.id] || 0,
        days_since_checkin: daysSince,
      }
      return { ...base, ...computeStatus(base) }
    }).sort((a, b) => b.score - a.score)

    setClients(rows)
    setLoading(false)
  }

  const visible = filter === 'all' ? clients : clients.filter(c => c.status === filter)
  const name = (c: ClientRow) => c.full_name || c.display_name || 'Unnamed'
  const initials = (c: ClientRow) => name(c).split(' ').map(n=>n[0]).join('').slice(0,2)

  const fmtDays = (d: number | null) => {
    if (d === null) return 'Never'
    if (d === 0) return 'Today'
    if (d === 1) return 'Yesterday'
    return `${d}d ago`
  }

  const counts = {
    all: clients.length,
    quiet: clients.filter(c=>c.status==='quiet').length,
    watch: clients.filter(c=>c.status==='watch').length,
    thriving: clients.filter(c=>c.status==='thriving').length,
    new: clients.filter(c=>c.status==='new').length,
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading client load...</div>
    </div>
  )

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', height:60, display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            ← Back
          </button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>📊 Client Load</div>
          <div style={{ fontSize:12, color:t.textMuted, marginLeft:4 }}>— {clients.length} active clients</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>{ setLoading(true); void load() }}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            ↻ Refresh
          </button>
        </div>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:28 }}>

          {/* Summary cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
            {(['quiet','watch','thriving','new'] as const).map(s => {
              const cfg = STATUS_CONFIG[s]
              return (
                <div key={s} onClick={()=>setFilter(filter===s?'all':s)}
                  style={{ background:filter===s?cfg.bg:t.surface, border:`1px solid ${filter===s?cfg.color+'40':t.border}`, borderRadius:14, padding:'16px 18px', cursor:'pointer', transition:'all 0.15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                    <span style={{ fontSize:16 }}>{cfg.icon}</span>
                    <div style={{ fontSize:13, fontWeight:800, color:cfg.color }}>{cfg.label}</div>
                  </div>
                  <div style={{ fontSize:28, fontWeight:900, color:cfg.color, marginBottom:2 }}>{counts[s]}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>{cfg.desc}</div>
                </div>
              )
            })}
          </div>

          {/* Client rows */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {visible.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'48px', textAlign:'center', color:t.textMuted }}>
                No clients in this category
              </div>
            ) : visible.map(c => {
              const cfg = STATUS_CONFIG[c.status]
              const stressColor = c.avg_stress === null ? t.textMuted : c.avg_stress >= 8 ? t.red : c.avg_stress >= 6 ? t.orange : t.green
              const energyColor = c.avg_energy === null ? t.textMuted : c.avg_energy <= 3 ? t.red : c.avg_energy <= 5 ? t.orange : t.green
              const checkinColor = c.days_since_checkin === null ? t.red : c.days_since_checkin >= 14 ? t.red : c.days_since_checkin >= 7 ? t.orange : t.green
              return (
                <div key={c.id}
                  onClick={()=>router.push('/dashboard/coach/clients/'+c.id)}
                  style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 20px', cursor:'pointer', display:'grid', gridTemplateColumns:'48px 1fr auto', gap:14, alignItems:'center', transition:'border 0.15s' }}>

                  {/* Avatar */}
                  <div style={{ width:48, height:48, borderRadius:14, background:`linear-gradient(135deg,${cfg.color},${cfg.color}88)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:900, color:'#000', flexShrink:0 }}>
                    {initials(c)}
                  </div>

                  {/* Main info */}
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{name(c)}</div>
                      <span style={{ fontSize:10, fontWeight:800, color:cfg.color, background:cfg.bg, borderRadius:20, padding:'2px 9px' }}>{cfg.icon} {cfg.label}</span>
                      {c.client_type === 'offline' && <span style={{ fontSize:10, fontWeight:700, color:t.purple, background:t.purpleDim, borderRadius:20, padding:'2px 8px' }}>In-Person</span>}
                      {c.pending_checkins > 0 && <span style={{ fontSize:10, fontWeight:700, color:t.orange, background:t.orangeDim, borderRadius:20, padding:'2px 8px' }}>📋 Check-in pending</span>}
                    </div>
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap' as const }}>
                      <div style={{ fontSize:12 }}>
                        <span style={{ color:t.textMuted }}>Last check-in: </span>
                        <span style={{ fontWeight:700, color:checkinColor }}>{fmtDays(c.days_since_checkin)}</span>
                      </div>
                      <div style={{ fontSize:12 }}>
                        <span style={{ color:t.textMuted }}>Workouts/wk: </span>
                        <span style={{ fontWeight:700, color: c.workouts_this_week >= 2 ? t.green : c.workouts_this_week === 1 ? t.yellow : t.red }}>{c.workouts_this_week}</span>
                        <span style={{ color:t.textMuted }}> · month: </span>
                        <span style={{ fontWeight:700, color:t.textDim }}>{c.workouts_this_month}</span>
                      </div>
                      {c.avg_stress !== null && (
                        <div style={{ fontSize:12 }}>
                          <span style={{ color:t.textMuted }}>Stress: </span>
                          <span style={{ fontWeight:700, color:stressColor }}>{c.avg_stress}/10</span>
                        </div>
                      )}
                      {c.avg_energy !== null && (
                        <div style={{ fontSize:12 }}>
                          <span style={{ color:t.textMuted }}>Energy: </span>
                          <span style={{ fontWeight:700, color:energyColor }}>{c.avg_energy}/10</span>
                        </div>
                      )}
                      {c.latest_weight && (
                        <div style={{ fontSize:12 }}>
                          <span style={{ color:t.textMuted }}>Weight: </span>
                          <span style={{ fontWeight:700, color:t.textDim }}>{c.latest_weight} lbs</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score bar */}
                  <div style={{ textAlign:'right' as const, minWidth:60 }}>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:4 }}>Attn.</div>
                    <div style={{ width:60, height:6, background:t.surfaceHigh, borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(100,c.score)}%`, borderRadius:4, background:`linear-gradient(90deg,${cfg.color},${cfg.color}cc)`, transition:'width 0.4s' }}/>
                    </div>
                    <div style={{ fontSize:13, fontWeight:900, color:cfg.color, marginTop:3 }}>{c.score}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
