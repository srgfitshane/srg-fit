'use client'
import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', purple:'#8b5cf6', purpleDim:'#8b5cf615',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const FORM_TYPES = [
  { val:'check_in',        label:'Check-In',          icon:'✅', color:'#8b5cf6', desc:'Weekly or scheduled check-ins from clients. Answers save to check-in history.' },
  { val:'onboarding',      label:'Onboarding',         icon:'👋', color:'#00c9b1', desc:'Sent automatically when a client is invited. Collects intake info.' },
  { val:'intake',          label:'Intake / Assessment',icon:'📋', color:'#f5a623', desc:'Health history, goals, or detailed intake forms. Send manually.' },
  { val:'survey',          label:'Survey',             icon:'📊', color:'#60a5fa', desc:'General feedback or one-off questions. Send any time.' },
  { val:'terms_conditions',label:'Terms & Conditions', icon:'📜', color:'#22c55e', desc:'Liability waivers or agreements. Client must complete before onboarding.' },
]

const QUESTION_TYPES = [
  { val:'text',     label:'Short Text',    icon:'✏️' },
  { val:'textarea', label:'Long Text',     icon:'📝' },
  { val:'number',   label:'Number',        icon:'🔢' },
  { val:'scale',    label:'Scale (1-10)',  icon:'📊' },
  { val:'radio',    label:'Single Choice', icon:'🔘' },
  { val:'checkbox', label:'Multi Choice',  icon:'☑️' },
  { val:'date',     label:'Date',          icon:'📅' },
  { val:'file',     label:'File Upload',   icon:'📎' },
]

const CHECKIN_FIELD_OPTIONS = [
  { val:'',                    label:'— Not mapped —' },
  { val:'weight',              label:'Weight (lbs)' },
  { val:'sleep_hours',         label:'Sleep Hours' },
  { val:'sleep_quality',       label:'Sleep Quality (1-10)' },
  { val:'mood_score',          label:'Mood Score (1-10)' },
  { val:'energy_score',        label:'Energy (1-10)' },
  { val:'stress',              label:'Stress (1-10)' },
  { val:'hunger_score',        label:'Hunger (1-10)' },
  { val:'pain_score',          label:'Pain Level (1-10)' },
  { val:'pain_notes',          label:'Pain Notes (text)' },
  { val:'workout_adherence',   label:'Workout Adherence (0-100)' },
  { val:'nutrition_adherence', label:'Nutrition Adherence (0-100)' },
  { val:'habit_adherence',     label:'Habit Adherence (0-100)' },
  { val:'wins',                label:'Wins (text)' },
  { val:'struggles',           label:'Struggles (text)' },
  { val:'goals_next_week',     label:'Goals Next Week (text)' },
  { val:'coach_message',       label:'Message to Coach (text)' },
]

type Question = {
  id: string; form_id: string; sort_order: number; question_type: string
  label: string; placeholder?: string; helper_text?: string; required: boolean
  options?: string[]; scale_min?: number; scale_max?: number
  scale_min_label?: string; scale_max_label?: string; maps_to?: string
}

type Form = {
  id: string; title: string; description: string
  form_type: string; is_default: boolean
  is_checkin_type: boolean
}

export default function FormsBuilderPage() {
  return <Suspense fallback={null}><FormsBuilderInner /></Suspense>
}

function FormsBuilderInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [coachId, setCoachId] = useState<string|null>(null)
  const [forms, setForms] = useState<Form[]>([])
  const [activeForm, setActiveForm] = useState<Form|null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [addingType, setAddingType] = useState(false)
  const [editingQ, setEditingQ] = useState<Question|null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [creating, setCreating] = useState(false)
  const [newFormType, setNewFormType] = useState<string>('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      const { data } = await supabase.from('onboarding_forms').select('*').eq('coach_id', user.id).order('form_type').order('created_at')
      setForms(data || [])
      const editId = searchParams.get('edit')
      const target = editId ? data?.find((f:any) => f.id === editId) : null
      if (target) loadForm(target)
      else setLoading(false)
    }
    load()
  }, [])

  const loadForm = async (form: Form) => {
    setActiveForm(form)
    setCreating(false)
    const { data } = await supabase.from('onboarding_questions').select('*').eq('form_id', form.id).order('sort_order')
    setQuestions(data || [])
    setLoading(false)
  }

  const createForm = async (type: string) => {
    if (!coachId) return
    const typeLabel = FORM_TYPES.find(t => t.val === type)?.label || 'Form'
    const { data } = await supabase.from('onboarding_forms').insert({
      coach_id: coachId,
      title: `New ${typeLabel}`,
      form_type: type,
      is_checkin_type: type === 'check_in',
    }).select().single()
    if (data) { setForms(p => [...p, data]); loadForm(data) }
    setCreating(false); setNewFormType('')
  }

  const saveFormMeta = async (patch: Partial<Form>) => {
    if (!activeForm) return
    // Keep is_checkin_type in sync with form_type
    if (patch.form_type) patch.is_checkin_type = patch.form_type === 'check_in'
    await supabase.from('onboarding_forms').update(patch).eq('id', activeForm.id)
    const updated = { ...activeForm, ...patch }
    setForms(p => p.map(f => f.id === activeForm.id ? updated : f))
    setActiveForm(updated)
  }

  const duplicateForm = async () => {
    if (!activeForm || !coachId) return
    const { data: newForm } = await supabase.from('onboarding_forms').insert({
      coach_id: coachId,
      title: activeForm.title + ' (copy)',
      description: activeForm.description,
      form_type: activeForm.form_type,
      is_checkin_type: activeForm.is_checkin_type,
    }).select().single()
    if (!newForm) return
    if (questions.length > 0) {
      await supabase.from('onboarding_questions').insert(
        questions.map(q => ({ ...q, id: undefined, form_id: newForm.id }))
      )
    }
    setForms(p => [...p, newForm])
    loadForm(newForm)
  }

  const deleteForm = async (formId: string) => {
    await supabase.from('onboarding_forms').delete().eq('id', formId)
    const remaining = forms.filter(f => f.id !== formId)
    setForms(remaining)
    if (remaining.length > 0) loadForm(remaining[0])
    else { setActiveForm(null); setQuestions([]) }
  }

  const addQuestion = async (type: string) => {
    if (!activeForm) return
    const maxOrder = questions.length > 0 ? Math.max(...questions.map(q => q.sort_order)) : -1
    const { data } = await supabase.from('onboarding_questions').insert({
      form_id: activeForm.id, question_type: type, sort_order: maxOrder + 1,
      label: 'New Question', required: true,
      options: ['radio','checkbox'].includes(type) ? ['Option A','Option B'] : null
    }).select().single()
    if (data) { setQuestions(p => [...p, data]); setEditingQ(data) }
    setAddingType(false)
  }

  const updateQuestion = async (q: Question) => {
    await supabase.from('onboarding_questions').update(q).eq('id', q.id)
    setQuestions(p => p.map(x => x.id === q.id ? q : x))
    setEditingQ(null)
  }

  const deleteQuestion = async (id: string) => {
    await supabase.from('onboarding_questions').delete().eq('id', id)
    setQuestions(p => p.filter(q => q.id !== id))
  }

  const moveQuestion = async (id: string, dir: -1|1) => {
    const idx = questions.findIndex(q => q.id === id)
    if ((dir === -1 && idx === 0) || (dir === 1 && idx === questions.length - 1)) return
    const newQs = [...questions]
    const swap = newQs[idx + dir]
    newQs[idx + dir] = { ...newQs[idx], sort_order: swap.sort_order }
    newQs[idx] = { ...swap, sort_order: newQs[idx].sort_order }
    newQs.sort((a, b) => a.sort_order - b.sort_order)
    setQuestions(newQs)
    await Promise.all([
      supabase.from('onboarding_questions').update({ sort_order: newQs[idx].sort_order }).eq('id', newQs[idx].id),
      supabase.from('onboarding_questions').update({ sort_order: newQs[idx+dir].sort_order }).eq('id', newQs[idx+dir].id),
    ])
  }

  const sty = {
    input: { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any, colorScheme:'dark' as any },
    label: { fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as any, letterSpacing:'0.08em', marginBottom:5, display:'block' },
  }

  const filteredForms = filterType === 'all' ? forms : forms.filter(f => f.form_type === filterType)
  const activeTypeMeta = FORM_TYPES.find(ft => ft.val === activeForm?.form_type)

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>Loading...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid '+t.border }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ fontSize:17, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', flex:1 }}>
            Form Builder
          </div>
          <button onClick={()=>setCreating(true)}
            style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:9, padding:'8px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Form
          </button>
        </div>

        <div style={{ display:'flex', flex:1, minHeight:0 }}>

          {/* ── Sidebar ── */}
          <div style={{ width:240, borderRight:'1px solid '+t.border, display:'flex', flexDirection:'column', overflowY:'auto' }}>
            {/* Type filter tabs */}
            <div style={{ padding:'10px 10px 6px', display:'flex', flexDirection:'column', gap:4, borderBottom:'1px solid '+t.border }}>
              <div style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', padding:'0 4px', marginBottom:2 }}>Filter by Type</div>
              {[{ val:'all', label:'All Forms', icon:'📁' }, ...FORM_TYPES].map(ft => {
                const count = ft.val === 'all' ? forms.length : forms.filter(f => f.form_type === ft.val).length
                if (count === 0 && ft.val !== 'all') return null
                return (
                  <button key={ft.val} onClick={() => setFilterType(ft.val)}
                    style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 10px', borderRadius:8, border:'none', background:filterType===ft.val?t.surfaceHigh:'transparent', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const }}>
                    <span style={{ fontSize:14 }}>{ft.icon}</span>
                    <span style={{ fontSize:12, fontWeight:filterType===ft.val?700:500, color:filterType===ft.val?t.text:t.textDim, flex:1 }}>{ft.label}</span>
                    <span style={{ fontSize:10, color:t.textMuted }}>{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Form list */}
            <div style={{ padding:8, display:'flex', flexDirection:'column', gap:4, flex:1 }}>
              {filteredForms.length === 0 && (
                <div style={{ fontSize:12, color:t.textMuted, padding:'12px 8px', textAlign:'center' as const }}>
                  No forms yet.<br/>Hit "+ New Form" to start.
                </div>
              )}
              {filteredForms.map(f => {
                const meta = FORM_TYPES.find(ft => ft.val === f.form_type)
                return (
                  <button key={f.id} onClick={() => loadForm(f)}
                    style={{ padding:'10px 12px', borderRadius:10, textAlign:'left' as const, cursor:'pointer', border:'1px solid '+(activeForm?.id===f.id?t.teal+'60':t.border), background:activeForm?.id===f.id?t.tealDim:'transparent', fontFamily:"'DM Sans',sans-serif" }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:3 }}>
                      <span style={{ fontSize:13 }}>{meta?.icon||'📋'}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:activeForm?.id===f.id?t.teal:t.text }}>{f.title}</span>
                    </div>
                    <div style={{ fontSize:10, fontWeight:700, color: meta?.color || t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>
                      {meta?.label || f.form_type}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* ── Create new form modal ── */}
          {creating && (
            <div style={{ flex:1, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:'40px 20px' }}>
              <div style={{ width:'100%', maxWidth:560 }}>
                <div style={{ fontSize:18, fontWeight:900, marginBottom:6 }}>What kind of form?</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>The type tells the system where to file responses and when to use this form.</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {FORM_TYPES.map(ft => (
                    <button key={ft.val} onClick={() => createForm(ft.val)}
                      style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 18px', borderRadius:14, border:'2px solid '+t.border, background:t.surface, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, transition:'border-color 0.15s' }}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=ft.color+'80')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                      <span style={{ fontSize:28 }}>{ft.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:ft.color, marginBottom:3 }}>{ft.label}</div>
                        <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5 }}>{ft.desc}</div>
                      </div>
                      <span style={{ color:t.textMuted, fontSize:16 }}>→</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setCreating(false)}
                  style={{ marginTop:16, background:'none', border:'1px solid '+t.border, borderRadius:9, padding:'8px 18px', fontSize:12, fontWeight:600, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* ── Editor ── */}
          {!creating && !activeForm && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:t.textMuted }}>
              <div style={{ textAlign:'center' as const }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Select a form to edit</div>
                <button onClick={()=>setCreating(true)} style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Create Your First Form
                </button>
              </div>
            </div>
          )}

          {!creating && activeForm && (
            <div style={{ flex:1, padding:20, overflowY:'auto', maxWidth:680 }}>

              {/* Form type badge + meta */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:18, marginBottom:16 }}>

                {/* Type badge + rename */}
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                  <div style={{ flex:1 }}>
                    <label style={sty.label}>Form Title</label>
                    <input defaultValue={activeForm.title} onBlur={e=>saveFormMeta({ title: e.target.value })} style={sty.input} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, paddingTop:20 }}>
                    <button onClick={duplicateForm}
                      style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                      📋 Duplicate
                    </button>
                    <button onClick={()=>deleteForm(activeForm.id)}
                      style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Description */}
                <div style={{ marginBottom:14 }}>
                  <label style={sty.label}>Description (shown to client)</label>
                  <input defaultValue={activeForm.description||''} onBlur={e=>saveFormMeta({ description: e.target.value })} placeholder="A short intro shown at the top of the form..." style={sty.input} />
                </div>

                {/* Form type selector */}
                <div>
                  <label style={sty.label}>Form Type</label>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {FORM_TYPES.map(ft => (
                      <button key={ft.val} onClick={() => saveFormMeta({ form_type: ft.val })}
                        style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:10, border:'2px solid '+(activeForm.form_type===ft.val?ft.color+'80':t.border), background:activeForm.form_type===ft.val?ft.color+'15':t.surfaceHigh, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, transition:'all 0.15s' }}>
                        <span style={{ fontSize:18 }}>{ft.icon}</span>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, color:activeForm.form_type===ft.val?ft.color:t.text }}>{ft.label}</div>
                          <div style={{ fontSize:10, color:t.textMuted, lineHeight:1.4 }}>{ft.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {activeTypeMeta && (
                    <div style={{ marginTop:10, background:activeTypeMeta.color+'12', border:'1px solid '+activeTypeMeta.color+'30', borderRadius:9, padding:'8px 12px', fontSize:12, color:activeTypeMeta.color, display:'flex', alignItems:'center', gap:8 }}>
                      <span>{activeTypeMeta.icon}</span>
                      <span><strong>{activeTypeMeta.label}:</strong> {activeTypeMeta.desc}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Questions */}
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                {questions.length === 0 && (
                  <div style={{ background:t.surface, border:'1px dashed '+t.border, borderRadius:14, padding:'32px 20px', textAlign:'center' as const, color:t.textMuted, fontSize:13 }}>
                    No questions yet. Add your first one below.
                  </div>
                )}
                {questions.map((q, idx) => (
                  <div key={q.id} style={{ background:t.surface, border:'1px solid '+(editingQ?.id===q.id?t.teal+'60':t.border), borderRadius:14, padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, background:t.surfaceHigh, borderRadius:6, padding:'3px 8px', flexShrink:0 }}>
                        {QUESTION_TYPES.find(x=>x.val===q.question_type)?.icon} {QUESTION_TYPES.find(x=>x.val===q.question_type)?.label}
                      </div>
                      <div style={{ flex:1, fontSize:13, fontWeight:700 }}>{q.label}</div>
                      {q.required && <div style={{ fontSize:10, color:t.orange, fontWeight:800 }}>REQ</div>}
                      {q.maps_to && <div style={{ fontSize:10, color:'#8b5cf6', fontWeight:800, background:'#8b5cf615', borderRadius:6, padding:'2px 6px' }}>→ {q.maps_to}</div>}
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>moveQuestion(q.id,-1)} disabled={idx===0} style={{ background:'none', border:'none', color:idx===0?t.textMuted:t.textDim, cursor:idx===0?'not-allowed':'pointer', fontSize:14 }}>↑</button>
                        <button onClick={()=>moveQuestion(q.id,1)} disabled={idx===questions.length-1} style={{ background:'none', border:'none', color:idx===questions.length-1?t.textMuted:t.textDim, cursor:idx===questions.length-1?'not-allowed':'pointer', fontSize:14 }}>↓</button>
                        <button onClick={()=>setEditingQ(editingQ?.id===q.id?null:q)} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{editingQ?.id===q.id?'Done':'Edit'}</button>
                        <button onClick={()=>deleteQuestion(q.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:6, padding:'4px 8px', fontSize:11, color:t.red, cursor:'pointer' }}>✕</button>
                      </div>
                    </div>
                    {editingQ?.id === q.id && (
                      <QuestionEditor q={editingQ} onChange={setEditingQ} onSave={updateQuestion} styles={sty} t={t} isCheckinForm={activeForm.form_type === 'check_in'} />
                    )}
                  </div>
                ))}
              </div>

              {/* Add question */}
              {!addingType ? (
                <button onClick={()=>setAddingType(true)} style={{ width:'100%', padding:'12px', borderRadius:12, border:'2px dashed '+t.border, background:'transparent', color:t.textMuted, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Add Question
                </button>
              ) : (
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:14 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, marginBottom:10, textTransform:'uppercase' as const, letterSpacing:'0.08em' }}>Choose Question Type</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {QUESTION_TYPES.map(qt => (
                      <button key={qt.val} onClick={()=>addQuestion(qt.val)}
                        style={{ padding:'10px 12px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.text, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:18 }}>{qt.icon}</span>{qt.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={()=>setAddingType(false)} style={{ marginTop:10, width:'100%', padding:'8px', borderRadius:9, border:'1px solid '+t.border, background:'transparent', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── Question editor ───────────────────────────────────────────────────────
function QuestionEditor({ q, onChange, onSave, styles: sty, t, isCheckinForm }: any) {
  const set = (field: string, val: any) => onChange((p: any) => ({ ...p, [field]: val }))
  const setOption = (idx: number, val: string) => {
    const opts = [...(q.options || [])]
    opts[idx] = val
    set('options', opts)
  }
  return (
    <div style={{ borderTop:'1px solid '+t.border, marginTop:12, paddingTop:12, display:'flex', flexDirection:'column', gap:12 }}>
      <div>
        <label style={sty.label}>Question Label *</label>
        <input value={q.label} onChange={e=>set('label',e.target.value)} style={sty.input} />
      </div>
      <div>
        <label style={sty.label}>Placeholder</label>
        <input value={q.placeholder||''} onChange={e=>set('placeholder',e.target.value)} placeholder="e.g. Be as specific as possible..." style={sty.input} />
      </div>
      <div>
        <label style={sty.label}>Helper Text (shown below field)</label>
        <input value={q.helper_text||''} onChange={e=>set('helper_text',e.target.value)} style={sty.input} />
      </div>
      {q.question_type === 'scale' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><label style={sty.label}>Min Label</label><input value={q.scale_min_label||''} onChange={e=>set('scale_min_label',e.target.value)} placeholder="Not at all" style={sty.input} /></div>
          <div><label style={sty.label}>Max Label</label><input value={q.scale_max_label||''} onChange={e=>set('scale_max_label',e.target.value)} placeholder="Extremely" style={sty.input} /></div>
        </div>
      )}
      {['radio','checkbox'].includes(q.question_type) && (
        <div>
          <label style={sty.label}>Options</label>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {(q.options||[]).map((opt: string, i: number) => (
              <div key={i} style={{ display:'flex', gap:6 }}>
                <input value={opt} onChange={e=>setOption(i,e.target.value)} style={{ ...sty.input, flex:1 }} />
                <button onClick={()=>set('options',(q.options||[]).filter((_:any,j:number)=>j!==i))} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'0 10px', color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>✕</button>
              </div>
            ))}
            <button onClick={()=>set('options',[...(q.options||[]),'New Option'])} style={{ padding:'7px', borderRadius:8, border:'1px dashed '+t.border, background:'transparent', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add Option</button>
          </div>
        </div>
      )}
      {/* Maps-to only shown for check-in forms */}
      {isCheckinForm && (
        <div style={{ background:'#8b5cf615', border:'1px solid #8b5cf640', borderRadius:10, padding:'10px 12px' }}>
          <label style={{ ...sty.label, color:'#8b5cf6' }}>Maps to Check-in Field</label>
          <select value={q.maps_to||''} onChange={e=>set('maps_to', e.target.value||null)} style={{ ...sty.input, background:t.surfaceHigh, appearance:'none' as any }}>
            {CHECKIN_FIELD_OPTIONS.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
          </select>
          <div style={{ fontSize:10, color:'#8b5cf6', marginTop:5 }}>
            When submitted, this answer is also saved to the client's structured check-in record.
          </div>
        </div>
      )}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <input type="checkbox" id={`req-${q.id}`} checked={q.required} onChange={e=>set('required',e.target.checked)} style={{ width:16, height:16, accentColor:t.teal }} />
        <label htmlFor={`req-${q.id}`} style={{ fontSize:13, cursor:'pointer', color:t.textDim }}>Required</label>
      </div>
      <button onClick={()=>onSave(q)} style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:9, padding:'9px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", alignSelf:'flex-start' as const }}>
        Save Question
      </button>
    </div>
  )
}
