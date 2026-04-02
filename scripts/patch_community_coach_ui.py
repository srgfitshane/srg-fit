path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\components\community\CommunityFeed.tsx'
src = open(path, encoding='utf-8').read()

# Add coach ··· menu after the timestamp div in the post header
# The header has: Avatar | name + COACH badge | timestamp | [we add ··· here]
old_header_end = """                      <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.created_at)}</div>
                    </div>
                  </div>"""

new_header_end = """                      <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.created_at)}</div>
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
                  </div>"""

src = src.replace(old_header_end, new_header_end, 1)

# Add delete button on replies (coach only)
old_reply_end = """                            <div style={{ fontSize:12, color:t.textDim, lineHeight:1.55 }}>{r.body}</div>
                           </div>
                         </div>"""

new_reply_end = """                            <div style={{ fontSize:12, color:t.textDim, lineHeight:1.55 }}>{r.body}</div>
                            {role === 'coach' && (
                              <button onClick={()=>deleteReply(r.id)}
                                style={{ background:'none', border:'none', color:t.textMuted, fontSize:10, cursor:'pointer', marginTop:2, padding:0 }}>
                                🗑️ Delete
                              </button>
                            )}
                           </div>
                         </div>"""

src = src.replace(old_reply_end, new_reply_end, 1)

# Close the coachMenu when clicking elsewhere — add onClick to the outer container
src = src.replace(
    "        onClick={() => setReactOpen(null)}>",
    "        onClick={() => { setReactOpen(null); setCoachMenu(null) }}>",
    1
)

open(path, 'w', encoding='utf-8').write(src)
print('done ui')
