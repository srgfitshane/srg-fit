import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient, sendAccountAccessEmail } from '@/lib/supabase-server'
import { subscriptionSnapshot } from '@/lib/stripe-subscription'
import { localDateStr } from '@/lib/date'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session, stripe)
        break
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        // Fetch current state: Stripe does not guarantee event delivery order.
        await syncSubscription(await stripe.subscriptions.retrieve(sub.id))
        break
      }
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
        // The webhook is pinned to 2022-11-15, where subscription is top-level.
        const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
        if (subscriptionId) await syncSubscription(await stripe.subscriptions.retrieve(subscriptionId))
        break
      }
      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object as Stripe.Subscription)
        break
    }
  } catch {
    // Log only the event identifier; provider errors can contain client PII.
    console.error('[stripe-webhook] processing failed', { eventId: event.id, eventType: event.type })
    return NextResponse.json({ error: 'Subscription processing failed. Stripe will retry.' }, { status: 500 })
  }
  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  if (session.mode !== 'subscription') return
  const admin = createAdminClient()
  const email = (session.customer_email || session.customer_details?.email || '').trim().toLowerCase()
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id
  const coachId = process.env.COACH_PROFILE_ID
  if (!email || !customerId || !subscriptionId || !coachId) throw new Error('Incomplete checkout configuration')

  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const snapshot = subscriptionSnapshot(subscription)
  const { data: provisioned, error: provisionedError } = await admin.from('subscriptions')
    .select('id').eq('stripe_subscription_id', subscriptionId).maybeSingle()
  if (provisionedError) throw provisionedError
  if (provisioned) {
    await syncSubscription(subscription)
    return
  }

  const { data: profile, error: profileError } = await admin.from('profiles')
    .select('id, role').eq('email', email).maybeSingle()
  if (profileError) throw profileError
  if (profile && profile.role !== 'client') throw new Error('Checkout account is not a client')

  let userId = profile?.id as string | undefined
  let needsAccessEmail = false
  if (!userId) {
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    if (!siteUrl) throw new Error('Account email site URL is missing')
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { role: 'client', full_name: session.customer_details?.name || '' },
      redirectTo: `${siteUrl.replace(/\/+$/, '')}/auth/callback?next=/set-password`,
    })
    // A failed invite must fail the webhook, so a paying client gets a retry.
    if (inviteError || !invited.user) throw inviteError || new Error('Invitation did not create an account')
    userId = invited.user.id
  } else {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data.user) throw error || new Error('Client account not found')
    needsAccessEmail = !data.user.last_sign_in_at
  }

  const { data: existingClient, error: clientLookupError } = await admin.from('clients')
    .select('id, coach_id').eq('profile_id', userId).maybeSingle()
  if (clientLookupError) throw clientLookupError
  if (existingClient && existingClient.coach_id !== coachId) throw new Error('Client coach does not match checkout')

  let clientId = existingClient?.id as string | undefined
  if (!clientId) {
    const { data: client, error } = await admin.from('clients').insert({
      profile_id: userId, coach_id: coachId, start_date: localDateStr(), active: false,
      stripe_customer_id: customerId, subscription_status: snapshot.status, subscription_plan: snapshot.plan_name,
    }).select('id').single()
    if (error || !client) throw error || new Error('Client creation did not complete')
    clientId = client.id
  }

  if (needsAccessEmail) await sendAccountAccessEmail(email)

  const { data: saved, error: subscriptionError } = await admin.from('subscriptions').upsert({
    user_id: userId, client_id: clientId, coach_id: coachId,
    stripe_subscription_id: subscriptionId, stripe_customer_id: customerId, ...snapshot,
  }, { onConflict: 'stripe_subscription_id' }).select('id').single()
  if (subscriptionError || !saved) throw subscriptionError || new Error('Subscription was not saved')

  const { data: linked, error: linkError } = await admin.from('clients').update({
    stripe_customer_id: customerId, subscription_id: saved.id,
    subscription_status: snapshot.status, subscription_plan: snapshot.plan_name,
  }).eq('id', clientId).select('id').single()
  if (linkError || !linked) throw linkError || new Error('Client subscription was not linked')

  // Coach notification is cosmetic and must not block provisioning.
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify-new-client`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ client_name: session.customer_details?.name || 'New client', client_email: email, plan: snapshot.plan_name, source: 'stripe' }),
  }).catch(() => {})
}

async function syncSubscription(subscription: Stripe.Subscription) {
  const admin = createAdminClient()
  const snapshot = subscriptionSnapshot(subscription)
  const { data: saved, error } = await admin.from('subscriptions').update(snapshot)
    .eq('stripe_subscription_id', subscription.id).select('id, client_id, stripe_customer_id').single()
  if (error || !saved?.client_id) throw error || new Error('Subscription is not provisioned yet')
  const { data: client, error: clientError } = await admin.from('clients').update({
    subscription_id: saved.id, stripe_customer_id: saved.stripe_customer_id,
    subscription_status: snapshot.status, subscription_plan: snapshot.plan_name,
  }).eq('id', saved.client_id).select('id').single()
  if (clientError || !client) throw clientError || new Error('Client subscription update did not complete')
}

async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const admin = createAdminClient()
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id
  const { data: client, error } = await admin.from('clients').select('profile_id')
    .eq('stripe_customer_id', customerId).maybeSingle()
  if (error || !client?.profile_id) return
  fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` },
    body: JSON.stringify({ user_id: client.profile_id, notification_type: 'trial_ending', title: 'Your free trial ends in 3 days', body: 'Keep your momentum going — your subscription starts soon.', url: '/dashboard/client?tab=billing' }),
  }).catch(() => {})
}

export const dynamic = 'force-dynamic'
