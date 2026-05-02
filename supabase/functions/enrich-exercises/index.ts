// =============================================================================
// enrich-exercises (Supabase Edge Function)
//
// Walks the exercises table 40 rows at a time and asks Claude Sonnet 4 to
// clean each row's name + muscles + movement_pattern + equipment + description.
// Validated against strict allow-lists before write — Claude proposals that
// drift outside the lists are silently skipped (counted in the response).
//
// Triggered from /dashboard/coach/admin/enrich. Coach hits "Start
// Enrichment", the page loops through batches calling this function with
// { batch: N }. Function returns { done, updated, skipped, totalBatches }.
//
// IMPORTANT: deployed with verify_jwt=false because we authenticate with
// the service-role client and validate the JWT ourselves (line below), so
// we can also enforce the coach-only role gate in the same step.
//
// 2026-05-03 — added "Abs" and "Deep Core" to ALLOWED_MUSCLES so the
// midsection bucket can be split out of "Core". Sharpened the prompt with
// rules for when to use Abs vs Deep Core vs Obliques vs Core so Claude
// stops dumping everything into Core.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': 'https://srgfit.app',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

const ALLOWED_MUSCLES = [
  'Abductors','Abs','Adductors','Back','Biceps','Calves','Cardio','Chest',
  'Core','Deep Core','Forearms','Full Body','Glutes','Hamstrings','Hip Flexors',
  'Lats','Legs','Lower Back','Obliques','Quads','Rear Delts','Shoulders','Traps','Triceps'
]
const ALLOWED_MOVEMENT = ['carry','core','hinge','isolation','pull','push','squat','stretch','yoga','general']
const ALLOWED_EQUIPMENT = [
  'barbell','bodyweight','cable','dumbbell','ez bar','kettlebell',
  'machine','mat','pull-up bar','resistance band','smith machine','trap bar'
]

function validate(r: any): boolean {
  if (!r.id || !r.name) return false
  if (!Array.isArray(r.muscles) || r.muscles.length === 0) return false
  if (!ALLOWED_MOVEMENT.includes(r.movement_pattern)) return false
  if (!ALLOWED_EQUIPMENT.includes(r.equipment)) return false
  for (const m of r.muscles) { if (!ALLOWED_MUSCLES.includes(m)) return false }
  return true
}

function buildPrompt(batch: any[]): string {
  const list = batch.map((e, i) =>
    `${i+1}. ID: ${e.id}\n   Name: ${e.name}\n   Current muscles: ${JSON.stringify(e.muscles)}\n   Current movement: ${e.movement_pattern}\n   Current equipment: ${e.equipment}`
  ).join('\n\n')
  return `You are a professional strength and conditioning coach and exercise taxonomist. Clean up this exercise database.

STRICT RULES:
- name: Title Case, fix typos, keep equipment suffix style (e.g. "Bicep Curl - Dumbbell")
- muscles: Array using ONLY these values: ${ALLOWED_MUSCLES.join(', ')}. Be specific, 1-4 muscles max.

  Midsection disambiguation — pick the most specific bucket; do NOT default to "Core":
    • Abs = rectus abdominis flexion. Crunches, sit-ups, leg raises, hollow holds, V-ups, knee tucks, toes-to-bar, ab wheel roll-outs.
    • Deep Core = anti-extension / anti-rotation / anti-lateral-flexion / breath-driven stability. Planks (front, side, RKC), dead bugs, bird dogs, pallof press, stir-the-pot, suitcase holds, 90/90 breathing.
    • Obliques = rotation or side-flexion specific. Russian twists, side bends, woodchops, cable rotations, side plank with reach, windshield wipers.
    • Core = reserve for TRUE full-midsection compounds where multiple core groups fire equally — loaded carries with rotation, Turkish get-up, complex multi-plane work, sandbag/odd-object lifts. Do NOT use Core as a catch-all.

  Other rules:
    • Avoid "Full Body" unless the movement actually trains nearly every region (burpee, clean and press, manmaker).
    • Avoid "Legs" when "Quads", "Hamstrings", or "Glutes" applies more accurately.
    • Use "Lats" for vertical pulls and lat-isolation; use "Back" for horizontal/rowing patterns where mid-back fires more than lats.
    • Pair primary movers in muscles[]. Use Abs + Hip Flexors together for hanging leg raises; Glutes + Hamstrings for hip extension; Chest + Triceps for press.

- movement_pattern: MUST be one of: ${ALLOWED_MOVEMENT.join(', ')}. Use "isolation" for single-joint moves (curls, extensions, raises). Use "hinge" for deadlifts/hip thrusts/RDLs. Use "general" for cardio/plyometrics/boxing only.
- equipment: MUST be one of: ${ALLOWED_EQUIPMENT.join(', ')}. Landmine = barbell. Band = resistance band. Yoga/stretch with no equipment = mat.
- description: One sentence max 20 words describing the movement mechanics.

Return ONLY a valid JSON array, no markdown, no backticks.
Format: [{"id":"...","name":"...","muscles":["..."],"movement_pattern":"...","equipment":"...","description":"..."}]

EXERCISES:

${list}`
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })

    const adminDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Verify coach using service role to validate the JWT directly
    const { data: { user }, error: userErr } = await adminDb.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: CORS })
    const { data: profile } = await adminDb.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'coach') return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: CORS })

    const body = await req.json().catch(() => ({}))
    const batchIndex: number = body.batch ?? 0
    const batchSize = 40

    const { data: exercises, error: fetchErr } = await adminDb
      .from('exercises')
      .select('id, name, muscles, movement_pattern, equipment, description')
      .order('name')
      .range(batchIndex * batchSize, (batchIndex + 1) * batchSize - 1)

    if (fetchErr) throw fetchErr
    if (!exercises || exercises.length === 0) {
      return new Response(JSON.stringify({ done: true, updated: 0, skipped: 0 }), { headers: CORS })
    }

    const { count } = await adminDb.from('exercises').select('id', { count: 'exact', head: true })
    const totalBatches = Math.ceil((count ?? 0) / batchSize)

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: buildPrompt(exercises) }],
      })
    })

    const claudeData = await claudeRes.json()
    const text: string = claudeData.content?.[0]?.text ?? ''
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()
    const results = JSON.parse(clean)
    if (!Array.isArray(results)) throw new Error('Claude returned non-array')

    let updated = 0, skipped = 0
    for (const r of results) {
      if (!validate(r)) { skipped++; continue }
      const { error } = await adminDb.from('exercises').update({
        name: r.name,
        muscles: r.muscles,
        movement_pattern: r.movement_pattern,
        equipment: r.equipment,
        description: r.description || null,
      }).eq('id', r.id)
      if (error) { skipped++ } else { updated++ }
    }

    return new Response(JSON.stringify({
      done: batchIndex + 1 >= totalBatches,
      batch: batchIndex,
      totalBatches,
      exercisesInBatch: exercises.length,
      updated,
      skipped,
    }), { headers: CORS })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS })
  }
})
