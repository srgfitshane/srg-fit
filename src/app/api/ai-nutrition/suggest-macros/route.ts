import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// =================================================================
// SRG Fit deterministic calorie math.
//
// Why server-side?
//   1. Age: passing DOB to an LLM and asking it to compute age is broken.
//      Sonnet anchors on its training cutoff and produces years-off
//      results (e.g. Michelle, DOB 1964-03-18, real age 62, AI returned
//      59 because it thought it was 2023). Date math goes here.
//   2. Calories: spec is BW * activity multiplier +/- goal adjustment,
//      with hard floors. Deterministic, auditable, identical every run.
//      The LLM only does the macro split.
// =================================================================

// activity_level -> multiplier. Handles canonical onboarding values
// AND legacy snake_case found in older intakes.
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  // Canonical (onboarding/page.tsx line 345)
  'Sedentary (desk job)': 10,
  'Lightly active':       11,
  'Moderately active':    12,
  'Very active':          13,
  'Extremely active':     14,
  // Legacy snake_case
  'sedentary':         10,
  'lightly_active':    11,
  'moderately_active': 12,
  'very_active':       13,
  'extremely_active':  14,
}

function activityMultiplier(level: string | null | undefined): number {
  if (!level) return 12 // sensible default if intake missing
  return ACTIVITY_MULTIPLIERS[level] ?? 12
}

// Compute age from DOB string (YYYY-MM-DD) using server time.
function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
    age--
  }
  return age
}


// primary_goal can be a JSON-stringified array or a free-form string.
// Returns calorie adjustment kcal: negative=deficit, positive=surplus.
// First match wins. Recomp = -250 (slight deficit + high protein, the
// classic recomp prescription).
function goalAdjustment(primary: string | null | undefined): number {
  if (!primary) return 0
  let goals: string[] = []
  try {
    const parsed = JSON.parse(primary)
    goals = Array.isArray(parsed) ? parsed.map(String) : [String(parsed)]
  } catch {
    goals = [primary]
  }
  const flat = goals.join(' ').toLowerCase()
  if (/(weight\s*loss|fat\s*loss|cut|deficit)/.test(flat)) return -250
  if (/recomp/.test(flat)) return -250
  if (/(bulk|muscle\s*gain|mass|surplus)/.test(flat)) return 250
  return 0
}

// Calorie floor by gender. null = no floor (gender unknown). The coach
// can adjust the suggested number before saving anyway.
function calorieFloor(gender: string | null | undefined): number | null {
  if (!gender) return null
  const g = gender.toLowerCase()
  if (g === 'female') return 1300
  if (g === 'male')   return 1800
  return null
}

// =================================================================
// POST handler -- coach-only.
// =================================================================
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const { data: client } = await supabase
    .from('clients').select('id, coach_id, gender').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const { data: intake } = await supabase
    .from('client_intake_profiles').select('*').eq('client_id', clientId).single()

  if (!intake) return NextResponse.json({ error: 'No intake profile found' }, { status: 404 })

  // ----- Resolve current weight -----
  // Prefer the latest entry from metrics (the client logs weight here
  // every check-in or whenever they update it on the Progress page).
  // Fall back to the intake row's current_weight_lbs only if metrics
  // has nothing yet -- this matters for brand new clients who haven't
  // logged a weight yet but did fill in onboarding.
  const { data: latestMetric } = await supabase
    .from('metrics')
    .select('weight, logged_date')
    .eq('client_id', clientId)
    .not('weight', 'is', null)
    .order('logged_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const weightLbs = Number(latestMetric?.weight) || Number(intake.current_weight_lbs) || 0
  if (!weightLbs || weightLbs <= 0) {
    return NextResponse.json({ error: 'Client has no current weight on file' }, { status: 400 })
  }

  const age = ageFromDob(intake.date_of_birth)
  // Prefer client-row gender (coach-set) over intake (self-reported).
  const gender = client.gender || intake.gender
  const multiplier = activityMultiplier(intake.activity_level)
  const maintenance = Math.round(weightLbs * multiplier)
  const adjustment = goalAdjustment(intake.primary_goal)
  const beforeFloor = maintenance + adjustment
  const floor = calorieFloor(gender)
  const calories = floor !== null ? Math.max(beforeFloor, floor) : beforeFloor

  // ----- LLM does the macro split only -----
  const goalDescription = adjustment < 0 ? 'cutting (slight deficit)'
                        : adjustment > 0 ? 'bulking (slight surplus)'
                        : 'maintenance'

  const floorNote = (floor !== null && beforeFloor < floor)
    ? `\n- Floor applied: ${floor} kcal minimum (${gender})`
    : ''

  const prompt = `You are a certified nutrition coach. The calorie target has already been calculated. Your job: split it into protein/carbs/fat and write a short rationale.

CLIENT DATA:
- Age: ${age !== null ? age + ' years' : 'not specified'}
- Gender: ${gender || 'not specified'}
- Height: ${intake.height_inches ? `${intake.height_inches} inches` : 'not specified'}
- Current weight: ${weightLbs} lbs
- Goal weight: ${intake.goal_weight_lbs ? `${intake.goal_weight_lbs} lbs` : 'not specified'}
- Primary goal: ${intake.primary_goal || 'not specified'}
- Secondary goal: ${intake.secondary_goal || 'not specified'}
- Activity level: ${intake.activity_level || 'not specified'}
- Training frequency: ${intake.training_frequency ? `${intake.training_frequency} days/week` : 'not specified'}
- Dietary approach: ${intake.dietary_approach || 'none'}
- Allergies/restrictions: ${intake.allergies_restrictions || 'none'}
- Medical conditions: ${intake.medical_conditions || 'none'}

CALCULATED CALORIE TARGET (DO NOT CHANGE THIS NUMBER):
- Maintenance: ${maintenance} kcal (${weightLbs} lbs * ${multiplier})
- Adjustment: ${adjustment >= 0 ? '+' : ''}${adjustment} kcal (${goalDescription})${floorNote}
- Final target: ${calories} kcal

Your task: produce a macro split that hits ${calories} kcal, rounding cleanly:
- Protein: typically 0.8-1.0 g/lb bodyweight for cutting, 0.7-0.9 g/lb for maintenance/bulk
- Fat: 0.3-0.4 g/lb minimum for hormonal health
- Carbs: fill the remainder

Macro grams must add up to within +/- 20 kcal of ${calories} (1g protein/carb = 4 kcal, 1g fat = 9 kcal).

Respond ONLY with a JSON object, no other text:
{
  "calories": ${calories},
  "protein_g": <integer>,
  "carbs_g": <integer>,
  "fat_g": <integer>,
  "rationale": "<2-3 sentences for the coach. Reference the goal, activity level, constraints. Do NOT mention the calorie calculation method.>"
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
    const parsed = JSON.parse(jsonMatch[0])
    // Defensive: force the calorie field to our calculation regardless
    // of what the LLM produced. The macro grams are still the LLM's call,
    // but the headline number is ours.
    parsed.calories = calories
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from AI', raw: text }, { status: 500 })
  }
}
