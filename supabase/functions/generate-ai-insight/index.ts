import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { client_id, coach_id, type } = await req.json()
    if (!client_id || !coach_id || !type) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Fetch client context
    const [
      { data: client },
      { data: recentCheckins },
      { data: recentWorkouts },
      { data: recentPulse },
      { data: recentPRs },
      { data: goals },
    ] = await Promise.all([
      supabase.from('clients').select('*, profile:profiles!profile_id(full_name)').eq('id', client_id).single(),
      supabase.from('checkins').select('*').eq('client_id', client_id).order('submitted_at', { ascending: false }).limit(4),
      supabase.from('workout_sessions').select('title, status, completed_at, session_rpe, mood, notes_client').eq('client_id', client_id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(10),
      supabase.from('daily_checkins').select('checkin_date, sleep_quality, energy_score, mood_emoji, body').eq('client_id', client_id).order('checkin_date', { ascending: false }).limit(14),
      supabase.from('personal_records').select('*, exercise:exercises(name)').eq('client_id', client_id).order('logged_date', { ascending: false }).limit(5),
      supabase.from('client_goals').select('*').eq('client_id', client_id).eq('status', 'active'),
    ])

    const clientName = client?.profile?.full_name?.split(' ')[0] || 'Client'
    const workoutCount = recentWorkouts?.length || 0
    const avgSleep = recentPulse?.length
      ? (recentPulse.reduce((s: number, d: any) => s + (d.sleep_quality || 0), 0) / recentPulse.length).toFixed(1)
      : null
    const avgEnergy = recentPulse?.length
      ? (recentPulse.reduce((s: number, d: any) => s + (d.energy_score || 0), 0) / recentPulse.length).toFixed(1)
      : null

    const contextSummary = `
Client: ${clientName}
Recent workouts (last 10): ${workoutCount} completed
${avgSleep ? `Avg sleep quality (14 days): ${avgSleep}/5` : ''}
${avgEnergy ? `Avg energy (14 days): ${avgEnergy}/5` : ''}
Recent PRs: ${recentPRs?.map((p: any) => `${p.exercise?.name} ${p.weight_pr}lbs`).join(', ') || 'none'}
Active goals: ${goals?.map((g: any) => g.title).join(', ') || 'none'}
Recent check-in notes: ${recentCheckins?.map((c: any) => c.struggles || '').filter(Boolean).join(' | ') || 'none'}
Recent mood tags: ${recentPulse?.map((d: any) => d.mood_emoji).filter(Boolean).slice(0, 7).join(' ') || 'none'}
Journal entries (shared): ${recentPulse?.filter((d: any) => d.body).map((d: any) => d.body).slice(0, 3).join(' | ') || 'none'}
    `.trim()

    const prompts: Record<string, string> = {
      checkin_brief: `You are an AI coaching assistant for a personal trainer. Based on this client data, write a brief 2-3 sentence coaching insight. Be specific, actionable, and warm. Focus on what stands out most — positive momentum, a pattern worth noting, or something the coach should follow up on.\n\n${contextSummary}\n\nRespond with JSON: { "headline": "short title", "body": "2-3 sentence insight", "flag_level": "green|yellow|red", "suggested_action": "one short action for the coach" }`,

      red_flag: `You are an AI coaching assistant. Scan this client data for any red flags — declining energy, missed workouts, stress signals in journal entries, or concerning patterns. Only flag something if it genuinely warrants attention.\n\n${contextSummary}\n\nIf no red flag: respond { "flag_level": "green", "headline": "All clear", "body": "No concerns to flag right now.", "suggested_action": "" }\nIf red flag found: respond { "flag_level": "yellow or red", "headline": "short title", "body": "2-3 sentences on the concern", "suggested_action": "one action for the coach" }`,

      progression: `You are an AI coaching assistant. Analyze this client's progress and write a 2-3 sentence progression insight for their coach. Focus on strength gains, consistency, or goal progress.\n\n${contextSummary}\n\nRespond with JSON: { "headline": "short title", "body": "2-3 sentence insight", "flag_level": "green", "suggested_action": "one short action" }`,

      recommended_action: `You are an AI coaching assistant. Based on this client's data, suggest one specific coaching action the trainer should take this week.\n\n${contextSummary}\n\nRespond with JSON: { "headline": "This week: [action]", "body": "2-3 sentences explaining why", "flag_level": "green|yellow", "suggested_action": "the specific action" }`,
    }

    const prompt = prompts[type] || prompts.checkin_brief

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic error:', err)
      return new Response(JSON.stringify({ error: 'AI call failed' }), { status: 500, headers: corsHeaders })
    }

    const aiData = await anthropicRes.json()
    const rawText = aiData.content?.[0]?.text || '{}'

    let parsed: any = {}
    try {
      const cleaned = rawText.replace(/```json|```/g, '').trim()
      parsed = JSON.parse(cleaned)
    } catch {
      parsed = { headline: 'Insight generated', body: rawText, flag_level: 'green', suggested_action: '' }
    }

    // Save to ai_insights
    await supabase.from('ai_insights').insert({
      coach_id,
      client_id,
      type,
      content: parsed,
      insight_data: { clientName, contextSummary },
      flag_level: parsed.flag_level || 'green',
      read: false,
      is_dismissed: false,
      generated_at: new Date().toISOString(),
    })

    return new Response(JSON.stringify({ success: true, insight: parsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (e: any) {
    console.error('generate-ai-insight error:', e)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders })
  }
})
