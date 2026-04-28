'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { resolveSignedMediaUrl } from '@/lib/media'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', yellow:'#facc15', yellowDim:'#facc1515',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const MOOD_EMOJI: Record<string, string> = {
  great:'😄',
  good:'🙂',
  okay:'😐',
  tired:'😴',
  awful:'😓',
}

type Review = {
  id: string; title: string; scheduled_date: string; completed_at: string
  review_due_at: string; session_rpe: number | null; energy_level: number | null
  mood: string | null; notes_client: string | null; duration_seconds: number | null
  coach_reviewed_at: string | null; coach_review_video_url: string | null
  client: { full_name: string | null; id: string; profile_id?: string | null } | null
  exercises: Exercise[]
}
type Exercise = {
  id: string; exercise_name: string; sets_completed: number | null
  sets_prescribed: number | null; reps_prescribed: string | null
  notes_client: string | null; notes_coach: string | null
  client_video_url: string | null; original_exercise_name?: string | null
  swap_reason?: string | null; swap_note?: string | null; skipped?: boolean | null
  skip_reason?: string | null; skip_note?: string | null; sets: ExSet[]
}
type ExSet = {
  set_number: number; reps_completed: number | null; weight_value: number | null
  weight_unit: string | null; rpe: number | null; notes: string | null
}

type WorkoutSessionRow = {
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
  coach_review_video_url: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any
}

type SessionExerciseRow = {
  id: string
  exercise_name: string
  sets_completed: number | null
  sets_prescribed: number | null
  reps_prescribed: string | null
  notes_client: string | null
  notes_coach: string | null
  client_video_url: string | null
  original_exercise_name?: string | null
  swap_reason?: string | null
  swap_note?: string | null
  skipped?: boolean | null
  skip_reason?: string | null
  skip_note?: string | null
}

