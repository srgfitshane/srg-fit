import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Using service role key to bypass RLS since the function is trusted to send notifications
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { user_id, notification_type, title, body, link_url } = await req.json()

    if (!user_id || !notification_type) {
      return new Response(JSON.stringify({ error: 'Missing user_id or notification_type' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 })
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
