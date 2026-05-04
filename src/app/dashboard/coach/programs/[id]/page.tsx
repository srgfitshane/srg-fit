'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'
import { localDateStr } from '@/lib/date'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  blue:"#38bdf8", blueDim:"#38bdf815", pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const WEEK_COLORS = [t.teal, t.orange, t.purple, t.green, t.yellow, t.pink, t.blue, t.red]
const GROUP_COLORS = [t.teal, t.orange, t.purple, t.green, t.yellow, t.pink, t.blue, t.red]

const ROLE_OPTIONS = ['main','secondary','accessory','variation','warmup','cooldown','finisher']
const ROLE_COLORS: Record<string,string> = {
  main: t.orange, secondary: t.teal, accessory: t.purple,
  variation: t.yellow, warmup: t.blue, cooldown: t.pink, finisher: t.red,
}
const ROLE_LABELS: Record<string,string> = {
  main:'Main', secondary:'Secondary', accessory:'Accessory',
  variation:'Variation', warmup:'Warm-up', cooldown:'Cool-down', finisher:'Finisher',
}

const GROUP_TYPES = [
  { value:'straight',  label:'Straight Sets',  icon:'▶' },
  { value:'superset',  label:'Superset',        icon:'⚡' },
  { value:'triset',    label:'Tri-Set',         icon:'🔺' },
  { value:'circuit',   label:'Circuit',         icon:'🔄' },
  { value:'amrap',     label:'AMRAP',           icon:'🔥' },
  { value:'emom',      label:'EMOM',            icon:'⏱' },
  { value:'cluster',   label:'Cluster Sets',    icon:'💥' },
  { value:'dropset',   label:'Drop Set',        icon:'📉' },
  { value:'contrast',  label:'Contrast/PAP',    icon:'⚖' },
]
const GROUP_TYPE_MAP: Record<string,{label:string,icon:string}> = Object.fromEntries(GROUP_TYPES.map(g=>[g.value,g]))

