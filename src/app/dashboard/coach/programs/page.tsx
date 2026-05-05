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

type Tab = 'templates'

export default function ProgramsList() {
  const [tab,          setTab]          = useState<Tab>('templates')
  const [templates,    setTemplates]    = useState<any[]>([])
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
  const [creating,     setCreating]     = useState(false)
  // Assign form
  const [assignClient, setAssignClient] = useState('')
  const [assignStart,  setAssignStart]  = useState('')
  // 📄 Import-from-file flow state
  const [showImport,         setShowImport]         = useState(false)
  const [importFile,         setImportFile]         = useState<File | null>(null)
  const [importLoading,      setImportLoading]      = useState(false)
  const [importError,        setImportError]        = useState<string | null>(null)
  const [importProposal,     setImportProposal]     = useState<any | null>(null)
  const [importTemplateName, setImportTemplateName] = useState('')
  const [importSaving,       setImportSaving]       = useState(false)
  const [importSaveResult,   setImportSaveResult]   = useState<any | null>(null)

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
      client_id: null,
      is_template: true,
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

  const openNew = () => {
    setNewName(''); setNewGoal('general'); setNewDesc(''); setNewWeeks('')
    setShowNew(true)
  }


  const ProgramCard = ({ p }: { p: any }) => {
    const gm = goalMeta(p.goal)
    const [editing,    setEditing]    = useState(false)
    const [editName,   setEditName]   = useState(p.name)
    const [editDesc,   setEditDesc]   = useState(p.description || '')
    const [saving,     setSaving]     = useState(false)
    const [duping,     setDuping]     = useState(false)
    const [confirmDel, setConfirmDel] = useState(false)
    const [deleting,   setDeleting]   = useState(false)

    const handleSave = async (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!editName.trim()) return
      setSaving(true)
      const { error } = await supabase
        .from('programs')
        .update({ name: editName.trim(), description: editDesc.trim() || null })
        .eq('id', p.id)
      setSaving(false)
      if (!error) {
        p.name = editName.trim()
        p.description = editDesc.trim() || null
        setEditing(false)
      }
    }

    const handleDuplicate = async (e: React.MouseEvent) => {
      e.stopPropagation()
      setDuping(true)
      const { data: { user } } = await supabase.auth.getUser()
      const { data: newProg } = await supabase.from('programs').insert({
        coach_id: user?.id,
        name: p.name + ' (Copy)',
        description: p.description || null,
        is_template: p.is_template,
        goal: p.goal,
        duration_weeks: p.duration_weeks,
        active: false,
      }).select().single()
      if (newProg) {
        const { data: blocks } = await supabase
          .from('workout_blocks')
          .select(`*, block_exercises(*)`)
          .eq('program_id', p.id)
        for (const block of (blocks || [])) {
          const { data: nb } = await supabase.from('workout_blocks').insert({
            program_id: newProg.id, name: block.name, day_label: block.day_label,
            block_label: block.block_label, week_number: block.week_number,
            order_index: block.order_index, group_types: block.group_types || {},
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
        load()
      }
      setDuping(false)
    }

    const handleSaveToLibrary = async (e: React.MouseEvent) => {
      e.stopPropagation()
      const { data: { user } } = await supabase.auth.getUser()
      const { data: blocks } = await supabase
        .from('workout_blocks').select(`*, block_exercises(*, exercise:exercises(name))`)
        .eq('program_id', p.id).order('week_number').order('order_index')
      if (!blocks || blocks.length === 0) { alert('No exercises to save.'); return }
      for (const block of blocks) {
        const exes = (block.block_exercises || []).sort((a:any,b:any) => a.order_index - b.order_index)
        if (exes.length === 0) continue
        const { data: tmpl } = await supabase.from('workout_templates').insert({
          coach_id: user?.id,
          title: block.day_label || block.name || p.name,
          notes_coach: `Saved from: ${p.name}`,
        }).select().single()
        if (!tmpl) continue
        await supabase.from('workout_template_exercises').insert(
          exes.map((ex:any, i:number) => ({
            template_id: tmpl.id,
            exercise_id: ex.exercise_id,
            exercise_name: ex.exercise?.name || '',
            sets_prescribed: ex.sets || 3,
            reps_prescribed: ex.reps || '8-12',
            weight_prescribed: ex.target_weight || '',
            rest_seconds: ex.rest_seconds || 90,
            notes: ex.notes || null,
            order_index: i,
          }))
        )
      }
      alert(`${blocks.length} day${blocks.length !== 1 ? 's' : ''} from "${p.name}" saved to Workout Library ✓`)
    }

    const handleDelete = async (e: React.MouseEvent) => {
      e.stopPropagation()
      setDeleting(true)
      await supabase.from('workout_blocks').delete().eq('program_id', p.id)
      await supabase.from('programs').delete().eq('id', p.id)
      setTemplates(prev => prev.filter(x => x.id !== p.id))
    }

    const btnBase: React.CSSProperties = {
      border: 'none', borderRadius: 7, padding: '5px 11px', fontSize: 11,
      fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
    }

    return (
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, overflow:'hidden', transition:'all 0.15s ease', cursor: editing ? 'default' : 'pointer' }}
        onClick={()=>{ if (!editing) router.push('/dashboard/coach/programs/'+p.id) }}
        onMouseEnter={e=>{ if (!editing) e.currentTarget.style.borderColor=t.orange+'50' }}
        onMouseLeave={e=>{ if (!editing) e.currentTarget.style.borderColor=t.border }}>

        {/* Color bar top */}
        <div style={{ height:4, background:`linear-gradient(90deg,${gm.color},${gm.color}88)` }} />

        <div style={{ padding:'16px 18px' }}>
          {/* Name row */}
          <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom: editing ? 10 : 10 }}>
            <div style={{ flex:1, marginRight:8 }}>
              {!editing && (
                <div style={{ fontSize:9, fontWeight:900, color:t.orange, letterSpacing:'0.1em', textTransform:'uppercase', marginBottom:4 }}>
                  📐 Template
                </div>
              )}
              {editing ? (
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onClick={e => e.stopPropagation()}
                  placeholder="Program name"
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.teal+'60', borderRadius:8, padding:'7px 10px', fontSize:13, fontWeight:700, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                />
              ) : (
                <div style={{ fontSize:14, fontWeight:800 }}>{p.name}</div>
              )}
            </div>
          </div>

          {/* Description edit */}
          {editing && (
            <div style={{ marginBottom:10 }}>
              <textarea
                value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                onClick={e => e.stopPropagation()}
                placeholder="Description (optional)"
                rows={2}
                style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 10px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }}
              />
            </div>
          )}

          {/* Goal badge */}
          {!editing && (
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
          )}

          {!editing && p.description && (
            <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.5, marginBottom:10, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
              {p.description}
            </div>
          )}

          {/* Action row */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:8, gap:6, flexWrap:'wrap' }}>
            {editing ? (
              <div style={{ display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                <button onClick={handleSave} disabled={saving || !editName.trim()}
                  style={{ ...btnBase, background: t.teal, color:'#000', opacity: saving||!editName.trim()?0.5:1 }}>
                  {saving ? '⏳ Saving…' : '💾 Save'}
                </button>
                <button onClick={e=>{ e.stopPropagation(); setEditing(false); setEditName(p.name); setEditDesc(p.description||'') }}
                  style={{ ...btnBase, background:t.surfaceHigh, color:t.textMuted }}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize:10, color:t.textMuted }}>
                  {p.start_date ? 'Created '+new Date(p.start_date).toLocaleDateString() : 'Template'}
                </div>
                <div style={{ display:'flex', gap:6, alignItems:'center', flexWrap:'wrap' }} onClick={e=>e.stopPropagation()}>
                  {/* Edit */}
                  <button onClick={e=>{ e.stopPropagation(); setEditing(true) }}
                    style={{ ...btnBase, background:t.tealDim, border:'1px solid '+t.teal+'40', color:t.teal }}>
                    ✏️ Edit
                  </button>
                  {/* Duplicate */}
                  <button onClick={handleDuplicate} disabled={duping}
                    style={{ ...btnBase, background:t.orange+'18', border:'1px solid '+t.orange+'40', color:t.orange, opacity:duping?0.5:1 }}>
                    {duping ? '⏳' : '📋'}
                  </button>
                  {/* Save to Workout Library */}
                  <button onClick={handleSaveToLibrary}
                    title="Save days to Workout Library"
                    style={{ ...btnBase, background:t.tealDim, border:'1px solid '+t.teal+'40', color:t.teal }}>
                    💾 Save to Library
                  </button>
                  {/* Assign to client */}
                  <button onClick={e=>{ e.stopPropagation(); setAssignClient(''); setAssignStart(''); setShowAssign(p) }}
                    style={{ ...btnBase, background:t.tealDim, border:'1px solid '+t.teal+'40', color:t.teal }}>
                    + Assign to Client
                  </button>
                  {/* Delete */}
                  {!confirmDel ? (
                    <button onClick={e=>{ e.stopPropagation(); setConfirmDel(true) }}
                      style={{ ...btnBase, background:t.redDim, border:'1px solid '+t.red+'40', color:t.red }}>
                      🗑
                    </button>
                  ) : (
                    <>
                      <button onClick={handleDelete} disabled={deleting}
                        style={{ ...btnBase, background:t.red, color:'#fff', opacity:deleting?0.5:1 }}>
                        {deleting ? '⏳' : '⚠️ Confirm'}
                      </button>
                      <button onClick={e=>{ e.stopPropagation(); setConfirmDel(false) }}
                        style={{ ...btnBase, background:t.surfaceHigh, color:t.textMuted }}>
                        Cancel
                      </button>
                    </>
                  )}
                  <div style={{ fontSize:11, color:t.orange, fontWeight:700 }}>Open →</div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    )
  }


  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select,textarea{color-scheme:dark;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Programs</div>
          <div style={{ flex:1 }} />
          <button
            onClick={()=>{ setShowImport(true); setImportFile(null); setImportError(null); setImportProposal(null); setImportSaveResult(null); setImportTemplateName('') }}
            title="Upload a PDF, Excel, or CSV of an existing program. AI will translate it into a template you can save and assign."
            style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:9, padding:'8px 14px', fontSize:13, fontWeight:700, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginRight:8 }}>
            📄 Import from File
          </button>
          <button onClick={()=>openNew()}
            style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Template
          </button>
        </div>

        {/* Content */}
        <div style={{ maxWidth:960, margin:'0 auto', padding:28 }}>
          {loading ? (
            <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
          ) : templates.length === 0 ? (
            <div style={{ textAlign:'center', padding:'64px 20px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📐</div>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No templates yet</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.7 }}>
                Templates are reusable program blueprints.<br/>Build once, assign to any client from their profile.
              </div>
              <button onClick={()=>openNew()}
                style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Create First Template
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
              {templates.map(p => <ProgramCard key={p.id} p={p} />)}
              <div onClick={()=>openNew()}
                style={{ background:'transparent', border:'2px dashed '+t.border, borderRadius:18, padding:'32px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:8, minHeight:140, justifyContent:'center' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=t.orange+'50'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                <span style={{ fontSize:28 }}>+</span>New Template
              </div>
            </div>
          )}
        </div>


        {/* NEW PROGRAM / TEMPLATE MODAL */}
        {showNew && (
          <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:460, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <div style={{ fontSize:18, fontWeight:900, color:t.orange }}>
                  📐 New Template
                </div>
              </div>

              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Name *</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)}
                  placeholder="e.g. 12-Week Powerlifting Peaking"
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

              <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Duration (weeks)</div>
                  <input type="number" value={newWeeks} onChange={e=>setNewWeeks(e.target.value)} placeholder="e.g. 12"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                </div>
              </div>

              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Description (optional)</div>
                <textarea value={newDesc} onChange={e=>setNewDesc(e.target.value)} rows={2}
                  placeholder="Who is this for? What's the focus?"
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
              </div>

              <button onClick={createProgram} disabled={!newName||creating}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newName||creating?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newName||creating?0.6:1 }}>
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

        {/* 📄 Import from File modal — upload PDF/Excel/CSV, AI parses,
            coach reviews, saves as template via /api/ai-program/save with
            asTemplate=true. Reuses the same proposal JSON shape as the AI
            Program Builder so the same save endpoint works for both flows. */}
        {showImport && (
          <div onClick={()=>{ if (!importLoading && !importSaving) setShowImport(false) }}
            style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(8px)', zIndex:200, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:20, overflowY:'auto' }}>
            <div onClick={e=>e.stopPropagation()}
              style={{ background:t.surface, border:'1px solid '+t.purple+'40', borderRadius:18, width:'100%', maxWidth:640, padding:24, marginTop:40, marginBottom:40 }}>

              {/* Header */}
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12, marginBottom:8 }}>
                <div>
                  <div style={{ fontSize:18, fontWeight:900 }}>📄 Import program from file</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginTop:4, lineHeight:1.5 }}>
                    Upload a PDF, Excel, or CSV. AI translates it into a template you can review and save.
                  </div>
                </div>
                <button onClick={()=>{ if (!importLoading && !importSaving) setShowImport(false) }}
                  disabled={importLoading || importSaving}
                  style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor: (importLoading||importSaving) ? 'default' : 'pointer', padding:'4px 8px', lineHeight:1 }}>×</button>
              </div>

              {/* Step 1: file picker — visible until proposal arrives */}
              {!importProposal && (
                <div style={{ marginTop:18 }}>
                  <label style={{ display:'block', cursor: importLoading ? 'default' : 'pointer' }}>
                    <input
                      type="file"
                      accept=".pdf,.xlsx,.xls,.csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setImportFile(f); setImportError(null) } }}
                      disabled={importLoading}
                      style={{ display:'none' }}
                    />
                    <div style={{ background:t.surfaceUp, border:'2px dashed '+(importFile ? t.purple : t.border), borderRadius:12, padding:'24px 18px', textAlign:'center' as const }}>
                      {importFile ? (
                        <>
                          <div style={{ fontSize:24, marginBottom:8 }}>📄</div>
                          <div style={{ fontSize:13, fontWeight:700, color:t.text, marginBottom:4, wordBreak:'break-word' as const }}>{importFile.name}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>
                            {(importFile.size / 1024).toFixed(1)} KB · click to change
                          </div>
                        </>
                      ) : (
                        <>
                          <div style={{ fontSize:30, marginBottom:8 }}>📤</div>
                          <div style={{ fontSize:13, fontWeight:700, color:t.text, marginBottom:4 }}>Click to choose a file</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>PDF, Excel (.xlsx/.xls), or CSV · max 20 MB</div>
                        </>
                      )}
                    </div>
                  </label>

                  <button
                    onClick={async () => {
                      if (!importFile) return
                      setImportLoading(true); setImportError(null); setImportProposal(null)
                      try {
                        const fd = new FormData()
                        fd.append('file', importFile)
                        const res = await fetch('/api/ai-program/import-from-file', { method:'POST', body: fd })
                        // Read as text first — when Vercel kills the function past
                        // maxDuration it returns an HTML/text error page that starts
                        // with "An error occurred…", and a blind res.json() crashes
                        // with "Unexpected token 'A'…". Decode JSON only if the body
                        // actually starts with { (or [).
                        const txt = await res.text()
                        const trimmed = txt.trim()
                        const looksJson = trimmed.startsWith('{') || trimmed.startsWith('[')
                        let data: any = null
                        if (looksJson) {
                          try { data = JSON.parse(txt) } catch { /* fall through */ }
                        }
                        if (!res.ok || !data) {
                          // Status-aware fallback message. 504 / 502 / "An error
                          // occurred" almost always means Vercel timeout for this
                          // route; any other non-JSON is a server crash.
                          const looksTimeout = res.status === 504 || res.status === 502
                            || /^An error occurred/i.test(trimmed)
                          const fallback = looksTimeout
                            ? 'AI ran past the 2-minute server limit on this program. Long multi-week programs sometimes need to be split — try uploading weeks 1-4 and 5-8 as separate templates, or simplify the file (one week per page is faster than dense per-set tables). The week tools in the editor will let you copy weeks across.'
                            : `Server returned a non-JSON response (status ${res.status}). This usually means the function crashed — please try again in a moment.`
                          setImportError(data?.error || fallback)
                          setImportLoading(false); return
                        }
                        setImportProposal(data)
                        setImportTemplateName(data?.name || importFile.name.replace(/\.(pdf|xlsx?|csv)$/i, ''))
                      } catch (e: any) {
                        setImportError(e?.message || 'Network error')
                      }
                      setImportLoading(false)
                    }}
                    disabled={!importFile || importLoading}
                    style={{ width:'100%', marginTop:14, padding:'13px', borderRadius:11, border:'none', background: !importFile || importLoading ? t.surfaceHigh : 'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', color: !importFile || importLoading ? t.textMuted : '#fff', fontSize:14, fontWeight:800, cursor: !importFile || importLoading ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {importLoading ? 'Parsing every week… (30–120s for long programs)' : '✨ Translate with AI'}
                  </button>

                  {importError && (
                    <div style={{ marginTop:12, padding:'10px 12px', background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:9, fontSize:12, color:t.red }}>
                      {importError}
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: proposal review — visible once Claude returns */}
              {importProposal && !importSaveResult && (
                <div style={{ marginTop:18, display:'flex', flexDirection:'column', gap:14 }}>
                  <div style={{ background:t.surfaceHigh, borderRadius:10, padding:'12px 14px' }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:6 }}>Template name</div>
                    <input
                      value={importTemplateName}
                      onChange={e => setImportTemplateName(e.target.value)}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:8, padding:'9px 11px', fontSize:13, fontWeight:700, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const }}/>
                    {importProposal.weekly_split && (
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:8 }}>{importProposal.weekly_split}</div>
                    )}
                  </div>

                  {importProposal.rationale && (
                    <div style={{ fontSize:12, color:t.textDim, lineHeight:1.6, whiteSpace:'pre-wrap' as const }}>{importProposal.rationale}</div>
                  )}

                  {/* Compact week/day/exercise summary — collapsed enough
                      to scan but detailed enough to verify accuracy. */}
                  {Array.isArray(importProposal.weeks) && importProposal.weeks.map((w: any, wi: number) => (
                    <div key={wi} style={{ background:t.purple+'0d', border:'1px solid '+t.purple+'30', borderRadius:10, padding:'10px 12px' }}>
                      <div style={{ fontSize:12, fontWeight:800, color:t.purple, marginBottom:8 }}>Week {w.week ?? wi+1}{w.focus ? ' · ' + w.focus : ''}{w.deload ? ' · DELOAD' : ''}</div>
                      {Array.isArray(w.days) && w.days.map((d: any, di: number) => (
                        <div key={di} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', marginBottom:6 }}>
                          <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>
                            {d.day || `Day ${di+1}`}{d.label ? ' · ' + d.label : ''}
                          </div>
                          {Array.isArray(d.exercises) && d.exercises.map((ex: any, ei: number) => (
                            <div key={ei} style={{ fontSize:11, color:t.textDim, lineHeight:1.5, paddingLeft:8 }}>
                              • <strong style={{ color:t.text }}>{ex.name || '?'}</strong>
                              {' '}— {ex.sets ?? '?'}×{ex.reps ?? '?'}
                              {ex.load_guidance ? ` · ${ex.load_guidance}` : ''}
                              {ex.rest_seconds ? ` · ${ex.rest_seconds}s rest` : ''}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}

                  {importProposal.coach_notes && (
                    <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:9, padding:'10px 12px', fontSize:12, color:t.text, lineHeight:1.5, whiteSpace:'pre-wrap' as const }}>
                      <strong style={{ color:t.teal }}>Coach notes:</strong> {importProposal.coach_notes}
                    </div>
                  )}

                  {/* Save / discard / re-translate */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' as const, marginTop:6 }}>
                    <button
                      onClick={async () => {
                        if (!importTemplateName.trim()) { setImportError('Template name required'); return }
                        setImportSaving(true); setImportError(null)
                        try {
                          const res = await fetch('/api/ai-program/save', {
                            method:'POST',
                            headers:{ 'Content-Type':'application/json' },
                            body: JSON.stringify({
                              asTemplate: true,
                              programName: importTemplateName.trim(),
                              proposal: importProposal,
                              meta: importProposal?.meta,
                            }),
                          })
                          const data = await res.json()
                          if (!res.ok) { setImportError(data?.error || 'Save failed'); setImportSaving(false); return }
                          setImportSaveResult(data)
                          await load()
                        } catch (e: any) {
                          setImportError(e?.message || 'Network error')
                        }
                        setImportSaving(false)
                      }}
                      disabled={importSaving || !importTemplateName.trim()}
                      style={{ flex:'1 1 200px', padding:'12px', borderRadius:11, border:'none', background: importSaving ? t.surfaceHigh : 'linear-gradient(135deg,'+t.green+','+t.green+'cc)', color: importSaving ? t.textMuted : '#000', fontSize:14, fontWeight:800, cursor: importSaving ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {importSaving ? 'Saving…' : '💾 Save as Template'}
                    </button>
                    <button
                      onClick={()=>{ setImportProposal(null); setImportError(null); setImportTemplateName('') }}
                      disabled={importSaving}
                      style={{ background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'12px 16px', fontSize:13, fontWeight:700, color:t.textMuted, cursor: importSaving ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      ↻ Try again
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: success — green confirmation card with counts */}
              {importSaveResult && (
                <div style={{ marginTop:18, background:t.greenDim, border:'1px solid '+t.green+'40', borderRadius:11, padding:'14px 16px', display:'flex', flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:t.green }}>✓ Template saved — "{importSaveResult.program_name}"</div>
                  <div style={{ fontSize:12, color:t.text }}>
                    Created <strong>{importSaveResult.blocks_created}</strong> workout block{importSaveResult.blocks_created === 1 ? '' : 's'} with <strong>{importSaveResult.exercises_created}</strong> exercise{importSaveResult.exercises_created === 1 ? '' : 's'}.
                  </div>
                  {importSaveResult.warning && (
                    <div style={{ fontSize:12, color:t.orange, padding:'8px 10px', background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:8 }}>
                      ⚠ {importSaveResult.warning}
                      {Array.isArray(importSaveResult.unresolved_names) && importSaveResult.unresolved_names.length > 0 && (
                        <div style={{ marginTop:4, fontSize:11, color:t.textDim }}>
                          {importSaveResult.unresolved_names.slice(0, 6).join(' · ')}
                          {importSaveResult.unresolved_names.length > 6 && ` · +${importSaveResult.unresolved_names.length - 6} more`}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display:'flex', gap:8, marginTop:6, flexWrap:'wrap' as const }}>
                    <button
                      onClick={()=>{ setImportFile(null); setImportProposal(null); setImportSaveResult(null); setImportError(null); setImportTemplateName('') }}
                      style={{ background:'transparent', border:'1px solid '+t.border, borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Import another
                    </button>
                    <button
                      onClick={()=>setShowImport(false)}
                      style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Done — close
                    </button>
                    {importSaveResult.program_id && (
                      <button
                        onClick={()=>router.push(`/dashboard/coach/programs/${importSaveResult.program_id}`)}
                        style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Open template →
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </>
  )
}
