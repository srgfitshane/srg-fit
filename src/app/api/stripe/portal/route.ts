import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2022-11-15' as any })
  try {
    const { user_id } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // stripe_customer_id lives on clients, not profiles
    const { data: client, error } = await supabase
      .from('clients')
      .select('stripe_customer_id')
      .eq('profile_id', user_id)
      .single()

    if (error || !client?.stripe_customer_id) {
      return NextResponse.json({ error: 'No billing account found' }, { status: 404 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://srgfit.app'

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: client.stripe_customer_id,
      return_url: `${siteUrl}/dashboard/client`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err: any) {
    console.error('Portal error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
