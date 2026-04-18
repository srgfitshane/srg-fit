import re

path = r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\coach\workouts\page.tsx'
content = open(path, 'r', encoding='utf-8').read()

OLD = '''                    <div style={{display:'grid',gap:8}}>
                  {buildExercises.map((ex,i) => {
                    if (ex.exercise_role !== role) return null
                    return (
                    <div key={i} style={{background:t.surface,border:`1px solid ${color}30`,borderRadius:14,padding:'14px 16px'}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                        <div style={{display:'flex',flexDirection:'column',gap:2}}>
                          <button onClick={()=>moveEx(i,-1)} disabled={i===0} style={{background:i===0?'transparent':t.tealDim,border:`1px solid ${i===0?t.border:t.teal+'40'}`,borderRadius:6,color:i===0?t.textMuted:t.teal,cursor:i===0?'default':'pointer',fontSize:14,lineHeight:1,padding:'4px 8px',fontFamily:"'DM Sans',sans-serif"}}>▲</button>
                          <button onClick={()=>moveEx(i,1)} disabled={i===buildExercises.length-1} style={{background:i===buildExercises.length-1?'transparent':t.tealDim,border:`1px solid ${i===buildExercises.length-1?t.border:t.teal+'40'}`,borderRadius:6,color:i===buildExercises.length-1?t.textMuted:t.teal,cursor:i===buildExercises.length-1?'default':'pointer',fontSize:14,lineHeight:1,padding:'4px 8px',fontFamily:"'DM Sans',sans-serif"}}>▼</button>
                        </div>
                        <span style={{fontWeight:700,fontSize:14,flex:1}}>{ex.exercise_name}</span>
                        <button onClick={()=>{ setSwapIdx(i); setSearchEx(''); setExGroup('all'); setExMovement('all'); setExEquipment('all'); setShowExPicker(true) }} style={{background:t.orangeDim,border:`1px solid ${t.orange}40`,borderRadius:6,padding:'3px 8px',fontSize:11,color:t.orange,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>swap</button>
                        <button onClick={()=>removeBuildEx(i)} style={{background:t.redDim,border:`1px solid ${t.red}40`,borderRadius:6,padding:'3px 8px',fontSize:11,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>✕</button>
                      </div>
                      {/* Reps / Time toggle */}
                      <div style={{display:'flex',gap:4,marginBottom:10}}>
                        {(['reps','time'] as const).map(type=>(
                          <button key={type} onClick={()=>updateBuildEx(i,'tracking_type',type)}
                            style={{padding:'3px 10px',borderRadius:20,border:`1px solid ${ex.tracking_type===type?t.teal:t.border}`,background:ex.tracking_type===type?t.tealDim:'transparent',color:ex.tracking_type===type?t.teal:t.textMuted,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
                            {type === 'reps' ? '🔢 Reps' : '⏱ Time'}
                          </button>
                        ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
                        {(ex.tracking_type === 'time' ? [
                          {label:'Sets', field:'sets_prescribed', type:'number', ph:'3'},
                          {label:'Duration (sec)', field:'duration_seconds', type:'number', ph:'30'},
                          {label:'Load', field:'weight_prescribed', type:'text', ph:'BW'},
                          {label:'Rest (sec)', field:'rest_seconds', type:'number', ph:'60'},
                        ] : [
                          {label:'Sets', field:'sets_prescribed', type:'number', ph:'3'},
                          {label:'Reps', field:'reps_prescribed', type:'text', ph:'8-12'},
                          {label:'Load', field:'weight_prescribed', type:'text', ph:'RPE 8'},
                          {label:'Rest (sec)', field:'rest_seconds', type:'number', ph:'90'},
                        ]).map(f=>(
                          <div key={f.field}>
                            <label style={{fontSize:10,color:t.textDim,display:'block',marginBottom:3}}>{f.label}</label>
                            <input type={f.type} value={(ex as any)[f.field]} placeholder={f.ph}
                              onChange={e=>updateBuildEx(i,f.field as keyof TemplateEx, f.type==='number'?parseInt(e.target.value)||0:e.target.value)}
                              style={{...inp,padding:'6px 8px',fontSize:13}}/>
                          </div>
                        ))}
                      </div>
                      <div style={{marginTop:8}}>
                        <input value={ex.notes} onChange={e=>updateBuildEx(i,'notes',e.target.value)}
                          placeholder="Coach note for client..." style={{...inp,padding:'6px 10px',fontSize:12}}/>
                      </div>
                      {/* Group / TUT / Progression */}
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:8}}>
                        <div>
                          <label style={{fontSize:10,color:t.textDim,display:'block',marginBottom:3}}>Group (A1, B2\u2026)</label>
                          <input value={ex.superset_group} onChange={e=>updateBuildEx(i,'superset_group',e.target.value)}
                            placeholder="e.g. A1" style={{...inp,padding:'6px 8px',fontSize:12}}/>
                        </div>
                        <div>
                          <label style={{fontSize:10,color:t.textDim,display:'block',marginBottom:3}}>TUT</label>
                          <input value={ex.tut} onChange={e=>updateBuildEx(i,'tut',e.target.value)}
                            placeholder="e.g. 3-1-3" style={{...inp,padding:'6px 8px',fontSize:12}}/>
                        </div>
                        <div>
                          <label style={{fontSize:10,color:t.textDim,display:'block',marginBottom:3}}>Progression</label>
                          <input value={ex.progression_note} onChange={e=>updateBuildEx(i,'progression_note',e.target.value)}
                            placeholder="e.g. +2.5kg/wk" style={{...inp,padding:'6px 8px',fontSize:12}}/>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>'''

