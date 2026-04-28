import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { buildInviteUrl, isCoachRole } from '@/lib/invite-utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { email, fullName, full_name, message, onboarding_form_id, resend } = await request.json()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!isCoachRole(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (!email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use NEXT_PUBLIC_SITE_URL env var, fall back to request origin
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
    // Always use the coach's ID — hardcoded as the single coach on this platform
    const coachId = user.id

    // Check if user already exists
    const normalizedName = fullName || full_name || null

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfile) {
      // User already has an auth account — send a password reset so they can set/reset their password
      // This covers: existing Stripe clients, previously invited users, etc.
      const { error: resetErr } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: {
          redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
        }
      })
      if (resetErr) {
        return NextResponse.json({ error: resetErr.message }, { status: 500 })
      }
      // Make sure they have an active client record linked to this coach
      const { data: existingClient } = await admin
        .from('clients')
        .select('id')
        .eq('profile_id', existingProfile.id)
        .eq('coach_id', user.id)
        .single()
      if (!existingClient) {
        await admin.from('clients').insert({
          profile_id: existingProfile.id,
          coach_id: user.id,
          start_date: new Date().toISOString().split('T')[0],
          active: true,
        })
      }
      return NextResponse.json({
        success: true,
        message: `${email} already has an account — a login link has been sent so they can access the app.`,
      })
    }

    let inviteRow: { id: string; token: string; email: string; full_name: string | null; status: string; created_at: string; expires_at: string; accepted_at: string | null; message: string | null; onboarding_form_id?: string | null; profile_id?: string | null } | null = null

    if (resend) {
      const { data: existingInvite } = await admin
        .from('client_invites')
        .select('id, token, email, full_name, status, created_at, expires_at, accepted_at, message, onboarding_form_id, profile_id')
        .eq('coach_id', user.id)
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingInvite) {
        const { data: updatedInvite, error: updateInviteError } = await admin.from('client_invites').update({
          status: 'pending',
          full_name: normalizedName,
          message: message || existingInvite.message || null,
          onboarding_form_id: onboarding_form_id || existingInvite.onboarding_form_id || null,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        }).eq('id', existingInvite.id).select('id, token, email, full_name, status, created_at, expires_at, accepted_at, message, onboarding_form_id, profile_id').single()

        if (updateInviteError) {
          return NextResponse.json({ error: updateInviteError.message }, { status: 500 })
        }
        inviteRow = updatedInvite
      }
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: normalizedName || email, role: 'client' },
        redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
      }
    )

    if ((inviteError || !invited.user) && !(resend && inviteRow)) {
      return NextResponse.json(
        { error: inviteError?.message || 'Failed to send invite' },
        { status: 500 }
      )
    }

    if (!inviteRow) {
      const { data: createdInvite, error: inviteRowError } = await admin
        .from('client_invites')
        .insert({
          coach_id: user.id,
          email,
          full_name: normalizedName,
          message: message || null,
          onboarding_form_id: onboarding_form_id || null,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select('id, token, email, full_name, status, created_at, expires_at, accepted_at, message, onboarding_form_id, profile_id')
        .single()

      if (inviteRowError) {
        return NextResponse.json({ error: inviteRowError.message }, { status: 500 })
      }
      inviteRow = createdInvite
    }

    // Keep a pending client shell linked to this coach so acceptance can activate it cleanly.
    const { data: existingClient } = await admin
      .from('clients')
      .select('id')
      .eq('profile_id', invited?.user?.id || inviteRow?.profile_id)
      .eq('coach_id', user.id)
      .single()

    if (!existingClient) {
      await admin.from('clients').insert({
        profile_id: invited?.user?.id || inviteRow?.profile_id,
        coach_id: user.id,
        start_date: new Date().toISOString().split('T')[0],
        active: false,
      })
    }

    await admin.from('client_invites').update({
      status: 'pending',
      profile_id: invited?.user?.id || inviteRow?.profile_id || null,
    }).eq('id', inviteRow.id)

    // Notify coach — fire and forget
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-new-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: normalizedName || email,
        client_email: email,
        plan: 'Coach Invite',
        source: 'coach_dashboard',
      }),
    }).catch(err => console.warn('[notify:invite-email] failed', err))

    return NextResponse.json({
      success: true,
      message: `Invite sent to ${email}.`,
      userId: invited?.user?.id || inviteRow?.profile_id || null,
      inviteId: inviteRow.id,
      invite: inviteRow,
      inviteUrl: buildInviteUrl(siteUrl, inviteRow.token),
    })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
