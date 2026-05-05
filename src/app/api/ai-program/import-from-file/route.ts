import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'
import * as XLSX from 'xlsx'

// =================================================================
// AI Program Import — coach-only.
//
// Accepts a PDF / Excel / CSV file describing a workout program and
// uses Claude Sonnet 4 to translate it into the same proposal JSON
// shape that /api/ai-program/build returns. The /api/ai-program/save
// endpoint then materializes the proposal into programs / blocks /
// exercises rows. Import is template-only — there's no client context.
//
// Architecture: TWO-PASS PARALLEL CHUNKING
// ----------------------------------------
// A single 24k-token call could not reliably hold a 12-week program;
// Sonnet 4 streams ~150-250 tok/sec so a fully-materialized 12-week
// program at ~36k tokens would blow past the 120s function ceiling.
//
// Phase 1 (~5-10s): metadata pass. Returns name, total_weeks, phases,
// weekly_split, coach_notes — short structural skeleton, ~1-2k tokens.
//
// Phase 2 (~20-40s wall time, parallel): N/4 chunked expansion calls,
// each fully materializing 4 weeks. Promise.all means total wall time
// ≈ slowest single chunk, not sum. A 12-week program runs as 3 chunks
// in parallel ≈ 30s total instead of ~90s sequential.
//
// PDF strategy: send to Claude as a document content block. Sonnet 4
// reads tables, headings, and layout natively. Same PDF goes into
// each phase-2 call (Anthropic prompt cache amortizes the cost).
// Excel/CSV strategy: parse with xlsx to a CSV-per-sheet text block
// and reuse across phases.
// =================================================================

export const runtime = 'nodejs'  // xlsx + Buffer need Node, not Edge
// Phase 1 (~10s) + parallel phase 2 (~30-40s) + JSON merging gives us
// real-world ~50-60s wall time. 120s leaves margin for slow chunks.
export const maxDuration = 120

const MAX_FILE_BYTES = 20 * 1024 * 1024  // 20 MB hard cap
const WEEKS_PER_CHUNK = 4

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

// Minimal exercise/day/week shapes — kept loose because Claude's
// output occasionally includes extra fields and we just pass through.
type ProposalDay = { day: string; label?: string; estimated_minutes?: number | null; exercises?: any[] }
type ProposalWeek = { week: number; phase?: string; focus?: string | null; deload?: boolean; days?: ProposalDay[] }
type Metadata = {
  name: string
  rationale?: string
  weekly_split?: string
  total_weeks: number
  coach_notes?: string
}

