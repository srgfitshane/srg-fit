import { NextRequest, NextResponse } from 'next/server'
import { requireCoachApi } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'
import { enforceAiRateLimit } from '@/lib/ai-rate-limit'

// =================================================================
// AI message-draft (F4.2) -- coach-only.
//
// Coach clicks "Suggest reply" in the messages sidebar. Server pulls
// the client's recent training + adherence signals, combines them
// with the recent message thread the coach sends in the body, and
// asks Sonnet 4 for 2-3 short draft replies in the coach's voice.
//
// IMPORTANT: never auto-sends. Coach reviews + edits + presses send.
// Deterministic context numbers (workouts done, RPE drift, pulse
// averages) are computed server-side; the LLM only writes prose.
// =================================================================

type RecentMessage = { from: 'coach' | 'client'; body: string }

export async function POST(req: NextRequest) {
  const gate = await requireCoachApi()
  if ('error' in gate) return gate.error
  const { supabase, user } = gate

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId, recentMessages, coachName } = await req.json()
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }
  if (!Array.isArray(recentMessages)) {
    return NextResponse.json({ error: 'recentMessages required' }, { status: 400 })
  }

  // Ownership gate -- same pattern as other ai-* routes.
  const { data: client } = await supabase
    .from('clients')
    .select('id, coach_id, profile:profiles!clients_profile_id_fkey(full_name)')
    .eq('id', clientId).single()
  if (!client || (client as any).coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const limited = await enforceAiRateLimit(user.id, 'ai-message-draft')
  if (limited) return limited

  const clientName = (client as any).profile?.full_name?.split(' ')[0] || 'them'

  // ── Pull deterministic context (last 14 days) in parallel ─────────
  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  const fourteenIso = fourteenDaysAgo.toISOString()
  const fourteenDate = fourteenIso.slice(0, 10)

  const [workoutsRes, pulseRes, checkinsRes, weightRes, goalRes] = await Promise.all([
    supabase.from('workout_sessions')
      .select('title, status, completed_at, session_rpe, scheduled_date')
      .eq('client_id', clientId)
      .gte('scheduled_date', fourteenDate)
      .order('scheduled_date', { ascending: false })
      .limit(20),
    supabase.from('daily_checkins')
      .select('checkin_date, sleep_quality, energy_score, mood_emoji, soreness')
      .eq('client_id', clientId)
      .gte('checkin_date', fourteenDate)
      .order('checkin_date', { ascending: false })
      .limit(14),
    supabase.from('client_form_assignments')
      .select('completed_at, responses')
      .eq('client_id', clientId)
      .eq('status', 'completed')
      .not('checkin_schedule_id', 'is', null)
      .gte('completed_at', fourteenIso)
      .order('completed_at', { ascending: false })
      .limit(2),
    supabase.from('metrics')
      .select('logged_date, weight')
      .eq('client_id', clientId)
      .not('weight', 'is', null)
      .order('logged_date', { ascending: false })
      .limit(2),
    supabase.from('client_goals')
      .select('title, target_value, target_date, status')
      .eq('client_id', clientId)
      .neq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1),
  ])

  // ── Build context bullets (numbers computed here, prose by LLM) ───
  const workouts = (workoutsRes.data || []) as Array<{ status: string; session_rpe: number | null }>
  const completed = workouts.filter(w => w.status === 'completed').length
  const total = workouts.length
  const rpeValues = workouts.map(w => Number(w.session_rpe)).filter(n => Number.isFinite(n) && n > 0)
  const avgRpe = rpeValues.length ? (rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1) : null

  const pulse = (pulseRes.data || []) as Array<{ sleep_quality: number | null; energy_score: number | null }>
  const sleepValues = pulse.map(p => Number(p.sleep_quality)).filter(n => Number.isFinite(n))
  const energyValues = pulse.map(p => Number(p.energy_score)).filter(n => Number.isFinite(n))
  const avgSleep = sleepValues.length ? (sleepValues.reduce((a, b) => a + b, 0) / sleepValues.length).toFixed(1) : null
  const avgEnergy = energyValues.length ? (energyValues.reduce((a, b) => a + b, 0) / energyValues.length).toFixed(1) : null

  const weights = (weightRes.data || []) as Array<{ weight: number | string }>
  const latestWeight = weights[0] ? Number(weights[0].weight) : null
  const prevWeight = weights[1] ? Number(weights[1].weight) : null
  const weightDelta = (latestWeight != null && prevWeight != null)
    ? +(latestWeight - prevWeight).toFixed(1)
    : null

  const goal = (goalRes.data || [])[0] as { title?: string } | undefined
  const latestCheckinNotes = (checkinsRes.data || [])
    .flatMap((c: any) => Object.values(c.responses || {}))
    .filter((v: any) => typeof v === 'string' && v.length > 0)
    .slice(0, 3)
    .join(' | ')

  const contextBullets: string[] = []
  if (total > 0) contextBullets.push(`Workouts last 14d: ${completed}/${total} completed${avgRpe ? ` (avg RPE ${avgRpe})` : ''}`)
  if (avgSleep) contextBullets.push(`Daily pulse: sleep ${avgSleep}/5${avgEnergy ? `, energy ${avgEnergy}/5` : ''} (${pulse.length} entries)`)
  if (latestWeight != null) contextBullets.push(`Latest weight: ${latestWeight} lbs${weightDelta != null ? ` (${weightDelta > 0 ? '+' : ''}${weightDelta} from prior log)` : ''}`)
  if (goal?.title) contextBullets.push(`Active goal: ${goal.title}`)
  if (latestCheckinNotes) contextBullets.push(`Recent check-in notes: ${latestCheckinNotes.slice(0, 280)}`)

  // ── Truncate + format the thread ──────────────────────────────────
  const thread = (recentMessages as RecentMessage[])
    .slice(-12)
    .map(m => `${m.from === 'coach' ? coachName || 'Coach' : clientName}: ${(m.body || '').slice(0, 400)}`)
    .join('\n')

  const prompt = `You are a writing assistant for a personal trainer drafting reply messages to a client. The coach will REVIEW every draft before sending -- never auto-sent. Match the coach's voice: direct, warm, practical, concise. No corporate fluff. Use the client's first name occasionally, not in every reply.

CLIENT: ${clientName}

CLIENT CONTEXT (last 14 days, server-computed numbers -- don't invent others):
${contextBullets.length ? contextBullets.map(b => `- ${b}`).join('\n') : '- (no recent activity data available)'}

RECENT MESSAGE THREAD (oldest -> newest):
${thread || '(no prior messages)'}

Write 3 distinct draft replies the coach could send next. Each draft should:
- Be under 80 words
- Reference SOMETHING specific from the context or thread (not generic)
- Take a slightly different angle (e.g. one acknowledges + nudges, one asks a clarifying question, one shifts focus)
- Sound like a human coach texting, not a marketing email

Output ONLY this JSON, no other text:
{
  "drafts": [
    { "label": "<3-6 word angle description>", "body": "<the actual reply text>" },
    { "label": "<...>", "body": "<...>" },
    { "label": "<...>", "body": "<...>" }
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
      max_tokens: 1200,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[ai-message-draft] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[ai-message-draft] parse failed stop=${data?.stop_reason} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }

  const out = result.data as { drafts?: Array<{ label?: string; body?: string }> }
  const drafts = (out.drafts || [])
    .filter((d): d is { label: string; body: string } => typeof d?.body === 'string' && d.body.trim().length > 0)
    .map(d => ({ label: (d.label || 'Draft').slice(0, 50), body: d.body.trim() }))
    .slice(0, 3)

  if (drafts.length === 0) {
    return NextResponse.json({ error: 'No drafts generated -- try again' }, { status: 502 })
  }

  return NextResponse.json({ drafts })
}
