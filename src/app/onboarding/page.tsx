'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const STEPS = [
  { id:'personal',  label:'About You',       icon:'👤' },
  { id:'stats',     label:'Starting Stats',  icon:'📏' },
  { id:'training',  label:'Training',        icon:'🏋' },
  { id:'goals',     label:'Goals',           icon:'🎯' },
  { id:'lifestyle', label:'Lifestyle',       icon:'🌙' },
  { id:'nutrition', label:'Nutrition',       icon:'🥦' },
  { id:'health',    label:'Health',          icon:'❤' },
  { id:'terms',     label:'Terms',           icon:'📋' },
]

const DAYS      = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const EQUIPMENT = ['Barbell','Dumbbells','Cables','Machines','Bodyweight','Resistance Bands','Kettlebells','Pull-up Bar','Bench','Smith Machine','Other']

const inp = (extra?: object): React.CSSProperties => ({
  width:'100%', background:t.surfaceUp, border:`1px solid ${t.border}`,
  borderRadius:10, padding:'11px 13px', fontSize:14, color:t.text,
  outline:'none', fontFamily:"'DM Sans',sans-serif",
  colorScheme:'dark' as any, boxSizing:'border-box' as any, ...extra
})

export default function OnboardingPage() {
  const supabase  = createClient()
  const router    = useRouter()
  const [clientId, setClientId] = useState<string|null>(null)
  const [profile,  setProfile]  = useState<any>(null)
  const [step,     setStep]     = useState(0)
  const [data,     setData]     = useState<any>({})
  const [agreed,   setAgreed]   = useState(false)
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)
      const { data: cl } = await supabase.from('clients').select('id').eq('profile_id', user.id).eq('active', true).single()
      if (!cl) { router.push('/dashboard/client'); return }
      setClientId(cl.id)
      const { data: existing } = await supabase.from('client_intake_profiles').select('intake_completed_at').eq('client_id', cl.id).single()
      if (existing?.intake_completed_at) { router.push('/dashboard/client'); return }
      const { data: partial } = await supabase.from('client_intake_profiles').select('*').eq('client_id', cl.id).single()
      if (partial) setData(partial)
      setLoading(false)
    }
    load()
  }, [])

  const set = (field: string, val: any) => setData((p: any) => ({ ...p, [field]: val }))
  const toggle = (field: string, val: string) => {
    const arr: string[] = data[field] || []
    set(field, arr.includes(val) ? arr.filter((x: string) => x !== val) : [...arr, val])
  }

  const save = async (completed = false) => {
    if (!clientId) return
    setSaving(true)
    const payload: any = { ...data, client_id: clientId, updated_at: new Date().toISOString() }
    if (completed) payload.intake_completed_at = new Date().toISOString()
    await supabase.from('client_intake_profiles').upsert(payload, { onConflict: 'client_id' })
    setSaving(false)
  }

  const next = async () => { await save(); if (step < STEPS.length - 1) setStep(s => s + 1) }
  const back = () => setStep(s => s - 1)
  const finish = async () => {
    if (!agreed) { setError('Please agree to the Terms & Conditions to continue.'); return }
    setError('')
    await save(true)
    router.push('/dashboard/client')
  }

  const chip = (lbl: string, active: boolean, onClick: () => void, color = t.teal) => (
    <button key={lbl} onClick={onClick}
      style={{ padding:'6px 12px', borderRadius:8, border:`1px solid ${active ? color+'60' : t.border}`,
        background: active ? color+'15' : 'transparent', fontSize:12, fontWeight: active ? 700 : 500 as any,
        color: active ? color : t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
      {lbl}
    </button>
  )

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  const currentStep = STEPS[step]
  const progress = (step / (STEPS.length - 1)) * 100

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#080810;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:`1px solid ${t.border}`, padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:16, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ fontSize:12, color:t.textMuted }}>Step {step+1} of {STEPS.length}</div>
        </div>

        {/* Progress bar */}
        <div style={{ height:3, background:t.surfaceHigh }}>
          <div style={{ height:'100%', width:`${progress}%`, background:'linear-gradient(90deg,#00c9b1,#f5a623)', transition:'width 0.4s ease' }}/>
        </div>

        {/* Step indicators */}
        <div style={{ display:'flex', overflowX:'auto' as any, padding:'12px 16px', gap:8, borderBottom:`1px solid ${t.border}`, background:t.surface }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{ display:'flex', alignItems:'center', gap:5, flexShrink:0, opacity: i > step ? 0.4 : 1, transition:'opacity 0.2s' }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background: i < step ? t.teal : i === step ? 'linear-gradient(135deg,#00c9b1,#f5a623)' : t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color: i <= step ? '#000' : t.textMuted }}>
                {i < step ? '✓' : i+1}
              </div>
              <span style={{ fontSize:10, fontWeight: i === step ? 800 : 500, color: i === step ? t.teal : t.textMuted, whiteSpace:'nowrap' as any }}>{s.label}</span>
              {i < STEPS.length-1 && <span style={{ color:t.border, fontSize:10 }}>›</span>}
            </div>
          ))}
        </div>

        {/* Content */}
        <div style={{ maxWidth:520, margin:'0 auto', padding:'24px 20px 120px' }}>

          {/* Step header */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:28, marginBottom:6 }}>{currentStep.icon}</div>
            <div style={{ fontSize:22, fontWeight:900 }}>{currentStep.label}</div>
            {step === 0 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>Tell us a little about yourself so Shane can personalize your experience. 👋</div>}
            {step === 1 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>Your starting point. Be honest — nobody's judging, this is just your baseline.</div>}
            {step === 2 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>Your training history helps Shane program the right starting intensity.</div>}
            {step === 3 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>What are you actually working toward? The more specific, the better.</div>}
            {step === 4 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>How you live outside the gym matters just as much as what's in it.</div>}
            {step === 5 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>Nutrition doesn't need to be complicated — just tell us where you're at.</div>}
            {step === 6 && <div style={{ fontSize:13, color:t.textMuted, marginTop:4 }}>Any health context Shane should know about before programming for you.</div>}
          </div>

          {/* ── STEP 0: Personal ── */}
          {step === 0 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Date of Birth</label>
                <input type="date" value={data.date_of_birth||''} onChange={e=>set('date_of_birth',e.target.value)} style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Phone Number</label>
                <input type="tel" value={data.phone||''} onChange={e=>set('phone',e.target.value)} placeholder="(555) 555-5555" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Gender Identity</label>
                <select value={data.gender||''} onChange={e=>set('gender',e.target.value)} style={inp()}>
                  <option value="">Select...</option>
                  <option>Male</option><option>Female</option><option>Non-binary</option>
                  <option>Prefer not to say</option><option>Self-describe</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Pronouns</label>
                <input type="text" value={data.pronouns||''} onChange={e=>set('pronouns',e.target.value)} placeholder="she/her, he/him, they/them..." style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Time Zone</label>
                <select value={data.timezone||''} onChange={e=>set('timezone',e.target.value)} style={inp()}>
                  <option value="">Select...</option>
                  <option value="America/New_York">Eastern (ET)</option>
                  <option value="America/Chicago">Central (CT)</option>
                  <option value="America/Denver">Mountain (MT)</option>
                  <option value="America/Los_Angeles">Pacific (PT)</option>
                  <option value="America/Anchorage">Alaska</option>
                  <option value="Pacific/Honolulu">Hawaii</option>
                  <option value="Europe/London">London (GMT)</option>
                  <option value="Europe/Berlin">Central Europe</option>
                  <option value="Australia/Sydney">Sydney</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>
            </div>
          )}

          {/* ── STEP 1: Stats ── */}
          {step === 1 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ background:'#00c9b115', border:'1px solid #00c9b130', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#00c9b1' }}>
                These are your starting numbers — a baseline to measure your progress.
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Height (inches)</label>
                  <input type="number" value={data.height_inches||''} onChange={e=>set('height_inches',+e.target.value||null)} placeholder="68" style={inp()} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Starting Weight (lbs)</label>
                  <input type="number" value={data.starting_weight_lbs||''} onChange={e=>set('starting_weight_lbs',+e.target.value||null)} placeholder="180" style={inp()} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Current Weight (lbs)</label>
                  <input type="number" value={data.current_weight_lbs||''} onChange={e=>set('current_weight_lbs',+e.target.value||null)} placeholder="180" style={inp()} />
                </div>
                <div>
                  <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Goal Weight (lbs)</label>
                  <input type="number" value={data.goal_weight_lbs||''} onChange={e=>set('goal_weight_lbs',+e.target.value||null)} placeholder="165" style={inp()} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Body Fat % (if known)</label>
                <input type="number" value={data.body_fat_pct||''} onChange={e=>set('body_fat_pct',+e.target.value||null)} placeholder="Optional" style={inp()} />
              </div>
            </div>
          )}

          {/* ── STEP 2: Training ── */}
          {step === 2 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Training Experience</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Beginner (0-1 year)','Intermediate (1-3 years)','Advanced (3+ years)'].map(opt => (
                    chip(opt, data.training_experience===opt, ()=>set('training_experience',opt))
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Days Per Week Available</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {[2,3,4,5,6].map(n => chip(`${n} days`, data.training_frequency===n, ()=>set('training_frequency',n)))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Preferred Training Days</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => chip(d, (data.preferred_days||[]).includes(d), ()=>toggle('preferred_days',d)))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Equipment Access</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Barbell','Dumbbells','Cables','Machines','Bodyweight','Resistance Bands','Kettlebells','Pull-up Bar','Bench','Other'].map(eq => chip(eq, (data.equipment_access||[]).includes(eq), ()=>toggle('equipment_access',eq), '#f5a623'))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Injuries or Limitations</label>
                <textarea value={data.injuries_limitations||''} onChange={e=>set('injuries_limitations',e.target.value)} rows={3}
                  placeholder="Any current injuries, chronic pain, or movement restrictions..." style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
            </div>
          )}

          {/* ── STEP 3: Goals ── */}
          {step === 3 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Primary Goal</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Lose fat','Build muscle','Improve performance','Build strength','General fitness','Rehab / injury recovery'].map(g => chip(g, data.primary_goal===g, ()=>set('primary_goal',g), '#f5a623'))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Secondary Goal</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Lose fat','Build muscle','Improve performance','Build strength','General fitness','Improve flexibility','Better sleep','More energy'].map(g => chip(g, data.secondary_goal===g, ()=>set('secondary_goal',g)))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Target Date (optional)</label>
                <input type="date" value={data.goal_target_date||''} onChange={e=>set('goal_target_date',e.target.value)} style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#f5a623', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Your Why — What's really driving this?</label>
                <textarea value={data.motivation_why||''} onChange={e=>set('motivation_why',e.target.value)} rows={3}
                  placeholder="The more honest, the better. This is for you." style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Biggest Obstacle</label>
                <textarea value={data.biggest_obstacle||''} onChange={e=>set('biggest_obstacle',e.target.value)} rows={2}
                  placeholder="What's stopped you before?" style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
            </div>
          )}

          {/* ── STEP 4: Lifestyle ── */}
          {step === 4 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Activity Level Outside Gym</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Sedentary (desk job)','Lightly active','Moderately active','Very active','Extremely active'].map(opt => chip(opt, data.activity_level===opt, ()=>set('activity_level',opt)))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Average Sleep (hours/night)</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {[4,5,6,7,8,9].map(n => chip(`${n}h`, data.avg_sleep_hours===n, ()=>set('avg_sleep_hours',n)))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Current Stress Level</label>
                <div style={{ display:'flex', gap:6 }}>
                  {[1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={()=>set('stress_level',n)}
                      style={{ flex:1, padding:'8px 0', borderRadius:8, border:`1px solid ${data.stress_level===n?'#ef444460':'#252538'}`,
                        background: data.stress_level===n?'#ef444415':'transparent', fontSize:12, fontWeight: data.stress_level===n?800:500 as any,
                        color: data.stress_level===n?'#ef4444':'#5a5a78', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      {n}
                    </button>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                  <span style={{ fontSize:10, color:'#5a5a78' }}>Low</span>
                  <span style={{ fontSize:10, color:'#5a5a78' }}>High</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Alcohol Frequency</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['Never','Rarely','1-2x/week','3-4x/week','Daily'].map(opt => chip(opt, data.alcohol_frequency===opt, ()=>set('alcohol_frequency',opt)))}
                </div>
              </div>
            </div>
          )}

          {/* ── STEP 5: Nutrition ── */}
          {step === 5 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8, display:'block' }}>Dietary Approach</label>
                <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                  {['No restrictions','Calorie tracking','Macro tracking','Intermittent fasting','Vegetarian','Vegan','Keto / Low-carb','Paleo','Mediterranean','Other'].map(opt => chip(opt, data.dietary_approach===opt, ()=>set('dietary_approach',opt), '#f5a623'))}
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Food Allergies or Restrictions</label>
                <input type="text" value={data.allergies_restrictions||''} onChange={e=>set('allergies_restrictions',e.target.value)}
                  placeholder="Gluten, dairy, nuts, etc. or None" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Foods You Dislike</label>
                <input type="text" value={data.foods_disliked||''} onChange={e=>set('foods_disliked',e.target.value)}
                  placeholder="Anything you hate eating" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Supplement Use</label>
                <input type="text" value={data.supplement_use||''} onChange={e=>set('supplement_use',e.target.value)}
                  placeholder="Protein powder, creatine, vitamins, etc. or None" style={inp()} />
              </div>
            </div>
          )}

          {/* ── STEP 6: Health ── */}
          {step === 6 && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Medical Conditions</label>
                <textarea value={data.medical_conditions||''} onChange={e=>set('medical_conditions',e.target.value)} rows={3}
                  placeholder="Diabetes, hypertension, thyroid issues, etc. or None" style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Current Medications</label>
                <textarea value={data.current_medications||''} onChange={e=>set('current_medications',e.target.value)} rows={2}
                  placeholder="Any medications that may affect training or nutrition, or None" style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Recent Surgeries or Procedures</label>
                <input type="text" value={data.recent_surgeries||''} onChange={e=>set('recent_surgeries',e.target.value)}
                  placeholder="Within the past 2 years, or None" style={inp()} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6, display:'block' }}>Past Injuries</label>
                <textarea value={data.past_injuries||''} onChange={e=>set('past_injuries',e.target.value)} rows={2}
                  placeholder="Old injuries that still affect you, or None" style={{...inp(), resize:'none' as any, lineHeight:1.6}} />
              </div>
            </div>
          )}

          {/* ── STEP 7: Terms ── */}
          {step === 7 && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:'#0f0f1a', border:'1px solid #252538', borderRadius:14, padding:20 }}>
                <div style={{ fontSize:14, fontWeight:800, marginBottom:12, color:'#eeeef8' }}>Terms & Conditions 🛡</div>
                <div style={{ fontSize:12, color:'#8888a8', lineHeight:1.8, maxHeight:280, overflowY:'auto' as any }}>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>1. Coaching Relationship.</strong> SRG Fit provides online fitness coaching services. Shane is a certified personal trainer (ACE-CPT). This is not a medical service and does not replace advice from a licensed physician.</p>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>2. Health Responsibility.</strong> By proceeding, you confirm you are in adequate physical health to participate in an exercise program. If you have any medical conditions, injuries, or health concerns, consult a physician before starting.</p>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>3. Assumption of Risk.</strong> Exercise involves inherent risks. You agree to follow program instructions safely and take responsibility for your own wellbeing during training sessions.</p>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>4. Privacy.</strong> Your personal information, health data, and journal entries are stored securely and will never be shared with third parties without your consent. Coach Shane may access your data to provide coaching services.</p>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>5. Cancellation.</strong> You may cancel your subscription at any time. Access continues until the end of your current billing period. No refunds for partial periods.</p>
                  <p style={{ marginBottom:10 }}><strong style={{ color:'#eeeef8' }}>6. Communication.</strong> You consent to receive training-related messages, workout reminders, and feedback through the SRG Fit platform. You can adjust notification preferences at any time.</p>
                  <p><strong style={{ color:'#eeeef8' }}>7. Results.</strong> Individual results vary based on effort, consistency, and individual factors. SRG Fit makes no guarantees of specific outcomes.</p>
                </div>
              </div>

              <button onClick={()=>setAgreed(a=>!a)}
                style={{ display:'flex', alignItems:'center', gap:12, background: agreed?'#00c9b115':'#0f0f1a', border:`1px solid ${agreed?'#00c9b160':'#252538'}`, borderRadius:12, padding:'14px 16px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", width:'100%', textAlign:'left' as any }}>
                <div style={{ width:22, height:22, borderRadius:6, border:`2px solid ${agreed?'#00c9b1':'#5a5a78'}`, background: agreed?'#00c9b1':'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all 0.2s' }}>
                  {agreed && <span style={{ fontSize:13, color:'#000', fontWeight:900, lineHeight:1 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color: agreed?'#00c9b1':'#eeeef8' }}>I agree to the Terms & Conditions</div>
                  <div style={{ fontSize:11, color:'#5a5a78', marginTop:2 }}>I understand this is a coaching service, not medical advice.</div>
                </div>
              </button>

              {error && <div style={{ background:'#ef444415', border:'1px solid #ef444440', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#ef4444' }}>{error}</div>}
            </div>
          )}

        </div>{/* end content */}

        {/* Bottom nav buttons — fixed */}
        <div style={{ position:'fixed', bottom:0, left:0, right:0, background:'#080810', borderTop:'1px solid #252538', padding:'16px 20px', display:'flex', gap:10, maxWidth:520, margin:'0 auto' }}>
          {step > 0 && (
            <button onClick={back}
              style={{ flex:1, padding:'13px', borderRadius:12, border:'1px solid #252538', background:'transparent', color:'#8888a8', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button onClick={next} disabled={saving}
              style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background: saving?'#1d1d2e':'linear-gradient(135deg,#00c9b1,#f5a623)', color: saving?'#5a5a78':'#000', fontSize:14, fontWeight:900, cursor: saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {saving ? 'Saving...' : `Next 🛡`}
            </button>
          ) : (
            <button onClick={finish} disabled={saving||!agreed}
              style={{ flex:2, padding:'13px', borderRadius:12, border:'none', background: (saving||!agreed)?'#1d1d2e':'linear-gradient(135deg,#00c9b1,#f5a623)', color: (saving||!agreed)?'#5a5a78':'#000', fontSize:14, fontWeight:900, cursor: (saving||!agreed)?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {saving ? 'Saving...' : `Enter SRG Fit 💪`}
            </button>
          )}
        </div>

      </div>
    </>
  )
}
