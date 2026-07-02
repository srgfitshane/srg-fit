'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
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

async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/sw.js?v=2', { scope: '/' })
  // Force new worker to activate immediately without waiting for old tabs to close
  reg.addEventListener('updatefound', () => {
    const newWorker = reg.installing
    if (newWorker) {
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          newWorker.postMessage({ type: 'SKIP_WAITING' })
        }
      })
    }
  })
  await navigator.serviceWorker.ready
  return reg
}

async function subscribeAndSave(reg: ServiceWorkerRegistration, userId: string) {
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  })
  await saveSubscription(subscription, userId)
}

export function usePushNotifications(userId: string | null) {
  const attempted = useRef(false)
  const [needsPrompt, setNeedsPrompt] = useState(false)

  useEffect(() => {
    if (!userId || attempted.current) return
    if (!VAPID_PUBLIC_KEY) return
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return

    attempted.current = true

    const register = async () => {
      try {
        const reg = await registerServiceWorker()
        const permission = Notification.permission
        if (permission === 'denied') return
        if (permission === 'default') {
          // Do NOT call Notification.requestPermission() here. iOS Safari
          // requires the request to come from a user gesture — an automatic
          // call on page load rejects silently, which is why iOS clients
          // never got subscribed. The dashboards render an enable button
          // that calls enable() from the tap instead.
          setNeedsPrompt(true)
          return
        }
        // Permission already granted: refresh/save the subscription silently.
        const existing = await reg.pushManager.getSubscription()
        if (existing) { await saveSubscription(existing, userId); return }
        await subscribeAndSave(reg, userId)
      } catch (err) {
        console.error('[push] registration error:', err)
      }
    }

    void register()
  }, [userId])

  // Must be called from a user gesture (button tap) — that's the whole point.
  const enable = useCallback(async (): Promise<boolean> => {
    if (!userId) return false
    try {
      const reg = await navigator.serviceWorker.ready
      const result = await Notification.requestPermission()
      setNeedsPrompt(false)
      if (result !== 'granted') return false
      await subscribeAndSave(reg, userId)
      return true
    } catch (err) {
      console.error('[push] enable error:', err)
      return false
    }
  }, [userId])

  return { needsPrompt, enable }
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
