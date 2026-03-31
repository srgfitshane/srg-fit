'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  purple:'#8b5cf6', green:'#22c55e', pink:'#f472b6',
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

type ContentGroup = {
  id: string
  name: string
  color: string
  icon?: string | null
}

type WorkoutExercise = {
  name: string
  prescription?: string | null
}

type ContentItem = {
  id: string
  group_id: string | null
  title: string
  description?: string | null
  content_type: string
  difficulty?: string | null
  duration?: string | null
  estimated_duration?: string | null
  file_url?: string | null
  tags?: string[] | null
  workout_exercises?: WorkoutExercise[] | null
}

export default function ClientResourcesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router   = useRouter()
  const [groups,      setGroups]      = useState<ContentGroup[]>([])
  const [items,       setItems]       = useState<ContentItem[]>([])
  const [loading,     setLoading]     = useState(true)
  const [activeGroup, setActiveGroup] = useState<string|null>(null)
  const [search,      setSearch]      = useState('')
  const [typeFilter,  setTypeFilter]  = useState('all')
  const [coachId,     setCoachId]     = useState('')
  const [addingCal,   setAddingCal]   = useState<string|null>(null)
  const [calDone,     setCalDone]     = useState<Set<string>>(new Set())

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user){ router.push('/login'); return }
        const { data:clientData } = await supabase.from('clients').select('coach_id').eq('profile_id',user.id).single<{ coach_id: string | null }>()
        if (!clientData?.coach_id){ setLoading(false); return }
        setCoachId(clientData.coach_id)
        const [{ data:gs },{ data:is }] = await Promise.all([
          supabase.from('content_groups').select('id, name, color, icon').eq('coach_id',clientData.coach_id).order('order_index'),
          supabase.from('content_items').select('id, group_id, title, description, content_type, difficulty, duration, estimated_duration, file_url, tags, workout_exercises').eq('coach_id',clientData.coach_id).order('created_at'),
        ])
        setGroups(gs || [])
        setItems(is || [])
        setActiveGroup(gs?.[0]?.id || null)
        setLoading(false)
      })()
    }, 0)

    return () => clearTimeout(timer)
  }, [router, supabase])

  const addToCalendar = async (item: ContentItem) => {
    setAddingCal(item.id)
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user){ setAddingCal(null); return }
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(9, 0, 0, 0)
    const durationMin = parseInt(item.estimated_duration || item.duration || '60', 10) || 60
    const end = new Date(start.getTime() + durationMin * 60000)

    const desc = [
      item.description,
      item.workout_exercises?.length
        ? 'Exercises:\n' + item.workout_exercises.map((e: WorkoutExercise) => `• ${e.name}${e.prescription?' - '+e.prescription:''}`).join('\n')
        : null
    ].filter(Boolean).join('\n\n')

    await supabase.from('calendar_events').insert({
      coach_id: coachId,
      client_id: (await supabase.from('clients').select('id').eq('profile_id',user.id).single()).data?.id,
      title: `💪 ${item.title}`,
      description: desc,
      event_type: 'session',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      color: '#00c9b1',
    })
    setCalDone(prev => new Set([...prev, item.id]))
    setAddingCal(null)
  }

  const filteredItems = items.filter(i => {
    if (i.group_id !== activeGroup) return false
    if (typeFilter !== 'all' && i.content_type !== typeFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || (i.tags||[]).some((tag:string)=>tag.toLowerCase().includes(q))
  })

  const activeGroupData = groups.find(g=>g.id===activeGroup)
  const typesInGroup = [...new Set(items.filter(i=>i.group_id===activeGroup).map(i=>i.content_type))]

  if (loading) return (
    <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>
      Loading...
    </div>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text}}>

        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 20px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.push('/dashboard/client')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:700}}>📚 Resource Library</div>
        </div>

        {groups.length===0 ? (
          <div style={{maxWidth:500,margin:'80px auto',textAlign:'center',padding:24}}>
            <div style={{fontSize:44,marginBottom:16}}>📭</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>No resources yet</div>
            <div style={{fontSize:13,color:t.textMuted}}>Your coach will add guides, videos, and articles here.</div>
          </div>
        ) : (
          <div style={{maxWidth:700,margin:'0 auto',padding:24}}>
            <div style={{marginBottom:20}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search resources..."
                style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:11,padding:'10px 16px',fontSize:13,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}/>
            </div>

            {/* Group tabs */}
            <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:20}}>
              {groups.map(g=>(
                <button key={g.id} onClick={()=>{setActiveGroup(g.id);setTypeFilter('all');setSearch('')}}
                  style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:20,border:'1px solid '+(activeGroup===g.id?g.color+'60':t.border),background:activeGroup===g.id?g.color+'18':'transparent',color:activeGroup===g.id?g.color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}>
                  <span>{g.icon||'📁'}</span>{g.name}
                  <span style={{fontSize:10,opacity:0.7}}>({items.filter(i=>i.group_id===g.id).length})</span>
                </button>
              ))}
            </div>

            {/* Type filter */}
            {typesInGroup.length > 1 && (
              <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
                <button onClick={()=>setTypeFilter('all')}
                  style={{padding:'4px 12px',borderRadius:20,border:'1px solid '+(typeFilter==='all'?t.teal+'60':t.border),background:typeFilter==='all'?t.tealDim:'transparent',color:typeFilter==='all'?t.teal:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700}}>All</button>
                {typesInGroup.map(type=>{
                  const tm = TYPE_META[type]||TYPE_META.article
                  return (
                    <button key={type} onClick={()=>setTypeFilter(type)}
                      style={{padding:'4px 12px',borderRadius:20,border:'1px solid '+(typeFilter===type?tm.color+'60':t.border),background:typeFilter===type?tm.color+'18':'transparent',color:typeFilter===type?tm.color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700}}>
                      {tm.icon} {tm.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}>
              <span style={{fontSize:22}}>{activeGroupData?.icon}</span>
              <div style={{fontSize:16,fontWeight:800}}>{activeGroupData?.name}</div>
              <div style={{fontSize:12,color:t.textMuted,marginLeft:4}}>{filteredItems.length} resource{filteredItems.length!==1?'s':''}</div>
            </div>

            {filteredItems.length===0 ? (
              <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:'48px 20px',textAlign:'center',color:t.textMuted,fontSize:13}}>
                {search?`No results for "${search}"` : 'Nothing here yet.'}
              </div>
            ) : (
              <div style={{display:'grid',gap:12}}>
                {filteredItems.map(item=>{
                  const tm = TYPE_META[item.content_type]||TYPE_META.article
                  const dm = item.difficulty ? (DIFF_META[item.difficulty] || DIFF_META.beginner) : DIFF_META.beginner
                  const isWorkout = item.content_type === 'workout'
                  const done = calDone.has(item.id)
                  const itemTags = item.tags || []
                  const workoutExercises = item.workout_exercises || []
                  return (
                    <div key={item.id} style={{background:t.surface,border:'1px solid '+(isWorkout?t.teal+'30':t.border),borderRadius:14,overflow:'hidden'}}>
                      <div style={{padding:'16px 18px',display:'flex',gap:14,alignItems:'flex-start'}}>
                        <div style={{width:44,height:44,borderRadius:12,background:tm.color+'18',border:'1px solid '+tm.color+'30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                          {tm.icon}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap'}}>
                            <div style={{fontSize:14,fontWeight:700}}>{item.title}</div>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:tm.color+'18',color:tm.color}}>{tm.label}</span>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:dm.color+'18',color:dm.color}}>{dm.label}</span>
                            {(item.duration||item.estimated_duration) && <span style={{fontSize:10,color:t.textMuted,background:t.surfaceHigh,padding:'2px 7px',borderRadius:20}}>⏱ {item.estimated_duration||item.duration}</span>}
                          </div>
                          {item.description && <div style={{fontSize:12,color:t.textDim,lineHeight:1.5,marginBottom:6}}>{item.description}</div>}
                          {itemTags.length > 0 && (
                            <div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:8}}>
                              {itemTags.map((tag:string)=>(
                                <span key={tag} style={{fontSize:10,background:t.surfaceHigh,color:t.textMuted,padding:'2px 7px',borderRadius:20}}>{tag}</span>
                              ))}
                            </div>
                          )}
                          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                            {item.file_url && (
                              <a href={item.file_url} target="_blank" rel="noreferrer"
                                style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:t.teal,textDecoration:'none',background:t.tealDim,border:'1px solid '+t.teal+'30',padding:'5px 12px',borderRadius:8}}>
                                Open ↗
                              </a>
                            )}
                            {isWorkout && (
                              <button onClick={()=>addToCalendar(item)} disabled={addingCal===item.id||done}
                                style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:done?t.textMuted:t.teal,background:done?t.surfaceHigh:t.tealDim,border:'1px solid '+(done?t.border:t.teal+'30'),padding:'5px 12px',borderRadius:8,cursor:done?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                {addingCal===item.id?'Adding...':done?'✓ Added to Calendar':'📅 Add to My Day'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Workout exercises list */}
                      {isWorkout && workoutExercises.length > 0 && (
                        <div style={{borderTop:'1px solid '+t.border,background:t.surfaceUp,padding:'12px 18px'}}>
                          <div style={{fontSize:11,fontWeight:800,color:t.teal,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Exercises</div>
                          <div style={{display:'flex',flexDirection:'column',gap:5}}>
                            {workoutExercises.map((ex: WorkoutExercise, i:number) => (
                              <div key={i} style={{display:'flex',alignItems:'center',gap:10,fontSize:13}}>
                                <div style={{width:22,height:22,borderRadius:6,background:t.teal+'22',border:'1px solid '+t.teal+'30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:t.teal,flexShrink:0}}>{i+1}</div>
                                <span style={{fontWeight:600}}>{ex.name}</span>
                                {ex.prescription && <span style={{color:t.textMuted,fontSize:12}}>— {ex.prescription}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
      <ClientBottomNav />
    </>
  )
}
