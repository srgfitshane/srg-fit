'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import RichMessageThread from '@/components/messaging/RichMessageThread'

const TENOR_KEY = process.env.NEXT_PUBLIC_TENOR_KEY || ''

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
  red:"#ef4444",
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div style={{ background:'#080810', minHeight:'100vh' }} />}>
      <MessagesInner />
    </Suspense>
  )
}

function MessagesInner() {
  const [coachId,    setCoachId]    = useState<string | null>(null)
  const [clients,    setClients]    = useState<any[]>([])
  const [activeId,   setActiveId]   = useState<string | null>(null)
  const [thread,     setThread]     = useState<any[]>([])
  const [draft,      setDraft]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [unread,     setUnread]     = useState<Record<string, number>>({})
  const [loading,    setLoading]    = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLTextAreaElement>(null)
  const router    = useRouter()
  const params    = useSearchParams()
  const supabase  = createClient()

  // ── Bootstrap ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setCoachId(user.id)

      const { data: cls } = await supabase
        .from('clients')
        .select(`id, profile:profiles!profile_id(id, full_name, avatar_url)`)
        .eq('coach_id', user.id)
        .eq('active', true)
        .order('created_at', { ascending: false })
      setClients(cls || [])

      // Count unread per client
      const { data: msgs } = await supabase
        .from('messages')
        .select('sender_id, read')
        .eq('recipient_id', user.id)
        .eq('read', false)
      const counts: Record<string, number> = {}
      for (const m of msgs || []) counts[m.sender_id] = (counts[m.sender_id] || 0) + 1
      setUnread(counts)

      // Auto-open if ?client= param passed
      const pid = params.get('client')
      if (pid) {
        const match = (cls || []).find((c: any) => c.id === pid)
        if (match) openThread(user.id, match)
      }
      setLoading(false)
    }
    init()
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
        // If this is the active thread, append + mark read
        const active = clients.find(c => c.profile?.id === msg.sender_id)
        if (active && active.id === activeId) {
          setThread(prev => [...prev, msg])
          markRead(coachId, active.profile.id)
        } else {
          setUnread(prev => ({ ...prev, [msg.sender_id]: (prev[msg.sender_id] || 0) + 1 }))
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [coachId, activeId, clients])

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread])

  // ── Open a conversation thread ────────────────────────────────────────────
  const openThread = async (cid: string, client: any) => {
    setActiveId(client.id)
    const profileId = client.profile?.id
    if (!profileId) return

    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${cid},recipient_id.eq.${profileId}),and(sender_id.eq.${profileId},recipient_id.eq.${cid})`)
      .order('created_at', { ascending: true })
    setThread(data || [])
    markRead(cid, profileId)
    setUnread(prev => { const n = { ...prev }; delete n[profileId]; return n })
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const markRead = async (myId: string, senderId: string) => {
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', senderId)
      .eq('recipient_id', myId)
      .eq('read', false)
  }

  // ── Send message ──────────────────────────────────────────────────────────
  const send = async () => {
    if (!draft.trim() || !coachId || !activeId) return
    const client = clients.find(c => c.id === activeId)
    if (!client?.profile?.id) return
    setSending(true)
    const msg = { sender_id: coachId, recipient_id: client.profile.id, body: draft.trim(), read: false }
    const { data } = await supabase.from('messages').insert(msg).select().single()
    if (data) setThread(prev => [...prev, data])
    setDraft('')
    setSending(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const activeClient = clients.find(c => c.id === activeId)
  const totalUnread  = Object.values(unread).reduce((a, b) => a + b, 0)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .msg-input::-webkit-scrollbar{width:4px;}
        .msg-input::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
        .msg-bubble{max-width:72%;word-break:break-word;line-height:1.55;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        .msg-sidebar{width:280px;flex-shrink:0;}
        .msg-thread{flex:1;min-width:0;}
        @media(max-width:640px){
          .msg-sidebar{width:100%;border-right:none!important;}
          .msg-sidebar-hidden{display:none!important;}
          .msg-thread-hidden{display:none!important;}
        }
      `}</style>

      <div style={{ display:'flex', height:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", color:t.text, overflow:'hidden' }}>

        {/* ── LEFT SIDEBAR: Client list ────────────────────────────────── */}
        <div className={`msg-sidebar${activeClient ? ' msg-sidebar-hidden' : ''}`} style={{ borderRight:'1px solid '+t.border, display:'flex', flexDirection:'column' }}>

          {/* Sidebar header */}
          <div style={{ padding:'16px 18px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', gap:10, height:60 }}>
            <button onClick={()=>router.push('/dashboard/coach')}
              style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", padding:0 }}>←</button>
            <div style={{ fontSize:14, fontWeight:800 }}>Messages</div>
            {totalUnread > 0 && (
              <span style={{ background:t.teal, color:'#000', borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:900, marginLeft:'auto' }}>{totalUnread}</span>
            )}
          </div>

          {/* Client rows */}
          <div style={{ flex:1, overflowY:'auto' }}>
            {loading ? (
              <div style={{ padding:20, color:t.textMuted, fontSize:13 }}>Loading...</div>
            ) : clients.length === 0 ? (
              <div style={{ padding:20, color:t.textMuted, fontSize:13 }}>No active clients yet.</div>
            ) : clients.map(c => {
              const isActive = c.id === activeId
              const uCount   = unread[c.profile?.id] || 0
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
              {/* Back button — always visible, critical on mobile */}
              <button onClick={()=>setActiveId(null)}
                style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20, lineHeight:1, flexShrink:0, padding:'4px' }}>←</button>
              <div style={{ width:30, height:30, borderRadius:'50%', background:t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:t.teal, overflow:'hidden', flexShrink:0 }}>
                {activeClient.profile?.avatar_url
                  ? <img src={activeClient.profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                  : (activeClient.profile?.full_name?.charAt(0) || '?')}
              </div>
              <div style={{ fontWeight:800, fontSize:14, flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{activeClient.profile?.full_name}</div>
              <button onClick={()=>router.push('/dashboard/coach/clients/'+activeClient.id)}
                style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
                Profile →
              </button>
            </div>

            {/* Rich thread */}
            {coachId && activeClient.profile?.id && (
              <RichMessageThread
                myId={coachId}
                otherId={activeClient.profile.id}
                otherName={activeClient.profile.full_name || 'Client'}
                otherAvatar={activeClient.profile.avatar_url}
                tenorKey={TENOR_KEY}
                height="100%"
              />
            )}
          </div>
        ) : (
          <div className="msg-thread msg-thread-hidden" style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12 }}>
            <div style={{ fontSize:48 }}>💬</div>
            <div style={{ fontSize:15, fontWeight:700 }}>Select a client to start messaging</div>
            <div style={{ fontSize:13, color:t.textMuted }}>Messages are private between you and each client.</div>
          </div>
        )}
      </div>
    </>
  )
}
