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

    const user = await requireUser(req, supabase)
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const input = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json({ error: 'Invalid request body' }, 400)
    const { return_url } = input
    if (return_url !== undefined) {
      try {
        if (typeof return_url !== 'string' || new URL(return_url).origin !== new URL(SITE_URL).origin) {
          return json({ error: 'Return URL must belong to SRG Fit' }, 400)
        }
      } catch { return json({ error: 'Invalid return URL' }, 400) }
    }

    // Find client record for this user
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('id, stripe_customer_id')
      .eq('profile_id', user.id)
      .single()
    if (clientError) throw new Error('Could not read billing account')

    if (!client?.stripe_customer_id) {
      return json({ error: 'No billing account found' }, 404)
    }

    // Create Stripe billing portal session
    const formBody = new URLSearchParams({
      customer: client.stripe_customer_id,
      return_url: return_url || `${SITE_URL}/dashboard/client`
    })

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET}`,
        'Stripe-Version': '2022-11-15',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody.toString()
    })

    const session = await res.json()
    if (!res.ok) throw new Error(session.error?.message || 'Stripe portal error')

    return json({ url: session.url })
  } catch {
    console.error('stripe-portal failed')
    return json({ error: 'Could not open billing. Please try again.' }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}
