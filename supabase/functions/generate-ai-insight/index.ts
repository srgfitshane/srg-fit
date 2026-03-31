import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_CATEGORIES = [
  'low_adherence',
  'recovery_risk',
  'motivation_drop',
  'nutrition_inconsistency',
  'plateau',
  'likely_exercise_mismatch',
  'at_risk_churn',
] as const

const ALLOWED_SEVERITIES = ['low', 'medium', 'high', 'urgent'] as const

type InsightCategory = typeof ALLOWED_CATEGORIES[number]
type InsightSeverity = typeof ALLOWED_SEVERITIES[number]

type RecentCheckin = {
  id?: string
  submitted_at: string | null
  wins?: string | null
  struggles?: string | null
}

type RecentWorkout = {
  id?: string
  title?: string | null
  status?: string | null
  completed_at: string | null
  session_rpe?: number | null
  mood?: string | null
  notes_client?: string | null
}

type RecentPulseEntry = {
  id?: string
  checkin_date?: string | null
  sleep_quality?: number | null
  energy_score?: number | null
  mood_emoji?: string | null
  body?: string | null
}

type PersonalRecord = {
  id?: string
  weight_pr?: number | null
  logged_date?: string | null
  exercise?: { name?: string | null } | null
}

type ClientGoal = {
  id?: string
  title?: string | null
  goal_type?: string | null
  target_value?: number | null
}

type SessionExerciseEvent = {
  id?: string
  session_id?: string | null
  exercise_name?: string | null
  original_exercise_name?: string | null
  swap_reason?: string | null
  skip_reason?: string | null
  skipped?: boolean | null
  skipped_at?: string | null
  swapped_at?: string | null
  client_video_url?: string | null
  session?: { completed_at?: string | null } | null
}

type NutritionDailyLog = {
  id?: string
  log_date?: string | null
  total_calories?: number | null
  total_protein?: number | null
}

type RecentMessage = {
  id?: string
  body?: string | null
  created_at?: string | null
}

type CoachOption = {
  label?: string
  rationale?: string
  tradeoff?: string
}

type InsightResponse = {
  title?: string
  summary?: string
  category?: string
  severity?: string
  confidence?: number
  evidence?: unknown
  bullets?: unknown
  suggested_action?: string
  follow_up?: string
  client_impact?: string
  coach_options?: unknown
  draft_message?: string
  coaching_note?: string
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

function mapLegacyTypeToCategory(type: string) {
  if (type === 'red_flag') return 'recovery_risk'
  if (type === 'progression') return 'plateau'
  if (type === 'recommended_action') return 'likely_exercise_mismatch'
  return 'low_adherence'
}

function average(values: number[]) {
  if (!values.length) return null
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2))
}

function hoursSince(iso: string | null | undefined) {
  if (!iso) return null
  return Number(((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)).toFixed(1))
}

function daysSince(iso: string | null | undefined) {
  const hours = hoursSince(iso)
  if (hours === null) return null
  return Number((hours / 24).toFixed(1))
}

function isAllowedCategory(value: string): value is InsightCategory {
  return (ALLOWED_CATEGORIES as readonly string[]).includes(value)
}

function isAllowedSeverity(value: string): value is InsightSeverity {
  return (ALLOWED_SEVERITIES as readonly string[]).includes(value)
}

function trimEvidence(items: unknown, fallback: string[]) {
  if (!Array.isArray(items)) return fallback
  const cleaned = items
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6)

  return cleaned.length ? cleaned : fallback
}

