'use client'

/**
 * RichMessageThread — shared component used by coach & client dashboards
 * Features: text, audio recording, video recording, image/video upload, reactions
 *
 * Props:
 *   myId        — auth.users UUID of the current user
 *   otherId     — profile UUID of the person we're talking to  (profiles.id)
 *   otherName   — display name
 *   otherAvatar — avatar URL (optional)
 *   height      — container height (default '100%')
 */

import Image from 'next/image'
import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { resolveSignedMediaUrl } from '@/lib/media'
import { GiphyFetch } from '@giphy/js-fetch-api'

const c = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  red:'#ef4444', green:'#22c55e',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const QUICK_REACTIONS = ['👍','❤️','😂','🔥','💪','👏','😮','😢']

interface Message {
  id: string
  sender_id: string
  recipient_id: string
  body: string | null
  message_type: string
  media_url: string | null
  media_type: string | null
  duration_sec: number | null
  gif_url: string | null
  read: boolean
  created_at: string
  reactions?: Reaction[]
}

const MEDIA_BUCKETS: Record<string, string> = {
  image: 'message-media',
  audio: 'message-media',
  video: 'message-media',
  file: 'message-media',
}

interface Reaction {
  id: string
  message_id: string
  user_id: string
  emoji: string
}

interface Props {
  myId: string
  otherId: string
  otherName: string
  myName?: string
  otherAvatar?: string | null
  height?: string

  quickReplies?: Array<{ id: string; title: string; body: string }>
}