type ReviewIntelligence = {
  skippedCount: number
  swapCount: number
  formCheckCount: number
  highRpeSetCount: number
  incompleteExerciseCount: number
  lowEnergy: boolean
  frictionScore: number
  coachFocus: string
  hotspotExercises: string[]
  frictionReasons: string[]
  summary: string
  tags: Array<{ label: string; color: string; bg: string }>
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
const moodEmoji = (m:string|null) => (m ? MOOD_EMOJI[m] : undefined) || '—'

function getReviewIntelligence(review: Review): ReviewIntelligence {
  const skippedCount = review.exercises.filter(ex => ex.skipped).length
  const swapCount = review.exercises.filter(ex => !!ex.original_exercise_name).length
  const formCheckCount = review.exercises.filter(ex => !!ex.client_video_url).length
  const allSets = review.exercises.flatMap(ex => ex.sets || [])
  const highRpeSetCount = allSets.filter(setRow => (setRow.rpe || 0) >= 9).length
  const incompleteExerciseCount = review.exercises.filter(ex => !ex.skipped && (ex.sets_completed || 0) < (ex.sets_prescribed || 0)).length
  const lowEnergy = (review.energy_level || 0) <= 2 || review.mood === 'tired' || review.mood === 'awful'
  const frictionScore = skippedCount * 3 + swapCount * 2 + formCheckCount + highRpeSetCount + incompleteExerciseCount + (lowEnergy ? 2 : 0)
  const hotspotExercises = review.exercises
    .filter(ex => ex.skipped || ex.original_exercise_name || !!ex.client_video_url || (ex.sets_completed || 0) < (ex.sets_prescribed || 0))
    .map(ex => ex.exercise_name)
    .slice(0, 3)
  const frictionReasons = Array.from(new Set(
    review.exercises
      .flatMap(ex => [ex.skip_reason, ex.swap_reason, ex.skip_note, ex.swap_note])
      .filter(Boolean)
      .map(reason => String(reason).trim())
      .filter(Boolean)
  )).slice(0, 3)
  const coachFocus = skippedCount > 0
    ? 'Review why the skipped movements were not completed and decide if the plan needs a cleaner alternative.'
    : swapCount > 0
      ? 'Check whether the repeated swaps point to an exercise mismatch or equipment limitation.'
      : lowEnergy || highRpeSetCount > 0
        ? 'Recovery looks like the first thing to evaluate before pushing progression.'
        : formCheckCount > 0
          ? 'Use the submitted videos to tighten execution and reinforce the most important movement cues.'
          : incompleteExerciseCount > 0
            ? 'Look at where session completion dropped off and decide if fatigue, time, or buy-in was the blocker.'
            : 'This session looks clean, so the review can focus on reinforcement and next-step progression.'
  const summaryParts = [
    skippedCount ? `${skippedCount} skipped` : null,
    swapCount ? `${swapCount} swapped` : null,
    formCheckCount ? `${formCheckCount} form check${formCheckCount !== 1 ? 's' : ''}` : null,
    highRpeSetCount ? `${highRpeSetCount} high-RPE set${highRpeSetCount !== 1 ? 's' : ''}` : null,
    incompleteExerciseCount ? `${incompleteExerciseCount} incomplete exercise${incompleteExerciseCount !== 1 ? 's' : ''}` : null,
    lowEnergy ? 'low recovery signal' : null,
  ].filter(Boolean)

  const tags = [
    skippedCount ? { label:`${skippedCount} skipped`, color:t.red, bg:t.redDim } : null,
    swapCount ? { label:`${swapCount} swaps`, color:t.teal, bg:t.tealDim } : null,
    formCheckCount ? { label:`${formCheckCount} videos`, color:t.teal, bg:t.tealDim } : null,
    highRpeSetCount ? { label:'High RPE', color:t.orange, bg:t.orangeDim } : null,
    incompleteExerciseCount ? { label:'Completion drop', color:t.orange, bg:t.orangeDim } : null,
    lowEnergy ? { label:'Low energy', color:t.yellow, bg:t.yellowDim } : null,
  ].filter(Boolean) as Array<{ label: string; color: string; bg: string }>

  return {
    skippedCount,
    swapCount,
    formCheckCount,
    highRpeSetCount,
    incompleteExerciseCount,
    lowEnergy,
    frictionScore,
    coachFocus,
    hotspotExercises,
    frictionReasons,
    summary: summaryParts.length ? summaryParts.join(' · ') : 'Clean session with no obvious friction flags',
    tags,
  }
}

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
          <video src={url} controls autoPlay playsInline muted
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

// ── VideoReviewer ──────────────────────────────────────────────────────────────────────────────
type VideoReviewerProps = {
  onReady: (blob: Blob) => void
  onLink: (url: string) => void
  onClear: () => void
  uploading: boolean
  doneUrl: string
}

function VideoReviewer({ onReady, onLink, onClear, uploading, doneUrl }: VideoReviewerProps) {
  const [linkInput, setLinkInput] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)

  if (doneUrl) return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, background:t.surfaceHigh, border:`1px solid ${t.green}40`, borderRadius:10, padding:'10px 14px' }}>
        <span style={{ fontSize:18 }}>✅</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:800, color:t.green }}>Review Video Added</div>
          <div style={{ fontSize:11, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{doneUrl}</div>
        </div>
        <a href={doneUrl} target='_blank' rel='noreferrer'
          style={{ fontSize:11, fontWeight:700, color:t.teal, textDecoration:'none', flexShrink:0 }}>View ↗</a>
        <button onClick={onClear}
          style={{ background:'rgba(255,80,80,0.1)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:6, padding:'4px 8px', fontSize:11, color:'#ff5050', cursor:'pointer', flexShrink:0 }}>
          Remove
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column' as const, gap:8 }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        <label style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, background:t.surface, border:`2px solid ${t.teal}40`, borderRadius:10, padding:'14px 8px', cursor: uploading ? 'not-allowed' : 'pointer', textAlign:'center' as const, opacity: uploading ? 0.6 : 1 }}>
          <span style={{ fontSize:24 }}>{uploading ? '⏳' : '📁'}</span>
          <span style={{ fontSize:11, fontWeight:800, color:t.teal }}>{uploading ? 'Uploading...' : 'Upload Video'}</span>
          <span style={{ fontSize:10, color:t.textMuted }}>MP4, MOV, etc.</span>
          <input type='file' accept='video/mp4,video/quicktime,video/webm,video/*' style={{ display:'none' }}
            disabled={uploading}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) onReady(f as unknown as Blob) }}/>
        </label>
        <button onClick={()=>setShowLinkInput(v=>!v)}
          style={{ display:'flex', flexDirection:'column' as const, alignItems:'center', gap:6, background:t.surface, border:`1px solid ${showLinkInput ? t.teal+'60' : t.border}`, borderRadius:10, padding:'14px 8px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          <span style={{ fontSize:24 }}>🔗</span>
          <span style={{ fontSize:11, fontWeight:700, color:showLinkInput ? t.teal : t.text }}>Paste Link</span>
          <span style={{ fontSize:10, color:t.textMuted }}>Cap, Loom, Drive...</span>
        </button>
      </div>
      {showLinkInput && (
        <div style={{ display:'flex', gap:8 }}>
          <input autoFocus value={linkInput} onChange={e=>setLinkInput(e.target.value)}
            placeholder='https://cap.so/share/... or any video link'
            onKeyDown={e=>{ if(e.key==='Enter' && linkInput.trim()) { onLink(linkInput.trim()); setShowLinkInput(false); setLinkInput('') }}}
            style={{ flex:1, background:t.surfaceHigh, border:`1px solid ${t.teal}60`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }}/>
          <button onClick={()=>{ if(linkInput.trim()) { onLink(linkInput.trim()); setShowLinkInput(false); setLinkInput('') }}}
            disabled={!linkInput.trim()}
            style={{ background:linkInput.trim()?`linear-gradient(135deg,${t.teal},#00a896)`:t.surfaceHigh, border:'none', borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:800, color:linkInput.trim()?'#000':t.textMuted, cursor:linkInput.trim()?'pointer':'default', fontFamily:"'DM Sans',sans-serif" }}>
            Add
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
  const [reviewVideoPath, setReviewVideoPath] = useState('')
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
          id, profile:profiles!clients_profile_id_fkey(id, full_name)
        )`)
      .eq('coach_id', user.id).eq('status', 'completed')
      .is('coach_reviewed_at', null).not('review_due_at', 'is', null)
      .order('review_due_at', { ascending: true })
    if (!sessions) { setLoading(false); return }
    const sessionRows = (sessions || []) as WorkoutSessionRow[]
    const enriched: Review[] = await Promise.all(sessionRows.map(async (s) => {
      const { data: exs } = await supabase
        .from('session_exercises')
        .select('id, exercise_name, sets_completed, sets_prescribed, reps_prescribed, notes_client, notes_coach, client_video_url, original_exercise_name, swap_reason, swap_note, skipped, skip_reason, skip_note, exercise:exercises!session_exercises_exercise_id_fkey(name)')
        .eq('session_id', s.id).order('order_index')
      const exerciseRows = (exs || []) as SessionExerciseRow[]
      const exercises: Exercise[] = await Promise.all(exerciseRows.map(async (ex) => {
        const { data: sets } = await supabase
          .from('exercise_sets')
          .select('set_number, reps_completed, weight_value, weight_unit, rpe, notes')
          .eq('session_exercise_id', ex.id).order('set_number')
        return {
          ...ex,
          exercise_name: ex.exercise_name || (ex as any).exercise?.name || '',
          client_video_url: ex.client_video_url
            ? (await supabase.storage.from('form-checks').createSignedUrl(ex.client_video_url, 60 * 60)).data?.signedUrl || null
            : null,
          sets: sets || [],
        }
      }))
      return {
        ...s,
        coach_review_video_url: await resolveSignedMediaUrl(supabase, 'workout-reviews', s.coach_review_video_url),
        client: s.client ? { id:s.client.id, full_name:s.client.profile?.full_name??null, profile_id:s.client.profile?.id??null } : null,
        exercises,
      }
    }))
    setReviews(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadReviews() }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadReviews])

  async function uploadReviewVideo(blobOrFile: Blob | File, sessionId: string) {
    setUploadingVideo(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setUploadingVideo(false); return }
    const ext = blobOrFile instanceof File ? (blobOrFile.name.split('.').pop() || 'webm') : 'webm'
    const path = `${user.id}/${sessionId}/review_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('workout-reviews').upload(path, blobOrFile)
    if (!error) {
      const signedUrl = await resolveSignedMediaUrl(supabase, 'workout-reviews', path)
      setReviewVideoPath(path)
      setReviewVideoUrl(signedUrl || '')
    }
    setUploadingVideo(false)
  }

  async function markReviewed(sessionId: string) {
    setSaving(true)
    await supabase.from('workout_sessions').update({
      coach_reviewed_at: new Date().toISOString(),
      coach_review_notes: reviewNote || null,
      coach_review_video_url: reviewVideoPath || null,
    }).eq('id', sessionId)

    // Notify client — fire-and-forget
    const profileId = selected?.client?.profile_id
    if (profileId) {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        // Insert in-app notification (shows in bell)
        Promise.resolve(supabase.from('notifications').insert({
          user_id: profileId,
          notification_type: 'review_ready',
          title: '💬 Coach reviewed your workout',
          body: reviewNote ? reviewNote.slice(0, 100) : 'Tap to see your feedback',
          link_url: '/dashboard/client',
        })).catch(err => console.warn('[notify:reviews-1] failed', err))

        // Push notification
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id: profileId,
            notification_type: 'review_ready',
            title: '💬 Coach reviewed your workout',
            body: reviewNote ? reviewNote.slice(0, 100) : 'Tap to see your feedback',
            link_url: '/dashboard/client',
          })
        }).catch(err => console.warn('[notify:reviews-2] failed', err))
      }
    }

    setReviews(prev => prev.filter(r => r.id !== sessionId))
    setSelected(null); setReviewNote(''); setReviewVideoUrl(''); setReviewVideoPath('')
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
    const intelligence = getReviewIntelligence(selected)
    return (
      <>
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

          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 16px', marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:8, flexWrap:'wrap' }}>
              <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em' }}>Coach Intelligence</div>
              <div style={{ fontSize:12, fontWeight:800, color:intelligence.frictionScore >= 5 ? t.red : intelligence.frictionScore >= 3 ? t.orange : t.green }}>
                Friction score {intelligence.frictionScore}
              </div>
            </div>
            <div style={{ fontSize:13, color:t.text, lineHeight:1.6, marginBottom:intelligence.tags.length ? 10 : 0 }}>
              {intelligence.summary}
            </div>
            <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.6, marginBottom:(intelligence.hotspotExercises.length || intelligence.frictionReasons.length || intelligence.tags.length) ? 10 : 0 }}>
              Focus: {intelligence.coachFocus}
            </div>
            {intelligence.hotspotExercises.length > 0 && (
              <div style={{ fontSize:11, color:t.textDim, marginBottom:8 }}>
                Hotspots: {intelligence.hotspotExercises.join(' · ')}
              </div>
            )}
            {intelligence.frictionReasons.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
                {intelligence.frictionReasons.map(reason => (
                  <div key={reason} style={{ fontSize:10, fontWeight:700, color:t.orange, background:t.orangeDim, borderRadius:999, padding:'4px 8px' }}>
                    {reason}
                  </div>
                ))}
              </div>
            )}
            {intelligence.tags.length > 0 && (
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {intelligence.tags.map(tag => (
                  <div key={tag.label} style={{ fontSize:11, fontWeight:700, color:tag.color, background:tag.bg, borderRadius:999, padding:'4px 10px' }}>
                    {tag.label}
                  </div>
                ))}
              </div>
            )}
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
                {(ex.original_exercise_name || ex.skipped) && (
                  <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                    {ex.original_exercise_name && (
                      <div style={{ fontSize:11, color:t.teal }}>
                        Smart swap: <strong>{ex.original_exercise_name}</strong> → <strong>{ex.exercise_name}</strong>
                        {ex.swap_reason ? ` · ${ex.swap_reason}` : ''}
                        {ex.swap_note ? ` · ${ex.swap_note}` : ''}
                      </div>
                    )}
                    {ex.skipped && (
                      <div style={{ fontSize:11, color:t.red }}>
                        Skipped: {ex.skip_reason || 'reason not provided'}
                        {ex.skip_note ? ` · ${ex.skip_note}` : ''}
                      </div>
                    )}
                  </div>
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
              <VideoReviewer
                onReady={blob => uploadReviewVideo(blob, selected.id)}
                onLink={url => { setReviewVideoUrl(url); setReviewVideoPath(url) }}
                onClear={() => { setReviewVideoUrl(''); setReviewVideoPath('') }}
                uploading={uploadingVideo}
                doneUrl={reviewVideoUrl}
              />
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
              const intelligence = getReviewIntelligence(r)
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
                      <div style={{ marginTop:8, fontSize:12, color:t.textDim, lineHeight:1.5 }}>
                        {intelligence.coachFocus}
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginTop:8 }}>
                        {intelligence.tags.slice(0, 3).map(tag => (
                          <div key={tag.label} style={{ fontSize:10, fontWeight:700, color:tag.color, background:tag.bg, borderRadius:999, padding:'3px 8px' }}>
                            {tag.label}
                          </div>
                        ))}
                        {intelligence.tags.length === 0 && (
                          <div style={{ fontSize:10, fontWeight:700, color:t.green, background:t.greenDim, borderRadius:999, padding:'3px 8px' }}>
                            Clean session
                          </div>
                        )}
                      </div>
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
