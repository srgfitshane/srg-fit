'use client'

/**
 * CommunityFeed — single source of truth for the SRG Fit community.
 * Used by both the client page and coach page.
 * Rule: all UI/logic changes happen HERE only.
 */

import Image from 'next/image'
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import { resolveSignedMediaUrl } from '@/lib/media'
import { GiphyFetch } from '@giphy/js-fetch-api'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6',
  green:'#22c55e', pink:'#f472b6', yellow:'#facc15', red:'#ef4444',
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

interface Props {
  role: 'coach' | 'client'
  backPath: string
  showBottomNav?: boolean
}

type ProfileRecord = {
  id: string
  full_name?: string | null
}

type ClientMembershipRow = {
  profile_id: string
  profiles: ProfileRecord | ProfileRecord[] | null
}

type CommunityReaction = {
  id: string
  post_id: string
  user_id: string
  emoji: string
}

type CommunityPost = {
  id: string
  coach_id: string
  author_id: string
  author_role: 'coach' | 'client'
  body: string | null
  image_url: string | null
  video_url: string | null
  pinned?: boolean | null
  archived?: boolean | null
  created_at: string
  reactions?: CommunityReaction[]
}

type CommunityReply = {
  id: string
  post_id: string
  coach_id: string
  author_id: string
  author_role: 'coach' | 'client'
  body: string
  created_at: string
}

