import { createClient } from 'jsr:@supabase/supabase-js@2'
import { requireUser } from '../_shared/auth.ts'

const STRIPE_SECRET = Deno.env.get('STRIPE_SECRET_KEY')!
const SITE_URL = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://srgfit.app'
const corsHeaders = { 'Access-Control-Allow-Origin': SITE_URL, 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify auth
    const user = await requireUser(req, supabase)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const input = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid request body' }, 400)
    const { plan_id, client_id, success_url, cancel_url } = input
    if (!plan_id || !client_id) return json({ error: 'plan_id and client_id required' }, 400)
    if ([success_url, cancel_url].some(value => value !== undefined && !isSiteUrl(value))) {
      return json({ error: 'Redirect URLs must belong to SRG Fit' }, 400)
    }

    // Get plan details
    const { data: plan, error: planError } = await supabase.from('coaching_plans').select('*').eq('id', plan_id).eq('is_active', true).single()
    if (planError) return json({ error: 'Plan not found' }, 404)
    if (!plan) return json({ error: 'Plan not found' }, 404)

    // Get or create Stripe customer
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('*, profile:profiles!clients_profile_id_fkey(full_name, email)')
      .eq('id', client_id).eq('profile_id', user.id).eq('archived', false).single()
    if (clientError || !client) return json({ error: 'Client not found' }, 404)
    if (plan.coach_id !== client.coach_id || !plan.stripe_price_id) {
      return json({ error: 'Plan is not available to this client' }, 403)
    }

    let customerId = client.stripe_customer_id
    if (!customerId) {
      const cusRes = await stripePost('customers', {
        email: client.profile.email,
        name: client.profile.full_name || undefined,
        metadata: { client_id, supabase_user_id: client.profile_id }
      })
      customerId = cusRes.id
      const { error } = await supabase.from('clients').update({ stripe_customer_id: customerId }).eq('id', client_id)
      if (error) throw new Error('Could not save billing account')
    }

    // Create checkout session
    const session = await stripePost('checkout/sessions', {
      customer: customerId,
      mode: plan.interval === 'one_time' ? 'payment' : 'subscription',
      line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
      success_url: success_url || `${SITE_URL}/dashboard/client?payment=success`,
      cancel_url: cancel_url || `${SITE_URL}/dashboard/client?payment=cancelled`,
      metadata: { client_id, plan_id, coach_id: plan.coach_id },
      subscription_data: plan.interval !== 'one_time' ? {
        metadata: { client_id, plan_id, coach_id: plan.coach_id }
      } : undefined
    })

    return json({ url: session.url, session_id: session.id })
  } catch {
    console.error('stripe-checkout failed')
    return json({ error: 'Could not start checkout. Please try again.' }, 500)
  }
})

async function stripePost(endpoint: string, body: Record<string, any>) {
  // Convert nested objects to Stripe's form-encoded format
  const formBody = flattenToFormData(body)
  const res = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${STRIPE_SECRET}`,
      'Stripe-Version': '2022-11-15',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: formBody
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message || 'Stripe error')
  return data
}

function isSiteUrl(value: unknown) {
  if (typeof value !== 'string') return false
  try { return new URL(value).origin === new URL(SITE_URL).origin } catch { return false }
}

function flattenToFormData(obj: any, prefix = ''): string {
  const parts: string[] = []
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined || val === null) continue
    const fullKey = prefix ? `${prefix}[${key}]` : key
    if (typeof val === 'object' && !Array.isArray(val)) {
      parts.push(flattenToFormData(val, fullKey))
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (typeof item === 'object') parts.push(flattenToFormData(item, `${fullKey}[${i}]`))
        else parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`)
      })
    } else {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(val))}`)
    }
  }
  return parts.join('&')
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
