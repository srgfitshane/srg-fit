import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// Server-side proxy for AI exercise swap suggestions.
// Keeps ANTHROPIC_API_KEY out of the client bundle entirely.
//
// F2c upgrade: callers can now include an optional `clientId` in the
// body. When present we fetch that client's intake (injuries +
// equipment access) and APPEND it to the last user message so the
// LLM weighs injury history when picking swaps. Backwards-compatible:
// callers without clientId behave exactly as before.
export async function POST(req: NextRequest) {
  // Auth check — must be a logged-in user
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI swap not configured' }, { status: 503 })
  }

  const body = await req.json()
  const { clientId, ...passThrough } = body || {}

  // ── Optional injury+equipment injection ─────────────────────────────
  // Only fires when caller passes clientId. We trust the caller for now
  // (auth gate above is enough for the swap path — same security
  // posture as before, just richer context).
  if (clientId && Array.isArray(passThrough.messages) && passThrough.messages.length > 0) {
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
