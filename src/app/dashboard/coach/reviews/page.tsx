'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
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
  id: string; title: string; scheduled_date: string; completed_at: string
  review_due_at: string; session_rpe: number | null; energy_level: number | null
  mood: string | null; notes_client: string | null; duration_seconds: number | null
  coach_reviewed_at: string | null; coach_review_video_url: string | null
  client: { full_name: string | null; id: string } | null
  exercises: Exercise[]
}
type Exercise = {
  id: string; exercise_name: string; sets_completed: number | null
  sets_prescribed: number | null; reps_prescribed: string | null
  notes_client: string | null; notes_coach: string | null
  client_video_url: string | null; sets: ExSet[]
}
type ExSet = {
  set_number: number; reps_completed: number | null; weight_value: number | null
  weight_unit: string | null; rpe: number | null; notes: string | null
}

function urgency(dueAt: string): 'green'|'yellow'|'red'|'overdue' {
  const ms = new Date(dueAt).getTime() - Date.now()
  if (ms < 0) return 'overdue'
  if (ms < 2*3600_000) return 'red'
  if (ms < 8*3600_000) return 'yellow'
  return 'green'
}
const urgencyColor = (u:string) => u==='overdue'||u==='red' ? t.red : u==='yellow' ? t.yellow : t.green
const urgencyBg    = (u:string) => u==='overdue'||u==='red' ? t.redDim : u==='yellow' ? t.yellowDim : t.greenDim
const urgencyLabel = (u:string) => u==='overdue' ? '🔴 Overdue' : u==='red' ? '🔴 Due Soon' : u==='yellow' ? '🟡 Today' : '🟢 On Track'
function countdown(dueAt: string) {
  const ms = new Date(dueAt).getTime() - Date.now()
  if (ms < 0) { const a=Math.abs(ms); const h=Math.floor(a/3600_000); const m=Math.floor((a%3600_000)/60_000); return h>0?`${h}h ${m}m overdue`:`${m}m overdue` }
  const h=Math.floor(ms/3600_000); const m=Math.floor((ms%3600_000)/60_000)
  return h>0?`${h}h ${m}m left`:`${m}m left`
}
const fmtDuration = (s:number|null) => s ? `${Math.floor(s/60)}m` : '—'
const moodEmoji = (m:string|null) => ({ great:'😄',good:'🙂',okay:'😐',tired:'😴',awful:'😓' } as any)[m||''] || '—'

// Inline video player component
function VideoPlayer({ url, label }: { url: string; label: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ marginTop:10 }}>
      {!open ? (
        <button onClick={()=>setOpen(true)}
          style={{ display:'inline-flex', alignItems:'center', gap:6, background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          ▶ {label}
        </button>
      ) : (
        <div style={{ background:'#000', borderRadius:10, overflow:'hidden', position:'relative' }}>
          <video src={url} controls autoPlay playsInline
            style={{ width:'100%', maxHeight:320, display:'block' }}/>
          <button onClick={()=>setOpen(false)}
            style={{ position:'absolute', top:8, right:8, background:'rgba(0,0,0,0.6)', border:'none', borderRadius:6, padding:'4px 8px', fontSize:11, color:'#fff', cursor:'pointer' }}>
            ✕ Close
          </button>
        </div>
      )}
    </div>
  )
}

