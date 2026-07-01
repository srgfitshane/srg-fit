'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  green:'#22c55e', red:'#ef4444',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const PUBLIC_BLOG_BASE = 'https://srgfit.training/blog/'

const inp = (o?: object): React.CSSProperties => ({
  width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
  borderRadius:8, padding:'10px 12px', fontSize:14, color:t.text,
  outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box',
  colorScheme:'dark' as React.CSSProperties['colorScheme'], ...o,
})

const labelStyle: React.CSSProperties = { display:'block', fontSize:12, fontWeight:700, color:t.textDim, margin:'0 0 6px', textTransform:'uppercase', letterSpacing:0.4 }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
}

type Form = {
  title: string
  slug: string
  excerpt: string
  body: string
  cover_image_url: string
  tags: string
  seo_title: string
  seo_description: string
  status: 'draft' | 'published'
  published_at: string | null
}

const blank: Form = {
  title:'', slug:'', excerpt:'', body:'', cover_image_url:'', tags:'',
  seo_title:'', seo_description:'', status:'draft', published_at:null,
}

export default function CoachBlogEditor() {
  const params = useParams()
  const id = String((params?.id as string) || 'new')
  const isNew = id === 'new'

  const [form, setForm] = useState<Form>(blank)
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      if (isNew) {
        try {
          const draft = window.localStorage.getItem(`blog-draft:new`)
          if (draft) { setForm(JSON.parse(draft)); setNotice('Restored an unsaved draft.') }
        } catch {}
        return
      }
      const { data, error } = await supabase.from('blog_posts').select('*').eq('id', id).single()
      if (error || !data) { setErr('Could not load this post.'); setLoading(false); return }
      setForm({
        title:data.title || '', slug:data.slug || '', excerpt:data.excerpt || '',
        body:data.body || '', cover_image_url:data.cover_image_url || '',
        tags:(data.tags || []).join(', '), seo_title:data.seo_title || '',
        seo_description:data.seo_description || '', status:data.status, published_at:data.published_at,
      })
      setSlugTouched(true)
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave a local draft so a long post survives a refresh/crash before the
  // first save. Keyed by post id ('new' for an unsaved post). Cleared on a
  // successful save. Coach-only surface, but the body textarea is long enough
  // that losing it would sting (Rule 14).
  useEffect(() => {
    if (loading || saving) return
    const h = setTimeout(() => {
      try { window.localStorage.setItem(`blog-draft:${id}`, JSON.stringify(form)) } catch {}
    }, 800)
    return () => clearTimeout(h)
  }, [form, id, loading, saving])

  const onTitle = (v: string) =>
    setForm((f) => ({ ...f, title:v, slug: slugTouched ? f.slug : slugify(v) }))

  const uploadCover = async (file: File) => {
    setUploading(true); setErr('')
    const ext = file.name.split('.').pop()
    const path = `${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('blog').upload(path, file, { upsert:true, contentType:file.type })
    if (error) { setUploading(false); setErr('Cover upload failed: ' + error.message); return }
    const { data: { publicUrl } } = supabase.storage.from('blog').getPublicUrl(path)
    setForm((f) => ({ ...f, cover_image_url:publicUrl }))
    setUploading(false)
  }

  const save = async (publish?: boolean) => {
    setErr(''); setNotice('')
    if (!form.title.trim()) { setErr('Add a title first.'); return }
    const slug = (form.slug.trim() || slugify(form.title))
    if (!slug) { setErr('Add a slug.'); return }

    setSaving(true)
    const tags = form.tags.split(',').map((s) => s.trim()).filter(Boolean)
    const nextStatus: 'draft' | 'published' =
      publish === true ? 'published' : publish === false ? 'draft' : form.status

    const payload: Record<string, unknown> = {
      title:form.title.trim(), slug, excerpt:form.excerpt.trim() || null, body:form.body,
      cover_image_url:form.cover_image_url || null, tags,
      seo_title:form.seo_title.trim() || null, seo_description:form.seo_description.trim() || null,
      status:nextStatus,
    }
    if (nextStatus === 'published' && !form.published_at) {
      payload.published_at = new Date().toISOString()
    }

    if (isNew) {
      const { data, error } = await supabase.from('blog_posts').insert(payload).select('id').single()
      setSaving(false)
      if (error || !data) {
        setErr(error?.code === '23505' ? 'That slug is already used by another post.' : ('Could not save: ' + (error?.message || 'unknown error')))
        return
      }
      try { window.localStorage.removeItem(`blog-draft:new`) } catch {}
      router.replace('/dashboard/coach/blog/' + data.id)
      return
    }

    const { error } = await supabase.from('blog_posts').update(payload).eq('id', id)
    setSaving(false)
    if (error) {
      setErr(error.code === '23505' ? 'That slug is already used by another post.' : ('Could not save: ' + error.message))
      return
    }
    try { window.localStorage.removeItem(`blog-draft:${id}`) } catch {}
    setForm((f) => ({ ...f, status:nextStatus, published_at:(payload.published_at as string) ?? f.published_at }))
    setNotice(nextStatus === 'published' ? 'Saved & published.' : 'Saved.')
  }

  const del = async () => {
    if (isNew) { router.push('/dashboard/coach/blog'); return }
    setSaving(true)
    const { error } = await supabase.from('blog_posts').delete().eq('id', id)
    setSaving(false)
    if (error) { setErr('Could not delete: ' + error.message); return }
    try { window.localStorage.removeItem(`blog-draft:${id}`) } catch {}
    router.push('/dashboard/coach/blog')
  }

  if (loading) {
    return (
      <div style={{ minHeight:'100dvh', background:t.bg, color:t.textDim, fontFamily:"'DM Sans',sans-serif", padding:24 }}>
        Loading…
      </div>
    )
  }

  const published = form.status === 'published'

  return (
    <div style={{ minHeight:'100dvh', background:t.bg, color:t.text, fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ maxWidth:760, margin:'0 auto', padding:'20px 16px 100px' }}>
        <button onClick={()=>router.push('/dashboard/coach/blog')}
          style={{ background:'none', border:'none', color:t.textDim, fontSize:13, cursor:'pointer', padding:0, marginBottom:14, fontFamily:"'DM Sans',sans-serif" }}>
          ← All posts
        </button>

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, marginBottom:18 }}>
          <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>{isNew ? 'New post' : 'Edit post'}</h1>
          <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:99,
            color: published ? t.green : t.orange, background: published ? t.tealDim : t.orangeDim,
            border:'1px solid '+(published ? t.green : t.orange)+'44' }}>
            {published ? 'Published' : 'Draft'}
          </span>
        </div>

        {err && (
          <div style={{ background:t.red+'18', border:'1px solid '+t.red+'55', color:'#fca5a5', borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:16 }}>{err}</div>
        )}
        {notice && (
          <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'55', color:t.teal, borderRadius:10, padding:'10px 14px', fontSize:13, marginBottom:16 }}>{notice}</div>
        )}

        <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
          <div>
            <label style={labelStyle}>Title</label>
            <input style={inp({ fontSize:16, fontWeight:700 })} value={form.title}
              onChange={(e)=>onTitle(e.target.value)} placeholder="A clear, compelling headline" />
          </div>

          <div>
            <label style={labelStyle}>Slug (URL)</label>
            <input style={inp()} value={form.slug}
              onChange={(e)=>{ setSlugTouched(true); setForm((f)=>({ ...f, slug:slugify(e.target.value) })) }}
              placeholder="my-post-url" />
            <p style={{ color:t.textDim, fontSize:12, margin:'5px 0 0' }}>{PUBLIC_BLOG_BASE}{form.slug || 'my-post-url'}</p>
          </div>

          <div>
            <label style={labelStyle}>Excerpt</label>
            <textarea style={inp({ minHeight:64, resize:'vertical' })} value={form.excerpt}
              onChange={(e)=>setForm((f)=>({ ...f, excerpt:e.target.value }))}
              placeholder="One or two sentences shown on the blog card and at the top of the post." />
          </div>

          <div>
            <label style={labelStyle}>Cover image</label>
            {form.cover_image_url ? (
              <div style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={form.cover_image_url} alt="cover" style={{ width:160, height:100, objectFit:'cover', borderRadius:10, border:'1px solid '+t.border }} />
                <button onClick={()=>setForm((f)=>({ ...f, cover_image_url:'' }))}
                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, color:t.text, borderRadius:8, padding:'8px 12px', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Remove
                </button>
              </div>
            ) : (
              <label style={{ display:'inline-flex', alignItems:'center', gap:8, background:t.surfaceHigh, border:'1px dashed '+t.border, color:t.textDim, borderRadius:8, padding:'10px 14px', fontSize:13, cursor:'pointer' }}>
                {uploading ? 'Uploading…' : 'Upload cover image'}
                <input type="file" accept="image/*" style={{ display:'none' }}
                  onChange={(e)=>{ const f=e.target.files?.[0]; if(f) uploadCover(f) }} />
              </label>
            )}
          </div>

          <div>
            <label style={labelStyle}>Body (Markdown)</label>
            <textarea style={inp({ minHeight:320, resize:'vertical', lineHeight:1.6, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:13 })}
              value={form.body} onChange={(e)=>setForm((f)=>({ ...f, body:e.target.value }))}
              placeholder={'Write in Markdown.\n\n## A heading\n\nA paragraph with **bold** and a [link](https://srgfit.app).\n\n- A list item\n- Another item\n\n> A quote.'} />
            <p style={{ color:t.textDim, fontSize:12, margin:'5px 0 0' }}>Markdown supported: ## headings, **bold**, - lists, &gt; quotes, [links](url).</p>
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input style={inp()} value={form.tags}
              onChange={(e)=>setForm((f)=>({ ...f, tags:e.target.value }))}
              placeholder="Mindset, Beginners, Nutrition" />
          </div>

          <details style={{ border:'1px solid '+t.border, borderRadius:10, padding:'12px 14px', background:t.surface }}>
            <summary style={{ cursor:'pointer', fontSize:13, fontWeight:700, color:t.textDim }}>SEO (optional)</summary>
            <div style={{ display:'flex', flexDirection:'column', gap:14, marginTop:14 }}>
              <div>
                <label style={labelStyle}>SEO title</label>
                <input style={inp()} value={form.seo_title}
                  onChange={(e)=>setForm((f)=>({ ...f, seo_title:e.target.value }))}
                  placeholder="Defaults to the post title" />
              </div>
              <div>
                <label style={labelStyle}>SEO description</label>
                <textarea style={inp({ minHeight:60, resize:'vertical' })} value={form.seo_description}
                  onChange={(e)=>setForm((f)=>({ ...f, seo_description:e.target.value }))}
                  placeholder="Defaults to the excerpt" />
              </div>
            </div>
          </details>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginTop:26, alignItems:'center' }}>
          <button onClick={()=>save()} disabled={saving || uploading}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, color:t.text, borderRadius:10, padding:'11px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:(saving||uploading)?0.6:1 }}>
            {saving ? 'Saving…' : 'Save draft'}
          </button>

          {published ? (
            <button onClick={()=>save(false)} disabled={saving || uploading}
              style={{ background:t.orangeDim, border:'1px solid '+t.orange+'66', color:t.orange, borderRadius:10, padding:'11px 20px', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:(saving||uploading)?0.6:1 }}>
              Unpublish
            </button>
          ) : (
            <button onClick={()=>save(true)} disabled={saving || uploading}
              style={{ background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', border:'none', color:'#000', borderRadius:10, padding:'11px 22px', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:(saving||uploading)?0.6:1 }}>
              {isNew ? 'Publish' : 'Save & publish'}
            </button>
          )}

          {published && !isNew && (
            <a href={PUBLIC_BLOG_BASE + form.slug} target="_blank" rel="noopener noreferrer"
              style={{ color:t.teal, fontSize:13, textDecoration:'none', marginLeft:4 }}>
              View live ↗
            </a>
          )}

          <div style={{ flex:1 }} />

          {!isNew && (
            confirmDelete ? (
              <span style={{ display:'inline-flex', gap:8, alignItems:'center' }}>
                <span style={{ fontSize:13, color:t.textDim }}>Delete?</span>
                <button onClick={del} disabled={saving}
                  style={{ background:t.red, border:'none', color:'#fff', borderRadius:8, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Yes, delete
                </button>
                <button onClick={()=>setConfirmDelete(false)}
                  style={{ background:'none', border:'none', color:t.textDim, fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
              </span>
            ) : (
              <button onClick={()=>setConfirmDelete(true)}
                style={{ background:'none', border:'1px solid '+t.border, color:t.textDim, borderRadius:8, padding:'9px 14px', fontSize:13, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Delete
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
