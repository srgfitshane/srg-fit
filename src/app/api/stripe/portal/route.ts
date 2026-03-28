import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isCoachRole } from '@/lib/invite-utils'

export async function POST() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (isCoachRole(profile?.role)) {
      return NextResponse.json({ error: 'Billing portal is only available to clients' }, { status: 403 })
    }

    // stripe_customer_id lives on clients, not profiles
    const { data: client, error } = await admin
      .from('clients')
      .select('stripe_customer_id')
      .eq('profile_id', user.id)
      .single()

    if (error || !client?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srgfit.app'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${siteUrl}/dashboard/client`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err: unknown) {
    console.error('Portal error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
