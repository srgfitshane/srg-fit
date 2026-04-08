'use client'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import { resolveSignedMediaUrl } from '@/lib/media'

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

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user){ router.push('/login'); return }
        const { data:clientData } = await supabase.from('clients').select('coach_id').eq('profile_id',user.id).single<{coach_id:string|null}>()
        if (!clientData?.coach_id){ setLoading(false); return }
        const [{ data:gs },{ data:is }] = await Promise.all([
          supabase.from('content_groups').select('id,name,color,icon,parent_id').eq('coach_id',clientData.coach_id).order('order_index'),
          supabase.from('content_items').select('id,group_id,title,description,content_type,difficulty,duration,estimated_duration,file_url,tags,workout_exercises').eq('coach_id',clientData.coach_id).order('created_at'),
        ])
        setGroups(gs||[])
        const resolved = await Promise.all((is||[]).map(async (item: any) => ({
          ...item,
          file_url: await resolveSignedMediaUrl(supabase, 'resources', item.file_url),
        })))
        setItems(resolved)
        // Default to first top-level category
        const first = (gs||[]).find(g=>!g.parent_id)
        if (first) setActiveParent(first.id)
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

            {/* Category tabs — horizontal scroll */}
            <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',marginBottom:16,marginLeft:-16,marginRight:-16,paddingLeft:16,paddingRight:16}}>
              <div style={{display:'flex',gap:8,width:'max-content'}}>
                {topLevelGroups.map(cat=>(
                  <button key={cat.id} onClick={()=>{setActiveParent(cat.id);setActiveGroup(null);setSearch('')}}
                    style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',borderRadius:20,border:'1px solid '+(activeParent===cat.id?cat.color+'60':t.border),background:activeParent===cat.id?cat.color+'18':'transparent',color:activeParent===cat.id?cat.color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,whiteSpace:'nowrap',flexShrink:0}}>
                    <span>{cat.icon||'📁'}</span>{cat.name}
                    <span style={{fontSize:10,opacity:0.7}}>({totalInCat(cat.id)})</span>
                  </button>
                ))}
              </div>
            </div>

            {activeParent && (
              <>
                {/* Subfolders for active category */}
                {subgroups(activeParent).length > 0 && (
                  <div style={{marginBottom:16}}>
                    <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',marginLeft:-16,marginRight:-16,paddingLeft:16,paddingRight:16}}>
                      <div style={{display:'flex',gap:8,width:'max-content'}}>
                        {/* General items in category */}
                        {itemsFor(activeParent).length > 0 && (
                          <button onClick={()=>setActiveGroup(activeParent)}
                            style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:20,border:'1px solid '+(activeGroup===activeParent?activeParentData?.color+'50':t.border),background:activeGroup===activeParent?activeParentData?.color+'15':'transparent',color:activeGroup===activeParent?activeParentData?.color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,whiteSpace:'nowrap',flexShrink:0}}>
                            📋 General
                          </button>
                        )}
                        {subgroups(activeParent).map(sub=>(
                          <button key={sub.id} onClick={()=>setActiveGroup(sub.id)}
                            style={{display:'flex',alignItems:'center',gap:5,padding:'6px 12px',borderRadius:20,border:'1px solid '+(activeGroup===sub.id?sub.color+'50':t.border),background:activeGroup===sub.id?sub.color+'15':'transparent',color:activeGroup===sub.id?sub.color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:600,whiteSpace:'nowrap',flexShrink:0}}>
                            {sub.icon||'📂'} {sub.name}
                            <span style={{fontSize:10,opacity:0.7}}>({itemsFor(sub.id).length})</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* No subfolder selected — show overview */}
                {!activeGroup && (
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
                    {subgroups(activeParent).map(sub=>(
                      <div key={sub.id} onClick={()=>setActiveGroup(sub.id)}
                        style={{background:t.surface,border:`1px solid ${sub.color}30`,borderRadius:12,padding:'14px 16px',cursor:'pointer'}}>
                        <div style={{fontSize:24,marginBottom:6}}>{sub.icon||'📂'}</div>
                        <div style={{fontSize:13,fontWeight:700,color:sub.color,marginBottom:2}}>{sub.name}</div>
                        <div style={{fontSize:11,color:t.textMuted}}>{itemsFor(sub.id).length} items</div>
                      </div>
                    ))}
                    {itemsFor(activeParent).length > 0 && (
                      <div onClick={()=>setActiveGroup(activeParent)}
                        style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'14px 16px',cursor:'pointer'}}>
                        <div style={{fontSize:24,marginBottom:6}}>📋</div>
                        <div style={{fontSize:13,fontWeight:700,color:t.textDim,marginBottom:2}}>General</div>
                        <div style={{fontSize:11,color:t.textMuted}}>{itemsFor(activeParent).length} items</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Items list */}
                {activeGroup && (
                  <>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                      <span style={{fontSize:18}}>{activeGroupData?.icon||activeParentData?.icon}</span>
                      <div style={{fontSize:14,fontWeight:700,flex:1}}>{activeGroupData?.name||activeParentData?.name}</div>
                      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                        style={{background:t.surface,border:'1px solid '+t.border,borderRadius:20,padding:'6px 14px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",width:140}}/>
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
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <ClientBottomNav />
    </>
  )
}
