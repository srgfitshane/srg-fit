import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, sendAccountAccessEmail } from '@/lib/supabase-server'
import { normalizeInviteEmail } from '@/lib/invite-utils'
import { localDateStr } from '@/lib/date'

export async function POST(request: NextRequest) {
  try {
    const input = await request.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'A valid request body is required.' }, { status: 400 })
    }
    const email = normalizeInviteEmail(input.email)
    const name = typeof input.name === 'string' ? input.name.trim() : ''
    const token = input.token
    if (typeof token !== 'string' || !token) {
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 })
    }
    if (!email || !name || name.length > 200) {
      return NextResponse.json({ error: 'Enter a valid name and email address.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) throw new Error('Account email is not configured.')
    const { data: tokenRow, error: tokenError } = await admin.from('signup_tokens')
      .select('id, coach_id, used_at, used_by_email, used_by_profile_id').eq('token', token).maybeSingle()
    if (tokenError) throw tokenError
    if (!tokenRow) return NextResponse.json({ error: 'Invalid invite link' }, { status: 403 })
    // A failed attempt may resume only for the email that claimed the link.
    if (tokenRow.used_at && (tokenRow.used_by_email !== email || tokenRow.used_by_profile_id)) {
      return NextResponse.json({ error: 'This invite link has already been used. Please request a new one from your coach.' }, { status: 410 })
    }
    const { data: coach, error: coachError } = await admin.from('profiles')
      .select('id').eq('id', tokenRow.coach_id).eq('role', 'coach').maybeSingle()
    if (coachError) throw coachError
    if (!coach) return NextResponse.json({ error: 'This invite is no longer available.' }, { status: 410 })

    const { data: profile, error: profileError } = await admin.from('profiles')
      .select('id, role').eq('email', email).maybeSingle()
    if (profileError) throw profileError
    if (profile && profile.role !== 'client') {
      return NextResponse.json({ error: 'This email already belongs to a coach account.' }, { status: 409 })
    }

    const { data: client, error: clientError } = profile
      ? await admin.from('clients').select('id, coach_id').eq('profile_id', profile.id).maybeSingle()
      : { data: null, error: null }
    if (clientError) throw clientError
    if (client && client.coach_id !== tokenRow.coach_id) {
      return NextResponse.json({ error: 'This account is already assigned to another coach.' }, { status: 409 })
    }

    // Claim before sending mail so two different people cannot consume one link.
    if (!tokenRow.used_at) {
      const { data: claimed, error } = await admin.from('signup_tokens')
        .update({ used_at: new Date().toISOString(), used_by_email: email })
        .eq('id', tokenRow.id).is('used_at', null).select('id').maybeSingle()
      if (error) throw error
      if (!claimed) return NextResponse.json({ error: 'This link was just used. Please request a new one from your coach.' }, { status: 409 })
    }

    let profileId = profile?.id as string | undefined
    if (profileId) {
      await sendAccountAccessEmail(email)
    } else {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: name, role: 'client' },
        redirectTo: `${siteUrl.replace(/\/+$/, '')}/auth/callback?next=/set-password`,
      })
      if (error) throw error
      if (!data.user) throw new Error('Could not create your account. Please try again.')
      profileId = data.user.id
    }

    if (!client) {
      const { data, error } = await admin.from('clients').insert({
        profile_id: profileId, coach_id: tokenRow.coach_id, start_date: localDateStr(), active: false,
      }).select('id').single()
      if (error) throw error
      if (!data) throw new Error('Could not finish setting up your account. Please try again.')
    }

    const { data: completed, error: completeError } = await admin.from('signup_tokens')
      .update({ used_by_profile_id: profileId }).eq('id', tokenRow.id)
      .eq('used_by_email', email).select('id').single()
    if (completeError) throw completeError
    if (!completed) throw new Error('Could not finish your invitation. Please try again.')

    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-new-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ client_name: name, client_email: email, plan: 'Direct Invite', source: 'direct' }),
    }).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Could not complete your invitation. Please try again.',
    }, { status: 502 })
  }
}
