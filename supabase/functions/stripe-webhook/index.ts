import { createClient } from 'jsr:@supabase/supabase-js@2'

const STRIPE_SECRET  = Deno.env.get('STRIPE_SECRET_KEY')!
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const GRACE_DAYS     = 3

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })
  if (!WEBHOOK_SECRET) return new Response('Webhook is not configured', { status: 503 })
  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const body = await req.text()
  const sig  = req.headers.get('stripe-signature') || ''

  let event: any
  try {
    event = await verifyStripeWebhook(body, sig, WEBHOOK_SECRET)
  } catch {
    return new Response('Webhook signature failed', { status: 400 })
  }

  const { data: existing, error: lookupError } = await supabase.from('stripe_events').select('processed').eq('id', event.id).maybeSingle()
  if (lookupError) return new Response('Could not check event', { status: 500 })
  if (existing?.processed) return new Response('Already processed', { status: 200 })
  if (!existing) {
    const { error } = await supabase.from('stripe_events').insert({ id: event.id, type: event.type, payload: event })
    if (error && error.code !== '23505') return new Response('Could not save event', { status: 500 })
  }

  try {
    await handleEvent(supabase, event)
    const { error } = await supabase.from('stripe_events').update({ processed: true }).eq('id', event.id)
    if (error) throw new Error('Could not mark event processed')
  } catch {
    console.error('Stripe event processing failed', { eventId: event.id, eventType: event.type })
    return new Response('Handler error', { status: 500 })
  }

  return new Response('OK', { status: 200 })
})

async function handleEvent(supabase: any, event: any) {
  const obj = event.data.object

  switch (event.type) {

    case 'checkout.session.completed': {
      if (obj.mode !== 'subscription') break
      const { client_id, plan_id, coach_id } = obj.metadata || {}
      if (!client_id) break

      const { data: client, error: clientError } = await supabase.from('clients')
        .select('id, profile_id, coach_id, stripe_customer_id').eq('id', client_id).single()
      if (clientError || !client || client.coach_id !== coach_id || (client.stripe_customer_id && client.stripe_customer_id !== obj.customer)) {
        throw new Error('Checkout client does not match billing account')
      }
      const subId = obj.subscription
      const stripeSub = await stripeGet(`subscriptions/${subId}`)
      const interval = stripeSub.items?.data?.[0]?.price?.recurring?.interval
      const planName = interval === 'week' ? 'weekly' : interval === 'month' ? 'monthly' : interval === 'year' ? 'yearly' : null
      if (!planName) throw new Error('Unsupported coaching subscription price')

      const { data: sub, error: subError } = await supabase.from('subscriptions').upsert({
        user_id: client.profile_id, client_id, coach_id, plan_id: plan_id || null, plan_name: planName,
        stripe_customer_id: obj.customer,
        stripe_subscription_id: subId,
        stripe_price_id: stripeSub.items?.data?.[0]?.price?.id,
        status: stripeSub.status,
        current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
        current_period_end:   new Date(stripeSub.current_period_end   * 1000).toISOString(),
        amount_cents: stripeSub.items?.data?.[0]?.price?.unit_amount,
        currency: stripeSub.currency,
        trial_end: stripeSub.trial_end ? new Date(stripeSub.trial_end * 1000).toISOString() : null,
        cancel_at_period_end: stripeSub.cancel_at_period_end,
      }, { onConflict: 'stripe_subscription_id' }).select().single()
      if (subError || !sub) throw new Error('Could not save subscription')

      const { data: linked, error: linkError } = await supabase.from('clients').update({
        stripe_customer_id: obj.customer,
        subscription_status: stripeSub.status,
        subscription_id: sub.id, subscription_plan: planName,
      }).eq('id', client_id).select('id').single()
      if (linkError || !linked) throw new Error('Could not link subscription')

      // Notify client: payment succeeded
      const amtStr = stripeSub.items?.data?.[0]?.price?.unit_amount
        ? `$${(stripeSub.items.data[0].price.unit_amount / 100).toFixed(2)}`
        : undefined
      const { data: clientRow } = await supabase.from('clients').select('profile_id').eq('id', client_id).single()
      if (clientRow?.profile_id) {
        sendNotification({
          user_id: clientRow.profile_id,
          notification_type: 'payment_succeeded',
          title: 'Payment successful',
          body: `Your payment${amtStr ? ` of ${amtStr}` : ''} was processed. Thanks for being awesome! 💪`,
          link_url: '/dashboard/client'
        })
      }
      break
    }

    case 'customer.subscription.updated': {
      const subId = obj.id
      await syncSubscription(supabase, subId)
      break
    }

    case 'customer.subscription.deleted': {
      const subId = obj.id
      const sub = await syncSubscription(supabase, subId)

      const { data: clientRow } = await supabase.from('clients').select('profile_id').eq('id', sub.client_id).single()
      if (clientRow?.profile_id) {
        sendNotification({
          user_id: clientRow.profile_id,
          notification_type: 'subscription_canceled',
          title: 'Subscription ended',
          body: 'Your coaching subscription has been canceled. We hope to see you back soon.',
          link_url: '/dashboard/client'
        })
      }
      break
    }

    case 'invoice.payment_failed': {
      const subId = obj.subscription
      if (!subId) break
      const sub = await syncSubscription(supabase, subId)

      const amtStr = obj.amount_due ? `$${(obj.amount_due / 100).toFixed(2)}` : undefined
      const { data: clientRow } = await supabase.from('clients').select('profile_id').eq('id', sub.client_id).single()
      if (clientRow?.profile_id) {
        sendNotification({
          user_id: clientRow.profile_id,
          notification_type: 'payment_failed',
          title: 'Payment failed',
          body: `We couldn't process your payment${amtStr ? ` of ${amtStr}` : ''}. Please update your payment method.`,
          link_url: '/dashboard/client'
        })
      }
      break
    }

    case 'invoice.payment_succeeded': {
      const subId = obj.subscription
      if (!subId) break
      await syncSubscription(supabase, subId)
      break
    }
  }
}

