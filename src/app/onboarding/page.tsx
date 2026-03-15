'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', green:'#22c55e', red:'#ef4444',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

export default function OnboardingPage() {
  const supabase = createClient()
  const router = useRouter()
  const params = useSearchParams()
  const [step, setStep] = useState<'loading'|'welcome'|'questions'|'done'>('loading')
  const [invite, setInvite] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [questions, setQuestions] = useState<any[]>([])
  const [answers, setAnswers] = useState<Record<string,any>>({})
  const [clientId, setClientId] = useState<string|null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string|null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login?redirect=/onboarding'); return }

      // Check if client record exists and onboarding already done
      const { data: cl } = await supabase.from('clients').select('id,onboarding_completed,invite_id').eq('profile_id', user.id).eq('active', true).single()

      if (cl?.onboarding_completed) { router.push('/dashboard/client'); return }
      if (!cl) { setError('No active client record found. Contact your coach.'); setStep('welcome'); return }

      setClientId(cl.id)

      // Load the invite to get the form assignment
      let inviteData = null
      if (cl.invite_id) {
        const { data: inv } = await supabase.from('client_invites').select('*').eq('id', cl.invite_id).single()
        inviteData = inv
        setInvite(inv)
      }

      // Load form: invite's form OR coach's default form
      let formId = inviteData?.onboarding_form_id
      if (!formId) {
        // Get coach_id from clients table
        const { data: fullCl } = await supabase.from('clients').select('coach_id').eq('id', cl.id).single()
        if (fullCl) {
          const { data: def } = await supabase.from('onboarding_forms').select('id').eq('coach_id', fullCl.coach_id).eq('is_default', true).single()
          formId = def?.id
        }
      }

      if (formId) {
        const [{ data: formData }, { data: qs }] = await Promise.all([
          supabase.from('onboarding_forms').select('*').eq('id', formId).single(),
          supabase.from('onboarding_questions').select('*').eq('form_id', formId).order('sort_order')
        ])
        setForm(formData)
        setQuestions(qs || [])
      }
      setStep('welcome')
    }
    load()
  }, [])

  const submit = async () => {
    if (!clientId) return
    setSubmitting(true)
    // Validate required fields
    const missing = questions.filter(q => q.required && !answers[q.id] && answers[q.id] !== 0)
    if (missing.length > 0) { setError(`Please answer all required questions (${missing.length} remaining)`); setSubmitting(false); return }

    if (form) {
      await supabase.from('onboarding_submissions').insert({ client_id: clientId, form_id: form.id, answers })
    }
    await supabase.from('clients').update({ onboarding_completed: true, onboarding_completed_at: new Date().toISOString() }).eq('id', clientId)
    // Mark invite accepted
    if (invite) await supabase.from('client_invites').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id)
    setStep('done')
    setTimeout(() => router.push('/dashboard/client'), 2500)
  }

  const setAnswer = (qId: string, val: any) => setAnswers(p => ({ ...p, [qId]: val }))

  const renderField = (q: any) => {
    const base = { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any }
    switch(q.question_type) {
      case 'text':     return <input value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''} style={base} />
      case 'textarea': return <textarea value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''} rows={4} style={{ ...base, resize:'vertical', lineHeight:1.5 }} />
      case 'number':   return <input type="number" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''} style={base} />
      case 'date':     return <input type="date" value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} style={base} />
      case 'scale':
        return (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:11, color:t.textMuted }}>{q.scale_min_label||q.scale_min||1}</span>
              <span style={{ fontSize:16, fontWeight:900, color:t.teal }}>{answers[q.id] ?? '—'}</span>
              <span style={{ fontSize:11, color:t.textMuted }}>{q.scale_max_label||q.scale_max||10}</span>
            </div>
            <input type="range" min={q.scale_min||1} max={q.scale_max||10} value={answers[q.id]||q.scale_min||1}
              onChange={e=>setAnswer(q.id,parseInt(e.target.value))} style={{ width:'100%', accentColor:t.teal }} />
          </div>
        )
      case 'radio':
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(q.options||[]).map((opt: string) => (
              <label key={opt} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                <input type="radio" name={q.id} value={opt} checked={answers[q.id]===opt} onChange={()=>setAnswer(q.id,opt)} style={{ accentColor:t.teal, width:16, height:16 }} />
                <span style={{ fontSize:13, color:t.text }}>{opt}</span>
              </label>
            ))}
          </div>
        )
      case 'checkbox':
        return (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {(q.options||[]).map((opt: string) => {
              const checked = (answers[q.id]||[]).includes(opt)
              return (
                <label key={opt} style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
                  <input type="checkbox" checked={checked} onChange={()=>{
                    const cur = answers[q.id]||[]
                    setAnswer(q.id, checked ? cur.filter((x:string)=>x!==opt) : [...cur, opt])
                  }} style={{ accentColor:t.teal, width:16, height:16 }} />
                  <span style={{ fontSize:13, color:t.text }}>{opt}</span>
                </label>
              )
            })}
          </div>
        )
      default: return <input value={answers[q.id]||''} onChange={e=>setAnswer(q.id,e.target.value)} style={base} />
    }
  }

  if (step === 'loading') return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:32, marginBottom:12 }}>⚡</div>Getting things ready...</div>
    </div>
  )

  if (step === 'done') return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>🎉</div>
        <div style={{ fontSize:24, fontWeight:900, color:t.green, marginBottom:8 }}>You're all set!</div>
        <div style={{ fontSize:14, color:t.textMuted }}>Heading to your dashboard...</div>
      </div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:560, margin:'0 auto', padding:'40px 20px 80px' }}>
        {/* Logo / branding */}
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:28, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>SRG FIT</div>
          <div style={{ fontSize:13, color:t.textMuted }}>Strength · Nutrition · Mental Health</div>
        </div>

        {step === 'welcome' && (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>👋</div>
            <div style={{ fontSize:22, fontWeight:900, marginBottom:8 }}>Welcome{invite?.full_name ? `, ${invite.full_name.split(' ')[0]}` : ''}!</div>
            <div style={{ fontSize:14, color:t.textMuted, marginBottom:24, lineHeight:1.7 }}>
              {invite?.message || "I'm fired up to work with you. Before we get started, I need a few minutes of your time to set things up right."}
            </div>
            {form ? (
              <>
                <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16, marginBottom:24, textAlign:'left' }}>
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>{form.title}</div>
                  {form.description && <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>{form.description}</div>}
                  <div style={{ fontSize:12, color:t.textDim, marginTop:8 }}>{questions.length} questions · Takes about {Math.ceil(questions.length * 0.75)} minutes</div>
                </div>
                <button onClick={()=>setStep('questions')}
                  style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:14, padding:'14px 40px', fontSize:15, fontWeight:900, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Let's Do This →
                </button>
              </>
            ) : (
              <button onClick={submit}
                style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:14, padding:'14px 40px', fontSize:15, fontWeight:900, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Get Started →
              </button>
            )}
            {error && <div style={{ marginTop:16, fontSize:13, color:t.red }}>{error}</div>}
          </div>
        )}

        {step === 'questions' && (
          <div>
            <div style={{ marginBottom:24 }}>
              <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                <div style={{ height:'100%', width:(Object.keys(answers).length/Math.max(questions.length,1)*100)+'%', background:`linear-gradient(90deg,${t.teal},${t.orange})`, borderRadius:4, transition:'width .3s' }} />
              </div>
              <div style={{ fontSize:11, color:t.textMuted, marginTop:6, textAlign:'right' }}>{Object.keys(answers).length} / {questions.length} answered</div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
              {questions.map((q, i) => (
                <div key={q.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16 }}>
                  <div style={{ marginBottom:10 }}>
                    <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>
                      {i+1}. {q.label}
                      {q.required && <span style={{ color:t.orange, marginLeft:6 }}>*</span>}
                    </div>
                    {q.helper_text && <div style={{ fontSize:12, color:t.textMuted }}>{q.helper_text}</div>}
                  </div>
                  {renderField(q)}
                </div>
              ))}
            </div>

            {error && <div style={{ marginTop:16, fontSize:13, color:t.red, textAlign:'center' }}>{error}</div>}

            <button onClick={submit} disabled={submitting}
              style={{ width:'100%', marginTop:24, background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:14, padding:'14px', fontSize:15, fontWeight:900, color:'#000', cursor:submitting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:submitting?.6:1 }}>
              {submitting ? 'Submitting...' : '🚀 Submit & Get Started'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}
