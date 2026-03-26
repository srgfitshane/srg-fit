import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' })
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: any) {
    console.error('Webhook signature failed:', err.message)
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
        const inv = event.data.object as any
        const subId = typeof inv.subscription === 'string' ? inv.subscription : inv.subscription?.id
        if (subId) {
          await supabase.from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
          await supabase.from('clients')
            .update({ subscription_status: 'past_due' })
            .eq('stripe_customer_id', inv.customer as string)
        }
        break
      }
    }
  } catch (err: any) {
    console.error('Webhook handler error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripe: Stripe) {
  const email = session.customer_email || session.customer_details?.email
  if (!email) { console.error('No email on checkout session', session.id); return }

  const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id || ''
  const stripeSubId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id || ''

  // 1. Check if user already exists
  const { data: existingProfile } = await supabase
    .from('profiles').select('id').eq('email', email).single()

  let userId = existingProfile?.id

  // 2. Create auth user if new
  if (!userId) {
    const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { role: 'client' },
      redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/set-password`,
    })
    if (inviteErr || !invited.user) {
      console.error('Failed to create user:', inviteErr?.message)
      return
    }
    userId = invited.user.id
  }

  // 3. Get or create client record
  const { data: existingClient } = await supabase
    .from('clients').select('id').eq('profile_id', userId).single()

  const coachId = process.env.COACH_PROFILE_ID || '133f93d0-2399-4542-bc57-db4de8b98d79'

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
  let subData: Stripe.Subscription | null = null
  if (stripeSubId) {
    subData = await stripe.subscriptions.retrieve(stripeSubId) as Stripe.Subscription
  }

  // 5. Upsert subscription record
  const { data: clientRow } = await supabase
    .from('clients').select('id').eq('profile_id', userId).single()

  if (clientRow && stripeSubId) {
    const s = subData as any
    await supabase.from('subscriptions').upsert({
      client_id: clientRow.id,
      stripe_subscription_id: stripeSubId,
      stripe_customer_id: stripeCustomerId,
      status: 'trialing',
      plan_name: subData?.items?.data?.[0]?.price?.nickname || 'Coaching',
      stripe_price_id: subData?.items?.data?.[0]?.price?.id || '',
      trial_end: s?.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
      current_period_start: s?.current_period_start ? new Date(s.current_period_start * 1000).toISOString() : null,
      current_period_end: s?.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'stripe_subscription_id' })
  }

  console.log(`✅ Checkout completed: ${email} (${stripeCustomerId})`)
}

async function handleTrialWillEnd(sub: Stripe.Subscription) {
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
  const s = sub as any
  const stripeCustomerId = typeof s.customer === 'string' ? s.customer : s.customer?.id
  const status = deleted ? 'canceled' : sub.status
  const planName = sub.items?.data?.[0]?.price?.nickname || 'Coaching'
  const stripePriceId = sub.items?.data?.[0]?.price?.id || ''

  await supabase.from('subscriptions').update({
    status,
    plan_name: planName,
    stripe_price_id: stripePriceId,
    trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
    current_period_start: s.current_period_start ? new Date(s.current_period_start * 1000).toISOString() : null,
    current_period_end: s.current_period_end ? new Date(s.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: s.cancel_at_period_end,
    canceled_at: s.canceled_at ? new Date(s.canceled_at * 1000).toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('stripe_subscription_id', sub.id)

  await supabase.from('clients')
    .update({ subscription_status: status, subscription_plan: planName })
    .eq('stripe_customer_id', stripeCustomerId)
}

export const dynamic = 'force-dynamic'
