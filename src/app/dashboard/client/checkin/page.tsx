'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const EMOJI_MOODS = ['😔','😕','😐','🙂','😄']

export default function CheckinForm() {
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [alreadyDone,  setAlreadyDone]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [submitting,   setSubmitting]   = useState(false)
  const [done,         setDone]         = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  // Form state
  const [weight,      setWeight]      = useState('')
  const [sleepHours,  setSleepHours]  = useState('')
  const [motivation,  setMotivation]  = useState(5)
  const [stress,      setStress]      = useState(5)
  const [energy,      setEnergy]      = useState(5)
  const [wins,        setWins]        = useState('')
  const [struggles,   setStruggles]   = useState('')
  const [goals,       setGoals]       = useState('')
  const [coachNote,   setCoachNote]   = useState('')

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: clientData } = await supabase
        .from('clients').select('*').eq('profile_id', user.id).eq('active', true).single()
      setClientRecord(clientData)

      if (clientData) {
        // Check if already submitted this week
        const weekAgo = new Date()
        weekAgo.setDate(weekAgo.getDate() - 7)
        const { data: recent } = await supabase
          .from('checkins')
          .select('id, submitted_at')
          .eq('client_id', clientData.id)
          .gte('submitted_at', weekAgo.toISOString())
          .order('submitted_at', { ascending: false })
          .limit(1)
        if (recent && recent.length > 0) setAlreadyDone(true)
      }
      setLoading(false)
    }
    load()
  }, [])


  const handleSubmit = async () => {
    if (!clientRecord) return
    setSubmitting(true)
    await supabase.from('checkins').insert({
      client_id:   clientRecord.id,
      weight:      weight ? +weight : null,
      sleep_hours: sleepHours ? +sleepHours : null,
      motivation,
      stress,
      energy,
      wins:        wins || null,
      struggles:   struggles || null,
      goals:       goals || null,
      submitted_at: new Date().toISOString(),
    })
    setSubmitting(false)
    setDone(true)
  }

  const SliderField = ({ label, value, onChange, color, emoji }: any) => (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <div style={{ fontSize:14, fontWeight:700 }}>{label}</div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:22 }}>{EMOJI_MOODS[Math.round((value-1)/9*4)]}</span>
          <div style={{ fontSize:22, fontWeight:900, color, minWidth:28, textAlign:'right' }}>{value}</div>
        </div>
      </div>
      <div style={{ position:'relative', height:36, display:'flex', alignItems:'center' }}>
        <div style={{ position:'absolute', width:'100%', height:6, background:t.surfaceHigh, borderRadius:3, overflow:'hidden' }}>
          <div style={{ height:'100%', width:((value-1)/9*100)+'%', background:'linear-gradient(90deg,'+color+'88,'+color+')', borderRadius:3, transition:'width 0.1s ease' }} />
        </div>
        <input type="range" min={1} max={10} value={value} onChange={e=>onChange(+e.target.value)}
          style={{ position:'relative', width:'100%', appearance:'none', background:'transparent', cursor:'pointer', zIndex:1 }} />
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginTop:4 }}>
        <span>1 — Low</span><span>10 — High</span>
      </div>
      <style>{`input[type=range]::-webkit-slider-thumb{appearance:none;width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;cursor:pointer;box-shadow:0 2px 8px ${color}60;}`}</style>
    </div>
  )


  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};} @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}.fade{animation:fadeUp 0.3s ease forwards;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 20px', display:'flex', alignItems:'center', height:56 }}>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ flex:1, textAlign:'center', fontSize:14, fontWeight:800 }}>Weekly Check-in</div>
          <div style={{ width:50 }} />
        </div>

        <div style={{ maxWidth:520, margin:'0 auto', padding:'24px 20px 48px' }}>

          {done ? (
            <div className="fade" style={{ textAlign:'center', padding:'48px 20px' }}>
              <div style={{ fontSize:56, marginBottom:16 }}>🎉</div>
              <div style={{ fontSize:22, fontWeight:900, marginBottom:8 }}>Check-in submitted!</div>
              <div style={{ fontSize:14, color:t.textMuted, marginBottom:8, lineHeight:1.6 }}>Shane will review your check-in and get back to you soon.</div>
              <div style={{ fontSize:13, color:t.teal, fontStyle:'italic', marginBottom:28 }}>Be Kind to Yourself & Stay Awesome 💪</div>
              <button onClick={()=>router.push('/dashboard/client')}
                style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Back to Dashboard →
              </button>
            </div>
          ) : alreadyDone ? (
            <div className="fade" style={{ textAlign:'center', padding:'48px 20px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
              <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>Already checked in this week!</div>
              <div style={{ fontSize:14, color:t.textMuted, marginBottom:28, lineHeight:1.6 }}>You've already submitted your check-in for this week. See you next week!</div>
              <button onClick={()=>router.push('/dashboard/client')}
                style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Back to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ marginBottom:28 }} className="fade">
                <div style={{ fontSize:22, fontWeight:900, marginBottom:6 }}>Weekly Check-in 📋</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Take a few minutes to reflect on your week. This helps Shane tailor your program to what you actually need.</div>
              </div>


              {/* Stats section */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'20px', marginBottom:16 }} className="fade">
                <div style={{ fontSize:13, fontWeight:800, marginBottom:16, color:t.teal }}>📊 This Week's Stats</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Body Weight (lbs)</div>
                    <input type="number" value={weight} onChange={e=>setWeight(e.target.value)} placeholder="e.g. 185"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Avg Sleep (hrs)</div>
                    <input type="number" value={sleepHours} onChange={e=>setSleepHours(e.target.value)} placeholder="e.g. 7.5"
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', boxSizing:'border-box' as any }} />
                  </div>
                </div>
              </div>

              {/* Sliders */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'20px', marginBottom:16 }} className="fade">
                <div style={{ fontSize:13, fontWeight:800, marginBottom:20, color:t.orange }}>🎚️ How Are You Feeling?</div>
                <SliderField label="Motivation" value={motivation} onChange={setMotivation} color={t.teal}   />
                <SliderField label="Stress Level" value={stress}     onChange={setStress}     color={t.red}    />
                <SliderField label="Energy Level" value={energy}     onChange={setEnergy}     color={t.orange} />
              </div>

              {/* Open text */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'20px', marginBottom:16 }} className="fade">
                <div style={{ fontSize:13, fontWeight:800, marginBottom:16, color:t.green }}>💬 Tell Shane About Your Week</div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, marginBottom:6 }}>🏆 Wins this week</div>
                  <textarea value={wins} onChange={e=>setWins(e.target.value)} rows={3}
                    placeholder="What went well? Any PRs, habits you nailed, moments you're proud of..."
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', lineHeight:1.6, boxSizing:'border-box' as any }} />
                </div>
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, marginBottom:6 }}>😓 Struggles this week</div>
                  <textarea value={struggles} onChange={e=>setStruggles(e.target.value)} rows={3}
                    placeholder="What was hard? Missed workouts, bad sleep, stress, cravings..."
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', lineHeight:1.6, boxSizing:'border-box' as any }} />
                </div>
                <div>
                  <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, marginBottom:6 }}>🎯 Focus for next week</div>
                  <textarea value={goals} onChange={e=>setGoals(e.target.value)} rows={2}
                    placeholder="What do you want to prioritize next week?"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', colorScheme:'dark', lineHeight:1.6, boxSizing:'border-box' as any }} />
                </div>
              </div>

              {/* Submit */}
              <button onClick={handleSubmit} disabled={submitting}
                style={{ width:'100%', padding:'15px', borderRadius:14, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', color:'#000', fontSize:15, fontWeight:900, cursor:submitting?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:submitting?0.7:1, transition:'opacity 0.15s ease', boxShadow:'0 4px 24px '+t.teal+'30' }}>
                {submitting ? 'Submitting...' : 'Submit Check-in 💪'}
              </button>

              <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
                Be Kind to Yourself & Stay Awesome 💪
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
