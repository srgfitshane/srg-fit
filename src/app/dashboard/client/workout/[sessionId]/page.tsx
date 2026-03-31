'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { resolveSignedMediaUrl } from '@/lib/media'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  accent:'#c8f545', accentDim:'#c8f54515', text:'#f0f0f0', textDim:'#888',
  textMuted:'#555', red:'#ff4d6d', redDim:'#ff4d6d15', green:'#22c55e',
  greenDim:'#22c55e15', yellow:'#facc15'
}

interface SetData {
  reps_completed: string
  weight_value: string
  weight_unit: 'lbs'|'kg'|'bw'
  rpe: string
  notes: string
  is_warmup: boolean
  logged: boolean
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
  thumbnail_url?: string | null
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
}

type WorkoutCompleteProps = {
  session: WorkoutSession | null
  elapsed: number
  router: { push: (href: string) => void; back: () => void }
  t: typeof t
  sessionId: string
  supabase: ReturnType<typeof createClient>
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
  return { reps_completed:'', weight_value:'', weight_unit:'lbs', rpe:'', notes:'', is_warmup:false, logged:false }
}

const SKIP_REASONS = [
  'Pain or discomfort',
  'Equipment unavailable',
  'Exercise did not feel safe',
  'Out of time',
  'Energy too low',
  'Need coach guidance',
]

