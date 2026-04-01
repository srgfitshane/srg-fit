'use client'
import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

export function usePushNotifications(userId: string | null) {
  const attempted = useRef(false)

  useEffect(() => {
    if (!userId || attempted.current) return
    if (!VAPID_PUBLIC_KEY) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return

    attempted.current = true

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
        await navigator.serviceWorker.ready

        const permission = Notification.permission
        if (permission === 'denied') return

        // Already have a subscription — just save it
        const existing = await reg.pushManager.getSubscription()
        if (existing) { await saveSubscription(existing, userId); return }

        // Request permission if not yet granted
        if (permission === 'default') {
          const result = await Notification.requestPermission()
          if (result !== 'granted') return
        }

        // Subscribe to push
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        })

        await saveSubscription(subscription, userId)
      } catch (err) {
        console.error('[push] registration error:', err)
      }
    }

    void register()
  }, [userId])
}

async function saveSubscription(sub: PushSubscription, userId: string) {
  const supabase = createClient()
  const json = sub.toJSON()
  const keys = json.keys as { p256dh: string; auth: string } | undefined
  if (!keys?.p256dh || !keys?.auth) return

  await supabase.from('push_subscriptions').upsert({
    user_id:    userId,
    endpoint:   sub.endpoint,
    p256dh:     keys.p256dh,
    auth:       keys.auth,
    user_agent: navigator.userAgent.slice(0, 255),
  }, { onConflict: 'user_id,endpoint' })
}
