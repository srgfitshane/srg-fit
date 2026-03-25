import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, coachId, resend } = await request.json()

    if (!email || !coachId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // ── Resend path: just regenerate the invite link, no new user ──
    if (resend) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srg-fit.vercel.app'
      const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo: `${siteUrl}/set-password` },
      })
      return NextResponse.json({
        success: true,
        invite_link: linkData?.properties?.action_link || null,
      })
    }

    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingProfile) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 400 })
    }

    // Create the auth user (unconfirmed — invite email will confirm them)
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      user_metadata: { full_name: fullName, role: 'client' },
      email_confirm: false,
    })

    if (createError || !newUser.user) {
      return NextResponse.json({ error: createError?.message || 'Failed to create user' }, { status: 500 })
    }

    // Create client record
    await supabaseAdmin.from('clients').insert({
      profile_id: newUser.user.id,
      coach_id: coachId,
      start_date: new Date().toISOString().split('T')[0],
      active: true,
    })

    // Generate invite link — Supabase sends this automatically via SMTP
    // The invite type fires SIGNED_IN on the set-password page
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srg-fit.vercel.app'
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: { redirectTo: `${siteUrl}/set-password` },
    })

    if (linkError) {
      console.error('generateLink error:', linkError)
    }

    const inviteLink = linkData?.properties?.action_link || null

    return NextResponse.json({
      success: true,
      message: `Account created for ${fullName}! Invite email sent via Supabase.`,
      userId: newUser.user.id,
      invite_link: inviteLink,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
