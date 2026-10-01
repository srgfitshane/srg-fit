import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual quick-note handlers without contacting real clients.
const source = readFileSync(new URL('../src/app/dashboard/coach/reviews/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('reviews.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(ast))
  ts.forEachChild(node, collect)
}
collect(ast)
const plain = value => JSON.parse(JSON.stringify(value))
let cases = 0
function harness(options = {}) {
  const state = { note: options.note ?? '  Strong session — keep it up!  ', noteId: 'workout', errors: [], rows: [{ id: 'workout' }, { id: 'other' }], removed: [], notifications: [], writes: [], saving: [], draft: new Map(), lock: { current: false } }
  const chain = {
    update(payload) { state.writes.push({ payload: plain(payload), filters: [] }); return chain },
    eq(column, value) { state.writes.at(-1).filters.push([column, value]); return chain },
    is(column, value) { state.writes.at(-1).filters.push([column, value]); return chain },
    select(columns) { assert.equal(columns, 'id'); return chain },
    async single() {
      if (options.writeThrows) throw new Error('network')
      return { data: options.noRow ? null : { id: 'workout' }, error: options.writeError }
    },
  }
  const context = {
    module: { exports: {} }, Date, saving: !!options.saving, coachId: 'coach',
    quickNote: state.note, quickNoteId: options.wrongId ? 'other' : 'workout', quickNoteSendingRef: state.lock,
    getReviewIntelligence: () => ({ frictionScore: options.friction ? 1 : 0 }),
    setQuickNote: value => { state.note = value }, setQuickNoteId: value => { state.noteId = value },
    setQuickNoteError: value => state.errors.push(value), setSaving: value => state.saving.push(value),
    setReviews: update => { state.rows = update(state.rows) },
    localStorage: {
      getItem: key => { if (options.storageThrows) throw new Error('quota'); return state.draft.get(key) ?? null },
      setItem: (key, value) => { if (options.storageThrows) throw new Error('quota'); state.draft.set(key, value) },
      removeItem: key => { if (options.storageThrows) throw new Error('quota'); state.removed.push(key); state.draft.delete(key) },
    },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://test.example.com', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic' } },
    fetch: (url, config) => {
      state.notifications.push({ url, payload: JSON.parse(config.body) })
      return options.notifyRejects ? Promise.reject(new Error('push offline')) : Promise.resolve({ ok: true })
    },
    supabase: {
      auth: {
        async getUser() {
          if (options.authWait) await options.authWait
          if (options.authThrows) throw new Error('network')
          return { data: { user: options.noUser ? null : { id: options.changedUser ? 'other-coach' : 'coach' } }, error: options.authError }
        },
        async getSession() {
          if (options.sessionThrows) throw new Error('network')
          return { data: { session: options.noToken ? null : { access_token: 'synthetic' } } }
        },
      },
      from: table => { assert.equal(table, 'workout_sessions'); return chain },
    },
  }
  context.exports = context.module.exports
  const names = ['quickNoteDraftKey', 'openQuickNote', 'updateQuickNote', 'sendQuickNote']
  const code = names.map(name => handlers.get(name)).join('\n') + `\nexport { ${names.join(',')} }`
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { state, ...context.module.exports, review: { id: 'workout', client: options.noProfile ? null : { profile_id: 'test-client-profile' } } }
}
for (const options of [{ note: '' }, { note: '   ' }, { note: 'a'.repeat(1001) }, { wrongId: true }, { friction: true }]) {
  const h = harness(options)
  await h.sendQuickNote(h.review)
  assert.equal(h.state.writes.length, 0)
  assert.equal(h.state.notifications.length, 0)
  assert.equal(h.state.errors.length, 1)
  assert.equal(h.state.rows.length, 2)
  cases++
}
for (const options of [{ noUser: true }, { authError: {} }, { changedUser: true }, { authThrows: true }, { sessionThrows: true }, { writeError: {} }, { noRow: true }, { writeThrows: true }]) {
  const h = harness(options)
  h.state.draft.set('quick-review-draft:v1:coach:workout', h.state.note)
  await h.sendQuickNote(h.review)
  assert.equal(h.state.notifications.length, 0)
  assert.equal(h.state.rows.length, 2)
  assert.equal(h.state.removed.length, 0)
  assert(h.state.errors.at(-1))
  assert.equal(h.state.saving.at(-1), false)
  assert.equal(h.state.lock.current, false)
  assert(h.state.draft.has('quick-review-draft:v1:coach:workout'))
  cases++
}
for (const options of [{}, { notifyRejects: true }, { storageThrows: true }, { noToken: true }, { noProfile: true }]) {
  const h = harness(options)
  await h.sendQuickNote(h.review)
  assert.equal(h.state.writes.length, 1)
  assert.equal(h.state.writes[0].payload.coach_review_notes, 'Strong session — keep it up!')
  assert.deepEqual(h.state.writes[0].filters, [['id', 'workout'], ['coach_id', 'coach'], ['coach_reviewed_at', null]])
  assert.deepEqual(plain(h.state.rows), [{ id: 'other' }])
  assert.equal(h.state.noteId, null)
  assert.equal(h.state.note, '')
  assert.equal(h.state.saving.at(-1), false)
  if (h.state.notifications.length) {
    assert.equal(h.state.notifications[0].payload.body, h.state.writes[0].payload.coach_review_notes)
    assert.equal(h.state.notifications[0].payload.link_url, '/dashboard/client/workout/workout')
  }
  cases++
}
{
  const h = harness()
  h.state.draft.set('quick-review-draft:v1:coach:workout', 'My earlier writing')
  h.openQuickNote(h.review)
  assert.equal(h.state.note, 'My earlier writing')
  h.updateQuickNote('Updated note')
  assert.equal(h.state.draft.get('quick-review-draft:v1:coach:workout'), 'Updated note')
  h.openQuickNote({ id: 'another-workout' })
  assert.equal(h.state.note, '')
  const unavailable = harness({ storageThrows: true })
  unavailable.openQuickNote(unavailable.review)
  unavailable.updateQuickNote('Still editable')
  assert.equal(unavailable.state.note, 'Still editable')
  cases += 3
}
{
  let finish
  const authWait = new Promise(done => { finish = done })
  const h = harness({ authWait })
  const first = h.sendQuickNote(h.review)
  await h.sendQuickNote(h.review)
  assert.equal(h.state.lock.current, true)
  finish()
  await first
  assert.equal(h.state.writes.length, 1)
  assert.equal(h.state.notifications.length, 1)
  cases++
}
assert(!handlers.get('sendQuickNote').includes('pickPraise'))
assert(source.includes('💬 Quick note'))
assert(source.includes('Send note & review'))
{
  const h = harness({ note: 'a'.repeat(1000) })
  await h.sendQuickNote(h.review)
  assert.equal(h.state.writes[0].payload.coach_review_notes.length, 1000)
  assert.equal(h.state.notifications[0].payload.body.length, 100)
  cases++
}
console.log(`Quick review note checks passed (${cases} cases; no real client notifications).`)
