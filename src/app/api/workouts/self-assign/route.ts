import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { item_id, scheduled_date } = await req.json()
  if (!item_id || !scheduled_date) {
    return NextResponse.json({ error: 'item_id and scheduled_date required' }, { status: 400 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, coach_id')
    .eq('profile_id', user.id)
    .single()
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

  const { data: item } = await supabase
    .from('content_items')
    .select('title, description, workout_exercises, estimated_duration')
    .eq('id', item_id)
    .single()
  if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Find or create self-service program for this client
  let { data: program } = await adminDb
    .from('programs')
    .select('id')
    .eq('client_id', client.id)
    .eq('is_self_service', true)
    .single()

  if (!program) {
    const { data: newProg } = await adminDb
      .from('programs')
      .insert({
        client_id: client.id,
        coach_id: client.coach_id,
        name: 'My Workouts',
        is_template: false,
        is_active: true,
        is_self_service: true,
      })
      .select('id')
      .single()
    program = newProg
  }

  if (!program) return NextResponse.json({ error: 'Could not create program' }, { status: 500 })

  const { data: session, error: sessErr } = await adminDb
    .from('workout_sessions')
    .insert({
      client_id: client.id,
      coach_id: client.coach_id,
      program_id: program.id,
      title: item.title,
      scheduled_date,
      status: 'assigned',
      notes_coach: (item as any).description || null,
    })
    .select('id')
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: sessErr?.message || 'Session create failed' }, { status: 500 })
  }

  const exercises = ((item as any).workout_exercises || []) as Array<{
    order: number; name: string; prescription?: string
  }>

  if (exercises.length > 0) {
    const rows = exercises.map((ex, i) => {
      const match = ex.prescription?.match(/^(\d+)\s*[xX]\s*(.+)/)
      return {
        session_id: session.id,
        exercise_name: ex.name,
        order_index: ex.order ?? i + 1,
        sets_prescribed: match ? parseInt(match[1]) : null,
        reps_prescribed: match ? match[2].trim() : null,
        notes_coach: (!match && ex.prescription) ? ex.prescription : null,
      }
    })
    await adminDb.from('session_exercises').insert(rows)
  }

  return NextResponse.json({ session_id: session.id, scheduled_date })
}
