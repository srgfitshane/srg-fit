'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  blue:"#38bdf8", blueDim:"#38bdf815", pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const WEEK_COLORS = [t.teal, t.orange, t.purple, t.green, t.yellow, t.pink, t.blue, t.red]
const GROUP_COLORS = [t.teal, t.orange, t.purple, t.green, t.yellow, t.pink, t.blue, t.red]

const ROLE_OPTIONS = ['main','secondary','accessory','variation','warmup','cooldown']
const ROLE_COLORS: Record<string,string> = {
  main: t.orange, secondary: t.teal, accessory: t.purple,
  variation: t.yellow, warmup: t.blue, cooldown: t.pink,
}
const ROLE_LABELS: Record<string,string> = {
  main:'Main', secondary:'Secondary', accessory:'Accessory',
  variation:'Variation', warmup:'Warm-up', cooldown:'Cool-down',
}

const GROUP_TYPES = [
  { value:'straight',  label:'Straight Sets',  icon:'▶' },
  { value:'superset',  label:'Superset',        icon:'⚡' },
  { value:'triset',    label:'Tri-Set',         icon:'🔺' },
  { value:'circuit',   label:'Circuit',         icon:'🔄' },
  { value:'amrap',     label:'AMRAP',           icon:'🔥' },
  { value:'emom',      label:'EMOM',            icon:'⏱' },
  { value:'cluster',   label:'Cluster Sets',    icon:'💥' },
  { value:'dropset',   label:'Drop Set',        icon:'📉' },
  { value:'contrast',  label:'Contrast/PAP',    icon:'⚖' },
]
const GROUP_TYPE_MAP: Record<string,{label:string,icon:string}> = Object.fromEntries(GROUP_TYPES.map(g=>[g.value,g]))

