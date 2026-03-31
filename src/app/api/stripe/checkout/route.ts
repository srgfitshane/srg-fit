import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

function getAllowedPriceIds() {
  return [
    process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })
  try {
    const { priceId, email, name } = await req.json() as { priceId?: string; email?: string; name?: string }
    if (!priceId) return NextResponse.json({ error: 'Missing priceId' }, { status: 400 })

    const allowedPriceIds = getAllowedPriceIds()
    if (!allowedPriceIds.includes(priceId)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin

    // Pre-create customer with name so webhook can set full_name immediately
    let customerId: string | undefined
    if (email) {
      const customer = await stripe.customers.create({
        email,
        name: name || undefined,
      })
      customerId = customer.id
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer: customerId,
      customer_email: customerId ? undefined : (email || undefined),
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        trial_period_days: 7,
      },
      success_url: `${siteUrl}/join/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/join`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    })

    return NextResponse.json({ url: session.url })
  } catch (error: unknown) {
    console.error('Stripe checkout error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
