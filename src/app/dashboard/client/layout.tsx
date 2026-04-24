'use client'

/**
 * Client dashboard layout.
 *
 * Reads the signed-in client's theme_preference from the `clients`
 * row and applies it to <html> via the data-theme attribute. Also
 * listens to matchMedia for clients who chose 'system' and to a
 * 'theme-changed' window event from the profile page toggle.
 *
 * The CSS custom properties themselves are injected globally in the
 * root layout (src/app/layout.tsx) so shared components (like
 * RichMessageThread) render with defined theme tokens on every
 * route — including the coach side. Without that global injection,
 * var(--teal) references in shared components resolved to empty
 * strings on coach routes, making message bubbles invisible.
 *
 * This is a client component because it reads from Supabase and
 * manipulates the DOM. But it renders {children} — no visible
 * wrapper — so it doesn't change any layout or styling aside from
 * setting the data-theme attribute.
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { type ThemePreference } from '@/lib/theme'

function applyTheme(preference: ThemePreference) {
  if (typeof document === 'undefined') return
  const resolved: 'dark' | 'light' =
    preference === 'system'
      ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : preference
  document.documentElement.setAttribute('data-theme', resolved)
}

export default function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createClient()
    let preference: ThemePreference = 'dark'

    // Read the client's saved preference. Apply it as soon as we have it.
    // Default stays 'dark' during the round-trip so there's no light-mode
    // flash for clients who haven't opted in.
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('clients')
        .select('theme_preference').eq('profile_id', user.id).maybeSingle()
      if (data?.theme_preference) {
        preference = data.theme_preference as ThemePreference
        applyTheme(preference)
      }
    })()

    // Track system theme changes so clients who chose 'system' flip when
    // their phone flips. Listener stays active for the lifetime of this
    // layout — it's cheap, just a matchMedia handler.
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
    const onSystemChange = () => {
      if (preference === 'system') applyTheme('system')
    }
    mq?.addEventListener?.('change', onSystemChange)

    // Listen for preference changes from the profile page. It dispatches
    // a 'theme-changed' window event after updating the DB so the layout
    // can apply without a page reload.
    const onPrefChange = (e: Event) => {
      const next = (e as CustomEvent<ThemePreference>).detail
      if (next) {
        preference = next
        applyTheme(next)
      }
    }
    window.addEventListener('theme-changed', onPrefChange)

    return () => {
      mq?.removeEventListener?.('change', onSystemChange)
      window.removeEventListener('theme-changed', onPrefChange)
    }
  }, [])

  // Also reset data-theme to 'dark' when this layout unmounts (client
  // navigates away to coach/auth/etc) so those routes don't inherit the
  // client's light preference. Actually — simpler: the attribute only
  // matters while this layout is mounted. When user navigates away, a
  // new layout takes over and their theme preference is irrelevant.
  // No cleanup needed.

  return <>{children}</>
}
