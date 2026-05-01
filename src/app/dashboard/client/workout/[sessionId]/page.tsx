'use client'
import Image from 'next/image'
import React, { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { resolveSignedMediaUrl } from '@/lib/media'
import { alpha } from '@/lib/theme'
import { toastError, toastInfo, toastSuccess } from '@/components/ui/Toast'
import { enqueueSetLog, flushQueue, pendingForSession, pendingCount } from '@/lib/workout-offline-queue'

const t = {
  bg:"var(--bg)", surface:"var(--surface)", surfaceUp:"var(--surface-up)", surfaceHigh:"var(--surface-high)",
  border:"var(--border)", teal:"var(--teal)", tealDim:"var(--teal-dim)", orange:"var(--orange)",
  accent:"var(--accent)", accentDim:"var(--accent-dim)", text:"var(--text)", textDim:"var(--text-dim)",
  textMuted:"var(--text-muted)", red:"var(--red)", redDim:"var(--red-dim)", green:"var(--green)",
  greenDim:"var(--green-dim)", yellow:"var(--yellow)"
}

// Rest-end cue: short A5 beep. Web Audio context must be created/resumed in a user
// gesture chain — workout page already qualifies (set log tap → start rest).
function playRestEndChime() {
  try {
    type WindowWithWebkitAudio = Window & { webkitAudioContext?: typeof AudioContext }
    const w = window as WindowWithWebkitAudio
    const Ctx = window.AudioContext || w.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
    setTimeout(() => { ctx.close().catch(() => {}) }, 700)
  } catch { /* audio context unavailable — ok */ }
}

function fireRestEndAlert() {
  playRestEndChime()
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 80, 200])
    }
  } catch { /* ignore */ }
  try {
    if (typeof window !== 'undefined' && 'Notification' in window
        && Notification.permission === 'granted' && document.hidden) {
      new Notification('Rest done', { body: 'Time for the next set', silent: false })
    }
  } catch { /* ignore */ }
}

interface SetData {
  reps_completed: string
  duration_completed: string
  weight_value: string
  weight_unit: 'lbs'|'kg'|'bw'
  rpe: string
  notes: string
  is_warmup: boolean
  logged: boolean
  skipped: boolean
}

interface WorkoutSession {
  id: string
  client_id: string | null
  program_id?: string | null
  status: string | null
  started_at?: string | null
  scheduled_date?: string | null
  title?: string | null
  coach_id?: string | null
  day_label?: string | null
  notes_coach?: string | null
  coach_reviewed_at?: string | null
  coach_review_notes?: string | null
  coach_review_video_url?: string | null
  completed_at?: string | null
  duration_seconds?: number | null
  notes_client?: string | null
  session_rpe?: number | null
  energy_level?: number | null
  mood?: string | null
}

interface ExerciseLibraryItem {
  id: string
  name?: string | null
  description?: string | null
  cues?: string[] | null
  muscles?: string[] | null
  secondary_muscles?: string[] | null
  equipment?: string | null
  video_url?: string | null
  video_url_female?: string | null
  image_url?: string | null
  thumbnail_url?: string | null
  movement_pattern?: string | null
}

interface SessionExercise {
  id: string
  session_id?: string
  exercise_id?: string | null
  original_exercise_id?: string | null
  original_exercise_name?: string | null
  exercise_name: string
  sets_prescribed?: number | null
  reps_prescribed?: string | null
  weight_prescribed?: string | null
  skipped?: boolean | null
  notes_client?: string | null
  notes_coach?: string | null
  rest_seconds?: number | null
  client_video_url?: string | null
  swap_reason?: string | null
  exercise?: ExerciseLibraryItem | null
  tracking_type?: string | null
  duration_seconds?: number | null
  exercise_role?: string | null
  is_open_slot?: boolean | null
  slot_constraint?: string | null
  slot_filter_type?: string | null
  slot_filter_value?: string | null
  slot_filled_by_client?: boolean | null
  superset_group?: string | null
  group_type?: string | null
}

type WorkoutCompleteProps = {
  session: WorkoutSession | null
  elapsed: number
  router: { push: (href: string) => void; back: () => void }
  t: typeof t
  sessionId: string
  supabase: ReturnType<typeof createClient>
  returnUrl: string
  summary: SessionSummary | null
}

type SessionPR = {
  exercise_name: string
  pr_type: 'weight' | 'rep'
  weight: number
  reps: number
}

type SessionSummary = {
  totalWeightMoved: number
  totalLoggedSets: number
  prs: SessionPR[]
}

interface LoggedSetRow {
  session_exercise_id: string
  set_number: number
  reps_completed: number | null
  weight_value: number | null
  weight_unit: 'lbs' | 'kg' | 'bw' | null
  rpe?: number | null
  notes?: string | null
  is_warmup?: boolean | null
}

function defaultSet(): SetData {
  return { reps_completed:'', duration_completed:'', weight_value:'', weight_unit:'lbs', rpe:'', notes:'', is_warmup:false, logged:false, skipped:false }
}

