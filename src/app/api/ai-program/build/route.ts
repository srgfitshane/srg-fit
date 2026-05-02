import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'

// =================================================================
// AI Program Builder (F2a, Phase 1) — coach-only.
//
// Builds a periodized strength/hypertrophy/sport program from a
// client's intake + recent PRs. Phase 1 returns the JSON proposal
// for the coach to review; Phase 2 will materialize it into
// programs/workout_blocks/session_exercises rows.
//
// System prompt establishes Sonnet 4 as a credentialed S&C coach
// with depth in NASM CES (corrective exercise), PRI (postural
// restoration), kinesiology + biomechanics, and sport-specific
// periodization. The plan asks for cited principles where
// applicable (e.g. "scapular upward rotation deficit → serratus
// activation").
//
// We do NOT pass the full 1,163-exercise library — too many tokens.
// The LLM proposes exercises by name; Phase 2 will resolve names
// to exercises.id at save time. Phase 1 just renders.
// =================================================================

const FOCUS_OPTIONS = ['strength', 'hypertrophy', 'fat_loss', 'mobility', 'sport_specific'] as const
type Focus = typeof FOCUS_OPTIONS[number]

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const body = await req.json()
  const {
    clientId,
    duration_weeks = 4,           // 4 / 8 / 12
    days_per_week  = 3,           // 2-6
    focus          = 'hypertrophy' as Focus,
    sport          = '',
    special_constraints = '',
  } = body || {}

  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (![4, 8, 12].includes(Number(duration_weeks))) {
    return NextResponse.json({ error: 'duration_weeks must be 4, 8, or 12' }, { status: 400 })
  }
  if (Number(days_per_week) < 2 || Number(days_per_week) > 6) {
    return NextResponse.json({ error: 'days_per_week must be 2-6' }, { status: 400 })
  }
  if (!FOCUS_OPTIONS.includes(focus)) {
    return NextResponse.json({ error: 'focus must be one of: ' + FOCUS_OPTIONS.join(', ') }, { status: 400 })
  }

  // Coach ownership gate
  const { data: client } = await supabase
    .from('clients').select('id, coach_id, display_name, profile:profiles!profile_id(full_name)').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }
  const clientName = (client as any).profile?.full_name || (client as any).display_name || 'the client'

  // Intake — primary context source
  const { data: intake } = await supabase
    .from('client_intake_profiles')
    .select('date_of_birth, gender, height_inches, current_weight_lbs, training_experience, training_frequency, equipment_access, injuries_limitations, past_injuries, recent_surgeries, medical_conditions, primary_goal, secondary_goal, motivation_why, biggest_obstacle, activity_level, preferred_days')
    .eq('client_id', clientId).single()

  if (!intake) {
    return NextResponse.json({ error: 'No intake profile found. Have the client complete intake first.' }, { status: 400 })
  }

  // Latest weight (prefer metrics, fall back to intake)
  const { data: latestMetric } = await supabase
    .from('metrics')
    .select('weight').eq('client_id', clientId).not('weight', 'is', null)
    .order('logged_date', { ascending: false }).limit(1).maybeSingle()
  const weightLbs = Number(latestMetric?.weight) || Number(intake.current_weight_lbs) || null

  // Recent PRs — sets baseline loads. Top 8 by date.
  const { data: prs } = await supabase
    .from('personal_records')
    .select('weight_pr, rep_pr_reps, rep_pr_weight, pr_type, logged_date, exercise:exercises(name)')
    .eq('client_id', clientId).order('logged_date', { ascending: false }).limit(8)

  const prLines = (prs || [])
    .map(p => {
      const name = (p as any).exercise?.name || '?'
      if (p.pr_type === 'weight' && p.weight_pr) return `- ${name}: ${p.weight_pr} lbs (heaviest)`
      if (p.pr_type === 'reps' && p.rep_pr_weight && p.rep_pr_reps) return `- ${name}: ${p.rep_pr_weight} lbs × ${p.rep_pr_reps} reps`
      return null
    })
    .filter(Boolean)
    .join('\n')

  const ageNote = intake.date_of_birth ? ` (DOB ${intake.date_of_birth})` : ''
  const equipment = Array.isArray(intake.equipment_access) ? intake.equipment_access.join(', ') : 'standard gym'
  const focusLabel = focus.replace('_', ' ')
  const sportLine = focus === 'sport_specific' && sport ? `\nSPORT: ${sport}` : ''

  const systemPrompt = `You are an elite strength & conditioning coach with deep credentials and active practice in:
- NASM Corrective Exercise Specialist (CES) — movement screen, regional interdependence, exercise progressions
- Postural Restoration Institute (PRI) — breathing patterns, asymmetry, neuromuscular reset
- Kinesiology and applied biomechanics — joint actions, force-vector matching, tempo prescription
- Periodization for strength, hypertrophy, fat-loss, mobility, and sport-specific (powerlifting, strongman, endurance, team sports, tactical)

You write programs for the coach who will supervise the athlete in person — not the athlete. Be direct, prescriptive, and specific. When you program a corrective or specialty movement, name the principle in one phrase (e.g. "scapular upward rotation deficit → serratus activation", "anterior pelvic tilt → posterior chain bias"). When you choose loading or progression, name the rationale (e.g. "RPE 7 to leave PR attempts for week 4 retest").

Hard rules:
- Respect injuries and surgeries. If unsure of severity, choose the regression.
- Match equipment access. Don't program a barbell back squat for someone who has dumbbells only.
- Keep exercise names common and recognizable (use names a typical S&C library would carry — barbell back squat, romanian deadlift, dumbbell bench press, banded face pull, etc). The coach's library will resolve them later.
- Output ONLY valid JSON. No commentary outside the JSON.`

  const userPrompt = `Build a ${duration_weeks}-week program for ${clientName}${ageNote}.

ATHLETE PROFILE:
- Gender: ${intake.gender || 'not specified'}
- Height: ${intake.height_inches ? intake.height_inches + ' inches' : 'not specified'}
- Weight: ${weightLbs ? weightLbs + ' lbs' : 'not specified'}
- Training experience: ${intake.training_experience || 'not specified'}
- Current frequency: ${intake.training_frequency ? intake.training_frequency + ' days/week' : 'not specified'}
- Activity level: ${intake.activity_level || 'not specified'}

GOALS:
- Primary: ${intake.primary_goal || 'general fitness'}
- Secondary: ${intake.secondary_goal || 'none'}
- Motivation: ${intake.motivation_why || 'not specified'}
- Obstacle: ${intake.biggest_obstacle || 'not specified'}

INJURIES / MEDICAL:
- Current limitations: ${intake.injuries_limitations || 'none'}
- Past injuries: ${intake.past_injuries || 'none'}
- Recent surgeries: ${intake.recent_surgeries || 'none'}
- Medical conditions: ${intake.medical_conditions || 'none'}

EQUIPMENT: ${equipment}

RECENT PRS (use to anchor starting loads):
${prLines || '(no PR history yet — start conservatively, plan a Week 1 retest if appropriate)'}

PROGRAM SPEC:
- Duration: ${duration_weeks} weeks
- Days/week: ${days_per_week}
- Focus: ${focusLabel}${sportLine}
${special_constraints ? `- Special constraints from coach: ${special_constraints}` : ''}

Periodization expectation:
- ${duration_weeks === 4 ? 'Single block, no deload (too short).' : duration_weeks === 8 ? '2 mesocycles, deload at week 4, retest week 8.' : '3 mesocycles, deload weeks 4 and 8, retest week 12.'}
- Auto-regulate via RPE/RIR — do NOT lock to fixed %1RM unless we have a tested 1RM.
- Volume should progress weekly within a mesocycle, then drop on deload.

Respond with this exact JSON shape (no extra fields, no commentary):
{
  "name": "<short program name, e.g. '${clientName} 8wk Hypertrophy Block'>",
  "rationale": "<2-3 paragraphs for the coach. Cover: how this matches the athlete's experience, goals, and injuries; the periodization arc; and the 2-3 most important programming choices and why.>",
  "weekly_split": "<one-line description of the split, e.g. 'Push / Pull / Lower x2 with 1 conditioning day'>",
  "weeks": [
    {
      "week": 1,
      "phase": "<accumulation | intensification | realization | deload | retest>",
      "focus": "<short phrase>",
      "deload": false,
      "days": [
        {
          "day": "<Mon | Tue | Wed | Thu | Fri | Sat | Sun — pick days that fit days_per_week and any preferred_days hint>",
          "label": "<short label, e.g. 'Lower A — squat focus'>",
          "estimated_minutes": <int>,
          "exercises": [
            {
              "name": "<common exercise name>",
              "category": "<warmup | corrective | main | accessory | conditioning | cooldown>",
              "sets": <int>,
              "reps": "<string, e.g. '8-10' or '5x3' or '30s'>",
              "load_guidance": "<string, e.g. 'RPE 7' or '70% est-1RM' or 'bodyweight + 25 lbs'>",
              "rest_seconds": <int>,
              "tempo": "<optional string, e.g. '3-1-1-0' or null>",
              "rationale": "<one-line why this exercise here, citing principle if corrective>"
            }
          ]
        }
      ]
    }
  ],
  "coach_notes": "<2-4 bullets the coach should keep in mind across the block (cues, progression rules, retest protocol, autoregulation triggers).>"
}

Make the weeks array exactly ${duration_weeks} entries. Each day should have 4-8 exercises depending on focus and time budget.`

  const startedAt = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      // Sonnet 4 supports up to 64k output tokens. A 12-week × 4-day × 7-ex
      // program lands around ~30-40k tokens of structured JSON, so we
      // size accordingly. The previous 8000 cap truncated mid-JSON for
      // anything past a 4-week / 3-day plan and produced "Invalid JSON
      // from AI" errors with no actionable message.
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!res.ok) {
    console.error('[ai-program/build] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[ai-program/build] parse failed stop=${data?.stop_reason} usage=${JSON.stringify(data?.usage || {})} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }
  const parsed = result.data

  // Cost log so we can monitor spend during early dogfooding
  const elapsedMs = Date.now() - startedAt
  console.log(`[ai-program/build] ok client=${clientId} weeks=${duration_weeks} days=${days_per_week} focus=${focus} ms=${elapsedMs} stop=${data?.stop_reason} usage=${JSON.stringify(data?.usage || {})}`)

  return NextResponse.json({
    ...parsed,
    meta: {
      duration_weeks,
      days_per_week,
      focus,
      sport: focus === 'sport_specific' ? sport : null,
      generated_at: new Date().toISOString(),
      usage: data?.usage,
    },
  })
}
