import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import webpush from 'https://esm.sh/web-push@3.6.7'
import { requireServiceCaller } from '../_shared/auth.ts'

const SITE_URL = 'https://srgfit.app'

serve(async (req: Request) => {
  try {
    const denied = await requireServiceCaller(req)
    if (denied) return denied
    const adminDb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    )

    // Check for new community posts in the last 24 hours
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { count: newPostCount } = await adminDb
      .from('community_posts')
      .select('id', { count: 'exact', head: true })
      .eq('archived', false)
      .gt('created_at', since)

    // Nothing new — skip entirely
    if (!newPostCount || newPostCount === 0) {
      console.log('No new community posts in last 24h — skipping digest')
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no_new_posts' }), {
        headers: { 'Content-Type': 'application/json' }, status: 200
      })
    }

    console.log(`Found ${newPostCount} new community post(s) — sending digest`)

    // Get all active online clients
    const { data: clients } = await adminDb
      .from('clients')
      .select('profile_id')
      .eq('active', true)
      .eq('client_type', 'online')
      .not('profile_id', 'is', null)

    if (!clients || clients.length === 0) {
      console.log('No active clients to notify')
      return new Response(JSON.stringify({ success: true, notified: 0 }), {
        headers: { 'Content-Type': 'application/json' }, status: 200
      })
    }

    const title = newPostCount === 1
      ? '1 new post in the community 💬'
      : `${newPostCount} new posts in the community 💬`
    const body = 'Tap to see what\'s happening in SRG Fit'
    const link = `${SITE_URL}/dashboard/client?tab=messages`

    // Setup web push
    const vapidPublic  = Deno.env.get('VAPID_PUBLIC_KEY')  || ''
    const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || ''
    const vapidSubject = Deno.env.get('VAPID_SUBJECT')     || 'mailto:shane@srgfit.training'
    if (vapidPublic && vapidPrivate) {
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    }

    let notified = 0

    for (const client of clients) {
      const profileId = client.profile_id
      if (!profileId) continue

      // Insert in-app notification
      const { error: dbErr } = await adminDb.from('notifications').insert({
        user_id: profileId,
        notification_type: 'general',
        title,
        body,
        link_url: `${SITE_URL}/dashboard/client/community`,
        is_read: false,
      })
      if (dbErr) console.error(`DB insert failed for ${profileId}:`, JSON.stringify(dbErr))

      // Send push notification
      if (vapidPublic && vapidPrivate) {
        const { data: subs } = await adminDb
          .from('push_subscriptions')
          .select('endpoint, p256dh, auth')
          .eq('user_id', profileId)

        if (subs && subs.length > 0) {
          const payload = JSON.stringify({
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-32.png',
            url: `${SITE_URL}/dashboard/client/community`,
          })
          const expiredEndpoints: string[] = []
          await Promise.allSettled(subs.map(async (sub) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload, { TTL: 86400 }
              )
            } catch (e: unknown) {
              const status = (e as { statusCode?: number }).statusCode
              if (status === 410 || status === 404) expiredEndpoints.push(sub.endpoint)
            }
          }))
          if (expiredEndpoints.length > 0) {
            await adminDb.from('push_subscriptions').delete().in('endpoint', expiredEndpoints)
          }
        }
      }

      notified++
    }

    console.log(`Community digest sent to ${notified} clients`)
    return new Response(JSON.stringify({ success: true, notified, newPostCount }), {
      headers: { 'Content-Type': 'application/json' }, status: 200
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('Unhandled error:', msg)
    return new Response(JSON.stringify({ error: msg }), {
      headers: { 'Content-Type': 'application/json' }, status: 500
    })
  }
})
