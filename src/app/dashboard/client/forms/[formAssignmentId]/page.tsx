'use client'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import { alpha } from '@/lib/theme'

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
  // Picked files per file-type question (one or more per question)
  const [files,      setFiles]      = useState<Record<string, File[]>>({})

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

  // Body-metric columns on the metrics table that maps_to may target
  const metricColumns = new Set([
    'weight','body_fat','chest','waist','hips','left_arm','right_arm',
    'left_thigh','right_thigh','neck','calves','shoulders',
  ])

  const submit = async () => {
    if (!validate()) return
    setSubmitting(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSubmitting(false); return }

    // Find the client record for the coach_id and the metrics client_id
    // NOTE: progress_photos.client_id stores profile_id (auth.uid),
    // metrics.client_id stores clients.id. Both are needed.
    const { data: clientRec } = await supabase
      .from('clients')
      .select('id, coach_id')
      .eq('profile_id', user.id)
      .single<{ id: string; coach_id: string | null }>()

    // Upload any picked files first so the response JSON can store URLs.
    // Path scheme: <profile_id>/<YYYY-MM-DD>-<angle>-<rand>.<ext>
    // Storage RLS requires the leading folder to be auth.uid().
    const uploadedAnswers: Record<string, AnswerValue> = { ...answers }
    const photoInserts: Array<{ angle: string; storage_path: string }> = []
    const today = new Date()
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

    for (const q of questions) {
      if (q.question_type !== 'file') continue
      const picked = files[q.id] || []
      if (picked.length === 0) continue
      const urls: string[] = []
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i]
        const ext = (f.name.split('.').pop() || 'jpg').toLowerCase()
        const rand = Math.random().toString(36).slice(2, 8)
        const angle = (q.maps_to || '').replace(/^progress_photo_/, '') || 'photo'
        const path = `${user.id}/${todayStr}-${angle}-${rand}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('progress-photos')
          .upload(path, f, { upsert: false, contentType: f.type })
        if (upErr) { console.error('progress-photos upload', upErr); continue }
        urls.push(path)
        if (q.maps_to && q.maps_to.startsWith('progress_photo_')) {
          photoInserts.push({ angle, storage_path: path })
        }
      }
      uploadedAnswers[q.id] = urls
    }

    // Mark the assignment complete with file URLs baked into the response.
    const { data: asgn } = await supabase.from('client_form_assignments').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      response: uploadedAnswers,
    }).eq('id', formAssignmentId).select('client_id, form:onboarding_forms(form_type, is_checkin_type, id)').single<{ client_id: string; form: AssignmentForm | null }>()

    const isCheckin = asgn?.form?.form_type === 'check_in' || asgn?.form?.is_checkin_type
    if (isCheckin && clientRec) {
      // Fan out body-metric mapped fields into the metrics table.
      // Upsert keyed on (client_id, logged_date) so re-submissions on
      // the same day merge instead of duplicating rows.
      const metricRow: Record<string, string | number | null> = {
        client_id: clientRec.id,
        coach_id:  clientRec.coach_id,
        logged_date: todayStr,
      }
      let hasMetric = false
      for (const q of questions) {
        if (!q.maps_to || !metricColumns.has(q.maps_to)) continue
        const v = answers[q.id]
        if (v === undefined || v === null || v === '') continue
        const n = Number(v)
        if (!isFinite(n)) continue
        metricRow[q.maps_to] = n
        hasMetric = true
      }
      if (hasMetric) {
        await supabase.from('metrics').upsert(metricRow, { onConflict: 'client_id,logged_date' })
      }

      // Insert progress_photos rows for each uploaded photo.
      // Note: progress_photos.client_id holds the profile_id (auth.uid).
      if (photoInserts.length > 0) {
        // Pull current weight from the answers if present so we can
        // stamp it on the photo row (helpful for side-by-side views).
        let weightAtTime: number | null = null
        for (const q of questions) {
          if (q.maps_to === 'weight' && answers[q.id] !== undefined && answers[q.id] !== '') {
            const n = Number(answers[q.id])
            if (isFinite(n)) weightAtTime = n
            break
          }
        }
        await supabase.from('progress_photos').insert(
          photoInserts.map(p => ({
            client_id: user.id,
            coach_id:  clientRec.coach_id,
            storage_path: p.storage_path,
            photo_date: todayStr,
            angle: p.angle,
            weight_at_time: weightAtTime,
          }))
        )
      }

      // Update last check-in timestamp + trigger AI insights.
      await supabase.from('clients').update({ last_checkin_at: new Date().toISOString() }).eq('id', clientRec.id)
      try {
        const { triggerAiInsight } = await import('@/lib/ai-insights')
        if (clientRec.coach_id) {
          triggerAiInsight(clientRec.id, clientRec.coach_id, 'checkin_brief')
          triggerAiInsight(clientRec.id, clientRec.coach_id, 'red_flag')
        }
      } catch { /* non-blocking */ }
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
            style={{ background:`linear-gradient(135deg,${t.teal},${alpha(t.teal, 80)})`, border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
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
              <div style={{ marginTop:12, background:t.tealDim, border:'1px solid '+alpha(t.teal, 19), borderRadius:10, padding:'10px 14px', fontSize:13, color:t.teal, lineHeight:1.5 }}>
                📝 {assignment.note}
              </div>
            )}
          </div>

          {/* Questions */}
          <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
            {questions.map((q, idx) => (
              <div key={q.id} style={{ background:t.surface, border:'1px solid '+(errors[q.id]?alpha(t.red, 38):t.border), borderRadius:14, padding:'18px 20px' }}>
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
                        style={{ padding:'11px 14px', borderRadius:10, border:'1px solid '+(answers[q.id]===opt?alpha(t.teal, 38):t.border), background:answers[q.id]===opt?t.tealDim:'transparent', color:answers[q.id]===opt?t.teal:t.text, fontSize:13, fontWeight:answers[q.id]===opt?700:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, display:'flex', alignItems:'center', gap:10 }}>
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
                          style={{ padding:'11px 14px', borderRadius:10, border:'1px solid '+(checked?alpha(t.teal, 38):t.border), background:checked?t.tealDim:'transparent', color:checked?t.teal:t.text, fontSize:13, fontWeight:checked?700:500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:16, height:16, borderRadius:4, border:'2px solid '+(checked?t.teal:t.border), background:checked?t.teal:'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
                            {checked && <span style={{ color:'#000', fontSize:10, fontWeight:900 }}>✓</span>}
                          </div>
                          {opt}
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* File upload — image/photo picker (multi) */}
                {q.question_type === 'file' && (() => {
                  const picked = files[q.id] || []
                  const removeAt = (i: number) => setFiles(p => ({ ...p, [q.id]: (p[q.id] || []).filter((_, j) => j !== i) }))
                  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const list = Array.from(e.target.files || [])
                    if (list.length === 0) return
                    setFiles(p => ({ ...p, [q.id]: [...(p[q.id] || []), ...list] }))
                    setAnswer(q.id, [...(picked.map(f => f.name)), ...list.map(f => f.name)])
                    e.target.value = ''
                  }
                  return (
                    <div>
                      {picked.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:10 }}>
                          {picked.map((f, i) => (
                            <div key={i} style={{ position:'relative', width:96, height:96, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border, background:t.surfaceHigh }}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img alt={f.name} src={URL.createObjectURL(f)}
                                style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
                              <button type="button" onClick={() => removeAt(i)}
                                style={{ position:'absolute', top:4, right:4, width:22, height:22, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.65)', color:'#fff', fontSize:12, cursor:'pointer', lineHeight:1, padding:0 }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <label style={{ display:'block', cursor:'pointer' }}>
                        <input type="file" accept="image/*" multiple onChange={onPick} style={{ display:'none' }} />
                        <div style={{ border:'2px dashed '+t.border, borderRadius:10, padding:'18px', textAlign:'center', color:t.textMuted, fontSize:13, background:t.surfaceUp }}>
                          📸 {picked.length === 0 ? 'Tap to add photo' : 'Add another'}
                        </div>
                      </label>
                    </div>
                  )
                })()}

                {errors[q.id] && (
                  <div style={{ marginTop:8, fontSize:12, color:t.red }}>{errors[q.id]}</div>
                )}
              </div>
            ))}
          </div>

          {/* Submit */}
          <div style={{ marginTop:28 }}>
            <button onClick={submit} disabled={submitting}
              style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},${alpha(t.teal, 80)})`, border:'none', borderRadius:14, padding:'15px', fontSize:15, fontWeight:900, color:'#000', cursor:submitting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:submitting?.6:1 }}>
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
