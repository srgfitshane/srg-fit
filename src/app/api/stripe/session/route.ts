import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as any })
    const session = await stripe.checkout.sessions.retrieve(id)
    const email = session.customer_email || session.customer_details?.email || null
    const name  = session.customer_details?.name || null
    return NextResponse.json({ email, name })
  } catch {
    return NextResponse.json({ email: null })
  }
}
