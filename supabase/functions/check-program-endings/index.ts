import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import { requireServiceCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://srgfit.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

// Notify coaches when a client's program is in its last week (or just ended).
// pg_cron hits this daily at 12:05 UTC (~7:05am ET).
//
// Eligibility (computed by get_all_ending_programs_for_cron RPC):
//   - status='active' non-template program
//   - >=4 sessions (skips ad-hoc "My Workouts" containers)
//   - max(scheduled_date) within -7..+7 days of today
//   - ending_notified_at IS NULL OR < now() - 14 days  (dedupe)
//
// Delivery: send-notification already does the bell row insert + push, so we
// DO NOT insert into notifications here -- doing both would double-insert.
// We stamp ending_notified_at unconditionally; the RPC's 14-day filter is
// what guarantees we don't re-notify the same program within 2 weeks.
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const denied = await requireServiceCaller(req, { headers: corsHeaders })
    if (denied) return denied
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const { data: candidates, error: rpcErr } = await supabase
      .rpc('get_all_ending_programs_for_cron')

    if (rpcErr) throw rpcErr

    let notified = 0
    const errors: string[] = []

    for (const row of (candidates || []) as Array<{
      program_id: string
      program_name: string
      coach_id: string
      client_id: string
      client_profile_id: string | null
      client_name: string
      last_session: string
      total_sessions: number
      days_until_last: number
    }>) {
      try {
        // 1. Stamp ending_notified_at FIRST so a partial failure later doesn't
        // re-notify on the next run. The RPC's 14-day filter ensures we won't
        // even see this program again until the window resets.
        const { error: updErr } = await supabase
          .from('programs')
          .update({ ending_notified_at: new Date().toISOString() })
          .eq('id', row.program_id)
        if (updErr) {
          errors.push(`stamp failed (program=${row.program_id}): ${updErr.message}`)
          continue
        }

        // 2. Build the message
        const days = row.days_until_last
        const wording = days > 1
          ? `${row.client_name}'s ${row.program_name} ends in ${days} days`
          : days === 1
            ? `${row.client_name}'s ${row.program_name} ends tomorrow`
            : days === 0
              ? `${row.client_name}'s ${row.program_name} ends today`
              : days === -1
                ? `${row.client_name}'s ${row.program_name} ended yesterday`
                : `${row.client_name}'s ${row.program_name} ended ${Math.abs(days)} days ago`

        const title = days >= 0 ? '⏳ Program winding down' : '✅ Program just ended'
        const body = `${wording}. Plan the next phase or wrap it up.`
        const link = `/dashboard/coach/clients/${row.client_id}`

        // 3. send-notification handles both the bell row insert AND the push
        const pushRes = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id: row.coach_id,
            notification_type: 'program_ending',
            title,
            body,
            link_url: link,
          }),
        })
        if (!pushRes.ok) {
          const txt = await pushRes.text().catch(() => '<no body>')
          errors.push(`send-notification failed (program=${row.program_id}, status=${pushRes.status}): ${txt}`)
          continue
        }

        notified++
      } catch (innerErr) {
        const msg = innerErr instanceof Error ? innerErr.message : String(innerErr)
        errors.push(`program=${row.program_id}: ${msg}`)
      }
    }

    return new Response(
      JSON.stringify({ success: true, candidates: (candidates || []).length, notified, errors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[check-program-endings] fatal', msg)
    return new Response(
      JSON.stringify({ error: msg }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    )
  }
})