NEW = '''                    <div style={{display:'grid',gap:8}}>
                  {buildExercises.map((ex,i) => {
                    if (ex.exercise_role !== role) return null
                    const isEditing = editingBuildEx === i
                    return (
                    <div key={i} style={{marginBottom:4}}>
                      <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                        <div style={{paddingTop:2,flexShrink:0}}>
                          <span style={{display:'inline-block',background:color+'18',border:'1px solid '+color+'40',color,fontSize:10,fontWeight:800,padding:'2px 8px',borderRadius:5,textTransform:'uppercase',letterSpacing:'0.04em'}}>
                            {label.replace(/[^a-zA-Z- ]/g,'')}
                          </span>
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{ex.exercise_name}</div>
                          <div style={{fontSize:11,color:t.textMuted,lineHeight:1.6}}>
                            {ex.sets_prescribed}\\u00d7{ex.tracking_type==='time'?(ex.duration_seconds||'\\u2014')+'s':ex.reps_prescribed}
                            {ex.weight_prescribed?<span style={{color:t.text}}> @ {ex.weight_prescribed}</span>:''}
                            {ex.tut?<span> \\u00b7 TUT {ex.tut}</span>:''}
                            {ex.rest_seconds?<span> \\u00b7 {ex.rest_seconds}s rest</span>:''}
                            {ex.progression_note?<span style={{color:t.green}}> \\u00b7 {ex.progression_note}</span>:''}
                          </div>
                          {ex.notes&&<div style={{fontSize:10,color:t.textMuted,fontStyle:'italic',marginTop:2}}>\\ud83d\\udcdd {ex.notes}</div>}
                          {ex.superset_group&&<div style={{fontSize:10,color:t.teal,marginTop:2}}>Group {ex.superset_group}</div>}
                        </div>
                        <div style={{display:'flex',gap:4,flexShrink:0}}>
                          <div style={{display:'flex',flexDirection:'column',gap:2}}>
                            <button onClick={()=>moveEx(i,-1)} disabled={i===0} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:5,padding:'2px 6px',fontSize:12,color:i===0?t.textMuted:t.teal,cursor:i===0?'default':'pointer',lineHeight:1}}>\\u25b2</button>
                            <button onClick={()=>moveEx(i,1)} disabled={i===buildExercises.length-1} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:5,padding:'2px 6px',fontSize:12,color:i===buildExercises.length-1?t.textMuted:t.teal,cursor:i===buildExercises.length-1?'default':'pointer',lineHeight:1}}>\\u25bc</button>
                          </div>
                          <button onClick={()=>setEditingBuildEx(isEditing?null:i)}
                            style={{background:t.surfaceHigh,border:'none',borderRadius:6,padding:'4px 8px',fontSize:10,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            {isEditing?'done':'edit'}
                          </button>
                          <button onClick={()=>{ setSwapIdx(i); setSearchEx(''); setExGroup('all'); setExMovement('all'); setExEquipment('all'); setShowExPicker(true) }} style={{background:t.orangeDim,border:'1px solid '+t.orange+'40',borderRadius:6,padding:'4px 8px',fontSize:10,color:t.orange,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>swap</button>
                          <button onClick={()=>removeBuildEx(i)} style={{background:'none',border:'none',color:t.red+'60',cursor:'pointer',fontSize:12}}>\\u2715</button>
                        </div>
                      </div>
                      {isEditing && (
                        <div style={{background:t.surfaceHigh,borderRadius:12,padding:'12px',marginTop:8}}>
                          <div style={{display:'flex',gap:4,marginBottom:8}}>
                            {(['reps','time'] as const).map(type=>(
                              <button key={type} onClick={()=>updateBuildEx(i,'tracking_type',type)}
                                style={{padding:'3px 10px',borderRadius:20,border:'1px solid '+(ex.tracking_type===type?t.teal:t.border),background:ex.tracking_type===type?t.tealDim:'transparent',color:ex.tracking_type===type?t.teal:t.textMuted,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
                                {type==='reps'?'\\ud83d\\udd22 Reps':'\\u23f1 Time'}
                              </button>
                            ))}
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                            {([
                              ['Sets','sets_prescribed','number'],
                              ex.tracking_type==='time'?['Duration (sec)','duration_seconds','number']:['Reps','reps_prescribed','text'],
                              ['Weight','weight_prescribed','text']
                            ] as [string,string,string][]).map(([lbl,fld,typ])=>(
                              <div key={fld}>
                                <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>{lbl}</div>
                                <input type={typ} value={(ex as any)[fld]||''} placeholder={lbl==='Sets'?'3':lbl==='Reps'?'8-12':''}
                                  onChange={e=>updateBuildEx(i,fld as keyof TemplateEx,typ==='number'?parseInt(e.target.value)||0:e.target.value)}
                                  style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
                              </div>
                            ))}
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                            {([['TUT','tut','text'],['Rest (s)','rest_seconds','number'],['Progression','progression_note','text']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                              <div key={fld}>
                                <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>{lbl}</div>
                                <input type={typ} value={(ex as any)[fld]||''} placeholder={lbl==='Rest (s)'?'90':''}
                                  onChange={e=>updateBuildEx(i,fld as keyof TemplateEx,typ==='number'?parseInt(e.target.value)||0:e.target.value)}
                                  style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
                              </div>
                            ))}
                          </div>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                            <div>
                              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Role</div>
                              <select value={ex.exercise_role||'main'} onChange={e=>updateBuildEx(i,'exercise_role',e.target.value)}
                                style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
                                <option value="warmup">Warm-up</option><option value="main">Main</option><option value="cooldown">Cool-down</option><option value="finisher">Finisher</option>
                              </select>
                            </div>
                            <div>
                              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Group (A1, B2...)</div>
                              <input type="text" value={ex.superset_group||''} onChange={e=>updateBuildEx(i,'superset_group',e.target.value)}
                                placeholder="e.g. A1"
                                style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
                            </div>
                          </div>
                          <div>
                            <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Coach Notes</div>
                            <input value={ex.notes||''} onChange={e=>updateBuildEx(i,'notes',e.target.value)}
                              placeholder="Cues, technique reminders..."
                              style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  })}
                </div>'''

if OLD in content:
    content = content.replace(OLD, NEW)
    open(path, 'w', encoding='utf-8').write(content)
    print('REPLACED successfully')
else:
    print('OLD block NOT FOUND')
    # Debug
    idx = content.find('buildExercises.map((ex,i)')
    if idx >= 0:
        print(f'Found map at char {idx}')
        print(content[idx:idx+200])
