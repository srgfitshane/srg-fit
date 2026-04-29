import { createClient } from './supabase-browser'

export async function getUnreadInsights(coachId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('ai_insights')
    .select('*')
    .eq('coach_id', coachId)
    .eq('read', false)
    .eq('is_dismissed', false)
    .order('generated_at', { ascending: false })
    .limit(20)
  return data || []
}

// Fire-and-forget: trigger AI insight generation after a check-in.
// Retries once after 4s on network failure or non-2xx -- coach reviews
// a fresh insight within ~1 minute of every check-in submission, so a
// transient blip shouldn't silently drop the trigger.
export async function triggerAiInsight(
  clientId: string,
  coachId: string,
  type: 'checkin_brief' | 'red_flag' | 'progression' | 'recommended_action'
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-ai-insight`
    const init: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ client_id: clientId, coach_id: coachId, type }),
    }
    const attempt = async (label: string) => {
      try {
        const res = await fetch(url, init)
        if (!res.ok) throw new Error(`status ${res.status}`)
        return true
      } catch (err) {
        console.warn(`[ai-insights] ${label} failed`, err)
        return false
      }
    }
    // First attempt; if it fails, queue a single retry after 4s.
    void attempt('attempt-1').then((ok) => {
      if (ok) return
      setTimeout(() => { void attempt('attempt-2-retry') }, 4000)
    })
  } catch {
    // non-blocking, never throw
  }
}
