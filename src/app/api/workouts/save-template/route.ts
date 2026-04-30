import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/workouts/save-template
// Save or update a workout template + exercises server-side (bypasses RLS)
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Coach-only: writes to workout_templates which is shared coach-owned content.
  // Clients have no business creating or editing workout templates.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { template, exercises, template_id } = await req.json()
  if (!template?.title || !exercises?.length) {
    return NextResponse.json({ error: 'template and exercises required' }, { status: 400 })
  }

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  let tmplId = template_id

  if (tmplId) {
    // Update existing template
    await adminDb.from('workout_templates').update({
      ...template, coach_id: user.id, updated_at: new Date().toISOString(),
    }).eq('id', tmplId)
    await adminDb.from('workout_template_exercises').delete().eq('template_id', tmplId)
  } else {
    // Create new template
    const { data: tmpl, error: tmplErr } = await adminDb
      .from('workout_templates')
      .insert({ ...template, coach_id: user.id, updated_at: new Date().toISOString() })
      .select('id')
      .single()
    if (tmplErr || !tmpl) {
      return NextResponse.json({ error: tmplErr?.message || 'Template create failed' }, { status: 500 })
    }
    tmplId = tmpl.id
  }

  // Insert exercises
  const { error: exErr } = await adminDb
    .from('workout_template_exercises')
    .insert(exercises.map((e: any, i: number) => ({
      template_id: tmplId,
      // For open slots, exercise_id is NULL and exercise_name describes the slot
      exercise_id: e.is_open_slot ? null : e.exercise_id,
      exercise_name: e.exercise_name,
      exercise_type: e.exercise_type,
      sets_prescribed: e.sets_prescribed,
      reps_prescribed: e.reps_prescribed,
      weight_prescribed: e.weight_prescribed || null,
      rest_seconds: e.rest_seconds,
      notes: e.notes || null,
      order_index: i,
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
    return NextResponse.json({ error: exErr.message || 'Exercise save failed' }, { status: 500 })
  }

  // Verify exercises actually saved
  const { count } = await adminDb
    .from('workout_template_exercises')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', tmplId)

  return NextResponse.json({ template_id: tmplId, exercise_count: count })
}
