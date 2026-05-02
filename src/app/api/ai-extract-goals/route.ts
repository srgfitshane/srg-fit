import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'

// =================================================================
// SMART goal extractor (F4.4) — coach-only.
//
// Reads the client's intake free-text goal fields ("get strong, lose
// belly fat, look good for wedding in October") and proposes 2-3
// SMART sub-goals that match the schema of client_goals.type so the
// coach can one-tap insert them.
//
// Adoption nudge: client_goals had 3 rows total before this. Most
// clients never get goals because typing them out is friction. This
// removes that friction.
// =================================================================

// client_goals.type is NOT NULL — these are the values the existing
// form sends, so we constrain the LLM to the same set.
const ALLOWED_TYPES = [
  'weight_lifted',   // strength PRs (e.g. squat 1RM)
  'body_weight',     // bodyweight target
  'body_fat',        // body composition
  'frequency',       // workouts per week, habit hits, etc.
  'milestone',       // event-driven (race, photoshoot)
  'custom',
] as const

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients').select('id, coach_id, display_name, profile:profiles!profile_id(full_name)').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }
  const clientName = (client as any).profile?.full_name || (client as any).display_name || 'the client'

  const { data: intake } = await supabase
    .from('client_intake_profiles')
    .select('primary_goal, secondary_goal, motivation_why, biggest_obstacle, goal_target_date, training_experience, training_frequency, current_weight_lbs, goal_weight_lbs, body_fat_pct')
    .eq('client_id', clientId).maybeSingle()

  if (!intake) {
    return NextResponse.json({ error: 'No intake profile yet — have the client complete intake first.' }, { status: 400 })
  }

  // Pull existing PRs so AI doesn't propose a goal the client already
  // crushed. Cheap context.
  const { data: prs } = await supabase
    .from('personal_records')
    .select('weight_pr, rep_pr_weight, exercise:exercises(name)')
    .eq('client_id', clientId).order('logged_date', { ascending: false }).limit(8)

  const prLines = (prs || [])
    .map(p => {
      const name = (p as any).exercise?.name || '?'
      const w = p.weight_pr || p.rep_pr_weight
      return w ? `- ${name}: ${w} lbs` : null
    })
    .filter(Boolean)
    .join('\n')

  const today = new Date().toISOString().slice(0, 10)

  const prompt = `You are a coach extracting SMART (Specific, Measurable, Achievable, Relevant,
Time-bound) sub-goals from a client's free-text intake answers. Output goes
straight into a coaching tool, so be specific and concrete — no fluff.

CLIENT: ${clientName}
TODAY'S DATE: ${today}

INTAKE (free text):
- Primary goal: ${intake.primary_goal || 'not specified'}
- Secondary goal: ${intake.secondary_goal || 'not specified'}
- Motivation: ${intake.motivation_why || 'not specified'}
- Biggest obstacle: ${intake.biggest_obstacle || 'not specified'}
- Goal target date (if given): ${intake.goal_target_date || 'not specified'}

CONTEXT:
- Training experience: ${intake.training_experience || 'not specified'}
- Frequency: ${intake.training_frequency ? intake.training_frequency + ' days/week' : 'not specified'}
- Current weight: ${intake.current_weight_lbs ? intake.current_weight_lbs + ' lbs' : 'not specified'}
- Goal weight: ${intake.goal_weight_lbs ? intake.goal_weight_lbs + ' lbs' : 'not specified'}
- Body fat %: ${intake.body_fat_pct ?? 'not specified'}
- Recent PRs: ${prLines || 'none on record'}

Produce 2-3 SMART sub-goals. Each MUST be measurable (target_value + unit) OR
event-based (milestone with target_date). Pick types from this exact list:
weight_lifted, body_weight, body_fat, frequency, milestone, custom.

Time horizon: pick target_date based on the client's stated horizon (or sensible
default of 12 weeks from ${today}). Don't invent dates outside what's reasonable.

Respond ONLY with this JSON, no other text:
{
  "goals": [
    {
      "title": "<short, e.g. 'Squat 185 lbs for 5 reps'>",
      "description": "<1 sentence on why this matters for THIS client>",
      "type": "<one of: weight_lifted | body_weight | body_fat | frequency | milestone | custom>",
      "target_value": <number or null for milestone-only goals>,
      "unit": "<e.g. 'lbs', '%', 'days/week', or null>",
      "target_date": "<YYYY-MM-DD>",
      "rationale": "<one-line cite of which intake field this maps to>"
    }
  ]
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[ai-extract-goals] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[ai-extract-goals] parse failed stop=${data?.stop_reason} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }

  // Defensive: clamp `type` to the allowed list. If LLM drifts to a
  // novel value, fall back to 'custom' so the insert doesn't 500 later.
  const goals = Array.isArray(result.data?.goals) ? result.data.goals : []
  for (const g of goals) {
    if (!ALLOWED_TYPES.includes(g.type)) g.type = 'custom'
  }

  return NextResponse.json({ goals })
}
