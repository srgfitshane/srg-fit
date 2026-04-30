import { createClient } from '@supabase/supabase-js'

// Vite injects build-time env vars prefixed with VITE_. Set these in
// desktop/.env.local before `npm run tauri dev`:
//   VITE_SUPABASE_URL=https://<project>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon-key>
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Create desktop/.env.local with these values.',
  )
}

// Supabase JS persists the session to localStorage by default. The Tauri
// webview backs localStorage with on-disk WebView2 storage, so the session
// survives across app launches without any extra wiring.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