export default function ProgramBuilder() {
  const [program,    setProgram]    = useState<any>(null)
  const [blocks,     setBlocks]     = useState<any[]>([])
  const [exercises,  setExercises]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState<'builder'|'calendar'>('builder')
  const [activeWeek, setActiveWeek] = useState(1)
  const [editingEx,  setEditingEx]  = useState<string|null>(null)
  const [showAddEx,  setShowAddEx]  = useState<string|null>(null)
  const [exSearch,   setExSearch]   = useState('')
  const [saving,     setSaving]     = useState<string|null>(null)
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const programId = params.id as string

  useEffect(() => { load() }, [programId])

  const load = async () => {
    const { data: prog } = await supabase.from('programs').select(`*, client:clients(*, profile:profiles!clients_profile_id_fkey(full_name))`).eq('id', programId).single()
    // note: template_id self-join not supported in this select, fetch separately if needed
    setProgram(prog)
    const { data: blockData } = await supabase
      .from('workout_blocks').select(`*, block_exercises(*, exercise:exercises(name, muscles))`)
      .eq('program_id', programId).order('week_number').order('order_index')
    setBlocks(blockData || [])
    const { data: exData } = await supabase.from('exercises').select('*').order('name')
    setExercises(exData || [])
    setLoading(false)
  }

  const weeks = [...new Set(blocks.map(b => b.week_number))].sort((a,b)=>a-b)
  const totalWeeks = weeks.length || 1
  const blocksForWeek = (w: number) => blocks.filter(b => b.week_number === w).sort((a,b)=>a.order_index-b.order_index)

  const addWeek = async () => {
    const nextWeek = totalWeeks + 1
    const week1Blocks = blocksForWeek(1)
    if (week1Blocks.length > 0) {
      for (const b of week1Blocks) {
        const { data: nb } = await supabase.from('workout_blocks').insert({
          program_id: programId, name: b.name, day_label: b.day_label,
          block_label: b.block_label, week_number: nextWeek, order_index: b.order_index,
          group_types: b.group_types || {},
        }).select().single()
        if (nb) {
          for (const ex of (b.block_exercises || [])) {
            await supabase.from('block_exercises').insert({
              block_id: nb.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps,
              target_weight: ex.target_weight, rest_seconds: ex.rest_seconds, rpe: ex.rpe,
              tut: ex.tut, superset_group: ex.superset_group, exercise_role: ex.exercise_role,
              notes: ex.notes, order_index: ex.order_index, progression_note: ex.progression_note,
            })
          }
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        await supabase.from('workout_blocks').insert({
          program_id: programId, name: `Day ${['A','B','C'][i]}`,
          day_label: `Day ${['A','B','C'][i]}`, week_number: nextWeek, order_index: i,
        })
      }
    }
    await load(); setActiveWeek(nextWeek)
  }

  const addDay = async (weekNum: number) => {
    const existing = blocksForWeek(weekNum)
    const labels = ['A','B','C','D','E','F','G']
    const label = labels[existing.length] || `Day ${existing.length+1}`
    await supabase.from('workout_blocks').insert({
      program_id: programId, name: `Day ${label}`,
      day_label: `Day ${label}`, week_number: weekNum, order_index: existing.length,
    })
    await load()
  }

  const updateBlock = async (blockId: string, field: string, value: any) => {
    setSaving(blockId)
    const update: any = { [field]: value }
    if (field === 'day_label') update.name = value
    await supabase.from('workout_blocks').update(update).eq('id', blockId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...update } : b))
    setSaving(null)
  }

  // Update the group_types JSON on the block: { "A": "superset", "B": "circuit" }
  const updateGroupType = async (blockId: string, groupKey: string, typeValue: string) => {
    const block = blocks.find(b => b.id === blockId)
    const current = block?.group_types || {}
    const updated = { ...current, [groupKey]: typeValue }
    await supabase.from('workout_blocks').update({ group_types: updated }).eq('id', blockId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, group_types: updated } : b))
  }

  const deleteBlock = async (blockId: string) => {
    await supabase.from('block_exercises').delete().eq('block_id', blockId)
    await supabase.from('workout_blocks').delete().eq('id', blockId)
    setBlocks(prev => prev.filter(b => b.id !== blockId))
  }

  const addExercise = async (blockId: string, exerciseId: string) => {
    const block = blocks.find(b => b.id === blockId)
    const exCount = (block?.block_exercises || []).length
    const { data: newEx } = await supabase.from('block_exercises').insert({
      block_id: blockId, exercise_id: exerciseId,
      sets: 3, reps: '8-10', target_weight: '', rest_seconds: 90,
      rpe: '', tut: '', exercise_role: exCount === 0 ? 'main' : exCount === 1 ? 'secondary' : 'accessory',
      order_index: exCount,
    }).select(`*, exercise:exercises(name, muscles)`).single()
    if (newEx) setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, block_exercises: [...(b.block_exercises||[]), newEx] } : b))
    setShowAddEx(null); setExSearch(''); setEditingEx(newEx?.id || null)
  }

  const updateExercise = async (exId: string, field: string, value: any) => {
    await supabase.from('block_exercises').update({ [field]: value }).eq('id', exId)
    setBlocks(prev => prev.map(b => ({ ...b, block_exercises: (b.block_exercises||[]).map((e:any) => e.id === exId ? { ...e, [field]: value } : e) })))
  }

  const deleteExercise = async (blockId: string, exId: string) => {
    await supabase.from('block_exercises').delete().eq('id', exId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, block_exercises: (b.block_exercises||[]).filter((e:any) => e.id !== exId) } : b))
  }

  const filteredExercises = exercises.filter(e => e.name.toLowerCase().includes(exSearch.toLowerCase()))

  const getGroups = (exes: any[]) => {
    const groups: Record<string, any[]> = {}
    exes.sort((a,b)=>a.order_index-b.order_index).forEach((ex:any) => {
      const g = ex.superset_group?.trim() || '__none__'
      if (!groups[g]) groups[g] = []
      groups[g].push(ex)
    })
    return Object.entries(groups).sort(([a],[b]) => {
      if (a==='__none__') return 1; if (b==='__none__') return -1; return a.localeCompare(b)
    })
  }

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading program...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,textarea,select{color-scheme:dark;}
        .role-pill{display:inline-flex;align-items:center;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach/programs')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:14, fontWeight:800 }}>{program?.name || 'Program'}</div>
              {program?.is_template
                ? <span style={{ background:t.orange+'18', border:'1px solid '+t.orange+'40', borderRadius:5, padding:'2px 8px', fontSize:9, fontWeight:900, color:t.orange, letterSpacing:'0.08em' }}>TEMPLATE</span>
                : <span style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:5, padding:'2px 8px', fontSize:9, fontWeight:900, color:t.teal, letterSpacing:'0.08em' }}>CLIENT</span>
              }
            </div>
            {program?.client?.profile?.full_name && <div style={{ fontSize:11, color:t.textMuted }}>{program.client.profile.full_name}</div>}
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', background:t.surfaceHigh, borderRadius:10, padding:3, gap:2 }}>
            {(['builder','calendar'] as const).map(v => (
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 14px', borderRadius:8, border:'none', background:view===v?t.teal:'transparent', color:view===v?'#000':t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s ease' }}>
                {v==='builder'?'🔧 Builder':'📅 Calendar'}
              </button>
            ))}
          </div>
          <button onClick={addWeek} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Week</button>
        </div>

        {/* Week tabs */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', gap:6, overflowX:'auto', height:48 }}>
          {weeks.map((w,i) => (
            <button key={w} onClick={()=>setActiveWeek(w)}
              style={{ padding:'6px 16px', borderRadius:20, border:'1px solid '+(activeWeek===w?WEEK_COLORS[i%8]+'60':t.border), background:activeWeek===w?WEEK_COLORS[i%8]+'18':'transparent', color:activeWeek===w?WEEK_COLORS[i%8]:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', transition:'all 0.15s ease' }}>
              Week {w}
            </button>
          ))}
          {weeks.length === 0 && (
            <button onClick={addWeek} style={{ padding:'6px 16px', borderRadius:20, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add First Week</button>
          )}
        </div>

        {/* BUILDER VIEW */}
        {view === 'builder' && (
          <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>

              {blocksForWeek(activeWeek).map(block => {
                const exes = block.block_exercises || []
                const groupEntries = getGroups(exes)
                const namedGroups = groupEntries.filter(([k])=>k!=='__none__')
                const groupColorMap: Record<string,string> = {}
                namedGroups.forEach(([k],i) => { groupColorMap[k] = GROUP_COLORS[i % GROUP_COLORS.length] })
                const groupTypes: Record<string,string> = block.group_types || {}

                return (
                  <div key={block.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden' }}>

                    {/* Day header */}
                    <div style={{ background:t.surfaceUp, padding:'12px 16px', borderBottom:'1px solid '+t.border }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1 }}>
                          <input value={block.day_label || block.name}
                            onChange={e=>setBlocks(prev=>prev.map(b=>b.id===block.id?{...b,day_label:e.target.value,name:e.target.value}:b))}
                            onBlur={e=>updateBlock(block.id,'day_label',e.target.value)}
                            style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid transparent', fontSize:15, fontWeight:800, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                            onFocus={e=>e.target.style.borderBottomColor=t.teal+'60'}
                            onBlurCapture={e=>(e.target as HTMLInputElement).style.borderBottomColor='transparent'}
                          />
                          <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{exes.length} exercise{exes.length!==1?'s':''} · click to rename</div>
                        </div>
                        {saving===block.id && <span style={{ fontSize:10, color:t.teal }}>saving...</span>}
                        <button onClick={()=>deleteBlock(block.id)}
                          style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:7, padding:'4px 10px', fontSize:11, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                      </div>
                    </div>

                    {/* Exercise groups */}
                    <div style={{ padding:'12px 16px' }}>
                      {groupEntries.map(([groupKey, groupExes]) => {
                        const isNamed = groupKey !== '__none__'
                        const gc = groupColorMap[groupKey] || t.teal
                        const gType = groupTypes[groupKey] || 'straight'
                        const gTypeMeta = GROUP_TYPE_MAP[gType] || GROUP_TYPE_MAP['straight']

                        return (
                          <div key={groupKey} style={{ marginBottom: isNamed ? 16 : 8 }}>

                            {/* Group header with label + type selector */}
                            {isNamed && (
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                {/* Colored group label */}
                                <div style={{ background:gc+'18', border:'1px solid '+gc+'40', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:900, color:gc, letterSpacing:'0.08em', flexShrink:0 }}>
                                  {groupKey}
                                </div>
                                {/* Group type dropdown */}
                                <select
                                  value={gType}
                                  onChange={e => updateGroupType(block.id, groupKey, e.target.value)}
                                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:7, padding:'3px 8px', fontSize:11, fontWeight:700, color:t.textDim, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer', flex:1 }}>
                                  {GROUP_TYPES.map(gt => (
                                    <option key={gt.value} value={gt.value}>{gt.icon} {gt.label}</option>
                                  ))}
                                </select>
                                <div style={{ height:1, background:gc+'20', width:16, flexShrink:0 }} />
                              </div>
                            )}

                            {/* Exercises in group */}
                            <div style={{ paddingLeft: isNamed ? 10 : 0, borderLeft: isNamed ? '2px solid '+gc+'30' : 'none' }}>
                              {groupExes.map((ex:any) => {
                                const roleMeta = ROLE_COLORS[ex.exercise_role] || t.teal
                                return (
                                  <div key={ex.id} style={{ marginBottom: 10 }}>
                                    <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                                      {/* Role pill — always visible */}
                                      <div style={{ paddingTop:2, flexShrink:0 }}>
                                        <span className="role-pill" style={{ background:roleMeta+'18', border:'1px solid '+roleMeta+'40', color:roleMeta }}>
                                          {ROLE_LABELS[ex.exercise_role] || ex.exercise_role}
                                        </span>
                                      </div>
                                      <div style={{ flex:1, minWidth:0 }}>
                                        <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{ex.exercise?.name || 'Exercise'}</div>
                                        <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.6 }}>
                                          {ex.sets}×{ex.reps}
                                          {ex.target_weight ? <span style={{ color:t.text }}> @ {ex.target_weight}</span> : ''}
                                          {ex.rpe ? <span> · <span style={{ color:t.orange }}>RPE {ex.rpe}</span></span> : ''}
                                          {ex.tut ? <span> · TUT {ex.tut}</span> : ''}
                                          {ex.rest_seconds ? <span> · {ex.rest_seconds}s rest</span> : ''}
                                          {ex.progression_note ? <span style={{ color:t.green }}> · {ex.progression_note}</span> : ''}
                                        </div>
                                        {ex.notes && <div style={{ fontSize:10, color:t.textMuted, fontStyle:'italic', marginTop:2 }}>📝 {ex.notes}</div>}
                                      </div>
                                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                        <button onClick={()=>setEditingEx(editingEx===ex.id?null:ex.id)}
                                          style={{ background:t.surfaceHigh, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                          {editingEx===ex.id?'done':'edit'}
                                        </button>
                                        <button onClick={()=>deleteExercise(block.id, ex.id)}
                                          style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:12 }}>✕</button>
                                      </div>
                                    </div>

                                    {/* Inline editor */}
                                    {editingEx===ex.id && (
                                      <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'12px', marginTop:8 }}>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                          {([['Sets','sets','number'],['Reps','reps','text'],['Weight','target_weight','text']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                            <div key={fld}>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                              <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                          {([['RPE','rpe','text'],['TUT','tut','text'],['Rest (s)','rest_seconds','number']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                            <div key={fld}>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                              <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                            </div>
                                          ))}
                                        </div>
                                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                                          <div>
                                            <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Role</div>
                                            <select defaultValue={ex.exercise_role||'main'} onChange={e=>updateExercise(ex.id,'exercise_role',e.target.value)}
                                              style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                                              {ROLE_OPTIONS.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                            </select>
                                          </div>
                                          <div>
                                            <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Group (A1, B2…)</div>
                                            <input type="text" defaultValue={ex.superset_group||''} onBlur={e=>updateExercise(ex.id,'superset_group',e.target.value)}
                                              placeholder="e.g. A1, B2"
                                              style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                          </div>
                                        </div>
                                        <div style={{ marginBottom:8 }}>
                                          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Progression Note</div>
                                          <input type="text" defaultValue={ex.progression_note||''} onBlur={e=>updateExercise(ex.id,'progression_note',e.target.value)}
                                            placeholder="e.g. +2.5kg/week, add 1 rep/session"
                                            style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                        </div>
                                        <div>
                                          <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Coach Notes</div>
                                          <textarea defaultValue={ex.notes||''} onBlur={e=>updateExercise(ex.id,'notes',e.target.value)} rows={2}
                                            placeholder="Cues, technique reminders..."
                                            style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      <button onClick={()=>{ setShowAddEx(block.id); setExSearch('') }}
                        style={{ width:'100%', padding:'9px', borderRadius:10, border:'1px dashed '+t.teal+'40', background:t.tealDim, color:t.teal, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginTop:4 }}>
                        + Add Exercise
                      </button>
                    </div>
                  </div>
                )
              })}

              <button onClick={()=>addDay(activeWeek)}
                style={{ background:'transparent', border:'2px dashed '+t.border, borderRadius:18, padding:'32px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' as any, alignItems:'center', gap:8, minHeight:120 }}>
                <span style={{ fontSize:28 }}>+</span>Add Day
              </button>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view === 'calendar' && (
          <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px', overflowX:'auto' }}>
            <div style={{ minWidth:700 }}>
              <div style={{ display:'grid', gridTemplateColumns:'80px repeat('+Math.max(blocksForWeek(weeks[0]||1).length,1)+',1fr)', gap:8, marginBottom:8 }}>
                <div />
                {blocksForWeek(weeks[0]||1).map((b,i) => (
                  <div key={i} style={{ textAlign:'center', fontSize:12, fontWeight:800, color:t.textMuted, padding:'6px 0' }}>{b.day_label || b.name}</div>
                ))}
              </div>
              {weeks.map((w,wi) => (
                <div key={w} style={{ display:'grid', gridTemplateColumns:'80px repeat('+Math.max(blocksForWeek(w).length,1)+',1fr)', gap:8, marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ background:WEEK_COLORS[wi%8]+'18', border:'1px solid '+WEEK_COLORS[wi%8]+'40', borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800, color:WEEK_COLORS[wi%8] }}>W{w}</div>
                  </div>
                  {blocksForWeek(w).map(block => (
                    <div key={block.id} onClick={()=>{ setView('builder'); setActiveWeek(w) }}
                      style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'10px 12px', cursor:'pointer', minHeight:80 }}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=WEEK_COLORS[wi%8]+'60')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                      <div style={{ fontSize:11, fontWeight:800, color:WEEK_COLORS[wi%8], marginBottom:6 }}>{block.day_label || block.name}</div>
                      {(block.block_exercises||[]).slice(0,5).map((ex:any,i:number) => (
                        <div key={i} style={{ fontSize:10, color:t.textMuted, marginBottom:2, display:'flex', alignItems:'center', gap:4 }}>
                          {ex.superset_group && <span style={{ fontSize:9, fontWeight:800, color:t.orange }}>{ex.superset_group}</span>}
                          <span style={{ background:ROLE_COLORS[ex.exercise_role]+'18', color:ROLE_COLORS[ex.exercise_role], borderRadius:3, padding:'0 4px', fontSize:9, fontWeight:700 }}>{ex.exercise_role}</span>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ex.exercise?.name}</span>
                        </div>
                      ))}
                      {(block.block_exercises||[]).length > 5 && <div style={{ fontSize:10, color:t.textMuted }}>+{(block.block_exercises||[]).length-5} more</div>}
                      {(block.block_exercises||[]).length === 0 && <div style={{ fontSize:10, color:t.textMuted, fontStyle:'italic' }}>Empty</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Exercise Modal */}
        {showAddEx && (
          <div onClick={()=>setShowAddEx(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:480, padding:24, maxHeight:'80vh', display:'flex', flexDirection:'column' as any }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:800 }}>Add Exercise</div>
                <span onClick={()=>setShowAddEx(null)} style={{ cursor:'pointer', color:t.textMuted, fontSize:22 }}>×</span>
              </div>
              <input value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="Search exercises..." autoFocus
                style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", marginBottom:12 }} />
              <div style={{ overflowY:'auto', flex:1 }}>
                {filteredExercises.length === 0 && <div style={{ textAlign:'center', padding:'24px', color:t.textMuted, fontSize:13 }}>No exercises found. Visit 🏋️ Exercises to add some.</div>}
                {filteredExercises.map(ex => (
                  <div key={ex.id} onClick={()=>addExercise(showAddEx, ex.id)}
                    style={{ padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:4, display:'flex', alignItems:'center', gap:10 }}
                    onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{ex.name}</div>
                      {ex.muscles?.length > 0 && <div style={{ fontSize:11, color:t.textMuted }}>{ex.muscles.join(', ')}</div>}
                    </div>
                    <div style={{ fontSize:11, color:t.teal, fontWeight:700 }}>+ Add</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
