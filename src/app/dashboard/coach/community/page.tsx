'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6',
  green:'#22c55e', pink:'#f472b6', yellow:'#facc15', red:'#ef4444',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}
const QUICK_REACTIONS = ['💪','🔥','❤️','🎉','👏','😤','🏆','⚡']
const CLIENT_COLORS   = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]

function Avatar({ name, role, size=34, color }:{ name:string, role:string, size?:number, color?:string }) {
  const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
  const bg = role==='coach'
    ? 'linear-gradient(135deg,#00c9b1,#f5a623)'
    : `linear-gradient(135deg,${color||t.purple},${color||t.purple}88)`
  return (
    <div style={{ width:size, height:size, borderRadius:size/3, background:bg,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.33, fontWeight:900, color:'#000', flexShrink:0 }}>
      {initials}
    </div>
  )
}

export default function CoachCommunityPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [posts,     setPosts]     = useState<any[]>([])
  const [replies,   setReplies]   = useState<Record<string,any[]>>({})
  const [profiles,  setProfiles]  = useState<Record<string,any>>({})
  const [me,        setMe]        = useState<any>(null)
  const [coachId,   setCoachId]   = useState('')
  const [loading,   setLoading]   = useState(true)
  const [draft,     setDraft]     = useState('')
  const [posting,   setPosting]   = useState(false)
  const [reactOpen, setReactOpen] = useState<string|null>(null)
  // reply state: postId -> draft text
  const [replyDrafts,  setReplyDrafts]  = useState<Record<string,string>>({})
  const [replyOpen,    setReplyOpen]    = useState<string|null>(null)
  const [replyPosting, setReplyPosting] = useState<string|null>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMe(prof)
    const { data: cls } = await supabase.from('clients')
      .select('profile_id, profiles!profile_id(id, full_name)')
      .eq('coach_id', user.id)
    const profMap: Record<string,any> = { [user.id]: prof }
    cls?.forEach((c:any) => {
      const p = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      if (p) profMap[p.id] = p
    })
    setProfiles(profMap)
    await loadPosts(user.id)
    setLoading(false)
  }

  const loadPosts = async (cid?: string) => {
    const id = cid || coachId
    const { data: postData } = await supabase
      .from('community_posts')
      .select('*, reactions:community_reactions(*)')
      .eq('coach_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(postData || [])
    // Load replies for all posts
    if (postData?.length) {
      const { data: replyData } = await supabase
        .from('community_replies')
        .select('*')
        .eq('coach_id', id)
        .in('post_id', postData.map(p => p.id))
        .order('created_at', { ascending: true })
      const grouped: Record<string,any[]> = {}
      replyData?.forEach(r => {
        if (!grouped[r.post_id]) grouped[r.post_id] = []
        grouped[r.post_id].push(r)
      })
      setReplies(grouped)
    }
  }

  // Realtime
  useEffect(() => {
    if (!coachId) return
    const ch = supabase.channel('community-coach-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts',   filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_replies', filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_replies' }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [coachId])

  const post = async () => {
    if (!draft.trim() || !coachId) return
    setPosting(true)
    await supabase.from('community_posts').insert({
      coach_id: coachId, author_id: coachId, author_role: 'coach', body: draft.trim()
    })
    setDraft(''); setPosting(false); await loadPosts()
  }

  const submitReply = async (postId: string) => {
    const body = replyDrafts[postId]?.trim()
    if (!body || !coachId) return
    setReplyPosting(postId)
    await supabase.from('community_replies').insert({
      post_id: postId, coach_id: coachId, author_id: coachId, author_role: 'coach', body
    })
    setReplyDrafts(p => ({ ...p, [postId]: '' }))
    setReplyOpen(null)
    setReplyPosting(null)
    await loadPosts()
  }

  const deleteReply = async (replyId: string) => {
    await supabase.from('community_replies').delete().eq('id', replyId)
    await loadPosts()
  }

  const togglePin = async (id:string, pinned:boolean) => {
    await supabase.from('community_posts').update({ pinned: !pinned }).eq('id', id)
    await loadPosts()
  }

  const deletePost = async (id:string) => {
    await supabase.from('community_posts').delete().eq('id', id)
    await loadPosts()
  }

  const toggleReaction = async (postId:string, emoji:string) => {
    if (!me) return
    const p = posts.find(p => p.id === postId)
    const existing = p?.reactions?.find((r:any) => r.user_id === me.id && r.emoji === emoji)
    if (existing) await supabase.from('community_reactions').delete().eq('id', existing.id)
    else await supabase.from('community_reactions').insert({ post_id: postId, user_id: me.id, emoji })
    setReactOpen(null); await loadPosts()
  }

  const groupReactions = (reactions:any[] = []) => {
    const map: Record<string,{ count:number, mine:boolean }> = {}
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count:0, mine:false }
      map[r.emoji].count++
      if (r.user_id === me?.id) map[r.emoji].mine = true
    }
    return Object.entries(map)
  }

  const fmt = (ts:string) => {
    const diff = Date.now() - new Date(ts).getTime()
    if (diff < 60000)   return 'just now'
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
    if (diff < 86400000)return `${Math.floor(diff/3600000)}h ago`
    return new Date(ts).toLocaleDateString([], { month:'short', day:'numeric' })
  }

  const clientColors = Object.keys(profiles)
    .filter(id => id !== coachId)
    .reduce((acc, id, i) => ({ ...acc, [id]: CLIENT_COLORS[i % CLIENT_COLORS.length] }), {} as Record<string,string>)

  const getColor = (authorId:string, role:string) => role === 'coach' ? undefined : clientColors[authorId]

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        textarea{resize:none;}
        .reply-input:focus{outline:none;border-color:${t.teal}60 !important;}`}
      </style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}
        onClick={() => setReactOpen(null)}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }}/>
          <div style={{ fontSize:16, fontWeight:800, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG Fit Community</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:12, color:t.textMuted }}>{Object.keys(profiles).length} members</div>
        </div>

        <div style={{ maxWidth:680, margin:'0 auto', padding:24 }}>

          {/* Compose */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:16, marginBottom:20 }}>
            <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
              <Avatar name={me?.full_name||'Coach'} role="coach" size={36}/>
              <div style={{ flex:1 }}>
                <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={3}
                  placeholder="Share a win, drop some motivation, or just check in with the crew... 💪"
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                  onKeyDown={e=>{ if(e.key==='Enter' && e.metaKey) post() }}/>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:8 }}>
                  <div style={{ fontSize:11, color:t.textMuted }}>⌘+Enter to post</div>
                  <button onClick={post} disabled={posting||!draft.trim()}
                    style={{ background:draft.trim()?'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)':'transparent', border:'1px solid '+(draft.trim()?'transparent':t.border), borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:800, color:draft.trim()?'#000':t.textMuted, cursor:posting||!draft.trim()?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {posting ? 'Posting...' : 'Post 🔥'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed */}
          {posts.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted, fontSize:13 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>🌱</div>
              <div style={{ fontWeight:700, marginBottom:6 }}>Community is quiet</div>
              <div>Be the first to post something!</div>
            </div>
          )}

          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {posts.map(p => {
              const author   = profiles[p.author_id]
              const isMe     = p.author_id === me?.id
              const isCoach  = p.author_role === 'coach'
              const color    = getColor(p.author_id, p.author_role)
              const grouped  = groupReactions(p.reactions)
              const postReplies = replies[p.id] || []
              const showReplyBox = replyOpen === p.id

              return (
                <div key={p.id} style={{ background:t.surface, border:'1px solid '+(p.pinned?t.teal+'40':t.border), borderRadius:16, overflow:'hidden' }}>

                  {/* Pinned badge */}
                  {p.pinned && <div style={{ background:t.tealDim, padding:'5px 14px', fontSize:10, fontWeight:800, color:t.teal }}>📌 Pinned</div>}

                  <div style={{ padding:'14px 16px' }}>
                    {/* Author */}
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                      <Avatar name={author?.full_name||'?'} role={p.author_role} color={color} size={34}/>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:13, fontWeight:700 }}>{author?.full_name||'Unknown'}</span>
                          {isCoach && <span style={{ fontSize:9, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 6px', borderRadius:20 }}>COACH</span>}
                        </div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{fmt(p.created_at)}</div>
                      </div>
                      {/* Coach controls */}
                      <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>togglePin(p.id, p.pinned)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, opacity:p.pinned?1:0.35, padding:'2px 4px' }} title={p.pinned?'Unpin':'Pin'}>📌</button>
                        {isMe && <button onClick={()=>deletePost(p.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:t.textMuted, opacity:0.5, padding:'2px 4px' }}>✕</button>}
                      </div>
                    </div>

                    {/* Body */}
                    <div style={{ fontSize:14, lineHeight:1.65, color:t.text, marginBottom:12 }}>{p.body}</div>

                    {/* Reactions + Reply button */}
                    <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }} onClick={e=>e.stopPropagation()}>
                      {grouped.map(([emoji, { count, mine }]) => (
                        <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                          style={{ display:'flex', alignItems:'center', gap:3, padding:'3px 9px', borderRadius:20, border:'1px solid '+(mine?t.teal+'60':t.border), background:mine?t.tealDim:'transparent', cursor:'pointer', fontSize:13, fontFamily:"'DM Sans',sans-serif", color:mine?t.teal:t.textDim, fontWeight:mine?700:400 }}>
                          {emoji}{count > 1 && <span style={{ fontSize:11 }}>{count}</span>}
                        </button>
                      ))}

                      {/* Emoji picker */}
                      <div style={{ position:'relative' }}>
                        <button onClick={e=>{ e.stopPropagation(); setReactOpen(reactOpen===p.id?null:p.id) }}
                          style={{ background:'none', border:'1px solid '+t.border, borderRadius:20, padding:'3px 9px', cursor:'pointer', fontSize:12, color:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
                          + React
                        </button>
                        {reactOpen === p.id && (
                          <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:24, padding:'6px 10px', display:'flex', gap:4, zIndex:10, boxShadow:'0 4px 20px rgba(0,0,0,.5)', whiteSpace:'nowrap' }}>
                            {QUICK_REACTIONS.map(emoji => (
                              <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                                style={{ background:'none', border:'none', cursor:'pointer', fontSize:20, padding:'2px 3px', borderRadius:6 }}
                                onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.3)')}
                                onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Reply toggle */}
                      <button onClick={()=>{ setReplyOpen(showReplyBox?null:p.id); setTimeout(()=>replyInputRef.current?.focus(), 50) }}
                        style={{ background:'none', border:'1px solid '+t.border, borderRadius:20, padding:'3px 10px', cursor:'pointer', fontSize:12, fontWeight:600, color:showReplyBox?t.teal:t.textMuted, fontFamily:"'DM Sans',sans-serif", borderColor:showReplyBox?t.teal+'40':t.border }}>
                        💬 {postReplies.length > 0 ? `${postReplies.length} ${postReplies.length===1?'reply':'replies'}` : 'Reply'}
                      </button>
                    </div>
                  </div>

                  {/* Replies section */}
                  {(postReplies.length > 0 || showReplyBox) && (
                    <div style={{ borderTop:'1px solid '+t.border, background:t.surfaceUp }}>

                      {/* Existing replies */}
                      {postReplies.map((r, i) => {
                        const rAuthor = profiles[r.author_id]
                        const rColor  = getColor(r.author_id, r.author_role)
                        const isMyReply = r.author_id === me?.id
                        return (
                          <div key={r.id} style={{ display:'flex', gap:10, padding:'10px 16px', borderBottom: i < postReplies.length - 1 || showReplyBox ? '1px solid '+t.border+'66' : 'none', alignItems:'flex-start' }}>
                            {/* Thread line + avatar */}
                            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:0, flexShrink:0 }}>
                              <div style={{ width:2, height:6, background:t.border+'88' }}/>
                              <Avatar name={rAuthor?.full_name||'?'} role={r.author_role} color={rColor} size={26}/>
                            </div>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                                <span style={{ fontSize:12, fontWeight:700 }}>{rAuthor?.full_name||'Unknown'}</span>
                                {r.author_role==='coach' && <span style={{ fontSize:8, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 5px', borderRadius:20 }}>COACH</span>}
                                <span style={{ fontSize:10, color:t.textMuted }}>{fmt(r.created_at)}</span>
                                {isMyReply && (
                                  <button onClick={()=>deleteReply(r.id)}
                                    style={{ background:'none', border:'none', cursor:'pointer', fontSize:10, color:t.textMuted, opacity:0.5, marginLeft:'auto' }}>✕</button>
                                )}
                              </div>
                              <div style={{ fontSize:13, color:t.textDim, lineHeight:1.55 }}>{r.body}</div>
                            </div>
                          </div>
                        )
                      })}

                      {/* Reply input */}
                      {showReplyBox && (
                        <div style={{ display:'flex', gap:10, padding:'10px 16px', alignItems:'flex-start' }}>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                            <div style={{ width:2, height:6, background:t.border+'88' }}/>
                            <Avatar name={me?.full_name||'Coach'} role="coach" size={26}/>
                          </div>
                          <div style={{ flex:1 }}>
                            <textarea
                              ref={replyInputRef}
                              className="reply-input"
                              value={replyDrafts[p.id]||''}
                              onChange={e=>setReplyDrafts(prev=>({...prev,[p.id]:e.target.value}))}
                              placeholder="Write a reply..."
                              rows={2}
                              style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'8px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); submitReply(p.id) } }}
                            />
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:5 }}>
                              <span style={{ fontSize:10, color:t.textMuted }}>Enter to post · Shift+Enter for newline</span>
                              <div style={{ display:'flex', gap:6 }}>
                                <button onClick={()=>{ setReplyOpen(null); setReplyDrafts(prev=>({...prev,[p.id]:''})) }}
                                  style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'4px 10px', fontSize:11, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                  Cancel
                                </button>
                                <button onClick={()=>submitReply(p.id)} disabled={!replyDrafts[p.id]?.trim()||replyPosting===p.id}
                                  style={{ background:replyDrafts[p.id]?.trim()?t.teal:'transparent', border:'1px solid '+(replyDrafts[p.id]?.trim()?'transparent':t.border), borderRadius:8, padding:'4px 12px', fontSize:11, fontWeight:800, color:replyDrafts[p.id]?.trim()?'#000':t.textMuted, cursor:replyDrafts[p.id]?.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                                  {replyPosting===p.id ? 'Posting...' : 'Reply'}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}
