import pathlib, sys

path = pathlib.Path(r'C:\Users\Shane\OneDrive\Desktop\srg-fit\src\app\dashboard\client\workout\[sessionId]\page.tsx')
src = path.read_text(encoding='utf-8')

# ── 1. Add state for add-exercise panel ───────────────────────────────────
old_state = "  const [swapLibrary, setSwapLibrary] = useState<ExerciseLibraryItem[]>([])"
new_state = """  const [swapLibrary, setSwapLibrary] = useState<ExerciseLibraryItem[]>([])
  const [addExOpen,      setAddExOpen]      = useState(false)
  const [addExSearch,    setAddExSearch]    = useState('')
  const [aiAddLoading,   setAiAddLoading]   = useState(false)
  const [aiAddOptions,   setAiAddOptions]   = useState<ExerciseLibraryItem[]>([])"""

assert old_state in src, "state anchor not found"
src = src.replace(old_state, new_state, 1)

# ── 2. Add addExercise + getAIAddSuggestions functions before swapExercise ─
old_fn = "  async function swapExercise(exerciseRow: SessionExercise, replacementId: string) {"
new_fn = """  // ── Add exercise to session ──────────────────────────────────────────────
  async function addExercise(exerciseId: string) {
    const ex = swapLibrary.find(e => e.id === exerciseId)
    if (!ex) return
    const nextOrder = exercises.length
    const { data: newRow } = await supabase.from('session_exercises').insert({
      session_id: sessionId,
      exercise_id: ex.id,
      exercise_name: ex.name,
      order_index: nextOrder,
      sets_prescribed: 3,
      reps_prescribed: 10,
      added_by_client: true,
    }).select('*, exercise:exercises!session_exercises_exercise_id_fkey(id, name, description, cues, muscles, secondary_muscles, equipment, video_url, video_url_female, thumbnail_url)').single()
    if (!newRow) return
    setExercises(prev => [...prev, { ...newRow, exercise_name: ex.name }])
    setSetData(prev => ({ ...prev, [newRow.id]: [defaultSet()] }))
    setAddExOpen(false)
    setAddExSearch('')
    setAiAddOptions([])
    // Jump to the newly added exercise
    setActiveExIdx(exercises.length)
  }

  async function getAIAddSuggestions() {
    if (aiAddLoading || aiAddOptions.length) return
    setAiAddLoading(true)
    try {
      const currentMuscles = [...new Set(exercises.flatMap(ex => ex.exercise?.muscles || []))]
      const candidates = swapLibrary
        .filter(o => !exercises.some(ex => ex.exercise_id === o.id))
        .slice(0, 60)
      if (!candidates.length) { setAiAddLoading(false); return }
      const candidateList = candidates.map(c => `${c.id}|${c.name}|${c.equipment||'bodyweight'}|${(c.muscles||[]).join(',')}`).join('\n')
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          messages: [{ role: 'user', content: `You are a personal trainer. A client has done: ${exercises.map(e => e.exercise_name).join(', ')}. Muscles worked: ${currentMuscles.join(', ') || 'unknown'}. Suggest 5 exercises to ADD that complement this session (fill gaps, finish strong). Return ONLY the IDs from this list, one per line:\n${candidateList}` }]
        })
      })
      const data = await res.json()
      const ids = (data.content?.[0]?.text || '').trim().split('\n').map((l: string) => l.trim()).filter(Boolean).slice(0, 5)
      const matched = ids.map((id: string) => candidates.find(c => c.id === id)).filter(Boolean) as ExerciseLibraryItem[]
      setAiAddOptions(matched.length ? matched : candidates.slice(0, 5))
    } catch { setAiAddOptions(swapLibrary.filter(o => !exercises.some(ex => ex.exercise_id === o.id)).slice(0, 5)) }
    setAiAddLoading(false)
  }

  const getAddExOptions = (): ExerciseLibraryItem[] => {
    const search = addExSearch.toLowerCase().trim()
    const pool = swapLibrary.filter(o => !exercises.some(ex => ex.exercise_id === o.id))
    if (aiAddOptions.length && !search) return aiAddOptions
    if (!search) return pool.slice(0, 8)
    return pool.filter(o => o.name.toLowerCase().includes(search) || (o.equipment||'').toLowerCase().includes(search)).slice(0, 10)
  }

  async function swapExercise(exerciseRow: SessionExercise, replacementId: string) {"""

