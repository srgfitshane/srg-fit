export type InviteStatus = 'pending' | 'accepted' | 'cancelled' | string

export type InviteRecordLike = {
  status?: InviteStatus | null
  expires_at?: string | null
}

export type InviteAvailability = 'valid' | 'expired' | 'already_accepted' | 'invalid'

export type InviteClaimIdentity = {
  email?: string | null
  id?: string | null
}

export type InviteClaimRecord = {
  email?: string | null
  profile_id?: string | null
}

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

export function isInviteClaimAllowed(invite: InviteClaimRecord, user: InviteClaimIdentity) {
  const normalizedInviteEmail = typeof invite.email === 'string' ? invite.email.trim().toLowerCase() : ''
  const normalizedUserEmail = typeof user.email === 'string' ? user.email.trim().toLowerCase() : ''

  if (invite.profile_id && user.id && invite.profile_id !== user.id) {
    return false
  }

  if (normalizedInviteEmail && normalizedUserEmail && normalizedInviteEmail !== normalizedUserEmail) {
    return false
  }

  return true
}
