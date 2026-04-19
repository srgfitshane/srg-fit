'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', accent:'#c8f545', accentDim:'#c8f54515',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', green:'#22c55e', greenDim:'#22c55e15',
  red:'#ef4444', redDim:'#ef444415', pink:'#f472b6',
  text:'#eeeef8', textDim:'#8888a8', textMuted:'#5a5a78',
}

const CATEGORIES = [
  { value:'strength',     label:'Strength',     icon:'🏋️', color:t.orange },
  { value:'hypertrophy',  label:'Hypertrophy',  icon:'💪', color:t.purple },
  { value:'conditioning', label:'Conditioning', icon:'🔥', color:t.red },
  { value:'mobility',     label:'Mobility',     icon:'🧘', color:t.teal },
  { value:'powerlifting', label:'Powerlifting', icon:'⚡', color:t.accent },
  { value:'general',      label:'General',      icon:'🎯', color:t.green },
]
const catMeta = (c: string) => CATEGORIES.find(x => x.value === c) || CATEGORIES[5]

const GROUP_COLORS_WB = ['#00c9b1', '#f5a623', '#8b5cf6', '#22c55e', '#f472b6', '#ef4444']
const ROLE_OPTIONS_WB = ['main','secondary','accessory','variation','warmup','cooldown','finisher']
const ROLE_COLORS_WB: Record<string,string> = {
  main: '#f5a623', secondary: '#00c9b1', accessory: '#8b5cf6',
  variation: '#eab308', warmup: '#38bdf8', cooldown: '#f472b6', finisher: '#ef4444',
}
const ROLE_LABELS_WB: Record<string,string> = {
  main:'Main', secondary:'Secondary', accessory:'Accessory',
  variation:'Variation', warmup:'Warm-up', cooldown:'Cool-down', finisher:'Finisher',
}
const GROUP_TYPES_WB = [
  { value:'straight', label:'Straight Sets', icon:'\u25b6' },
  { value:'superset', label:'Superset', icon:'\u26a1' },
  { value:'triset', label:'Tri-Set', icon:'\u25b3' },
  { value:'circuit', label:'Circuit', icon:'\u21bb' },
  { value:'amrap', label:'AMRAP', icon:'\u2191' },
  { value:'emom', label:'EMOM', icon:'\u23f1' },
]

interface TemplateEx {
  id?: string
  exercise_id: string
  exercise_name: string
  exercise_type: string
  sets_prescribed: number
  reps_prescribed: string
  weight_prescribed: string
  rest_seconds: number
  notes: string
  order_index: number
  tracking_type: 'reps' | 'time'
  duration_seconds: number
  exercise_role: 'main' | 'secondary' | 'accessory' | 'variation' | 'warmup' | 'cooldown' | 'finisher'
  superset_group: string
  progression_note: string
  tut: string
  rpe: string
}

type View = 'list' | 'build'

