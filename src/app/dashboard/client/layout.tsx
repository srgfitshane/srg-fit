'use client'

/**
 * Client dashboard layout.
 *
 * Two jobs:
 * 1. Inject CSS custom properties for both dark and light themes into
 *    the page. These are referenced by the existing `const t = {...}`
 *    blocks in every client-facing page (those blocks now hold
 *    `var(--teal)` style strings instead of hex literals).
 * 2. Read the signed-in client's theme_preference from the `clients`
 *    row and apply it to <html> via the data-theme attribute. Also
 *    listens to matchMedia for clients who chose 'system'.
 *
 * This is a client component because it reads from Supabase and
 * manipulates the DOM. But it renders <>{children}</> — no visible
 * wrapper — so it doesn't change any layout or styling aside from
 * setting up the theme.
 */

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { buildThemeCss, type ThemePreference } from '@/lib/theme'

const THEME_CSS = buildThemeCss()

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

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: THEME_CSS }} />
      {children}
    </>
  )
}
