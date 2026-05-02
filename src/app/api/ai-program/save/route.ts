import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// =================================================================
// AI Program Save (F2a Phase 2) — coach-only.
//
// Materializes a proposal from /api/ai-program/build into real DB
// rows: programs → workout_blocks → block_exercises. Mirrors the
// existing createFromTemplate pattern in the client detail page.
//
// Exercise-name resolution: the build endpoint deliberately does NOT
// pass the 1,163-row exercise library to the LLM (token bloat). We
// resolve names here, server-side: exact-icase match first, then
// ILIKE prefix. Unmatched names land with exercise_id=null and the
// proposed name in `notes` so the coach can swap them in the program
// editor without losing the prescription.
//
// Day-of-week normalization: AI may return 'Mon', 'Monday', or
// 'monday'. workout_blocks.day_of_week is free text but we normalize
// to short form for consistency with existing rows.
// =================================================================

type ProposalExercise = {
  name: string
  category?: string
  sets: number
  reps: string | number
  load_guidance?: string
  rest_seconds?: number
  tempo?: string | null
  rationale?: string
}

type ProposalDay = {
  day: string
  label?: string
  estimated_minutes?: number
  exercises?: ProposalExercise[]
}

type ProposalWeek = {
  week: number
  phase?: string
  focus?: string
  deload?: boolean
  days?: ProposalDay[]
}

type Proposal = {
  name?: string
  rationale?: string
  weekly_split?: string
  weeks?: ProposalWeek[]
  coach_notes?: string
}

const DAY_MAP: Record<string, string> = {
  mon: 'Mon', monday: 'Mon',
  tue: 'Tue', tues: 'Tue', tuesday: 'Tue',
  wed: 'Wed', weds: 'Wed', wednesday: 'Wed',
  thu: 'Thu', thur: 'Thu', thurs: 'Thu', thursday: 'Thu',
  fri: 'Fri', friday: 'Fri',
  sat: 'Sat', saturday: 'Sat',
  sun: 'Sun', sunday: 'Sun',
}
const normalizeDay = (d?: string): string => {
  if (!d) return ''
  const key = d.trim().toLowerCase()
  return DAY_MAP[key] || d.trim()
}

// Normalize "8-10" / "5x3" / "30s" / 10 → text Postgres expects.
const repsToText = (reps: ProposalExercise['reps']): string => {
  if (typeof reps === 'number') return String(reps)
  return String(reps || '').trim() || '—'
}

