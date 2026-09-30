import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase-server'
import { subscriptionSnapshot } from '@/lib/stripe-subscription'

const reasons = new Set(['cost', 'time', 'results', 'different', 'pause', 'other'])

export async function POST(req: NextRequest) {
  let cancellationScheduled = false
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Please sign in again before changing billing.' }, { status: 401 })
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profileError) throw profileError
    if (profile?.role !== 'client') return NextResponse.json({ error: 'Subscription cancellation is only available to clients.' }, { status: 403 })

    const input = await req.json().catch(() => null)
    if (!input || typeof input.reason !== 'string' || !reasons.has(input.reason) || (input.details !== undefined && typeof input.details !== 'string') || (input.details?.length ?? 0) > 5000) {
      return NextResponse.json({ error: 'Choose a cancellation reason and keep comments under 5,000 characters.' }, { status: 400 })
    }

    const admin = createAdminClient()
    const { data: client, error: clientError } = await admin.from('clients').select('id, stripe_customer_id').eq('profile_id', user.id).single()
    if (clientError || !client) throw clientError || new Error('Client not found')
    const { data: sub, error: subError } = await admin.from('subscriptions')
      .select('stripe_subscription_id').eq('client_id', client.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (subError) throw subError
    if (!sub?.stripe_subscription_id) return NextResponse.json({ error: 'No Stripe subscription was found. Please contact Shane for help.' }, { status: 409 })

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
    const current = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
    const customerId = typeof current.customer === 'string' ? current.customer : current.customer.id
    if (customerId !== client.stripe_customer_id) throw new Error('Subscription customer mismatch')
    if (['canceled', 'incomplete_expired'].includes(current.status)) {
      return NextResponse.json({ error: 'This subscription has already ended. Refresh billing to see its current status.' }, { status: 409 })
    }
    // Validate the supported plan before changing the paid subscription.
    subscriptionSnapshot(current)

    // Save feedback before touching Stripe so a failed save preserves the draft.
    if (!current.cancel_at_period_end) {
      const { error } = await admin.from('cancel_survey_responses').insert({
        client_id: client.id, reason: input.reason, details: input.details?.trim() || null,
      })
      if (error) throw error
    }
    const updated = current.cancel_at_period_end ? current : await stripe.subscriptions.update(current.id, { cancel_at_period_end: true })
    cancellationScheduled = updated.cancel_at_period_end
    if (!cancellationScheduled) throw new Error('Stripe did not schedule cancellation')
    const snapshot = subscriptionSnapshot(updated)
    const { data: saved, error: saveError } = await admin.from('subscriptions').update(snapshot)
      .eq('stripe_subscription_id', sub.stripe_subscription_id).select('id').single()
    if (saveError || !saved) throw saveError || new Error('Subscription update did not complete')
    const { data: savedClient, error: statusError } = await admin.from('clients').update({ subscription_status: snapshot.status })
      .eq('id', client.id).select('id').single()
    if (statusError || !savedClient) throw statusError || new Error('Client status update did not complete')

    return NextResponse.json({ success: true, subscription: snapshot })
  } catch {
    console.error('[stripe-cancel] request failed', { cancellationScheduled })
    return NextResponse.json({ error: cancellationScheduled
      ? 'Stripe scheduled your cancellation, but billing details could not be refreshed. Retry to finish syncing; your subscription will not be canceled twice.'
      : 'Could not cancel your subscription. Please try again.' }, { status: 502 })
  }
}
