import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { getInviteAvailability, isInviteClaimAllowed } from '@/lib/invite-utils'
import { localDateStr } from '@/lib/date'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const input = await request.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 })
    }
    const { token } = input
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
    }

    const { data: invite, error: inviteError } = await admin
      .from('client_invites')
      .select('*')
      .eq('token', token)
      .maybeSingle()

    if (inviteError || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    }

    const availability = getInviteAvailability(invite)
    if (availability === 'already_accepted') {
      return NextResponse.json({ error: 'Invite already accepted' }, { status: 409 })
    }
    if (availability === 'expired') {
      return NextResponse.json({ error: 'Invite expired' }, { status: 410 })
    }
    if (availability === 'invalid') {
      return NextResponse.json({ error: 'Invite invalid' }, { status: 400 })
    }

    if (!isInviteClaimAllowed(invite, user)) {
      return NextResponse.json(
        { error: 'This invite belongs to a different account. Please use the email address that received the invite.' },
        { status: 403 }
      )
    }

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('role, full_name').eq('id', user.id).single()
    if (profileError || !profile) throw profileError || new Error('Your profile was not found.')
    if (profile.role !== 'client') {
      return NextResponse.json({ error: 'This invitation requires a client account.' }, { status: 403 })
    }

    const { data: existingClient, error: clientLookupError } = await admin
      .from('clients')
      .select('id, coach_id, active, paused, archived, onboarding_completed')
      .eq('profile_id', user.id)
      .maybeSingle()

    if (clientLookupError) throw clientLookupError
    if (existingClient && existingClient.coach_id !== invite.coach_id) {
      return NextResponse.json({ error: 'This account is already assigned to another coach.' }, { status: 409 })
    }
    if (existingClient && (existingClient.paused || existingClient.archived || (!existingClient.active && existingClient.onboarding_completed))) {
      return NextResponse.json({ error: 'Please contact your coach to reactivate your account.' }, { status: 403 })
    }

    // Save profile details before consuming the invitation so a failed write
    // can be retried with the same link.
    if (invite.full_name && !profile.full_name) {
      const { data: updated, error } = await admin.from('profiles')
        .update({ full_name: invite.full_name }).eq('id', user.id).select('id').single()
      if (error || !updated) throw error || new Error('Your profile could not be saved.')
    }

    if (existingClient) {
      const { data: updated, error: updateError } = await admin
        .from('clients')
        .update({
          active: true,
        })
        .eq('id', existingClient.id)
        .select('id').single()
      if (updateError || !updated) throw updateError || new Error('Client activation was not saved.')
    } else {
      const { error: createClientError } = await admin.from('clients').insert({
        profile_id: user.id,
        coach_id: invite.coach_id,
        active: true,
        start_date: localDateStr(),
        invite_id: invite.id,
      })

      if (createClientError) {
        return NextResponse.json({ error: createClientError.message }, { status: 500 })
      }
    }

    const { data: accepted, error: acceptError } = await admin
      .from('client_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        profile_id: user.id,
      })
      .eq('id', invite.id)
      .select('id').single()
    if (acceptError || !accepted) throw acceptError || new Error('Invitation acceptance was not saved.')

    return NextResponse.json({
      success: true,
      inviteId: invite.id,
      onboardingFormId: invite.onboarding_form_id || null,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
