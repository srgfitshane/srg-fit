import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/workouts/save-and-assign
// Atomically saves a new template + exercises, then assigns to client
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { template, exercises, client_id, scheduled_date } = await req.json()
  console.log('[save-and-assign] Received:', { title: template?.title, exerciseCount: exercises?.length, client_id, scheduled_date })
  if (!template?.title || !exercises?.length || !client_id) {
    return NextResponse.json({ error: 'template, exercises, and client_id required' }, { status: 400 })
  }

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 1. Create the template
  const { data: tmpl, error: tmplErr } = await adminDb
    .from('workout_templates')
    .insert({ ...template, coach_id: user.id, updated_at: new Date().toISOString() })
    .select('id')
    .single()

  if (tmplErr || !tmpl) {
    console.log('[save-and-assign] Template create FAILED:', tmplErr?.message)
    return NextResponse.json({ error: tmplErr?.message || 'Template create failed' }, { status: 500 })
  }
  console.log('[save-and-assign] Template created:', tmpl.id)

  // 2. Save exercises to template (normalize slot fields)
  const { error: exErr } = await adminDb
    .from('workout_template_exercises')
    .insert(exercises.map((e: any) => ({
      template_id: tmpl.id,
      exercise_id: e.is_open_slot ? null : e.exercise_id,
      exercise_name: e.exercise_name,
      exercise_type: e.exercise_type,
      sets_prescribed: e.sets_prescribed,
      reps_prescribed: e.reps_prescribed,
      weight_prescribed: e.weight_prescribed || null,
      rest_seconds: e.rest_seconds,
      notes: e.notes || null,
      order_index: e.order_index,
      tracking_type: e.tracking_type || 'reps',
      duration_seconds: e.tracking_type === 'time' ? e.duration_seconds : null,
      exercise_role: e.exercise_role || 'main',
      superset_group: e.superset_group || null,
      progression_note: e.progression_note || null,
      tut: e.tut || null,
      is_open_slot: !!e.is_open_slot,
      slot_filter_type: e.is_open_slot ? (e.slot_filter_type || null) : null,
      slot_filter_value: e.is_open_slot ? (e.slot_filter_value || null) : null,
      slot_constraint: e.is_open_slot ? (e.slot_constraint || null) : null,
    })))

  if (exErr) {
    console.log('[save-and-assign] Exercise save FAILED:', exErr.message)
    await adminDb.from('workout_templates').delete().eq('id', tmpl.id)
    return NextResponse.json({ error: exErr.message || 'Exercise save failed' }, { status: 500 })
  }
  console.log('[save-and-assign] Exercises saved:', exercises.length)

  // 3. Find or create self-service program for this client
  let { data: program } = await adminDb
    .from('programs').select('id')
    .eq('client_id', client_id).eq('is_self_service', true).single()

  if (!program) {
    const { data: newProg } = await adminDb.from('programs').insert({
      client_id, coach_id: user.id, name: 'My Workouts',
      is_template: false, active: true, is_self_service: true, status: 'active',
    }).select('id').single()
    program = newProg
  }

  if (!program) return NextResponse.json({ error: 'Could not create program' }, { status: 500 })

  // 4. Create workout session
  const { data: session, error: sessErr } = await adminDb
    .from('workout_sessions')
    .insert({
      client_id, coach_id: user.id, program_id: program.id,
      title: template.title, scheduled_date: scheduled_date || null,
      status: 'assigned', notes_coach: template.notes_coach || null,
    }).select('id').single()

  if (sessErr || !session) {
    return NextResponse.json({ error: sessErr?.message || 'Session create failed' }, { status: 500 })
  }

  // 5. Create session exercises (propagate slot fields)
  await adminDb.from('session_exercises').insert(
    [...exercises]
      .sort((a: any, b: any) => a.order_index - b.order_index)
      .map((e: any, i: number) => ({
        session_id: session.id,
        exercise_id: e.is_open_slot ? null : e.exercise_id,
        exercise_name: e.exercise_name,
        exercise_type: e.exercise_type,
        sets_prescribed: e.sets_prescribed,
        reps_prescribed: e.reps_prescribed,
        weight_prescribed: e.weight_prescribed || null,
        rest_seconds: e.rest_seconds,
        notes_coach: e.notes || null,
        order_index: i,
        tracking_type: e.tracking_type || 'reps',
        duration_seconds: e.duration_seconds || null,
        exercise_role: e.exercise_role || 'main',
        superset_group: e.superset_group || null,
        group_type: e.group_type || null,
        tut: e.tut || null,
        rpe: e.rpe || null,
        progression_note: e.progression_note || null,
        is_open_slot: !!e.is_open_slot,
        slot_filter_type: e.is_open_slot ? (e.slot_filter_type || null) : null,
        slot_filter_value: e.is_open_slot ? (e.slot_filter_value || null) : null,
        slot_constraint: e.is_open_slot ? (e.slot_constraint || null) : null,
      }))
  )

  return NextResponse.json({ session_id: session.id, template_id: tmpl.id, scheduled_date })
}
