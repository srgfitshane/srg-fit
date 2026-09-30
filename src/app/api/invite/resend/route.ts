import { NextRequest, NextResponse } from 'next/server'
import { requireCoachApi, createAdminClient, sendAccountAccessEmail } from '@/lib/supabase-server'

// =================================================================
// Resend account access to an existing client — coach-only.
//
// The client already has a profile + auth user (they were provisioned
// when the coach added them), they just never set a password. The old
// resend path pushed a client_invites token through the /invite/[token]
// signup flow, which is a dead end for an already-existing email:
// the client can't sign up (email taken) or log in (no password).
//
// This sends a Supabase password-recovery email instead, which lands
// the client on /set-password regardless of whether they'd confirmed
// their email yet. Uses Supabase's own SMTP (not the Resend sandbox
// sender that never delivered to real clients).
// =================================================================

export async function POST(req: NextRequest) {
  try {
  const gate = await requireCoachApi()
  if ('error' in gate) return gate.error
  const { user } = gate

  const input = await req.json().catch(() => null)
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 })
  }
  const { clientId } = input
  if (typeof clientId !== 'string' || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    return NextResponse.json({ error: 'A valid client ID is required.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Ownership gate + email lookup
  const { data: client, error: clientError } = await admin
    .from('clients')
    .select('coach_id, profile:profiles!profile_id(email)')
    .eq('id', clientId)
    .maybeSingle()

  if (clientError) throw clientError

  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const profile = client.profile as { email?: string | null } | Array<{ email?: string | null }> | null
  const email = (Array.isArray(profile) ? profile[0]?.email : profile?.email)?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'This client has no email on file' }, { status: 400 })

  await sendAccountAccessEmail(email)
  return NextResponse.json({ success: true, email })
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not request an account email. Please try again.',
    }, { status: 502 })
  }
}
