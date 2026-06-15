'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { localDateStr } from '@/lib/date'
import { resolveSignedMediaUrl } from '@/lib/media'
import GifPicker from '@/components/coach/GifPicker'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

function ScorePill({ val, max=10, invert=false }: { val:number|null|undefined, max?:number, invert?:boolean }) {
  if (val == null) return <span style={{ color:t.textMuted }}>—</span>
  const pct = val / max
  const color = invert
    ? (pct >= 0.7 ? t.red : pct >= 0.4 ? t.orange : t.green)
    : (pct >= 0.7 ? t.green : pct >= 0.4 ? t.orange : t.red)
  return <span style={{ fontWeight:800, color }}>{val}/{max}</span>
}

// Read a check-in response value by canonical maps_to alias, with fallback
// to the question's UUID if the response was stored that way (forms/[id]
// route writes question.id keys; dashboard/client/checkin route writes
// maps_to keys -- both end up in the same response JSON column). Same
// helper shape as the client-detail page; kept inline here so this file
// remains independent.
function readResponseValue(response: Record<string, unknown> | null | undefined, questions: Array<{ id: string; maps_to: string | null }> | undefined, ...aliases: string[]): unknown {
  if (!response) return null
  for (const key of aliases) {
    const direct = response[key]
    if (direct !== undefined && direct !== null && direct !== '') return direct
    const q = questions?.find(qq => qq.maps_to === key)
    if (q) {
      const byId = response[q.id]
      if (byId !== undefined && byId !== null && byId !== '') return byId
    }
  }
  return null
}

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState<any[]>([])
  const [clients,  setClients]  = useState<any[]>([])
  const [filter,   setFilter]   = useState<'all'|'unreviewed'>('unreviewed')
  const [selected, setSelected] = useState<any|null>(null)
  const [feedback, setFeedback] = useState('')
  const [feedbackVideo, setFeedbackVideo] = useState('')
  const [feedbackGif, setFeedbackGif] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [questions, setQuestions] = useState<Record<string, any[]>>({}) // formId -> questions
  const [weeklyPulse, setWeeklyPulse] = useState<Record<string, any>>({}) // clientId -> avg scores
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    load()
    // Visibility refetch — clients submit check-ins while coach has the
    // tab in background; this brings new submissions in on tab return.
    let lastRefreshAt = 0
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRefreshAt < 15_000) return
      lastRefreshAt = now
      load()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: clientList } = await supabase
      .from('clients')
      .select('id, profile_id, profile:profiles!clients_profile_id_fkey(full_name)')
      .eq('coach_id', user.id)
    setClients(clientList || [])

    const clientIds = (clientList || []).map((c:any) => c.id)
    if (!clientIds.length) { setLoading(false); return }

    // Explicit columns instead of '*' -- client_form_assignments
    // accumulates timestamp + audit columns the UI never reads, and
    // this query fires on every visibility return. The list still
    // pulls `response` (the long JSONB blob) because the card
    // preview renders snippets from it; a future pass can move the
    // preview to a derived `response_summary` column and defer the
    // full blob until detail-view click.
    const { data } = await supabase
      .from('client_form_assignments')
      .select('id, client_id, form_id, completed_at, coach_response, coach_response_video_url, coach_response_gif_url, response, form:onboarding_forms(title, form_type, is_checkin_type)')
      .in('client_id', clientIds)
      .eq('status', 'completed')
      .not('response', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100)

    // Only show actual check-in type forms
    const checkIns = (data || []).filter(
      (d:any) => {
        const f = Array.isArray(d.form) ? d.form[0] : d.form
        return f?.is_checkin_type || f?.form_type === 'check_in'
      }
    )
    setCheckins(checkIns)

    // Fetch questions for all unique form IDs
    const formIds = [...new Set(checkIns.map((c:any) => c.form_id).filter(Boolean))]
    if (formIds.length > 0) {
      const { data: qData } = await supabase
        .from('onboarding_questions')
        .select('id, form_id, sort_order, label, question_type, maps_to')
        .in('form_id', formIds)
        .order('sort_order')
      const qMap: Record<string, any[]> = {}
      ;(qData || []).forEach((q: any) => {
        if (!qMap[q.form_id]) qMap[q.form_id] = []
        qMap[q.form_id].push(q)
      })
      setQuestions(qMap)
    }

    // Fetch weekly morning pulse averages per client (last 7 days)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = localDateStr(weekAgo)
    const { data: pulseData } = await supabase
      .from('daily_checkins')
      .select('client_id, sleep_quality, energy_score, stress_score, mood_score')
      .in('client_id', clientIds)
      .gte('checkin_date', weekStr)
    const pulseMap: Record<string, any> = {}
    ;(pulseData || []).forEach((p: any) => {
      if (!pulseMap[p.client_id]) pulseMap[p.client_id] = { sleep: [], energy: [], stress: [], mood: [], count: 0 }
      const m = pulseMap[p.client_id]
      if (p.sleep_quality != null) m.sleep.push(p.sleep_quality)
      if (p.energy_score != null) m.energy.push(p.energy_score)
      if (p.stress_score != null) m.stress.push(p.stress_score)
      if (p.mood_score != null) m.mood.push(p.mood_score)
      m.count++
    })
    // Compute averages
    Object.keys(pulseMap).forEach(cid => {
      const m = pulseMap[cid]
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null
      pulseMap[cid] = { sleep: avg(m.sleep), energy: avg(m.energy), stress: avg(m.stress), mood: avg(m.mood), count: m.count }
    })

    // Fetch sleep hours from habit_logs (Sleep habit, last 7 days)
    const { data: sleepHabits } = await supabase
      .from('habits')
      .select('id, client_id')
      .in('client_id', clientIds)
      .ilike('label', '%sleep%')
      .eq('active', true)
    const sleepHabitIds = (sleepHabits || []).map((h: any) => h.id)
    const sleepClientMap: Record<string, string> = {}
    ;(sleepHabits || []).forEach((h: any) => { sleepClientMap[h.id] = h.client_id })

    if (sleepHabitIds.length > 0) {
      const { data: sleepLogs } = await supabase
        .from('habit_logs')
        .select('habit_id, value, logged_date')
        .in('habit_id', sleepHabitIds)
        .gte('logged_date', weekStr)
      const sleepByClient: Record<string, number[]> = {}
      ;(sleepLogs || []).forEach((l: any) => {
        const cid = sleepClientMap[l.habit_id]
        if (!cid) return
        if (!sleepByClient[cid]) sleepByClient[cid] = []
        const val = parseFloat(l.value)
        if (!isNaN(val)) sleepByClient[cid].push(val)
      })
      Object.entries(sleepByClient).forEach(([cid, vals]) => {
        if (!pulseMap[cid]) pulseMap[cid] = {}
        pulseMap[cid].sleepHours = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10
      })
    }

    setWeeklyPulse(pulseMap)

    setLoading(false)
  }

  const clientName = (id: string) => {
    const c = clients.find(c => c.id === id)
    return c?.profile?.full_name || 'Unknown'
  }

  const handleReview = async () => {
    if (!selected) return
    const text = feedback.trim()
    const video = feedbackVideo.trim()
    const gif = feedbackGif.trim()
    if (!text && !video && !gif) { alert('Add a written response, a video link, or a GIF before sending.'); return }
    setSaving(true)
    const respondedAt = new Date().toISOString()
    // Reset seen_at to null so this (re)response surfaces to the client as
    // a fresh, unseen reply on their dashboard.
    const { error } = await supabase.from('client_form_assignments').update({
      coach_response: text || null,
      coach_response_video_url: video || null,
      coach_response_gif_url: gif || null,
      coach_responded_at: respondedAt,
      coach_response_seen_at: null,
    }).eq('id', selected.id)
    setSaving(false)
    if (error) {
      alert('Could not save coach response: ' + error.message)
      return
    }
    setCheckins(prev => prev.map(c => c.id === selected.id
      ? { ...c, coach_response: text || null, coach_response_video_url: video || null, coach_response_gif_url: gif || null, coach_responded_at: respondedAt }
      : c))

    // Notify the client — fire-and-forget (Rule 8). Deep-link to the
    // dashboard where the new check-in reply card appears.
    // send-notification inserts the bell row AND fires push — do NOT also
    // insert into notifications here (double bell rows).
    const profileId = clients.find(c => c.id === selected.client_id)?.profile_id
    if (profileId) {
      const link = '/dashboard/client'
      const title = '💬 Coach replied to your check-in'
      const body = text ? text.slice(0, 100) : 'Tap to see your feedback'
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.access_token) return
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({ user_id: profileId, notification_type: 'review_ready', title, body, link_url: link }),
        }).catch(err => console.warn('[notify:checkin-2]', err))
      }).catch(() => {})
    }

    // Mirror the workout-review flow: submitting returns you to the queue.
    setSelected(null)
    setFeedback('')
    setFeedbackVideo('')
    setFeedbackGif('')
  }

  // A check-in counts as reviewed if the coach replied with text, a video
  // link, OR a GIF -- any of the three leaves the others null.
  const isReviewed = (c: any) => !!(c.coach_response || c.coach_response_video_url || c.coach_response_gif_url)
  const visible = filter === 'unreviewed'
    ? checkins.filter(c => !isReviewed(c))
    : checkins

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading check-ins...</div>
    </div>
  )

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=> selected ? setSelected(null) : router.push('/dashboard/coach')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            ← Back
          </button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>✅ Check-in Reviews</div>
          <div style={{ flex:1 }} />
          {!selected && <div style={{ display:'flex', gap:6 }}>
            {(['unreviewed','all'] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  border:'1px solid '+(filter===f?t.teal+'60':t.border),
                  background:filter===f?t.tealDim:'transparent',
                  color:filter===f?t.teal:t.textDim }}>
                {f === 'unreviewed' ? `Needs Review (${checkins.filter(c=>!isReviewed(c)).length})` : 'All'}
              </button>
            ))}
          </div>}
        </div>

        {/* Single centered column — list OR full-window detail, mirroring the
            workout reviews flow (and finally phone-usable: the old 1fr/440px
            two-column grid was desktop-only). */}
        <div style={{ maxWidth:680, margin:'0 auto', padding:'20px 16px 80px' }}>

          {/* List — hidden while a check-in is open full-window */}
          {!selected && <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {visible.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'56px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>
                  {filter === 'unreviewed' ? 'All caught up!' : 'No check-ins yet'}
                </div>
                <div style={{ fontSize:13, color:t.textMuted }}>
                  {filter === 'unreviewed' ? 'No pending check-ins.' : 'Check-ins will appear once clients submit them.'}
                </div>
              </div>
            ) : visible.map((ci:any) => {
              const r = ci.response || {}
              return (
                <div key={ci.id} onClick={()=>{ setSelected(ci); setFeedback(ci.coach_response||''); setFeedbackVideo(ci.coach_response_video_url||''); setFeedbackGif(ci.coach_response_gif_url||''); window.scrollTo({ top: 0 }) }}
                  style={{ background:t.surface, border:'1px solid '+(selected?.id===ci.id?t.teal+'60':t.border),
                    borderRadius:14, padding:16, cursor:'pointer', transition:'border 0.15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{clientName(ci.client_id)}</div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                        {ci.completed_at ? new Date(ci.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : '—'}
                        {ci.form?.title && <span> · {ci.form.title}</span>}
                      </div>
                    </div>
                    {isReviewed(ci)
                      ? <span style={{ fontSize:10, fontWeight:800, color:t.green, background:t.greenDim, borderRadius:6, padding:'3px 9px' }}>✓ Reviewed</span>
                      : <span style={{ fontSize:10, fontWeight:800, color:t.orange, background:t.orangeDim, borderRadius:6, padding:'3px 9px' }}>Needs Review</span>
                    }
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6 }}>
                    {(() => {
                      const pulse = weeklyPulse[ci.client_id]
                      const qs = questions[ci.form_id]
                      const num = (v: unknown): number | null | undefined => v == null ? v as null : Number(v)
                      return [
                        { label:'Mood',      val: pulse?.mood ?? num(readResponseValue(r, qs, 'mood_score', 'mood')) },
                        { label:'Energy',    val: pulse?.energy ?? num(readResponseValue(r, qs, 'energy_score', 'energy')) },
                        { label:'Sleep Q',   val: pulse?.sleep ?? num(readResponseValue(r, qs, 'sleep_quality', 'sleep')) },
                        { label:'Stress',    val: pulse?.stress ?? num(readResponseValue(r, qs, 'stress', 'stress_score', 'stress_level')), invert:true },
                        { label:'Workout',   val: num(readResponseValue(r, qs, 'workout_adherence')), max:100 },
                        { label:'Nutrition', val: num(readResponseValue(r, qs, 'nutrition_adherence')), max:100 },
                      ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:8, padding:'7px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{s.label}</div>
                        <ScorePill val={s.val} max={s.max||10} invert={s.invert} />
                      </div>
                    ))
                    })()}
                  </div>
                  {(() => {
                    const qs = questions[ci.form_id]
                    const wins = readResponseValue(r, qs, 'wins')
                    const struggles = readResponseValue(r, qs, 'struggles')
                    if (!wins && !struggles) return null
                    return (
                      <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:3 }}>
                        {wins ? <div style={{ fontSize:12, color:t.green }}>🏆 {String(wins)}</div> : null}
                        {struggles ? <div style={{ fontSize:12, color:t.orange }}>⚡ {String(struggles)}</div> : null}
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>}

          {/* Detail — full window, opens on tap, submit returns to the queue */}
          {selected && <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:22 }}>
            {(() => {
              const r = selected.response || {}
              return (
                <>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:2 }}>{clientName(selected.client_id)}</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>
                    {selected.completed_at ? new Date(selected.completed_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }) : '—'}
                    {selected.form?.title && <span> · {selected.form.title}</span>}
                  </div>

                  {/* Score grid — weekly pulse averages */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                    {(() => {
                      const pulse = weeklyPulse[selected.client_id]
                      const qs = questions[selected.form_id]
                      const num = (v: unknown): number | null | undefined => v == null ? v as null : Number(v)
                      return [
                        { label:'Mood',          val: pulse?.mood ?? num(readResponseValue(r, qs, 'mood_score', 'mood')),    color:t.pink   },
                        { label:'Energy',        val: pulse?.energy ?? num(readResponseValue(r, qs, 'energy_score', 'energy')), color:t.yellow },
                        { label:'Sleep Quality', val: pulse?.sleep ?? num(readResponseValue(r, qs, 'sleep_quality', 'sleep')), color:t.purple },
                        { label:'Sleep Hours',   val: pulse?.sleepHours ?? readResponseValue(r, qs, 'sleep_hours', 'hours_of_sleep'), unit:'hrs', raw:true  },
                        { label:'Stress',        val: pulse?.stress ?? num(readResponseValue(r, qs, 'stress', 'stress_score', 'stress_level')), color:t.red, invert:true },
                        { label:'Weight',        val: readResponseValue(r, qs, 'weight', 'weight_lbs'), unit:'lbs', raw:true  },
                      ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                        {(s as any).raw
                          ? <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}${(s as any).unit||''}` : '—'}</div>
                          : <ScorePill val={s.val as number | null | undefined} invert={s.invert} />
                        }
                      </div>
                    ))
                    })()}
                  </div>
                  {(() => {
                    const qs = questions[selected.form_id]
                    const workout = readResponseValue(r, qs, 'workout_adherence')
                    const nutrition = readResponseValue(r, qs, 'nutrition_adherence')
                    const habits = readResponseValue(r, qs, 'habit_adherence')
                    return (
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                        {[
                          { label:'Workout',   val: workout },
                          { label:'Nutrition', val: nutrition },
                          { label:'Habits',    val: habits },
                        ].map(s => (
                          <div key={s.label} style={{ background:t.tealDim, border:'1px solid '+t.teal+'25', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                            <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                            <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}%` : '—'}</div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {(() => {
                    const qs = questions[selected.form_id]
                    const wins = readResponseValue(r, qs, 'wins')
                    const struggles = readResponseValue(r, qs, 'struggles')
                    const goals = readResponseValue(r, qs, 'goals_next_week')
                    const pain = readResponseValue(r, qs, 'pain_notes')
                    const message = readResponseValue(r, qs, 'message_to_coach')
                    return (
                      <>
                        {wins      ? <div style={{ background:t.greenDim,  border:'1px solid '+t.green+'30',  borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green,  marginBottom:8 }}><strong>Wins:</strong> {String(wins)}</div> : null}
                        {struggles ? <div style={{ background:t.orangeDim, border:'1px solid '+t.orange+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.orange, marginBottom:8 }}><strong>Struggles:</strong> {String(struggles)}</div> : null}
                        {goals     ? <div style={{ background:t.purpleDim, border:'1px solid '+t.purple+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.purple, marginBottom:8 }}><strong>Goals next week:</strong> {String(goals)}</div> : null}
                        {pain      ? <div style={{ background:t.redDim,    border:'1px solid '+t.red+'30',    borderRadius:10, padding:'10px 12px', fontSize:12, color:t.red,    marginBottom:8 }}><strong>Pain notes:</strong> {String(pain)}</div> : null}
                        {message   ? <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.teal, marginBottom:8 }}><strong>Message:</strong> {String(message)}</div> : null}
                      </>
                    )
                  })()}

                  {/* Form questions with answers — shown in order */}
                  {(() => {
                    const formQuestions = questions[selected.form_id] || []
                    const knownMappedKeys = new Set(['mood_score','energy_score','sleep_quality','sleep_hours','stress_score','stress','hunger_score','pain_score','pain_notes','weight_lbs','weight','workout_adherence','nutrition_adherence','habit_adherence'])
                    // Show questions that have responses and aren't already shown in the score grid
                    const qAndA = formQuestions
                      .filter((q: any) => {
                        const key = q.maps_to || q.id
                        const val = r[key] ?? r[q.id]
                        return val != null && String(val).trim() !== '' && !knownMappedKeys.has(key)
                      })
                      .map((q: any) => ({
                        label: q.label,
                        value: r[q.maps_to || q.id] ?? r[q.id],
                        type: q.question_type,
                      }))

                    if (!qAndA.length) return null
                    return (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Responses</div>
                        {qAndA.map((qa: any, i: number) => (
                          <div key={i} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:t.teal, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{qa.label}</div>
                            {qa.type === 'file' || String(qa.value).startsWith('http') ? (
                              (() => {
                                // File-question answers store an array of raw
                                // storage paths (or a single path / legacy URL
                                // string). Bucket is private (progress-photos)
                                // so we sign on click. resolveSignedMediaUrl
                                // passes through already-signed http URLs, so
                                // legacy data still opens correctly.
                                const paths: string[] = Array.isArray(qa.value)
                                  ? (qa.value as any[]).map(String).filter(Boolean)
                                  : [String(qa.value)].filter(Boolean)
                                return (
                                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                                    {paths.map((p, idx) => (
                                      <button
                                        key={idx}
                                        onClick={async () => {
                                          const url = await resolveSignedMediaUrl(supabase, 'progress-photos', p)
                                          if (url) window.open(url, '_blank', 'noopener,noreferrer')
                                          else alert('Could not open photo. The file may be missing or you may not have access.')
                                        }}
                                        style={{ background:'none', border:'none', color:t.teal, fontSize:12, cursor:'pointer', textDecoration:'underline', textAlign:'left' as const, padding:0, fontFamily:"'DM Sans',sans-serif" }}>
                                        📸 View photo{paths.length > 1 ? ' ' + (idx + 1) : ''}
                                      </button>
                                    ))}
                                  </div>
                                )
                              })()
                            ) : (
                              <div style={{ fontSize:13, color:t.text, lineHeight:1.5 }}>{String(qa.value)}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Previous coach response if exists */}
                  {(selected.coach_response || selected.coach_response_video_url || selected.coach_response_gif_url) && (
                    <div style={{ background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green, marginBottom:12 }}>
                      {selected.coach_response && <div><strong>Your previous response:</strong> {selected.coach_response}</div>}
                      {selected.coach_response_video_url && (
                        <a href={selected.coach_response_video_url} target="_blank" rel="noreferrer"
                          style={{ display:'inline-block', marginTop: selected.coach_response ? 6 : 0, color:t.teal, fontWeight:700, textDecoration:'underline' }}>
                          📹 View video reply ↗
                        </a>
                      )}
                      {selected.coach_response_gif_url && (
                        <img src={selected.coach_response_gif_url} alt="GIF reply" style={{ display:'block', marginTop:8, maxWidth:160, borderRadius:8 }} />
                      )}
                    </div>
                  )}

                  {/* Coach feedback */}
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Your Response</div>
                    <textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder="Reply to this check-in... (client will see this)"
                      rows={4}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10,
                        padding:'10px 13px', fontSize:13, color:t.text, outline:'none',
                        fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark',
                        boxSizing:'border-box' as any, lineHeight:1.5 }} />
                    {/* Video link — Cap / Loom / Drive. Optional; pairs with or
                        replaces the written note (parity with workout reviews). */}
                    <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:8, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'0 13px' }}>
                      <span style={{ fontSize:15, flexShrink:0 }}>🔗</span>
                      <input value={feedbackVideo} onChange={e=>setFeedbackVideo(e.target.value)}
                        placeholder="Paste a video link (Cap, Loom, Drive...)"
                        style={{ flex:1, background:'transparent', border:'none', padding:'11px 0', fontSize:13, color:t.text, outline:'none',
                          fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                    </div>
                    {/* GIF reaction — same GIPHY picker as the messenger */}
                    <div style={{ marginTop:10 }}>
                      <GifPicker value={feedbackGif} onPick={setFeedbackGif} onClear={()=>setFeedbackGif('')} />
                    </div>
                    {(() => {
                      const canSend = !!(feedback.trim() || feedbackVideo.trim() || feedbackGif.trim())
                      const hadResponse = selected.coach_response || selected.coach_response_video_url || selected.coach_response_gif_url
                      return (
                        <button onClick={handleReview} disabled={saving || !canSend}
                          style={{ marginTop:10, width:'100%',
                            background:!canSend ? t.surfaceHigh : 'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',
                            border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800,
                            color:!canSend ? t.textMuted : '#000',
                            cursor:(saving || !canSend)?'not-allowed':'pointer',
                            fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
                          {saving ? 'Saving...' : hadResponse ? '✓ Update Response' : '✓ Send Response'}
                        </button>
                      )
                    })()}
                  </div>
                </>
              )
            })()}
          </div>}

        </div>
      </div>
    </>
  )
}
