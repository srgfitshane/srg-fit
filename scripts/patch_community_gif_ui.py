path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\community\CommunityFeed.tsx'
src = open(path, encoding='utf-8').read()

# 1. Add GIF button next to image/video buttons
old_btns = """                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','image/*'); fileInputRef.current?.click() }} title="Add photo" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🖼️</button>
                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','video/*'); fileInputRef.current?.click() }} title="Add video" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🎥</button>"""

new_btns = """                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','image/*'); fileInputRef.current?.click() }} title="Add photo" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🖼️</button>
                    <button onClick={()=>{ fileInputRef.current?.setAttribute('accept','video/*'); fileInputRef.current?.click() }} title="Add video" style={{ background:'none', border:'1px solid '+t.border, borderRadius:8, padding:'5px 10px', fontSize:16, cursor:'pointer', color:t.textMuted, lineHeight:1 }}>🎥</button>
                    <button onClick={()=>{ setShowGifPicker(p=>!p); if(!gifs.length) searchGifs('') }} title="Add GIF" style={{ background:showGifPicker?t.tealDim:'none', border:'1px solid '+(showGifPicker?t.teal:t.border), borderRadius:8, padding:'5px 10px', fontSize:12, fontWeight:800, cursor:'pointer', color:showGifPicker?t.teal:t.textMuted, lineHeight:1 }}>GIF</button>"""

src = src.replace(old_btns, new_btns, 1)

# 2. Add GIF preview below mediaPreview block (after the mediaPreview closing div)
old_preview_end = """                {mediaPreview && (
                  <div style={{ position:'relative', marginTop:8, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border }}>
                    {mediaType === 'image'
                      ? <Image src={mediaPreview} alt="Attachment preview" width={600} height={240} unoptimized style={{ width:'100%', maxHeight:240, height:'auto', objectFit:'cover', display:'block' }}/>
                      : <video src={mediaPreview} controls style={{ width:'100%', maxHeight:240, display:'block' }}/>
                    }
                    <button onClick={clearMedia} style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.7)', border:'none', borderRadius:'50%', width:24, height:24, cursor:'pointer', color:'#fff', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', lineHeight:1 }}>×</button>
                  </div>
                )}"""

new_preview_end = """                {mediaPreview && (
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
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:3, padding:'4px 8px 8px', maxHeight:220, overflowY:'auto' }}>
                      {gifLoading && <div style={{ gridColumn:'1/-1', textAlign:'center', padding:16, color:t.textMuted, fontSize:12 }}>Loading...</div>}
                      {!gifLoading && gifs.map((gif:any) => (
                        <button key={gif.id} onClick={()=>pickGif(gif)} style={{ background:'none', border:'none', padding:0, cursor:'pointer', borderRadius:6, overflow:'hidden', aspectRatio:'1' }}>
                          <img src={gif.images?.fixed_height_small?.url || gif.images?.fixed_height?.url} alt={gif.title} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}/>
                        </button>
                      ))}
                    </div>
                  </div>
                )}"""

src = src.replace(old_preview_end, new_preview_end, 1)

# 3. Update post button disabled check to include gifUrl
src = src.replace(
    "disabled={posting||uploading||(!draft.trim()&&!mediaFile)}",
    "disabled={posting||uploading||(!draft.trim()&&!mediaFile&&!gifUrl)}",
    1
)
src = src.replace(
    "style={{ background:(draft.trim()||mediaFile)?",
    "style={{ background:(draft.trim()||mediaFile||gifUrl)?",
    1
)
src = src.replace(
    "border:'1px solid '+((draft.trim()||mediaFile)?'transparent':t.border)",
    "border:'1px solid '+((draft.trim()||mediaFile||gifUrl)?'transparent':t.border)",
    1
)
src = src.replace(
    "color:(draft.trim()||mediaFile)?'#000':t.textMuted",
    "color:(draft.trim()||mediaFile||gifUrl)?'#000':t.textMuted",
    1
)
src = src.replace(
    "cursor:(posting||uploading||(!draft.trim()&&!mediaFile))?'not-allowed':'pointer'",
    "cursor:(posting||uploading||(!draft.trim()&&!mediaFile&&!gifUrl))?'not-allowed':'pointer'",
    1
)

open(path, 'w', encoding='utf-8').write(src)
print('done, lines:', src.count('\n'))
