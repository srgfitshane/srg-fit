import test from 'node:test'
import assert from 'node:assert/strict'
import { buildInviteUrl, getInviteAvailability, isCoachRole, isInviteClaimAllowed } from '../src/lib/invite-utils'

test('getInviteAvailability marks active pending invites as valid', () => {
  assert.equal(
    getInviteAvailability({ status: 'pending', expires_at: '2099-01-01T00:00:00.000Z' }, new Date('2026-01-01T00:00:00.000Z')),
    'valid'
  )
})

test('getInviteAvailability marks accepted invites correctly', () => {
  assert.equal(
    getInviteAvailability({ status: 'accepted', expires_at: '2099-01-01T00:00:00.000Z' }),
    'already_accepted'
  )
})

test('getInviteAvailability marks cancelled or old invites as expired', () => {
  assert.equal(
    getInviteAvailability({ status: 'cancelled', expires_at: '2099-01-01T00:00:00.000Z' }),
    'expired'
  )
  assert.equal(
    getInviteAvailability({ status: 'pending', expires_at: '2025-01-01T00:00:00.000Z' }, new Date('2026-01-01T00:00:00.000Z')),
    'expired'
  )
})

test('buildInviteUrl trims trailing slashes', () => {
  assert.equal(buildInviteUrl('https://srgfit.app/', 'abc123'), 'https://srgfit.app/invite/abc123')
})

test('isCoachRole only accepts coach', () => {
  assert.equal(isCoachRole('coach'), true)
  assert.equal(isCoachRole('client'), false)
  assert.equal(isCoachRole(null), false)
})

test('isInviteClaimAllowed requires the invited account identity', () => {
  assert.equal(
    isInviteClaimAllowed(
      { email: 'client@example.com', profile_id: 'user-1' },
      { email: 'client@example.com', id: 'user-1' }
    ),
    true
  )

  assert.equal(
    isInviteClaimAllowed(
      { email: 'client@example.com', profile_id: 'user-1' },
      { email: 'other@example.com', id: 'user-1' }
    ),
    false
  )

  assert.equal(
    isInviteClaimAllowed(
      { email: 'client@example.com', profile_id: 'user-1' },
      { email: 'client@example.com', id: 'user-2' }
    ),
    false
  )
})
