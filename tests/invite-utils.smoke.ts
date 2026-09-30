import assert from 'node:assert/strict'
import { buildInviteUrl, getInviteAvailability, isCoachRole, isInviteClaimAllowed, normalizeInviteEmail } from '../src/lib/invite-utils.ts'

assert.equal(
  getInviteAvailability({ status: 'pending', expires_at: '2099-01-01T00:00:00.000Z' }, new Date('2026-01-01T00:00:00.000Z')),
  'valid'
)

assert.equal(
  getInviteAvailability({ status: 'accepted', expires_at: '2099-01-01T00:00:00.000Z' }),
  'already_accepted'
)

assert.equal(
  getInviteAvailability({ status: 'cancelled', expires_at: '2099-01-01T00:00:00.000Z' }),
  'expired'
)

assert.equal(
  getInviteAvailability({ status: 'pending', expires_at: '2025-01-01T00:00:00.000Z' }, new Date('2026-01-01T00:00:00.000Z')),
  'expired'
)

assert.equal(buildInviteUrl('https://srgfit.app/', 'abc123'), 'https://srgfit.app/invite/abc123')

assert.equal(isCoachRole('coach'), true)
assert.equal(isCoachRole('client'), false)
assert.equal(isCoachRole(null), false)

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

assert.equal(normalizeInviteEmail('  CLIENT@Example.com  '), 'client@example.com')
for (const invalid of [null, undefined, 123, '', 'missing-at', 'client@example', 'a b@example.com', `${'a'.repeat(255)}@example.com`]) {
  assert.equal(normalizeInviteEmail(invalid), null)
}
assert.equal(getInviteAvailability({ status: 'pending', expires_at: 'not-a-date' }), 'invalid')
assert.equal(getInviteAvailability({ status: 'pending', expires_at: '2026-01-01T00:00:00.000Z' }, new Date('2026-01-01T00:00:00.000Z')), 'expired')
assert.equal(isInviteClaimAllowed({ email: ' CLIENT@example.com ' }, { email: 'client@example.com', id: 'user-1' }), true)
assert.equal(isInviteClaimAllowed({ email: 'client@example.com' }, { email: 'client@example.com' }), false)
assert.equal(isInviteClaimAllowed({}, { email: 'client@example.com', id: 'user-1' }), false)

console.log('invite-utils smoke test passed')