export default function ActiveWorkoutPage() {
  const supabase = createClient()
  const [videoUploads, setVideoUploads]   = useState<Record<string,string>>({})
  const [videoUploading, setVideoUploading] = useState<Record<string,boolean>>({})
  const router = useRouter()
  const { sessionId: sessionIdParam } = useParams()
  const sessionId = sessionIdParam as string

  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [exercises, setExercises] = useState<SessionExercise[]>([])
  const [setData, setSetData] = useState<Record<string, SetData[]>>({})
  const [prevSets, setPrevSets] = useState<Record<string, {reps:number|null, weight:number|null, unit:string}[]>>({})
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [restTimer, setRestTimer] = useState<number|null>(null)
  const [restActive, setRestActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [phase, setPhase] = useState<'warmup'|'workout'|'complete'>('workout')
  const [finishForm, setFinishForm] = useState({ session_rpe:'', energy_level:'3', mood:'good', notes_client:'' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isReopened, setIsReopened] = useState(false)
  const [clientGender, setClientGender] = useState<string|null>(null)
  // Preview toggle per exercise
  const [previewOpen, setPreviewOpen] = useState<Record<string,boolean>>({})
  // Skip state per exercise
  const [skipOpen, setSkipOpen] = useState<Record<string,boolean>>({})
  const [skipReason, setSkipReason] = useState<Record<string,string>>({})
  const [skipNote, setSkipNote] = useState<Record<string,string>>({})
  const [skipped, setSkipped] = useState<Record<string,boolean>>({})
  const [swapOpen, setSwapOpen] = useState<Record<string,boolean>>({})
  const [swapReason, setSwapReason] = useState<Record<string,string>>({})
  const [swapNote, setSwapNote] = useState<Record<string,string>>({})
  const [swapLibrary, setSwapLibrary] = useState<ExerciseLibraryItem[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const restRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const withSignedMedia = useCallback(async (exs: SessionExercise[]) => {
    const signedExercises = await Promise.all((exs || []).map(async (exerciseRow) => ({
      ...exerciseRow,
      client_video_url: await resolveSignedMediaUrl(supabase, 'form-checks', exerciseRow.client_video_url),
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
    return swapLibrary
      .filter(option => option.id !== exercise.exercise_id)
      .filter(option => {
        const sameEquipment = option.equipment && exercise.exercise?.equipment
          ? option.equipment === exercise.exercise.equipment
          : true
        const optionMuscles = option.muscles || []
        const sharedMuscle = primaryMuscles.length === 0 || optionMuscles.some((muscle: string) => primaryMuscles.includes(muscle))
        return sameEquipment || sharedMuscle
      })
      .slice(0, 6)
  }

  // Workout elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s+1), 1000)
    return () => clearInterval(timerRef.current ?? undefined)
  }, [])

  // Rest countdown
  useEffect(() => {
    if (!restActive || restTimer === null || restTimer <= 0) return () => clearTimeout(restRef.current ?? undefined)
    restRef.current = setTimeout(() => {
      setRestTimer((current) => {
        if (current === null) return current
        if (current <= 1) {
          setRestActive(false)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => clearTimeout(restRef.current ?? undefined)
  }, [restActive, restTimer])

  const loadSession = useCallback(async () => {
    // Mark assigned → in_progress (first start)
    await supabase.from('workout_sessions').update({ status:'in_progress', started_at: new Date().toISOString() })
      .eq('id', sessionId).eq('status','assigned').not('program_id', 'is', null)

    const { data: sess, error: sessError } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single()
    const safeSession = sess as WorkoutSession | null
    

    // Fetch client gender to serve correct demo video
    if (safeSession?.client_id) {
      const { data: clientRow } = await supabase.from('clients').select('gender').eq('id', safeSession.client_id).single()
      if (clientRow?.gender) setClientGender(clientRow.gender)
    }

    // If client tapped back into a completed session, flag it — don't auto-reopen yet
    if (safeSession?.status === 'completed') {
      setSession(safeSession)
      const { data: exs } = await supabase
        .from('session_exercises')
        .select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url)')
        .eq('session_id', sessionId).order('order_index')
      const { data: exerciseLibrary } = await supabase
        .from('exercises')
        .select('id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url')
        .limit(250)

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
          weight_value:   s.weight_value   != null ? String(s.weight_value)   : '',
          weight_unit:    (s.weight_unit || 'lbs') as 'lbs'|'kg'|'bw',
          rpe:            s.rpe            != null ? String(s.rpe)            : '',
          notes:          s.notes || '',
          is_warmup:      s.is_warmup || false,
          logged:         true,
        }))
        while (rows.length < (ex.sets_prescribed || 3)) rows.push(defaultSet())
        initSets[ex.id] = rows
      }
      setSwapLibrary((exerciseLibrary || []) as ExerciseLibraryItem[])
      const signedExercises = await withSignedMedia((exs || []) as SessionExercise[])
      setExercises(signedExercises)
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
    const { data: exs, error: exsError } = await supabase
      .from('session_exercises')
      .select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url)')
      .eq('session_id', sessionId)
      .order('order_index')

    

    const { data: exerciseLibrary } = await supabase
      .from('exercises')
      .select('id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url')
      .limit(250)

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

    const initSets: Record<string,SetData[]> = {}
    for (const ex of (exs || []) as SessionExercise[]) {
      const already = loggedByEx[ex.id] || []
      const prescribed = ex.sets_prescribed || 3
      // Build set rows: fill logged ones first, then pad with blank rows up to prescribed count
      const rows: SetData[] = already.map((s) => ({
        reps_completed: s.reps_completed != null ? String(s.reps_completed) : '',
        weight_value:   s.weight_value   != null ? String(s.weight_value)   : '',
        weight_unit:    (s.weight_unit || 'lbs') as 'lbs'|'kg'|'bw',
        rpe:            s.rpe            != null ? String(s.rpe)            : '',
        notes:          s.notes || '',
        is_warmup:      s.is_warmup || false,
        logged:         true,   // already in DB — show as logged
      }))
      // Pad up to prescribed count with blank sets if needed
      while (rows.length < prescribed) rows.push(defaultSet())
      initSets[ex.id] = rows
    }

    // Fetch previous session sets for same exercises
    const prev: Record<string, {reps:number|null, weight:number|null, unit:string}[]> = {}
    if (exs && exs.length > 0) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        // Get all completed sessions for this client
        const { data: completedSessions } = await supabase
          .from('workout_sessions')
          .select('id')
          .eq('client_id', user.id)
          .eq('status', 'completed')
          .neq('id', sessionId)
          .order('completed_at', { ascending: false })
          .limit(20)

        if (completedSessions && completedSessions.length > 0) {
          const completedIds = completedSessions.map((s:{ id: string }) => s.id)
          for (const ex of exs as SessionExercise[]) {
            // Find session_exercises with same name in those sessions
            const { data: priorExs } = await supabase
              .from('session_exercises')
              .select('id')
              .eq('exercise_name', ex.exercise_name)
              .in('session_id', completedIds)
              .limit(1)

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

  async function logSet(exId: string, setIdx: number) {
    const s = setData[exId][setIdx]
    if (!s.reps_completed && !s.weight_value) return

    const { error } = await supabase.from('exercise_sets').insert({
      session_exercise_id: exId,
      session_id: sessionId,
      set_number: setIdx + 1,
      reps_completed: parseInt(s.reps_completed) || null,
      weight_value: s.weight_unit === 'bw' ? null : parseFloat(s.weight_value) || null,
      weight_unit: s.weight_unit,
      rpe: parseInt(s.rpe) || null,
      notes: s.notes || null,
      is_warmup: s.is_warmup,
      logged_at: new Date().toISOString()
    })

    if (!error) {
      updateSet(exId, setIdx, 'logged', true)
      await supabase.from('session_exercises').update({ sets_completed: setIdx+1 }).eq('id', exId)
      // Auto-start rest timer
      const ex = exercises.find(e=>e.id===exId)
      if (ex?.rest_seconds) {
        setRestTimer(ex.rest_seconds)
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
  }

  function addSet(exId: string) {
    setSetData(prev => ({ ...prev, [exId]: [...prev[exId], defaultSet()] }))
  }

  async function skipExercise(exId: string) {
    const reason = skipReason[exId] || ''
    const note = skipNote[exId] || ''
    if (!reason || !note.trim()) {
      alert('Please choose a reason and leave a quick note before skipping.')
      return
    }
    await supabase.from('session_exercises').update({
      notes_client: `[SKIPPED] ${reason}: ${note}`,
      sets_completed: 0,
      skipped: true,
      skip_reason: reason,
      skip_note: note,
      skipped_at: new Date().toISOString(),
    }).eq('id', exId)
    setSkipped(prev => ({ ...prev, [exId]: true }))
    setSkipOpen(prev => ({ ...prev, [exId]: false }))
    // Auto-advance to next non-skipped exercise
    const nextIdx = exercises.findIndex((ex, i) => i > activeExIdx && !skipped[ex.id])
    if (nextIdx !== -1) setActiveExIdx(nextIdx)
    else if (activeExIdx < exercises.length - 1) setActiveExIdx(activeExIdx + 1)
  }

  async function swapExercise(exerciseRow: SessionExercise, replacementId: string) {
    const replacement = swapLibrary.find(option => option.id === replacementId)
    if (!replacement) return

    const reason = swapReason[exerciseRow.id] || ''
    const note = swapNote[exerciseRow.id] || ''
    if (!reason) {
      alert('Pick a swap reason so your coach can see what happened.')
      return
    }

    const originalExerciseId = exerciseRow.original_exercise_id || exerciseRow.exercise_id || null
    const originalExerciseName = exerciseRow.original_exercise_name || exerciseRow.exercise_name

    await supabase.from('session_exercises').update({
      original_exercise_id: originalExerciseId,
      original_exercise_name: originalExerciseName,
      exercise_id: replacement.id,
      exercise_name: replacement.name,
      swap_exercise_id: replacement.id,
      swap_reason: reason,
      swap_note: note || null,
      swapped_at: new Date().toISOString(),
      skipped: false,
      skip_reason: null,
      skip_note: null,
      skipped_at: null,
    }).eq('id', exerciseRow.id)

    setExercises(prev => prev.map(ex => ex.id === exerciseRow.id ? {
      ...ex,
      exercise_id: replacement.id,
      exercise_name: replacement.name || '',
      original_exercise_id: originalExerciseId,
      original_exercise_name: originalExerciseName,
      swap_exercise_id: replacement.id,
      swap_reason: reason,
      swap_note: note || null,
      swapped_at: new Date().toISOString(),
      skipped: false,
      exercise: replacement,
    } : ex))
    setSwapOpen(prev => ({ ...prev, [exerciseRow.id]: false }))
    setSkipped(prev => ({ ...prev, [exerciseRow.id]: false }))
  }

  async function uploadFormVideo(exId: string, file: File) {
    setVideoUploading(prev => ({ ...prev, [exId]: true }))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVideoUploading(prev => ({ ...prev, [exId]: false })); return }
    const ext = file.name.split('.').pop() || 'mp4'
    const path = `${user.id}/${sessionId}/${exId}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('form-checks').upload(path, file)
    if (error) {
      console.error('Form check upload error:', error.message)
      alert(`Upload failed: ${error.message}`)
    } else {
      const signedUrl = await resolveSignedMediaUrl(supabase, 'form-checks', path)
      setVideoUploads(prev => ({ ...prev, [exId]: signedUrl || path }))
      await supabase.from('session_exercises').update({ client_video_url: path }).eq('id', exId)
    }
    setVideoUploading(prev => ({ ...prev, [exId]: false }))
  }

  async function cancelWorkout() {
    // Reset session back to assigned so it can be started again
    await supabase.from('workout_sessions').update({
      status: 'assigned',
      started_at: null,
    }).eq('id', sessionId)
    router.push('/dashboard/client')
  }

  async function reopenWorkout() {
    await supabase.from('workout_sessions').update({
      status: 'in_progress',
      completed_at: null,
    }).eq('id', sessionId)
    setIsReopened(false)
  }

  async function finishWorkout() {
    setSaving(true)
    const now = new Date()
    const reviewDue = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    const { error } = await supabase.from('workout_sessions').update({
      status: 'completed',
      completed_at: now.toISOString(),
      review_due_at: reviewDue.toISOString(),
      duration_seconds: elapsedSeconds,
      session_rpe: parseInt(finishForm.session_rpe) || null,
      energy_level: parseInt(finishForm.energy_level),
      mood: finishForm.mood,
      notes_client: finishForm.notes_client || null
    }).eq('id', sessionId)

    if (error) {
      console.error('finishWorkout error:', error)
      setSaving(false)
      return
    }

    // Fire-and-forget push notification — never block completion on this
    if (session?.coach_id) {
      fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          user_id: session.coach_id,
          notification_type: 'checkin_submitted',
          title: `Workout completed: ${session.title}`,
          body: `Session logged in ${Math.floor(elapsedSeconds/60)} min${finishForm.session_rpe ? ` · RPE ${finishForm.session_rpe}` : ''}`,
          link_url: `/dashboard/coach/reviews`,
          data: { session_id: sessionId }
        })
      }).catch(() => {}) // intentionally swallowed — never block on this
    }

    setSaving(false)
    setPhase('complete')

    // Detect PRs and milestones fire-and-forget
    if (session?.client_id) {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
      detectPRsAndMilestones(session.client_id, todayStr).catch(() => {})
    }
  }


  // Detect PRs and milestones after workout completion
  async function detectPRsAndMilestones(clientId: string, today: string) {
    try {
      // 1. Get all sets from this session with exercise info
      const { data: sessionExs } = await supabase
        .from('session_exercises')
        .select('id, exercise_id, exercise_name')
        .eq('session_id', sessionId)

      if (!sessionExs?.length) return

      const newMilestones: string[] = []

      for (const se of sessionExs) {
        if (!se.exercise_id) continue

        // Get best set logged this session (non-warmup, highest weight)
        const { data: sets } = await supabase
          .from('exercise_sets')
          .select('weight_value, reps_completed')
          .eq('session_exercise_id', se.id)
          .eq('is_warmup', false)
          .not('weight_value', 'is', null)
          .order('weight_value', { ascending: false })
          .limit(1)

        if (!sets?.length || !sets[0].weight_value) continue
        const bestWeight = Number(sets[0].weight_value)
        const bestReps   = sets[0].reps_completed

        // Get existing PR for this exercise
        const { data: existing } = await supabase
          .from('personal_records')
          .select('weight_pr, rep_pr_reps, rep_pr_weight')
          .eq('client_id', clientId)
          .eq('exercise_id', se.exercise_id)
          .single()

        const isWeightPR = !existing || bestWeight > (Number(existing.weight_pr) || 0)

        if (isWeightPR) {
          // Upsert the PR record
          await supabase.from('personal_records').upsert({
            client_id: clientId,
            exercise_id: se.exercise_id,
            weight_pr: bestWeight,
            rep_pr_reps: bestReps || null,
            rep_pr_weight: bestWeight,
            logged_date: today,
          }, { onConflict: 'client_id,exercise_id' })

          const exerciseName = se.exercise_name || 'exercise'
          newMilestones.push(`🏆 New PR — ${exerciseName}: ${bestWeight} lbs!`)

          // Check if this PR completes a strength goal
          const { data: matchingGoals } = await supabase
            .from('client_goals')
            .select('id, title, target_value')
            .eq('client_id', clientId)
            .eq('status', 'active')
            .eq('goal_type', 'strength')
            .not('target_value', 'is', null)
          if (matchingGoals?.length) {
            for (const goal of matchingGoals) {
              if (bestWeight >= Number(goal.target_value)) {
                const now = new Date().toISOString()
                await supabase.from('client_goals').update({
                  status: 'completed', completed_at: now,
                  current_value: bestWeight, updated_at: now
                }).eq('id', goal.id)
                newMilestones.push(`🎯 Goal achieved: ${goal.title}!`)
              }
            }
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
            milestone_type: msg.includes('PR') ? 'pr' : 'consistency',
            message: msg,
            seen: false,
          }))
        )
      }
    } catch (e) {
      console.error('PR/milestone detection error:', e)
    }
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const totalPlannedSets = exercises.reduce((sum, ex) => sum + (setData[ex.id]?.length || ex.sets_prescribed || 0), 0)
  const totalLoggedSets = exercises.reduce((sum, ex) => sum + (setData[ex.id] || []).filter(setRow => setRow.logged).length, 0)
  const skippedExerciseCount = exercises.filter(ex => skipped[ex.id]).length
  const completedExerciseCount = exercises.filter(ex => {
    const total = ex.sets_prescribed || setData[ex.id]?.length || 0
    const done = (setData[ex.id] || []).filter(setRow => setRow.logged).length
    return skipped[ex.id] || (total > 0 && done >= total)
  }).length
  const activeExercise = exercises[activeExIdx]
  const activeSets = activeExercise ? (setData[activeExercise.id] || []) : []
  const activeLoggedSets = activeSets.filter(setRow => setRow.logged).length
  const remainingExerciseCount = Math.max(0, exercises.length - completedExerciseCount)
  const allLogged = exercises.length > 0 && exercises.every(ex =>
    skipped[ex.id] || (setData[ex.id]||[]).some(s=>s.logged)
  )

  if (loading) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',color:t.textMuted,fontFamily:"'DM Sans',sans-serif"}}>Loading workout...</div>
  )

  if (!loading && exercises.length === 0) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',fontFamily:"'DM Sans',sans-serif",color:t.text}}>
      <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
      <div style={{fontSize:18,fontWeight:800,marginBottom:8,color:t.orange}}>No exercises in this workout</div>
      <div style={{fontSize:13,color:t.textMuted,marginBottom:32,maxWidth:280,lineHeight:1.6}}>This session has no exercises assigned yet. Your coach needs to add exercises to this program first.</div>
      <button onClick={cancelWorkout} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:12,padding:'12px 24px',fontSize:14,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
        ← Back to Dashboard
      </button>
    </div>
  )

  if (phase === 'complete') return <WorkoutComplete session={session} elapsed={elapsedSeconds} router={router} t={t} sessionId={sessionId} supabase={supabase}/>

  // ── Re-opened completed workout ──────────────────────────────────────────
  if (isReopened) return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:16}}>✏️</div>
        <div style={{fontSize:20,fontWeight:900,marginBottom:8}}>{session?.title}</div>
        <div style={{fontSize:13,color:t.textMuted,marginBottom:32,lineHeight:1.6,maxWidth:280}}>
          This workout is already marked complete. Want to go back in and update something?
        </div>
        <button onClick={reopenWorkout}
          style={{width:'100%',background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`,border:'none',borderRadius:13,padding:'14px',fontSize:15,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>
          ✏️ Re-open Workout
        </button>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{width:'100%',background:'none',border:`1px solid ${t.border}`,borderRadius:13,padding:'12px',fontSize:13,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
          ← Back to Dashboard
        </button>
      </div>
    </>
  )

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
          <button onClick={cancelWorkout}
            aria-label="Cancel workout and return to dashboard"
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:20,lineHeight:1}}>←</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15}}>{session?.title}</div>
            {session?.day_label && <div style={{fontSize:11,color:t.textDim}}>{session.day_label}</div>}
          </div>
          <div style={{fontSize:16,fontWeight:800,color:t.teal,fontVariantNumeric:'tabular-nums'}}>⏱ {fmtTime(elapsedSeconds)}</div>
          <button onClick={cancelWorkout}
            aria-label="Cancel workout"
            style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:8,padding:'5px 11px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            Cancel
          </button>
        </div>

        {/* Rest timer banner */}
        {restActive && restTimer !== null && (
          <div style={{background:`linear-gradient(135deg,${t.teal}20,${t.teal}08)`,borderBottom:`1px solid ${t.teal}40`,padding:'10px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:20}}>⏸</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Rest Time</div>
              <div style={{fontSize:11,color:t.textDim}}>Next set in {restTimer}s</div>
            </div>
            <span style={{fontSize:24,fontWeight:900,color:t.teal,fontVariantNumeric:'tabular-nums'}}>{restTimer}s</span>
            <button onClick={()=>{setRestActive(false);setRestTimer(null)}}
              aria-label="Skip rest timer"
              style={{background:t.tealDim,border:`1px solid ${t.teal}40`,borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,color:t.teal,cursor:'pointer'}}>
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

        {/* Exercise tabs */}
        <div style={{display:'flex',overflowX:'auto',padding:'12px 16px 0',gap:8,flexShrink:0}}>
          {exercises.map((ex,i)=>{
            const done = (setData[ex.id]||[]).filter(s=>s.logged).length
            const total = ex.sets_prescribed || setData[ex.id]?.length || 0
            const complete = done >= total && total > 0
            const isSkipped = skipped[ex.id]
            return (
              <button key={ex.id} onClick={()=>setActiveExIdx(i)}
                aria-label={`Open exercise ${i + 1}: ${ex.exercise_name}`}
                aria-pressed={activeExIdx===i}
                style={{flexShrink:0,background:activeExIdx===i?t.tealDim:(isSkipped?'#1a1a1a':(complete?t.greenDim:t.surfaceHigh)),border:`1px solid ${activeExIdx===i?t.teal:isSkipped?t.border:(complete?t.green:t.border)}`,borderRadius:10,padding:'6px 12px',fontSize:12,fontWeight:700,color:activeExIdx===i?t.teal:isSkipped?t.textMuted:(complete?t.green:t.textDim),cursor:'pointer',whiteSpace:'nowrap',textDecoration:isSkipped?'line-through':'none'}}>
                {isSkipped ? '⏭ ' : complete ? '✓ ' : ''}{i+1}. {ex.exercise_name.split(' ').slice(0,2).join(' ')}
              </button>
            )
          })}
        </div>

        {/* Active exercise */}
        {exercises[activeExIdx] && (() => {
          const ex = exercises[activeExIdx]
          const setsArr = setData[ex.id] || []
          return (
            <div style={{flex:1,overflowY:'auto',padding:'16px'}}>
              <div style={{marginBottom:16}}>
                {/* Name + action buttons row */}
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:12,marginBottom:6}}>
                  <div style={{flex:1}}>
                    <h2 style={{fontSize:20,fontWeight:900,marginBottom:4}}>{ex.exercise_name}</h2>
                    <div style={{fontSize:13,color:t.textDim}}>
                      Target: {ex.sets_prescribed} × {ex.reps_prescribed}
                      {ex.weight_prescribed && ` @ ${ex.weight_prescribed}`}
                    </div>
                    {ex.original_exercise_name && (
                      <div style={{ fontSize:11, color:t.teal, marginTop:6 }}>
                        Smart swap from {ex.original_exercise_name}
                        {ex.swap_reason ? ` · ${ex.swap_reason}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="workout-action-row">
                    {!skipped[ex.id] && (
                      <button onClick={()=>setSwapOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                        aria-label={`Toggle smart swap options for ${ex.exercise_name}`}
                        aria-expanded={!!swapOpen[ex.id]}
                        style={{background:swapOpen[ex.id]?t.tealDim:'transparent',border:'1px solid '+(swapOpen[ex.id]?t.teal+'50':t.border),borderRadius:9,padding:'6px 12px',fontSize:12,fontWeight:700,color:swapOpen[ex.id]?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                        Swap
                      </button>
                    )}
                    {!skipped[ex.id] && (
                      <button onClick={()=>setSkipOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                        aria-label={`Toggle skip exercise panel for ${ex.exercise_name}`}
                        aria-expanded={!!skipOpen[ex.id]}
                        style={{background:skipOpen[ex.id]?t.redDim:'transparent',border:'1px solid '+(skipOpen[ex.id]?t.red+'50':t.border),borderRadius:9,padding:'6px 12px',fontSize:12,fontWeight:700,color:skipOpen[ex.id]?t.red:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                        ⏭ Skip
                      </button>
                    )}
                    {skipped[ex.id] && (
                      <span style={{fontSize:12,fontWeight:700,color:t.textMuted,background:t.surfaceHigh,borderRadius:9,padding:'6px 12px'}}>⏭ Skipped</span>
                    )}
                  </div>
                </div>

                {ex.notes_coach && <div style={{fontSize:12,color:t.orange,marginBottom:10}}>📌 {ex.notes_coach}</div>}

                <div className="workout-exercise-nav" style={{marginBottom:12}}>
                  <button onClick={()=>setActiveExIdx(Math.max(0, activeExIdx - 1))}
                    aria-label="Go to previous exercise"
                    disabled={activeExIdx === 0}
                    style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:9,padding:'8px 12px',fontSize:12,fontWeight:700,color:activeExIdx===0?t.textMuted:t.textDim,cursor:activeExIdx===0?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:activeExIdx===0?0.5:1}}>
                    ← Previous
                  </button>
                  <button onClick={()=>setActiveExIdx(Math.min(exercises.length - 1, activeExIdx + 1))}
                    aria-label="Go to next exercise"
                    disabled={activeExIdx >= exercises.length - 1}
                    style={{flex:1,background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:9,padding:'8px 12px',fontSize:12,fontWeight:700,color:activeExIdx>=exercises.length - 1?t.textMuted:t.teal,cursor:activeExIdx>=exercises.length - 1?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:activeExIdx>=exercises.length - 1?0.5:1}}>
                    Next →
                  </button>
                </div>

                {swapOpen[ex.id] && !skipped[ex.id] && (
                  <div style={{background:t.tealDim,border:'1px solid '+t.teal+'30',borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.teal,marginBottom:8}}>Need a smart swap?</div>
                    <select
                      value={swapReason[ex.id] || ''}
                      onChange={e=>setSwapReason(prev=>({...prev,[ex.id]:e.target.value}))}
                      aria-label={`Why are you swapping ${ex.exercise_name}?`}
                      style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:8}}
                    >
                      <option value="">Why are you swapping?</option>
                      <option value="Pain or discomfort">Pain or discomfort</option>
                      <option value="Equipment unavailable">Equipment unavailable</option>
                      <option value="Exercise felt awkward">Exercise felt awkward</option>
                      <option value="Need a home-friendly option">Need a home-friendly option</option>
                    </select>
                    <input
                      value={swapNote[ex.id]||''}
                      onChange={e=>setSwapNote(prev=>({...prev,[ex.id]:e.target.value}))}
                      aria-label={`Optional note for swapping ${ex.exercise_name}`}
                      placeholder="Optional note for your coach"
                      style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box' as const}}
                    />
                    <div style={{display:'grid',gap:8}}>
                      {getSwapOptions(ex).map(option => (
                        <button
                          key={option.id}
                          onClick={()=>swapExercise(ex, option.id)}
                          aria-label={`Swap ${ex.exercise_name} with ${option.name}`}
                          style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:t.surface,border:'1px solid '+t.border,borderRadius:10,padding:'10px 12px',fontSize:12,color:t.text,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'left'}}
                        >
                          <span>
                            <strong>{option.name}</strong>
                            {option.equipment ? <span style={{ color:t.textMuted }}> · {option.equipment}</span> : null}
                          </span>
                          <span style={{ color:t.teal, fontWeight:700 }}>Use</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skip panel */}
                {skipOpen[ex.id] && !skipped[ex.id] && (
                  <div style={{background:t.redDim,border:'1px solid '+t.red+'30',borderRadius:12,padding:'12px 14px',marginBottom:12}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.red,marginBottom:8}}>Skip this exercise?</div>
                    <select
                      value={skipReason[ex.id] || ''}
                      onChange={e=>setSkipReason(prev=>({...prev,[ex.id]:e.target.value}))}
                      aria-label={`Why are you skipping ${ex.exercise_name}?`}
                      style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:8}}
                    >
                      <option value="">Choose a reason</option>
                      {SKIP_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
                    </select>
                    <input
                      value={skipNote[ex.id]||''}
                      onChange={e=>setSkipNote(prev=>({...prev,[ex.id]:e.target.value}))}
                      aria-label={`Required note for skipping ${ex.exercise_name}`}
                      placeholder="Required note: what happened?"
                      style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:10,boxSizing:'border-box' as const}}
                    />
                    <div className="workout-skip-actions">
                      <button onClick={()=>setSkipOpen(prev=>({...prev,[ex.id]:false}))}
                        aria-label={`Cancel skipping ${ex.exercise_name}`}
                        style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:8,padding:'8px',fontSize:12,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                        Cancel
                      </button>
                      <button onClick={()=>skipExercise(ex.id)}
                        aria-label={`Confirm skipping ${ex.exercise_name}`}
                        style={{flex:2,background:t.red,border:'none',borderRadius:8,padding:'8px',fontSize:12,fontWeight:800,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                        ⏭ Yes, Skip Exercise
                      </button>
                    </div>
                  </div>
                )}

                {/* Preview toggle button */}
                <button onClick={()=>setPreviewOpen(prev=>({...prev,[ex.id]:!prev[ex.id]}))}
                  aria-label={`${previewOpen[ex.id] ? 'Hide' : 'Show'} exercise preview for ${ex.exercise_name}`}
                  aria-expanded={!!previewOpen[ex.id]}
                  style={{display:'flex',alignItems:'center',gap:6,background:'transparent',border:'1px solid '+t.border,borderRadius:9,padding:'6px 12px',fontSize:12,fontWeight:600,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:previewOpen[ex.id]?0:0}}>
                  <span style={{fontSize:14}}>{previewOpen[ex.id]?'▲':'▼'}</span>
                  {previewOpen[ex.id] ? 'Hide preview' : 'See exercise'}
                </button>

                {/* Preview panel */}
                {previewOpen[ex.id] && (
                  <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:12,padding:'14px',marginTop:8}}>
                    {/* Thumbnail / video */}
                    {ex.exercise?.thumbnail_url && (
                      <img src={ex.exercise.thumbnail_url} alt={ex.exercise_name}
                        style={{width:'100%',borderRadius:8,marginBottom:10,maxHeight:180,objectFit:'cover'}}/>
                    )}

                    {/* Muscles */}
                    {((ex.exercise?.muscles?.length ?? 0) > 0 || (ex.exercise?.secondary_muscles?.length ?? 0) > 0) && (
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Muscles</div>
                        <div style={{display:'flex',flexWrap:'wrap' as const,gap:5}}>
                          {(ex.exercise?.muscles||[]).map((m:string)=>(
                            <span key={m} style={{background:t.tealDim,border:'1px solid '+t.teal+'30',borderRadius:6,padding:'2px 8px',fontSize:11,fontWeight:700,color:t.teal}}>{m}</span>
                          ))}
                          {(ex.exercise?.secondary_muscles||[]).map((m:string)=>(
                            <span key={m} style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:6,padding:'2px 8px',fontSize:11,color:t.textDim}}>{m}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Equipment */}
                    {ex.exercise?.equipment && (
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Equipment</div>
                        <div style={{fontSize:12,color:t.text}}>{ex.exercise.equipment}</div>
                      </div>
                    )}

                    {/* Description */}
                    {ex.exercise?.description && (
                      <div style={{marginBottom:10}}>
                        <div style={{fontSize:10,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Description</div>
                        <div style={{fontSize:13,color:t.textDim,lineHeight:1.6}}>{ex.exercise.description}</div>
                      </div>
                    )}

                    {/* Coaching cues */}
                    {ex.exercise?.cues && (
                      <div>
                        <div style={{fontSize:10,fontWeight:800,color:t.orange,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Coaching Cues</div>
                        <div style={{fontSize:13,color:t.orange,lineHeight:1.7,whiteSpace:'pre-line' as const}}>{ex.exercise.cues}</div>
                      </div>
                    )}

                    {/* Video embed — shows female version for female-identified clients if available */}
                    {(ex.exercise?.video_url || ex.exercise?.video_url_female) && (() => {
                      const isFemale = clientGender === 'female'
                      const demoUrl = (isFemale && ex.exercise?.video_url_female)
                        ? ex.exercise.video_url_female
                        : ex.exercise?.video_url
                      return demoUrl ? (
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:10,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:6}}>Demo Video</div>
                          <video src={demoUrl} controls playsInline preload="metadata"
                            onLoadedMetadata={e=>{(e.target as HTMLVideoElement).currentTime=0.1}}
                            style={{width:'100%',borderRadius:10,maxHeight:240,background:'#000',display:'block'}}/>
                        </div>
                      ) : null
                    })()}

                    {/* No data fallback */}
                    {!ex.exercise?.description && !ex.exercise?.cues && !ex.exercise?.muscles?.length && !ex.exercise?.video_url && (
                      <div style={{fontSize:12,color:t.textMuted,textAlign:'center' as const,padding:'8px 0'}}>No preview available for this exercise yet.</div>
                    )}
                  </div>
                )}

              </div>

              <div style={{display:'grid',gap:10,marginBottom:12}}>
                {setsArr.map((s,idx)=>{
                  const prior = prevSets[ex.id]?.[idx]
                  return (
                  <div key={idx} style={{background:s.logged?t.greenDim:t.surface,border:`1px solid ${s.logged?t.green:t.border}`,borderRadius:14,padding:'14px 16px',transition:'all 0.2s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:prior?6:10}}>
                      <span style={{fontSize:12,fontWeight:800,color:s.logged?t.green:t.textDim,minWidth:40}}>
                        {s.is_warmup?'Warm-up':`Set ${idx+1}`}
                      </span>
                      <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:t.textMuted,marginLeft:'auto',cursor:'pointer'}}>
                        <input type="checkbox" checked={s.is_warmup} onChange={e=>updateSet(ex.id,idx,'is_warmup',e.target.checked)}
                          style={{accentColor:t.orange}}/>
                        Warmup
                      </label>
                      {s.logged && <span style={{fontSize:12,color:t.green,fontWeight:700}}>✓ Logged</span>}
                    </div>
                    {/* Previous session hint */}
                    {prior && (
                      <div style={{fontSize:11,color:t.textMuted,marginBottom:8,paddingLeft:2,display:'flex',alignItems:'center',gap:4}}>
                        <span style={{color:t.teal,opacity:0.7}}>↩</span>
                        <span>Last time: </span>
                        <span style={{color:t.textDim,fontWeight:700}}>
                          {prior.reps ? `${prior.reps} reps` : '—'}
                          {prior.weight && prior.unit !== 'bw' ? ` @ ${prior.weight}${prior.unit}` : prior.unit === 'bw' ? ' bodyweight' : ''}
                        </span>
                      </div>
                    )}
                    {!s.logged && (
                      <div className="workout-set-helper-row">
                        {prior && (
                          <button onClick={()=>applySetTemplate(ex.id, idx, { reps: prior.reps, weight: prior.weight, unit: prior.unit })}
                            aria-label={`Use last workout numbers for ${s.is_warmup ? 'warm-up' : `set ${idx + 1}`} of ${ex.exercise_name}`}
                            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            Use last time
                          </button>
                        )}
                        {idx > 0 && (
                          <button onClick={()=>copyPreviousLoggedSet(ex.id, idx)}
                            aria-label={`Copy previous set values into ${s.is_warmup ? 'warm-up' : `set ${idx + 1}`} for ${ex.exercise_name}`}
                            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            Copy previous set
                          </button>
                        )}
                      </div>
                    )}
                    <div className="workout-set-grid">
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Reps</label>
                        <input type="number" value={s.reps_completed} onChange={e=>updateSet(ex.id,idx,'reps_completed',e.target.value)}
                          aria-label={`${s.is_warmup ? 'Warm-up' : `Set ${idx + 1}`} reps for ${ex.exercise_name}`}
                          placeholder={ex.reps_prescribed||'—'} inputMode="numeric" disabled={s.logged}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>
                          Weight
                          <select value={s.weight_unit} onChange={e=>updateSet(ex.id,idx,'weight_unit',e.target.value)} disabled={s.logged}
                            aria-label={`${s.is_warmup ? 'Warm-up' : `Set ${idx + 1}`} weight unit for ${ex.exercise_name}`}
                            style={{background:'none',border:'none',color:t.teal,fontSize:11,marginLeft:4,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            <option value="lbs">lbs</option>
                            <option value="kg">kg</option>
                            <option value="bw">BW</option>
                          </select>
                        </label>
                        <input type="number" value={s.weight_value} onChange={e=>updateSet(ex.id,idx,'weight_value',e.target.value)}
                          aria-label={`${s.is_warmup ? 'Warm-up' : `Set ${idx + 1}`} weight for ${ex.exercise_name}`}
                          placeholder={ex.weight_prescribed||'—'} inputMode="decimal" disabled={s.logged||s.weight_unit==='bw'}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:(s.logged||s.weight_unit==='bw')?0.5:1}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>RPE</label>
                        <input type="number" value={s.rpe} onChange={e=>updateSet(ex.id,idx,'rpe',e.target.value)}
                          aria-label={`${s.is_warmup ? 'Warm-up' : `Set ${idx + 1}`} RPE for ${ex.exercise_name}`}
                          placeholder="1-10" min={1} max={10} inputMode="numeric" disabled={s.logged}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      </div>
                    </div>
                    <div className="workout-set-note-row">
                      <input value={s.notes} onChange={e=>updateSet(ex.id,idx,'notes',e.target.value)}
                        aria-label={`${s.is_warmup ? 'Warm-up' : `Set ${idx + 1}`} notes for ${ex.exercise_name}`}
                        placeholder="Notes..." disabled={s.logged}
                        style={{flex:1,background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'7px 10px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      {!s.logged && (
                        <button onClick={()=>logSet(ex.id,idx)}
                          aria-label={`Log ${s.is_warmup ? 'warm-up' : `set ${idx + 1}`} for ${ex.exercise_name}`}
                          style={{background:t.accent,border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer',whiteSpace:'nowrap'}}>
                          Log ✓
                        </button>
                      )}
                    </div>
                  </div>
                  )
                })}
              </div>

              <button onClick={()=>addSet(ex.id)}
                aria-label={`Add another set for ${ex.exercise_name}`}
                style={{width:'100%',background:'none',border:`1px dashed ${t.border}`,borderRadius:10,padding:'10px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
                + Add Set
              </button>

              {/* Form check video — below sets, library + camera both available */}
              <div style={{marginTop:12,padding:'12px 14px',background:t.surface,border:`1px solid ${t.border}`,borderRadius:12}}>
                <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:8}}>📹 Form Check</div>
                <div className="workout-form-check-row">
                  {/* Single button — opens native file picker on all platforms, user chooses camera or library */}
                  <label aria-label={`Upload form check video for ${ex.exercise_name}`} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,background:videoUploads[ex.id]?t.greenDim:t.surfaceHigh,border:`1px solid ${videoUploads[ex.id]?t.green+'50':t.border}`,borderRadius:9,padding:'10px 12px',cursor:videoUploading[ex.id]?'not-allowed':'pointer',fontSize:12,fontWeight:700,color:videoUploads[ex.id]?t.green:t.textDim,textAlign:'center' as const}}>
                    {videoUploading[ex.id] ? '⏳ Uploading...' : videoUploads[ex.id] ? '✓ Uploaded' : '📹 Add Video'}
                    <input type="file" accept="video/mp4,video/quicktime,video/webm,video/*" style={{display:'none'}}
                      disabled={videoUploading[ex.id]}
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFormVideo(ex.id, f) }}/>
                  </label>
                  {videoUploads[ex.id] && (
                    <a href={videoUploads[ex.id]} target="_blank" rel="noreferrer"
                      aria-label={`View uploaded form check video for ${ex.exercise_name}`}
                      style={{display:'flex',alignItems:'center',padding:'10px 14px',background:t.tealDim,border:`1px solid ${t.teal}40`,borderRadius:9,fontSize:12,fontWeight:700,color:t.teal,textDecoration:'none',flexShrink:0}}>
                      View ↗
                    </a>
                  )}
                </div>
              </div>

              {activeExIdx < exercises.length - 1 && (
                <button onClick={()=>setActiveExIdx(activeExIdx+1)}
                  aria-label="Go to next exercise"
                  style={{width:'100%',marginTop:10,background:t.tealDim,border:`1px solid ${t.teal}40`,borderRadius:10,padding:'11px',fontSize:13,fontWeight:700,color:t.teal,cursor:'pointer'}}>
                  Next Exercise →
                </button>
              )}
            </div>
          )
        })()}

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
                      style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:parseInt(finishForm.energy_level)>=n?t.orange+'30':'#1d1d2e',cursor:'pointer',fontSize:16}}>
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
    </>
  )
}

function WorkoutComplete({ session, elapsed, router, t, sessionId, supabase }: WorkoutCompleteProps) {
  const fmtTime = (s: number) => `${Math.floor(s/60)}m ${s%60}s`
  const [countdown, setCountdown] = useState(4)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (cancelled) return
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval)
          router.push('/dashboard/client')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cancelled, router])

  const goBack = async () => {
    setCancelled(true)
    // Revert session back to in_progress so they can finish
    await supabase.from('workout_sessions').update({
      status: 'in_progress',
      completed_at: null,
    }).eq('id', sessionId)
    router.back()
  }
  return (
    <>      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h1 style={{fontSize:28,fontWeight:900,background:`linear-gradient(135deg,${t.teal},${t.accent})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:8}}>
          Workout Complete!
        </h1>
        <p style={{color:t.textDim,fontSize:16,marginBottom:8}}>{session?.title}</p>
        <p style={{fontSize:24,fontWeight:800,color:t.orange,marginBottom:32}}>⏱ {fmtTime(elapsed)}</p>
        <p style={{fontSize:13,color:t.textDim,marginBottom:32,maxWidth:280,lineHeight:1.6}}>
          Crushed it. Your coach will review this session and leave feedback. Be Kind to Yourself & Stay Awesome 💪
        </p>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{background:t.accent,border:'none',borderRadius:14,padding:'14px 32px',fontSize:16,fontWeight:800,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>
          Back to Dashboard {!cancelled && countdown > 0 ? `(${countdown})` : ''}
        </button>
        <button onClick={goBack}
          style={{background:'none',border:'1px solid '+t.border,borderRadius:14,padding:'10px 24px',fontSize:13,fontWeight:600,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
          Wait — I&apos;m not done yet
        </button>
      </div>
    </>
  )
}
