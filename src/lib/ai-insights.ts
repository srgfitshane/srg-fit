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

// Fire-and-forget: trigger AI insight generation after a check-in
export async function triggerAiInsight(
  clientId: string,
  coachId: string,
  type: 'checkin_brief' | 'red_flag' | 'progression' | 'recommended_action'
) {
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return
    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-ai-insight`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ client_id: clientId, coach_id: coachId, type }),
    }).catch(() => {}) // swallow — non-blocking
  } catch {
    // non-blocking, never throw
  }
}
