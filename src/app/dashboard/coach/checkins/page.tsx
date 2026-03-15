'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

function ScorePill({ val, max=10, invert=false }: { val:number|null, max?:number, invert?:boolean }) {
  if (val == null) return <span style={{ color:t.textMuted }}>—</span>
  const pct = val / max
  const color = invert
    ? (pct >= 0.7 ? t.red : pct >= 0.4 ? t.orange : t.green)
    : (pct >= 0.7 ? t.green : pct >= 0.4 ? t.orange : t.red)
  return <span style={{ fontWeight:800, color }}>{val}/{max}</span>
}

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState<any[]>([])
  const [clients, setClients] = useState<any[]>([])
  const [filter, setFilter] = useState<'all'|'unreviewed'>('unreviewed')
  const [selected, setSelected] = useState<any|null>(null)
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: clientList } = await supabase
      .from('clients')
      .select('id, profile:profiles!clients_profile_id_fkey(full_name, avatar_url)')
      .eq('coach_id', user.id)
    setClients(clientList || [])

    const clientIds = (clientList || []).map((c:any) => c.id)
    if (clientIds.length === 0) { setLoading(false); return }

    const { data } = await supabase
      .from('checkins')
      .select('*')
      .in('client_id', clientIds)
      .order('submitted_at', { ascending: false })
      .limit(100)
    setCheckins(data || [])
    setLoading(false)
  }

  const clientName = (id: string) => {
    const c = clients.find(c => c.id === id)
    return c?.profile?.full_name || 'Unknown'
  }

  const handleReview = async () => {
    if (!selected) return
    setSaving(true)
    await supabase.from('checkins').update({
      coach_reviewed: true,
      coach_feedback: feedback,
      reviewed_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setCheckins(prev => prev.map(c => c.id === selected.id
      ? { ...c, coach_reviewed: true, coach_feedback: feedback }
      : c))
    setSaving(false)
    setSelected(null)
    setFeedback('')
  }

  const visible = filter === 'unreviewed'
    ? checkins.filter(c => !c.coach_reviewed)
    : checkins

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading check-ins...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>✅ Check-in Reviews</div>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:6 }}>
            {(['unreviewed','all'] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid '+(filter===f?t.teal+'60':t.border), background:filter===f?t.tealDim:'transparent', color:filter===f?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                {f === 'unreviewed' ? `Needs Review (${checkins.filter(c=>!c.coach_reviewed).length})` : 'All'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:28, display:'grid', gridTemplateColumns:'1fr 420px', gap:20, alignItems:'start' }}>

          {/* Left: list */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {visible.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'56px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>
                  {filter === 'unreviewed' ? 'All caught up!' : 'No check-ins yet'}
                </div>
                <div style={{ fontSize:13, color:t.textMuted }}>
                  {filter === 'unreviewed' ? 'No pending check-ins to review.' : 'Check-ins will appear here once clients submit them.'}
                </div>
              </div>
            ) : visible.map((ci:any) => (
              <div key={ci.id} onClick={()=>{ setSelected(ci); setFeedback(ci.coach_feedback||'') }}
                style={{ background:t.surface, border:'1px solid '+(selected?.id===ci.id?t.teal+'60':t.border), borderRadius:14, padding:18, cursor:'pointer', transition:'border 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{clientName(ci.client_id)}</div>
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                      {ci.submitted_at ? new Date(ci.submitted_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : '—'}
                      {ci.week_start && <span> · Week of {new Date(ci.week_start).toLocaleDateString([], { month:'short', day:'numeric' })}</span>}
                    </div>
                  </div>
                  {ci.coach_reviewed
                    ? <span style={{ fontSize:10, fontWeight:800, color:t.green, background:t.greenDim, borderRadius:6, padding:'3px 9px' }}>✓ Reviewed</span>
                    : <span style={{ fontSize:10, fontWeight:800, color:t.orange, background:t.orangeDim, borderRadius:6, padding:'3px 9px' }}>Needs Review</span>
                  }
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8 }}>
                  {[
                    { label:'Mood',      val:ci.mood_score },
                    { label:'Energy',    val:ci.energy_score },
                    { label:'Sleep Q',   val:ci.sleep_quality },
                    { label:'Stress',    val:ci.stress, invert:true },
                    { label:'Workout %', val:ci.workout_adherence, max:100 },
                    { label:'Nutrition %', val:ci.nutrition_adherence, max:100 },
                  ].map(s => (
                    <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{s.label}</div>
                      <ScorePill val={s.val} max={s.max||10} invert={s.invert} />
                    </div>
                  ))}
                </div>
                {(ci.wins || ci.struggles) && (
                  <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:4 }}>
                    {ci.wins && <div style={{ fontSize:12, color:t.green }}>🏆 {ci.wins}</div>}
                    {ci.struggles && <div style={{ fontSize:12, color:t.orange }}>⚡ {ci.struggles}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Right: detail + review panel */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:22, position:'sticky', top:20 }}>
            {!selected ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:t.textMuted }}>
                <div style={{ fontSize:28, marginBottom:10 }}>👈</div>
                <div style={{ fontSize:13 }}>Select a check-in to review</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>{clientName(selected.client_id)}</div>
                <div style={{ fontSize:12, color:t.textMuted, marginBottom:18 }}>
                  {selected.submitted_at ? new Date(selected.submitted_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }) : '—'}
                </div>

                {/* Score grid */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                  {[
                    { label:'Mood',          val:selected.mood_score,        color:t.pink   },
                    { label:'Energy',        val:selected.energy_score,      color:t.yellow },
                    { label:'Sleep Quality', val:selected.sleep_quality,     color:t.purple },
                    { label:'Sleep Hours',   val:selected.sleep_hours, unit:'hrs', raw:true },
                    { label:'Stress',        val:selected.stress,            color:t.red,   invert:true },
                    { label:'Hunger',        val:selected.hunger_score,      color:t.orange },
                    { label:'Pain',          val:selected.pain_score,        color:t.red,   invert:true },
                    { label:'Weight',        val:selected.weight, unit:'lbs', raw:true      },
                  ].map(s => (
                    <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                      {s.raw
                        ? <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}${s.unit||''}` : '—'}</div>
                        : <ScorePill val={s.val} invert={s.invert} />
                      }
                    </div>
                  ))}
                </div>

                {/* Adherence */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                  {[
                    { label:'Workout',   val:selected.workout_adherence },
                    { label:'Nutrition', val:selected.nutrition_adherence },
                    { label:'Habits',    val:selected.habit_adherence },
                  ].map(s => (
                    <div key={s.label} style={{ background:t.tealDim, border:'1px solid '+t.teal+'25', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                      <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                      <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}%` : '—'}</div>
                    </div>
                  ))}
                </div>

                {/* Text fields */}
                {selected.wins && <div style={{ background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green, marginBottom:8 }}><strong>Wins:</strong> {selected.wins}</div>}
                {selected.struggles && <div style={{ background:t.orangeDim, border:'1px solid '+t.orange+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.orange, marginBottom:8 }}><strong>Struggles:</strong> {selected.struggles}</div>}
                {selected.goals_next_week && <div style={{ background:t.purpleDim, border:'1px solid '+t.purple+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.purple, marginBottom:8 }}><strong>Goals next week:</strong> {selected.goals_next_week}</div>}
                {selected.pain_notes && <div style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.red, marginBottom:8 }}><strong>Pain notes:</strong> {selected.pain_notes}</div>}
                {selected.coach_message && <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.teal, marginBottom:8 }}><strong>Message to coach:</strong> {selected.coach_message}</div>}

                {/* Coach feedback */}
                <div style={{ marginTop:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Your Feedback</div>
                  <textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                    placeholder="Reply to this check-in... (client will see this)"
                    rows={4}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.5 }} />
                  <button onClick={handleReview} disabled={saving}
                    style={{ marginTop:10, width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
                    {saving ? 'Saving...' : selected.coach_reviewed ? '✓ Update Review' : '✓ Mark as Reviewed'}
                  </button>
                </div>
              </>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
