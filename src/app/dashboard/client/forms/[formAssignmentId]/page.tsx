'use client'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const t = {
  bg:"var(--bg)", surface:"var(--surface)", surfaceUp:"var(--surface-up)", surfaceHigh:"var(--surface-high)",
  border:"var(--border)", teal:"var(--teal)", tealDim:"var(--teal-dim)", orange:"var(--orange)",
  orangeDim:"var(--orange-dim)", red:"var(--red)", redDim:"var(--red-dim)",
  green:"var(--green)", greenDim:"var(--green-dim)", purple:"var(--purple)",
  text:"var(--text)", textMuted:"var(--text-muted)", textDim:"var(--text-dim)",
}

type Question = {
  id: string; sort_order: number; question_type: string; label: string
  placeholder?: string; helper_text?: string; required: boolean
  options?: string[]; scale_min?: number; scale_max?: number
  scale_min_label?: string; scale_max_label?: string; maps_to?: string
}

type AssignmentForm = {
  id: string
  title: string
  description?: string | null
  form_type?: string | null
  is_checkin_type?: boolean | null
}

type FormAssignment = {
  id: string
  client_id: string
  form_id: string
  status: string
  note?: string | null
  response?: Record<string, AnswerValue> | null
  form?: AssignmentForm | null
}

type AnswerValue = string | number | string[] | null

type CheckinRow = {
  client_id: string
  coach_id?: string | null
  submitted_at: string
  week_start: string
  week_end: string
  response_data: Record<string, AnswerValue>
  [key: string]: string | number | boolean | string[] | null | Record<string, AnswerValue> | undefined
}

