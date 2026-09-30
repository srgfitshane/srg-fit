import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    // Require an authenticated session for this call. Before this check was
    // added, anyone could POST {user_id} and flip an inactive client's `active`
    // flag to true. The impact was limited (only affects clients in the
    // inactive state and doesn't grant login), but the route had no auth
    // whatsoever — no reason to leave that open.
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const input = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 })
    }
    const { user_id } = input
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // Only the authenticated user can activate their own record.
    if (user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const adminDb = createAdminClient()
    const { data: profile, error: profileError } = await adminDb.from('profiles')
      .select('role').eq('id', user.id).single()
    if (profileError) throw profileError
    if (profile.role === 'coach') return NextResponse.json({ success: true, next: '/dashboard/coach' })
    const { data: client, error: clientError } = await adminDb.from('clients')
      .select('id, active, onboarding_completed, paused, archived').eq('profile_id', user.id).maybeSingle()
    if (clientError) throw clientError
    if (!client) return NextResponse.json({ error: 'Your client account is not ready. Please contact your coach.' }, { status: 409 })

    // Password recovery must not reactivate an account the coach paused or
    // archived, or an established client the coach deliberately made inactive.
    if (client.paused || client.archived || (!client.active && client.onboarding_completed)) {
      return NextResponse.json({ success: true, next: '/dashboard/client' })
    }

    const { data: activated, error } = await adminDb
      .from('clients')
      .update({ active: true })
      .eq('id', client.id)
      .select('id').single()

    if (error || !activated) throw error || new Error('Client activation was not saved.')

    const { error: inviteError } = await adminDb.from('client_invites')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('profile_id', user.id).eq('status', 'pending')
    if (inviteError) throw inviteError

    return NextResponse.json({ success: true, next: client.onboarding_completed ? '/dashboard/client' : '/onboarding' })
  } catch (err) {
    console.error('activate-client failed:', err instanceof Error ? err.name : 'DatabaseError')
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
