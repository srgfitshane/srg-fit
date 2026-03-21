'use client'

/**
 * RichMessageThread — shared component used by coach & client dashboards
 * Features: text, audio recording, video recording, image/video upload, GIF search, reactions
 *
 * Props:
 *   myId        — auth.users UUID of the current user
 *   otherId     — profile UUID of the person we're talking to  (profiles.id)
 *   otherName   — display name
 *   otherAvatar — avatar URL (optional)
 *   tenorKey    — Tenor API key for GIF search (optional; GIF button hidden if omitted)
 *   height      — container height (default '100%')
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'

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
  gif_url: string | null
  gif_preview: string | null
  duration_sec: number | null
  read: boolean
  created_at: string
  reactions?: Reaction[]
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
  otherAvatar?: string | null
  tenorKey?: string
  height?: string
}

export default function RichMessageThread({ myId, otherId, otherName, otherAvatar, tenorKey, height = '100%' }: Props) {
  const supabase = createClient()
  const [thread,       setThread]       = useState<Message[]>([])
  const [draft,        setDraft]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [mode,         setMode]         = useState<'text'|'audio'|'video'|'gif'>('text')
  const [recording,    setRecording]    = useState(false)
  const [recSeconds,   setRecSeconds]   = useState(0)
  const [gifQuery,     setGifQuery]     = useState('')
  const [gifs,         setGifs]         = useState<any[]>([])
  const [gifLoading,   setGifLoading]   = useState(false)
  const [reactTarget,  setReactTarget]  = useState<string|null>(null)
  const [reactPos,     setReactPos]     = useState<{x:number,y:number}>({x:0,y:0})
  const longPressRef = useRef<ReturnType<typeof setTimeout>|null>(null)
  const [previewFile,  setPreviewFile]  = useState<File|null>(null)
  const [uploading,    setUploading]    = useState(false)

  const bottomRef    = useRef<HTMLDivElement>(null)
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

    const withReactions = msgs.map(m => ({
      ...m,
      reactions: (reactions || []).filter(r => r.message_id === m.id),
    }))
    setThread(withReactions)

    // Mark incoming as read
    await supabase.from('messages')
      .update({ read: true })
      .eq('sender_id', otherId).eq('recipient_id', myId).eq('read', false)
  }, [myId, otherId])

  useEffect(() => { loadThread() }, [loadThread])

  // ── Scroll to bottom ──────────────────────────────────────────────────────
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [thread])

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
  }, [myId, otherId, loadThread])

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
    const { data: urlData } = supabase.storage.from('message-media').getPublicUrl(path)
    const { data } = await supabase.from('messages').insert({
      sender_id: myId, recipient_id: otherId,
      body: null, message_type: msgType,
      media_url: urlData.publicUrl, media_type: file.type, read: false,
    }).select().single()
    if (data) setThread(prev => [...prev, { ...data, reactions: [] }])
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

  // ── GIF search ────────────────────────────────────────────────────────────
  const searchGifs = async (q: string) => {
    if (!q.trim() || !tenorKey) return
    setGifLoading(true)
    try {
      const res = await fetch(`https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(q)}&key=${tenorKey}&limit=20&media_filter=gif,tinygif`)
      const data = await res.json()
      setGifs(data.results || [])
    } catch { setGifs([]) }
    setGifLoading(false)
  }

  const sendGif = async (gif: any) => {
    const full  = gif.media_formats?.gif?.url || gif.url
    const tiny  = gif.media_formats?.tinygif?.url || full
    const { data } = await supabase.from('messages').insert({
      sender_id: myId, recipient_id: otherId,
      body: gif.content_description || 'GIF',
      message_type: 'gif', gif_url: full, gif_preview: tiny, read: false,
    }).select().single()
    if (data) setThread(prev => [...prev, { ...data, reactions: [] }])
    setMode('text'); setGifs([]); setGifQuery('')
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
    if (msg.message_type === 'gif' && msg.gif_url) {
      return <img src={msg.gif_url} alt={msg.body || 'GIF'} style={{ maxWidth:'100%', width:'100%', borderRadius:10, display:'block' }} />
    }
    if (msg.message_type === 'image' && msg.media_url) {
      return (
        <img src={msg.media_url} alt="image"
          style={{ maxWidth:'100%', width:'100%', borderRadius:10, display:'block', cursor:'pointer' }}
          onClick={()=>window.open(msg.media_url!,'_blank')} />
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
    return <span style={{ fontSize:14, lineHeight:1.55, wordBreak:'break-word' }}>{msg.body}</span>
  }

  // Group reactions by emoji for display
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
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.7)}to{opacity:1;transform:scale(1)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        .rmt-scroll::-webkit-scrollbar{width:4px}
        .rmt-scroll::-webkit-scrollbar-thumb{background:${c.border};border-radius:4px}
        .rmt-gif:hover{opacity:.85;transform:scale(1.02);cursor:pointer}
        .rmt-reaction-pill:hover{opacity:.8}
        .rmt-input-area{display:flex;flex-direction:column;gap:6px;}
        .rmt-toolbar{display:flex;gap:4px;align-items:center;}
        .rmt-input-row{display:flex;gap:8px;align-items:flex-end;}
        .rmt-gif-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;}
        .rmt-picker{animation:scaleIn .15s ease;transform-origin:bottom center;}
        .rmt-bubble{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;}
        @media(max-width:400px){.rmt-gif-grid{grid-template-columns:repeat(3,1fr);}}
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
        <div className="rmt-scroll" style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:10 }}>
          {thread.length === 0 && (
            <div style={{ textAlign:'center', marginTop:48, color:c.textMuted, fontSize:13 }}>No messages yet — say something! 👋</div>
          )}

          {thread.map((msg) => {
            const isMe = msg.sender_id === myId
            const grouped = groupReactions(msg.reactions)
            const isMedia = ['image','video','gif'].includes(msg.message_type)
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

        {/* ── GIF search panel ── */}
        {mode === 'gif' && (
          <div style={{ borderTop:'1px solid '+c.border, padding:'12px 16px', background:c.surfaceUp }}>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input value={gifQuery} onChange={e=>setGifQuery(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter') searchGifs(gifQuery) }}
                placeholder="Search GIFs and memes..."
                style={{ flex:1, background:c.surfaceHigh, border:'1px solid '+c.border, borderRadius:9, padding:'8px 12px', fontSize:13, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
              <button onClick={()=>searchGifs(gifQuery)} disabled={gifLoading}
                style={{ ...btnBase, background:c.teal, color:'#000', opacity:gifLoading?.6:1 }}>
                {gifLoading ? '...' : '🔍'}
              </button>
              <button onClick={()=>{ setMode('text'); setGifs([]) }}
                style={{ ...btnBase, background:c.surfaceHigh, color:c.textMuted, border:'1px solid '+c.border }}>
                ✕
              </button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, maxHeight:200, overflowY:'auto' }}>
              {gifs.map((g, i) => (
                <img key={i} className="rmt-gif" src={g.media_formats?.tinygif?.url || g.url} alt={g.content_description}
                  style={{ width:'100%', borderRadius:8, transition:'opacity .1s, transform .1s' }}
                  onClick={()=>sendGif(g)} />
              ))}
              {gifs.length === 0 && !gifLoading && (
                <div style={{ gridColumn:'1/-1', color:c.textMuted, fontSize:12, textAlign:'center', padding:16 }}>
                  Search for a GIF or meme to send 🎭
                </div>
              )}
            </div>
          </div>
        )}

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
                <button title="Voice message" onClick={()=>{ setMode('audio'); startAudio() }}
                  style={{ ...btnBase, padding:'7px 10px', background: mode==='audio'?c.tealDim:'transparent', color:mode==='audio'?c.teal:c.textMuted, border:'1px solid '+(mode==='audio'?c.teal+'40':'transparent') }}>
                  🎙️
                </button>
                <button title="Video message" onClick={()=>{ setMode('video'); startVideo() }}
                  style={{ ...btnBase, padding:'7px 10px', background: mode==='video'?c.tealDim:'transparent', color:mode==='video'?c.teal:c.textMuted, border:'1px solid '+(mode==='video'?c.teal+'40':'transparent') }}>
                  📹
                </button>
                <button title="Send image or file" onClick={()=>fileInputRef.current?.click()}
                  style={{ ...btnBase, padding:'7px 10px', background:'transparent', color:c.textMuted, border:'1px solid transparent' }}>
                  📎
                </button>
                {tenorKey && (
                  <button title="Send GIF or meme" onClick={()=>setMode(mode==='gif'?'text':'gif')}
                    style={{ ...btnBase, padding:'5px 10px', background: mode==='gif'?c.orange+'22':'transparent', color:mode==='gif'?c.orange:c.textMuted, border:'1px solid '+(mode==='gif'?c.orange+'40':'transparent'), fontSize:11, fontWeight:900 }}>
                    GIF
                  </button>
                )}
              </div>

              {/* Input + send row — full width */}
              <div className="rmt-input-row">
                <textarea ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={handleKey}
                  placeholder={`Message ${otherName.split(' ')[0]}...`} rows={1}
                  style={{ flex:1, background:c.surfaceUp, border:'1px solid '+c.border, borderRadius:12, padding:'10px 14px', fontSize:14, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5, maxHeight:120, overflowY:'auto' }}
                  onInput={e=>{ const el=e.currentTarget; el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px' }}
                />
                <button onClick={sendText} disabled={!draft.trim()||sending}
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
