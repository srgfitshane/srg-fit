import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// =================================================================
// 7-day nutrition adherence audit. Coach-only.
//
// Pattern follows suggest-macros: the numeric work is deterministic
// server-side (daily totals, deltas vs target, adherence %). The LLM
// only writes prose: a 1-paragraph weekly read, top patterns, and
// 3 prescriptions for next week.
//
// Why not let the LLM crunch the numbers? Sonnet drifts on arithmetic
// over 100+ rows of food entries — totals end up off by 80-200 kcal.
// We compute, it interprets.
// =================================================================

type DayTotals = {
  date: string                 // YYYY-MM-DD
  logged: boolean              // any entries that day?
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  meals: number                // entry count, useful texture for the LLM
}

type Target = {
  calories_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number | null
}

const localYmd = (d: Date) => {
  // Local-tz YYYY-MM-DD per Rule 7 (toISOString shifts to UTC and
  // breaks on the wrong side of midnight). Coach lives in same tz as
  // server here — fine for week boundaries.
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  // Coach ownership gate
  const { data: client } = await supabase
    .from('clients').select('id, coach_id').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  // Active plan = our target. Without one we can still produce a
  // descriptive summary but no adherence %.
  const { data: plan } = await supabase
    .from('nutrition_plans')
    .select('calories_target, protein_g, carbs_g, fat_g, fiber_g, approach')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .maybeSingle()

  // 7-day window ending today (local), inclusive
  const today = new Date()
  const start = new Date(today)
  start.setDate(start.getDate() - 6)
  const startYmd = localYmd(start)
  const endYmd   = localYmd(today)

  // Pull all food entries in window. logged_at is timestamptz; cast to
  // local date in JS (Postgres date_trunc would tie us to UTC).
  const { data: entries, error: entriesErr } = await supabase
    .from('food_entries')
    .select('logged_at, calories, protein_g, carbs_g, fat_g, fiber_g')
    .eq('client_id', clientId)
    .gte('logged_at', `${startYmd}T00:00:00`)
    .lte('logged_at', `${endYmd}T23:59:59`)

  if (entriesErr) {
    console.error('[critique-week] entries error:', entriesErr.message)
    return NextResponse.json({ error: 'Could not load food entries' }, { status: 500 })
  }

  // Bucket per local-tz day
  const byDay = new Map<string, DayTotals>()
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    const ymd = localYmd(d)
    byDay.set(ymd, { date: ymd, logged: false, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, meals: 0 })
  }
  for (const e of entries || []) {
    const ymd = localYmd(new Date(e.logged_at))
    const slot = byDay.get(ymd)
    if (!slot) continue
    slot.logged = true
    slot.calories  += Number(e.calories  || 0)
    slot.protein_g += Number(e.protein_g || 0)
    slot.carbs_g   += Number(e.carbs_g   || 0)
    slot.fat_g     += Number(e.fat_g     || 0)
    slot.fiber_g   += Number(e.fiber_g   || 0)
    slot.meals     += 1
  }
  const days = Array.from(byDay.values())
  const loggedDays = days.filter(d => d.logged)

  // If the client logged nothing this week, no point asking AI to
  // riff. Bail with a useful message.
  if (loggedDays.length === 0) {
    return NextResponse.json({
      summary: 'No food entries logged in the last 7 days.',
      patterns: ['Client did not log nutrition this week.'],
      prescriptions: [
        'Reach out to confirm the food log is the right tool for this client.',
        'If they prefer photo-only, switch to that workflow and lower the bar.',
        'If logging adoption is the issue, set a 3-day micro-goal first.',
      ],
      stats: { logged_days: 0, target_days: 7, adherence_pct: 0, days },
      has_plan: !!plan,
    })
  }

  // Adherence math (deterministic). With a plan we can quantify; without
  // we just compute averages and let the LLM frame qualitatively.
  const target: Target | null = plan ? {
    calories_target: plan.calories_target ?? 0,
    protein_g:       plan.protein_g       ?? 0,
    carbs_g:         plan.carbs_g         ?? 0,
    fat_g:           plan.fat_g           ?? 0,
    fiber_g:         plan.fiber_g,
  } : null

  // "Hit" = within ±10% of target
  const within10 = (val: number, tgt: number) => tgt > 0 && Math.abs(val - tgt) / tgt <= 0.10
  const calHits      = target ? loggedDays.filter(d => within10(d.calories,  target.calories_target)).length : 0
  const proteinHits  = target ? loggedDays.filter(d => within10(d.protein_g, target.protein_g)).length       : 0
  const carbsHits    = target ? loggedDays.filter(d => within10(d.carbs_g,   target.carbs_g)).length         : 0
  const fatHits      = target ? loggedDays.filter(d => within10(d.fat_g,     target.fat_g)).length           : 0

  const avg = (key: keyof DayTotals) => {
    if (loggedDays.length === 0) return 0
    return Math.round(loggedDays.reduce((s, d) => s + (d[key] as number), 0) / loggedDays.length)
  }
  const averages = {
    calories:  avg('calories'),
    protein_g: avg('protein_g'),
    carbs_g:   avg('carbs_g'),
    fat_g:     avg('fat_g'),
    fiber_g:   avg('fiber_g'),
  }
  const adherence_pct = Math.round((loggedDays.length / 7) * 100)

  // Render the daily breakdown as a compact table the LLM can scan
  const dayRows = days.map(d => {
    if (!d.logged) return `${d.date}: (no log)`
    const dayName = new Date(d.date).toLocaleDateString('en-US', { weekday: 'short' })
    return `${d.date} ${dayName}: ${d.meals}x meals, ${Math.round(d.calories)} kcal | ${Math.round(d.protein_g)}P / ${Math.round(d.carbs_g)}C / ${Math.round(d.fat_g)}F`
  }).join('\n')

  const targetBlock = target ? `
TARGETS (active nutrition plan):
- Calories: ${target.calories_target} kcal
- Protein: ${target.protein_g}g
- Carbs: ${target.carbs_g}g
- Fat: ${target.fat_g}g
${target.fiber_g ? `- Fiber: ${target.fiber_g}g` : ''}
- Approach: ${plan?.approach || 'standard'}

DAILY HIT RATE (within +/-10% of target, on ${loggedDays.length} logged days of 7):
- Calories: ${calHits}/${loggedDays.length}
- Protein:  ${proteinHits}/${loggedDays.length}
- Carbs:    ${carbsHits}/${loggedDays.length}
- Fat:      ${fatHits}/${loggedDays.length}
` : `
TARGETS: No active nutrition plan on file. Frame the critique
qualitatively (consistency, balance, fiber) rather than vs targets.
`

  const prompt = `You are a nutrition coach reviewing one week of food logs for a coach
(not the client). Be direct, specific, and prescriptive — you're talking to a
trainer who will translate this into action.

WEEK WINDOW: ${startYmd} to ${endYmd}
LOGGED DAYS: ${loggedDays.length} of 7 (${adherence_pct}% logging adherence)

DAILY AVERAGES (across logged days only):
- Calories: ${averages.calories} kcal
- Protein:  ${averages.protein_g}g
- Carbs:    ${averages.carbs_g}g
- Fat:      ${averages.fat_g}g
- Fiber:    ${averages.fiber_g}g
${targetBlock}
DAILY BREAKDOWN:
${dayRows}

Respond ONLY with a JSON object, no other text:
{
  "summary": "<2-3 sentences. The week at a glance, plain English. Reference specific days when relevant.>",
  "patterns": [
    "<observation 1 — concrete pattern, not generic. e.g. 'Protein hits target Mon-Thu but drops 30g on weekends.'>",
    "<observation 2>"
  ],
  "prescriptions": [
    "<actionable thing the coach should prescribe / discuss next week>",
    "<actionable thing 2>",
    "<actionable thing 3>"
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
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[critique-week] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return NextResponse.json({ error: 'Invalid AI response', raw: text }, { status: 500 })

  let parsed
  try {
    parsed = JSON.parse(match[0])
  } catch {
    return NextResponse.json({ error: 'Invalid JSON from AI', raw: text }, { status: 500 })
  }

  return NextResponse.json({
    ...parsed,
    stats: {
      logged_days: loggedDays.length,
      target_days: 7,
      adherence_pct,
      averages,
      hits: target ? { calories: calHits, protein: proteinHits, carbs: carbsHits, fat: fatHits } : null,
      days,
    },
    has_plan: !!plan,
    week_start: startYmd,
    week_end: endYmd,
  })
}
