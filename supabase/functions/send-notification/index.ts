import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'https://esm.sh/web-push@3.6.7'
import { authError, canNotify, isServiceCaller, requireUser } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const adminDb = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false, autoRefreshToken: false } }
)

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return authError(405, 'Method not allowed', corsHeaders)

  try {
    const serviceCaller = isServiceCaller(req)
    const user = serviceCaller ? null : await requireUser(req, adminDb)
    if (!serviceCaller && !user) return authError(401, 'Unauthorized', corsHeaders)
    const input = await req.json().catch(() => null)
    if (!input || typeof input !== 'object' || Array.isArray(input)) return authError(400, 'Invalid request body', corsHeaders)
    const { user_id, notification_type, title, body, link_url, url } = input

    const link = link_url || url || null
    if (typeof user_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user_id)
      || typeof notification_type !== 'string' || notification_type.length > 80
      || (title !== undefined && (typeof title !== 'string' || title.length > 200))
      || (body !== undefined && (typeof body !== 'string' || body.length > 2000))
      || (link !== null && (typeof link !== 'string' || !/^\/(?!\/)/.test(link) || /[\\\r\n]/.test(link) || link.length > 1000))) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400
      })
    }

    if (user && !await canNotify(adminDb, user.id, user_id, notification_type)) {
      return authError(403, 'You cannot notify this recipient', corsHeaders)
    }

    // 1. Insert in-app notification
    const { error: dbErr } = await adminDb.from('notifications').insert({
      user_id,
      actor_id: user?.id || null,
      notification_type,
      title: title || 'New Notification',
      body: body || '',
      link_url: link,
      is_read: false,
    })
    if (dbErr) throw new Error('Could not save notification')

    // 2. Fire Web Push
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')     || 'mailto:shane@srgfit.training'

    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
      const { data: subs } = await adminDb
        .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', user_id)

      if (subs && subs.length > 0) {
        const payload = JSON.stringify({
          title: title || 'SRG Fit',
          body:  body  || '',
          icon:  '/icon-192.png',
          badge: '/icon-32.png',
          url:   link || '/dashboard/client',
        })
        const expiredEndpoints: string[] = []
        await Promise.allSettled(subs.map(async (sub) => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload, { TTL: 86400 }
            )
            console.log('Push sent ok')
          } catch (e: unknown) {
            const status = (e as { statusCode?: number }).statusCode
            console.error('Push error:', status)
            if (status === 410 || status === 404) expiredEndpoints.push(sub.endpoint)
          }
        }))
        if (expiredEndpoints.length > 0) {
          await adminDb.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
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
