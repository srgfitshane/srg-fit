/**
 * notify.ts
 * Thin wrapper to fire notifications via the send-notification edge function.
 * Import and call from anywhere (server actions, API routes, edge functions).
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!

export interface NotifyPayload {
  user_id:           string
  notification_type: string
  title:             string
  body?:             string
  data?:             Record<string, any>
  link_url?:         string
  actor_id?:         string
}

export async function notify(payload: NotifyPayload | NotifyPayload[]) {
  const url = `${SUPABASE_URL}/functions/v1/send-notification`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    if (!res.ok) {
      const err = await res.text()
      console.error('[notify] Error:', err)
    }
    return res.ok
  } catch (err) {
    console.error('[notify] Network error:', err)
    return false
  }
}

// ── Pre-built notification factories ─────────────────────────────────────

export const Notifications = {
  messageReceived: (coachProfileId: string, clientName: string, clientId: string) => notify({
    user_id: coachProfileId,
    notification_type: 'message_received',
    title: `New message from ${clientName}`,
    body: 'Tap to view and reply.',
    link_url: `/dashboard/coach/clients/${clientId}`,
    data: { client_id: clientId }
  }),

  checkinSubmitted: (coachProfileId: string, clientName: string, clientId: string) => notify({
    user_id: coachProfileId,
    notification_type: 'checkin_submitted',
    title: `${clientName} submitted a check-in`,
    body: 'Review their progress and leave feedback.',
    link_url: `/dashboard/coach/clients/${clientId}`,
    data: { client_id: clientId }
  }),

  paymentFailed: (clientProfileId: string, amount?: string) => notify({
    user_id: clientProfileId,
    notification_type: 'payment_failed',
    title: 'Payment failed',
    body: `We couldn't process your payment${amount ? ` of ${amount}` : ''}. Please update your payment method.`,
    link_url: '/dashboard/client',
    data: {}
  }),

  paymentSucceeded: (clientProfileId: string, amount?: string) => notify({
    user_id: clientProfileId,
    notification_type: 'payment_succeeded',
    title: 'Payment successful',
    body: `Your payment${amount ? ` of ${amount}` : ''} was processed. Thanks for being awesome! 💪`,
    link_url: '/dashboard/client',
    data: {}
  }),

  subscriptionCanceled: (clientProfileId: string) => notify({
    user_id: clientProfileId,
    notification_type: 'subscription_canceled',
    title: 'Subscription ended',
    body: 'Your coaching subscription has been canceled. We hope to see you back soon.',
    link_url: '/dashboard/client',
    data: {}
  }),

  inviteAccepted: (coachProfileId: string, clientName: string, clientId: string) => notify({
    user_id: coachProfileId,
    notification_type: 'invite_accepted',
    title: `${clientName} accepted your invite! 🎉`,
    body: 'They\'re now set up as a client. Time to build their program.',
    link_url: `/dashboard/coach/clients/${clientId}`,
    data: { client_id: clientId }
  }),

  onboardingCompleted: (coachProfileId: string, clientName: string, clientId: string) => notify({
    user_id: coachProfileId,
    notification_type: 'onboarding_completed',
    title: `${clientName} completed onboarding`,
    body: 'Their intake form is ready for review.',
    link_url: `/dashboard/coach/clients/${clientId}`,
    data: { client_id: clientId }
  }),
}
