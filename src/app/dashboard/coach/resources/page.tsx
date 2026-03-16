'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15', pink:'#f472b6',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const TYPE_META: Record<string,{icon:string,label:string,color:string}> = {
  article:{icon:'📄',label:'Article',  color:'#60a5fa'},
  video:  {icon:'▶️', label:'Video',   color:'#f87171'},
  pdf:    {icon:'📑',label:'PDF',      color:'#fb923c'},
  guide:  {icon:'📘',label:'Guide',    color:'#a78bfa'},
  link:   {icon:'🔗',label:'Link',     color:'#34d399'},
  workout:{icon:'💪',label:'Workout',  color:'#00c9b1'},
}
const DIFF_META: Record<string,{label:string,color:string}> = {
  beginner:    {label:'Beginner',    color:'#22c55e'},
  intermediate:{label:'Intermediate',color:'#f5a623'},
  advanced:    {label:'Advanced',    color:'#f87171'},
}
const ICONS  = ['💪','🥗','🧠','🧘','🛠️','📚','⚡','🏆','🎯','❤️','🔥','🌱']
const COLORS = ['#00c9b1','#f5a623','#8b5cf6','#22c55e','#f472b6','#60a5fa','#f87171','#fb923c']

export default function CoachResourcesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [groups,      setGroups]      = useState<any[]>([])
  const [items,       setItems]       = useState<any[]>([])
  const [loading,     setLoading]     = useState(true)
  const [coachId,     setCoachId]     = useState('')
  const [activeGroup, setActiveGroup] = useState<string|null>(null)
  const [search,      setSearch]      = useState('')
  const [groupModal,  setGroupModal]  = useState<any>(null)
  const [itemModal,   setItemModal]   = useState<any>(null)
  const [saving,      setSaving]      = useState(false)
  const [gForm, setGForm] = useState({name:'',icon:'💪',color:'#00c9b1'})
  const [iForm, setIForm] = useState({title:'',description:'',content_type:'article',file_url:'',duration:'',difficulty:'beginner',tags:'',workout_exercises:'',estimated_duration:''})
  const [workoutPickerOpen, setWorkoutPickerOpen] = useState(false)
  const [pickerSessions, setPickerSessions] = useState<any[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  useEffect(()=>{load()},[])

  const load = async () => {
    const {data:{user}} = await supabase.auth.getUser()
    if (!user){router.push('/login');return}
    setCoachId(user.id)
    const [{data:gs},{data:is}] = await Promise.all([
      supabase.from('content_groups').select('*').eq('coach_id',user.id).order('order_index'),
      supabase.from('content_items').select('*').eq('coach_id',user.id).order('created_at'),
    ])
    setGroups(gs||[])
    setItems(is||[])
    setActiveGroup(ag => ag || gs?.[0]?.id || null)
    setLoading(false)
  }

  const saveGroup = async () => {
    if (!gForm.name.trim()) return
    setSaving(true)
    if (groupModal?.id) {
      await supabase.from('content_groups').update({name:gForm.name,icon:gForm.icon,color:gForm.color}).eq('id',groupModal.id)
    } else {
      await supabase.from('content_groups').insert({coach_id:coachId,name:gForm.name,icon:gForm.icon,color:gForm.color,order_index:groups.length+1})
    }
    await load(); setGroupModal(null); setSaving(false)
  }

  const deleteGroup = async (id:string) => {
    if (!confirm('Delete this group and all its items?')) return
    await supabase.from('content_items').delete().eq('group_id',id)
    await supabase.from('content_groups').delete().eq('id',id)
    setActiveGroup(null); await load()
  }

  const saveItem = async () => {
    if (!iForm.title.trim()) return
    setSaving(true)
    const tagArr = iForm.tags ? iForm.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : []
    const payload:any = {
      coach_id:coachId, group_id:itemModal?.group_id||activeGroup,
      title:iForm.title, description:iForm.description||null,
      content_type:iForm.content_type, duration:iForm.duration||null,
      difficulty:iForm.difficulty, tags:tagArr,
      file_url:iForm.file_url||null,
      estimated_duration:iForm.estimated_duration||null,
    }
    // Parse workout exercises from textarea (one per line: "Exercise - sets x reps")
    if (iForm.content_type === 'workout' && iForm.workout_exercises.trim()) {
      const lines = iForm.workout_exercises.split('\n').filter(Boolean).map((line:string,i:number) => ({
        order: i+1, name: line.split('-')[0]?.trim()||line.trim(),
        prescription: line.includes('-') ? line.split('-').slice(1).join('-').trim() : ''
      }))
      payload.workout_exercises = lines
    }
    if (itemModal?.id) {
      await supabase.from('content_items').update(payload).eq('id',itemModal.id)
    } else {
      await supabase.from('content_items').insert(payload)
    }
    await load(); setItemModal(null); setSaving(false)
  }

  const deleteItem = async (id:string) => {
    await supabase.from('content_items').delete().eq('id',id)
    await load()
  }

  const openNewGroup = () => { setGForm({name:'',icon:'💪',color:'#00c9b1'}); setGroupModal({}) }
  const openEditGroup = (g:any) => { setGForm({name:g.name,icon:g.icon||'💪',color:g.color||'#00c9b1'}); setGroupModal(g) }
  const openWorkoutPicker = async () => {
    setWorkoutPickerOpen(true)
    setPickerLoading(true)
    // Load distinct workout sessions (unique titles) to use as templates
    const { data: sessions } = await supabase
      .from('workout_sessions')
      .select('id, title, day_label, notes_coach')
      .eq('coach_id', coachId)
      .order('created_at', { ascending: false })
      .limit(60)
    setPickerSessions(sessions || [])
    setPickerLoading(false)
  }

  const importFromSession = async (session: any) => {
    // Load the session's exercises
    const { data: exs } = await supabase
      .from('session_exercises')
      .select('exercise_name, sets_prescribed, reps_prescribed, weight_prescribed, order_index')
      .eq('session_id', session.id)
      .order('order_index')
    const exerciseLines = (exs || [])
      .map((e:any) => `${e.exercise_name}${(e.sets_prescribed||e.reps_prescribed) ? ' - '+(e.sets_prescribed||'')+'x'+(e.reps_prescribed||'') : ''}${e.weight_prescribed?' @ '+e.weight_prescribed:''}`)
      .join('\n')
    setIForm(p => ({
      ...p,
      title: session.title || p.title,
      description: session.notes_coach || p.description,
      content_type: 'workout',
      workout_exercises: exerciseLines,
    }))
    setWorkoutPickerOpen(false)
  }

  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File) => {
    if (!file || !coachId) return
    setUploading(true)
    const ext = file.name.split('.').pop()
    const path = `${coachId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { data, error } = await supabase.storage.from('resources').upload(path, file, { upsert: false })
    if (!error && data) {
      const { data: urlData } = supabase.storage.from('resources').getPublicUrl(path)
      setIForm(p => ({ ...p, file_url: urlData.publicUrl }))
    }
    setUploading(false)
  }
  const openNewItem   = () => { setIForm({title:'',description:'',content_type:'article',file_url:'',duration:'',difficulty:'beginner',tags:'',workout_exercises:'',estimated_duration:''}); setItemModal({group_id:activeGroup}) }
  const openEditItem  = (item:any) => {
    setIForm({title:item.title,description:item.description||'',content_type:item.content_type,file_url:item.file_url||'',duration:item.duration||'',difficulty:item.difficulty||'beginner',tags:(item.tags||[]).join(', '),workout_exercises:item.workout_exercises?item.workout_exercises.map((e:any)=>e.name+(e.prescription?' - '+e.prescription:'')).join('\n'):'',estimated_duration:item.estimated_duration||''})
    setItemModal(item)
  }

  const activeItems = items.filter(i => {
    if (i.group_id !== activeGroup) return false
    if (!search) return true
    const q = search.toLowerCase()
    return i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || (i.tags||[]).some((t:string)=>t.toLowerCase().includes(q))
  })

  const inp = {background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none' as const,fontFamily:"'DM Sans',sans-serif",width:'100%',boxSizing:'border-box' as const}
  const activeGroupData = groups.find(g=>g.id===activeGroup)

  if (loading) return <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>Loading...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .resources-grid{display:grid;grid-template-columns:220px 1fr;gap:20px;max-width:1200px;margin:0 auto;padding:24px;}
        @media(max-width:700px){.resources-grid{grid-template-columns:1fr;padding:14px;}}
      `}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 24px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:700}}>📚 Resource Library</div>
          <div style={{flex:1}}/>
          <button onClick={openNewGroup}
            style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:9,padding:'7px 14px',fontSize:12,fontWeight:700,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginRight:8}}>
            + Group
          </button>
          <button onClick={openNewItem} disabled={!activeGroup}
            style={{background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',border:'none',borderRadius:9,padding:'8px 16px',fontSize:12,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:activeGroup?1:0.4}}>
            + Add Resource
          </button>
        </div>

        <div className="resources-grid">

          {/* Sidebar — Groups */}
          <div>
            <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Collections</div>
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              {groups.map(g=>(
                <div key={g.id} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 12px',borderRadius:10,cursor:'pointer',background:activeGroup===g.id?g.color+'18':t.surface,border:'1px solid '+(activeGroup===g.id?g.color+'40':t.border)}}
                  onClick={()=>setActiveGroup(g.id)}>
                  <span style={{fontSize:16}}>{g.icon||'📁'}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:activeGroup===g.id?700:500,color:activeGroup===g.id?g.color:t.text,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.name}</div>
                    <div style={{fontSize:10,color:t.textMuted}}>{items.filter(i=>i.group_id===g.id).length} items</div>
                  </div>
                  <button onClick={e=>{e.stopPropagation();openEditGroup(g)}} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:12,padding:'2px 4px',opacity:0.6}}>✎</button>
                </div>
              ))}
              {groups.length===0 && (
                <div style={{padding:'20px 12px',textAlign:'center',color:t.textMuted,fontSize:12}}>No groups yet.<br/>Create one to get started.</div>
              )}
            </div>
          </div>

          {/* Main content */}
          <div>
            {activeGroup && (
              <>
                {/* Group header */}
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:24}}>{activeGroupData?.icon}</span>
                    <div>
                      <div style={{fontSize:18,fontWeight:800}}>{activeGroupData?.name}</div>
                      <div style={{fontSize:12,color:t.textMuted}}>{activeItems.length} resource{activeItems.length!==1?'s':''}</div>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:8}}>
                    <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resources..."
                      style={{background:t.surface,border:'1px solid '+t.border,borderRadius:9,padding:'7px 12px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",width:200}}/>
                    <button onClick={()=>openEditGroup(activeGroupData)}
                      style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'7px 10px',fontSize:11,fontWeight:700,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                      Edit Group
                    </button>
                    <button onClick={()=>deleteGroup(activeGroup)}
                      style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:8,padding:'7px 10px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Items grid */}
                {activeItems.length===0 ? (
                  <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:16,padding:'60px 20px',textAlign:'center'}}>
                    <div style={{fontSize:36,marginBottom:12}}>📭</div>
                    <div style={{fontSize:14,fontWeight:700,marginBottom:6}}>{search?'No results found':'No resources yet'}</div>
                    <div style={{fontSize:12,color:t.textMuted,marginBottom:16}}>{search?'Try a different search term':'Add your first resource to this collection'}</div>
                    {!search && <button onClick={openNewItem} style={{background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',border:'none',borderRadius:9,padding:'9px 18px',fontSize:12,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>+ Add Resource</button>}
                  </div>
                ) : (
                  <div style={{display:'grid',gap:10}}>
                    {activeItems.map(item=>{
                      const tm = TYPE_META[item.content_type]||TYPE_META.article
                      const dm = DIFF_META[item.difficulty]||DIFF_META.beginner
                      return (
                        <div key={item.id} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:'16px 18px',display:'flex',gap:14,alignItems:'flex-start'}}>
                          <div style={{width:40,height:40,borderRadius:10,background:tm.color+'18',border:'1px solid '+tm.color+'30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                            {tm.icon}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4,flexWrap:'wrap'}}>
                              <div style={{fontSize:14,fontWeight:700}}>{item.title}</div>
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:tm.color+'18',color:tm.color}}>{tm.label}</span>
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:20,background:dm.color+'18',color:dm.color}}>{dm.label}</span>
                              {item.duration && <span style={{fontSize:10,color:t.textMuted,background:t.surfaceHigh,padding:'2px 7px',borderRadius:20}}>⏱ {item.duration}</span>}
                            </div>
                            {item.description && <div style={{fontSize:12,color:t.textDim,lineHeight:1.5,marginBottom:6}}>{item.description}</div>}
                            {item.tags?.length>0 && (
                              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                                {item.tags.map((tag:string)=>(
                                  <span key={tag} style={{fontSize:10,background:t.surfaceHigh,color:t.textMuted,padding:'2px 7px',borderRadius:20}}>{tag}</span>
                                ))}
                              </div>
                            )}
                            {item.file_url && (
                              <a href={item.file_url} target="_blank" rel="noreferrer"
                                style={{display:'inline-block',marginTop:8,fontSize:11,color:t.teal,fontWeight:700,textDecoration:'none'}}>
                                → Open Resource ↗
                              </a>
                            )}
                          </div>
                          <div style={{display:'flex',gap:6,flexShrink:0}}>
                            <button onClick={()=>openEditItem(item)}
                              style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:7,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                              Edit
                            </button>
                            <button onClick={()=>deleteItem(item.id)}
                              style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:7,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                              ✕
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
            {!activeGroup && groups.length===0 && (
              <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:16,padding:'80px 20px',textAlign:'center'}}>
                <div style={{fontSize:44,marginBottom:16}}>📚</div>
                <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>Build your Resource Library</div>
                <div style={{fontSize:13,color:t.textMuted,marginBottom:20,maxWidth:400,margin:'0 auto 20px'}}>Create collections of guides, videos, and articles to share with your clients.</div>
                <button onClick={openNewGroup} style={{background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',border:'none',borderRadius:10,padding:'11px 22px',fontSize:13,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>+ Create First Group</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group Modal */}
      {groupModal!==null && (
        <div style={{position:'fixed',inset:0,background:'#000000aa',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}} onClick={()=>setGroupModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:28,width:'100%',maxWidth:420}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:20}}>{groupModal?.id?'Edit Collection':'New Collection'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Name *</label>
                <input value={gForm.name} onChange={e=>setGForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Training Guides" style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:8,textTransform:'uppercase'}}>Icon</label>
                <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                  {ICONS.map(ic=>(
                    <button key={ic} onClick={()=>setGForm(p=>({...p,icon:ic}))}
                      style={{width:36,height:36,borderRadius:8,border:'2px solid '+(gForm.icon===ic?t.teal:t.border),background:gForm.icon===ic?t.tealDim:'transparent',fontSize:18,cursor:'pointer'}}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:8,textTransform:'uppercase'}}>Color</label>
                <div style={{display:'flex',gap:8}}>
                  {COLORS.map(c=>(
                    <button key={c} onClick={()=>setGForm(p=>({...p,color:c}))}
                      style={{width:28,height:28,borderRadius:'50%',background:c,border:'3px solid '+(gForm.color===c?'#fff':'transparent'),cursor:'pointer'}}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setGroupModal(null)} style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:9,padding:'10px',fontSize:13,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={saveGroup} disabled={saving||!gForm.name.trim()}
                style={{flex:2,background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',border:'none',borderRadius:9,padding:'10px',fontSize:13,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:saving||!gForm.name.trim()?0.5:1}}>
                {saving?'Saving...':groupModal?.id?'Save Changes':'Create Collection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {itemModal!==null && (
        <div style={{position:'fixed',inset:0,background:'#000000aa',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}} onClick={()=>setItemModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:28,width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{fontWeight:800,fontSize:16,marginBottom:20}}>{itemModal?.id?'Edit Resource':'Add Resource'}</div>
            <div style={{display:'flex',flexDirection:'column',gap:14}}>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Title *</label>
                <input value={iForm.title} onChange={e=>setIForm(p=>({...p,title:e.target.value}))} placeholder="Resource title..." style={inp}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Description</label>
                <textarea value={iForm.description} onChange={e=>setIForm(p=>({...p,description:e.target.value}))} rows={3} placeholder="Brief description..." style={{...inp,resize:'vertical' as const}}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Type</label>
                  <select value={iForm.content_type} onChange={e=>setIForm(p=>({...p,content_type:e.target.value}))} style={inp}>
                    {Object.entries(TYPE_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Difficulty</label>
                  <select value={iForm.difficulty} onChange={e=>setIForm(p=>({...p,difficulty:e.target.value}))} style={inp}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Duration / Length</label>
                  <input value={iForm.duration} onChange={e=>setIForm(p=>({...p,duration:e.target.value}))} placeholder="e.g. 5 min read" style={inp}/>
                </div>
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>File Upload or URL</label>
                  {/* Upload zone */}
                  <div
                    onClick={()=>fileInputRef.current?.click()}
                    style={{background:t.surfaceHigh,border:`2px dashed ${iForm.file_url?t.teal:t.border}`,borderRadius:10,padding:'12px 14px',marginBottom:8,cursor:'pointer',textAlign:'center',transition:'border-color .15s'}}>
                    {uploading ? (
                      <div style={{fontSize:12,color:t.teal}}>⏳ Uploading...</div>
                    ) : iForm.file_url ? (
                      <div style={{fontSize:11,color:t.teal,fontWeight:700}}>✓ File attached — click to replace</div>
                    ) : (
                      <div style={{fontSize:12,color:t.textMuted}}>📎 Click to upload PDF, video, image (max 50MB)</div>
                    )}
                    <input ref={fileInputRef} type="file" style={{display:'none'}}
                      accept=".pdf,video/*,image/*,audio/*"
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) handleFileUpload(f) }}/>
                  </div>
                  <input value={iForm.file_url} onChange={e=>setIForm(p=>({...p,file_url:e.target.value}))} placeholder="...or paste a URL (YouTube, Google Drive, etc.)" style={inp}/>
                </div>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Tags (comma separated)</label>
                <input value={iForm.tags} onChange={e=>setIForm(p=>({...p,tags:e.target.value}))} placeholder="strength, recovery, beginner" style={inp}/>
              </div>
              {iForm.content_type === 'workout' && (
                <>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Estimated Duration</label>
                    <input value={iForm.estimated_duration} onChange={e=>setIForm(p=>({...p,estimated_duration:e.target.value}))} placeholder="e.g. 45-60 min" style={inp}/>
                  </div>
                  <div>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:5}}>
                      <label style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase'}}>Exercises (one per line — Name - Sets x Reps)</label>
                      <button onClick={openWorkoutPicker} type="button"
                        style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:7,padding:'4px 10px',fontSize:11,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",whiteSpace:'nowrap'}}>
                        📋 Import from Builder
                      </button>
                    </div>
                    <textarea value={iForm.workout_exercises} onChange={e=>setIForm(p=>({...p,workout_exercises:e.target.value}))} rows={6}
                      placeholder={"Squat - 4 x 6-8\nRomanian Deadlift - 3 x 10\nLeg Press - 3 x 12\nLeg Curl - 3 x 12"}
                      style={{...inp,resize:'vertical' as const}}/>
                    <div style={{fontSize:10,color:t.textMuted,marginTop:4}}>Format: Exercise Name - Sets x Reps (e.g. "Squat - 4 x 6")</div>
                  </div>
                </>
              )}
            </div>
            <div style={{display:'flex',gap:10,marginTop:20}}>
              <button onClick={()=>setItemModal(null)} style={{flex:1,background:'transparent',border:'1px solid '+t.border,borderRadius:9,padding:'10px',fontSize:13,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
              <button onClick={saveItem} disabled={saving||!iForm.title.trim()}
                style={{flex:2,background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',border:'none',borderRadius:9,padding:'10px',fontSize:13,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:saving||!iForm.title.trim()?0.5:1}}>
                {saving?'Saving...':itemModal?.id?'Save Changes':'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Workout Picker Modal */}
      {workoutPickerOpen && (
        <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:110,padding:20}} onClick={()=>setWorkoutPickerOpen(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:28,width:'100%',maxWidth:520,maxHeight:'80vh',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div style={{fontSize:15,fontWeight:800}}>📋 Import from Workout Builder</div>
              <button onClick={()=>setWorkoutPickerOpen(false)} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:18}}>✕</button>
            </div>
            <div style={{fontSize:12,color:t.textMuted,marginBottom:16}}>
              Pick a session to import its exercises and title into the workout resource.
            </div>
            {pickerLoading ? (
              <div style={{textAlign:'center',padding:32,color:t.textMuted,fontSize:13}}>Loading sessions...</div>
            ) : pickerSessions.length === 0 ? (
              <div style={{textAlign:'center',padding:32,color:t.textMuted,fontSize:13}}>
                No workout sessions found.<br/>Build one in the Workout Builder first.
              </div>
            ) : (
              <div style={{overflowY:'auto',flex:1,display:'flex',flexDirection:'column',gap:6}}>
                {pickerSessions.map(s => (
                  <div key={s.id} onClick={()=>importFromSession(s)}
                    style={{background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:11,padding:'12px 14px',cursor:'pointer',transition:'all 0.15s'}}
                    onMouseEnter={e=>(e.currentTarget.style.border='1px solid '+t.teal+'60')}
                    onMouseLeave={e=>(e.currentTarget.style.border='1px solid '+t.border)}>
                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{s.title || 'Untitled Workout'}</div>
                    <div style={{fontSize:11,color:t.textMuted}}>
                      {s.day_label && <span>{s.day_label} · </span>}
                      Tap to import exercises
                    </div>
                    {s.notes_coach && <div style={{fontSize:11,color:t.teal,marginTop:4}}>📌 {s.notes_coach.slice(0,60)}{s.notes_coach.length>60?'...':''}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