assert old_fn in src, "swapExercise anchor not found"
src = src.replace(old_fn, new_fn, 1)

# ── 3. Add "+ Add Exercise" button next to "+ Add Set" ────────────────────
old_btn = """              <button onClick={()=>addSet(ex.id)}
                aria-label={`Add another set for ${ex.exercise_name}`}
                style={{width:'100%',background:'none',border:`1px dashed ${t.border}`,borderRadius:10,padding:'10px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
                + Add Set
              </button>"""

new_btn = """              <div style={{display:'flex',gap:8,marginBottom:0}}>
                <button onClick={()=>addSet(ex.id)}
                  aria-label={`Add another set for ${ex.exercise_name}`}
                  style={{flex:1,background:'none',border:`1px dashed ${t.border}`,borderRadius:10,padding:'10px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
                  + Add Set
                </button>
                {activeExIdx === exercises.indexOf(ex) && exercises.indexOf(ex) === exercises.length - 1 && (
                  <button onClick={()=>{ setAddExOpen(o=>!o); if(!aiAddOptions.length) getAIAddSuggestions() }}
                    style={{flex:1,background:addExOpen?t.tealDim:'none',border:`1px dashed ${addExOpen?t.teal+'60':t.border}`,borderRadius:10,padding:'10px',fontSize:13,color:addExOpen?t.teal:t.textDim,cursor:'pointer'}}>
                    + Add Exercise
                  </button>
                )}
              </div>

              {/* Add Exercise panel */}
              {addExOpen && activeExIdx === exercises.indexOf(ex) && exercises.indexOf(ex) === exercises.length - 1 && (
                <div style={{background:t.tealDim,border:'1px solid '+t.teal+'30',borderRadius:12,padding:'12px 14px',marginTop:8}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Add an exercise</div>
                    {!aiAddOptions.length && (
                      <button onClick={getAIAddSuggestions} disabled={aiAddLoading}
                        style={{fontSize:11,fontWeight:700,color:'#000',background:aiAddLoading?t.teal+'80':t.teal,border:'none',borderRadius:8,padding:'4px 10px',cursor:aiAddLoading?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                        {aiAddLoading ? '✨ Thinking...' : '✨ AI Suggest'}
                      </button>
                    )}
                    {aiAddOptions.length > 0 && <div style={{fontSize:10,color:t.teal,fontWeight:600}}>✨ AI selected</div>}
                  </div>
                  <input value={addExSearch} onChange={e=>{ setAddExSearch(e.target.value); setAiAddOptions([]) }}
                    placeholder="Search exercises..."
                    style={{width:'100%',background:t.surface,border:'1px solid '+t.teal+'40',borderRadius:8,padding:'8px 10px',fontSize:13,color:t.text,fontFamily:"'DM Sans',sans-serif",marginBottom:8,boxSizing:'border-box' as const,colorScheme:'dark'}}
                  />
                  <div style={{display:'grid',gap:8}}>
                    {getAddExOptions().map(option => (
                      <button key={option.id} onClick={()=>addExercise(option.id)}
                        style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,background:t.surface,border:'1px solid '+t.border,borderRadius:10,padding:'10px 12px',fontSize:12,color:t.text,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'left' as const}}>
                        <span>
                          <strong>{option.name}</strong>
                          {option.equipment ? <span style={{color:t.textMuted}}> · {option.equipment}</span> : null}
                        </span>
                        <span style={{color:t.teal,fontWeight:700}}>Add</span>
                      </button>
                    ))}
                    {getAddExOptions().length === 0 && (
                      <div style={{fontSize:12,color:t.textMuted,textAlign:'center' as const,padding:'8px 0'}}>No exercises found</div>
                    )}
                  </div>
                </div>
              )}"""

assert old_btn in src, "Add Set button anchor not found"
src = src.replace(old_btn, new_btn, 1)

path.write_text(src, encoding='utf-8')
print('done')
