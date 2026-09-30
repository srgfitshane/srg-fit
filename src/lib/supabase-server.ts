import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server components can render with a read-only cookie store.
          }
        },
      },
    }
  )
}

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Recovery email uses a stateless public Auth client. generateLink creates
// tokens only; every server resend must actually request an email here.
export async function sendAccountAccessEmail(email: string): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  if (!siteUrl) throw new Error('Account email is not configured: site URL is missing.')
  const authClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error } = await authClient.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${siteUrl.replace(/\/+$/, '')}/auth/callback?next=/set-password`,
  })
  if (error) throw error
}

export async function requireUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return { supabase, user }
}

export async function requireProfile() {
  const { supabase, user } = await requireUser()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  return { supabase, user, profile }
}

export async function requireCoachProfile() {
  const { supabase, user, profile } = await requireProfile()

  if (profile.role !== 'coach') {
    redirect('/dashboard/client')
  }

  return { supabase, user, profile }
}

// API-route variant of requireCoachProfile: returns a JSON error response
// instead of an HTML redirect. Callers do:
//   const gate = await requireCoachApi()
//   if ('error' in gate) return gate.error
//   const { supabase, user } = gate
export async function requireCoachApi() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const
  }
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'coach') {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const
  }
  return { supabase, user } as const
}
