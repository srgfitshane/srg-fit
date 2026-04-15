import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

// POST /api/workouts/create-blank
// Coach creates a blank workout session for a client with proper program_id
export async function POST(req: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify the caller is actually the coach
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { client_id, title, scheduled_date } = await req.json()
  if (!client_id || !title?.trim()) {
    return NextResponse.json({ error: 'client_id and title required' }, { status: 400 })
  }

  const adminDb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

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

  const { data: session, error } = await adminDb
    .from('workout_sessions')
    .insert({
      client_id,
      coach_id: user.id,
      program_id: program.id,
      title: title.trim(),
      scheduled_date: scheduled_date || null,
      status: 'assigned',
    })
    .select('id')
    .single()

  if (error || !session) {
    return NextResponse.json({ error: error?.message || 'Failed to create session' }, { status: 500 })
  }

  return NextResponse.json({ session_id: session.id })
}
