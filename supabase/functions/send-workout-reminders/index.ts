import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://srgfit.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Morning workout reminder. pg_cron hits this daily at 12:15 UTC (~8:15am ET,
// after send-weekly-checkins at 12:00 and check-program-endings at 12:05).
//
// Eligibility:
//   - workout_sessions.scheduled_date = today (America/New_York)
//   - status = 'assigned' (not started or completed), program_id NOT NULL
//   - client active, not paused, not archived, not in_person
//
// One push per client, naming their first session of the day. Dedupe: skips
// clients who already have a workout_due bell row today, so a manual re-run
// can't double-push.
//
// Delivery: send-notification does the bell row insert AND the push — do NOT
// also insert into notifications here (double bell rows).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    // "Today" in the user base's timezone (ET), not UTC — toISOString would
    // hand back tomorrow's date for evening runs. en-CA formats YYYY-MM-DD.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })

    const { data: sessions, error: sesErr } = await supabase
      .from('workout_sessions')
      .select('id, title, client_id, client:clients!workout_sessions_client_id_fkey(id, profile_id, active, paused, archived, training_type)')
      .eq('scheduled_date', today)
      .eq('status', 'assigned')
      .not('program_id', 'is', null)
    if (sesErr) throw sesErr

    // First eligible session per client.
    type SessionRow = {
      id: string
      title: string | null
      client_id: string
      client: {
        profile_id: string | null
        active: boolean | null
        paused: boolean | null
        archived: boolean | null
        training_type: string | null
      } | null
    }
    const byClient = new Map<string, { sessionId: string; title: string; profileId: string }>()
    for (const s of (sessions || []) as SessionRow[]) {
      const c = s.client
      if (!c?.profile_id || c.active === false || c.paused || c.archived || c.training_type === 'in_person') continue
      if (!byClient.has(s.client_id)) {
        byClient.set(s.client_id, { sessionId: s.id, title: s.title || 'Your workout', profileId: c.profile_id })
      }
    }

    // Dedupe against bell rows already created today.
    const profileIds = [...byClient.values()].map(v => v.profileId)
    const alreadyNotified = new Set<string>()
    if (profileIds.length > 0) {
      const { data: existing } = await supabase
        .from('notifications')
        .select('user_id')
        .eq('notification_type', 'workout_due')
        .in('user_id', profileIds)
        .gte('created_at', `${today}T00:00:00-05:00`)
      for (const n of (existing || []) as Array<{ user_id: string }>) alreadyNotified.add(n.user_id)
    }

    let notified = 0
    const errors: string[] = []

    for (const { sessionId, title, profileId } of byClient.values()) {
      if (alreadyNotified.has(profileId)) continue
      try {
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: profileId,
            notification_type: 'workout_due',
            title: '💪 Workout day',
            body: `${title} is on the plan today — let's get it.`,
            link_url: `/dashboard/client/workout/${sessionId}`,
          }),
        })
        if (!pushRes.ok) {
          const txt = await pushRes.text().catch(() => '<no body>')
          errors.push(`send-notification failed (session=${sessionId}, status=${pushRes.status}): ${txt}`)
          continue
        }
        notified++
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        errors.push(`session=${sessionId}: ${msg}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, date: today, candidates: byClient.size, notified, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[send-workout-reminders] fatal', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
