import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminDb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

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
