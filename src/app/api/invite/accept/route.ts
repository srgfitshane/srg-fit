import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { getInviteAvailability, isInviteClaimAllowed } from '@/lib/invite-utils'

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

    const { token } = await request.json()
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

    const { data: existingClient } = await admin
      .from('clients')
      .select('id')
      .eq('profile_id', user.id)
      .eq('coach_id', invite.coach_id)
      .maybeSingle()

    if (existingClient) {
      await admin
        .from('clients')
        .update({
          active: true,
          start_date: new Date().toISOString().split('T')[0],
        })
        .eq('id', existingClient.id)
    } else {
      const { error: createClientError } = await admin.from('clients').insert({
        profile_id: user.id,
        coach_id: invite.coach_id,
        active: true,
        start_date: new Date().toISOString().split('T')[0],
        invite_id: invite.id,
      })

      if (createClientError) {
        return NextResponse.json({ error: createClientError.message }, { status: 500 })
      }
    }

    await admin
      .from('client_invites')
      .update({
        status: 'accepted',
        accepted_at: new Date().toISOString(),
        profile_id: user.id,
      })
      .eq('id', invite.id)

    if (invite.full_name) {
      const { data: profile } = await admin
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile?.full_name) {
        await admin.from('profiles').update({ full_name: invite.full_name }).eq('id', user.id)
      }
    }

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
