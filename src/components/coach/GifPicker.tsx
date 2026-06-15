'use client'
import { useState, useMemo, useCallback } from 'react'
import { GiphyFetch } from '@giphy/js-fetch-api'

// Shared GIF picker for coach review responses (workout reviews, check-in
// reviews, inline check-in responder). Mirrors the messenger's picker
// (src/components/messaging/RichMessageThread.tsx) exactly: same
// client-side GiphyFetch + NEXT_PUBLIC_GIPHY_API_KEY, same fixed_height
// media URL. Giphy SDK keys are public by design, so client-side is the
// correct pattern -- no server proxy needed.
//
// Coach surfaces are dark-only (CLAUDE.md), so the palette is baked in to
// match the reviews/checkins `t` blocks rather than threaded through props.

const c = {
  surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', text:'#eeeef8', textMuted:'#5a5a78',
}

type GifPickerProps = {
  value: string                    // selected gif url ('' when none)
  onPick: (url: string) => void
  onClear: () => void
}

export default function GifPicker({ value, onPick, onClear }: GifPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [gifs, setGifs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const gf = useMemo(() => new GiphyFetch(process.env.NEXT_PUBLIC_GIPHY_API_KEY || ''), [])

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const { data } = q.trim()
        ? await gf.search(q, { limit: 18, rating: 'g' })
        : await gf.trending({ limit: 18, rating: 'g' })
      setGifs(data)
    } catch {
      // Missing/invalid key or network blip — leave the grid empty rather
      // than throwing. The empty-state copy nudges toward the fix.
      setGifs([])
    }
    setLoading(false)
  }, [gf])

  // Selected state — show the chosen GIF with a remove button.
  if (value) {
    return (
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, background:c.surfaceUp, border:'1px solid '+c.border, borderRadius:10, padding:10 }}>
        <img src={value} alt="Selected GIF" style={{ width:120, borderRadius:8, display:'block', objectFit:'cover' as const }} />
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:800, color:c.teal, marginBottom:4 }}>GIF added</div>
          <div style={{ fontSize:11, color:c.textMuted }}>The client will see this in your response.</div>
        </div>
        <button onClick={onClear}
          style={{ background:'rgba(255,80,80,0.1)', border:'1px solid rgba(255,80,80,0.3)', borderRadius:6, padding:'4px 8px', fontSize:11, color:'#ff5050', cursor:'pointer', flexShrink:0, fontFamily:"'DM Sans',sans-serif" }}>
          Remove
        </button>
      </div>
    )
  }

  return (
    <div>
      <button type="button" onClick={()=>{ const next = !open; setOpen(next); if (next && gifs.length === 0) search('') }}
        style={{ display:'flex', alignItems:'center', gap:6, background:open?c.tealDim:c.surfaceUp, border:'1px solid '+(open?c.teal+'60':c.border), borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:700, color:open?c.teal:c.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
        <span style={{ fontSize:14 }}>🎬</span> {open ? 'Close GIF search' : 'Add a GIF'}
      </button>

      {open && (
        <div style={{ borderTop:'none', background:c.surfaceUp, border:'1px solid '+c.border, borderRadius:10, padding:10, marginTop:8 }}>
          <input
            autoFocus
            value={query}
            onChange={e=>{ setQuery(e.target.value); search(e.target.value) }}
            placeholder="Search GIPHY..."
            style={{ width:'100%', background:c.surfaceHigh, border:'1px solid '+c.border, borderRadius:10, padding:'8px 12px', fontSize:13, color:c.text, outline:'none', fontFamily:"'DM Sans',sans-serif", marginBottom:8, colorScheme:'dark', boxSizing:'border-box' as const }}
          />
          {loading ? (
            <div style={{ textAlign:'center', padding:'12px', fontSize:12, color:c.textMuted }}>Searching...</div>
          ) : gifs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'12px', fontSize:12, color:c.textMuted }}>No GIFs found.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:4, maxHeight:220, overflowY:'auto' }}>
              {gifs.map((gif:any) => (
                <img key={gif.id}
                  src={gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url}
                  alt={gif.title || 'GIF'}
                  onClick={()=>{ onPick(gif.images?.fixed_height?.url || gif.images?.original?.url || ''); setOpen(false); setQuery(''); setGifs([]) }}
                  style={{ width:'100%', borderRadius:6, cursor:'pointer', objectFit:'cover' as const, aspectRatio:'1', display:'block' }}
                />
              ))}
            </div>
          )}
          <div style={{ fontSize:9, color:c.textMuted, textAlign:'right' as const, marginTop:4 }}>Powered by GIPHY</div>
        </div>
      )}
    </div>
  )
}
