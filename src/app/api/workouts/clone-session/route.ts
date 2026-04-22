import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/workouts/clone-session
// Coach clones an existing workout session to another date on the same client.
// Creates a fresh workout_sessions row (status='assigned') + cloned session_exercises.
// Does NOT copy: exercise_sets, client notes/videos, completion state, swaps, skips.
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { source_session_id, target_date, target_client_id } = await req.json()
  if (!source_session_id || !target_date || !target_client_id) {
    return NextResponse.json({ error: 'source_session_id, target_date, target_client_id required' }, { status: 400 })
  }

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Fetch source with exercises
  const { data: source, error: srcErr } = await adminDb
    .from('workout_sessions')
    .select('*, session_exercises(*)')
    .eq('id', source_session_id)
    .single()

  if (srcErr || !source) {
    return NextResponse.json({ error: 'Source session not found' }, { status: 404 })
  }

  // Defensive: source must belong to the target client (no cross-client clipboard)
  if (source.client_id !== target_client_id) {
    return NextResponse.json({ error: 'Source and target client must match' }, { status: 403 })
  }

  // Find or create self-service program for this client (mirrors assign-template pattern)
  let { data: program } = await adminDb
    .from('programs')
    .select('id')
    .eq('client_id', target_client_id)
    .eq('is_self_service', true)
    .single()

  if (!program) {
    const { data: newProg } = await adminDb
      .from('programs')
      .insert({
        client_id: target_client_id,
        coach_id: user.id,
        name: 'My Workouts',
        is_template: false,
        active: true,
        is_self_service: true,
        status: 'active',
      })
      .select('id')
      .single()
    program = newProg
  }

  if (!program) return NextResponse.json({ error: 'Could not resolve program' }, { status: 500 })

  // Clone the session — prescription layer only
  const { data: newSession, error: sessErr } = await adminDb
    .from('workout_sessions')
    .insert({
      client_id: target_client_id,
      coach_id: user.id,
      program_id: program.id,
      title: source.title,
      scheduled_date: target_date,
      status: 'assigned',
      notes_coach: source.notes_coach || null,
      location: source.location || null,
      day_label: source.day_label || null,
    })
    .select('id')
    .single()

  if (sessErr || !newSession) {
    return NextResponse.json({ error: sessErr?.message || 'Session clone failed' }, { status: 500 })
  }

  // Clone session_exercises — strip all client-side / completion fields
  const sourceExercises = (source.session_exercises || [])
    .sort((a: any, b: any) => a.order_index - b.order_index)

  if (sourceExercises.length > 0) {
    const { error: exErr } = await adminDb.from('session_exercises').insert(
      sourceExercises.map((e: any, i: number) => ({
        session_id: newSession.id,
        // Preserve open-slot pattern: if source had client-filled slot, reset to unfilled
        exercise_id: e.is_open_slot ? null : e.exercise_id,
        exercise_name: e.exercise_name,
        exercise_type: e.exercise_type,
        sets_prescribed: e.sets_prescribed,
        reps_prescribed: e.reps_prescribed,
        weight_prescribed: e.weight_prescribed || null,
        rest_seconds: e.rest_seconds,
        notes_coach: e.notes_coach || null,
        order_index: i,
        tracking_type: e.tracking_type || 'reps',
        duration_seconds: e.duration_seconds || null,
        exercise_role: e.exercise_role || 'main',
        superset_group: e.superset_group || null,
        group_type: e.group_type || null,
        tempo: e.tempo || null,
        tut: e.tut || null,
        rpe: e.rpe || null,
        progression_note: e.progression_note || null,
        is_open_slot: !!e.is_open_slot,
        slot_filter_type: e.is_open_slot ? (e.slot_filter_type || null) : null,
        slot_filter_value: e.is_open_slot ? (e.slot_filter_value || null) : null,
        slot_constraint: e.is_open_slot ? (e.slot_constraint || null) : null,
      }))
    )

    if (exErr) {
      // Rollback the parent session so we don't leave an orphan
      await adminDb.from('workout_sessions').delete().eq('id', newSession.id)
      return NextResponse.json({ error: exErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    session_id: newSession.id,
    scheduled_date: target_date,
    title: source.title,
  })
}