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
