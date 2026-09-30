import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { normalizeInviteEmail } from '@/lib/invite-utils'

function getAllowedPriceIds() {
  return [
    process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY,
    process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
}

export async function POST(req: NextRequest) {
  try {
    const input: unknown = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return NextResponse.json({ error: 'Invalid signup details' }, { status: 400 })
    }
    const { priceId, email: rawEmail, name: rawName } = input as Record<string, unknown>
    if (typeof priceId !== 'string' || !priceId) return NextResponse.json({ error: 'Missing priceId' }, { status: 400 })

    const allowedPriceIds = getAllowedPriceIds()
    if (!allowedPriceIds.includes(priceId)) {
      return NextResponse.json({ error: 'Invalid plan selected' }, { status: 400 })
    }

    const email = rawEmail === undefined ? undefined : normalizeInviteEmail(rawEmail)
    if (email === null || (rawName !== undefined && (typeof rawName !== 'string' || rawName.trim().length > 120))) {
      return NextResponse.json({ error: 'Enter a valid email and a name under 120 characters' }, { status: 400 })
    }
    const name = typeof rawName === 'string' ? rawName.trim() : undefined
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '')
    if (!siteUrl || !process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({ error: 'Signup is temporarily unavailable. Please contact Shane.' }, { status: 503 })
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' as Stripe.LatestApiVersion })

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

    if (!session.url) throw new Error('Checkout URL unavailable')
    return NextResponse.json({ url: session.url })
  } catch {
    console.error('[stripe-checkout] request failed')
    return NextResponse.json({ error: 'Could not open checkout. Please try again.' }, { status: 502 })
  }
}