export default function RichMessageThread({ myId, otherId, otherName, myName, height = '100%', quickReplies = [] }: Props) {
  const supabase = useMemo(() => createClient(), [])

  // Fire-and-forget push notification to the recipient
  const notifyRecipient = async (body: string) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.access_token) return

    fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
      method: 'POST', headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        user_id: otherId,
        notification_type: 'new_message',
        title: `New message from ${myName || 'your coach'}`,
        body: body.slice(0, 100),
        link_url: '/dashboard/client?tab=messages&view=coach',
      })
    }).catch(() => {})
  }

  const [gifQuery,     setGifQuery]     = useState('')
  const [gifs,         setGifs]         = useState<any[]>([])
  const [gifLoading,   setGifLoading]   = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])

  // GIF search and send
  const searchGifs = useCallback(async (q: string) => {
    if (!q.trim()) {
      const { data } = await gf.trending({ limit: 18, rating: 'g' })
      setGifs(data)
      return
    }
    setGifLoading(true)
    const { data } = await gf.search(q, { limit: 18, rating: 'g' })
    setGifs(data)
    setGifLoading(false)
  }, [gf])

  const sendGif = async (gif: any) => {
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url || ''
    if (!url) return
    const { data } = await supabase.from('messages').insert({
      sender_id: myId, recipient_id: otherId,
      body: gif.title || 'GIF', message_type: 'gif',
      gif_url: url, read: false,
    }).select().single()
    if (data) setThread(prev => [...prev, { ...data, reactions: [] }])
    notifyRecipient('🎬 GIF')
    setMode('text'); setGifs([]); setGifQuery('')
  }
  const [thread,       setThread]       = useState<Message[]>([])
  const [draft,        setDraft]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [mode,         setMode]         = useState<'text'|'audio'|'video'|'gif'>('text')

  const [recording,    setRecording]    = useState(false)
  const [recSeconds,   setRecSeconds]   = useState(0)
  const [reactTarget,  setReactTarget]  = useState<string|null>(null)
  const [reactPos,     setReactPos]     = useState<{x:number,y:number}>({x:0,y:0})
  const longPressRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const initialLoadRef = useRef(true)
  const [previewFile,  setPreviewFile]  = useState<File|null>(null)
  const [uploading,    setUploading]    = useState(false)
  const [showMacros,   setShowMacros]   = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const inputRef     = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecRef  = useRef<MediaRecorder|null>(null)
  const chunksRef    = useRef<Blob[]>([])
  const timerRef     = useRef<ReturnType<typeof setInterval>|null>(null)
  const streamRef    = useRef<MediaStream|null>(null)
  const videoPreviewRef = useRef<HTMLVideoElement>(null)

  // ── Load thread + reactions ───────────────────────────────────────────────
  const loadThread = useCallback(async () => {
    const { data: msgs } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${myId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${myId})`)
      .order('created_at', { ascending: true })

    if (!msgs) return

    const msgIds = msgs.map(m => m.id)
    const { data: reactions } = msgIds.length
      ? await supabase.from('message_reactions').select('*').in('message_id', msgIds)
      : { data: [] }

    const withReactions = await Promise.all(msgs.map(async (m) => {
      const bucket = MEDIA_BUCKETS[m.message_type]
      const mediaUrl = bucket ? await resolveSignedMediaUrl(supabase, bucket, m.media_url) : m.media_url
      return {
        ...m,
        media_url: mediaUrl,
        reactions: (reactions || []).filter(r => r.message_id === m.id),
      }
    }))
    setThread(withReactions)

    // Mark incoming as read
    await supabase.from('messages')
      .update({ read: true })
      .eq('sender_id', otherId).eq('recipient_id', myId).eq('read', false)
  }, [myId, otherId, supabase])

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadThread() }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadThread])

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Always jump to bottom — instant on load, instant on new message
    // scrollTop = scrollHeight is reliable regardless of scrollIntoView container issues
    el.scrollTop = el.scrollHeight
  }, [thread])

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`thread-${myId}-${otherId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${myId}` }, (p) => {
        const msg = p.new as Message
        if (msg.sender_id === otherId) {
          setThread(prev => [...prev, { ...msg, reactions: [] }])
          supabase.from('messages').update({ read: true }).eq('id', msg.id)
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_reactions' }, () => {
        loadThread()
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'message_reactions' }, () => {
        loadThread()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [myId, otherId, loadThread, supabase])

  const applyMacro = (body: string) => {
    setDraft((prev) => prev.trim() ? `${prev}\n\n${body}` : body)
    setShowMacros(false)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  // ── Send text ─────────────────────────────────────────────────────────────
  const sendText = async () => {
    if (!draft.trim()) return
    setSending(true)
    const { data } = await supabase.from('messages').insert({
      sender_id: myId, recipient_id: otherId,
      body: draft.trim(), message_type: 'text', read: false,
    }).select().single()
    if (data) setThread(prev => [...prev, { ...data, reactions: [] }])
    setDraft('')
    setSending(false)
    notifyRecipient(draft.trim())
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  // ── Upload + send file ────────────────────────────────────────────────────
  const uploadAndSend = async (file: File, msgType: string) => {
    setUploading(true)
    const ext  = file.name.split('.').pop() || 'bin'
    const path = `${myId}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('message-media').upload(path, file)
    if (upErr) { setUploading(false); alert('Upload failed: ' + upErr.message); return }
    const signedUrl = await resolveSignedMediaUrl(supabase, 'message-media', path)
    const { data } = await supabase.from('messages').insert({
      sender_id: myId, recipient_id: otherId,
      body: null, message_type: msgType,
      media_url: path, media_type: file.type, read: false,
    }).select().single()
    if (data) setThread(prev => [...prev, { ...data, media_url: signedUrl, reactions: [] }])
    notifyRecipient(msgType === 'image' ? '📷 Image' : msgType === 'video' ? '🎥 Video' : '📎 File')
    setPreviewFile(null)
    setUploading(false)
    setMode('text')
  }

  // ── Audio recording ───────────────────────────────────────────────────────
  const startAudio = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const rec = new MediaRecorder(stream)
      mediaRecRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        await uploadAndSend(file, 'audio')
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
        setRecSeconds(0)
      }
      rec.start()
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch { alert('Microphone access denied') }
  }

  const stopAudio = () => {
    mediaRecRef.current?.stop()
    setRecording(false)
  }

  // ── Video recording ───────────────────────────────────────────────────────
  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = stream; videoPreviewRef.current.play() }
      const rec = new MediaRecorder(stream)
      mediaRecRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' })
        const file = new File([blob], `video-${Date.now()}.webm`, { type: 'video/webm' })
        if (videoPreviewRef.current) { videoPreviewRef.current.srcObject = null }
        await uploadAndSend(file, 'video')
        stream.getTracks().forEach(t => t.stop())
        streamRef.current = null
        if (timerRef.current) clearInterval(timerRef.current)
        setRecSeconds(0)
      }
      rec.start()
      setRecording(true)
      setRecSeconds(0)
      timerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000)
    } catch { alert('Camera/microphone access denied') }
  }

  const stopVideo = () => {
    mediaRecRef.current?.stop()
    setRecording(false)
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  const toggleReaction = async (msgId: string, emoji: string) => {
    const msg = thread.find(m => m.id === msgId)
    const existing = msg?.reactions?.find(r => r.user_id === myId && r.emoji === emoji)
    if (existing) {
      await supabase.from('message_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('message_reactions').insert({ message_id: msgId, user_id: myId, emoji })
    }
    setReactTarget(null)
    loadThread()
  }

  // ── Long-press reactions (SMS-style) ──────────────────────────────────────
  const handlePressStart = (msgId: string, e: React.TouchEvent | React.MouseEvent) => {
    if (reactTarget) { setReactTarget(null); return }
    const touch = 'touches' in e ? e.touches[0] : e as React.MouseEvent
    const x = touch.clientX
    const y = touch.clientY
    longPressRef.current = setTimeout(() => {
      setReactTarget(msgId)
      setReactPos({ x, y })
      if ('vibrate' in navigator) navigator.vibrate(40)
    }, 480)
  }

  const handlePressEnd = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current)
      longPressRef.current = null
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  const fmtTime = (s: number) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`
  const fmtMsgTime = (ts: string) => new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  const btnBase: React.CSSProperties = {
    border:'none', borderRadius:8, padding:'7px 12px', fontSize:12, fontWeight:700,
    cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:5,
  }

  // ── Render bubble content ─────────────────────────────────────────────────
  const BubbleContent = ({ msg }: { msg: Message }) => {
    const isMe = msg.sender_id === myId

    if (msg.message_type === 'image' && msg.media_url) {
      const mediaUrl = msg.media_url
      return (
        <Image
          src={mediaUrl}
          alt="Message image"
          width={640}
          height={640}
          unoptimized
          style={{ maxWidth:'100%', width:'100%', height:'auto', borderRadius:10, display:'block', cursor:'pointer' }}
          onClick={()=>window.open(mediaUrl,'_blank')}
        />
      )
    }
    if (msg.message_type === 'audio' && msg.media_url) {
      return (
        <div style={{ display:'flex', alignItems:'center', gap:8, padding:'4px 0' }}>
          <span style={{ fontSize:18 }}>🎙️</span>
          <audio controls src={msg.media_url} style={{ height:36, flex:1, minWidth:0, maxWidth:'100%' }} />
        </div>
      )
    }
    if (msg.message_type === 'video' && msg.media_url) {
      return (
        <video src={msg.media_url} controls
          style={{ maxWidth:'100%', width:'100%', borderRadius:10, display:'block', maxHeight:280 }} />
      )
    }
    if ((msg.message_type === 'file') && msg.media_url) {
      return (
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
          style={{ color: isMe ? '#000' : c.teal, fontWeight:700, fontSize:13, wordBreak:'break-all' }}>
          📎 {msg.media_url.split('/').pop()}
        </a>
      )
    }
    if (msg.message_type === 'gif' && msg.gif_url) {
      return (
        <img src={msg.gif_url} alt={msg.body || 'GIF'}
          style={{ maxWidth:'100%', width:'240px', borderRadius:10, display:'block', cursor:'pointer' }}
          onClick={()=>window.open(msg.gif_url ?? undefined,'_blank')}
        />
      )
    }
    return <span style={{ fontSize:14, lineHeight:1.55, wordBreak:'break-word' }}>{msg.body}</span>
  }
  const groupReactions = (reactions: Reaction[] = []) => {
    const map: Record<string, { count: number, mine: boolean }> = {}
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
      map[r.emoji].count++
      if (r.user_id === myId) map[r.emoji].mine = true
    }
    return Object.entries(map)
  }

  return (
    <>      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .rmt-scroll::-webkit-scrollbar{width:4px}
        .rmt-scroll::-webkit-scrollbar-thumb{background:${c.border};border-radius:4px}
.rmt-reaction-pill:hover{opacity:.8}
        .rmt-input-area{display:flex;flex-direction:column;gap:6px;}
        .rmt-toolbar{display:flex;gap:4px;align-items:center;}
        .rmt-input-row{display:flex;gap:8px;align-items:flex-end;}
        .rmt-macro-row{display:flex;gap:6px;flex-wrap:wrap;}
.rmt-picker{animation:scaleIn .15s ease;transform-origin:bottom center;}
        .rmt-bubble{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
        @media(max-width:400px){
.rmt-input-row{align-items:stretch;}
        }
      `}</style>

      <div style={{ display:'flex', flexDirection:'column', height, fontFamily:"'DM Sans',sans-serif", color:c.text, background:c.bg }}
        onClick={()=>setReactTarget(null)}>

        {/* ── Global reaction picker overlay ── */}
        {reactTarget && (
          <>
            {/* Backdrop */}
            <div style={{ position:'fixed', inset:0, zIndex:100 }}
              onClick={()=>setReactTarget(null)}
              onTouchEnd={()=>setReactTarget(null)} />
            {/* Picker */}
            <div className="rmt-picker" style={{
              position:'fixed',
              left: Math.min(Math.max(reactPos.x - 140, 8), window.innerWidth - 300),
              top: Math.max(reactPos.y - 70, 60),
              background:c.surfaceHigh,
              border:'1px solid '+c.border,
              borderRadius:32,
              padding:'8px 12px',
              display:'flex',
              gap:4,
              zIndex:101,
              boxShadow:'0 8px 32px rgba(0,0,0,.7)',
            }} onClick={e=>e.stopPropagation()} onTouchStart={e=>e.stopPropagation()} onMouseDown={e=>e.stopPropagation()}>
              {QUICK_REACTIONS.map(emoji => (
                <button key={emoji}
                  aria-label={`React with ${emoji}`}
                  onTouchEnd={e=>{ e.preventDefault(); e.stopPropagation(); toggleReaction(reactTarget, emoji) }}
                  onClick={e=>{ e.stopPropagation(); toggleReaction(reactTarget, emoji) }}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:26, padding:'6px 5px', borderRadius:8, lineHeight:1, WebkitTapHighlightColor:'transparent' }}>
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Thread ── */}
        <div ref={scrollRef} className="rmt-scroll" style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {thread.length === 0 && (
            <div style={{ textAlign:'center', marginTop:48, color:c.textMuted, fontSize:13 }}>No messages yet — say something! 👋</div>
          )}

          {thread.map((msg) => {
            const isMe = msg.sender_id === myId
            const grouped = groupReactions(msg.reactions)
            const isMedia = ['image','video'].includes(msg.message_type)
            return (
              <div key={msg.id} style={{ display:'flex', flexDirection:'column', alignItems: isMe ? 'flex-end' : 'flex-start', animation:'fadeUp .15s ease' }}>
                <div style={{ position:'relative', maxWidth: isMedia ? '80%' : '74%', width: isMedia ? '80%' : 'auto' }}>

                  {/* Bubble — long-press to react, normal tap for media */}
                  <div
                    className="rmt-bubble"
                    onTouchStart={e=>handlePressStart(msg.id, e)}
                    onTouchEnd={handlePressEnd}
                    onTouchMove={handlePressEnd}
                    onMouseDown={e=>handlePressStart(msg.id, e)}
                    onMouseUp={handlePressEnd}
                    onMouseLeave={handlePressEnd}
                    onContextMenu={e=>{ e.preventDefault(); setReactTarget(msg.id); setReactPos({x:e.clientX,y:e.clientY}) }}
                    style={{
                      background: isMe ? c.teal : c.surfaceHigh,
                      color: isMe ? '#000' : c.text,
                      borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: isMedia ? '4px' : '10px 14px',
                      cursor: isMedia ? 'default' : 'default',
                      overflow:'hidden',
                      WebkitTouchCallout:'none',
                    }}>
                    <BubbleContent msg={msg} />
                    <div style={{ fontSize:10, marginTop: isMedia?4:3, opacity:0.55, textAlign: isMe?'right':'left', padding: isMedia?'0 6px 4px':0 }}>
                      {fmtMsgTime(msg.created_at)}
                      {isMe && <span style={{ marginLeft:4 }}>{msg.read ? ' ✓✓' : ' ✓'}</span>}
                    </div>
                  </div>

                  {/* Reaction pills */}
                  {grouped.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:4, justifyContent: isMe?'flex-end':'flex-start' }}>
                      {grouped.map(([emoji, {count, mine}]) => (
                        <button key={emoji} className="rmt-reaction-pill"
                          onClick={()=>toggleReaction(msg.id, emoji)}
                          style={{ ...btnBase, padding:'3px 8px', fontSize:13, background: mine ? c.tealDim : c.surfaceHigh, border:'1px solid '+(mine?c.teal+'40':c.border), color: mine?c.teal:c.textDim }}>
                          {emoji}{count > 1 ? ` ${count}` : ''}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Video preview ── */}
        {mode === 'video' && recording && (
          <div style={{ borderTop:'1px solid '+c.border, padding:12, background:c.surfaceUp, display:'flex', alignItems:'center', gap:12 }}>
            <video ref={videoPreviewRef} muted style={{ width:180, height:120, borderRadius:10, background:'#000', objectFit:'cover' }} />
            <div>
              <div style={{ color:c.red, fontWeight:700, fontSize:14, marginBottom:8 }}>⏺ {fmtTime(recSeconds)}</div>
              <button onClick={stopVideo} style={{ ...btnBase, background:c.red, color:'#fff' }}>⏹ Stop & Send</button>
            </div>
          </div>
        )}

        {/* ── File preview ── */}
        {previewFile && (
          <div style={{ borderTop:'1px solid '+c.border, padding:'10px 16px', background:c.surfaceUp, display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontSize:12, color:c.textDim, flex:1 }}>📎 {previewFile.name}</div>
            <button onClick={()=>uploadAndSend(previewFile, previewFile.type.startsWith('image') ? 'image' : 'file')}
              disabled={uploading}
              style={{ ...btnBase, background:c.teal, color:'#000', opacity:uploading?.6:1 }}>
              {uploading ? 'Uploading...' : '↑ Send'}
            </button>
            <button onClick={()=>setPreviewFile(null)}
              style={{ ...btnBase, background:c.surfaceHigh, color:c.textMuted, border:'1px solid '+c.border }}>✕</button>
          </div>
        )}

        {/* ── Input bar ── */}
        <div style={{ borderTop:'1px solid '+c.border, padding:'12px 16px', background:c.surface, flexShrink:0 }}>

          {/* Audio recording state */}
          {mode === 'audio' && recording ? (
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:'50%', background:c.red, animation:'pulse 1s infinite' }} />
                <span style={{ fontSize:13, fontWeight:700, color:c.red }}>Recording {fmtTime(recSeconds)}</span>
              </div>
              <button onClick={stopAudio} style={{ ...btnBase, background:c.red, color:'#fff' }}>⏹ Stop & Send</button>
              <button onClick={()=>{ mediaRecRef.current?.stop(); streamRef.current?.getTracks().forEach(t=>t.stop()); setRecording(false); setMode('text') }}
                style={{ ...btnBase, background:c.surfaceHigh, color:c.textMuted, border:'1px solid '+c.border }}>Discard</button>
            </div>
          ) : (
            <div className="rmt-input-area">
              {/* Toolbar row — full width above input */}
              <div className="rmt-toolbar">
                {quickReplies.length > 0 && (
                  <button title="Saved replies" aria-label="Toggle saved replies" aria-expanded={showMacros} onClick={()=>setShowMacros(s => !s)}
                    style={{ ...btnBase, padding:'7px 10px', background: showMacros?c.orange+'22':'transparent', color:showMacros?c.orange:c.textMuted, border:'1px solid '+(showMacros?c.orange+'40':'transparent') }}>
                    ⚡
                  </button>
                )}
                <button title="Voice message" aria-label="Record voice message" onClick={()=>{ setMode('audio'); startAudio() }}
                  style={{ ...btnBase, padding:'7px 10px', background: mode==='audio'?c.tealDim:'transparent', color:mode==='audio'?c.teal:c.textMuted, border:'1px solid '+(mode==='audio'?c.teal+'40':'transparent') }}>
                  🎙️
                </button>
                <button title="Video message" aria-label="Record video message" onClick={()=>{ setMode('video'); startVideo() }}
                  style={{ ...btnBase, padding:'7px 10px', background: mode==='video'?c.tealDim:'transparent', color:mode==='video'?c.teal:c.textMuted, border:'1px solid '+(mode==='video'?c.teal+'40':'transparent') }}>
                  📹
                </button>
                <button title="Send image or file" aria-label="Upload image, video, audio, or file" onClick={()=>fileInputRef.current?.click()}
                  style={{ ...btnBase, padding:'7px 10px', background:'transparent', color:c.textMuted, border:'1px solid transparent' }}>
                  📎
                </button>
                <button title="Send a GIF" aria-label="Open GIF picker" onClick={()=>{ setMode(m=>m==='gif'?'text':'gif'); if(gifs.length===0) searchGifs('') }}
                  style={{ ...btnBase, padding:'7px 10px', background:mode==='gif'?c.tealDim:'transparent', color:mode==='gif'?c.teal:c.textMuted, border:'1px solid '+(mode==='gif'?c.teal+'40':'transparent') }}>
                  GIF
                </button>
              </div>

              {showMacros && quickReplies.length > 0 && (
                <div className="rmt-macro-row">
                  {quickReplies.map((macro) => (
                    <button
                      key={macro.id}
                      aria-label={`Insert saved reply ${macro.title}`}
                      onClick={()=>applyMacro(macro.body)}
                      style={{ ...btnBase, padding:'5px 10px', background:c.surfaceHigh, color:c.text, border:'1px solid '+c.border, fontSize:11 }}
                    >
                      {macro.title}
                    </button>
                  ))}
                </div>
              )}

              {/* GIF picker */}
              {mode === 'gif' && (
                <div style={{ borderTop:'1px solid '+c.border, background:c.surfaceUp, padding:'10px' }}>
                  <input
                    autoFocus
                    value={gifQuery}
                    onChange={e=>{ setGifQuery(e.target.value); searchGifs(e.target.value) }}
                    placeholder="Search GIPHY..."
                    style={{ width:'100%', background:c.surfaceHigh, border:'1px solid '+c.border, borderRadius:10, padding:'8px 12px', fontSize:13, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif", marginBottom:8, colorScheme:'dark', boxSizing:'border-box' as const }}
                  />
                  {gifLoading ? (
                    <div style={{ textAlign:'center', padding:'12px', fontSize:12, color:c.textMuted }}>Searching...</div>
                  ) : (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, maxHeight:220, overflowY:'auto' }}>
                      {gifs.map((gif:any) => (
                        <img key={gif.id}
                          src={gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url}
                          alt={gif.title || 'GIF'}
                          onClick={()=>sendGif(gif)}
                          style={{ width:'100%', borderRadius:6, cursor:'pointer', objectFit:'cover' as const, aspectRatio:'1', display:'block' }}
                        />
                      ))}
                    </div>
                  )}
                  <div style={{ fontSize:9, color:c.textMuted, textAlign:'right' as const, marginTop:4 }}>Powered by GIPHY</div>
                </div>
              )}

              {showMacros && quickReplies.length > 0 && (
                <div className="rmt-macro-row">
                  {quickReplies.map((macro) => (
                    <button
                      key={macro.id}
                      aria-label={`Insert saved reply ${macro.title}`}
                      onClick={()=>applyMacro(macro.body)}
                      style={{ ...btnBase, padding:'5px 10px', background:c.surfaceHigh, color:c.text, border:'1px solid '+c.border, fontSize:11 }}
                    >
                      {macro.title}
                    </button>
                  ))}
                </div>
              )}

              {/* Input + send row — full width */}
              <div className="rmt-input-row">
                <textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={handleKey}
                  aria-label={`Message ${otherName}`}
                  placeholder={`Message ${otherName.split(' ')[0]}...`} rows={1}
                  style={{ flex:1, background:c.surfaceUp, border:'1px solid '+c.border, borderRadius:12, padding:'10px 14px', fontSize:14, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5, maxHeight:120, overflowY:'auto' }}
                  onInput={e=>{ const el=e.currentTarget; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px' }}
                />
                <button onClick={sendText} aria-label="Send message" disabled={!draft.trim()||sending}
                  style={{ background:c.teal, border:'none', borderRadius:10, width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center', cursor:!draft.trim()||sending?'not-allowed':'pointer', opacity:!draft.trim()||sending?.4:1, flexShrink:0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input ref={fileInputRef} type="file" accept="image/*,video/*,audio/*,.pdf,.doc,.docx" style={{ display:'none' }}
            onChange={e=>{ const f=e.target.files?.[0]; if(f) setPreviewFile(f); e.target.value='' }} />
        </div>
      </div>
    </>
  )
}