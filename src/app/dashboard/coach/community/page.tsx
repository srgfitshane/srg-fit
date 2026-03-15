'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6',
  green:'#22c55e', red:'#ef4444', pink:'#f472b6', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}
const QUICK_REACTIONS = ['💪','🔥','❤️','🎉','👏','😤','🏆','⚡']
const CLIENT_COLORS = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]

function Avatar({ name, role, size=36, color }: { name:string, role:string, size?:number, color?:string }) {
  const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2)
  const bg = role==='coach' ? 'linear-gradient(135deg,#00c9b1,#f5a623)' : `linear-gradient(135deg,${color||t.purple},${color||t.purple}88)`
  return (
    <div style={{ width:size, height:size, borderRadius:size/3, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size/3, fontWeight:900, color:'#000', flexShrink:0 }}>
      {initials}
    </div>
  )
}

export default function CoachCommunityPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [posts,     setPosts]     = useState<any[]>([])
  const [profiles,  setProfiles]  = useState<Record<string,any>>({})
  const [loading,   setLoading]   = useState(true)
  const [me,        setMe]        = useState<any>(null)
  const [coachId,   setCoachId]   = useState('')
  const [draft,     setDraft]     = useState('')
  const [posting,   setPosting]   = useState(false)
  const [reactOpen, setReactOpen] = useState<string|null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setMe(prof)

    // Get all clients to build profile map
    const { data: cls } = await supabase
      .from('clients').select('profile_id, profiles!profile_id(id, full_name)')
      .eq('coach_id', user.id)
    const profMap: Record<string, any> = { [user.id]: prof }
    cls?.forEach((c: any) => {
      const p = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
      if (p) profMap[p.id] = p
    })
    setProfiles(profMap)

    await loadPosts(user.id)
    setLoading(false)
  }

  const loadPosts = async (cid?: string) => {
    const id = cid || coachId
    const { data } = await supabase
      .from('community_posts')
      .select('*, reactions:community_reactions(*)')
      .eq('coach_id', id)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    setPosts(data || [])
  }

  // Realtime
  useEffect(() => {
    if (!coachId) return
    const ch = supabase.channel('community-coach')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts', filter: `coach_id=eq.${coachId}` }, () => loadPosts())
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
    setDraft('')
    setPosting(false)
    await loadPosts()
  }

  const togglePin = async (id: string, pinned: boolean) => {
    await supabase.from('community_posts').update({ pinned: !pinned }).eq('id', id)
    await loadPosts()
  }

  const deletePost = async (id: string) => {
    await supabase.from('community_posts').delete().eq('id', id)
    await loadPosts()
  }

  const toggleReaction = async (postId: string, emoji: string) => {
    if (!me) return
    const post = posts.find(p => p.id === postId)
    const existing = post?.reactions?.find((r: any) => r.user_id === me.id && r.emoji === emoji)
    if (existing) {
      await supabase.from('community_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('community_reactions').insert({ post_id: postId, user_id: me.id, emoji })
    }
    setReactOpen(null)
    await loadPosts()
  }

  const groupReactions = (reactions: any[] = []) => {
    const map: Record<string, { count: number, mine: boolean }> = {}
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false }
      map[r.emoji].count++
      if (r.user_id === me?.id) map[r.emoji].mine = true
    }
    return Object.entries(map)
  }

  const fmt = (ts: string) => {
    const d = new Date(ts)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
    return d.toLocaleDateString([], { month:'short', day:'numeric' })
  }

  const clientColors = Object.keys(profiles).filter(id => id !== coachId)
    .reduce((acc, id, i) => ({ ...acc, [id]: CLIENT_COLORS[i % CLIENT_COLORS.length] }), {} as Record<string,string>)

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .rmt-scroll::-webkit-scrollbar{width:4px}.rmt-scroll::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }} onClick={() => setReactOpen(null)}>

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
              <Avatar name={me?.full_name||'Coach'} role="coach" size={38}/>
              <div style={{ flex:1 }}>
                <textarea value={draft} onChange={e=>setDraft(e.target.value)}
                  placeholder="Share a win, drop some motivation, or just check in with the crew... 💪"
                  rows={3}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }}
                  onKeyDown={e=>{ if(e.key==='Enter' && e.metaKey) post() }}
                />
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

          {/* Posts feed */}
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {posts.length === 0 && (
              <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted, fontSize:13 }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🌱</div>
                <div style={{ fontWeight:700, marginBottom:6 }}>Community is empty</div>
                <div>Be the first to post something!</div>
              </div>
            )}
            {posts.map(p => {
              const author = profiles[p.author_id]
              const isMe = p.author_id === me?.id
              const isCoach = p.author_role === 'coach'
              const color = isCoach ? undefined : clientColors[p.author_id]
              const grouped = groupReactions(p.reactions)

              return (
                <div key={p.id} style={{ background:t.surface, border:'1px solid '+(p.pinned?t.teal+'40':t.border), borderRadius:14, padding:16, position:'relative' }}>
                  {p.pinned && <div style={{ position:'absolute', top:12, right:12, fontSize:10, fontWeight:800, color:t.teal, background:t.tealDim, padding:'2px 7px', borderRadius:20 }}>📌 Pinned</div>}

                  {/* Author row */}
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                    <Avatar name={author?.full_name||'?'} role={p.author_role} color={color} size={36}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{author?.full_name||'Unknown'}</span>
                        {isCoach && <span style={{ fontSize:9, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 6px', borderRadius:20 }}>COACH</span>}
                      </div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{fmt(p.created_at)}</div>
                    </div>
                    {/* Coach controls */}
                    {me?.id === coachId && (
                      <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>togglePin(p.id, p.pinned)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:14, opacity:p.pinned?1:0.4, padding:'2px 4px' }} title={p.pinned?'Unpin':'Pin'}>
                          📌
                        </button>
                        {isMe && <button onClick={()=>deletePost(p.id)}
                          style={{ background:'none', border:'none', cursor:'pointer', fontSize:12, color:t.textMuted, padding:'2px 4px', opacity:0.6 }} title="Delete">
                          ✕
                        </button>}
                      </div>
                    )}
                  </div>

                  {/* Body */}
                  <div style={{ fontSize:14, lineHeight:1.6, color:t.text, marginBottom:10 }}>{p.body}</div>

                  {/* Reactions + react button */}
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }} onClick={e=>e.stopPropagation()}>
                    {grouped.map(([emoji, { count, mine }]) => (
                      <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                        style={{ display:'flex', alignItems:'center', gap:3, padding:'3px 9px', borderRadius:20, border:'1px solid '+(mine?t.teal+'60':t.border), background:mine?t.tealDim:'transparent', cursor:'pointer', fontSize:13, fontFamily:"'DM Sans',sans-serif", color:mine?t.teal:t.textDim, fontWeight:mine?700:400 }}>
                        {emoji} {count > 1 && <span style={{ fontSize:11 }}>{count}</span>}
                      </button>
                    ))}
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
                  </div>
                </div>
              )
            })}
          </div>
          <div ref={bottomRef}/>
        </div>
      </div>
    </>
  )
}
