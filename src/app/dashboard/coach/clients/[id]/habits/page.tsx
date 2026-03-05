'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615", blue:"#38bdf8", blueDim:"#38bdf815",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const DEFAULT_HABITS = [
  { label:'Water Intake',    icon:'💧', habit_type:'number', target:64,   unit:'oz',    color:t.blue,   category:'nutrition' },
  { label:'Steps',           icon:'👟', habit_type:'number', target:8000, unit:'steps', color:t.green,  category:'movement'  },
  { label:'Sleep',           icon:'😴', habit_type:'number', target:8,    unit:'hrs',   color:t.purple, category:'recovery'  },
  { label:'Protein Goal',    icon:'🥩', habit_type:'number', target:150,  unit:'g',     color:t.orange, category:'nutrition' },
  { label:'Morning Workout', icon:'🌅', habit_type:'check',  target:1,    unit:'',      color:t.teal,   category:'movement'  },
  { label:'Meditation',      icon:'🧘', habit_type:'check',  target:1,    unit:'',      color:t.purple, category:'mindset'   },
  { label:'Vitamins/Meds',   icon:'💊', habit_type:'check',  target:1,    unit:'',      color:t.yellow, category:'health'    },
  { label:'Meal Prep Done',  icon:'🍱', habit_type:'check',  target:1,    unit:'',      color:t.orange, category:'nutrition' },
  { label:'No Alcohol',      icon:'🚫', habit_type:'check',  target:1,    unit:'',      color:t.red,    category:'health'    },
  { label:'Stretching',      icon:'🤸', habit_type:'check',  target:1,    unit:'',      color:t.green,  category:'recovery'  },
  { label:'Calories',        icon:'🔥', habit_type:'number', target:2000, unit:'kcal',  color:t.orange, category:'nutrition' },
  { label:'Breathing Work',  icon:'🫁', habit_type:'check',  target:1,    unit:'',      color:t.teal,   category:'mindset'   },
]

const CATEGORIES = ['all','movement','nutrition','recovery','mindset','health']

