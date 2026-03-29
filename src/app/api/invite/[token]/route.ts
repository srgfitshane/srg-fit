import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'
import { getInviteAvailability } from '@/lib/invite-utils'

type RouteContext = {
  params: Promise<{ token: string }>
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { token } = await params
  const admin = createAdminClient()

  const { data: invite, error } = await admin
    .from('client_invites')
    .select('id, coach_id, full_name, message, expires_at, status')
    .eq('token', token)
    .maybeSingle()

  if (error || !invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
  }

  const availability = getInviteAvailability(invite)
  if (availability === 'invalid') {
    return NextResponse.json({ error: 'Invite invalid' }, { status: 400 })
  }

  const { data: coachProfile } = await admin
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', invite.coach_id)
    .maybeSingle()

  return NextResponse.json({
    invite: {
      full_name: invite.full_name,
      message: invite.message,
      expires_at: invite.expires_at,
      status: invite.status,
      coach_id: invite.coach_id,
    },
    availability,
    coach: coachProfile || null,
  })
}
