'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", yellow:"#eab308",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const GOAL_OPTIONS = [
  { value:'powerlifting',  label:'Powerlifting',   icon:'🏋️', color: t.orange },
  { value:'strength',      label:'Strength',        icon:'💪', color: t.red },
  { value:'hypertrophy',   label:'Hypertrophy',     icon:'📈', color: t.purple },
  { value:'conditioning',  label:'Conditioning',    icon:'🔥', color: t.teal },
  { value:'fat_loss',      label:'Fat Loss',        icon:'⚡', color: t.yellow },
  { value:'general',       label:'General Fitness', icon:'🎯', color: t.green },
]
const goalMeta = (g: string) => GOAL_OPTIONS.find(o => o.value === g) || { label: g, icon:'📋', color: t.teal }

type Tab = 'templates' | 'client'

export default function ProgramsList() {
  const [tab,          setTab]          = useState<Tab>('templates')
  const [templates,    setTemplates]    = useState<any[]>([])
  const [clientProgs,  setClientProgs]  = useState<any[]>([])
  const [clients,      setClients]      = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showNew,      setShowNew]      = useState(false)
  const [showAssign,   setShowAssign]   = useState<any>(null) // template being assigned
  const [copying,      setCopying]      = useState(false)
  // New program form
  const [newName,      setNewName]      = useState('')
  const [newGoal,      setNewGoal]      = useState('general')
  const [newDesc,      setNewDesc]      = useState('')
  const [newWeeks,     setNewWeeks]     = useState('')
  const [newClient,    setNewClient]    = useState('')
  const [newIsTemplate,setNewIsTemplate]= useState(true)
  const [creating,     setCreating]     = useState(false)
  // Assign form
  const [assignClient, setAssignClient] = useState('')
  const [assignStart,  setAssignStart]  = useState('')

  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    const { data: all } = await supabase
      .from('programs')
      .select(`*, client:clients(*, profile:profiles!clients_profile_id_fkey(full_name))`)
      .eq('coach_id', user?.id)
      .order('created_at', { ascending: false })
    setTemplates((all || []).filter(p => p.is_template))
    setClientProgs((all || []).filter(p => !p.is_template))
    const { data: cls } = await supabase
      .from('clients')
      .select(`*, profile:profiles!clients_profile_id_fkey(full_name)`)
      .eq('coach_id', user?.id).eq('active', true)
    setClients(cls || [])
    setLoading(false)
  }


  const createProgram = async () => {
    if (!newName) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prog } = await supabase.from('programs').insert({
      name: newName,
      coach_id: user?.id,
      client_id: (!newIsTemplate && newClient) ? newClient : null,
      is_template: newIsTemplate,
      goal: newGoal,
      description: newDesc || null,
      duration_weeks: newWeeks ? parseInt(newWeeks) : null,
      active: true,
    }).select().single()
    if (prog) router.push('/dashboard/coach/programs/'+prog.id)
  }

  // Deep-copy a template into a new client program
  const assignTemplate = async () => {
    if (!showAssign || !assignClient) return
    setCopying(true)
    const { data: { user } } = await supabase.auth.getUser()

    // Copy program record
    const { data: newProg } = await supabase.from('programs').insert({
      name: showAssign.name,
      coach_id: user?.id,
      client_id: assignClient,
      is_template: false,
      template_id: showAssign.id,
      goal: showAssign.goal,
      description: showAssign.description,
      duration_weeks: showAssign.duration_weeks,
      start_date: assignStart || null,
      active: true,
    }).select().single()

    if (!newProg) { setCopying(false); return }

    // Copy all workout blocks
    const { data: blocks } = await supabase
      .from('workout_blocks')
      .select(`*, block_exercises(*)`)
      .eq('program_id', showAssign.id)
    for (const block of (blocks || [])) {
      const { data: nb } = await supabase.from('workout_blocks').insert({
        program_id: newProg.id,
        name: block.name, day_label: block.day_label, block_label: block.block_label,
        week_number: block.week_number, order_index: block.order_index,
        group_types: block.group_types || {},
      }).select().single()
      if (nb) {
        for (const ex of (block.block_exercises || [])) {
          await supabase.from('block_exercises').insert({
            block_id: nb.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps,
            target_weight: ex.target_weight, rest_seconds: ex.rest_seconds, rpe: ex.rpe,
            tut: ex.tut, superset_group: ex.superset_group, exercise_role: ex.exercise_role,
            notes: ex.notes, order_index: ex.order_index, progression_note: ex.progression_note,
          })
        }
      }
    }
    router.push('/dashboard/coach/programs/'+newProg.id)
  }

  const deleteProgram = async (id: string) => {
    await supabase.from('programs').delete().eq('id', id)
    setTemplates(prev => prev.filter(p => p.id !== id))
    setClientProgs(prev => prev.filter(p => p.id !== id))
  }

  const openNew = (isTemplate: boolean) => {
    setNewIsTemplate(isTemplate)
    setNewName(''); setNewGoal('general'); setNewDesc(''); setNewWeeks(''); setNewClient('')
    setShowNew(true)
  }


  const ProgramCard = ({ p, isTemplate }: { p: any, isTemplate: boolean }) => {
    const gm = goalMeta(p.goal)
    const originTemplate = isTemplate ? null : templates.find(t => t.id === p.template_id)
    return (
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden', transition:'all 0.15s ease', cursor:'pointer' }}
        onClick={()=>router.push('/dashboard/coach/programs/'+p.id)}
        onMouseEnter={e=>e.currentTarget.style.borderColor=(isTemplate?t.orange:t.teal)+'50'}
        onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>

        {/* Color bar top */}
        <div style={{ height:4, background:`linear-gradient(90deg,${gm.color},${gm.color}88)` }} />

        <div style={{ padding:'16px 18px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
            <div style={{ flex:1, marginRight:8 }}>
              {isTemplate && (
                <div style={{ fontSize:9, fontWeight:900, color:t.orange, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>
                  📐 Template
                </div>
              )}
              <div style={{ fontSize:14, fontWeight:800 }}>{p.name}</div>
            </div>
            <button onClick={e=>{ e.stopPropagation(); deleteProgram(p.id) }}
              style={{ background:'none', border:'none', color:t.red+'50', cursor:'pointer', fontSize:14, flexShrink:0 }}>✕</button>
          </div>

          {/* Goal badge */}
          <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
            <span style={{ background:gm.color+'18', border:'1px solid '+gm.color+'30', borderRadius:6, padding:'2px 9px', fontSize:11, fontWeight:700, color:gm.color }}>
              {gm.icon} {gm.label}
            </span>
            {p.duration_weeks && (
              <span style={{ background:t.surfaceHigh, borderRadius:6, padding:'2px 9px', fontSize:11, color:t.textMuted }}>
                {p.duration_weeks}wk
              </span>
            )}
          </div>

          {/* Client or template origin */}
          {!isTemplate && p.client?.profile?.full_name && (
            <div style={{ fontSize:12, color:t.teal, fontWeight:700, marginBottom:6 }}>👤 {p.client.profile.full_name}</div>
          )}
          {!isTemplate && originTemplate && (
            <div style={{ fontSize:11, color:t.textMuted, marginBottom:6 }}>📐 From: {originTemplate.name}</div>
          )}
          {p.description && (
            <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.5, marginBottom:10, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {p.description}
            </div>
          )}

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8 }}>
            <div style={{ fontSize:10, color:t.textMuted }}>
              {p.start_date ? 'Started '+new Date(p.start_date).toLocaleDateString() : isTemplate ? 'Template' : 'No start date'}
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'center' }}>
              {isTemplate && (
                <button onClick={e=>{ e.stopPropagation(); setAssignClient(''); setAssignStart(''); setShowAssign(p) }}
                  style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'4px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Assign
                </button>
              )}
              <div style={{ fontSize:11, color:isTemplate?t.orange:t.teal, fontWeight:700 }}>Open →</div>
            </div>
          </div>
        </div>
      </div>
    )
  }


  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select,textarea{color-scheme:dark;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Programs</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>openNew(tab==='templates')}
            style={{ background:'linear-gradient(135deg,'+(tab==='templates'?t.orange:t.teal)+','+(tab==='templates'?t.orange:t.teal)+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {tab === 'templates' ? '+ New Template' : '+ New Client Program'}
          </button>
        </div>

        {/* Tabs */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', gap:4, height:48, alignItems:'flex-end' }}>
          {([['templates','📐 Templates', templates.length], ['client','👤 Client Programs', clientProgs.length]] as const).map(([v,label,count]) => (
            <button key={v} onClick={()=>setTab(v)}
              style={{ padding:'10px 18px', border:'none', background:'transparent', borderBottom:'3px solid '+(tab===v?(v==='templates'?t.orange:t.teal):'transparent'), fontSize:13, fontWeight:700, color:tab===v?(v==='templates'?t.orange:t.teal):t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:8 }}>
              {label}
              <span style={{ background:tab===v?(v==='templates'?t.orange:t.teal)+'20':t.surfaceHigh, borderRadius:10, padding:'1px 7px', fontSize:10, fontWeight:800, color:tab===v?(v==='templates'?t.orange:t.teal):t.textMuted }}>
                {count}
              </span>
            </button>
          ))}
        </div>

        <div style={{ maxWidth:960, margin:'0 auto', padding:28 }}>
          {loading ? (
            <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
          ) : tab === 'templates' ? (
            <>
              {templates.length === 0 ? (
                <div style={{ textAlign:'center', padding:'64px 20px' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>📐</div>
                  <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No templates yet</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.7 }}>
                    Templates are reusable program blueprints.<br/>Build once, assign to any client.
                  </div>
                  <button onClick={()=>openNew(true)}
                    style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    + Create First Template
                  </button>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                  {templates.map(p => <ProgramCard key={p.id} p={p} isTemplate={true} />)}
                  <div onClick={()=>openNew(true)}
                    style={{ background:'transparent', border:'2px dashed '+t.border, borderRadius:18, padding:'32px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, minHeight:140, justifyContent:'center' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=t.orange+'50'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                    <span style={{ fontSize:28 }}>+</span>New Template
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              {clientProgs.length === 0 ? (
                <div style={{ textAlign:'center', padding:'64px 20px' }}>
                  <div style={{ fontSize:48, marginBottom:16 }}>👤</div>
                  <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No client programs yet</div>
                  <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.7 }}>
                    Assign a template to a client, or create a program from scratch.
                  </div>
                  <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
                    {templates.length > 0 && (
                      <button onClick={()=>setTab('templates')}
                        style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:12, padding:'12px 20px', fontSize:13, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        📐 Use a Template
                      </button>
                    )}
                    <button onClick={()=>openNew(false)}
                      style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px 20px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      + From Scratch
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                  {clientProgs.map(p => <ProgramCard key={p.id} p={p} isTemplate={false} />)}
                  <div onClick={()=>openNew(false)}
                    style={{ background:'transparent', border:'2px dashed '+t.border, borderRadius:18, padding:'32px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, minHeight:140, justifyContent:'center' }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=t.teal+'50'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                    <span style={{ fontSize:28 }}>+</span>New Client Program
                  </div>
                </div>
              )}
            </>
          )}
        </div>


        {/* NEW PROGRAM / TEMPLATE MODAL */}
        {showNew && (
          <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:460, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <div style={{ fontSize:18, fontWeight:900, color: newIsTemplate ? t.orange : t.teal }}>
                  {newIsTemplate ? '📐 New Template' : '👤 New Client Program'}
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Name *</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)}
                  placeholder={newIsTemplate ? "e.g. 12-Week Powerlifting Peaking" : "e.g. Alex's Hypertrophy Block"}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
              </div>

              {/* Goal */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Goal</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {GOAL_OPTIONS.map(g => (
                    <button key={g.value} onClick={()=>setNewGoal(g.value)}
                      style={{ padding:'6px 12px', borderRadius:8, border:'1px solid '+(newGoal===g.value?g.color+'60':t.border), background:newGoal===g.value?g.color+'18':'transparent', fontSize:12, fontWeight:700, color:newGoal===g.value?g.color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {g.icon} {g.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Duration (weeks)</div>
                  <input type="number" value={newWeeks} onChange={e=>setNewWeeks(e.target.value)} placeholder="e.g. 12"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                </div>
                {!newIsTemplate && (
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Assign to Client</div>
                    <select value={newClient} onChange={e=>setNewClient(e.target.value)}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                      <option value=''>— Select —</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.profile?.full_name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Description (optional)</div>
                <textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} rows={2}
                  placeholder="Who is this for? What's the focus?"
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
              </div>

              <button onClick={createProgram} disabled={!newName||creating}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+(newIsTemplate?t.orange:t.teal)+','+(newIsTemplate?t.orange:t.teal)+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newName||creating?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newName||creating?0.6:1 }}>
                {creating ? 'Creating...' : 'Create & Open Builder →'}
              </button>
            </div>
          </div>
        )}

        {/* ASSIGN TEMPLATE TO CLIENT MODAL */}
        {showAssign && (
          <div onClick={()=>setShowAssign(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Assign Template to Client</div>
              <div style={{ fontSize:13, color:t.orange, fontWeight:700, marginBottom:20 }}>📐 {showAssign.name}</div>

              <div style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', marginBottom:16, fontSize:12, color:t.textMuted, lineHeight:1.6 }}>
                This will create a full copy of the template for this client. Any changes made to their program won't affect the original template.
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Client *</div>
                <select value={assignClient} onChange={e=>setAssignClient(e.target.value)}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                  <option value=''>— Select Client —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.profile?.full_name}</option>)}
                </select>
              </div>

              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Start Date (optional)</div>
                <input type="date" value={assignStart} onChange={e=>setAssignStart(e.target.value)}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
              </div>

              <button onClick={assignTemplate} disabled={!assignClient||copying}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!assignClient||copying?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!assignClient||copying?0.6:1 }}>
                {copying ? 'Copying program...' : '✓ Assign to Client →'}
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  )
}
