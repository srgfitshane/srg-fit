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
      case 'customer.subscription.updated': {
        const sub = event.data.object as any
        await handleSubUpdate(sub)
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as any
        await handleSubUpdate(sub, true)
        break
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as any
        const subId = typeof inv.subscription === 'string'
          ? inv.subscription : inv.subscription?.id
        if (subId) {
          await supabase.from('subscriptions')
            .update({ status: 'past_due', updated_at: new Date().toISOString() })
            .eq('stripe_subscription_id', subId)
          // Also update client row
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

async function handleSubUpdate(sub: any, deleted = false) {
  const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id
  const status = deleted ? 'canceled' : sub.status
  const planName = sub.items?.data?.[0]?.price?.nickname || 'Monthly Coaching'
  const stripePriceId = sub.items?.data?.[0]?.price?.id || ''
  const currentPeriodStart = sub.current_period_start
    ? new Date(sub.current_period_start * 1000).toISOString() : null
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString() : null
  const canceledAt = sub.canceled_at
    ? new Date(sub.canceled_at * 1000).toISOString() : null

  // Update subscriptions table
  await supabase.from('subscriptions')
    .update({
      status,
      plan_name: planName,
      stripe_price_id: stripePriceId,
      current_period_start: currentPeriodStart,
      current_period_end: currentPeriodEnd,
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: canceledAt,
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id)

  // Keep client row in sync
  await supabase.from('clients')
    .update({ subscription_status: status, subscription_plan: planName })
    .eq('stripe_customer_id', stripeCustomerId)
}

// Stripe requires raw body — disable Next.js body parsing
export const dynamic = 'force-dynamic'
