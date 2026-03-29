'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const ICON_OPTIONS = [
  '✅','💧','🥗','🏋️','🚶','😴','🧘','📓','🚫','🔥','💪','🥦',
  '🧠','❤️','⚡','🎯','🏃','🧴','📊','💊','🛏','🍎','🥤','☀️',
  '🌙','🧊','🏊','🚴','🤸','🥩','🫀','🧘‍♂️','📱','✍️','🎵','🌿',
]

const HABIT_PRESETS = [
  { label:'💧 Drink Water',   icon:'💧', unit:'oz',    target:80,    color:'#38bdf8', category:'nutrition' },
  { label:'🥗 Track Macros',  icon:'🥗', unit:'',      target:1,     color:'#22c55e', category:'nutrition' },
  { label:'🚶 10k Steps',     icon:'🚶', unit:'steps', target:10000, color:'#f59e0b', category:'fitness'   },
  { label:'😴 Sleep 8 Hours', icon:'😴', unit:'hrs',   target:8,     color:'#8b5cf6', category:'recovery'  },
  { label:'🧘 Meditate',      icon:'🧘', unit:'min',   target:10,    color:'#f472b6', category:'mental'    },
  { label:'📓 Journal',       icon:'📓', unit:'',      target:1,     color:'#fb923c', category:'mental'    },
  { label:'🏋️ Train',        icon:'🏋️', unit:'',      target:1,     color:'#00c9b1', category:'fitness'   },
  { label:'🚫 No Alcohol',    icon:'🚫', unit:'',      target:1,     color:'#ef4444', category:'health'    },
]

