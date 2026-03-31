import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'

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

    const { clientId } = await request.json() as { clientId?: string }
    if (!clientId) {
      return NextResponse.json({ error: 'Missing clientId' }, { status: 400 })
    }

    const { data: client } = await admin
      .from('clients')
      .select('id, coach_id, profile_id, profiles!profile_id(full_name)')
      .eq('id', clientId)
      .maybeSingle()

    if (!client || client.profile_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const profileRecord = client.profiles as { full_name?: string | null } | Array<{ full_name?: string | null }> | null | undefined
    const clientName = Array.isArray(profileRecord)
      ? profileRecord[0]?.full_name
      : profileRecord?.full_name

    await admin.from('notifications').insert({
      user_id: client.coach_id,
      notification_type: 'call_request',
      title: 'New client call request',
      body: clientName ? `${clientName} sent a call request with availability.` : 'A client sent a call request with availability.',
      link_url: '/dashboard/coach/messages',
      is_read: false,
    })

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
