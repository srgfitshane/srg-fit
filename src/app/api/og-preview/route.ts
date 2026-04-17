import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')
  if (!url) return NextResponse.json({ error: 'No URL' }, { status: 400 })

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
