'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  green:'#22c55e', greenDim:'#22c55e15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type Post = {
  id: string
  title: string
  slug: string
  status: 'draft' | 'published'
  updated_at: string
  published_at: string | null
  tags: string[]
}

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function CoachBlogList() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data, error } = await supabase
      .from('blog_posts')
      .select('id,title,slug,status,updated_at,published_at,tags')
      .order('updated_at', { ascending: false })
    if (error) console.error('blog list load error:', error)
    setPosts((data as Post[]) || [])
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100dvh', background:t.bg, color:t.text, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ maxWidth:860, margin:'0 auto', padding:'20px 16px 80px' }}>
        <button onClick={()=>router.push('/dashboard/coach')}
          style={{ background:'none', border:'none', color:t.textDim, fontSize:13, cursor:'pointer', padding:0, marginBottom:14, fontFamily:"'DM Sans',sans-serif" }}>
          ← Back to dashboard
        </button>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:6 }}>
          <h1 style={{ fontSize:24, fontWeight:900, margin:0 }}>Blog</h1>
          <button onClick={()=>router.push('/dashboard/coach/blog/new')}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New post
          </button>
        </div>
        <p style={{ color:t.textDim, fontSize:13, margin:'0 0 22px' }}>
          Write and publish to srgfit.training. Published posts appear on the public blog within a minute.
        </p>

        {loading ? (
          <p style={{ color:t.textDim, fontSize:14 }}>Loading…</p>
        ) : posts.length === 0 ? (
          <div style={{ border:'1px solid '+t.border, borderRadius:14, background:t.surface, padding:'34px 20px', textAlign:'center' }}>
            <p style={{ fontSize:15, fontWeight:700, margin:'0 0 6px' }}>No posts yet</p>
            <p style={{ color:t.textDim, fontSize:13, margin:'0 0 16px' }}>Write your first coaching note.</p>
            <button onClick={()=>router.push('/dashboard/coach/blog/new')}
              style={{ background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              + New post
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {posts.map((p) => {
              const published = p.status === 'published'
              return (
                <button key={p.id} onClick={()=>router.push('/dashboard/coach/blog/'+p.id)}
                  style={{ textAlign:'left', display:'flex', alignItems:'center', gap:12, background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'14px 16px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.title || '(untitled)'}</div>
                    <div style={{ fontSize:12, color:t.textDim, marginTop:3 }}>
                      {published ? 'Published '+fmt(p.published_at) : 'Edited '+fmt(p.updated_at)} · /{p.slug}
                    </div>
                  </div>
                  <span style={{ flexShrink:0, fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99,
                    color: published ? t.green : t.orange,
                    background: published ? t.greenDim : t.orangeDim,
                    border:'1px solid '+(published ? t.green : t.orange)+'44' }}>
                    {published ? 'Published' : 'Draft'}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
