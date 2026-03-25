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

    const siteUrl = request.nextUrl.origin

    // ── Resend path: re-invite an existing user ──────────────────────────────
    if (resend) {
      // Re-inviting an existing user generates a recovery link/OTP email
      const { error: resendErr } = await supabaseAdmin.auth.resetPasswordForEmail(email)
      if (resendErr) throw resendErr
      return NextResponse.json({ success: true })
    }

    // ── New invite path ───────────────────────────────────────────────────────
    // Check if user already exists
    const { data: existingProfile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingProfile) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 400 })
    }

    const { data: invited, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: fullName || email, role: 'client' },
      }
    )

    if (inviteError || !invited.user) {
      return NextResponse.json(
        { error: inviteError?.message || 'Failed to send invite' },
        { status: 500 }
      )
    }

    // Create client record linked to this coach
    await supabaseAdmin.from('clients').insert({
      profile_id: invited.user.id,
      coach_id: coachId,
      start_date: new Date().toISOString().split('T')[0],
      active: true,
    })

    return NextResponse.json({
      success: true,
      message: `Invite securely dispatched to ${email}.`,
      userId: invited.user.id,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
