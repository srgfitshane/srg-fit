import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const { email, fullName, coachId } = await request.json()

    if (!email || !fullName || !coachId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role key — this runs server-side only, never exposed to browser
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
    const { error: clientError } = await supabaseAdmin
      .from('clients')
      .insert({
        profile_id: newUser.user.id,
        coach_id: coachId,
        start_date: new Date().toISOString().split('T')[0],
        active: true,
      })

    if (clientError) {
      return NextResponse.json({ error: clientError.message }, { status: 500 })
    }

    // Send password reset email so client can set their own password
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/set-password`,
      }
    })

    console.log('Magic link generated:', linkData?.properties?.action_link)

    return NextResponse.json({
      success: true,
      message: `Invite sent! ${fullName} can now log in at srgfit.training`,
      userId: newUser.user.id,
      // In dev, return the link so you can test it
      devLink: process.env.NODE_ENV === 'development' ? linkData?.properties?.action_link : undefined,
    })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
