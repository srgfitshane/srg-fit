'use client'
// Coach-side triage for client-reported issues (public.issue_reports).
// Surface fed by the new "Report an Issue" card on the client Connect
// hub. Lives separate from messages so it doesn't pollute the DM
// thread and gives a clean spot to hang an agent triage flow later.
//
// Layout mirrors other small coach pages (invites, exercises): dark-only,
// ← Back to dashboard, list with per-row actions, visibility refetch.

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { toastError, toastSuccess } from '@/components/ui/Toast'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', yellow:'#f59e0b', yellowDim:'#f59e0b15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
type IssueCategory = 'messaging' | 'logging' | 'bug' | 'other'

type IssueRow = {
  id: string
  client_id: string
  coach_id: string
  category: IssueCategory
  body: string
  status: IssueStatus
  resolved_at: string | null
  created_at: string
  client: { id: string; profile: { full_name: string | null } | null } | null
}

const CATEGORY_LABEL: Record<IssueCategory, string> = {
  messaging: 'Messaging',
  logging: 'Logging',
  bug: 'Bug',
  other: 'Other',
}

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
}

const STATUS_COLOR: Record<IssueStatus, { color: string; bg: string }> = {
  open:        { color: t.red,    bg: t.redDim    },
  in_progress: { color: t.yellow, bg: t.yellowDim },
  resolved:    { color: t.green,  bg: t.greenDim  },
  closed:      { color: t.textMuted, bg: t.surfaceHigh },
}

