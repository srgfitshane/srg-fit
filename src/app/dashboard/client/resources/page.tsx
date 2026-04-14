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
  article:{icon:'📄',label:'Article',color:'#60a5fa'},
  video:  {icon:'▶️',label:'Video',  color:'#f87171'},
  pdf:    {icon:'📑',label:'PDF',    color:'#fb923c'},
  guide:  {icon:'📘',label:'Guide',  color:'#a78bfa'},
  link:   {icon:'🔗',label:'Link',   color:'#34d399'},
  workout:{icon:'💪',label:'Workout',color:'#00c9b1'},
}

type Group = { id:string; name:string; color:string; icon?:string|null; parent_id?:string|null }
type Item  = { id:string; group_id:string|null; title:string; description?:string|null; content_type:string; difficulty?:string|null; duration?:string|null; estimated_duration?:string|null; file_url?:string|null; tags?:string[]|null; workout_exercises?:any[]|null }

export default function ClientResourcesPage() {
  const supabase = useMemo(() => createClient(), [])
  const router   = useRouter()
  const [groups,       setGroups]       = useState<Group[]>([])
  const [items,        setItems]        = useState<Item[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeParent, setActiveParent] = useState<string|null>(null)
  const [activeGroup,  setActiveGroup]  = useState<string|null>(null)
  const [search,       setSearch]       = useState('')
  const [assignItem,   setAssignItem]   = useState<Item|null>(null)
  const [assignDate,   setAssignDate]   = useState('')
  const [assigning,    setAssigning]    = useState(false)
  const [assignDone,   setAssignDone]   = useState<Set<string>>(new Set())
  const [isCoach,      setIsCoach]      = useState(false)

  const localDateStr = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  const openAssign = (item: Item) => {
    setAssignItem(item)
    setAssignDate(localDateStr())
  }

  const confirmAssign = async () => {
    if (!assignItem || !assignDate) return
    setAssigning(true)
    const res = await fetch('/api/workouts/self-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ item_id: assignItem.id, scheduled_date: assignDate }),
    })
    setAssigning(false)
    if (res.ok) {
      setAssignDone(prev => new Set([...prev, assignItem.id + assignDate]))
      setAssignItem(null)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user){ router.push('/login'); return }
        const { data:clientData } = await supabase.from('clients').select('coach_id').eq('profile_id',user.id).single<{coach_id:string|null}>()
        if (!clientData?.coach_id){ setIsCoach(true); setLoading(false); return }
        const [{ data:gs },{ data:is }] = await Promise.all([
          supabase.from('content_groups').select('id,name,color,icon,parent_id').eq('coach_id',clientData.coach_id).order('order_index'),
          supabase.from('content_items').select('id,group_id,title,description,content_type,difficulty,duration,estimated_duration,file_url,tags,workout_exercises').eq('coach_id',clientData.coach_id).order('created_at'),
        ])
        setGroups(gs||[])
        // Bucket is public — getPublicUrl is synchronous, no network calls needed
        const resolved = (is||[]).map((item: any) => {
          if (!item.file_url) return item
          const { data } = supabase.storage.from('resources').getPublicUrl(item.file_url)
          return { ...item, file_url: data.publicUrl }
        })
        setItems(resolved)
        // Default to first top-level category
        const first = (gs||[]).find(g=>!g.parent_id)
        if (first) setActiveParent(null) // start on grid, not auto-selected
        setLoading(false)
      })()
    }, 0)
    return () => clearTimeout(timer)
  }, [router, supabase])

  const topLevelGroups = groups.filter(g => !g.parent_id)
  const subgroups = (parentId: string) => groups.filter(g => g.parent_id === parentId)
  const itemsFor  = (groupId: string) => items.filter(i => i.group_id === groupId)
  const totalInCat = (parentId: string) => {
    const subs = subgroups(parentId)
    return itemsFor(parentId).length + subs.reduce((n,s) => n + itemsFor(s.id).length, 0)
  }

  const displayItems = useMemo(() => {
    if (!activeGroup) return []
    return itemsFor(activeGroup).filter(i => {
      if (!search) return true
      const q = search.toLowerCase()
      return i.title.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q) || (i.tags||[]).some((tag:string)=>tag.toLowerCase().includes(q))
    })
  }, [activeGroup, items, search])

  const activeParentData = activeParent ? groups.find(g=>g.id===activeParent) : null
  const activeGroupData  = activeGroup  ? groups.find(g=>g.id===activeGroup)  : null

  if (loading) return (
    <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>Loading...</div>
  )

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text,paddingBottom:80}}>

        {/* Header */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 20px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.push('/dashboard/client')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:700}}>📚 Resources</div>
        </div>

        {groups.length === 0 ? (
          <div style={{maxWidth:500,margin:'80px auto',textAlign:'center',padding:24}}>
            <div style={{fontSize:44,marginBottom:16}}>📭</div>
            <div style={{fontSize:16,fontWeight:700,marginBottom:8}}>No resources yet</div>
            <div style={{fontSize:13,color:t.textMuted}}>Your coach will add guides, recipes, and more here.</div>
          </div>
        ) : (
          <div style={{maxWidth:680,margin:'0 auto',padding:'20px 16px'}}>

            {/* ── CATEGORY GRID (no selection) ── */}
            {!activeParent && (
              <>
                <div style={{fontSize:13,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Browse Categories</div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12}}>
                  {topLevelGroups.map(cat => {
                    const count = totalInCat(cat.id)
                    const color = cat.color || t.teal
                    return (
                      <div key={cat.id} onClick={()=>{setActiveParent(cat.id);setActiveGroup(null);setSearch('')}}
                        style={{background:t.surface,border:`1px solid ${color}30`,borderRadius:16,padding:'18px 16px',cursor:'pointer',position:'relative',overflow:'hidden'}}>
                        {/* color accent bar */}
                        <div style={{position:'absolute',top:0,left:0,right:0,height:3,background:`linear-gradient(90deg,${color},${color}88)`}}/>
                        <div style={{fontSize:32,marginBottom:10,lineHeight:1}}>{cat.icon||'📁'}</div>
                        <div style={{fontSize:14,fontWeight:800,marginBottom:3,color:t.text}}>{cat.name}</div>
                        <div style={{fontSize:12,color:t.textMuted}}>{count} item{count!==1?'s':''}</div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {activeParent && (
              <>
                {/* Back to categories */}
                <button onClick={()=>{setActiveParent(null);setActiveGroup(null);setSearch('')}}
                  style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:'0 0 16px 0',display:'flex',alignItems:'center',gap:4}}>
                  ← Categories
                </button>

                {/* Subfolders — small card grid */}
                {subgroups(activeParent).length > 0 && !activeGroup && (
                  <>
                    <div style={{fontSize:13,fontWeight:700,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>
                      {activeParentData?.icon} {activeParentData?.name}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:10,marginBottom:16}}>
                      {subgroups(activeParent).map(sub=>(
                        <div key={sub.id} onClick={()=>setActiveGroup(sub.id)}
                          style={{background:t.surface,border:`1px solid ${sub.color||t.border}30`,borderRadius:14,padding:'14px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:36,height:36,borderRadius:10,background:(sub.color||t.teal)+'18',border:`1px solid ${sub.color||t.teal}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                            {sub.icon||'📂'}
                          </div>
                          <div style={{minWidth:0}}>
                            <div style={{fontSize:13,fontWeight:700,color:sub.color||t.textDim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sub.name}</div>
                            <div style={{fontSize:11,color:t.textMuted}}>{itemsFor(sub.id).length} items</div>
                          </div>
                        </div>
                      ))}
                      {itemsFor(activeParent).length > 0 && (
                        <div onClick={()=>setActiveGroup(activeParent)}
                          style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'14px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:10}}>
                          <div style={{width:36,height:36,borderRadius:10,background:t.surfaceHigh,border:`1px solid ${t.border}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                            📋
                          </div>
                          <div>
                            <div style={{fontSize:13,fontWeight:700,color:t.textDim}}>General</div>
                            <div style={{fontSize:11,color:t.textMuted}}>{itemsFor(activeParent).length} items</div>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* If no subfolders, items render in the flat section below */}

                {/* Items list */}
                {activeGroup && (
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                      <button onClick={()=>setActiveGroup(null)} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif",padding:0,display:subgroups(activeParent).length===0?'none':'block'}}>
                        ←
                      </button>
                      <span style={{fontSize:18}}>{activeGroupData?.icon||activeParentData?.icon}</span>
                      <div style={{fontSize:14,fontWeight:700,flex:1}}>{activeGroupData?.name||activeParentData?.name}</div>
                      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                        style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:'6px 14px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",width:130}}/>
                    </div>
                    {displayItems.length === 0 ? (
                      <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:'48px 20px',textAlign:'center',color:t.textMuted,fontSize:13}}>
                        {search ? `No results for "${search}"` : 'Nothing here yet.'}
                      </div>
                    ) : (
                      <div style={{display:'grid',gap:12}}>
                        {displayItems.map(item=>{
                          const tm = TYPE_META[item.content_type]||TYPE_META.article
                          return (
                            <div key={item.id} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:'14px 16px',display:'flex',gap:12,alignItems:'flex-start'}}>
                              <div style={{width:42,height:42,borderRadius:11,background:tm.color+'18',border:'1px solid '+tm.color+'30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{tm.icon}</div>
                              <div style={{flex:1,minWidth:0}}>
                                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap' as const}}>
                                  <div style={{fontSize:14,fontWeight:700}}>{item.title}</div>
                                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:tm.color+'18',color:tm.color}}>{tm.label}</span>
                                  {(item.duration||item.estimated_duration) && <span style={{fontSize:10,color:t.textMuted,background:t.surfaceHigh,padding:'2px 7px',borderRadius:20}}>⏱ {item.estimated_duration||item.duration}</span>}
                                </div>
                                {item.description && <div style={{fontSize:12,color:t.textDim,lineHeight:1.5,marginBottom:6}}>{item.description}</div>}
                                {(item.tags||[]).length > 0 && (
                                  <div style={{display:'flex',flexWrap:'wrap' as const,gap:4,marginBottom:8}}>
                                    {(item.tags||[]).map((tag:string)=>(
                                      <span key={tag} style={{fontSize:10,background:t.surfaceHigh,color:t.textMuted,padding:'2px 7px',borderRadius:20}}>{tag}</span>
                                    ))}
                                  </div>
                                )}
                                {item.file_url && (
                                  <a href={item.file_url} target="_blank" rel="noreferrer"
                                    style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:t.teal,textDecoration:'none',background:t.tealDim,border:'1px solid '+t.teal+'30',padding:'5px 12px',borderRadius:8}}>
                                    Open ↗
                                  </a>
                                )}
                                {item.content_type === 'workout' && !isCoach && (
                                  <button onClick={()=>openAssign(item)}
                                    style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:'#000',background:t.teal,border:'none',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                    📅 Add to My Day
                                  </button>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}

                {/* No subfolders, no group set yet — auto-show items */}
                {!activeGroup && subgroups(activeParent).length === 0 && (
                  <div style={{display:'grid',gap:12}}>
                    {itemsFor(activeParent).map(item=>{
                      const tm = TYPE_META[item.content_type]||TYPE_META.article
                      return (
                        <div key={item.id} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:'14px 16px',display:'flex',gap:12,alignItems:'flex-start'}}>
                          <div style={{width:42,height:42,borderRadius:11,background:tm.color+'18',border:'1px solid '+tm.color+'30',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>{tm.icon}</div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4,flexWrap:'wrap' as const}}>
                              <div style={{fontSize:14,fontWeight:700}}>{item.title}</div>
                              <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:tm.color+'18',color:tm.color}}>{tm.label}</span>
                              {(item.duration||item.estimated_duration) && <span style={{fontSize:10,color:t.textMuted,background:t.surfaceHigh,padding:'2px 7px',borderRadius:20}}>⏱ {item.estimated_duration||item.duration}</span>}
                            </div>
                            {item.description && <div style={{fontSize:12,color:t.textDim,lineHeight:1.5,marginBottom:6}}>{item.description}</div>}
                            {item.file_url && (
                              <a href={item.file_url} target="_blank" rel="noreferrer"
                                style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:t.teal,textDecoration:'none',background:t.tealDim,border:'1px solid '+t.teal+'30',padding:'5px 12px',borderRadius:8}}>
                                Open ↗
                              </a>
                            )}
                            {item.content_type === 'workout' && !isCoach && (
                              <button onClick={()=>openAssign(item)}
                                style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:12,fontWeight:700,color:'#000',background:t.teal,border:'none',padding:'5px 12px',borderRadius:8,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                📅 Add to My Day
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
      {/* Assign workout modal */}
      {assignItem && (
        <div style={{position:'fixed',inset:0,background:'#000a',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}} onClick={()=>setAssignItem(null)}>
          <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:28,width:'100%',maxWidth:380}}>
            <div style={{fontWeight:800,fontSize:17,marginBottom:4}}>📅 Add to My Day</div>
            <div style={{fontSize:13,color:t.textMuted,marginBottom:20}}>{assignItem.title}</div>
            <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:6,textTransform:'uppercase' as const}}>Date</label>
            <input type="date" value={assignDate} onChange={e=>setAssignDate(e.target.value)}
              style={{width:'100%',background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'10px 12px',fontSize:14,color:t.text,colorScheme:'dark',boxSizing:'border-box' as const,fontFamily:"'DM Sans',sans-serif"}}/>
            <button onClick={confirmAssign} disabled={assigning||!assignDate}
              style={{marginTop:16,width:'100%',background:t.teal,border:'none',borderRadius:10,padding:'12px',fontWeight:800,fontSize:14,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:assigning?0.6:1}}>
              {assigning ? 'Adding...' : 'Add Workout'}
            </button>
          </div>
        </div>
      )}
      <ClientBottomNav />
    </>
  )
}
