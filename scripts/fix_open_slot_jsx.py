
import re

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\programs\[id]\page.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '                              {groupExes.map((ex:any) => {'
end_marker = '                              })}\n                            </div>\n                          </div>\n                        )\n                      })}'

start = content.find(start_marker)
end = content.find(end_marker, start) + len(end_marker)

old_section = content[start:end]

new_section = '''                              {groupExes.map((ex:any) => {
                                const roleMeta = ROLE_COLORS[ex.exercise_role] || t.teal
                                return (
                                  <div key={ex.id} style={{ marginBottom: 10 }}>
                                    {ex.is_open_slot ? (
                                      // Open slot card
                                      <div style={{ background:t.yellow+'10', border:`1px dashed ${t.yellow}50`, borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:18, flexShrink:0 }}>🎲</span>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:12, fontWeight:800, color:t.yellow }}>Open Slot</div>
                                          <div style={{ fontSize:11, color:t.textMuted }}>{ex.slot_constraint || "Client's choice"} · {ex.sets}×{ex.reps}</div>
                                        </div>
                                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                            <button onClick={()=>moveExercise(block.id, ex.id, -1)}
                                              style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▲</button>
                                            <button onClick={()=>moveExercise(block.id, ex.id, 1)}
                                              style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▼</button>
                                          </div>
                                          <button onClick={()=>deleteExercise(block.id, ex.id)}
                                            style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:12 }}>✕</button>
                                        </div>
                                      </div>
                                    ) : (
                                      // Normal exercise card
                                      <div>
                                        <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                                          <div style={{ paddingTop:2, flexShrink:0 }}>
                                            <span className="role-pill" style={{ background:roleMeta+'18', border:'1px solid '+roleMeta+'40', color:roleMeta }}>
                                              {ROLE_LABELS[ex.exercise_role] || ex.exercise_role}
                                            </span>
                                          </div>
                                          <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{ex.exercise?.name || 'Exercise'}</div>
                                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                              <button onClick={()=>setGroupingEx(groupingEx===ex.id?null:ex.id)}
                                                style={{ background: ex.superset_group ? groupColorMap[ex.superset_group]+'22' : t.surfaceHigh, border:'1px solid '+(ex.superset_group ? groupColorMap[ex.superset_group]+'60' : t.border), borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:800, color: ex.superset_group ? (groupColorMap[ex.superset_group]||t.teal) : t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.04em' }}>
                                                {ex.superset_group ? `Group ${ex.superset_group}` : '+ Group'}
                                              </button>
                                              {groupingEx === ex.id && (
                                                <input autoFocus
                                                  defaultValue={ex.superset_group || ''}
                                                  placeholder="A, B, C..."
                                                  onBlur={e => { updateExercise(ex.id, 'superset_group', e.target.value.trim()); setGroupingEx(null) }}
                                                  onKeyDown={e => { if (e.key==='Enter'||e.key==='Escape') { updateExercise(ex.id,'superset_group',(e.target as HTMLInputElement).value.trim()); setGroupingEx(null) }}}
                                                  style={{ width:60, background:t.surface, border:'1px solid '+t.teal+'60', borderRadius:5, padding:'2px 7px', fontSize:11, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                                                />
                                              )}
                                            </div>
                                            <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.6 }}>
                                              {ex.sets}×{ex.reps}
                                              {ex.target_weight ? <span style={{ color:t.text }}> @ {ex.target_weight}</span> : ''}
                                              {ex.rpe ? <span> · <span style={{ color:t.orange }}>RPE {ex.rpe}</span></span> : ''}
                                              {ex.tut ? <span> · TUT {ex.tut}</span> : ''}
                                              {ex.rest_seconds ? <span> · {ex.rest_seconds}s rest</span> : ''}
                                              {ex.progression_note ? <span style={{ color:t.green }}> · {ex.progression_note}</span> : ''}
                                            </div>
                                            {ex.notes && <div style={{ fontSize:10, color:t.textMuted, fontStyle:'italic', marginTop:2 }}>📝 {ex.notes}</div>}
                                          </div>
                                          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                              <button onClick={()=>moveExercise(block.id, ex.id, -1)}
                                                style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▲</button>
                                              <button onClick={()=>moveExercise(block.id, ex.id, 1)}
                                                style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▼</button>
                                            </div>
                                            <button onClick={()=>setEditingEx(editingEx===ex.id?null:ex.id)}
                                              style={{ background:t.surfaceHigh, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                              {editingEx===ex.id?'done':'edit'}
                                            </button>
                                            <button onClick={()=>{ setSwapExId(ex.id); setShowAddEx(block.id); setExSearch(''); setAddExTab('exercise') }}
                                              style={{ background:t.orangeDim, border:`1px solid ${t.orange}40`, borderRadius:6, padding:'4px 8px', fontSize:10, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                              swap
                                            </button>
                                            <button onClick={()=>deleteExercise(block.id, ex.id)}
                                              style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:12 }}>✕</button>
                                          </div>
                                        </div>
                                        {editingEx===ex.id && (
                                          <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'12px', marginTop:8 }}>
                                            <div style={{ display:'flex', gap:4, marginBottom:8 }}>
                                              {(['reps','time'] as const).map(type => (
                                                <button key={type} onClick={()=>updateExercise(ex.id,'tracking_type',type)}
                                                  style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${(ex.tracking_type||'reps')===type?t.teal:t.border}`, background:(ex.tracking_type||'reps')===type?t.tealDim:'transparent', color:(ex.tracking_type||'reps')===type?t.teal:t.textMuted, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                                                  {type==='reps'?'🔢 Reps':'⏱ Time'}
                                                </button>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                              {([
                                                ['Sets','sets','number'],
                                                (ex.tracking_type||'reps')==='time' ? ['Duration (sec)','duration_seconds','number'] : ['Reps','reps','text'],
                                                ['Weight','target_weight','text']
                                              ] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                                <div key={fld}>
                                                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                                  <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                    style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                                </div>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                              {([['RPE','rpe','text'],['TUT','tut','text'],['Rest (s)','rest_seconds','number']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                                <div key={fld}>
                                                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                                  <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                    style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                                </div>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                                              <div>
                                                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Role</div>
                                                <select defaultValue={ex.exercise_role||'main'} onChange={e=>updateExercise(ex.id,'exercise_role',e.target.value)}
                                                  style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                                                  {ROLE_OPTIONS.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                                </select>
                                              </div>
                                              <div>
                                                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Group (A1, B2...)</div>
                                                <input type="text" defaultValue={ex.superset_group||''} onBlur={e=>updateExercise(ex.id,'superset_group',e.target.value)}
                                                  placeholder="e.g. A1, B2"
                                                  style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                              </div>
                                            </div>
                                            <div style={{ marginBottom:8 }}>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Progression Note</div>
                                              <input type="text" defaultValue={ex.progression_note||''} onBlur={e=>updateExercise(ex.id,'progression_note',e.target.value)}
                                                placeholder="e.g. +2.5kg/week, add 1 rep/session"
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                            </div>
                                            <div>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Coach Notes</div>
                                              <textarea defaultValue={ex.notes||''} onBlur={e=>updateExercise(ex.id,'notes',e.target.value)} rows={2}
                                                placeholder="Cues, technique reminders..."
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
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
                        )
                      })}'''

new_content = content[:start] + new_section + content[end:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)
print("Done. Replaced", len(old_section), "chars with", len(new_section), "chars")
