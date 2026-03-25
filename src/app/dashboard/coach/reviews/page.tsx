'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', yellow:'#facc15', yellowDim:'#facc1515',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type Review = {
  id: string
  title: string
  scheduled_date: string
  completed_at: string
  review_due_at: string
  session_rpe: number | null
  energy_level: number | null
  mood: string | null
  notes_client: string | null
  duration_seconds: number | null
  coach_reviewed_at: string | null
  client: { full_name: string | null; id: string } | null
  exercises: Exercise[]
}
type Exercise = {
  id: string
  exercise_name: string
  sets_completed: number | null
  sets_prescribed: number | null
  reps_prescribed: string | null
  notes_client: string | null
  notes_coach: string | null
  client_video_url: string | null
  sets: ExSet[]
}
type ExSet = {
  set_number: number
  reps_completed: number | null
  weight_value: number | null
  weight_unit: string | null
  rpe: number | null
  notes: string | null
}

function urgency(dueAt: string): 'green' | 'yellow' | 'red' | 'overdue' {
  const msLeft = new Date(dueAt).getTime() - Date.now()
  if (msLeft < 0) return 'overdue'
  if (msLeft < 2 * 3600_000) return 'red'
  if (msLeft < 8 * 3600_000) return 'yellow'
  return 'green'
}
function urgencyColor(u: string) {
  if (u === 'overdue') return t.red
  if (u === 'red') return t.red
  if (u === 'yellow') return t.yellow
  return t.green
}
function urgencyBg(u: string) {
  if (u === 'overdue' || u === 'red') return t.redDim
  if (u === 'yellow') return t.yellowDim
  return t.greenDim
}
function urgencyLabel(u: string) {
  if (u === 'overdue') return '🔴 Overdue'
  if (u === 'red') return '🔴 Due Soon'
  if (u === 'yellow') return '🟡 Today'
  return '🟢 On Track'
}
function countdown(dueAt: string): string {
  const msLeft = new Date(dueAt).getTime() - Date.now()
  if (msLeft < 0) {
    const ago = Math.abs(msLeft)
    const h = Math.floor(ago / 3600_000)
    const m = Math.floor((ago % 3600_000) / 60_000)
    return h > 0 ? `${h}h ${m}m overdue` : `${m}m overdue`
  }
  const h = Math.floor(msLeft / 3600_000)
  const m = Math.floor((msLeft % 3600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m left` : `${m}m left`
}
function fmtDuration(s: number | null) {
  if (!s) return '—'
  const m = Math.floor(s / 60)
  return `${m}m`
}
function moodEmoji(m: string | null) {
  const map: Record<string, string> = { great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }
  return m ? (map[m] || m) : '—'
}

export default function ReviewsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Review | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [tick, setTick] = useState(0)

  // Live countdown ticker
  useEffect(() => {
    const id = setInterval(() => setTick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  const loadReviews = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select(`
        id, title, scheduled_date, completed_at, review_due_at,
        session_rpe, energy_level, mood, notes_client,
        duration_seconds, coach_reviewed_at,
        client:clients!workout_sessions_client_id_fkey(
          id,
          profile:profiles!clients_profile_id_fkey(full_name)
        )
      `)
      .eq('coach_id', user.id)
      .eq('status', 'completed')
      .is('coach_reviewed_at', null)
      .not('review_due_at', 'is', null)
      .order('review_due_at', { ascending: true })

    if (!sessions) { setLoading(false); return }

    // Load exercises + sets for each session
    const enriched: Review[] = await Promise.all(sessions.map(async (s: any) => {
      const { data: exs } = await supabase
        .from('session_exercises')
        .select('id, exercise_name, sets_completed, sets_prescribed, reps_prescribed, notes_client, notes_coach, client_video_url')
        .eq('session_id', s.id)
        .order('order_index')

      const exercises: Exercise[] = await Promise.all((exs || []).map(async (ex: any) => {
        const { data: sets } = await supabase
          .from('exercise_sets')
          .select('set_number, reps_completed, weight_value, weight_unit, rpe, notes')
          .eq('session_exercise_id', ex.id)
          .order('set_number')
        return { ...ex, sets: sets || [] }
      }))

      const clientName = (s.client as any)?.profile?.full_name ?? null
      return {
        ...s,
        client: s.client ? { id: s.client.id, full_name: clientName } : null,
        exercises,
      }
    }))

    setReviews(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function markReviewed(sessionId: string) {
    setSaving(true)
    await supabase.from('workout_sessions').update({
      coach_reviewed_at: new Date().toISOString(),
      coach_review_notes: reviewNote || null,
    }).eq('id', sessionId)
    setReviews(prev => prev.filter(r => r.id !== sessionId))
    setSelected(null)
    setReviewNote('')
    setSaving(false)
  }

  const inp = { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'10px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', resize:'vertical' as const }


  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      Loading reviews...
    </div>
  )

  // ── Review detail view ──────────────────────────────────────────────────────
  if (selected) {
    const u = urgency(selected.review_due_at)
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
        <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'20px 16px 100px' }}>

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <button onClick={()=>setSelected(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:22, lineHeight:1 }}>←</button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:900 }}>{selected.title}</div>
              <div style={{ fontSize:12, color:t.textMuted }}>{selected.client?.full_name} · {new Date(selected.completed_at).toLocaleDateString()}</div>
            </div>
            <div style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:800, background:urgencyBg(u), color:urgencyColor(u) }}>
              {urgencyLabel(u)}
            </div>
          </div>

          {/* Countdown bar */}
          <div style={{ background:urgencyBg(u), border:`1px solid ${urgencyColor(u)}40`, borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>{u==='overdue'||u==='red' ? '⏰' : u==='yellow' ? '⚡' : '✅'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:urgencyColor(u) }}>
                {countdown(selected.review_due_at)}
              </div>
              <div style={{ fontSize:11, color:t.textMuted }}>Due {new Date(selected.review_due_at).toLocaleString()}</div>
            </div>
          </div>

          {/* Session stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
            {[
              { label:'Duration', val: fmtDuration(selected.duration_seconds) },
              { label:'Session RPE', val: selected.session_rpe ?? '—' },
              { label:'Energy', val: selected.energy_level ? `${selected.energy_level}/5` : '—' },
              { label:'Mood', val: moodEmoji(selected.mood) },
            ].map(s => (
              <div key={s.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:900 }}>{String(s.val)}</div>
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Client notes */}
          {selected.notes_client && (
            <div style={{ background:'#1a1a0a', border:'1px solid #3a3a1a', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:t.orange, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>Client Notes</div>
              <div style={{ fontSize:13, color:t.text, lineHeight:1.6 }}>{selected.notes_client}</div>
            </div>
          )}


          {/* Exercise breakdown */}
          <div style={{ fontSize:13, fontWeight:800, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Exercises</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            {selected.exercises.map(ex => (
              <div key={ex.id} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <div style={{ fontSize:14, fontWeight:800, flex:1 }}>{ex.exercise_name}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>
                    {ex.sets_completed ?? 0}/{ex.sets_prescribed ?? '?'} sets
                  </div>
                </div>
                {ex.notes_client && (
                  <div style={{ fontSize:12, color:ex.notes_client.startsWith('[SKIPPED]') ? t.textMuted : t.orange, marginBottom:8, fontStyle:'italic' }}>
                    {ex.notes_client}
                  </div>
                )}
                {ex.sets.length > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr 1fr', gap:'4px 10px', fontSize:12 }}>
                    <div style={{ color:t.textMuted, fontWeight:700 }}>#</div>
                    <div style={{ color:t.textMuted, fontWeight:700 }}>Reps</div>
                    <div style={{ color:t.textMuted, fontWeight:700 }}>Weight</div>
                    <div style={{ color:t.textMuted, fontWeight:700 }}>RPE</div>
                    {ex.sets.map(s => (
                      <>
                        <div key={`n-${s.set_number}`} style={{ color:t.textDim }}>{s.set_number}</div>
                        <div key={`r-${s.set_number}`} style={{ color:t.text, fontWeight:700 }}>{s.reps_completed ?? '—'}</div>
                        <div key={`w-${s.set_number}`} style={{ color:t.teal, fontWeight:700 }}>
                          {s.weight_unit === 'bw' ? 'BW' : s.weight_value != null ? `${s.weight_value}${s.weight_unit||'lbs'}` : '—'}
                        </div>
                        <div key={`p-${s.set_number}`} style={{ color:t.orange }}>{s.rpe ?? '—'}</div>
                      </>
                    ))}
                  </div>
                )}
                {ex.client_video_url && (
                  <div style={{ marginTop:10 }}>
                    <a href={ex.client_video_url} target="_blank" rel="noreferrer"
                      style={{ display:'inline-flex', alignItems:'center', gap:6, background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, color:t.teal, textDecoration:'none' }}>
                      📹 View Form Check
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Review notes + mark done */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:8 }}>Your review notes</div>
            <textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder="Good work on the squats — depth looked solid. Let's push the weight 5lbs next week on bench..."
              rows={4}
              style={{ ...inp, marginBottom:12 }}
            />
            <button onClick={() => markReviewed(selected.id)} disabled={saving}
              style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},#00a896)`, border:'none', borderRadius:11, padding:'13px', fontSize:14, fontWeight:800, color:'#0f0f0f', cursor:saving?'not-allowed':'pointer', opacity:saving?0.7:1, fontFamily:"'DM Sans',sans-serif" }}>
              {saving ? 'Saving...' : '✅ Mark as Reviewed'}
            </button>
          </div>

        </div>
      </>
    )
  }


  // ── Inbox view ─────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'20px 16px 80px' }}>

        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:22 }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              Pending Reviews
            </div>
            <div style={{ fontSize:12, color:t.textMuted }}>{reviews.length} workout{reviews.length !== 1 ? 's' : ''} awaiting review</div>
          </div>
        </div>

        {reviews.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>All caught up!</div>
            <div style={{ fontSize:13, color:t.textMuted }}>No pending workout reviews right now.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {reviews.map(r => {
              const u = urgency(r.review_due_at)
              const uc = urgencyColor(u)
              const ub = urgencyBg(u)
              return (
                <button key={r.id} onClick={() => { setSelected(r); setReviewNote('') }}
                  style={{ background:t.surface, border:`1px solid ${u === 'overdue' || u === 'red' ? t.red+'50' : t.border}`, borderRadius:16, padding:'16px', textAlign:'left', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:'50%', background:ub, border:`1px solid ${uc}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                      {u === 'overdue' || u === 'red' ? '🔴' : u === 'yellow' ? '🟡' : '🟢'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <div style={{ fontSize:14, fontWeight:800 }}>{r.client?.full_name || 'Unknown'}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:uc, background:ub, borderRadius:6, padding:'1px 7px' }}>
                          {countdown(r.review_due_at)}
                        </div>
                      </div>
                      <div style={{ fontSize:13, color:t.textDim, marginBottom:4 }}>{r.title}</div>
                      <div style={{ display:'flex', gap:12, fontSize:11, color:t.textMuted }}>
                        <span>🕐 {new Date(r.completed_at).toLocaleDateString()} {new Date(r.completed_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                        {r.duration_seconds && <span>⏱ {fmtDuration(r.duration_seconds)}</span>}
                        {r.session_rpe && <span>RPE {r.session_rpe}</span>}
                        {r.mood && <span>{moodEmoji(r.mood)}</span>}
                      </div>
                      {r.notes_client && (
                        <div style={{ marginTop:6, fontSize:12, color:t.orange, background:'#1a1a0a', borderRadius:8, padding:'6px 10px', lineHeight:1.5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          💬 {r.notes_client}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:20, color:t.textMuted, flexShrink:0 }}>›</div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
