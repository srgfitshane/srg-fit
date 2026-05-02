// Shared helpers for /api/ai-* routes. Centralized so all AI endpoints
// fail the same way and we don't duplicate the JSON extraction footgun.

// Walk the text looking for a balanced top-level JSON object. The old
// regex `\{[\s\S]*\}` was greedy across the whole response: if Claude
// included stray braces in commentary (e.g. "do NOT echo {placeholder}
// fields"), the match captured the commentary too and JSON.parse blew
// up with the dreaded "Invalid JSON from AI". This walker respects
// strings + escapes, so it returns the FIRST complete top-level object.
export function extractJsonObject(text: string): string | null {
  if (!text) return null
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escape = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(start, i + 1)
    }
  }
  // Walked to EOF without closing — almost always means max_tokens
  // truncation. Caller should check stop_reason and surface a friendly
  // error to the coach.
  return null
}

// Standard "extract + parse + classify failures" path. Returns either
// {ok:true, data} or {ok:false, status, error} suitable for piping into
// NextResponse.json.
export function parseClaudeJsonResponse(
  apiResponse: any,
  rawText: string,
): { ok: true; data: any } | { ok: false; status: number; error: string; raw?: string } {
  const stop = apiResponse?.stop_reason
  if (stop === 'max_tokens') {
    return {
      ok: false,
      status: 500,
      error: 'AI hit its output token limit before finishing. Try a shorter program (4 weeks, fewer days/week) or simplify your constraints.',
    }
  }

  const slice = extractJsonObject(rawText)
  if (!slice) {
    return {
      ok: false,
      status: 500,
      error: stop === 'max_tokens'
        ? 'AI response truncated mid-output.'
        : 'AI did not return JSON. This is usually transient — try again.',
      raw: rawText.slice(0, 500),
    }
  }

  try {
    const parsed = JSON.parse(slice)
    return { ok: true, data: parsed }
  } catch (e: any) {
    return {
      ok: false,
      status: 500,
      error: 'AI returned malformed JSON: ' + (e?.message || 'parse error'),
      raw: slice.slice(0, 500),
    }
  }
}
