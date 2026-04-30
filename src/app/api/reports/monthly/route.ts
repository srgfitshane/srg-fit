import { NextRequest, NextResponse } from 'next/server'
import { renderToBuffer } from '@react-pdf/renderer'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { MonthlyReport, type MonthlyReportData } from '@/components/reports/MonthlyReport'
import React from 'react'

// @react-pdf/renderer needs Node runtime (PDF rendering, fonts, image fetching).
export const runtime = 'nodejs'
// Reports are coach-tools, fresh per request; no caching.
export const dynamic = 'force-dynamic'

type RequestQuery = {
  clientId: string
  month: string // YYYY-MM
}

function parseQuery(req: NextRequest): RequestQuery | null {
  const clientId = req.nextUrl.searchParams.get('clientId')
  const month = req.nextUrl.searchParams.get('month') || defaultMonth()
  if (!clientId) return null
  if (!/^\d{4}-\d{2}$/.test(month)) return null
  return { clientId, month }
}

function defaultMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0))
  const end = new Date(Date.UTC(y, m, 1, 0, 0, 0)) // exclusive
  const startIso = start.toISOString()
  const endIso = end.toISOString()
  const startDate = startIso.slice(0, 10)
  const endDate = endIso.slice(0, 10)
  const label = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return { startIso, endIso, startDate, endDate, label }
}

