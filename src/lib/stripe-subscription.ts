import type Stripe from 'stripe'

type SubscriptionWithPeriods = Stripe.Subscription & {
  current_period_start?: number | null
  current_period_end?: number | null
}

/** Translate the 2022-11-15 Stripe response into the verified billing schema. */
export function subscriptionSnapshot(subscription: Stripe.Subscription) {
  const sub = subscription as SubscriptionWithPeriods
  const price = sub.items.data[0]?.price
  const interval = price?.recurring?.interval
  if (!price || price.recurring?.interval_count !== 1 || !['week', 'month', 'year'].includes(interval || '')) {
    throw new Error('Unsupported coaching subscription price')
  }
  const plan = interval === 'week' ? 'weekly' : interval === 'month' ? 'monthly' : 'yearly'
  const timestamp = (value: number | null | undefined) => value ? new Date(value * 1000).toISOString() : null
  return {
    status: sub.status,
    plan_name: plan,
    stripe_price_id: price.id,
    amount_cents: price.unit_amount,
    currency: price.currency,
    trial_end: timestamp(sub.trial_end),
    current_period_start: timestamp(sub.current_period_start),
    current_period_end: timestamp(sub.current_period_end),
    cancel_at_period_end: sub.cancel_at_period_end,
    canceled_at: timestamp(sub.canceled_at),
    updated_at: new Date().toISOString(),
  }
}
