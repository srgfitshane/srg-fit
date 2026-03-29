import { NextRequest, NextResponse } from 'next/server'

// FatSecret Platform API — server-side to keep client_secret safe
const FS_CLIENT_ID     = process.env.FATSECRET_CLIENT_ID || ''
const FS_CLIENT_SECRET = process.env.FATSECRET_CLIENT_SECRET || ''

let tokenCache: { token: string; expiresAt: number } | null = null
type FatSecretTokenResponse = { access_token: string; expires_in: number }

async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) return tokenCache.token
  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'client_credentials',
      client_id:     FS_CLIENT_ID,
      client_secret: FS_CLIENT_SECRET,
      scope:         'basic',
    }),
  })
  if (!res.ok) throw new Error(`Token failed: ${res.status}`)
  const data = await res.json() as FatSecretTokenResponse
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
  return tokenCache.token
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const query   = searchParams.get('q')
    const barcode = searchParams.get('barcode')
    const foodId  = searchParams.get('food_id')

    if (!FS_CLIENT_ID || !FS_CLIENT_SECRET) {
      return NextResponse.json({ error: 'FatSecret not configured' }, { status: 503 })
    }

    const token = await getToken()
    const base  = 'https://platform.fatsecret.com/rest/server.api'

    let apiUrl = ''
    if (barcode) {
      apiUrl = `${base}?method=food.find_id_for_barcode&barcode=${encodeURIComponent(barcode)}&format=json`
    } else if (foodId) {
      apiUrl = `${base}?method=food.get.v4&food_id=${encodeURIComponent(foodId)}&format=json`
    } else if (query) {
      apiUrl = `${base}?method=foods.search&search_expression=${encodeURIComponent(query)}&max_results=10&format=json`
    } else {
      return NextResponse.json({ error: 'Missing query, barcode, or food_id' }, { status: 400 })
    }

    const res = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return NextResponse.json({ error: `API error ${res.status}` }, { status: res.status })
    const data = await res.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