export default function ProgramBuilder() {
  const [program,    setProgram]    = useState<any>(null)
  // Inline rename for the program/template name in the top bar.
  // Click the name to edit, Enter or blur to save, Escape to cancel.
  // Especially helpful for AI-imported templates whose parsed names
  // need a quick cleanup before assigning to clients.
  const [renamingProgram,   setRenamingProgram]   = useState(false)
  const [programNameDraft,  setProgramNameDraft]  = useState('')
  const [renamingProgSaving, setRenamingProgSaving] = useState(false)
  const [blocks,     setBlocks]     = useState<any[]>([])
  const [exercises,  setExercises]  = useState<any[]>([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState<'builder'|'calendar'>('builder')
  const [activeWeek, setActiveWeek] = useState(1)
  const [editingEx,  setEditingEx]  = useState<string|null>(null)
  const [groupingEx, setGroupingEx] = useState<string|null>(null)
  const [openSlotModal, setOpenSlotModal] = useState<{blockId:string}|null>(null)
  const [slotConstraint,   setSlotConstraint]   = useState('')
  const [slotRole,         setSlotRole]         = useState('main')
  const [slotTracking,     setSlotTracking]     = useState<'reps'|'time'>('reps')
  const [slotSets,         setSlotSets]         = useState('3')
  const [slotReps,         setSlotReps]         = useState('8-10')
  const [slotDuration,     setSlotDuration]     = useState('20')
  const [slotFilterType,   setSlotFilterType]   = useState<'muscle'|'movement'|'equipment'|'none'>('none')
  const [slotFilterValue,  setSlotFilterValue]  = useState('')
  const [showAddEx,  setShowAddEx]  = useState<string|null>(null) // blockId
  const [swapExId,   setSwapExId]   = useState<string|null>(null) // block_exercise id being swapped
  const [pendingRole, setPendingRole] = useState<string>('main')
  const [addExTab,   setAddExTab]   = useState<'exercise'|'template'|'create'>('exercise')
  // Quick-create form state for the Create New tab. Pre-fills name from
  // the current search box so 'searched but missing' becomes 'create it'
  // in one tap with the name already there.
  const [newExName,      setNewExName]      = useState('')
  const [newExEquipment, setNewExEquipment] = useState('')
  const [newExMuscle,    setNewExMuscle]    = useState('')
  const [newExMovement,  setNewExMovement]  = useState('')
  const [newExImageFile, setNewExImageFile] = useState<File|null>(null)
  const [newExSaving,    setNewExSaving]    = useState(false)
  const [exSearch,    setExSearch]    = useState('')
  const [exGroup,     setExGroup]     = useState('all')
  const [exMovement,  setExMovement]  = useState('all')
  const [exEquipment, setExEquipment] = useState('all')
  const [templates,  setTemplates]  = useState<any[]>([])
  const [tmplLoading,setTmplLoading]= useState(false)
  const [saving,     setSaving]     = useState<string|null>(null)
  const router   = useRouter()
  const params   = useParams()
  const supabase = createClient()
  const programId = params.id as string

  useEffect(() => { load() }, [programId])

  const load = async () => {
    const { data: prog } = await supabase.from('programs').select(`*, client:clients(*, profile:profiles!clients_profile_id_fkey(full_name))`).eq('id', programId).single()
    // note: template_id self-join not supported in this select, fetch separately if needed
    setProgram(prog)
    const { data: blockData } = await supabase
      .from('workout_blocks').select(`*, block_exercises(*, exercise:exercises(name, muscles))`)
      .eq('program_id', programId).order('week_number').order('order_index')
    setBlocks(blockData || [])
    const [{ data: exPage1 }, { data: exPage2 }] = await Promise.all([
      supabase.from('exercises').select('*').order('name').range(0, 999),
      supabase.from('exercises').select('*').order('name').range(1000, 1999),
    ])
    setExercises([...(exPage1 || []), ...(exPage2 || [])])
    setLoading(false)
  }

  const weeks = [...new Set(blocks.map(b => b.week_number))].sort((a,b)=>a-b)
  const totalWeeks = weeks.length || 1
  const blocksForWeek = (w: number) => blocks.filter(b => b.week_number === w).sort((a,b)=>a.order_index-b.order_index)

  const duplicateWeek = async (weekNum: number) => {
    const nextWeek = totalWeeks + 1
    const srcBlocks = blocksForWeek(weekNum)
    for (const b of srcBlocks) {
      const { data: nb } = await supabase.from('workout_blocks').insert({
        program_id: programId, name: b.name, day_label: b.day_label,
        day_of_week: b.day_of_week,
        block_label: b.block_label, week_number: nextWeek, order_index: b.order_index,
        group_types: b.group_types || {},
      }).select().single()
      if (nb) {
        for (const ex of (b.block_exercises || [])) {
          await supabase.from('block_exercises').insert({
            block_id: nb.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps,
            target_weight: ex.target_weight, rest_seconds: ex.rest_seconds, rpe: ex.rpe,
            tut: ex.tut, superset_group: ex.superset_group, exercise_role: ex.exercise_role,
            notes: ex.notes, order_index: ex.order_index, progression_note: ex.progression_note,
            tracking_type: ex.tracking_type, duration_seconds: ex.duration_seconds,
          })
        }
      }
    }
    await load(); setActiveWeek(nextWeek)
  }

  const deleteWeek = async (weekNum: number) => {
    if (totalWeeks <= 1) return // can't delete the only week
    // Delete all blocks (cascades to block_exercises via FK)
    const blocksToDelete = blocksForWeek(weekNum)
    for (const b of blocksToDelete) {
      await supabase.from('workout_blocks').delete().eq('id', b.id)
    }
    // Re-number weeks above the deleted one to keep them contiguous
    const higherWeeks = weeks.filter(w => w > weekNum)
    for (const w of higherWeeks) {
      const wBlocks = blocksForWeek(w)
      for (const b of wBlocks) {
        await supabase.from('workout_blocks').update({ week_number: w - 1 }).eq('id', b.id)
      }
    }
    await load()
    setActiveWeek(weekNum > 1 ? weekNum - 1 : 1)
  }

  const addWeek = async () => {
    const nextWeek = totalWeeks + 1
    const week1Blocks = blocksForWeek(1)
    if (week1Blocks.length > 0) {
      for (const b of week1Blocks) {
        const { data: nb } = await supabase.from('workout_blocks').insert({
          program_id: programId, name: b.name, day_label: b.day_label,
          day_of_week: b.day_of_week,
          block_label: b.block_label, week_number: nextWeek, order_index: b.order_index,
          group_types: b.group_types || {},
        }).select().single()
        if (nb) {
          for (const ex of (b.block_exercises || [])) {
            await supabase.from('block_exercises').insert({
              block_id: nb.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps,
              target_weight: ex.target_weight, rest_seconds: ex.rest_seconds, rpe: ex.rpe,
              tut: ex.tut, superset_group: ex.superset_group, exercise_role: ex.exercise_role,
              notes: ex.notes, order_index: ex.order_index, progression_note: ex.progression_note,
            })
          }
        }
      }
    } else {
      for (let i = 0; i < 3; i++) {
        await supabase.from('workout_blocks').insert({
          program_id: programId, name: `Day ${['A','B','C'][i]}`,
          day_label: `Day ${['A','B','C'][i]}`, week_number: nextWeek, order_index: i,
        })
      }
    }
    await load(); setActiveWeek(nextWeek)
  }

  const duplicateDay = async (block: any) => {
    const weekBlocks = blocksForWeek(block.week_number)
    const labels = ['A','B','C','D','E','F','G']
    const label = labels[weekBlocks.length] || `Day ${weekBlocks.length + 1}`
    const { data: nb } = await supabase.from('workout_blocks').insert({
      program_id: programId,
      name: `${block.day_label || block.name} (copy)`,
      day_label: `${block.day_label || label} (copy)`,
      day_of_week: block.day_of_week,
      block_label: block.block_label,
      week_number: block.week_number,
      order_index: weekBlocks.length,
      group_types: block.group_types || {},
    }).select().single()
    if (nb) {
      for (const ex of (block.block_exercises || [])) {
        await supabase.from('block_exercises').insert({
          block_id: nb.id, exercise_id: ex.exercise_id, sets: ex.sets, reps: ex.reps,
          target_weight: ex.target_weight, rest_seconds: ex.rest_seconds, rpe: ex.rpe,
          tut: ex.tut, superset_group: ex.superset_group, exercise_role: ex.exercise_role,
          notes: ex.notes, order_index: ex.order_index, progression_note: ex.progression_note,
          tracking_type: ex.tracking_type, duration_seconds: ex.duration_seconds,
        })
      }
    }
    await load()
  }

  const addDay = async (weekNum: number) => {
    const existing = blocksForWeek(weekNum)
    const labels = ['A','B','C','D','E','F','G']
    const label = labels[existing.length] || `Day ${existing.length+1}`
    await supabase.from('workout_blocks').insert({
      program_id: programId, name: `Day ${label}`,
      day_label: `Day ${label}`, week_number: weekNum, order_index: existing.length,
    })
    await load()
  }

  const updateBlock = async (blockId: string, field: string, value: any) => {
    setSaving(blockId)
    const update: any = { [field]: value }
    if (field === 'day_label') update.name = value
    await supabase.from('workout_blocks').update(update).eq('id', blockId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, ...update } : b))
    setSaving(null)
  }

  // Update the group_types JSON on the block: { "A": "superset", "B": "circuit" }
  const updateGroupType = async (blockId: string, groupKey: string, typeValue: string) => {
    const block = blocks.find(b => b.id === blockId)
    const current = block?.group_types || {}
    const updated = { ...current, [groupKey]: typeValue }
    await supabase.from('workout_blocks').update({ group_types: updated }).eq('id', blockId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, group_types: updated } : b))
  }

  const deleteBlock = async (blockId: string) => {
    await supabase.from('block_exercises').delete().eq('block_id', blockId)
    await supabase.from('workout_blocks').delete().eq('id', blockId)
    setBlocks(prev => prev.filter(b => b.id !== blockId))
  }

  const addExercise = async (blockId: string, exerciseId: string) => {
    const block = blocks.find(b => b.id === blockId)
    const exCount = (block?.block_exercises || []).length
    const { data: newEx } = await supabase.from('block_exercises').insert({
      block_id: blockId, exercise_id: exerciseId,
      sets: 3, reps: '8-10', target_weight: '', rest_seconds: 90,
      rpe: '', tut: '', exercise_role: pendingRole,
      order_index: exCount,
    }).select(`*, exercise:exercises(name, muscles)`).single()
    if (newEx) setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, block_exercises: [...(b.block_exercises||[]), newEx] } : b))
    setShowAddEx(null); setExSearch(''); setEditingEx(newEx?.id || null)
  }

  const swapExercise = async (blockExId: string, newExerciseId: string) => {
    const ex = exercises.find(e => e.id === newExerciseId)
    await supabase.from('block_exercises').update({
      exercise_id: newExerciseId,
    }).eq('id', blockExId)
    setBlocks(prev => prev.map(b => ({
      ...b,
      block_exercises: (b.block_exercises||[]).map((e:any) =>
        e.id === blockExId
          ? { ...e, exercise_id: newExerciseId, exercise: { name: ex?.name || '', muscles: ex?.muscles || '' } }
          : e
      )
    })))
    setSwapExId(null); setShowAddEx(null); setExSearch('')
  }

  const addOpenSlot = async (blockId: string, constraint: string, role: string) => {
    const block = blocks.find(b => b.id === blockId)
    const exCount = (block?.block_exercises || []).length
    const { data: newEx } = await supabase.from('block_exercises').insert({
      block_id: blockId,
      exercise_id: null,
      is_open_slot: true,
      slot_constraint: constraint.trim() || 'Your Choice',
      slot_filter_type: slotFilterType !== 'none' ? slotFilterType : null,
      slot_filter_value: slotFilterType !== 'none' ? slotFilterValue : null,
      exercise_role: role,
      sets: parseInt(slotSets) || 3,
      reps: slotTracking === 'reps' ? slotReps : '',
      tracking_type: slotTracking,
      duration_seconds: slotTracking === 'time' ? parseInt(slotDuration) * 60 : null,
      rest_seconds: 90,
      order_index: exCount,
    }).select('*').single()
    if (newEx) setBlocks(prev => prev.map(b => b.id === blockId
      ? { ...b, block_exercises: [...(b.block_exercises||[]), { ...newEx, exercise: null }] }
      : b
    ))
    setOpenSlotModal(null)
    setSlotConstraint(''); setSlotRole('main')
    setSlotTracking('reps'); setSlotSets('3'); setSlotReps('8-10'); setSlotDuration('20')
    setSlotFilterType('none'); setSlotFilterValue('')
  }

  const updateExercise = async (exId: string, field: string, value: any) => {
    await supabase.from('block_exercises').update({ [field]: value }).eq('id', exId)
    setBlocks(prev => prev.map(b => ({ ...b, block_exercises: (b.block_exercises||[]).map((e:any) => e.id === exId ? { ...e, [field]: value } : e) })))
  }

  const deleteExercise = async (blockId: string, exId: string) => {
    await supabase.from('block_exercises').delete().eq('id', exId)
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, block_exercises: (b.block_exercises||[]).filter((e:any) => e.id !== exId) } : b))
  }

  const moveExercise = async (blockId: string, exId: string, dir: -1|1) => {
    setBlocks(prev => prev.map(b => {
      if (b.id !== blockId) return b
      const exes = [...(b.block_exercises||[])].sort((a:any,b:any) => a.order_index - b.order_index)
      const idx = exes.findIndex((e:any) => e.id === exId)
      const next = idx + dir
      if (next < 0 || next >= exes.length) return b
      // Swap order_index values
      const tmp = exes[idx].order_index
      exes[idx] = { ...exes[idx], order_index: exes[next].order_index }
      exes[next] = { ...exes[next], order_index: tmp }
      // Persist both
      void supabase.from('block_exercises').update({ order_index: exes[idx].order_index }).eq('id', exes[idx].id)
      void supabase.from('block_exercises').update({ order_index: exes[next].order_index }).eq('id', exes[next].id)
      return { ...b, block_exercises: exes }
    }))
  }

  const openAddEx = async (blockId: string, role = 'main') => {
    setPendingRole(role)
    setShowAddEx(blockId)
    setExSearch('')
    setExGroup('all')
    setExMovement('all')
    setExEquipment('all')
    setAddExTab('exercise')
    setTmplLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: tmpl } = await supabase
      .from('workout_templates')
      .select(`*, workout_template_exercises(*)`)
      .eq('coach_id', user!.id)
      .order('created_at', { ascending: false })
    setTemplates(tmpl || [])
    setTmplLoading(false)
  }

  // Save a day/block as a reusable workout template
  const saveBlockAsTemplate = async (block: any) => {
    const exes = (block.block_exercises || []).sort((a:any,b:any) => a.order_index - b.order_index)
    if (exes.length === 0) return
    const name = block.day_label || block.name || 'Workout'
    const { data: tmpl, error } = await supabase.from('workout_templates').insert({
      coach_id: program?.coach_id,
      title: name,
      notes_coach: `Saved from program: ${program?.name || ''}`,
    }).select().single()
    if (error || !tmpl) { console.error('saveBlockAsTemplate error:', error?.message); return }
    const templateExes = exes.map((ex:any, i:number) => ({
      template_id: tmpl.id,
      exercise_id: ex.exercise_id,
      exercise_name: ex.exercise?.name || ex.exercise_name || '',
      sets_prescribed: ex.sets || ex.sets_prescribed || 3,
      reps_prescribed: ex.reps || ex.reps_prescribed || '8-12',
      weight_prescribed: ex.target_weight || ex.weight_prescribed || '',
      rest_seconds: ex.rest_seconds || 90,
      notes: ex.notes || null,
      order_index: i,
    }))
    await supabase.from('workout_template_exercises').insert(templateExes)
    setTemplates(prev => [{ ...tmpl, workout_template_exercises: templateExes }, ...prev])
    alert(`"${name}" saved to Workout Library ✓`)
  }

  // Import all exercises from a workout template into an existing block
  const importTemplateIntoBlock = async (blockId: string, template: any) => {
    const block = blocks.find(b => b.id === blockId)
    let orderStart = (block?.block_exercises || []).length
    const exs = (template.workout_template_exercises || [])
      .sort((a:any,b:any) => a.order_index - b.order_index)
    for (const ex of exs) {
      const { data: newEx } = await supabase.from('block_exercises').insert({
        block_id: blockId,
        exercise_id: ex.exercise_id,
        sets: ex.sets_prescribed || 3,
        reps: ex.reps_prescribed || '8-12',
        target_weight: ex.weight_prescribed || '',
        rest_seconds: ex.rest_seconds || 90,
        exercise_role: orderStart === 0 ? 'main' : orderStart === 1 ? 'secondary' : 'accessory',
        notes: ex.notes || null,
        order_index: orderStart++,
      }).select(`*, exercise:exercises(name, muscles)`).single()
      if (newEx) {
        setBlocks(prev => prev.map(b => b.id === blockId
          ? { ...b, block_exercises: [...(b.block_exercises||[]), newEx] }
          : b
        ))
      }
    }
    setShowAddEx(null)
  }

  // Add a new day pre-populated from a template
  const addDayFromTemplate = async (weekNum: number, template: any) => {
    const existing = blocksForWeek(weekNum)
    const labels = ['A','B','C','D','E','F','G']
    const label = labels[existing.length] || `Day ${existing.length+1}`
    const { data: block } = await supabase.from('workout_blocks').insert({
      program_id: programId,
      name: template.title,
      day_label: template.title,
      week_number: weekNum,
      order_index: existing.length,
    }).select().single()
    if (block) {
      const exs = (template.workout_template_exercises || [])
        .sort((a:any,b:any) => a.order_index - b.order_index)
      for (let i = 0; i < exs.length; i++) {
        const ex = exs[i]
        await supabase.from('block_exercises').insert({
          block_id: block.id,
          exercise_id: ex.exercise_id,
          sets: ex.sets_prescribed || 3,
          reps: ex.reps_prescribed || '8-12',
          target_weight: ex.weight_prescribed || '',
          rest_seconds: ex.rest_seconds || 90,
          exercise_role: i === 0 ? 'main' : i === 1 ? 'secondary' : 'accessory',
          notes: ex.notes || null,
          order_index: i,
        })
      }
      await load()
    }
    setShowAddDay(null)
  }

  const [showAddDay, setShowAddDay]   = useState<number|null>(null)
  const [addDayTmplLoading, setAddDayTmplLoading] = useState(false)
  const [addDayTemplates, setAddDayTemplates] = useState<any[]>([])

  // ── Send to Client ────────────────────────────────────────────────────
  const [showSend, setShowSend] = useState(false)
  const [sendStartDate, setSendStartDate] = useState(() => localDateStr())
  const [sendMode, setSendMode] = useState<'add'|'replace'>('add')
  const [sending, setSendingSessions] = useState(false)
  const [sendDone, setSendDone] = useState(false)
  const [sendError, setSendError] = useState('')

  const DAY_MAP: Record<string,number> = { Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6,Sun:0 }

  const sendToClient = async () => {
    if (!program?.client_id) { setSendError('No client assigned to this program.'); return }
    setSendingSessions(true); setSendError('')
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const clientId = program.client_id
      const startDate = new Date(sendStartDate + 'T12:00:00')

      // Get the Monday of the start week
      const dayOfWeek = startDate.getDay() // 0=Sun,1=Mon...
      const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
      const weekStart = new Date(startDate)
      weekStart.setDate(weekStart.getDate() + diffToMonday)

      if (sendMode === 'replace') {
        await supabase.from('workout_sessions')
          .delete()
          .eq('client_id', clientId)
          .eq('program_id', program.id)
          .eq('status', 'assigned')
      }

      const sortedBlocks = [...blocks].sort((a,b) => a.week_number - b.week_number || a.order_index - b.order_index)
      const sessionsToInsert: any[] = []

      const DAY_OFFSETS: Record<string,number> = { Mon:0, Tue:1, Wed:2, Thu:3, Fri:4, Sat:5, Sun:6 }

      for (const block of sortedBlocks) {
        if (!block.day_of_week || !(block.day_of_week in DAY_OFFSETS)) {
          // Fall back to the same order_index in week 1 — handles legacy programs
          // whose duplicated weeks were created before day_of_week was carried over.
          const week1Block = sortedBlocks.find((b: any) => b.week_number === 1 && b.order_index === block.order_index)
          if (!week1Block?.day_of_week || !(week1Block.day_of_week in DAY_OFFSETS)) continue
          block.day_of_week = week1Block.day_of_week
        }
        const weekOffset = (block.week_number - 1) * 7
        const dayOffset = DAY_OFFSETS[block.day_of_week]
        const sessionDate = new Date(weekStart)
        sessionDate.setDate(sessionDate.getDate() + weekOffset + dayOffset)
        sessionsToInsert.push({
          client_id: clientId,
          program_id: program.id,
          block_id: block.id,
          coach_id: user?.id,
          title: block.day_label || block.name,
          scheduled_date: localDateStr(sessionDate),
          date: localDateStr(sessionDate),
          status: 'assigned',
          week_number: block.week_number,
          day_label: block.day_of_week,
        })
      }

      if (sessionsToInsert.length === 0) {
        setSendError('No scheduled workouts found. Place workouts on calendar days first.')
        setSendingSessions(false); return
      }

      const { data: insertedSessions, error } = await supabase
        .from('workout_sessions').insert(sessionsToInsert).select()
      if (error) { setSendError(error.message); setSendingSessions(false); return }

      // Populate session_exercises from each block's block_exercises
      for (const session of (insertedSessions || [])) {
        const block = blocks.find(b => b.id === session.block_id)
        const exes = (block?.block_exercises || [])
          .sort((a: any, b: any) => a.order_index - b.order_index)
        if (exes.length === 0) continue
        const { error: seError } = await supabase.from('session_exercises').insert(
          exes.map((ex: any) => ({
            session_id: session.id,
            exercise_id: ex.exercise_id || null,
            exercise_name: ex.is_open_slot ? '' : (ex.exercise?.name || ''),
            sets_prescribed: ex.sets || 3,
            reps_prescribed: ex.reps || '',
            weight_prescribed: ex.target_weight || '',
            rest_seconds: ex.rest_seconds || null,
            notes_coach: ex.notes || null,
            order_index: ex.order_index,
            exercise_role: ex.exercise_role || 'main',
            tracking_type: ex.tracking_type || 'reps',
            duration_seconds: ex.duration_seconds || null,
            is_open_slot: ex.is_open_slot || false,
            slot_constraint: ex.slot_constraint || null,
            slot_filter_type: ex.slot_filter_type || null,
            slot_filter_value: ex.slot_filter_value || null,
          }))
        )
        if (seError) { setSendError('Could not populate exercises for ' + (block?.day_label || block?.name || 'a session') + ': ' + seError.message); setSendingSessions(false); return }
      }
      setSendDone(true)
      setTimeout(() => { setShowSend(false); setSendDone(false) }, 2200)
    } catch (e: any) {
      setSendError(e.message)
    }
    setSendingSessions(false)
  }

  const openAddDay = async (weekNum: number) => {
    setShowAddDay(weekNum)
    setAddDayTmplLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: tmpl } = await supabase
      .from('workout_templates')
      .select(`*, workout_template_exercises(*)`)
      .eq('coach_id', user!.id)
      .order('created_at', { ascending: false })
    setAddDayTemplates(tmpl || [])
    setAddDayTmplLoading(false)
  }

  const muscleGroups    = [...new Set(exercises.flatMap((e:any) => Array.isArray(e.muscles) ? e.muscles.map((m:string)=>m.trim()) : []).filter(Boolean))].sort() as string[]
  const movementPatterns = [...new Set(exercises.map((e:any) => e.movement_pattern).filter(Boolean))].sort() as string[]
  const equipmentList   = [...new Set(exercises.map((e:any) => e.equipment).filter(Boolean))].sort() as string[]
  const filteredExercises = exercises.filter((e:any) => {
    const matchSearch   = !exSearch    || e.name.toLowerCase().includes(exSearch.toLowerCase())
    const exMuscles     = Array.isArray(e.muscles) ? e.muscles.map((m:string)=>m.trim()) : []
    const matchMuscle   = exGroup     === 'all' || exMuscles.includes(exGroup)
    const matchMovement = exMovement  === 'all' || e.movement_pattern === exMovement
    const matchEquip    = exEquipment === 'all' || e.equipment === exEquipment
    return matchSearch && matchMuscle && matchMovement && matchEquip
  })

  const getGroups = (exes: any[]) => {
    const groups: Record<string, any[]> = {}
    const groupFirstIndex: Record<string, number> = {}
    exes.sort((a,b)=>a.order_index-b.order_index).forEach((ex:any) => {
      const g = ex.superset_group?.trim() || '__none__'
      if (!groups[g]) { groups[g] = []; groupFirstIndex[g] = ex.order_index ?? 999 }
      groups[g].push(ex)
    })
    // Sort groups by the order_index of their first exercise — preserves intended layout
    return Object.entries(groups).sort(([a],[b]) => {
      return (groupFirstIndex[a] ?? 999) - (groupFirstIndex[b] ?? 999)
    })
  }

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.teal, fontSize:14, fontWeight:700 }}>Loading program...</div>

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,textarea,select{color-scheme:dark;}
        .role-pill{display:inline-flex;align-items:center;padding:2px 7px;border-radius:5px;font-size:9px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach/programs')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              {renamingProgram ? (
                <input
                  autoFocus
                  value={programNameDraft}
                  onChange={e => setProgramNameDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') { setRenamingProgram(false); setProgramNameDraft('') }
                  }}
                  onBlur={async () => {
                    const next = programNameDraft.trim()
                    // Empty or unchanged → just exit edit mode
                    if (!next || next === program?.name) { setRenamingProgram(false); return }
                    setRenamingProgSaving(true)
                    const { error } = await supabase.from('programs').update({ name: next }).eq('id', programId)
                    setRenamingProgSaving(false)
                    if (error) {
                      alert('Could not rename: ' + error.message)
                      setRenamingProgram(false)
                      return
                    }
                    setProgram((p: any) => p ? { ...p, name: next } : p)
                    setRenamingProgram(false)
                  }}
                  disabled={renamingProgSaving}
                  style={{ background:t.surfaceUp, border:'1px solid '+t.teal, borderRadius:6, padding:'4px 8px', fontSize:14, fontWeight:800, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", minWidth:200 }}
                />
              ) : (
                <div
                  onClick={() => { setProgramNameDraft(program?.name || ''); setRenamingProgram(true) }}
                  title="Click to rename"
                  style={{ fontSize:14, fontWeight:800, cursor:'pointer', borderBottom:'1px dashed transparent' }}
                  onMouseEnter={e => (e.currentTarget.style.borderBottomColor = t.textMuted)}
                  onMouseLeave={e => (e.currentTarget.style.borderBottomColor = 'transparent')}>
                  {program?.name || 'Program'}
                </div>
              )}
              {program?.is_template
                ? <span style={{ background:t.orange+'18', border:'1px solid '+t.orange+'40', borderRadius:5, padding:'2px 8px', fontSize:9, fontWeight:900, color:t.orange, letterSpacing:'0.08em' }}>TEMPLATE</span>
                : <span style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:5, padding:'2px 8px', fontSize:9, fontWeight:900, color:t.teal, letterSpacing:'0.08em' }}>CLIENT</span>
              }
            </div>
            {program?.client?.profile?.full_name && <div style={{ fontSize:11, color:t.textMuted }}>{program.client.profile.full_name}</div>}
          </div>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', background:t.surfaceHigh, borderRadius:10, padding:3, gap:2 }}>
            {(['builder','calendar'] as const).map(v => (
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 14px', borderRadius:8, border:'none', background:view===v?t.teal:'transparent', color:view===v?'#000':t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s ease' }}>
                {v==='builder'?'🔧 Builder':'📅 Calendar'}
              </button>
            ))}
          </div>
          <button onClick={addWeek} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Week</button>
          {program?.client_id && (
            <button onClick={()=>{ setShowSend(true); setSendDone(false); setSendError('') }}
              style={{ background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:9, padding:'7px 16px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              📤 Send to Client
            </button>
          )}
        </div>

        {/* Week tabs */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border }}>
          <div style={{ padding:'0 24px', display:'flex', alignItems:'center', gap:6, overflowX:'auto', height:48 }}>
            {weeks.map((w,i) => {
              const isActive = activeWeek === w
              const color = WEEK_COLORS[i%8]
              return (
                <button key={w} onClick={()=>setActiveWeek(w)}
                  style={{ flexShrink:0, padding:'6px 16px', borderRadius:20, border:'1px solid '+(isActive?color+'60':t.border), background:isActive?color+'18':'transparent', color:isActive?color:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', transition:'all 0.15s ease' }}>
                  Week {w}
                </button>
              )
            })}
            {weeks.length === 0 && (
              <button onClick={addWeek} style={{ padding:'6px 16px', borderRadius:20, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>+ Add First Week</button>
            )}
          </div>
          {/* Week actions — shown below tabs, no overflow clipping */}
          {weeks.length > 0 && (
            <div style={{ padding:'0 24px 8px', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:t.textMuted, marginRight:4 }}>Week {activeWeek}:</span>
              <button onClick={()=>duplicateWeek(activeWeek)}
                style={{ padding:'3px 10px', borderRadius:8, border:'1px solid '+t.teal+'40', background:t.tealDim, color:t.teal, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:4 }}>
                📋 Duplicate
              </button>
              {totalWeeks > 1 && (
                <button onClick={()=>{ if (confirm(`Delete Week ${activeWeek} and all its exercises?`)) deleteWeek(activeWeek) }}
                  style={{ padding:'3px 10px', borderRadius:8, border:'1px solid '+t.red+'40', background:t.redDim, color:t.red, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:4 }}>
                  🗑 Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* BUILDER VIEW */}
        {view === 'builder' && (
          <div style={{ maxWidth:1200, margin:'0 auto', padding:'24px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(360px,1fr))', gap:16 }}>

              {blocksForWeek(activeWeek).map(block => {
                const exes = block.block_exercises || []
                const groupEntries = getGroups(exes)
                const namedGroups = groupEntries.filter(([k])=>k!=='__none__')
                const groupColorMap: Record<string,string> = {}
                namedGroups.forEach(([k],i) => { groupColorMap[k] = GROUP_COLORS[i % GROUP_COLORS.length] })
                const groupTypes: Record<string,string> = block.group_types || {}

                return (
                  <div key={block.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18 }}>

                    {/* Day header */}
                    <div style={{ background:t.surfaceUp, padding:'12px 16px', borderBottom:'1px solid '+t.border }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1 }}>
                          <input value={block.day_label || block.name}
                            onChange={e=>setBlocks(prev=>prev.map(b=>b.id===block.id?{...b,day_label:e.target.value,name:e.target.value}:b))}
                            onBlur={e=>updateBlock(block.id,'day_label',e.target.value)}
                            style={{ width:'100%', background:'transparent', border:'none', borderBottom:'1px solid transparent', fontSize:15, fontWeight:800, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                            onFocus={e=>e.target.style.borderBottomColor=t.teal+'60'}
                            onBlurCapture={e=>(e.target as HTMLInputElement).style.borderBottomColor='transparent'}
                          />
                          <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{exes.length} exercise{exes.length!==1?'s':''} · click to rename</div>
                        </div>
                        {saving===block.id && <span style={{ fontSize:10, color:t.teal }}>saving...</span>}
                        <button onClick={()=>saveBlockAsTemplate(block)}
                          title="Save to Workout Library"
                          style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:7, padding:'4px 10px', fontSize:11, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          📋 Save
                        </button>
                        <button onClick={()=>duplicateDay(block)}
                          title="Duplicate this day"
                          style={{ background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:7, padding:'4px 10px', fontSize:11, color:t.purple, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                          ⧉ Dupe
                        </button>
                        <button onClick={()=>deleteBlock(block.id)}
                          style={{ background:t.redDim, border:'1px solid '+t.red+'30', borderRadius:7, padding:'4px 10px', fontSize:11, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>✕</button>
                      </div>
                    </div>

                    {/* Exercise groups */}
                    <div style={{ padding:'12px 16px' }}>
                      {groupEntries.map(([groupKey, groupExes]) => {
                        const isNamed = groupKey !== '__none__'
                        const gc = groupColorMap[groupKey] || t.teal
                        const gType = groupTypes[groupKey] || 'straight'
                        const gTypeMeta = GROUP_TYPE_MAP[gType] || GROUP_TYPE_MAP['straight']

                        return (
                          <div key={groupKey} style={{ marginBottom: isNamed ? 16 : 8 }}>

                            {/* Group header with label + type selector */}
                            {isNamed && (
                              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                {/* Colored group label */}
                                <div style={{ background:gc+'18', border:'1px solid '+gc+'40', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:900, color:gc, letterSpacing:'0.08em', flexShrink:0 }}>
                                  {groupKey}
                                </div>
                                {/* Group type dropdown */}
                                <select
                                  value={gType}
                                  onChange={e => updateGroupType(block.id, groupKey, e.target.value)}
                                  style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:7, padding:'3px 8px', fontSize:11, fontWeight:700, color:t.textDim, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer', flex:1 }}>
                                  {GROUP_TYPES.map(gt => (
                                    <option key={gt.value} value={gt.value}>{gt.icon} {gt.label}</option>
                                  ))}
                                </select>
                                <div style={{ height:1, background:gc+'20', width:16, flexShrink:0 }} />
                              </div>
                            )}

                            {/* Exercises in group */}
                            <div style={{ paddingLeft: isNamed ? 10 : 0, borderLeft: isNamed ? '2px solid '+gc+'30' : 'none' }}>
                              {groupExes.map((ex:any) => {
                                const roleMeta = ROLE_COLORS[ex.exercise_role] || t.teal
                                return (
                                  <div key={ex.id} style={{ marginBottom: 10 }}>
                                    {ex.is_open_slot ? (
                                      // Open slot card
                                      <div style={{ background:t.yellow+'10', border:`1px dashed ${t.yellow}50`, borderRadius:12, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                                        <span style={{ fontSize:18, flexShrink:0 }}>🎲</span>
                                        <div style={{ flex:1, minWidth:0 }}>
                                          <div style={{ fontSize:12, fontWeight:800, color:t.yellow }}>Open Slot</div>
                                          <div style={{ fontSize:11, color:t.textMuted }}>{ex.slot_constraint || "Client's choice"} · {ex.sets}×{ex.reps}</div>
                                        </div>
                                        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                            <button onClick={()=>moveExercise(block.id, ex.id, -1)}
                                              style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▲</button>
                                            <button onClick={()=>moveExercise(block.id, ex.id, 1)}
                                              style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▼</button>
                                          </div>
                                          <button onClick={()=>deleteExercise(block.id, ex.id)}
                                            style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:12 }}>✕</button>
                                        </div>
                                      </div>
                                    ) : (
                                      // Normal exercise card
                                      <div>
                                        <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                                          <div style={{ paddingTop:2, flexShrink:0 }}>
                                            <span className="role-pill" style={{ background:roleMeta+'18', border:'1px solid '+roleMeta+'40', color:roleMeta }}>
                                              {ROLE_LABELS[ex.exercise_role] || ex.exercise_role}
                                            </span>
                                          </div>
                                          <div style={{ flex:1, minWidth:0 }}>
                                            <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{ex.exercise?.name || 'Exercise'}</div>
                                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                                              <button onClick={()=>setGroupingEx(groupingEx===ex.id?null:ex.id)}
                                                style={{ background: ex.superset_group ? groupColorMap[ex.superset_group]+'22' : t.surfaceHigh, border:'1px solid '+(ex.superset_group ? groupColorMap[ex.superset_group]+'60' : t.border), borderRadius:5, padding:'2px 8px', fontSize:10, fontWeight:800, color: ex.superset_group ? (groupColorMap[ex.superset_group]||t.teal) : t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", letterSpacing:'0.04em' }}>
                                                {ex.superset_group ? `Group ${ex.superset_group}` : '+ Group'}
                                              </button>
                                              {groupingEx === ex.id && (
                                                <input autoFocus
                                                  defaultValue={ex.superset_group || ''}
                                                  placeholder="A, B, C..."
                                                  onBlur={e => { updateExercise(ex.id, 'superset_group', e.target.value.trim()); setGroupingEx(null) }}
                                                  onKeyDown={e => { if (e.key==='Enter'||e.key==='Escape') { updateExercise(ex.id,'superset_group',(e.target as HTMLInputElement).value.trim()); setGroupingEx(null) }}}
                                                  style={{ width:60, background:t.surface, border:'1px solid '+t.teal+'60', borderRadius:5, padding:'2px 7px', fontSize:11, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}
                                                />
                                              )}
                                            </div>
                                            <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.6 }}>
                                              {ex.sets}×{ex.reps}
                                              {ex.target_weight ? <span style={{ color:t.text }}> @ {ex.target_weight}</span> : ''}
                                              {ex.rpe ? <span> · <span style={{ color:t.orange }}>RPE {ex.rpe}</span></span> : ''}
                                              {ex.tut ? <span> · TUT {ex.tut}</span> : ''}
                                              {ex.rest_seconds ? <span> · {ex.rest_seconds}s rest</span> : ''}
                                              {ex.progression_note ? <span style={{ color:t.green }}> · {ex.progression_note}</span> : ''}
                                            </div>
                                            {ex.notes && <div style={{ fontSize:10, color:t.textMuted, fontStyle:'italic', marginTop:2 }}>📝 {ex.notes}</div>}
                                          </div>
                                          <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                                            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                              <button onClick={()=>moveExercise(block.id, ex.id, -1)}
                                                style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▲</button>
                                              <button onClick={()=>moveExercise(block.id, ex.id, 1)}
                                                style={{ background:t.tealDim, border:`1px solid ${t.teal}40`, borderRadius:5, padding:'2px 6px', fontSize:12, color:t.teal, cursor:'pointer', lineHeight:1 }}>▼</button>
                                            </div>
                                            <button onClick={()=>setEditingEx(editingEx===ex.id?null:ex.id)}
                                              style={{ background:t.surfaceHigh, border:'none', borderRadius:6, padding:'4px 8px', fontSize:10, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                              {editingEx===ex.id?'done':'edit'}
                                            </button>
                                            <button onClick={()=>{ setSwapExId(ex.id); setShowAddEx(block.id); setExSearch(''); setAddExTab('exercise') }}
                                              style={{ background:t.orangeDim, border:`1px solid ${t.orange}40`, borderRadius:6, padding:'4px 8px', fontSize:10, color:t.orange, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                                              swap
                                            </button>
                                            <button onClick={()=>deleteExercise(block.id, ex.id)}
                                              style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:12 }}>✕</button>
                                          </div>
                                        </div>
                                        {editingEx===ex.id && (
                                          <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'12px', marginTop:8 }}>
                                            <div style={{ display:'flex', gap:4, marginBottom:8 }}>
                                              {(['reps','time'] as const).map(type => (
                                                <button key={type} onClick={()=>updateExercise(ex.id,'tracking_type',type)}
                                                  style={{ padding:'3px 10px', borderRadius:20, border:`1px solid ${(ex.tracking_type||'reps')===type?t.teal:t.border}`, background:(ex.tracking_type||'reps')===type?t.tealDim:'transparent', color:(ex.tracking_type||'reps')===type?t.teal:t.textMuted, cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>
                                                  {type==='reps'?'🔢 Reps':'⏱ Time'}
                                                </button>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                              {([
                                                ['Sets','sets','number'],
                                                (ex.tracking_type||'reps')==='time' ? ['Duration (sec)','duration_seconds','number'] : ['Reps','reps','text'],
                                                ['Weight','target_weight','text']
                                              ] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                                <div key={fld}>
                                                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                                  <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                    style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                                </div>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:8 }}>
                                              {([['RPE','rpe','text'],['TUT','tut','text'],['Rest (s)','rest_seconds','number']] as [string,string,string][]).map(([lbl,fld,typ])=>(
                                                <div key={fld}>
                                                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>{lbl}</div>
                                                  <input type={typ} defaultValue={ex[fld]||''} onBlur={e=>updateExercise(ex.id,fld,e.target.value)}
                                                    style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                                </div>
                                              ))}
                                            </div>
                                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                                              <div>
                                                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Role</div>
                                                <select defaultValue={ex.exercise_role||'main'} onChange={e=>updateExercise(ex.id,'exercise_role',e.target.value)}
                                                  style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                                                  {ROLE_OPTIONS.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                                                </select>
                                              </div>
                                              <div>
                                                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Group (A1, B2...)</div>
                                                <input type="text" defaultValue={ex.superset_group||''} onBlur={e=>updateExercise(ex.id,'superset_group',e.target.value)}
                                                  placeholder="e.g. A1, B2"
                                                  style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                              </div>
                                            </div>
                                            <div style={{ marginBottom:8 }}>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Progression Note</div>
                                              <input type="text" defaultValue={ex.progression_note||''} onBlur={e=>updateExercise(ex.id,'progression_note',e.target.value)}
                                                placeholder="e.g. +2.5kg/week, add 1 rep/session"
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                                            </div>
                                            <div>
                                              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Coach Notes</div>
                                              <textarea defaultValue={ex.notes||''} onBlur={e=>updateExercise(ex.id,'notes',e.target.value)} rows={2}
                                                placeholder="Cues, technique reminders..."
                                                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:7, padding:'6px 8px', fontSize:12, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'none', lineHeight:1.5 }} />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:6, marginTop:4 }}>
                        {[
                          { role:'warmup',   label:'🔥 Warm-Up',  color:t.teal   },
                          { role:'main',     label:'💪 Main',     color:t.orange  },
                          { role:'cooldown', label:'🧘 Cool-Down', color:t.purple },
                          { role:'finisher', label:'🔴 Finisher', color:t.red    },
                        ].map(({role, label, color}) => (
                          <button key={role} onClick={()=>openAddEx(block.id, role)}
                            style={{ padding:'9px 4px', borderRadius:10, border:`1px dashed ${color}50`, background:color+'12', color, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <button onClick={(e)=>{ e.stopPropagation(); setOpenSlotModal({blockId:block.id}); setSlotConstraint(''); setSlotRole('main'); setSlotTracking('reps'); setSlotSets('3'); setSlotReps('8-10'); setSlotDuration('20'); setSlotFilterType('none'); setSlotFilterValue('') }}
                        style={{ marginTop:6, width:'100%', padding:'8px 4px', borderRadius:10, border:`1px dashed ${t.yellow}50`, background:t.yellow+'10', color:t.yellow, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        🎲 + Open Slot (Client Chooses)
                      </button>
                    </div>
                  </div>
                )
              })}

              <button onClick={()=>openAddDay(activeWeek)}
                style={{ background:'transparent', border:'2px dashed '+t.border, borderRadius:18, padding:'32px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', flexDirection:'column' as any, alignItems:'center', gap:8, minHeight:120 }}>
                <span style={{ fontSize:28 }}>+</span>Add Day
              </button>
            </div>
          </div>
        )}

        {/* CALENDAR VIEW */}
        {view === 'calendar' && (
          <CalendarView
            blocks={blocks}
            weeks={weeks}
            programId={programId}
            supabase={supabase}
            onBlocksChange={setBlocks}
            onEditWeek={(w) => { setActiveWeek(w); setView('builder') }}
          />
        )}

        {/* Add / Swap Exercise Modal */}
        {showAddEx && (
          <div onClick={()=>{ setShowAddEx(null); setSwapExId(null) }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:520, padding:24, maxHeight:'85vh', display:'flex', flexDirection:'column' as any }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div>
                  <div style={{ fontSize:15, fontWeight:800 }}>{swapExId ? '🔄 Swap Exercise' : 'Add Exercise'}</div>
                  {!swapExId && <div style={{ fontSize:11, fontWeight:700, marginTop:2,
                    color: pendingRole==='warmup' ? t.teal : pendingRole==='cooldown' ? t.purple : t.orange }}>
                    {pendingRole==='warmup' ? '🔥 Warm-Up' : pendingRole==='cooldown' ? '🧘 Cool-Down' : '💪 Main Workout'}
                  </div>}
                  {swapExId && <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Pick a replacement — all sets and settings are kept</div>}
                </div>
                <span onClick={()=>{ setShowAddEx(null); setSwapExId(null) }} style={{ cursor:'pointer', color:t.textMuted, fontSize:22 }}>×</span>
              </div>

              {/* Tab switcher */}
              <div style={{ display:'flex', background:t.surfaceHigh, borderRadius:10, padding:3, gap:2, marginBottom:16 }}>
                {([['exercise','🏋️ Exercise Library'],['template','💪 From Workout Library'],['create','✏️ Create New']] as const).map(([id,label])=>(
                  <button key={id} onClick={()=>{ setAddExTab(id); if(id==='create') { setNewExName(exSearch); setNewExImageFile(null) } }}
                    style={{ flex:1, padding:'7px', borderRadius:8, border:'none', background:addExTab===id?t.teal:'transparent', color:addExTab===id?'#000':t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Exercise Library tab */}
              {addExTab === 'exercise' && (
                <>
                  <input value={exSearch} onChange={e=>setExSearch(e.target.value)} placeholder="Search exercises..." autoFocus
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", marginBottom:6 }} />
                  {/* Filters — 3 scrollable rows in a compact block */}
                  <div style={{marginBottom:8,display:'flex',flexDirection:'column' as const,gap:3}}>
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
                  <div style={{ overflowY:'auto', flex:1 }}>
                    {filteredExercises.length === 0 && <div style={{ textAlign:'center', padding:'24px', color:t.textMuted, fontSize:13 }}>No exercises found. Visit 🏋️ Exercises to add some.</div>}
                    {filteredExercises.map(ex => (
                      <div key={ex.id} onClick={()=> swapExId ? swapExercise(swapExId, ex.id) : addExercise(showAddEx, ex.id)}
                        style={{ padding:'10px 12px', borderRadius:10, cursor:'pointer', marginBottom:4, display:'flex', alignItems:'center', gap:10 }}
                        onMouseEnter={e=>(e.currentTarget.style.background=t.surfaceUp)}
                        onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700 }}>{ex.name}</div>
                          {ex.muscles?.length > 0 && <div style={{ fontSize:11, color:t.textMuted }}>{ex.muscles.join(', ')}</div>}
                        </div>
                        <div style={{ fontSize:11, color: swapExId ? t.orange : t.teal, fontWeight:700 }}>{swapExId ? '⇄ Swap' : '+ Add'}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Create New Exercise tab */}
              {addExTab === 'create' && (
                <div style={{ display:'flex', flexDirection:'column' as const, gap:14, overflowY:'auto', flex:1 }}>
                  <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5 }}>
                    Name is required. Fill in the rest later from the exercise library.
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Name *</label>
                    <input value={newExName} onChange={e=>setNewExName(e.target.value)}
                      placeholder="e.g. Half Kneeling Pallof Press" autoFocus
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Equipment</label>
                    <select value={newExEquipment} onChange={e=>setNewExEquipment(e.target.value)}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
                      <option value="">none / unspecified</option>
                      {['barbell','bodyweight','cable','dumbbell','ez bar','kettlebell','machine','mat','pull-up bar','resistance band','smith machine','trap bar'].map(eq=>(
                        <option key={eq} value={eq}>{eq.charAt(0).toUpperCase()+eq.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Primary Muscle</label>
                    <select value={newExMuscle} onChange={e=>setNewExMuscle(e.target.value)}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
                      <option value="">select</option>
                      {muscleGroups.map(g=>(<option key={g} value={g}>{g}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>Movement Pattern</label>
                    <select value={newExMovement} onChange={e=>setNewExMovement(e.target.value)}
                      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer' }}>
                      <option value="">select</option>
                      {movementPatterns.map(m=>(<option key={m} value={m} style={{textTransform:'capitalize'}}>{m}</option>))}
                    </select>
                  </div>
                  {/* Optional demo image / GIF — used when no video exists */}
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', display:'block', marginBottom:5 }}>
                      Demo Image / GIF (optional)
                    </label>
                    <label style={{ display:'block', cursor:'pointer' }}>
                      <input type="file" accept="image/*,image/gif" style={{ display:'none' }}
                        onChange={e => setNewExImageFile(e.target.files?.[0] || null)} />
                      <div style={{
                        background:t.surfaceUp, border:'1px dashed '+t.border, borderRadius:10,
                        padding:'10px 13px', fontSize:13, color: newExImageFile ? t.text : t.textMuted,
                        textAlign:'center' as const,
                      }}>
                        {newExImageFile ? `✓ ${newExImageFile.name}` : '🖼️ Choose image or GIF'}
                      </div>
                    </label>
                    {newExImageFile && (
                      <button onClick={()=>setNewExImageFile(null)}
                        style={{ marginTop:5, background:'none', border:'none', color:t.textMuted, fontSize:11, cursor:'pointer', textDecoration:'underline' }}>
                        remove
                      </button>
                    )}
                  </div>
                  <button
                    disabled={!newExName.trim() || newExSaving}
                    onClick={async () => {
                      if (!newExName.trim()) return
                      setNewExSaving(true)
                      const { data: created, error } = await supabase.from('exercises').insert({
                        coach_id: program?.coach_id,
                        name: newExName.trim(),
                        muscles: newExMuscle ? [newExMuscle] : [],
                        ...(newExEquipment && { equipment: newExEquipment }),
                        ...(newExMovement  && { movement_pattern: newExMovement }),
                      }).select('id, name').single()
                      if (error) { alert('Could not create: ' + error.message); setNewExSaving(false); return }
                      // Optional image/GIF upload — stored in same bucket as videos under <id>/image.<ext>
                      if (created && newExImageFile) {
                        const ext = newExImageFile.name.split('.').pop()
                        const path = `${created.id}/image.${ext}`
                        const { error: upErr } = await supabase.storage.from('exercise-videos')
                          .upload(path, newExImageFile, { upsert: true, contentType: newExImageFile.type })
                        if (!upErr) {
                          const { data: { publicUrl } } = supabase.storage.from('exercise-videos').getPublicUrl(path)
                          await supabase.from('exercises').update({ image_url: publicUrl }).eq('id', created.id)
                        }
                      }
                      // Reload exercises so the new one appears in search.
                      const [{ data: p1 }, { data: p2 }] = await Promise.all([
                        supabase.from('exercises').select('*').order('name').range(0, 999),
                        supabase.from('exercises').select('*').order('name').range(1000, 1999),
                      ])
                      setExercises([...(p1 || []), ...(p2 || [])])
                      setNewExName(''); setNewExEquipment(''); setNewExMuscle(''); setNewExMovement('')
                      setNewExImageFile(null)
                      setNewExSaving(false)
                      // Switch to library with new name pre-filled so coach can add immediately.
                      setExSearch(created?.name || '')
                      setAddExTab('exercise')
                    }}
                    style={{ width:'100%', padding:'12px', borderRadius:11, border:'none',
                      background: newExName.trim() ? 'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)' : t.surfaceHigh,
                      color: newExName.trim() ? '#000' : t.textMuted,
                      fontSize:14, fontWeight:800, cursor: newExName.trim() ? 'pointer' : 'not-allowed',
                      fontFamily:"'DM Sans',sans-serif" }}>
                    {newExSaving ? 'Creating...' : '+ Create Exercise'}
                  </button>
                </div>
              )}

              {/* Workout Library tab */}
              {addExTab === 'template' && (
                <div style={{ overflowY:'auto', flex:1 }}>
                  {tmplLoading ? (
                    <div style={{ textAlign:'center', padding:32, color:t.textMuted, fontSize:13 }}>Loading workout library...</div>
                  ) : templates.length === 0 ? (
                    <div style={{ textAlign:'center', padding:32, color:t.textMuted, fontSize:13 }}>
                      No workouts in your library yet.<br/>
                      <span style={{ color:t.teal }}>Build some in 💪 Workouts first.</span>
                    </div>
                  ) : templates.map(tmpl => {
                    const exCount = tmpl.workout_template_exercises?.length || 0
                    const preview = (tmpl.workout_template_exercises || [])
                      .sort((a:any,b:any)=>a.order_index-b.order_index).slice(0,3)
                    return (
                      <div key={tmpl.id} onClick={()=>importTemplateIntoBlock(showAddEx!, tmpl)}
                        style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', marginBottom:8, cursor:'pointer', transition:'border-color 0.15s' }}
                        onMouseEnter={e=>(e.currentTarget.style.borderColor=t.teal+'60')}
                        onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                          <div style={{ fontWeight:700, fontSize:13 }}>{tmpl.title}</div>
                          <span style={{ fontSize:10, fontWeight:700, color:t.teal, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:20, padding:'2px 8px', flexShrink:0 }}>
                            Import {exCount} exercise{exCount!==1?'s':''}
                          </span>
                        </div>
                        <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const, marginBottom:6 }}>
                          <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>{tmpl.category}</span>
                          <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>{tmpl.difficulty}</span>
                          {tmpl.estimated_minutes && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>⏱ {tmpl.estimated_minutes}m</span>}
                        </div>
                        {preview.map((ex:any,i:number) => (
                          <div key={i} style={{ fontSize:11, color:t.textDim, display:'flex', gap:6, marginBottom:2 }}>
                            <span style={{ color:t.teal, fontWeight:700, minWidth:14 }}>{i+1}.</span>
                            <span>{ex.exercise_name}</span>
                            <span style={{ color:t.textMuted }}>{ex.sets_prescribed}×{ex.reps_prescribed}</span>
                          </div>
                        ))}
                        {exCount > 3 && <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>+{exCount-3} more exercises</div>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Send to Client Modal */}
        {showSend && (
          <div onClick={()=>setShowSend(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:440, padding:28 }}>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>📤 Send to Client</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:20, lineHeight:1.6 }}>
                Creates a <strong style={{ color:t.text }}>workout session</strong> for each scheduled day in the program calendar.
                {program?.client?.profile?.full_name && <> Sending to <strong style={{ color:t.teal }}>{program.client.profile.full_name}</strong>.</>}
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:6 }}>
                  Program Start Date
                </label>
                <input type="date" value={sendStartDate} onChange={e=>setSendStartDate(e.target.value)}
                  style={{ width:'100%', background:'#161624', border:'1px solid '+t.border, borderRadius:10, padding:'11px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }} />
                <div style={{ fontSize:11, color:t.textMuted, marginTop:6 }}>Week 1 starts on the Monday of this date's week.</div>
              </div>

              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', display:'block', marginBottom:8 }}>
                  If sessions already exist
                </label>
                <div style={{ display:'flex', gap:8 }}>
                  {([['add','➕ Add on top','Keep existing sessions and add these'],['replace','🔄 Replace assigned','Remove existing assigned sessions first']] as const).map(([val,label,desc])=>(
                    <div key={val} onClick={()=>setSendMode(val)}
                      style={{ flex:1, padding:'12px', borderRadius:12, border:'1px solid '+(sendMode===val?t.teal:t.border), background:sendMode===val?t.tealDim:'transparent', cursor:'pointer', transition:'all .15s' }}>
                      <div style={{ fontSize:12, fontWeight:700, color:sendMode===val?t.teal:t.text, marginBottom:3 }}>{label}</div>
                      <div style={{ fontSize:10, color:t.textMuted, lineHeight:1.4 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {sendError && (
                <div style={{ background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#ef4444', marginBottom:14 }}>{sendError}</div>
              )}

              <div style={{ display:'flex', gap:10 }}>
                <button onClick={()=>setShowSend(false)} style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={sendToClient} disabled={sending||sendDone}
                  style={{ flex:2, background:sendDone?t.green:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:sending||sendDone?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:sending?0.7:1, transition:'background .3s' }}>
                  {sendDone ? '✓ Sessions Created!' : sending ? 'Sending...' : '📤 Send Workouts'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Day Modal — blank or from template */}
        {showAddDay !== null && (
          <div onClick={()=>setShowAddDay(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:520, padding:24, maxHeight:'85vh', display:'flex', flexDirection:'column' as any }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                <div style={{ fontSize:15, fontWeight:800 }}>Add Day — Week {showAddDay}</div>
                <span onClick={()=>setShowAddDay(null)} style={{ cursor:'pointer', color:t.textMuted, fontSize:22 }}>×</span>
              </div>

              {/* Blank day button */}
              <button onClick={async ()=>{ await addDay(showAddDay!); setShowAddDay(null) }}
                style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'14px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif" }}>
                <div style={{ width:40, height:40, borderRadius:10, background:t.tealDim, border:`1px solid ${t.teal}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>➕</div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:t.text }}>Blank Day</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>Start with an empty day and add exercises manually</div>
                </div>
              </button>

              <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Or pick from Workout Library</div>

              <div style={{ overflowY:'auto', flex:1 }}>
                {addDayTmplLoading ? (
                  <div style={{ textAlign:'center', padding:32, color:t.textMuted, fontSize:13 }}>Loading...</div>
                ) : addDayTemplates.length === 0 ? (
                  <div style={{ textAlign:'center', padding:32, color:t.textMuted, fontSize:13 }}>
                    No workouts in your library yet.<br/>
                    <span style={{ color:t.teal }}>Build some in 💪 Workouts first.</span>
                  </div>
                ) : addDayTemplates.map(tmpl => {
                  const exCount = tmpl.workout_template_exercises?.length || 0
                  const preview = (tmpl.workout_template_exercises || [])
                    .sort((a:any,b:any)=>a.order_index-b.order_index).slice(0,4)
                  return (
                    <div key={tmpl.id} onClick={()=>addDayFromTemplate(showAddDay!, tmpl)}
                      style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', marginBottom:8, cursor:'pointer', transition:'border-color 0.15s' }}
                      onMouseEnter={e=>(e.currentTarget.style.borderColor=t.orange+'60')}
                      onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{tmpl.title}</div>
                        <span style={{ fontSize:10, fontWeight:700, color:t.orange, background:t.orangeDim, border:'1px solid '+t.orange+'30', borderRadius:20, padding:'2px 8px', flexShrink:0 }}>
                          {exCount} exercise{exCount!==1?'s':''}
                        </span>
                      </div>
                      <div style={{ display:'flex', gap:4, flexWrap:'wrap' as const, marginBottom:6 }}>
                        <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>{tmpl.category}</span>
                        <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>{tmpl.difficulty}</span>
                        {tmpl.estimated_minutes && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:20, background:t.surfaceHigh, color:t.textMuted }}>⏱ {tmpl.estimated_minutes}m</span>}
                      </div>
                      {preview.map((ex:any,i:number) => (
                        <div key={i} style={{ fontSize:11, color:t.textDim, display:'flex', gap:6, marginBottom:2 }}>
                          <span style={{ color:t.orange, fontWeight:700, minWidth:14 }}>{i+1}.</span>
                          <span>{ex.exercise_name}</span>
                          <span style={{ color:t.textMuted }}>{ex.sets_prescribed}×{ex.reps_prescribed}</span>
                        </div>
                      ))}
                      {exCount > 4 && <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>+{exCount-4} more</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}

      </div>

      {saving && (
        <div style={{ position:'fixed', bottom:20, right:20, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.teal, zIndex:100 }}>
          Saving...
        </div>
      )}

      {/* Open Slot Modal */}
      {openSlotModal && (
        <>
          <div onClick={()=>{ setOpenSlotModal(null); setSlotConstraint(''); setSlotFilterType('none'); setSlotFilterValue('') }} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:300 }}/>
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'92%', maxWidth:420, zIndex:301, fontFamily:"'DM Sans',sans-serif", maxHeight:'90vh', overflowY:'auto' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:16 }}>🎲 Add Open Slot</div>

            {/* Label */}
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Label (what client sees)</div>
              <input autoFocus value={slotConstraint} onChange={e=>setSlotConstraint(e.target.value)}
                placeholder="e.g. Chest Exercise, Cardio of Choice, Pull Movement..."
                style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const, colorScheme:'dark' }}/>
            </div>

            {/* Filter type */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Filter Library By</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:5 }}>
                {([['none','🎯 All'],['muscle','💪 Muscle'],['movement','🔄 Movement'],['equipment','🏋️ Equipment']] as const).map(([type, label]) => (
                  <button key={type} onClick={()=>{ setSlotFilterType(type as any); setSlotFilterValue('') }}
                    style={{ padding:'7px 4px', borderRadius:8, border:`1px solid ${slotFilterType===type?t.teal:t.border}`, background:slotFilterType===type?t.tealDim:'transparent', color:slotFilterType===type?t.teal:t.textMuted, fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'center' as const }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Filter value picker */}
            {slotFilterType !== 'none' && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>
                  {slotFilterType === 'muscle' ? 'Muscle Group' : slotFilterType === 'movement' ? 'Movement Pattern' : 'Equipment'}
                </div>
                <select value={slotFilterValue} onChange={e=>setSlotFilterValue(e.target.value)}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.teal+'60', borderRadius:9, padding:'9px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}>
                  <option value="">-- Pick one --</option>
                  {slotFilterType === 'muscle' && (<>
                    <option key="Abductors" value="Abductors">Abductors</option>
                    <option key="Adductors" value="Adductors">Adductors</option>
                    <option key="Biceps" value="Biceps">Biceps</option>
                    <option key="Calves" value="Calves">Calves</option>
                    <option key="Cardio" value="Cardio">Cardio</option>
                    <option key="Chest" value="Chest">Chest</option>
                    <option key="Core" value="Core">Core</option>
                    <option key="Forearms" value="Forearms">Forearms</option>
                    <option key="Full Body" value="Full Body">Full Body</option>
                    <option key="Glutes" value="Glutes">Glutes</option>
                    <option key="Hamstrings" value="Hamstrings">Hamstrings</option>
                    <option key="Hip Flexors" value="Hip Flexors">Hip Flexors</option>
                    <option key="Lats" value="Lats">Lats</option>
                    <option key="Lower Back" value="Lower Back">Lower Back</option>
                    <option key="Obliques" value="Obliques">Obliques</option>
                    <option key="Quads" value="Quads">Quads</option>
                    <option key="Rear Delts" value="Rear Delts">Rear Delts</option>
                    <option key="Shoulders" value="Shoulders">Shoulders</option>
                    <option key="Traps" value="Traps">Traps</option>
                    <option key="Triceps" value="Triceps">Triceps</option>
                  </>)}
                  {slotFilterType === 'movement' && (<>
                    <option key="carry" value="carry">Carry</option>
                    <option key="core" value="core">Core</option>
                    <option key="hinge" value="hinge">Hinge</option>
                    <option key="isolation" value="isolation">Isolation</option>
                    <option key="pull" value="pull">Pull</option>
                    <option key="push" value="push">Push</option>
                    <option key="squat" value="squat">Squat</option>
                    <option key="stretch" value="stretch">Stretch</option>
                    <option key="yoga" value="yoga">Yoga</option>
                    <option key="general" value="general">General</option>
                  </>)}
                  {slotFilterType === 'equipment' && (<>
                    <option key="barbell" value="barbell">Barbell</option>
                    <option key="bodyweight" value="bodyweight">Bodyweight</option>
                    <option key="cable" value="cable">Cable</option>
                    <option key="dumbbell" value="dumbbell">Dumbbell</option>
                    <option key="ez bar" value="ez bar">Ez Bar</option>
                    <option key="kettlebell" value="kettlebell">Kettlebell</option>
                    <option key="machine" value="machine">Machine</option>
                    <option key="mat" value="mat">Mat</option>
                    <option key="pull-up bar" value="pull-up bar">Pull-Up Bar</option>
                    <option key="resistance band" value="resistance band">Resistance Band</option>
                    <option key="smith machine" value="smith machine">Smith Machine</option>
                    <option key="trap bar" value="trap bar">Trap Bar</option>
                  </>)}
                </select>
              </div>
            )}

            {/* Format */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Format</div>
              <div style={{ display:'flex', gap:6, marginBottom:8 }}>
                {(['reps','time'] as const).map(type => (
                  <button key={type} onClick={()=>setSlotTracking(type)}
                    style={{ flex:1, padding:'7px', borderRadius:8, border:`1px solid ${slotTracking===type?t.teal+'60':t.border}`, background:slotTracking===type?t.tealDim:'transparent', color:slotTracking===type?t.teal:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {type === 'reps' ? '🔢 Sets & Reps' : '⏱ Sets & Time'}
                  </button>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <div>
                  <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Sets</div>
                  <input type="number" value={slotSets} onChange={e=>setSlotSets(e.target.value)} min="1" max="10"
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                </div>
                {slotTracking === 'reps' ? (
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Reps</div>
                    <input value={slotReps} onChange={e=>setSlotReps(e.target.value)} placeholder="e.g. 8-10"
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                  </div>
                ) : (
                  <div>
                    <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, marginBottom:4 }}>Duration (min)</div>
                    <input type="number" value={slotDuration} onChange={e=>setSlotDuration(e.target.value)} min="1"
                      style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' as const }}/>
                  </div>
                )}
              </div>
            </div>

            {/* Role */}
            <div style={{ marginBottom:18 }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:5 }}>Role</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' as const }}>
                {([['warmup','🔥 Warm-Up',t.teal],['main','💪 Main',t.orange],['cooldown','🧘 Cool-Down',t.purple],['finisher','🔴 Finisher',t.red]] as const).map(([role,label,color])=>(
                  <button key={role} onClick={()=>setSlotRole(role as string)}
                    style={{ padding:'6px 11px', borderRadius:8, border:`1px solid ${slotRole===role?color:t.border}`, background:slotRole===role?color+'18':'transparent', color:slotRole===role?color:t.textMuted, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={()=>{ setOpenSlotModal(null); setSlotConstraint(''); setSlotFilterType('none'); setSlotFilterValue('') }}
                style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
              <button
                onClick={()=>addOpenSlot(openSlotModal.blockId, slotConstraint, slotRole)}
                disabled={slotFilterType !== 'none' && !slotFilterValue}
                style={{ flex:2, background:slotFilterType !== 'none' && !slotFilterValue ? t.surfaceHigh : `linear-gradient(135deg,${t.yellow},${t.yellow}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:slotFilterType !== 'none' && !slotFilterValue ? t.textMuted : '#000', cursor:slotFilterType !== 'none' && !slotFilterValue ? 'default' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                🎲 Add Open Slot
              </button>
            </div>
          </div>
        </>
      )}

    </>
  )
}


// ── CalendarView ─────────────────────────────────────────────────────────
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function CalendarView({ blocks, weeks, programId, supabase, onBlocksChange, onEditWeek }: {
  blocks: any[], weeks: number[], programId: string, supabase: any,
  onBlocksChange: (b: any[]) => void, onEditWeek: (w: number) => void
}) {
  const [activeWeek, setActiveWeek] = useState(weeks[0] || 1)
  const [assigning, setAssigning] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)

  const weekBlocks = blocks.filter(b => b.week_number === activeWeek)
  const scheduled = weekBlocks.filter(b => b.day_of_week)
  const unscheduled = weekBlocks.filter(b => !b.day_of_week)
  const blocksForDay = (day: string) => scheduled.filter(b => b.day_of_week === day).sort((a,b) => a.order_index - b.order_index)
  const exCount = (block: any) => (block.block_exercises || []).length

  const assignDay = async (blockId: string, day: string | null) => {
    setSaving(true)
    await supabase.from('workout_blocks').update({ day_of_week: day }).eq('id', blockId)
    onBlocksChange(blocks.map(b => b.id === blockId ? { ...b, day_of_week: day } : b))
    setAssigning(null)
    setSaving(false)
  }

  return (
    <div style={{ maxWidth:1200, margin:'0 auto', padding:24, fontFamily:"'DM Sans',sans-serif" }}>

      {/* Week selector */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, flexWrap:'wrap' as const }}>
        <span style={{ fontSize:12, fontWeight:700, color:t.textMuted }}>Week:</span>
        {weeks.map((w,i) => (
          <button key={w} onClick={()=>setActiveWeek(w)}
            style={{ padding:'5px 14px', borderRadius:20, border:'1px solid '+(activeWeek===w?WEEK_COLORS[i%8]+'60':t.border), background:activeWeek===w?WEEK_COLORS[i%8]+'18':'transparent', color:activeWeek===w?WEEK_COLORS[i%8]:t.textMuted, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s' }}>
            Week {w}
          </button>
        ))}
        <button onClick={()=>onEditWeek(activeWeek)}
          style={{ marginLeft:'auto', padding:'5px 14px', borderRadius:20, border:'1px solid '+t.border, background:'transparent', color:t.textDim, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
          ✏️ Edit in Builder
        </button>
      </div>

      {/* 7-column grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:8, marginBottom:16 }}>
        {DAYS.map(day => (
          <div key={day} style={{ textAlign:'center', padding:'8px 4px', fontSize:12, fontWeight:800, color:t.textMuted, background:t.surface, border:'1px solid '+t.border, borderRadius:10 }}>
            {day}
          </div>
        ))}
        {DAYS.map(day => {
          const dayBlocks = blocksForDay(day)
          const isTarget = assigning !== null
          return (
            <div key={day}
              onClick={() => { if (assigning) assignDay(assigning, day) }}
              style={{ minHeight:120, background: isTarget ? t.tealDim : t.surface, border:'1px solid '+(isTarget?t.teal+'60':t.border), borderRadius:10, padding:'8px', cursor:isTarget?'pointer':'default', transition:'all 0.15s' }}>
              {dayBlocks.length === 0 && isTarget && (
                <div style={{ height:'100%', minHeight:80, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, color:t.teal, fontWeight:700 }}>
                  + Drop here
                </div>
              )}
              {dayBlocks.map(block => (
                <div key={block.id} style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'8px 10px', marginBottom:6, position:'relative' as const }}>
                  <div style={{ fontSize:11, fontWeight:800, color:t.teal, marginBottom:3, paddingRight:16 }}>{block.day_label || block.name}</div>
                  <div style={{ fontSize:10, color:t.textMuted, marginBottom:4 }}>{exCount(block)} exercise{exCount(block)!==1?'s':''}</div>
                  {(block.block_exercises||[]).slice(0,3).map((ex:any,i:number) => (
                    <div key={i} style={{ fontSize:10, color:t.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:1 }}>
                      {i+1}. {ex.exercise?.name}
                    </div>
                  ))}
                  {exCount(block) > 3 && <div style={{ fontSize:9, color:t.textMuted, marginTop:2 }}>+{exCount(block)-3} more</div>}
                  <button onClick={e=>{ e.stopPropagation(); assignDay(block.id, null) }}
                    style={{ position:'absolute', top:5, right:6, background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:11, lineHeight:1, padding:2 }} title="Remove">✕</button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Assign prompt banner */}
      {assigning && (
        <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:t.teal, flex:1 }}>
            📅 Click a day above to schedule "{blocks.find(b=>b.id===assigning)?.day_label || 'workout'}"
          </span>
          <button onClick={()=>setAssigning(null)} style={{ background:'none', border:'1px solid '+t.teal+'40', borderRadius:8, padding:'4px 12px', color:t.teal, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Unscheduled tray */}
      <div>
        <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>
          Unscheduled — Week {activeWeek} ({unscheduled.length})
        </div>
        {unscheduled.length === 0 ? (
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'20px', textAlign:'center' }}>
            <div style={{ fontSize:20, marginBottom:6 }}>✅</div>
            <div style={{ fontSize:13, color:t.textMuted }}>All workouts scheduled for Week {activeWeek}!</div>
          </div>
        ) : (
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' as const }}>
            {unscheduled.map(block => (
              <div key={block.id}
                onClick={() => setAssigning(assigning===block.id ? null : block.id)}
                style={{ background:assigning===block.id?t.tealDim:t.surface, border:'1px solid '+(assigning===block.id?t.teal:t.border), borderRadius:12, padding:'12px 16px', cursor:'pointer', minWidth:160, transition:'all 0.15s' }}>
                <div style={{ fontSize:13, fontWeight:800, color:assigning===block.id?t.teal:t.text, marginBottom:3 }}>{block.day_label || block.name}</div>
                <div style={{ fontSize:11, color:t.textMuted, marginBottom:6 }}>{exCount(block)} exercise{exCount(block)!==1?'s':''}</div>
                <div style={{ fontSize:11, fontWeight:700, color:assigning===block.id?t.teal:t.textDim }}>
                  {assigning===block.id ? '↑ Click a day above' : '📅 Schedule'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
