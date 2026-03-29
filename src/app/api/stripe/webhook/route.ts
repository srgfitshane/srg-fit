import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type StripeSubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number | null
  current_period_end?: number | null
}

// Supabase database types have not been generated in this repo yet, so we use the base client here.
let supabaseAdmin: SupabaseClient | null = null

function getSupabaseAdminClient(): SupabaseClient {
  if (!supabaseAdmin) {
    supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }
  return supabaseAdmin
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
  const supabase = getSupabaseAdminClient()
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown signature error'
    console.error('Webhook signature failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {

      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutCompleted(session, stripe)
        break
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubUpdate(sub)
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await handleSubUpdate(sub, true)
        break
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object as Stripe.Subscription
        await handleTrialWillEnd(sub)
        break
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice
        const invoiceSubscription = inv.parent?.type === 'subscription_details'
          ? inv.parent.subscription_details?.subscription
          : null
        const subId = typeof invoiceSubscription === 'string' ? invoiceSubscription : invoiceSubscription?.id
        const customerId = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id
        if (subId) {
          await supabase.from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
          if (customerId) {
            await supabase.from('clients')
              .update({ subscription_status: 'past_due' })
              .eq('stripe_customer_id', customerId)
          }
        }
        break
      }
    }
  } catch (error: unknown) {
    console.error('Webhook handler error:', error)
    const message = error instanceof Error ? error.message : 'Unknown webhook handler error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const supabase = getSupabaseAdminClient()
  const email = session.customer_email || session.customer_details?.email
  if (!email) { console.error('No email on checkout session', session.id); return }

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || ''
  const stripeSubId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || ''

  // Pull name from Stripe customer object so profile isn't "Unknown"
  let customerName = session.customer_details?.name || ''
  if (!customerName && stripeCustomerId) {
    try {
      const cus = await stripe.customers.retrieve(stripeCustomerId) as Stripe.Customer
      customerName = cus.name || ''
    } catch {}
  }

  // 1. Check if user already exists
  const { data: existingProfile } = await supabase
    .from('profiles').select('id').eq('email', email).single()

  let userId = existingProfile?.id

  // 2. Create auth user if new
  if (!userId) {
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role: 'client', full_name: customerName },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/set-password`,
    })
    if (inviteErr || !invited.user) {
      console.error('Failed to create user:', inviteErr?.message)
      return
    }
    userId = invited.user.id
    // Write full_name to profile immediately
    if (customerName) {
      await supabase.from('profiles').update({ full_name: customerName }).eq('id', userId)
    }
  } else if (customerName) {
    // Update existing profile if name was missing
    await supabase.from('profiles').update({ full_name: customerName }).eq('id', userId).is('full_name', null)
  }

  // 3. Get or create client record
  const { data: existingClient } = await supabase
    .from('clients').select('id').eq('profile_id', userId).single()

  const coachId = process.env.COACH_PROFILE_ID
  if (!coachId) {
    throw new Error('COACH_PROFILE_ID is not configured')
  }

  if (!existingClient) {
    await supabase.from('clients').insert({
      profile_id: userId,
      coach_id: coachId,
      start_date: new Date().toISOString().split('T')[0],
      active: true,
      stripe_customer_id: stripeCustomerId,
      subscription_status: 'trialing',
    })
  } else {
    await supabase.from('clients').update({
      stripe_customer_id: stripeCustomerId,
      subscription_status: 'trialing',
    }).eq('profile_id', userId)
  }

  // 4. Fetch subscription details from Stripe
  let subData: StripeSubscriptionWithPeriods | null = null
  if (stripeSubId) {
    subData = await stripe.subscriptions.retrieve(stripeSubId) as StripeSubscriptionWithPeriods
  }

  // 5. Upsert subscription record
  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('profile_id', userId).single()

  if (clientRow && stripeSubId) {
    await supabase.from('subscriptions').upsert({
      client_id: clientRow.id,
      stripe_subscription_id: stripeSubId,
      stripe_customer_id: stripeCustomerId,
      status: 'trialing',
      plan_name: subData?.items?.data?.[0]?.price?.nickname || 'Coaching',
      stripe_price_id: subData?.items?.data?.[0]?.price?.id || '',
      trial_end: subData?.trial_end ? new Date(subData.trial_end * 1000).toISOString() : null,
      current_period_start: subData?.current_period_start ? new Date(subData.current_period_start * 1000).toISOString() : null,
      current_period_end: subData?.current_period_end ? new Date(subData.current_period_end * 1000).toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' })
  }

  console.log(`✅ Checkout completed: ${email} (${stripeCustomerId})`)
}

async function handleTrialWillEnd(sub: Stripe.Subscription) {
  const supabase = getSupabaseAdminClient()
  // Fires 3 days before trial ends — send reminder push notification
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  const { data: client } = await supabase
    .from('clients').select('id, profile_id').eq('stripe_customer_id', stripeCustomerId).single()
  if (!client) return

  await supabase.functions.invoke('send-notification', {
    body: {
      user_id: client.profile_id,
      notification_type: 'trial_ending',
      title: 'Your free trial ends in 3 days',
      body: 'Keep your momentum going — your subscription starts soon.',
      link_url: '/dashboard/client?tab=billing',
    }
  })
  console.log(`⚠️ Trial ending reminder sent for customer ${stripeCustomerId}`)
}

async function handleSubUpdate(sub: Stripe.Subscription, deleted = false) {
  const supabase = getSupabaseAdminClient()
  const subscription = sub as StripeSubscriptionWithPeriods
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  const status = deleted ? 'canceled' : sub.status
  const planName = sub.items?.data?.[0]?.price?.nickname || 'Coaching'
  const stripePriceId = sub.items?.data?.[0]?.price?.id || ''

  await supabase.from('subscriptions').update({
    status,
    plan_name: planName,
    stripe_price_id: stripePriceId,
    trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
    current_period_start: subscription.current_period_start ? new Date(subscription.current_period_start * 1000).toISOString() : null,
    current_period_end: subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    canceled_at: subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('stripe_subscription_id', sub.id)

  await supabase.from('clients')
    .update({ subscription_status: status, subscription_plan: planName })
    .eq('stripe_customer_id', stripeCustomerId)
}

export const dynamic = 'force-dynamic'
