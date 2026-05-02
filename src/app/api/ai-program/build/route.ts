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

const FOCUS_OPTIONS = [
  'strength',
  'hypertrophy',
  'fat_loss',
  'recomp',          // body recomposition: simultaneous fat loss + lean mass
  'endurance',       // aerobic capacity: running, cycling, rowing, conditioning
  'general_fitness', // balanced beginner default — strength + cardio + mobility
  'mobility',
  'sport_specific',
] as const
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

  // ── Training history context ────────────────────────────────────────
  // Previously the build was a cold-start: same intake + PRs every time,
  // so a follow-on program for a client who'd just done 4 weeks of upper/
  // lower would be identical to a fresh start. This block pulls "what
  // they just did" so the AI can build a logical NEXT block — vary if
  // appropriate, repeat if appropriate. The coach owns the decision; we
  // just give the AI enough context to be smart instead of generic.
  const sixWeeksAgo = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [{ data: prs }, { data: lastProgram }, { data: recentSessions }, { data: recentCheckins }] = await Promise.all([
    supabase.from('personal_records')
      .select('weight_pr, rep_pr_reps, rep_pr_weight, pr_type, logged_date, exercise:exercises(name)')
      .eq('client_id', clientId).order('logged_date', { ascending: false }).limit(8),
    supabase.from('programs')
      .select('id, name, goal, duration_weeks, status, created_at, start_date')
      .eq('client_id', clientId).eq('is_template', false)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('workout_sessions')
      .select('status, scheduled_date, completed_at, session_rpe, overall_rpe, energy_level, mood')
      .eq('client_id', clientId).gte('scheduled_date', sixWeeksAgo)
      .order('scheduled_date', { ascending: false }),
    supabase.from('daily_checkins')
      .select('checkin_date, stress_score, mood_score, energy_score, sleep_quality')
      .eq('client_id', clientId).gte('checkin_date', twoWeeksAgo),
  ])

  const prLines = (prs || [])
    .map(p => {
      const name = (p as any).exercise?.name || '?'
      const recent = p.logged_date && p.logged_date >= sixWeeksAgo ? '  ← new this block' : ''
      if (p.pr_type === 'weight' && p.weight_pr) return `- ${name}: ${p.weight_pr} lbs (heaviest)${recent}`
      if (p.pr_type === 'reps' && p.rep_pr_weight && p.rep_pr_reps) return `- ${name}: ${p.rep_pr_weight} lbs × ${p.rep_pr_reps} reps${recent}`
      return null
    })
    .filter(Boolean)
    .join('\n')

  // Aggregate the previous block's movement-pattern volume so the AI sees
  // "what got hammered vs what was undertrained". Only pull blocks if a
  // prior program exists.
  let movementSummary = ''
  if (lastProgram?.id) {
    const { data: blockExercises } = await supabase
      .from('block_exercises')
      .select('sets, exercise:exercises(movement_pattern), block:workout_blocks!inner(program_id)')
      .eq('block.program_id', lastProgram.id)
    const setsByPattern: Record<string, number> = {}
    for (const be of blockExercises || []) {
      const pattern = (be as any).exercise?.movement_pattern || 'other'
      const sets = Number(be.sets) || 0
      setsByPattern[pattern] = (setsByPattern[pattern] || 0) + sets
    }
    const sorted = Object.entries(setsByPattern).sort((a, b) => b[1] - a[1])
    if (sorted.length > 0) {
      movementSummary = sorted.map(([k, v]) => `${k} ${v}`).join(' · ')
    }
  }

  // Compliance + RPE summary — last 6 weeks, completed sessions only
  const sessionsArr = recentSessions || []
  const completedSessions = sessionsArr.filter(s => s.completed_at)
  const totalScheduled = sessionsArr.filter(s => ['assigned','active','completed'].includes(s.status || '')).length
  const avgSessionRpe = (() => {
    const vals = completedSessions.map(s => Number(s.session_rpe)).filter(v => !isNaN(v) && v > 0)
    if (vals.length === 0) return null
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1))
  })()
  const avgOverallRpe = (() => {
    const vals = completedSessions.map(s => Number(s.overall_rpe)).filter(v => !isNaN(v) && v > 0)
    if (vals.length === 0) return null
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1))
  })()

  // Recent check-in pulse trend
  const checkinsArr = recentCheckins || []
  const avgPulse = (key: 'stress_score' | 'mood_score' | 'energy_score' | 'sleep_quality') => {
    const vals = checkinsArr.map(c => Number(c[key])).filter(v => !isNaN(v) && v > 0)
    if (vals.length === 0) return null
    return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1))
  }

  // Build the history block. Empty string when there's no prior program
  // AND no compliance/check-in data — first-time build stays as before.
  let trainingHistory = ''
  if (lastProgram || completedSessions.length > 0 || checkinsArr.length > 0) {
    const lines: string[] = ['', 'TRAINING HISTORY (last 4-6 weeks):']
    if (lastProgram) {
      const startedNote = lastProgram.start_date ? ` (started ${lastProgram.start_date})` : ''
      lines.push(`- Most recent program: "${lastProgram.name}" — ${lastProgram.duration_weeks || '?'} weeks, focus: ${lastProgram.goal || 'unspecified'}${startedNote}, status: ${lastProgram.status}`)
      if (movementSummary) lines.push(`- Block volume by pattern (sets across the block): ${movementSummary}`)
    } else {
      lines.push('- No prior program on file (first program for this client).')
    }
    if (totalScheduled > 0) {
      const pct = Math.round((completedSessions.length / totalScheduled) * 100)
      lines.push(`- Compliance: ${completedSessions.length}/${totalScheduled} sessions completed (${pct}%)`)
    }
    if (avgSessionRpe !== null) lines.push(`- Avg session RPE: ${avgSessionRpe}${avgOverallRpe !== null ? ` · avg overall RPE: ${avgOverallRpe}` : ''}`)

    const stress = avgPulse('stress_score'), mood = avgPulse('mood_score'), energy = avgPulse('energy_score'), sleep = avgPulse('sleep_quality')
    if (stress || mood || energy || sleep) {
      const parts: string[] = []
      if (stress !== null) parts.push(`stress ${stress}`)
      if (mood !== null) parts.push(`mood ${mood}`)
      if (energy !== null) parts.push(`energy ${energy}`)
      if (sleep !== null) parts.push(`sleep ${sleep}`)
      lines.push(`- Recent pulse (last 14 days, 1-10 each): ${parts.join(' · ')}`)
    }

    lines.push('')
    lines.push('PROGRESSION TARGET FOR THE NEW BLOCK:')
    lines.push('- This is a follow-on block. Use the history above to inform the build.')
    lines.push('- Whether to repeat, vary, or progress is a judgment call based on the athlete\'s stage:')
    lines.push('  • Returning client / restarting / general fitness → repeating familiar work is often correct.')
    lines.push('  • Mid-block trainee with stable RPE → progress loads or volume on the compounds that progressed.')
    lines.push('  • RPE drift high (avg ≥ 8) or compliance dropping → reduce stress, simplify, or program a deload.')
    lines.push('- If new PRs are flagged above, anchor the new block\'s starting loads off those, not the older PRs.')
    lines.push('- If a movement pattern was clearly hammered last block, you may vary it (e.g. back squat → front squat, conventional DL → trap bar) — but only if it serves the athlete\'s stage and goals.')
    trainingHistory = lines.join('\n')
  }

  const ageNote = intake.date_of_birth ? ` (DOB ${intake.date_of_birth})` : ''
  const equipment = Array.isArray(intake.equipment_access) ? intake.equipment_access.join(', ') : 'standard gym'
  const focusLabel = focus.replace('_', ' ')
  const sportLine = focus === 'sport_specific' && sport ? `\nSPORT: ${sport}` : ''

  const systemPrompt = `You are an elite strength & conditioning coach with deep credentials and active practice in:
- NASM Corrective Exercise Specialist (CES) — movement screen, regional interdependence, exercise progressions
- Postural Restoration Institute (PRI) — breathing patterns, asymmetry, neuromuscular reset
- Kinesiology and applied biomechanics — joint actions, force-vector matching, tempo prescription
- Periodization for strength, hypertrophy, fat-loss, recomposition, endurance, general fitness, mobility, and sport-specific (powerlifting, strongman, endurance racing, team sports, tactical)
- Recomp specifically: high-protein, moderate calorie deficit framing, prioritize compound lifts at RPE 7-8, minimize cardio interference. Endurance: zone 2 base + threshold + intervals, periodized across the block. General fitness: balanced — 50% strength, 30% conditioning, 20% mobility/skill — for clients who want "look good, feel good, move well" without a single bias.

You write programs for the coach who will supervise the athlete in person — not the athlete. Be direct, prescriptive, and specific. When you program a corrective or specialty movement, name the principle in one phrase (e.g. "scapular upward rotation deficit → serratus activation", "anterior pelvic tilt → posterior chain bias"). When you choose loading or progression, name the rationale (e.g. "RPE 7 to leave PR attempts for week 4 retest").

Hard rules:
- Respect injuries and surgeries. If unsure of severity, choose the regression.
- Match equipment access. Don't program a barbell back squat for someone who has dumbbells only.
- Exercise naming — IMPORTANT for library matching: the coach's library uses the format "Movement [Variation] - Equipment" with a hyphen separator. ALWAYS write exercise names in this format so the save step finds the match. Real examples from the library:
  • "Back Squat - Barbell"
  • "Front Squat - Barbell"
  • "Bench Press - Dumbbell"
  • "Bench Press - Barbell"
  • "Romanian Deadlift - Barbell"
  • "Conventional Deadlift - Barbell"
  • "Bent Over Row - Cable"
  • "Bent Over Row - Dumbbell"
  • "Bicep Curl - Dumbbell"
  • "Lateral Raise - Dumbbell"
  • "Hip Thrust - Barbell"
  • "Single Arm Row - Dumbbell"
  • "Bulgarian Split Squat - Dumbbell"
  • "Overhead Press - Barbell"
  • "Face Pull - Cable"
  Bodyweight or no-equipment moves drop the suffix: "Pull-up", "Push-up", "Plank", "Bird Dog". DO NOT write equipment first ("Dumbbell Bench Press") — the library indexes by movement-first.
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
${trainingHistory}

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
              "category": "<warmup | main | secondary | accessory | finisher | cooldown>",
              // Pick from the canonical list above. Treat correctives as
              // warmup, treat conditioning blocks as finisher. These
              // categories must match what the schedule step accepts.
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