function trimCoachOptions(items: unknown, fallbackAction: string) {
  if (!Array.isArray(items)) {
    return [
      {
        label: 'Recommended next step',
        rationale: fallbackAction,
        tradeoff: 'Lowest lift and easiest to act on immediately.',
      },
    ]
  }

  const cleaned = items
    .filter((item) => item && typeof item === 'object')
    .map((item) => {
      const option = item as CoachOption
      return {
        label: typeof option.label === 'string' ? option.label.trim() : '',
        rationale: typeof option.rationale === 'string' ? option.rationale.trim() : '',
        tradeoff: typeof option.tradeoff === 'string' ? option.tradeoff.trim() : '',
      }
    })
    .filter((option) => option.label && option.rationale)
    .slice(0, 3)

  return cleaned.length
    ? cleaned
    : [
        {
          label: 'Recommended next step',
          rationale: fallbackAction,
          tradeoff: 'Lowest lift and easiest to act on immediately.',
        },
      ]
}

function buildCoachDrafts(clientName: string, summary: string, suggestedAction: string, followUp: string) {
  return {
    client_message: `Hey ${clientName} - quick check-in. ${suggestedAction} ${followUp}`.trim(),
    coach_note: `${summary} Next move: ${suggestedAction}`.trim(),
    programming_adjustment: followUp || 'Review the next session before making changes.',
  }
}

