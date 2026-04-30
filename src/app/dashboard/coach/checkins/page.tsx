'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

function ScorePill({ val, max=10, invert=false }: { val:number|null|undefined, max?:number, invert?:boolean }) {
  if (val == null) return <span style={{ color:t.textMuted }}>—</span>
  const pct = val / max
  const color = invert
    ? (pct >= 0.7 ? t.red : pct >= 0.4 ? t.orange : t.green)
    : (pct >= 0.7 ? t.green : pct >= 0.4 ? t.orange : t.red)
  return <span style={{ fontWeight:800, color }}>{val}/{max}</span>
}

export default function CoachCheckins() {
  const [checkins, setCheckins] = useState<any[]>([])
  const [clients,  setClients]  = useState<any[]>([])
  const [filter,   setFilter]   = useState<'all'|'unreviewed'>('unreviewed')
  const [selected, setSelected] = useState<any|null>(null)
  const [feedback, setFeedback] = useState('')
  const [saving,   setSaving]   = useState(false)
  const [loading,  setLoading]  = useState(true)
  const [questions, setQuestions] = useState<Record<string, any[]>>({}) // formId -> questions
  const [weeklyPulse, setWeeklyPulse] = useState<Record<string, any>>({}) // clientId -> avg scores
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: clientList } = await supabase
      .from('clients')
      .select('id, profile:profiles!clients_profile_id_fkey(full_name)')
      .eq('coach_id', user.id)
    setClients(clientList || [])

    const clientIds = (clientList || []).map((c:any) => c.id)
    if (!clientIds.length) { setLoading(false); return }

    const { data } = await supabase
      .from('client_form_assignments')
      .select('*, form:onboarding_forms(title, form_type, is_checkin_type)')
      .in('client_id', clientIds)
      .eq('status', 'completed')
      .not('response', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(100)

    // Only show actual check-in type forms
    const checkIns = (data || []).filter(
      (d:any) => {
        const f = Array.isArray(d.form) ? d.form[0] : d.form
        return f?.is_checkin_type || f?.form_type === 'check_in'
      }
    )
    setCheckins(checkIns)

    // Fetch questions for all unique form IDs
    const formIds = [...new Set(checkIns.map((c:any) => c.form_id).filter(Boolean))]
    if (formIds.length > 0) {
      const { data: qData } = await supabase
        .from('onboarding_questions')
        .select('id, form_id, sort_order, label, question_type, maps_to')
        .in('form_id', formIds)
        .order('sort_order')
      const qMap: Record<string, any[]> = {}
      ;(qData || []).forEach((q: any) => {
        if (!qMap[q.form_id]) qMap[q.form_id] = []
        qMap[q.form_id].push(q)
      })
      setQuestions(qMap)
    }

    // Fetch weekly morning pulse averages per client (last 7 days)
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)
    const weekStr = weekAgo.toISOString().split('T')[0]
    const { data: pulseData } = await supabase
      .from('daily_checkins')
      .select('client_id, sleep_quality, energy_score, stress_score, mood_score')
      .in('client_id', clientIds)
      .gte('checkin_date', weekStr)
    const pulseMap: Record<string, any> = {}
    ;(pulseData || []).forEach((p: any) => {
      if (!pulseMap[p.client_id]) pulseMap[p.client_id] = { sleep: [], energy: [], stress: [], mood: [], count: 0 }
      const m = pulseMap[p.client_id]
      if (p.sleep_quality != null) m.sleep.push(p.sleep_quality)
      if (p.energy_score != null) m.energy.push(p.energy_score)
      if (p.stress_score != null) m.stress.push(p.stress_score)
      if (p.mood_score != null) m.mood.push(p.mood_score)
      m.count++
    })
    // Compute averages
    Object.keys(pulseMap).forEach(cid => {
      const m = pulseMap[cid]
      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length*10)/10 : null
      pulseMap[cid] = { sleep: avg(m.sleep), energy: avg(m.energy), stress: avg(m.stress), mood: avg(m.mood), count: m.count }
    })

    // Fetch sleep hours from habit_logs (Sleep habit, last 7 days)
    const { data: sleepHabits } = await supabase
      .from('habits')
      .select('id, client_id')
      .in('client_id', clientIds)
      .ilike('label', '%sleep%')
      .eq('active', true)
    const sleepHabitIds = (sleepHabits || []).map((h: any) => h.id)
    const sleepClientMap: Record<string, string> = {}
    ;(sleepHabits || []).forEach((h: any) => { sleepClientMap[h.id] = h.client_id })

    if (sleepHabitIds.length > 0) {
      const { data: sleepLogs } = await supabase
        .from('habit_logs')
        .select('habit_id, value, logged_date')
        .in('habit_id', sleepHabitIds)
        .gte('logged_date', weekStr)
      const sleepByClient: Record<string, number[]> = {}
      ;(sleepLogs || []).forEach((l: any) => {
        const cid = sleepClientMap[l.habit_id]
        if (!cid) return
        if (!sleepByClient[cid]) sleepByClient[cid] = []
        const val = parseFloat(l.value)
        if (!isNaN(val)) sleepByClient[cid].push(val)
      })
      Object.entries(sleepByClient).forEach(([cid, vals]) => {
        if (!pulseMap[cid]) pulseMap[cid] = {}
        pulseMap[cid].sleepHours = Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10
      })
    }

    setWeeklyPulse(pulseMap)

    setLoading(false)
  }

  const clientName = (id: string) => {
    const c = clients.find(c => c.id === id)
    return c?.profile?.full_name || 'Unknown'
  }

  const handleReview = async () => {
    if (!selected) return
    setSaving(true)
    const { error } = await supabase.from('client_form_assignments').update({
      coach_response: feedback.trim() || null,
      coach_responded_at: new Date().toISOString(),
    }).eq('id', selected.id)
    setSaving(false)
    if (error) {
      alert('Could not save coach response: ' + error.message)
      return
    }
    setCheckins(prev => prev.map(c => c.id === selected.id
      ? { ...c, coach_response: feedback.trim() || null, coach_responded_at: new Date().toISOString() }
      : c))
  }

  const visible = filter === 'unreviewed'
    ? checkins.filter(c => !c.coach_response)
    : checkins

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading check-ins...</div>
    </div>
  )

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>
            ← Back
          </button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>✅ Check-in Reviews</div>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:6 }}>
            {(['unreviewed','all'] as const).map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  border:'1px solid '+(filter===f?t.teal+'60':t.border),
                  background:filter===f?t.tealDim:'transparent',
                  color:filter===f?t.teal:t.textDim }}>
                {f === 'unreviewed' ? `Needs Review (${checkins.filter(c=>!c.coach_response).length})` : 'All'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ maxWidth:1100, margin:'0 auto', padding:28, display:'grid', gridTemplateColumns:'1fr 440px', gap:20, alignItems:'start' }}>

          {/* Left: list */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {visible.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'56px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>✅</div>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>
                  {filter === 'unreviewed' ? 'All caught up!' : 'No check-ins yet'}
                </div>
                <div style={{ fontSize:13, color:t.textMuted }}>
                  {filter === 'unreviewed' ? 'No pending check-ins.' : 'Check-ins will appear once clients submit them.'}
                </div>
              </div>
            ) : visible.map((ci:any) => {
              const r = ci.response || {}
              return (
                <div key={ci.id} onClick={()=>{ setSelected(ci); setFeedback(ci.coach_response||'') }}
                  style={{ background:t.surface, border:'1px solid '+(selected?.id===ci.id?t.teal+'60':t.border),
                    borderRadius:14, padding:16, cursor:'pointer', transition:'border 0.15s' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{clientName(ci.client_id)}</div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                        {ci.completed_at ? new Date(ci.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : '—'}
                        {ci.form?.title && <span> · {ci.form.title}</span>}
                      </div>
                    </div>
                    {ci.coach_response
                      ? <span style={{ fontSize:10, fontWeight:800, color:t.green, background:t.greenDim, borderRadius:6, padding:'3px 9px' }}>✓ Reviewed</span>
                      : <span style={{ fontSize:10, fontWeight:800, color:t.orange, background:t.orangeDim, borderRadius:6, padding:'3px 9px' }}>Needs Review</span>
                    }
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6 }}>
                    {(() => {
                      const pulse = weeklyPulse[ci.client_id]
                      return [
                        { label:'Mood',      val: pulse?.mood ?? r.mood_score },
                        { label:'Energy',    val: pulse?.energy ?? r.energy_score },
                        { label:'Sleep Q',   val: pulse?.sleep ?? r.sleep_quality },
                        { label:'Stress',    val: pulse?.stress ?? r.stress_score, invert:true },
                        { label:'Workout',   val:r.workout_adherence, max:100 },
                        { label:'Nutrition', val:r.nutrition_adherence, max:100 },
                      ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:8, padding:'7px 8px', textAlign:'center' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:3 }}>{s.label}</div>
                        <ScorePill val={s.val} max={s.max||10} invert={s.invert} />
                      </div>
                    ))
                    })()}
                  </div>
                  {(r.wins || r.struggles) && (
                    <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:3 }}>
                      {r.wins && <div style={{ fontSize:12, color:t.green }}>🏆 {r.wins}</div>}
                      {r.struggles && <div style={{ fontSize:12, color:t.orange }}>⚡ {r.struggles}</div>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Right: detail + review panel */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:22, position:'sticky', top:20 }}>
            {!selected ? (
              <div style={{ textAlign:'center', padding:'40px 20px', color:t.textMuted }}>
                <div style={{ fontSize:28, marginBottom:10 }}>👈</div>
                <div style={{ fontSize:13 }}>Select a check-in to review</div>
              </div>
            ) : (() => {
              const r = selected.response || {}
              return (
                <>
                  <div style={{ fontSize:14, fontWeight:800, marginBottom:2 }}>{clientName(selected.client_id)}</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginBottom:16 }}>
                    {selected.completed_at ? new Date(selected.completed_at).toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' }) : '—'}
                    {selected.form?.title && <span> · {selected.form.title}</span>}
                  </div>

                  {/* Score grid — weekly pulse averages */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
                    {(() => {
                      const pulse = weeklyPulse[selected.client_id]
                      return [
                        { label:'Mood',          val: pulse?.mood ?? r.mood_score,    color:t.pink   },
                        { label:'Energy',        val: pulse?.energy ?? r.energy_score, color:t.yellow },
                        { label:'Sleep Quality', val: pulse?.sleep ?? r.sleep_quality, color:t.purple },
                        { label:'Sleep Hours',   val: pulse?.sleepHours ?? r.sleep_hours, unit:'hrs', raw:true  },
                        { label:'Stress',        val: pulse?.stress ?? r.stress_score, color:t.red, invert:true },
                        { label:'Weight',        val:r.weight_lbs || r.weight, unit:'lbs', raw:true  },
                      ].map(s => (
                      <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                        {(s as any).raw
                          ? <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}${(s as any).unit||''}` : '—'}</div>
                          : <ScorePill val={s.val} invert={s.invert} />
                        }
                      </div>
                    ))
                    })()}
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14 }}>
                    {[
                      { label:'Workout',   val:r.workout_adherence },
                      { label:'Nutrition', val:r.nutrition_adherence },
                      { label:'Habits',    val:r.habit_adherence },
                    ].map(s => (
                      <div key={s.label} style={{ background:t.tealDim, border:'1px solid '+t.teal+'25', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                        <div style={{ fontSize:9, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
                        <div style={{ fontSize:15, fontWeight:800, color:t.teal }}>{s.val != null ? `${s.val}%` : '—'}</div>
                      </div>
                    ))}
                  </div>

                  {r.wins            && <div style={{ background:t.greenDim,  border:'1px solid '+t.green+'30',  borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green,  marginBottom:8 }}><strong>Wins:</strong> {r.wins}</div>}
                  {r.struggles       && <div style={{ background:t.orangeDim, border:'1px solid '+t.orange+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.orange, marginBottom:8 }}><strong>Struggles:</strong> {r.struggles}</div>}
                  {r.goals_next_week && <div style={{ background:t.purpleDim, border:'1px solid '+t.purple+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.purple, marginBottom:8 }}><strong>Goals next week:</strong> {r.goals_next_week}</div>}
                  {r.pain_notes      && <div style={{ background:t.redDim,    border:'1px solid '+t.red+'30',    borderRadius:10, padding:'10px 12px', fontSize:12, color:t.red,    marginBottom:8 }}><strong>Pain notes:</strong> {r.pain_notes}</div>}
                  {r.message_to_coach && <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.teal, marginBottom:8 }}><strong>Message:</strong> {r.message_to_coach}</div>}

                  {/* Form questions with answers — shown in order */}
                  {(() => {
                    const formQuestions = questions[selected.form_id] || []
                    const knownMappedKeys = new Set(['mood_score','energy_score','sleep_quality','sleep_hours','stress_score','stress','hunger_score','pain_score','pain_notes','weight_lbs','weight','workout_adherence','nutrition_adherence','habit_adherence'])
                    // Show questions that have responses and aren't already shown in the score grid
                    const qAndA = formQuestions
                      .filter((q: any) => {
                        const key = q.maps_to || q.id
                        const val = r[key] ?? r[q.id]
                        return val != null && String(val).trim() !== '' && !knownMappedKeys.has(key)
                      })
                      .map((q: any) => ({
                        label: q.label,
                        value: r[q.maps_to || q.id] ?? r[q.id],
                        type: q.question_type,
                      }))

                    if (!qAndA.length) return null
                    return (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Responses</div>
                        {qAndA.map((qa: any, i: number) => (
                          <div key={i} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', marginBottom:6 }}>
                            <div style={{ fontSize:10, fontWeight:700, color:t.teal, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{qa.label}</div>
                            {qa.type === 'file' || String(qa.value).startsWith('http')
                              ? <a href={String(qa.value)} target="_blank" rel="noreferrer" style={{ color:t.teal, fontSize:12 }}>View photo</a>
                              : <div style={{ fontSize:13, color:t.text, lineHeight:1.5 }}>{String(qa.value)}</div>
                            }
                          </div>
                        ))}
                      </div>
                    )
                  })()}

                  {/* Previous coach response if exists */}
                  {selected.coach_response && (
                    <div style={{ background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:10, padding:'10px 12px', fontSize:12, color:t.green, marginBottom:12 }}>
                      <strong>Your previous response:</strong> {selected.coach_response}
                    </div>
                  )}

                  {/* Coach feedback */}
                  <div style={{ marginTop:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Your Response</div>
                    <textarea value={feedback} onChange={e=>setFeedback(e.target.value)}
                      placeholder="Reply to this check-in... (client will see this)"
                      rows={4}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10,
                        padding:'10px 13px', fontSize:13, color:t.text, outline:'none',
                        fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark',
                        boxSizing:'border-box' as any, lineHeight:1.5 }} />
                    <button onClick={handleReview} disabled={saving}
                      style={{ marginTop:10, width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)',
                        border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800,
                        color:'#000', cursor:saving?'not-allowed':'pointer',
                        fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
                      {saving ? 'Saving...' : selected.coach_response ? '✓ Update Response' : '✓ Save Response'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>

        </div>
      </div>
    </>
  )
}