export default function ReviewsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Review | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [reviewVideoUrl, setReviewVideoUrl] = useState('')
  const [uploadingVideo, setUploadingVideo] = useState(false)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(n => n+1), 30_000)
    return () => clearInterval(id)
  }, [])

  const loadReviews = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select(`id, title, scheduled_date, completed_at, review_due_at,
        session_rpe, energy_level, mood, notes_client, duration_seconds,
        coach_reviewed_at, coach_review_video_url,
        client:clients!workout_sessions_client_id_fkey(
          id, profile:profiles!clients_profile_id_fkey(full_name)
        )`)
      .eq('coach_id', user.id).eq('status', 'completed')
      .is('coach_reviewed_at', null).not('review_due_at', 'is', null)
      .order('review_due_at', { ascending: true })
    if (!sessions) { setLoading(false); return }
    const enriched: Review[] = await Promise.all(sessions.map(async (s: any) => {
      const { data: exs } = await supabase
        .from('session_exercises')
        .select('id, exercise_name, sets_completed, sets_prescribed, reps_prescribed, notes_client, notes_coach, client_video_url')
        .eq('session_id', s.id).order('order_index')
      const exercises: Exercise[] = await Promise.all((exs||[]).map(async (ex: any) => {
        const { data: sets } = await supabase
          .from('exercise_sets')
          .select('set_number, reps_completed, weight_value, weight_unit, rpe, notes')
          .eq('session_exercise_id', ex.id).order('set_number')
        return { ...ex, sets: sets || [] }
      }))
      return { ...s, client: s.client ? { id:s.client.id, full_name:(s.client as any)?.profile?.full_name??null } : null, exercises }
    }))
    setReviews(enriched)
    setLoading(false)
  }, [])

  useEffect(() => { loadReviews() }, [loadReviews])

  async function uploadReviewVideo(file: File, sessionId: string) {
    setUploadingVideo(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploadingVideo(false); return }
    const ext = file.name.split('.').pop() || 'mp4'
    const path = `${user.id}/${sessionId}/review_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('workout-reviews').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('workout-reviews').getPublicUrl(path)
      setReviewVideoUrl(urlData.publicUrl)
    }
    setUploadingVideo(false)
  }

  async function markReviewed(sessionId: string) {
    setSaving(true)
    await supabase.from('workout_sessions').update({
      coach_reviewed_at: new Date().toISOString(),
      coach_review_notes: reviewNote || null,
      coach_review_video_url: reviewVideoUrl || null,
    }).eq('id', sessionId)
    setReviews(prev => prev.filter(r => r.id !== sessionId))
    setSelected(null); setReviewNote(''); setReviewVideoUrl('')
    setSaving(false)
  }

  const inp = { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'10px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none', resize:'vertical' as const }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      Loading reviews...
    </div>
  )

  // ── Detail view ──────────────────────────────────────────────────────────
  if (selected) {
    const u = urgency(selected.review_due_at)
    const hasFormChecks = selected.exercises.some(ex => ex.client_video_url)
    return (
      <>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
        <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'20px 16px 100px' }}>

          <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
            <button onClick={()=>{setSelected(null);setReviewVideoUrl('')}} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:22 }}>←</button>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:18, fontWeight:900 }}>{selected.title}</div>
              <div style={{ fontSize:12, color:t.textMuted }}>{selected.client?.full_name} · {new Date(selected.completed_at).toLocaleDateString()}</div>
            </div>
            <div style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:800, background:urgencyBg(u), color:urgencyColor(u) }}>
              {urgencyLabel(u)}
            </div>
          </div>

          {/* Countdown */}
          <div style={{ background:urgencyBg(u), border:`1px solid ${urgencyColor(u)}40`, borderRadius:12, padding:'10px 14px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:18 }}>{u==='overdue'||u==='red'?'⏰':u==='yellow'?'⚡':'✅'}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:800, color:urgencyColor(u) }}>{countdown(selected.review_due_at)}</div>
              <div style={{ fontSize:11, color:t.textMuted }}>Due {new Date(selected.review_due_at).toLocaleString()}</div>
            </div>
          </div>

          {/* Session stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16 }}>
            {[{label:'Duration',val:fmtDuration(selected.duration_seconds)},{label:'Session RPE',val:selected.session_rpe??'—'},{label:'Energy',val:selected.energy_level?`${selected.energy_level}/5`:'—'},{label:'Mood',val:moodEmoji(selected.mood)}].map(s=>(
              <div key={s.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                <div style={{ fontSize:16, fontWeight:900 }}>{String(s.val)}</div>
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Client notes */}
          {selected.notes_client && (
            <div style={{ background:'#1a1a0a', border:'1px solid #3a3a1a', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:800, color:t.orange, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:4 }}>💬 Client Notes</div>
              <div style={{ fontSize:13, color:t.text, lineHeight:1.6 }}>{selected.notes_client}</div>
            </div>
          )}

          {/* Exercise breakdown */}
          <div style={{ fontSize:11, fontWeight:800, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Exercises</div>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:20 }}>
            {selected.exercises.map(ex => (
              <div key={ex.id} style={{ background:t.surface, border:`1px solid ${ex.client_video_url?t.teal+'40':t.border}`, borderRadius:14, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ fontSize:14, fontWeight:800, flex:1 }}>{ex.exercise_name}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>{ex.sets_completed??0}/{ex.sets_prescribed??'?'} sets</div>
                  {ex.client_video_url && <span style={{ fontSize:11, fontWeight:800, color:t.teal, background:t.tealDim, borderRadius:6, padding:'2px 8px' }}>📹 Form Check</span>}
                </div>
                {ex.notes_client && (
                  <div style={{ fontSize:12, color:ex.notes_client.startsWith('[SKIPPED]')?t.textMuted:t.orange, marginBottom:8, fontStyle:'italic' }}>{ex.notes_client}</div>
                )}
                {ex.sets.length > 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'auto 1fr 1fr 1fr', gap:'4px 10px', fontSize:12, marginBottom: ex.client_video_url ? 8 : 0 }}>
                    {['#','Reps','Weight','RPE'].map(h=><div key={h} style={{ color:t.textMuted, fontWeight:700 }}>{h}</div>)}
                    {ex.sets.map(s=>(
                      <>
                        <div key={`n${s.set_number}`} style={{ color:t.textDim }}>{s.set_number}</div>
                        <div key={`r${s.set_number}`} style={{ color:t.text, fontWeight:700 }}>{s.reps_completed??'—'}</div>
                        <div key={`w${s.set_number}`} style={{ color:t.teal, fontWeight:700 }}>{s.weight_unit==='bw'?'BW':s.weight_value!=null?`${s.weight_value}${s.weight_unit||'lbs'}`:'—'}</div>
                        <div key={`p${s.set_number}`} style={{ color:t.orange }}>{s.rpe??'—'}</div>
                      </>
                    ))}
                  </div>
                )}
                {/* Inline form check video */}
                {ex.client_video_url && (
                  <VideoPlayer url={ex.client_video_url} label="Watch Form Check" />
                )}
              </div>
            ))}
          </div>


          {/* ── COACH REVIEW SECTION ── */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>Your Review</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:14, lineHeight:1.5 }}>
              Leave a video review and/or written notes. {hasFormChecks ? 'Client submitted form check videos above.' : ''}
            </div>

            {/* Video review section */}
            <div style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:14, marginBottom:12 }}>
              <div style={{ fontSize:12, fontWeight:800, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>📹 Review Video</div>

              {reviewVideoUrl ? (
                /* Video uploaded — show player + option to replace */
                <div>
                  <video src={reviewVideoUrl} controls playsInline style={{ width:'100%', borderRadius:8, maxHeight:240, background:'#000', display:'block', marginBottom:8 }}/>
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontSize:12, color:t.green, fontWeight:700, flex:1 }}>✓ Review video ready</span>
                    <label style={{ fontSize:11, color:t.textMuted, cursor:'pointer', fontWeight:600 }}>
                      Replace
                      <input type="file" accept="video/*" style={{ display:'none' }}
                        onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadReviewVideo(f, selected.id) }}/>
                    </label>
                  </div>
                </div>
              ) : uploadingVideo ? (
                <div style={{ textAlign:'center', padding:'20px 0', color:t.teal, fontSize:13, fontWeight:700 }}>Uploading video...</div>
              ) : (
                /* Upload options */
                <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:'16px', cursor:'pointer', width:'100%' }}>
                  <span style={{ fontSize:24 }}>📹</span>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color:t.text }}>Choose Video</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>Record with camera or pick from files</div>
                  </div>
                  <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{ display:'none' }}
                    onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadReviewVideo(f, selected.id) }}/>
                </label>
              )}
            </div>

            {/* Written notes */}
            <textarea
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder={hasFormChecks
                ? "Great form on the squat — depth was solid. On bench, watch the bar path on the descent..."
                : "Good work today. Let's push the weight 5lbs on squats next session..."}
              rows={4}
              style={{ ...inp, marginBottom:12 }}
            />

            <button onClick={()=>markReviewed(selected.id)} disabled={saving||(!reviewNote.trim()&&!reviewVideoUrl)}
              style={{ width:'100%', background:(!reviewNote.trim()&&!reviewVideoUrl)?t.surfaceHigh:`linear-gradient(135deg,${t.teal},#00a896)`, border:'none', borderRadius:11, padding:'13px', fontSize:14, fontWeight:800, color:(!reviewNote.trim()&&!reviewVideoUrl)?t.textMuted:'#0f0f0f', cursor:(saving||(!reviewNote.trim()&&!reviewVideoUrl))?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {saving ? 'Saving...' : '✅ Send Review to Client'}
            </button>
            {!reviewNote.trim() && !reviewVideoUrl && (
              <div style={{ fontSize:11, color:t.textMuted, textAlign:'center', marginTop:6 }}>Add a video or written notes to send your review</div>
            )}
          </div>

        </div>
      </>
    )
  }

  // ── Inbox view ──────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'20px 16px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:22 }}>←</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Pending Reviews</div>
            <div style={{ fontSize:12, color:t.textMuted }}>{reviews.length} workout{reviews.length!==1?'s':''} awaiting review</div>
          </div>
        </div>
        {reviews.length === 0 ? (
          <div style={{ textAlign:'center', padding:'80px 20px' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>All caught up!</div>
            <div style={{ fontSize:13, color:t.textMuted }}>No pending workout reviews.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {reviews.map(r => {
              const u=urgency(r.review_due_at); const uc=urgencyColor(u); const ub=urgencyBg(u)
              const hasVideo = r.exercises.some(ex => ex.client_video_url)
              return (
                <button key={r.id} onClick={()=>{setSelected(r);setReviewNote('');setReviewVideoUrl('')}}
                  style={{ background:t.surface, border:`1px solid ${u==='overdue'||u==='red'?t.red+'50':t.border}`, borderRadius:16, padding:'16px', textAlign:'left', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                    <div style={{ width:44, height:44, borderRadius:'50%', background:ub, border:`1px solid ${uc}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                      {u==='overdue'||u==='red'?'🔴':u==='yellow'?'🟡':'🟢'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2, flexWrap:'wrap' as const }}>
                        <div style={{ fontSize:14, fontWeight:800 }}>{r.client?.full_name||'Unknown'}</div>
                        <div style={{ fontSize:11, fontWeight:700, color:uc, background:ub, borderRadius:6, padding:'1px 7px' }}>{countdown(r.review_due_at)}</div>
                        {hasVideo && <div style={{ fontSize:11, fontWeight:700, color:t.teal, background:t.tealDim, borderRadius:6, padding:'1px 7px' }}>📹 Form Check</div>}
                      </div>
                      <div style={{ fontSize:13, color:t.textDim, marginBottom:4 }}>{r.title}</div>
                      <div style={{ display:'flex', gap:12, fontSize:11, color:t.textMuted }}>
                        <span>🕐 {new Date(r.completed_at).toLocaleDateString()} {new Date(r.completed_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                        {r.duration_seconds&&<span>⏱ {fmtDuration(r.duration_seconds)}</span>}
                        {r.session_rpe&&<span>RPE {r.session_rpe}</span>}
                        {r.mood&&<span>{moodEmoji(r.mood)}</span>}
                      </div>
                      {r.notes_client&&(
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
