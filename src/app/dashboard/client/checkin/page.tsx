'use client'
import React from 'react'
import { useEffect, useMemo, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { triggerAiInsight } from '@/lib/ai-insights'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import { alpha } from '@/lib/theme'

const t = {
  bg:"var(--bg)", surface:"var(--surface)", surfaceUp:"var(--surface-up)", surfaceHigh:"var(--surface-high)", border:"var(--border)",
  teal:"var(--teal)", tealDim:"var(--teal-dim)", orange:"var(--orange)", orangeDim:"var(--orange-dim)",
  purple:"var(--purple)", purpleDim:"var(--purple-dim)", red:"var(--red)", redDim:"var(--red-dim)",
  yellow:"var(--yellow)", green:"var(--green)", pink:"var(--pink)",
  text:"var(--text)", textMuted:"var(--text-muted)", textDim:"var(--text-dim)",
}

const inp: React.CSSProperties = {
  width:'100%', background:t.surfaceUp, border:`1px solid ${t.border}`,
  borderRadius:10, padding:'11px 14px', fontSize:14, color:t.text,
  outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box',
}

// ─── Types ───────────────────────────────────────────────────────────────────
type ClientRecord  = { id: string; coach_id: string | null; profile_id: string }
type Assignment    = { id: string; status: string; form_id?: string | null; response?: Record<string,unknown> | null }
type Question      = {
  id: string; sort_order: number; question_type: string; label: string
  required: boolean; maps_to: string | null; placeholder: string | null
  helper_text: string | null; options: string[] | null
  scale_min: number; scale_max: number; scale_min_label: string | null; scale_max_label: string | null
}

// ─── Slider component ────────────────────────────────────────────────────────
function Slider({ label, value, onChange, color, min=1, max=10, lowLabel='Low', highLabel='High', invert=false }:
  { label:string; value:number; onChange:(v:number)=>void; color:string; min?:number; max?:number; lowLabel?:string; highLabel?:string; invert?:boolean }) {
  const pct = ((value - min) / (max - min)) * 100
  const fill = invert ? (pct>=70?t.red:pct>=40?t.orange:t.green) : color
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{label}</div>
        <div style={{ fontSize:20, fontWeight:900, color, minWidth:32, textAlign:'right' }}>{value}</div>
      </div>
      <div style={{ position:'relative', height:32, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', width:'100%', height:6, background:t.surfaceHigh, borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:pct+'%', background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:3, transition:'width 0.1s' }} />
        </div>
        <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}
          style={{ position:'relative', width:'100%', appearance:'none', background:'transparent', cursor:'pointer', zIndex:1 }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginTop:3 }}>
        <span>{min} — {lowLabel}</span><span>{max} — {highLabel}</span>
      </div>
      <style>{`input[type=range]::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:${fill};border:3px solid #fff;cursor:pointer;box-shadow:0 2px 8px ${fill}60;}`}</style>
    </div>
  )
}

