import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Coach-only: suggests calories + macro split from the client's intake profile.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients').select('id, coach_id').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const { data: intake } = await supabase
    .from('client_intake_profiles').select('*').eq('client_id', clientId).single()

  if (!intake) return NextResponse.json({ error: 'No intake profile found' }, { status: 404 })

  const prompt = `You are a certified nutrition coach. Based on this client's intake data, suggest calories + macro split.

CLIENT DATA:
- Gender: ${intake.gender || 'not specified'}
- DOB: ${intake.date_of_birth || 'not specified'}
- Height: ${intake.height_inches ? `${intake.height_inches} inches` : 'not specified'}
- Current weight: ${intake.current_weight_lbs ? `${intake.current_weight_lbs} lbs` : 'not specified'}
- Goal weight: ${intake.goal_weight_lbs ? `${intake.goal_weight_lbs} lbs` : 'not specified'}
- Primary goal: ${intake.primary_goal || 'not specified'}
- Secondary goal: ${intake.secondary_goal || 'not specified'}
- Activity level: ${intake.activity_level || 'not specified'}
- Training frequency: ${intake.training_frequency ? `${intake.training_frequency} days/week` : 'not specified'}
- Dietary approach: ${intake.dietary_approach || 'none'}
- Allergies/restrictions: ${intake.allergies_restrictions || 'none'}
- Medical conditions: ${intake.medical_conditions || 'none'}
- Avg sleep: ${intake.avg_sleep_hours || 'not specified'} hrs
- Stress level: ${intake.stress_level || 'not specified'}/10

Respond ONLY with a JSON object, no other text:
{
  "calories": <integer>,
  "protein_g": <integer>,
  "carbs_g": <integer>,
  "fat_g": <integer>,
  "rationale": "<2-3 sentences for the coach — reference the goal, activity level, constraints>"
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
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[suggest-macros] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return NextResponse.json({ error: 'Invalid AI response', raw: text }, { status: 500 })
  try {
    return NextResponse.json(JSON.parse(jsonMatch[0]))
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from AI', raw: text }, { status: 500 })
  }
}
