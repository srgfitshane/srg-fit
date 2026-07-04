// Shared coach attention-inbox builder.
//
// Single source of truth for the "Today's Coaching" queue surfaced on
// /dashboard/coach (web) and the SRG Fit Coach desktop app. Kept free
// of React / Next.js imports so it runs in any context with a
// configured @supabase/supabase-js client.
//
// Pulled out of src/app/dashboard/coach/page.tsx in commit refactor:
// "extract coach inbox into shared module". Render-side mapping
// (semantic color -> theme hex, href -> onClick) lives at the call
// site so this module knows nothing about themes or routers.

// Note: parameter is typed `any` rather than SupabaseClient. The web app and
// the desktop app each install @supabase/supabase-js into their own
// node_modules; SupabaseClient has a `protected supabaseUrl` field which
// makes the two class declarations nominally incompatible even when the
// versions match. All internal calls are explicit-cast onto local row
// types so we don't lose meaningful type safety.

export type QueueItemType =
  | 'review'
  | 'insight'
  | 'message'
  | 'checkin'
  | 'friction'
  | 'silent_client'
  | 'issue_report'
  | 'program_ending'
  // Synthesized locally by the web dashboard (buildCoachInbox never emits
  // them), so the desktop app is unaffected at runtime.
  | 'birthday'
  | 'digest'

export type SemanticColor = 'red' | 'orange' | 'yellow' | 'green' | 'purple' | 'teal'

export type QueueItem = {
  id: string
  type: QueueItemType
  priority: number
  title: string
  detail: string
  action: string
  href: string
  color: SemanticColor
  // Act-in-place payloads (optional). Set on review + message items so the
  // dashboard can quick-praise / inline-reply without a page hop.
  sessionId?: string        // review: workout_sessions id
  clean?: boolean           // review: zero friction signals
  clientProfileId?: string  // review + message: push / reply target
  clientName?: string
}

// Rotating praise notes for one-tap quick reviews on clean sessions.
// Written into coach_review_notes so the client sees a real coach reply
// (same render path as a typed review). Rotated so repeat clients don't
// get the identical canned line every week. Shared by the reviews page
// and the dashboard inbox.
export const PRAISE_VARIATIONS = [
  'Keep up the good work 💪',
  'Solid session — every rep counted. Keep it rolling!',
  'Textbook work. Keep stacking weeks like this 🔥',
  'Clean session top to bottom. Love to see it!',
  'Great execution today — nothing to fix, just keep showing up 💪',
  'Strong work! Consistency like this is what gets results.',
  'Nailed it. Same energy next session 👊',
  'All boxes checked — this is how progress gets built.',
  'Really solid effort across the board. Keep it up!',
  'Another one in the books — great work today 💪',
]
export const pickPraise = () => PRAISE_VARIATIONS[Math.floor(Math.random() * PRAISE_VARIATIONS.length)]

export type ReviewUrgencyBreakdown = { red: number; yellow: number; green: number }

export type CoachInboxResult = {
  queue: QueueItem[]
  pendingReviews: number
  reviewUrgency: ReviewUrgencyBreakdown
  pendingCheckins: number
  checkInsDue: number
  unreadMsgs: number
}

// ---- Helpers ---------------------------------------------------------------