function deriveFallbackInsight(clientName: string, defaults: { category: string; severity: string }, context: {
  skippedExercises14d: number
  swappedExercises14d: number
  nutritionLoggingDays7d: number
  avgSleep: number | null
  avgEnergy: number | null
  avgSessionRpe: number | null
  daysSinceWorkout: number | null
  daysSinceClientMessage: number | null
  painOrEquipmentFlags14d: number
}) {
  const {
    skippedExercises14d,
    swappedExercises14d,
    nutritionLoggingDays7d,
    avgSleep,
    avgEnergy,
    avgSessionRpe,
    daysSinceWorkout,
    daysSinceClientMessage,
    painOrEquipmentFlags14d,
  } = context

  if ((daysSinceWorkout !== null && daysSinceWorkout >= 6) || (daysSinceClientMessage !== null && daysSinceClientMessage >= 5)) {
    return {
      title: `${clientName} needs proactive outreach`,
      summary: `${clientName} has gone quiet enough that engagement risk is climbing. The next best move is direct outreach before the client fully disconnects.`,
      category: 'at_risk_churn',
      severity: 'high',
      confidence: 0.72,
      evidence: trimEvidence([
        daysSinceWorkout !== null ? `${daysSinceWorkout} days since the last completed workout.` : null,
        daysSinceClientMessage !== null ? `${daysSinceClientMessage} days since the last client message.` : null,
      ], ['Engagement has dropped across recent coaching signals.']),
      bullets: ['Reach out directly today and ask one specific question about training or recovery.'],
      suggested_action: 'Send a direct check-in and ask what is blocking training this week.',
      follow_up: 'If there is no response today, follow up again within 24 hours.',
      client_impact: 'Fast outreach lowers the chance of churn and helps the client feel seen before momentum slips further.',
    }
  }

  if ((avgSleep !== null && avgSleep <= 2.6) || (avgEnergy !== null && avgEnergy <= 2.4) || (avgSessionRpe !== null && avgSessionRpe >= 8.5)) {
    return {
      title: `${clientName} is showing recovery strain`,
      summary: `${clientName}'s recent recovery signals look soft relative to training strain. This is a good moment to review fatigue, sleep, and whether this week's loading still fits.`,
      category: 'recovery_risk',
      severity: defaults.severity === 'urgent' ? 'urgent' : 'high',
      confidence: 0.74,
      evidence: trimEvidence([
        avgSleep !== null ? `Average sleep quality is ${avgSleep}/5.` : null,
        avgEnergy !== null ? `Average energy is ${avgEnergy}/5.` : null,
        avgSessionRpe !== null ? `Average recent session RPE is ${avgSessionRpe}.` : null,
      ], ['Recent recovery markers are lagging behind training strain.']),
      bullets: ['Review recovery habits and consider a lighter next session if fatigue is still elevated.'],
      suggested_action: 'Message the client about recovery, then decide whether to hold steady or pull back volume.',
      follow_up: 'Check the next workout and pulse entry within 24 hours.',
      client_impact: 'Acting early reduces the chance of poor sessions, missed workouts, or unnecessary soreness.',
    }
  }

  if (skippedExercises14d >= 2 || swappedExercises14d >= 3 || painOrEquipmentFlags14d >= 2) {
    return {
      title: `${clientName} has programming friction`,
      summary: `${clientName} is repeatedly modifying or skipping exercises. That usually means the current exercise selection is not fitting well enough in real life or in the body.`,
      category: 'likely_exercise_mismatch',
      severity: 'medium',
      confidence: 0.7,
      evidence: trimEvidence([
        skippedExercises14d ? `${skippedExercises14d} exercises were skipped in recent sessions.` : null,
        swappedExercises14d ? `${swappedExercises14d} exercises were swapped in recent sessions.` : null,
        painOrEquipmentFlags14d ? `${painOrEquipmentFlags14d} swap or skip reasons mention pain, discomfort, or equipment limits.` : null,
      ], ['Recent workouts show repeated programming friction.']),
      bullets: ['Look for one recurring movement pattern and swap it proactively in the next program update.'],
      suggested_action: 'Review the recent skip and swap reasons, then update the most problematic movement slot.',
      follow_up: 'Watch the next two workouts for whether friction drops after the change.',
      client_impact: 'Cleaner exercise fit improves adherence and keeps the client moving forward without extra frustration.',
    }
  }

  if (nutritionLoggingDays7d <= 2) {
    return {
      title: `${clientName} needs nutrition follow-through`,
      summary: `${clientName} is not logging enough nutrition data to coach effectively right now. A small compliance reset is likely more useful than a big nutrition change.`,
      category: 'nutrition_inconsistency',
      severity: 'medium',
      confidence: 0.66,
      evidence: [`Only ${nutritionLoggingDays7d} nutrition log day${nutritionLoggingDays7d === 1 ? '' : 's'} were recorded in the last 7 days.`],
      bullets: ['Reinforce the smallest logging habit that will restore visibility this week.'],
      suggested_action: 'Ask for a simple nutrition compliance target for the next 3 days instead of changing the plan yet.',
      follow_up: 'Review nutrition logging again in 72 hours.',
      client_impact: 'Better visibility makes future nutrition adjustments much more accurate.',
    }
  }

  return {
    title: `${clientName} needs a coaching check-in`,
    summary: `${clientName} has enough friction or inconsistency to justify a coach touchpoint. The best next step is a specific check-in rather than waiting for more drift.`,
    category: defaults.category,
    severity: defaults.severity,
    confidence: 0.52,
    evidence: ['Recent client data suggests a worthwhile coaching follow-up.'],
    bullets: [],
    suggested_action: 'Review the client context and send one focused follow-up message.',
    follow_up: 'Reassess after the next logged workout or check-in.',
    client_impact: 'A timely touchpoint helps keep the client moving before small issues become bigger ones.',
  }
}

