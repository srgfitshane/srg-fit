'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  accent:'#c8f545', accentDim:'#c8f54515', text:'#f0f0f0', textDim:'#888',
  textMuted:'#555', red:'#ff4d6d', redDim:'#ff4d6d15', green:'#22c55e',
  greenDim:'#22c55e15', yellow:'#facc15'
}

interface SetData {
  reps_completed: string
  weight_value: string
  weight_unit: 'lbs'|'kg'|'bw'
  rpe: string
  notes: string
  is_warmup: boolean
  logged: boolean
}

function defaultSet(): SetData {
  return { reps_completed:'', weight_value:'', weight_unit:'lbs', rpe:'', notes:'', is_warmup:false, logged:false }
}
export default function ActiveWorkoutPage() {
  const supabase = createClient()
  const [videoUploads, setVideoUploads]   = useState<Record<string,string>>({}) // exId → url
  const [videoUploading, setVideoUploading] = useState<Record<string,boolean>>({})
  const router = useRouter()
  const { sessionId } = useParams()

  const [session, setSession] = useState<any>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [setData, setSetData] = useState<Record<string, SetData[]>>({})
  const [activeExIdx, setActiveExIdx] = useState(0)
  const [restTimer, setRestTimer] = useState<number|null>(null)
  const [restActive, setRestActive] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [phase, setPhase] = useState<'warmup'|'workout'|'complete'>('workout')
  const [finishForm, setFinishForm] = useState({ session_rpe:'', energy_level:'3', mood:'good', notes_client:'' })
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef<any>(null)
  const restRef = useRef<any>(null)

  useEffect(() => { loadSession() }, [sessionId])

  // Workout elapsed timer
  useEffect(() => {
    timerRef.current = setInterval(() => setElapsedSeconds(s => s+1), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // Rest countdown
  useEffect(() => {
    if (restActive && restTimer !== null && restTimer > 0) {
      restRef.current = setTimeout(() => setRestTimer(r => (r||0)-1), 1000)
    } else if (restTimer === 0) {
      setRestActive(false)
    }
    return () => clearTimeout(restRef.current)
  }, [restActive, restTimer])

  async function loadSession() {
    await supabase.from('workout_sessions').update({ status:'in_progress', started_at: new Date().toISOString() })
      .eq('id', sessionId).eq('status','assigned').not('program_id', 'is', null)

    const { data: sess } = await supabase.from('workout_sessions').select('*').eq('id', sessionId).single()
    const { data: exs } = await supabase.from('session_exercises').select('*').eq('session_id', sessionId).order('order_index')

    const initSets: Record<string,SetData[]> = {}
    for (const ex of exs || []) {
      const count = ex.sets_prescribed || 3
      initSets[ex.id] = Array.from({length: count}, defaultSet)
    }

    setSession(sess)
    setExercises(exs || [])
    setSetData(initSets)
    setLoading(false)
  }

  function updateSet(exId: string, setIdx: number, field: keyof SetData, val: any) {
    setSetData(prev => ({
      ...prev,
      [exId]: prev[exId].map((s,i) => i===setIdx ? {...s, [field]: val} : s)
    }))
  }

  async function logSet(exId: string, setIdx: number) {
    const s = setData[exId][setIdx]
    if (!s.reps_completed && !s.weight_value) return

    const { error } = await supabase.from('exercise_sets').insert({
      session_exercise_id: exId,
      session_id: sessionId,
      set_number: setIdx + 1,
      reps_completed: parseInt(s.reps_completed) || null,
      weight_value: s.weight_unit === 'bw' ? null : parseFloat(s.weight_value) || null,
      weight_unit: s.weight_unit,
      rpe: parseInt(s.rpe) || null,
      notes: s.notes || null,
      is_warmup: s.is_warmup,
      logged_at: new Date().toISOString()
    })

    if (!error) {
      updateSet(exId, setIdx, 'logged', true)
      await supabase.from('session_exercises').update({ sets_completed: setIdx+1 }).eq('id', exId)
      // Auto-start rest timer
      const ex = exercises.find(e=>e.id===exId)
      if (ex?.rest_seconds) {
        setRestTimer(ex.rest_seconds)
        setRestActive(true)
      }
      // Pre-fill next set with same values
      if (setIdx < setData[exId].length - 1) {
        setSetData(prev => ({
          ...prev,
          [exId]: prev[exId].map((s2,i2) => i2===setIdx+1 ? {...s2, reps_completed:s.reps_completed, weight_value:s.weight_value, weight_unit:s.weight_unit} : s2)
        }))
      }
    }
  }

  function addSet(exId: string) {
    setSetData(prev => ({ ...prev, [exId]: [...prev[exId], defaultSet()] }))
  }

  async function uploadFormVideo(exId: string, file: File) {
    setVideoUploading(prev => ({ ...prev, [exId]: true }))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setVideoUploading(prev => ({ ...prev, [exId]: false })); return }
    const ext = file.name.split('.').pop()
    const path = `${user.id}/${sessionId}/${exId}_${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('form_checks').upload(path, file)
    if (!error) {
      const { data: urlData } = supabase.storage.from('form_checks').getPublicUrl(path)
      setVideoUploads(prev => ({ ...prev, [exId]: urlData.publicUrl }))
      // Save url to session_exercise row
      await supabase.from('session_exercises').update({ client_video_url: urlData.publicUrl }).eq('id', exId)
    }
    setVideoUploading(prev => ({ ...prev, [exId]: false }))
  }

  async function cancelWorkout() {
    // Reset session back to assigned so it can be started again
    await supabase.from('workout_sessions').update({
      status: 'assigned',
      started_at: null,
    }).eq('id', sessionId)
    router.push('/dashboard/client')
  }

  async function finishWorkout() {
    setSaving(true)
    await supabase.from('workout_sessions').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      duration_seconds: elapsedSeconds,
      session_rpe: parseInt(finishForm.session_rpe) || null,
      energy_level: parseInt(finishForm.energy_level),
      mood: finishForm.mood,
      notes_client: finishForm.notes_client || null
    }).eq('id', sessionId)

    // Notify coach
    if (session?.coach_id) {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          user_id: session.coach_id,
          notification_type: 'checkin_submitted',
          title: `Workout completed: ${session.title}`,
          body: `Session logged in ${Math.floor(elapsedSeconds/60)} min${finishForm.session_rpe ? ` · RPE ${finishForm.session_rpe}` : ''}`,
          link_url: `/dashboard/coach/workouts/${sessionId}`,
          data: { session_id: sessionId }
        })
      })
    }
    setSaving(false)
    setPhase('complete')
  }

  const fmtTime = (s: number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  const allLogged = exercises.length > 0 && exercises.every(ex => (setData[ex.id]||[]).some(s=>s.logged))

  if (loading) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',color:t.textMuted,fontFamily:"'DM Sans',sans-serif"}}>Loading workout...</div>
  )

  if (!loading && exercises.length === 0) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,textAlign:'center',fontFamily:"'DM Sans',sans-serif",color:t.text}}>
      <div style={{fontSize:48,marginBottom:16}}>⚠️</div>
      <div style={{fontSize:18,fontWeight:800,marginBottom:8,color:t.orange}}>No exercises in this workout</div>
      <div style={{fontSize:13,color:t.textMuted,marginBottom:32,maxWidth:280,lineHeight:1.6}}>This session has no exercises assigned yet. Your coach needs to add exercises to this program first.</div>
      <button onClick={cancelWorkout} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:12,padding:'12px 24px',fontSize:14,fontWeight:700,color:t.teal,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
        ← Back to Dashboard
      </button>
    </div>
  )

  if (phase === 'complete') return <WorkoutComplete session={session} elapsed={elapsedSeconds} router={router} t={t} sessionId={sessionId} supabase={supabase}/>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",maxWidth:480,margin:'0 auto',display:'flex',flexDirection:'column'}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:`1px solid ${t.border}`,padding:'12px 16px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:50}}>
          <button onClick={cancelWorkout}
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:20,lineHeight:1}}>←</button>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:15}}>{session?.title}</div>
            {session?.day_label && <div style={{fontSize:11,color:t.textDim}}>{session.day_label}</div>}
          </div>
          <div style={{fontSize:16,fontWeight:800,color:t.teal,fontVariantNumeric:'tabular-nums'}}>⏱ {fmtTime(elapsedSeconds)}</div>
          <button onClick={cancelWorkout}
            style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:8,padding:'5px 11px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            Cancel
          </button>
        </div>

        {/* Rest timer banner */}
        {restActive && restTimer !== null && (
          <div style={{background:`linear-gradient(135deg,${t.teal}20,${t.teal}08)`,borderBottom:`1px solid ${t.teal}40`,padding:'10px 16px',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontSize:20}}>⏸</span>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:700,color:t.teal}}>Rest Time</div>
              <div style={{fontSize:11,color:t.textDim}}>Next set in {restTimer}s</div>
            </div>
            <span style={{fontSize:24,fontWeight:900,color:t.teal,fontVariantNumeric:'tabular-nums'}}>{restTimer}s</span>
            <button onClick={()=>{setRestActive(false);setRestTimer(null)}}
              style={{background:t.tealDim,border:`1px solid ${t.teal}40`,borderRadius:8,padding:'5px 12px',fontSize:12,fontWeight:700,color:t.teal,cursor:'pointer'}}>
              Skip
            </button>
          </div>
        )}

        {/* Coach notes */}
        {session?.notes_coach && (
          <div style={{margin:'12px 16px 0',background:'#1a1a0a',border:'1px solid #3a3a1a',borderRadius:12,padding:'10px 14px',display:'flex',gap:8}}>
            <span style={{fontSize:16}}>📌</span>
            <p style={{fontSize:13,color:t.orange,lineHeight:1.5}}>{session.notes_coach}</p>
          </div>
        )}

        {/* Exercise tabs */}
        <div style={{display:'flex',overflowX:'auto',padding:'12px 16px 0',gap:8,flexShrink:0}}>
          {exercises.map((ex,i)=>{
            const done = (setData[ex.id]||[]).filter(s=>s.logged).length
            const total = ex.sets_prescribed || setData[ex.id]?.length || 0
            const complete = done >= total && total > 0
            return (
              <button key={ex.id} onClick={()=>setActiveExIdx(i)}
                style={{flexShrink:0,background:activeExIdx===i?t.tealDim:(complete?t.greenDim:t.surfaceHigh),border:`1px solid ${activeExIdx===i?t.teal:complete?t.green:t.border}`,borderRadius:10,padding:'6px 12px',fontSize:12,fontWeight:700,color:activeExIdx===i?t.teal:complete?t.green:t.textDim,cursor:'pointer',whiteSpace:'nowrap'}}>
                {complete ? '✓ ' : ''}{i+1}. {ex.exercise_name.split(' ').slice(0,2).join(' ')}
              </button>
            )
          })}
        </div>

        {/* Active exercise */}
        {exercises[activeExIdx] && (() => {
          const ex = exercises[activeExIdx]
          const setsArr = setData[ex.id] || []
          return (
            <div style={{flex:1,overflowY:'auto',padding:'16px'}}>
              <div style={{marginBottom:16}}>
                <h2 style={{fontSize:20,fontWeight:900,marginBottom:4}}>{ex.exercise_name}</h2>
                <div style={{fontSize:13,color:t.textDim,marginBottom:8}}>
                  Target: {ex.sets_prescribed} × {ex.reps_prescribed}
                  {ex.weight_prescribed && ` @ ${ex.weight_prescribed}`}
                </div>
                {ex.notes_coach && <div style={{fontSize:12,color:t.orange,marginTop:4,marginBottom:8}}>💬 {ex.notes_coach}</div>}

                {/* Form check video upload */}
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <label style={{display:'flex',alignItems:'center',gap:7,background:videoUploads[ex.id]?t.greenDim:t.surfaceHigh,border:'1px solid '+(videoUploads[ex.id]?t.green+'50':t.border),borderRadius:10,padding:'8px 14px',cursor:videoUploading[ex.id]?'not-allowed':'pointer',fontSize:12,fontWeight:700,color:videoUploads[ex.id]?t.green:t.textDim,transition:'all 0.2s'}}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>
                    </svg>
                    {videoUploading[ex.id] ? 'Uploading...' : videoUploads[ex.id] ? '✓ Form check uploaded' : 'Upload form check video'}
                    <input type="file" accept="video/*" capture="environment" style={{display:'none'}}
                      disabled={videoUploading[ex.id]}
                      onChange={e=>{ const f=e.target.files?.[0]; if(f) uploadFormVideo(ex.id, f) }}/>
                  </label>
                  {videoUploads[ex.id] && (
                    <a href={videoUploads[ex.id]} target="_blank" rel="noreferrer"
                      style={{fontSize:11,color:t.teal,textDecoration:'none',fontWeight:600}}>
                      View ↗
                    </a>
                  )}
                </div>
              </div>

              <div style={{display:'grid',gap:10,marginBottom:12}}>
                {setsArr.map((s,idx)=>(
                  <div key={idx} style={{background:s.logged?t.greenDim:t.surface,border:`1px solid ${s.logged?t.green:t.border}`,borderRadius:14,padding:'14px 16px',transition:'all 0.2s'}}>
                    <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:10}}>
                      <span style={{fontSize:12,fontWeight:800,color:s.logged?t.green:t.textDim,minWidth:40}}>
                        {s.is_warmup?'Warm-up':`Set ${idx+1}`}
                      </span>
                      <label style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:t.textMuted,marginLeft:'auto',cursor:'pointer'}}>
                        <input type="checkbox" checked={s.is_warmup} onChange={e=>updateSet(ex.id,idx,'is_warmup',e.target.checked)}
                          style={{accentColor:t.orange}}/>
                        Warmup
                      </label>
                      {s.logged && <span style={{fontSize:12,color:t.green,fontWeight:700}}>✓ Logged</span>}
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Reps</label>
                        <input type="number" value={s.reps_completed} onChange={e=>updateSet(ex.id,idx,'reps_completed',e.target.value)}
                          placeholder={ex.reps_prescribed||'—'} inputMode="numeric" disabled={s.logged}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>
                          Weight
                          <select value={s.weight_unit} onChange={e=>updateSet(ex.id,idx,'weight_unit',e.target.value)} disabled={s.logged}
                            style={{background:'none',border:'none',color:t.teal,fontSize:11,marginLeft:4,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            <option value="lbs">lbs</option>
                            <option value="kg">kg</option>
                            <option value="bw">BW</option>
                          </select>
                        </label>
                        <input type="number" value={s.weight_value} onChange={e=>updateSet(ex.id,idx,'weight_value',e.target.value)}
                          placeholder={ex.weight_prescribed||'—'} inputMode="decimal" disabled={s.logged||s.weight_unit==='bw'}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:(s.logged||s.weight_unit==='bw')?0.5:1}}/>
                      </div>
                      <div>
                        <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>RPE</label>
                        <input type="number" value={s.rpe} onChange={e=>updateSet(ex.id,idx,'rpe',e.target.value)}
                          placeholder="1-10" min={1} max={10} inputMode="numeric" disabled={s.logged}
                          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px',color:t.text,fontSize:16,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      </div>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <input value={s.notes} onChange={e=>updateSet(ex.id,idx,'notes',e.target.value)}
                        placeholder="Notes..." disabled={s.logged}
                        style={{flex:1,background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'7px 10px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif",opacity:s.logged?0.5:1}}/>
                      {!s.logged && (
                        <button onClick={()=>logSet(ex.id,idx)}
                          style={{background:t.accent,border:'none',borderRadius:8,padding:'7px 16px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer',whiteSpace:'nowrap'}}>
                          Log ✓
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={()=>addSet(ex.id)}
                style={{width:'100%',background:'none',border:`1px dashed ${t.border}`,borderRadius:10,padding:'10px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
                + Add Set
              </button>

              {activeExIdx < exercises.length - 1 && (
                <button onClick={()=>setActiveExIdx(activeExIdx+1)}
                  style={{width:'100%',marginTop:10,background:t.tealDim,border:`1px solid ${t.teal}40`,borderRadius:10,padding:'11px',fontSize:13,fontWeight:700,color:t.teal,cursor:'pointer'}}>
                  Next Exercise →
                </button>
              )}
            </div>
          )
        })()}

        {/* Finish banner */}
        {allLogged && phase === 'workout' && (
          <div style={{padding:'16px',borderTop:`1px solid ${t.border}`,background:t.surface,flexShrink:0}}>
            <div style={{marginBottom:12}}>
              <p style={{fontSize:12,fontWeight:700,color:t.textDim,marginBottom:10,textTransform:'uppercase',letterSpacing:'0.06em'}}>How'd it go?</p>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Session RPE (1-10)</label>
                  <input type="number" value={finishForm.session_rpe} onChange={e=>setFinishForm(f=>({...f,session_rpe:e.target.value}))}
                    min={1} max={10} placeholder="7"
                    style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px',color:t.text,fontSize:15,fontWeight:700,textAlign:'center',fontFamily:"'DM Sans',sans-serif"}}/>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Mood</label>
                  <select value={finishForm.mood} onChange={e=>setFinishForm(f=>({...f,mood:e.target.value}))}
                    style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
                    <option value="great">😄 Great</option>
                    <option value="good">🙂 Good</option>
                    <option value="okay">😐 Okay</option>
                    <option value="tired">😴 Tired</option>
                    <option value="awful">😓 Rough</option>
                  </select>
                </div>
              </div>
              <div style={{marginBottom:8}}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>Energy (1-5)</label>
                <div style={{display:'flex',gap:6}}>
                  {[1,2,3,4,5].map(n=>(
                    <button key={n} onClick={()=>setFinishForm(f=>({...f,energy_level:String(n)}))}
                      style={{flex:1,padding:'7px',borderRadius:8,border:'none',background:parseInt(finishForm.energy_level)>=n?t.orange+'30':'#1d1d2e',cursor:'pointer',fontSize:16}}>
                      ⚡
                    </button>
                  ))}
                </div>
              </div>
              <textarea value={finishForm.notes_client} onChange={e=>setFinishForm(f=>({...f,notes_client:e.target.value}))}
                placeholder="Any notes for your coach? Pain, PRs, wins..."
                rows={2}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 10px',color:t.text,fontSize:13,resize:'none',fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <button onClick={finishWorkout} disabled={saving}
              style={{width:'100%',background:`linear-gradient(135deg,${t.teal},#00a896)`,border:'none',borderRadius:12,padding:'15px',fontSize:16,fontWeight:800,color:'#0f0f0f',cursor:saving?'default':'pointer',opacity:saving?0.7:1,fontFamily:"'DM Sans',sans-serif"}}>
              {saving ? 'Finishing...' : '🎉 Complete Workout!'}
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function WorkoutComplete({ session, elapsed, router, t, sessionId, supabase }: any) {
  const fmtTime = (s: number) => `${Math.floor(s/60)}m ${s%60}s`
  const [countdown, setCountdown] = useState(4)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    if (cancelled) return
    const interval = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(interval)
          router.push('/dashboard/client')
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [cancelled])

  const goBack = async () => {
    setCancelled(true)
    // Revert session back to in_progress so they can finish
    await supabase.from('workout_sessions').update({
      status: 'in_progress',
      completed_at: null,
    }).eq('id', sessionId)
    router.back()
  }
  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px',textAlign:'center'}}>
        <div style={{fontSize:64,marginBottom:16}}>🎉</div>
        <h1 style={{fontSize:28,fontWeight:900,background:`linear-gradient(135deg,${t.teal},${t.accent})`,WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:8}}>
          Workout Complete!
        </h1>
        <p style={{color:t.textDim,fontSize:16,marginBottom:8}}>{session?.title}</p>
        <p style={{fontSize:24,fontWeight:800,color:t.orange,marginBottom:32}}>⏱ {fmtTime(elapsed)}</p>
        <p style={{fontSize:13,color:t.textDim,marginBottom:32,maxWidth:280,lineHeight:1.6}}>
          Crushed it. Your coach will review this session and leave feedback. Be Kind to Yourself & Stay Awesome 💪
        </p>
        <button onClick={()=>router.push('/dashboard/client')}
          style={{background:t.accent,border:'none',borderRadius:14,padding:'14px 32px',fontSize:16,fontWeight:800,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",marginBottom:12}}>
          Back to Dashboard {!cancelled && countdown > 0 ? `(${countdown})` : ''}
        </button>
        <button onClick={goBack}
          style={{background:'none',border:'1px solid '+t.border,borderRadius:14,padding:'10px 24px',fontSize:13,fontWeight:600,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
          Wait — I'm not done yet
        </button>
      </div>
    </>
  )
}