// Build a search-friendly key for fuzzy match
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { clientId, programName, proposal, meta } = (body || {}) as { clientId?: string, programName?: string, proposal?: Proposal, meta?: any }
  if (!clientId)  return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (!proposal || !Array.isArray(proposal.weeks) || proposal.weeks.length === 0) {
    return NextResponse.json({ error: 'proposal.weeks required and must be non-empty' }, { status: 400 })
  }

  // Coach ownership gate
  const { data: client } = await supabase
    .from('clients').select('id, coach_id').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  // ── Exercise-name resolution ─────────────────────────────────────────
  // Pull library once (system + this coach's custom). Build three layers:
  //   1. exact-icase  — fastest, perfect format match
  //   2. slug-equal   — punctuation/whitespace tolerant
  //   3. token overlap (Jaccard + containment) — bridges naming-convention
  //      gaps. The library uses "Movement [Variation] - Equipment" format
  //      ("Bench Press - Dumbbell"), but the AI may emit "Dumbbell Bench
  //      Press". The exact + slug lookups can't bridge that — token
  //      scoring can.
  //
  // Why this matters: before token scoring, the AI's program proposals
  // landed with exercise_id=null on every row, which the program editor
  // renders as empty cards. Coaches saw "the save canceled out".
  const { data: library } = await supabase
    .from('exercises')
    .select('id, name')
    .eq('is_active', true)
    .or(`is_system.eq.true,coach_id.eq.${user.id}`)

  const byExact = new Map<string, string>()
  const bySlug = new Map<string, string>()
  // Pre-tokenized library for the fuzzy fallback. Avoids retokenizing 1163
  // entries per proposal lookup (a 12-week × 4-day program does ~336
  // lookups; pre-tokenize once).
  const tokenized: Array<{ id: string; tokens: Set<string> }> = []

  // Tiny stopword list — keep equipment/modifier words like "barbell",
  // "front", "single" since they carry meaning.
  const STOPWORDS = new Set(['the', 'a', 'an', 'with', 'and', 'or', 'of', 'to', 'on', 'for'])
  const tokenize = (s: string): Set<string> =>
    new Set(
      s.toLowerCase()
        .replace(/[^a-z0-9 ]/g, ' ')   // strip hyphens, parens, etc → spaces
        .split(/\s+/)
        .filter(t => t.length >= 2 && !STOPWORDS.has(t))
    )

  for (const ex of library || []) {
    if (!ex?.name || !ex?.id) continue
    byExact.set(ex.name.toLowerCase(), ex.id)
    bySlug.set(slugify(ex.name), ex.id)
    tokenized.push({ id: ex.id, tokens: tokenize(ex.name) })
  }

  const resolveExerciseId = (name: string): string | null => {
    if (!name) return null
    const lc = name.toLowerCase()
    if (byExact.has(lc)) return byExact.get(lc)!
    const slug = slugify(name)
    if (bySlug.has(slug)) return bySlug.get(slug)!

    // Token-overlap scoring across the whole library. Combined score is
    // average of containment (how much of the proposal lives in the lib
    // entry) and Jaccard (overall overlap). Containment helps short
    // proposals like "Romanian Deadlift" match "Romanian Deadlift -
    // Barbell"; Jaccard breaks ties between similar entries.
    const proposalTokens = tokenize(name)
    if (proposalTokens.size === 0) return null
    let best = { id: null as string | null, score: 0 }
    for (const lib of tokenized) {
      if (lib.tokens.size === 0) continue
      let inter = 0
      for (const t of proposalTokens) if (lib.tokens.has(t)) inter++
      if (inter === 0) continue
      const containment = inter / proposalTokens.size
      const jaccard = inter / (proposalTokens.size + lib.tokens.size - inter)
      const score = (containment + jaccard) / 2
      if (score > best.score) best = { id: lib.id, score }
    }
    // 0.5 threshold catches "Banded Face Pull" → "Face Pull - Resistance
    // Band" (score ~0.54) without false-matching unrelated movements.
    return best.score >= 0.5 ? best.id : null
  }

  // ── Insert program row ───────────────────────────────────────────────
  const finalName = (programName || proposal.name || `AI Program — ${new Date().toLocaleDateString()}`).slice(0, 200)
  const durationWeeks = meta?.duration_weeks || proposal.weeks.length
  const goal = meta?.focus ? String(meta.focus).replace('_', ' ') : null

  const { data: newProg, error: progErr } = await supabase
    .from('programs')
    .insert({
      coach_id: user.id,
      client_id: clientId,
      name: finalName,
      description: proposal.rationale || null,
      is_template: false,
      status: 'active',
      goal,
      duration_weeks: durationWeeks,
    })
    .select()
    .single()

  if (progErr || !newProg) {
    console.error('[ai-program/save] program insert failed:', progErr?.message)
    return NextResponse.json({ error: 'Could not create program: ' + (progErr?.message || 'unknown') }, { status: 500 })
  }

  // ── Insert blocks + exercises ────────────────────────────────────────
  let blocksCreated = 0
  let exercisesCreated = 0
  const unresolvedNames: string[] = []

  try {
    for (const week of proposal.weeks) {
      const weekNum = Number(week.week) || 1
      const days = Array.isArray(week.days) ? week.days : []
      let dayIdx = 0
      for (const day of days) {
        const dayLabel = day.label || day.day || `Day ${dayIdx + 1}`
        const dayOfWeek = normalizeDay(day.day)

        const { data: nb, error: blockErr } = await supabase
          .from('workout_blocks')
          .insert({
            program_id: newProg.id,
            name: dayLabel,
            day_label: dayLabel,
            week_number: weekNum,
            order_index: dayIdx,
            day_of_week: dayOfWeek,
            estimated_duration_mins: day.estimated_minutes || null,
            description: week.focus ? `${week.focus}${week.deload ? ' (deload)' : ''}` : null,
          })
          .select('id')
          .single()

        if (blockErr || !nb) {
          throw new Error(`block insert failed (week ${weekNum} ${dayOfWeek}): ${blockErr?.message}`)
        }
        blocksCreated++

        const exs = Array.isArray(day.exercises) ? day.exercises : []
        let exIdx = 0
        for (const ex of exs) {
          const resolvedId = ex.name ? resolveExerciseId(ex.name) : null
          if (!resolvedId && ex.name) unresolvedNames.push(ex.name)

          // Build a notes string that preserves what AI prescribed even
          // when we can't resolve the exercise. The coach swaps later.
          const notesPieces: string[] = []
          if (!resolvedId && ex.name) notesPieces.push(`AI proposed: "${ex.name}" (no library match — pick a swap)`)
          if (ex.rationale) notesPieces.push(`Why: ${ex.rationale}`)
          if (ex.category) notesPieces.push(`Role: ${ex.category}`)
          const notes = notesPieces.length > 0 ? notesPieces.join(' · ') : null

          const { error: exErr } = await supabase
            .from('block_exercises')
            .insert({
              block_id: nb.id,
              exercise_id: resolvedId,
              sets: Number(ex.sets) || 3,
              reps: repsToText(ex.reps),
              target_weight: ex.load_guidance || null,
              rest_seconds: ex.rest_seconds || null,
              tempo: ex.tempo || null,
              rpe: null,            // load_guidance carries this for now
              notes,
              order_index: exIdx,
              exercise_role: (ex.category && ['warmup','corrective','main','accessory','conditioning','cooldown'].includes(String(ex.category).toLowerCase()))
                ? String(ex.category).toLowerCase()
                : 'main',
            })

          if (exErr) {
            throw new Error(`exercise insert failed (week ${weekNum} day ${dayLabel} ex ${exIdx}): ${exErr.message}`)
          }
          exercisesCreated++
          exIdx++
        }
        dayIdx++
      }
    }
  } catch (err: any) {
    // Rollback: delete the partially-built program. Cascade will drop
    // blocks/block_exercises if FKs are set up; otherwise we still want
    // the orphan-program gone.
    await supabase.from('block_exercises').delete().in('block_id',
      (await supabase.from('workout_blocks').select('id').eq('program_id', newProg.id)).data?.map((b:any)=>b.id) || []
    )
    await supabase.from('workout_blocks').delete().eq('program_id', newProg.id)
    await supabase.from('programs').delete().eq('id', newProg.id)
    console.error('[ai-program/save] rollback after error:', err.message)
    return NextResponse.json({ error: err.message || 'Save failed' }, { status: 500 })
  }

  return NextResponse.json({
    program_id: newProg.id,
    program_name: finalName,
    blocks_created: blocksCreated,
    exercises_created: exercisesCreated,
    unresolved_names: unresolvedNames,
    warning: unresolvedNames.length > 0
      ? `${unresolvedNames.length} exercise${unresolvedNames.length === 1 ? '' : 's'} could not be matched to your library. Open the program to pick swaps for those rows.`
      : null,
  })
}
