import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

const COACH_ID = '133f93d0-2399-4542-bc57-db4de8b98d79'

export async function POST(request: NextRequest) {
  try {
    const { name, email, token } = await request.json()

    // Validate token
    const validToken = process.env.COACH_INVITE_TOKEN
    if (!validToken || token !== validToken) {
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 })
    }

    if (!email || !name) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srgfit.app'

    // Check if profile already exists
    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .maybeSingle()

    if (existingProfile) {
      // Existing user — ensure client record exists and send recovery link
      const { data: existingClient } = await admin
        .from('clients')
        .select('id')
        .eq('profile_id', existingProfile.id)
        .eq('coach_id', COACH_ID)
        .maybeSingle()

      if (!existingClient) {
        await admin.from('clients').insert({
          profile_id: existingProfile.id,
          coach_id: COACH_ID,
          start_date: new Date().toISOString().split('T')[0],
          active: true,
        })
      }

      await admin.auth.admin.generateLink({
        type: 'recovery',
        email: email.trim().toLowerCase(),
        options: { redirectTo: `${siteUrl}/auth/callback?next=/set-password` },
      })

      return NextResponse.json({ success: true })
    }

    // New user — send invite email
    const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(
      email.trim().toLowerCase(),
      {
        data: { full_name: name.trim(), role: 'client' },
        redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
      }
    )

    if (inviteErr || !invited.user) {
      return NextResponse.json({ error: inviteErr?.message || 'Failed to send invite' }, { status: 500 })
    }

    // Create client record (inactive until password set)
    const { data: existingClient } = await admin
      .from('clients')
      .select('id')
      .eq('profile_id', invited.user.id)
      .eq('coach_id', COACH_ID)
      .maybeSingle()

    if (!existingClient) {
      await admin.from('clients').insert({
        profile_id: invited.user.id,
        coach_id: COACH_ID,
        start_date: new Date().toISOString().split('T')[0],
        active: false,
      })
    }

    // Notify coach — fire and forget
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-new-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: name.trim(),
        client_email: email.trim().toLowerCase(),
        plan: 'Direct Invite',
        source: 'direct',
      }),
    }).catch(err => console.warn('[notify:invite-direct] failed', err))

    return NextResponse.json({ success: true })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