function deriveInsightDefaults(type: string, context: {
  adherenceRate14d: number | null
  avgSleep: number | null
  avgEnergy: number | null
  skippedExercises14d: number
  swappedExercises14d: number
  daysSinceWorkout: number | null
  daysSinceClientMessage: number | null
  nutritionLoggingDays7d: number
}) {
  const { adherenceRate14d, avgSleep, avgEnergy, skippedExercises14d, swappedExercises14d, daysSinceWorkout, daysSinceClientMessage, nutritionLoggingDays7d } = context

  if (type === 'red_flag') {
    if ((avgSleep !== null && avgSleep <= 2.6) || (avgEnergy !== null && avgEnergy <= 2.4)) {
      return { category: 'recovery_risk', severity: 'high' }
    }
    if ((daysSinceWorkout !== null && daysSinceWorkout >= 6) || (daysSinceClientMessage !== null && daysSinceClientMessage >= 5)) {
      return { category: 'at_risk_churn', severity: 'high' }
    }
    return { category: 'recovery_risk', severity: 'medium' }
  }

  if (type === 'progression') {
    if (swappedExercises14d >= 3 || skippedExercises14d >= 2) {
      return { category: 'likely_exercise_mismatch', severity: 'medium' }
    }
    return { category: 'plateau', severity: 'medium' }
  }

  if (type === 'recommended_action') {
    if (nutritionLoggingDays7d <= 2) {
      return { category: 'nutrition_inconsistency', severity: 'medium' }
    }
    if (swappedExercises14d >= 2) {
      return { category: 'likely_exercise_mismatch', severity: 'medium' }
    }
    return { category: 'low_adherence', severity: 'medium' }
  }

  if (adherenceRate14d !== null && adherenceRate14d < 0.5) {
    return { category: 'low_adherence', severity: 'high' }
  }
  if (daysSinceClientMessage !== null && daysSinceClientMessage >= 5) {
    return { category: 'motivation_drop', severity: 'medium' }
  }
  return { category: 'low_adherence', severity: 'low' }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { client_id, coach_id, type } = await req.json()
    if (!client_id || !coach_id || !type) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    const { data: clientOwnership } = await supabase
      .from('clients')
      .select('id, coach_id, profile_id')
      .eq('id', client_id)
      .maybeSingle()

    if (!clientOwnership || clientOwnership.coach_id !== coach_id) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const isCoachCaller = callerProfile?.role === 'coach'
    const isAllowedCoach = isCoachCaller && user.id === coach_id
    const isAllowedClient = !isCoachCaller && clientOwnership.profile_id === user.id

    if (!isAllowedCoach && !isAllowedClient) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: corsHeaders })
    }

    const [
      { data: client },
      { data: recentCheckins },
      { data: recentWorkouts },
      { data: recentPulse },
      { data: recentPRs },
      { data: goals },
      { data: recentSessionExercises },
      { data: recentNutritionLogs },
    ] = await Promise.all([
      supabase.from('clients').select('*, profile:profiles!profile_id(full_name)').eq('id', client_id).single(),
      supabase.from('checkins').select('id, submitted_at, wins, struggles').eq('client_id', client_id).order('submitted_at', { ascending: false }).limit(4),
      supabase.from('workout_sessions').select('id, title, status, completed_at, session_rpe, mood, notes_client').eq('client_id', client_id).eq('status', 'completed').order('completed_at', { ascending: false }).limit(10),
      supabase.from('daily_checkins').select('id, checkin_date, sleep_quality, energy_score, mood_emoji, body').eq('client_id', client_id).order('checkin_date', { ascending: false }).limit(14),
      supabase.from('personal_records').select('id, weight_pr, logged_date, exercise:exercises(name)').eq('client_id', client_id).order('logged_date', { ascending: false }).limit(5),
      supabase.from('client_goals').select('id, title, goal_type, target_value').eq('client_id', client_id).eq('status', 'active'),
      supabase.from('session_exercises').select('id, session_id, exercise_name, original_exercise_name, swap_reason, skip_reason, skipped, skipped_at, swapped_at, client_video_url, session:workout_sessions!session_exercises_session_id_fkey(completed_at)').eq('session.client_id', client_id).order('swapped_at', { ascending: false }).limit(40),
      supabase.from('nutrition_daily_logs').select('id, log_date, total_calories, total_protein').eq('client_id', client_id).order('log_date', { ascending: false }).limit(10),
    ])

    const { data: recentMessages } = client?.profile_id
      ? await supabase.from('messages').select('id, body, created_at').eq('sender_id', client.profile_id).order('created_at', { ascending: false }).limit(8)
      : { data: [] }

    const clientName = client?.profile?.full_name?.split(' ')[0] || 'Client'
    const workoutCount = recentWorkouts?.length || 0
    const pulseEntries = (recentPulse || []) as RecentPulseEntry[]
    const workoutEntries = (recentWorkouts || []) as RecentWorkout[]
    const sessionExerciseEvents = (recentSessionExercises || []) as SessionExerciseEvent[]
    const checkinEntries = (recentCheckins || []) as RecentCheckin[]
    const nutritionLogs = (recentNutritionLogs || []) as NutritionDailyLog[]
    const personalRecords = (recentPRs || []) as PersonalRecord[]
    const clientGoals = (goals || []) as ClientGoal[]
    const messageEntries = (recentMessages || []) as RecentMessage[]

    const avgSleep = average(pulseEntries.map((row) => Number(row.sleep_quality || 0)).filter(Boolean))
    const avgEnergy = average(pulseEntries.map((row) => Number(row.energy_score || 0)).filter(Boolean))
    const avgSessionRpe = average(workoutEntries.map((row) => Number(row.session_rpe || 0)).filter(Boolean))
    const skippedExercises14d = sessionExerciseEvents.filter((row) => row.skipped || row.skip_reason).length
    const swappedExercises14d = sessionExerciseEvents.filter((row) => row.original_exercise_name || row.swap_reason).length
    const formCheckSubmissions14d = sessionExerciseEvents.filter((row) => row.client_video_url).length
    const painOrEquipmentFlags14d = sessionExerciseEvents.filter((row) => {
      const reason = `${row.swap_reason || ''} ${row.skip_reason || ''}`.toLowerCase()
      return reason.includes('pain') || reason.includes('hurt') || reason.includes('discomfort') || reason.includes('equipment') || reason.includes('machine')
    }).length
    const lastWorkoutAt = workoutEntries[0]?.completed_at || null
    const lastClientMessageAt = messageEntries[0]?.created_at || null
    const lastCheckinAt = checkinEntries[0]?.submitted_at || null
    const adherenceRate14d = pulseEntries.length ? Number((workoutEntries.filter((row) => hoursSince(row.completed_at) !== null && (hoursSince(row.completed_at) as number) <= 24 * 14).length / 4).toFixed(2)) : null
    const nutritionLoggingDays7d = nutritionLogs.filter((row) => row.log_date && ((Date.now() - new Date(`${row.log_date}T00:00:00`).getTime()) / (1000 * 60 * 60 * 24)) <= 7).length
    const strugglingCheckins = checkinEntries.filter((checkin) => `${checkin.struggles || ''}`.trim().length > 0).length
    const recentMessageCount = messageEntries.filter((message) => message.body).length
    const metricsAnalyzed = [
      avgSleep,
      avgEnergy,
      avgSessionRpe,
      adherenceRate14d,
      nutritionLoggingDays7d,
      skippedExercises14d,
      swappedExercises14d,
      formCheckSubmissions14d,
      painOrEquipmentFlags14d,
    ].filter((value) => value !== null).length
    const defaults = deriveInsightDefaults(type, {
      adherenceRate14d,
      avgSleep,
      avgEnergy,
      skippedExercises14d,
      swappedExercises14d,
      daysSinceWorkout: daysSince(lastWorkoutAt),
      daysSinceClientMessage: daysSince(lastClientMessageAt),
      nutritionLoggingDays7d,
    })

    const contextSummary = {
      client_name: clientName,
      workouts_completed_last_10: workoutCount,
      avg_sleep_quality_last_14_days: avgSleep,
      avg_energy_last_14_days: avgEnergy,
      avg_session_rpe_last_10: avgSessionRpe,
      adherence_rate_last_14_days: adherenceRate14d,
      skipped_exercises_last_14_days: skippedExercises14d,
      swapped_exercises_last_14_days: swappedExercises14d,
      form_checks_last_14_days: formCheckSubmissions14d,
      pain_or_equipment_flags_last_14_days: painOrEquipmentFlags14d,
      nutrition_logging_days_last_7_days: nutritionLoggingDays7d,
      hours_since_last_workout: hoursSince(lastWorkoutAt),
      hours_since_last_client_message: hoursSince(lastClientMessageAt),
      hours_since_last_checkin: hoursSince(lastCheckinAt),
      struggling_checkins_last_30_days: strugglingCheckins,
      recent_message_count: recentMessageCount,
      recent_prs: personalRecords.map((record) => ({
        exercise: record.exercise?.name,
        weight_pr: record.weight_pr,
        logged_date: record.logged_date,
      })),
      goals: clientGoals.map((goal) => ({
        title: goal.title,
        goal_type: goal.goal_type,
        target_value: goal.target_value,
      })),
      checkins: checkinEntries,
      pulse: pulseEntries,
      workouts: workoutEntries,
      recent_messages: messageEntries.filter((message) => message.body),
      session_exercise_events: sessionExerciseEvents.map((exercise) => ({
        exercise_name: exercise.exercise_name,
        original_exercise_name: exercise.original_exercise_name,
        swap_reason: exercise.swap_reason,
        skip_reason: exercise.skip_reason,
        skipped: exercise.skipped,
        completed_at: exercise.session?.completed_at || null,
      })),
      nutrition_logs: nutritionLogs,
    }

    const sourceRefs = {
      checkin_ids: checkinEntries.map((entry) => entry.id).filter(Boolean),
      workout_session_ids: workoutEntries.map((entry) => entry.id).filter(Boolean),
      pulse_entry_ids: pulseEntries.map((entry) => entry.id).filter(Boolean),
      message_ids: messageEntries.map((entry) => entry.id).filter(Boolean),
      session_exercise_ids: sessionExerciseEvents.map((entry) => entry.id).filter(Boolean),
      nutrition_log_ids: nutritionLogs.map((entry) => entry.id).filter(Boolean),
      personal_record_ids: personalRecords.map((entry) => entry.id).filter(Boolean),
      goal_ids: clientGoals.map((entry) => entry.id).filter(Boolean),
    }

    const prompt = `
You are the internal AI copilot for Coach Shane at SRG Fit. The AI is coach-facing only.
Your job is to help Coach Shane notice patterns faster and choose strong next-step options.
You must never replace the coach's judgment, never diagnose, never shame the client, and never write as if the AI is the relationship owner.
The client population may include people dealing with anxiety, depression, low motivation, and overwhelm. Favor calm, practical, low-friction options.
Given the client context, produce one explainable coaching alert or recommendation.

Rules:
- Choose one category from: low_adherence, recovery_risk, motivation_drop, nutrition_inconsistency, plateau, likely_exercise_mismatch, at_risk_churn
- Choose one severity from: low, medium, high, urgent
- Confidence is a number from 0 to 1
- Evidence must be an array of concise evidence strings tied to the provided data
- Keep the recommendation coach-facing, practical, and specific
- Follow-up should tell the coach when or how to follow up
- Do not roleplay as the coach to the client
- The recommendation should be decisive enough to put into a coach action queue
- Prefer one concrete next step over vague encouragement
- Offer options that help the coach decide, not commands that replace the coach
- Keep language grounded in the supplied data and avoid overclaiming
- Draft message should sound warm, simple, and supportive in Coach Shane's style without being pushy
- If skipped or swapped exercises show a pattern, treat that as programming friction
- If sleep, energy, workout gaps, or message silence are concerning, bias toward earlier follow-up

Requested emphasis: ${type}
Suggested default category/severity:
${JSON.stringify(defaults, null, 2)}
Heuristics to respect:
- low_adherence: missed workouts, stale check-ins, weak nutrition logging, or repeated silence
- recovery_risk: low sleep/energy, rough mood trend, high session RPE, or repeated "struggles" check-ins
- motivation_drop: message silence, low engagement, or check-ins that suggest waning drive without full churn risk
- nutrition_inconsistency: weak logging consistency or repeated food-plan drift signals
- plateau: effort is present but progress is flat and recovery is not the main bottleneck
- likely_exercise_mismatch: recurring swaps/skips, pain notes, discomfort, or equipment mismatch
- at_risk_churn: multiple engagement signals are dropping together and the coach should intervene quickly
- urgent should be rare and reserved for same-day attention; high means 24-hour follow-up; medium means 72-hour follow-up
Client context:
${JSON.stringify(contextSummary, null, 2)}

Respond with strict JSON:
{
  "title": "short alert title",
  "summary": "2-4 sentence summary",
  "category": "one of the allowed categories",
  "severity": "low|medium|high|urgent",
  "confidence": 0.0,
  "evidence": ["evidence 1", "evidence 2"],
  "bullets": ["optional supporting point 1", "optional supporting point 2"],
  "suggested_action": "what the coach should do next",
  "follow_up": "when or how the coach should follow up",
  "client_impact": "why this matters for the client",
  "coach_options": [
    { "label": "recommended", "rationale": "best option and why", "tradeoff": "what to watch for" },
    { "label": "lighter_touch", "rationale": "lower-friction option", "tradeoff": "slower signal or lower impact" },
    { "label": "stronger_intervention", "rationale": "stronger move if needed", "tradeoff": "more intrusive or higher lift" }
  ],
  "draft_message": "short editable draft Coach Shane could send to the client",
  "coaching_note": "short internal note or programming reminder for Coach Shane"
}`.trim()

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic error:', err)
      return new Response(JSON.stringify({ error: 'AI call failed' }), { status: 500, headers: corsHeaders })
    }

    const aiData = await anthropicRes.json()
    const rawText = aiData.content?.[0]?.text || '{}'

    let parsed: InsightResponse
    try {
      parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    } catch {
      parsed = deriveFallbackInsight(clientName, defaults, {
        skippedExercises14d,
        swappedExercises14d,
        nutritionLoggingDays7d,
        avgSleep,
        avgEnergy,
        avgSessionRpe,
        daysSinceWorkout: daysSince(lastWorkoutAt),
        daysSinceClientMessage: daysSince(lastClientMessageAt),
        painOrEquipmentFlags14d,
      })
    }

    const normalizedCategory = isAllowedCategory(parsed.category)
      ? parsed.category
      : isAllowedCategory(defaults.category)
        ? defaults.category
        : mapLegacyTypeToCategory(type)
    const normalizedSeverity = isAllowedSeverity(parsed.severity)
      ? parsed.severity
      : isAllowedSeverity(defaults.severity)
        ? defaults.severity
        : 'medium'
    const normalizedConfidence = typeof parsed.confidence === 'number'
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.5
    const normalizedEvidence = trimEvidence(parsed.evidence, [
      'Recent coaching data indicates a client follow-up is warranted.',
    ])
    const normalizedBullets = Array.isArray(parsed.bullets)
      ? parsed.bullets.filter((item: unknown) => typeof item === 'string').map((item: string) => item.trim()).filter(Boolean).slice(0, 4)
      : []
    const normalizedSuggestedAction = parsed.suggested_action || 'Review the client context and take one focused next step.'
    const normalizedFollowUp = parsed.follow_up || 'Reassess after the next meaningful client signal.'
    const normalizedSummary = parsed.summary || 'Recent coaching data indicates a worthwhile follow-up.'
    const normalizedCoachOptions = trimCoachOptions(parsed.coach_options, normalizedSuggestedAction)
    const normalizedDrafts = buildCoachDrafts(
      clientName,
      normalizedSummary,
      normalizedSuggestedAction,
      normalizedFollowUp,
    )
    const normalizedDraftMessage = typeof parsed.draft_message === 'string' && parsed.draft_message.trim()
      ? parsed.draft_message.trim()
      : normalizedDrafts.client_message
    const normalizedCoachingNote = typeof parsed.coaching_note === 'string' && parsed.coaching_note.trim()
      ? parsed.coaching_note.trim()
      : normalizedDrafts.coach_note
    const recommendation = {
      action: normalizedSuggestedAction,
      client_impact: parsed.client_impact || '',
      category: normalizedCategory,
      severity: normalizedSeverity,
      options: normalizedCoachOptions,
    }
    const followUp = {
      plan: normalizedFollowUp,
      priority_window: normalizedSeverity === 'urgent' ? 'same_day' : normalizedSeverity === 'high' ? '24h' : '72h',
    }
    const dedupeKey = `${coach_id}:${client_id}:${normalizedCategory}:${normalizedSeverity}`

    const { data: existingInsight } = await supabase
      .from('ai_insights')
      .select('id, surfaced_count')
      .eq('dedupe_key', dedupeKey)
      .eq('is_dismissed', false)
      .in('action_status', ['unread', 'read', 'snoozed'])
      .gte('generated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (existingInsight?.id) {
      await supabase
        .from('ai_insights')
        .update({
          surfaced_at: new Date().toISOString(),
          surfaced_count: (existingInsight.surfaced_count || 1) + 1,
          read: false,
          action_status: 'unread',
        })
        .eq('id', existingInsight.id)

      return new Response(JSON.stringify({ success: true, deduped: true, insight_id: existingInsight.id }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = {
      coach_id,
      client_id,
      dedupe_key: dedupeKey,
      type,
      content: {
        title: parsed.title,
        summary: normalizedSummary,
        bullets: normalizedBullets,
        suggested_action: normalizedSuggestedAction,
        evidence: normalizedEvidence,
        follow_up: normalizedFollowUp,
        client_impact: parsed.client_impact || '',
        coach_options: normalizedCoachOptions,
        draft_message: normalizedDraftMessage,
        coaching_note: normalizedCoachingNote,
      },
      insight_data: {
        clientName,
        contextSummary,
        checkins_analyzed: recentCheckins?.length || 0,
        sessions_analyzed: recentWorkouts?.length || 0,
        metrics_analyzed: metricsAnalyzed,
        pulse_entries_analyzed: recentPulse?.length || 0,
        messages_analyzed: recentMessageCount,
        nutrition_logs_analyzed: recentNutritionLogs?.length || 0,
        skipped_exercises_analyzed: skippedExercises14d,
        swapped_exercises_analyzed: swappedExercises14d,
        form_checks_analyzed: formCheckSubmissions14d,
      },
      source_refs: sourceRefs,
      coach_draft: {
        client_message: normalizedDraftMessage,
        coach_note: normalizedCoachingNote,
        programming_adjustment: normalizedDrafts.programming_adjustment,
      },
      generation_meta: {
        model: 'claude-sonnet-4-20250514',
        requested_type: type,
        generated_by: 'generate-ai-insight',
        dedupe_window_hours: 24,
      },
      flag_level: normalizedSeverity === 'urgent' ? 'urgent' : normalizedSeverity === 'high' ? 'high' : normalizedSeverity === 'medium' ? 'normal' : 'low',
      read: false,
      is_dismissed: false,
      generated_at: new Date().toISOString(),
      surfaced_at: new Date().toISOString(),
      surfaced_count: 1,
      action_status: 'unread',
      confidence: normalizedConfidence,
      severity: normalizedSeverity,
      category: normalizedCategory,
      evidence: normalizedEvidence,
      recommendation,
      follow_up: followUp,
    }

    const { data: inserted, error: insertError } = await supabase
      .from('ai_insights')
      .insert(payload)
      .select('id')
      .single()

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), { status: 500, headers: corsHeaders })
    }

    return new Response(JSON.stringify({ success: true, insight: payload.content, insight_id: inserted.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e: unknown) {
    console.error('generate-ai-insight error:', e)
    const message = e instanceof Error ? e.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders })
  }
})
