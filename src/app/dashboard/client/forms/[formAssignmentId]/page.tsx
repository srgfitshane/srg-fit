'use client'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import { alpha } from '@/lib/theme'
import { fetchServerDraft, saveServerDraft, clearServerDraft } from '@/lib/form-drafts'
import { prepareProgressPhoto } from '@/lib/progress-photo'
import { localDateStr } from '@/lib/date'

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

function uploadedPhotoPaths(value: AnswerValue | undefined, profileId: string | null): string[] {
  if (!profileId || !Array.isArray(value)) return []
  return [...new Set(value.filter(path => {
    if (typeof path !== 'string') return false
    const parts = path.split('/')
    return parts.length === 2 && parts[0] === profileId
      && /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}\.(jpg|png|webp)$/i.test(parts[1])
  }))]
}

function progressPhotoAngle(mapping: string): string {
  const angle = mapping.replace(/^progress_photo_/, '')
  // The generic side question does not identify left versus right.
  if (angle === 'side') return 'other'
  if (['front', 'back', 'side_left', 'side_right', 'other'].includes(angle)) return angle
  throw new Error('This photo question has an unsupported angle. Please contact your coach.')
}

function SelectedPhotoPreview({ file }: { file: File }) {
  const imageRef = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const image = imageRef.current
    if (!image) return
    const url = URL.createObjectURL(file)
    image.src = url
    return () => { image.removeAttribute('src'); URL.revokeObjectURL(url) }
  }, [file])
  // Local device preview only; the effect owns and releases its object URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} alt={file.name} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
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
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitWarning, setSubmitWarning] = useState<string | null>(null)
  const submittingRef = useRef(false)
  const [restoredDraft, setRestoredDraft] = useState(false)
  const [profileId, setProfileId] = useState<string | null>(null)
  // Picked files per file-type question (one or more per question)
  const [files,      setFiles]      = useState<Record<string, File[]>>({})

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }
        setProfileId(user.id)

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
        // Pre-fill priority: server response (already submitted) > localStorage
        // draft (this device) > server draft (cross-device, e.g. started on
        // phone, opened on laptop) > empty. localStorage wins over server
        // draft because writes are synchronous; server is the cross-device
        // backup (Wave 5 form_drafts table).
        const draftKey = `form-draft:${formAssignmentId}`
        const formKey = `forms:${formAssignmentId}`
        if (asgn.response && Object.keys(asgn.response).length > 0) {
          setAnswers(asgn.response)
        } else {
          let restoredFromLocal = false
          try {
            const draft = window.localStorage.getItem(draftKey)
            if (draft) {
              const parsed = JSON.parse(draft)
              if (parsed && typeof parsed === 'object') {
                setAnswers(parsed)
                setRestoredDraft(true)
                restoredFromLocal = true
              }
            }
          } catch { /* localStorage disabled / private mode -- silent fallback */ }
          if (!restoredFromLocal) {
            const serverDraft = await fetchServerDraft(user.id, formKey)
            if (serverDraft && serverDraft.payload && typeof serverDraft.payload === 'object') {
              setAnswers(serverDraft.payload as Record<string, AnswerValue>)
              setRestoredDraft(true)
            }
          }
        }
        setLoading(false)
      })()
    }, 0)

    return () => clearTimeout(timer)
  }, [formAssignmentId, router, supabase])

  // Debounced autosave. localStorage at 800ms (instant per-device safety),
  // server-side at 5s (cross-device backup, lighter network use). Both are
  // cleared on successful submit.
  useEffect(() => {
    if (!formAssignmentId || submitted || submitting) return
    if (Object.keys(answers).length === 0) return
    const localHandle = window.setTimeout(() => {
      try {
        window.localStorage.setItem(`form-draft:${formAssignmentId}`, JSON.stringify(answers))
      } catch { /* quota exceeded / disabled -- silent fallback */ }
    }, 800)
    const serverHandle = profileId
      ? window.setTimeout(() => {
          void saveServerDraft(profileId, `forms:${formAssignmentId}`, answers)
        }, 5000)
      : null
    return () => {
      window.clearTimeout(localHandle)
      if (serverHandle) window.clearTimeout(serverHandle)
    }
  }, [answers, formAssignmentId, submitted, submitting, profileId])

  function keepDraft(next: Record<string, AnswerValue>) {
    try { window.localStorage.setItem(`form-draft:${formAssignmentId}`, JSON.stringify(next)) } catch { /* Keep the in-memory answers if browser storage is unavailable. */ }
  }

  const setAnswer = (qId: string, val: AnswerValue) => {
    setAnswers(p => ({ ...p, [qId]: val }))
    if (errors[qId]) setErrors(p => { const n = { ...p }; delete n[qId]; return n })
    if (submitError) setSubmitError(null)
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    questions.forEach(q => {
      if (!q.required) return
      if (q.question_type === 'file') {
        if (!(files[q.id]?.length) && uploadedPhotoPaths(answers[q.id], profileId).length === 0) {
          errs[q.id] = 'Please select a photo. After a refresh, unuploaded photos must be selected again.'
        }
        return
      }
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
    if (submitting || submitted || submittingRef.current || !validate()) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    setSubmitWarning(null)
    keepDraft(answers)
    try {
      const { data: { user }, error: userErr } = await supabase.auth.getUser()
      if (userErr || !user || user.id !== profileId) {
        throw new Error('Your session changed or expired. Sign in again; your written answers are kept on this device.')
      }
      const { data: clientRec, error: clientErr } = await supabase.from('clients')
        .select('id, coach_id').eq('profile_id', user.id).single<{ id: string; coach_id: string | null }>()
      if (clientErr || !clientRec || assignment?.id !== formAssignmentId || assignment.client_id !== clientRec.id) {
        throw new Error('Could not confirm your assigned form. Your answers are kept; please refresh or contact your coach.')
      }
      // Reconfirm metadata through client RLS, including when this tab loaded
      // before access to the assigned form was repaired.
      const { data: assignedForm, error: formError } = await supabase.from('onboarding_forms')
        .select('id, form_type, is_checkin_type').eq('id', assignment.form_id)
        .single<Pick<AssignmentForm, 'id' | 'form_type' | 'is_checkin_type'>>()
      if (formError || !assignedForm || assignedForm.id !== assignment.form_id) {
        throw new Error('Could not load your assigned form. Your answers are kept; please retry or contact your coach.')
      }
      const uploadedAnswers: Record<string, AnswerValue> = { ...answers }
      const todayStr = localDateStr()
      const isCheckin = assignedForm.form_type === 'check_in' || assignedForm.is_checkin_type
      const photoRows: Array<{ id: string; client_id: string; coach_id: string | null; storage_path: string; photo_date: string; angle: string; weight_at_time: number | null }> = []
      const weightQuestion = questions.find(q => q.maps_to === 'weight')
      const rawWeight = weightQuestion ? answers[weightQuestion.id] : null
      const weight = rawWeight !== null && rawWeight !== undefined && rawWeight !== '' ? Number(rawWeight) : null
      const weightAtTime = weight !== null && Number.isFinite(weight) ? weight : null

      for (const q of questions) {
        if (q.question_type !== 'file') continue
        const mapped = isCheckin && q.maps_to?.startsWith('progress_photo_')
        const angle = mapped ? progressPhotoAngle(q.maps_to!) : null
        const paths = uploadedPhotoPaths(uploadedAnswers[q.id], user.id)
        uploadedAnswers[q.id] = paths
        for (const file of files[q.id] || []) {
          const prepared = await prepareProgressPhoto(file)
          const extension = prepared.type === 'image/png' ? 'png' : prepared.type === 'image/webp' ? 'webp' : 'jpg'
          const path = `${user.id}/${crypto.randomUUID()}.${extension}`
          const { data, error } = await supabase.storage.from('progress-photos').upload(path, prepared, {
            upsert: false, contentType: prepared.type, cacheControl: '3600',
          })
          if (error || !data) throw new Error('A photo could not upload. Your answers and confirmed uploads are kept. Retry here; after a refresh, select any unuploaded photos again.')
          paths.push(path)
          uploadedAnswers[q.id] = [...paths]
          // Persist each confirmed path immediately, so retry/reload does not
          // re-upload it. Unuploaded File objects stay in memory for retry.
          setAnswers({ ...uploadedAnswers })
          keepDraft(uploadedAnswers)
          setFiles(previous => ({ ...previous, [q.id]: (previous[q.id] || []).filter(picked => picked !== file) }))
        }
        if (mapped && angle) {
          for (const path of paths) photoRows.push({
            id: path.split('/')[1].split('.')[0], client_id: user.id, coach_id: clientRec.coach_id,
            storage_path: path, photo_date: todayStr, angle, weight_at_time: weightAtTime,
          })
        }
      }
      if (photoRows.length) {
        const { data, error } = await supabase.from('progress_photos').upsert(photoRows, { onConflict: 'id' }).select('id')
        if (error || !data || data.length !== photoRows.length) {
          throw new Error('Your photos uploaded, but could not be added to Progress. Your answers and uploads are kept; retry here without selecting the uploaded photos again.')
        }
      }
      // Completion is last: failed photos must never lead to "All done".
      const { data: saved, error: updateErr } = await supabase.from('client_form_assignments').update({
        status: 'completed', completed_at: new Date().toISOString(), response: uploadedAnswers,
      }).eq('id', formAssignmentId).eq('client_id', clientRec.id).select('id').single()
      if (updateErr || !saved) throw new Error('Could not save your responses. Your answers and uploads are kept; please retry here.')

      try { window.localStorage.removeItem(`form-draft:${formAssignmentId}`) } catch { /* The primary save is confirmed. */ }
      void clearServerDraft(user.id, `forms:${formAssignmentId}`).catch(() => {})
      setSubmitted(true)

      // These copies are auxiliary: the confirmed response remains the source
      // of truth. Show a warning on failure instead of discarding the response
      // or logging health-related provider error details.
      if (isCheckin) {
        try {
          const metricRow: Record<string, string | number | null> = { client_id: clientRec.id, coach_id: clientRec.coach_id, logged_date: todayStr }
          let hasMetric = false
          for (const q of questions) {
            if (!q.maps_to || !metricColumns.has(q.maps_to)) continue
            const value = answers[q.id]
            if (value === undefined || value === null || value === '') continue
            const number = Number(value)
            if (!Number.isFinite(number)) continue
            metricRow[q.maps_to] = number
            hasMetric = true
          }
          if (hasMetric) {
            const { data, error } = await supabase.from('metrics').upsert(metricRow, { onConflict: 'client_id,logged_date' }).select('id').single()
            if (error || !data) throw new Error('metrics sync')
          }
          const { data, error } = await supabase.from('clients').update({ last_checkin_at: new Date().toISOString() })
            .eq('id', clientRec.id).select('id').single()
          if (error || !data) throw new Error('check-in timestamp sync')
        } catch {
          setSubmitWarning('Your responses and photos were saved, but a progress-summary update failed. Your coach can still review the full check-in. Please let them know; no need to submit again.')
        }
        try {
          const { triggerAiInsight } = await import('@/lib/ai-insights')
          if (clientRec.coach_id) {
            triggerAiInsight(clientRec.id, clientRec.coach_id, 'checkin_brief')
            triggerAiInsight(clientRec.id, clientRec.coach_id, 'red_flag')
          }
        } catch { /* AI insights must not block a confirmed check-in. */ }
      }
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Could not submit your form. Your answers are kept; please retry here.')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const inp: CSSProperties = { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 13px', fontSize:16, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }

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
          {submitWarning && <p role="status" style={{ color:t.orange, fontSize:13, lineHeight:1.5, marginBottom:20 }}>{submitWarning}</p>}
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
            {restoredDraft && (
              <div style={{ marginTop:12, background:t.orangeDim, border:'1px solid '+alpha(t.orange, 27), borderRadius:10, padding:'10px 14px', fontSize:13, color:t.orange, lineHeight:1.5, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' as const }}>
                <span style={{ flex:1, minWidth:200 }}>💾 We restored your in-progress answers from your last visit.</span>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    // Wipe local + server drafts and reset answers so the
                    // client gets a true fresh slate. Banner hides since
                    // there's no longer a restored draft on screen.
                    try { window.localStorage.removeItem(`form-draft:${formAssignmentId}`) } catch { /* */ }
                    if (profileId) void clearServerDraft(profileId, `forms:${formAssignmentId}`)
                    setAnswers({})
                    setFiles({})
                    setRestoredDraft(false)
                  }}
                  style={{ background:'transparent', border:'1px solid '+alpha(t.orange, 60), borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Start over
                </button>
              </div>
            )}
          </div>

          {/* Questions */}
          <fieldset disabled={submitting} style={{ border:0, padding:0, margin:0, minWidth:0 }}>
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
                  <input type="number" inputMode="decimal" enterKeyHint="done" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)}
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
                  const uploaded = uploadedPhotoPaths(answers[q.id], profileId)
                  const removeAt = (i: number) => setFiles(p => ({ ...p, [q.id]: (p[q.id] || []).filter((_, j) => j !== i) }))
                  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
                    const list = Array.from(e.target.files || [])
                    if (list.length === 0) return
                    setFiles(p => ({ ...p, [q.id]: [...(p[q.id] || []), ...list] }))
                    setErrors(p => { const next = { ...p }; delete next[q.id]; return next })
                    setSubmitError(null)
                    e.target.value = ''
                  }
                  return (
                    <div>
                      {picked.length > 0 && (
                        <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:10 }}>
                          {picked.map((f, i) => (
                            <div key={i} style={{ position:'relative', width:96, height:96, borderRadius:10, overflow:'hidden', border:'1px solid '+t.border, background:t.surfaceHigh }}>
                              <SelectedPhotoPreview file={f} />
                              <button type="button" aria-label={`Remove selected photo ${i + 1}`} onClick={() => removeAt(i)}
                                style={{ position:'absolute', top:4, right:4, width:22, height:22, borderRadius:'50%', border:'none', background:'rgba(0,0,0,0.65)', color:'#fff', fontSize:12, cursor:'pointer', lineHeight:1, padding:0 }}>
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {uploaded.length > 0 && <div style={{ fontSize:12, color:t.green, marginBottom:10 }}>
                        <p style={{ marginBottom:6 }}>✓ {uploaded.length} photo{uploaded.length === 1 ? '' : 's'} uploaded and kept for this response. Retry will reuse them.</p>
                        {uploaded.map((path, index) => <button key={path} type="button"
                          onClick={() => setAnswer(q.id, uploaded.filter(uploadedPath => uploadedPath !== path))}
                          style={{ background:'transparent', border:'1px solid '+t.border, borderRadius:8, color:t.textMuted, padding:'6px 10px', margin:'0 6px 6px 0', fontSize:12, cursor:'pointer' }}>
                          Remove uploaded photo {index + 1} from this response
                        </button>)}
                      </div>}
                      <p style={{ fontSize:12, color:t.textMuted, marginBottom:10, lineHeight:1.5 }}>Large photos are resized without cropping. After a refresh, select any photos that had not uploaded yet. Already uploaded photos are kept.</p>
                      <label style={{ display:'block', cursor:'pointer' }}>
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple onChange={onPick} style={{ display:'none' }} />
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
          </fieldset>

          {/* Error banner -- appears above Submit when an attempt failed */}
          {submitError && (
            <div role="alert" style={{ marginTop:24, background:t.redDim, border:'1px solid '+alpha(t.red, 38), borderRadius:12, padding:'12px 16px', color:t.red, fontSize:13, lineHeight:1.5, display:'flex', alignItems:'flex-start', gap:10 }}>
              <span style={{ fontSize:16, lineHeight:1, marginTop:1 }}>⚠</span>
              <span>{submitError}</span>
            </div>
          )}

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