export default function HabitAssignment() {
  const [client,      setClient]      = useState<any>(null)
  const [existing,    setExisting]    = useState<any[]>([])
  const [selected,    setSelected]    = useState<Set<string>>(new Set())
  const [customized,  setCustomized]  = useState<Record<string,any>>({})
  const [category,    setCategory]    = useState('all')
  const [showCustom,  setShowCustom]  = useState<string|null>(null)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [showNew,     setShowNew]     = useState(false)
  const [newHabit,    setNewHabit]    = useState({ label:'', icon:'⭐', habit_type:'check', target:1, unit:'', color:t.teal })
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const clientId = params.id as string

  useEffect(() => {
    const load = async () => {
      const { data: clientData } = await supabase
        .from('clients')
        .select(`*, profile:profiles!clients_profile_id_fkey(full_name, email)`)
        .eq('id', clientId).single()
      setClient(clientData)

      const { data: existingHabits } = await supabase
        .from('habits')
        .select('*')
        .eq('client_id', clientId)
      setExisting(existingHabits || [])

      // Pre-select existing active habits
      const activeLabels = new Set((existingHabits||[]).filter((h:any)=>h.active).map((h:any)=>h.label))
      setSelected(activeLabels)
    }
    load()
  }, [clientId])


  const toggleHabit = (label: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  const getHabitConfig = (h: typeof DEFAULT_HABITS[0]) => ({
    ...h,
    ...(customized[h.label] || {}),
  })

  const handleSave = async () => {
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    // Deactivate all existing first
    if (existing.length > 0) {
      await supabase.from('habits').update({ active: false }).eq('client_id', clientId)
    }

    // Build list of habits to upsert
    const habitsToSave = [
      ...DEFAULT_HABITS.filter(h => selected.has(h.label)).map(h => {
        const cfg = getHabitConfig(h)
        const { category, ...rest } = cfg
        return rest
      }),
      ...existing.filter((h:any) => !DEFAULT_HABITS.find(d=>d.label===h.label) && selected.has(h.label)),
    ]

    for (const h of habitsToSave) {
      const existingMatch = existing.find((e:any) => e.label === h.label)
      if (existingMatch && !existingMatch.id.toString().startsWith('new-')) {
        await supabase.from('habits').update({ ...h, active: true, client_id: clientId, coach_id: user?.id }).eq('id', existingMatch.id)
      } else {
        await supabase.from('habits').insert({ ...h, active: true, client_id: clientId, coach_id: user?.id })
      }
    }

    // Reload existing
    const { data: refreshed } = await supabase.from('habits').select('*').eq('client_id', clientId)
    setExisting(refreshed || [])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleAddCustom = async () => {
    if (!newHabit.label) return
    setSelected(prev => new Set([...prev, newHabit.label]))
    setExisting(prev => [...prev, { ...newHabit, id: 'new-'+Date.now(), client_id: clientId, active: true }])
    setShowNew(false)
    setNewHabit({ label:'', icon:'⭐', habit_type:'check', target:1, unit:'', color:t.teal })
  }

  const filtered = category === 'all' ? DEFAULT_HABITS : DEFAULT_HABITS.filter(h => h.category === category)


  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach/clients/'+clientId)}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            ← Back
          </button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>Assign Habits</div>
          {client && <div style={{ fontSize:13, color:t.textMuted }}>— {client.profile?.full_name}</div>}
          <div style={{ flex:1 }} />
          {saved && <div style={{ fontSize:12, color:t.green, fontWeight:700 }}>✓ Saved!</div>}
          <button onClick={handleSave} disabled={saving}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:13, fontWeight:700, color:'#000', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.7:1 }}>
            {saving ? 'Saving...' : 'Save Habits →'}
          </button>
        </div>

        <div style={{ maxWidth:900, margin:'0 auto', padding:28 }}>

          {/* Header */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>Habit Assignment</div>
            <div style={{ fontSize:13, color:t.textMuted }}>Select habits from the library below. Click any habit to customize the target. Changes take effect immediately for the client.</div>
          </div>

          {/* Selected count */}
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
            <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.teal }}>
              {selected.size} habit{selected.size!==1?'s':''} selected
            </div>
            <button onClick={()=>setShowNew(true)}
              style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              + Custom Habit
            </button>
          </div>

          {/* Category filter */}
          <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
            {CATEGORIES.map(c => (
              <button key={c} onClick={()=>setCategory(c)}
                style={{ background:category===c ? t.teal : t.surfaceHigh, border:'1px solid '+(category===c ? t.teal : t.border), borderRadius:20, padding:'6px 14px', fontSize:11, fontWeight:700, color:category===c?'#000':t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize', transition:'all 0.15s ease' }}>
                {c}
              </button>
            ))}
          </div>


          {/* Habit grid */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:28 }}>
            {filtered.map(h => {
              const cfg     = getHabitConfig(h)
              const isOn    = selected.has(h.label)
              const color   = cfg.color

              return (
                <div key={h.label}
                  style={{ background:isOn ? color+'14' : t.surface, border:'2px solid '+(isOn ? color+'50' : t.border), borderRadius:16, padding:'16px', cursor:'pointer', transition:'all 0.15s ease', position:'relative' }}
                  onClick={()=>toggleHabit(h.label)}>

                  {/* Checkmark */}
                  {isOn && (
                    <div style={{ position:'absolute', top:10, right:10, width:20, height:20, borderRadius:'50%', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#000' }}>✓</div>
                  )}

                  <div style={{ fontSize:28, marginBottom:8 }}>{cfg.icon}</div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:4, color:isOn?color:t.text }}>{cfg.label}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginBottom: isOn ? 10 : 0 }}>
                    {cfg.habit_type==='check' ? 'Daily check-in' : 'Target: '+cfg.target+' '+cfg.unit}
                  </div>

                  {/* Customize button */}
                  {isOn && (
                    <button
                      onClick={e=>{ e.stopPropagation(); setShowCustom(showCustom===h.label ? null : h.label) }}
                      style={{ background:color+'20', border:'1px solid '+color+'40', borderRadius:7, padding:'4px 10px', fontSize:10, fontWeight:700, color:color, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      ⚙ Customize
                    </button>
                  )}

                  {/* Inline customize panel */}
                  {isOn && showCustom===h.label && (
                    <div onClick={e=>e.stopPropagation()} style={{ marginTop:12, padding:'12px', background:t.surfaceUp, borderRadius:10, border:'1px solid '+t.border }}>
                      <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Customize Target</div>
                      {cfg.habit_type==='number' && (
                        <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                          <input type="number" defaultValue={cfg.target}
                            onChange={e=>setCustomized(prev=>({ ...prev, [h.label]:{ ...(prev[h.label]||{}), target:+e.target.value }}))}
                            style={{ flex:1, background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 10px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                          <span style={{ fontSize:11, color:t.textMuted }}>{cfg.unit}</span>
                        </div>
                      )}
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <input type="text" defaultValue={cfg.label} placeholder="Label"
                          onChange={e=>setCustomized(prev=>({ ...prev, [h.label]:{ ...(prev[h.label]||{}), label:e.target.value }}))}
                          style={{ flex:1, background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 10px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                        <input type="text" defaultValue={cfg.icon} placeholder="Icon"
                          onChange={e=>setCustomized(prev=>({ ...prev, [h.label]:{ ...(prev[h.label]||{}), icon:e.target.value }}))}
                          style={{ width:50, background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif', textAlign:'center", colorScheme:'dark' }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Existing custom habits */}
          {existing.filter((e:any) => !DEFAULT_HABITS.find(d=>d.label===e.label)).length > 0 && (
            <div style={{ marginBottom:28 }}>
              <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Custom Habits</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {existing.filter((e:any) => !DEFAULT_HABITS.find(d=>d.label===e.label)).map((h:any) => {
                  const isOn = selected.has(h.label)
                  return (
                    <div key={h.id} onClick={()=>toggleHabit(h.label)}
                      style={{ background:isOn?h.color+'14':t.surface, border:'2px solid '+(isOn?h.color+'50':t.border), borderRadius:16, padding:'16px', cursor:'pointer', transition:'all 0.15s ease', position:'relative' }}>
                      {isOn && <div style={{ position:'absolute', top:10, right:10, width:20, height:20, borderRadius:'50%', background:h.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:'#000' }}>✓</div>}
                      <div style={{ fontSize:28, marginBottom:8 }}>{h.icon}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:isOn?h.color:t.text }}>{h.label}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>{h.habit_type==='check'?'Daily check-in':'Target: '+h.target+' '+h.unit}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}


        </div>

        {/* New custom habit modal */}
        {showNew && (
          <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
                <div style={{ fontSize:16, fontWeight:800 }}>Create Custom Habit</div>
                <span onClick={()=>setShowNew(false)} style={{ cursor:'pointer', color:t.textMuted, fontSize:24, lineHeight:1 }}>×</span>
              </div>

              <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Label</div>
                  <input value={newHabit.label} onChange={e=>setNewHabit(p=>({...p,label:e.target.value}))} placeholder="e.g. Evening Walk"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Icon</div>
                  <input value={newHabit.icon} onChange={e=>setNewHabit(p=>({...p,icon:e.target.value}))} placeholder="⭐"
                    style={{ width:60, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 8px', fontSize:18, color:t.text, outline:'none', textAlign:'center', colorScheme:'dark' }} />
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Type</div>
                <div style={{ display:'flex', gap:8 }}>
                  {['check','number'].map(type => (
                    <button key={type} onClick={()=>setNewHabit(p=>({...p,habit_type:type}))}
                      style={{ flex:1, padding:'9px', borderRadius:9, border:'1px solid '+(newHabit.habit_type===type?t.teal:t.border), background:newHabit.habit_type===type?t.tealDim:'transparent', fontSize:12, fontWeight:700, color:newHabit.habit_type===type?t.teal:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
                      {type==='check'?'✓ Daily Check':'# Number'}
                    </button>
                  ))}
                </div>
              </div>

              {newHabit.habit_type==='number' && (
                <div style={{ display:'flex', gap:10, marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Target</div>
                    <input type="number" value={newHabit.target} onChange={e=>setNewHabit(p=>({...p,target:+e.target.value}))}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>Unit</div>
                    <input value={newHabit.unit} onChange={e=>setNewHabit(p=>({...p,unit:e.target.value}))} placeholder="oz, steps, min..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                  </div>
                </div>
              )}

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Color</div>
                <div style={{ display:'flex', gap:8 }}>
                  {[t.teal,t.orange,t.purple,t.green,t.yellow,t.pink,t.red,t.blue].map(c => (
                    <div key={c} onClick={()=>setNewHabit(p=>({...p,color:c}))}
                      style={{ width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer', border:'3px solid '+(newHabit.color===c?t.text:'transparent'), transition:'all 0.15s ease' }} />
                  ))}
                </div>
              </div>

              <button onClick={handleAddCustom} disabled={!newHabit.label}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newHabit.label?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newHabit.label?0.5:1 }}>
                Add Habit →
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
