import { NextRequest, NextResponse } from 'next/server'
import { requireCoachApi, createAdminClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

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
  const gate = await requireCoachApi()
  if ('error' in gate) return gate.error
  const { user } = gate

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const admin = createAdminClient()

  // Ownership gate + email lookup
  const { data: client } = await admin
    .from('clients')
    .select('coach_id, profile:profiles!profile_id(email)')
    .eq('id', clientId)
    .single()

  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const profile = client.profile as { email?: string | null } | Array<{ email?: string | null }> | null
  const email = (Array.isArray(profile) ? profile[0]?.email : profile?.email)?.trim().toLowerCase()
  if (!email) return NextResponse.json({ error: 'This client has no email on file' }, { status: 400 })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srgfit.app'

  // resetPasswordForEmail sends via Supabase SMTP. Use the anon client — the
  // standard public recovery path — so the email actually goes out.
  const pub = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { error } = await pub.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/set-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 502 })
  }

  return NextResponse.json({ success: true, email })
}
