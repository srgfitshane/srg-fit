
p = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\page.tsx'
src = open(p, encoding='utf-8').read()

# Find the goals closing section - need to add suggest goal button
# The goals map ends with: })} then </div> then </div> then )}
# We need the one inside the goals section specifically
# Search for the unique string around it
old = '''                })}
              </div>
            </div>
          )}

          {/* \u2500\u2500 6. TASKS'''

new = '''                })}
              </div>
              {/* Suggest a goal */}
              {suggestGoalOpen ? (
                <div style={{ marginTop:10, display:'flex', gap:8 }}>
                  <input
                    value={suggestGoalText}
                    onChange={e=>setSuggestGoalText(e.target.value)}
                    placeholder="e.g. Hit 225lb squat, Run a 5K..."
                    style={{ flex:1, background:t.surfaceUp, border:'1px solid '+t.teal+'50', borderRadius:10, padding:'9px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
                  />
                  <button onClick={suggestGoal} disabled={!suggestGoalText.trim()||suggestGoalSaving}
                    style={{ background:t.teal, border:'none', borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {suggestGoalSaving ? '...' : 'Send'}
                  </button>
                  <button onClick={()=>setSuggestGoalOpen(false)}
                    style={{ background:'transparent', border:'1px solid '+t.border, borderRadius:10, padding:'9px 12px', fontSize:12, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    \u2715
                  </button>
                </div>
              ) : (
                <button onClick={()=>setSuggestGoalOpen(true)}
                  style={{ marginTop:10, width:'100%', background:'transparent', border:'1px dashed '+t.border, borderRadius:10, padding:'9px', fontSize:12, fontWeight:600, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Suggest a goal to your coach
                </button>
              )}
            </div>
          )}

          {/* \u2500\u2500 6. TASKS'''

print('found:', src.count(old))
src = src.replace(old, new)
open(p, 'w', encoding='utf-8').write(src)
print('done, suggestGoalOpen in src:', src.count('suggestGoalOpen'))
