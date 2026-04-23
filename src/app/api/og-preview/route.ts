import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Hosts Shane's review flow actually uses. If a legit use case appears later
// (different video host), add it here — don't open the whole web back up.
const ALLOWED_HOSTS = [
  'cap.so',
  'caps.srgfit.app',
  'loom.com',
  'www.loom.com',
  'drive.google.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'vimeo.com',
]

function isAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return ALLOWED_HOSTS.includes(u.hostname.toLowerCase())
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  // Before adding this, the endpoint was an open server-side fetcher — any
  // anonymous visitor could pass `?url=http://internal-service` and have Vercel
  // make that request on their behalf. Require a logged-in user and restrict
  // the target to the video hosts we actually use.
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })
  if (!isAllowed(url)) return NextResponse.json({ error: 'URL host not permitted' }, { status: 403 })

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SRGFitBot/1.0)' },
      next: { revalidate: 3600 },
    })
    const html = await res.text()

    const get = (prop: string) => {
      const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
            || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))
      return m?.[1] || null
    }

    const title = get('og:title') || get('twitter:title')
      || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || 'Video Review'
    const image = get('og:image') || get('twitter:image') || null
    const description = get('og:description') || get('twitter:description') || null

    return NextResponse.json({ title: title.trim(), image, description })
  } catch {
    return NextResponse.json({ title: 'Video Review', image: null, description: null })
  }
}
