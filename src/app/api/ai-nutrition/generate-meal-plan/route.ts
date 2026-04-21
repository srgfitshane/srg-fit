import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Coach-only: generates a sample day meal plan from confirmed macros + client intake.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId, calories, protein_g, carbs_g, fat_g, meals_per_day } = await req.json()
  if (!clientId || !calories) return NextResponse.json({ error: 'clientId and calories required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients').select('id, coach_id').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const { data: intake } = await supabase
    .from('client_intake_profiles').select('*').eq('client_id', clientId).single()

  const numMeals = meals_per_day || 4

  const prompt = `You are a nutrition coach creating a sample one-day meal plan.

TARGETS:
- Calories: ${calories} kcal
- Protein: ${protein_g}g
- Carbs: ${carbs_g}g
- Fat: ${fat_g}g
- Meals: ${numMeals}

CLIENT CONSTRAINTS:
- Dietary approach: ${intake?.dietary_approach || 'standard'}
- Allergies/restrictions: ${intake?.allergies_restrictions || 'none'}
- Foods disliked: ${intake?.foods_disliked || 'none'}
- Foods preferred: ${intake?.foods_preferred || 'no specific preferences'}
- Primary goal: ${intake?.primary_goal || 'general health'}

Create ${numMeals} meals. Each meal should have realistic portions with common foods. Macros should add up close to the target (within 5%).

Respond ONLY with a JSON object, no other text:
{
  "meals": [
    {
      "name": "Breakfast",
      "time": "7:00 AM",
      "items": [
        { "food": "Greek yogurt, plain 2%", "qty": "1 cup (245g)" },
        { "food": "Blueberries", "qty": "1/2 cup" },
        { "food": "Granola", "qty": "1/4 cup" }
      ],
      "calories": 380,
      "protein_g": 28,
      "carbs_g": 45,
      "fat_g": 9
    }
  ],
  "notes": "<1-2 sentence coaching note the client will read — tips on timing, swaps, or hydration>"
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
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[generate-meal-plan] Anthropic error:', await res.text())
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
