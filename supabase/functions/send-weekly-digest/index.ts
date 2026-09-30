import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { requireServiceCaller } from '../_shared/auth.ts'

const COACH_ID = '133f93d0-2399-4542-bc57-db4de8b98d79'

Deno.serve(async (req: Request) => {
  const denied = await requireServiceCaller(req)
  if (denied) return denied

  const adminDb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekAgoStr   = new Date(weekStart.getTime() - 7*24*60*60*1000).toISOString().split('T')[0]

  const { data: clients } = await adminDb
    .from('clients')
    .select('id, profiles!profile_id(full_name)')
    .eq('coach_id', COACH_ID)
    .eq('active', true)

  if (!clients?.length) {
    return new Response(JSON.stringify({ ok: true, message: 'No active clients' }), { headers: { 'Content-Type': 'application/json' } })
  }

  const results = []

  for (const client of clients) {
    const clientId = client.id
    const name = (client.profiles as any)?.full_name || 'Client'
    const firstName = name.split(' ')[0]

    try {
      const [{ data: sessions }, { data: checkins }, { data: habits }, { data: goals }, { data: prs }] = await Promise.all([
        adminDb.from('workout_sessions')
          .select('id, title, status, scheduled_date, session_rpe, mood, duration_seconds, completed_at')
          .eq('client_id', clientId).gte('scheduled_date', weekAgoStr).lt('scheduled_date', weekStartStr).order('scheduled_date'),
        adminDb.from('daily_checkins')
          .select('checkin_date, sleep_quality, energy_score, mood_emoji, stress_score')
          .eq('client_id', clientId).gte('checkin_date', weekAgoStr).lt('checkin_date', weekStartStr).order('checkin_date'),
        adminDb.from('habit_logs')
          .select('logged_date, value, habit:habits(label, unit)')
          .eq('client_id', clientId).gte('logged_date', weekAgoStr).lt('logged_date', weekStartStr),
        adminDb.from('client_goals')
          .select('title, type, current_value, target_value, unit, status')
          .eq('client_id', clientId).eq('status', 'active'),
        adminDb.from('personal_records')
          .select('logged_date, weight_pr, pr_type, exercise:exercises(name)')
          .eq('client_id', clientId).gte('logged_date', weekAgoStr)
          .order('logged_date', { ascending: false }).limit(5),
      ])

      const completed = (sessions || []).filter((s: any) => s.status === 'completed')
      const assigned  = (sessions || []).filter((s: any) => s.status === 'assigned')
      const avgEnergy = checkins?.length ? Math.round((checkins.reduce((a: number, c: any) => a + (c.energy_score || 0), 0) / checkins.length) * 10) / 10 : null
      const avgSleep  = checkins?.length ? Math.round((checkins.reduce((a: number, c: any) => a + (c.sleep_quality || 0), 0) / checkins.length) * 10) / 10 : null

      const flags: string[] = []
      if (completed.length === 0 && assigned.length > 0) flags.push('missed_workouts')
      if (checkins?.length === 0) flags.push('no_checkin')
      if (avgEnergy !== null && avgEnergy < 2.5) flags.push('low_energy')
      if (avgSleep !== null && avgSleep < 2.5) flags.push('poor_sleep')
      if (prs?.length) flags.push('new_pr')

      const sessionSummary = sessions?.length ? sessions.map((s: any) => `${s.scheduled_date} - ${s.title} (${s.status}${s.session_rpe ? ', RPE '+s.session_rpe : ''}${s.duration_seconds ? ', '+Math.floor(s.duration_seconds/60)+'min' : ''})`).join('\n') : 'No sessions scheduled'
      const checkinSummary = checkins?.length ? checkins.map((c: any) => `${c.checkin_date}: sleep ${c.sleep_quality ?? '-'}/5, energy ${c.energy_score ?? '-'}/5${c.mood_emoji ? ', '+c.mood_emoji : ''}`).join('\n') : 'No check-ins logged'
      const prSummary = prs?.length ? prs.map((p: any) => `${(p.exercise as any)?.name || 'exercise'}: ${p.weight_pr}lbs`).join(', ') : 'None'
      const goalSummary = goals?.length ? goals.map((g: any) => `${g.title}: ${g.current_value ?? 0}/${g.target_value} ${g.unit || ''}`).join('\n') : 'No active goals'

      const prompt = `You are an AI coaching assistant helping a personal trainer named Shane review his client's week.\n\nClient: ${firstName}\nWeek: ${weekAgoStr} to ${weekStartStr}\n\nWorkouts this week:\n${sessionSummary}\n\nDaily check-ins (sleep/energy 1-5 scale):\n${checkinSummary}\n\nNew PRs: ${prSummary}\n\nActive goals:\n${goalSummary}\n\nWrite a concise weekly digest for Shane (the coach) - NOT for the client. Be direct and specific. Include: 1. One sentence on workout adherence 2. One sentence on recovery/energy trends if data exists 3. One concrete suggested action for this week 4. Any wins worth celebrating\n\nMax 4 sentences total. Sound like a knowledgeable colleague, not a chatbot. No bullet points. No headers.`

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
      })

      const aiData = await aiRes.json()
      const summary = aiData.content?.[0]?.text || 'Unable to generate summary.'

      await adminDb.from('weekly_digests').upsert({
        coach_id: COACH_ID, client_id: clientId, week_start: weekStartStr,
        summary, workouts_done: completed.length, checkins_done: checkins?.length || 0,
        avg_energy: avgEnergy, avg_sleep: avgSleep, flags,
      }, { onConflict: 'coach_id,client_id,week_start' })

      results.push({ client: firstName, ok: true, flags })
    } catch (err) {
      results.push({ client, ok: false, error: String(err) })
    }
  }

  try {
    await adminDb.functions.invoke('send-notification', {
      body: { user_id: COACH_ID, notification_type: 'weekly_digest', title: 'Weekly Client Digest Ready', body: `${clients.length} client summaries generated for this week`, link_url: '/dashboard/coach' }
    })
  } catch { /* fire-and-forget */ }

  return new Response(JSON.stringify({ ok: true, week: weekStartStr, results }), { headers: { 'Content-Type': 'application/json' } })
})