export default function ActiveWorkoutPage() {
  const supabase = createClient()
  const [videoUploads, setVideoUploads]   = useState<Record<string,string>>({})
  const [videoUploading, setVideoUploading] = useState<Record<string,boolean>>({})
  const router = useRouter()
  const { sessionId: sessionIdParam } = useParams()
  const sessionId = sessionIdParam as string
  // Read ?return= param set when coach launches workout from preview mode
  const returnUrl = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('return') || '/dashboard/client'
    : '/dashboard/client'

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<SessionExercise[]>([])
  const [setData, setSetData] = useState<Record<string, SetData[]>>({})
  const [prevSets, setPrevSets] = useState<Record<string, {reps:number|null, weight:number|null, unit:string}[]>>({})
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [expandedExId, setExpandedExId] = useState<string|null>(null) // which exercise card is open
  // Refs to each exercise card so we can scroll the newly-opened one into view.
  // Without this the browser keeps the previous scroll position and the
  // expanded content ends up off-screen below the fold.
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const [restTimer, setRestTimer] = useState<number|null>(null)
  const [restActive, setRestActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [phase, setPhase] = useState<'warmup'|'workout'|'complete'>('workout')
  const [finishForm, setFinishForm] = useState({ session_rpe:'', energy_level:'3', mood:'good', notes_client:'' })
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isReopened, setIsReopened] = useState(false)
  // Offline queue state — true when navigator is offline OR there are
  // unflushed set logs sitting in localStorage.
  const [isOffline, setIsOffline] = useState(false)
  const [queuedSetCount, setQueuedSetCount] = useState(0)
  const [clientGender, setClientGender] = useState<string|null>(null)
  const [isInPerson,   setIsInPerson]   = useState(false)
  const [showCancelSheet, setShowCancelSheet] = useState(false)
  // Preview toggle per exercise
  const [previewOpen, setPreviewOpen] = useState<Record<string,boolean>>({})
  // Skip state per exercise
  const [skipOpen, setSkipOpen] = useState<Record<string,boolean>>({})
  const [skipNote, setSkipNote] = useState<Record<string,string>>({})
  const [skipped, setSkipped] = useState<Record<string,boolean>>({})
  const [swapOpen, setSwapOpen] = useState<Record<string,boolean>>({})
  // Open slot filling
  const [slotPickerExId, setSlotPickerExId] = useState<string|null>(null)
  const [slotSearch,     setSlotSearch]     = useState('')
  const [slotCustomName, setSlotCustomName] = useState('')
  const [slotTab,        setSlotTab]        = useState<'library'|'custom'>('library')
  const [swapSearch, setSwapSearch] = useState<Record<string,string>>({})
  const [aiSwapLoading, setAiSwapLoading] = useState<Record<string,boolean>>({})
  const [aiSwapOptions, setAiSwapOptions] = useState<Record<string,ExerciseLibraryItem[]>>({})
  const [swapNote, setSwapNote] = useState<Record<string,string>>({})
  const [swapLibrary, setSwapLibrary] = useState<ExerciseLibraryItem[]>([])
  const [addExOpen,      setAddExOpen]      = useState(false)
  const [addExSearch,    setAddExSearch]    = useState('')
  const [aiAddLoading,   setAiAddLoading]   = useState(false)
  const [aiAddOptions,   setAiAddOptions]   = useState<ExerciseLibraryItem[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const withSignedMedia = useCallback(async (exs: SessionExercise[]) => {
    const signedExercises = await Promise.all((exs || []).map(async (exerciseRow) => ({
      ...exerciseRow,
      exercise_name: exerciseRow.exercise_name || exerciseRow.exercise?.name || '',
      client_video_url: exerciseRow.client_video_url
        ? (await supabase.storage.from('form-checks').createSignedUrl(exerciseRow.client_video_url, 60 * 60)).data?.signedUrl || null
        : null,
    })))

    const uploadMap = signedExercises.reduce((acc, exerciseRow) => {
      if (exerciseRow.client_video_url) acc[exerciseRow.id] = exerciseRow.client_video_url
      return acc
    }, {} as Record<string, string>)

    setVideoUploads(uploadMap)
    return signedExercises
  }, [supabase])

  function getSwapOptions(exercise: SessionExercise) {
    const primaryMuscles = exercise.exercise?.muscles || []
    const currentEquipment = exercise.exercise?.equipment || null
    const currentPattern = exercise.exercise?.movement_pattern || null
    const search = (swapSearch[exercise.id] || '').toLowerCase().trim()
    // Search overrides everything
    if (search) {
      return swapLibrary
        .filter(option => option.id !== exercise.exercise_id)
        .filter(option => option.name?.toLowerCase().includes(search)
          || option.equipment?.toLowerCase().includes(search)
          || (option.muscles || []).some((m: string) => m.toLowerCase().includes(search)))
        .slice(0, 10)
    }
    // AI suggestions if loaded
    if (aiSwapOptions[exercise.id]?.length) {
      return aiSwapOptions[exercise.id]
    }
    // Fallback: same movement pattern + muscles, different equipment — ranked by relevance
    return swapLibrary
      .filter(option => option.id !== exercise.exercise_id)
      .filter(option => {
        const optionMuscles = option.muscles || []
        const sharedMuscle = primaryMuscles.length === 0
          || optionMuscles.some((m: string) => primaryMuscles.includes(m))
        return sharedMuscle
      })
      .sort((a, b) => {
        // Prefer different equipment (the point of a swap)
        const aDiffEquip = a.equipment !== currentEquipment ? 1 : 0
        const bDiffEquip = b.equipment !== currentEquipment ? 1 : 0
        if (aDiffEquip !== bDiffEquip) return bDiffEquip - aDiffEquip
        // Then prefer same movement pattern
        const aSamePattern = a.movement_pattern === currentPattern ? 1 : 0
        const bSamePattern = b.movement_pattern === currentPattern ? 1 : 0
        return bSamePattern - aSamePattern
      })
      .slice(0, 10)
  }

  async function getAISwap(exercise: SessionExercise) {
    const exId = exercise.id
    if (aiSwapLoading[exId] || aiSwapOptions[exId]?.length) return
    setAiSwapLoading(prev => ({ ...prev, [exId]: true }))
    try {
      const primaryMuscles = exercise.exercise?.muscles || []
      const currentEquipment = exercise.exercise?.equipment || 'unknown'
      const currentPattern = exercise.exercise?.movement_pattern || 'unknown'

      // Pre-filter: same muscles, different equipment preferred — max 60 for Claude
      const candidates = swapLibrary
        .filter(o => o.id !== exercise.exercise_id)
        .filter(o => {
          const sharedMuscle = primaryMuscles.length === 0
            || (o.muscles || []).some((m: string) => primaryMuscles.includes(m))
          return sharedMuscle
        })
        .sort((a, b) => {
          // Surface different-equipment options first so Claude sees variety
          const aDiff = a.equipment !== currentEquipment ? 1 : 0
          const bDiff = b.equipment !== currentEquipment ? 1 : 0
          return bDiff - aDiff
        })
        .slice(0, 60)

      if (!candidates.length) {
        setAiSwapLoading(prev => ({ ...prev, [exId]: false }))
        return
      }

      const candidateList = candidates
        .map(c => `${c.id}|${c.name}|${c.equipment || 'bodyweight'}|${(c.muscles || []).join(',')}|${c.movement_pattern || ''}`)
        .join('\n')

      const res = await fetch('/api/ai-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: `You are a personal trainer helping a client swap an exercise mid-workout.

Original exercise: ${exercise.exercise_name}
Muscles: ${primaryMuscles.join(', ') || 'unknown'}
Equipment: ${currentEquipment}
Movement pattern: ${currentPattern}

The client likely needs to swap because of equipment unavailability or discomfort. Pick the 10 BEST substitutes from the list below. Prioritise:
1. Same muscles, DIFFERENT equipment (so they can actually do it)
2. Same movement pattern
3. Similar difficulty

Return ONLY the IDs, one per line, no explanation:
${candidateList}`
          }]
        })
      })
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      const returnedIds = text.trim().split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 10)
      const matched = returnedIds
        .map((id: string) => candidates.find(c => c.id === id))
        .filter(Boolean) as ExerciseLibraryItem[]

      // Fallback to sorted candidates if Claude returned nothing useful
      const final = matched.length >= 3 ? matched : candidates.slice(0, 10)
      setAiSwapOptions(prev => ({ ...prev, [exId]: final }))
    } catch {
      // Silently fall back to basic suggestions
    }
    setAiSwapLoading(prev => ({ ...prev, [exId]: false }))
  }

  const [reviewVideoUrl, setReviewVideoUrl] = useState<string|null>(null)

  // Resolve signed URL for coach review video if it's a storage path
  useEffect(() => {
    const raw = session?.coach_review_video_url
    if (!raw) return
    if (raw.startsWith('http')) { setReviewVideoUrl(raw); return }
    // Raw storage path — generate signed URL from workout-reviews bucket
    supabase.storage.from('workout-reviews').createSignedUrl(raw, 60 * 60)
      .then(({ data }) => { if (data?.signedUrl) setReviewVideoUrl(data.signedUrl) })
      .catch(err => console.warn('[workout:bg-load] failed', err))
  }, [session?.coach_review_video_url])
  useEffect(() => {
    // Don't run timer if session is completed or not started
    if (!session || session.status !== 'in_progress' || !session.started_at) {
      // If completed, set elapsed to the stored duration
      if (session?.status === 'completed' && session.duration_seconds) {
        setElapsedSeconds(session.duration_seconds)
      }
      return
    }
    const startedAt = new Date(session.started_at).getTime()
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current ?? undefined)
  }, [session?.started_at, session?.status])

  // Rest countdown
  useEffect(() => {
    if (!restActive || restTimer === null || restTimer <= 0) return () => clearTimeout(restRef.current ?? undefined)
    restRef.current = setTimeout(() => {
      setRestTimer((current) => {
        if (current === null) return current
        if (current <= 1) {
          setRestActive(false)
          fireRestEndAlert()
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => clearTimeout(restRef.current ?? undefined)
  }, [restActive, restTimer])

  const loadSession = useCallback(async () => {
    // No more auto-flip from assigned -> in_progress. The preview screen
    // (rendered when status === 'assigned') gives the client a peek at
    // what's coming and an explicit Start button. Status only flips when
    // they tap Start, so opening a workout to look at it doesn't burn the
    // start time.
    const { data: sess } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single()
    const safeSession = sess as WorkoutSession | null
    

    // Fetch client gender + type to serve correct demo video and skip review for in-person
    if (safeSession?.client_id) {
      const { data: clientRow } = await supabase.from('clients').select('gender, client_type').eq('id', safeSession.client_id).single()
      if (clientRow?.gender) setClientGender(clientRow.gender)
      if (clientRow?.client_type === 'offline' || clientRow?.client_type === 'hybrid') setIsInPerson(true)
    }

    // If client tapped back into a completed session, flag it — don't auto-reopen yet
    if (safeSession?.status === 'completed') {
      setSession(safeSession)
      // Rehydrate finish form so their existing notes/RPE/mood/energy don't
      // get wiped if they re-open and re-finish. Without this, the finish
      // screen would show empty defaults and saving would null out their
      // original answers.
      setFinishForm({
        session_rpe: safeSession.session_rpe != null ? String(safeSession.session_rpe) : '',
        energy_level: safeSession.energy_level != null ? String(safeSession.energy_level) : '3',
        mood: safeSession.mood || 'good',
        notes_client: safeSession.notes_client || '',
      })
      const { data: exs } = await supabase
        .from('session_exercises')
        .select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, image_url, thumbnail_url)')
        .eq('session_id', sessionId).order('order_index')
      const [{ data: exLib1 }, { data: exLib2 }] = await Promise.all([
      supabase.from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, movement_pattern, video_url, video_url_female, image_url, thumbnail_url')
        .range(0, 999),
      supabase.from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, movement_pattern, video_url, video_url_female, image_url, thumbnail_url')
        .range(1000, 1999),
    ])
    const exerciseLibrary = [...(exLib1 || []), ...(exLib2 || [])]

      // Fetch already-logged sets so re-open shows real data
      const { data: loggedSets } = await supabase
        .from('exercise_sets')
        .select('session_exercise_id, set_number, reps_completed, weight_value, weight_unit, rpe, notes, is_warmup')
        .eq('session_id', sessionId).order('set_number')
      const loggedByEx: Record<string, LoggedSetRow[]> = {}
      for (const s of loggedSets || []) {
        if (!loggedByEx[s.session_exercise_id]) loggedByEx[s.session_exercise_id] = []
        loggedByEx[s.session_exercise_id].push(s as LoggedSetRow)
      }
      const initSets: Record<string,SetData[]> = {}
      for (const ex of (exs || []) as SessionExercise[]) {
        const already = loggedByEx[ex.id] || []
        const rows: SetData[] = already.map((s) => ({
          reps_completed: s.reps_completed != null ? String(s.reps_completed) : '',
          duration_completed: '',
          weight_value:   s.weight_value   != null ? String(s.weight_value)   : '',
          weight_unit:    (s.weight_unit || 'lbs') as 'lbs'|'kg'|'bw',
          rpe:            s.rpe            != null ? String(s.rpe)            : '',
          notes:          s.notes || '',
          is_warmup:      s.is_warmup || false,
          logged:         true,
          skipped:        false,
        }))
        while (rows.length < (ex.sets_prescribed || 3)) rows.push(defaultSet())
        initSets[ex.id] = rows
      }
      setSwapLibrary((exerciseLibrary || []) as ExerciseLibraryItem[])
      const signedExercises = await withSignedMedia((exs || []) as SessionExercise[])
      setExercises(signedExercises)
      // Auto-open the first incomplete exercise
      if (signedExercises.length > 0) setExpandedExId(signedExercises[0].id)
      setSkipped(signedExercises.reduce((acc, exerciseRow) => {
        acc[exerciseRow.id] = !!exerciseRow.skipped || !!(exerciseRow.notes_client?.startsWith('[SKIPPED]'))
        return acc
      }, {} as Record<string, boolean>))
      setSetData(initSets)
      setIsReopened(true)
      setLoading(false)
      return
    }
    // Join exercise detail for preview
    const { data: exs } = await supabase
      .from('session_exercises')
      .select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, image_url, thumbnail_url)')
      .eq('session_id', sessionId)
      .order('order_index')

    

    const [{ data: exLib1 }, { data: exLib2 }] = await Promise.all([
      supabase.from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, movement_pattern, video_url, video_url_female, image_url, thumbnail_url')
        .range(0, 999),
      supabase.from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, movement_pattern, video_url, video_url_female, image_url, thumbnail_url')
        .range(1000, 1999),
    ])
    const exerciseLibrary = [...(exLib1 || []), ...(exLib2 || [])]

    // Fetch already-logged sets for THIS session so resuming shows real data
    const { data: loggedSets } = await supabase
      .from('exercise_sets')
      .select('session_exercise_id, set_number, reps_completed, weight_value, weight_unit, rpe, notes, is_warmup')
      .eq('session_id', sessionId)
      .order('set_number')

    // Index by session_exercise_id for fast lookup
    const loggedByEx: Record<string, LoggedSetRow[]> = {}
    for (const s of loggedSets || []) {
      if (!loggedByEx[s.session_exercise_id]) loggedByEx[s.session_exercise_id] = []
      loggedByEx[s.session_exercise_id].push(s as LoggedSetRow)
    }
    // Merge any locally-queued (unsynced) set logs for this session so a
    // refresh-while-offline still shows them as logged. Dedupes by
    // (session_exercise_id, set_number) — server rows win if both exist.
    for (const queued of pendingForSession(sessionId)) {
      const existing = loggedByEx[queued.session_exercise_id] || []
      if (existing.some(r => r.set_number === queued.set_number)) continue
      const p = queued.payload as Partial<LoggedSetRow>
      loggedByEx[queued.session_exercise_id] = [...existing, {
        session_exercise_id: queued.session_exercise_id,
        set_number: queued.set_number,
        reps_completed: typeof p.reps_completed === 'number' ? p.reps_completed : null,
        weight_value:   typeof p.weight_value   === 'number' ? p.weight_value   : null,
        weight_unit:    (typeof p.weight_unit === 'string' ? p.weight_unit : 'lbs'),
        rpe:            typeof p.rpe            === 'number' ? p.rpe            : null,
        notes:          typeof p.notes === 'string' ? p.notes : null,
        is_warmup:      !!p.is_warmup,
      } as LoggedSetRow]
    }

    // Fetch previous session sets for the same exercises BEFORE building
    // initSets, so blank pad rows can pre-fill from last week's logged values.
    // Filter by clients.id (workout_sessions.client_id FK), NOT auth.uid().
    const prev: Record<string, {reps:number|null, weight:number|null, unit:string}[]> = {}
    if (exs && exs.length > 0 && safeSession?.client_id) {
      const { data: completedSessions } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('client_id', safeSession.client_id)
        .eq('status', 'completed')
        .neq('id', sessionId)
        .order('completed_at', { ascending: false })
        .limit(20)

      if (completedSessions && completedSessions.length > 0) {
        const completedIds = completedSessions.map((s:{ id: string }) => s.id)
        for (const ex of exs as SessionExercise[]) {
          // Match by exercise_id first (survives renamed/swapped exercises with
          // the same canonical id), fallback to exercise_name.
          let priorExs: { id: string }[] | null = null
          if (ex.exercise_id) {
            const { data } = await supabase
              .from('session_exercises')
              .select('id')
              .eq('exercise_id', ex.exercise_id)
              .in('session_id', completedIds)
              .limit(1)
            priorExs = data
          }
          if ((!priorExs || priorExs.length === 0) && ex.exercise_name) {
            const { data } = await supabase
              .from('session_exercises')
              .select('id')
              .eq('exercise_name', ex.exercise_name)
              .in('session_id', completedIds)
              .limit(1)
            priorExs = data
          }

          if (priorExs && priorExs.length > 0) {
            const { data: priorSets } = await supabase
              .from('exercise_sets')
              .select('set_number, reps_completed, weight_value, weight_unit')
              .eq('session_exercise_id', priorExs[0].id)
              .order('set_number')
              .limit(6)

            if (priorSets && priorSets.length > 0) {
              prev[ex.id] = priorSets.map((s: { reps_completed: number|null; weight_value: number|null; weight_unit: string|null }) => ({
                reps: s.reps_completed,
                weight: s.weight_value,
                unit: (s.weight_unit as 'lbs'|'kg'|'bw') || 'lbs'
              }))
            }
          }
        }
      }
    }

    const initSets: Record<string,SetData[]> = {}
    for (const ex of (exs || []) as SessionExercise[]) {
      const already = loggedByEx[ex.id] || []
      const prescribed = ex.sets_prescribed || 3
      // Build set rows: fill logged ones first, then pad up to prescribed count.
      // Pad rows pre-fill from last week if available so clients don't retype
      // weight/reps every session — just confirm or override.
      const rows: SetData[] = already.map((s) => ({
        reps_completed: s.reps_completed != null ? String(s.reps_completed) : '',
        duration_completed: '',
        weight_value:   s.weight_value   != null ? String(s.weight_value)   : '',
        weight_unit:    (s.weight_unit || 'lbs') as 'lbs'|'kg'|'bw',
        rpe:            s.rpe            != null ? String(s.rpe)            : '',
        notes:          s.notes || '',
        is_warmup:      s.is_warmup || false,
        logged:         true,   // already in DB — show as logged
        skipped:        false,
      }))
      while (rows.length < prescribed) {
        const padIdx = rows.length
        const prior = prev[ex.id]?.[padIdx]
        if (prior && (prior.reps != null || prior.weight != null)) {
          rows.push({
            reps_completed: prior.reps != null ? String(prior.reps) : '',
            duration_completed: '',
            weight_value:   prior.weight != null ? String(prior.weight) : '',
            weight_unit:    (prior.unit || 'lbs') as 'lbs'|'kg'|'bw',
            rpe:            '',
            notes:          '',
            is_warmup:      false,
            logged:         false,   // pre-filled, awaiting confirmation
            skipped:        false,
          })
        } else {
          rows.push(defaultSet())
        }
      }
      initSets[ex.id] = rows
    }

    setSession(safeSession)
    setSwapLibrary((exerciseLibrary || []) as ExerciseLibraryItem[])
    const signedExercises = await withSignedMedia((exs || []) as SessionExercise[])
    setExercises(signedExercises)
    setSkipped(signedExercises.reduce((acc, exerciseRow) => {
      acc[exerciseRow.id] = !!exerciseRow.skipped || !!(exerciseRow.notes_client?.startsWith('[SKIPPED]'))
      return acc
    }, {} as Record<string, boolean>))
    setSetData(initSets)
    setPrevSets(prev)
    setLoading(false)
  }, [sessionId, supabase, withSignedMedia])

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadSession() }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadSession])

  // Offline queue: track navigator state, drain pending set logs on reconnect.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const initialOnline = window.navigator.onLine !== false
    setIsOffline(!initialOnline)
    setQueuedSetCount(pendingCount())

    let flushing = false
    const tryFlush = async () => {
      if (flushing) return
      flushing = true
      try {
        const before = pendingCount()
        const { flushed, remaining } = await flushQueue(supabase)
        setQueuedSetCount(remaining)
        if (flushed > 0 && before > 0) {
          toastSuccess(`Synced ${flushed} pending set log${flushed === 1 ? '' : 's'}`)
        }
      } finally {
        flushing = false
      }
    }

    const handleOnline  = () => { setIsOffline(false); void tryFlush() }
    const handleOffline = () => { setIsOffline(true) }
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    if (initialOnline) void tryFlush()

    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [supabase])

  // Scroll the expanded exercise card into view whenever it changes.
  // The card is tall (prescription + sets + actions) so we align to top with
  // a small margin so the card header is just below the sticky top bar.
  useEffect(() => {
    if (!expandedExId) return
    const el = cardRefs.current[expandedExId]
    if (!el) return
    // requestAnimationFrame lets the DOM finish expanding before we measure
    requestAnimationFrame(() => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [expandedExId])

  function updateSet(exId: string, setIdx: number, field: keyof SetData, val: SetData[keyof SetData]) {
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((s,i) => i===setIdx ? {...s, [field]: val} : s)
    }))
  }

  function applySetTemplate(exId: string, setIdx: number, template?: { reps?: number | null; weight?: number | null; unit?: string | null }) {
    if (!template) return
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((setRow, idx) => {
        if (idx !== setIdx || setRow.logged) return setRow
        return {
          ...setRow,
          reps_completed: template.reps != null ? String(template.reps) : setRow.reps_completed,
          weight_value: template.unit === 'bw' ? '' : template.weight != null ? String(template.weight) : setRow.weight_value,
          weight_unit: template.unit === 'kg' || template.unit === 'bw' ? template.unit : 'lbs',
        }
      })
    }))
  }

  function copyPreviousLoggedSet(exId: string, setIdx: number) {
    const priorLoggedSet = [...(setData[exId] || [])]
      .slice(0, setIdx)
      .reverse()
      .find(setRow => setRow.logged || setRow.reps_completed || setRow.weight_value)

    if (!priorLoggedSet) return

    applySetTemplate(exId, setIdx, {
      reps: priorLoggedSet.reps_completed ? parseInt(priorLoggedSet.reps_completed) : null,
      weight: priorLoggedSet.weight_value ? parseFloat(priorLoggedSet.weight_value) : null,
      unit: priorLoggedSet.weight_unit,
    })
  }

  // Tracks whether the client is re-opening a previously completed session.
  // Used to avoid re-firing the coach push notification when they re-finish.
  const wasReopenedRef = useRef(false)
  // Guard against double-tap / React re-render double-fire
  const loggingSet = useRef<Set<string>>(new Set())

  async function logSet(exId: string, setIdx: number) {
    const s = setData[exId][setIdx]
    if (s.logged) return // Already logged
    const lockKey = `${exId}-${setIdx}`
    if (loggingSet.current.has(lockKey)) return // Already in flight
    loggingSet.current.add(lockKey)
    const ex = exercises.find(e => e.id === exId)
    const isTime = ex?.tracking_type === 'time'

    if (isTime) {
      if (!s.duration_completed) return
    } else {
      if (!s.reps_completed && !s.weight_value) return
    }

    const payload = {
      session_exercise_id: exId,
      session_id: sessionId,
      set_number: setIdx + 1,
      reps_completed: isTime ? null : parseInt(s.reps_completed) || null,
      duration_seconds: isTime ? parseInt(s.duration_completed) || null : null,
      weight_value: s.weight_unit === 'bw' ? null : parseFloat(s.weight_value) || null,
      weight_unit: s.weight_unit,
      rpe: parseInt(s.rpe) || null,
      notes: s.notes || null,
      is_warmup: s.is_warmup,
      logged_at: new Date().toISOString()
    }

    // Skip the network entirely if the device is offline — queue immediately.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false
    let error: { message: string } | null = null
    if (!offline) {
      const result = await supabase.from('exercise_sets').insert(payload)
      error = result.error
    } else {
      error = { message: 'offline' }
    }

    const handleSuccessSideEffects = () => {
      updateSet(exId, setIdx, 'logged', true)
      loggingSet.current.delete(lockKey)
      // Auto-start rest timer
      const exNow = exercises.find(e=>e.id===exId)
      if (exNow?.rest_seconds) {
        setRestTimer(exNow.rest_seconds)
        setRestActive(true)
      }
      // Pre-fill next set with same values
      if (setIdx < setData[exId].length - 1) {
        setSetData(prev => ({
          ...prev,
          [exId]: prev[exId].map((s2,i2) => i2===setIdx+1 ? {...s2, reps_completed:s.reps_completed, weight_value:s.weight_value, weight_unit:s.weight_unit} : s2)
        }))
      }
    }

    if (!error) {
      handleSuccessSideEffects()
      // Bump sets_completed; nice-to-have, ignore failure
      void supabase.from('session_exercises').update({ sets_completed: setIdx+1 }).eq('id', exId)
    } else {
      // Insert failed (offline OR server error) — park in localStorage and
      // optimistically mark the set logged so the rest timer fires and the
      // user keeps moving. Queue flushes on the next "online" event.
      enqueueSetLog({
        session_id: sessionId,
        session_exercise_id: exId,
        set_number: setIdx + 1,
        payload,
      })
      setQueuedSetCount(pendingCount())
      handleSuccessSideEffects()
      toastInfo('Saved offline — will sync when you reconnect', 4000)
    }
  }

  function addSet(exId: string) {
    setSetData(prev => ({ ...prev, [exId]: [...prev[exId], defaultSet()] }))
  }

  async function skipSet(exId: string, setIdx: number) {
    // Mark set as skipped locally
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((s,i) => i===setIdx ? {...s, skipped:true, logged:true} : s)
    }))
    // Save to DB with skipped=true
    const { error } = await supabase.from('exercise_sets').insert({
      session_exercise_id: exId,
      session_id: sessionId,
      set_number: setIdx + 1,
      skipped: true,
      logged_at: new Date().toISOString(),
    })
    if (error) toastError('Could not save skipped set: ' + error.message)
  }

  async function skipExercise(exId: string) {
    const note = skipNote[exId] || ''
    const { error } = await supabase.from('session_exercises').update({
      notes_client: note.trim() ? `[SKIPPED] ${note.trim()}` : '[SKIPPED]',
      sets_completed: 0,
      skipped: true,
      skip_reason: null,
      skip_note: note.trim() || null,
      skipped_at: new Date().toISOString(),
    }).eq('id', exId)
    if (error) {
      toastError('Could not skip exercise: ' + error.message)
      return
    }
    setSkipped(prev => ({ ...prev, [exId]: true }))
    setSkipOpen(prev => ({ ...prev, [exId]: false }))
    // Auto-advance to next non-skipped exercise
    const nextIdx = exercises.findIndex((ex, i) => i > activeExIdx && !skipped[ex.id])
    const nextEx = nextIdx !== -1 ? exercises[nextIdx] : exercises[activeExIdx + 1]
    if (nextEx) { setActiveExIdx(nextIdx !== -1 ? nextIdx : activeExIdx + 1); setExpandedExId(nextEx.id) }
  }

  // ── Add exercise to session ──────────────────────────────────────────────
  async function addExercise(exerciseId: string) {
    const ex = swapLibrary.find(e => e.id === exerciseId)
    if (!ex) return
    const nextOrder = exercises.length
    const { data: newRow, error } = await supabase.from('session_exercises').insert({
      session_id: sessionId,
      exercise_id: ex.id,
      exercise_name: ex.name,
      order_index: nextOrder,
      sets_prescribed: 3,
      reps_prescribed: 10,
      added_by_client: true,
    }).select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, image_url, thumbnail_url)').single()
    if (error || !newRow) {
      if (error) toastError('Could not add exercise: ' + error.message)
      return
    }
    setExercises(prev => [...prev, { ...newRow, exercise_name: ex.name }])
    setSetData(prev => ({ ...prev, [newRow.id]: [defaultSet()] }))
    setAddExOpen(false)
    setAddExSearch('')
    setAiAddOptions([])
    // Jump to the newly added exercise
    setActiveExIdx(exercises.length)
  }

  // ── Fill open slot ───────────────────────────────────────────────────────
  async function fillSlot(exId: string, exerciseName: string, exerciseId?: string | null) {
    const { error } = await supabase.from('session_exercises').update({
      exercise_name: exerciseName,
      exercise_id: exerciseId || null,
      is_open_slot: false,
      slot_filled_by_client: true,
    }).eq('id', exId)
    if (error) {
      toastError('Could not fill slot: ' + error.message)
      return
    }

    // Fetch exercise data from library if picked from library
    let exerciseData = null
    if (exerciseId) {
      const { data } = await supabase.from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, image_url, thumbnail_url')
        .eq('id', exerciseId).single()
      exerciseData = data
    }

    setExercises(prev => prev.map(e => {
      if (e.id !== exId) return e
      const sets = e.sets_prescribed || 3
      return { ...e, exercise_name: exerciseName, exercise_id: exerciseId || null, is_open_slot: false, slot_filled_by_client: true, exercise: exerciseData }
    }))

    // Init set rows based on prescribed sets
    setSetData(prev => {
      if (prev[exId]) return prev
      const ex = exercises.find(e => e.id === exId)
      const sets = ex?.sets_prescribed || 3
      return { ...prev, [exId]: Array.from({length: sets}, () => defaultSet()) }
    })

    setSlotPickerExId(null); setSlotSearch(''); setSlotCustomName('')
  }

  async function getAIAddSuggestions() {
    if (aiAddLoading || aiAddOptions.length) return
    setAiAddLoading(true)
    try {
      const currentMuscles = [...new Set(exercises.flatMap(ex => ex.exercise?.muscles || []))]
      const candidates = swapLibrary
        .filter(o => !exercises.some(ex => ex.exercise_id === o.id))
        .slice(0, 60)
      if (!candidates.length) { setAiAddLoading(false); return }
      const candidateList = candidates.map(c => `${c.id}|${c.name}|${c.equipment||'bodyweight'}|${(c.muscles||[]).join(',')}`).join('\n')
      const res = await fetch('/api/ai-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{ role: 'user', content: `You are a personal trainer. A client has done: ${exercises.map(e => e.exercise_name).join(', ')}. Muscles worked: ${currentMuscles.join(', ') || 'unknown'}. Suggest 5 exercises to ADD that complement this session (fill gaps, finish strong). Return ONLY the IDs from this list, one per line:\n${candidateList}` }]
        })
      })
      const data = await res.json()
      const ids = (data.content?.[0]?.text || '').trim().split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 5)
      const matched = ids.map((id: string) => candidates.find(c => c.id === id)).filter(Boolean) as ExerciseLibraryItem[]
      setAiAddOptions(matched.length ? matched : candidates.slice(0, 5))
    } catch { setAiAddOptions(swapLibrary.filter(o => !exercises.some(ex => ex.exercise_id === o.id)).slice(0, 5)) }
    setAiAddLoading(false)
  }

  const getAddExOptions = (): ExerciseLibraryItem[] => {
    const search = addExSearch.toLowerCase().trim()
    const pool = swapLibrary.filter(o => !exercises.some(ex => ex.exercise_id === o.id))
    if (aiAddOptions.length && !search) return aiAddOptions
    if (!search) return pool.slice(0, 8)
    return pool.filter(o => (o.name||'').toLowerCase().includes(search) || (o.equipment||'').toLowerCase().includes(search)).slice(0, 10)
  }

  async function swapExercise(exerciseRow: SessionExercise, replacementId: string) {
    const replacement = swapLibrary.find(option => option.id === replacementId)
    if (!replacement) return

    const note = swapNote[exerciseRow.id] || ''

    const originalExerciseId = exerciseRow.original_exercise_id || exerciseRow.exercise_id || null
    const originalExerciseName = exerciseRow.original_exercise_name || exerciseRow.exercise_name

    const { error } = await supabase.from('session_exercises').update({
      original_exercise_id: originalExerciseId,
      original_exercise_name: originalExerciseName,
      exercise_id: replacement.id,
      exercise_name: replacement.name,
      swap_exercise_id: replacement.id,
      swap_reason: null,
      swap_note: note.trim() || null,
      swapped_at: new Date().toISOString(),
      skipped: false,
      skip_reason: null,
      skip_note: null,
      skipped_at: null,
    }).eq('id', exerciseRow.id)

    if (error) {
      toastError('Could not swap exercise: ' + error.message)
      return
    }

    setExercises(prev => prev.map(ex => ex.id === exerciseRow.id ? {
      ...ex,
      exercise_id: replacement.id,
      exercise_name: replacement.name || '',
      original_exercise_id: originalExerciseId,
      original_exercise_name: originalExerciseName,
      swap_exercise_id: replacement.id,
      swap_reason: null,
      swap_note: note.trim() || null,
      swapped_at: new Date().toISOString(),
      skipped: false,
      exercise: replacement,
    } : ex))
    setSwapOpen(prev => ({ ...prev, [exerciseRow.id]: false }))
    setSkipped(prev => ({ ...prev, [exerciseRow.id]: false }))
  }

  async function uploadFormVideo(exId: string, file: File) {
    const MAX_MB = 200 // ~2 min video at mobile quality
    if (file.size > MAX_MB * 1024 * 1024) {
      toastError(`Video too large. Please keep clips under 2 minutes (${MAX_MB}MB max). Tip: trim it in your camera roll before uploading.`)
      return
    }
    setVideoUploading(prev => ({ ...prev, [exId]: true }))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVideoUploading(prev => ({ ...prev, [exId]: false })); return }
    const ext = file.name.split('.').pop() || 'mp4'
    const path = `${user.id}/${sessionId}/${exId}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('form-checks').upload(path, file)
    if (error) {
      console.error('Form check upload error:', error.message)
      toastError(`Upload failed: ${error.message}`)
    } else {
      const { data: signedData } = await supabase.storage.from('form-checks').createSignedUrl(path, 60 * 60)
      const signedUrl = signedData?.signedUrl || null
      setVideoUploads(prev => ({ ...prev, [exId]: signedUrl || path }))
      const { error: updateErr } = await supabase.from('session_exercises').update({ client_video_url: path }).eq('id', exId)
      if (updateErr) toastError('Video uploaded but could not link it to the exercise: ' + updateErr.message)
    }
    setVideoUploading(prev => ({ ...prev, [exId]: false }))
  }

  async function removeFormVideo(exId: string) {
    const { error } = await supabase.from('session_exercises').update({ client_video_url: null }).eq('id', exId)
    if (error) {
      toastError('Could not remove video: ' + error.message)
      return
    }
    setVideoUploads(prev => { const next = { ...prev }; delete next[exId]; return next })
  }

  async function cancelWorkout() {
    try {
      // Delete any uploaded form check videos from storage
      const videoKeys = Object.keys(videoUploads)
      if (videoKeys.length > 0) {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const paths = exercises
            .filter(e => e.client_video_url)
            .map(e => e.client_video_url as string)
          if (paths.length > 0) {
            await supabase.storage.from('form-checks').remove(paths)
          }
        }
      }
      // Wipe all logged sets for this session
      await supabase.from('exercise_sets').delete().eq('session_id', sessionId).throwOnError()
      // Delete any exercises the client added mid-workout — they weren't part
      // of the original prescription, so Clear should remove them entirely
      await supabase.from('session_exercises').delete()
        .eq('session_id', sessionId)
        .eq('added_by_client', true)
        .throwOnError()
      // Reset all remaining session_exercises: unlog, unskip, clear all skip/swap tracking
      await supabase.from('session_exercises').update({
        sets_completed: 0,
        client_video_url: null,
        skipped: false,
        skip_reason: null,
        skip_note: null,
        skipped_at: null,
        notes_client: null,
      }).eq('session_id', sessionId).throwOnError()
      // Revert any swapped exercises back to the original — per-row because each
      // needs its own original_exercise_id/name to restore from
      const swappedRows = exercises.filter(e => e.original_exercise_id || e.original_exercise_name)
      for (const row of swappedRows) {
        await supabase.from('session_exercises').update({
          exercise_id: row.original_exercise_id || null,
          exercise_name: row.original_exercise_name || row.exercise_name,
          original_exercise_id: null,
          original_exercise_name: null,
          swap_exercise_id: null,
          swap_reason: null,
          swap_note: null,
          swapped_at: null,
        }).eq('id', row.id).throwOnError()
      }
      // Revert any filled open slots back to unfilled so client can pick again
      // Done per-row because each slot restores its own slot_constraint as the display name
      const filledSlots = exercises.filter(e => e.slot_filled_by_client)
      for (const slot of filledSlots) {
        await supabase.from('session_exercises').update({
          exercise_id: null,
          exercise_name: slot.slot_constraint || "Client's Choice",
          is_open_slot: true,
          slot_filled_by_client: false,
        }).eq('id', slot.id).throwOnError()
      }
      // Reset session back to assigned
      await supabase.from('workout_sessions').update({
        status: 'assigned',
        started_at: null,
      }).eq('id', sessionId).throwOnError()
      router.push(returnUrl)
    } catch (err: any) {
      console.error('cancelWorkout failed:', err)
      toastError('Could not clear the workout: ' + (err?.message || 'Unknown error') + '. Please try again.')
    }
  }

  async function saveAndExit() {
    // Keep whatever they logged, just leave in_progress and exit
    router.push(returnUrl)
  }

  async function reopenWorkout() {
    // Preserve the original duration so the timer keeps ticking from where
    // they left off instead of resetting to 0. We shift started_at backwards
    // by the saved duration so (now - started_at) matches their previous
    // elapsed time.
    const preservedDuration = session?.duration_seconds || 0
    const newStartedAt = new Date(Date.now() - preservedDuration * 1000).toISOString()
    const { error } = await supabase.from('workout_sessions').update({
      status: 'in_progress',
      completed_at: null,
      started_at: newStartedAt,
    }).eq('id', sessionId)
    if (error) {
      toastError('Could not reopen workout: ' + error.message)
      return
    }
    // Sync local session state — without this, the timer useEffect won't run
    // and the normal workout UI branches won't render because status is still
    // 'completed' in React state even though the DB is updated.
    setSession(prev => prev ? { ...prev, status: 'in_progress', completed_at: null, started_at: newStartedAt } : prev)
    // Mark this session as re-opened so re-finishing skips the coach push.
    wasReopenedRef.current = true
    setIsReopened(false)
  }

  async function finishWorkout() {
    setSaving(true)
    const now = new Date()
    const isCoachMode = returnUrl.includes('/preview/')
    const skipReview = isCoachMode || isInPerson
    const reviewDue = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('workout_sessions').update({
      status: 'completed',
      completed_at: now.toISOString(),
      // Skip review for coach-logged sessions and in-person clients
      ...(skipReview ? { coach_reviewed_at: now.toISOString() } : { review_due_at: reviewDue.toISOString() }),
      duration_seconds: elapsedSeconds,
      session_rpe: parseInt(finishForm.session_rpe) || null,
      energy_level: parseInt(finishForm.energy_level),
      mood: finishForm.mood,
      notes_client: finishForm.notes_client || null
    }).eq('id', sessionId)

    if (error) {
      console.error('finishWorkout error:', error)
      toastError('Something went wrong saving your workout. Please try again.')
      setSaving(false)
      return
    }

    // Fire-and-forget push notification — never block completion on this
    if (session?.coach_id && !wasReopenedRef.current) {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (authSession?.access_token) {
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: {
            'Content-Type':'application/json',
            'Authorization': `Bearer ${authSession.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id: session.coach_id,
            notification_type: 'checkin_submitted',
            title: `Workout completed: ${session.title}`,
            body: `Session logged in ${Math.floor(elapsedSeconds/60)} min${finishForm.session_rpe ? ` · RPE ${finishForm.session_rpe}` : ''}`,
            link_url: `/dashboard/coach/reviews`,
            data: { session_id: sessionId }
          })
        }).catch(err => console.warn('[workout:bg-load] failed', err)) // intentionally swallowed — never block on this
      }
    }

    setSaving(false)

    // Build the post-workout summary BEFORE switching to the complete phase so
    // the summary screen can render it immediately instead of racing the DB.
    // Total weight moved + PR detection both need the just-saved session state,
    // so this happens after the status update above.
    if (session?.client_id) {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
      try {
        const [totalWeight, prs] = await Promise.all([
          computeTotalWeightMoved(),
          detectPRsAndMilestones(session.client_id, todayStr),
        ])
        setSessionSummary({
          totalWeightMoved: totalWeight,
          totalLoggedSets,
          prs,
        })
      } catch (err) {
        // If the summary fetch fails we still want the user to reach the
        // complete screen — they just won't see the fancy stats.
        console.error('Session summary build failed:', err)
        setSessionSummary({ totalWeightMoved: 0, totalLoggedSets, prs: [] })
      }
    }

    setPhase('complete')
  }

  // Sum weight_value x reps_completed across all logged non-warmup sets in
  // this session. Warmup sets are excluded because they don't count as "moved."
  async function computeTotalWeightMoved(): Promise<number> {
    const { data, error } = await supabase
      .from('exercise_sets')
      .select('weight_value, reps_completed')
      .eq('session_id', sessionId)
      .eq('is_warmup', false)
      .not('weight_value', 'is', null)
    if (error || !data) return 0
    return data.reduce((sum, s) => {
      const w = Number(s.weight_value) || 0
      const r = Number(s.reps_completed) || 0
      return sum + w * r
    }, 0)
  }


  // Detect PRs and milestones after workout completion
  async function detectPRsAndMilestones(clientId: string, today: string): Promise<SessionPR[]> {
    const sessionPRs: SessionPR[] = []
    try {
      // 1. Get all sets from this session with exercise info
      const { data: sessionExs } = await supabase
        .from('session_exercises')
        .select('id, exercise_id, exercise_name')
        .eq('session_id', sessionId)

      if (!sessionExs?.length) return sessionPRs

      const newMilestones: string[] = []

      for (const se of sessionExs) {
        if (!se.exercise_id) continue

        // Get best set by weight this session (non-warmup)
        const { data: allSets } = await supabase
          .from('exercise_sets')
          .select('weight_value, reps_completed')
          .eq('session_exercise_id', se.id)
          .eq('is_warmup', false)
          .not('weight_value', 'is', null)

        if (!allSets?.length) continue

        // Best weight set
        const bestWeightSet = allSets.reduce((best, s) =>
          Number(s.weight_value) > Number(best.weight_value) ? s : best, allSets[0])
        const bestWeight = Number(bestWeightSet.weight_value)
        const bestReps = bestWeightSet.reps_completed || 1

        // Best reps at each weight (for rep PRs)
        const repsByWeight: Record<number, number> = {}
        for (const s of allSets) {
          const w = Number(s.weight_value)
          const r = s.reps_completed || 1
          if (!repsByWeight[w] || r > repsByWeight[w]) repsByWeight[w] = r
        }

        // Get existing PR for this exercise
        const { data: existing } = await supabase
          .from('personal_records')
          .select('weight_pr, rep_pr_reps, rep_pr_weight, rep_count')
          .eq('client_id', clientId)
          .eq('exercise_id', se.exercise_id)
          .single()

        const prevWeightPR = Number(existing?.weight_pr || 0)
        const isWeightPR = bestWeight > prevWeightPR

        // Rep PR: more reps at a weight they've done before, or same weight more reps
        const prevRepPRWeight = Number(existing?.rep_pr_weight || 0)
        const prevRepPRReps = Number(existing?.rep_pr_reps || 0)
        const isRepPR = !isWeightPR && (
          (bestWeight === prevRepPRWeight && bestReps > prevRepPRReps) ||
          (bestWeight >= prevRepPRWeight && bestReps > prevRepPRReps)
        )

        const exerciseName = se.exercise_name || 'exercise'

        if (isWeightPR) {
          await supabase.from('personal_records').upsert({
            client_id: clientId,
            exercise_id: se.exercise_id,
            weight_pr: bestWeight,
            rep_pr_reps: bestReps,
            rep_pr_weight: bestWeight,
            rep_count: bestReps,
            pr_type: 'weight',
            logged_date: today,
          }, { onConflict: 'client_id,exercise_id' })

          sessionPRs.push({ exercise_name: exerciseName, pr_type: 'weight', weight: bestWeight, reps: bestReps })
          newMilestones.push(`🏆 New PR — ${exerciseName}: ${bestWeight} lbs x ${bestReps}!`)

          // Sync any weight_lifted goals tied to THIS exercise. Bumps
          // current_value on every PR — not just when the target is hit —
          // so the progress bar climbs as the lift goes up. Marks the goal
          // completed if the new PR meets or exceeds the target.
          const { data: matchingGoals } = await supabase
            .from('client_goals')
            .select('id, title, target_value')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .eq('type', 'weight_lifted')
            .eq('exercise_id', se.exercise_id)
          if (matchingGoals?.length) {
            for (const goal of matchingGoals) {
              if (bestWeight >= Number(goal.target_value)) {
                await supabase.from('client_goals').update({
                  status: 'completed',
                  completed_at: new Date().toISOString(),
                  current_value: bestWeight,
                  updated_at: new Date().toISOString(),
                }).eq('id', goal.id)
                newMilestones.push(`🎯 Goal crushed: ${goal.title}!`)
              } else {
                await supabase.from('client_goals').update({
                  current_value: bestWeight,
                  updated_at: new Date().toISOString(),
                }).eq('id', goal.id)
              }
            }
          }
        } else if (isRepPR) {
          await supabase.from('personal_records').upsert({
            client_id: clientId,
            exercise_id: se.exercise_id,
            weight_pr: prevWeightPR || bestWeight,
            rep_pr_reps: bestReps,
            rep_pr_weight: bestWeight,
            rep_count: bestReps,
            pr_type: 'rep',
            logged_date: today,
          }, { onConflict: 'client_id,exercise_id' })

          sessionPRs.push({ exercise_name: exerciseName, pr_type: 'rep', weight: bestWeight, reps: bestReps })
          newMilestones.push(`💪 Rep PR — ${exerciseName}: ${bestWeight} lbs x ${bestReps}!`)
        }
      }

      // 1b. Update consistency goals
      const { data: consistencyGoals } = await supabase
        .from('client_goals')
        .select('id, target_value')
        .eq('client_id', clientId)
        .eq('status', 'active')
        .eq('type', 'consistency')
      if (consistencyGoals?.length) {
        const { count: doneCount } = await supabase
          .from('workout_sessions')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .eq('status', 'completed')
        const current = doneCount || 0
        for (const goal of consistencyGoals) {
          if (current >= Number(goal.target_value)) {
            await supabase.from('client_goals').update({
              status: 'completed', completed_at: new Date().toISOString(), current_value: current,
            }).eq('id', goal.id)
            newMilestones.push(`Consistency goal crushed: ${current} workouts done!`)
          } else {
            await supabase.from('client_goals').update({ current_value: current }).eq('id', goal.id)
          }
        }
      }

      // 2. Check consistency milestones
      const { count: totalDone } = await supabase
        .from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId)
        .eq('status', 'completed')

      const total = totalDone || 0
      const milestoneThresholds = [
        { count: 1,   msg: `💪 First workout complete — let's go!` },
        { count: 5,   msg: `🔥 5 workouts done. The habit is forming.` },
        { count: 10,  msg: `⭐ 10 workouts! You're building something real.` },
        { count: 25,  msg: `🏆 25 workouts. Consistency is your superpower.` },
        { count: 50,  msg: `🔥 50 workouts. You are not the same person you were.` },
        { count: 100, msg: `🏆 100 WORKOUTS. Legendary. Absolute legend.` },
      ]

      for (const t of milestoneThresholds) {
        if (total === t.count) {
          newMilestones.push(t.msg)
          break
        }
      }

      // 3. Insert all new milestones
      if (newMilestones.length > 0) {
        await supabase.from('milestones').insert(
          newMilestones.map(msg => ({
            client_id: clientId,
            milestone_type: msg.includes('PR') || msg.includes('Rep PR') ? 'pr' : msg.includes('Goal') ? 'goal' : 'consistency',
            message: msg,
            seen: false,
          }))
        )
      }
    } catch (e) {
      console.error('PR/milestone detection error:', e)
    }
    return sessionPRs
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const totalLoggedSets = exercises.reduce((sum, ex) => sum + (setData[ex.id] || []).filter(setRow => setRow.logged).length, 0)
  const skippedExerciseCount = exercises.filter(ex => skipped[ex.id]).length
  const completedExerciseCount = exercises.filter(ex => {
    const total = ex.sets_prescribed || setData[ex.id]?.length || 0
    const done = (setData[ex.id] || []).filter(setRow => setRow.logged).length
    return skipped[ex.id] || (total > 0 && done >= total)
  }).length
  const allLogged = exercises.length > 0 && exercises.every(ex =>
    skipped[ex.id] || (setData[ex.id]||[]).some(s=>s.logged)
  )

  if (loading) return (
    // Skeleton mimics the loaded layout: sticky header + 3 exercise cards.
    // Same backgrounds, paddings, and rounded shapes as the real UI so there's
    // no jump when the data lands.
    <div style={{ minHeight:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif" }}>
      <style>{`
        @keyframes srg-wo-skel { 0%,100% { opacity:.55 } 50% { opacity:.95 } }
        .srg-wo-skel { animation: srg-wo-skel 1.4s ease-in-out infinite; background:${t.surfaceUp}; border-radius:8px; }
      `}</style>
      <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'14px 18px', display:'flex', alignItems:'center', gap:12 }}>
        <div className="srg-wo-skel" style={{ width:80, height:14 }} />
        <div style={{ flex:1 }} />
        <div className="srg-wo-skel" style={{ width:60, height:14 }} />
      </div>
      <div style={{ padding:'18px 16px', display:'flex', flexDirection:'column', gap:14 }}>
        {[0,1,2].map(i => (
          <div key={i} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:16, display:'flex', flexDirection:'column', gap:10 }}>
            <div className="srg-wo-skel" style={{ width:'62%', height:16 }} />
            <div className="srg-wo-skel" style={{ width:'38%', height:12 }} />
            <div style={{ display:'flex', gap:8, marginTop:6 }}>
              <div className="srg-wo-skel" style={{ flex:1, height:36 }} />
              <div className="srg-wo-skel" style={{ flex:1, height:36 }} />
              <div className="srg-wo-skel" style={{ width:64, height:36 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  if (!loading && exercises.length === 0) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',fontFamily:"'DM Sans',sans-serif",color:t.text}}>
      <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
      <div style={{fontSize:18,fontWeight:800,marginBottom:8,color:t.orange}}>No exercises in this workout</div>
      <div style={{fontSize:13,color:t.textMuted,marginBottom:32,maxWidth:280,lineHeight:1.6}}>This session has no exercises assigned yet. Your coach needs to add exercises to this program first.</div>
      <button onClick={()=>router.push(returnUrl)} style={{background:t.tealDim,border:'1px solid '+alpha(t.teal, 25),borderRadius:12,padding:'12px 24px',fontSize:14,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
        ← Back to Dashboard
      </button>
    </div>
  )

  if (phase === 'complete') return <WorkoutComplete session={session} elapsed={elapsedSeconds} router={router} t={t} sessionId={sessionId} supabase={supabase} returnUrl={returnUrl} summary={sessionSummary}/>

  // ── Preview (assigned, not yet started) ──────────────────────────────────
  // Lets the client peek at what's coming before the timer starts.
  if (session?.status === 'assigned' && !isReopened) {
    const totalSets = exercises.reduce((sum, ex) => sum + (ex.sets_prescribed || 0), 0)
    // Rough estimate: each set ~45s of work + the prescribed rest, +30s per
    // exercise for setup. Floors at 10 min so we never tell someone "1 min".
    const estSeconds = exercises.reduce((sum, ex) => {
      const sets = ex.sets_prescribed || 3
      const rest = ex.rest_seconds || 60
      return sum + sets * 45 + Math.max(sets - 1, 0) * rest + 30
    }, 0)
    const estMin = Math.max(10, Math.round(estSeconds / 60))

    const handleStart = async () => {
      const startedAt = new Date().toISOString()
      const { error } = await supabase.from('workout_sessions')
        .update({ status: 'in_progress', started_at: startedAt })
        .eq('id', sessionId).eq('status', 'assigned')
      if (error) {
        toastError('Could not start workout: ' + error.message)
        return
      }
      // Update local state so the timer effect picks up immediately;
      // skips a full reload so the user goes straight into the logger.
      setSession(prev => prev ? { ...prev, status: 'in_progress', started_at: startedAt } : prev)
    }

    return (
      <>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
        <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',padding:'24px 20px',paddingBottom:'calc(96px + env(safe-area-inset-bottom))'}}>
          <button onClick={()=>router.push(returnUrl)}
            style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:700,marginBottom:20,display:'flex',alignItems:'center',gap:6,padding:0}}>
            ← Back
          </button>
          <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>{session?.title}</div>
          <div style={{fontSize:12,color:t.textMuted,marginBottom:16}}>
            {session?.scheduled_date ? new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'}) : 'Ready when you are'}
          </div>

          {/* Stat strip */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:18}}>
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 12px',textAlign:'center'}}>
              <div style={{fontSize:11,color:t.textMuted,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Exercises</div>
              <div style={{fontSize:20,fontWeight:900,color:t.text,marginTop:2}}>{exercises.length}</div>
            </div>
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 12px',textAlign:'center'}}>
              <div style={{fontSize:11,color:t.textMuted,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Sets</div>
              <div style={{fontSize:20,fontWeight:900,color:t.text,marginTop:2}}>{totalSets || '—'}</div>
            </div>
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 12px',textAlign:'center'}}>
              <div style={{fontSize:11,color:t.textMuted,fontWeight:700,textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>Est. Time</div>
              <div style={{fontSize:20,fontWeight:900,color:t.text,marginTop:2}}>~{estMin}m</div>
            </div>
          </div>

          {session?.notes_coach && (
            <div style={{background:alpha(t.orange, 8),border:`1px solid ${alpha(t.orange, 25)}`,borderRadius:12,padding:'10px 14px',marginBottom:16,display:'flex',gap:8}}>
              <span style={{fontSize:14}}>📌</span>
              <p style={{fontSize:12,color:t.orange,lineHeight:1.5,margin:0,whiteSpace:'pre-wrap' as const}}>{session.notes_coach}</p>
            </div>
          )}

          {/* Exercise list */}
          <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:10}}>What you&apos;re doing</div>
          {exercises.length === 0 ? (
            <div style={{fontSize:13,color:t.textMuted,fontStyle:'italic',marginBottom:16}}>No exercises yet. Check back with your coach.</div>
          ) : exercises.map((ex, i) => (
            <div key={ex.id} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,minWidth:20,textAlign:'center'}}>{i + 1}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text}}>{ex.exercise_name}</div>
                <div style={{fontSize:11,color:t.textMuted,marginTop:2}}>
                  {ex.sets_prescribed || '—'} × {ex.reps_prescribed || '—'}{ex.weight_prescribed ? ` @ ${ex.weight_prescribed}` : ''}{ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ''}
                </div>
              </div>
            </div>
          ))}

          {/* Sticky start bar */}
          <div style={{position:'fixed',bottom:0,left:0,right:0,background:t.bg,borderTop:`1px solid ${t.border}`,padding:'12px 20px calc(12px + env(safe-area-inset-bottom))',maxWidth:480,margin:'0 auto'}}>
            <button onClick={handleStart} disabled={exercises.length === 0}
              style={{width:'100%',background:exercises.length === 0 ? t.surfaceHigh : `linear-gradient(135deg,${t.teal},${alpha(t.teal, 80)})`,border:'none',borderRadius:13,padding:'14px',fontSize:15,fontWeight:800,color:exercises.length === 0 ? t.textMuted : '#000',cursor:exercises.length === 0 ? 'not-allowed' : 'pointer',fontFamily:"'DM Sans',sans-serif"}}>
              ▶ Start Workout
            </button>
          </div>
        </div>
      </>
    )
  }

  // ── Re-opened completed workout ──────────────────────────────────────────
  if (isReopened) {
    const isReviewed = !!session?.coach_reviewed_at

    // Read-only summary of what the client logged. Used in both the reviewed
    // (locked) branch and the unreviewed (re-openable) branch so clients can
    // browse history without having to tap into Re-open.
    const loggedSummary = (
      <div style={{marginBottom:18}}>
        <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:10}}>
          Your Workout
        </div>
        {exercises.length === 0 ? (
          <div style={{fontSize:13,color:t.textMuted,fontStyle:'italic'}}>No exercises logged.</div>
        ) : exercises.map(ex => {
          const sets = (setData[ex.id] || []).filter(s => s.logged)
          const isSkipped = skipped[ex.id]
          return (
            <div key={ex.id} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'12px 14px',marginBottom:10}}>
              <div style={{fontSize:14,fontWeight:800,color:t.text,marginBottom:4}}>{ex.exercise_name}</div>
              {(ex.sets_prescribed || ex.reps_prescribed || ex.weight_prescribed) && (
                <div style={{fontSize:11,color:t.textMuted,marginBottom:8}}>
                  Prescribed: {ex.sets_prescribed || '—'} × {ex.reps_prescribed || '—'}{ex.weight_prescribed ? ` @ ${ex.weight_prescribed}` : ''}
                </div>
              )}
              {isSkipped ? (
                <div style={{fontSize:12,color:t.orange,fontStyle:'italic'}}>Skipped</div>
              ) : sets.length === 0 ? (
                <div style={{fontSize:12,color:t.textMuted,fontStyle:'italic'}}>No sets logged.</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:4}}>
                  {sets.map((s, idx) => (
                    <div key={idx} style={{fontSize:13,color:t.text,fontVariantNumeric:'tabular-nums' as const}}>
                      <span style={{color:t.textMuted,marginRight:8}}>Set {idx + 1}{s.is_warmup ? ' (warmup)' : ''}:</span>
                      {s.weight_value ? `${s.weight_value}${s.weight_unit}` : '—'} × {s.reps_completed || '—'}{s.rpe ? ` · RPE ${s.rpe}` : ''}
                      {s.notes && <div style={{fontSize:11,color:t.textMuted,paddingLeft:0,marginTop:2,fontStyle:'italic'}}>{s.notes}</div>}
                    </div>
                  ))}
                </div>
              )}
              {ex.notes_client && !ex.notes_client.startsWith('[SKIPPED]') && (
                <div style={{fontSize:12,color:t.textDim,marginTop:8,padding:'8px 10px',background:t.surfaceUp,borderRadius:8,fontStyle:'italic'}}>
                  {ex.notes_client}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )

    // ── REVIEWED — locked, show coach feedback ─────────────────────────────
    if (isReviewed) return (
      <>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
        <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',padding:'24px 20px',paddingBottom:'calc(32px + env(safe-area-inset-bottom))'}}>
          {/* Header */}
          <button onClick={()=>router.push(returnUrl)}
            style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:700,marginBottom:20,display:'flex',alignItems:'center',gap:6,padding:0}}>
            ← Back
          </button>
          <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>{session?.title}</div>
          <div style={{fontSize:12,color:t.textMuted,marginBottom:20}}>
            Completed · {session?.completed_at ? new Date(session.completed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}
          </div>

          {/* Locked badge */}
          <div style={{display:'flex',alignItems:'center',gap:8,background:t.tealDim,border:`1px solid ${alpha(t.teal, 25)}`,borderRadius:10,padding:'10px 14px',marginBottom:20}}>
            <span style={{fontSize:16}}>🔒</span>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:t.teal}}>Coach has reviewed this session</div>
              <div style={{fontSize:11,color:t.textMuted}}>This workout is now locked</div>
            </div>
          </div>

          {/* Coach review */}
          <div style={{border:`1px solid ${alpha(t.teal, 25)}`,borderRadius:14,overflow:'hidden',marginBottom:16}}>
            <div style={{background:t.tealDim,padding:'10px 16px',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>💬</span>
              <span style={{fontSize:12,fontWeight:800,color:t.teal,textTransform:'uppercase' as const,letterSpacing:'0.06em'}}>Coach Review</span>
            </div>
            <div style={{padding:'14px 16px',background:'#0a1a1a'}}>
              {session?.coach_review_notes && (
                <div style={{fontSize:13,color:t.text,lineHeight:1.7,whiteSpace:'pre-wrap',marginBottom:session?.coach_review_video_url?14:0}}>
                  {session.coach_review_notes}
                </div>
              )}
              {reviewVideoUrl && (() => {
                const isExternal = reviewVideoUrl.startsWith('http') && !reviewVideoUrl.includes('supabase')
                if (isExternal) return (
                  <a href={reviewVideoUrl} target='_blank' rel='noreferrer' style={{display:'block',textDecoration:'none'}}>
                    <div style={{borderRadius:12,overflow:'hidden',border:`1px solid ${alpha(t.teal, 25)}`,background:t.surface,cursor:'pointer'}}>
                      <div style={{background:'#000',aspectRatio:'16/9',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                        <div style={{fontSize:40}}>🎥</div>
                        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.3)'}}>
                          <div style={{width:48,height:48,borderRadius:'50%',background:t.teal,display:'flex',alignItems:'center',justifyContent:'center'}}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#000"><polygon points="5,3 19,12 5,21"/></svg>
                          </div>
                        </div>
                      </div>
                      <div style={{padding:'10px 14px',display:'flex',alignItems:'center',gap:8}}>
                        <div style={{flex:1,fontSize:13,fontWeight:700,color:t.text}}>Watch Coach Review</div>
                        <span style={{fontSize:11,color:t.teal,fontWeight:700}}>Open ↗</span>
                      </div>
                    </div>
                  </a>
                )
                return <video src={reviewVideoUrl} controls playsInline muted style={{width:'100%',borderRadius:10,background:'#000',display:'block'}}/>
              })()}
              {!session?.coach_review_notes && !reviewVideoUrl && (
                <div style={{fontSize:13,color:t.textMuted,fontStyle:'italic'}}>No written notes left.</div>
              )}
            </div>
          </div>

          {/* Logged sets summary */}
          {loggedSummary}
        </div>
      </>
    )

    // ── NOT YET REVIEWED — can browse + re-enter ──────────────────────────
    return (
      <>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
        <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',padding:'24px 20px',paddingBottom:'calc(32px + env(safe-area-inset-bottom))'}}>
          {/* Header */}
          <button onClick={()=>router.push(returnUrl)}
            style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:700,marginBottom:20,display:'flex',alignItems:'center',gap:6,padding:0}}>
            ← Back
          </button>
          <div style={{fontSize:22,fontWeight:900,marginBottom:4}}>{session?.title}</div>
          <div style={{fontSize:12,color:t.textMuted,marginBottom:20}}>
            Completed · {session?.completed_at ? new Date(session.completed_at).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : ''}
          </div>

          {/* Awaiting-review badge */}
          <div style={{display:'flex',alignItems:'center',gap:8,background:alpha(t.orange, 10),border:`1px solid ${alpha(t.orange, 30)}`,borderRadius:10,padding:'10px 14px',marginBottom:20}}>
            <span style={{fontSize:16}}>⏳</span>
            <div>
              <div style={{fontSize:12,fontWeight:800,color:t.orange}}>Awaiting coach review</div>
              <div style={{fontSize:11,color:t.textMuted}}>You can still edit until review lands</div>
            </div>
          </div>

          {/* Logged sets summary */}
          {loggedSummary}

          {/* Actions */}
          <button onClick={reopenWorkout}
            style={{width:'100%',background:`linear-gradient(135deg,${t.orange},${alpha(t.orange, 80)})`,border:'none',borderRadius:13,padding:'14px',fontSize:15,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:10}}>
            ✏️ Re-open to Edit
          </button>
        </div>
      </>
    )
  }

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
        .workout-summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;}
        .workout-action-row{display:flex;gap:8px;flex-shrink:0;}
        .workout-exercise-nav{display:flex;gap:8px;}
        .workout-set-helper-row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
        .workout-skip-actions{display:flex;gap:8px;}
        .workout-set-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px;}
        .workout-set-note-row{display:flex;gap:8px;}
        .workout-form-check-row{display:flex;gap:8px;}
        .workout-finish-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;}
        .workout-energy-row{display:flex;gap:6px;}
        @media(max-width:640px){
          .workout-summary-grid{grid-template-columns:repeat(2,1fr);}
          .workout-action-row{width:100%;flex-wrap:wrap;}
          .workout-action-row > *{flex:1 1 140px;}
          .workout-exercise-nav{flex-direction:column;}
          .workout-skip-actions{flex-direction:column;}
          .workout-set-grid{grid-template-columns:1fr;}
          .workout-set-note-row{flex-direction:column;}
          .workout-form-check-row{flex-direction:column;}
          .workout-finish-grid{grid-template-columns:1fr;}
        }`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column'}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:`1px solid ${t.border}`,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:50}}>
          <button onClick={()=>setShowCancelSheet(true)}
            aria-label="Cancel workout and return to dashboard"
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:20,lineHeight:1}}>←</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15}}>{session?.title}</div>
            {session?.day_label && <div style={{fontSize:11,color:t.textDim}}>{session.day_label}</div>}
          </div>
          <div style={{fontSize:16,fontWeight:800,color:t.teal,fontVariantNumeric:'tabular-nums'}}>⏱ {fmtTime(elapsedSeconds)}</div>
          <button onClick={()=>setShowCancelSheet(true)}
            aria-label="Cancel workout"
            style={{background:t.redDim,border:'1px solid '+alpha(t.red, 25),borderRadius:8,padding:'5px 11px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            Cancel
          </button>
        </div>

        {/* Offline / pending-sync banner */}
        {(isOffline || queuedSetCount > 0) && (
          <div style={{background:isOffline ? alpha(t.orange, 13) : alpha(t.teal, 13), borderBottom:`1px solid ${isOffline ? alpha(t.orange, 25) : alpha(t.teal, 25)}`,padding:'8px 16px',display:'flex',alignItems:'center',gap:10,fontSize:12}}>
            <span style={{fontSize:14}}>{isOffline ? '📡' : '⏳'}</span>
            <span style={{flex:1,color:isOffline ? t.orange : t.teal,fontWeight:700}}>
              {isOffline
                ? (queuedSetCount > 0 ? `Offline · ${queuedSetCount} set${queuedSetCount === 1 ? '' : 's'} saved locally` : 'Offline — your sets will sync when you reconnect')
                : `Syncing ${queuedSetCount} pending set${queuedSetCount === 1 ? '' : 's'}…`}
            </span>
          </div>
        )}

        {/* Rest timer banner */}
        {restActive && restTimer !== null && (
          <div style={{background:`linear-gradient(135deg,${alpha(t.teal, 13)},${alpha(t.teal, 3)})`,borderBottom:`1px solid ${alpha(t.teal, 25)}`,padding:'10px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:20}}>⏸</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Rest Time</div>
              <div style={{fontSize:11,color:t.textDim}}>Next set in {restTimer}s</div>
            </div>
            <span style={{fontSize:24,fontWeight:900,color:t.teal,fontVariantNumeric:'tabular-nums'}}>{restTimer}s</span>
            <button onClick={()=>{setRestActive(false);setRestTimer(null)}}
              aria-label="Skip rest timer"
              style={{background:t.tealDim,border:`1px solid ${alpha(t.teal, 25)}`,borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,color:t.teal,cursor:'pointer'}}>
              Skip
            </button>
          </div>
        )}

        {/* Coach notes */}
        {session?.notes_coach && (
          <div style={{margin:'12px 16px 0',background:'#1a1a0a',border:'1px solid #3a3a1a',borderRadius:12,padding:'10px 14px',display:'flex',gap:8}}>
            <span style={{fontSize:16}}>📌</span>
            <p style={{fontSize:13,color:t.orange,lineHeight:1.5}}>{session.notes_coach}</p>
          </div>
        )}

        {/* Exercise list — grouped by role */}
        <div style={{flex:1,overflowY:'auto',padding:'12px 16px 16px'}}>
          {(() => {
            // Group exercises by role
            const ROLE_ORDER = ['warmup','main','secondary','accessory','variation','cooldown','finisher']
            const ROLE_LABELS: Record<string,string> = {
              warmup:'🔥 Warm-Up', main:'💪 Main', secondary:'🎯 Secondary',
              accessory:'⚙️ Accessory', variation:'🔄 Variation', cooldown:'🧘 Cool-Down',
              finisher:'🔴 Finisher',
            }
            const ROLE_COLORS: Record<string,string> = {
              warmup:t.teal, main:t.orange, secondary:'#f472b6',
              accessory:'#8b5cf6', variation:t.accent, cooldown:'#8b5cf6',
              finisher:'#ef4444',
            }
            // Build groups preserving order of first appearance
            const seen: string[] = []
            exercises.forEach(ex => {
              const r = ex.exercise_role || 'main'
              if (!seen.includes(r)) seen.push(r)
            })
            const groups = seen.map(role => ({
              role,
              label: ROLE_LABELS[role] || role,
              color: ROLE_COLORS[role] || t.orange,
              exercises: exercises.filter(ex => (ex.exercise_role || 'main') === role)
            }))

            return groups.map(group => (
              <div key={group.role} style={{marginBottom:20}}>
                {/* Section header */}
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                  <div style={{height:1,background:alpha(group.color, 19),flex:1}}/>
                  <span style={{fontSize:11,fontWeight:800,color:group.color,letterSpacing:'0.08em',textTransform:'uppercase' as const,whiteSpace:'nowrap' as const}}>
                    {group.label}
                  </span>
                  <div style={{height:1,background:alpha(group.color, 19),flex:1}}/>
                </div>

                {/* Exercise cards — with superset group headers */}
                {(() => {
                  let lastGroup: string | null = null
                  const GROUP_TYPE_LABELS: Record<string,string> = { straight:'Straight Sets', superset:'Superset', triset:'Tri-Set', circuit:'Circuit', amrap:'AMRAP', emom:'EMOM', cluster:'Cluster Sets', dropset:'Drop Set', contrast:'Contrast/PAP' }
                  return group.exercises.map(ex => {
                  const sg = ex.superset_group?.trim() || null
                  const showGroupHeader = sg && sg !== lastGroup
                  if (sg) lastGroup = sg
                  const groupHeader = showGroupHeader ? (
                    <div key={'gh-'+sg} style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0 6px'}}>
                      <div style={{background:alpha(group.color, 9),border:'1px solid '+alpha(group.color, 25),borderRadius:6,padding:'2px 10px',fontSize:10,fontWeight:900,color:group.color,letterSpacing:'0.08em'}}>
                        {sg}
                      </div>
                      <div style={{fontSize:10,fontWeight:700,color:t.textMuted}}>{GROUP_TYPE_LABELS[ex.group_type||'straight']||'Straight Sets'}</div>
                      <div style={{height:1,background:alpha(group.color, 13),flex:1}}/>
                    </div>
                  ) : null
                  const setsArr = setData[ex.id] || []
                  const done = setsArr.filter(s=>s.logged).length
                  const total = ex.sets_prescribed || setsArr.length || 0
                  const complete = done >= total && total > 0
                  const isSkipped = skipped[ex.id]
                  const isOpen = expandedExId === ex.id

                  // ── Open slot card ──────────────────────────────────────
                  if (ex.is_open_slot) return (
                    <React.Fragment key={ex.id}>
                    {groupHeader}
                    <div style={{marginBottom:8,border:`1px dashed ${alpha(t.yellow, 38)}`,borderRadius:14,background:alpha(t.yellow, 3),padding:'16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <span style={{fontSize:24,flexShrink:0}}>🎲</span>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:800,color:t.yellow}}>Your Choice</div>
                          <div style={{fontSize:12,color:t.textMuted,marginTop:2}}>{ex.slot_constraint || 'Pick any exercise'}</div>
                          <div style={{fontSize:11,color:t.textMuted,marginTop:1}}>
                            {ex.tracking_type === 'time'
                              ? `${ex.sets_prescribed} set${(ex.sets_prescribed||1)>1?'s':''} · ${ex.duration_seconds ? Math.round(ex.duration_seconds/60)+'min' : ''}`
                              : `${ex.sets_prescribed}×${ex.reps_prescribed}`}
                          </div>
                        </div>
                        <button onClick={()=>{ setSlotPickerExId(ex.id); setSlotSearch(''); setSlotCustomName(''); setSlotTab('library') }}
                          style={{background:`linear-gradient(135deg,${t.yellow},${alpha(t.yellow, 80)})`,border:'none',borderRadius:10,padding:'10px 16px',fontSize:13,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",flexShrink:0}}>
                          Pick →
                        </button>
                      </div>
                    </div>
                    </React.Fragment>
                  )
                  return (
                    <React.Fragment key={ex.id}>
                    {groupHeader}
                    <div ref={el => { cardRefs.current[ex.id] = el }} style={{marginBottom:8,border:`1px solid ${isOpen?alpha(group.color, 31):isSkipped?t.border:complete?alpha(t.green, 25):t.border}`,borderRadius:14,overflow:'hidden',background:t.surface}}>

                      {/* Card header — always visible, tap to expand */}
                      <button onClick={()=>setExpandedExId(isOpen ? null : ex.id)}
                        aria-label={`${isOpen?'Collapse':'Expand'} ${ex.exercise_name}`}
                        aria-expanded={isOpen}
                        style={{width:'100%',display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:'none',border:'none',cursor:'pointer',textAlign:'left' as const,fontFamily:"'DM Sans',sans-serif"}}>
                        {/* Status dot */}
                        <div style={{width:10,height:10,borderRadius:'50%',flexShrink:0,
                          background:isSkipped?t.border:complete?t.green:done>0?t.orange:t.surfaceHigh,
                          border:`2px solid ${isSkipped?t.border:complete?t.green:done>0?t.orange:t.border}`}}/>
                        {/* Name + prescription */}
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,color:isSkipped?t.textMuted:t.text,textDecoration:isSkipped?'line-through':'none',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                            {ex.exercise_name || ex.exercise?.name || 'Exercise'}
                          </div>
                          <div style={{fontSize:11,color:t.textMuted,marginTop:1}}>
                            {ex.sets_prescribed} sets · {ex.tracking_type==='time'?`${ex.duration_seconds||'—'}s`:ex.reps_prescribed+' reps'}{ex.weight_prescribed?` · ${ex.weight_prescribed}`:''}
                          </div>
                        </div>
                        {/* Progress + chevron */}
                        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                          {isSkipped
                            ? <span style={{fontSize:11,fontWeight:700,color:t.textMuted}}>⏭ Skipped</span>
                            : <span style={{fontSize:12,fontWeight:800,color:complete?t.green:done>0?t.orange:t.textMuted}}>{done}/{total}</span>
                          }
                          <span style={{fontSize:12,color:t.textMuted,transform:isOpen?'rotate(180deg)':'none',transition:'transform 0.2s'}}>▼</span>
                        </div>
                      </button>

                      {/* Expanded content */}
                      {isOpen && (
                        <div style={{padding:'0 16px 16px'}}>

                          {/* Swap / Skip actions */}
                          {!isSkipped && (
                            <div style={{display:'flex',gap:6,marginBottom:12}}>
                              <button onClick={()=>setSwapOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                                style={{background:swapOpen[ex.id]?t.tealDim:'transparent',border:'1px solid '+(swapOpen[ex.id]?alpha(t.teal, 31):t.border),borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:swapOpen[ex.id]?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                Swap
                              </button>
                              <button onClick={()=>setSkipOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                                style={{background:skipOpen[ex.id]?t.redDim:'transparent',border:'1px solid '+(skipOpen[ex.id]?alpha(t.red, 31):t.border),borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:skipOpen[ex.id]?t.red:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                ⏭ Skip
                              </button>
                              <button onClick={()=>setPreviewOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                                style={{background:'transparent',border:'1px solid '+t.border,borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginLeft:'auto'}}>
                                {previewOpen[ex.id]?'▲ Less':'▼ Demo'}
                              </button>
                            </div>
                          )}

                          {ex.notes_coach && <div style={{fontSize:11,color:t.orange,marginBottom:10}}>📌 {ex.notes_coach}</div>}
                          {ex.original_exercise_name && <div style={{fontSize:11,color:t.teal,marginBottom:10}}>↔ Swapped from {ex.original_exercise_name}{ex.swap_reason?` · ${ex.swap_reason}`:''}</div>}

                          {/* Swap panel */}
                          {swapOpen[ex.id] && !isSkipped && (
                            <div style={{background:t.tealDim,border:'1px solid '+alpha(t.teal, 19),borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                                <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Swap exercise</div>
                                <div style={{display:'flex',gap:6}}>
                                  {!aiSwapOptions[ex.id]?.length && (
                                    <button onClick={()=>getAISwap(ex)}
                                      disabled={aiSwapLoading[ex.id]}
                                      style={{fontSize:11,fontWeight:700,color:'#000',background:aiSwapLoading[ex.id]?alpha(t.teal, 50):t.teal,border:'none',borderRadius:8,padding:'4px 10px',cursor:aiSwapLoading[ex.id]?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                      {aiSwapLoading[ex.id]?'✨ Thinking...':'✨ AI Pick'}
                                    </button>
                                  )}
                                  {aiSwapOptions[ex.id]?.length>0 && <div style={{fontSize:10,color:t.teal,fontWeight:600}}>✨ AI selected</div>}
                                </div>
                              </div>
                              <input value={swapSearch[ex.id]||''} onChange={e=>setSwapSearch(prev=>({...prev,[ex.id]:e.target.value}))}
                                placeholder="Search by name or equipment..."
                                style={{width:'100%',background:t.surface,border:'1px solid '+alpha(t.teal, 25),borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box' as const,colorScheme:'dark'}}/>
                              <div style={{display:'flex',flexDirection:'column' as const,gap:6,marginBottom:10}}>
                                {getSwapOptions(ex).map(option=>(
                                  <button key={option.id} onClick={()=>swapExercise(ex,option.id)}
                                    style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,background:t.surface,border:'1px solid '+t.border,borderRadius:9,padding:'9px 12px',fontSize:13,color:t.text,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'left' as const}}>
                                    <div>
                                      <div style={{fontWeight:700,lineHeight:1.3}}>{option.name}</div>
                                      {option.equipment&&<div style={{fontSize:11,color:t.textMuted,marginTop:1}}>{option.equipment}</div>}
                                    </div>
                                    <span style={{color:t.teal,fontWeight:700,fontSize:12,flexShrink:0}}>Use →</span>
                                  </button>
                                ))}
                                {getSwapOptions(ex).length===0&&<div style={{fontSize:12,color:t.textMuted,textAlign:'center' as const,padding:'8px 0'}}>No matches — try a different search</div>}
                              </div>
                              <input value={swapNote[ex.id]||''} onChange={e=>setSwapNote(prev=>({...prev,[ex.id]:e.target.value}))}
                                placeholder="Optional note for your coach"
                                style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",boxSizing:'border-box' as const}}/>
                            </div>
                          )}

                          {/* Skip panel */}
                          {skipOpen[ex.id] && !isSkipped && (
                            <div style={{background:t.redDim,border:'1px solid '+alpha(t.red, 19),borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                              <div style={{fontSize:13,fontWeight:700,color:t.red,marginBottom:6}}>Skip this exercise?</div>
                              <div style={{fontSize:11,color:t.textMuted,marginBottom:10}}>Add a note for your coach if you want — totally optional.</div>
                              <input value={skipNote[ex.id]||''} onChange={e=>setSkipNote(prev=>({...prev,[ex.id]:e.target.value}))}
                                placeholder="e.g. shoulder felt off, equipment unavailable..."
                                style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box' as const}}/>
                              <div className="workout-skip-actions">
                                <button onClick={()=>setSkipOpen(prev=>({...prev,[ex.id]:false}))}
                                  style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                  Cancel
                                </button>
                                <button onClick={()=>skipExercise(ex.id)}
                                  style={{flex:2,background:t.red,border:'none',borderRadius:8,padding:'8px',fontSize:12,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                  ⏭ Yes, Skip Exercise
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Demo video + preview */}
                          {previewOpen[ex.id] && (() => {
                            const isFemale = clientGender==='female'
                            const demoUrl = (isFemale&&ex.exercise?.video_url_female)?ex.exercise.video_url_female:ex.exercise?.video_url
                            const imageUrl = ex.exercise?.image_url || null
                            return (
                              <div style={{marginBottom:12}}>
                                {demoUrl ? (
                                  <video src={demoUrl} controls playsInline preload="metadata"
                                    onLoadedMetadata={e=>{(e.target as HTMLVideoElement).currentTime=0.1}}
                                    style={{width:'100%',borderRadius:12,maxHeight:200,background:'#000',display:'block',objectFit:'contain',marginBottom:8}}/>
                                ) : imageUrl ? (
                                  <img src={imageUrl} alt={ex.exercise?.name||'Exercise demo'}
                                    style={{width:'100%',borderRadius:12,maxHeight:200,background:'#000',display:'block',objectFit:'contain',marginBottom:8}}/>
                                ) : null}
                                {ex.exercise?.description && (
                                  <div style={{padding:'10px 12px',background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:10,marginBottom:8}}>
                                    <div style={{fontSize:10,fontWeight:800,color:t.textDim,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>About this movement</div>
                                    <div style={{fontSize:12,color:t.text,lineHeight:1.6,whiteSpace:'pre-line' as const}}>{ex.exercise.description}</div>
                                  </div>
                                )}
                                {ex.exercise?.cues && (
                                  <div style={{padding:'10px 12px',background:alpha(t.orange, 8),border:'1px solid '+alpha(t.orange, 19),borderRadius:10,marginBottom:8}}>
                                    <div style={{fontSize:10,fontWeight:800,color:t.orange,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>📌 Cues</div>
                                    <div style={{fontSize:12,color:t.orange,lineHeight:1.6,whiteSpace:'pre-line' as const}}>{ex.exercise.cues}</div>
                                  </div>
                                )}
                                {((ex.exercise?.muscles?.length??0)>0||(ex.exercise?.secondary_muscles?.length??0)>0) && (
                                  <div style={{display:'flex',flexWrap:'wrap' as const,gap:5}}>
                                    {(ex.exercise?.muscles||[]).map((m:string)=>(
                                      <span key={m} style={{background:t.tealDim,border:'1px solid '+alpha(t.teal, 19),borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700,color:t.teal}}>{m}</span>
                                    ))}
                                    {(ex.exercise?.secondary_muscles||[]).map((m:string)=>(
                                      <span key={m} style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:6,padding:'2px 8px',fontSize:11,color:t.textDim}}>{m}</span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })()}

                          {/* Set logging grid */}
                          {!isSkipped && (
                            <div style={{display:'grid',gap:8,marginBottom:10}}>
                              {setsArr.map((s,idx)=>{
                                const prior = prevSets[ex.id]?.[idx]
                                return (
                                  <div key={idx} style={{background:s.skipped?t.surfaceHigh:s.logged?t.greenDim:t.surfaceHigh,border:`1px solid ${s.skipped?t.border:s.logged?t.green:t.border}`,borderRadius:12,padding:'12px 14px',transition:'all 0.2s',opacity:s.skipped?0.5:1}}>
                                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:prior?6:8}}>
                                      <span style={{fontSize:12,fontWeight:800,color:s.skipped?t.textMuted:s.logged?t.green:t.textDim,minWidth:40,textDecoration:s.skipped?'line-through':'none'}}>
                                        {s.is_warmup?'Warm-up':`Set ${idx+1}`}
                                      </span>
                                      {!s.logged && !s.skipped && (
                                        <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:t.textMuted,cursor:'pointer'}}>
                                          <input type="checkbox" checked={s.is_warmup} onChange={e=>updateSet(ex.id,idx,'is_warmup',e.target.checked)} style={{accentColor:t.orange}}/>
                                          Warmup
                                        </label>
                                      )}
                                      {s.skipped && <span style={{fontSize:11,color:t.textMuted,fontWeight:700}}>⏭ Skipped</span>}
                                      {!s.logged && !s.skipped && (
                                        <button onClick={()=>skipSet(ex.id,idx)}
                                          style={{marginLeft:'auto',background:'transparent',border:`1px solid ${t.border}`,borderRadius:6,padding:'3px 8px',fontSize:10,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                          ⏭ Skip
                                        </button>
                                      )}
                                      {s.logged && !s.skipped && <span style={{fontSize:12,color:t.green,fontWeight:700,marginLeft:'auto'}}>✓</span>}
                                      {s.logged&&(
                                        <button onClick={()=>updateSet(ex.id,idx,'logged',false)}
                                          style={{marginLeft:'auto',background:'none',border:`1px solid ${t.border}`,borderRadius:7,padding:'2px 8px',fontSize:10,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                          edit
                                        </button>
                                      )}
                                    </div>
                                    {!s.skipped && (<>
                                    {prior&&(
                                      <div style={{fontSize:11,color:t.textMuted,marginBottom:8,display:'flex',alignItems:'center',gap:4}}>
                                        <span style={{color:t.teal,opacity:0.7}}>↩</span>
                                        <span>Last: </span>
                                        <span style={{color:t.textDim,fontWeight:700}}>
                                          {prior.reps?`${prior.reps} reps`:'—'}
                                          {prior.weight&&prior.unit!=='bw'?` @ ${prior.weight}${prior.unit}`:prior.unit==='bw'?' bodyweight':''}
                                        </span>
                                      </div>
                                    )}
                                    {!s.logged&&(
                                      <div className="workout-set-helper-row">
                                        {prior&&(
                                          <button onClick={()=>applySetTemplate(ex.id,idx,{reps:prior.reps,weight:prior.weight,unit:prior.unit})}
                                            style={{background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'5px 9px',fontSize:11,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                            Use last time
                                          </button>
                                        )}
                                        {idx>0&&(
                                          <button onClick={()=>copyPreviousLoggedSet(ex.id,idx)}
                                            style={{background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'5px 9px',fontSize:11,fontWeight:700,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                            Copy prev
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {ex.tracking_type==='time'?(
                                      <div style={{marginBottom:8}}>
                                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Duration (seconds)</label>
                                        <input type="number" value={s.duration_completed} onChange={e=>updateSet(ex.id,idx,'duration_completed',e.target.value)}
                                          placeholder={String(ex.duration_seconds||'')} inputMode="numeric" enterKeyHint="done"
                                          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() } }} disabled={s.logged}
                                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                                      </div>
                                    ):(
                                      <div className="workout-set-inputs" style={{marginBottom:8}}>
                                        <div>
                                          <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Reps</label>
                                          <input type="number" value={s.reps_completed} onChange={e=>updateSet(ex.id,idx,'reps_completed',e.target.value)}
                                            placeholder={ex.reps_prescribed||'—'} inputMode="numeric" enterKeyHint="done"
                                            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() } }} disabled={s.logged}
                                            style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                                        </div>
                                        <div>
                                          <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>
                                            Weight
                                            <select value={s.weight_unit} onChange={e=>updateSet(ex.id,idx,'weight_unit',e.target.value)} disabled={s.logged}
                                              style={{background:'none',border:'none',color:t.teal,fontSize:11,marginLeft:4,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                              <option value="lbs">lbs</option>
                                              <option value="kg">kg</option>
                                              <option value="bw">BW</option>
                                            </select>
                                          </label>
                                          <input type="number" value={s.weight_value} onChange={e=>updateSet(ex.id,idx,'weight_value',e.target.value)}
                                            placeholder={ex.weight_prescribed||'—'} inputMode="decimal" enterKeyHint="done"
                                            onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() } }} disabled={s.logged||s.weight_unit==='bw'}
                                            style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:(s.logged||s.weight_unit==='bw')?0.5:1}}/>
                                        </div>
                                      </div>
                                    )}
                                    <div className="workout-set-note-row">
                                      <input value={s.notes} onChange={e=>updateSet(ex.id,idx,'notes',e.target.value)}
                                        placeholder="RPE, pain, how it felt..." disabled={s.logged}
                                        style={{flex:1,background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'7px 10px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                                      {!s.logged&&(
                                        <button onClick={()=>logSet(ex.id,idx)}
                                          style={{background:t.accent,border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer',whiteSpace:'nowrap'}}>
                                          Log ✓
                                        </button>
                                      )}
                                    </div>
                                    </>)}
                                  </div>
                                )
                              })}
                            </div>
                          )}

                          {/* Add set + form check video */}
                          {!isSkipped && (<>
                            <div style={{display:'flex',gap:8,marginBottom:10}}>
                              <button onClick={()=>addSet(ex.id)}
                                style={{flex:1,background:'none',border:`1px dashed ${t.border}`,borderRadius:10,padding:'9px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
                                + Add Set
                              </button>
                              {videoUploads[ex.id] ? (<>
                                <a href={videoUploads[ex.id]} target="_blank" rel="noreferrer"
                                  style={{display:'flex',alignItems:'center',padding:'9px 12px',background:t.greenDim,border:`1px solid ${alpha(t.green, 31)}`,borderRadius:10,fontSize:12,fontWeight:700,color:t.green,textDecoration:'none',flexShrink:0,gap:4}}>
                                  ✓ View
                                </a>
                                <label style={{display:'flex',alignItems:'center',padding:'9px 12px',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:10,fontSize:12,fontWeight:700,color:t.textDim,cursor:'pointer',flexShrink:0}}>
                                  🔄
                                  <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{display:'none'}}
                                    disabled={videoUploading[ex.id]}
                                    onChange={e=>{const f=e.target.files?.[0];if(f)uploadFormVideo(ex.id,f)}}/>
                                </label>
                                <button onClick={()=>removeFormVideo(ex.id)}
                                  style={{display:'flex',alignItems:'center',padding:'9px 12px',background:'rgba(255,80,80,0.08)',border:'1px solid rgba(255,80,80,0.3)',borderRadius:10,fontSize:12,fontWeight:700,color:'#ff5050',cursor:'pointer',flexShrink:0}}>
                                  🗑
                                </button>
                              </>) : (
                                <label style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:10,padding:'9px 12px',cursor:videoUploading[ex.id]?'not-allowed':'pointer',fontSize:12,fontWeight:700,color:videoUploading[ex.id]?t.teal:t.textDim,textAlign:'center' as const}}>
                                  {videoUploading[ex.id]?'⏳ Uploading...':'📹 Form Check'}
                                  <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{display:'none'}}
                                    disabled={videoUploading[ex.id]}
                                    onChange={e=>{const f=e.target.files?.[0];if(f)uploadFormVideo(ex.id,f)}}/>
                                </label>
                              )}
                            </div>
                            {!videoUploads[ex.id] && (
                              <div style={{fontSize:10,color:t.textMuted,marginTop:4,textAlign:'center' as const}}>
                                📹 Max 2 min — trim in your camera roll first if needed
                              </div>
                            )}
                          </> )}

                          {/* Add Exercise (last exercise only) */}
                          {exercises.indexOf(ex)===exercises.length-1 && (
                            <div style={{marginTop:4}}>
                              <button onClick={()=>{setAddExOpen(o=>!o);if(!aiAddOptions.length)getAIAddSuggestions()}}
                                style={{width:'100%',background:addExOpen?t.tealDim:'none',border:`1px dashed ${addExOpen?alpha(t.teal, 38):t.border}`,borderRadius:10,padding:'9px',fontSize:13,color:addExOpen?t.teal:t.textDim,cursor:'pointer'}}>
                                + Add Exercise
                              </button>
                              {addExOpen&&(
                                <div style={{background:t.tealDim,border:'1px solid '+alpha(t.teal, 19),borderRadius:12,padding:'12px 14px',marginTop:8}}>
                                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                                    <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Add an exercise</div>
                                    {!aiAddOptions.length&&(
                                      <button onClick={getAIAddSuggestions} disabled={aiAddLoading}
                                        style={{fontSize:11,fontWeight:700,color:'#000',background:aiAddLoading?alpha(t.teal, 50):t.teal,border:'none',borderRadius:8,padding:'4px 10px',cursor:aiAddLoading?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                        {aiAddLoading?'✨ Thinking...':'✨ AI Suggest'}
                                      </button>
                                    )}
                                    {aiAddOptions.length>0&&<div style={{fontSize:10,color:t.teal,fontWeight:600}}>✨ AI selected</div>}
                                  </div>
                                  <input value={addExSearch} onChange={e=>{setAddExSearch(e.target.value);setAiAddOptions([])}}
                                    placeholder="Search exercises..."
                                    style={{width:'100%',background:t.surface,border:'1px solid '+alpha(t.teal, 25),borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:8,boxSizing:'border-box' as const,colorScheme:'dark'}}/>
                                  <div style={{display:'grid',gap:8}}>
                                    {getAddExOptions().map(option=>(
                                      <button key={option.id} onClick={()=>addExercise(option.id)}
                                        style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:t.surface,border:'1px solid '+t.border,borderRadius:10,padding:'10px 12px',fontSize:12,color:t.text,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'left' as const}}>
                                        <div>
                                          <div style={{fontWeight:700}}>{option.name}</div>
                                          {option.equipment&&<div style={{fontSize:11,color:t.textMuted}}>{option.equipment}</div>}
                                        </div>
                                        <span style={{color:t.teal,fontWeight:700,fontSize:12,flexShrink:0}}>Add +</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}
                    </div>
                    </React.Fragment>
                  )
                })
                })()}
              </div>
            ))
          })()}
        </div>

        {/* Finish banner */}
        {allLogged && phase === 'workout' && (
          <div style={{padding:'16px',borderTop:`1px solid ${t.border}`,background:t.surface,flexShrink:0}}>
            <div style={{marginBottom:12}}>
              <p style={{fontSize:12,fontWeight:700,color:t.textDim,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>How&apos;d it go?</p>
              <div className="workout-finish-grid">
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Session RPE (1-10)</label>
                  <input type="number" value={finishForm.session_rpe} onChange={e=>setFinishForm(f=>({...f,session_rpe:e.target.value}))}
                    aria-label="Session RPE from 1 to 10"
                    inputMode="numeric" enterKeyHint="done"
                    onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); (e.target as HTMLInputElement).blur() } }}
                    min={1} max={10} placeholder="7"
                    style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px',color:t.text,fontSize:15,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Mood</label>
                  <select value={finishForm.mood} onChange={e=>setFinishForm(f=>({...f,mood:e.target.value}))}
                    aria-label="Workout mood"
                    style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
                    <option value="great">😄 Great</option>
                    <option value="good">🙂 Good</option>
                    <option value="okay">😐 Okay</option>
                    <option value="tired">😴 Tired</option>
                    <option value="awful">😓 Rough</option>
                  </select>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Energy (1-5)</label>
                <div className="workout-energy-row">
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setFinishForm(f=>({...f,energy_level:String(n)}))}
                      aria-label={`Set workout energy to ${n} out of 5`}
                      aria-pressed={finishForm.energy_level===String(n)}
                      style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:parseInt(finishForm.energy_level)>=n?alpha(t.orange, 19):'#1d1d2e',cursor:'pointer',fontSize:16}}>
                      ⚡
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={finishForm.notes_client} onChange={e=>setFinishForm(f=>({...f,notes_client:e.target.value}))}
                aria-label="Notes for your coach"
                placeholder="Any notes for your coach? Pain, PRs, wins..."
                rows={2}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 10px',color:t.text,fontSize:13,resize:'none',fontFamily:"'DM Sans',sans-serif"}}/>
              <div style={{fontSize:11,color:t.textMuted,marginTop:8,lineHeight:1.5}}>
                You logged {totalLoggedSets} set{totalLoggedSets !== 1 ? 's' : ''} across {completedExerciseCount} exercise{completedExerciseCount !== 1 ? 's' : ''}.
                {skippedExerciseCount > 0 ? ` ${skippedExerciseCount} skipped exercise${skippedExerciseCount !== 1 ? 's were' : ' was'} noted for your coach.` : ''}
              </div>
            </div>
            <button onClick={finishWorkout} disabled={saving}
              aria-label="Complete workout"
              style={{width:'100%',background:`linear-gradient(135deg,${t.teal},#00a896)`,border:'none',borderRadius:12,padding:'15px',fontSize:16,fontWeight:800,color:'#0f0f0f',cursor:saving?'default':'pointer',opacity:saving?0.7:1,fontFamily:"'DM Sans',sans-serif"}}>
              {saving ? 'Finishing...' : '🎉 Complete Workout!'}
            </button>
          </div>
        )}
      </div>

      {/* Slot Picker Modal */}
      {slotPickerExId && (
        <>
          <div onClick={()=>{ setSlotPickerExId(null); setSlotSearch(''); setSlotCustomName('') }}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:60,backdropFilter:'blur(4px)'}}/>
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:t.surface,borderTop:'1px solid '+t.border,borderRadius:'20px 20px 0 0',zIndex:61,fontFamily:"'DM Sans',sans-serif",padding:'20px 16px',paddingBottom:'calc(24px + env(safe-area-inset-bottom))',maxHeight:'80vh',display:'flex',flexDirection:'column' as const}}>
            <div style={{width:36,height:4,borderRadius:2,background:t.border,margin:'0 auto 16px'}}/>
            <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>🎲 Pick Your Exercise</div>
            <div style={{fontSize:12,color:t.textMuted,marginBottom:4}}>
              {exercises.find(e=>e.id===slotPickerExId)?.slot_constraint || 'Your choice'}
            </div>
            {(() => {
              const slotEx = exercises.find(e => e.id === slotPickerExId)
              if (!slotEx?.slot_filter_type || slotEx.slot_filter_type === 'none' || !slotEx.slot_filter_value) return null
              return (
                <div style={{fontSize:11,color:t.teal,fontWeight:700,marginBottom:12,background:t.tealDim,borderRadius:8,padding:'4px 10px',display:'inline-block'}}>
                  {slotEx.slot_filter_type === 'muscle' ? '💪' : slotEx.slot_filter_type === 'movement' ? '🔄' : '🏋️'} Filtered to: {slotEx.slot_filter_value}
                </div>
              )
            })()}
            {/* Tabs */}
            <div style={{display:'flex',gap:6,marginBottom:14}}>
              {(['library','custom'] as const).map(tab => (
                <button key={tab} onClick={()=>setSlotTab(tab)}
                  style={{flex:1,padding:'8px',borderRadius:9,border:`1px solid ${slotTab===tab?alpha(t.teal, 38):t.border}`,background:slotTab===tab?t.tealDim:'transparent',color:slotTab===tab?t.teal:t.textMuted,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textTransform:'capitalize' as const}}>
                  {tab === 'library' ? '📚 Library' : '✏️ Type My Own'}
                </button>
              ))}
            </div>
            {slotTab === 'library' ? (
              <>
                <input value={slotSearch} onChange={e=>setSlotSearch(e.target.value)}
                  placeholder="Search exercises..." autoFocus
                  style={{width:'100%',background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:10,padding:'10px 14px',fontSize:14,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box' as const,colorScheme:'dark'}}/>
                <div style={{overflowY:'auto',flex:1}}>
                  {(() => {
                    const slotEx = exercises.find(e => e.id === slotPickerExId)
                    const filterType = slotEx?.slot_filter_type
                    const filterVal = slotEx?.slot_filter_value
                    return (swapLibrary || [])
                      .filter(e => {
                        // Apply slot filter
                        if (filterType === 'muscle' && filterVal) {
                          const muscles = Array.isArray(e.muscles) ? e.muscles : []
                          if (!muscles.includes(filterVal)) return false
                        } else if (filterType === 'movement' && filterVal) {
                          if ((e as any).movement_pattern !== filterVal) return false
                        } else if (filterType === 'equipment' && filterVal) {
                          if ((e as any).equipment !== filterVal) return false
                        }
                        // Apply search
                        if (slotSearch) return (e.name || '').toLowerCase().includes(slotSearch.toLowerCase())
                        return true
                      })
                      .slice(0, 60)
                      .map((ex: any) => (
                        <div key={ex.id} onClick={()=>fillSlot(slotPickerExId!, ex.name, ex.id)}
                          style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:10,background:t.surfaceHigh,border:'1px solid '+t.border,marginBottom:6,cursor:'pointer'}}>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700}}>{ex.name}</div>
                            {ex.muscles?.length > 0 && <div style={{fontSize:11,color:t.textMuted}}>{ex.muscles.slice(0,3).join(', ')}</div>}
                          </div>
                          <span style={{fontSize:11,fontWeight:700,color:t.teal,flexShrink:0}}>Pick →</span>
                        </div>
                      ))
                  })()}
                </div>
              </>
            ) : (
              <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
                <input value={slotCustomName} onChange={e=>setSlotCustomName(e.target.value)}
                  placeholder="e.g. Sled Push, Assault Bike, Box Jumps..." autoFocus
                  onKeyDown={e=>{ if(e.key==='Enter' && slotCustomName.trim()) fillSlot(slotPickerExId, slotCustomName.trim()) }}
                  style={{width:'100%',background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:10,padding:'12px 14px',fontSize:15,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",boxSizing:'border-box' as const,colorScheme:'dark'}}/>
                <button onClick={()=>{ if(slotCustomName.trim()) fillSlot(slotPickerExId, slotCustomName.trim()) }}
                  disabled={!slotCustomName.trim()}
                  style={{width:'100%',padding:'13px',borderRadius:12,border:'none',background:slotCustomName.trim()?`linear-gradient(135deg,${t.teal},${alpha(t.teal, 80)})`:t.surfaceHigh,color:slotCustomName.trim()?'#000':t.textMuted,fontSize:15,fontWeight:800,cursor:slotCustomName.trim()?'pointer':'default',fontFamily:"'DM Sans',sans-serif"}}>
                  Use This Exercise
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Cancel confirmation bottom sheet */}
      {showCancelSheet && (
        <>
          <div onClick={()=>setShowCancelSheet(false)}
            style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.7)',zIndex:100,backdropFilter:'blur(4px)'}}/>
          <div style={{position:'fixed',bottom:0,left:'50%',transform:'translateX(-50%)',width:'100%',maxWidth:480,background:'#13131f',borderTop:'1px solid rgba(255,255,255,0.08)',borderRadius:'20px 20px 0 0',zIndex:101,fontFamily:"'DM Sans',sans-serif",padding:'20px 20px',paddingBottom:'calc(24px + env(safe-area-inset-bottom))'}}>
            <div style={{width:36,height:4,borderRadius:2,background:'rgba(255,255,255,0.15)',margin:'0 auto 20px'}}/>
            <div style={{fontSize:16,fontWeight:800,marginBottom:6}}>Leave workout?</div>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.5)',marginBottom:24,lineHeight:1.5}}>
              Your sets are saved as you go. You can come back and continue anytime.
            </div>
            <div style={{display:'flex',flexDirection:'column' as const,gap:10}}>
              <button onClick={saveAndExit}
                style={{width:'100%',padding:'14px',borderRadius:14,border:'none',background:`linear-gradient(135deg,#00C9B1,#00a896)`,color:'#000',fontSize:15,fontWeight:800,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                💾 Save & Exit
              </button>
              <button onClick={cancelWorkout}
                style={{width:'100%',padding:'14px',borderRadius:14,border:'1px solid rgba(255,80,80,0.4)',background:'rgba(255,80,80,0.08)',color:'#ff5050',fontSize:15,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                🗑 Clear Workout & Exit
              </button>
              <button onClick={()=>setShowCancelSheet(false)}
                style={{width:'100%',padding:'12px',borderRadius:14,border:'1px solid rgba(255,255,255,0.08)',background:'transparent',color:'rgba(255,255,255,0.4)',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                Keep Going
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function WorkoutComplete({ session, elapsed, router, t, sessionId, supabase, returnUrl, summary }: WorkoutCompleteProps) {
  const fmtTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m ${sec}s`
  }
  const fmtWeight = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k lbs`
    return `${Math.round(n)} lbs`
  }
  const [cancelled, setCancelled] = useState(false)

  const goBack = async () => {
    setCancelled(true)
    // Revert session back to in_progress so they can finish
    const { error } = await supabase.from('workout_sessions').update({
      status: 'in_progress',
      completed_at: null,
    }).eq('id', sessionId)
    if (error) {
      toastError('Could not reopen workout: ' + error.message)
      setCancelled(false)
      return
    }
    router.back()
  }

  return (
    <>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",display:'flex',flexDirection:'column',alignItems:'center',padding:'32px 20px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:16,marginTop:24}}>🏆</div>
        <h1 style={{fontSize:28,fontWeight:900,background:`linear-gradient(135deg,${t.teal},${t.accent})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:4}}>
          Workout Complete!
        </h1>
        <p style={{color:t.textDim,fontSize:15,marginBottom:28}}>{session?.title}</p>

        {/* Stats row — time + weight moved */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,width:'100%',maxWidth:360,marginBottom:20}}>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'16px 12px'}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:6}}>Time</div>
            <div style={{fontSize:22,fontWeight:800,color:t.orange}}>{fmtTime(elapsed)}</div>
          </div>
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'16px 12px'}}>
            <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:6}}>Weight Moved</div>
            <div style={{fontSize:22,fontWeight:800,color:t.teal}}>
              {summary ? fmtWeight(summary.totalWeightMoved) : '—'}
            </div>
          </div>
        </div>

        {/* PRs hit this session */}
        {summary && summary.prs.length > 0 && (
          <div style={{width:'100%',maxWidth:360,marginBottom:20}}>
            <div style={{fontSize:11,fontWeight:800,color:t.yellow,textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:10,textAlign:'left' as const}}>
              🏆 Personal Records
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              {summary.prs.map((pr, idx) => (
                <div key={idx} style={{background:`linear-gradient(135deg,${alpha(t.yellow, 9)},${alpha(t.orange, 4)})`,border:`1px solid ${alpha(t.yellow, 21)}`,borderRadius:12,padding:'12px 14px',textAlign:'left' as const}}>
                  <div style={{fontSize:10,fontWeight:800,color:t.yellow,textTransform:'uppercase' as const,letterSpacing:'0.08em',marginBottom:3}}>
                    {pr.pr_type === 'rep' ? 'Rep PR' : 'New PR'}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:t.text,marginBottom:2}}>{pr.exercise_name}</div>
                  <div style={{fontSize:12,color:t.textDim}}>{pr.weight} lbs x {pr.reps} reps</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Closing message */}
        <p style={{fontSize:14,color:t.textDim,marginTop:4,marginBottom:28,maxWidth:300,lineHeight:1.6}}>
          You got this 💪 Be kind to yourself and stay awesome.
        </p>

        <button onClick={()=>router.push(returnUrl)}
          style={{background:t.accent,border:'none',borderRadius:14,padding:'14px 32px',fontSize:16,fontWeight:800,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:12,width:'100%',maxWidth:360}}>
          Back to Dashboard
        </button>
        <button onClick={goBack} disabled={cancelled}
          style={{background:'none',border:'1px solid '+t.border,borderRadius:14,padding:'10px 24px',fontSize:13,fontWeight:600,color:t.textMuted,cursor:cancelled?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
          Wait — I&apos;m not done yet
        </button>
      </div>
    </>
  )
}

