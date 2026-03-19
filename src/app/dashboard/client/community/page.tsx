'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6',
  green:'#22c55e', pink:'#f472b6', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}
const QUICK_REACTIONS = ['💪','🔥','❤️','🎉','👏','😤','🏆','⚡']
const CLIENT_COLORS   = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]

function Avatar({ name, role, size=32, color }:{ name:string, role:string, size?:number, color?:string }) {
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

export default function ClientCommunityPage() {
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
  const [replyDrafts,  setReplyDrafts]  = useState<Record<string,string>>({})
  const [replyOpen,    setReplyOpen]    = useState<string|null>(null)
  const [replyPosting, setReplyPosting] = useState<string|null>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const [{ data: prof }, { data: clientData }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('clients').select('coach_id').eq('profile_id', user.id).single(),
    ])
    setMe(prof)
    if (!clientData) { setLoading(false); return }
    setCoachId(clientData.coach_id)
    const { data: cls } = await supabase.from('clients')
      .select('profile_id, profiles!profile_id(id, full_name)')
      .eq('coach_id', clientData.coach_id)
    const { data: coachProf } = await supabase.from('profiles').select('id, full_name').eq('id', clientData.coach_id).single()
    const profMap: Record<string,any> = {}
    if (coachProf) profMap[coachProf.id] = coachProf
    if (prof) profMap[user.id] = prof
    cls?.forEach((c:any) => {
      const p = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      if (p) profMap[p.id] = p
    })
    setProfiles(profMap)
    await loadPosts(clientData.coach_id)
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

  useEffect(() => {
    if (!coachId) return
    const ch = supabase.channel('community-client-v2')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts',   filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_replies', filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_replies' }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [coachId])

  const post = async () => {
    if (!draft.trim() || !me || !coachId) return
    setPosting(true)
    await supabase.from('community_posts').insert({
      coach_id: coachId, author_id: me.id, author_role: 'client', body: draft.trim()
    })
    setDraft(''); setPosting(false); await loadPosts()
  }

  const submitReply = async (postId: string) => {
    const body = replyDrafts[postId]?.trim()
    if (!body || !me || !coachId) return
    setReplyPosting(postId)
    await supabase.from('community_replies').insert({
      post_id: postId, coach_id: coachId, author_id: me.id, author_role: 'client', body
    })
    setReplyDrafts(p => ({ ...p, [postId]: '' }))
    setReplyOpen(null); setReplyPosting(null)
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
    if (diff < 60000)    return 'just now'
    if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
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
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:480, margin:'0 auto' }}
        onClick={() => setReactOpen(null)}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:26, background:t.border }}/>
          <div style={{ fontSize:15, fontWeight:800, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG Fit Community</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:11, color:t.textMuted }}>{Object.keys(profiles).length} members</div>
        </div>

        <div style={{ padding:'14px 14px', display:'flex', flexDirection:'column', gap:12 }}>

          {/* Compose */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:14 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <Avatar name={me?.full_name||'You'} role="client" color={clientColors[me?.id]} size={32}/>
              <div style={{ flex:1 }}>
                <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2}
                  placeholder="Share a win, ask a question, hype someone up... 🔥"
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'8px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                />
                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:6 }}>
                  <button onClick={post} disabled={posting||!draft.trim()}
                    style={{ background:draft.trim()?'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)':'transparent', border:'1px solid '+(draft.trim()?'transparent':t.border), borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:800, color:draft.trim()?'#000':t.textMuted, cursor:posting||!draft.trim()?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {posting ? '...' : 'Post 🔥'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed */}
          {posts.length === 0 && (
            <div style={{ textAlign:'center', padding:48, color:t.textMuted, fontSize:13 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🌱</div>
              Be the first to post something!
            </div>
          )}

          {posts.map(p => {
            const author   = profiles[p.author_id]
            const isCoach  = p.author_role === 'coach'
            const color    = getColor(p.author_id, p.author_role)
            const grouped  = groupReactions(p.reactions)
            const postReplies = replies[p.id] || []
            const showReplyBox = replyOpen === p.id

            return (
              <div key={p.id} style={{ background:t.surface, border:'1px solid '+(p.pinned?t.teal+'40':t.border), borderRadius:14, overflow:'hidden' }}>
                {p.pinned && <div style={{ background:t.tealDim, padding:'4px 12px', fontSize:10, fontWeight:800, color:t.teal }}>📌 Pinned</div>}

                <div style={{ padding:'12px 14px' }}>
                  {/* Author */}
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
                    <Avatar name={author?.full_name||'?'} role={p.author_role} color={color} size={30}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{author?.full_name||'Someone'}</span>
                        {isCoach && <span style={{ fontSize:8, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 5px', borderRadius:20 }}>COACH</span>}
                      </div>
                      <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.created_at)}</div>
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ fontSize:13, lineHeight:1.65, marginBottom:10 }}>{p.body}</div>

                  {/* Reactions + Reply */}
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }} onClick={e=>e.stopPropagation()}>
                    {grouped.map(([emoji, { count, mine }]) => (
                      <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                        style={{ padding:'3px 8px', borderRadius:20, border:'1px solid '+(mine?t.teal+'60':t.border), background:mine?t.tealDim:'transparent', cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif", color:mine?t.teal:t.textDim }}>
                        {emoji}{count > 1 ? ` ${count}` : ''}
                      </button>
                    ))}

                    {/* Emoji picker */}
                    <div style={{ position:'relative' }}>
                      <button onClick={e=>{ e.stopPropagation(); setReactOpen(reactOpen===p.id?null:p.id) }}
                        style={{ background:'none', border:'1px solid '+t.border, borderRadius:20, padding:'3px 8px', cursor:'pointer', fontSize:11, color:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
                        + 😄
                      </button>
                      {reactOpen === p.id && (
                        <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:24, padding:'5px 8px', display:'flex', gap:3, zIndex:10, boxShadow:'0 4px 20px rgba(0,0,0,.5)', whiteSpace:'nowrap' }}>
                          {QUICK_REACTIONS.map(emoji => (
                            <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                              style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:'2px' }}>
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Reply toggle */}
                    <button onClick={()=>{ setReplyOpen(showReplyBox?null:p.id); setTimeout(()=>replyInputRef.current?.focus(), 50) }}
                      style={{ background:'none', border:'1px solid '+(showReplyBox?t.teal+'40':t.border), borderRadius:20, padding:'3px 9px', cursor:'pointer', fontSize:11, fontWeight:600, color:showReplyBox?t.teal:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
                      💬 {postReplies.length > 0 ? `${postReplies.length} ${postReplies.length===1?'reply':'replies'}` : 'Reply'}
                    </button>
                  </div>
                </div>

                {/* Replies */}
                {(postReplies.length > 0 || showReplyBox) && (
                  <div style={{ borderTop:'1px solid '+t.border, background:t.surfaceUp }}>

                    {postReplies.map((r, i) => {
                      const rAuthor = profiles[r.author_id]
                      const rColor  = getColor(r.author_id, r.author_role)
                      return (
                        <div key={r.id} style={{ display:'flex', gap:8, padding:'9px 14px', borderBottom: (i < postReplies.length - 1 || showReplyBox) ? '1px solid '+t.border+'44' : 'none', alignItems:'flex-start' }}>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                            <div style={{ width:2, height:5, background:t.border+'88' }}/>
                            <Avatar name={rAuthor?.full_name||'?'} role={r.author_role} color={rColor} size={22}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                              <span style={{ fontSize:11, fontWeight:700 }}>{rAuthor?.full_name||'Unknown'}</span>
                              {r.author_role==='coach' && <span style={{ fontSize:8, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 4px', borderRadius:20 }}>COACH</span>}
                              <span style={{ fontSize:10, color:t.textMuted }}>{fmt(r.created_at)}</span>
                            </div>
                            <div style={{ fontSize:12, color:t.textDim, lineHeight:1.55 }}>{r.body}</div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Reply input */}
                    {showReplyBox && (
                      <div style={{ display:'flex', gap:8, padding:'9px 14px', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                          <div style={{ width:2, height:5, background:t.border+'88' }}/>
                          <Avatar name={me?.full_name||'You'} role="client" color={clientColors[me?.id]} size={22}/>
                        </div>
                        <div style={{ flex:1 }}>
                          <textarea
                            ref={replyInputRef}
                            className="reply-input"
                            value={replyDrafts[p.id]||''}
                            onChange={e=>setReplyDrafts(prev=>({...prev,[p.id]:e.target.value}))}
                            placeholder="Write a reply..."
                            rows={2}
                            style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:12, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                            onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); submitReply(p.id) } }}
                          />
                          <div style={{ display:'flex', justifyContent:'flex-end', gap:6, marginTop:4 }}>
                            <button onClick={()=>{ setReplyOpen(null); setReplyDrafts(p=>({...p,[p.id]:''})) }}
                              style={{ background:'none', border:'1px solid '+t.border, borderRadius:7, padding:'3px 9px', fontSize:10, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                              Cancel
                            </button>
                            <button onClick={()=>submitReply(p.id)} disabled={!replyDrafts[p.id]?.trim()||replyPosting===p.id}
                              style={{ background:replyDrafts[p.id]?.trim()?t.teal:'transparent', border:'1px solid '+(replyDrafts[p.id]?.trim()?'transparent':t.border), borderRadius:7, padding:'3px 10px', fontSize:10, fontWeight:800, color:replyDrafts[p.id]?.trim()?'#000':t.textMuted, cursor:replyDrafts[p.id]?.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                              {replyPosting===p.id ? '...' : 'Reply'}
                            </button>
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
    </>
  )
}
