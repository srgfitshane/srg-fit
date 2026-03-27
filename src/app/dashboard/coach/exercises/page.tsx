'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const MUSCLES    = ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Quads','Hamstrings','Glutes','Calves','Hip Flexors','Abductors','Adductors','Legs','Core','Lower Back','Obliques','Traps','Lats','Rear Delts','Full Body','Cardio']
const EQUIPMENT  = [
  'Barbell','Dumbbell','Cable','Machine','Bodyweight','Kettlebell','Resistance Band',
  'EZ Bar','Trap Bar','Smith Machine','Pull-up Bar','Bench','Stability Ball',
  'Medicine Ball','Battle Ropes','TRX / Suspension','Foam Roller','Box / Step',
  'Sled','Landmine','Ab Wheel','Dip Bars','Other'
]
const MODIFIERS  = ['Single Arm','Single Leg','Bilateral','Unilateral','Alternating','Eccentric','Isometric','Tempo']
const PATTERNS   = ['squat','hinge','push','pull','core','carry','isolation','stretch','yoga','general','olympic']
const DIFFICULTY = ['Beginner','Intermediate','Advanced']
const TAGS       = ['Compound','Isolation','Push','Pull','Hinge','Squat','Carry','Olympic','Plyometric','Corrective']

const inp = (o?: object): React.CSSProperties => ({
  width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
  borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text,
  outline:'none', fontFamily:"'DM Sans',sans-serif",
  boxSizing:'border-box', colorScheme:'dark' as any, ...o
})

const blank = {
  name:'', muscles:[] as string[], secondary_muscles:[] as string[],
  equipment_list:[] as string[], difficulty:'Intermediate', movement_pattern:'',
  modifiers:[] as string[], is_timed:false, default_duration_seconds:30,
  tags:[] as string[], description:'', cues:'', video_url:'',
  _videoFile: null as File|null,
}

