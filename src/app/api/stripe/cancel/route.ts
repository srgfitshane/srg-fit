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
    const { user_id, reason, details } = await req.json()
    if (!user_id) return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })

    // Get client + subscription
    const { data: client } = await supabase
      .from('clients').select('id, stripe_customer_id').eq('profile_id', user_id).single()
    if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })

    const { data: sub } = await supabase
      .from('subscriptions').select('stripe_subscription_id')
      .eq('client_id', client.id).order('created_at', { ascending: false }).limit(1).single()

    // Save survey response
    if (reason) {
      await supabase.from('cancel_survey_responses').insert({
        client_id: client.id, reason, details: details || null
      })
    }

    // Cancel at period end (not immediately — gives them the rest of what they paid for)
    if (sub?.stripe_subscription_id) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
      await supabase.from('subscriptions')
        .update({ cancel_at_period_end: true, updated_at: new Date().toISOString() })
        .eq('stripe_subscription_id', sub.stripe_subscription_id)
      await supabase.from('clients')
        .update({ subscription_status: 'canceled' })
        .eq('id', client.id)
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Cancel error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