async function syncSubscription(supabase: any, subscriptionId: string) {
  // Read current Stripe state instead of overwriting it with an older event.
  const current = await stripeGet(`subscriptions/${subscriptionId}`)
  const { data: saved, error } = await supabase.from('subscriptions').update({
    status: current.status,
    current_period_start: new Date(current.current_period_start * 1000).toISOString(),
    current_period_end: new Date(current.current_period_end * 1000).toISOString(),
    cancel_at_period_end: current.cancel_at_period_end,
    canceled_at: current.canceled_at ? new Date(current.canceled_at * 1000).toISOString() : null,
    trial_end: current.trial_end ? new Date(current.trial_end * 1000).toISOString() : null,
    grace_period_end: current.status === 'past_due' ? new Date(Date.now() + GRACE_DAYS * 86400000).toISOString() : null,
  }).eq('stripe_subscription_id', subscriptionId).select('client_id').single()
  if (error || !saved?.client_id) throw new Error('Subscription is not provisioned yet')
  const { data: client, error: clientError } = await supabase.from('clients')
    .update({ subscription_status: current.status }).eq('id', saved.client_id).select('id').single()
  if (clientError || !client) throw new Error('Could not update client billing status')
  return saved
}

function sendNotification(payload: any) {
    fetch(`${SUPABASE_URL}/functions/v1/send-notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
      body: JSON.stringify(payload)
    }).catch(() => {})
}

async function stripeGet(endpoint: string) {
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    headers: { 'Authorization': `Bearer ${STRIPE_SECRET}`, 'Stripe-Version': '2022-11-15' }
  })
  if (!res.ok) throw new Error('Could not read Stripe subscription')
  return res.json()
}

async function verifyStripeWebhook(payload: string, sigHeader: string, secret: string): Promise<any> {
  if (!secret) throw new Error('Webhook is not configured')
  const parts = Object.fromEntries(sigHeader.split(',').map(p => p.split('=')))
  const timestamp = parts.t
  if (!/^\d+$/.test(timestamp || '')) throw new Error('Invalid signature timestamp')
  const signatures = sigHeader.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3))
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${payload}`))
  const expected = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, '0')).join('')
  if (!signatures.includes(expected)) throw new Error('Signature mismatch')
  if (Math.abs(Date.now() / 1000 - parseInt(timestamp)) > 300) throw new Error('Timestamp too old')
  return JSON.parse(payload)
}
