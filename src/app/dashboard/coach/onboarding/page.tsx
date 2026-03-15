'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e', greenDim:'#22c55e15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

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

type Question = {
  id: string; form_id: string; sort_order: number; question_type: string
  label: string; placeholder?: string; helper_text?: string; required: boolean
  options?: string[]; scale_min?: number; scale_max?: number
  scale_min_label?: string; scale_max_label?: string
}

type Form = { id: string; title: string; description: string; is_default: boolean }

export default function OnboardingBuilderPage() {
  const supabase = createClient()
  const router = useRouter()
  const [coachId, setCoachId] = useState<string|null>(null)
  const [forms, setForms] = useState<Form[]>([])
  const [activeForm, setActiveForm] = useState<Form|null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [addingType, setAddingType] = useState(false)
  const [editingQ, setEditingQ] = useState<Question|null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      const { data } = await supabase.from('onboarding_forms').select('*').eq('coach_id', user.id).order('created_at')
      setForms(data || [])
      if (data && data.length > 0) loadForm(data[0])
      else setLoading(false)
    }
    load()
  }, [])

  const loadForm = async (form: Form) => {
    setActiveForm(form)
    const { data } = await supabase.from('onboarding_questions').select('*').eq('form_id', form.id).order('sort_order')
    setQuestions(data || [])
    setLoading(false)
  }

  const createForm = async () => {
    if (!coachId) return
    const { data } = await supabase.from('onboarding_forms').insert({ coach_id: coachId, title: 'New Onboarding Form' }).select().single()
    if (data) { setForms(p => [...p, data]); loadForm(data) }
  }

  const saveFormMeta = async (title: string, description: string) => {
    if (!activeForm) return
    await supabase.from('onboarding_forms').update({ title, description }).eq('id', activeForm.id)
    setForms(p => p.map(f => f.id === activeForm.id ? { ...f, title, description } : f))
    setActiveForm(p => p ? { ...p, title, description } : p)
  }

  const setDefault = async (formId: string) => {
    if (!coachId) return
    await supabase.from('onboarding_forms').update({ is_default: false }).eq('coach_id', coachId)
    await supabase.from('onboarding_forms').update({ is_default: true }).eq('id', formId)
    setForms(p => p.map(f => ({ ...f, is_default: f.id === formId })))
    setActiveForm(p => p ? { ...p, is_default: p.id === formId } : p)
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
    newQs[idx] = { ...swap, sort_order: newQs[idx + dir].sort_order - dir }
    newQs.sort((a, b) => a.sort_order - b.sort_order)
    setQuestions(newQs)
    await Promise.all([
      supabase.from('onboarding_questions').update({ sort_order: newQs[idx].sort_order }).eq('id', newQs[idx].id),
      supabase.from('onboarding_questions').update({ sort_order: newQs[idx+dir].sort_order }).eq('id', newQs[idx+dir].id),
    ])
  }

  const sty = {
    input: { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any },
    label: { fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as any, letterSpacing:'0.08em', marginBottom:5, display:'block' },
  }

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>Loading...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'18px 20px', display:'flex', alignItems:'center', gap:12, borderBottom:'1px solid '+t.border }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ fontSize:18, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', flex:1 }}>Onboarding Form Builder</div>
          <button onClick={createForm} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'7px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ New Form</button>
        </div>

        <div style={{ display:'flex', flex:1, minHeight:0 }}>
          {/* Form list sidebar */}
          <div style={{ width:220, borderRight:'1px solid '+t.border, padding:12, display:'flex', flexDirection:'column', gap:6 }}>
            {forms.length === 0 && <div style={{ fontSize:12, color:t.textMuted, padding:'8px 4px' }}>No forms yet. Create one!</div>}
            {forms.map(f => (
              <button key={f.id} onClick={()=>loadForm(f)}
                style={{ padding:'10px 12px', borderRadius:10, textAlign:'left', cursor:'pointer', border:'1px solid '+(activeForm?.id===f.id?t.teal+'60':t.border), background:activeForm?.id===f.id?t.tealDim:'transparent', fontFamily:"'DM Sans',sans-serif" }}>
                <div style={{ fontSize:13, fontWeight:700, color:activeForm?.id===f.id?t.teal:t.text, marginBottom:2 }}>{f.title}</div>
                {f.is_default && <div style={{ fontSize:10, color:t.teal, fontWeight:800 }}>DEFAULT</div>}
              </button>
            ))}
          </div>

          {/* Form editor */}
          {!activeForm ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:t.textMuted }}>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No form selected</div>
                <button onClick={createForm} style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Create Your First Form</button>
              </div>
            </div>
          ) : (
            <div style={{ flex:1, padding:20, overflowY:'auto', maxWidth:640 }}>
              {/* Form meta */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16, marginBottom:16 }}>
                <div style={{ display:'flex', gap:12, marginBottom:12 }}>
                  <div style={{ flex:1 }}>
                    <label style={sty.label}>Form Title</label>
                    <input defaultValue={activeForm.title} onBlur={e=>saveFormMeta(e.target.value, activeForm.description)} style={sty.input} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, justifyContent:'flex-end' }}>
                    {!activeForm.is_default && <button onClick={()=>setDefault(activeForm.id)} style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>Set Default</button>}
                    {activeForm.is_default && <div style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, background:t.greenDim, color:t.green, textAlign:'center' }}>✓ Default</div>}
                    <button onClick={()=>deleteForm(activeForm.id)} style={{ padding:'6px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Delete Form</button>
                  </div>
                </div>
                <label style={sty.label}>Description (shown to client)</label>
                <input defaultValue={activeForm.description||''} onBlur={e=>saveFormMeta(activeForm.title, e.target.value)} placeholder="A short intro for your new clients..." style={sty.input} />
              </div>

              {/* Questions */}
              <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:14 }}>
                {questions.map((q, idx) => (
                  <div key={q.id} style={{ background:t.surface, border:'1px solid '+(editingQ?.id===q.id?t.teal+'60':t.border), borderRadius:14, padding:'12px 14px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, background:t.surfaceHigh, borderRadius:6, padding:'3px 8px', flexShrink:0 }}>
                        {QUESTION_TYPES.find(x=>x.val===q.question_type)?.icon} {QUESTION_TYPES.find(x=>x.val===q.question_type)?.label}
                      </div>
                      <div style={{ flex:1, fontSize:14, fontWeight:700 }}>{q.label}</div>
                      {q.required && <div style={{ fontSize:10, color:t.orange, fontWeight:800 }}>REQUIRED</div>}
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={()=>moveQuestion(q.id,-1)} disabled={idx===0} style={{ background:'none', border:'none', color:idx===0?t.textMuted:t.textDim, cursor:idx===0?'not-allowed':'pointer', fontSize:14 }}>↑</button>
                        <button onClick={()=>moveQuestion(q.id,1)} disabled={idx===questions.length-1} style={{ background:'none', border:'none', color:idx===questions.length-1?t.textMuted:t.textDim, cursor:idx===questions.length-1?'not-allowed':'pointer', fontSize:14 }}>↓</button>
                        <button onClick={()=>setEditingQ(editingQ?.id===q.id?null:q)} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:6, padding:'4px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{editingQ?.id===q.id?'Done':'Edit'}</button>
                        <button onClick={()=>deleteQuestion(q.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:6, padding:'4px 8px', fontSize:11, color:t.red, cursor:'pointer' }}>✕</button>
                      </div>
                    </div>

                    {/* Question editor */}
                    {editingQ?.id === q.id && (
                      <QuestionEditor q={editingQ} onChange={setEditingQ} onSave={updateQuestion} styles={sty} t={t} />
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
                  <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, marginBottom:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>Choose Question Type</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {QUESTION_TYPES.map(qt => (
                      <button key={qt.val} onClick={()=>addQuestion(qt.val)}
                        style={{ padding:'10px 12px', borderRadius:10, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.text, fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
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

// ── Question editor sub-component ─────────────────────────────────────────
function QuestionEditor({ q, onChange, onSave, styles: sty, t }: any) {
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
        <label style={sty.label}>Placeholder / Helper Text</label>
        <input value={q.placeholder||''} onChange={e=>set('placeholder',e.target.value)} placeholder="e.g. Be as specific as possible..." style={sty.input} />
      </div>
      <div>
        <label style={sty.label}>Helper Text (shown below field)</label>
        <input value={q.helper_text||''} onChange={e=>set('helper_text',e.target.value)} style={sty.input} />
      </div>

      {/* Scale config */}
      {q.question_type === 'scale' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <div><label style={sty.label}>Min Label</label><input value={q.scale_min_label||''} onChange={e=>set('scale_min_label',e.target.value)} placeholder="Not at all" style={sty.input} /></div>
          <div><label style={sty.label}>Max Label</label><input value={q.scale_max_label||''} onChange={e=>set('scale_max_label',e.target.value)} placeholder="Extremely" style={sty.input} /></div>
        </div>
      )}

      {/* Radio/checkbox options */}
      {['radio','checkbox'].includes(q.question_type) && (
        <div>
          <label style={sty.label}>Options</label>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {(q.options||[]).map((opt: string, i: number) => (
              <div key={i} style={{ display:'flex', gap:6 }}>
                <input value={opt} onChange={e=>setOption(i,e.target.value)} style={{ ...sty.input, flex:1 }} />
                <button onClick={()=>set('options',(q.options||[]).filter((_:any,j:number)=>j!==i))}
                  style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:7, padding:'0 10px', color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontSize:13 }}>✕</button>
              </div>
            ))}
            <button onClick={()=>set('options',[...(q.options||[]),'New Option'])}
              style={{ padding:'7px', borderRadius:8, border:'1px dashed '+t.border, background:'transparent', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add Option</button>
          </div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <input type="checkbox" id={`req-${q.id}`} checked={q.required} onChange={e=>set('required',e.target.checked)} style={{ width:16, height:16, accentColor:t.teal }} />
        <label htmlFor={`req-${q.id}`} style={{ fontSize:13, cursor:'pointer', color:t.textDim }}>Required</label>
      </div>

      <button onClick={()=>onSave(q)}
        style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:9, padding:'9px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", alignSelf:'flex-start' }}>
        Save Question
      </button>
    </div>
  )
}
