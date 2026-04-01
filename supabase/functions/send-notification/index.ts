import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// Dedicated service-role client — never touched by user JWTs
const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false }
})

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization') || ''

    // Validate user JWT using a SEPARATE client so adminDb stays clean
    let callerId: string | null = null
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '')
      const authClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } }
      })
      const { data: { user }, error } = await authClient.auth.getUser()
      if (!error && user) callerId = user.id
      else console.error('Auth error:', error?.message)
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401
      })
    }

    const { user_id, notification_type, title, body, link_url, url } = await req.json()
    if (!user_id || !notification_type) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      })
    }

    // 1. Insert using clean adminDb (service_role context preserved)
    const { error: dbErr } = await adminDb.from('notifications').insert({
      user_id,
      notification_type,
      title: title || 'New Notification',
      body: body || '',
      link_url: link_url || url || null,
      is_read: false,
    })
    if (dbErr) console.error('DB insert error:', JSON.stringify(dbErr))
    else console.log('Notification inserted for', user_id)

    // 2. Fire Web Push
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')     || 'mailto:shane@srgfit.training'

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
      const { data: subs } = await adminDb
        .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', user_id)

      console.log(`Push subs for ${user_id}: ${subs?.length || 0}`)

      if (subs && subs.length > 0) {
        const payload = JSON.stringify({
          title: title || 'SRG Fit',
          body:  body  || '',
          icon:  '/icon-192.png',
          badge: '/icon-32.png',
          url:   link_url || url || '/dashboard/client',
        })
        const expiredEndpoints: string[] = []
        await Promise.allSettled(subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload, { TTL: 86400 }
            )
            console.log('Push sent ok to', sub.endpoint.slice(0, 40))
          } catch (e: unknown) {
            const status = (e as { statusCode?: number }).statusCode
            console.error('Push error:', status, (e as Error).message?.slice(0, 100))
            if (status === 410 || status === 404) expiredEndpoints.push(sub.endpoint)
          }
        }))
        if (expiredEndpoints.length > 0) {
          await adminDb.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
        }
      }
    } else {
      console.warn('VAPID keys not set')
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
