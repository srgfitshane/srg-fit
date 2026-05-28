'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import RichMessageThread from '@/components/messaging/RichMessageThread'
import { resolveSignedMediaUrl } from '@/lib/media'



const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
  red:"#ef4444",
}

// Skeleton matching the messages sidebar shape so the cold-load flash
// reads as "loading my conversations" instead of a blank dark screen.
function MessagesSkeleton() {
  return (
    <div style={{ background:'#080810', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'16px 18px', borderBottom:'1px solid #252538', height:60, display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:28, height:14, borderRadius:6, background:'#1d1d2e' }} />
        <div style={{ width:80, height:14, borderRadius:6, background:'#1d1d2e' }} />
      </div>
      <div style={{ padding:'10px 12px', display:'flex', flexDirection:'column', gap:8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'#0f0f1a', border:'1px solid #252538', borderRadius:10 }}>
            <div style={{ width:36, height:36, borderRadius:'50%', background:'#1d1d2e' }} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
              <div style={{ width:'40%', height:11, borderRadius:5, background:'#1d1d2e' }} />
              <div style={{ width:'70%', height:9,  borderRadius:5, background:'#161624' }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<MessagesSkeleton />}>
      <MessagesInner />
    </Suspense>
  )
}

function MessagesInner() {
  const [coachId,    setCoachId]    = useState<string | null>(null)
  const [coachName,  setCoachName]  = useState<string>('Coach Shane')
  const [clients,    setClients]    = useState<any[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [unread,     setUnread]     = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const [clientContext, setClientContext] = useState<any>(null)
  const [macros, setMacros] = useState<Array<{ id: string; title: string; body: string }>>([])
  const [macroTitle, setMacroTitle] = useState('')
  const [macroBody, setMacroBody] = useState('')
  const [savingMacro, setSavingMacro] = useState(false)
  const [showMacroEditor, setShowMacroEditor] = useState(false)
  const [showContextDetails, setShowContextDetails] = useState(false)
  // AI Assistant card collapse -- independent of the whole-panel collapse.
  // Persisted to localStorage so Shane's preference sticks across sessions.
  const [aiCardOpen, setAiCardOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try { return window.localStorage.getItem('coach_msg_ai_card_open') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { window.localStorage.setItem('coach_msg_ai_card_open', aiCardOpen ? '1' : '0') } catch {}
  }, [aiCardOpen])

  // AI Assistant state. Replaces the static "Coach Context" sidebar with
  // an on-demand reply-drafting flow. The panel itself collapses to a
  // narrow strip so the thread can have the full width when not in use.
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    try { return window.localStorage.getItem('coach_msg_panel_open') !== '0' } catch { return true }
  })
  useEffect(() => {
    try { window.localStorage.setItem('coach_msg_panel_open', panelOpen ? '1' : '0') } catch {}
  }, [panelOpen])
  const [aiDrafts, setAiDrafts] = useState<Array<{ label: string; body: string }> | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  // Versioned seed -- bumping the id is what triggers RichMessageThread
  // to overwrite its local draft with the chosen suggestion.
  const [seedDraft, setSeedDraft] = useState<{ id: number; text: string } | null>(null)
  // Counter bumped when the page-level realtime listener detects a new
  // message for the currently-active thread. Passed down to RichMessageThread
  // as belt-and-suspenders so the bubble appears even if the thread's
  // own subscription happens to be silent (e.g. just after a tab return).
  const [threadRefreshKey, setThreadRefreshKey] = useState(0)
  const [filter, setFilter] = useState<'all'|'priority'|'unread'|'stale'>('all')
  const [showBroadcast, setShowBroadcast] = useState(false)
  const [broadcastText, setBroadcastText] = useState('')
  const [broadcasting, setBroadcasting] = useState(false)
  const [broadcastDone, setBroadcastDone] = useState(false)
  const router    = useRouter()
  const params    = useSearchParams()
  // Memoize the supabase client. Without this, every re-render spawns a
  // fresh client + new WebSocket -- prior realtime subscriptions get
  // orphaned on the old (now garbage) client, and the new one races to
  // re-subscribe. Symptom: messages don't appear in the sidebar without
  // a hard refresh, which is exactly what Shane reported.
  const supabase  = useMemo(() => createClient(), [])

  const updateClientMetadata = (profileId: string, body?: string | null, createdAt?: string) => {
    const lowered = `${body || ''}`.toLowerCase()
    setClients(prev => prev.map(client => {
      if (client.profile?.id !== profileId) return client
      return {
        ...client,
        lastMessageAt: createdAt || client.lastMessageAt,
        lastClientMessageAt: createdAt || client.lastClientMessageAt,
        lastMessagePreview: body?.trim() || client.lastMessagePreview,
        staleFollowUp: false,
        distress: client.distress || ['hurt', 'pain', 'overwhelmed', 'anxious', 'stressed', 'hungry', 'can’t', 'cant'].some(keyword => lowered.includes(keyword)),
      }
    }))
  }

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  // Refetch client list + unread counts. Fired on mount AND on tab visibility
  // (the coach goes to a thread, swaps apps for 10 min, comes back — without
  // this the unread/preview shown in the sidebar is stale).
  const refreshClients = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCoachId(user.id)
      const { data: coachProf } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      if (coachProf?.full_name) setCoachName(coachProf.full_name)

      const { data: cls } = await supabase
        .from('clients')
        .select(`id, profile:profiles!profile_id(id, full_name, avatar_url)`)
        .eq('coach_id', user.id)
        .eq('active', true)
        .not('profile_id', 'is', null)
        .order('created_at', { ascending: false })
      const normalizedClients = await Promise.all((cls || []).map(async (client: any) => ({
        ...client,
        profile: client.profile ? {
          ...client.profile,
          avatar_url: await resolveSignedMediaUrl(supabase, 'avatars', client.profile.avatar_url),
        } : client.profile,
      })))

      // Count unread per client
      const { data: msgs } = await supabase
        .from('messages')
        .select('sender_id, read, body, created_at')
        .eq('recipient_id', user.id)
        .eq('read', false)
      const counts: Record<string, number> = {}
      for (const m of msgs || []) counts[m.sender_id] = (counts[m.sender_id] || 0) + 1
      setUnread(counts)

      // Time-windowed: the messages list only needs the most-recent
      // message per client + the "stale 72h" check. Pulling all
      // historical messages (months of conversations × ~11 active
      // clients) was multi-MB per visibility refetch and contributed
      // to the May 27 storage/db spike. 60 days covers preview + the
      // stale-followup detection window with plenty of margin.
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
      const { data: allMsgs } = await supabase
        .from('messages')
        .select('sender_id, recipient_id, body, created_at, read')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .gte('created_at', sixtyDaysAgo)
        .order('created_at', { ascending: false })

      const enrichedClients = normalizedClients.map((client: any) => {
        const profileId = client.profile?.id
        const related = (allMsgs || []).filter((message: any) => message.sender_id === profileId || message.recipient_id === profileId)
        const lastMessage = related[0]
        const lastClientMessage = related.find((message: any) => message.sender_id === profileId)
        const preview = lastMessage?.body?.trim() || 'No recent messages'
        const staleHours = lastClientMessage?.created_at
          ? (Date.now() - new Date(lastClientMessage.created_at).getTime()) / (1000 * 60 * 60)
          : null
        const text = `${lastMessage?.body || ''}`.toLowerCase()
        const distress = ['hurt', 'pain', 'overwhelmed', 'anxious', 'stressed', 'hungry', 'can’t', 'cant'].some(keyword => text.includes(keyword))
        return {
          ...client,
          lastMessageAt: lastMessage?.created_at || null,
          lastMessagePreview: preview,
          lastClientMessageAt: lastClientMessage?.created_at || null,
          staleFollowUp: staleHours !== null && staleHours >= 72,
          distress,
        }
      })

      setClients(enrichedClients)

      const { data: savedMacros } = await supabase
        .from('coach_message_macros')
        .select('id, title, body')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: true })

      if (savedMacros?.length) {
        setMacros(savedMacros)
      } else {
        setMacros([
          { id:'default-1', title:'Check-in', body:'Checking in on you. How are recovery, energy, and soreness today?' },
          { id:'default-2', title:'Form Follow-up', body:'I saw your workout come through. Send me a quick note or video if anything felt off technically.' },
          { id:'default-3', title:'Nutrition Nudge', body:'Let’s tighten up protein and meal consistency today. Give me a quick update on how meals are going.' },
        ])
      }

      // Auto-open if ?client= (clients.id) or ?profile= (profiles.id) passed.
      // Notifications fired from RichMessageThread only know the sender's
      // profile id, so they pass ?profile=. Direct deeplinks from the coach
      // dashboard pass ?client= for the clients-table id.
      const pid = params.get('client')
      const profileId = params.get('profile')
      if (pid || profileId) {
        const match = enrichedClients.find((c: any) =>
          (pid && c.id === pid) || (profileId && c.profile?.id === profileId)
        )
        if (match) openThread(user.id, match)
      }
      setLoading(false)
    }

  useEffect(() => {
    refreshClients()
    // Visibility refetch — when the coach returns to the tab after >15s,
    // re-pull the client list so unread counts and last-message previews
    // reflect anything that happened while they were away.
    let lastRefreshAt = 0
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastRefreshAt < 15_000) return
      lastRefreshAt = now
      refreshClients()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Realtime subscription ─────────────────────────────────────────────────
  useEffect(() => {
    if (!coachId) return
    const channel = supabase
      .channel('messages-coach')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${coachId}`,
      }, (payload) => {
        const msg = payload.new as any
        updateClientMetadata(msg.sender_id, msg.body, msg.created_at)
        const active = clients.find(c => c.profile?.id === msg.sender_id)
        if (active && active.id === activeId) {
          markRead(coachId, active.profile.id)
          // Force-refresh the open thread so the new bubble lands even
          // if the thread-level subscription silently dropped this event.
          setThreadRefreshKey(k => k + 1)
        } else {
          setUnread(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [coachId, activeId, clients])

  // ── Open a conversation thread ────────────────────────────────────────────
  const openThread = async (cid: string, client: any) => {
    setActiveId(client.id)
    const profileId = client.profile?.id
    if (!profileId) return

    // Reset AI draft state -- suggestions from the prior conversation
    // shouldn't bleed into this one.
    setAiDrafts(null)
    setAiError(null)
    markRead(cid, profileId)
    setUnread(prev => { const n = { ...prev }; delete n[profileId]; return n })
    loadClientContext(cid, profileId)
  }

  // ── AI Assistant: suggest a reply ──────────────────────────────────────────
  // Pulls last 10 messages in this thread + sends to the server route which
  // injects deterministic client context (workouts, pulse, weight, goal).
  // Returns 2-3 short draft replies for the coach to review and choose from.
  const suggestReplies = async () => {
    if (!coachId || !activeClient?.id || !activeClient.profile?.id) return
    setAiLoading(true)
    setAiError(null)
    try {
      const profileId = activeClient.profile.id
      const { data: recent } = await supabase
        .from('messages')
        .select('body, sender_id, created_at, message_type')
        .or(`and(sender_id.eq.${coachId},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${coachId})`)
        .order('created_at', { ascending: false })
        .limit(12)
      const ordered = (recent || []).reverse().filter((m: any) => m.body && (!m.message_type || m.message_type === 'text'))
      const recentMessages = ordered.map((m: any) => ({
        from: m.sender_id === coachId ? 'coach' : 'client',
        body: m.body,
      }))
      const res = await fetch('/api/ai-message-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: activeClient.id, recentMessages, coachName }),
      })
      const json = await res.json()
      if (!res.ok) {
        setAiError(json.error || 'Could not generate drafts')
        setAiLoading(false)
        return
      }
      setAiDrafts(json.drafts || [])
    } catch (err: any) {
      setAiError(err?.message || 'Network error')
    }
    setAiLoading(false)
  }

  const useDraft = (text: string) => {
    setSeedDraft({ id: Date.now(), text })
    // Keep the panel state, but clear the drafts after use so the
    // coach has a clean slate next time -- they can hit Suggest again.
    setAiDrafts(null)
  }

  const loadClientContext = async (currentCoachId: string, profileId: string) => {
    const [
      { data: recentWorkouts },
      { data: recentPulse },
      { data: recentCheckins },
      { data: recentMessages },
    ] = await Promise.all([
      supabase.from('workout_sessions')
        .select('title, status, completed_at, review_due_at, session_rpe, notes_client')
        .eq('client_id', profileId)
        .order('completed_at', { ascending: false })
        .limit(3),
      supabase.from('daily_checkins')
        .select('checkin_date, sleep_quality, energy_score, mood_emoji, body')
        .eq('client_id', profileId)
        .order('checkin_date', { ascending: false })
        .limit(5),
      supabase.from('checkins')
        .select('submitted_at, wins, struggles')
        .eq('client_id', profileId)
        .order('submitted_at', { ascending: false })
        .limit(3),
      supabase.from('messages')
        .select('body, created_at, sender_id')
        .or(`and(sender_id.eq.${currentCoachId},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${currentCoachId})`)
        .order('created_at', { ascending: false })
        .limit(10),
    ])

    const latestMessage = (recentMessages || []).find((message: any) => message.body?.trim())
    const text = latestMessage?.body?.toLowerCase() || ''
    const unreadCount = unread[profileId] || 0
    const concernSignals = [
      text.includes('hurt') || text.includes('pain') ? 'form issue' : null,
      text.includes('stress') || text.includes('overwhelmed') ? 'emotional support' : null,
      text.includes('meal') || text.includes('protein') || text.includes('hungry') ? 'nutrition help' : null,
      text.includes('schedule') || text.includes('travel') ? 'scheduling' : null,
      unreadCount >= 3 ? 'urgent' : null,
    ].filter(Boolean)

    setClientContext({
      recentWorkouts: recentWorkouts || [],
      recentPulse: recentPulse || [],
      recentCheckins: recentCheckins || [],
      latestMessage: latestMessage?.body || null,
      tags: concernSignals,
    })
  }

  const markRead = async (myId: string, senderId: string) => {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', senderId)
      .eq('recipient_id', myId)
      .eq('read', false)
  }

  const saveMacro = async () => {
    if (!coachId || !macroTitle.trim() || !macroBody.trim()) return
    setSavingMacro(true)
    const { data, error } = await supabase.from('coach_message_macros').insert({
      coach_id: coachId,
      title: macroTitle.trim(),
      body: macroBody.trim(),
    }).select('id, title, body').single()
    if (!error && data) {
      setMacros(prev => [...prev, data])
      setMacroTitle('')
      setMacroBody('')
    }
    setSavingMacro(false)
  }

  const activeClient = clients.find(c => c.id === activeId)

  // Push history state when opening a thread so Android back button closes it
  useEffect(() => {
    if (activeId) {
      window.history.pushState({ activeId }, '')
    }
  }, [activeId])

  // Handle browser/Android back button
  useEffect(() => {
    const handlePopState = () => {
      if (activeId) setActiveId(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [activeId])
  const totalUnread  = Object.values(unread).reduce((a, b) => a + b, 0)
  const clientPriority = (client: any) => {
    const count = unread[client.profile?.id] || 0
    if (count >= 3) return { label: 'Urgent', color: t.red, bg: `${t.red}18` }
    if (count > 0) return { label: 'Needs reply', color: t.orange, bg: `${t.orange}18` }
    return { label: 'Clear', color: t.textMuted, bg: t.surfaceHigh }
  }
  const clientPriorityScore = (client: any) => {
    const unreadCount = unread[client.profile?.id] || 0
    return (
      unreadCount * 10 +
      (client.distress ? 6 : 0) +
      (client.staleFollowUp ? 4 : 0) +
      (client.lastMessageAt ? Math.max(0, 3 - ((Date.now() - new Date(client.lastMessageAt).getTime()) / (1000 * 60 * 60 * 24))) : 0)
    )
  }
  const filteredClients = [...clients]
    .filter(client => {
      if (filter === 'unread') return (unread[client.profile?.id] || 0) > 0
      if (filter === 'priority') return clientPriorityScore(client) >= 6
      if (filter === 'stale') return client.staleFollowUp
      return true
    })
    .sort((a, b) => clientPriorityScore(b) - clientPriorityScore(a))

  // ── Broadcast ─────────────────────────────────────────────────────────────
  const sendBroadcast = async () => {
    if (!broadcastText.trim() || !coachId) return
    setBroadcasting(true)
    const activeClients = clients.filter(c => c.profile?.id)
    for (const client of activeClients) {
      await supabase.from('messages').insert({
        sender_id: coachId,
        recipient_id: client.profile.id,
        body: broadcastText.trim(),
        read: false,
        message_type: 'text',
      })
      // Fire-and-forget push notification
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          },
          body: JSON.stringify({
            user_id: client.profile.id,
            notification_type: 'new_message',
            title: 'Message from Coach Shane',
            body: broadcastText.trim().slice(0, 100),
            link_url: '/dashboard/client?tab=messages',
          })
        }).catch(err => console.warn('[notify:coach-messages] failed', err))
      }
    }
    setBroadcasting(false)
    setBroadcastDone(true)
    setBroadcastText('')
    setTimeout(() => { setShowBroadcast(false); setBroadcastDone(false) }, 2000)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .msg-input::-webkit-scrollbar{width:4px;}
        .msg-input::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
        .msg-bubble{max-width:72%;word-break:break-word;line-height:1.55;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .msg-sidebar{width:280px;flex-shrink:0;}
        .msg-thread{flex:1;min-width:0;}
        .msg-detail-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;flex:1;min-height:0;}
        .msg-context-panel{border-left:1px solid ${t.border};background:${t.surface};padding:16px 14px;overflow-y:auto;}
        @media(max-width:640px){
          .msg-sidebar{width:100%;border-right:none!important;}
          .msg-sidebar-hidden{display:none!important;}
          .msg-thread-hidden{display:none!important;}
          .msg-detail-grid{grid-template-columns:minmax(0,1fr);}
          .msg-context-panel{display:none;}
        }
      `}</style>

      <div style={{ display:'flex', height:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", color:t.text, overflow:'hidden' }}>

        {/* ── LEFT SIDEBAR: Client list ────────────────────────────────── */}
        <div className={`msg-sidebar${activeClient ? ' msg-sidebar-hidden' : ''}`} style={{ borderRight:'1px solid '+t.border, display:'flex', flexDirection:'column' }}>

          {/* Sidebar header */}
          <div style={{ padding:'16px 18px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', gap:10, height:60 }}>
            {/* One-tap back to dashboard. Previously this deselected the
                active thread first, requiring a second tap to leave Messages.
                On desktop the sidebar is always visible so "deselect thread"
                had no nav value -- the list was right there. On mobile this
                button is hidden when a thread is open (sidebar collapses);
                the thread-header back arrow handles that case and already
                goes straight to dashboard. */}
            <button onClick={()=>router.push('/dashboard/coach')}
              aria-label="Back to dashboard"
              style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", padding:0 }}>←</button>
            <div style={{ fontSize:14, fontWeight:800 }}>Messages</div>
            {totalUnread > 0 && (
              <span style={{ background:t.teal, color:'#000', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:900 }}>{totalUnread}</span>
            )}
            <button onClick={()=>setShowBroadcast(true)}
              title="Message all clients"
              style={{ marginLeft:'auto', background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              📣 All
            </button>
          </div>

          <div style={{ display:'flex', gap:6, padding:'10px 12px', borderBottom:'1px solid '+t.border, flexWrap:'wrap' }}>
            {(['all','priority','unread','stale'] as const).map(value => (
              <button
                key={value}
                onClick={()=>setFilter(value)}
                aria-pressed={filter===value}
                style={{ background:filter===value?t.tealDim:'transparent', border:'1px solid '+(filter===value?t.teal+'40':t.border), color:filter===value?t.teal:t.textDim, borderRadius:999, padding:'4px 10px', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}
              >
                {value}
              </button>
            ))}
          </div>

          {/* Client rows */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:20, color:t.textMuted, fontSize:13 }}>Loading...</div>
            ) : clients.length === 0 ? (
              <div style={{ padding:20, color:t.textMuted, fontSize:13 }}>No active clients yet.</div>
            ) : filteredClients.map(c => {
              const isActive = c.id === activeId
              const uCount   = unread[c.profile?.id] || 0
              const priority = clientPriority(c)
              return (
                <div key={c.id} onClick={()=>{ if(coachId) openThread(coachId, c) }}
                  style={{ padding:'12px 18px', cursor:'pointer', display:'flex', alignItems:'center', gap:12,
                    background: isActive ? t.tealDim : 'transparent',
                    borderLeft: '3px solid ' + (isActive ? t.teal : 'transparent'),
                    transition:'all .12s' }}
                  onMouseEnter={e=>{ if(!isActive) e.currentTarget.style.background=t.surfaceUp }}
                  onMouseLeave={e=>{ if(!isActive) e.currentTarget.style.background='transparent' }}>
                  <div style={{ width:36, height:36, borderRadius:'50%', background:t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:t.teal, flexShrink:0, overflow:'hidden' }}>
                    {c.profile?.avatar_url
                      ? <img src={c.profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                      : (c.profile?.full_name?.charAt(0) || '?')}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight: uCount > 0 ? 800 : 600, color: uCount > 0 ? t.text : t.textDim, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {c.profile?.full_name || 'Unknown'}
                    </div>
                    <div style={{ fontSize:10, color: priority.color, marginTop:3 }}>{priority.label}{c.staleFollowUp ? ' · Stale follow-up' : ''}</div>
                    <div style={{ fontSize:10, color:t.textMuted, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                      {c.lastMessagePreview}
                    </div>
                  </div>
                  {uCount > 0 && (
                    <span style={{ background:t.teal, color:'#000', borderRadius:10, padding:'1px 6px', fontSize:10, fontWeight:900, flexShrink:0 }}>{uCount}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── RIGHT PANE: Thread ───────────────────────────────────────── */}
        {activeClient ? (
          <div className="msg-thread" style={{ display:'flex', flexDirection:'column' }}>

            {/* Thread header */}
            <div style={{ height:56, borderBottom:'1px solid '+t.border, padding:'0 16px', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
              {/* Back button — one tap straight to dashboard. The old
                  behavior (deselect to inbox) needed a second back press
                  to actually leave Messages, which is the most common
                  reason coaches hit back on a thread. Thread-switching
                  on mobile still works via the Messages nav or the
                  sidebar on desktop (always visible). */}
              <button onClick={()=>router.push('/dashboard/coach')}
                aria-label="Back to dashboard"
                style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20, lineHeight:1, flexShrink:0, padding:'4px' }}>←</button>
              <div style={{ width:30, height:30, borderRadius:'50%', background:t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:t.teal, overflow:'hidden', flexShrink:0 }}>
                {activeClient.profile?.avatar_url
                  ? <img src={activeClient.profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                  : (activeClient.profile?.full_name?.charAt(0) || '?')}
              </div>
              <div style={{ fontWeight:800, fontSize:14, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeClient.profile?.full_name}</div>
              <button onClick={()=>router.push('/dashboard/coach/clients/'+activeClient.id)}
                aria-label={`Open ${activeClient.profile?.full_name || 'client'} profile`}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                Profile →
              </button>
            </div>

            <div className="msg-detail-grid" style={panelOpen ? undefined : { gridTemplateColumns: '1fr 44px' }}>
              <div style={{ minWidth:0, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
                {coachId && activeClient.profile?.id && (
                  <RichMessageThread
                    myId={coachId}
                    otherId={activeClient.profile.id}
                    otherName={activeClient.profile.full_name || 'Client'}
                    myName={coachName}
                    otherAvatar={activeClient.profile.avatar_url}
                    height="100%"
                    quickReplies={macros}
                    seedDraft={seedDraft}
                    refreshKey={threadRefreshKey}
                  />
                )}
              </div>
              {!panelOpen ? (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', paddingTop:14, gap:10, borderLeft:'1px solid '+t.border, background:t.surface }}>
                  <button onClick={()=>setPanelOpen(true)} aria-label="Open AI assistant panel"
                    title="Open AI assistant"
                    style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:t.teal, fontSize:16 }}>
                    ✨
                  </button>
                </div>
              ) : (
              <div className="msg-context-panel">
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>✨ AI Assistant</div>
                  <button onClick={()=>setPanelOpen(false)} aria-label="Collapse panel" title="Collapse"
                    style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:14, padding:'2px 6px', lineHeight:1 }}>×</button>
                </div>

                {/* AI Suggest replies -- primary action. Card itself is
                    collapsible (independent of the whole-panel collapse)
                    so Shane can hide the AI section but keep saved
                    replies + context visible. */}
                <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:aiCardOpen ? '12px 12px' : '8px 12px', marginBottom:14, transition:'padding 0.15s ease' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:aiCardOpen ? 8 : 0 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:aiCardOpen ? t.text : t.textDim, letterSpacing:'0.02em' }}>
                      AI reply suggestions
                    </div>
                    <button onClick={()=>setAiCardOpen(v=>!v)}
                      aria-label={aiCardOpen ? 'Collapse AI suggestions' : 'Expand AI suggestions'}
                      style={{ background:'none', border:'1px solid '+t.border, borderRadius:6, padding:'2px 7px', fontSize:11, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", lineHeight:1.2 }}>
                      {aiCardOpen ? '−' : '+'}
                    </button>
                  </div>

                  {aiCardOpen && (<>
                  <button onClick={suggestReplies} disabled={aiLoading}
                    style={{ width:'100%', background:aiLoading ? t.surfaceUp : 'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px 12px', fontSize:13, fontWeight:800, color:aiLoading ? t.textMuted : '#000', cursor:aiLoading?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    {aiLoading ? 'Thinking...' : '✨ Suggest a reply'}
                  </button>
                  <div style={{ fontSize:10, color:t.textMuted, marginTop:6, lineHeight:1.4 }}>
                    Reads the last few messages + this client&apos;s recent training, pulse, and weight. You review every draft.
                  </div>

                  {aiError && (
                    <div role="alert" style={{ marginTop:10, background:t.red+'1a', border:'1px solid '+t.red+'66', borderRadius:8, padding:'8px 10px', fontSize:11, color:t.red, lineHeight:1.5 }}>
                      {aiError}
                    </div>
                  )}

                  {aiDrafts && aiDrafts.length > 0 && (
                    <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
                      {aiDrafts.map((d, i) => (
                        <div key={i} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px' }}>
                          <div style={{ fontSize:10, fontWeight:800, color:t.teal, textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:5 }}>
                            {d.label}
                          </div>
                          <div style={{ fontSize:12, color:t.text, lineHeight:1.5, marginBottom:8, whiteSpace:'pre-wrap' as const }}>
                            {d.body}
                          </div>
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={()=>useDraft(d.body)}
                              style={{ flex:1, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'6px 10px', fontSize:11, fontWeight:800, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              Use this
                            </button>
                            <button onClick={()=>{ try { navigator.clipboard.writeText(d.body) } catch {} }}
                              title="Copy to clipboard"
                              style={{ background:'none', border:'1px solid '+t.border, borderRadius:7, padding:'6px 10px', fontSize:11, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              Copy
                            </button>
                          </div>
                        </div>
                      ))}
                      <button onClick={suggestReplies} disabled={aiLoading}
                        style={{ background:'none', border:'1px dashed '+t.border, borderRadius:8, padding:'6px 10px', fontSize:11, fontWeight:700, color:t.textMuted, cursor:aiLoading?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        {aiLoading ? 'Thinking...' : '↻ Regenerate'}
                      </button>
                    </div>
                  )}
                  </>)}
                </div>

                {/* Saved replies (compact) */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Saved replies</div>
                    <button onClick={()=>setShowMacroEditor(v=>!v)}
                      style={{ background:'none', border:'none', color:t.teal, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {showMacroEditor ? '− Cancel' : '+ New'}
                    </button>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:showMacroEditor?10:0 }}>
                    {macros.length === 0 && <span style={{ fontSize:11, color:t.textMuted }}>No saved replies yet.</span>}
                    {macros.map((macro) => (
                      <button key={macro.id} onClick={()=>useDraft(macro.body)}
                        title={macro.body}
                        style={{ padding:'4px 10px', borderRadius:999, background:t.tealDim, color:t.teal, fontSize:11, fontWeight:700, border:'1px solid '+t.teal+'30', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        {macro.title}
                      </button>
                    ))}
                  </div>
                  {showMacroEditor && (
                    <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 10px' }}>
                      <input
                        value={macroTitle}
                        onChange={e=>setMacroTitle(e.target.value)}
                        placeholder="Macro title"
                        aria-label="Macro title"
                        style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', color:t.text, fontSize:12, fontFamily:"'DM Sans',sans-serif", marginBottom:7, boxSizing:'border-box' as const }}
                      />
                      <textarea
                        value={macroBody}
                        onChange={e=>setMacroBody(e.target.value)}
                        placeholder="Saved reply text"
                        aria-label="Macro body"
                        rows={3}
                        style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', color:t.text, fontSize:12, resize:'vertical', fontFamily:"'DM Sans',sans-serif", marginBottom:7, boxSizing:'border-box' as const }}
                      />
                      <button
                        onClick={async ()=>{ await saveMacro(); setShowMacroEditor(false) }}
                        disabled={savingMacro || !macroTitle.trim() || !macroBody.trim()}
                        style={{ width:'100%', background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 10px', fontSize:12, fontWeight:700, color:t.teal, cursor:savingMacro?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:savingMacro ? 0.6 : 1 }}>
                        {savingMacro ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Client context (collapsed by default -- AI uses this; the
                    coach can peek if they want to second-guess) */}
                <div>
                  <button onClick={()=>setShowContextDetails(v=>!v)}
                    style={{ width:'100%', background:'none', border:'none', display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 0', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    <span style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em' }}>Client context</span>
                    <span style={{ fontSize:11, color:t.teal, fontWeight:700 }}>{showContextDetails ? '−' : '+'}</span>
                  </button>
                  {clientContext?.tags?.length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap', gap:5, marginTop:8 }}>
                      {clientContext.tags.map((tag: string) => (
                        <span key={tag} style={{ padding:'3px 8px', borderRadius:999, background:t.tealDim, color:t.teal, fontSize:10, fontWeight:700 }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {showContextDetails && (
                  <div style={{ display:'flex', flexDirection:'column', gap:12, marginTop:10 }}>
                    {clientContext?.latestMessage && (
                      <div>
                        <div style={{ fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Latest message</div>
                        <div style={{ fontSize:11, color:t.textDim, lineHeight:1.5 }}>{clientContext.latestMessage}</div>
                      </div>
                    )}
                    {(clientContext?.recentWorkouts || []).length > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Recent workouts</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {clientContext.recentWorkouts.slice(0, 3).map((workout: any) => (
                            <div key={`${workout.title}-${workout.completed_at || workout.review_due_at}`} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 9px' }}>
                              <div style={{ fontSize:11, fontWeight:700 }}>{workout.title}</div>
                              <div style={{ fontSize:9, color:t.textMuted, marginTop:2 }}>
                                {workout.completed_at ? `Completed ${new Date(workout.completed_at).toLocaleDateString()}` : workout.status}
                                {workout.session_rpe ? ` · RPE ${workout.session_rpe}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(clientContext?.recentPulse || []).length > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Daily pulse</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {clientContext.recentPulse.slice(0, 3).map((pulse: any) => (
                            <div key={pulse.checkin_date} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 9px' }}>
                              <div style={{ fontSize:11, fontWeight:700 }}>{pulse.checkin_date}</div>
                              <div style={{ fontSize:9, color:t.textMuted, marginTop:2 }}>
                                Sleep {pulse.sleep_quality ?? '—'}/5 · Energy {pulse.energy_score ?? '—'}/5 {pulse.mood_emoji ? `· ${pulse.mood_emoji}` : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(clientContext?.recentCheckins || []).length > 0 && (
                      <div>
                        <div style={{ fontSize:10, color:t.textMuted, marginBottom:4, fontWeight:700, letterSpacing:'0.04em', textTransform:'uppercase' as const }}>Recent check-ins</div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {clientContext.recentCheckins.slice(0, 2).map((checkin: any) => (
                            <div key={checkin.submitted_at} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 9px' }}>
                              <div style={{ fontSize:9, color:t.textMuted, marginBottom:3 }}>{new Date(checkin.submitted_at).toLocaleDateString()}</div>
                              <div style={{ fontSize:11, color:t.textDim, lineHeight:1.5 }}>
                                {checkin.struggles || checkin.wins || 'No notes'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
        ) : (
          <div className="msg-thread msg-thread-hidden" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:48 }}>💬</div>
            <div style={{ fontSize:15, fontWeight:700 }}>Select a client to start messaging</div>
            <div style={{ fontSize:13, color:t.textMuted }}>Messages are private between you and each client.</div>
          </div>
        )}
      </div>

      {/* ── BROADCAST MODAL ── */}
      {showBroadcast && (
        <div onClick={()=>{ setShowBroadcast(false); setBroadcastDone(false) }}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div onClick={e=>e.stopPropagation()}
            style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:480, padding:24 }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>📣 Message All Clients</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>
              Sends to {clients.filter(c=>c.profile?.id).length} active client{clients.filter(c=>c.profile?.id).length !== 1 ? 's' : ''} — appears as a direct message from you
            </div>
            {broadcastDone ? (
              <div style={{ textAlign:'center', padding:'24px 0', fontSize:15, fontWeight:800, color:t.teal }}>✓ Sent to all clients!</div>
            ) : (
              <>
                <textarea
                  autoFocus
                  value={broadcastText}
                  onChange={e=>setBroadcastText(e.target.value)}
                  placeholder="Type your message..."
                  rows={4}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', marginBottom:12 }}
                />
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>setShowBroadcast(false)}
                    style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:10, padding:'10px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={sendBroadcast} disabled={!broadcastText.trim() || broadcasting}
                    style={{ flex:2, background:broadcastText.trim()?t.teal:'#333', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:800, color:broadcastText.trim()?'#000':t.textMuted, cursor:broadcastText.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                    {broadcasting ? 'Sending...' : `Send to All Clients`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
