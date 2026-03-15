'use client'
import React from 'react'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { triggerAiInsight } from '@/lib/ai-insights'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15", pink:"#f472b6",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const STEPS = [
  { id:'body',   label:'Body',       icon:'⚖️'  },
  { id:'mental', label:'Mental',     icon:'🧠'  },
  { id:'sleep',  label:'Sleep',      icon:'🌙'  },
  { id:'adhere', label:'Adherence',  icon:'📊'  },
  { id:'reflect',label:'Reflection', icon:'✍️'  },
]

const SliderRow = ({ label, value, onChange, color, min=1, max=10, lowLabel='Low', highLabel='High', invertColor=false }: any) => {
  const pct = ((value - min) / (max - min)) * 100
  // For inverted sliders (stress, pain): green at low, red at high
  const fillColor = invertColor
    ? (pct >= 70 ? t.red : pct >= 40 ? t.orange : t.green)
    : color
  const gradientStart = invertColor ? '#22c55e' : color+'88'
  const gradientEnd = invertColor ? t.red : color
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{label}</div>
        <div style={{ fontSize:20, fontWeight:900, color, minWidth:32, textAlign:'right' }}>{value}</div>
      </div>
      <div style={{ position:'relative', height:32, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', width:'100%', height:6, background:t.surfaceHigh, borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:pct+'%', background:`linear-gradient(90deg,${gradientStart},${gradientEnd})`, borderRadius:3, transition:'width 0.1s' }} />
        </div>
        <input type="range" min={min} max={max} value={value} onChange={e=>onChange(+e.target.value)}
          style={{ position:'relative', width:'100%', appearance:'none', background:'transparent', cursor:'pointer', zIndex:1 }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginTop:3 }}>
        <span>{min} — {lowLabel}</span><span>{max} — {highLabel}</span>
      </div>
      <style>{`input[type=range]::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:${fillColor};border:3px solid #fff;cursor:pointer;box-shadow:0 2px 8px ${fillColor}60;}`}</style>
    </div>
  )
}

