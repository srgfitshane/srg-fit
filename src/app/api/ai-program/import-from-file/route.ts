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
// Why this exists: the AI Program Builder pulls intake + injuries +
// PRs + library convention + history every build, which is great for
// personalization but burns a lot of tokens. For digitizing coach's
// existing PDF/Excel programs, none of that context applies — we just
// need to parse the document. Smaller prompt, cheaper, and lets coach
// move years of programs out of their drives and into the library.
//
// PDF strategy: send to Claude as a document content block (Sonnet 4
// has native PDF support — sees text + tables + headings together).
// Excel/CSV strategy: parse with xlsx to a markdown-ish text table
// per sheet and send as a text block. Cheaper tokens, identical
// output schema.
// =================================================================

export const runtime = 'nodejs'  // xlsx + Buffer need Node, not Edge
// PDF parsing + 32k-token output for an 8-week program can run 60-90s.
// Vercel Pro allows up to 300s for serverless; 120 gives plenty of margin.
export const maxDuration = 120

const MAX_FILE_BYTES = 20 * 1024 * 1024  // 20 MB hard cap

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string } }

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

  // Build the prompt that explains the output shape. Same JSON schema as
  // /api/ai-program/build so the existing save endpoint can materialize.
  //
  // The "expand every week fully" instruction is load-bearing — for a real
  // 8-week powerlifting program a coach uploads, the output has to land
  // ALL eight weeks materialized (not week 1 + a "repeat with progression"
  // note), or the editor opens half-empty and the coach has to rebuild.
  const schemaPrompt = `Translate the attached workout program into a structured JSON proposal.

You MUST fully materialize EVERY week the document covers — if the
document is 8 weeks long, output 8 week entries with the actual load /
rep / set values for each. Do not collapse weeks into a single template
plus a progression note. If the document shows a progression rule like
"+5 lbs each week" or "wave: 70/75/80%", apply that rule yourself and
write out every week's concrete numbers in the JSON. The output is
materialized directly into a database — the editor cannot re-derive
week 5 from a rule.

Output ONLY this JSON shape, no commentary:
{
  "name": "<program name from the document, or a sensible default>",
  "rationale": "<short note describing what this program is — pulled from the document if present, otherwise inferred from the structure>",
  "weekly_split": "<one-line summary of the split, e.g. 'Push / Pull / Legs x2'>",
  "weeks": [
    {
      "week": 1,
      "phase": "accumulation",
      "focus": "<short phrase from the document, or null>",
      "deload": false,
      "days": [
        {
          "day": "Mon",
          "label": "<short label, e.g. 'Lower A — squat focus'>",
          "estimated_minutes": <int or null>,
          "exercises": [
            {
              "name": "<exercise name in 'Movement [Variation] - Equipment' format if possible — e.g. 'Back Squat - Barbell'>",
              "category": "<warmup | main | secondary | accessory | finisher | cooldown>",
              "sets": <int>,
              "reps": "<string, e.g. '8-10' or '5x3' or '30s'>",
              "load_guidance": "<string, e.g. 'RPE 7' or '70% 1RM' or '135 lbs' or whatever the document specifies>",
              "rest_seconds": <int or null>,
              "tempo": "<string, e.g. '3-1-1-0', or null>",
              "rationale": "<short note if the document explains why; otherwise empty string>"
            }
          ]
        }
      ]
    }
  ],
  "coach_notes": "<any general notes / cues / progression rules pulled from the document, joined with newlines, or empty string>"
}

CRITICAL rules:
- Exercise names: use "Movement [Variation] - Equipment" format with a hyphen separator (e.g. "Back Squat - Barbell", "Bench Press - Dumbbell", "Bent Over Row - Cable", "Hip Thrust - Barbell"). Bodyweight moves drop the suffix ("Pull-up", "Push-up", "Plank"). DO NOT write equipment first ("Dumbbell Bench Press") — the library indexes movement-first and the save step matches against this format.
- category MUST be one of: warmup | main | secondary | accessory | finisher | cooldown. Map any document terminology (e.g. "primary lift" → "main", "conditioning" → "finisher", "mobility" → "warmup", "corrective" → "warmup").
- WEEK COVERAGE — non-negotiable:
   * Look at the entire document. Count the weeks.
   * Output one entry in "weeks" for EVERY week. An 8-week program returns weeks: [{week:1...},{week:2...},...,{week:8...}].
   * Each week must have its full days[] array with the full exercises[] for that week. No "see week 1" placeholders, no empty weeks, no collapsing.
   * If a week is a deload, mark deload:true AND still write out the deload prescription.
   * If the document encodes weeks compactly (e.g. one row per week with rep/load deltas, or "Week N: 3x5 @ X lbs"), expand each into a full day/exercise structure for that week.
- If the document doesn't specify weeks (just shows one workout), output a single-week proposal with that workout as one or more days.
- If a value is missing in the document, use null (numbers) or empty string (strings) — don't invent details.
- Be faithful to what's in the document. Don't add exercises that aren't there.
- Output JSON only. No prose before or after. Start with { and end with }.`

  // Compose the message content blocks per file type
  const content: AnthropicContentBlock[] = []

  if (ext === 'pdf' || file.type === 'application/pdf') {
    // PDF → send directly as a document block. Sonnet 4 reads tables,
    // headings, and layout natively.
    content.push({
      type: 'document',
      source: {
        type: 'base64',
        media_type: 'application/pdf',
        data: buf.toString('base64'),
      },
    })
    content.push({ type: 'text', text: schemaPrompt })
  } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' ||
             file.type.includes('spreadsheet') || file.type === 'text/csv') {
    // Excel / CSV → parse with xlsx, render each sheet as a markdown-ish
    // table joined by sheet headers. Send as one text block.
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
    content.push({ type: 'text', text: parts.join('\n') })
    content.push({ type: 'text', text: schemaPrompt })
  } else {
    return NextResponse.json({
      error: `Unsupported file type: ${ext || file.type || 'unknown'}. Use PDF, Excel (.xlsx/.xls), or CSV.`
    }, { status: 400 })
  }

  const startedAt = Date.now()
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      // 32k is needed to fully materialize an 8-week program. A 4-day x 8-week
      // x ~6-exercise program runs ~25-30k tokens of JSON output. 16k was
      // chopping week 5+ off in the wild.
      max_tokens: 32000,
      messages: [{ role: 'user', content }],
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[ai-program/import] Anthropic error:', errText.slice(0, 400))
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[ai-program/import] parse failed stop=${data?.stop_reason} error=${result.error}`)
    // Override the generic "shorter program" message — the coach uploaded
    // a real document, they can't just shorten it. Suggest splitting.
    const friendlyError = data?.stop_reason === 'max_tokens'
      ? 'AI ran out of room before finishing this program. If it spans more than ~8 weeks or has dense set-by-set tables, try uploading it in two halves (e.g. weeks 1-4 and 5-8 as separate files) and the editor will let you copy weeks across.'
      : result.error
    return NextResponse.json({ error: friendlyError, raw: result.raw }, { status: result.status })
  }

  const elapsedMs = Date.now() - startedAt
  console.log(`[ai-program/import] ok user=${user.id} ext=${ext} bytes=${buf.length} ms=${elapsedMs} stop=${data?.stop_reason} usage=${JSON.stringify(data?.usage || {})}`)

  return NextResponse.json({
    ...result.data,
    meta: {
      source_filename: file.name,
      source_size_bytes: buf.length,
      generated_at: new Date().toISOString(),
      usage: data?.usage,
    },
  })
}
