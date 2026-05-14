import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Server-side proxy for AI exercise swap suggestions.
// Keeps ANTHROPIC_API_KEY out of the client bundle entirely.
//
// Auth model: authenticated callers ONLY, and caller must own the
// referenced clientId -- either the coach (clients.coach_id = user.id)
// or the client themselves (clients.profile_id = user.id). This is
// distinct from the rest of the AI routes (coach-only) because the
// in-workout swap UI is invoked BY the client mid-session, not by the
// coach. Ownership check drops the "any logged-in user drains the
// Anthropic budget" exposure while preserving the gym-floor swap flow.
//
// F2c upgrade: server fetches the client's intake (injuries +
// equipment access) and APPENDS it to the last user message so the
// LLM weighs injury history when picking swaps.
export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI swap not configured' }, { status: 503 })
  }

  const body = await req.json()
  const { clientId, ...passThrough } = body || {}

  // ── Ownership gate ──────────────────────────────────────────────────
  // clientId is required so we have something to bind ownership to.
  // Without it, any authenticated user could burn Claude tokens.
  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  }
  const { data: clientRow } = await supabase
    .from('clients')
    .select('id, profile_id, coach_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!clientRow || (clientRow.profile_id !== user.id && clientRow.coach_id !== user.id)) {
    // Don't leak whether the row exists -- same response either way.
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── Injury+equipment injection ──────────────────────────────────────
  // Ownership gate above guarantees the caller can legitimately read
  // this intake. RLS still enforces it at the DB layer as defense-in-depth.
  if (Array.isArray(passThrough.messages) && passThrough.messages.length > 0) {
    try {
      const { data: intake } = await supabase
        .from('client_intake_profiles')
        .select('injuries_limitations, past_injuries, recent_surgeries, equipment_access, training_experience')
        .eq('client_id', clientId)
        .maybeSingle()

      if (intake) {
        const injuryBits: string[] = []
        if (intake.injuries_limitations) injuryBits.push(`Active limitations: ${intake.injuries_limitations}`)
        if (intake.past_injuries)        injuryBits.push(`Past injuries: ${intake.past_injuries}`)
        if (intake.recent_surgeries)     injuryBits.push(`Recent surgeries: ${intake.recent_surgeries}`)
        const equipment = Array.isArray(intake.equipment_access) && intake.equipment_access.length > 0
          ? intake.equipment_access.join(', ')
          : null

        // Only inject if we actually have something useful — empty
        // intake fields shouldn't burn tokens.
        if (injuryBits.length > 0 || equipment || intake.training_experience) {
          const contextLines: string[] = ['', '--- ATHLETE CONTEXT (from intake) ---']
          if (injuryBits.length > 0) contextLines.push(...injuryBits)
          if (equipment) contextLines.push(`Available equipment: ${equipment}`)
          if (intake.training_experience) contextLines.push(`Training experience: ${intake.training_experience}`)
          contextLines.push('Hard rule: when picking substitutes, exclude any movement pattern that aggravates an active limitation. When in doubt, choose the regression.')

          // Append to the last user message (don't replace — caller
          // already wrote the candidate list there).
          const messages = [...passThrough.messages]
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i]?.role === 'user' && typeof messages[i]?.content === 'string') {
              messages[i] = {
                ...messages[i],
                content: messages[i].content + '\n' + contextLines.join('\n'),
              }
              break
            }
          }
          passThrough.messages = messages
        }
      }
    } catch (e) {
      // Non-fatal — fall through with the original prompt.
      console.warn('[ai-swap] injury context injection failed:', (e as any)?.message)
    }
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(passThrough),
  })

  const data = await res.json()
  return NextResponse.json(data, { status: res.status })
}