export default function ExerciseLibrary() {
  const [exercises, setExercises]   = useState<any[]>([])
  const [loading,   setLoading]     = useState(true)
  const [search,    setSearch]      = useState('')
  const [filterMuscle,  setFilterMuscle]  = useState('all')
  const [filterPattern, setFilterPattern] = useState('all')
  const [filterVideo,   setFilterVideo]   = useState<'all'|'has'|'missing'>('all')
  const [filterDetail,  setFilterDetail]  = useState<'all'|'missing'>('all')
  const [page,          setPage]          = useState(1)
  const PAGE_SIZE = 50
  const [showNew,   setShowNew]     = useState(false)
  const [editingId, setEditingId]   = useState<string|null>(null)
  const [uploading, setUploading]   = useState<string|null>(null)
  const [saving,    setSaving]      = useState(false)
  const [newEx,     setNewEx]       = useState({...blank})
  const router   = useRouter()
  const supabase = createClient()
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase.from('exercises').select(
      'id,name,muscles,secondary_muscles,equipment,equipment_list,difficulty,movement_pattern,modifiers,is_timed,default_duration_seconds,tags,description,cues,video_url,video_url_female,thumbnail_url,coach_id'
    ).order('name')
    setExercises(data || [])
    setLoading(false)
  }

  const uploadVideo = async (exerciseId: string, file: File, field: 'video_url'|'video_url_female' = 'video_url'): Promise<string|null> => {
    setUploading(exerciseId)
    const ext = file.name.split('.').pop()
    const suffix = field === 'video_url_female' ? 'demo_f' : 'demo'
    const path = `${exerciseId}/${suffix}.${ext}`
    const { error } = await supabase.storage.from('exercise-videos')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (error) { setUploading(null); console.error(error); return null }
    const { data: { publicUrl } } = supabase.storage.from('exercise-videos').getPublicUrl(path)
    setUploading(null)
    return publicUrl
  }

  const saveNew = async () => {
    if (!newEx.name.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload: any = {
      name: newEx.name.trim(), muscles: newEx.muscles, secondary_muscles: newEx.secondary_muscles,
      equipment_list: newEx.equipment_list, difficulty: newEx.difficulty,
      movement_pattern: newEx.movement_pattern || null,
      modifiers: newEx.modifiers, is_timed: newEx.is_timed,
      default_duration_seconds: newEx.is_timed ? (newEx.default_duration_seconds || 30) : null,
      tags: newEx.tags, description: newEx.description || null,
      cues: newEx.cues || null, coach_id: user!.id,
      video_url: newEx.video_url || null,
    }
    const { data: saved } = await supabase.from('exercises').insert(payload).select().single()
    if (saved && newEx._videoFile) {
      const url = await uploadVideo(saved.id, newEx._videoFile)
      if (url) { await supabase.from('exercises').update({ video_url: url }).eq('id', saved.id); saved.video_url = url }
    }
    if (saved) setExercises(p => [saved, ...p].sort((a,b)=>a.name.localeCompare(b.name)))
    setNewEx({...blank}); setShowNew(false); setSaving(false)
  }

  const saveEdit = async (id: string, changes: any) => {
    setSaving(true)
    const videoFile = changes._videoFile
    delete changes._videoFile
    const { error } = await supabase.from('exercises').update(changes).eq('id', id)
    if (!error && videoFile) {
      const url = await uploadVideo(id, videoFile)
      if (url) { await supabase.from('exercises').update({ video_url: url }).eq('id', id); changes.video_url = url }
    }
    setExercises(p => p.map(e => e.id === id ? { ...e, ...changes } : e))
    setEditingId(null); setSaving(false)
  }

  const quickUpload = async (id: string, file: File, field: 'video_url'|'video_url_female' = 'video_url') => {
    const url = await uploadVideo(id, file, field)
    if (url) {
      await supabase.from('exercises').update({ [field]: url }).eq('id', id)
      setExercises(p => p.map(e => e.id === id ? { ...e, [field]: url } : e))
    }
  }

  const deleteExercise = async (id: string) => {
    if (!confirm('Delete this exercise? This cannot be undone.')) return
    await supabase.from('exercises').delete().eq('id', id)
    setExercises(p => p.filter(e => e.id !== id))
  }

  const duplicateExercise = async (ex: any) => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: duped } = await supabase.from('exercises').insert({
      name: ex.name + ' (copy)',
      muscles: ex.muscles || [],
      secondary_muscles: ex.secondary_muscles || [],
      equipment_list: ex.equipment_list || [],
      difficulty: ex.difficulty,
      movement_pattern: ex.movement_pattern || null,
      modifiers: ex.modifiers || [],
      is_timed: ex.is_timed || false,
      default_duration_seconds: ex.default_duration_seconds || null,
      tags: ex.tags || [],
      description: ex.description || null,
      cues: ex.cues || null,
      coach_id: user!.id,
      // Don't copy video — force intentional upload for variants
    }).select().single()
    if (duped) {
      setExercises(p => [duped, ...p])
      setEditingId(duped.id) // open immediately for editing
    }
  }

  const filtered = exercises.filter(e => {
    const q = search.toLowerCase()
    if (q && !e.name.toLowerCase().includes(q) && !(e.muscles||[]).join(' ').toLowerCase().includes(q)) return false
    if (filterMuscle !== 'all' && !(e.muscles||[]).includes(filterMuscle) && e.equipment !== filterMuscle) return false
    if (filterPattern !== 'all' && e.movement_pattern !== filterPattern) return false
    if (filterVideo === 'has' && !e.video_url) return false
    if (filterVideo === 'missing' && e.video_url) return false
    if (filterDetail === 'missing' && e.muscles?.length > 0 && e.movement_pattern && e.description) return false
    return true
  })
  const displayed = filtered.slice(0, page * PAGE_SIZE)

  const stats = {
    total: exercises.length,
    withVideo: exercises.filter(e=>e.video_url).length,
    withMuscles: exercises.filter(e=>e.muscles?.length>0).length,
    withPattern: exercises.filter(e=>e.movement_pattern).length,
    withCues: exercises.filter(e=>e.cues).length,
  }

  if (loading) return (
    <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>
      Loading library...
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select,textarea{color-scheme:dark;}`}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 24px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.back()} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:800}}>Exercise Library</div>
          <div style={{fontSize:12,color:t.textMuted}}>
            {stats.withVideo}/{stats.total} videos · {stats.withMuscles}/{stats.total} muscles · {stats.withPattern}/{stats.total} patterns
          </div>
          <div style={{flex:1}}/>
          <button onClick={()=>setShowNew(true)} style={{background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,border:'none',borderRadius:9,padding:'8px 18px',fontSize:13,fontWeight:700,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            + Add Exercise
          </button>
        </div>

        {/* Filters */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'10px 24px',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          <input ref={searchRef} value={search} onChange={e=>{setSearch(e.target.value);setPage(1)}} placeholder="Search name or muscle..."
            style={{flex:1,minWidth:180,background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 12px',fontSize:13,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
          <select value={filterMuscle} onChange={e=>{setFilterMuscle(e.target.value);setPage(1)}}
            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 10px',fontSize:12,color:filterMuscle!=='all'?t.teal:t.textMuted,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="all">All Muscles</option>
            {MUSCLES.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          <select value={filterPattern} onChange={e=>{setFilterPattern(e.target.value);setPage(1)}}
            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 10px',fontSize:12,color:filterPattern!=='all'?t.purple:t.textMuted,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="all">All Patterns</option>
            {PATTERNS.map(p=><option key={p} value={p} style={{textTransform:'capitalize'}}>{p}</option>)}
          </select>
          <select value={filterVideo} onChange={e=>{setFilterVideo(e.target.value as any);setPage(1)}}
            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 10px',fontSize:12,color:filterVideo!=='all'?t.orange:t.textMuted,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="all">All Videos</option>
            <option value="has">Has Video</option>
            <option value="missing">No Video</option>
          </select>
          <select value={filterDetail} onChange={e=>{setFilterDetail(e.target.value as any);setPage(1)}}
            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 10px',fontSize:12,color:filterDetail!=='all'?t.red:t.textMuted,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
            <option value="all">All Detail</option>
            <option value="missing">Needs Detail</option>
          </select>
          <span style={{fontSize:12,color:t.textMuted}}>{displayed.length}/{filtered.length}</span>
          {(search||filterMuscle!=='all'||filterPattern!=='all'||filterVideo!=='all'||filterDetail!=='all') && (
            <button onClick={()=>{setSearch('');setFilterMuscle('all');setFilterPattern('all');setFilterVideo('all');setFilterDetail('all');setPage(1)}}
              style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:12,fontFamily:"'DM Sans',sans-serif"}}>✕ Clear</button>
          )}
        </div>

        {/* Grid */}
        <div style={{maxWidth:1280,margin:'0 auto',padding:20}}>
          {filtered.length === 0 ? (
            <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>
              <div style={{fontSize:32,marginBottom:12}}>🔍</div>
              <div style={{fontSize:14,fontWeight:700}}>No exercises match</div>
            </div>
          ) : (
            <>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
              {displayed.map(ex => (
                <ExerciseCard key={ex.id} ex={ex}
                  isEditing={editingId===ex.id}
                  isUploading={uploading===ex.id}
                  onEdit={()=>setEditingId(editingId===ex.id?null:ex.id)}
                  onSave={(changes:any)=>saveEdit(ex.id,changes)}
                  onUpload={(f:File)=>quickUpload(ex.id,f,'video_url')}
                  onUploadFemale={(f:File)=>quickUpload(ex.id,f,'video_url_female')}
                  onDelete={()=>deleteExercise(ex.id)}
                  onDuplicate={()=>duplicateExercise(ex)}
                  saving={saving} t={t}/>
              ))}
            </div>

            {/* Load More */}
            {displayed.length < filtered.length && (
              <div style={{textAlign:'center',padding:'24px 0'}}>
                <button onClick={()=>setPage(p=>p+1)}
                  style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:10,padding:'10px 28px',fontSize:13,fontWeight:700,color:t.text,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  Load more ({filtered.length - displayed.length} remaining)
                </button>
              </div>
            )}
            </>
          )}
        </div>

        {/* Add New Modal */}
        {showNew && (
          <div onClick={()=>{setShowNew(false);setNewEx({...blank})}} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.87)',backdropFilter:'blur(10px)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
            <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,width:'100%',maxWidth:560,padding:28,maxHeight:'92vh',overflowY:'auto',display:'flex',flexDirection:'column',gap:14}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:16,fontWeight:800}}>Add Exercise</div>
                <span onClick={()=>{setShowNew(false);setNewEx({...blank})}} style={{cursor:'pointer',color:t.textMuted,fontSize:24}}>×</span>
              </div>

              {/* Video upload */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Demo Video</div>
                {newEx._videoFile ? (
                  <div style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:10,padding:'10px 14px',display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:18}}>📹</span>
                    <div style={{flex:1,fontSize:12,color:t.teal}}>{newEx._videoFile.name} · {(newEx._videoFile.size/1024/1024).toFixed(1)}MB</div>
                    <button onClick={()=>setNewEx(p=>({...p,_videoFile:null}))} style={{background:'none',border:'none',color:t.red,cursor:'pointer',fontSize:16}}>✕</button>
                  </div>
                ) : (
                  <label style={{cursor:'pointer',display:'block'}}>
                    <input type="file" accept="video/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0])setNewEx(p=>({...p,_videoFile:e.target.files![0]}))}}/>
                    <div style={{background:t.surfaceHigh,border:'2px dashed '+t.border,borderRadius:10,padding:'14px',fontSize:13,color:t.textMuted,textAlign:'center'}}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=t.teal+'60')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                      📹 Upload video file
                    </div>
                  </label>
                )}
              </div>

              {/* Name */}
              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Name *</div>
                <input value={newEx.name} onChange={e=>setNewEx(p=>({...p,name:e.target.value}))} placeholder="e.g. Barbell Back Squat" style={inp()}/>
              </div>

              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Pattern</div>
                  <select value={newEx.movement_pattern} onChange={e=>setNewEx(p=>({...p,movement_pattern:e.target.value}))} style={inp()}>
                    <option value="">— none —</option>{PATTERNS.map(o=><option key={o} style={{textTransform:'capitalize'}}>{o}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Difficulty</div>
                  <select value={newEx.difficulty} onChange={e=>setNewEx(p=>({...p,difficulty:e.target.value}))} style={inp()}>{DIFFICULTY.map(o=><option key={o}>{o}</option>)}</select>
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Equipment</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {EQUIPMENT.map(eq=><button key={eq} onClick={()=>setNewEx(p=>({...p,equipment_list:p.equipment_list.includes(eq)?p.equipment_list.filter(x=>x!==eq):[...p.equipment_list,eq]}))}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+(newEx.equipment_list.includes(eq)?t.orange+'60':t.border),background:newEx.equipment_list.includes(eq)?t.orangeDim:'transparent',fontSize:11,fontWeight:700,color:newEx.equipment_list.includes(eq)?t.orange:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{eq}</button>)}
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.purple,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Modifiers</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {MODIFIERS.map(m=><button key={m} onClick={()=>setNewEx(p=>({...p,modifiers:p.modifiers.includes(m)?p.modifiers.filter(x=>x!==m):[...p.modifiers,m]}))}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+(newEx.modifiers.includes(m)?t.purple+'60':t.border),background:newEx.modifiers.includes(m)?t.purpleDim:'transparent',fontSize:11,fontWeight:700,color:newEx.modifiers.includes(m)?t.purple:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
                </div>
              </div>

              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <button onClick={()=>setNewEx(p=>({...p,is_timed:!p.is_timed}))}
                  style={{padding:'6px 16px',borderRadius:8,border:'1px solid '+(newEx.is_timed?t.teal+'60':t.border),background:newEx.is_timed?t.tealDim:'transparent',fontSize:11,fontWeight:700,color:newEx.is_timed?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  {newEx.is_timed ? 'Timed Exercise' : 'Rep-Based'}
                </button>
                {newEx.is_timed && (
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <div style={{fontSize:11,color:t.textMuted}}>Default</div>
                    <input type="number" value={newEx.default_duration_seconds} onChange={e=>setNewEx(p=>({...p,default_duration_seconds:+e.target.value}))}
                      style={{...inp(),width:70}} min={5} max={600} step={5}/>
                    <div style={{fontSize:11,color:t.textMuted}}>sec</div>
                  </div>
                )}
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Primary Muscles</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {MUSCLES.map(m=><button key={m} onClick={()=>setNewEx(p=>({...p,muscles:p.muscles.includes(m)?p.muscles.filter(x=>x!==m):[...p.muscles,m]}))}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+(newEx.muscles.includes(m)?t.teal+'60':t.border),background:newEx.muscles.includes(m)?t.tealDim:'transparent',fontSize:11,fontWeight:700,color:newEx.muscles.includes(m)?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:6}}>Secondary Muscles</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:5}}>
                  {MUSCLES.map(m=><button key={m} onClick={()=>setNewEx(p=>({...p,secondary_muscles:p.secondary_muscles.includes(m)?p.secondary_muscles.filter(x=>x!==m):[...p.secondary_muscles,m]}))}
                    style={{padding:'4px 10px',borderRadius:6,border:'1px solid '+(newEx.secondary_muscles.includes(m)?t.border:t.border),background:newEx.secondary_muscles.includes(m)?t.surfaceHigh:'transparent',fontSize:11,color:newEx.secondary_muscles.includes(m)?t.textDim:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
                </div>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Description</div>
                <textarea value={newEx.description} onChange={e=>setNewEx(p=>({...p,description:e.target.value}))} rows={2} placeholder="Brief description of the exercise..." style={{...inp(),resize:'none' as any,lineHeight:1.6}}/>
              </div>

              <div>
                <div style={{fontSize:11,fontWeight:700,color:t.orange,textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:5}}>Coaching Cues</div>
                <textarea value={newEx.cues} onChange={e=>setNewEx(p=>({...p,cues:e.target.value}))} rows={2} placeholder="Key technique points clients see during workouts..." style={{...inp(),resize:'none' as any,lineHeight:1.6}}/>
              </div>

              <button onClick={saveNew} disabled={!newEx.name.trim()||saving}
                style={{width:'100%',padding:'12px',borderRadius:12,border:'none',background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,color:'#000',fontSize:14,fontWeight:800,cursor:!newEx.name.trim()||saving?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:!newEx.name.trim()||saving?0.5:1}}>
                {saving?'Saving...':'+ Save Exercise'}
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}

// ── ExerciseCard ──────────────────────────────────────────────────────────
function ExerciseCard({ ex, isEditing, isUploading, onEdit, onSave, onUpload, onUploadFemale, onDelete, onDuplicate, saving, t }: any) {
  const [draft, setDraft] = useState<any>(null)
  const [playing, setPlaying] = useState(false)
  const [videoGender, setVideoGender] = useState<'male'|'female'>('male')

  const openEdit = () => {
    setDraft({
      name: ex.name || '',
      muscles: [...(ex.muscles||[])],
      secondary_muscles: [...(ex.secondary_muscles||[])],
      equipment_list: [...(ex.equipment_list || (ex.equipment ? [ex.equipment] : []))],
      difficulty: ex.difficulty || 'Intermediate',
      movement_pattern: ex.movement_pattern || '',
      modifiers: [...(ex.modifiers||[])],
      is_timed: ex.is_timed || false,
      default_duration_seconds: ex.default_duration_seconds || 30,
      tags: [...(ex.tags||[])],
      description: ex.description || '',
      cues: ex.cues || '',
      video_url: ex.video_url || '',
      _videoFile: null,
    })
    onEdit()
  }

  const cancel = () => { setDraft(null); onEdit() }

  const submit = () => {
    if (!draft?.name?.trim()) return
    onSave({
      name: draft.name.trim(),
      muscles: draft.muscles,
      secondary_muscles: draft.secondary_muscles,
      equipment_list: draft.equipment_list,
      difficulty: draft.difficulty,
      movement_pattern: draft.movement_pattern || null,
      modifiers: draft.modifiers,
      is_timed: draft.is_timed,
      default_duration_seconds: draft.is_timed ? (draft.default_duration_seconds || 30) : null,
      tags: draft.tags,
      description: draft.description || null,
      cues: draft.cues || null,
      video_url: draft._videoFile ? ex.video_url : (draft.video_url || null),
      _videoFile: draft._videoFile || null,
    })
    setDraft(null)
  }

  const inp2 = (o?: object): React.CSSProperties => ({
    width:'100%',background:t.surfaceHigh,border:'1px solid '+t.border,
    borderRadius:8,padding:'7px 10px',fontSize:12,color:t.text,
    outline:'none',fontFamily:"'DM Sans',sans-serif",
    boxSizing:'border-box',colorScheme:'dark' as any,...o
  })

  const hasDetail = ex.muscles?.length > 0 && ex.movement_pattern
  const needsWork = !ex.video_url || !hasDetail || !ex.cues

  return (
    <div style={{background:t.surface,border:'1px solid '+(isEditing?t.teal+'60':needsWork?t.border:t.border),borderRadius:14,overflow:'hidden',transition:'border-color .15s'}}>

      {/* Status strip */}
      <div style={{height:3,background:isEditing?t.teal:ex.video_url&&hasDetail&&ex.cues?t.green:`linear-gradient(90deg,${ex.video_url?t.green:t.red}40,${hasDetail?t.green:t.orange}40,${ex.cues?t.green:t.purple}40)`}}/>

      {/* Video area */}
      {!isEditing && (() => {
        const activeUrl = videoGender === 'female' && ex.video_url_female ? ex.video_url_female : ex.video_url
        const hasFemale = !!ex.video_url_female
        const hasMale   = !!ex.video_url
        return (
          <div style={{background:'#000',aspectRatio:'16/9',position:'relative',minHeight:140}}>
            {/* Gender toggle — top-left */}
            {(hasMale || hasFemale) && (
              <div style={{position:'absolute',top:6,left:6,zIndex:2,display:'flex',gap:4}}>
                <button onClick={e=>{e.stopPropagation();setVideoGender('male');setPlaying(false)}}
                  style={{background:videoGender==='male'?'rgba(0,201,177,0.85)':'rgba(0,0,0,0.55)',border:'none',borderRadius:5,padding:'3px 8px',fontSize:10,fontWeight:700,color:videoGender==='male'?'#000':'rgba(255,255,255,0.6)',cursor:'pointer'}}>
                  ♂ Male
                </button>
                <button onClick={e=>{e.stopPropagation();setVideoGender('female');setPlaying(false)}}
                  style={{background:videoGender==='female'?'rgba(244,114,182,0.85)':'rgba(0,0,0,0.55)',border:'none',borderRadius:5,padding:'3px 8px',fontSize:10,fontWeight:700,color:videoGender==='female'?'#000':'rgba(255,255,255,0.6)',cursor:'pointer'}}>
                  ♀ Female
                </button>
              </div>
            )}

            {/* Video or placeholder */}
            {activeUrl ? (
              <div style={{width:'100%',height:'100%',cursor:'pointer'}} onClick={()=>setPlaying(p=>!p)}>
                {playing ? (
                  <video src={activeUrl} autoPlay controls style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                ) : (
                  <>
                    <video src={activeUrl} preload="metadata" muted playsInline
                      onLoadedMetadata={e=>{(e.target as HTMLVideoElement).currentTime=0.1}}
                      style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
                    <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.25)'}}>
                      <div style={{width:44,height:44,borderRadius:'50%',background:'rgba(0,0,0,0.55)',border:'2px solid rgba(255,255,255,0.7)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>▶</div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              /* No video for this gender — show upload prompt */
              <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8}}>
                <label style={{cursor:'pointer'}} onClick={e=>e.stopPropagation()}>
                  <input type="file" accept="video/*" style={{display:'none'}}
                    onChange={e=>{ const f=e.target.files?.[0]; if(f) videoGender==='female'?onUploadFemale(f):onUpload(f); (e.target as HTMLInputElement).value='' }}/>
                  <div style={{background:'#1d1d2e',border:'1px dashed #252538',borderRadius:10,padding:'10px 18px',fontSize:12,color:'#5a5a78',cursor:'pointer',textAlign:'center' as const}}>
                    {isUploading?'Uploading...': videoGender==='female'?'📹 Upload female video':'📹 Upload video'}
                  </div>
                </label>
              </div>
            )}

            {/* Replace + add other gender — top-right */}
            <div style={{position:'absolute',top:6,right:6,zIndex:2,display:'flex',flexDirection:'column',gap:4,alignItems:'flex-end'}}>
              {activeUrl && !playing && (
                <label style={{cursor:'pointer'}} onClick={e=>e.stopPropagation()}>
                  <input type="file" accept="video/*" style={{display:'none'}}
                    onChange={e=>{ setPlaying(false); const f=e.target.files?.[0]; if(f) videoGender==='female'?onUploadFemale(f):onUpload(f); (e.target as HTMLInputElement).value='' }}/>
                  <span style={{background:'rgba(0,0,0,.6)',border:'1px solid rgba(255,255,255,.15)',borderRadius:6,padding:'3px 8px',fontSize:10,color:'rgba(255,255,255,.7)',cursor:'pointer',display:'block'}}>
                    {isUploading?'⏳':'↑ Replace'}
                  </span>
                </label>
              )}
              {/* Quick-add the missing gender's video */}
              {hasMale && !hasFemale && videoGender==='male' && (
                <label style={{cursor:'pointer'}} onClick={e=>e.stopPropagation()}>
                  <input type="file" accept="video/*" style={{display:'none'}}
                    onChange={e=>{ const f=e.target.files?.[0]; if(f) onUploadFemale(f); (e.target as HTMLInputElement).value='' }}/>
                  <span style={{background:'rgba(244,114,182,0.7)',border:'none',borderRadius:6,padding:'3px 8px',fontSize:10,color:'#000',fontWeight:700,cursor:'pointer',display:'block'}}>
                    + ♀ Add female
                  </span>
                </label>
              )}
            </div>
          </div>
        )
      })()}

      <div style={{padding:'12px 14px'}}>
        {!isEditing ? (
          // ── VIEW MODE ──
          <>
            <div style={{display:'flex',alignItems:'flex-start',gap:8,marginBottom:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:800,marginBottom:3}}>{ex.name}</div>
                <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                  {ex.movement_pattern && <span style={{background:t.orangeDim,borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700,color:t.orange,textTransform:'capitalize' as const}}>{ex.movement_pattern}</span>}
                  {ex.equipment && <span style={{background:t.surfaceHigh,borderRadius:5,padding:'2px 7px',fontSize:10,color:t.textMuted}}>{ex.equipment}</span>}
                  {ex.difficulty && <span style={{background:t.surfaceHigh,borderRadius:5,padding:'2px 7px',fontSize:10,color:t.textDim}}>{ex.difficulty}</span>}
                </div>
              </div>
              <div style={{display:'flex',gap:5,flexShrink:0}}>
                <button onClick={openEdit} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:7,padding:'4px 10px',fontSize:11,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Edit</button>
                <button onClick={onDuplicate} title="Duplicate" style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:7,padding:'4px 8px',fontSize:11,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>⧉</button>
                <button onClick={onDelete} style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:7,padding:'4px 8px',fontSize:11,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>🗑</button>
              </div>
            </div>
            {ex.muscles?.length > 0 && (
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4,marginBottom:5}}>
                {ex.muscles.map((m:string)=><span key={m} style={{background:t.tealDim,border:'1px solid '+t.teal+'20',borderRadius:5,padding:'2px 7px',fontSize:10,fontWeight:700,color:t.teal}}>{m}</span>)}
                {(ex.secondary_muscles||[]).map((m:string)=><span key={m} style={{background:t.surfaceHigh,borderRadius:5,padding:'2px 7px',fontSize:10,color:t.textDim}}>{m}</span>)}
              </div>
            )}
            {ex.cues && <div style={{fontSize:11,color:t.textMuted,lineHeight:1.5,fontStyle:'italic',marginTop:4}}>{ex.cues}</div>}
            {/* Gaps callout */}
            {needsWork && (
              <div style={{marginTop:8,display:'flex',gap:5,flexWrap:'wrap' as const}}>
                {!ex.video_url && <span style={{fontSize:10,color:t.red,background:t.redDim,borderRadius:5,padding:'2px 7px'}}>no video</span>}
                {!ex.muscles?.length && <span style={{fontSize:10,color:t.orange,background:t.orangeDim,borderRadius:5,padding:'2px 7px'}}>no muscles</span>}
                {!ex.movement_pattern && <span style={{fontSize:10,color:t.orange,background:t.orangeDim,borderRadius:5,padding:'2px 7px'}}>no pattern</span>}
                {!ex.cues && <span style={{fontSize:10,color:t.purple,background:t.purpleDim,borderRadius:5,padding:'2px 7px'}}>no cues</span>}
              </div>
            )}
          </>
        ) : draft && (
          // ── EDIT MODE ──
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            <div style={{fontSize:12,fontWeight:800,color:t.teal}}>Editing: {ex.name}</div>

            {/* Name */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.07em',marginBottom:4}}>Name</div>
              <input value={draft.name} onChange={e=>setDraft((p:any)=>({...p,name:e.target.value}))} style={inp2()}/>
            </div>

            {/* Equipment — multi-select chips */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Equipment</div>
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                {EQUIPMENT.map(eq=><button key={eq} onClick={()=>setDraft((p:any)=>({...p,equipment_list:p.equipment_list.includes(eq)?p.equipment_list.filter((x:string)=>x!==eq):[...p.equipment_list,eq]}))}
                  style={{padding:'3px 8px',borderRadius:5,border:'1px solid '+(draft.equipment_list.includes(eq)?t.orange+'60':t.border),background:draft.equipment_list.includes(eq)?t.orangeDim:'transparent',fontSize:10,fontWeight:700,color:draft.equipment_list.includes(eq)?t.orange:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{eq}</button>)}
              </div>
            </div>

            {/* Modifiers */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.purple,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Modifiers</div>
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                {MODIFIERS.map(m=><button key={m} onClick={()=>setDraft((p:any)=>({...p,modifiers:p.modifiers.includes(m)?p.modifiers.filter((x:string)=>x!==m):[...p.modifiers,m]}))}
                  style={{padding:'3px 8px',borderRadius:5,border:'1px solid '+(draft.modifiers.includes(m)?t.purple+'60':t.border),background:draft.modifiers.includes(m)?t.purpleDim:'transparent',fontSize:10,fontWeight:700,color:draft.modifiers.includes(m)?t.purple:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
              </div>
            </div>

            {/* Pattern / Difficulty / Timed */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:t.orange,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Pattern</div>
                <select value={draft.movement_pattern} onChange={e=>setDraft((p:any)=>({...p,movement_pattern:e.target.value}))} style={inp2()}>
                  <option value="">— none —</option>{PATTERNS.map(o=><option key={o} style={{textTransform:'capitalize'}}>{o}</option>)}
                </select>
              </div>
              <div>
                <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Difficulty</div>
                <select value={draft.difficulty} onChange={e=>setDraft((p:any)=>({...p,difficulty:e.target.value}))} style={inp2()}>{DIFFICULTY.map(o=><option key={o}>{o}</option>)}</select>
              </div>
            </div>

            {/* Timed toggle */}
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>setDraft((p:any)=>({...p,is_timed:!p.is_timed}))}
                style={{padding:'5px 14px',borderRadius:8,border:'1px solid '+(draft.is_timed?t.teal+'60':t.border),background:draft.is_timed?t.tealDim:'transparent',fontSize:11,fontWeight:700,color:draft.is_timed?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                {draft.is_timed ? '⏱ Timed' : '🔢 Rep-Based'}
              </button>
              {draft.is_timed && (
                <div style={{display:'flex',alignItems:'center',gap:6,flex:1}}>
                  <div style={{fontSize:10,fontWeight:700,color:t.textMuted,whiteSpace:'nowrap' as const}}>Default</div>
                  <input type="number" value={draft.default_duration_seconds} onChange={e=>setDraft((p:any)=>({...p,default_duration_seconds:+e.target.value}))}
                    style={{...inp2(),width:70}} min={5} max={600} step={5}/>
                  <div style={{fontSize:10,color:t.textMuted}}>sec</div>
                </div>
              )}
            </div>

            {/* Primary Muscles */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.teal,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Primary Muscles ★</div>
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                {MUSCLES.map(m=><button key={m} onClick={()=>setDraft((p:any)=>({...p,muscles:p.muscles.includes(m)?p.muscles.filter((x:string)=>x!==m):[...p.muscles,m]}))}
                  style={{padding:'3px 8px',borderRadius:5,border:'1px solid '+(draft.muscles.includes(m)?t.teal+'60':t.border),background:draft.muscles.includes(m)?t.tealDim:'transparent',fontSize:10,fontWeight:700,color:draft.muscles.includes(m)?t.teal:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
              </div>
            </div>

            {/* Secondary Muscles */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Secondary Muscles</div>
              <div style={{display:'flex',flexWrap:'wrap' as const,gap:4}}>
                {MUSCLES.map(m=><button key={m} onClick={()=>setDraft((p:any)=>({...p,secondary_muscles:p.secondary_muscles.includes(m)?p.secondary_muscles.filter((x:string)=>x!==m):[...p.secondary_muscles,m]}))}
                  style={{padding:'3px 8px',borderRadius:5,border:'1px solid '+(draft.secondary_muscles.includes(m)?t.border:t.border),background:draft.secondary_muscles.includes(m)?t.surfaceHigh:'transparent',fontSize:10,color:draft.secondary_muscles.includes(m)?t.textDim:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>{m}</button>)}
              </div>
            </div>

            {/* Description */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Description</div>
              <textarea value={draft.description} onChange={e=>setDraft((p:any)=>({...p,description:e.target.value}))} rows={2}
                placeholder="Brief description..." style={{...inp2(),resize:'none' as any,lineHeight:1.6}}/>
            </div>

            {/* Cues */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.orange,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:4}}>Coaching Cues ★</div>
              <textarea value={draft.cues} onChange={e=>setDraft((p:any)=>({...p,cues:e.target.value}))} rows={2}
                placeholder="Key cues clients see during workout..." style={{...inp2(),resize:'none' as any,lineHeight:1.6}}/>
            </div>

            {/* Video */}
            <div>
              <div style={{fontSize:10,fontWeight:700,color:t.textMuted,textTransform:'uppercase' as const,letterSpacing:'0.06em',marginBottom:5}}>Video</div>
              {draft._videoFile ? (
                <div style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:8,padding:'8px 12px',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,color:t.teal,flex:1}}>📹 {draft._videoFile.name}</span>
                  <button onClick={()=>setDraft((p:any)=>({...p,_videoFile:null}))} style={{background:'none',border:'none',color:t.red,cursor:'pointer'}}>✕</button>
                </div>
              ) : (
                <div style={{display:'flex',gap:8}}>
                  <input value={draft.video_url} onChange={e=>setDraft((p:any)=>({...p,video_url:e.target.value}))}
                    placeholder={ex.video_url?'Current Supabase URL (change to replace)':'Paste URL or upload...'}
                    style={{...inp2(),flex:1,fontSize:11}}/>
                  <label style={{cursor:'pointer',flexShrink:0}}>
                    <input type="file" accept="video/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0])setDraft((p:any)=>({...p,_videoFile:e.target.files![0]}))}}/>
                    <span style={{display:'inline-block',background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'8px 10px',fontSize:11,color:t.textMuted,cursor:'pointer'}}>📹 Upload</span>
                  </label>
                </div>
              )}
            </div>

            {/* Save/Cancel */}
            <div style={{display:'flex',gap:8,paddingTop:4}}>
              <button onClick={cancel} style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:9,padding:'9px',fontSize:12,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={submit} disabled={!draft.name?.trim()||saving}
                style={{flex:2,background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,border:'none',borderRadius:9,padding:'9px',fontSize:12,fontWeight:800,color:'#000',cursor:!draft.name?.trim()||saving?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:!draft.name?.trim()||saving?0.5:1}}>
                {saving?'Saving...':'✓ Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