// ─── Dynamic question renderer ───────────────────────────────────────────────
function QuestionField({ q, value, onChange }: { q: Question; value: unknown; onChange: (v: unknown) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string>('')

  if (q.question_type === 'scale') {
    const num = typeof value === 'number' ? value : q.scale_min
    return (
      <Slider
        label={q.label}
        value={num}
        onChange={onChange}
        color={t.teal}
        min={q.scale_min}
        max={q.scale_max}
        lowLabel={q.scale_min_label || String(q.scale_min)}
        highLabel={q.scale_max_label || String(q.scale_max)}
      />
    )
  }

  if (q.question_type === 'number') {
    return (
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>{q.label}{q.required && <span style={{ color:t.red }}> *</span>}</label>
        <input type="number" step="0.1" value={String(value ?? '')} placeholder={q.placeholder || ''}
          onChange={e => onChange(e.target.value)}
          style={{ ...inp, maxWidth:200 }} />
        {q.helper_text && <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>{q.helper_text}</div>}
      </div>
    )
  }

  if (q.question_type === 'textarea') {
    return (
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>{q.label}{q.required && <span style={{ color:t.red }}> *</span>}</label>
        <textarea rows={3} value={String(value ?? '')} placeholder={q.placeholder || ''}
          onChange={e => onChange(e.target.value)}
          style={{ ...inp, resize:'none', lineHeight:1.5 }} />
        {q.helper_text && <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>{q.helper_text}</div>}
      </div>
    )
  }

  if (q.question_type === 'text') {
    return (
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>{q.label}{q.required && <span style={{ color:t.red }}> *</span>}</label>
        <input type="text" value={String(value ?? '')} placeholder={q.placeholder || ''}
          onChange={e => onChange(e.target.value)}
          style={inp} />
        {q.helper_text && <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>{q.helper_text}</div>}
      </div>
    )
  }

  if (q.question_type === 'select' && q.options) {
    return (
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>{q.label}{q.required && <span style={{ color:t.red }}> *</span>}</label>
        <select value={String(value ?? '')} onChange={e => onChange(e.target.value)}
          style={{ ...inp, colorScheme:'dark' }}>
          <option value="">Select...</option>
          {q.options.map((o:string) => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    )
  }

  if (q.question_type === 'file') {
    return (
      <div style={{ marginBottom:20 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:700, marginBottom:8 }}>{q.label}{q.required && <span style={{ color:t.red }}> *</span>}</label>
        <div onClick={() => fileRef.current?.click()}
          style={{ border:`2px dashed ${t.border}`, borderRadius:12, padding:'20px 16px', textAlign:'center',
            cursor:'pointer', color:t.textMuted, fontSize:13, background: fileName ? alpha(t.teal, 7) : 'transparent' }}>
          {fileName ? `✅ ${fileName}` : '📷 Tap to select photo'}
          <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) { setFileName(f.name); onChange(f) }
            }} />
        </div>
        {q.helper_text && <div style={{ fontSize:11, color:t.textMuted, marginTop:4 }}>{q.helper_text}</div>}
      </div>
    )
  }

  return null
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function CheckinForm() {
  const [clientRecord, setClientRecord] = useState<ClientRecord | null>(null)
  const [assignment,   setAssignment]   = useState<Assignment | null>(null)
  const [questions,    setQuestions]    = useState<Question[]>([])
  const [answers,      setAnswers]      = useState<Record<string, unknown>>({})
  const [alreadyDone,  setAlreadyDone]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [snoozing,     setSnoozing]     = useState(false)
  const [done,         setDone]         = useState(false)
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const timer = setTimeout(() => {
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { router.push('/login'); return }

        const { data: clientData } = await supabase
          .from('clients').select('id, coach_id, profile_id')
          .eq('profile_id', user.id).single<ClientRecord>()
        setClientRecord(clientData)

        if (clientData) {
          const { data: pending } = await supabase
            .from('client_form_assignments')
            .select('id, status, form_id, response')
            .eq('client_id', clientData.id)
            .eq('status', 'pending')
            .not('checkin_schedule_id', 'is', null)
            .or(`snoozed_until.is.null,snoozed_until.lte.${new Date().toISOString()}`)
            .order('assigned_at', { ascending: false })
            .limit(1).single<Assignment>()

          if (pending) {
            setAssignment(pending)
            // Load questions for this form
            if (pending.form_id) {
              const { data: qs } = await supabase
                .from('onboarding_questions')
                .select('*')
                .eq('form_id', pending.form_id)
                .order('sort_order')
              const qList = (qs || []) as Question[]
              setQuestions(qList)
              // Pre-fill defaults: scales start at midpoint
              const defaults: Record<string, unknown> = {}
              for (const q of qList) {
                if (q.question_type === 'scale') {
                  const key = q.maps_to || q.id
                  defaults[key] = Math.round((q.scale_min + q.scale_max) / 2)
                }
              }
              setAnswers(defaults)
            }
          } else {
            const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6)
            const { data: recent } = await supabase
              .from('client_form_assignments').select('id')
              .eq('client_id', clientData.id).eq('status', 'completed')
              .not('checkin_schedule_id', 'is', null)
              .gte('completed_at', weekAgo.toISOString()).limit(1)
            if (recent && recent.length > 0) setAlreadyDone(true)
          }
        }
        setLoading(false)
      })()
    }, 0)
    return () => clearTimeout(timer)
  }, [router, supabase])

  const setAnswer = (key: string, value: unknown) => {
    setAnswers(prev => ({ ...prev, [key]: value }))
  }

  const handleSnooze = async () => {
    if (!assignment) return
    setSnoozing(true)
    await supabase.from('client_form_assignments')
      .update({ snoozed_until: new Date(Date.now() + 24*60*60*1000).toISOString() })
      .eq('id', assignment.id)
    setSnoozing(false)
    router.push('/dashboard/client')
  }

  const handleSubmit = async () => {
    if (!clientRecord || !assignment) return
    setSubmitting(true)

    // Build response: maps_to fields use their mapped key, others use question id
    const responseData: Record<string, unknown> = {}
    for (const q of questions) {
      const key = q.maps_to || q.id
      const val = answers[key]
      if (val instanceof File) {
        // Upload photo to storage
        try {
          const ext = val.name.split('.').pop() || 'jpg'
          const path = `checkin-photos/${clientRecord.id}/${assignment.id}/${q.id}.${ext}`
          const { data: uploadData } = await supabase.storage
            .from('workout-reviews').upload(path, val, { upsert: true })
          if (uploadData) {
            // Store the raw storage path. Bucket is private; any URL
            // generated here either expires (signed, 1hr TTL) or 403s
            // (public). Whoever reads this response should sign on read.
            responseData[key] = path
          }
        } catch { responseData[key] = null }
      } else {
        responseData[key] = val ?? null
      }
    }

    await supabase.from('client_form_assignments').update({
      status:       'completed',
      response:     responseData,
      completed_at: new Date().toISOString(),
    }).eq('id', assignment.id)

    await supabase.from('clients')
      .update({ last_checkin_at: new Date().toISOString() })
      .eq('id', clientRecord.id)

    if (clientRecord.coach_id) {
      await supabase.functions.invoke('send-notification', {
        body: {
          user_id: clientRecord.coach_id,
          notification_type: 'checkin_submitted',
          title: 'Check-in received 📋',
          body: 'A client just submitted their weekly check-in.',
          link_url: '/dashboard/coach/checkins',
        }
      }).catch(err => console.warn('[notify:checkin] failed', err))
      triggerAiInsight(clientRecord.id, clientRecord.coach_id, 'checkin_brief')
      triggerAiInsight(clientRecord.id, clientRecord.coach_id, 'red_flag')
    }

    setSubmitting(false)
    setDone(true)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  if (done) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
        <div style={{ fontSize:22, fontWeight:900, marginBottom:8 }}>Check-in submitted!</div>
        <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>Your coach will review it shortly. Keep crushing it!</div>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{ background:'linear-gradient(135deg,'+t.teal+','+alpha(t.teal, 80) + ')', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  if (alreadyDone) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
        <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>Already checked in this week!</div>
        <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>Nothing more to do — your coach has it. See you next week.</div>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{ background:t.teal, border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  if (!assignment) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>📭</div>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>No check-in due</div>
        <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>Your coach will send one when it's time.</div>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  // No questions loaded = fallback message (shouldn't normally happen)
  if (questions.length === 0) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
      <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
        <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>Form not set up yet</div>
        <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>Your coach hasn't added questions to this check-in form yet.</div>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          Back to Dashboard
        </button>
      </div>
    </div>
  )

  // ── Main form ─────────────────────────────────────────────────────────────
  const requiredUnanswered = questions.filter(q => {
    if (!q.required) return false
    if (q.question_type === 'file') return false // files optional even if marked required
    const key = q.maps_to || q.id
    const val = answers[key]
    return val == null || val === ''
  })
  const canSubmit = requiredUnanswered.length === 0

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input[type=range]{-webkit-appearance:none;appearance:none;}textarea,input,select{font-size:16px!important;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, paddingBottom:100 }}>

        {/* Header */}
        <div style={{ background:t.surface, borderBottom:`1px solid ${t.border}`, padding:'0 20px', height:56, display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            ← Back
          </button>
          <div style={{ width:1, height:24, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>📋 Weekly Check-In</div>
          <div style={{ flex:1 }} />
          <button onClick={handleSnooze} disabled={snoozing}
            style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:8, padding:'5px 12px', fontSize:11, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            {snoozing ? '...' : '⏰ Remind me tomorrow'}
          </button>
        </div>

        {/* Questions */}
        <div style={{ maxWidth:560, margin:'0 auto', padding:'24px 20px' }}>
          <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>
            Answer honestly — this helps your coach program smarter for you.
          </div>

          {questions.map((q, idx) => {
            const key = q.maps_to || q.id
            return (
              <div key={q.id} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:'18px 16px', marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:10 }}>
                  Question {idx + 1} of {questions.length}
                </div>
                <QuestionField
                  q={q}
                  value={answers[key]}
                  onChange={v => setAnswer(key, v)}
                />
              </div>
            )
          })}

          {/* Submit */}
          <div style={{ marginTop:8 }}>
            {!canSubmit && (
              <div style={{ fontSize:12, color:t.orange, marginBottom:12, textAlign:'center' }}>
                {requiredUnanswered.length} required {requiredUnanswered.length === 1 ? 'question' : 'questions'} still need an answer
              </div>
            )}
            <button onClick={handleSubmit} disabled={submitting || !canSubmit}
              style={{ width:'100%', background: canSubmit ? 'linear-gradient(135deg,'+t.teal+','+alpha(t.teal, 80) + ')' : t.surfaceHigh,
                border:'none', borderRadius:14, padding:'15px', fontSize:15, fontWeight:900,
                color: canSubmit ? '#000' : t.textMuted, cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
              {submitting ? 'Submitting...' : '✓ Submit Check-In'}
            </button>
          </div>
        </div>

        <ClientBottomNav />
      </div>
    </>
  )
}
