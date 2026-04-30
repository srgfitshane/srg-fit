import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/workouts/assign-template
// Coach assigns a workout template to a client with proper program_id
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach-only: this route uses adminDb (service role) which bypasses RLS, so
  // the role check has to live here in code. Without it any logged-in client
  // could call this endpoint and write workout_sessions for arbitrary clients.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { template_id, client_id, scheduled_date } = await req.json()
  if (!template_id || !client_id) {
    return NextResponse.json({ error: 'template_id and client_id required' }, { status: 400 })
  }

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get template with exercises
  const { data: template } = await adminDb
    .from('workout_templates')
    .select('*, workout_template_exercises(*)')
    .eq('id', template_id)
    .single()
  if (!template) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

  // Find or create self-service program for this client
  let { data: program } = await adminDb
    .from('programs')
    .select('id')
    .eq('client_id', client_id)
    .eq('is_self_service', true)
    .single()

  if (!program) {
    const { data: newProg } = await adminDb
      .from('programs')
      .insert({
        client_id,
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

  if (!program) return NextResponse.json({ error: 'Could not create program' }, { status: 500 })

  // Create workout session
  const { data: session, error: sessErr } = await adminDb
    .from('workout_sessions')
    .insert({
      client_id,
      coach_id: user.id,
      program_id: program.id,
      title: template.title,
      scheduled_date: scheduled_date || null,
      status: 'assigned',
      notes_coach: template.notes_coach || null,
    })
    .select('id')
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: sessErr?.message || 'Session create failed' }, { status: 500 })
  }

  // Create session exercises with tracking_type
  const exercises = (template.workout_template_exercises || [])
    .sort((a: any, b: any) => a.order_index - b.order_index)

  if (exercises.length > 0) {
    await adminDb.from('session_exercises').insert(
      exercises.map((e: any, i: number) => ({
        session_id: session.id,
        // Open slots start with no exercise — client fills at runtime
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
  }

  return NextResponse.json({ session_id: session.id, scheduled_date })
}
