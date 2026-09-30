import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

export function authError(status: number, message: string, headers: HeadersInit = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...headers, 'Content-Type': 'application/json' },
  })
}

function bearerToken(req: Request) {
  return /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '')?.[1] || ''
}

function matchesSecret(candidate: string, secret: string) {
  if (!candidate || !secret || candidate.length !== secret.length) return false
  let difference = 0
  for (let i = 0; i < secret.length; i++) difference |= candidate.charCodeAt(i) ^ secret.charCodeAt(i)
  return difference === 0
}

export function isServiceCaller(req: Request) {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  return matchesSecret(bearerToken(req), serviceKey)
    || matchesSecret(req.headers.get('apikey') || '', serviceKey)
}

// Cron secrets stay in Vault. Only service_role can invoke the verifier RPC;
// the secret never needs to be printed or copied into Edge configuration.
export async function requireServiceCaller(
  req: Request,
  { allowCron = true, headers = {} }: { allowCron?: boolean; headers?: HeadersInit } = {},
): Promise<Response | null> {
  if (req.method !== 'POST') return authError(405, 'Method not allowed', headers)
  if (isServiceCaller(req)) return null

  const cronSecret = req.headers.get('x-cron-secret')
  if (allowCron && cronSecret && cronSecret.length <= 256) {
    const adminDb = createClient(
      Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { data, error } = await adminDb.rpc('verify_edge_cron_secret', { candidate: cronSecret })
    if (error) return authError(503, 'Scheduler authentication unavailable', headers)
    if (data === true) return null
  }
  return authError(401, 'Unauthorized', headers)
}

export async function requireUser(req: Request, adminDb: SupabaseClient) {
  const token = bearerToken(req)
  if (!token) return null
  const { data, error } = await adminDb.auth.getUser(token)
  return error || !data.user || data.user.is_anonymous ? null : data.user
}

const coachNotificationTypes = new Set([
  'new_message', 'message', 'review_ready', 'checkin_due', 'program_assigned',
  'shoutout', 'announcement', 'community_reply',
])
const clientNotificationTypes = new Set([
  'new_message', 'checkin_submitted', 'workout_logged', 'issue_report',
  'call_request', 'pain_report', 'mood_alert', 'community_reply',
])

export async function canNotify(
  adminDb: SupabaseClient, senderId: string, recipientId: string, notificationType: string,
) {
  if (senderId === recipientId) return false
  const { data: sender, error: profileError } = await adminDb
    .from('profiles').select('role').eq('id', senderId).maybeSingle()
  if (profileError) throw new Error('Could not verify notification sender')

  if (sender?.role === 'coach' && coachNotificationTypes.has(notificationType)) {
    const { data, error } = await adminDb.from('clients').select('id')
      .eq('coach_id', senderId).eq('profile_id', recipientId).eq('archived', false).maybeSingle()
    if (error) throw new Error('Could not verify notification recipient')
    return Boolean(data)
  }
  if (sender?.role !== 'client' || !clientNotificationTypes.has(notificationType)) return false

  const { data: client, error } = await adminDb.from('clients').select('coach_id')
    .eq('profile_id', senderId).eq('active', true).eq('archived', false).maybeSingle()
  if (error) throw new Error('Could not verify client access')
  if (!client?.coach_id) return false
  if (recipientId === client.coach_id) return true

  // Community replies may notify another member of the same coach's community.
  // This does not grant client-to-client message or payment notification access.
  if (notificationType !== 'community_reply') return false
  const { data: peer, error: peerError } = await adminDb.from('clients').select('id')
    .eq('coach_id', client.coach_id).eq('profile_id', recipientId)
    .eq('active', true).eq('archived', false).maybeSingle()
  if (peerError) throw new Error('Could not verify community membership')
  return Boolean(peer)
}
