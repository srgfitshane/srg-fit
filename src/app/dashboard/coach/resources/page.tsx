'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { resolveSignedMediaUrl } from '@/lib/media'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15', pink:'#f472b6',
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
const ICONS  = ['💪','🥗','🧠','🧘','🛠️','📚','⚡','🏆','🎯','❤️','🔥','🌱','🍳','🥑','🏃','💊']
const COLORS = ['#00c9b1','#f5a623','#8b5cf6','#22c55e','#f472b6','#60a5fa','#f87171','#fb923c']

type Group = {
  id: string; name: string; icon: string; color: string
  order_index: number; parent_id: string | null
}
type Item = {
  id: string; group_id: string | null; title: string
  description?: string | null; content_type: string
  file_url?: string | null; file_path?: string | null
  duration?: string | null; difficulty: string
  tags?: string[] | null; workout_exercises?: any[] | null
  estimated_duration?: string | null
}

export default function CoachResourcesPage() {
  const supabase = createClient()
  const router   = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [groups,      setGroups]      = useState<Group[]>([])
  const [items,       setItems]       = useState<Item[]>([])
  const [loading,     setLoading]     = useState(true)
  const [coachId,     setCoachId]     = useState('')
  // Navigation: null = top level, else a parent group id
  const [activeParent, setActiveParent] = useState<string|null>(null)
  const [activeGroup,  setActiveGroup]  = useState<string|null>(null)
  const [search,       setSearch]       = useState('')
  const [groupModal,   setGroupModal]   = useState<Partial<Group>|null>(null)
  const [itemModal,    setItemModal]    = useState<any|null>(null)
  const [saving,       setSaving]       = useState(false)
  const [uploading,    setUploading]    = useState(false)
  const [gForm, setGForm] = useState({ name:'', icon:'💪', color:'#00c9b1', parent_id: null as string|null })
  const [iForm, setIForm] = useState({ title:'', description:'', content_type:'pdf', file_url:'', duration:'', difficulty:'beginner', tags:'', workout_exercises:'', estimated_duration:'' })

  useEffect(()=>{ void load() },[])

  const load = async () => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user){ router.push('/login'); return }
    setCoachId(user.id)
    const [{ data:gs },{ data:is }] = await Promise.all([
      supabase.from('content_groups').select('*').eq('coach_id', user.id).order('order_index'),
      supabase.from('content_items').select('*').eq('coach_id', user.id).order('created_at'),
    ])
    const resolved = await Promise.all((is||[]).map(async (item:any) => ({
      ...item,
      file_path: item.file_url || null,
      file_url: await resolveSignedMediaUrl(supabase, 'resources', item.file_url),
    })))
    setGroups(gs||[])
    setItems(resolved)
    setLoading(false)
  }

  const topLevelGroups  = groups.filter(g => !g.parent_id)
  const subgroups = (parentId: string) => groups.filter(g => g.parent_id === parentId)
  const itemsFor  = (groupId: string) => items.filter(i => i.group_id === groupId)
  const totalItemsInCategory = (parentId: string) => {
    const subs = subgroups(parentId)
    return itemsFor(parentId).length + subs.reduce((n, s) => n + itemsFor(s.id).length, 0)
  }

  const saveGroup = async () => {
    if (!gForm.name.trim()) return
    setSaving(true)
    const payload = { name:gForm.name, icon:gForm.icon, color:gForm.color, parent_id: gForm.parent_id||null }
    if (groupModal?.id) {
      await supabase.from('content_groups').update(payload).eq('id', groupModal.id)
    } else {
      await supabase.from('content_groups').insert({ ...payload, coach_id:coachId, order_index: groups.length+1 })
    }
    await load(); setGroupModal(null); setSaving(false)
  }

  const deleteGroup = async (id: string) => {
    const hasKids = groups.some(g => g.parent_id === id)
    const msg = hasKids
      ? 'Delete this category and all its subfolders and items?'
      : 'Delete this folder and all its items?'
    if (!confirm(msg)) return
    // Cascade: delete subgroups' items first
    const kidIds = groups.filter(g => g.parent_id === id).map(g => g.id)
    if (kidIds.length) await supabase.from('content_items').delete().in('group_id', kidIds)
    await supabase.from('content_groups').delete().in('id', kidIds)
    await supabase.from('content_items').delete().eq('group_id', id)
    await supabase.from('content_groups').delete().eq('id', id)
    setActiveParent(null); setActiveGroup(null); await load()
  }

  const saveItem = async () => {
    if (!iForm.title.trim()) return
    setSaving(true)
    const tagArr = iForm.tags ? iForm.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : []
    const payload: any = {
      coach_id:coachId, group_id: itemModal?.group_id || activeGroup,
      title:iForm.title, description:iForm.description||null,
      content_type:iForm.content_type, duration:iForm.duration||null,
      difficulty:iForm.difficulty, tags:tagArr, file_url:iForm.file_url||null,
      estimated_duration:iForm.estimated_duration||null,
    }
    if (iForm.content_type === 'workout' && iForm.workout_exercises.trim()) {
      payload.workout_exercises = iForm.workout_exercises.split('\n').filter(Boolean).map((line:string,i:number)=>({
        order:i+1, name:line.split('-')[0]?.trim()||line.trim(),
        prescription: line.includes('-') ? line.split('-').slice(1).join('-').trim() : ''
      }))
    }
    if (itemModal?.id) await supabase.from('content_items').update(payload).eq('id', itemModal.id)
    else await supabase.from('content_items').insert(payload)
    await load(); setItemModal(null); setSaving(false)
  }

  const deleteItem = async (id: string) => {
    await supabase.from('content_items').delete().eq('id', id)
    await load()
  }

  const handleFileUpload = async (file: File) => {
    if (!file || !coachId) return
    setUploading(true)
    const path = `${coachId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`
    const { data, error } = await supabase.storage.from('resources').upload(path, file, { upsert:false })
    if (!error && data) setIForm(p => ({ ...p, file_url:path }))
    setUploading(false)
  }

  const openNewCategory = () => {
    setGForm({ name:'', icon:'📁', color:'#00c9b1', parent_id:null })
    setGroupModal({})
  }
  const openNewSubfolder = (parentId: string) => {
    setGForm({ name:'', icon:'📂', color: groups.find(g=>g.id===parentId)?.color||'#00c9b1', parent_id:parentId })
    setGroupModal({})
  }
  const openEditGroup = (g: Group) => {
    setGForm({ name:g.name, icon:g.icon||'📁', color:g.color||'#00c9b1', parent_id:g.parent_id })
    setGroupModal(g)
  }
  const openNewItem = (groupId: string) => {
    setIForm({ title:'',description:'',content_type:'pdf',file_url:'',duration:'',difficulty:'beginner',tags:'',workout_exercises:'',estimated_duration:'' })
    setItemModal({ group_id:groupId })
  }
  const openEditItem = (item: Item) => {
    setIForm({ title:item.title, description:item.description||'', content_type:item.content_type, file_url:item.file_path||'', duration:item.duration||'', difficulty:item.difficulty||'beginner', tags:(item.tags||[]).join(', '), workout_exercises: item.workout_exercises?.map((e:any)=>e.name+(e.prescription?' - '+e.prescription:'')).join('\n')||'', estimated_duration:item.estimated_duration||'' })
    setItemModal(item)
  }

  const inp: React.CSSProperties = { background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>

  // What's displayed in the main area
  const activeGroupData = activeGroup ? groups.find(g=>g.id===activeGroup) : null
  const activeParentData = activeParent ? groups.find(g=>g.id===activeParent) : null
  const displayItems = activeGroup
    ? itemsFor(activeGroup).filter(i => !search || i.title.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase()))
    : []

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .res-layout{display:grid;grid-template-columns:240px 1fr;gap:0;max-width:1300px;margin:0 auto;}
        @media(max-width:700px){.res-layout{grid-template-columns:1fr;}}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }}/>
          <div style={{ fontSize:14, fontWeight:700 }}>📚 Resource Library</div>
          <div style={{ flex:1 }}/>
          <button onClick={openNewCategory}
            style={{ background:t.teal, border:'none', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Category
          </button>
        </div>

        <div className="res-layout" style={{ padding:0 }}>

          {/* ── Sidebar ── */}
          <div style={{ background:t.surface, borderRight:'1px solid '+t.border, minHeight:'calc(100vh - 60px)', padding:'16px 12px' }}>
            {topLevelGroups.length === 0 && (
              <div style={{ padding:'40px 12px', textAlign:'center', color:t.textMuted, fontSize:12 }}>
                No categories yet.<br/>Create one to get started.
              </div>
            )}
            {topLevelGroups.map(cat => {
              const subs = subgroups(cat.id)
              const isOpen = activeParent === cat.id || activeGroup === cat.id
              return (
                <div key={cat.id} style={{ marginBottom:4 }}>
                  {/* Category row */}
                  <div
                    onClick={()=>{ setActiveParent(cat.id); setActiveGroup(null) }}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'9px 10px', borderRadius:10, cursor:'pointer',
                      background: (activeParent===cat.id && !activeGroup) ? cat.color+'18' : 'transparent',
                      border:'1px solid '+(activeParent===cat.id && !activeGroup ? cat.color+'40':'transparent') }}>
                    <span style={{ fontSize:16 }}>{cat.icon||'📁'}</span>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: activeParent===cat.id ? cat.color : t.text, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{cat.name}</div>
                      <div style={{ fontSize:10, color:t.textMuted }}>{totalItemsInCategory(cat.id)} items</div>
                    </div>
                    <span style={{ fontSize:10, color:t.textMuted, transform: isOpen?'rotate(90deg)':'rotate(0)', transition:'transform 0.15s' }}>▶</span>
                  </div>

                  {/* Subfolders */}
                  {isOpen && (
                    <div style={{ marginLeft:16, marginTop:2 }}>
                      {/* Items directly in category */}
                      {itemsFor(cat.id).length > 0 && (
                        <div
                          onClick={()=>{ setActiveParent(cat.id); setActiveGroup(cat.id) }}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:8, cursor:'pointer',
                            background: activeGroup===cat.id ? cat.color+'18':'transparent',
                            border:'1px solid '+(activeGroup===cat.id?cat.color+'30':'transparent') }}>
                          <span style={{ fontSize:12 }}>📋</span>
                          <span style={{ fontSize:12, fontWeight:600, color:activeGroup===cat.id?cat.color:t.textDim }}>General</span>
                          <span style={{ fontSize:10, color:t.textMuted, marginLeft:'auto' }}>{itemsFor(cat.id).length}</span>
                        </div>
                      )}
                      {subs.map(sub => (
                        <div key={sub.id}
                          onClick={()=>{ setActiveParent(cat.id); setActiveGroup(sub.id) }}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 10px', borderRadius:8, cursor:'pointer',
                            background: activeGroup===sub.id ? sub.color+'18':'transparent',
                            border:'1px solid '+(activeGroup===sub.id?sub.color+'30':'transparent') }}>
                          <span style={{ fontSize:12 }}>{sub.icon||'📂'}</span>
                          <span style={{ fontSize:12, fontWeight:600, color:activeGroup===sub.id?sub.color:t.textDim, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{sub.name}</span>
                          <span style={{ fontSize:10, color:t.textMuted }}>{itemsFor(sub.id).length}</span>
                        </div>
                      ))}
                      <button onClick={()=>openNewSubfolder(cat.id)}
                        style={{ width:'100%', textAlign:'left', padding:'6px 10px', background:'none', border:'1px dashed '+t.border, borderRadius:8, fontSize:11, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginTop:4 }}>
                        + Add subfolder
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* ── Main content ── */}
          <div style={{ padding:24 }}>
            {!activeParent ? (
              /* Landing — show all categories as cards */
              <div>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:16 }}>All Categories</div>
                {topLevelGroups.length === 0 ? (
                  <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'80px 20px', textAlign:'center' }}>
                    <div style={{ fontSize:44, marginBottom:16 }}>📚</div>
                    <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Build your Resource Library</div>
                    <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>Create categories like Recipes, Training, Recovery, then add subfolders within each.</div>
                    <button onClick={openNewCategory} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px 22px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Create First Category</button>
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12 }}>
                    {topLevelGroups.map(cat => (
                      <div key={cat.id} onClick={()=>{ setActiveParent(cat.id); setActiveGroup(null) }}
                        style={{ background:t.surface, border:`1px solid ${cat.color}30`, borderRadius:14, padding:20, cursor:'pointer' }}>
                        <div style={{ fontSize:32, marginBottom:8 }}>{cat.icon||'📁'}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:cat.color, marginBottom:4 }}>{cat.name}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{subgroups(cat.id).length} subfolders · {totalItemsInCategory(cat.id)} items</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : !activeGroup ? (
              /* Category overview — show subfolders */
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <span style={{ fontSize:28 }}>{activeParentData?.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:20, fontWeight:900 }}>{activeParentData?.name}</div>
                    <div style={{ fontSize:12, color:t.textMuted }}>{totalItemsInCategory(activeParent!)} total items</div>
                  </div>
                  <button onClick={()=>openEditGroup(activeParentData!)} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                  <button onClick={()=>deleteGroup(activeParent!)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'6px 12px', fontSize:11, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Delete</button>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:10, marginBottom:20 }}>
                  {subgroups(activeParent!).map(sub => (
                    <div key={sub.id} onClick={()=>setActiveGroup(sub.id)}
                      style={{ background:t.surface, border:`1px solid ${sub.color}30`, borderRadius:12, padding:16, cursor:'pointer' }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                        <span style={{ fontSize:22 }}>{sub.icon||'📂'}</span>
                        <div style={{ display:'flex', gap:4 }}>
                          <button onClick={e=>{e.stopPropagation();openEditGroup(sub)}} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12 }}>✎</button>
                          <button onClick={e=>{e.stopPropagation();deleteGroup(sub.id)}} style={{ background:'none', border:'none', color:t.red, cursor:'pointer', fontSize:12 }}>✕</button>
                        </div>
                      </div>
                      <div style={{ fontSize:13, fontWeight:700, color:sub.color }}>{sub.name}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{itemsFor(sub.id).length} items</div>
                    </div>
                  ))}
                  <div onClick={()=>openNewSubfolder(activeParent!)}
                    style={{ background:'transparent', border:`2px dashed ${t.border}`, borderRadius:12, padding:16, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:6, color:t.textMuted }}>
                    <span style={{ fontSize:22 }}>📂</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>+ New Subfolder</span>
                  </div>
                </div>
                {/* Items directly in category */}
                {itemsFor(activeParent!).length > 0 && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>General Items</div>
                    <ItemList items={itemsFor(activeParent!)} t={t} onEdit={openEditItem} onDelete={deleteItem} onAdd={()=>openNewItem(activeParent!)} />
                  </div>
                )}
                <button onClick={()=>openNewItem(activeParent!)}
                  style={{ marginTop:16, background:t.teal, border:'none', borderRadius:9, padding:'9px 18px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Add Item to {activeParentData?.name}
                </button>
              </div>
            ) : (
              /* Subfolder view — items */
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                  <button onClick={()=>setActiveGroup(null)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>← {activeParentData?.name}</button>
                  <span style={{ color:t.textMuted }}>/</span>
                  <span style={{ fontSize:13, fontWeight:700 }}>{activeGroupData?.name}</span>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                  <span style={{ fontSize:24 }}>{activeGroupData?.icon}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:18, fontWeight:800 }}>{activeGroupData?.name}</div>
                    <div style={{ fontSize:12, color:t.textMuted }}>{displayItems.length} items</div>
                  </div>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
                    style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:9, padding:'7px 12px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:180 }}/>
                  <button onClick={()=>openEditGroup(activeGroupData!)} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:11, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
                  <button onClick={()=>deleteGroup(activeGroup)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'7px 10px', fontSize:11, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Delete</button>
                  <button onClick={()=>openNewItem(activeGroup)}
                    style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Add Item
                  </button>
                </div>
                <ItemList items={displayItems} t={t} onEdit={openEditItem} onDelete={deleteItem} onAdd={()=>openNewItem(activeGroup)} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Group Modal */}
      {groupModal !== null && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }} onClick={()=>setGroupModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'100%', maxWidth:420 }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:20 }}>
              {groupModal?.id ? 'Edit' : gForm.parent_id ? 'New Subfolder' : 'New Category'}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Name *</label>
                <input value={gForm.name} onChange={e=>setGForm(p=>({...p,name:e.target.value}))} placeholder={gForm.parent_id ? 'e.g. Breakfast, Beginner...' : 'e.g. Recipes, Training...'} style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:8, textTransform:'uppercase' }}>Icon</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {ICONS.map(ic => (
                    <button key={ic} onClick={()=>setGForm(p=>({...p,icon:ic}))}
                      style={{ width:36, height:36, borderRadius:8, border:'2px solid '+(gForm.icon===ic?t.teal:t.border), background:gForm.icon===ic?t.tealDim:'transparent', fontSize:18, cursor:'pointer' }}>
                      {ic}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:8, textTransform:'uppercase' }}>Color</label>
                <div style={{ display:'flex', gap:8 }}>
                  {COLORS.map(c => (
                    <button key={c} onClick={()=>setGForm(p=>({...p,color:c}))}
                      style={{ width:28, height:28, borderRadius:'50%', background:c, border:'3px solid '+(gForm.color===c?'#fff':'transparent'), cursor:'pointer' }}/>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setGroupModal(null)} style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:9, padding:'10px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={saveGroup} disabled={saving||!gForm.name.trim()}
                style={{ flex:2, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'10px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving||!gForm.name.trim()?0.5:1 }}>
                {saving ? 'Saving...' : groupModal?.id ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Item Modal */}
      {itemModal !== null && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }} onClick={()=>setItemModal(null)}>
          <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontWeight:800, fontSize:16, marginBottom:20 }}>{itemModal?.id ? 'Edit Resource' : 'Add Resource'}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Title *</label>
                <input value={iForm.title} onChange={e=>setIForm(p=>({...p,title:e.target.value}))} placeholder="Resource title..." style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Description</label>
                <textarea value={iForm.description} onChange={e=>setIForm(p=>({...p,description:e.target.value}))} rows={3} placeholder="Brief description..." style={{...inp,resize:'vertical' as const}}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Type</label>
                  <select value={iForm.content_type} onChange={e=>setIForm(p=>({...p,content_type:e.target.value}))} style={inp}>
                    {Object.entries(TYPE_META).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Duration</label>
                  <input value={iForm.duration} onChange={e=>setIForm(p=>({...p,duration:e.target.value}))} placeholder="e.g. 5 min read" style={inp}/>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>File Upload or URL</label>
                <div onClick={()=>fileInputRef.current?.click()}
                  style={{ background:t.surfaceHigh, border:`2px dashed ${iForm.file_url?t.teal:t.border}`, borderRadius:10, padding:'12px 14px', marginBottom:8, cursor:'pointer', textAlign:'center' as const }}>
                  {uploading ? <div style={{ fontSize:12, color:t.teal }}>⏳ Uploading...</div>
                    : iForm.file_url ? <div style={{ fontSize:11, color:t.teal, fontWeight:700 }}>✓ File attached — click to replace</div>
                    : <div style={{ fontSize:12, color:t.textMuted }}>📎 Click to upload PDF, image, video (max 50MB)</div>}
                  <input ref={fileInputRef} type="file" style={{ display:'none' }} accept=".pdf,video/*,image/*"
                    onChange={e=>{ const f=e.target.files?.[0]; if(f) void handleFileUpload(f) }}/>
                </div>
                <input value={iForm.file_url} onChange={e=>setIForm(p=>({...p,file_url:e.target.value}))} placeholder="...or paste a URL (YouTube, Google Drive, etc.)" style={inp}/>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:5, textTransform:'uppercase' }}>Tags (comma separated)</label>
                <input value={iForm.tags} onChange={e=>setIForm(p=>({...p,tags:e.target.value}))} placeholder="protein, easy, 30 min" style={inp}/>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button onClick={()=>setItemModal(null)} style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:9, padding:'10px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
              <button onClick={saveItem} disabled={saving||!iForm.title.trim()}
                style={{ flex:2, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'10px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving||!iForm.title.trim()?0.5:1 }}>
                {saving ? 'Saving...' : itemModal?.id ? 'Save Changes' : 'Add Resource'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Shared item list component ────────────────────────────────────────────
function ItemList({ items, t, onEdit, onDelete, onAdd }: { items: Item[], t: any, onEdit:(i:Item)=>void, onDelete:(id:string)=>void, onAdd:()=>void }) {
  if (items.length === 0) return (
    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'48px 20px', textAlign:'center' }}>
      <div style={{ fontSize:32, marginBottom:10 }}>📭</div>
      <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No items yet</div>
      <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>Add your first resource to this folder</div>
      <button onClick={onAdd} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'9px 18px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add Resource</button>
    </div>
  )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {items.map(item => {
        const tm = TYPE_META[item.content_type] || TYPE_META.article
        return (
          <div key={item.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', display:'flex', gap:12, alignItems:'flex-start' }}>
            <div style={{ width:40, height:40, borderRadius:10, background:tm.color+'18', border:'1px solid '+tm.color+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
              {tm.icon}
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' as const }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{item.title}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:tm.color+'18', color:tm.color }}>{tm.label}</span>
                {item.duration && <span style={{ fontSize:10, color:t.textMuted, background:t.surfaceHigh, padding:'2px 7px', borderRadius:20 }}>⏱ {item.duration}</span>}
              </div>
              {item.description && <div style={{ fontSize:12, color:t.textDim, lineHeight:1.5, marginBottom:6 }}>{item.description}</div>}
              {(item.tags||[]).length > 0 && (
                <div style={{ display:'flex', flexWrap:'wrap' as const, gap:4 }}>
                  {(item.tags||[]).map((tag:string) => (
                    <span key={tag} style={{ fontSize:10, background:t.surfaceHigh, color:t.textMuted, padding:'2px 7px', borderRadius:20 }}>{tag}</span>
                  ))}
                </div>
              )}
              {item.file_url && (
                <a href={item.file_url} target="_blank" rel="noreferrer"
                  style={{ display:'inline-block', marginTop:8, fontSize:11, color:t.teal, fontWeight:700, textDecoration:'none' }}>
                  → Open Resource ↗
                </a>
              )}
            </div>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={()=>onEdit(item)} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Edit</button>
              <button onClick={()=>onDelete(item.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
