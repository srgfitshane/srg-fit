'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", yellow:"#eab308",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const MUSCLE_GROUPS = ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Core','Full Body','Cardio']
const EQUIPMENT_OPTIONS = ['Barbell','Dumbbell','Cable','Machine','Bodyweight','Kettlebell','Resistance Band','EZ Bar','Trap Bar','Smith Machine','Other']
const DIFFICULTY_OPTIONS = ['Beginner','Intermediate','Advanced']
const TAG_OPTIONS = ['Compound','Isolation','Push','Pull','Hinge','Squat','Carry','Olympic','Plyometric','Corrective']

const SEED_EXERCISES = [
  { name:'Barbell Back Squat',      muscles:['Quads','Glutes','Hamstrings'], equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Squat'] },
  { name:'Barbell Deadlift',        muscles:['Hamstrings','Glutes','Back'],  equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Hinge'] },
  { name:'Barbell Bench Press',     muscles:['Chest','Shoulders','Triceps'], equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Push'] },
  { name:'Barbell Row',             muscles:['Back','Biceps'],               equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Pull'] },
  { name:'Overhead Press',          muscles:['Shoulders','Triceps'],         equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Push'] },
  { name:'Romanian Deadlift',       muscles:['Hamstrings','Glutes'],         equipment:'Barbell',    difficulty:'Intermediate', tags:['Compound','Hinge'] },
  { name:'Bulgarian Split Squat',   muscles:['Quads','Glutes'],              equipment:'Dumbbell',   difficulty:'Intermediate', tags:['Compound','Squat'] },
  { name:'Pull Up',                 muscles:['Back','Biceps'],               equipment:'Bodyweight', difficulty:'Intermediate', tags:['Compound','Pull'] },
  { name:'Dip',                     muscles:['Chest','Triceps'],             equipment:'Bodyweight', difficulty:'Intermediate', tags:['Compound','Push'] },
  { name:'Dumbbell Curl',           muscles:['Biceps'],                      equipment:'Dumbbell',   difficulty:'Beginner',     tags:['Isolation','Pull'] },
  { name:'Tricep Pushdown',         muscles:['Triceps'],                     equipment:'Cable',      difficulty:'Beginner',     tags:['Isolation','Push'] },
  { name:'Lat Pulldown',            muscles:['Back','Biceps'],               equipment:'Cable',      difficulty:'Beginner',     tags:['Compound','Pull'] },
  { name:'Cable Row',               muscles:['Back','Biceps'],               equipment:'Cable',      difficulty:'Beginner',     tags:['Compound','Pull'] },
  { name:'Leg Press',               muscles:['Quads','Glutes'],              equipment:'Machine',    difficulty:'Beginner',     tags:['Compound','Squat'] },
  { name:'Leg Curl',                muscles:['Hamstrings'],                  equipment:'Machine',    difficulty:'Beginner',     tags:['Isolation'] },
  { name:'Hip Thrust',              muscles:['Glutes','Hamstrings'],         equipment:'Barbell',    difficulty:'Beginner',     tags:['Compound','Hinge'] },
  { name:'Face Pull',               muscles:['Shoulders','Back'],            equipment:'Cable',      difficulty:'Beginner',     tags:['Isolation','Pull'] },
  { name:'Incline Dumbbell Press',  muscles:['Chest','Shoulders'],           equipment:'Dumbbell',   difficulty:'Intermediate', tags:['Compound','Push'] },
  { name:'Plank',                   muscles:['Core'],                        equipment:'Bodyweight', difficulty:'Beginner',     tags:['Corrective'] },
  { name:'Farmer Carry',            muscles:['Full Body','Forearms'],        equipment:'Dumbbell',   difficulty:'Beginner',     tags:['Carry'] },
  { name:'Goblet Squat',            muscles:['Quads','Glutes'],              equipment:'Kettlebell', difficulty:'Beginner',     tags:['Compound','Squat'] },
  { name:'Kettlebell Swing',        muscles:['Glutes','Hamstrings','Core'],  equipment:'Kettlebell', difficulty:'Intermediate', tags:['Compound','Hinge'] },
  { name:'Dumbbell Lateral Raise',  muscles:['Shoulders'],                   equipment:'Dumbbell',   difficulty:'Beginner',     tags:['Isolation','Push'] },
  { name:'Calf Raise',              muscles:['Calves'],                      equipment:'Machine',    difficulty:'Beginner',     tags:['Isolation'] },
  { name:'Ab Wheel Rollout',        muscles:['Core'],                        equipment:'Other',      difficulty:'Intermediate', tags:['Compound','Corrective'] },
]

export default function ExerciseLibrary() {
  const [exercises, setExercises] = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [filter,    setFilter]    = useState('all')
  const [showNew,   setShowNew]   = useState(false)
  const [seeding,   setSeeding]   = useState(false)
  const [playingId, setPlayingId] = useState<string|null>(null)
  const [newEx, setNewEx] = useState({ name:'', muscles:[] as string[], equipment:'Barbell', difficulty:'Intermediate', tags:[] as string[], cues:'', video_url:'' })
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase.from('exercises').select('*').eq('coach_id', user?.id).order('name')
    setExercises(data || [])
    setLoading(false)
  }

  const seedLibrary = async () => {
    setSeeding(true)
    const { data: { user } } = await supabase.auth.getUser()
    for (const ex of SEED_EXERCISES) {
      await supabase.from('exercises').insert({ ...ex, coach_id: user?.id })
    }
    await load()
    setSeeding(false)
  }

  const saveExercise = async () => {
    if (!newEx.name) return
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = { name: newEx.name, muscles: newEx.muscles, equipment: newEx.equipment, difficulty: newEx.difficulty, tags: newEx.tags, cues: newEx.cues, coach_id: user?.id }
    const { data: saved } = await supabase.from('exercises').insert(payload).select().single()
    // Upload video if attached
    const videoFile = (newEx as any)._videoFile
    if (saved && videoFile) {
      await uploadVideo(saved.id, videoFile)
    }
    setShowNew(false)
    setNewEx({ name:'', muscles:[], equipment:'Barbell', difficulty:'Intermediate', tags:[], cues:'', video_url:'' })
    await load()
  }

  const deleteExercise = async (id: string) => {
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(prev => prev.filter(e => e.id !== id))
  }

  const [uploading, setUploading] = useState<string|null>(null) // exerciseId being uploaded

  const uploadVideo = async (exerciseId: string, file: File) => {
    setUploading(exerciseId)
    const ext = file.name.split('.').pop()
    const path = `${exerciseId}/demo.${ext}`
    const { error: upErr } = await supabase.storage
      .from('exercise-videos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (!upErr) {
      const { data: { publicUrl } } = supabase.storage.from('exercise-videos').getPublicUrl(path)
      await supabase.from('exercises').update({ video_url: publicUrl }).eq('id', exerciseId)
      setExercises(prev => prev.map(e => e.id === exerciseId ? { ...e, video_url: publicUrl } : e))
    }
    setUploading(null)
  }
  const toggleMuscle = (m: string)  => setNewEx(p => ({ ...p, muscles: p.muscles.includes(m)  ? p.muscles.filter(x=>x!==m)  : [...p.muscles, m]  }))
  const toggleTag    = (tg: string) => setNewEx(p => ({ ...p, tags:    p.tags.includes(tg)    ? p.tags.filter(x=>x!==tg)    : [...p.tags, tg]    }))

  const filtered = exercises.filter(e => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || (e.muscles||[]).includes(filter) || (e.tags||[]).includes(filter) || e.equipment === filter
    return matchSearch && matchFilter
  })

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select,textarea{color-scheme:dark;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.back()} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Exercise Library</div>
          <div style={{ fontSize:12, color:t.textMuted }}>({exercises.length} exercises)</div>
          <div style={{ flex:1 }} />
          {exercises.length === 0 && (
            <button onClick={seedLibrary} disabled={seeding}
              style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:8 }}>
              {seeding ? 'Seeding...' : '⚡ Defaults'}
            </button>
          )}
          <button onClick={()=>router.push('/dashboard/coach/exercises/import')}
            style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:8 }}>
            📁 Bulk Import Videos
          </button>
          <button onClick={()=>setShowNew(true)}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add Exercise
          </button>
        </div>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:24 }}>
          <div style={{ display:'flex', gap:10, marginBottom:20, flexWrap:'wrap' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search exercises..."
              style={{ flex:1, minWidth:200, background:t.surface, border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
            <select value={filter} onChange={e=>setFilter(e.target.value)}
              style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
              <option value="all">All</option>
              <optgroup label="Muscle Group">{MUSCLE_GROUPS.map(m=><option key={m} value={m}>{m}</option>)}</optgroup>
              <optgroup label="Equipment">{EQUIPMENT_OPTIONS.map(e=><option key={e} value={e}>{e}</option>)}</optgroup>
              <optgroup label="Tags">{TAG_OPTIONS.map(tg=><option key={tg} value={tg}>{tg}</option>)}</optgroup>
            </select>
          </div>

          {exercises.length === 0 && !loading && (
            <div style={{ textAlign:'center', padding:'64px 20px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>🏋️</div>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No exercises yet</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>Bulk import your videos or load the default library.</div>
              <button onClick={()=>router.push('/dashboard/coach/exercises/import')}
                style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:12 }}>
                📁 Bulk Import Videos
              </button>
              <button onClick={seedLibrary} disabled={seeding}
                style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {seeding ? 'Loading...' : '⚡ Load Defaults (25)'}
              </button>
            </div>
          )}


          {/* Exercise grid — with video preview */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
            {filtered.map(ex => (
              <div key={ex.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, overflow:'hidden', transition:'border-color 0.15s ease' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=t.teal+'40'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>

                {/* Video thumbnail / player — supports Drive embed or direct video */}
                {ex.video_url && (
                  <div style={{ position:'relative', background:'#000', aspectRatio:'16/9' }}>
                    {playingId === ex.id ? (
                      ex.video_url.includes('drive.google.com') ? (
                        <iframe src={ex.video_url} allow="autoplay" style={{ width:'100%', height:'100%', border:'none' }} />
                      ) : (
                        <video src={ex.video_url} autoPlay controls style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                      )
                    ) : (
                      <div onClick={()=>setPlayingId(ex.id)}
                        style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', background:'#0a0a12', minHeight:120, position:'relative' }}>
                        {ex.drive_thumbnail && (
                          <img src={ex.drive_thumbnail} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', opacity:0.5 }} />
                        )}
                        <div style={{ position:'relative', width:44, height:44, borderRadius:'50%', background:t.teal+'33', border:'2px solid '+t.teal+'70', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>▶</div>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ padding:'14px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:8 }}>
                    <div style={{ fontSize:13, fontWeight:800, flex:1, marginRight:8 }}>{ex.name}</div>
                    <div style={{ display:'flex', gap:4 }}>
                      {/* Video upload button */}
                      <label title="Upload video" style={{ cursor:'pointer' }}>
                        <input type="file" accept="video/*" style={{ display:'none' }}
                          onChange={e => { if (e.target.files?.[0]) uploadVideo(ex.id, e.target.files[0]); e.target.value = '' }} />
                        <span style={{ background: ex.video_url ? t.tealDim : t.surfaceHigh, border:'1px solid '+(ex.video_url ? t.teal+'40' : t.border), borderRadius:6, padding:'3px 7px', fontSize:11, color: ex.video_url ? t.teal : t.textMuted, cursor:'pointer', display:'inline-block', whiteSpace:'nowrap' }}>
                          {uploading === ex.id ? '⏳' : ex.video_url ? '📹 ✓' : '📹'}
                        </span>
                      </label>
                      <button onClick={()=>deleteExercise(ex.id)} style={{ background:'none', border:'none', color:t.red+'50', cursor:'pointer', fontSize:13, flexShrink:0 }}>✕</button>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:4, marginBottom:6 }}>
                    {(ex.muscles||[]).map((m:string) => (
                      <span key={m} style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:5, padding:'2px 7px', fontSize:10, fontWeight:700, color:t.teal }}>{m}</span>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                    {ex.equipment && <span style={{ background:t.surfaceHigh, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.textMuted }}>{ex.equipment}</span>}
                    {ex.movement_pattern && <span style={{ background:t.orangeDim, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.orange }}>{ex.movement_pattern}</span>}
                    {(ex.tags||[]).map((tg:string) => (
                      <span key={tg} style={{ background:t.purpleDim, borderRadius:5, padding:'2px 7px', fontSize:10, color:t.purple }}>{tg}</span>
                    ))}
                  </div>
                  {ex.cues && <div style={{ fontSize:11, color:t.textMuted, marginTop:8, lineHeight:1.5, fontStyle:'italic' }}>{ex.cues}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Add Exercise Modal */}
        {showNew && (
          <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:520, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>Add Exercise</div>
                <span onClick={()=>setShowNew(false)} style={{ cursor:'pointer', color:t.textMuted, fontSize:22 }}>×</span>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Exercise Name *</div>
                <input value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))} placeholder="e.g. Barbell Back Squat"
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Equipment</div>
                  <select value={newEx.equipment} onChange={e=>setNewEx(p=>({...p,equipment:e.target.value}))}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                    {EQUIPMENT_OPTIONS.map(e=><option key={e} value={e}>{e}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Difficulty</div>
                  <select value={newEx.difficulty} onChange={e=>setNewEx(p=>({...p,difficulty:e.target.value}))}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                    {DIFFICULTY_OPTIONS.map(d=><option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Muscle Groups</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {MUSCLE_GROUPS.map(m => (
                    <button key={m} onClick={()=>toggleMuscle(m)}
                      style={{ padding:'5px 11px', borderRadius:7, border:'1px solid '+(newEx.muscles.includes(m)?t.teal+'60':t.border), background:newEx.muscles.includes(m)?t.tealDim:'transparent', fontSize:11, fontWeight:700, color:newEx.muscles.includes(m)?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Tags</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {TAG_OPTIONS.map(tg => (
                    <button key={tg} onClick={()=>toggleTag(tg)}
                      style={{ padding:'5px 11px', borderRadius:7, border:'1px solid '+(newEx.tags.includes(tg)?t.purple+'60':t.border), background:newEx.tags.includes(tg)?t.purpleDim:'transparent', fontSize:11, fontWeight:700, color:newEx.tags.includes(tg)?t.purple:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {tg}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Coaching Cues (optional)</div>
                <textarea value={newEx.cues} onChange={e=>setNewEx(p=>({...p,cues:e.target.value}))} rows={2}
                  placeholder="Key technique cues shown to the client during workouts..."
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
              </div>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Demo Video (optional)</div>
                <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <label style={{ flex:1, cursor:'pointer' }}>
                    <input type="file" accept="video/*" style={{ display:'none' }}
                      onChange={e => { if (e.target.files?.[0]) setNewEx(p=>({...p, _videoFile: e.target.files![0], _videoName: e.target.files![0].name} as any)) }} />
                    <div style={{ background:t.surfaceUp, border:'2px dashed '+t.border, borderRadius:10, padding:'10px 14px', fontSize:12, color:(newEx as any)._videoFile ? t.teal : t.textMuted, textAlign:'center' as const }}>
                      {(newEx as any)._videoFile ? `✓ ${(newEx as any)._videoName}` : '📹 Click to attach a video'}
                    </div>
                  </label>
                  {(newEx as any)._videoFile && (
                    <button onClick={()=>setNewEx(p=>({...p, _videoFile: null, _videoName: ''} as any))}
                      style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'8px', fontSize:12, color:t.red, cursor:'pointer' }}>✕</button>
                  )}
                </div>
                <div style={{ fontSize:11, color:t.textMuted, marginTop:5 }}>MP4, WebM, or MOV. Video uploads after saving.</div>
              </div>
              <button onClick={saveExercise} disabled={!newEx.name}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newEx.name?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newEx.name?0.5:1 }}>
                Save Exercise →
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
