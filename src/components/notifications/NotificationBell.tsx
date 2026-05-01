'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { alpha } from '@/lib/theme'

interface Notification {
  id: string
  notification_type: string
  title: string
  body: string | null
  link_url: string | null
  is_read: boolean
  created_at: string
  data: Record<string, unknown>
}

const TYPE_ICONS: Record<string, string> = {
  message_received:       '💬',
  new_message:            '💬',
  checkin_submitted:      '📋',
  checkin_due:            '📋',
  payment_failed:         '⚠️',
  payment_succeeded:      '✅',
  subscription_canceled:  '❌',
  invite_accepted:        '🎉',
  onboarding_completed:   '🎓',
  client_flagged:         '🚩',
  program_assigned:       '💪',
  pr_achieved:            '🏆',
  milestone:              '🎯',
  call_request:           '📞',
  general:                '🔔',
}

export default function NotificationBell({ userId, accentColor = '#c8f545' }: { userId: string, accentColor?: string }) {
  const supabase = useMemo(() => createClient(), [])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen]     = useState(false)
  const [loading, setLoading] = useState(true)
  const [nowMs, setNowMs]   = useState(() => Date.now())
  const [panelPos, setPanelPos] = useState({ top: 0, right: 0, width: 340 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelRef  = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.is_read).length

  const t = {
    bg:"var(--bg)", surface:"var(--surface)", surfaceHigh:"var(--surface-high)",
    border:"var(--border)", text:"var(--text)", textDim:"var(--text-dim)", textMuted:"var(--text-muted)",
    accent: accentColor,
  }

  const fetchNotifications = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications(data || [])
    setLoading(false)
  }, [supabase, userId])

  // Calculate fixed position from button rect when opening.
  // We pin the panel near the bell's right edge on wide screens, but clamp
  // to keep both viewport gutters intact. The previous version only clamped
  // the right side, so when the bell sat several elements from the right
  // edge of the screen (coach top bar: bell + brain + Out), the panel's
  // LEFT edge could go off-screen by 50-100px. clamp(left>=8, right>=8) fixes it.
  const handleOpen = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const GUTTER = 8
      const width = Math.min(340, vw - GUTTER * 2)
      // Desired right (anchored to the bell). Then clamp:
      //   right >= GUTTER (don't go off-screen right)
      //   right <= vw - width - GUTTER (don't go off-screen left)
      const desiredRight = vw - rect.right
      const minRight = GUTTER
      const maxRight = vw - width - GUTTER
      const safeRight = Math.max(minRight, Math.min(desiredRight, maxRight))
      setPanelPos({
        top: rect.bottom + 8,
        right: safeRight,
        width,
      })
    }
    setOpen(o => !o)
  }

  useEffect(() => {
    void fetchNotifications()
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'notifications',
        filter: `user_id=eq.${userId}`
      }, (payload) => {
        setNotifications(prev => [payload.new as Notification, ...prev].slice(0, 50))
      })
      .subscribe()

    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => { supabase.removeChannel(channel); document.removeEventListener('mousedown', handleClick) }
  }, [fetchNotifications, supabase, userId])

  useEffect(() => {
    if (!open) return
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [open])

  async function markRead(id: string) {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).eq('id', id)
  }

  async function markAllRead() {
    const ids = notifications.filter(n => !n.is_read).map(n => n.id)
    if (!ids.length) return
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    await supabase.from('notifications').update({ is_read: true, read_at: new Date().toISOString() }).in('id', ids)
  }

  async function handleNotifClick(n: Notification) {
    if (!n.is_read) await markRead(n.id)
    if (n.link_url) window.location.assign(n.link_url)
    else setOpen(false)
  }

  const fmtTime = (iso: string) => {
    const diff = nowMs - new Date(iso).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Bell Button */}
      <button ref={buttonRef} onClick={handleOpen}
        style={{
          position: 'relative', background: open ? t.surfaceHigh : 'none',
          border: `1px solid ${open ? t.border : 'transparent'}`,
          borderRadius: 8, padding: '6px 10px', fontSize: 18,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          transition: 'all 0.15s', WebkitTapHighlightColor: 'transparent',
        }}
        title="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            background: t.accent, color: '#0f0f0f',
            borderRadius: '50%', fontSize: 9, fontWeight: 900,
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans',sans-serif", pointerEvents: 'none',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown — fixed positioning escapes all parent stacking contexts */}
      {open && (
        <div ref={panelRef} style={{
          position: 'fixed',
          top: panelPos.top,
          right: panelPos.right,
          width: panelPos.width, maxHeight: 480,
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: 14, boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
          zIndex: 99999, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          fontFamily: "'DM Sans',sans-serif",
        }}>
          {/* Header */}
          <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: t.text }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead}
                style={{ background: 'none', border: 'none', color: t.accent, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                Mark all read
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: t.textMuted, fontSize: 13 }}>Loading...</div>
            ) : notifications.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 28, marginBottom: 8 }}>🔔</p>
                <p style={{ color: t.textMuted, fontSize: 13, margin: 0 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} onClick={() => handleNotifClick(n)}
                  style={{
                    padding: '12px 16px', borderBottom: `1px solid ${t.border}`,
                    background: n.is_read ? 'transparent' : alpha(t.accent, 4),
                    cursor: n.link_url ? 'pointer' : 'default',
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                  }}
                >
                  <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>
                    {TYPE_ICONS[n.notification_type] || '🔔'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
                      <span style={{ fontWeight: n.is_read ? 600 : 800, fontSize: 13, color: t.text, lineHeight: 1.3 }}>{n.title}</span>
                      {!n.is_read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: t.accent, flexShrink: 0, marginTop: 4 }} />}
                    </div>
                    {n.body && <p style={{ margin: '0 0 4px', fontSize: 12, color: t.textDim, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{n.body}</p>}
                    <span style={{ fontSize: 11, color: t.textMuted }}>{fmtTime(n.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
