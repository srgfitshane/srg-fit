import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  return user
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Using service role key to bypass RLS since the function is trusted to send notifications
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { user_id, notification_type, title, body, link_url } = await req.json()

    if (!user_id || !notification_type) {
      return new Response(JSON.stringify({ error: 'Missing user_id or notification_type' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
    }

    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (user_id !== user.id) {
      const { data: recipientClient } = await supabase
        .from('clients')
        .select('coach_id, profile_id')
        .eq('profile_id', user_id)
        .maybeSingle()

      const { data: callerClient } = await supabase
        .from('clients')
        .select('coach_id, profile_id')
        .eq('profile_id', user.id)
        .maybeSingle()

      const isCoachNotifyingOwnClient = callerProfile?.role === 'coach' && recipientClient?.coach_id === user.id
      const isClientNotifyingOwnCoach = callerProfile?.role !== 'coach' && !!callerClient?.coach_id && callerClient.coach_id === user_id

      if (!isCoachNotifyingOwnClient && !isClientNotifyingOwnCoach) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 })
      }
    }

    const { error } = await supabase.from('notifications').insert({
      user_id,
      notification_type,
      title: title || 'New Notification',
      body: body || '',
      link_url: link_url || null,
      is_read: false
    })

    if (error) {
       console.error('Error inserting notification:', error)
       return new Response(JSON.stringify({ error: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }

    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 })
  } catch (err: any) {
    console.error('Unhandled error:', err)
    return new Response(JSON.stringify({ error: err.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
  }
})
