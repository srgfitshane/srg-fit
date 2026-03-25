import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Must use service role so cron tasks bypass RLS
    const supabase = createClient(supabaseUrl, supabaseKey)

    const now = new Date().toISOString()
    
    // Find all active check-in schedules that are due (or overdue)
    const { data: schedules, error: fetchErr } = await supabase
      .from('check_in_schedules')
      .select('*, clients(profile_id)')
      .eq('active', true)
      .lte('next_send_at', now)

    if (fetchErr) throw fetchErr

    let sentCount = 0

    for (const sched of (schedules || [])) {
      try {
        let formId = sched.form_id
        
        // If no specific form was selected, grab the default check-in form for that coach
        if (!formId) {
          const { data: form } = await supabase
            .from('onboarding_forms')
            .select('id')
            .eq('coach_id', sched.coach_id)
            .or('form_type.eq.check_in,is_checkin_type.eq.true')
            .limit(1)
            .single()
          if (form) formId = form.id
        }

        if (!formId) {
          console.log(`Skipping schedule ${sched.id}: No valid form found for coach ${sched.coach_id}`)
          continue
        }

        // 1. Assign the form to the client
        const { error: insertErr } = await supabase.from('client_form_assignments').insert({
          coach_id: sched.coach_id,
          client_id: sched.client_id,
          form_id: formId,
          checkin_schedule_id: sched.id,
          status: 'pending',
          note: 'Automated weekly check-in',
        })
        
        if (insertErr) {
          console.error(`Failed assigning form for schedule ${sched.id}`, insertErr)
          continue
        }

        // 2. Push Notification to the client's dashboard
        const userProfileId = sched.clients?.profile_id
        if (userProfileId) {
          await supabase.from('notifications').insert({
            user_id: userProfileId,
            notification_type: 'checkin_due',
            title: 'Check-in time! 📋',
            body: 'Your weekly check-in is due. Tap to fill it out.',
            link_url: '/dashboard/client/checkin',
            is_read: false
          })
        }

        // 3. Update next_send_at to next week
        const nextDate = new Date(sched.next_send_at)
        nextDate.setDate(nextDate.getDate() + 7)
        // Safety: If it was disabled for months and turned back on, avoid sending 10 checkins in a row.
        while (nextDate <= new Date()) {
            nextDate.setDate(nextDate.getDate() + 7)
        }

        await supabase.from('check_in_schedules').update({
          next_send_at: nextDate.toISOString()
        }).eq('id', sched.id)

        sentCount++
      } catch (innerErr) {
          console.error(`Error processing individual schedule ${sched.id}`, innerErr)
      }
    }

    return new Response(JSON.stringify({ success: true, processed: sentCount }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (err: any) {
    console.error('Unhandled error in send-weekly-checkins:', err)
    return new Response(JSON.stringify({ error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
