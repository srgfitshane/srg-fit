import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, requireCoachApi, sendAccountAccessEmail } from '@/lib/supabase-server'
import { normalizeInviteEmail } from '@/lib/invite-utils'
import { localDateStr } from '@/lib/date'

export async function POST(request: NextRequest) {
  try {
    const gate = await requireCoachApi()
    if ('error' in gate) return gate.error
    const { user } = gate
    const input = await request.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 })
    }
    const email = normalizeInviteEmail(input.email)
    const nameValue = input.fullName ?? input.full_name
    const fullName = typeof nameValue === 'string' ? nameValue.trim() : ''
    if (!email || !fullName || fullName.length > 200) {
      return NextResponse.json({ error: 'Enter a valid email address and client name.' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) throw new Error('Account email is not configured: site URL is missing.')
    const admin = createAdminClient()

    if (input.onboarding_form_id) {
      const { data: form, error } = await admin.from('onboarding_forms').select('id')
        .eq('id', input.onboarding_form_id).eq('coach_id', user.id).maybeSingle()
      if (error) throw error
      if (!form) return NextResponse.json({ error: 'Onboarding form not found.' }, { status: 400 })
    }

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id, role').eq('email', email).maybeSingle()
    if (profileError) throw profileError
    if (profile && profile.role !== 'client') {
      return NextResponse.json({ error: 'This email belongs to a coach account.' }, { status: 409 })
    }

    const { data: existingClient, error: existingClientError } = profile
      ? await admin.from('clients').select('id, coach_id, active').eq('profile_id', profile.id).maybeSingle()
      : { data: null, error: null }
    if (existingClientError) throw existingClientError
    if (existingClient && existingClient.coach_id !== user.id) {
      return NextResponse.json({ error: 'This account is already assigned to another coach.' }, { status: 409 })
    }

    let profileId = profile?.id as string | undefined
    if (profileId) {
      await sendAccountAccessEmail(email)
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName, role: 'client' },
        redirectTo: `${siteUrl.replace(/\/+$/, '')}/auth/callback?next=/set-password`,
      })
      if (error) throw error
      if (!data.user) throw new Error('The invitation did not create an account. Please try again.')
      profileId = data.user.id
    }

    const client = existingClient
    if (!client) {
      const { data, error } = await admin.from('clients').insert({
        profile_id: profileId, coach_id: user.id, start_date: localDateStr(), active: false,
      }).select('id').single()
      if (error) throw error
      if (!data) throw new Error('Email requested, but the client record could not be saved. Please retry.')
    }

    // Existing active clients only need the access email, not another invitation.
    if (!client?.active) {
      const { data: pending, error: pendingError } = await admin.from('client_invites')
        .select('id').eq('coach_id', user.id).eq('email', email).eq('status', 'pending')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (pendingError) throw pendingError
      const invite = {
        coach_id: user.id, email, full_name: fullName, profile_id: profileId,
        status: 'pending', accepted_at: null,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        ...(typeof input.message === 'string' ? { message: input.message.trim().slice(0, 2000) || null } : {}),
        ...(input.onboarding_form_id ? { onboarding_form_id: input.onboarding_form_id } : {}),
      }
      const write = pending
        ? admin.from('client_invites').update(invite).eq('id', pending.id)
        : admin.from('client_invites').insert(invite)
      const { data, error } = await write.select('id').single()
      if (error) throw error
      if (!data) throw new Error('Email requested, but invitation history could not be saved. Please retry.')
    }

    return NextResponse.json({
      success: true,
      message: 'Account email requested. Ask your client to check their inbox and spam folder.',
      userId: profileId,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Could not send the account email. Please try again.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
