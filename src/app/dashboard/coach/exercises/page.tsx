'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Core','Full Body','Cardio']
const EQUIPMENT_OPTIONS = ['Barbell','Dumbbell','Cable','Machine','Bodyweight','Kettlebell','Resistance Band','EZ Bar','Trap Bar','Smith Machine','Other']
const DIFFICULTY_OPTIONS = ['Beginner','Intermediate','Advanced']
const TAG_OPTIONS = ['Compound','Isolation','Push','Pull','Hinge','Squat','Carry','Olympic','Plyometric','Corrective']
const MOVEMENT_PATTERNS = ['squat','hinge','push','pull','core','carry','isolation','general','olympic']

const sty = (override?: object) => ({
  width:'100%', background:t.surfaceUp, border:'1px solid '+t.border,
  borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text,
  outline:'none', fontFamily:"'DM Sans',sans-serif",
  boxSizing:'border-box' as const, colorScheme:'dark' as const,
  ...override,
})

export default function ExerciseLibrary() {
  const [exercises,  setExercises]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filterMuscle, setFilterMuscle] = useState('all')
  const [filterPattern, setFilterPattern] = useState('all')
  const [showNew,    setShowNew]    = useState(false)
  const [editingId,  setEditingId]  = useState<string|null>(null)
  const [playingId,  setPlayingId]  = useState<string|null>(null)
  const [uploading,  setUploading]  = useState<string|null>(null)
  const [saving,     setSaving]     = useState(false)
  const router   = useRouter()
  const supabase = createClient()
  const searchRef = useRef<HTMLInputElement>(null)

  // New exercise form state
  const blank = { name:'', muscles:[] as string[], equipment:'Barbell', difficulty:'Intermediate', tags:[] as string[], cues:'', movement_pattern:'', video_url:'', _videoFile:null as File|null }
  const [newEx, setNewEx] = useState({ ...blank })

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('exercises').select('*').eq('coach_id', user.id).order('name')
    setExercises(data || [])
    setLoading(false)
  }

  const uploadVideo = async (exerciseId: string, file: File): Promise<string|null> => {
    setUploading(exerciseId)
    const ext = file.name.split('.').pop()
    const path = `${exerciseId}/demo.${ext}`
    const { error } = await supabase.storage.from('exercise-videos').upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setUploading(null); return null }
    const { data: { publicUrl } } = supabase.storage.from('exercise-videos').getPublicUrl(path)
    setUploading(null)
    return publicUrl
  }

  const saveNew = async () => {
    if (!newEx.name) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = {
      name: newEx.name, muscles: newEx.muscles, equipment: newEx.equipment,
      difficulty: newEx.difficulty, tags: newEx.tags, cues: newEx.cues || null,
      movement_pattern: newEx.movement_pattern || null, coach_id: user!.id,
      video_url: newEx.video_url || null,
    }
    const { data: saved } = await supabase.from('exercises').insert(payload).select().single()
    if (saved && newEx._videoFile) {
      const url = await uploadVideo(saved.id, newEx._videoFile)
      if (url) {
        await supabase.from('exercises').update({ video_url: url }).eq('id', saved.id)
        saved.video_url = url
      }
    }
    if (saved) setExercises(p => [saved, ...p].sort((a,b)=>a.name.localeCompare(b.name)))
    setNewEx({ ...blank })
    setShowNew(false)
    setSaving(false)
  }

  const saveEdit = async (ex: any, changes: any) => {
    setSaving(true)
    await supabase.from('exercises').update(changes).eq('id', ex.id)
    if (changes._videoFile) {
      const url = await uploadVideo(ex.id, changes._videoFile)
      if (url) {
        await supabase.from('exercises').update({ video_url: url }).eq('id', ex.id)
        changes.video_url = url
      }
      delete changes._videoFile
    }
    setExercises(p => p.map(e => e.id === ex.id ? { ...e, ...changes } : e))
    setEditingId(null)
    setSaving(false)
  }

  const uploadCardVideo = async (exerciseId: string, file: File) => {
    const url = await uploadVideo(exerciseId, file)
    if (url) {
      await supabase.from('exercises').update({ video_url: url }).eq('id', exerciseId)
      setExercises(p => p.map(e => e.id === exerciseId ? { ...e, video_url: url } : e))
    }
  }

  const deleteExercise = async (id: string) => {
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(p => p.filter(e => e.id !== id))
  }

  const filtered = exercises.filter(e => {
    const ms = search.toLowerCase()
    const matchSearch = !ms || e.name.toLowerCase().includes(ms) || (e.muscles||[]).join(' ').toLowerCase().includes(ms)
    const matchMuscle = filterMuscle === 'all' || (e.muscles||[]).includes(filterMuscle) || e.equipment === filterMuscle
    const matchPattern = filterPattern === 'all' || e.movement_pattern === filterPattern
    return matchSearch && matchMuscle && matchPattern
  })

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>
      Loading library...
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select,textarea{color-scheme:dark;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.back()} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Exercise Library</div>
          <div style={{ fontSize:12, color:t.textMuted }}>({exercises.length} exercises · {filtered.length} shown)</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>router.push('/dashboard/coach/exercises/import')}
            style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            📁 Bulk Import
          </button>
          <button onClick={()=>{ setShowNew(true); setTimeout(()=>searchRef.current?.focus(),50) }}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add Exercise
          </button>
        </div>

        {/* Filters */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'10px 24px', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or muscle..."
            style={{ flex:1, minWidth:200, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'8px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
          <select value={filterMuscle} onChange={e=>setFilterMuscle(e.target.value)}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'8px 12px', fontSize:12, color:filterMuscle!=='all'?t.teal:t.textMuted, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
            <option value="all">All Muscles</option>
            <optgroup label="Muscle Group">{MUSCLE_GROUPS.map(m=><option key={m} value={m}>{m}</option>)}</optgroup>
            <optgroup label="Equipment">{EQUIPMENT_OPTIONS.map(e=><option key={e} value={e}>{e}</option>)}</optgroup>
          </select>
          <select value={filterPattern} onChange={e=>setFilterPattern(e.target.value)}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'8px 12px', fontSize:12, color:filterPattern!=='all'?t.purple:t.textMuted, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
            <option value="all">All Patterns</option>
            {MOVEMENT_PATTERNS.map(p=><option key={p} value={p} style={{ textTransform:'capitalize' }}>{p}</option>)}
          </select>
          {(search||filterMuscle!=='all'||filterPattern!=='all') && (
            <button onClick={()=>{ setSearch(''); setFilterMuscle('all'); setFilterPattern('all') }}
              style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
              ✕ Clear
            </button>
          )}
        </div>

        {/* Exercise grid */}
        <div style={{ maxWidth:1200, margin:'0 auto', padding:20 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🔍</div>
              <div style={{ fontSize:14, fontWeight:700 }}>No exercises found</div>
              <div style={{ fontSize:12, marginTop:6 }}>Try a different search or filter</div>
            </div>
          )}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
            {filtered.map(ex => (
              <ExerciseCard
                key={ex.id} ex={ex}
                isEditing={editingId===ex.id}
                isUploading={uploading===ex.id}
                isPlaying={playingId===ex.id}
                onPlay={()=>setPlayingId(playingId===ex.id?null:ex.id)}
                onEdit={()=>setEditingId(editingId===ex.id?null:ex.id)}
                onSave={(changes: any)=>saveEdit(ex,changes)}
                onUpload={(file: File)=>uploadCardVideo(ex.id,file)}
                onDelete={()=>deleteExercise(ex.id)}
                saving={saving}
                t={t}
              />
            ))}
          </div>
        </div>

        {/* Add Exercise Modal */}
        {showNew && (
          <div onClick={()=>{ setShowNew(false); setNewEx({...blank}) }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:540, padding:28, maxHeight:'92vh', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>Add Exercise</div>
                <span onClick={()=>{ setShowNew(false); setNewEx({...blank}) }} style={{ cursor:'pointer', color:t.textMuted, fontSize:22, lineHeight:1 }}>×</span>
              </div>

              {/* VIDEO FIRST — it's your primary input */}
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Demo Video</div>
                {newEx._videoFile ? (
                  <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>📹</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:t.teal }}>{newEx._videoFile.name}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{(newEx._videoFile.size/1024/1024).toFixed(1)}MB — uploads after save</div>
                    </div>
                    <button onClick={()=>setNewEx(p=>({...p,_videoFile:null}))} style={{ background:'none', border:'none', color:t.red, cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                ) : newEx.video_url ? (
                  <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <span>🔗</span>
                    <div style={{ flex:1, fontSize:12, color:t.teal, wordBreak:'break-all' }}>{newEx.video_url}</div>
                    <button onClick={()=>setNewEx(p=>({...p,video_url:''}))} style={{ background:'none', border:'none', color:t.red, cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr auto', gap:8 }}>
                    <label style={{ cursor:'pointer' }}>
                      <input type="file" accept="video/*" style={{ display:'none' }}
                        onChange={e=>{ if (e.target.files?.[0]) setNewEx(p=>({...p,_videoFile:e.target.files![0]})) }} />
                      <div style={{ background:t.surfaceUp, border:'2px dashed '+t.border, borderRadius:10, padding:'12px 16px', fontSize:13, color:t.textMuted, textAlign:'center' as const, transition:'border-color .2s' }}
                        onMouseEnter={e=>(e.currentTarget.style.borderColor=t.teal+'60')}
                        onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                        📹 Upload video file
                      </div>
                    </label>
                    <div style={{ display:'flex', alignItems:'center', color:t.textMuted, fontSize:12 }}>or</div>
                  </div>
                )}
                {!newEx._videoFile && !newEx.video_url && (
                  <input value={newEx.video_url} onChange={e=>setNewEx(p=>({...p,video_url:e.target.value}))}
                    placeholder="Paste video URL (optional)"
                    style={{ ...sty(), marginTop:8 }} />
                )}
              </div>

              {/* Name */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Name *</div>
                <input value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))}
                  placeholder="e.g. Barbell Back Squat"
                  style={sty()} onKeyDown={e=>{ if(e.key==='Enter'&&newEx.name) saveNew() }} />
              </div>

              {/* Equipment + Difficulty */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Equipment</div>
                  <select value={newEx.equipment} onChange={e=>setNewEx(p=>({...p,equipment:e.target.value}))} style={sty()}>
                    {EQUIPMENT_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Difficulty</div>
                  <select value={newEx.difficulty} onChange={e=>setNewEx(p=>({...p,difficulty:e.target.value}))} style={sty()}>
                    {DIFFICULTY_OPTIONS.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Muscles */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Muscle Groups</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {MUSCLE_GROUPS.map(m => (
                    <button key={m} onClick={()=>setNewEx(p=>({ ...p, muscles: p.muscles.includes(m)?p.muscles.filter(x=>x!==m):[...p.muscles,m] }))}
                      style={{ padding:'5px 11px', borderRadius:7, border:'1px solid '+(newEx.muscles.includes(m)?t.teal+'60':t.border), background:newEx.muscles.includes(m)?t.tealDim:'transparent', fontSize:11, fontWeight:700, color:newEx.muscles.includes(m)?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Tags</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {TAG_OPTIONS.map(tg => (
                    <button key={tg} onClick={()=>setNewEx(p=>({ ...p, tags: p.tags.includes(tg)?p.tags.filter(x=>x!==tg):[...p.tags,tg] }))}
                      style={{ padding:'5px 11px', borderRadius:7, border:'1px solid '+(newEx.tags.includes(tg)?t.purple+'60':t.border), background:newEx.tags.includes(tg)?t.purpleDim:'transparent', fontSize:11, fontWeight:700, color:newEx.tags.includes(tg)?t.purple:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {tg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Cues */}
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Coaching Cues (optional)</div>
                <textarea value={newEx.cues} onChange={e=>setNewEx(p=>({...p,cues:e.target.value}))} rows={2}
                  placeholder="Key technique points shown during workouts..."
                  style={{ ...sty(), resize:'none' as const, lineHeight:1.6 }} />
              </div>

              <button onClick={saveNew} disabled={!newEx.name||saving}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newEx.name||saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newEx.name||saving?.5:1 }}>
                {saving ? 'Saving...' : '+ Save Exercise'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

// ── Exercise Card with inline edit ────────────────────────────────────────
function ExerciseCard({ ex, isEditing, isUploading, isPlaying, onPlay, onEdit, onSave, onUpload, onDelete, saving, t }: any) {
  const [draft, setDraft] = useState<any>(null)

  const startEdit = () => {
    setDraft({
      name: ex.name, muscles: [...(ex.muscles||[])], equipment: ex.equipment||'',
      difficulty: ex.difficulty||'Intermediate', tags: [...(ex.tags||[])],
      cues: ex.cues||'', movement_pattern: ex.movement_pattern||'',
      video_url: ex.video_url||'', _videoFile: null,
    })
    onEdit()
  }

  const cancelEdit = () => { setDraft(null); onEdit() }

  const submitEdit = () => {
    if (!draft?.name) return
    const changes: any = {
      name: draft.name, muscles: draft.muscles, equipment: draft.equipment,
      difficulty: draft.difficulty, tags: draft.tags, cues: draft.cues||null,
      movement_pattern: draft.movement_pattern||null, video_url: draft.video_url||null,
    }
    if (draft._videoFile) changes._videoFile = draft._videoFile
    onSave(changes)
    setDraft(null)
  }

  const sty2 = (override?: object) => ({
    width:'100%', background:t.surfaceUp, border:'1px solid '+t.border,
    borderRadius:8, padding:'8px 10px', fontSize:12, color:t.text,
    outline:'none', fontFamily:"'DM Sans',sans-serif",
    boxSizing:'border-box' as const, colorScheme:'dark' as const,
    ...override,
  })

  return (
    <div style={{ background:t.surface, border:'1px solid '+(isEditing?t.teal+'60':t.border), borderRadius:14, overflow:'hidden', transition:'border-color .15s' }}>

      {/* Video preview */}
      {ex.video_url && !isEditing && (
        <div style={{ background:'#000', aspectRatio:'16/9', position:'relative', cursor:'pointer' }} onClick={onPlay}>
          {isPlaying ? (
            ex.video_url.includes('drive.google.com')
              ? <iframe src={ex.video_url} allow="autoplay" style={{ width:'100%', height:'100%', border:'none' }} />
              : <video src={ex.video_url} autoPlay controls style={{ width:'100%', height:'100%', objectFit:'contain' }} />
          ) : (
            <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', minHeight:140, background:'#0a0a12' }}>
              {ex.drive_thumbnail && <img src={ex.drive_thumbnail} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:.45 }} />}
              <div style={{ position:'relative', width:40, height:40, borderRadius:'50%', background:t.teal+'33', border:'2px solid '+t.teal+'70', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16 }}>▶</div>
            </div>
          )}
        </div>
      )}

      <div style={{ padding:14 }}>
        {!isEditing ? (
          // ── View mode ──────────────────────────────
          <>
            <div style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:8 }}>
              <div style={{ flex:1, fontSize:13, fontWeight:800, lineHeight:1.3 }}>{ex.name}</div>
              <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                {/* Video upload */}
                <label title={ex.video_url?'Replace video':'Upload video'} style={{ cursor:'pointer' }}>
                  <input type="file" accept="video/*" style={{ display:'none' }}
                    onChange={e=>{ if(e.target.files?.[0]) onUpload(e.target.files[0]); (e.target as HTMLInputElement).value='' }} />
                  <span style={{ display:'inline-flex', alignItems:'center', background:ex.video_url?t.tealDim:t.surfaceHigh, border:'1px solid '+(ex.video_url?t.teal+'40':t.border), borderRadius:6, padding:'3px 7px', fontSize:11, color:ex.video_url?t.teal:t.textMuted, cursor:'pointer', whiteSpace:'nowrap' as const }}>
                    {isUploading?'⏳':ex.video_url?'📹 ✓':'📹'}
                  </span>
                </label>
                <button onClick={startEdit} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:6, padding:'3px 9px', fontSize:11, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                <button onClick={()=>{ if(confirm('Delete '+ex.name+'?')) onDelete() }} style={{ background:'none', border:'none', color:t.red+'50', cursor:'pointer', fontSize:13 }}>✕</button>
              </div>
            </div>

            <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
              {(ex.muscles||[]).map((m:string) => (
                <span key={m} style={{ background:t.tealDim, border:'1px solid '+t.teal+'25', borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, color:t.teal }}>{m}</span>
              ))}
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
              {ex.equipment && <span style={{ background:t.surfaceHigh, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.textMuted }}>{ex.equipment}</span>}
              {ex.movement_pattern && <span style={{ background:t.orangeDim, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.orange, textTransform:'capitalize' as const }}>{ex.movement_pattern}</span>}
              {ex.difficulty && <span style={{ background:t.surfaceHigh, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.textDim }}>{ex.difficulty}</span>}
              {(ex.tags||[]).map((tg:string) => (
                <span key={tg} style={{ background:t.purpleDim, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.purple }}>{tg}</span>
              ))}
            </div>
            {ex.cues && <div style={{ fontSize:11, color:t.textMuted, marginTop:8, lineHeight:1.5, fontStyle:'italic' }}>{ex.cues}</div>}
          </>
        ) : draft && (
          // ── Edit mode ──────────────────────────────
          <div>
            <div style={{ fontSize:12, fontWeight:800, color:t.teal, marginBottom:12 }}>Editing</div>

            {/* Name */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }}>Name</label>
              <input value={draft.name} onChange={e=>setDraft((p:any)=>({...p,name:e.target.value}))} style={sty2()} />
            </div>

            {/* Equipment + Difficulty */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }}>Equipment</label>
                <select value={draft.equipment} onChange={e=>setDraft((p:any)=>({...p,equipment:e.target.value}))} style={sty2()}>
                  {['Barbell','Dumbbell','Cable','Machine','Bodyweight','Kettlebell','Resistance Band','EZ Bar','Trap Bar','Smith Machine','Other'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }}>Difficulty</label>
                <select value={draft.difficulty} onChange={e=>setDraft((p:any)=>({...p,difficulty:e.target.value}))} style={sty2()}>
                  {['Beginner','Intermediate','Advanced'].map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Muscles */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Muscles</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Core','Full Body'].map(m => (
                  <button key={m} onClick={()=>setDraft((p:any)=>({...p,muscles:p.muscles.includes(m)?p.muscles.filter((x:string)=>x!==m):[...p.muscles,m]}))}
                    style={{ padding:'4px 9px', borderRadius:6, border:'1px solid '+(draft.muscles.includes(m)?t.teal+'60':t.border), background:draft.muscles.includes(m)?t.tealDim:'transparent', fontSize:10, fontWeight:700, color:draft.muscles.includes(m)?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* Tags */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Tags</label>
              <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
                {['Compound','Isolation','Push','Pull','Hinge','Squat','Carry','Olympic','Plyometric','Corrective'].map(tg => (
                  <button key={tg} onClick={()=>setDraft((p:any)=>({...p,tags:p.tags.includes(tg)?p.tags.filter((x:string)=>x!==tg):[...p.tags,tg]}))}
                    style={{ padding:'4px 9px', borderRadius:6, border:'1px solid '+(draft.tags.includes(tg)?t.purple+'60':t.border), background:draft.tags.includes(tg)?t.purpleDim:'transparent', fontSize:10, fontWeight:700, color:draft.tags.includes(tg)?t.purple:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {tg}
                  </button>
                ))}
              </div>
            </div>

            {/* Cues */}
            <div style={{ marginBottom:10 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }}>Cues</label>
              <textarea value={draft.cues} onChange={e=>setDraft((p:any)=>({...p,cues:e.target.value}))} rows={2}
                style={{ ...sty2(), resize:'none' as const, lineHeight:1.5 }} />
            </div>

            {/* Video */}
            <div style={{ marginBottom:12 }}>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:4 }}>Video</label>
              {draft._videoFile ? (
                <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 10px', display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:t.teal, flex:1 }}>📹 {draft._videoFile.name}</span>
                  <button onClick={()=>setDraft((p:any)=>({...p,_videoFile:null}))} style={{ background:'none', border:'none', color:t.red, cursor:'pointer' }}>✕</button>
                </div>
              ) : (
                <div style={{ display:'flex', gap:6 }}>
                  <input value={draft.video_url} onChange={e=>setDraft((p:any)=>({...p,video_url:e.target.value}))}
                    placeholder="Video URL or upload..." style={{ ...sty2(), flex:1 }} />
                  <label style={{ cursor:'pointer', flexShrink:0 }}>
                    <input type="file" accept="video/*" style={{ display:'none' }}
                      onChange={e=>{ if(e.target.files?.[0]) setDraft((p:any)=>({...p,_videoFile:e.target.files![0]})) }} />
                    <span style={{ display:'inline-block', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:11, color:t.textMuted, cursor:'pointer' }}>📹</span>
                  </label>
                </div>
              )}
            </div>

            {/* Actions */}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={cancelEdit} style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:9, padding:'9px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={submitEdit} disabled={!draft.name||saving}
                style={{ flex:2, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'9px', fontSize:12, fontWeight:800, color:'#000', cursor:!draft.name||saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!draft.name||saving?.5:1 }}>
                {saving?'Saving...':'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
