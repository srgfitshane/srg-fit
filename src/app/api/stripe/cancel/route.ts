import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { isCoachRole } from '@/lib/invite-utils'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const { reason, details } = await req.json()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
    if (isCoachRole(profile?.role)) {
      return NextResponse.json({ error: 'Subscription cancellation is only available to clients' }, { status: 403 })
    }

    // Get client + subscription
    const { data: client } = await admin
      .from('clients').select('id, stripe_customer_id').eq('profile_id', user.id).single()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const { data: sub } = await admin
      .from('subscriptions').select('stripe_subscription_id')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).single()

    // Save survey response
    if (reason) {
      await admin.from('cancel_survey_responses').insert({
        client_id: client.id, reason, details: details || null
      })
    }

    // Cancel at period end (not immediately — gives them the rest of what they paid for)
    if (sub?.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      await admin.from('subscriptions')
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.stripe_subscription_id)
      await admin.from('clients')
        .update({ subscription_status: 'canceled' })
        .eq('id', client.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    console.error('Cancel error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
