import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { parseClaudeJsonResponse } from '@/lib/ai-utils'

// =================================================================
// Coach note structurer (F4.1) — coach-only.
//
// Coach pastes raw observations after a session ("Lindsey came in
// tired, slept 5h, squat felt heavy at 135, talked about her mom's
// surgery"). AI returns a structured shape:
//   - headline: 1-line summary the coach scans later
//   - category: lifestyle | technique | mindset | medical | training | other
//   - tags: array of short keyword tags for grouping
//   - structured: 2-4 bullet rewrite the coach can post-edit
//
// Adoption nudge: coach_notes table had 0 rows. Friction was the
// blank-page problem — re-typing observations into prose feels like
// homework. Voice-or-paste → structured removes the friction.
//
// We do NOT save here — the UI saves after the coach reviews. Keeps
// the AI suggestion ephemeral and the coach in control.
// =================================================================

const ALLOWED_CATEGORIES = ['lifestyle', 'technique', 'mindset', 'medical', 'training', 'other'] as const

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'AI not configured' }, { status: 503 })

  const { clientId, raw } = await req.json()
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return NextResponse.json({ error: 'raw text required' }, { status: 400 })
  }
  if (raw.length > 6000) {
    return NextResponse.json({ error: 'raw text too long (max 6000 chars)' }, { status: 400 })
  }

  // Coach ownership gate — same pattern as other ai-* routes
  const { data: client } = await supabase
    .from('clients').select('id, coach_id').eq('id', clientId).single()
  if (!client || client.coach_id !== user.id) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 })
  }

  const prompt = `You are a coaching assistant. The coach pasted a raw stream-of-consciousness
note about a client. Return a structured version the coach can scan in
two seconds and edit if needed. Be faithful to what the coach said —
don't invent details. Use the coach's voice (direct, plain spoken).

RAW NOTE:
${raw.trim()}

Categories — pick ONE that fits best:
- lifestyle: sleep, stress, nutrition, family, travel, schedule
- technique: form cues, positional issues, range of motion
- mindset: motivation, confidence, fear, frustration, breakthroughs
- medical: pain, injury, illness, rehab status
- training: load, volume, progression, deload trigger, RPE drift
- other: anything that doesn't fit

Respond ONLY with this JSON, no other text:
{
  "headline": "<one line, max 80 chars, the takeaway. e.g. 'Sleep deficit + family stress; reduce loads next session'>",
  "category": "<one of: lifestyle | technique | mindset | medical | training | other>",
  "tags": ["<short keyword>", "<another>", "<one more if relevant>"],
  "structured": "<2-4 bullet rewrite, separated by newlines, each starting with '- '. Faithful to the raw note. No new info.>"
}`

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) {
    console.error('[ai-coach-note] Anthropic error:', await res.text())
    return NextResponse.json({ error: 'AI request failed' }, { status: 500 })
  }

  const data = await res.json()
  const text = data?.content?.[0]?.text || ''
  const result = parseClaudeJsonResponse(data, text)
  if (!result.ok) {
    console.error(`[ai-coach-note] parse failed stop=${data?.stop_reason} error=${result.error}`)
    return NextResponse.json({ error: result.error, raw: result.raw }, { status: result.status })
  }

  // Defensive: clamp category to allowed
  const out = result.data
  if (!ALLOWED_CATEGORIES.includes(out.category)) out.category = 'other'
  if (!Array.isArray(out.tags)) out.tags = []

  return NextResponse.json(out)
}
