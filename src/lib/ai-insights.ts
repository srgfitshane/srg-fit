import { createClient } from '@/lib/supabase-browser'

const EDGE_FUNCTION_URL = process.env.NEXT_PUBLIC_SUPABASE_URL + '/functions/v1/generate-ai-insight'

export async function triggerAiInsight(
  clientId: string,
  coachId: string,
  type: 'checkin_brief' | 'progression' | 'red_flag' | 'recommended_action'
) {
  try {
    const res = await fetch(EDGE_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, coach_id: coachId, type }),
    })
    return await res.json()
  } catch (err) {
    console.error('AI insight trigger failed:', err)
    return null
  }
}

export async function getUnreadInsights(coachId: string) {
  const supabase = createClient()
  const { data } = await supabase
    .from('ai_insights')
    .select('*, client:clients(*, profile:profiles!clients_profile_id_fkey(full_name))')
    .eq('coach_id', coachId)
    .eq('read', false)
    .order('created_at', { ascending: false })
    .limit(20)
  return data || []
}

export async function markInsightRead(insightId: string) {
  const supabase = createClient()
  await supabase.from('ai_insights').update({ read: true }).eq('id', insightId)
}

export async function markInsightActioned(insightId: string, note?: string) {
  const supabase = createClient()
  await supabase.from('ai_insights')
    .update({ actioned: true, read: true, action_taken: note || null })
    .eq('id', insightId)
}
