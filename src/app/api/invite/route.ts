import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, coachId } = await request.json()

    if (!email || !fullName || !coachId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Check if user already exists
    const { data: existingProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single()

    if (existingProfiles) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 400 })
    }

    // Create the auth user
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: Math.random().toString(36).slice(2) + 'Aa1!',
      user_metadata: { full_name: fullName, role: 'client' },
      email_confirm: true,
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

    // Get coach name
    const { data: coachProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', coachId)
      .single()
    const coachName = coachProfile?.full_name || 'Your Coach'

    // Generate password-set link
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srg-fit.vercel.app'
    const { data: linkData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/set-password` }
    })
    const setPasswordLink = linkData?.properties?.action_link

    // Send via Resend
    const resendKey = process.env.RESEND_API_KEY
    if (resendKey && setPasswordLink) {
      const firstName = fullName.split(' ')[0]
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'SRG Fit <onboarding@resend.dev>',
          to: [email],
          subject: `${coachName} invited you to SRG Fit`,
          html: `
            <div style="font-family: Arial, sans-serif; background: #080810; color: #eeeef8; padding: 40px 20px; max-width: 520px; margin: 0 auto;">
              <div style="text-align: center; margin-bottom: 28px;">
                <div style="font-size: 28px; font-weight: 900; color: #00c9b1;">SRG FIT</div>
                <div style="font-size: 12px; color: #8888a8;">Strength &middot; Nutrition &middot; Mental Health</div>
              </div>
              <div style="background: #0f0f1a; border: 1px solid #252538; border-radius: 16px; padding: 28px; text-align: center;">
                <div style="font-size: 40px; margin-bottom: 16px;">&#128075;</div>
                <h2 style="font-size: 20px; font-weight: 900; margin-bottom: 8px; color: #eeeef8;">Hey ${firstName}!</h2>
                <p style="font-size: 14px; color: #8888a8; line-height: 1.7; margin-bottom: 28px;">
                  <strong style="color: #00c9b1;">${coachName}</strong> has invited you to join SRG Fit &mdash;
                  your personal coaching platform for strength, nutrition, and mental health.
                </p>
                <a href="${setPasswordLink}" style="display: inline-block; background: #00c9b1; border-radius: 12px; padding: 14px 36px; font-size: 15px; font-weight: 900; color: #000; text-decoration: none;">
                  Set Up Your Account &rarr;
                </a>
                <p style="font-size: 11px; color: #5a5a78; margin-top: 20px;">This link expires in 24 hours.</p>
              </div>
              <p style="text-align: center; font-size: 11px; color: #5a5a78; margin-top: 20px;">If you didn't expect this, you can safely ignore this email.</p>
            </div>
          `
        }),
      })
    }

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${fullName}! They'll get an email to set up their account.`,
      userId: newUser.user.id,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