export default function CoachHabits() {
  const [clients,    setClients]    = useState<any[]>([])
  const [habits,     setHabits]     = useState<any[]>([])
  const [selClient,  setSelClient]  = useState<string>('')
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [showForm,   setShowForm]   = useState(false)
  const [coachId,    setCoachId]    = useState<string>('')
  const [showIconPicker, setShowIconPicker] = useState(false)

  // Form state
  const [fLabel,    setFLabel]    = useState('')
  const [fIcon,     setFIcon]     = useState('✅')
  const [fUnit,     setFUnit]     = useState('')
  const [fTarget,   setFTarget]   = useState('')
  const [fColor,    setFColor]    = useState('#00c9b1')
  const [fCategory, setFCategory] = useState('fitness')
  const [fDesc,     setFDesc]     = useState('')

  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])
  useEffect(() => { if (selClient) loadHabits(selClient) }, [selClient])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)
    const { data: clientList } = await supabase
      .from('clients')
      .select('id, profile:profiles!clients_profile_id_fkey(full_name)')
      .eq('coach_id', user.id)
    setClients(clientList || [])
    if (clientList && clientList.length > 0) setSelClient(clientList[0].id)
    setLoading(false)
  }

  const loadHabits = async (clientId: string) => {
    const { data } = await supabase.from('habits').select('*').eq('client_id', clientId).order('created_at')
    setHabits(data || [])
  }

  const saveHabit = async () => {
    if (!selClient || !fLabel) return
    setSaving(true)
    await supabase.from('habits').insert({
      coach_id: coachId, client_id: selClient, label: fLabel, icon: fIcon,
      habit_type: fTarget ? 'number' : 'check',
      unit: fUnit || null, target: fTarget ? +fTarget : null, color: fColor,
      category: fCategory, description: fDesc || null, active: true, frequency: 'daily',
    })
    await loadHabits(selClient)
    setSaving(false)
    setShowForm(false)
    resetForm()
  }

  const toggleActive = async (habit: any) => {
    await supabase.from('habits').update({ active: !habit.active }).eq('id', habit.id)
    setHabits(prev => prev.map(h => h.id === habit.id ? { ...h, active: !h.active } : h))
  }

  const deleteHabit = async (id: string) => {
    await supabase.from('habits').delete().eq('id', id)
    setHabits(prev => prev.filter(h => h.id !== id))
  }

  const applyPreset = (p: typeof HABIT_PRESETS[0]) => {
    setFLabel(p.label); setFIcon(p.icon); setFUnit(p.unit)
    setFTarget(p.target?.toString() || ''); setFColor(p.color); setFCategory(p.category)
    setShowForm(true)
  }

  const resetForm = () => {
    setFLabel(''); setFIcon('✅'); setFUnit(''); setFTarget('')
    setFColor('#00c9b1'); setFCategory('fitness'); setFDesc(''); setShowIconPicker(false)
  }

  const clientName = (id: string) => clients.find(c=>c.id===id)?.profile?.full_name || '—'

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>✅ Habit Management</div>
          <div style={{ flex:1 }} />
          <select value={selClient} onChange={e=>setSelClient(e.target.value)}
            style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'7px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', colorScheme:'dark' }}>
            {clients.map(c => <option key={c.id} value={c.id}>{c.profile?.full_name}</option>)}
          </select>
          <button onClick={()=>{ resetForm(); setShowForm(true) }}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add Habit
          </button>
        </div>

        <div style={{ maxWidth:900, margin:'0 auto', padding:28, display:'grid', gridTemplateColumns:'1fr 320px', gap:20, alignItems:'start' }}>

          {/* Left: habits list */}
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>
              {clientName(selClient)}'s Habits ({habits.filter(h=>h.active).length} active)
            </div>
            {habits.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:40, textAlign:'center' }}>
                <div style={{ fontSize:28, marginBottom:10 }}>🌱</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No habits yet</div>
                <div style={{ fontSize:12, color:t.textMuted }}>Add a habit or use a preset to get started.</div>
              </div>
            ) : habits.map(h => (
              <div key={h.id} style={{ background:t.surface, border:'1px solid '+(h.active?t.border:t.border+'60'), borderRadius:12, padding:'14px 16px', marginBottom:10, display:'flex', alignItems:'center', gap:12, opacity:h.active?1:0.5 }}>
                <div style={{ fontSize:22, width:36, textAlign:'center' }}>{h.icon || '✅'}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{h.label}</div>
                  {h.description && <div style={{ fontSize:11, color:t.textDim, marginTop:1 }}>{h.description}</div>}
                  <div style={{ display:'flex', gap:8, marginTop:4 }}>
                    {h.category && <span style={{ fontSize:9, fontWeight:700, background:t.surfaceHigh, borderRadius:4, padding:'2px 7px', color:t.textMuted, textTransform:'uppercase' }}>{h.category}</span>}
                    {h.target && <span style={{ fontSize:10, color:h.color||t.teal }}>Target: {h.target} {h.unit||''}</span>}
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={()=>toggleActive(h)}
                    style={{ background:h.active?t.greenDim:t.surfaceHigh, border:'1px solid '+(h.active?t.green+'40':t.border), borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:h.active?t.green:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {h.active ? '✓ Active' : 'Paused'}
                  </button>
                  <button onClick={()=>deleteHabit(h.id)}
                    style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right: presets or form */}
          <div>
            {!showForm ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:18 }}>
                <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>Quick Presets</div>
                {HABIT_PRESETS.map(p => (
                  <button key={p.label} onClick={()=>applyPreset(p)}
                    style={{ width:'100%', background:'transparent', border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', marginBottom:8, display:'flex', alignItems:'center', gap:10, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif" }}>
                    <span style={{ fontSize:18 }}>{p.icon}</span>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:t.text }}>{p.label}</div>
                      <div style={{ fontSize:10, color:t.textMuted }}>{p.category}{p.target ? ` · ${p.target} ${p.unit}` : ''}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:18 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:16 }}>New Habit</div>

                {/* Label */}
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Label *</label>
                  <input value={fLabel} onChange={e=>setFLabel(e.target.value)} placeholder="e.g. Drink Water"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                </div>

                {/* Icon picker */}
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Icon</label>
                  <button onClick={()=>setShowIconPicker(p=>!p)}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:18, cursor:'pointer', textAlign:'left' as const, display:'flex', alignItems:'center', gap:10, fontFamily:"'DM Sans',sans-serif" }}>
                    <span>{fIcon}</span>
                    <span style={{ fontSize:12, color:t.textMuted }}>{showIconPicker ? 'Close ▲' : 'Pick icon ▼'}</span>
                  </button>
                  {showIconPicker && (
                    <div style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:10, marginTop:6, display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:4 }}>
                      {ICON_OPTIONS.map(emoji => (
                        <button key={emoji} onClick={()=>{ setFIcon(emoji); setShowIconPicker(false) }}
                          style={{ fontSize:20, padding:'6px', borderRadius:7, border:'2px solid '+(fIcon===emoji?t.teal:'transparent'), background:fIcon===emoji?t.tealDim:'transparent', cursor:'pointer', lineHeight:1 }}>
                          {emoji}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Unit + Target */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Unit</label>
                    <input value={fUnit} onChange={e=>setFUnit(e.target.value)} placeholder="oz, steps, min..."
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Daily Target</label>
                    <input value={fTarget} onChange={e=>setFTarget(e.target.value)} placeholder="e.g. 80"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Description</label>
                  <input value={fDesc} onChange={e=>setFDesc(e.target.value)} placeholder="Optional note..."
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                </div>

                {/* Category */}
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Category</label>
                  <select value={fCategory} onChange={e=>setFCategory(e.target.value)}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 12px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", outline:'none', colorScheme:'dark', boxSizing:'border-box' as any }}>
                    {['fitness','nutrition','recovery','mental','health'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                {/* Color */}
                <div style={{ marginBottom:16 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:5 }}>Color</label>
                  <input type="color" value={fColor} onChange={e=>setFColor(e.target.value)}
                    style={{ width:'100%', height:36, background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, cursor:'pointer', padding:2 }} />
                </div>

                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{ setShowForm(false); resetForm() }}
                    style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px', fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={saveHabit} disabled={saving || !fLabel}
                    style={{ flex:2, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'10px', fontSize:12, fontWeight:800, color:'#000', cursor:(saving||!fLabel)?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:(saving||!fLabel)?0.6:1 }}>
                    {saving ? 'Saving...' : '+ Assign Habit'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
