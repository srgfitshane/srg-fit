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
import { alpha } from '@/lib/theme'

const t = {
  bg:"var(--bg)", surface:"var(--surface)", surfaceUp:"var(--surface-up)", surfaceHigh:"var(--surface-high)", border:"var(--border)",
  teal:"var(--teal)", tealDim:"var(--teal-dim)", orange:"var(--orange)", purple:"var(--purple)",
  green:"var(--green)", pink:"var(--pink)", yellow:"var(--yellow)", red:"var(--red)",
  text:"var(--text)", textMuted:"var(--text-muted)", textDim:"var(--text-dim)",
}
const QUICK_REACTIONS = ['💪','🔥','❤️','🎉','👏','😤','🏆','⚡']
const CLIENT_COLORS   = [t.teal, t.orange, t.purple, t.pink, t.green, t.yellow]

function Avatar({ name, role, size=32, color }:{ name:string, role:string, size?:number, color?:string }) {
  const initials = name.split(' ').map(n=>n[0]).join('').slice(0,2).toUpperCase()
  // Client gradient: full color → 53% alpha at the bottom-right.
  // This used to be ${color||t.purple} + '88' (hex alpha suffix), but
  // since color is now a CSS var like 'var(--teal)', concatenating
  // '88' produces 'var(--teal)88' which is invalid CSS — the whole
  // gradient gets dropped and the avatar renders without a background.
  // alpha() routes through color-mix() which works for both hex and
  // var(--*) inputs.
  const fallback = t.purple
  const bg = role==='coach'
    ? 'linear-gradient(135deg,#00c9b1,#f5a623)'
    : `linear-gradient(135deg,${color||fallback},${alpha(color||fallback, 53)})`
  return (
    <div style={{ width:size, height:size, borderRadius:size/3, background:bg,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:size*0.33, fontWeight:900, color:'#000', flexShrink:0 }}>
      {initials}
    </div>
  )
}

/**
 * ImageGrid — renders 1 to 4 images in a social-media-style layout.
 *   1 image  → full width, max 320px tall
 *   2 images → side by side, each 50% width
 *   3 images → one tall left (50%), two stacked right (each 25% height)
 *   4 images → 2×2 grid
 *
 * Images with `giphy.com` in the URL are treated as GIFs and rendered
 * via a plain <img> (Next's Image component refuses external hosts
 * without explicit remotePatterns config). All other URLs go through
 * next/image unoptimized for consistency.
 *
 * editable: when true, each tile gets a small × button that calls
 * onRemove(index). Used only by the composer preview.
 */