// Local YYYY-MM-DD HH:MM, avoids the toISOString UTC drift bug (CLAUDE.md rule 7).
const fmtDate = (iso: string) => {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CoachIssuesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [loading, setLoading] = useState(true)
  // 'active' = open + in_progress; 'all' = include resolved/closed too.
  const [filter, setFilter] = useState<'active' | 'all'>('active')
  // Per-row busy guard so spam-tapping doesn't double-fire status updates.
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadIssues = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    let query = supabase
      .from('issue_reports')
      .select('id, client_id, coach_id, category, body, status, resolved_at, created_at, client:clients!issue_reports_client_id_fkey(id, profile:profiles!clients_profile_id_fkey(full_name))')
      .eq('coach_id', user.id)
      .order('created_at', { ascending: false })
    if (filter === 'active') query = query.in('status', ['open', 'in_progress'])
    const { data, error } = await query.limit(100)
    if (error) {
      toastError('Could not load issues: ' + error.message)
      setLoading(false)
      return
    }
    setIssues((data || []) as unknown as IssueRow[])
    setLoading(false)
  }, [supabase, router, filter])

  useEffect(() => { void loadIssues() }, [loadIssues])

  // Visibility refetch -- coach checks an issue on phone, fixes it on
  // desktop, comes back: list reflects the new statuses. Mirrors the
  // 15s-throttled pattern used on messages/checkins/exercises.
  const lastFetchRef = useRef<number>(0)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return
      const now = Date.now()
      if (now - lastFetchRef.current < 15000) return
      lastFetchRef.current = now
      void loadIssues()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [loadIssues])

  // Rule 14: check error, surface failure, revert nothing on the server
  // implicitly. We pre-apply the new status locally for snappy feel, then
  // either confirm or rollback on error.
  const setStatus = async (issue: IssueRow, next: IssueStatus) => {
    if (busyId === issue.id) return
    setBusyId(issue.id)
    const prevStatus = issue.status
    setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: next, resolved_at: next === 'resolved' ? new Date().toISOString() : i.resolved_at } : i))
    const payload: { status: IssueStatus; resolved_at?: string | null } = { status: next }
    if (next === 'resolved') payload.resolved_at = new Date().toISOString()
    if (next === 'open' || next === 'in_progress') payload.resolved_at = null
    const { error } = await supabase.from('issue_reports').update(payload).eq('id', issue.id)
    setBusyId(null)
    if (error) {
      // Rollback the optimistic update and tell the coach why.
      setIssues(prev => prev.map(i => i.id === issue.id ? { ...i, status: prevStatus } : i))
      toastError('Could not update issue: ' + error.message)
      return
    }
    toastSuccess(`Marked ${STATUS_LABEL[next].toLowerCase()}`)
    // If we're on the active filter and the issue moved to resolved/closed,
    // drop it from the visible list so the queue stays tight.
    if (filter === 'active' && (next === 'resolved' || next === 'closed')) {
      setIssues(prev => prev.filter(i => i.id !== issue.id))
    }
  }

  const activeCount = issues.filter(i => i.status === 'open' || i.status === 'in_progress').length

  return (
    <div style={{ minHeight: '100vh', background: t.bg, color: t.text, fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 16px 64px' }}>
        {/* Top bar: back + title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <button onClick={() => router.push('/dashboard/coach')} aria-label="Back to coach dashboard"
            style={{ background: 'none', border: 'none', color: t.teal, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Back
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, gap: 12, flexWrap: 'wrap' as const }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: t.text, marginBottom: 4 }}>Reported Issues</div>
            <div style={{ fontSize: 12, color: t.textMuted }}>
              {loading ? 'Loading...' : activeCount === 0 ? 'No active issues -- nice work' : `${activeCount} active`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['active', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid ' + (filter === f ? t.teal : t.border), background: filter === f ? t.tealDim : t.surface, color: filter === f ? t.teal : t.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                {f === 'active' ? 'Active' : 'All'}
              </button>
            ))}
          </div>
        </div>

        {!loading && issues.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center' as const, background: t.surface, border: '1px solid ' + t.border, borderRadius: 14 }}>
            <div style={{ fontSize: 30, marginBottom: 10 }}>🎉</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>
              {filter === 'active' ? 'No active issues' : 'No issues yet'}
            </div>
            <div style={{ fontSize: 12, color: t.textMuted, lineHeight: 1.6 }}>
              {filter === 'active'
                ? 'Clients haven’t flagged anything that needs attention.'
                : 'When a client taps "Report an Issue" from the Connect hub, it lands here.'}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {issues.map(issue => {
            const status = STATUS_COLOR[issue.status]
            const clientName = issue.client?.profile?.full_name || 'Client'
            const isTerminal = issue.status === 'resolved' || issue.status === 'closed'
            return (
              <div key={issue.id} style={{ background: t.surface, border: '1px solid ' + t.border, borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' as const }}>
                  <span style={{ background: t.surfaceHigh, border: '1px solid ' + t.border, borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: t.textDim, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                    {CATEGORY_LABEL[issue.category]}
                  </span>
                  <span style={{ background: status.bg, border: '1px solid ' + status.color + '60', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 800, color: status.color, letterSpacing: '0.04em', textTransform: 'uppercase' as const }}>
                    {STATUS_LABEL[issue.status]}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.text }}>{clientName}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: t.textMuted }}>{fmtDate(issue.created_at)}</span>
                </div>

                <div style={{ fontSize: 13, color: t.text, lineHeight: 1.55, whiteSpace: 'pre-wrap' as const, marginBottom: 12 }}>
                  {issue.body}
                </div>

                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' as const, alignItems: 'center' }}>
                  {/* Per-status actions. Re-open lets you pull a misfile back. */}
                  {issue.status === 'open' && (
                    <button onClick={() => setStatus(issue, 'in_progress')} disabled={busyId === issue.id}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.yellow, background: t.yellowDim, color: t.yellow, fontSize: 12, fontWeight: 700, cursor: busyId === issue.id ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: busyId === issue.id ? 0.6 : 1 }}>
                      Mark in progress
                    </button>
                  )}
                  {(issue.status === 'open' || issue.status === 'in_progress') && (
                    <>
                      <button onClick={() => setStatus(issue, 'resolved')} disabled={busyId === issue.id}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.green, background: t.greenDim, color: t.green, fontSize: 12, fontWeight: 700, cursor: busyId === issue.id ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: busyId === issue.id ? 0.6 : 1 }}>
                        Resolved
                      </button>
                      <button onClick={() => setStatus(issue, 'closed')} disabled={busyId === issue.id}
                        style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.border, background: 'transparent', color: t.textMuted, fontSize: 12, fontWeight: 700, cursor: busyId === issue.id ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: busyId === issue.id ? 0.6 : 1 }}>
                        Close (won’t fix)
                      </button>
                    </>
                  )}
                  {isTerminal && (
                    <button onClick={() => setStatus(issue, 'open')} disabled={busyId === issue.id}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.border, background: 'transparent', color: t.textDim, fontSize: 12, fontWeight: 700, cursor: busyId === issue.id ? 'wait' : 'pointer', fontFamily: "'DM Sans', sans-serif", opacity: busyId === issue.id ? 0.6 : 1 }}>
                      Re-open
                    </button>
                  )}
                  {/* Quick jump to the client detail for context. */}
                  {issue.client?.id && (
                    <button onClick={() => router.push(`/dashboard/coach/clients/${issue.client!.id}`)}
                      style={{ marginLeft: 'auto', padding: '6px 12px', borderRadius: 8, border: '1px solid ' + t.border, background: t.surfaceHigh, color: t.textDim, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}>
                      Open client →
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
