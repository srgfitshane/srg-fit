import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

// web-push via esm.sh — Deno compatible
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://srgfit.app',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization')
  if (!authorization) return null
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { global: { headers: { Authorization: authorization } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getAuthenticatedUser(req)
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { user_id, notification_type, title, body, link_url, url } = await req.json()

    if (!user_id || !notification_type) {
      return new Response(JSON.stringify({ error: 'Missing user_id or notification_type' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      })
    }

    // Auth check — coach can notify own clients, client can notify own coach
    if (user_id !== user.id) {
      const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
      const { data: recipientClient } = await supabase.from('clients').select('coach_id').eq('profile_id', user_id).maybeSingle()
      const { data: callerClient } = await supabase.from('clients').select('coach_id').eq('profile_id', user.id).maybeSingle()

      const isCoachToClient = callerProfile?.role === 'coach' && recipientClient?.coach_id === user.id
      const isClientToCoach = callerProfile?.role !== 'coach' && !!callerClient?.coach_id && callerClient.coach_id === user_id

      if (!isCoachToClient && !isClientToCoach) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403
        })
      }
    }

    // 1. Insert in-app notification
    const { error: dbErr } = await supabase.from('notifications').insert({
      user_id,
      notification_type,
      title: title || 'New Notification',
      body: body || '',
      link_url: link_url || url || null,
      is_read: false,
    })
    if (dbErr) console.error('DB insert error:', dbErr)

    // 2. Fire Web Push
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')     || 'mailto:shane@srgfit.training'

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', user_id)

      if (subs && subs.length > 0) {
        const payload = JSON.stringify({
          title: title || 'SRG Fit',
          body:  body  || '',
          icon:  '/icon-192.png',
          badge: '/icon-32.png',
          url:   link_url || url || '/dashboard/client',
        })

        const expiredEndpoints: string[] = []

        await Promise.allSettled(
          subs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload,
                { TTL: 86400 }
              )
            } catch (e: unknown) {
              const status = (e as { statusCode?: number }).statusCode
              if (status === 410 || status === 404) expiredEndpoints.push(sub.endpoint)
              else console.error('Web push error:', e)
            }
          })
        )

        // Remove expired subscriptions
        if (expiredEndpoints.length > 0) {
          await supabase.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
        }
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Unhandled error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500
    })
  }
})