export default function CommunityFeed({ role, backPath, showBottomNav = false }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const router   = useRouter()
  const [posts,        setPosts]        = useState<CommunityPost[]>([])
  const [replies,      setReplies]      = useState<Record<string,CommunityReply[]>>({})
  const [profiles,     setProfiles]     = useState<Record<string,ProfileRecord>>({})
  const [me,           setMe]           = useState<ProfileRecord | null>(null)
  const [coachId,      setCoachId]      = useState('')
  const [loading,      setLoading]      = useState(true)
  const [draft,        setDraft]        = useState('')
  const [posting,      setPosting]      = useState(false)
  const [reactOpen,    setReactOpen]    = useState<string|null>(null)
  const [replyDrafts,  setReplyDrafts]  = useState<Record<string,string>>({})
  const [replyOpen,    setReplyOpen]    = useState<string|null>(null)
  const [replyPosting, setReplyPosting] = useState<string|null>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  const [mediaFile,    setMediaFile]    = useState<File|null>(null)
  const [mediaPreview, setMediaPreview] = useState<string|null>(null)
  const [mediaType,    setMediaType]    = useState<'image'|'video'|null>(null)
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showGifPicker, setShowGifPicker] = useState(false)
  const [gifUrl,        setGifUrl]        = useState<string|null>(null)
  const [gifQuery,      setGifQuery]      = useState('')
  const [gifs,          setGifs]          = useState<any[]>([])
  const [gifLoading,    setGifLoading]    = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])
  const [nowMs,        setNowMs]        = useState(() => Date.now())
  const [showArchived, setShowArchived] = useState(false)
  const [coachMenu,    setCoachMenu]    = useState<string|null>(null)

  const loadPosts = useCallback(async (cid?: string) => {
    const id = cid || coachId
    if (!id) return
    const { data: postData } = await supabase
      .from('community_posts')
      .select('*, reactions:community_reactions(*)')
      .eq('coach_id', id)
      .eq('archived', false)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)
    const resolvedPosts = await Promise.all(((postData || []) as CommunityPost[]).map(async (post) => {
      const resolveUrl = async (url: string | null) => {
        if (!url) return null
        if (url.startsWith('http')) return url // already a full URL (GIF etc.)
        const { data } = await supabase.storage.from('community-media').createSignedUrl(url, 60 * 60)
        return data?.signedUrl || null
      }
      return {
        ...post,
        image_url: await resolveUrl(post.image_url),
        video_url: await resolveUrl(post.video_url),
      }
    }))
    setPosts(resolvedPosts)
    if (resolvedPosts.length) {
      const { data: replyData } = await supabase
        .from('community_replies').select('*').eq('coach_id', id)
        .in('post_id', resolvedPosts.map((post) => post.id))
        .order('created_at', { ascending: true })
      const grouped: Record<string,CommunityReply[]> = {}
      ;((replyData || []) as CommunityReply[]).forEach((reply) => {
        if (!grouped[reply.post_id]) grouped[reply.post_id] = []
        grouped[reply.post_id].push(reply)
      })
      setReplies(grouped)
    } else {
      setReplies({})
    }
  }, [coachId, supabase])

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        const { data: prof } = await supabase.from('profiles').select('id, full_name').eq('id', user.id).single<ProfileRecord>()
        setMe(prof)
        let resolvedCoachId = ''
        if (role === 'coach') {
          resolvedCoachId = user.id
        } else {
          const { data: clientData } = await supabase
            .from('clients').select('coach_id').eq('profile_id', user.id).single<{ coach_id: string | null }>()
          if (!clientData?.coach_id) { setLoading(false); return }
          resolvedCoachId = clientData.coach_id
        }
        setCoachId(resolvedCoachId)
        const { data: cls } = await supabase.from('clients')
          .select('profile_id, profiles!profile_id(id, full_name)')
          .eq('coach_id', resolvedCoachId)
        const { data: coachProf } = await supabase.from('profiles').select('id, full_name').eq('id', resolvedCoachId).single<ProfileRecord>()
        const profMap: Record<string,ProfileRecord> = {}
        if (coachProf) profMap[coachProf.id] = coachProf
        if (prof) profMap[user.id] = prof
        ;((cls || []) as ClientMembershipRow[]).forEach((client) => {
          const profile = Array.isArray(client.profiles) ? client.profiles[0] : client.profiles
          if (profile) profMap[profile.id] = profile
        })
        setProfiles(profMap)
        await loadPosts(resolvedCoachId)
        setLoading(false)
      })()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [loadPosts, role, router, supabase])

  useEffect(() => {
    if (!coachId) return
    const ch = supabase.channel('community-shared-v1')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_posts',   filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_replies', filter: `coach_id=eq.${coachId}` }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_replies' }, () => loadPosts())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_reactions' }, () => loadPosts())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [coachId, loadPosts, supabase])

  useEffect(() => {
    const intervalId = setInterval(() => setNowMs(Date.now()), 60000)
    return () => clearInterval(intervalId)
  }, [])

  const attachMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')
    if (!isVideo && !isImage) return
    setMediaFile(file); setMediaType(isVideo ? 'video' : 'image')
    setMediaPreview(URL.createObjectURL(file)); e.target.value = ''
  }

  const clearMedia = () => {
    if (mediaPreview) URL.revokeObjectURL(mediaPreview)
    setMediaFile(null); setMediaPreview(null); setMediaType(null)
  }

  const searchGifs = async (q: string) => {
    setGifLoading(true)
    try {
      const { data } = q.trim()
        ? await gf.search(q, { limit: 18, rating: 'g' })
        : await gf.trending({ limit: 18, rating: 'g' })
      setGifs(data)
    } catch { setGifs([]) }
    setGifLoading(false)
  }

  const pickGif = (gif: any) => {
    const url = gif.images?.fixed_height?.url || gif.images?.original?.url || ''
    setGifUrl(url)
    setShowGifPicker(false)
    setGifQuery('')
    setGifs([])
    clearMedia()
  }

  const post = async () => {
    if (!draft.trim() && !mediaFile && !gifUrl) return
    if (!me || !coachId) return
    setPosting(true)
    let imageUrl: string|null = null
    let videoUrl: string|null = null
    if (mediaFile && mediaType) {
      setUploading(true)
      const ext  = mediaFile.name.split('.').pop()
      const path = `${me.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('community-media').upload(path, mediaFile, { upsert: false })
      if (!error) {
        const { data: sd } = await supabase.storage.from('community-media').createSignedUrl(path, 60)
        if (mediaType === 'image') imageUrl = sd?.signedUrl ? path : null
        else videoUrl = sd?.signedUrl ? path : null
      }
      setUploading(false)
    }
    await supabase.from('community_posts').insert({
      coach_id: coachId, author_id: me.id, author_role: role,
      body: draft.trim(),
      ...(imageUrl && { image_url: imageUrl }),
      ...(gifUrl && !imageUrl && { image_url: gifUrl }),
      ...(videoUrl && { video_url: videoUrl }),
    })
    setDraft(''); clearMedia(); setGifUrl(null); setPosting(false); await loadPosts()
  }

  const deletePost = async (postId: string) => {
    if (!confirm('Delete this post? This cannot be undone.')) return
    await supabase.from('community_replies').delete().eq('post_id', postId)
    await supabase.from('community_posts').delete().eq('id', postId)
    await loadPosts()
  }

  const archivePost = async (postId: string, currentArchived: boolean) => {
    await supabase.from('community_posts').update({ archived: !currentArchived }).eq('id', postId)
    await loadPosts()
  }

  const pinPost = async (postId: string, currentPinned: boolean | null) => {
    await supabase.from('community_posts').update({ pinned: !currentPinned }).eq('id', postId)
    await loadPosts()
  }

  const deleteReply = async (replyId: string) => {
    if (!confirm('Delete this reply?')) return
    await supabase.from('community_replies').delete().eq('id', replyId)
    await loadPosts()
  }

  const submitReply = async (postId: string) => {
    const body = replyDrafts[postId]?.trim()
    if (!body || !me || !coachId) return
    setReplyPosting(postId)
    await supabase.from('community_replies').insert({
      post_id: postId, coach_id: coachId, author_id: me.id, author_role: role, body
    })
    setReplyDrafts(p => ({ ...p, [postId]: '' }))
    setReplyOpen(null); setReplyPosting(null); await loadPosts()
  }

  const toggleReaction = async (postId:string, emoji:string) => {
    if (!me) return
    const selectedPost = posts.find((post) => post.id === postId)
    const existing = selectedPost?.reactions?.find((reaction) => reaction.user_id === me.id && reaction.emoji === emoji)
    if (existing) await supabase.from('community_reactions').delete().eq('id', existing.id)
    else await supabase.from('community_reactions').insert({ post_id: postId, user_id: me.id, emoji })
    setReactOpen(null); await loadPosts()
  }

  const groupReactions = (reactions:CommunityReaction[] = []) => {
    const map: Record<string,{ count:number, mine:boolean }> = {}
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count:0, mine:false }
      map[r.emoji].count++
      if (r.user_id === me?.id) map[r.emoji].mine = true
    }
    return Object.entries(map)
  }

  const fmt = (ts:string) => {
    const diff = nowMs - new Date(ts).getTime()
    if (diff < 60000)    return 'just now'
    if (diff < 3600000)  return `${Math.floor(diff/60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`
    return new Date(ts).toLocaleDateString([], { month:'short', day:'numeric' })
  }

  const clientColors = Object.keys(profiles)
    .filter(id => id !== coachId)
    .reduce((acc, id, i) => ({ ...acc, [id]: CLIENT_COLORS[i % CLIENT_COLORS.length] }), {} as Record<string,string>)

  const getColor = (authorId:string, authorRole:string) => authorRole === 'coach' ? undefined : clientColors[authorId]

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}textarea{resize:none;}.reply-input:focus{outline:none;border-color:${t.teal}60 !important;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:480, margin:'0 auto' }}
        onClick={() => { setReactOpen(null); setCoachMenu(null) }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:56, gap:12 }}>
          <button onClick={()=>router.push(backPath)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:26, background:t.border }}/>
          <div style={{ fontSize:15, fontWeight:800, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG Fit Community</div>
          <div style={{ flex:1 }}/>
          <div style={{ fontSize:11, color:t.textMuted }}>{Object.keys(profiles).length} members</div>
        </div>

        <div style={{ padding:'14px 14px 88px 14px', display:'flex', flexDirection:'column', gap:12 }}>

          {/* Compose */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:14 }}>
            <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
              <Avatar name={me?.full_name||'You'} role={role} color={me?.id ? clientColors[me.id] : undefined} size={32}/>
              <div style={{ flex:1 }}>
                <textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={2}
                  placeholder="Share a win, ask a question, hype someone up... 🔥"
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'8px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                />
                {mediaPreview && (
                  <div style={{ position:'relative', marginTop:8, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border }}>
                    {mediaType === 'image'
                      ? <Image src={mediaPreview} alt="Attachment preview" width={600} height={240} unoptimized style={{ width:'100%', maxHeight:240, height:'auto', objectFit:'cover', display:'block' }}/>
                      : <video src={mediaPreview} controls style={{ width:'100%', maxHeight:240, display:'block' }}/>
                    }
                    <button onClick={clearMedia} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.7)', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                  </div>
                )}
                {gifUrl && !mediaPreview && (
                  <div style={{ position:'relative', marginTop:8, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border }}>
                    <img src={gifUrl} alt="GIF" style={{ width:'100%', maxHeight:200, objectFit:'cover', display:'block' }}/>
                    <button onClick={()=>setGifUrl(null)} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.7)', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                  </div>
                )}
                {showGifPicker && (
                  <div style={{ marginTop:8, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, overflow:'hidden' }}>
                    <div style={{ padding:'8px 8px 4px', display:'flex', gap:6 }}>
                      <input
                        value={gifQuery} onChange={e=>setGifQuery(e.target.value)}
                        onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); searchGifs(gifQuery) } }}
                        placeholder="Search GIFs..." autoFocus
                        style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:7, padding:'6px 10px', fontSize:12, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
                      />
                      <button onClick={()=>searchGifs(gifQuery)} style={{ background:t.teal, border:'none', borderRadius:7, padding:'6px 10px', fontSize:11, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Go</button>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:6, padding:'4px 8px 8px', maxHeight:320, overflowY:'auto' }}>
                      {gifLoading && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:16, color:t.textMuted, fontSize:12 }}>Loading...</div>}
                      {!gifLoading && gifs.map((gif:any) => (
                        <button key={gif.id} onClick={()=>pickGif(gif)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', borderRadius:8, overflow:'hidden' }}>
                          <img src={gif.images?.fixed_height?.url || gif.images?.original?.url} alt={gif.title} style={{ width:'100%', display:'block' }}/>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
                  <div style={{ display:'flex', gap:6 }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={attachMedia} style={{ display:'none' }}/>
                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','image/*'); fileInputRef.current?.click() }} title="Add photo" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🖼️</button>
                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','video/*'); fileInputRef.current?.click() }} title="Add video" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🎥</button>
                    <button onClick={()=>{ setShowGifPicker(p=>!p); if(!gifs.length) searchGifs('') }} title="Add GIF" style={{ background:showGifPicker?t.tealDim:'none', border:'1px solid '+(showGifPicker?t.teal:t.border), borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:800, cursor:'pointer', color:showGifPicker?t.teal:t.textMuted, lineHeight:1 }}>GIF</button>
                  </div>
                  <button onClick={post} disabled={posting||uploading||(!draft.trim()&&!mediaFile&&!gifUrl)}
                    style={{ background:(draft.trim()||mediaFile||gifUrl)?'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)':'transparent', border:'1px solid '+((draft.trim()||mediaFile||gifUrl)?'transparent':t.border), borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:800, color:(draft.trim()||mediaFile||gifUrl)?'#000':t.textMuted, cursor:(posting||uploading||(!draft.trim()&&!mediaFile&&!gifUrl))?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {uploading?'Uploading...':posting?'...':'Post 🔥'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed */}
          {posts.length === 0 && (
            <div style={{ textAlign:'center', padding:48, color:t.textMuted, fontSize:13 }}>
              <div style={{ fontSize:36, marginBottom:10 }}>🌱</div>Be the first to post something!
            </div>
          )}

          {posts.map((p) => {
            const author      = profiles[p.author_id]
            const isCoach     = p.author_role === 'coach'
            const color       = getColor(p.author_id, p.author_role)
            const grouped     = groupReactions(p.reactions)
            const postReplies = replies[p.id] || []
            const showReplyBox = replyOpen === p.id
            return (
              <div key={p.id} style={{ background:t.surface, border:'1px solid '+(p.pinned?t.teal+'40':t.border), borderRadius:14, overflow:'hidden' }}>
                {p.pinned && <div style={{ background:t.tealDim, padding:'4px 12px', fontSize:10, fontWeight:800, color:t.teal }}>📌 Pinned</div>}
                <div style={{ padding:'12px 14px' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:8 }}>
                    <Avatar name={author?.full_name||'?'} role={p.author_role} color={color} size={30}/>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{(author?.full_name||'Someone').split(' ')[0]}</span>
                        {isCoach && <span style={{ fontSize:8, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 5px', borderRadius:20 }}>COACH</span>}
                      </div>
                      <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.created_at)}</div>
                    </div>
                    {/* Coach moderation menu */}
                    {role === 'coach' && (
                      <div style={{ position:'relative' }}>
                        <button onClick={e=>{ e.stopPropagation(); setCoachMenu(coachMenu===p.id?null:p.id) }}
                          style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'2px 6px', lineHeight:1, borderRadius:6 }}>
                          ···
                        </button>
                        {coachMenu === p.id && (
                          <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'4px', zIndex:50, minWidth:150, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}
                            onClick={e=>e.stopPropagation()}>
                            <button onClick={()=>{ pinPost(p.id, p.pinned??false); setCoachMenu(null) }}
                              style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', padding:'8px 12px', fontSize:12, fontWeight:700, color:t.text, cursor:'pointer', borderRadius:7 }}>
                              {p.pinned ? '📌 Unpin' : '📌 Pin to top'}
                            </button>
                            <button onClick={()=>{ archivePost(p.id, p.archived??false); setCoachMenu(null) }}
                              style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', padding:'8px 12px', fontSize:12, fontWeight:700, color:t.yellow, cursor:'pointer', borderRadius:7 }}>
                              {p.archived ? '📂 Unarchive' : '📦 Archive'}
                            </button>
                            <button onClick={()=>{ deletePost(p.id); setCoachMenu(null) }}
                              style={{ display:'block', width:'100%', textAlign:'left', background:'none', border:'none', padding:'8px 12px', fontSize:12, fontWeight:700, color:t.red, cursor:'pointer', borderRadius:7 }}>
                              🗑️ Delete post
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {p.body && <div style={{ fontSize:13, lineHeight:1.65, marginBottom:10 }}>{p.body}</div>}
                  {p.image_url && (
                    <div style={{ borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                      {p.image_url?.includes('giphy.com') ? (
                        <img src={p.image_url} alt="GIF" style={{ width:'100%', maxHeight:320, objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>window.open(p.image_url || undefined,'_blank')}/>
                      ) : (
                        <Image src={p.image_url!} alt="Community post image" width={640} height={320} unoptimized style={{ width:'100%', maxHeight:320, height:'auto', objectFit:'cover', display:'block', cursor:'pointer' }} onClick={()=>window.open(p.image_url || undefined,'_blank')}/>
                      )}
                    </div>
                  )}
                  {p.video_url && (
                    <div style={{ borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                      <video src={p.video_url} controls playsInline style={{ width:'100%', maxHeight:320, display:'block', background:'#000' }}/>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }} onClick={e=>e.stopPropagation()}>
                    {grouped.map(([emoji, { count, mine }]) => (
                      <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                        style={{ padding:'3px 8px', borderRadius:20, border:'1px solid '+(mine?t.teal+'60':t.border), background:mine?t.tealDim:'transparent', cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif", color:mine?t.teal:t.textDim }}>
                        {emoji}{count > 1 ? ` ${count}` : ''}
                      </button>
                    ))}
                    <div style={{ position:'relative' }}>
                      <button onClick={e=>{ e.stopPropagation(); setReactOpen(reactOpen===p.id?null:p.id) }}
                        style={{ background:'none', border:'1px solid '+t.border, borderRadius:20, padding:'3px 8px', cursor:'pointer', fontSize:11, color:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>+ 😄</button>
                      {reactOpen === p.id && (
                        <div style={{ position:'absolute', bottom:'calc(100% + 6px)', left:0, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:24, padding:'5px 8px', display:'flex', gap:3, zIndex:10, boxShadow:'0 4px 20px rgba(0,0,0,.5)', whiteSpace:'nowrap' }}>
                          {QUICK_REACTIONS.map(emoji => (
                            <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, padding:'2px' }}>{emoji}</button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button onClick={()=>{ setReplyOpen(showReplyBox?null:p.id); setTimeout(()=>replyInputRef.current?.focus(),50) }}
                      style={{ background:'none', border:'1px solid '+(showReplyBox?t.teal+'40':t.border), borderRadius:20, padding:'3px 9px', cursor:'pointer', fontSize:11, fontWeight:600, color:showReplyBox?t.teal:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
                      💬 {postReplies.length > 0 ? `${postReplies.length} ${postReplies.length===1?'reply':'replies'}` : 'Reply'}
                    </button>
                  </div>
                </div>

                {(postReplies.length > 0 || showReplyBox) && (
                  <div style={{ borderTop:'1px solid '+t.border, background:t.surfaceUp }}>
                    {postReplies.map((r, i:number) => {
                      const rAuthor = profiles[r.author_id]
                      const rColor  = getColor(r.author_id, r.author_role)
                      return (
                        <div key={r.id} style={{ display:'flex', gap:8, padding:'9px 14px', borderBottom:(i<postReplies.length-1||showReplyBox)?'1px solid '+t.border+'44':'none', alignItems:'flex-start' }}>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                            <div style={{ width:2, height:5, background:t.border+'88' }}/>
                            <Avatar name={rAuthor?.full_name||'?'} role={r.author_role} color={rColor} size={22}/>
                          </div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:2 }}>
                              <span style={{ fontSize:11, fontWeight:700 }}>{(rAuthor?.full_name||'Unknown').split(' ')[0]}</span>
                              {r.author_role==='coach' && <span style={{ fontSize:8, fontWeight:800, color:t.teal, background:t.tealDim, padding:'1px 4px', borderRadius:20 }}>COACH</span>}
                              <span style={{ fontSize:10, color:t.textMuted }}>{fmt(r.created_at)}</span>
                            </div>
                            <div style={{ fontSize:12, color:t.textDim, lineHeight:1.55 }}>{r.body}</div>
                          </div>
                        </div>
                      )
                    })}
                    {showReplyBox && (
                      <div style={{ display:'flex', gap:8, padding:'9px 14px', alignItems:'flex-start' }}>
                        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                          <div style={{ width:2, height:5, background:t.border+'88' }}/>
                          <Avatar name={me?.full_name||'You'} role={role} color={me?.id ? clientColors[me.id] : undefined} size={22}/>
                        </div>
                        <div style={{ flex:1 }}>
                          <textarea ref={replyInputRef} className="reply-input"
                            value={replyDrafts[p.id]||''} onChange={e=>setReplyDrafts(prev=>({...prev,[p.id]:e.target.value}))}
                            placeholder="Write a reply..." rows={2}
                            style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:12, color:t.text, fontFamily:"'DM Sans',sans-serif", lineHeight:1.5 }}
                            onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submitReply(p.id)} }}
                          />
                          <div style={{ display:'flex', justifyContent:'flex-end', gap:6, marginTop:4 }}>
                            <button onClick={()=>{ setReplyOpen(null); setReplyDrafts(prev=>({...prev,[p.id]:''})) }}
                              style={{ background:'none', border:'1px solid '+t.border, borderRadius:7, padding:'3px 9px', fontSize:10, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                            <button onClick={()=>submitReply(p.id)} disabled={!replyDrafts[p.id]?.trim()||replyPosting===p.id}
                              style={{ background:replyDrafts[p.id]?.trim()?t.teal:'transparent', border:'1px solid '+(replyDrafts[p.id]?.trim()?'transparent':t.border), borderRadius:7, padding:'3px 10px', fontSize:10, fontWeight:800, color:replyDrafts[p.id]?.trim()?'#000':t.textMuted, cursor:replyDrafts[p.id]?.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif" }}>
                              {replyPosting===p.id?'...':'Reply'}
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
      {showBottomNav && <ClientBottomNav />}
    </>
  )
}
