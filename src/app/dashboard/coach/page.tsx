'use client'

import { useState, useEffect, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { getUnreadInsights } from '@/lib/ai-insights'
import AiInsightsPanel from '@/components/AiInsightsPanel'
import NotificationBell from '@/components/notifications/NotificationBell'
import { usePushNotifications } from '@/hooks/usePushNotifications'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", green:"#22c55e", greenDim:"#22c55e15", pink:"#f472b6",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const CLIENT_COLORS = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]

// Always-visible nav — things you touch every session
const NAV_ESSENTIALS = [
  { label:'Reviews',    icon:'⏰', path:'/dashboard/coach/reviews'  },
  { label:'Messages',   icon:'💬', path:'/dashboard/coach/messages'  },
  { label:'Client Load',icon:'📊', path:'/dashboard/coach/load'      },
  { label:'Community',  icon:'🏘️', path:'/dashboard/coach/community' },
  { label:'Programs',   icon:'📋', path:'/dashboard/coach/programs'  },
  { label:'Workouts',   icon:'💪', path:'/dashboard/coach/workouts'  },
]

// Shown when expanded — tools you need occasionally
const NAV_EXPANDED = [
  { label:'Outreach',    icon:'📣', path:'/dashboard/coach/outreach'  },
  { label:'Calendar',    icon:'📅', path:'/dashboard/coach/calendar'   },
  { label:'Resources',   icon:'📚', path:'/dashboard/coach/resources'  },
  { label:'Check-ins',   icon:'✅', path:'/dashboard/coach/checkins'   },
  { label:'AI Insights', icon:'🧠', path:'/dashboard/coach/insights'   },
  { label:'Exercises',   icon:'🏋️', path:'/dashboard/coach/exercises'  },
  { label:'Forms',       icon:'📝', path:'/dashboard/coach/onboarding' },
  { label:'Plans',       icon:'💳', path:'/dashboard/coach/plans'      },
]

type CoachClient = {
  display_name?: string | null
  client_type?: string | null
  training_type?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  id: string
  profile_id?: string | null
  paused?: boolean | null
  flagged?: boolean | null
  start_date?: string | null
  last_checkin_at?: string | null
  profile?: { full_name?: string | null; email?: string | null; avatar_url?: string | null } | null
}

type CoachProfile = {
  id: string
  full_name?: string | null
}

type ReviewQueueSession = {
  id: string
  title: string
  review_due_at: string
  completed_at: string
  client?: { profile?: { full_name?: string | null } | null } | null
}

type DashboardInsight = Awaited<ReturnType<typeof getUnreadInsights>>[number]

type InsightQueueItem = {
  id: string
  category?: string | null
  severity?: string | null
  content?: { title?: string | null; suggested_action?: string | null } | null
}

type InboxMessage = {
  sender_id: string
  body?: string | null
  created_at: string
}

type RecentSession = {
  id: string
  client_id: string
  title: string
  completed_at: string
  session_rpe?: number | null
}

type SessionExerciseRow = {
  session_id: string
  exercise_name?: string | null
  original_exercise_name?: string | null
  swap_reason?: string | null
  skip_reason?: string | null
  skipped?: boolean | null
}

type QueueItem = {
  id: string
  type: 'review' | 'insight' | 'message' | 'checkin' | 'friction'
  priority: number
  title: string
  detail: string
  action: string
  color: string
  onClick: () => void
}

const truncate = (value: string | null | undefined, max = 72) => {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max - 1)}…` : value
}

const getDaysSince = (iso: string | null | undefined) => {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

const formatCheckInGap = (iso: string | null | undefined) => {
  const days = getDaysSince(iso)
  if (days === null) return 'No check-in logged yet'
  if (days <= 0) return 'Checked in today'
  if (days === 1) return 'Last check-in 1 day ago'
  return `Last check-in ${days} days ago`
}

// Workout review urgency — based on time remaining until review_due_at (24hr SLA)
// red: overdue or <2hrs left · yellow: 2-8hrs left · green: 8+hrs left
type ReviewUrgency = 'red' | 'yellow' | 'green'
const getReviewUrgency = (dueAt: string | null | undefined): ReviewUrgency => {
  if (!dueAt) return 'green'
  const hoursLeft = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursLeft < 2) return 'red'
  if (hoursLeft < 8) return 'yellow'
  return 'green'
}
const formatReviewTimeLeft = (dueAt: string | null | undefined): string => {
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

const queueTypeLabel: Record<QueueItem['type'], string> = {
  review: 'Review',
  insight: 'Insight',
  message: 'Message',
  checkin: 'Check-in',
  friction: 'Friction',
}

const queueTypeColor = (type: QueueItem['type']) => {
  switch (type) {
    case 'review': return { color: t.red, bg: t.redDim }
    case 'insight': return { color: t.purple, bg: t.purpleDim }
    case 'message': return { color: t.teal, bg: t.tealDim }
    case 'checkin': return { color: t.yellow, bg: `${t.yellow}15` }
    case 'friction': return { color: t.orange, bg: t.orangeDim }
  }
}

export default function CoachDashboard() {
  const [profile,  setProfile]  = useState<CoachProfile | null>(null)
  usePushNotifications(profile?.id ?? null)
  const [clients,  setClients]  = useState<CoachClient[]>([])
  const [loading,  setLoading]  = useState(true)
  const [aiInsights, setAiInsights] = useState<DashboardInsight[]>([])
  const [showInsights, setShowInsights] = useState(false)
  const [lifecycleClient, setLifecycleClient] = useState<CoachClient | null>(null)
  const [lifecycleAction, setLifecycleAction] = useState<'pause'|'resume'|'archive'|'delete'|null>(null)
  const [lifecycleReason, setLifecycleReason] = useState('')
  const [lifecycleLoading, setLifecycleLoading] = useState(false)
  const [clientFilter, setClientFilter] = useState<'active'|'paused'>('active')
  const [clientSearch, setClientSearch] = useState('')
  const [navExpanded, setNavExpanded] = useState(false)
  const [pendingReviews, setPendingReviews] = useState(0)
  const [reviewUrgency, setReviewUrgency] = useState<{red:number, yellow:number, green:number}>({red:0, yellow:0, green:0})
  const [checkInsDue,    setCheckInsDue]    = useState(0)
  const [pendingCheckins, setPendingCheckins] = useState(0)
  const [unreadMsgs,     setUnreadMsgs]     = useState(0)
  const [actionQueue,    setActionQueue]    = useState<QueueItem[]>([])
  const [dismissedQueueIds, setDismissedQueueIds] = useState<Set<string>>(new Set())
  const [attentionClients, setAttentionClients] = useState<CoachClient[]>([])
  const [weeklyDigests, setWeeklyDigests]   = useState<any[]>([])
  const [digestExpanded, setDigestExpanded] = useState<string|null>(null)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single()
      setProfile(prof)

      // Load dismissed action queue IDs from localStorage (per-coach, expires after 7 days)
      const dismissKey = `srg_dismissed_queue_${user.id}`
      let dismissed = new Set<string>()
      try {
        const raw = localStorage.getItem(dismissKey)
        if (raw) {
          const parsed = JSON.parse(raw) as { ids: string[]; expiresAt: number }
          if (parsed.expiresAt > Date.now()) {
            dismissed = new Set(parsed.ids)
          } else {
            localStorage.removeItem(dismissKey)
          }
        }
      } catch { /* ignore corrupt state */ }
      setDismissedQueueIds(dismissed)
      const { data: clientList } = await supabase
        .from('clients')
        .select(`*, display_name, client_type, training_type, contact_email, contact_phone, profile:profiles!profile_id(full_name, email, avatar_url)`)
        .eq('coach_id', user.id)
        .neq('archived', true)
      const safeClientList = (clientList || []) as CoachClient[]
      setClients(safeClientList)
      const insights = await getUnreadInsights(user.id)
      setAiInsights(insights)
      // Pending workout reviews + urgency breakdown
      const { data: allPendingReviews } = await supabase
        .from('workout_sessions')
        .select('id, review_due_at')
        .eq('coach_id', user.id)
        .eq('status', 'completed')
        .is('coach_reviewed_at', null)
        .not('review_due_at', 'is', null)
      const pendingReviewsData = allPendingReviews || []
      setPendingReviews(pendingReviewsData.length)
      // Count by urgency bucket
      const urgencyBreakdown = { red: 0, yellow: 0, green: 0 }
      for (const r of pendingReviewsData) {
        urgencyBreakdown[getReviewUrgency(r.review_due_at)]++
      }
      setReviewUrgency(urgencyBreakdown)

      // Pending check-ins: forms assigned + not yet completed
      const { count: pendingCi } = await supabase
        .from('client_form_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .eq('status', 'pending')
        .not('checkin_schedule_id', 'is', null)
      setPendingCheckins(pendingCi || 0)

      // Check-ins due: clients whose last check-in was > 7 days ago or never
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0]
      const { count: ciDue } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', user.id)
        .neq('archived', true)
        .eq('paused', false)
        .neq('training_type', 'in_person')
        .or(`last_checkin_at.is.null,last_checkin_at.lte.${sevenDaysAgoStr}`)
      setCheckInsDue(ciDue || 0)

      // Unread messages from clients
      const { count: msgCount } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .eq('read', false)
      setUnreadMsgs(msgCount || 0)

      const reviewWindowStart = new Date()
      reviewWindowStart.setDate(reviewWindowStart.getDate() - 14)

      const [reviewSessionsRes, unreadInsightsRes, unreadMessagesRes, recentSessionsRes] = await Promise.all([
        supabase
          .from('workout_sessions')
          .select(`id, title, review_due_at, completed_at, client:clients!workout_sessions_client_id_fkey(id, profile:profiles!clients_profile_id_fkey(full_name))`)
          .eq('coach_id', user.id)
          .eq('status', 'completed')
          .is('coach_reviewed_at', null)
          .not('review_due_at', 'is', null)
          .order('review_due_at', { ascending: true })
          .limit(5),
        supabase
          .from('ai_insights')
          .select('id, client_id, category, severity, generated_at, content')
          .eq('coach_id', user.id)
          .eq('action_status', 'unread')
          .eq('is_dismissed', false)
          .order('generated_at', { ascending: false })
          .limit(6),
        supabase
          .from('messages')
          .select('sender_id, body, created_at')
          .eq('recipient_id', user.id)
          .eq('read', false)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('workout_sessions')
          .select('id, client_id, title, completed_at, session_rpe')
          .eq('coach_id', user.id)
          .eq('status', 'completed')
          .gte('completed_at', reviewWindowStart.toISOString())
          .order('completed_at', { ascending: false })
          .limit(12),
      ])

      const clientNameByProfileId = new Map(
        safeClientList
          .filter((client) => client.profile_id)
          .map((client) => [client.profile_id as string, client.profile?.full_name || 'Client'])
      )

      // Attention clients — going quiet or watch (7+ days no check-in)
      const attentionList = safeClientList
        .filter((client) => !client.paused)
        .filter((client) => client.training_type !== 'in_person')
        .filter((client) => {
          const gap = getDaysSince(client.last_checkin_at)
          return gap === null || gap >= 7
        })
        .sort((a, b) => {
          const aGap = getDaysSince(a.last_checkin_at)
          const bGap = getDaysSince(b.last_checkin_at)
          if (aGap === null) return -1
          if (bGap === null) return 1
          return bGap - aGap
        })
      setAttentionClients(attentionList)

      const recentSessions = (recentSessionsRes.data || []) as RecentSession[]
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
          .map((session) => {
            const friction = frictionBySession.get(session.id)
            if (!friction || (!friction.swaps && !friction.skips)) return null
            const totalFriction = friction.swaps + friction.skips
            return {
              id: `friction-${session.id}`,
              type: 'friction' as const,
              priority: 72 + Math.min(totalFriction * 3, 12),
              title: `${safeClientList.find((client) => client.id === session.client_id)?.profile?.full_name || 'Client'} hit workout friction`,
              detail: `${friction.skips ? `${friction.skips} skip${friction.skips === 1 ? '' : 's'}` : ''}${friction.skips && friction.swaps ? ' · ' : ''}${friction.swaps ? `${friction.swaps} swap${friction.swaps === 1 ? '' : 's'}` : ''}${friction.reasons[0] ? ` · ${truncate(friction.reasons[0], 38)}` : ''}`,
              action: 'Review session',
              color: t.orange,
              onClick: () => router.push('/dashboard/coach/reviews'),
            }
          })
          .filter(Boolean)
          .map((item) => item as QueueItem)
          .slice(0, 3)
      }

      const queueItems: QueueItem[] = [
        ...((reviewSessionsRes.data || []) as ReviewQueueSession[]).map((session) => {
          const urgency = getReviewUrgency(session.review_due_at)
          const timeLeft = formatReviewTimeLeft(session.review_due_at)
          const urgencyColor = urgency === 'red' ? t.red : urgency === 'yellow' ? t.yellow : t.green
          const urgencyIcon  = urgency === 'red' ? '🔴' : urgency === 'yellow' ? '🟡' : '🟢'
          return {
            id: `review-${session.id}`,
            type: 'review' as const,
            priority: urgency === 'red' ? 100 : urgency === 'yellow' ? 90 : 80,
            title: `${session.client?.profile?.full_name || 'Client'} workout review ${urgencyIcon}`,
            detail: `${session.title} · ${timeLeft} · ${new Date(session.completed_at).toLocaleDateString([], { month:'short', day:'numeric' })}`,
            action: 'Open review',
            color: urgencyColor,
            onClick: () => router.push('/dashboard/coach/reviews'),
          }
        }),
        ...((unreadInsightsRes.data || []) as InsightQueueItem[]).map((insight) => ({
          id: `insight-${insight.id}`,
          type: 'insight' as const,
          priority: insight.severity === 'urgent' ? 95 : insight.severity === 'high' ? 80 : 60,
          title: insight.content?.title || 'New coaching insight',
          detail: insight.content?.suggested_action || insight.category || 'Review this client insight',
          action: 'Open insight',
          color: insight.severity === 'urgent' || insight.severity === 'high' ? t.orange : t.purple,
          onClick: () => router.push('/dashboard/coach/insights'),
        })),
        ...((unreadMessagesRes.data || []) as InboxMessage[]).slice(0, 4).map((message, index) => ({
          id: `message-${message.sender_id}-${index}`,
          type: 'message' as const,
          priority: 70 - index,
          title: `${clientNameByProfileId.get(message.sender_id) || 'Client'} needs a reply`,
          detail: truncate(message.body || 'Unread client message'),
          action: 'Open inbox',
          color: t.teal,
          onClick: () => router.push('/dashboard/coach/messages'),
        })),
        ...frictionQueueItems,
      ]
        .filter((item) => !dismissed.has(item.id))
        .sort((a, b) => b.priority - a.priority)
        .slice(0, 8)

      setActionQueue(queueItems)

      // Fetch this week's digest (generated by send-weekly-digest Edge Function)
      const thisMonday = (() => {
        const d = new Date()
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)) // ISO Monday
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })()
      const { data: digestData } = await supabase
        .from('weekly_digests')
        .select('*')
        .eq('coach_id', user.id)
        .eq('week_start', thisMonday)
        .order('created_at', { ascending: false })
      setWeeklyDigests(digestData || [])

      setLoading(false)
    }
    void load()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Persist dismissed action queue IDs to localStorage (per-coach, 7-day expiry)
  // Expiry auto-clears stale dismissals so the queue stays meaningful over time
  const persistDismissals = (ids: Set<string>) => {
    if (!profile?.id) return
    const key = `srg_dismissed_queue_${profile.id}`
    const payload = { ids: Array.from(ids), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }
    try { localStorage.setItem(key, JSON.stringify(payload)) } catch { /* ignore quota errors */ }
  }

  const dismissQueueItem = (id: string) => {
    setDismissedQueueIds(prev => {
      const next = new Set(prev); next.add(id); persistDismissals(next); return next
    })
    setActionQueue(prev => prev.filter(q => q.id !== id))
  }

  const clearAllQueue = () => {
    const allIds = new Set([...dismissedQueueIds, ...actionQueue.map(q => q.id)])
    setDismissedQueueIds(allIds)
    persistDismissals(allIds)
    setActionQueue([])
  }

  const confirmLifecycle = async () => {
    if (!lifecycleClient || !lifecycleAction) return
    setLifecycleLoading(true)
    const id = lifecycleClient.id
    if (lifecycleAction === 'pause') {
      await supabase.from('clients').update({ paused: true, active: true, paused_at: new Date().toISOString(), pause_reason: lifecycleReason || null }).eq('id', id)
      setClients(p => p.map(c => c.id === id ? { ...c, paused: true, pause_reason: lifecycleReason } : c))
    } else if (lifecycleAction === 'resume') {
      await supabase.from('clients').update({ paused: false, paused_at: null, pause_reason: null }).eq('id', id)
      setClients(p => p.map(c => c.id === id ? { ...c, paused: false } : c))
    } else if (lifecycleAction === 'archive') {
      await supabase.from('clients').update({ active: false, archived: true, archived_at: new Date().toISOString() }).eq('id', id)
      setClients(p => p.filter(c => c.id !== id))
    } else if (lifecycleAction === 'delete') {
      await supabase.from('clients').delete().eq('id', id)
      setClients(p => p.filter(c => c.id !== id))
    }
    setLifecycleLoading(false)
    setLifecycleClient(null)
    setLifecycleAction(null)
    setLifecycleReason('')
  }


  const NavBtn = ({ item }: { item: { label:string, icon:string, path:string } }) => (
    <button onClick={()=>router.push(item.path)}
      style={{ display:'flex', alignItems:'center', gap:7, padding:'11px 12px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceUp, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, width:'100%', minWidth:0 }}
      onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceHigh)}
      onMouseLeave={e=>(e.currentTarget.style.background=t.surfaceUp)}>
      <span style={{ fontSize:15, flexShrink:0 }}>{item.icon}</span>
      <span style={{ fontSize:12, fontWeight:600, color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{item.label}</span>
    </button>
  )

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  const filteredClients = clients
    .filter(c => clientFilter === 'active' ? !c.paused : c.paused)
    .filter((client) => {
      const needle = clientSearch.trim().toLowerCase()
      if (!needle) return true
      const haystack = `${client.profile?.full_name || ''} ${client.profile?.email || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
    .sort((a, b) => {
      const aPriority = (a.flagged ? 2 : 0) + (!a.paused ? 1 : 0)
      const bPriority = (b.flagged ? 2 : 0) + (!b.paused ? 1 : 0)
      if (aPriority !== bPriority) return bPriority - aPriority
      return (a.profile?.full_name || '').localeCompare(b.profile?.full_name || '')
    })

  const reviewFlowColor = reviewUrgency.red > 0 ? t.red
                        : reviewUrgency.yellow > 0 ? t.yellow
                        : reviewUrgency.green > 0 ? t.green
                        : t.green
  const reviewFlowBg    = reviewUrgency.red > 0 ? t.redDim
                        : reviewUrgency.yellow > 0 ? t.yellow+'15'
                        : reviewUrgency.green > 0 ? t.greenDim
                        : t.greenDim
  const reviewFlowDetail = pendingReviews > 0
    ? `${reviewUrgency.red > 0 ? `🔴 ${reviewUrgency.red} urgent · ` : ''}${reviewUrgency.yellow > 0 ? `🟡 ${reviewUrgency.yellow} due soon · ` : ''}${reviewUrgency.green > 0 ? `🟢 ${reviewUrgency.green} on track` : ''}`.replace(/·\s*$/, '')
    : 'No overdue workout feedback right now.'

  const coachFlowCards = [
    {
      id: 'reviews',
      eyebrow: 'Start here',
      title: pendingReviews > 0 ? `${pendingReviews} review${pendingReviews === 1 ? '' : 's'} waiting` : 'Reviews are under control',
      detail: reviewFlowDetail,
      color: reviewFlowColor,
      bg: reviewFlowBg,
      action: pendingReviews > 0 ? 'Open reviews' : 'View reviews',
      onClick: () => router.push('/dashboard/coach/reviews'),
    },
    {
      id: 'messages',
      eyebrow: 'Client touchpoints',
      title: unreadMsgs > 0 ? `${unreadMsgs} unread client message${unreadMsgs === 1 ? '' : 's'}` : 'Inbox is clear',
      detail: unreadMsgs > 0 ? 'Reply to the most urgent client threads before programming work.' : 'Use messages for proactive outreach and quick support.',
      color: t.teal,
      bg: t.tealDim,
      action: 'Open messages',
      onClick: () => router.push('/dashboard/coach/messages'),
    },
    {
      id: 'insights',
      eyebrow: 'Coach AI',
      title: aiInsights.length > 0 ? `${aiInsights.length} unread AI insight${aiInsights.length === 1 ? '' : 's'}` : 'Insights are quiet',
      detail: aiInsights.length > 0 ? 'Use AI flags to spot low adherence, recovery risk, and churn early.' : 'No unread coach insights right now.',
      color: t.purple,
      bg: t.purpleDim,
      action: 'Open insights',
      onClick: () => router.push('/dashboard/coach/insights'),
    },
  ]

  const todayFocus = actionQueue[0]

  return (
    <>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};overflow-x:hidden;}
        button{-webkit-tap-highlight-color:transparent;}
        .coach-quicknav{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap;}
        .coach-quicknav-btn{display:flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;border:1px solid var(--border);background:var(--surfaceUp);cursor:pointer;font-family:'DM Sans',sans-serif;white-space:nowrap;flex-shrink:0;}
        .coach-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;}
        .coach-flow{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}
        .coach-main{display:grid;grid-template-columns:1fr;gap:20px;align-items:start;}
        .coach-sidebar{display:none;}
        .client-actions{display:flex;gap:5px;flex-shrink:0;}
        .nav-grid-essential{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
        .nav-grid-expanded{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;}
        .coach-mobile-nav{display:none;}
        .coach-quicknav-expanded{display:none;}
        @media(min-width:1400px){
          .nav-grid-essential{grid-template-columns:repeat(3,1fr);}
          .nav-grid-expanded{grid-template-columns:repeat(3,1fr);}
        }
        @media(max-width:1100px){
          .coach-main{grid-template-columns:1fr;}
          .coach-flow{grid-template-columns:1fr;}
          .coach-sidebar{display:none;}
          .coach-quicknav{display:none;}
          .coach-mobile-nav{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px;}
        }
        @media(max-width:900px){
          .coach-stats{grid-template-columns:repeat(2,1fr);}
          .coach-mobile-nav{grid-template-columns:repeat(5,1fr);}
        }
        @media(max-width:700px){
          .coach-topbar-name{display:none;}
          .coach-pad{padding:12px!important;}
          .coach-mobile-nav{grid-template-columns:repeat(4,1fr);}
          .coach-stats{grid-template-columns:repeat(2,1fr);gap:8px;}
        }
        @media(max-width:600px){
          .client-row{flex-wrap:wrap;gap:8px;}
          .client-actions{width:100%;justify-content:flex-end;}
          .client-since{display:none;}
          .coach-mobile-nav{grid-template-columns:repeat(4,1fr);}
        }
        @media(max-width:420px){
          .client-actions button .btn-label{display:none;}
          .coach-mobile-nav{grid-template-columns:repeat(3,1fr);}
        }
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 16px', display:'flex', alignItems:'center', height:56, gap:8, position:'relative', zIndex:100 }}>
          <div style={{ fontSize:18, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', flexShrink:0 }}>SRG FIT</div>
          <div style={{ width:1, height:28, background:t.border, margin:'0 8px', flexShrink:0 }} />
          <div style={{ fontSize:14, fontWeight:700, flexShrink:0 }} className="coach-topbar-label">Coach</div>
          <div style={{ flex:1 }} />
          <div style={{ fontSize:13, color:t.textMuted, marginRight:8 }} className="coach-topbar-name">{profile?.full_name}</div>
          {profile?.id && <NotificationBell userId={profile.id} accentColor={t.teal} />}
          <button onClick={()=>setShowInsights(true)} title="AI Coaching Insights"
            style={{ position:'relative', background:aiInsights.length>0?t.purpleDim:'none', border:'1px solid '+(aiInsights.length>0?t.purple+'40':t.border), borderRadius:8, padding:'6px 10px', fontSize:16, cursor:'pointer', marginRight:4, display:'flex', alignItems:'center', flexShrink:0 }}>
            🧠
            {aiInsights.length > 0 && (
              <span style={{ position:'absolute', top:-4, right:-4, background:t.orange, borderRadius:'50%', width:16, height:16, fontSize:9, fontWeight:900, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>{aiInsights.length}</span>
            )}
          </button>
          <button onClick={handleSignOut} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 10px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>Out</button>
        </div>

        <div style={{ padding:28, maxWidth:1200, margin:'0 auto' }} className="coach-pad">

          {/* Greeting */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:26, fontWeight:900, marginBottom:4 }}>{getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋</div>
            <div style={{ fontSize:13, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>

          {/* Desktop quick nav — full-width icon strip under greeting, hidden on mobile */}
          <div className="coach-quicknav">
            {[...NAV_ESSENTIALS, ...NAV_EXPANDED].map(item => (
              <button key={item.label} onClick={()=>router.push(item.path)} className="coach-quicknav-btn"
                style={{ '--border':t.border, '--surfaceUp':t.surfaceUp } as React.CSSProperties}>
                <span style={{ fontSize:16 }}>{item.icon}</span>
                <span style={{ fontSize:12, fontWeight:700, color:t.textDim }}>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile-only quick nav — hidden on desktop where sidebar handles this */}
          <div className="coach-mobile-nav">
            {NAV_ESSENTIALS.map(item => (
              <button key={item.label} onClick={()=>router.push(item.path)}
                style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 6px', borderRadius:12, border:'1px solid '+t.border, background:t.surfaceUp, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%' }}>
                <span style={{ fontSize:20 }}>{item.icon}</span>
                <span style={{ fontSize:10, fontWeight:700, color:t.textDim, whiteSpace:'nowrap' as const }}>{item.label}</span>
              </button>
            ))}
          </div>

          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'20px 20px 18px', marginBottom:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:14, flexWrap:'wrap', marginBottom:14 }}>
              <div>
                <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Coach Flow</div>
                <div style={{ fontSize:18, fontWeight:900 }}>Run the day in the right order</div>
              </div>
              {todayFocus && (
                <button onClick={todayFocus.onClick}
                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Focus now: {todayFocus.action}
                </button>
              )}
            </div>
            <div className="coach-flow">
              {coachFlowCards.map((card) => (
                <button key={card.id} onClick={card.onClick}
                  style={{ background:card.bg, border:'1px solid '+card.color+'30', borderRadius:16, padding:'16px 16px 14px', textAlign:'left', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ fontSize:11, fontWeight:800, color:card.color, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{card.eyebrow}</div>
                  <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>{card.title}</div>
                  <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.55, marginBottom:12 }}>{card.detail}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:card.color }}>{card.action} →</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pending reviews banner with urgency breakdown */}
          {pendingReviews > 0 && (() => {
            const topUrgency = reviewUrgency.red > 0 ? 'red' : reviewUrgency.yellow > 0 ? 'yellow' : 'green'
            const bannerColor = topUrgency === 'red' ? t.red : topUrgency === 'yellow' ? t.yellow : t.green
            const bannerBg    = topUrgency === 'red' ? 'linear-gradient(135deg,#1a0a0a,#1a0808)'
                              : topUrgency === 'yellow' ? 'linear-gradient(135deg,#1a1604,#181404)'
                              : 'linear-gradient(135deg,#0a1a10,#08180c)'
            return (
              <button onClick={()=>router.push('/dashboard/coach/reviews')}
                style={{ width:'100%', display:'flex', alignItems:'center', gap:14, background:bannerBg, border:`1px solid ${bannerColor}50`, borderRadius:14, padding:'14px 18px', cursor:'pointer', marginBottom:24, fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const }}>
                <div style={{ fontSize:28, flexShrink:0 }}>⏰</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:bannerColor, marginBottom:4 }}>
                    {pendingReviews} workout{pendingReviews !== 1 ? 's' : ''} pending review
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const, fontSize:11, fontWeight:700 }}>
                    {reviewUrgency.red > 0 && (
                      <span style={{ color:t.red, background:t.redDim, borderRadius:20, padding:'2px 9px' }}>
                        🔴 {reviewUrgency.red} overdue / urgent
                      </span>
                    )}
                    {reviewUrgency.yellow > 0 && (
                      <span style={{ color:t.yellow, background:t.yellow+'15', borderRadius:20, padding:'2px 9px' }}>
                        🟡 {reviewUrgency.yellow} due soon
                      </span>
                    )}
                    {reviewUrgency.green > 0 && (
                      <span style={{ color:t.green, background:t.greenDim, borderRadius:20, padding:'2px 9px' }}>
                        🟢 {reviewUrgency.green} on track
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize:20, color:bannerColor }}>›</div>
              </button>
            )
          })()}

          {/* Stats */}
          <div className="coach-stats" style={{ marginBottom:28 }}>
            {[
              { label:'Active Clients', val:clients.filter((c)=>!c.paused).length,                      color:t.teal,   icon:'👥' },
              { label:'Flagged',        val:clients.filter(c=>c.flagged).length, color:t.red,    icon:'🚩' },
              { label:'Pending Check-ins',  val:pendingCheckins,                                 color:t.orange, icon:'✅', sub: checkInsDue > 0 ? `${checkInsDue} over 7 days` : null },
              { label:'Unread Msgs',    val:unreadMsgs,                                 color:t.purple, icon:'💬' },
            ].map(s => (
              <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</div>
                </div>
                <div style={{ fontSize:28, fontWeight:900, color:s.color }}>{s.val}</div>
                {s.sub && <div style={{ fontSize:11, fontWeight:700, color:t.red, marginTop:4 }}>⚠️ {s.sub}</div>}
              </div>
            ))}
          </div>

          {actionQueue.length > 0 && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'18px 20px', marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Action Queue</div>
                  <div style={{ fontSize:16, fontWeight:800 }}>What needs your attention right now</div>
                </div>
                <button onClick={clearAllQueue}
                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 12px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Clear all
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {actionQueue.map(item => (
                  <div key={item.id} style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:14, padding:'12px 14px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:item.color, flexShrink:0 }} />
                    <button onClick={item.onClick}
                      style={{ flex:1, minWidth:0, background:'none', border:'none', cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", padding:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                        <div style={{ fontSize:13, fontWeight:800, color:t.text }}>{item.title}</div>
                        <span style={{ fontSize:10, fontWeight:800, color:queueTypeColor(item.type).color, background:queueTypeColor(item.type).bg, borderRadius:999, padding:'3px 7px' }}>
                          {queueTypeLabel[item.type]}
                        </span>
                      </div>
                      <div style={{ fontSize:12, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>{item.detail}</div>
                    </button>
                    <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:item.color, cursor:'pointer', whiteSpace:'nowrap' as const }} onClick={item.onClick}>{item.action} →</div>
                      <button onClick={()=>dismissQueueItem(item.id)}
                        style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:16, lineHeight:1, padding:'0 2px', fontFamily:"'DM Sans',sans-serif" }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Who Needs Attention */}
          {attentionClients.length > 0 && (
            <div style={{ background:t.surface, border:`1px solid ${t.orange}30`, borderRadius:18, padding:'18px 20px', marginBottom:24 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:14, flexWrap:'wrap' as const }}>
                <div>
                  <div style={{ fontSize:12, fontWeight:800, color:t.orange, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:4 }}>Needs Attention</div>
                  <div style={{ fontSize:16, fontWeight:800 }}>
                    {attentionClients.length} client{attentionClients.length !== 1 ? 's' : ''} going quiet
                  </div>
                </div>
                <button onClick={()=>router.push('/dashboard/coach/load')}
                  style={{ background:t.orangeDim, border:`1px solid ${t.orange}40`, borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                  Full Load View →
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {attentionClients.slice(0, 5).map(client => {
                  const days = getDaysSince(client.last_checkin_at)
                  const isNever = days === null
                  const urgency = isNever || days >= 14 ? t.red : days >= 7 ? t.orange : t.yellow
                  const initials = (client.profile?.full_name || '?').split(' ').map((n:string)=>n[0]).join('').slice(0,2)
                  return (
                    <button key={client.id}
                      onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}
                      style={{ width:'100%', background:t.surfaceUp, border:`1px solid ${urgency}25`, borderRadius:12, padding:'11px 14px', display:'flex', alignItems:'center', gap:12, textAlign:'left' as const, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      <div style={{ width:36, height:36, borderRadius:10, background:urgency+'20', border:`1px solid ${urgency}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:urgency, flexShrink:0 }}>
                        {initials}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:800, marginBottom:2 }}>{client.profile?.full_name || 'Client'}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{formatCheckInGap(client.last_checkin_at)}</div>
                      </div>
                      <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                        <span style={{ fontSize:10, fontWeight:800, color:urgency, background:urgency+'15', borderRadius:20, padding:'3px 9px', whiteSpace:'nowrap' as const }}>
                          {isNever ? 'Never checked in' : days >= 14 ? '🔴 Going quiet' : '🟡 Watch'}
                        </span>
                        <span style={{ fontSize:14, color:t.textMuted }}>›</span>
                      </div>
                    </button>
                  )
                })}
                {attentionClients.length > 5 && (
                  <button onClick={()=>router.push('/dashboard/coach/load')}
                    style={{ background:'transparent', border:`1px solid ${t.border}`, borderRadius:10, padding:'9px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    +{attentionClients.length - 5} more → View all in Client Load
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── WEEKLY DIGEST ── */}
          {weeklyDigests.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>
                  📊 Weekly Digest — This Week
                </div>
                <button
                  onClick={async () => {
                    await supabase.from('weekly_digests').update({ seen_at: new Date().toISOString() })
                      .eq('coach_id', profile?.id || '').is('seen_at', null)
                  }}
                  style={{ fontSize:10, color:t.textMuted, background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Mark all read
                </button>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:10 }}>
                {weeklyDigests.map((digest: any) => {
                  const client = clients.find(c => c.id === digest.client_id)
                  const name = client?.profile?.full_name || client?.display_name || 'Client'
                  const firstName = name.split(' ')[0]
                  const isExpanded = digestExpanded === digest.id
                  const flags: string[] = digest.flags || []
                  const flagColor = flags.includes('missed_workouts') || flags.includes('no_checkin') ? t.red
                    : flags.includes('low_energy') || flags.includes('poor_sleep') ? t.orange
                    : flags.includes('new_pr') ? t.green : t.teal
                  const isUnread = !digest.seen_at
                  return (
                    <div key={digest.id}
                      style={{ background:t.surface, border:`1px solid ${isUnread ? flagColor+'40' : t.border}`, borderRadius:14, overflow:'hidden', cursor:'pointer' }}
                      onClick={()=>setDigestExpanded(isExpanded ? null : digest.id)}>
                      {isUnread && <div style={{ height:2, background:`linear-gradient(90deg,${flagColor},${flagColor}80)` }}/>}
                      <div style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom: isExpanded ? 10 : 0 }}>
                          <div style={{ width:34, height:34, borderRadius:'50%', background:flagColor+'18', border:`1px solid ${flagColor}30`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15, fontWeight:800, color:flagColor, flexShrink:0 }}>
                            {firstName[0]}
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ fontSize:13, fontWeight:800 }}>{firstName}</div>
                              {isUnread && <div style={{ width:6, height:6, borderRadius:'50%', background:flagColor, flexShrink:0 }}/>}
                            </div>
                            <div style={{ fontSize:11, color:t.textMuted }}>
                              {digest.workouts_done ?? 0} workout{digest.workouts_done !== 1 ? 's' : ''}
                              {digest.avg_energy != null ? ` · energy ${digest.avg_energy}/5` : ''}
                              {digest.avg_sleep != null ? ` · sleep ${digest.avg_sleep}/5` : ''}
                            </div>
                          </div>
                          <span style={{ fontSize:12, color:t.textMuted }}>{isExpanded ? '▲' : '▼'}</span>
                        </div>
                        {isExpanded && (
                          <>
                            <div style={{ fontSize:13, color:t.textDim, lineHeight:1.6, marginBottom:10, borderTop:`1px solid ${t.border}`, paddingTop:10 }}>
                              {digest.summary}
                            </div>
                            {flags.length > 0 && (
                              <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const, marginBottom:10 }}>
                                {flags.map((f: string) => {
                                  const fc = f === 'new_pr' ? t.green : f.includes('missed') || f.includes('no_') ? t.red : t.orange
                                  const fl = f === 'new_pr' ? '🏆 New PR' : f === 'missed_workouts' ? '⚠️ Missed workouts' : f === 'no_checkin' ? '📭 No check-in' : f === 'low_energy' ? '⚡ Low energy' : f === 'poor_sleep' ? '😴 Poor sleep' : f
                                  return <span key={f} style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:fc+'18', color:fc }}>{fl}</span>
                                })}
                              </div>
                            )}
                            <button onClick={e=>{e.stopPropagation();router.push(`/dashboard/coach/clients/${digest.client_id}`)}}
                              style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'8px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              Open {firstName}'s profile →
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="coach-main">

            {/* LEFT: Clients */}
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden' }}>
              <div style={{ padding:'16px 24px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, flexWrap:'wrap' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
                  <div style={{ fontSize:15, fontWeight:800 }}>
                    Clients <span style={{ fontSize:13, color:t.textMuted, fontWeight:500 }}>
                      ({clients.filter(c=>!c.paused).length} active{clients.filter(c=>c.paused).length > 0 ? ', '+clients.filter(c=>c.paused).length+' paused' : ''})
                    </span>
                  </div>
                  {/* Pulse stats inline */}
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                    {[
                      {
                        label:'Reviews',
                        value: pendingReviews,
                        color: reviewUrgency.red > 0 ? t.red : reviewUrgency.yellow > 0 ? t.yellow : reviewUrgency.green > 0 ? t.green : t.textMuted,
                      },
                      { label:'Messages', value: unreadMsgs, color:t.teal },
                      { label:'Check-ins', value: pendingCheckins, color:t.orange },
                      { label:'Insights', value: aiInsights.length, color:t.purple },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', alignItems:'center', gap:5, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'4px 10px' }}>
                        <span style={{ fontSize:13, fontWeight:900, color:item.color }}>{item.value}</span>
                        <span style={{ fontSize:11, color:t.textMuted }}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent:'flex-end' }}>
                  <input
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    placeholder="Search clients"
                    aria-label="Search clients"
                    style={{ minWidth:180, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 12px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                  />
                  <button onClick={()=>router.push('/dashboard/coach/clients/archived')}
                    style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Archived
                  </button>
                  <button onClick={()=>router.push('/dashboard/coach/invites')}
                    style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Add Client
                  </button>
                </div>
              </div>

              {clients.length === 0 ? (
                <div style={{ padding:'56px', textAlign:'center' }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
                  <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>No clients yet</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Invite your first client to get started</div>
                  <button onClick={()=>router.push('/dashboard/coach/invites')} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 22px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Add Client
                  </button>
                </div>
              ) : (
                <>
                  {/* Filter tabs */}
                  <div style={{ display:'flex', gap:6, padding:'10px 16px', borderBottom:'1px solid '+t.border }}>
                    {(['active','paused'] as const).map(f => (
                      <button key={f} onClick={()=>setClientFilter(f)}
                        style={{ padding:'4px 12px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer', border:'1px solid '+(clientFilter===f?t.teal+'60':t.border), background:clientFilter===f?t.tealDim:'transparent', color:clientFilter===f?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                        {f} ({clients.filter(c => f==='active' ? !c.paused : c.paused).length})
                      </button>
                    ))}
                  </div>

                  {/* Client rows */}
                  {filteredClients.length === 0 ? (
                    <div style={{ padding:'36px 24px', textAlign:'center' }}>
                      <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No clients match this view</div>
                      <div style={{ fontSize:12, color:t.textMuted }}>Try a different filter or search term.</div>
                    </div>
                  ) : filteredClients.map((client, i) => {
                    const initials = (client.profile?.full_name || client.display_name || '?').split(' ').map((n: string) => n[0]).join('')
                    const color = CLIENT_COLORS[i % CLIENT_COLORS.length]
                    return (
                      <div key={client.id}
                        style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 20px', borderBottom: i < filteredClients.length-1 ? '1px solid '+t.border : 'none', transition:'background 0.15s' }}
                        className="client-row"
                        onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ width:42, height:42, borderRadius:13, background:'linear-gradient(135deg,'+color+','+color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#000', flexShrink:0, cursor:'pointer' }}>
                          {initials}
                        </div>
                        <div onClick={()=>router.push('/dashboard/coach/clients/'+client.id)} style={{ flex:1, minWidth:0, cursor:'pointer' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2, flexWrap:'wrap' }}>
                            <span style={{ fontSize:14, fontWeight:700 }}>{client.profile?.full_name || client.display_name || 'Unknown'}</span>
                            {client.training_type === 'in_person' && <span style={{ fontSize:10, fontWeight:800, color:'#8b5cf6', background:'#8b5cf615', border:'1px solid #8b5cf640', borderRadius:4, padding:'1px 6px' }}>In-Person</span>}
                            {client.training_type === 'hybrid'    && <span style={{ fontSize:10, fontWeight:800, color:'#f5a623', background:'#f5a62315', border:'1px solid #f5a62340', borderRadius:4, padding:'1px 6px' }}>Hybrid</span>}
                            {client.training_type === 'remote'    && <span style={{ fontSize:10, fontWeight:800, color:'#00c9b1', background:'#00c9b115', border:'1px solid #00c9b140', borderRadius:4, padding:'1px 6px' }}>Remote</span>}
                            {client.paused   && <span style={{ fontSize:10, fontWeight:800, color:t.orange, background:t.orangeDim, borderRadius:6, padding:'2px 7px' }}>⏸ PAUSED</span>}
                            {client.flagged  && <span style={{ fontSize:10, fontWeight:800, color:t.red, background:t.redDim, borderRadius:6, padding:'2px 7px' }}>🚩</span>}
                          </div>
                          <div style={{ fontSize:12, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{client.profile?.email}</div>
                        </div>
                        <div style={{ fontSize:11, color:t.textMuted, flexShrink:0 }} className="client-since">
                          {client.start_date ? new Date(client.start_date).toLocaleDateString([], { month:'short', year:'numeric' }) : '—'}
                        </div>
                        <div className="client-actions" onClick={e=>e.stopPropagation()}>
                          {client.paused ? (
                            <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('resume') }}
                              style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.green+'40', background:t.greenDim, color:t.green, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>▶ <span className="btn-label">Resume</span></button>
                          ) : (
                            <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('pause') }}
                              style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.orange+'40', background:t.orangeDim, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>⏸ <span className="btn-label">Pause</span></button>
                          )}
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('archive') }}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>📦</button>
                          <button onClick={()=>{ setLifecycleClient(client); setLifecycleAction('delete') }}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                          <button onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>View →</button>
                          <button onClick={()=>router.push('/dashboard/preview/'+client.id)}
                            style={{ padding:'6px 10px', borderRadius:7, fontSize:11, fontWeight:700, border:'1px solid '+t.purple+'40', background:t.purpleDim, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>👁️</button>
                        </div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* RIGHT: Quick access */}
            <div className="coach-sidebar">
            </div>

          </div>{/* end 2-col */}
        </div>
        {/* AI Insights Panel */}
        {showInsights && (
          <AiInsightsPanel
            insights={aiInsights}
            onDismiss={(id) => setAiInsights(prev => prev.filter(i => i.id !== id))}
            onClose={() => setShowInsights(false)}
          />
        )}

        {/* Lifecycle confirm modal */}
        {lifecycleAction && lifecycleClient && (() => {
          const name = lifecycleClient.profile?.full_name || lifecycleClient.display_name || lifecycleClient.profile?.email || 'this client'
          const cfg: Record<string, { icon:string; title:string; desc:string; confirmLabel:string; confirmColor:string; showReason:boolean }> = {
            pause:   { icon:'⏸', title:`Pause ${name}?`, desc:"They won't lose any data. You can resume them any time.", confirmLabel:'Pause Client', confirmColor:t.orange, showReason:true },
            resume:  { icon:'▶', title:`Resume ${name}?`, desc:'Their access will be restored immediately.', confirmLabel:'Resume Client', confirmColor:t.green, showReason:false },
            archive: { icon:'📦', title:`Archive ${name}?`, desc:"All data is kept. They won't be able to log in. You can unarchive later.", confirmLabel:'Archive Client', confirmColor:t.textMuted, showReason:false },
            delete:  { icon:'⚠️', title:`Permanently delete ${name}?`, desc:'This cannot be undone. All data will be deleted.', confirmLabel:'Yes, Delete Everything', confirmColor:t.red, showReason:false },
          }
          const c = cfg[lifecycleAction]
          return (
            <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
              <div style={{ background:t.surface, border:'1px solid '+(lifecycleAction==='delete'?t.red+'60':t.border), borderRadius:20, padding:28, maxWidth:400, width:'100%' }}>
                <div style={{ fontSize:32, textAlign:'center', marginBottom:12 }}>{c.icon}</div>
                <div style={{ fontSize:17, fontWeight:900, textAlign:'center', marginBottom:8 }}>{c.title}</div>
                <div style={{ fontSize:13, color:t.textMuted, textAlign:'center', marginBottom:20, lineHeight:1.6 }}>{c.desc}</div>
                {c.showReason && (
                  <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Reason (optional)</div>
                    <input value={lifecycleReason} onChange={e=>setLifecycleReason(e.target.value)} placeholder="e.g. Taking a break..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' } as CSSProperties} />
                  </div>
                )}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={()=>{ setLifecycleClient(null); setLifecycleAction(null); setLifecycleReason('') }}
                    style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={confirmLifecycle} disabled={lifecycleLoading}
                    style={{ flex:2, background:c.confirmColor, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:lifecycleAction==='delete'?'#fff':'#000', cursor:lifecycleLoading?'not-allowed':'pointer', opacity:lifecycleLoading?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
                    {lifecycleLoading ? 'Please wait...' : c.confirmLabel}
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </>
  )
}