export const truncate = (value: string | null | undefined, max = 72) => {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

export const getDaysSince = (iso: string | null | undefined) => {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

export type ReviewUrgency = 'red' | 'yellow' | 'green'

// 24hr SLA: red <2hrs left or overdue, yellow 2-8hrs, green 8+hrs.
export const getReviewUrgency = (dueAt: string | null | undefined): ReviewUrgency => {
  if (!dueAt) return 'green'
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursLeft < 2) return 'red'
  if (hoursLeft < 8) return 'yellow'
  return 'green'
}

export const formatReviewTimeLeft = (dueAt: string | null | undefined): string => {
  if (!dueAt) return ''
  const msLeft = new Date(dueAt).getTime() - Date.now()
  const hoursLeft = msLeft / (1000 * 60 * 60)
  if (hoursLeft < 0) {
    const hoursOver = Math.abs(hoursLeft)
    if (hoursOver < 1) return `overdue ${Math.round(hoursOver * 60)}m`
    return `overdue ${Math.round(hoursOver)}h`
  }
  if (hoursLeft < 1) return `${Math.round(hoursLeft * 60)}m left`
  return `${Math.round(hoursLeft)}h left`
}

// Local YYYY-MM-DD (avoids toISOString() UTC drift -- see CLAUDE.md rule 7).
const localDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// ---- Internal row types ---------------------------------------------------

type ClientRow = {
  id: string
  profile_id?: string | null
  paused?: boolean | null
  training_type?: string | null
  last_checkin_at?: string | null
  profile?: { full_name?: string | null } | null
}

type ReviewQueueSession = {
  id: string
  title: string
  review_due_at: string
  completed_at: string
  energy_level?: number | null
  mood?: string | null
  notes_client?: string | null
  client?: { profile?: { id?: string | null; full_name?: string | null } | null } | null
}

type InsightQueueRow = {
  id: string
  category?: string | null
  severity?: string | null
  content?: { title?: string | null; suggested_action?: string | null } | null
}

type InboxMessageRow = {
  sender_id: string
  body?: string | null
  created_at: string
}

type IssueReportRow = {
  id: string
  client_id: string
  category: 'messaging' | 'logging' | 'bug' | 'other'
  body: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  created_at: string
}

type EndingProgramRow = {
  program_id: string
  program_name: string
  client_id: string
  client_name: string
  last_session: string  // YYYY-MM-DD
  total_sessions: number
  days_until_last: number
  ending_notified_at?: string | null
}

type RecentSessionRow = {
  id: string
  client_id: string
  title: string
  completed_at: string
}

type SessionExerciseRow = {
  session_id: string
  exercise_name?: string | null
  original_exercise_name?: string | null
  swap_reason?: string | null
  skip_reason?: string | null
  skipped?: boolean | null
}

// ---- Main builder ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildCoachInbox(
  supabase: any,
  coachUserId: string,
): Promise<CoachInboxResult> {
  // 1. Clients (lightweight projection -- queue only needs identity + status).
  const { data: clientList } = await supabase
    .from('clients')
    .select('id, profile_id, paused, training_type, last_checkin_at, profile:profiles!profile_id(full_name)')
    .eq('coach_id', coachUserId)
    .neq('archived', true)
  const clients = (clientList || []) as unknown as ClientRow[]

  // 2. Pending workout reviews + urgency breakdown.
  const { data: allPendingReviews } = await supabase
    .from('workout_sessions')
    .select('id, review_due_at')
    .eq('coach_id', coachUserId)
    .eq('status', 'completed')
    .is('coach_reviewed_at', null)
    .not('review_due_at', 'is', null)
  const pendingReviewsData = (allPendingReviews || []) as Array<{ id: string; review_due_at: string }>
  const pendingReviews = pendingReviewsData.length
  const reviewUrgency: ReviewUrgencyBreakdown = { red: 0, yellow: 0, green: 0 }
  for (const r of pendingReviewsData) reviewUrgency[getReviewUrgency(r.review_due_at)]++

  // 3. Pending check-ins (form assignments not yet completed).
  const { count: pendingCi } = await supabase
    .from('client_form_assignments')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachUserId)
    .eq('status', 'pending')
    .not('checkin_schedule_id', 'is', null)
  const pendingCheckins = pendingCi || 0

  // 4. Check-ins due (clients whose last check-in was 7+ days ago or never).
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysAgoStr = localDateStr(sevenDaysAgo)
  const { count: ciDue } = await supabase
    .from('clients')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachUserId)
    .neq('archived', true)
    .eq('paused', false)
    .neq('training_type', 'in_person')
    .or(`last_checkin_at.is.null,last_checkin_at.lte.${sevenDaysAgoStr}`)
  const checkInsDue = ciDue || 0

  // 5. Unread messages count.
  const { count: msgCount } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', coachUserId)
    .eq('read', false)
  const unreadMsgs = msgCount || 0

  // 6. Parallel fetch for queue items (reviews list + insights + messages list + recent sessions for friction).
  const reviewWindowStart = new Date()
  reviewWindowStart.setDate(reviewWindowStart.getDate() - 14)

  const [reviewSessionsRes, unreadInsightsRes, unreadMessagesRes, recentSessionsRes, openIssueRes, endingProgramsRes] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('id, title, review_due_at, completed_at, energy_level, mood, notes_client, client:clients!workout_sessions_client_id_fkey(id, profile:profiles!clients_profile_id_fkey(id, full_name))')
      .eq('coach_id', coachUserId)
      .eq('status', 'completed')
      .is('coach_reviewed_at', null)
      .not('review_due_at', 'is', null)
      .order('review_due_at', { ascending: true })
      .limit(5),
    supabase
      .from('ai_insights')
      .select('id, client_id, category, severity, generated_at, content')
      .eq('coach_id', coachUserId)
      .eq('action_status', 'unread')
      .eq('is_dismissed', false)
      .order('generated_at', { ascending: false })
      .limit(6),
    supabase
      .from('messages')
      .select('sender_id, body, created_at')
      .eq('recipient_id', coachUserId)
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('workout_sessions')
      .select('id, client_id, title, completed_at, session_rpe')
      .eq('coach_id', coachUserId)
      .eq('status', 'completed')
      .gte('completed_at', reviewWindowStart.toISOString())
      .order('completed_at', { ascending: false })
      .limit(12),
    // Open issue reports -- show in queue until coach marks them resolved
    // or closed. open + in_progress both surface here so they don't fall
    // off the radar while triage is mid-flight.
    supabase
      .from('issue_reports')
      .select('id, client_id, category, body, status, created_at')
      .eq('coach_id', coachUserId)
      .in('status', ['open', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(10),
    // Programs in their last week (or just ended). SECURITY DEFINER RPC
    // already filters to auth.uid() so this is safe for the live coach
    // session. No 14-day dedupe filter here -- card persists until the
    // program is extended or archived, even after the push has fired.
    supabase.rpc('get_my_ending_programs'),
  ])

  const clientNameByProfileId = new Map(
    clients
      .filter((client) => client.profile_id)
      .map((client) => [client.profile_id as string, client.profile?.full_name || 'Client']),
  )

  // Act-in-place enrichment for review queue items: compute a `clean` flag
  // (zero friction signals) so the dashboard can offer one-tap quick praise
  // without opening the reviews page. Mirrors getReviewIntelligence there —
  // skips, swaps, form checks, high-RPE sets, completion drop, low recovery —
  // plus client notes, which the dashboard can't see and therefore must not
  // praise over.
  const reviewQueueSessions = (reviewSessionsRes.data || []) as ReviewQueueSession[]
  const cleanBySession = new Map<string, boolean>()
  if (reviewQueueSessions.length > 0) {
    const reviewIds = reviewQueueSessions.map((s) => s.id)
    const { data: reviewExercises } = await supabase
      .from('session_exercises')
      .select('id, session_id, skipped, skip_reason, original_exercise_name, swap_reason, client_video_url, notes_client, sets_prescribed')
      .in('session_id', reviewIds)
    const exRows = (reviewExercises || []) as Array<{
      id: string; session_id: string; skipped: boolean | null; skip_reason: string | null
      original_exercise_name: string | null; swap_reason: string | null
      client_video_url: string | null; notes_client: string | null; sets_prescribed: number | null
    }>
    const exIds = exRows.map((e) => e.id)
    type SetRow = { session_exercise_id: string; rpe: number | null; reps_completed: number | null; weight_value: number | null; weight_unit: string | null }
    const { data: reviewSets } = exIds.length === 0
      ? { data: [] as SetRow[] }
      : await supabase
          .from('exercise_sets')
          .select('session_exercise_id, rpe, reps_completed, weight_value, weight_unit')
          .in('session_exercise_id', exIds)
    const setsByEx = new Map<string, SetRow[]>()
    for (const row of (reviewSets || []) as SetRow[]) {
      const list = setsByEx.get(row.session_exercise_id) || []
      list.push(row)
      setsByEx.set(row.session_exercise_id, list)
    }
    for (const session of reviewQueueSessions) {
      let dirty = false
      // Same lowEnergy definition as the reviews page: unlogged energy
      // (null -> 0) also counts as a signal — unknown recovery gets eyes.
      if ((session.energy_level || 0) <= 2 || session.mood === 'tired' || session.mood === 'awful') dirty = true
      if (session.notes_client) dirty = true
      for (const ex of exRows.filter((e) => e.session_id === session.id)) {
        if (dirty) break
        if (ex.skipped || ex.skip_reason || ex.original_exercise_name || ex.swap_reason || ex.client_video_url || ex.notes_client) { dirty = true; break }
        const sets = setsByEx.get(ex.id) || []
        if (sets.some((s) => (s.rpe || 0) >= 9)) { dirty = true; break }
        // Same derived completion count as the reviews page — the
        // session_exercises.sets_completed column drifts.
        const completed = sets.filter((s) =>
          (s.reps_completed != null && s.reps_completed > 0)
          || (s.weight_value != null && s.weight_value > 0)
          || (s.weight_unit === 'bw' && s.reps_completed != null)
        ).length
        if (completed < (ex.sets_prescribed || 0)) { dirty = true; break }
      }
      cleanBySession.set(session.id, !dirty)
    }
  }

  // 7. Engagement signal aggregation across workout_sessions / daily_checkins
  // / client_form_assignments. Single threshold (7 days) across all signals.
  const sixtyDaysAgo = new Date()
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)
  const sixtyDaysAgoIso = sixtyDaysAgo.toISOString()
  const sixtyDaysAgoDate = sixtyDaysAgoIso.slice(0, 10)
  const clientIdList = clients.map((c) => c.id)

  const [
    { data: clientWorkoutRows },
    { data: clientPulseRows },
    { data: clientFormCheckinRows },
  ] = await Promise.all([
    supabase
      .from('workout_sessions')
      .select('client_id, completed_at')
      .eq('coach_id', coachUserId)
      .eq('status', 'completed')
      .gte('completed_at', sixtyDaysAgoIso)
      .order('completed_at', { ascending: false })
      .limit(500),
    clientIdList.length === 0
      ? Promise.resolve({ data: [] as Array<{ client_id: string; checkin_date: string }> })
      : supabase
          .from('daily_checkins')
          .select('client_id, checkin_date')
          .in('client_id', clientIdList)
          .gte('checkin_date', sixtyDaysAgoDate)
          .order('checkin_date', { ascending: false })
          .limit(500),
    clientIdList.length === 0
      ? Promise.resolve({ data: [] as Array<{ client_id: string; completed_at: string }> })
      : supabase
          .from('client_form_assignments')
          .select('client_id, completed_at')
          .in('client_id', clientIdList)
          .eq('status', 'completed')
          .not('checkin_schedule_id', 'is', null)
          .gte('completed_at', sixtyDaysAgoIso)
          .order('completed_at', { ascending: false })
          .limit(500),
  ])

  const lastActiveByClient = new Map<string, number>()
  const setIfNewer = (cid: string, ms: number | null) => {
    if (ms === null || !Number.isFinite(ms)) return
    const cur = lastActiveByClient.get(cid) ?? 0
    if (ms > cur) lastActiveByClient.set(cid, ms)
  }
  for (const c of clients) {
    setIfNewer(c.id, c.last_checkin_at ? new Date(c.last_checkin_at).getTime() : null)
  }
  for (const row of (clientWorkoutRows || []) as Array<{ client_id: string; completed_at: string }>) {
    setIfNewer(row.client_id, new Date(row.completed_at).getTime())
  }
  for (const row of (clientPulseRows || []) as Array<{ client_id: string; checkin_date: string }>) {
    // checkin_date is YYYY-MM-DD; treat as end-of-day local so today reads as today.
    setIfNewer(row.client_id, new Date(row.checkin_date + 'T23:59:59').getTime())
  }
  for (const row of (clientFormCheckinRows || []) as Array<{ client_id: string; completed_at: string }>) {
    setIfNewer(row.client_id, new Date(row.completed_at).getTime())
  }

  const STALE_THRESHOLD_DAYS = 7
  type ClientWithLastActive = ClientRow & { last_active_at: string | null }
  const attentionList: ClientWithLastActive[] = clients
    .map((client) => ({
      ...client,
      last_active_at: lastActiveByClient.has(client.id)
        ? new Date(lastActiveByClient.get(client.id)!).toISOString()
        : null,
    }))
    .filter((client) => !client.paused)
    .filter((client) => client.training_type !== 'in_person')
    .filter((client) => {
      const gap = getDaysSince(client.last_active_at)
      return gap === null || gap >= STALE_THRESHOLD_DAYS
    })
    .sort((a, b) => {
      const ga = getDaysSince(a.last_active_at) ?? 999
      const gb = getDaysSince(b.last_active_at) ?? 999
      return gb - ga
    })

  // 8. Friction detection (swaps + skips on recent sessions).
  const recentSessions = (recentSessionsRes.data || []) as RecentSessionRow[]
  let frictionQueueItems: QueueItem[] = []
  if (recentSessions.length > 0) {
    const sessionIds = recentSessions.map((session) => session.id)
    const { data: sessionExercises } = await supabase
      .from('session_exercises')
      .select('session_id, exercise_name, original_exercise_name, swap_reason, skip_reason, skipped')
      .in('session_id', sessionIds)

    const frictionBySession = new Map<string, { swaps: number; skips: number; reasons: string[] }>()
    for (const exercise of (sessionExercises || []) as SessionExerciseRow[]) {
      const current = frictionBySession.get(exercise.session_id) || { swaps: 0, skips: 0, reasons: [] }
      if (exercise.original_exercise_name || exercise.swap_reason) current.swaps += 1
      if (exercise.skipped || exercise.skip_reason) current.skips += 1
      const reason = exercise.skip_reason || exercise.swap_reason
      if (reason) current.reasons.push(reason)
      frictionBySession.set(exercise.session_id, current)
    }

    frictionQueueItems = recentSessions
      .map((session): QueueItem | null => {
        const friction = frictionBySession.get(session.id)
        if (!friction || (!friction.swaps && !friction.skips)) return null
        const totalFriction = friction.swaps + friction.skips
        const clientName = clients.find((client) => client.id === session.client_id)?.profile?.full_name || 'Client'
        return {
          id: `friction-${session.id}`,
          type: 'friction',
          priority: 72 + Math.min(totalFriction * 3, 12),
          title: `${clientName} hit workout friction`,
          detail: `${friction.skips ? `${friction.skips} skip${friction.skips === 1 ? '' : 's'}` : ''}${friction.skips && friction.swaps ? ' · ' : ''}${friction.swaps ? `${friction.swaps} swap${friction.swaps === 1 ? '' : 's'}` : ''}${friction.reasons[0] ? ` · ${truncate(friction.reasons[0], 38)}` : ''}`,
          action: 'Review session',
          color: 'orange',
          href: '/dashboard/coach/reviews',
        }
      })
      .filter((item): item is QueueItem => item !== null)
      .slice(0, 3)
  }

  // 9. Build the unified queue. Reviews + insights + messages + friction + silent clients.
  const queue: QueueItem[] = [
    ...reviewQueueSessions.map((session): QueueItem => {
      const urgency = getReviewUrgency(session.review_due_at)
      const timeLeft = formatReviewTimeLeft(session.review_due_at)
      const urgencyIcon = urgency === 'red' ? '🔴' : urgency === 'yellow' ? '🟡' : '🟢'
      return {
        id: `review-${session.id}`,
        type: 'review',
        priority: urgency === 'red' ? 100 : urgency === 'yellow' ? 90 : 80,
        title: `${session.client?.profile?.full_name || 'Client'} workout review ${urgencyIcon}`,
        detail: `${session.title} · ${timeLeft} · ${new Date(session.completed_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}`,
        action: 'Open review',
        color: urgency === 'red' ? 'red' : urgency === 'yellow' ? 'yellow' : 'green',
        href: '/dashboard/coach/reviews',
        sessionId: session.id,
        clean: cleanBySession.get(session.id) === true,
        clientProfileId: session.client?.profile?.id || undefined,
        clientName: session.client?.profile?.full_name || undefined,
      }
    }),
    // Issue reports always priority 96 (above yellow reviews / insights but
    // just under red reviews) -- a client flagging a bug deserves quick eyes
    // but shouldn't outrank an SLA-overdue workout review.
    ...((openIssueRes.data || []) as IssueReportRow[]).map((issue): QueueItem => {
      const clientName = clients.find((c) => c.id === issue.client_id)?.profile?.full_name || 'Client'
      const categoryLabel = ({
        messaging: 'Messaging',
        logging: 'Workout logging',
        bug: 'Bug',
        other: 'Issue',
      } as const)[issue.category]
      return {
        id: `issue-${issue.id}`,
        type: 'issue_report',
        priority: 96,
        title: `${clientName} reported ${issue.status === 'in_progress' ? 'an in-progress ' : 'an '}issue 🐛`,
        detail: `${categoryLabel} · ${truncate(issue.body, 60)}`,
        action: 'Review issue',
        color: 'red',
        href: '/dashboard/coach/issues',
      }
    }),
    // Programs ending / just ended. Negative days_until_last = already over
    // (more urgent -- client may be in limbo). Positive = "last week" warning.
    ...((endingProgramsRes.data || []) as EndingProgramRow[]).map((p): QueueItem => {
      const d = p.days_until_last
      const isOver = d < 0
      const wording = d > 1 ? `ends in ${d} days`
        : d === 1 ? 'ends tomorrow'
        : d === 0 ? 'ends today'
        : d === -1 ? 'ended yesterday'
        : `ended ${Math.abs(d)} days ago`
      return {
        id: `program-ending-${p.program_id}`,
        type: 'program_ending',
        priority: isOver ? 88 : 78,
        title: isOver
          ? `${p.client_name}'s program ended ⏰`
          : `${p.client_name}'s program winding down`,
        detail: `${p.program_name} · ${wording} · ${p.total_sessions} sessions`,
        action: isOver ? 'Plan next phase' : 'Review & extend',
        color: isOver ? 'red' : 'orange',
        href: `/dashboard/coach/clients/${p.client_id}`,
      }
    }),
    ...((unreadInsightsRes.data || []) as InsightQueueRow[]).map((insight): QueueItem => ({
      id: `insight-${insight.id}`,
      type: 'insight',
      priority: insight.severity === 'urgent' ? 95 : insight.severity === 'high' ? 80 : 60,
      title: insight.content?.title || 'New coaching insight',
      detail: insight.content?.suggested_action || insight.category || 'Review this client insight',
      action: 'Open insight',
      color: insight.severity === 'urgent' || insight.severity === 'high' ? 'orange' : 'purple',
      href: '/dashboard/coach/insights',
    })),
    ...((unreadMessagesRes.data || []) as InboxMessageRow[]).slice(0, 4).map((message, index): QueueItem => ({
      id: `message-${message.sender_id}-${index}`,
      type: 'message',
      priority: 70 - index,
      title: `${clientNameByProfileId.get(message.sender_id) || 'Client'} needs a reply`,
      detail: truncate(message.body || 'Unread client message'),
      action: 'Open inbox',
      color: 'teal',
      href: '/dashboard/coach/messages',
      clientProfileId: message.sender_id,
      clientName: clientNameByProfileId.get(message.sender_id) || undefined,
    })),
    ...frictionQueueItems,
    ...attentionList.slice(0, 6).map((client): QueueItem => {
      const days = getDaysSince(client.last_active_at)
      const urgency: 'red' | 'orange' | 'yellow' = days === null || days >= 14 ? 'red' : days >= 10 ? 'orange' : 'yellow'
      const icon = urgency === 'red' ? '🔴' : urgency === 'orange' ? '🟠' : '🟡'
      return {
        id: `silent-${client.id}`,
        type: 'silent_client',
        priority: urgency === 'red' ? 92 : urgency === 'orange' ? 75 : 55,
        title: `${client.profile?.full_name || 'Client'} going quiet ${icon}`,
        detail: days === null ? 'No activity in 60+ days' : days === 1 ? 'Last active yesterday' : `Last active ${days} days ago`,
        action: 'Open client',
        color: urgency,
        href: `/dashboard/coach/clients/${client.id}`,
      }
    }),
  ]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 12)

  return {
    queue,
    pendingReviews,
    reviewUrgency,
    pendingCheckins,
    checkInsDue,
    unreadMsgs,
  }
}
