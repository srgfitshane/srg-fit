import assert from 'node:assert/strict'
import {
  formatClientActivityDate,
  getClientActivityTitle,
  summarizeClientActivity,
} from '../src/lib/client-activities.ts'

assert.equal(getClientActivityTitle({ activity_type: 'walk', title: null }), 'Walk')
assert.equal(getClientActivityTitle({ activity_type: 'other', title: 'Neighborhood trail' }), 'Neighborhood trail')

assert.equal(formatClientActivityDate('2026-03-28'), 'Sat, Mar 28')

assert.deepEqual(
  summarizeClientActivity({
    duration_minutes: 45,
    distance_value: 2.5,
    distance_unit: 'mi',
    intensity: 'moderate',
    notes: 'Felt good',
  }),
  ['45 min', '2.5 mi', 'Moderate', 'Felt good']
)

console.log('client-activities smoke test passed')
