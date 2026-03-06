'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { triggerAiInsight } from '@/lib/ai-insights'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", yellow:"#eab308",
  text:"#eeeef8", textMuted:"#5a5a78",
}

interface SetLog {
  set_number: number
  reps_performed: number | ''
  weight_used: number | ''
  rpe_actual: number | ''
  completed: boolean
  skipped: boolean
}

interface ExLog {
  block_exercise_id: string
  exercise_id: string
  name: string
  prog_sets: number
  prog_reps: string
  prog_weight: string
  prog_rpe: string
  superset_group: string
  role: string
  video_url?: string
  sets: SetLog[]
  collapsed: boolean
}

const ROLE_COLORS: Record<string, string> = {
  main:'#f5a623', secondary:'#8b5cf6', accessory:'#00c9b1',
  warmup:'#22c55e', cooldown:'#5a5a78', variation:'#eab308',
}

export default function WorkoutLogger() {
  const params    = useParams()
  const router    = useRouter()
  const supabase  = createClient()
  const sessionId = params.sessionId as string

  const [session,      setSession]      = useState<any>(null)
  const [exercises,    setExercises]    = useState<ExLog[]>([])
  const [loading,      setLoading]      = useState(true)
  const [saving,       setSaving]       = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [startTime,    setStartTime]    = useState<Date | null>(null)
  const [energyLevel,  setEnergyLevel]  = useState(3)
  const [sessionNotes, setSessionNotes] = useState('')
  const [showVideo,    setShowVideo]    = useState<string | null>(null)
  const [done,         setDone]         = useState(false)

  // Timer
  useEffect(() => {
    if (!startTime) return
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime.getTime()) / 1000)), 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`

  useEffect(() => { load() }, [sessionId])

  const load = async () => {
    // Load session
    const { data: sess } = await supabase.from('workout_sessions')
      .select(`*, block:workout_blocks(*, block_exercises(*, exercise:exercises(name, video_url, movement_pattern)))`)
      .eq('id', sessionId).single()
    if (!sess) { router.push('/dashboard/client'); return }
    setSession(sess)
    if (sess.status === 'completed') setDone(true)

    // Load existing logs if resuming
    const { data: existingLogs } = await supabase.from('exercise_logs')
      .select('*').eq('session_id', sessionId).order('set_number')

    // Build exercise log structure from block
    const exMap: Record<string, ExLog> = {}
    const blockExes = sess.block?.block_exercises || []
    blockExes.sort((a: any, b: any) => a.order_index - b.order_index)

    for (const be of blockExes) {
      if (!exMap[be.id]) {
        const progSets = be.sets || 3
        // Build sets from existing logs or defaults
        const existing = (existingLogs || []).filter((l: any) => l.block_exercise_id === be.id)
        const sets: SetLog[] = Array.from({ length: progSets }, (_, i) => {
          const found = existing.find((l: any) => l.set_number === i + 1)
          return found ? {
            set_number: i + 1,
            reps_performed: found.reps_performed ?? '',
            weight_used: found.weight_used ?? '',
            rpe_actual: found.rpe_actual ?? '',
            completed: found.completed,
            skipped: found.skipped,
          } : { set_number: i + 1, reps_performed: '', weight_used: '', rpe_actual: '', completed: false, skipped: false }
        })
        exMap[be.id] = {
          block_exercise_id: be.id,
          exercise_id: be.exercise_id,
          name: be.exercise?.name || 'Exercise',
          prog_sets: progSets,
          prog_reps: be.reps || '',
          prog_weight: be.target_weight ? `${be.target_weight}` : '',
          prog_rpe: be.rpe ? `RPE ${be.rpe}` : '',
          superset_group: be.superset_group || '',
          role: be.exercise_role || 'accessory',
          video_url: be.exercise?.video_url || '',
          sets,
          collapsed: false,
        }
      }
    }
    setExercises(Object.values(exMap))
    setStartTime(new Date())
    setLoading(false)
  }

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetLog, value: any) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value })
    }))
  }

  const addSet = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: [...ex.sets, { set_number: ex.sets.length + 1, reps_performed: '', weight_used: '', rpe_actual: '', completed: false, skipped: false }]
    }))
  }

  const toggleCollapse = (exIdx: number) => {
    setExercises(prev => prev.map((ex, i) => i !== exIdx ? ex : { ...ex, collapsed: !ex.collapsed }))
  }


  const saveProgress = async () => {
    setSaving(true)
    for (const ex of exercises) {
      for (const s of ex.sets) {
        if (!s.reps_performed && !s.weight_used && !s.completed) continue
        const existing = await supabase.from('exercise_logs')
          .select('id').eq('session_id', sessionId)
          .eq('block_exercise_id', ex.block_exercise_id).eq('set_number', s.set_number).single()
        const payload = {
          session_id: sessionId, block_exercise_id: ex.block_exercise_id,
          exercise_id: ex.exercise_id, set_number: s.set_number,
          reps_performed: s.reps_performed || null, weight_used: s.weight_used || null,
          rpe_actual: s.rpe_actual || null, completed: s.completed, skipped: s.skipped,
          vs_programmed: {
            reps_diff: s.reps_performed && ex.prog_reps ? +s.reps_performed - +ex.prog_reps.split('-')[0] : null,
            weight_diff: s.weight_used && ex.prog_weight ? +s.weight_used - +ex.prog_weight : null,
          }
        }
        if (existing.data?.id) {
          await supabase.from('exercise_logs').update(payload).eq('id', existing.data.id)
        } else {
          await supabase.from('exercise_logs').insert(payload)
        }
      }
    }
    setSaving(false)
  }

  const finishWorkout = async () => {
    await saveProgress()
    const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0)
    const totalRPE  = exercises.flatMap(ex => ex.sets).filter(s => s.rpe_actual).map(s => +s.rpe_actual)
    const avgRPE    = totalRPE.length ? Math.round(totalRPE.reduce((a,b)=>a+b,0)/totalRPE.length) : null
    const duration  = startTime ? Math.floor((Date.now() - startTime.getTime()) / 60000) : null

    await supabase.from('workout_sessions').update({
      status: 'completed', duration_minutes: duration,
      overall_rpe: avgRPE, energy_level: energyLevel,
      notes: sessionNotes || null, updated_at: new Date().toISOString(),
    }).eq('id', sessionId)

    // Fire AI progression analysis silently
    if (session?.coach_id && session?.client_id) {
      triggerAiInsight(session.client_id, session.coach_id, 'progression')
    }
    setDone(true)
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading workout...</div>
    </div>
  )

  if (done) return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text, padding:20 }}>
        <div style={{ textAlign:'center', maxWidth:340 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🏋️</div>
          <div style={{ fontSize:24, fontWeight:900, marginBottom:8 }}>Workout Complete!</div>
          <div style={{ fontSize:14, color:t.textMuted, marginBottom:8, lineHeight:1.7 }}>
            {formatTime(elapsed)} • {exercises.reduce((s,ex)=>s+ex.sets.filter(x=>x.completed).length,0)} sets logged
          </div>
          <div style={{ fontSize:13, color:t.teal, marginBottom:32 }}>Great work. Your coach will review your session.</div>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:14, padding:'14px 32px', fontSize:15, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Back to Dashboard →
          </button>
        </div>
      </div>
    </>
  )

