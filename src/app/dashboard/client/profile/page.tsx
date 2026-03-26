'use client'

import { useState, useEffect, useRef, Suspense, createContext as _cc, useContext as _uc } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import ClientBottomNav from '@/components/client/ClientBottomNav'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const SECTIONS = [
  { id:'personal',   label:'Personal Info',      icon:'👤' },
  { id:'stats',      label:'Starting Stats',     icon:'📏' },
  { id:'training',   label:'Training Background',icon:'🏋️' },
  { id:'goals',      label:'Goals',              icon:'🎯' },
  { id:'lifestyle',  label:'Lifestyle',          icon:'🌙' },
  { id:'nutrition',  label:'Nutrition',          icon:'🥗' },
  { id:'health',     label:'Health',             icon:'❤️' },
  { id:'account',    label:'Account',            icon:'⚙️' },
]

// Account tab doesn't count toward intake progress
const INTAKE_SECTIONS = ['personal','stats','training','goals','lifestyle','nutrition','health']

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
const EQUIPMENT = ['Barbell','Dumbbells','Cables','Machines','Bodyweight','Resistance Bands','Kettlebells','Pull-up Bar']

export default function ClientProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  )
}

// ── Form context (stable component identity — fixes input focus loss) ──────
type _PCtx = { intake:any; set:(f:string,v:any)=>void; toggleArray:(f:string,v:string)=>void; t:any }
const _Ctx = _cc<_PCtx>({} as _PCtx)
const Label = ({children}:{children:React.ReactNode}) => { const {t}=_uc(_Ctx); return <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>{children}</div> }
const Input = ({field,placeholder,type='text',...rest}:any) => { const {intake,set,t}=_uc(_Ctx); return <input value={intake[field]??''} onChange={e=>set(field,e.target.value)} placeholder={placeholder} type={type} {...rest} style={{width:'100%',background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:9,padding:'10px 12px',fontSize:13,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",boxSizing:'border-box' as const,colorScheme:'dark' as any}} /> }
const TextArea = ({field,placeholder,rows=3}:any) => { const {intake,set,t}=_uc(_Ctx); return <textarea value={intake[field]??''} onChange={e=>set(field,e.target.value)} placeholder={placeholder} rows={rows} style={{width:'100%',background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:9,padding:'10px 12px',fontSize:13,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif",resize:'vertical' as const,boxSizing:'border-box' as const,lineHeight:1.5,colorScheme:'dark' as any}} /> }
const Select = ({field,options,placeholder}:{field:string,options:{val:string,label:string}[],placeholder?:string}) => { const {intake,set,t}=_uc(_Ctx); return <select value={intake[field]||''} onChange={e=>set(field,e.target.value)} style={{width:'100%',background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:9,padding:'10px 12px',fontSize:13,color:intake[field]?t.text:t.textMuted,outline:'none',fontFamily:"'DM Sans',sans-serif",appearance:'none' as any,boxSizing:'border-box' as const,colorScheme:'dark' as any}}><option value="">{placeholder||'Select...'}</option>{options.map((o:any)=><option key={o.val} value={o.val} style={{background:t.surfaceHigh}}>{o.label}</option>)}</select> }
const ChipGroup = ({field,options}:{field:string,options:string[]}) => { const {intake,toggleArray,t}=_uc(_Ctx); return <div style={{display:'flex',flexWrap:'wrap',gap:7}}>{options.map(o=>{const on=(intake[field]||[]).includes(o);return <button key={o} onClick={()=>toggleArray(field,o)} style={{padding:'5px 12px',borderRadius:20,fontSize:12,fontWeight:700,cursor:'pointer',border:'1px solid '+(on?t.teal+'60':t.border),background:on?t.tealDim:'transparent',color:on?t.teal:t.textDim,fontFamily:"'DM Sans',sans-serif",transition:'all .1s'}}>{o}</button>})}</div> }
const SliderField = ({field,min,max,label}:{field:string,min:number,max:number,label:string}) => { const {intake,set,t}=_uc(_Ctx); return <div><div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}><span style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em'}}>{label}</span><span style={{fontSize:13,fontWeight:800,color:t.teal}}>{intake[field]??'—'}</span></div><input type="range" min={min} max={max} value={intake[field]||min} onChange={e=>set(field,parseInt(e.target.value))} style={{width:'100%',accentColor:t.teal}}/><div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:t.textMuted,marginTop:2}}><span>{min}</span><span>{max}</span></div></div> }
const FieldRow = ({children}:{children:React.ReactNode}) => <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}>{children}</div>
const Field = ({label,children}:{label:string,children:React.ReactNode}) => <div><Label>{label}</Label>{children}</div>

function ProfilePageInner() {
  const supabase = createClient()
  const router   = useRouter()
  const searchParams = useSearchParams()
  const [clientId,  setClientId]  = useState<string|null>(null)
  const [profile,   setProfile]   = useState<any>(null)
  const [intake,    setIntake]    = useState<any>({})
  const [section,   setSection]   = useState(searchParams.get('section') || 'personal')
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const [loading,   setLoading]   = useState(true)
  const [photoUploading, setPhotoUploading] = useState(false)
  const photoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: cl } = await supabase.from('clients').select('id').eq('profile_id', user.id).eq('active', true).single()
      if (!cl) { router.push('/dashboard/client'); return }
      setClientId(cl.id)

      const { data: existing } = await supabase.from('client_intake_profiles').select('*').eq('client_id', cl.id).single()
      if (existing) setIntake(existing)
      setLoading(false)
    }
    load()
  }, [])

  const set = (field: string, val: any) => setIntake((p: any) => ({ ...p, [field]: val }))

  const toggleArray = (field: string, val: string) => {
    const arr: string[] = intake[field] || []
    set(field, arr.includes(val) ? arr.filter((x: string) => x !== val) : [...arr, val])
  }

  const save = async () => {
    if (!clientId) return
    setSaving(true)
    const payload = { ...intake, client_id: clientId, intake_completed_by: 'client', intake_completed_at: new Date().toISOString() }
    const { error } = await supabase.from('client_intake_profiles').upsert(payload, { onConflict: 'client_id' })
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
    setSaving(false)
  }

  const uploadPhoto = async (file: File) => {
    if (!clientId) return
    setPhotoUploading(true)
    const path = `profile-photos/${clientId}/${Date.now()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      set('profile_photo_url', data.publicUrl)
      await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', profile.id)
    }
    setPhotoUploading(false)
  }

  // Height helper: total inches → ft/in
  const fmtHeight = (inches: number) => {
    if (!inches) return ''
    const ft = Math.floor(inches / 12)
    const i  = Math.round(inches % 12)
    return `${ft}'${i}"`
  }
  const parseHeight = (val: string) => {
    const m1 = val.match(/^(\d+)'(\d+)"?$/)
    if (m1) return parseInt(m1[1]) * 12 + parseInt(m1[2])
    const m2 = val.match(/^(\d+)$/)
    if (m2) return parseInt(m2[1])
    return null
  }

  // ── Reusable field components ─────────────────────────────────────────────
  const _ctxVal = { intake, set, toggleArray, t }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>Loading...</div>
  )

  const completedSections = SECTIONS.filter(s => {
    if (!INTAKE_SECTIONS.includes(s.id)) return false
    if (s.id === 'personal') return intake.date_of_birth || intake.phone
    if (s.id === 'stats')    return intake.starting_weight_lbs || intake.height_inches
    if (s.id === 'training') return intake.training_experience
    if (s.id === 'goals')    return intake.primary_goal
    if (s.id === 'lifestyle')return intake.activity_level
    if (s.id === 'nutrition')return intake.dietary_approach
    if (s.id === 'health')   return intake.intake_completed_at
    return false
  }).length

  return (
    <_Ctx.Provider value={_ctxVal}>
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}select option{background:${t.surfaceHigh};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'0 0 80px' }}>

        {/* Header */}
        <div style={{ padding:'18px 20px 0', display:'flex', alignItems:'center', gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", padding:0 }}>← Back</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:18, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>My Profile</div>
            <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>{completedSections}/{INTAKE_SECTIONS.length} sections complete</div>
          </div>
          <button onClick={save} disabled={saving}
            style={{ background: saved?t.green:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'9px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:saving?'not-allowed':'pointer', opacity:saving?.6:1, fontFamily:"'DM Sans',sans-serif", transition:'background .3s' }}>
            {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save'}
          </button>
        </div>

        {/* Progress bar */}
        <div style={{ padding:'10px 20px 0' }}>
          <div style={{ height:4, background:t.surfaceHigh, borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:(completedSections/SECTIONS.length*100)+'%', background:'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:4, transition:'width .4s ease' }} />
          </div>
        </div>

        {/* Section nav */}
        <div style={{ display:'flex', overflowX:'auto', gap:6, padding:'14px 20px', scrollbarWidth:'none' }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={()=>setSection(s.id)}
              style={{ flexShrink:0, padding:'7px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid '+(section===s.id?t.teal+'60':t.border), background: section===s.id?t.tealDim:'transparent', color: section===s.id?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:5, whiteSpace:'nowrap' }}>
              <span>{s.icon}</span>{s.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding:'0 20px' }}>

          {/* ── PERSONAL ── */}
          {section === 'personal' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Photo upload */}
              <div style={{ display:'flex', alignItems:'center', gap:16, background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16 }}>
                <div style={{ width:72, height:72, borderRadius:'50%', background:t.surfaceHigh, overflow:'hidden', flexShrink:0, border:'2px solid '+t.teal+'40', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                  onClick={()=>photoRef.current?.click()}>
                  {intake.profile_photo_url || profile?.avatar_url
                    ? <img src={intake.profile_photo_url || profile?.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                    : <span style={{ fontSize:28 }}>👤</span>}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>Profile Photo</div>
                  <button onClick={()=>photoRef.current?.click()} disabled={photoUploading}
                    style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {photoUploading ? 'Uploading...' : '📸 Upload Photo'}
                  </button>
                  <input ref={photoRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadPhoto(f) }} />
                </div>
              </div>

              <FieldRow>
                <Field label="Date of Birth"><Input field="date_of_birth" type="date" /></Field>
                <Field label="Phone"><Input field="phone" placeholder="(555) 555-5555" /></Field>
              </FieldRow>
              <FieldRow>
                <Field label="Gender">
                  <Select field="gender" options={[{val:'male',label:'Male'},{val:'female',label:'Female'},{val:'non_binary',label:'Non-binary'},{val:'prefer_not',label:'Prefer not to say'},{val:'other',label:'Other / Self-describe'}]} />
                </Field>
                <Field label="Pronouns"><Input field="pronouns" placeholder="they/them, she/her, he/him..." /></Field>
              </FieldRow>
              <Field label="Timezone">
                <Select field="timezone" options={[
                  {val:'America/New_York',label:'Eastern (ET)'},{val:'America/Chicago',label:'Central (CT)'},
                  {val:'America/Denver',label:'Mountain (MT)'},{val:'America/Los_Angeles',label:'Pacific (PT)'},
                  {val:'America/Anchorage',label:'Alaska'},{val:'Pacific/Honolulu',label:'Hawaii'},
                  {val:'Europe/London',label:'London (GMT)'},{val:'Europe/Berlin',label:'Central Europe'},
                  {val:'Australia/Sydney',label:'Sydney'},{val:'Asia/Tokyo',label:'Tokyo'},
                ]} placeholder="Select your timezone" />
              </Field>
            </div>
          )}

          {/* ── STATS ── */}
          {section === 'stats' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:12, padding:'10px 14px', fontSize:12, color:t.teal }}>
                📏 These are your <strong>starting</strong> numbers — a baseline to measure your progress. Be honest, nobody's judging.
              </div>
              <FieldRow>
                <Field label={`Height (e.g. 5'10")`}>
                  <input
                    defaultValue={intake.height_inches ? fmtHeight(intake.height_inches) : ''}
                    onBlur={e=>{ const v=parseHeight(e.target.value); if(v) set('height_inches', v) }}
                    placeholder={`5'10"`}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                </Field>
                <Field label="Starting Weight (lbs)"><Input field="starting_weight_lbs" type="number" placeholder="185" /></Field>
              </FieldRow>
              <FieldRow>
                <Field label="Current Weight (lbs)"><Input field="current_weight_lbs" type="number" placeholder="185" /></Field>
                <Field label="Goal Weight (lbs)"><Input field="goal_weight_lbs" type="number" placeholder="165" /></Field>
              </FieldRow>
              <Field label="Body Fat % (if known)"><Input field="body_fat_pct" type="number" placeholder="Leave blank if unsure" /></Field>

              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:14 }}>
                <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, marginBottom:12, textTransform:'uppercase', letterSpacing:'0.08em' }}>Measurements (inches — optional)</div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <FieldRow>
                    <Field label="Waist"><Input field="meas_waist" type="number" placeholder="32" /></Field>
                    <Field label="Hips"><Input field="meas_hips" type="number" placeholder="38" /></Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Chest"><Input field="meas_chest" type="number" placeholder="40" /></Field>
                    <Field label="Neck"><Input field="meas_neck" type="number" placeholder="15" /></Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Left Arm"><Input field="meas_left_arm" type="number" placeholder="14" /></Field>
                    <Field label="Right Arm"><Input field="meas_right_arm" type="number" placeholder="14" /></Field>
                  </FieldRow>
                  <FieldRow>
                    <Field label="Left Thigh"><Input field="meas_left_thigh" type="number" placeholder="22" /></Field>
                    <Field label="Right Thigh"><Input field="meas_right_thigh" type="number" placeholder="22" /></Field>
                  </FieldRow>
                </div>
              </div>
            </div>
          )}

          {/* ── TRAINING ── */}
          {section === 'training' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <Field label="Training Experience">
                <Select field="training_experience" options={[
                  {val:'beginner',     label:'Beginner — less than 6 months'},
                  {val:'intermediate', label:'Intermediate — 6 months to 2 years'},
                  {val:'advanced',     label:'Advanced — 2+ years consistent training'},
                  {val:'athlete',      label:'Competitive Athlete'},
                ]} />
              </Field>
              <FieldRow>
                <Field label="Currently Training (days/week)">
                  <Select field="training_frequency" options={[0,1,2,3,4,5,6,7].map(n=>({val:String(n),label:n===0?'Not currently':n+' days/week'}))} />
                </Field>
                <Field label="Cardio Preference">
                  <Select field="cardio_preference" options={[
                    {val:'none',     label:'None / Hate it'},
                    {val:'low',      label:'Low — walks, easy bike'},
                    {val:'moderate', label:'Moderate — some cardio is fine'},
                    {val:'high',     label:'High — I enjoy cardio'},
                  ]} />
                </Field>
              </FieldRow>
              <Field label="Preferred Training Days">
                <div style={{ marginTop:4 }}><ChipGroup field="preferred_days" options={DAYS} /></div>
              </Field>
              <Field label="Equipment Access">
                <div style={{ marginTop:4 }}><ChipGroup field="equipment_access" options={EQUIPMENT} /></div>
              </Field>
              <Field label="Current Injuries or Physical Limitations">
                <TextArea field="injuries_limitations" placeholder="Bad knees, lower back pain, shoulder impingement... Be specific so I can program around it." />
              </Field>
              <Field label="Past Injuries / Surgeries (training-related)">
                <TextArea field="past_injuries" placeholder="Anything that still affects how you move or train" />
              </Field>
              <Field label="What's worked for you in the past? What hasn't?">
                <TextArea field="previous_coaching" placeholder="Previous coaches, programs, anything that clicked or fell flat" rows={4} />
              </Field>
            </div>
          )}

          {/* ── GOALS ── */}
          {section === 'goals' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <Field label="Primary Goal">
                <Select field="primary_goal" options={[
                  {val:'lose_fat',          label:'🔥 Lose Body Fat'},
                  {val:'build_muscle',      label:'💪 Build Muscle / Bulk'},
                  {val:'recomp',            label:'⚖️ Body Recomposition (lose fat + gain muscle)'},
                  {val:'powerlifting',      label:'🏋️ Powerlifting / Strength Sport'},
                  {val:'general_fitness',   label:'🏃 General Fitness & Health'},
                  {val:'athletic_performance',label:'⚡ Athletic Performance'},
                  {val:'maintain',          label:'✅ Maintain Current Physique'},
                  {val:'mental_health',     label:'🧠 Mental Health & Wellbeing'},
                ]} />
              </Field>
              <Field label="Secondary Goal (optional)">
                <Select field="secondary_goal" options={[
                  {val:'lose_fat',          label:'Lose Body Fat'},
                  {val:'build_muscle',      label:'Build Muscle'},
                  {val:'improve_strength',  label:'Improve Strength'},
                  {val:'improve_endurance', label:'Improve Endurance'},
                  {val:'reduce_stress',     label:'Reduce Stress'},
                  {val:'better_sleep',      label:'Better Sleep'},
                  {val:'build_habits',      label:'Build Consistent Habits'},
                ]} placeholder="None / just the one goal" />
              </Field>
              <FieldRow>
                <Field label="Goal Weight (lbs)"><Input field="goal_weight_lbs" type="number" placeholder="165" /></Field>
                <Field label="Target Date (if any)"><Input field="goal_target_date" type="date" /></Field>
              </FieldRow>
              <Field label="Your 'Why' — what's the real reason behind this goal?">
                <TextArea field="motivation_why" rows={4}
                  placeholder={"This is the most important question. Not 'I want to lose 20 lbs' — WHY? What does that change for you? What does it mean to you? Be real with yourself here."} />
              </Field>
              <Field label="What's your biggest obstacle right now?">
                <TextArea field="biggest_obstacle" placeholder="Time, motivation, stress, past failures, don't know where to start..." />
              </Field>
            </div>
          )}

          {/* ── LIFESTYLE ── */}
          {section === 'lifestyle' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <Field label="Daily Activity Level (outside of workouts)">
                <Select field="activity_level" options={[
                  {val:'sedentary',         label:'Sedentary — desk job, mostly sitting'},
                  {val:'lightly_active',    label:'Lightly Active — some walking, on feet occasionally'},
                  {val:'moderately_active', label:'Moderately Active — on feet most of the day'},
                  {val:'very_active',       label:'Very Active — physical job or lots of movement'},
                  {val:'extra_active',      label:'Extra Active — labor job or training twice/day'},
                ]} />
              </Field>
              <FieldRow>
                <Field label="Avg Sleep (hours/night)">
                  <Select field="avg_sleep_hours" options={[4,5,6,7,8,9,10].map(n=>({val:String(n),label:n+' hours'}))} />
                </Field>
                <Field label="Daily Water Intake (oz)">
                  <Select field="water_intake_oz" options={[32,48,64,80,96,112,128].map(n=>({val:String(n),label:n+'oz (~'+Math.round(n/8)+' cups)'}))} placeholder="Roughly how much?" />
                </Field>
              </FieldRow>
              <SliderField field="stress_level" min={1} max={10} label="Current Stress Level (1 = zen, 10 = chaos)" />
            </div>
          )}

          {/* ── NUTRITION ── */}
          {section === 'nutrition' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <Field label="Dietary Approach">
                <Select field="dietary_approach" options={[
                  {val:'no_preference',    label:'No Preference / Flexible'},
                  {val:'flexible_dieting', label:'Flexible Dieting / IIFYM'},
                  {val:'whole_foods',      label:'Whole Foods Focus'},
                  {val:'vegetarian',       label:'Vegetarian'},
                  {val:'vegan',            label:'Vegan'},
                  {val:'keto',             label:'Keto / Low Carb'},
                  {val:'paleo',            label:'Paleo'},
                  {val:'intermittent',     label:'Intermittent Fasting'},
                  {val:'other',            label:'Other'},
                ]} />
              </Field>
              <Field label="Allergies & Dietary Restrictions">
                <TextArea field="allergies_restrictions" placeholder="Gluten, dairy, nuts, shellfish, kosher, halal, etc." />
              </Field>
              <Field label="Foods You Dislike or Won't Eat">
                <TextArea field="foods_disliked" placeholder="No judgment — just helps me not build you a plan full of stuff you hate" />
              </Field>
              <Field label="Foods You Love / Eat Frequently">
                <TextArea field="foods_preferred" placeholder="What do you actually enjoy eating? Your staples?" />
              </Field>
              <FieldRow>
                <Field label="Current Supplements">
                  <TextArea field="supplement_use" placeholder="Protein powder, creatine, pre-workout..." rows={2} />
                </Field>
                <Field label="Alcohol Consumption">
                  <Select field="alcohol_frequency" options={[
                    {val:'never',      label:'Never'},
                    {val:'rare',       label:'Rarely (a few times/year)'},
                    {val:'occasional', label:'Occasionally (1-2x/month)'},
                    {val:'weekly',     label:'Weekly (1-3 drinks/week)'},
                    {val:'frequent',   label:'Frequent (4+ drinks/week)'},
                  ]} />
                </Field>
              </FieldRow>
            </div>
          )}

          {/* ── HEALTH ── */}
          {section === 'health' && (
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              <div style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'10px 14px', fontSize:12, color:t.textDim, lineHeight:1.6 }}>
                🔒 This information is private and only visible to you and your coach. It helps me program safely and support you fully.
              </div>
              <Field label="Medical Conditions (relevant to training)">
                <TextArea field="medical_conditions" placeholder="Diabetes, hypertension, asthma, PCOS, hypothyroid, anxiety, depression, chronic pain, etc." />
              </Field>
              <Field label="Current Medications">
                <TextArea field="current_medications" placeholder="Any medications that might affect energy, recovery, weight, or training" />
              </Field>
              <Field label="Recent Surgeries / Medical Procedures">
                <TextArea field="recent_surgeries" placeholder="Anything in the past 2 years worth mentioning" />
              </Field>
              <div style={{ display:'flex', alignItems:'center', gap:12, background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px' }}>
                <input type="checkbox" id="cycle" checked={!!intake.menstrual_cycle_tracking}
                  onChange={e=>set('menstrual_cycle_tracking', e.target.checked)}
                  style={{ width:18, height:18, accentColor:t.teal }} />
                <label htmlFor="cycle" style={{ fontSize:13, cursor:'pointer', lineHeight:1.5 }}>
                  I'd like to incorporate <strong>menstrual cycle tracking</strong> into my programming and nutrition recommendations
                </label>
              </div>

              {/* Save / complete CTA */}
              <div style={{ background:'linear-gradient(135deg,'+t.teal+'15,'+t.green+'08)', border:'1px solid '+t.teal+'30', borderRadius:16, padding:20, textAlign:'center', marginTop:8 }}>
                <div style={{ fontSize:18, marginBottom:8 }}>🎯</div>
                <div style={{ fontSize:14, fontWeight:800, marginBottom:6 }}>Ready to submit your intake?</div>
                <div style={{ fontSize:12, color:t.textMuted, marginBottom:14 }}>Make sure you've filled out what you can across all sections, then hit Save above.</div>
                <button onClick={save} disabled={saving}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.green+')', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {saving ? 'Saving...' : saved ? '✓ All Saved!' : '💾 Save Everything'}
                </button>
              </div>
            </div>
          )}

          {/* ── ACCOUNT ── */}
          {section === 'account' && (
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>

              {/* Account info */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px' }}>
                <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Signed In As</div>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:44, height:44, borderRadius:'50%', background:t.tealDim, border:'1px solid '+t.teal+'40', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0, overflow:'hidden' }}>
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
                      : profile?.full_name?.charAt(0) || '?'}
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{profile?.full_name || 'Your Name'}</div>
                    <div style={{ fontSize:12, color:t.textMuted }}>{profile?.email || ''}</div>
                  </div>
                </div>
              </div>

              {/* Update Info */}
              <button onClick={()=>setSection('personal')}
                style={{ display:'flex', alignItems:'center', gap:14, background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, width:'100%' }}>
                <div style={{ width:40, height:40, borderRadius:11, background:t.tealDim, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✏️</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Update My Info</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginTop:1 }}>Edit your profile, goals, health info</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Manage Subscription */}
              <button onClick={async () => {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return
                const res = await fetch('/api/stripe/portal', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ user_id: user.id }),
                })
                const data = await res.json()
                if (data.url) window.location.href = data.url
                else alert('Could not open billing portal: ' + (data.error || 'Unknown error'))
              }}
                style={{ display:'flex', alignItems:'center', gap:14, background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, width:'100%' }}>
                <div style={{ width:40, height:40, borderRadius:11, background:t.orangeDim, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>💳</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:t.text }}>Manage Subscription</div>
                  <div style={{ fontSize:12, color:t.textMuted, marginTop:1 }}>View plan, billing history, cancel</div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              {/* Log Out */}
              <button onClick={async () => {
                await supabase.auth.signOut()
                router.push('/login')
              }}
                style={{ display:'flex', alignItems:'center', gap:14, background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:14, padding:'16px 18px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, width:'100%', marginTop:8 }}>
                <div style={{ width:40, height:40, borderRadius:11, background:t.red+'20', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🚪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:t.red }}>Log Out</div>
                  <div style={{ fontSize:12, color:t.red+'99', marginTop:1 }}>Sign out of your account</div>
                </div>
              </button>

            </div>
          )}

        </div>
      </div>
      <ClientBottomNav />
    </>
    </_Ctx.Provider>
  )
}