async function callAnthropic(
  apiKey: string,
  content: AnthropicContentBlock[],
  maxTokens: number,
): Promise<{ ok: boolean; data?: any; rawText?: string; error?: string }> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  })
  if (!res.ok) {
    const t = await res.text()
    return { ok: false, error: t.slice(0, 400) }
  }
  const data = await res.json()
  const rawText = data?.content?.[0]?.text || ''
  return { ok: true, data, rawText }
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  // Coach-only — verify role on profiles
  const { data: prof } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (prof?.role !== 'coach') {
    return NextResponse.json({ error: 'Coach access only' }, { status: 403 })
  }

  // Parse multipart upload
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  if (file.size === 0) return NextResponse.json({ error: 'File is empty' }, { status: 400 })
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: `File too large (max ${Math.round(MAX_FILE_BYTES/1024/1024)}MB)` }, { status: 400 })
  }

  const fileName = (file.name || 'upload').toLowerCase()
  const ext = fileName.split('.').pop() || ''
  const buf = Buffer.from(await file.arrayBuffer())

  // Build the source content blocks once. Same blocks are reused for
  // phase 1 (metadata) and every phase 2 call (chunked weeks). Anthropic
  // prompt caching dedupes the document cost across the parallel calls.
  const sourceBlocks: AnthropicContentBlock[] = []
  if (ext === 'pdf' || file.type === 'application/pdf') {
    sourceBlocks.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buf.toString('base64'),
      },
    })
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' ||
             file.type.includes('spreadsheet') || file.type === 'text/csv') {
    let workbook
    try {
      workbook = XLSX.read(buf, { type: 'buffer' })
    } catch (e: any) {
      return NextResponse.json({ error: 'Could not parse file: ' + (e?.message || 'unknown') }, { status: 400 })
    }
    const parts: string[] = [`(Source: ${file.name})`, '']
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
      if (!csv.trim()) continue
      parts.push(`### Sheet: ${sheetName}`)
      parts.push(csv)
      parts.push('')
    }
    if (parts.length <= 2) {
      return NextResponse.json({ error: 'File has no readable content' }, { status: 400 })
    }
    sourceBlocks.push({ type: 'text', text: parts.join('\n') })
  } else {
    return NextResponse.json({
      error: `Unsupported file type: ${ext || file.type || 'unknown'}. Use PDF, Excel (.xlsx/.xls), or CSV.`
    }, { status: 400 })
  }

  const startedAt = Date.now()

  // ── PHASE 1: METADATA ────────────────────────────────────────────────
  // Quick, cheap call. Determines total_weeks so phase 2 knows how many
  // chunks to fire off. Output is small (~1-2k tokens) so it returns in
  // 5-10 seconds even for huge documents.
  const metaPrompt = `Look at the attached workout program document and extract ONLY its top-level structure as JSON. Do NOT enumerate exercises here — that's a separate pass.

Output this exact JSON shape and nothing else (no commentary, no code fences):
{
  "name": "<program name from the document, or a sensible default>",
  "rationale": "<short note describing what this program is, pulled from the doc if present, otherwise inferred>",
  "weekly_split": "<one-line summary of the split, e.g. 'Push / Pull / Legs x2'>",
  "total_weeks": <integer — the actual number of distinct weeks the program covers>,
  "coach_notes": "<any general notes/cues/progression rules pulled from the document, joined with newlines, or empty string>"
}

CRITICAL:
- total_weeks must be the document's actual week count. Look at headers ("Week 1", "Week 2"...), tables (one column or row per week), or progression rules. If the document only shows ONE week and gives a progression rule like "+5 lbs each week for 8 weeks", total_weeks = 8. If it only shows one workout with no progression, total_weeks = 1.
- Output minified JSON — no whitespace beyond what's needed. Start with { and end with }.`

  const metaContent: AnthropicContentBlock[] = [...sourceBlocks, { type: 'text', text: metaPrompt }]
  const metaCall = await callAnthropic(apiKey, metaContent, 2000)
  if (!metaCall.ok) {
    console.error('[ai-program/import] phase 1 anthropic error:', metaCall.error)
    return NextResponse.json({ error: 'AI request failed (metadata pass)' }, { status: 500 })
  }
  const metaResult = parseClaudeJsonResponse(metaCall.data, metaCall.rawText || '')
  if (!metaResult.ok) {
    console.error(`[ai-program/import] phase 1 parse failed: ${metaResult.error}`)
    return NextResponse.json({ error: metaResult.error, raw: metaResult.raw }, { status: metaResult.status })
  }
  const metadata = metaResult.data as Metadata
  const totalWeeks = Math.max(1, Math.min(52, Number(metadata.total_weeks) || 1))

  // ── PHASE 2: CHUNKED WEEK EXPANSION (PARALLEL) ───────────────────────
  // Build chunks of WEEKS_PER_CHUNK weeks each. Run all chunks in
  // parallel — Promise.all means total wall time ≈ slowest single
  // chunk, not sum. A 12-week program: 3 chunks × ~30s ≈ 30s total.
  const chunkRanges: Array<[number, number]> = []
  for (let start = 1; start <= totalWeeks; start += WEEKS_PER_CHUNK) {
    chunkRanges.push([start, Math.min(start + WEEKS_PER_CHUNK - 1, totalWeeks)])
  }

  const chunkPromises = chunkRanges.map(async ([startWeek, endWeek]): Promise<{ weeks: ProposalWeek[]; truncated: boolean; error?: string }> => {
    const weeksLabel = startWeek === endWeek ? `week ${startWeek}` : `weeks ${startWeek} through ${endWeek}`
    const chunkPrompt = `Look at the attached workout program. The document covers ${totalWeeks} total week${totalWeeks === 1 ? '' : 's'} of training.

Output ONLY ${weeksLabel}, fully materialized, in this exact JSON shape (no commentary, no code fences):
{
  "weeks": [
    {
      "week": <integer, ${startWeek}..${endWeek}>,
      "phase": "<short phrase like 'accumulation' / 'intensification' / 'realization' / 'deload', from the document if present>",
      "focus": "<3-6 word phrase from the document, or null>",
      "deload": <true|false>,
      "days": [
        {
          "day": "<Mon|Tue|Wed|Thu|Fri|Sat|Sun>",
          "label": "<short label, e.g. 'Lower A — squat focus'>",
          "estimated_minutes": <int or null>,
          "exercises": [
            {
              "name": "<exercise name in 'Movement [Variation] - Equipment' format — e.g. 'Back Squat - Barbell'>",
              "category": "<warmup|main|secondary|accessory|finisher|cooldown>",
              "sets": <int>,
              "reps": "<string, e.g. '8-10' or '5x3' or '30s'>",
              "load_guidance": "<string, e.g. 'RPE 7' or '70% 1RM' or '135 lbs' — whatever the document specifies>",
              "rest_seconds": <int or null>,
              "tempo": "<string, e.g. '3-1-1-0', or null>",
              "rationale": ""
            }
          ]
        }
      ]
    }
  ]
}

CRITICAL:
- Output ONLY ${weeksLabel}. Do NOT include other weeks in this response — they're being processed in parallel.
- Materialize EACH week fully — full days[] with full exercises[] for that specific week. No "see week 1" placeholders, no empty weeks.
- If the document encodes weeks compactly (one row per week with deltas, "wave: 70/75/80%"), apply the rule yourself and write each week's concrete numbers.
- Exercise names: "Movement [Variation] - Equipment" (e.g. "Back Squat - Barbell"). Bodyweight drops the suffix ("Pull-up", "Plank"). Movement-first, NOT equipment-first.
- category MUST be one of: warmup | main | secondary | accessory | finisher | cooldown. Map "primary lift" → "main", "conditioning" → "finisher", "mobility" → "warmup", "corrective" → "warmup".
- Keep "rationale" empty string. Keep "focus" short or null.
- Use null instead of empty objects or arrays. Output minified JSON — no extra whitespace. Start with { and end with }.`

    const chunkContent: AnthropicContentBlock[] = [...sourceBlocks, { type: 'text', text: chunkPrompt }]
    const chunkCall = await callAnthropic(apiKey, chunkContent, 16000)
    if (!chunkCall.ok) {
      return { weeks: [], truncated: false, error: chunkCall.error }
    }
    const parsed = parseClaudeJsonResponse(chunkCall.data, chunkCall.rawText || '')
    if (!parsed.ok) {
      return {
        weeks: [],
        truncated: chunkCall.data?.stop_reason === 'max_tokens',
        error: parsed.error,
      }
    }
    const weeks = (parsed.data?.weeks || []) as ProposalWeek[]
    return { weeks, truncated: chunkCall.data?.stop_reason === 'max_tokens' }
  })

  const chunkResults = await Promise.all(chunkPromises)

  // Merge chunks into a single weeks array, sorted by week number.
  const allWeeks: ProposalWeek[] = []
  const failedChunks: string[] = []
  for (let i = 0; i < chunkResults.length; i++) {
    const result = chunkResults[i]
    const [s, e] = chunkRanges[i]
    if (result.error) {
      failedChunks.push(`weeks ${s}-${e}: ${result.error}`)
      continue
    }
    if (result.truncated) {
      failedChunks.push(`weeks ${s}-${e}: AI truncated mid-output`)
      // Still keep whatever weeks made it through before truncation
    }
    allWeeks.push(...result.weeks)
  }
  allWeeks.sort((a, b) => (a.week || 0) - (b.week || 0))

  // If literally nothing came back, surface a clear error.
  if (allWeeks.length === 0) {
    return NextResponse.json({
      error: 'AI could not produce any weeks. ' + (failedChunks[0] || 'Unknown reason. Try again, or split the file.')
    }, { status: 500 })
  }

  const elapsedMs = Date.now() - startedAt
  console.log(`[ai-program/import] ok user=${user.id} ext=${ext} bytes=${buf.length} ms=${elapsedMs} weeks_planned=${totalWeeks} weeks_returned=${allWeeks.length} chunks=${chunkRanges.length} failed=${failedChunks.length}`)

  // Final proposal — same shape as before, built from the metadata pass
  // and the merged weeks. The save endpoint can ingest this unchanged.
  const proposal = {
    name: metadata.name,
    rationale: metadata.rationale || '',
    weekly_split: metadata.weekly_split || '',
    weeks: allWeeks,
    coach_notes: metadata.coach_notes || '',
  }

  return NextResponse.json({
    ...proposal,
    meta: {
      source_filename: file.name,
      source_size_bytes: buf.length,
      generated_at: new Date().toISOString(),
      total_weeks_detected: totalWeeks,
      weeks_returned: allWeeks.length,
      chunks: chunkRanges.length,
      failed_chunks: failedChunks,
      elapsed_ms: elapsedMs,
    },
    warning: failedChunks.length > 0
      ? `Some weeks did not import cleanly: ${failedChunks.join('; ')}. The editor will let you fill in the gaps or re-import the missing range.`
      : null,
  })
}
