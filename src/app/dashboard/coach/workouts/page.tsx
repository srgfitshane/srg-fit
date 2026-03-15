'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  accent:'#c8f545', accentDim:'#c8f54515', text:'#f0f0f0', textDim:'#888',
  textMuted:'#555', red:'#ff4d6d', redDim:'#ff4d6d15', green:'#22c55e',
  purple:'#a855f7', purpleDim:'#a855f715'
}

interface Client { id: string; profile_id: string; full_name: string; status: string }
interface Exercise { id: string; name: string; muscle_group: string; exercise_type: string }
interface SessionEx {
  exercise_id: string; exercise_name: string; exercise_type: string
  sets_prescribed: number; reps_prescribed: string; weight_prescribed: string
  rest_seconds: number; notes_coach: string; order_index: number
}
export default function CoachWorkoutsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [view, setView] = useState<'list'|'create'>('list')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchEx, setSearchEx] = useState('')
  const [filterClient, setFilterClient] = useState('all')

  // New session form state
  const [form, setForm] = useState({
    client_id: '', title: 'Workout', day_label: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    notes_coach: '', week_number: 1, day_number: 1
  })
  const [sessionExercises, setSessionExercises] = useState<SessionEx[]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const [{ data: profile }] = await Promise.all([
      supabase.from('profiles').select('id').eq('user_id', user.id).single()
    ])

    const [{ data: cls }, { data: exs }, { data: sess }] = await Promise.all([
      supabase.from('clients').select('id, profile_id, status').eq('coach_id', profile?.id).neq('status','archived'),
      supabase.from('exercises').select('id, name, muscle_group, exercise_type').order('name'),
      supabase.from('workout_sessions').select(`
        id, title, status, scheduled_date, day_label, mood, session_rpe, completed_at,
        clients!inner(id, profiles(full_name))
      `).eq('coach_id', profile?.id).order('scheduled_date', { ascending: false }).limit(50)
    ])

    // get full_names for clients
    const clientsWithNames: Client[] = []
    for (const c of cls || []) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', c.profile_id).single()
      clientsWithNames.push({ ...c, full_name: p?.full_name || 'Unknown' })
    }

    setClients(clientsWithNames)
    setExercises(exs || [])
    setSessions(sess || [])
    setLoading(false)
  }

  async function createSession() {
    if (!form.client_id || sessionExercises.length === 0) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

    const { data: session, error } = await supabase.from('workout_sessions').insert({
      client_id: form.client_id,
      coach_id: profile?.id,
      title: form.title,
      day_label: form.day_label,
      scheduled_date: form.scheduled_date,
      notes_coach: form.notes_coach,
      week_number: form.week_number,
      day_number: form.day_number,
      status: 'assigned'
    }).select().single()

    if (!error && session) {
      await supabase.from('session_exercises').insert(
        sessionExercises.map(ex => ({ ...ex, session_id: session.id }))
      )
      // notify client
      const client = clients.find(c => c.id === form.client_id)
      if (client) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: client.profile_id,
            notification_type: 'program_assigned',
            title: `New workout assigned: ${form.title}`,
            body: form.scheduled_date ? `Scheduled for ${form.scheduled_date}` : 'Ready when you are!',
            link_url: '/dashboard/client'
          })
        })
      }
    }
    setSaving(false)
    setView('list')
    loadData()
    setForm({ client_id:'', title:'Workout', day_label:'', scheduled_date: new Date().toISOString().split('T')[0], notes_coach:'', week_number:1, day_number:1 })
    setSessionExercises([])
  }

  function addExercise(ex: Exercise) {
    setSessionExercises(prev => [...prev, {
      exercise_id: ex.id, exercise_name: ex.name, exercise_type: ex.exercise_type || 'strength',
      sets_prescribed: 3, reps_prescribed: '8-12', weight_prescribed: '',
      rest_seconds: 90, notes_coach: '', order_index: prev.length
    }])
  }

  function updateEx(idx: number, field: keyof SessionEx, val: any) {
    setSessionExercises(prev => prev.map((e,i) => i===idx ? {...e, [field]: val} : e))
  }

  function removeEx(idx: number) {
    setSessionExercises(prev => prev.filter((_,i) => i!==idx).map((e,i) => ({...e, order_index: i})))
  }

  const filteredEx = exercises.filter(e =>
    e.name.toLowerCase().includes(searchEx.toLowerCase()) ||
    e.muscle_group?.toLowerCase().includes(searchEx.toLowerCase())
  ).slice(0, 30)

  const filteredSessions = sessions.filter(s =>
    filterClient === 'all' ? true : s.clients?.id === filterClient
  )

  const statusColor = (s: string) => ({
    assigned:'#f5a623', in_progress: t.teal, completed: t.green, skipped: t.textMuted
  }[s] || t.textMuted)

  const moodEmoji = (m: string) => ({ great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }[m] || '')

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",padding:'24px'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:13}}>← Dashboard</button>
          <div style={{flex:1}}/>
          <h1 style={{fontSize:22,fontWeight:900,color:t.text}}>💪 Workouts</h1>
          <div style={{flex:1}}/>
          {view==='list' && (
            <button onClick={()=>setView('create')}
              style={{background:t.accent,border:'none',borderRadius:10,padding:'8px 18px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer'}}>
              + Assign Workout
            </button>
          )}
          {view==='create' && (
            <button onClick={()=>setView('list')}
              style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:10,padding:'8px 14px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
              ← Back
            </button>
          )}
        </div>

        {loading ? (
          <div style={{color:t.textMuted,textAlign:'center',paddingTop:60}}>Loading...</div>
        ) : view === 'list' ? (
          <SessionList sessions={filteredSessions} clients={clients} filterClient={filterClient}
            setFilterClient={setFilterClient} statusColor={statusColor} moodEmoji={moodEmoji}
            t={t} router={router}/>
        ) : (
          <CreateSession form={form} setForm={setForm} clients={clients} exercises={filteredEx}
            sessionExercises={sessionExercises} addExercise={addExercise} updateEx={updateEx}
            removeEx={removeEx} searchEx={searchEx} setSearchEx={setSearchEx}
            createSession={createSession} saving={saving} t={t}/>
        )}
      </div>
    </>
  )
}