function ImageGrid({
  images,
  editable = false,
  onRemove,
}: {
  images: { url: string; key: string }[]
  editable?: boolean
  onRemove?: (idx: number) => void
}) {
  const count = images.length
  if (count === 0) return null

  const Tile = ({ url, idx, style }: { url: string; idx: number; style?: React.CSSProperties }) => (
    <div style={{ position:'relative', overflow:'hidden', background:'#000', ...style }}>
      {url.includes('giphy.com') ? (
        <img
          src={url}
          alt="Community post image"
          onClick={()=>!editable && window.open(url, '_blank')}
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor: editable ? 'default' : 'pointer' }}
        />
      ) : (
        <Image
          src={url}
          alt="Community post image"
          width={640}
          height={640}
          unoptimized
          onClick={()=>!editable && window.open(url, '_blank')}
          style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', cursor: editable ? 'default' : 'pointer' }}
        />
      )}
      {editable && onRemove && (
        <button
          onClick={(e)=>{ e.stopPropagation(); onRemove(idx) }}
          aria-label="Remove image"
          style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.75)', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1, zIndex:2 }}>×</button>
      )}
    </div>
  )

  // Single-image layout matches the old design: full width, capped
  // height, no grid wrapper — keeps existing posts visually identical.
  if (count === 1) {
    return (
      <div style={{ borderRadius:10, overflow:'hidden', maxHeight:320 }}>
        <Tile url={images[0].url} idx={0} style={{ height:'100%', maxHeight:320 }} />
      </div>
    )
  }

  if (count === 2) {
    return (
      <div style={{ borderRadius:10, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, aspectRatio:'2 / 1' }}>
        {images.map((img, i) => <Tile key={img.key} url={img.url} idx={i} />)}
      </div>
    )
  }

  if (count === 3) {
    return (
      <div style={{ borderRadius:10, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr', gap:2, aspectRatio:'1 / 1' }}>
        {/* Left column — tall primary. Spans both rows. */}
        <Tile url={images[0].url} idx={0} style={{ gridRow:'1 / 3' }} />
        <Tile url={images[1].url} idx={1} />
        <Tile url={images[2].url} idx={2} />
      </div>
    )
  }

  // count === 4
  return (
    <div style={{ borderRadius:10, overflow:'hidden', display:'grid', gridTemplateColumns:'1fr 1fr', gridTemplateRows:'1fr 1fr', gap:2, aspectRatio:'1 / 1' }}>
      {images.slice(0, 4).map((img, i) => <Tile key={img.key} url={img.url} idx={i} />)}
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
  // Support up to 4 images per post. image_url_2..4 are additional
  // slots populated when the coach attaches multiple photos. Each
  // column is a raw storage path (same as image_url) OR a full GIPHY
  // URL when a GIF was attached. Signed on read in loadPosts.
  image_url_2: string | null
  image_url_3: string | null
  image_url_4: string | null
  video_url: string | null
  pinned?: boolean | null
  archived?: boolean | null
  is_announcement?: boolean | null
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
  // Coach-only: flag the compose as an announcement. Checked → insert
  // with is_announcement=true and fan out a push to every active
  // client under this coach. State is kept unconditional (even on
  // client role) so React hooks order stays stable; the toggle UI
  // only renders when role === 'coach'.
  const [asAnnouncement, setAsAnnouncement] = useState(false)
  const [reactOpen,    setReactOpen]    = useState<string|null>(null)
  const [replyDrafts,  setReplyDrafts]  = useState<Record<string,string>>({})
  const [replyOpen,    setReplyOpen]    = useState<string|null>(null)
  const [replyPosting, setReplyPosting] = useState<string|null>(null)
  const replyInputRef = useRef<HTMLTextAreaElement>(null)
  // Compose media — images and video are mutually exclusive. A post can
  // have up to 4 images OR one video OR one GIF. Each imageFiles[i] has
  // a matching imagePreviews[i] (object URL for <Image src>); revoke the
  // URL when removed to avoid memory leaks.
  const [imageFiles,    setImageFiles]    = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [videoFile,     setVideoFile]     = useState<File|null>(null)
  const [videoPreview,  setVideoPreview]  = useState<string|null>(null)
  const [uploading,     setUploading]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const MAX_IMAGES = 4
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
      .order('is_announcement', { ascending: false })
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
      // Sign all four image slots in parallel. Each is independent —
      // one missing image shouldn't block the others. Same TTL as
      // before (60min), matching the original single-image flow.
      const [img1, img2, img3, img4, vid] = await Promise.all([
        resolveUrl(post.image_url),
        resolveUrl(post.image_url_2),
        resolveUrl(post.image_url_3),
        resolveUrl(post.image_url_4),
        resolveUrl(post.video_url),
      ])
      return {
        ...post,
        image_url: img1,
        image_url_2: img2,
        image_url_3: img3,
        image_url_4: img4,
        video_url: vid,
      }
    }))
    setPosts(resolvedPosts)
    if (resolvedPosts.length) {
      const { data: replyData } = await supabase
        .from('community_replies').select('*').eq('coach_id', id)
        .in('post_id', resolvedPosts.map((post) => post.id))
        .order('created_at', { ascending: true })
      const grouped: Record<string,CommunityReply[]> = {}
      // Collect all unique author IDs from posts + replies and fetch their profiles
      const authorIds = [...new Set([
        ...resolvedPosts.map(p => p.author_id),
        ...((replyData || []) as CommunityReply[]).map(r => r.author_id),
      ])]
      if (authorIds.length) {
        const { data: authorProfs } = await supabase
          .from('profiles').select('id, full_name').in('id', authorIds)
        if (authorProfs) {
          setProfiles(prev => {
            const next = { ...prev }
            authorProfs.forEach((p: ProfileRecord) => { next[p.id] = p })
            return next
          })
        }
      }
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
        const { data: coachProf } = await supabase.from('profiles').select('id, full_name').eq('id', resolvedCoachId).single<ProfileRecord>()
        const profMap: Record<string,ProfileRecord> = {}
        if (coachProf) profMap[coachProf.id] = coachProf
        if (prof) profMap[user.id] = prof
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

  // File input supports multiple when adding images. For video we keep
  // single-selection. Image attachments append up to MAX_IMAGES; beyond
  // that we silently drop the overflow — simpler than shouting.
  const attachMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) { e.target.value = ''; return }
    const first = files[0]
    const isVideo = first.type.startsWith('video/')
    const isImage = first.type.startsWith('image/')
    if (!isVideo && !isImage) { e.target.value = ''; return }

    if (isVideo) {
      // Video replaces any existing attachments — can't mix with images.
      clearAllMedia()
      setVideoFile(first)
      setVideoPreview(URL.createObjectURL(first))
      setGifUrl(null)
    } else {
      // Append images up to MAX_IMAGES. If a video was previously staged,
      // clear it (images take over).
      if (videoPreview) { URL.revokeObjectURL(videoPreview); setVideoFile(null); setVideoPreview(null) }
      setGifUrl(null)
      const imageOnly = files.filter(f => f.type.startsWith('image/'))
      const remaining = MAX_IMAGES - imageFiles.length
      const toAdd = imageOnly.slice(0, Math.max(0, remaining))
      if (toAdd.length) {
        setImageFiles(prev => [...prev, ...toAdd])
        setImagePreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))])
      }
    }
    e.target.value = ''
  }

  const removeImageAt = (idx: number) => {
    setImageFiles(prev => prev.filter((_, i) => i !== idx))
    setImagePreviews(prev => {
      const url = prev[idx]
      if (url) URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const clearVideo = () => {
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(null); setVideoPreview(null)
  }

  const clearAllMedia = () => {
    imagePreviews.forEach(url => URL.revokeObjectURL(url))
    setImageFiles([]); setImagePreviews([])
    if (videoPreview) URL.revokeObjectURL(videoPreview)
    setVideoFile(null); setVideoPreview(null)
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
    clearAllMedia()
  }

  const post = async () => {
    const hasContent = draft.trim() || imageFiles.length > 0 || videoFile || gifUrl
    if (!hasContent) return
    if (!me || !coachId) return
    setPosting(true)

    // Upload every staged image in parallel. Each returns its storage
    // path or null on failure; we drop nulls rather than silently
    // advance-failing a post (an orphaned image is worse than one
    // image quietly missing from a 4-pic post — but at least the post
    // is clearly broken, prompting user to retry). If ALL uploads fail
    // we abort the post.
    let imagePaths: string[] = []
    if (imageFiles.length > 0) {
      setUploading(true)
      const results = await Promise.all(imageFiles.map(async (file) => {
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`
        const { error } = await supabase.storage
          .from('community-media').upload(path, file, { upsert: false })
        return error ? null : path
      }))
      setUploading(false)
      imagePaths = results.filter((p): p is string => !!p)
      if (imagePaths.length === 0 && !draft.trim() && !videoFile && !gifUrl) {
        alert('All image uploads failed. Please try again.')
        setPosting(false)
        return
      }
    }

    // Video upload — separate path since video is mutually exclusive
    // with images and has its own column.
    let videoPath: string | null = null
    if (videoFile) {
      setUploading(true)
      const ext = videoFile.name.split('.').pop() || 'mp4'
      const path = `${me.id}/${Date.now()}.${ext}`
      const { error } = await supabase.storage
        .from('community-media').upload(path, videoFile, { upsert: false })
      if (!error) videoPath = path
      setUploading(false)
    }

    // Distribute image paths across image_url / image_url_2/3/4.
    // Position 0 goes to image_url so existing clients (mobile app
    // caching an old query, etc.) still see at least the cover image.
    // If a GIF was attached and no images, image_url holds the GIF URL.
    const [p1, p2, p3, p4] = imagePaths
    const coverImage = p1 ?? (gifUrl && !p1 ? gifUrl : null)

    const isAnnouncement = role === 'coach' && asAnnouncement
    const postBody = draft.trim()
    const { data: inserted, error: insertErr } = await supabase.from('community_posts').insert({
      coach_id: coachId, author_id: me.id, author_role: role,
      body: postBody,
      is_announcement: isAnnouncement,
      image_url:   coverImage,
      image_url_2: p2 ?? null,
      image_url_3: p3 ?? null,
      image_url_4: p4 ?? null,
      video_url:   videoPath,
    }).select('id').single()
    if (insertErr) {
      alert('Could not post: ' + insertErr.message)
      setPosting(false)
      return
    }

    // Announcement → fan out push. Fire-and-forget per rule 8.
    if (isAnnouncement && inserted) {
      const { data: activeClients } = await supabase.from('clients')
        .select('profile_id')
        .eq('coach_id', coachId)
        .not('profile_id', 'is', null)
      const recipientIds = (activeClients || [])
        .map(c => c.profile_id)
        .filter((pid): pid is string => !!pid && pid !== me.id)
      const coachName = me.full_name?.split(' ')[0] || 'Coach Shane'
      const snippet = postBody.length > 80 ? postBody.slice(0, 80) + '…' : postBody
      for (const uid of recipientIds) {
        supabase.functions.invoke('send-notification', {
          body: {
            user_id: uid,
            notification_type: 'announcement',
            title: `📣 ${coachName} posted an announcement`,
            body: snippet || 'New announcement',
            link_url: '/dashboard/client/community',
          }
        }).catch(err => console.warn('[notify:community] failed', err))
      }
    }
    setDraft(''); clearAllMedia(); setGifUrl(null); setAsAnnouncement(false); setPosting(false); await loadPosts()
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
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}textarea{resize:none;}.reply-input:focus{outline:none;border-color:${alpha(t.teal, 38)} !important;}`}</style>
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
                {/* Multi-image composer preview. Renders the same grid
                    layout the post card uses so the coach sees exactly
                    what clients will see. Each tile has its own × to
                    remove; the grid auto-collapses as tiles leave. */}
                {imagePreviews.length > 0 && (
                  <div style={{ marginTop:8 }}>
                    <ImageGrid
                      images={imagePreviews.map((url, i) => ({ url, key: `preview-${i}` }))}
                      editable
                      onRemove={removeImageAt}
                    />
                    {imagePreviews.length < MAX_IMAGES && (
                      <div style={{ fontSize:10, color:t.textMuted, marginTop:6, textAlign:'center' }}>
                        {imagePreviews.length} of {MAX_IMAGES} images · tap 🖼️ to add more
                      </div>
                    )}
                  </div>
                )}
                {videoPreview && (
                  <div style={{ position:'relative', marginTop:8, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border }}>
                    <video src={videoPreview} controls style={{ width:'100%', maxHeight:240, display:'block' }}/>
                    <button onClick={clearVideo} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.7)', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                  </div>
                )}
                {gifUrl && imagePreviews.length === 0 && !videoPreview && (
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
                  <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }}>
                    <input ref={fileInputRef} type="file" accept="image/*,video/*" multiple onChange={attachMedia} style={{ display:'none' }}/>
                    <button
                      onClick={()=>{
                        const el = fileInputRef.current
                        if (!el) return
                        // Images: allow multi-select, up to the remaining
                        // slots. Video: always single.
                        el.setAttribute('accept', 'image/*')
                        el.setAttribute('multiple', 'multiple')
                        el.click()
                      }}
                      disabled={imageFiles.length >= MAX_IMAGES}
                      title={imageFiles.length >= MAX_IMAGES ? `Max ${MAX_IMAGES} images per post` : 'Add photo(s)'}
                      style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:imageFiles.length >= MAX_IMAGES ? 'not-allowed' : 'pointer', color:t.textMuted, lineHeight:1, opacity: imageFiles.length >= MAX_IMAGES ? 0.4 : 1 }}>🖼️</button>
                    <button onClick={()=>{
                        const el = fileInputRef.current
                        if (!el) return
                        el.setAttribute('accept', 'video/*')
                        el.removeAttribute('multiple')
                        el.click()
                      }} title="Add video" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🎥</button>
                    <button onClick={()=>{ setShowGifPicker(p=>!p); if(!gifs.length) searchGifs('') }} title="Add GIF" style={{ background:showGifPicker?t.tealDim:'none', border:'1px solid '+(showGifPicker?t.teal:t.border), borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:800, cursor:'pointer', color:showGifPicker?t.teal:t.textMuted, lineHeight:1 }}>GIF</button>
                    {/* Coach-only announcement toggle — when on, post gets
                        prominent styling + push notifications to every
                        active client. */}
                    {role === 'coach' && (
                      <button
                        onClick={()=>setAsAnnouncement(v => !v)}
                        title={asAnnouncement ? 'Will post as announcement + notify all clients' : 'Mark as announcement (notifies all clients)'}
                        style={{
                          background: asAnnouncement ? `linear-gradient(135deg, ${alpha(t.orange, 25)}, ${alpha(t.teal, 19)})` : 'none',
                          border: '1px solid ' + (asAnnouncement ? t.orange : t.border),
                          borderRadius: 8,
                          padding: '5px 10px',
                          fontSize: 11,
                          fontWeight: 800,
                          cursor: 'pointer',
                          color: asAnnouncement ? t.orange : t.textMuted,
                          lineHeight: 1,
                          letterSpacing: 0.3,
                          fontFamily: "'DM Sans',sans-serif",
                        }}>
                        📣 {asAnnouncement ? 'Announcement ON' : 'Announce'}
                      </button>
                    )}
                  </div>
                  <button onClick={post} disabled={posting||uploading||(!draft.trim()&&imageFiles.length===0&&!videoFile&&!gifUrl)}
                    style={{ background:(draft.trim()||imageFiles.length>0||videoFile||gifUrl)?'linear-gradient(135deg,'+t.teal+','+alpha(t.teal, 80) + ')':'transparent', border:'1px solid '+((draft.trim()||imageFiles.length>0||videoFile||gifUrl)?'transparent':t.border), borderRadius:8, padding:'7px 16px', fontSize:12, fontWeight:800, color:(draft.trim()||imageFiles.length>0||videoFile||gifUrl)?'#000':t.textMuted, cursor:(posting||uploading||(!draft.trim()&&imageFiles.length===0&&!videoFile&&!gifUrl))?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
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
            const isAnnounce  = !!p.is_announcement
            const color       = getColor(p.author_id, p.author_role)
            const grouped     = groupReactions(p.reactions)
            const postReplies = replies[p.id] || []
            const showReplyBox = replyOpen === p.id
            // Announcement cards get a prominent gradient border. We use
            // the double-gradient trick (padding-box for body, border-box
            // for the border image) so the border renders as a filled
            // gradient, not a muted solid.
            const cardStyle: React.CSSProperties = isAnnounce
              ? {
                  border: '2px solid transparent',
                  borderRadius: 14,
                  overflow: 'hidden',
                  backgroundImage: `linear-gradient(${t.surface}, ${t.surface}), linear-gradient(135deg, ${t.orange}, ${t.teal})`,
                  backgroundOrigin: 'border-box',
                  backgroundClip: 'padding-box, border-box',
                }
              : {
                  background: t.surface,
                  border: '1px solid ' + (p.pinned ? alpha(t.teal, 25) : t.border),
                  borderRadius: 14,
                  overflow: 'hidden',
                }
            return (
              <div key={p.id} style={cardStyle}>
                {isAnnounce && (
                  <div style={{ background:`linear-gradient(135deg, ${alpha(t.orange, 80)}, ${alpha(t.teal, 60)})`, padding:'5px 12px', fontSize:10, fontWeight:800, color:'#000', letterSpacing:0.5, display:'flex', alignItems:'center', gap:6 }}>
                    📣 COACH ANNOUNCEMENT
                  </div>
                )}
                {!isAnnounce && p.pinned && <div style={{ background:t.tealDim, padding:'4px 12px', fontSize:10, fontWeight:800, color:t.teal }}>📌 Pinned</div>}
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
                  {(() => {
                    // Collect non-null images into an array. If only
                    // image_url is set (legacy single-image post or
                    // GIF), ImageGrid still renders the one-up layout
                    // identical to the old single-image case.
                    const imgs = [p.image_url, p.image_url_2, p.image_url_3, p.image_url_4]
                      .filter((u): u is string => !!u)
                      .map((url, i) => ({ url, key: `${p.id}-${i}` }))
                    if (imgs.length === 0) return null
                    return (
                      <div style={{ marginBottom:10 }}>
                        <ImageGrid images={imgs} />
                      </div>
                    )
                  })()}
                  {p.video_url && (
                    <div style={{ borderRadius:10, overflow:'hidden', marginBottom:10 }}>
                      <video src={p.video_url} controls playsInline style={{ width:'100%', maxHeight:320, display:'block', background:'#000' }}/>
                    </div>
                  )}
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap', alignItems:'center' }} onClick={e=>e.stopPropagation()}>
                    {grouped.map(([emoji, { count, mine }]) => (
                      <button key={emoji} onClick={()=>toggleReaction(p.id, emoji)}
                        style={{ padding:'3px 8px', borderRadius:20, border:'1px solid '+(mine?alpha(t.teal, 38):t.border), background:mine?t.tealDim:'transparent', cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif", color:mine?t.teal:t.textDim }}>
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
                      style={{ background:'none', border:'1px solid '+(showReplyBox?alpha(t.teal, 25):t.border), borderRadius:20, padding:'3px 9px', cursor:'pointer', fontSize:11, fontWeight:600, color:showReplyBox?t.teal:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
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
                        <div key={r.id} style={{ display:'flex', gap:8, padding:'9px 14px', borderBottom:(i<postReplies.length-1||showReplyBox)?'1px solid '+alpha(t.border, 27):'none', alignItems:'flex-start' }}>
                          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', flexShrink:0 }}>
                            <div style={{ width:2, height:5, background:alpha(t.border, 53) }}/>
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
                          <div style={{ width:2, height:5, background:alpha(t.border, 53) }}/>
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