export default function CoachWorkoutsPage() {
  const supabase = createClient()
  const router   = useRouter()
  const [coachId,    setCoachId]    = useState('')
  const [templates,  setTemplates]  = useState<any[]>([])
  const [exercises,  setExercises]  = useState<any[]>([])
  const [clients,    setClients]    = useState<any[]>([])
  const [programs,   setPrograms]   = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState<View>('list')
  const [editing,    setEditing]    = useState<any>(null) // template being edited/created
  // Auto-assign params — set when arriving from ScheduleTab "Build New"
  const [autoAssignClient, setAutoAssignClient] = useState<string|null>(null)
  const [autoAssignDate,   setAutoAssignDate]   = useState<string|null>(null)
  const [autoAssignReturn, setAutoAssignReturn] = useState<string|null>(null)
  const [saving,     setSaving]     = useState(false)
  const [showExPicker, setShowExPicker] = useState(false)
  const [swapIdx,      setSwapIdx]      = useState<number|null>(null) // index being swapped
  const [pendingRole,  setPendingRole]  = useState<'warmup'|'main'|'cooldown'|'finisher'>('main')
  const [editingBuildEx, setEditingBuildEx] = useState<number|null>(null)
  const [groupingBuildEx, setGroupingBuildEx] = useState<number|null>(null)
  const [buildGroupTypes, setBuildGroupTypes] = useState<Record<string,string>>({})
  const [actionModal,setActionModal]= useState<any>(null) // {template, action}
  const [actionForm, setActionForm] = useState({ client_id:'', date:'', program_id:'', resource_group_id:'' })
  const [actionSaving,setActionSaving]=useState(false)
  const [resourceGroups, setResourceGroups] = useState<any[]>([])

  useEffect(() => { load() }, [])

  // Read auto-assign params from URL (from ScheduleTab "Build New")
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const clientId = p.get('auto_client')
    const date     = p.get('auto_date')
    const ret      = p.get('return')
    if (clientId) {
      setAutoAssignClient(clientId)
      setAutoAssignDate(date)
      setAutoAssignReturn(ret)
      openNew()
    }
  }, [])

  const load = useCallback(async () => {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)

    const [
      { data: tmpl },
      { data: exs1 },
      { data: exs2 },
      { data: cls },
      { data: progs },
      { data: rgroups },
    ] = await Promise.all([
      supabase.from('workout_templates').select(`*, workout_template_exercises(*)`)
        .eq('coach_id', user.id).order('created_at', { ascending: false }),
      supabase.from('exercises').select('id, name, muscles, movement_pattern, difficulty').order('name').range(0, 999),
      supabase.from('exercises').select('id, name, muscles, movement_pattern, difficulty').order('name').range(1000, 1999),
      supabase.from('clients')
        .select('id, profile_id, profiles!profile_id(full_name)')
        .eq('coach_id', user.id).eq('active', true),
      supabase.from('programs').select('id, name, is_template')
        .eq('coach_id', user.id).eq('active', true),
      supabase.from('content_groups').select('id, name, icon, color').eq('coach_id', user.id),
    ])

    setTemplates(tmpl || [])
    setExercises([...(exs1 || []), ...(exs2 || [])])
    setPrograms(progs || [])
    setResourceGroups(rgroups || [])

    const clientsWithNames = (cls || []).map((c: any) => ({
      ...c,
      full_name: Array.isArray(c.profiles) ? c.profiles[0]?.full_name : c.profiles?.full_name || 'Unknown'
    }))
    setClients(clientsWithNames)
    setLoading(false)
  }, [])

  // ── Builder state ──────────────────────────────────────────────────────
  const [form, setForm] = useState({
    title: '', category: 'strength', difficulty: 'intermediate',
    estimated_minutes: '', description: '', notes_coach: '', tags: ''
  })
  const [buildExercises, setBuildExercises] = useState<TemplateEx[]>([])

  function openNew() {
    setEditing(null)
    setForm({ title:'', category:'strength', difficulty:'intermediate', estimated_minutes:'', description:'', notes_coach:'', tags:'' })
    setBuildExercises([])
    setView('build')
  }

  function openEdit(tmpl: any) {
    setEditing(tmpl)
    setForm({
      title: tmpl.title,
      category: tmpl.category || 'strength',
      difficulty: tmpl.difficulty || 'intermediate',
      estimated_minutes: tmpl.estimated_minutes || '',
      description: tmpl.description || '',
      notes_coach: tmpl.notes_coach || '',
      tags: (tmpl.tags || []).join(', '),
    })
    const exs = (tmpl.workout_template_exercises || [])
      .sort((a:any,b:any) => a.order_index - b.order_index)
      .map((e:any) => ({ ...e, notes: e.notes || '', tracking_type: e.tracking_type || 'reps', duration_seconds: e.duration_seconds || 30, exercise_role: e.exercise_role || 'main', superset_group: e.superset_group || '', progression_note: e.progression_note || '', tut: e.tut || '' }))
    setBuildExercises(exs)
    setView('build')
  }

  function addExToTemplate(ex: any) {
    if (buildExercises.some(e => e.exercise_id === ex.id)) return
    setBuildExercises(prev => [...prev, {
      exercise_id: ex.id, exercise_name: ex.name,
      exercise_type: ex.movement_pattern || 'strength',
      sets_prescribed: 3, reps_prescribed: '8-12',
      weight_prescribed: '', rest_seconds: 90,
      notes: '', order_index: prev.length,
      tracking_type: 'reps', duration_seconds: 30,
      exercise_role: pendingRole,
      superset_group: '', progression_note: '', tut: '', rpe: '',
    }])
  }

  function updateBuildEx(idx: number, field: keyof TemplateEx, val: any) {
    setBuildExercises(prev => prev.map((e,i) => i===idx ? {...e,[field]:val} : e))
  }

  function removeBuildEx(idx: number) {
    setBuildExercises(prev => prev.filter((_,i)=>i!==idx).map((e,i)=>({...e,order_index:i})))
  }

  function moveEx(idx: number, dir: -1|1) {
    const next = idx + dir
    if (next < 0 || next >= buildExercises.length) return
    setBuildExercises(prev => {
      const arr = [...prev]
      ;[arr[idx], arr[next]] = [arr[next], arr[idx]]
      return arr.map((e,i) => ({...e, order_index: i}))
    })
  }

  async function saveTemplate() {
    if (!form.title.trim() || buildExercises.length === 0) return
    setSaving(true)

    // Snapshot exercises NOW before any async calls can reset state
    const exercisesSnapshot = [...buildExercises]
    console.log('[saveTemplate] autoAssignClient:', autoAssignClient, 'exercises:', exercisesSnapshot.length, 'names:', exercisesSnapshot.map(e=>e.exercise_name))

    // If arriving from ScheduleTab, send everything to the API route atomically
    if (autoAssignClient) {
      const res = await fetch('/api/workouts/save-and-assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template: {
            title: form.title.trim(),
            category: form.category,
            difficulty: form.difficulty,
            estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
            description: form.description || null,
            notes_coach: form.notes_coach || null,
            tags: form.tags ? form.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
          },
          exercises: exercisesSnapshot.map((e,i) => ({
            exercise_id: e.exercise_id,
            exercise_name: e.exercise_name,
            exercise_type: e.exercise_type,
            sets_prescribed: e.sets_prescribed,
            reps_prescribed: e.reps_prescribed,
            weight_prescribed: e.weight_prescribed || null,
            rest_seconds: e.rest_seconds,
            notes: e.notes || null,
            order_index: i,
            tracking_type: e.tracking_type || 'reps',
            duration_seconds: e.tracking_type === 'time' ? e.duration_seconds : null,
            exercise_role: e.exercise_role || 'main',
            superset_group: e.superset_group || null,
            progression_note: e.progression_note || null,
            tut: e.tut || null,
          })),
          client_id: autoAssignClient,
          scheduled_date: autoAssignDate || null,
        }),
      })
      if (res.ok) {
        router.push(autoAssignReturn || '/dashboard/coach')
      } else {
        alert('Save failed — please try again')
        setSaving(false)
      }
      return
    }

    // Normal save (library only — not from calendar)
    // Uses server-side API to bypass RLS issues with workout_template_exercises
    const payload = {
      title: form.title.trim(),
      category: form.category,
      difficulty: form.difficulty,
      estimated_minutes: form.estimated_minutes ? parseInt(form.estimated_minutes) : null,
      description: form.description || null,
      notes_coach: form.notes_coach || null,
      tags: form.tags ? form.tags.split(',').map((s:string)=>s.trim()).filter(Boolean) : [],
    }

    const res = await fetch('/api/workouts/save-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        template: payload,
        template_id: editing?.id || null,
        exercises: exercisesSnapshot.map((e,i) => ({
          exercise_id: e.exercise_id,
          exercise_name: e.exercise_name,
          exercise_type: e.exercise_type,
          sets_prescribed: e.sets_prescribed,
          reps_prescribed: e.reps_prescribed,
          weight_prescribed: e.weight_prescribed || null,
          rest_seconds: e.rest_seconds,
          notes: e.notes || null,
          order_index: i,
          tracking_type: e.tracking_type || 'reps',
          duration_seconds: e.tracking_type === 'time' ? e.duration_seconds : null,
          exercise_role: e.exercise_role || 'main',
          superset_group: e.superset_group || null,
          progression_note: e.progression_note || null,
          tut: e.tut || null,
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert('Save failed: ' + (err.error || 'Unknown error'))
      setSaving(false)
      return
    }

    await load()
    setSaving(false)
    setView('list')
  }

  async function deleteTemplate(id: string) {
    await supabase.from('workout_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  async function duplicateTemplate(tmpl: any) {
    const { data: newTmpl } = await supabase.from('workout_templates').insert({
      coach_id: coachId,
      title: `${tmpl.title} (copy)`,
      category: tmpl.category,
      difficulty: tmpl.difficulty,
      estimated_minutes: tmpl.estimated_minutes,
      description: tmpl.description,
      notes_coach: tmpl.notes_coach,
      tags: tmpl.tags,
    }).select().single()
    if (newTmpl) {
      const exs = (tmpl.workout_template_exercises || [])
        .sort((a: any, b: any) => a.order_index - b.order_index)
      if (exs.length > 0) {
        await supabase.from('workout_template_exercises').insert(
          exs.map((e: any, i: number) => ({
            template_id: newTmpl.id,
            exercise_id: e.exercise_id,
            exercise_name: e.exercise_name,
            exercise_type: e.exercise_type,
            sets_prescribed: e.sets_prescribed,
            reps_prescribed: e.reps_prescribed,
            weight_prescribed: e.weight_prescribed,
            rest_seconds: e.rest_seconds,
            notes: e.notes,
            order_index: i,
            tracking_type: e.tracking_type || 'reps',
            duration_seconds: e.duration_seconds,
            exercise_role: e.exercise_role || 'main',
          }))
        )
      }
    }
    await load()
  }

  // ── Action handlers ────────────────────────────────────────────────────
  function openAction(template: any, action: 'client'|'program'|'resource') {
    setActionModal({ template, action })
    setActionForm({ client_id:'', date: new Date().toISOString().split('T')[0], program_id:'', resource_group_id: resourceGroups[0]?.id || '' })
  }

  async function executeAction() {
    if (!actionModal) return
    setActionSaving(true)
    const { template, action } = actionModal
    if (action === 'client') {
      if (!actionForm.client_id) { setActionSaving(false); return }
      const client = clients.find(c => c.id === actionForm.client_id)

      const res = await fetch('/api/workouts/assign-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          template_id: template.id,
          client_id: actionForm.client_id,
          scheduled_date: actionForm.date || null,
        }),
      })

      if (res.ok && client?.profile_id) {
        const { data: { session: authSession } } = await supabase.auth.getSession()
        if (authSession?.access_token) {
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST', headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authSession.access_token}`,
            },
            body: JSON.stringify({
              user_id: client.profile_id,
              notification_type: 'program_assigned',
              title: `New workout assigned: ${template.title}`,
              body: actionForm.date ? `Scheduled for ${actionForm.date}` : 'Ready when you are!',
              link_url: '/dashboard/client',
            })
          }).catch(()=>{})
        }
      }
    }


    if (action === 'program') {
      // Add as a workout_block to an existing program
      if (!actionForm.program_id) { setActionSaving(false); return }
      const exs = (template.workout_template_exercises || [])
        .sort((a:any,b:any) => a.order_index - b.order_index)

      // Get current max order_index for this program
      const { data: existingBlocks } = await supabase
        .from('workout_blocks').select('order_index').eq('program_id', actionForm.program_id)
        .order('order_index', { ascending: false }).limit(1)
      const nextOrder = existingBlocks?.[0]?.order_index != null ? existingBlocks[0].order_index + 1 : 0

      const { data: block } = await supabase.from('workout_blocks').insert({
        program_id: actionForm.program_id,
        name: template.title,
        block_label: template.category,
        order_index: nextOrder,
        group_types: {},
      }).select().single()

      if (block) {
        await supabase.from('block_exercises').insert(
          exs.map((e:any, i:number) => ({
            block_id: block.id,
            exercise_id: e.exercise_id,
            sets: e.sets_prescribed,
            reps: e.reps_prescribed,
            target_weight: e.weight_prescribed || null,
            rest_seconds: e.rest_seconds,
            notes: e.notes || null,
            order_index: i,
          }))
        )
      }
    }

    if (action === 'resource') {
      // Save as a content_item of type 'workout'
      const exs = (template.workout_template_exercises || [])
        .sort((a:any,b:any) => a.order_index - b.order_index)
      await supabase.from('content_items').insert({
        coach_id: coachId,
        group_id: actionForm.resource_group_id || null,
        title: template.title,
        description: template.description || null,
        content_type: 'workout',
        difficulty: template.difficulty,
        estimated_duration: template.estimated_minutes ? `${template.estimated_minutes} min` : null,
        tags: template.tags || [],
        workout_exercises: exs.map((e:any) => ({
          order: e.order_index + 1,
          name: e.exercise_name,
          prescription: [e.sets_prescribed, e.reps_prescribed].filter(Boolean).join('x') + (e.weight_prescribed ? ` @ ${e.weight_prescribed}` : '')
        })),
      })
    }

    setActionSaving(false)
    setActionModal(null)
  }

  // ── Filtered exercises (used in modal) ────────────────────────────────────
  const [searchEx, setSearchEx] = useState('')
  const [exGroup,     setExGroup]     = useState('all')
  const [exMovement,  setExMovement]  = useState('all')
  const [exEquipment, setExEquipment] = useState('all')
  const muscleGroups = [...new Set(
    exercises.flatMap((e:any) => {
      if (!e.muscles) return []
      if (Array.isArray(e.muscles)) return e.muscles.map((m:string) => m.trim()).filter(Boolean)
      return String(e.muscles).split(',').map((m:string) => m.trim()).filter(Boolean)
    })
  )].sort() as string[]
  const movementPatterns = [...new Set(exercises.map((e:any) => e.movement_pattern).filter(Boolean))].sort() as string[]
  const equipmentList = [...new Set(exercises.map((e:any) => e.equipment).filter(Boolean))].sort() as string[]
  const filteredEx = exercises.filter((e:any) => {
    const matchSearch = !searchEx || e.name.toLowerCase().includes(searchEx.toLowerCase())
    const exMuscles: string[] = !e.muscles ? [] :
      Array.isArray(e.muscles) ? e.muscles.map((m:string) => m.trim()) :
      String(e.muscles).split(',').map((m:string) => m.trim())
    const matchGroup    = exGroup     === 'all' || exMuscles.includes(exGroup)
    const matchMovement = exMovement  === 'all' || e.movement_pattern === exMovement
    const matchEquip    = exEquipment === 'all' || e.equipment === exEquipment
    return matchSearch && matchGroup && matchMovement && matchEquip
  })

  const inp = {
    background: t.surfaceHigh, border: `1px solid ${t.border}`, borderRadius: 8,
    padding: '9px 12px', fontSize: 13, color: t.text, outline: 'none' as const,
    fontFamily: "'DM Sans',sans-serif", width: '100%',
  }

  if (loading) return (
    <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>Loading...</div>
  )

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}.ex-chips::-webkit-scrollbar{display:none;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif"}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:`1px solid ${t.border}`,padding:'0 24px',display:'flex',alignItems:'center',height:60,gap:12}}>
          {view === 'build' ? (
            <button onClick={()=>setView('list')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
              ← Back to Library
            </button>
          ) : (
            <button onClick={()=>router.push('/dashboard/coach')} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>
              ← Dashboard
            </button>
          )}
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:800}}>💪 Workout Library</div>
          <div style={{flex:1}}/>
          {view === 'list' && (
            <button onClick={openNew}
              style={{background:`linear-gradient(135deg,${t.accent},${t.accent}cc)`,border:'none',borderRadius:9,padding:'8px 18px',fontSize:12,fontWeight:800,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
              + Build Workout
            </button>
          )}
          {view === 'build' && (
            <button onClick={saveTemplate} disabled={saving || !form.title.trim() || buildExercises.length === 0}
              style={{background:saving||!form.title.trim()||buildExercises.length===0?t.surfaceHigh:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,border:'none',borderRadius:9,padding:'8px 18px',fontSize:12,fontWeight:800,color:saving||!form.title.trim()||buildExercises.length===0?t.textMuted:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.2s'}}>
              {saving ? 'Saving...' : editing ? '💾 Save Changes' : '✓ Save Workout'}
            </button>
          )}
        </div>

        {/* ── LIST VIEW ── */}
        {view === 'list' && (
          <div style={{maxWidth:960,margin:'0 auto',padding:24}}>
            {templates.length === 0 ? (
              <div style={{textAlign:'center',padding:'80px 20px'}}>
                <div style={{fontSize:56,marginBottom:16}}>💪</div>
                <div style={{fontSize:20,fontWeight:900,marginBottom:8}}>Workout Library</div>
                <div style={{fontSize:13,color:t.textMuted,marginBottom:28,lineHeight:1.7,maxWidth:400,margin:'0 auto 28px'}}>
                  Build reusable workouts once, then send them to a client,<br/>drop them into a program, or publish to the resource library.
                </div>
                <button onClick={openNew}
                  style={{background:`linear-gradient(135deg,${t.accent},${t.accent}cc)`,border:'none',borderRadius:12,padding:'12px 28px',fontSize:14,fontWeight:800,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  + Build Your First Workout
                </button>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:14}}>
                {templates.map(tmpl => {
                  const cm = catMeta(tmpl.category)
                  const exCount = tmpl.workout_template_exercises?.length || 0
                  return (
                    <div key={tmpl.id} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:16,overflow:'hidden',transition:'border-color 0.15s'}}>
                      <div style={{height:3,background:`linear-gradient(90deg,${cm.color},${cm.color}88)`}}/>
                      <div style={{padding:'16px 18px'}}>
                        {/* Header */}
                        <div style={{display:'flex',alignItems:'flex-start',gap:10,marginBottom:10}}>
                          <div style={{width:40,height:40,borderRadius:11,background:cm.color+'18',border:`1px solid ${cm.color}30`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
                            {cm.icon}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{fontSize:14,fontWeight:800,marginBottom:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{tmpl.title}</div>
                            <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                              <span style={{fontSize:10,fontWeight:700,padding:'1px 7px',borderRadius:20,background:cm.color+'18',color:cm.color}}>{cm.label}</span>
                              <span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:t.surfaceHigh,color:t.textMuted}}>{tmpl.difficulty}</span>
                              {tmpl.estimated_minutes && <span style={{fontSize:10,padding:'1px 7px',borderRadius:20,background:t.surfaceHigh,color:t.textMuted}}>⏱ {tmpl.estimated_minutes}m</span>}
                            </div>
                          </div>
                        </div>

                        {/* Exercise list preview */}
                        <div style={{background:t.surfaceUp,borderRadius:10,padding:'10px 12px',marginBottom:12}}>
                          <div style={{fontSize:11,fontWeight:700,color:t.textMuted,marginBottom:6}}>{exCount} exercise{exCount!==1?'s':''}</div>
                          {(tmpl.workout_template_exercises || [])
                            .sort((a:any,b:any)=>a.order_index-b.order_index)
                            .slice(0,4).map((ex:any,i:number) => (
                              <div key={i} style={{display:'flex',alignItems:'center',gap:6,padding:'3px 0',borderBottom:i<Math.min(3,exCount-1)?`1px solid ${t.border}44`:'none'}}>
                                <span style={{fontSize:10,fontWeight:800,color:t.teal,minWidth:16}}>{i+1}.</span>
                                <span style={{fontSize:12,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ex.exercise_name}</span>
                                {ex.exercise_role && ex.exercise_role !== 'main' && (
                                  <span style={{fontSize:9,fontWeight:700,padding:'1px 5px',borderRadius:20,
                                    background: ex.exercise_role==='warmup'?t.teal+'18':ex.exercise_role==='finisher'?t.red+'18':t.purple+'18',
                                    color: ex.exercise_role==='warmup'?t.teal:ex.exercise_role==='finisher'?t.red:t.purple,
                                    flexShrink:0}}>
                                    {ex.exercise_role==='warmup'?'WU':ex.exercise_role==='finisher'?'FIN':'CD'}
                                  </span>
                                )}
                                <span style={{fontSize:11,color:t.textMuted,flexShrink:0}}>{ex.sets_prescribed}×{ex.reps_prescribed}</span>
                              </div>
                            ))}
                          {exCount > 4 && <div style={{fontSize:10,color:t.textMuted,marginTop:4}}>+{exCount-4} more</div>}
                        </div>

                        {/* Action buttons */}
                        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8}}>
                          {[
                            { label:'→ Client',   action:'client',   color:t.teal,   bg:t.tealDim },
                            { label:'→ Program',  action:'program',  color:t.orange, bg:t.orangeDim },
                            { label:'→ Resource', action:'resource', color:t.purple, bg:t.purpleDim },
                          ].map(a => (
                            <button key={a.action} onClick={()=>openAction(tmpl, a.action as any)}
                              style={{background:a.bg,border:`1px solid ${a.color}40`,borderRadius:8,padding:'7px 4px',fontSize:11,fontWeight:700,color:a.color,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                              {a.label}
                            </button>
                          ))}
                        </div>

                        {/* Edit / Duplicate / Delete */}
                        <div style={{display:'flex',gap:6}}>
                          <button onClick={()=>openEdit(tmpl)}
                            style={{flex:1,background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'6px',fontSize:11,fontWeight:700,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            ✏️ Edit
                          </button>
                          <button onClick={()=>duplicateTemplate(tmpl)}
                            style={{background:t.purpleDim,border:`1px solid ${t.purple}40`,borderRadius:8,padding:'6px 10px',fontSize:11,fontWeight:700,color:t.purple,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            ⧉
                          </button>
                          <DeleteButton onDelete={()=>deleteTemplate(tmpl.id)} t={t}/>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* New workout card */}
                <div onClick={openNew} style={{background:'transparent',border:`2px dashed ${t.border}`,borderRadius:16,padding:'40px 20px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:8,cursor:'pointer',minHeight:200,transition:'border-color 0.15s'}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=t.teal+'50'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=t.border}>
                  <span style={{fontSize:28}}>+</span>
                  <span style={{fontSize:12,fontWeight:700,color:t.textMuted}}>Build Workout</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BUILD VIEW ── */}
        {view === 'build' && (
          <div style={{maxWidth:720,margin:'0 auto',padding:24}}>

            {/* Workout details */}
            <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:20,marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Workout Details</div>
              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Title *</label>
                <input value={form.title} onChange={e=>setForm(p=>({...p,title:e.target.value}))} placeholder="e.g. Upper Body Push — Week 1" style={inp}/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,marginBottom:12}}>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Category</label>
                  <select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={inp}>
                    {CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Difficulty</label>
                  <select value={form.difficulty} onChange={e=>setForm(p=>({...p,difficulty:e.target.value}))} style={inp}>
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </div>
                <div>
                  <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Est. Duration (min)</label>
                  <input type="number" value={form.estimated_minutes} onChange={e=>setForm(p=>({...p,estimated_minutes:e.target.value}))} placeholder="45" style={inp}/>
                </div>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Description (optional)</label>
                <textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="What's this workout for? Any context for the client..." style={{...inp,resize:'vertical' as const}}/>
              </div>
              <div style={{marginBottom:10}}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Coach Notes (shown to client)</label>
                <textarea value={form.notes_coach} onChange={e=>setForm(p=>({...p,notes_coach:e.target.value}))} rows={2} placeholder="Focus on tempo today. Keep RPE at 8 max..." style={{...inp,resize:'vertical' as const}}/>
              </div>
              <div>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:4}}>Tags (comma-separated)</label>
                <input value={form.tags} onChange={e=>setForm(p=>({...p,tags:e.target.value}))} placeholder="push, chest, upper body" style={inp}/>
              </div>
            </div>

            {/* Exercise list — program builder style with groups */}
            {(() => {
              // Group exercises by superset_group
              const groups: Record<string, {idx:number,ex:typeof buildExercises[0]}[]> = {}
              const groupOrder: Record<string, number> = {}
              buildExercises.forEach((ex, idx) => {
                const g = ex.superset_group?.trim() || '__none__'
                if (!groups[g]) { groups[g] = []; groupOrder[g] = idx }
                groups[g].push({idx, ex})
              })
              const groupEntries = Object.entries(groups).sort(([a],[b]) => (groupOrder[a]??999) - (groupOrder[b]??999))
              const namedGroups = groupEntries.filter(([k]) => k !== '__none__')
              const groupColorMap: Record<string,string> = {}
              namedGroups.forEach(([k], i) => { groupColorMap[k] = GROUP_COLORS_WB[i % GROUP_COLORS_WB.length] })

              if (buildExercises.length === 0) return (
                <div style={{background:t.surface,border:`2px dashed ${t.border}`,borderRadius:14,padding:'40px 32px',textAlign:'center',marginBottom:12}}>
                  <div style={{fontSize:36,marginBottom:12}}>💪</div>
                  <div style={{fontSize:14,fontWeight:700,marginBottom:6,color:t.textDim}}>No exercises yet</div>
                  <div style={{fontSize:12,color:t.textMuted}}>Use the buttons below to add exercises by section</div>
                </div>
              )

              return (
                <div style={{marginBottom:12}}>
                  {groupEntries.map(([groupKey, groupExes]) => {
                    const isNamed = groupKey !== '__none__'
                    const gc = groupColorMap[groupKey] || t.teal
                    const gType = buildGroupTypes[groupKey] || 'straight'

                    return (
                      <div key={groupKey} style={{marginBottom: isNamed ? 16 : 8}}>
                        {/* Group header with label + type selector */}
                        {isNamed && (
                          <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                            <div style={{background:gc+'18',border:'1px solid '+gc+'40',borderRadius:6,padding:'3px 10px',fontSize:11,fontWeight:900,color:gc,letterSpacing:'0.08em',flexShrink:0}}>
                              {groupKey}
                            </div>
                            <select value={gType}
                              onChange={e => setBuildGroupTypes(prev => ({...prev, [groupKey]: e.target.value}))}
                              style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:7,padding:'3px 8px',fontSize:11,fontWeight:700,color:t.textDim,outline:'none',fontFamily:"'DM Sans',sans-serif",cursor:'pointer',flex:1}}>
                              {GROUP_TYPES_WB.map(gt => (
                                <option key={gt.value} value={gt.value}>{gt.icon} {gt.label}</option>
                              ))}
                            </select>
                            <div style={{height:1,background:gc+'20',width:16,flexShrink:0}} />
                          </div>
                        )}

                        {/* Exercises in group */}
                        <div style={{paddingLeft: isNamed ? 10 : 0, borderLeft: isNamed ? '2px solid '+gc+'30' : 'none'}}>
                          {groupExes.map(({idx: i, ex}) => {
                            const roleMeta = ROLE_COLORS_WB[ex.exercise_role] || t.teal
                            const isEditing = editingBuildEx === i
                            return (
                              <div key={i} style={{marginBottom:10}}>
                                <div style={{display:'flex',alignItems:'flex-start',gap:8}}>
                                  <div style={{paddingTop:2,flexShrink:0}}>
                                    <span style={{display:'inline-flex',alignItems:'center',padding:'2px 7px',borderRadius:5,fontSize:9,fontWeight:800,letterSpacing:'0.06em',textTransform:'uppercase' as const,background:roleMeta+'18',border:'1px solid '+roleMeta+'40',color:roleMeta}}>
                                      {ROLE_LABELS_WB[ex.exercise_role] || ex.exercise_role}
                                    </span>
                                  </div>
                                  <div style={{flex:1,minWidth:0}}>
                                    <div style={{fontSize:13,fontWeight:700,marginBottom:2}}>{ex.exercise_name}</div>
                                    <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                                      <button onClick={() => setGroupingBuildEx(groupingBuildEx === i ? null : i)}
                                        style={{background: ex.superset_group ? (groupColorMap[ex.superset_group]||t.teal)+'22' : t.surfaceHigh, border:'1px solid '+(ex.superset_group ? (groupColorMap[ex.superset_group]||t.teal)+'60' : t.border), borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:800, color: ex.superset_group ? (groupColorMap[ex.superset_group]||t.teal) : t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.04em'}}>
                                        {ex.superset_group ? `Group ${ex.superset_group}` : '+ Group'}
                                      </button>
                                      {groupingBuildEx === i && (
                                        <input autoFocus defaultValue={ex.superset_group || ''} placeholder="A, B, C..."
                                          onBlur={e => { updateBuildEx(i, 'superset_group', e.target.value.trim()); setGroupingBuildEx(null) }}
                                          onKeyDown={e => { if (e.key==='Enter'||e.key==='Escape') { updateBuildEx(i,'superset_group',(e.target as HTMLInputElement).value.trim()); setGroupingBuildEx(null) }}}
                                          style={{width:60,background:t.surface,border:'1px solid '+t.teal+'60',borderRadius:5,padding:'2px 7px',fontSize:11,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                      )}
                                    </div>
                                    <div style={{fontSize:11,color:t.textMuted,lineHeight:1.6}}>
                                      {ex.sets_prescribed}×{ex.tracking_type==='time'?(ex.duration_seconds||'—')+'s':ex.reps_prescribed}
                                      {ex.weight_prescribed?<span style={{color:t.text}}> @ {ex.weight_prescribed}</span>:''}
                                      {ex.tut?<span> · TUT {ex.tut}</span>:''}
                                      {ex.rest_seconds?<span> · {ex.rest_seconds}s rest</span>:''}
                                      {ex.progression_note?<span style={{color:t.green}}> · {ex.progression_note}</span>:''}
                                    </div>
                                    {ex.notes && <div style={{fontSize:10,color:t.textMuted,fontStyle:'italic',marginTop:2}}>📝 {ex.notes}</div>}
                                  </div>
                                  <div style={{display:'flex',gap:4,flexShrink:0}}>
                                    <div style={{display:'flex',flexDirection:'column',gap:2}}>
                                      <button onClick={()=>moveEx(i,-1)} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:5,padding:'2px 6px',fontSize:12,color:i===0?t.textMuted:t.teal,cursor:i===0?'default':'pointer',lineHeight:1}}>▲</button>
                                      <button onClick={()=>moveEx(i,1)} style={{background:t.tealDim,border:'1px solid '+t.teal+'40',borderRadius:5,padding:'2px 6px',fontSize:12,color:i===buildExercises.length-1?t.textMuted:t.teal,cursor:i===buildExercises.length-1?'default':'pointer',lineHeight:1}}>▼</button>
                                    </div>
                                    <button onClick={()=>setEditingBuildEx(isEditing?null:i)}
                                      style={{background:t.surfaceHigh,border:'none',borderRadius:6,padding:'4px 8px',fontSize:10,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                      {isEditing?'done':'edit'}
                                    </button>
                                    <button onClick={()=>{ setSwapIdx(i); setSearchEx(''); setExGroup('all'); setExMovement('all'); setExEquipment('all'); setShowExPicker(true) }}
                                      style={{background:t.orangeDim,border:'1px solid '+t.orange+'40',borderRadius:6,padding:'4px 8px',fontSize:10,color:t.orange,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>swap</button>
                                    <button onClick={()=>removeBuildEx(i)} style={{background:'none',border:'none',color:t.red+'60',cursor:'pointer',fontSize:12}}>✕</button>
                                  </div>
                                </div>
                                {isEditing && (
                                  <div style={{background:t.surfaceHigh,borderRadius:12,padding:'12px',marginTop:8}}>
                                    <div style={{display:'flex',gap:4,marginBottom:8}}>
                                      {(['reps','time'] as const).map(type => (
                                        <button key={type} onClick={()=>updateBuildEx(i,'tracking_type',type)}
                                          style={{padding:'3px 10px',borderRadius:20,border:'1px solid '+(ex.tracking_type===type?t.teal:t.border),background:ex.tracking_type===type?t.tealDim:'transparent',color:ex.tracking_type===type?t.teal:t.textMuted,cursor:'pointer',fontSize:11,fontWeight:700,fontFamily:"'DM Sans',sans-serif"}}>
                                          {type==='reps'?'🔢 Reps':'⏱ Time'}
                                        </button>
                                      ))}
                                    </div>
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                                      {([
                                        ['Sets','sets_prescribed','number'],
                                        ex.tracking_type==='time' ? ['Duration (sec)','duration_seconds','number'] : ['Reps','reps_prescribed','text'],
                                        ['Weight','weight_prescribed','text']
                                      ] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                        <div key={fld}>
                                          <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>{lbl}</div>
                                          <input type={typ} value={(ex as any)[fld]||''} placeholder={lbl==='Sets'?'3':lbl==='Reps'?'8-12':''}
                                            onChange={e=>updateBuildEx(i,fld as keyof TemplateEx,typ==='number'?parseInt(e.target.value)||0:e.target.value)}
                                            style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
                                      {([['RPE','rpe','text'],['TUT','tut','text'],['Rest (s)','rest_seconds','number']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                        <div key={fld}>
                                          <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>{lbl}</div>
                                          <input type={typ} value={(ex as any)[fld]||''} placeholder={lbl==='Rest (s)'?'90':''}
                                            onChange={e=>updateBuildEx(i,fld as keyof TemplateEx,typ==='number'?parseInt(e.target.value)||0:e.target.value)}
                                            style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                        </div>
                                      ))}
                                    </div>
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                                      <div>
                                        <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Role</div>
                                        <select value={ex.exercise_role||'main'} onChange={e=>updateBuildEx(i,'exercise_role',e.target.value)}
                                          style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}}>
                                          {ROLE_OPTIONS_WB.map(r=><option key={r} value={r}>{ROLE_LABELS_WB[r]}</option>)}
                                        </select>
                                      </div>
                                      <div>
                                        <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Group (A, B, C...)</div>
                                        <input type="text" value={ex.superset_group||''} onChange={e=>updateBuildEx(i,'superset_group',e.target.value)}
                                          placeholder="e.g. A, B"
                                          style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                      </div>
                                    </div>
                                    <div style={{marginBottom:8}}>
                                      <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Progression Note</div>
                                      <input type="text" value={ex.progression_note||''} onChange={e=>updateBuildEx(i,'progression_note',e.target.value)}
                                        placeholder="e.g. +2.5kg/week, add 1 rep/session"
                                        style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                    </div>
                                    <div>
                                      <div style={{fontSize:10,fontWeight:700,color:t.textMuted,marginBottom:4}}>Coach Notes</div>
                                      <input value={ex.notes||''} onChange={e=>updateBuildEx(i,'notes',e.target.value)}
                                        placeholder="Cues, technique reminders..."
                                        style={{width:'100%',background:t.surface,border:'1px solid '+t.border,borderRadius:7,padding:'6px 8px',fontSize:12,color:t.text,outline:'none',fontFamily:"'DM Sans',sans-serif"}} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

              {/* Role-based add buttons */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:6,marginBottom:12}}>
                {([
                  {role:'warmup',   label:'🔥 Warm-Up',   color:t.teal},
                  {role:'main',     label:'💪 Main',       color:t.orange},
                  {role:'cooldown', label:'🧘 Cool-Down',  color:t.purple},
                  {role:'finisher', label:'🔴 Finisher',   color:t.red},
                ] as const).map(({role, label, color}) => (
                  <button key={role} onClick={()=>{ setPendingRole(role); setSearchEx(''); setExGroup('all'); setExMovement('all'); setExEquipment('all'); setSwapIdx(null); setShowExPicker(true) }}
                    style={{padding:'9px 4px',borderRadius:10,border:'1px dashed '+color+'50',background:color+'12',color,fontSize:11,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                    {label}
                  </button>
                ))}
              </div>
          </div>
        )}

        {/* ── EXERCISE PICKER MODAL ── */}
        {showExPicker && (
          <div style={{position:'fixed',inset:0,background:'#000000cc',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}} onClick={()=>{ setShowExPicker(false); setSwapIdx(null) }}>
            <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,width:'100%',maxWidth:560,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
              {/* Header */}
              <div style={{padding:'18px 20px 12px',borderBottom:`1px solid ${t.border}`,flexShrink:0}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
                  <div>
                    <div style={{fontSize:15,fontWeight:800}}>{swapIdx !== null ? '🔄 Swap Exercise' : 'Exercise Library'}</div>
                    {swapIdx !== null && <div style={{fontSize:11,color:t.textMuted,marginTop:2}}>Pick a replacement — sets and settings are kept</div>}
                  </div>
                  <button onClick={()=>{ setShowExPicker(false); setSwapIdx(null) }} style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
                </div>
                {/* Search */}
                <input
                  value={searchEx}
                  onChange={e=>setSearchEx(e.target.value)}
                  placeholder="Search exercises..."
                  autoFocus
                  style={{...inp,marginBottom:10}}
                />
                {/* Filters — compact labeled rows */}
                <div style={{display:'flex',flexDirection:'column' as const,gap:3,marginBottom:6}}>
                  <div className="ex-chips" style={{display:'flex',gap:4,overflowX:'auto',flexWrap:'nowrap',msOverflowStyle:'none',scrollbarWidth:'none'}}>
                    <span style={{fontSize:9,fontWeight:800,color:t.teal,textTransform:'uppercase' as const,letterSpacing:'0.06em',alignSelf:'center',flexShrink:0,minWidth:28}}>MUS</span>
                    <button onClick={()=>setExGroup('all')} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exGroup==='all'?t.teal:t.border}`,background:exGroup==='all'?t.tealDim:'transparent',color:exGroup==='all'?t.teal:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif"}}>All</button>
                    {muscleGroups.map(g=>(<button key={g} onClick={()=>setExGroup(g)} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exGroup===g?t.teal:t.border}`,background:exGroup===g?t.tealDim:'transparent',color:exGroup===g?t.teal:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif"}}>{g}</button>))}
                  </div>
                  <div className="ex-chips" style={{display:'flex',gap:4,overflowX:'auto',flexWrap:'nowrap',msOverflowStyle:'none',scrollbarWidth:'none'}}>
                    <span style={{fontSize:9,fontWeight:800,color:t.orange,textTransform:'uppercase' as const,letterSpacing:'0.06em',alignSelf:'center',flexShrink:0,minWidth:28}}>MOV</span>
                    <button onClick={()=>setExMovement('all')} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exMovement==='all'?t.orange:t.border}`,background:exMovement==='all'?t.orangeDim:'transparent',color:exMovement==='all'?t.orange:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif"}}>All</button>
                    {movementPatterns.map(m=>(<button key={m} onClick={()=>setExMovement(m)} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exMovement===m?t.orange:t.border}`,background:exMovement===m?t.orangeDim:'transparent',color:exMovement===m?t.orange:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif",textTransform:'capitalize' as const}}>{m}</button>))}
                  </div>
                  <div className="ex-chips" style={{display:'flex',gap:4,overflowX:'auto',flexWrap:'nowrap',msOverflowStyle:'none',scrollbarWidth:'none'}}>
                    <span style={{fontSize:9,fontWeight:800,color:t.purple,textTransform:'uppercase' as const,letterSpacing:'0.06em',alignSelf:'center',flexShrink:0,minWidth:28}}>EQP</span>
                    <button onClick={()=>setExEquipment('all')} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exEquipment==='all'?t.purple:t.border}`,background:exEquipment==='all'?t.purple+'20':'transparent',color:exEquipment==='all'?t.purple:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif"}}>All</button>
                    {equipmentList.map(eq=>(<button key={eq} onClick={()=>setExEquipment(eq)} style={{padding:'2px 8px',borderRadius:20,border:`1px solid ${exEquipment===eq?t.purple:t.border}`,background:exEquipment===eq?t.purple+'20':'transparent',color:exEquipment===eq?t.purple:t.textDim,cursor:'pointer',fontSize:10,fontWeight:700,whiteSpace:'nowrap',fontFamily:"'DM Sans',sans-serif",textTransform:'capitalize' as const}}>{eq}</button>))}
                  </div>
                </div>
              </div>
              {/* Results */}
              <div style={{overflowY:'auto',flex:1,padding:'8px 12px',display:'grid',gap:4}}>
                <div style={{fontSize:11,color:t.textMuted,padding:'4px 4px 8px',fontWeight:600}}>{filteredEx.length} exercise{filteredEx.length!==1?'s':''}</div>
                {filteredEx.map((ex:any)=>{
                  const added = swapIdx === null && buildExercises.some(e=>e.exercise_id===ex.id)
                  return (
                    <div key={ex.id}
                      onClick={()=>{
                        if (swapIdx !== null) {
                          // Swap mode — replace exercise at swapIdx
                          setBuildExercises(prev => prev.map((e,i) => i === swapIdx
                            ? { ...e, exercise_id: ex.id, exercise_name: ex.name }
                            : e
                          ))
                          setSwapIdx(null); setShowExPicker(false)
                        } else if (!added) {
                          addExToTemplate(ex)
                        }
                      }}
                      style={{display:'flex',alignItems:'center',gap:12,padding:'10px 12px',borderRadius:10,background:added?t.tealDim:t.surfaceHigh,border:`1px solid ${added?t.teal:t.border}`,cursor:added?'default':'pointer',transition:'all 0.12s'}}
                      onMouseEnter={e=>{ if(!added) e.currentTarget.style.borderColor=t.teal+'60' }}
                      onMouseLeave={e=>{ if(!added) e.currentTarget.style.borderColor=t.border }}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,color:added?t.teal:t.text}}>{ex.name}</div>
                        {ex.muscles && <div style={{fontSize:11,color:t.textMuted}}>{ex.muscles}{ex.movement_pattern?' · '+ex.movement_pattern:''}</div>}
                      </div>
                      {added ? (
                        <span style={{fontSize:11,fontWeight:700,color:t.teal,flexShrink:0}}>✓ Added</span>
                      ) : (
                        <span style={{fontSize:11,fontWeight:700,color:swapIdx!==null?t.orange:t.teal,flexShrink:0}}>{swapIdx!==null?'⇄ Swap':'+ Add'}</span>
                      )}
                    </div>
                  )
                })}
                {filteredEx.length === 0 && (
                  <div style={{textAlign:'center',padding:'40px 20px',color:t.textMuted,fontSize:13}}>
                    No exercises found. Try a different search.
                  </div>
                )}
              </div>
              {/* Footer */}
              <div style={{padding:'12px 20px',borderTop:`1px solid ${t.border}`,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{fontSize:12,color:t.textMuted}}>{buildExercises.length} exercise{buildExercises.length!==1?'s':''} in workout</div>
                <button onClick={()=>setShowExPicker(false)}
                  style={{background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,border:'none',borderRadius:9,padding:'8px 20px',fontSize:13,fontWeight:700,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  Done ✓
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── ACTION MODAL ── */}
        {actionModal && (
          <div style={{position:'fixed',inset:0,background:'#000000bb',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100,padding:20}} onClick={()=>setActionModal(null)}>
            <div onClick={e=>e.stopPropagation()} style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:20,padding:28,width:'100%',maxWidth:440}}>
              <div style={{fontSize:15,fontWeight:800,marginBottom:4}}>
                {actionModal.action==='client'   && '👤 Assign to Client'}
                {actionModal.action==='program'  && '📋 Add to Program'}
                {actionModal.action==='resource' && '📚 Save to Resource Library'}
              </div>
              <div style={{fontSize:12,color:t.teal,fontWeight:700,marginBottom:20}}>💪 {actionModal.template.title}</div>

              {actionModal.action === 'client' && (
                <div style={{display:'flex',flexDirection:'column',gap:14}}>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Client *</label>
                    <select value={actionForm.client_id} onChange={e=>setActionForm(p=>({...p,client_id:e.target.value}))} style={{...inp,fontSize:14}}>
                      <option value="">Select client...</option>
                      {clients.map(c=><option key={c.id} value={c.id}>{c.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Scheduled Date</label>
                    <input type="date" value={actionForm.date} onChange={e=>setActionForm(p=>({...p,date:e.target.value}))} style={{...inp,fontSize:14}}/>
                  </div>
                </div>
              )}

              {actionModal.action === 'program' && (
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Add to Program *</label>
                  <select value={actionForm.program_id} onChange={e=>setActionForm(p=>({...p,program_id:e.target.value}))} style={{...inp,fontSize:14}}>
                    <option value="">Select program...</option>
                    {programs.map(p=>(
                      <option key={p.id} value={p.id}>{p.is_template?'📐 ':'👤 '}{p.name}</option>
                    ))}
                  </select>
                  <div style={{fontSize:11,color:t.textMuted,marginTop:8}}>This workout will be added as a new block in the program builder.</div>
                </div>
              )}

              {actionModal.action === 'resource' && (
                <div>
                  <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Resource Collection</label>
                  <select value={actionForm.resource_group_id} onChange={e=>setActionForm(p=>({...p,resource_group_id:e.target.value}))} style={{...inp,fontSize:14}}>
                    <option value="">No collection (uncategorized)</option>
                    {resourceGroups.map(g=><option key={g.id} value={g.id}>{g.icon} {g.name}</option>)}
                  </select>
                  <div style={{fontSize:11,color:t.textMuted,marginTop:8}}>Clients will see this workout in their Resource Library with all exercises listed.</div>
                </div>
              )}

              <div style={{display:'flex',gap:10,marginTop:20}}>
                <button onClick={()=>setActionModal(null)} style={{flex:1,background:'transparent',border:`1px solid ${t.border}`,borderRadius:10,padding:'11px',fontSize:13,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
                <button onClick={executeAction} disabled={actionSaving||(actionModal.action==='client'&&!actionForm.client_id)||(actionModal.action==='program'&&!actionForm.program_id)}
                  style={{flex:2,background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`,border:'none',borderRadius:10,padding:'11px',fontSize:13,fontWeight:800,color:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif",opacity:actionSaving?0.6:1}}>
                  {actionSaving ? 'Saving...' : actionModal.action==='client' ? '📤 Assign Workout' : actionModal.action==='program' ? '📋 Add to Program' : '📚 Save to Library'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function DeleteButton({ onDelete, t }: { onDelete: ()=>void, t: any }) {
  const [confirm, setConfirm] = useState(false)
  if (confirm) return (
    <div style={{display:'flex',gap:4}}>
      <button onClick={onDelete} style={{background:t.red,border:'none',borderRadius:7,padding:'6px 10px',fontSize:11,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Delete</button>
      <button onClick={()=>setConfirm(false)} style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:7,padding:'6px 8px',fontSize:11,fontWeight:700,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Cancel</button>
    </div>
  )
  return (
    <button onClick={()=>setConfirm(true)} style={{background:t.redDim,border:`1px solid ${t.red}40`,borderRadius:8,padding:'6px 12px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>🗑</button>
  )
}
