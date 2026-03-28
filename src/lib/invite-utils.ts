export type InviteStatus = 'pending' | 'accepted' | 'cancelled' | string

export type InviteRecordLike = {
  status?: InviteStatus | null
  expires_at?: string | null
}

export type InviteAvailability = 'valid' | 'expired' | 'already_accepted' | 'invalid'

export function isCoachRole(role: string | null | undefined) {
  return role === 'coach'
}

export function getInviteAvailability(invite: InviteRecordLike | null | undefined, now = new Date()): InviteAvailability {
  if (!invite) return 'invalid'
  if (invite.status === 'accepted') return 'already_accepted'
  if (invite.status === 'cancelled') return 'expired'
  if (!invite.expires_at) return 'invalid'
  if (new Date(invite.expires_at).getTime() < now.getTime()) return 'expired'
  return 'valid'
}

export function buildInviteUrl(siteUrl: string, token: string) {
  return `${siteUrl.replace(/\/+$/, '')}/invite/${token}`
}
