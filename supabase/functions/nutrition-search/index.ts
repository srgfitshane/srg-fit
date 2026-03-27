import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FS_CLIENT_ID     = Deno.env.get('FATSECRET_CLIENT_ID') || ''
const FS_CLIENT_SECRET = Deno.env.get('FATSECRET_CLIENT_SECRET') || ''
const FS_TOKEN_URL     = 'https://oauth.fatsecret.com/connect/token'
const FS_API_URL       = 'https://platform.fatsecret.com/rest/server.api'

let cachedToken = ''
let tokenExpiry = 0

async function getToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 60_000) return cachedToken
  const res = await fetch(FS_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     FS_CLIENT_ID,
      client_secret: FS_CLIENT_SECRET,
      scope:         'basic',
    }),
  })
  if (!res.ok) throw new Error(`Token error: ${res.status}`)
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpiry = Date.now() + data.expires_in * 1000
  return cachedToken
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!FS_CLIENT_ID || !FS_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'FatSecret not configured' }), {
        status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const url     = new URL(req.url)
    const q       = url.searchParams.get('q')
    const foodId  = url.searchParams.get('food_id')
    const barcode = url.searchParams.get('barcode')

    const token = await getToken()

    let params: Record<string, string> = { format: 'json' }
    if (barcode) {
      params = { ...params, method: 'food.find_id_for_barcode', barcode }
    } else if (foodId) {
      params = { ...params, method: 'food.get.v4', food_id: foodId }
    } else if (q) {
      params = { ...params, method: 'foods.search', search_expression: q, max_results: '10' }
    } else {
      return new Response(JSON.stringify({ error: 'Missing q, food_id, or barcode' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const apiUrl = FS_API_URL + '?' + new URLSearchParams(params).toString()
    const fsRes  = await fetch(apiUrl, { headers: { Authorization: `Bearer ${token}` } })
    const fsData = await fsRes.json()

    return new Response(JSON.stringify(fsData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