export default function ClientFormPage() {
  const supabase = useMemo(() => createClient(), [])
  const router   = useRouter()
  const { formAssignmentId } = useParams<{ formAssignmentId: string }>()

  const [loading,    setLoading]    = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [assignment, setAssignment] = useState<FormAssignment | null>(null)
  const [form,       setForm]       = useState<AssignmentForm | null>(null)
  const [questions,  setQuestions]  = useState<Question[]>([])
  const [answers,    setAnswers]    = useState<Record<string, AnswerValue>>({})
  const [errors,     setErrors]     = useState<Record<string, string>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: asgn } = await supabase
          .from('client_form_assignments')
          .select('id, client_id, form_id, status, note, response, form:onboarding_forms(*)')
          .eq('id', formAssignmentId)
          .single<FormAssignment>()

        if (!asgn) { setLoading(false); return }
        if (asgn.status === 'completed') { setSubmitted(true) }

        setAssignment(asgn)
        setForm(asgn.form ?? null)

        const { data: qs } = await supabase
          .from('onboarding_questions')
          .select('*')
          .eq('form_id', asgn.form_id)
          .order('sort_order')

        setQuestions(qs || [])
        // Pre-fill if already answered
        if (asgn.response) setAnswers(asgn.response)
        setLoading(false)
      })()
    }, 0)

    return () => clearTimeout(timer)
  }, [formAssignmentId, router, supabase])

  const setAnswer = (qId: string, val: AnswerValue) => {
    setAnswers(p => ({ ...p, [qId]: val }))
    if (errors[qId]) setErrors(p => { const n = { ...p }; delete n[qId]; return n })
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    questions.forEach(q => {
      if (!q.required) return
      const val = answers[q.id]
      if (val === undefined || val === null || val === '' ||
          (Array.isArray(val) && val.length === 0)) {
        errs[q.id] = 'This field is required'
      }
    })
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const submit = async () => {
    if (!validate()) return
    setSubmitting(true)

    // Mark assignment complete
    const { data: asgn } = await supabase.from('client_form_assignments').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      response: answers,
    }).eq('id', formAssignmentId).select('client_id, form:onboarding_forms(form_type, is_checkin_type, id)').single<{ client_id: string; form: AssignmentForm | null }>()

    // Mirror mapped fields into checkins table if this is a check_in type form
    const isCheckin = asgn?.form?.form_type === 'check_in' || asgn?.form?.is_checkin_type
    if (isCheckin) {
      const now = new Date()
      const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
      const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)

      // Build checkin row from mapped fields
      const checkinRow: CheckinRow = {
        client_id: asgn.client_id,
        submitted_at: now.toISOString(),
        week_start: weekStart.toISOString().split('T')[0],
        week_end: weekEnd.toISOString().split('T')[0],
        response_data: answers,
      }

      // Map answers to checkins columns using maps_to on each question
      for (const q of questions) {
        if (q.maps_to && answers[q.id] !== undefined && answers[q.id] !== '') {
          const val = answers[q.id]
          // Numeric fields
          const numericFields = ['weight','sleep_hours','sleep_quality','mood_score','energy_score',
            'stress','hunger_score','pain_score','workout_adherence','nutrition_adherence','habit_adherence']
          checkinRow[q.maps_to] = numericFields.includes(q.maps_to) ? Number(val) : val
        }
      }

      // Get coach_id from client record
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: clientRec } = await supabase.from('clients').select('coach_id').eq('profile_id', user.id).single()
        if (clientRec) {
          checkinRow.coach_id = clientRec.coach_id
          // Update last check-in timestamp on client record
          await supabase.from('clients').update({ last_checkin_at: new Date().toISOString() }).eq('id', asgn.client_id)
          // Trigger AI insights
          try {
            const { triggerAiInsight } = await import('@/lib/ai-insights')
            triggerAiInsight(asgn.client_id, clientRec.coach_id, 'checkin_brief')
            triggerAiInsight(asgn.client_id, clientRec.coach_id, 'red_flag')
          } catch { /* non-blocking */ }
        }
      }
    }

    setSubmitted(true)
    setSubmitting(false)
  }

  const inp: CSSProperties = { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 13px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      Loading your form...
    </div>
  )

  if (!assignment) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ textAlign:'center', color:t.textMuted }}>
        <div style={{ fontSize:36, marginBottom:12 }}>🔍</div>
        <div style={{ fontWeight:700, fontSize:15 }}>Form not found</div>
      </div>
    </div>
  )

  if (submitted) return (
    <>      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:40, maxWidth:440, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
          <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>All done!</div>
          <div style={{ fontSize:14, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
            Your responses have been submitted. Your coach will review them shortly.
          </div>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, padding:'24px 20px 80px' }}>
        <div style={{ maxWidth:620, margin:'0 auto' }}>

          {/* Header */}
          <div style={{ marginBottom:28 }}>
            <div style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>{form?.title}</div>
            {form?.description && (
              <div style={{ fontSize:14, color:t.textDim, lineHeight:1.6 }}>{form.description}</div>
            )}
            {assignment?.note && (
              <div style={{ marginTop:12, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.teal, lineHeight:1.5 }}>
                📝 {assignment.note}
              </div>
            )}
          </div>

          {/* Questions */}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {questions.map((q, idx) => (
              <div key={q.id} style={{ background:t.surface, border:'1px solid '+(errors[q.id]?t.red+'60':t.border), borderRadius:14, padding:'18px 20px' }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:q.helper_text?4:10, display:'flex', gap:6, alignItems:'flex-start' }}>
                  <span style={{ color:t.textMuted, fontWeight:500 }}>{idx+1}.</span>
                  <span>{q.label}</span>
                  {q.required && <span style={{ color:t.red, fontSize:11, marginTop:2 }}>*</span>}
                </div>
                {q.helper_text && <div style={{ fontSize:12, color:t.textMuted, marginBottom:10, lineHeight:1.5 }}>{q.helper_text}</div>}

                {/* Short text */}
                {q.question_type === 'text' && (
                  <input value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)}
                    placeholder={q.placeholder||''} style={inp} />
                )}

                {/* Long text */}
                {q.question_type === 'textarea' && (
                  <textarea value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)}
                    placeholder={q.placeholder||''} rows={4}
                    style={{ ...inp, resize:'vertical', lineHeight:1.6 }} />
                )}

                {/* Number */}
                {q.question_type === 'number' && (
                  <input type="number" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)}
                    placeholder={q.placeholder||''} style={inp} />
                )}

                {/* Date */}
                {q.question_type === 'date' && (
                  <input type="date" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)}
                    style={{ ...inp, colorScheme:'dark' }} />
                )}

                {/* Scale */}
                {q.question_type === 'scale' && (
                  <div>
                    <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                      {[1,2,3,4,5,6,7,8,9,10].map(n => (
                        <button key={n} onClick={()=>setAnswer(q.id,n)}
                          style={{ flex:1, padding:'10px 0', borderRadius:9, border:'1px solid '+(answers[q.id]===n?t.teal:''+t.border), background:answers[q.id]===n?t.tealDim:'transparent', color:answers[q.id]===n?t.teal:t.textDim, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          {n}
                        </button>
                      ))}
                    </div>
                    {(q.scale_min_label||q.scale_max_label) && (
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:t.textMuted }}>
                        <span>{q.scale_min_label||'1'}</span>
                        <span>{q.scale_max_label||'10'}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Radio (single choice) */}
                {q.question_type === 'radio' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(q.options||[]).map(opt => (
                      <button key={opt} onClick={()=>setAnswer(q.id,opt)}
                        style={{ padding:'11px 14px', borderRadius:10, border:'1px solid '+(answers[q.id]===opt?t.teal+'60':t.border), background:answers[q.id]===opt?t.tealDim:'transparent', color:answers[q.id]===opt?t.teal:t.text, fontSize:13, fontWeight:answers[q.id]===opt?700:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid '+(answers[q.id]===opt?t.teal:t.border), background:answers[q.id]===opt?t.teal:'transparent', flexShrink:0 }} />
                        {opt}
                      </button>
                    ))}
                  </div>
                )}

                {/* Checkbox (multi choice) */}
                {q.question_type === 'checkbox' && (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {(q.options||[]).map(opt => {
                      const answer = answers[q.id]
                      const sel: string[] = Array.isArray(answer) ? answer.filter((value): value is string => typeof value === 'string') : []
                      const checked = sel.includes(opt)
                      const toggle = () => setAnswer(q.id, checked ? sel.filter(x=>x!==opt) : [...sel, opt])
                      return (
                        <button key={opt} onClick={toggle}
                          style={{ padding:'11px 14px', borderRadius:10, border:'1px solid '+(checked?t.teal+'60':t.border), background:checked?t.tealDim:'transparent', color:checked?t.teal:t.text, fontSize:13, fontWeight:checked?700:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:16, height:16, borderRadius:4, border:'2px solid '+(checked?t.teal:t.border), background:checked?t.teal:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {checked && <span style={{ color:'#000', fontSize:10, fontWeight:900 }}>✓</span>}
                          </div>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* File upload — placeholder */}
                {q.question_type === 'file' && (
                  <div style={{ border:'2px dashed '+t.border, borderRadius:10, padding:'20px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
                    📎 File upload coming soon — drop your coach a message with the file for now.
                  </div>
                )}

                {errors[q.id] && (
                  <div style={{ marginTop:8, fontSize:12, color:t.red }}>{errors[q.id]}</div>
                )}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div style={{ marginTop:28 }}>
            <button onClick={submit} disabled={submitting}
              style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:14, padding:'15px', fontSize:15, fontWeight:900, color:'#000', cursor:submitting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:submitting?.6:1 }}>
              {submitting ? 'Submitting...' : '✓ Submit Responses'}
            </button>
            <div style={{ fontSize:12, color:t.textMuted, textAlign:'center', marginTop:10 }}>
              Your responses are private and only visible to your coach.
            </div>
          </div>

        </div>
      </div>
      <ClientBottomNav />
    </>
  )
}
