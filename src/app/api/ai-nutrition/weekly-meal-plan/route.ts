import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'

// =================================================================
// 7-day meal plan + grocery list (F1b). Coach-only.
//
// Distinct from generate-meal-plan (which produces an editable 1-day
// sample for the client to see). This endpoint produces a full week
// the coach can copy/paste to a client over text or email — and the
// grocery list is the headline feature, since it cuts the coach's
// copy-paste time when sending plans.
//
// Targets are passed in (coach has already confirmed macros from
// suggest-macros). Constraints come from the client's intake.
// =================================================================

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
    .from('client_intake_profiles')
    .select('dietary_approach, allergies_restrictions, foods_disliked, foods_preferred, primary_goal, medical_conditions')
    .eq('client_id', clientId).maybeSingle()

  const numMeals = meals_per_day || 4

  const prompt = `You are a nutrition coach designing a 7-day meal plan that the head coach
will send to a client. Output is meant to be readable as-is — the coach copies
it into a message or email.

DAILY TARGETS (each day should hit these within 5%):
- Calories: ${calories} kcal
- Protein: ${protein_g}g
- Carbs: ${carbs_g}g
- Fat: ${fat_g}g
- Meals per day: ${numMeals}

CLIENT CONSTRAINTS:
- Dietary approach: ${intake?.dietary_approach || 'standard'}
- Allergies/restrictions: ${intake?.allergies_restrictions || 'none'}
- Foods disliked: ${intake?.foods_disliked || 'none'}
- Foods preferred: ${intake?.foods_preferred || 'no specific preferences'}
- Primary goal: ${intake?.primary_goal || 'general health'}
- Medical conditions: ${intake?.medical_conditions || 'none'}

Design the week so meals REUSE ingredients across days (cook once, eat twice,
batch-prep friendly). Aim for 3-4 unique proteins across the week, not 7+.
Keep portions realistic, common foods, no exotic ingredients.

Respond ONLY with this JSON shape, no other text:
{
  "days": [
    {
      "day": "Monday",
      "totals": { "calories": ${calories}, "protein_g": ${protein_g}, "carbs_g": ${carbs_g}, "fat_g": ${fat_g} },
      "meals": [
        {
          "name": "Breakfast",
          "time": "7:00 AM",
          "items": [
            { "food": "Greek yogurt, plain 2%", "qty": "1 cup (245g)" },
            { "food": "Blueberries", "qty": "1/2 cup" },
            { "food": "Granola", "qty": "1/4 cup" }
          ],
          "calories": 380, "protein_g": 28, "carbs_g": 45, "fat_g": 9
        }
      ]
    }
  ],
  "grocery_list": [
    { "category": "Protein", "items": ["Chicken breast (3 lbs)", "Greek yogurt (32 oz)", "Eggs (1 dozen)"] },
    { "category": "Produce", "items": ["Spinach (5 oz bag)", "Bell peppers (3)", "Bananas (7)"] },
    { "category": "Pantry", "items": ["Brown rice (2 lbs)", "Olive oil"] },
    { "category": "Dairy", "items": [] },
    { "category": "Frozen", "items": [] }
  ],
  "rotation_notes": "<1-2 sentence note on how meals reuse ingredients across the week so prep stays light>",
  "notes": "<1-2 sentence coaching note for the client — timing tips, swaps, or hydration>"
}

Keep all 7 days. Don't truncate. Use compact whitespace.`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      // 7 days × ~4 meals × ~4 items + grocery list ≈ 6-8k tokens.
      // Bumped to give comfortable headroom.
      model: 'claude-sonnet-4-20250514',
      max_tokens: 12000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[weekly-meal-plan] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[weekly-meal-plan] parse failed stop=${data?.stop_reason} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }
  return NextResponse.json(result.data)
}
