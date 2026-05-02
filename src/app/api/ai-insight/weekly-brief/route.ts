import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'

// =================================================================
// Weekly Brief — proactive Monday-morning summary per client (F3).
//
// Aggregates last 7 days from check-ins, workouts, nutrition, habits,
// and PRs into deterministic numbers, then has Sonnet 4 frame the
// summary + 3 prescriptions for the coach to take into next week.
//
// Same suggest-macros philosophy: server does math, LLM does prose.
// Cached in ai_insights (one row per client per week-start), so the
// brain-icon modal and the insights page surface it for free.
//
// MVP: manual button trigger from coach client detail. Cron + inbox
// integration are follow-ups (F3b).
// =================================================================

const localYmd = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Delta classifier. Lets the LLM reference "improving" / "declining"
// without re-doing the comparison itself.
function trend(curr: number | null, prev: number | null): string {
  if (curr === null || prev === null) return 'n/a'
  const diff = curr - prev
  if (Math.abs(diff) < 0.3) return 'flat'
  return diff > 0 ? `up ${diff.toFixed(1)}` : `down ${Math.abs(diff).toFixed(1)}`
}

const avg = (rows: Array<Record<string, any>>, key: string): number | null => {
  const vals = rows.map(r => r?.[key]).filter(v => typeof v === 'number' && !isNaN(v)) as number[]
  if (vals.length === 0) return null
  return Number((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(1))
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
    .from('clients').select('id, coach_id, display_name, profile:profiles!profile_id(full_name)').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }
  const clientName = (client as any).profile?.full_name || (client as any).display_name || 'Client'

  // Two windows: last 7 days (current) and the 7 days before that (prior)
  const today = new Date()
  const currStart = new Date(today); currStart.setDate(today.getDate() - 6)
  const prevEnd   = new Date(currStart); prevEnd.setDate(currStart.getDate() - 1)
  const prevStart = new Date(prevEnd);   prevStart.setDate(prevEnd.getDate() - 6)

  const currStartYmd = localYmd(currStart)
  const currEndYmd   = localYmd(today)
  const prevStartYmd = localYmd(prevStart)
  const prevEndYmd   = localYmd(prevEnd)

  // ── Pull all aggregates in parallel ─────────────────────────────────
  const [
    { data: checkinsCurr },
    { data: checkinsPrev },
    { data: sessionsCurr },
    { data: nutCurr },
    { data: habitLogsCurr },
    { data: habits },
    { data: prsCurr },
  ] = await Promise.all([
    supabase.from('daily_checkins')
      .select('checkin_date, stress_score, mood_score, energy_score, sleep_quality, body, mood_emoji')
      .eq('client_id', clientId).gte('checkin_date', currStartYmd).lte('checkin_date', currEndYmd),
    supabase.from('daily_checkins')
      .select('stress_score, mood_score, energy_score, sleep_quality')
      .eq('client_id', clientId).gte('checkin_date', prevStartYmd).lte('checkin_date', prevEndYmd),
    supabase.from('workout_sessions')
      .select('id, status, completed_at, scheduled_date, session_rpe, overall_rpe, energy_level, title, notes_client, mood')
      .eq('client_id', clientId).gte('scheduled_date', currStartYmd).lte('scheduled_date', currEndYmd),
    supabase.from('nutrition_daily_logs')
      .select('log_date, total_calories, total_protein, water_oz')
      .eq('client_id', clientId).gte('log_date', currStartYmd).lte('log_date', currEndYmd),
    supabase.from('habit_logs')
      .select('habit_id, logged_date, value, completed')
      .eq('client_id', clientId).gte('logged_date', currStartYmd).lte('logged_date', currEndYmd),
    supabase.from('habits')
      .select('id, label, target, frequency').eq('client_id', clientId).eq('active', true),
    supabase.from('personal_records')
      .select('weight_pr, rep_pr_reps, rep_pr_weight, pr_type, logged_date, exercise:exercises(name)')
      .eq('client_id', clientId).gte('logged_date', currStartYmd).lte('logged_date', currEndYmd)
      .order('logged_date', { ascending: false }),
  ])

  // ── Deterministic stats ─────────────────────────────────────────────
  const checkinsCurrSafe = checkinsCurr || []
  const checkinsPrevSafe = checkinsPrev || []
  const sessionsCurrSafe = sessionsCurr || []
  const nutCurrSafe = nutCurr || []
  const habitLogsCurrSafe = habitLogsCurr || []
  const habitsSafe = habits || []
  const prsCurrSafe = prsCurr || []

  const stats = {
    week_start: currStartYmd,
    week_end:   currEndYmd,
    checkins_logged: checkinsCurrSafe.length,
    avg_stress:   avg(checkinsCurrSafe, 'stress_score'),
    avg_mood:     avg(checkinsCurrSafe, 'mood_score'),
    avg_energy:   avg(checkinsCurrSafe, 'energy_score'),
    avg_sleep:    avg(checkinsCurrSafe, 'sleep_quality'),
    trend: {
      stress: trend(avg(checkinsCurrSafe, 'stress_score'), avg(checkinsPrevSafe, 'stress_score')),
      mood:   trend(avg(checkinsCurrSafe, 'mood_score'),   avg(checkinsPrevSafe, 'mood_score')),
      energy: trend(avg(checkinsCurrSafe, 'energy_score'), avg(checkinsPrevSafe, 'energy_score')),
      sleep:  trend(avg(checkinsCurrSafe, 'sleep_quality'),avg(checkinsPrevSafe, 'sleep_quality')),
    },
    sessions: {
      assigned:   sessionsCurrSafe.filter(s => ['assigned','active','completed'].includes(s.status || '')).length,
      completed:  sessionsCurrSafe.filter(s => s.status === 'completed' || s.completed_at).length,
      avg_session_rpe: avg(sessionsCurrSafe.filter(s => s.completed_at), 'session_rpe'),
      avg_overall_rpe: avg(sessionsCurrSafe.filter(s => s.completed_at), 'overall_rpe'),
    },
    nutrition: {
      days_logged: nutCurrSafe.filter(n => (n.total_calories || 0) > 0).length,
      avg_calories: avg(nutCurrSafe, 'total_calories'),
      avg_protein:  avg(nutCurrSafe, 'total_protein'),
    },
    habits: habitsSafe.map(h => {
      const logs = habitLogsCurrSafe.filter(l => l.habit_id === h.id)
      const completedDays = logs.filter(l => l.completed).length
      return { label: h.label, target: h.target, days_hit: completedDays, days_logged: logs.length }
    }),
    prs: prsCurrSafe.map(pr => ({
      exercise: (pr as any).exercise?.name || '?',
      type: pr.pr_type,
      weight: pr.weight_pr,
      rep_weight: pr.rep_pr_weight,
      rep_count: pr.rep_pr_reps,
      date: pr.logged_date,
    })),
  }

  // Recent free-text from check-ins — flavor for the LLM
  const checkinNotes = checkinsCurrSafe
    .filter(c => c.body)
    .slice(0, 5)
    .map(c => `${c.checkin_date}${c.mood_emoji ? ' ' + c.mood_emoji : ''}: ${(c.body as string).slice(0, 200)}`)
    .join('\n')

  const prompt = `You are a head coach prepping a 1:1 brief for a junior coach who runs ${clientName}'s
day-to-day. Write a tight, opinionated weekly brief based on the data below. Be specific
and prescriptive — assume the reader will translate this into Monday's session and the
week's nudges. Don't pad. Don't soften.

CLIENT: ${clientName}
WEEK: ${currStartYmd} → ${currEndYmd}

CHECK-IN PULSE (week avg of 1-10 scores; lower stress = better):
- Stress:   ${stats.avg_stress ?? 'n/a'}  (vs prior week: ${stats.trend.stress})
- Mood:     ${stats.avg_mood   ?? 'n/a'}  (trend: ${stats.trend.mood})
- Energy:   ${stats.avg_energy ?? 'n/a'}  (trend: ${stats.trend.energy})
- Sleep:    ${stats.avg_sleep  ?? 'n/a'}  (trend: ${stats.trend.sleep})
- Logged:   ${stats.checkins_logged} of 7 days
${checkinNotes ? `\nCHECK-IN NOTES (recent):\n${checkinNotes}\n` : ''}
TRAINING:
- Assigned sessions: ${stats.sessions.assigned}
- Completed: ${stats.sessions.completed}
- Avg session RPE: ${stats.sessions.avg_session_rpe ?? 'n/a'}
- Avg overall RPE: ${stats.sessions.avg_overall_rpe ?? 'n/a'}
${stats.prs.length > 0 ? `- New PRs: ${stats.prs.map(p => `${p.exercise} (${p.type})`).join(', ')}` : '- New PRs: none'}

NUTRITION:
- Days logged: ${stats.nutrition.days_logged} of 7
- Avg calories: ${stats.nutrition.avg_calories ?? 'n/a'} kcal
- Avg protein:  ${stats.nutrition.avg_protein ?? 'n/a'} g

HABITS (active):
${stats.habits.length === 0 ? '(none configured)' : stats.habits.map(h => `- ${h.label}: ${h.days_hit}/${h.days_logged} days hit (target ${h.target ?? '?'})`).join('\n')}

Respond ONLY with this JSON, no other text:
{
  "title": "${clientName} — week of ${currStartYmd}",
  "summary": "<2-3 sentences. Plain English, plain spoken. Reference specific numbers.>",
  "highlights": [
    "<positive thing 1 — be specific>",
    "<positive thing 2>"
  ],
  "concerns": [
    "<concern 1 — concrete pattern, not vibes>",
    "<concern 2 if relevant>"
  ],
  "prescriptions": [
    "<actionable prescription for the coach to apply next week — name the lever>",
    "<prescription 2>",
    "<prescription 3>"
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
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[weekly-brief] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[weekly-brief] parse failed stop=${data?.stop_reason} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }
  const parsed = result.data

  // Cache in ai_insights so the brain-icon modal + insights page pick
  // it up automatically. Dedupe per (client_id, type, week_start) so
  // re-running same week replaces, not stacks.
  const dedupeKey = `weekly_brief:${clientId}:${currStartYmd}`
  const insightRow = {
    coach_id: user.id,
    client_id: clientId,
    type: 'weekly_brief',
    category: 'weekly_brief',
    flag_level: 'normal',
    severity: 'low',
    content: parsed,
    source_data: { stats },
    dedupe_key: dedupeKey,
    action_status: 'active',
    surfaced_count: 0,
    is_dismissed: false,
    is_reviewed: false,
    is_saved: false,
    generated_at: new Date().toISOString(),
  }

  // Try update first, insert if no row matched. Avoids needing a DB
  // unique constraint on dedupe_key (which we'd need a migration for).
  const { data: existing } = await supabase
    .from('ai_insights')
    .select('id')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle()

  if (existing?.id) {
    await supabase.from('ai_insights').update(insightRow).eq('id', existing.id)
  } else {
    await supabase.from('ai_insights').insert(insightRow)
  }

  return NextResponse.json({
    ...parsed,
    stats,
    week_start: currStartYmd,
    week_end: currEndYmd,
  })
}
