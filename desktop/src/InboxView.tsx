import { useEffect, useState, useCallback, useRef } from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import { supabase } from './supabase'
import { buildCoachInbox, type QueueItem } from '../../src/lib/coach-inbox'
import { t, semanticColorHex, queueTypeLabel, queueTypeChip } from './theme'

const POLL_INTERVAL_MS = 60_000
const SITE_BASE = 'https://srgfit.app'

type Counts = {
  pendingReviews: number
  pendingCheckins: number
  unreadMsgs: number
  reviewUrgency: { red: number; yellow: number; green: number }
  checkInsDue: number
}

export default function InboxView({
  coachUserId,
  coachName,
  onSignOut,
}: {
  coachUserId: string
  coachName: string
  onSignOut: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [counts, setCounts] = useState<Counts>({
    pendingReviews: 0,
    pendingCheckins: 0,
    unreadMsgs: 0,
    reviewUrgency: { red: 0, yellow: 0, green: 0 },
    checkInsDue: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const mountedRef = useRef(true)

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      const inbox = await buildCoachInbox(supabase, coachUserId)
      if (!mountedRef.current) return
      setQueue(inbox.queue)
      setCounts({
        pendingReviews: inbox.pendingReviews,
        pendingCheckins: inbox.pendingCheckins,
        unreadMsgs: inbox.unreadMsgs,
        reviewUrgency: inbox.reviewUrgency,
        checkInsDue: inbox.checkInsDue,
      })
      setLastRefreshed(new Date())
      setError(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load inbox'
      if (mountedRef.current) setError(msg)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [coachUserId])

  useEffect(() => {
    mountedRef.current = true
    void refresh()
    const id = window.setInterval(() => void refresh(), POLL_INTERVAL_MS)
    return () => {
      mountedRef.current = false
      window.clearInterval(id)
    }
  }, [refresh])

  const openItem = (item: QueueItem) => {
    // Open in the user's default browser (Chrome with their existing cookies).
    void openUrl(`${SITE_BASE}${item.href}`)
  }

  const fmtTime = (d: Date | null) => {
    if (!d) return '—'
    const h = String(d.getHours()).padStart(2, '0')
    const m = String(d.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  const typeCounts = queue.reduce<Record<string, number>>((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1
    return acc
  }, {})

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top strip */}
      <div
        style={{
          background: t.surface,
          borderBottom: `1px solid ${t.border}`,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 900,
            background: `linear-gradient(135deg, ${t.teal}, ${t.orange})`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          SRG FIT
        </div>
        <div style={{ width: 1, height: 18, background: t.border }} />
        <div style={{ fontSize: 12, fontWeight: 700, color: t.textDim }}>{coachName}</div>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 10, color: t.textMuted }}>
          Last refresh {fmtTime(lastRefreshed)}
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          title="Refresh now"
          style={{
            background: t.surfaceUp,
            border: `1px solid ${t.border}`,
            borderRadius: 8,
            padding: '5px 9px',
            fontSize: 11,
            fontWeight: 700,
            color: t.textDim,
            cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          {refreshing ? '…' : '↻'}
        </button>
        <button
          onClick={onSignOut}
          style={{
            background: t.redDim,
            border: `1px solid ${t.red}40`,
            borderRadius: 8,
            padding: '5px 9px',
            fontSize: 11,
            fontWeight: 700,
            color: t.red,
            cursor: 'pointer',
          }}
        >
          Out
        </button>
      </div>

      {/* Stats density bar */}
      <div
        style={{
          background: t.surface,
          borderBottom: `1px solid ${t.border}`,
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {[
          { label: 'Reviews', val: counts.pendingReviews, color: t.red },
          { label: 'Check-ins', val: counts.pendingCheckins, color: t.orange, sub: counts.checkInsDue > 0 ? `${counts.checkInsDue} stale` : null },
          { label: 'Unread', val: counts.unreadMsgs, color: t.purple },
          { label: 'Inbox', val: queue.length, color: t.teal },
        ].map((s, i) => (
          <div
            key={s.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              paddingRight: 12,
              borderRight: i < 3 ? `1px solid ${t.border}` : 'none',
            }}
          >
            <span
              style={{
                fontSize: 16,
                fontWeight: 900,
                color: s.color,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {s.val}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: t.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {s.label}
            </span>
            {s.sub && (
              <span style={{ fontSize: 9, fontWeight: 700, color: t.red }}>· {s.sub}</span>
            )}
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: t.textMuted, fontSize: 12 }}>
            Loading inbox...
          </div>
        ) : error ? (
          <div
            style={{
              background: t.redDim,
              border: `1px solid ${t.red}40`,
              borderRadius: 12,
              padding: 14,
              fontSize: 12,
              color: t.red,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Could not load inbox</div>
            <div style={{ color: t.text }}>{error}</div>
          </div>
        ) : queue.length === 0 ? (
          <div
            style={{
              background: t.surface,
              border: `1px solid ${t.border}`,
              borderRadius: 16,
              padding: 28,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 28, marginBottom: 6 }}>🎯</div>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>Inbox is clear</div>
            <div style={{ fontSize: 11, color: t.textMuted }}>
              Nothing urgent right now. Use this time for proactive outreach.
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 10,
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  color: t.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginRight: 4,
                }}
              >
                Today's coaching
              </div>
              {Object.entries(typeCounts).map(([type, n]) => {
                const chip = queueTypeChip(type as QueueItem['type'])
                return (
                  <span
                    key={type}
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      color: chip.color,
                      background: chip.bg,
                      borderRadius: 999,
                      padding: '2px 7px',
                    }}
                  >
                    {n} {queueTypeLabel[type as QueueItem['type']]}
                    {n === 1 ? '' : 's'}
                  </span>
                )
              })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {queue.map((item) => {
                const chip = queueTypeChip(item.type)
                const dotColor = semanticColorHex[item.color]
                return (
                  <button
                    key={item.id}
                    onClick={() => openItem(item)}
                    style={{
                      width: '100%',
                      background: t.surfaceUp,
                      border: `1px solid ${t.border}`,
                      borderRadius: 12,
                      padding: '10px 12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      cursor: 'pointer',
                      textAlign: 'left',
                      color: t.text,
                    }}
                  >
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: dotColor,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          marginBottom: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 800, color: t.text }}>
                          {item.title}
                        </div>
                        <span
                          style={{
                            fontSize: 9,
                            fontWeight: 800,
                            color: chip.color,
                            background: chip.bg,
                            borderRadius: 999,
                            padding: '2px 6px',
                          }}
                        >
                          {queueTypeLabel[item.type]}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: t.textMuted,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.detail}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: dotColor,
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {item.action} →
                    </div>
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
