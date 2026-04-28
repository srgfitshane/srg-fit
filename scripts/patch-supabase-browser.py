import io

PATH = r"C:\Users\Shane\OneDrive\Desktop\srg-fit\src\lib\supabase-browser.ts"

NEW = """import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Browser-side Supabase client.
 *
 * Realtime config: worker=true offloads the heartbeat to a Web Worker so the
 * browser can't throttle it when the tab backgrounds (a desktop tab can sit
 * hours without focus and the heartbeat timer freezes on the main thread).
 * heartbeatCallback re-establishes the WebSocket if the server marks us
 * disconnected. Together these are Supabase's recommended fix for the
 * "Realtime stops silently in the background" failure mode:
 *   https://supabase.com/docs/guides/troubleshooting/realtime-handling-silent-disconnections-in-backgrounded-applications-592794
 *
 * Without this, desktop users whose laptops sleep or whose tabs background
 * stop receiving message inserts even though the page looks "connected".
 */
export function createClient() {
  let client: SupabaseClient
  client = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        worker: true,
        heartbeatCallback: (status) => {
          if (status === 'disconnected' || status === 'timeout' || status === 'error') {
            try { client?.realtime.connect() } catch { /* fire-and-forget */ }
          }
        },
      },
    }
  )
  return client
}
"""

with io.open(PATH, "w", encoding="utf-8", newline="\n") as f:
    f.write(NEW)
print(f"wrote {PATH}")