import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as 'invite' | 'recovery' | 'email' | null
  const next = searchParams.get('next') ?? '/set-password'

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )

  // Path 1: PKCE code exchange
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error && data.session) {
      // Pass tokens in hash so client can establish session regardless of cookie state
      const url = `${origin}${next}#access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=recovery`
      return NextResponse.redirect(url)
    }
    console.error('[auth/callback] exchangeCode failed:', error?.message)
  }

  // Path 2: token_hash exchange (invite/recovery link)
  if (token_hash && type) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error && data.session) {
      // Pass tokens in hash so client can establish session regardless of cookie state
      const url = `${origin}${next}#access_token=${data.session.access_token}&refresh_token=${data.session.refresh_token}&type=${type}`
      return NextResponse.redirect(url)
    }
    console.error('[auth/callback] verifyOtp failed:', error?.message, { token_hash: token_hash?.slice(0,20), type })
  }

  console.error('[auth/callback] falling through to login', { code: !!code, token_hash: !!token_hash, type })
  return NextResponse.redirect(`${origin}/login?error=auth-rejected`)
}
