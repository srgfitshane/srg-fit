'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  accent:'#c8f545', text:'#f0f0f0', textDim:'#888', textMuted:'#555',
  red:'#ff4d6d', redDim:'#ff4d6d15', green:'#22c55e', greenDim:'#22c55e15',
  purple:'#a855f7'
}

const moodEmoji: Record<string,string> = { great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }
const rpeColor = (r: number) => r >= 9 ? t.red : r >= 7 ? t.orange : t.green

export default function CoachSessionDetailPage() {
  const supabase = createClient()
  const router = useRouter()
  const { id } = useParams()
  const [session, setSession] = useState<any>(null)
  const [exercises, setExercises] = useState<any[]>([])
  const [sets, setSets] = useState<Record<string, any[]>>({})
  const [coachNote, setCoachNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadSession() }, [id])

  async function loadSession() {
    const { data: sess } = await supabase
      .from('workout_sessions')
      .select(`*, clients(id, profile_id, profiles(full_name))`)
      .eq('id', id).single()

    const { data: exs } = await supabase
      .from('session_exercises')
      .select('*').eq('session_id', id).order('order_index')

    const setsMap: Record<string,any[]> = {}
    for (const ex of exs || []) {
      const { data: s } = await supabase
        .from('exercise_sets').select('*').eq('session_exercise_id', ex.id).order('set_number')
      setsMap[ex.id] = s || []
    }

    setSession(sess)
    setExercises(exs || [])
    setSets(setsMap)
    setCoachNote(sess?.notes_coach || '')
    setLoading(false)
  }

  async function saveCoachNote() {
    setSaving(true)
    await supabase.from('workout_sessions').update({ notes_coach: coachNote }).eq('id', id)
    setSaving(false)
  }

  const totalVolume = Object.values(sets).flat()
    .filter(s => s.weight_value && s.reps_completed)
    .reduce((acc, s) => acc + (s.weight_value * s.reps_completed), 0)

  const allSets = Object.values(sets).flat()
  const avgRpe = allSets.filter(s=>s.rpe).length
    ? (allSets.filter(s=>s.rpe).reduce((a,s)=>a+s.rpe,0) / allSets.filter(s=>s.rpe).length).toFixed(1)
    : null

  const duration = session?.duration_seconds
    ? `${Math.floor(session.duration_seconds/60)}m ${session.duration_seconds%60}s`
    : null

  if (loading) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',color:t.textMuted,fontFamily:"'DM Sans',sans-serif"}}>
      Loading session...
    </div>
  )
  if (!session) return (
    <div style={{minHeight:'100vh',background:t.bg,display:'flex',alignItems:'center',justifyContent:'center',color:t.red,fontFamily:"'DM Sans',sans-serif"}}>
      Session not found
    </div>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",padding:'24px',maxWidth:860,margin:'0 auto'}}>

        {/* Back */}
        <button onClick={()=>router.push('/dashboard/coach/workouts')}
          style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:13,marginBottom:20,display:'block'}}>
          ← All Workouts
        </button>

        {/* Header */}
        <div style={{marginBottom:24}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:8}}>
            <div style={{flex:1}}>
              <h1 style={{fontSize:22,fontWeight:900,marginBottom:4}}>{session.title}</h1>
              <div style={{fontSize:13,color:t.textDim}}>
                {session.clients?.profiles?.full_name || 'Client'} · {session.scheduled_date || 'No date'}
                {session.day_label && ` · ${session.day_label}`}
              </div>
            </div>
            <span style={{
              fontSize:12,fontWeight:700,padding:'4px 12px',borderRadius:20,
              background: session.status==='completed' ? t.greenDim : session.status==='in_progress' ? t.tealDim : '#f5a62315',
              color: session.status==='completed' ? t.green : session.status==='in_progress' ? t.teal : t.orange
            }}>
              {session.status?.replace('_',' ')}
            </span>
          </div>
        </div>

        {/* Stats row */}
        {session.status === 'completed' && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:12,marginBottom:24}}>
            {[
              { label:'Duration', value: duration || '—', icon:'⏱' },
              { label:'Total Volume', value: totalVolume > 0 ? `${Math.round(totalVolume).toLocaleString()} lbs` : '—', icon:'🏋️' },
              { label:'Avg RPE', value: avgRpe ? `${avgRpe}/10` : '—', icon:'🎯' },
              { label:'Session RPE', value: session.session_rpe ? `${session.session_rpe}/10` : '—', icon:'💥' },
            ].map(s=>(
              <div key={s.label} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'14px 16px',textAlign:'center'}}>
                <div style={{fontSize:20,marginBottom:4}}>{s.icon}</div>
                <div style={{fontSize:18,fontWeight:800,color:t.accent}}>{s.value}</div>
                <div style={{fontSize:11,color:t.textMuted}}>{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Mood + energy */}
        {(session.mood || session.energy_level) && (
          <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:12,padding:'14px 18px',marginBottom:20,display:'flex',gap:24,alignItems:'center'}}>
            {session.mood && <div style={{display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:22}}>{moodEmoji[session.mood]}</span>
              <span style={{fontSize:13,color:t.textDim}}>Felt <strong style={{color:t.text}}>{session.mood}</strong></span>
            </div>}
            {session.energy_level && <div style={{display:'flex',gap:4}}>
              {[1,2,3,4,5].map(n=>(
                <div key={n} style={{width:12,height:12,borderRadius:'50%',background:n<=session.energy_level?t.orange:t.surfaceHigh}}/>
              ))}
              <span style={{fontSize:12,color:t.textDim,marginLeft:6}}>energy</span>
            </div>}
          </div>
        )}

        {/* Client notes */}
        {session.notes_client && (
          <div style={{background:t.tealDim,border:`1px solid ${t.teal}30`,borderRadius:12,padding:'14px 18px',marginBottom:20}}>
            <p style={{fontSize:12,fontWeight:700,color:t.teal,marginBottom:4}}>Client Notes</p>
            <p style={{fontSize:14,color:t.text,lineHeight:1.5}}>{session.notes_client}</p>
          </div>
        )}

        {/* Exercises */}
        <div style={{marginBottom:24}}>
          <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Exercises</p>
          <div style={{display:'grid',gap:12}}>
            {exercises.map((ex,i)=>{
              const exSets = sets[ex.id] || []
              return (
                <div key={ex.id} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,overflow:'hidden'}}>
                  <div style={{padding:'14px 18px',borderBottom:`1px solid ${t.border}`,display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:13,fontWeight:800,color:t.teal,minWidth:24}}>{i+1}.</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:15}}>{ex.exercise_name}</div>
                      <div style={{fontSize:12,color:t.textDim}}>
                        Prescribed: {ex.sets_prescribed} × {ex.reps_prescribed}
                        {ex.weight_prescribed && ` @ ${ex.weight_prescribed}`}
                        {ex.rest_seconds && ` · ${ex.rest_seconds}s rest`}
                      </div>
                    </div>
                    <span style={{fontSize:12,fontWeight:700,color:exSets.length>0?t.green:t.textMuted}}>
                      {exSets.length}/{ex.sets_prescribed || '?'} sets
                    </span>
                  </div>
                  {exSets.length > 0 && (
                    <div style={{padding:'12px 18px'}}>
                      <div style={{display:'grid',gridTemplateColumns:'50px 80px 80px 80px 1fr',gap:8,marginBottom:8}}>
                        {['Set','Reps','Weight','RPE','Notes'].map(h=>(
                          <span key={h} style={{fontSize:11,fontWeight:700,color:t.textMuted,textTransform:'uppercase'}}>{h}</span>
                        ))}
                      </div>
                      {exSets.map((s:any)=>(
                        <div key={s.id} style={{display:'grid',gridTemplateColumns:'50px 80px 80px 80px 1fr',gap:8,padding:'6px 0',borderTop:`1px solid ${t.border}`}}>
                          <span style={{fontSize:13,color:t.textDim}}>{s.is_warmup?'W':s.set_number}</span>
                          <span style={{fontSize:13,fontWeight:600}}>{s.reps_completed || '—'}</span>
                          <span style={{fontSize:13,fontWeight:600}}>{s.weight_value ? `${s.weight_value} ${s.weight_unit}` : s.weight_unit==='bw'?'BW':'—'}</span>
                          <span style={{fontSize:13,fontWeight:700,color:s.rpe?rpeColor(s.rpe):t.textMuted}}>{s.rpe || '—'}</span>
                          <span style={{fontSize:12,color:t.textDim,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.notes || ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {ex.notes_coach && (
                    <div style={{padding:'8px 18px 12px',borderTop:`1px solid ${t.border}`}}>
                      <span style={{fontSize:12,color:t.orange}}>📌 {ex.notes_coach}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Coach feedback */}
        <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'18px'}}>
          <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:10}}>Coach Feedback</p>
          <textarea value={coachNote} onChange={e=>setCoachNote(e.target.value)}
            placeholder="Leave feedback for this session... great job on the squats, let's add 5 lbs next week"
            rows={3}
            style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'10px 12px',color:t.text,fontSize:14,resize:'vertical',fontFamily:"'DM Sans',sans-serif",marginBottom:10}}/>
          <button onClick={saveCoachNote} disabled={saving}
            style={{background:t.accent,border:'none',borderRadius:10,padding:'9px 20px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:saving?'default':'pointer',opacity:saving?0.7:1,fontFamily:"'DM Sans',sans-serif"}}>
            {saving ? 'Saving...' : 'Save Feedback'}
          </button>
        </div>
      </div>
    </>
  )
}
