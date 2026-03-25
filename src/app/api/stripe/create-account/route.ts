import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COACH_ID = '133f93d0-2399-4542-bc57-db4de8b98d79'

export async function POST(req: NextRequest) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-02-25.clover' })
  try {
    const { session_id } = await req.json()
    if (!session_id) return NextResponse.json({ error: 'Missing session_id' }, { status: 400 })

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription', 'customer'],
    })

    if (session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 400 })
    }

    const email = session.customer_details?.email
    const fullName = session.customer_details?.name || ''
    const stripeCustomerId = typeof session.customer === 'string'
      ? session.customer : (session.customer as Stripe.Customer)?.id
    const sub = session.subscription as any
    const stripeSubId = sub?.id
    const planName = sub?.items?.data?.[0]?.price?.nickname || 'Monthly Coaching'
    const stripePriceId = sub?.items?.data?.[0]?.price?.id || ''
    const currentPeriodStart = sub?.current_period_start
      ? new Date(sub.current_period_start * 1000).toISOString() : null
    const currentPeriodEnd = sub?.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString() : null
    const amountCents = sub?.items?.data?.[0]?.price?.unit_amount || 0

    if (!email) return NextResponse.json({ error: 'No email from Stripe' }, { status: 400 })

    // --- Check if user already exists (idempotent) ---
    const { data: { users } } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    const existingAuthUser = users?.find(u => u.email === email)

    let userId: string

    if (existingAuthUser) {
      // User already exists — just update their stripe_customer_id on profile
      userId = existingAuthUser.id
      await supabase.from('profiles')
        .update({ stripe_customer_id: stripeCustomerId })
        .eq('id', userId)
    } else {
      // Create new Supabase auth user — password will be set via email link
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        email_confirm: true, // skip email confirmation — they already paid
        user_metadata: { full_name: fullName },
      })
      if (createError || !newUser?.user) {
        throw new Error(createError?.message || 'Failed to create auth user')
      }
      userId = newUser.user.id

      // Create profile row
      await supabase.from('profiles').insert({
        id: userId,
        email,
        full_name: fullName,
        role: 'client',
        stripe_customer_id: stripeCustomerId,
      })

      // Create client row
      await supabase.from('clients').insert({
        profile_id: userId,
        coach_id: COACH_ID,
        active: true,
        status: 'active',
        subscription_plan: planName,
        subscription_status: 'active',
        stripe_customer_id: stripeCustomerId,
        start_date: new Date().toISOString().split('T')[0],
      })
    }

    // --- Upsert subscription row ---
    const { data: subRow } = await supabase.from('subscriptions')
      .upsert({
        user_id: userId,
        client_id: userId,
        coach_id: COACH_ID,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubId,
        stripe_price_id: stripePriceId,
        plan_name: planName,
        status: 'active',
        current_period_start: currentPeriodStart,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
        amount_cents: amountCents,
        currency: 'usd',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_subscription_id' })
      .select('id')
      .single()

    // Link subscription id back to client row
    if (subRow?.id) {
      await supabase.from('clients')
        .update({ subscription_id: subRow.id, subscription_status: 'active' })
        .eq('profile_id', userId)
    }

    // --- Send password setup email ---
    const siteUrl = req.nextUrl.origin
    if (!existingAuthUser) {
      // New user — send invite email (sets password for first time)
      await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/set-password`,
        data: { full_name: fullName },
      })
    } else {
      // Existing user — send password reset so they can access their account
      await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${siteUrl}/set-password` },
      })
    }

    return NextResponse.json({ email, success: true })

  } catch (err: any) {
    console.error('create-account error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
