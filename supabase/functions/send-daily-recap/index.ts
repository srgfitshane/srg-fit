import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const COACH_EMAIL = 'shane@srgfit.training'
const COACH_NAME  = 'Shane'
const SITE_URL    = 'https://srgfit.app'

serve(async (_req: Request) => {
  try {
    const adminDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) throw new Error('RESEND_API_KEY not set')

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const coachId = '133f93d0-2399-4542-bc57-db4de8b98d79'

    // ── Respect the coach's self-serve toggle ─────────────────────────────
    // notification_preferences.email_daily_recap defaults true, so a missing
    // row (or true) still sends. Only an explicit false silences the recap.
    const { data: recapPref } = await adminDb
      .from('notification_preferences')
      .select('email_daily_recap')
      .eq('user_id', coachId)
      .maybeSingle()
    if (recapPref?.email_daily_recap === false) {
      console.log('Daily recap disabled by coach preference — skipping')
      return new Response(JSON.stringify({ success:true, skipped:true, reason:'disabled_by_pref' }), {
        headers:{'Content-Type':'application/json'}, status:200
      })
    }

    // ── Gather all stats in parallel ──────────────────────────────────────
    const results = await Promise.all([
      adminDb.from('workout_sessions').select('id', { count:'exact', head:true })
        .eq('status','completed').gte('completed_at', since),
      adminDb.from('daily_checkins').select('id', { count:'exact', head:true })
        .gte('created_at', since),
      adminDb.from('messages').select('id', { count:'exact', head:true })
        .gte('created_at', since).neq('sender_id', coachId),
      adminDb.from('community_posts').select('id', { count:'exact', head:true })
        .eq('archived', false).gte('created_at', since),
      adminDb.from('workout_sessions').select('id', { count:'exact', head:true })
        .eq('status','completed').lt('review_due_at', new Date().toISOString()).is('coach_reviewed_at', null),
      adminDb.from('clients').select('id, profile_id, display_name, profiles!profile_id(full_name)')
        .eq('active', true).eq('client_type','online'),
      adminDb.from('workout_sessions')
        .select('id, title, completed_at, session_rpe, notes_client, clients!client_id(id, profile_id, display_name, profiles!profile_id(full_name))')
        .eq('status','completed').gte('completed_at', since).order('completed_at', { ascending:false }),
      adminDb.from('milestones')
        .select('client_id, message, milestone_type, clients!client_id(profile_id, display_name, profiles!profile_id(full_name))')
        .gte('created_at', since),
    ])

    // PostgREST errors don't throw — surface them so a bad column/RLS change
    // shows up in the function logs instead of silently emptying a section
    const queryErrors = results.map((r: any) => r.error?.message).filter(Boolean)
    if (queryErrors.length) console.error('Query errors:', JSON.stringify(queryErrors))

    const [
      { count: workoutsCompleted },
      { count: checkinsSubmitted },
      { count: clientMessages },
      { count: communityPosts },
      { count: pendingReviews },
      { data: activeClients },
      { data: completedSessions },
      { data: newPRs },
    ] = results as any[]

    // Skip if nothing happened
    const totalActivity = (workoutsCompleted||0) + (checkinsSubmitted||0) + (clientMessages||0)
    if (totalActivity === 0) {
      console.log('No activity today — skipping recap')
      return new Response(JSON.stringify({ success:true, skipped:true }), {
        headers:{'Content-Type':'application/json'}, status:200
      })
    }

    const clientCount = activeClients?.length || 0
    const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })

    // ── Build workout rows ─────────────────────────────────────────────────
    const workoutRows = (completedSessions || []).map((s: any) => {
      const clientName = s.clients?.profiles?.full_name || s.clients?.display_name || 'Unknown'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#eeeef8;font-size:13px">${clientName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#00c9b1;font-size:13px;font-weight:700">${s.title || 'Workout'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#8888a8;font-size:13px;text-align:center">${s.session_rpe ? `RPE ${s.session_rpe}` : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#8888a8;font-size:13px">${s.notes_client ? s.notes_client.slice(0,60)+(s.notes_client.length>60?'…':'') : '—'}</td>
      </tr>`
    }).join('')

    // ── Build milestone rows ───────────────────────────────────────────────
    const milestoneRows = (newPRs || []).map((m: any) => {
      const clientName = m.clients?.profiles?.full_name || m.clients?.display_name || 'Unknown'
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#eeeef8;font-size:13px">${clientName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1d1d2e;color:#f5a623;font-size:13px;font-weight:700">${m.message}</td>
      </tr>`
    }).join('')

    // ── Stat pill helper ───────────────────────────────────────────────────
    const pill = (val: number, label: string, color: string) =>
      `<div style="background:#0f0f1a;border:1px solid ${color}30;border-radius:12px;padding:16px 20px;text-align:center;min-width:90px">
        <div style="font-size:28px;font-weight:900;color:${color}">${val}</div>
        <div style="font-size:11px;color:#8888a8;margin-top:2px;font-weight:600">${label}</div>
      </div>`

    const pendingBadge = (pendingReviews||0) > 0
      ? `<div style="background:#ef4444;color:#fff;border-radius:8px;padding:12px 20px;margin-bottom:24px;font-size:13px;font-weight:700">⚠️ ${pendingReviews} workout review${(pendingReviews||0)>1?'s':''} overdue — <a href="${SITE_URL}/dashboard/coach/reviews" style="color:#fff">Review now →</a></div>`
      : ''

    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#080810;font-family:'Helvetica Neue',Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:32px 20px">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:28px">
    <div style="font-size:26px;font-weight:900;color:#00c9b1;letter-spacing:-.5px">SRG FIT</div>
    <div style="font-size:11px;color:#5a5a78;letter-spacing:.12em;margin-top:2px">DAILY RECAP</div>
    <div style="font-size:13px;color:#8888a8;margin-top:6px">${today}</div>
  </div>

  <!-- Pending reviews alert -->
  ${pendingBadge}

  <!-- Stats row -->
  <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-bottom:28px">
    ${pill(workoutsCompleted||0,'Workouts','#00c9b1')}
    ${pill(checkinsSubmitted||0,'Check-ins','#8b5cf6')}
    ${pill(clientMessages||0,'Messages','#f5a623')}
    ${pill(communityPosts||0,'Community','#f472b6')}
    ${pill(clientCount,'Active Clients','#22c55e')}
  </div>

  <!-- Workouts today -->
  ${(completedSessions||[]).length > 0 ? `
  <div style="background:#0f0f1a;border:1px solid #252538;border-radius:14px;overflow:hidden;margin-bottom:20px">
    <div style="padding:14px 16px;border-bottom:1px solid #252538;display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">💪</span>
      <span style="font-size:14px;font-weight:800;color:#eeeef8">Workouts Completed</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <thead>
        <tr style="background:#161624">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#5a5a78;font-weight:700">CLIENT</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#5a5a78;font-weight:700">WORKOUT</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#5a5a78;font-weight:700">RPE</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#5a5a78;font-weight:700">NOTES</th>
        </tr>
      </thead>
      <tbody>${workoutRows}</tbody>
    </table>
  </div>` : ''}

  <!-- Milestones/PRs today -->
  ${(newPRs||[]).length > 0 ? `
  <div style="background:#0f0f1a;border:1px solid #f5a62330;border-radius:14px;overflow:hidden;margin-bottom:20px">
    <div style="padding:14px 16px;border-bottom:1px solid #252538;display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">🏆</span>
      <span style="font-size:14px;font-weight:800;color:#eeeef8">PRs &amp; Milestones</span>
    </div>
    <table style="width:100%;border-collapse:collapse">
      <tbody>${milestoneRows}</tbody>
    </table>
  </div>` : ''}

  <!-- CTA -->
  <div style="text-align:center;margin-top:24px">
    <a href="${SITE_URL}/dashboard/coach" style="display:inline-block;background:#00c9b1;color:#000;border-radius:12px;padding:13px 32px;font-size:14px;font-weight:900;text-decoration:none">Open Coach Dashboard →</a>
  </div>

  <!-- Footer -->
  <div style="text-align:center;margin-top:28px;font-size:11px;color:#5a5a78">
    SRG Fit · Be Kind to Yourself &amp; Stay Awesome 💪
  </div>
</div>
</body></html>`

    // ── Send via Resend ────────────────────────────────────────────────────
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${resendKey}` },
      body: JSON.stringify({
        from: 'SRG Fit <onboarding@resend.dev>',
        to: [COACH_EMAIL],
        subject: `📊 Daily Recap — ${today}`,
        html,
      })
    })

    const result = await res.json()
    console.log('Resend status:', res.status, JSON.stringify(result))

    return new Response(JSON.stringify({
      success: res.ok,
      resend_status: res.status,
      resend_result: result,
      workoutsCompleted, checkinsSubmitted, clientMessages, pendingReviews,
    }), {
      headers: {'Content-Type':'application/json'}, status: res.ok ? 200 : 500
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Unhandled error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      headers: {'Content-Type':'application/json'}, status: 500
    })
  }
})
