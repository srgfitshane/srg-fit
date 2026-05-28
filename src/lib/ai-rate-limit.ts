import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase-server'

/**
 * Per-user, per-route hourly rate limiting for the AI proxy endpoints.
 *
 * Why: every /api/ai-* route forwards to Anthropic, which costs real money
 * per call. Without a ceiling, a buggy client loop or an abusive account
 * could run up the bill. `ai-swap` is the only AI route reachable by a
 * (untrusted) client mid-workout, so it gets the tightest cap; the rest are
 * coach-only (trusted) and get generous caps that won't hinder normal
 * coaching but will catch a runaway.
 *
 * Storage: counts live in public.ai_usage_log (DB-backed, so it works on
 * serverless where in-memory counters don't survive between invocations).
 * The table is service-role-only (RLS on, no policies), so clients can't
 * read or tamper with their own counters. We use the admin client here.
 *
 * Fail-open by design: if the metering query itself errors, we ALLOW the
 * call. A rate-limit bug must never block a legitimate coaching action --
 * the limit is a cost guardrail, not a core gate. (Same philosophy as the
 * rest of the app: never let infra get between the coach and the work.)
 */

// Calls allowed per rolling 60-minute window, per user, per route key.
const LIMITS: Record<string, number> = {
  'ai-swap': 30,                    // client-reachable (in-workout) -> tightest
  'ai-program-build': 10,           // most expensive (6-12k tokens)
  'ai-program-import': 10,
  'ai-nutrition-meal-plan': 15,
  'ai-nutrition-weekly-meal-plan': 10,
  'ai-nutrition-critique': 20,
  'ai-nutrition-macros': 20,
  'ai-coach-note': 40,
  'ai-extract-goals': 30,
  'ai-message-draft': 60,           // cheap + high-frequency (messenger)
  'ai-weekly-brief': 30,
}
const DEFAULT_LIMIT = 30
const WINDOW_MS = 60 * 60 * 1000

/**
 * Returns a 429 NextResponse if the caller is over their limit for this
 * route, otherwise logs the call and returns null (proceed).
 *
 * Usage in a route, AFTER the auth + ownership checks pass:
 *
 *   const limited = await enforceAiRateLimit(user.id, 'ai-swap')
 *   if (limited) return limited
 */
export async function enforceAiRateLimit(
  userId: string,
  route: string,
): Promise<NextResponse | null> {
  const limit = LIMITS[route] ?? DEFAULT_LIMIT
  const admin = createAdminClient()
  const since = new Date(Date.now() - WINDOW_MS).toISOString()

  const { count, error } = await admin
    .from('ai_usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('route', route)
    .gte('created_at', since)

  // Fail open on a metering error -- never block real work over a counter bug.
  if (error) return null

  if ((count ?? 0) >= limit) {
    return NextResponse.json(
      { error: `You've reached the hourly limit for this AI feature (${limit}/hour). Please try again shortly.` },
      { status: 429, headers: { 'Retry-After': '3600' } },
    )
  }

  // Log this call. Fire-and-forget on failure (don't block the call if the
  // insert hiccups -- the worst case is one uncounted request).
  await admin.from('ai_usage_log').insert({ user_id: userId, route })
  return null
}