export default function CheckinForm() {
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [alreadyDone,  setAlreadyDone]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [done,         setDone]         = useState(false)
  const [step,         setStep]         = useState(0)
  const router   = useRouter()
  const supabase = createClient()

  // Body
  const [weight,     setWeight]     = useState('')
  const [painScore,  setPainScore]  = useState(1)
  const [painNotes,  setPainNotes]  = useState('')
  // Mental
  const [moodScore,  setMoodScore]  = useState(5)
  const [stress,     setStress]     = useState(5)
  const [energy,     setEnergy]     = useState(5)
  const [hunger,     setHunger]     = useState(5)
  // Sleep
  const [sleepHours, setSleepHours] = useState('')
  const [sleepQual,  setSleepQual]  = useState(5)
  // Adherence
  const [workoutAdh, setWorkoutAdh] = useState(80)
  const [nutritionAdh, setNutritionAdh] = useState(80)
  const [habitAdh,   setHabitAdh]   = useState(80)
  // Reflection
  const [wins,         setWins]         = useState('')
  const [struggles,    setStruggles]    = useState('')
  const [goalsNext,    setGoalsNext]    = useState('')
  const [coachMessage, setCoachMessage] = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, coach_id')
        .eq('profile_id', user.id)
        .single()
      setClientRecord(clientData)
      if (clientData) {
        const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6)
        const { data: recent } = await supabase
          .from('checkins').select('id').eq('client_id', clientData.id)
          .gte('submitted_at', weekAgo.toISOString()).limit(1)
        if (recent && recent.length > 0) setAlreadyDone(true)
      }
      setLoading(false)
    }
    load()
  }, [])

  const handleSubmit = async () => {
    if (!clientRecord) return
    setSubmitting(true)
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
    await supabase.from('checkins').insert({
      client_id:          clientRecord.id,
      coach_id:           clientRecord.coach_id,
      weight:             weight ? +weight : null,
      sleep_hours:        sleepHours ? +sleepHours : null,
      sleep_quality:      sleepQual,
      mood_score:         moodScore,
      energy_score:       energy,
      stress:             stress,
      hunger_score:       hunger,
      pain_score:         painScore,
      pain_notes:         painNotes || null,
      workout_adherence:  workoutAdh,
      nutrition_adherence:nutritionAdh,
      habit_adherence:    habitAdh,
      wins:               wins || null,
      struggles:          struggles || null,
      goals_next_week:    goalsNext || null,
      coach_message:      coachMessage || null,
      submitted_at:       now.toISOString(),
      week_start:         weekStart.toISOString().split('T')[0],
      week_end:           weekEnd.toISOString().split('T')[0],
    })
    setSubmitting(false)
    setDone(true)
    if (clientRecord.coach_id) {
      triggerAiInsight(clientRecord.id, clientRecord.coach_id, 'checkin_brief')
      triggerAiInsight(clientRecord.id, clientRecord.coach_id, 'red_flag')
    }
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  if (done) return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
        <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
          <div style={{ fontSize:22, fontWeight:900, marginBottom:8 }}>Check-in submitted!</div>
          <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>Your coach will review it shortly. Keep crushing it!</div>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </>
  )

  if (alreadyDone) return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
        <div style={{ textAlign:'center', maxWidth:380, padding:32 }}>
          <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
          <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>Already checked in this week!</div>
          <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.6, marginBottom:28 }}>You can submit another one next week. Your coach has your data.</div>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </>
  )

  const stepContent: Record<string, React.ReactElement> = {
    body: (
      <div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:8 }}>Weight (lbs) — optional</label>
          <input type="number" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="e.g. 172.5"
            style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
        </div>
        <SliderRow label="Pain Level" value={painScore} onChange={setPainScore} color={t.red} lowLabel="None" highLabel="Severe" invertColor />
        {painScore >= 4 && (
          <div style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:8 }}>Where / what kind of pain?</label>
            <textarea value={painNotes} onChange={e=>setPainNotes(e.target.value)} rows={2} placeholder="e.g. lower back tightness after deadlifts..."
              style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.5 }} />
          </div>
        )}
      </div>
    ),
    mental: (
      <div>
        <SliderRow label="😊 Mood" value={moodScore} onChange={setMoodScore} color={t.pink} lowLabel="Low" highLabel="Great" />
        <SliderRow label="⚡ Energy" value={energy} onChange={setEnergy} color={t.yellow} lowLabel="Drained" highLabel="Energized" />
        <SliderRow label="😤 Stress" value={stress} onChange={setStress} color={t.red} lowLabel="Chill" highLabel="Maxed out" invertColor />
        <SliderRow label="🍽 Hunger" value={hunger} onChange={setHunger} color={t.orange} lowLabel="Never hungry" highLabel="Always hungry" />
      </div>
    ),
    sleep: (
      <div>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:8 }}>Average sleep this week (hours)</label>
          <input type="number" value={sleepHours} onChange={e=>setSleepHours(e.target.value)} placeholder="e.g. 7.5" step="0.5" min="0" max="24"
            style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
        </div>
        <SliderRow label="🌙 Sleep Quality" value={sleepQual} onChange={setSleepQual} color={t.purple} lowLabel="Terrible" highLabel="Perfect" />
      </div>
    ),
    adhere: (
      <div>
        <SliderRow label="💪 Workout Adherence" value={workoutAdh} onChange={setWorkoutAdh} color={t.teal} min={0} max={100} lowLabel="0%" highLabel="100%" />
        <SliderRow label="🥗 Nutrition Adherence" value={nutritionAdh} onChange={setNutritionAdh} color={t.green} min={0} max={100} lowLabel="0%" highLabel="100%" />
        <SliderRow label="✅ Habit Adherence" value={habitAdh} onChange={setHabitAdh} color={t.orange} min={0} max={100} lowLabel="0%" highLabel="100%" />
      </div>
    ),
    reflect: (
      <div>
        {[
          { label:'🏆 Wins this week', val:wins, set:setWins, placeholder:'What went well? Any PRs, consistency streaks, mindset wins...' },
          { label:'⚡ Struggles', val:struggles, set:setStruggles, placeholder:"What was tough? Don't hold back — your coach needs the real picture." },
          { label:'🎯 Goals for next week', val:goalsNext, set:setGoalsNext, placeholder:'What do you want to focus on or accomplish next week?' },
          { label:'💬 Message to coach', val:coachMessage, set:setCoachMessage, placeholder:'Anything specific you want your coach to know or address?' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom:20 }}>
            <label style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:8 }}>{f.label}</label>
            <textarea value={f.val} onChange={e=>f.set(e.target.value)} rows={3} placeholder={f.placeholder}
              style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', boxSizing:'border-box' as any, lineHeight:1.6 }} />
          </div>
        ))}
      </div>
    ),
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 20px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>📋 Weekly Check-In</div>
        </div>

        {/* Step progress */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'16px 20px' }}>
          <div style={{ maxWidth:520, margin:'0 auto', display:'flex', gap:8 }}>
            {STEPS.map((s, i) => (
              <button key={s.id} onClick={()=>setStep(i)}
                style={{ flex:1, background:i===step?t.tealDim:i<step?t.greenDim:'transparent', border:'1px solid '+(i===step?t.teal+'60':i<step?t.green+'40':t.border), borderRadius:10, padding:'8px 4px', cursor:'pointer', textAlign:'center', transition:'all 0.15s' }}>
                <div style={{ fontSize:14 }}>{s.icon}</div>
                <div style={{ fontSize:9, fontWeight:700, color:i===step?t.teal:i<step?t.green:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginTop:2 }}>{s.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div style={{ maxWidth:520, margin:'0 auto', padding:24 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24, marginBottom:20 }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>{STEPS[step].icon} {STEPS[step].label}</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Step {step+1} of {STEPS.length}</div>
            {stepContent[STEPS[step].id]}
          </div>

          {/* Navigation */}
          <div style={{ display:'flex', gap:10 }}>
            {step > 0 && (
              <button onClick={()=>setStep(s=>s-1)}
                style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'12px', fontSize:13, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                ← Back
              </button>
            )}
            {step < STEPS.length - 1 ? (
              <button onClick={()=>setStep(s=>s+1)}
                style={{ flex:2, background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Next →
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                style={{ flex:2, background:'linear-gradient(135deg,'+t.green+','+t.teal+')', border:'none', borderRadius:12, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:submitting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:submitting?0.6:1 }}>
                {submitting ? 'Submitting...' : '✓ Submit Check-In'}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