function SessionList({ sessions, clients, filterClient, setFilterClient, statusColor, moodEmoji, t, router }: any) {
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
        <select value={filterClient} onChange={e=>setFilterClient(e.target.value)}
          style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'7px 12px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>
          <option value="all">All Clients</option>
          {clients.map((c:any)=><option key={c.id} value={c.id}>{c.full_name}</option>)}
        </select>
      </div>
      {sessions.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>💪</div>
          <p style={{fontSize:15,fontWeight:600,color:t.textDim}}>No workouts assigned yet</p>
          <p style={{fontSize:13}}>Click "Assign Workout" to get started</p>
        </div>
      ) : (
        <div style={{display:'grid',gap:10}}>
          {sessions.map((s:any) => (
            <div key={s.id} onClick={()=>router.push(`/dashboard/coach/workouts/${s.id}`)}
              style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'16px 18px',cursor:'pointer',display:'flex',gap:12,alignItems:'center'}}>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{s.title}</div>
                <div style={{fontSize:12,color:t.textDim}}>
                  {s.clients?.profiles?.full_name || 'Client'} · {s.scheduled_date || 'No date'}
                  {s.day_label && ` · ${s.day_label}`}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                {s.mood && <span style={{fontSize:16}}>{moodEmoji(s.mood)}</span>}
                {s.session_rpe && <span style={{fontSize:12,color:t.textDim}}>RPE {s.session_rpe}</span>}
                <span style={{fontSize:11,fontWeight:700,color:statusColor(s.status),background:statusColor(s.status)+'15',padding:'3px 10px',borderRadius:20}}>
                  {s.status.replace('_',' ')}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function CreateSession({ form, setForm, clients, exercises, sessionExercises, addExercise, updateEx, removeEx, searchEx, setSearchEx, createSession, saving, t }: any) {
  const inp = (field: string, val: string) => setForm((f:any)=>({...f,[field]:val}))
  const canSave = form.client_id && sessionExercises.length > 0

  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:20,maxWidth:1100}}>

      {/* Left: Session details + exercises */}
      <div>
        <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
          <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Session Details</p>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div>
              <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Client *</label>
              <select value={form.client_id} onChange={e=>inp('client_id',e.target.value)}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:form.client_id?t.text:t.textMuted,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
                <option value="">Select client...</option>
                {clients.map((c:any)=><option key={c.id} value={c.id}>{c.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Scheduled Date</label>
              <input type="date" value={form.scheduled_date} onChange={e=>inp('scheduled_date',e.target.value)}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
          </div>
          <div style={{marginBottom:12}}>
            <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Session Title</label>
            <input value={form.title} onChange={e=>inp('title',e.target.value)} placeholder="e.g. Upper Body Pull"
              style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:12}}>
            <div>
              <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Day Label</label>
              <input value={form.day_label} onChange={e=>inp('day_label',e.target.value)} placeholder="Day A – Lower"
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div>
              <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Week</label>
              <input type="number" value={form.week_number} onChange={e=>inp('week_number',e.target.value)} min={1}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
            <div>
              <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Day #</label>
              <input type="number" value={form.day_number} onChange={e=>inp('day_number',e.target.value)} min={1}
                style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
            </div>
          </div>
          <div style={{marginTop:12}}>
            <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Coach Notes (visible to client)</label>
            <textarea value={form.notes_coach} onChange={e=>inp('notes_coach',e.target.value)}
              placeholder="Focus on form today. Deload week — keep RPE at 7 max..."
              rows={2}
              style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,resize:'vertical',fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
        </div>

        {/* Exercise list */}
        {sessionExercises.length > 0 && (
          <div style={{display:'grid',gap:10,marginBottom:16}}>
            {sessionExercises.map((ex:SessionEx, i:number)=>(
              <div key={i} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'16px 18px'}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
                  <span style={{fontSize:13,fontWeight:800,color:t.teal,minWidth:22}}>{i+1}.</span>
                  <span style={{fontWeight:700,fontSize:15,flex:1}}>{ex.exercise_name}</span>
                  <button onClick={()=>removeEx(i)} style={{background:'none',border:'none',color:t.red,cursor:'pointer',fontSize:16}}>×</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:8}}>
                  {[
                    {label:'Sets', field:'sets_prescribed', type:'number', placeholder:'3'},
                    {label:'Reps', field:'reps_prescribed', type:'text', placeholder:'8-12'},
                    {label:'Load', field:'weight_prescribed', type:'text', placeholder:'135 lbs / RPE 8'},
                    {label:'Rest (sec)', field:'rest_seconds', type:'number', placeholder:'90'},
                  ].map(f=>(
                    <div key={f.field}>
                      <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>{f.label}</label>
                      <input type={f.type} value={(ex as any)[f.field]} placeholder={f.placeholder}
                        onChange={e=>updateEx(i,f.field as keyof SessionEx, f.type==='number'?parseInt(e.target.value)||0:e.target.value)}
                        style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:7,padding:'7px 10px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:8}}>
                  <input value={ex.notes_coach} onChange={e=>updateEx(i,'notes_coach',e.target.value)}
                    placeholder="Exercise notes for client..."
                    style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:7,padding:'7px 10px',color:t.text,fontSize:13,fontFamily:"'DM Sans',sans-serif"}}/>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={createSession} disabled={!canSave || saving}
          style={{width:'100%',background:canSave?t.accent:'#2a2a3a',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontWeight:700,color:canSave?'#0f0f0f':t.textMuted,cursor:canSave?'pointer':'not-allowed',fontFamily:"'DM Sans',sans-serif",transition:'all 0.2s'}}>
          {saving ? 'Saving...' : canSave ? '✓ Assign Workout to Client' : 'Select client + add exercises to assign'}
        </button>
      </div>

      {/* Right: Exercise picker */}
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'16px',height:'fit-content',position:'sticky',top:24}}>
        <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:12}}>Exercise Library</p>
        <input value={searchEx} onChange={e=>setSearchEx(e.target.value)}
          placeholder="Search exercises..."
          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 12px',color:t.text,fontSize:13,marginBottom:10,fontFamily:"'DM Sans',sans-serif"}}/>
        <div style={{maxHeight:500,overflowY:'auto',display:'grid',gap:4}}>
          {exercises.map((ex:Exercise)=>{
            const added = sessionExercises.some((e:SessionEx)=>e.exercise_id===ex.id)
            return (
              <div key={ex.id} onClick={()=>!added&&addExercise(ex)}
                style={{padding:'9px 12px',borderRadius:8,background:added?t.tealDim:t.surfaceHigh,border:`1px solid ${added?t.teal:t.border}`,cursor:added?'default':'pointer',transition:'all 0.15s'}}>
                <div style={{fontSize:13,fontWeight:600,color:added?t.teal:t.text}}>{ex.name}</div>
                {ex.muscle_group && <div style={{fontSize:11,color:t.textMuted}}>{ex.muscle_group}</div>}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