const fmtShort = (iso: string | null | undefined) => {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Best-effort: scan a check-in response object for win/struggle-shaped keys and
// pull short non-empty strings out. Heuristic, not exhaustive -- if a coach's
// form template uses an unusual field name we just won't surface it here.
function extractHighlights(responses: Array<Record<string, unknown> | null | undefined>) {
  const wins: string[] = []
  const struggles: string[] = []
  const winKeys = /win|going well|crushing|proud|highlight/i
  const struggleKeys = /struggle|hard|challenge|stuck|missed|tough|obstacle/i
  for (const r of responses) {
    if (!r || typeof r !== 'object') continue
    for (const [k, v] of Object.entries(r)) {
      if (typeof v !== 'string' || !v.trim()) continue
      const cleaned = v.trim().replace(/\s+/g, ' ')
      if (cleaned.length > 220) continue // skip novella answers
      if (winKeys.test(k) && wins.length < 3) wins.push(cleaned)
      else if (struggleKeys.test(k) && struggles.length < 3) struggles.push(cleaned)
    }
  }
  return { wins, struggles }
}

export async function GET(req: NextRequest) {
  const query = parseQuery(req)
  if (!query) {
    return NextResponse.json({ error: 'clientId required and month must be YYYY-MM' }, { status: 400 })
  }

  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Verify coach owns this client. RLS would also block but a 403 is cleaner.
  const { data: client } = await supabase
    .from('clients')
    .select('id, coach_id, profile_id, profile:profiles!profile_id(full_name)')
    .eq('id', query.clientId)
    .maybeSingle()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const { data: coachProfile } = await supabase
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  const bounds = monthBounds(query.month)

  // Parallel data pulls. Each section is independent; failure in one shouldn't
  // block the rest -- we use empty defaults on null returns so the PDF still
  // renders even with missing data.
  const [
    weightsRes,
    workoutsRes,
    scheduledRes,
    checkinsRes,
    prsRes,
    photosRes,
    pulseRes,
  ] = await Promise.all([
    supabase.from('metrics')
      .select('weight, logged_date')
      .eq('client_id', query.clientId)
      .gte('logged_date', bounds.startDate)
      .lt('logged_date', bounds.endDate)
      .not('weight', 'is', null)
      .order('logged_date', { ascending: true }),
    supabase.from('workout_sessions')
      .select('id, completed_at, status')
      .eq('client_id', query.clientId)
      .not('program_id', 'is', null)
      .eq('status', 'completed')
      .gte('completed_at', bounds.startIso)
      .lt('completed_at', bounds.endIso),
    supabase.from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', query.clientId)
      .not('program_id', 'is', null)
      .gte('scheduled_date', bounds.startDate)
      .lt('scheduled_date', bounds.endDate),
    supabase.from('client_form_assignments')
      .select('id, status, completed_at, response')
      .eq('client_id', query.clientId)
      .not('checkin_schedule_id', 'is', null)
      .gte('assigned_at', bounds.startIso)
      .lt('assigned_at', bounds.endIso),
    supabase.from('personal_records')
      .select('weight_pr, reps_pr, logged_date, exercise:exercises(name)')
      .eq('client_id', query.clientId)
      .gte('logged_date', bounds.startDate)
      .lt('logged_date', bounds.endDate)
      .order('logged_date', { ascending: false }),
    supabase.from('progress_photos')
      .select('storage_path, photo_date, angle')
      .eq('client_id', client.profile_id) // progress_photos.client_id stores profile_id (per CLAUDE.md)
      .gte('photo_date', bounds.startDate)
      .lt('photo_date', bounds.endDate)
      .order('photo_date', { ascending: true }),
    supabase.from('daily_checkins')
      .select('body, checkin_date')
      .eq('client_id', query.clientId)
      .gte('checkin_date', bounds.startDate)
      .lt('checkin_date', bounds.endDate)
      .not('body', 'is', null),
  ])

  // Weight delta
  const weights = (weightsRes.data || []) as Array<{ weight: number; logged_date: string }>
  const weightStart = weights.length > 0 ? weights[0].weight : null
  const weightEnd = weights.length > 0 ? weights[weights.length - 1].weight : null
  const weightDelta = weightStart !== null && weightEnd !== null
    ? Number((weightEnd - weightStart).toFixed(1))
    : null

  // Workouts
  const workoutsCompleted = (workoutsRes.data || []).length
  const workoutsScheduled = scheduledRes.count ?? null
  const adherencePct = workoutsScheduled && workoutsScheduled > 0
    ? Math.round((workoutsCompleted / workoutsScheduled) * 100)
    : null

  // Check-ins
  const checkins = (checkinsRes.data || []) as Array<{ status: string; response: Record<string, unknown> | null }>
  const checkinsCompleted = checkins.filter(c => c.status === 'completed').length
  const checkinsTotal = checkins.length || null

  // PRs
  type PrRow = { weight_pr: number | null; reps_pr: number | null; logged_date: string; exercise: { name?: string | null } | Array<{ name?: string | null }> | null }
  const prs = ((prsRes.data || []) as PrRow[]).map((pr) => {
    const exName = Array.isArray(pr.exercise)
      ? pr.exercise[0]?.name || 'Exercise'
      : pr.exercise?.name || 'Exercise'
    let value = '—'
    if (pr.weight_pr != null) value = `${pr.weight_pr} lbs`
    else if (pr.reps_pr != null) value = `${pr.reps_pr} reps`
    return {
      exercise: exName,
      value,
      date_label: fmtShort(pr.logged_date),
    }
  }).filter(p => p.value !== '—').slice(0, 5)

  // Photos -- before/after pair. Prefer same angle when possible (front/side).
  type PhotoRow = { storage_path: string; photo_date: string; angle: string | null }
  const photos = (photosRes.data || []) as PhotoRow[]
  let beforePhoto: PhotoRow | null = null
  let afterPhoto: PhotoRow | null = null
  if (photos.length > 0) {
    beforePhoto = photos[0]
    afterPhoto = photos.length > 1 ? photos[photos.length - 1] : null
    // Try to match angle: if the first photo has an angle, find the latest photo with the same angle.
    if (beforePhoto.angle) {
      const sameAngle = photos.filter(p => p.angle === beforePhoto!.angle)
      if (sameAngle.length > 1) afterPhoto = sameAngle[sameAngle.length - 1]
    }
    // Don't show before == after.
    if (afterPhoto && afterPhoto.storage_path === beforePhoto.storage_path) afterPhoto = null
  }

  const signPhoto = async (path: string | null | undefined): Promise<string | null> => {
    if (!path) return null
    const { data } = await supabase.storage.from('progress-photos').createSignedUrl(path, 60 * 10)
    return data?.signedUrl || null
  }
  const [beforeUrl, afterUrl] = await Promise.all([
    signPhoto(beforePhoto?.storage_path),
    signPhoto(afterPhoto?.storage_path),
  ])

  // Highlights -- pulled from form responses + daily check-in journal text.
  const responses = checkins.map(c => c.response).filter(Boolean) as Array<Record<string, unknown>>
  const { wins, struggles } = extractHighlights(responses)

  // Augment wins from daily journal if we found nothing in form responses.
  // Take the first short, positive-feeling line as a fallback win and the
  // first short, struggle-feeling line as a fallback struggle.
  const journalEntries = ((pulseRes.data || []) as Array<{ body: string }>)
    .map(e => e.body)
    .filter(Boolean)
  if (wins.length === 0 || struggles.length === 0) {
    const winRegex = /\b(felt great|crushed|nailed|good|happy|proud|smashed|killed it|on track|love)/i
    const struggleRegex = /\b(tough|hard|missed|tired|struggled|bad|sore|stressed|busy|overwhelmed)/i
    for (const body of journalEntries) {
      const lines = body.split(/[.\n]+/).map(s => s.trim()).filter(s => s.length > 8 && s.length < 180)
      for (const line of lines) {
        if (wins.length < 3 && winRegex.test(line)) wins.push(line)
        else if (struggles.length < 3 && struggleRegex.test(line)) struggles.push(line)
      }
      if (wins.length >= 3 && struggles.length >= 3) break
    }
  }

  // Build the data contract. profile may come back as object or array depending
  // on PostgREST relationship inference -- coerce defensively.
  const profileField = (client as { profile?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null }).profile
  const clientName = (Array.isArray(profileField) ? profileField[0]?.full_name : profileField?.full_name) || 'Client'
  const coachName = (coachProfile?.full_name || 'Shane').split(' ')[0]
  const reportData: MonthlyReportData = {
    client_name: clientName,
    coach_name: coachName,
    month_label: bounds.label,
    generated_at_label: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    metrics: {
      weight_start_lbs: weightStart,
      weight_end_lbs: weightEnd,
      weight_delta_lbs: weightDelta,
    },
    workouts: {
      completed: workoutsCompleted,
      scheduled: workoutsScheduled,
      adherence_pct: adherencePct,
    },
    checkins: {
      completed: checkinsCompleted,
      total: checkinsTotal,
    },
    prs,
    photos: {
      before_url: beforeUrl,
      after_url: afterUrl,
      before_label: beforePhoto ? fmtShort(beforePhoto.photo_date) : null,
      after_label: afterPhoto ? fmtShort(afterPhoto.photo_date) : null,
    },
    highlights: { wins, struggles },
  }

  // Render to PDF buffer. The cast works around @react-pdf/renderer's
  // overly-narrow type signature (it expects a Document element directly,
  // but our wrapper component returns one).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfBuffer = await renderToBuffer(React.createElement(MonthlyReport, { data: reportData }) as any)

  const safeName = clientName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const filename = `srgfit-${safeName}-${query.month}.pdf`

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
