import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { NextResponse } from 'next/server'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // Only the authenticated user can activate their own record.
    if (user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { error } = await adminDb
      .from('clients')
      .update({ active: true })
      .eq('profile_id', user_id)
      .eq('active', false)

    if (error) {
      console.error('activate-client error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('activate-client unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
