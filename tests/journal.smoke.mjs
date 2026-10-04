import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/dashboard/client/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('dashboard.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(ast))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
    handlers.set(node.name.text, `const ${node.name.text} = ${node.initializer.getText(ast)}`)
  }
  ts.forEachChild(node, collect)
}
collect(ast)
let cases = 0
function harness(options = {}) {
  const key = 'journal-draft:client-profile:2026-10-03'
  const state = { writes: [], saved: false, errors: [], draft: new Map(), saving: [], notice: '', text: 'My unfinished entry', private: true, refreshes: 0 }
  const chain = {
    upsert(payload, config) { state.writes.push({ payload: JSON.parse(JSON.stringify(payload)), config: JSON.parse(JSON.stringify(config)) }); return chain },
    select(columns) { assert.equal(columns, 'id, entry_date'); return chain },
    async single() {
      if (options.writeWait) await options.writeWait
      if (options.writeThrows) throw new Error('Synthetic transport error')
      return { data: options.noRow ? null : { id: 'entry', entry_date: options.wrongDate ? '2026-10-02' : options.activeDate || '2026-10-03' }, error: options.writeError }
    },
  }
  const context = {
    module: { exports: {} }, useCallback: fn => fn,
    journalKey: options.key || key, journalActiveDate: options.activeDate || '2026-10-03', today: '2026-10-03',
    journalEditable: !options.preview && !options.notReady, journalText: options.empty ? '   ' : state.text, journalPrivate: true,
    journalLoadedKey: { current: options.notReady ? '' : options.key || key }, journalDirty: { current: !!options.dirty }, journalSaveLock: { current: false },
    profile: { id: 'client-profile' }, clientRecord: { profile_id: options.wrongProfile ? 'another-profile' : 'client-profile' },
    setJournalText: value => { context.journalText = state.text = value },
    setJournalPrivate: value => { context.journalPrivate = state.private = value },
    setJournalSaved: value => { state.saved = value }, setJournalDate: value => { state.date = value },
    setJournalActiveDate: value => { state.activeDate = value }, setJournalReadyKey: value => { state.readyKey = value },
    setJournalError: value => state.errors.push(value), setJournalSaving: value => state.saving.push(value),
    setJournalDraftNotice: value => { state.notice = value }, setRefreshTick: fn => { state.refreshes = fn(state.refreshes) },
    getLocalDateString: () => '2026-10-03',
    localStorage: {
      getItem: key => { if (options.storageThrows) throw new Error('Blocked'); return state.draft.get(key) ?? null },
      setItem: (key, value) => { if (options.storageThrows) throw new Error('Blocked'); state.draft.set(key, value) },
      removeItem: key => { if (options.storageThrows) throw new Error('Blocked'); state.draft.delete(key) },
    },
    supabase: {
      auth: { async getUser() {
        if (options.authWait) await options.authWait
        if (options.authThrows) throw new Error('Synthetic transport error')
        return { data: { user: options.noUser ? null : { id: options.changedUser ? 'other-profile' : 'client-profile' } }, error: options.authError }
      } },
      from: table => { assert.equal(table, 'journal_entries'); return chain },
    },
  }
  context.exports = context.module.exports
  const names = ['hydrateJournal', 'updateJournalDraft', 'saveJournal']
  const code = names.map(name => handlers.get(name)).join('\n') + `\nexport { ${names.join(',')} }`
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context)
  return { state, context, key, ...context.module.exports }
}
for (const options of [{ noUser: true }, { authError: {} }, { changedUser: true }, { wrongProfile: true }, { authThrows: true }, { writeError: { message: 'Sensitive provider detail' } }, { noRow: true }, { wrongDate: true }, { writeThrows: true }]) {
  const h = harness(options)
  h.updateJournalDraft('Keep every word', false)
  await h.saveJournal()
  assert.equal(h.state.saved, false)
  assert(h.state.errors.at(-1))
  assert(!h.state.errors.at(-1).includes('Sensitive'))
  assert.equal(h.state.draft.get(h.key), JSON.stringify({ text: 'Keep every word', isPrivate: false }))
  assert.equal(h.state.saving.at(-1), false)
  assert.equal(h.context.journalSaveLock.current, false)
  cases++
}
for (const options of [{}, { storageThrows: true }]) {
  const h = harness(options)
  h.updateJournalDraft('Confirmed entry', false)
  await h.saveJournal()
  assert.equal(h.state.saved, true)
  assert.equal(h.state.writes.length, 1)
  assert.deepEqual(h.state.writes[0], { payload: { client_id: 'client-profile', entry_date: '2026-10-03', content: 'Confirmed entry', is_private: false }, config: { onConflict: 'client_id,entry_date' } })
  assert.equal(h.state.draft.has(h.key), false)
  assert.equal(h.state.date, '2026-10-03')
  cases++
}
for (const options of [{ preview: true }, { notReady: true }, { empty: true }]) {
  const h = harness(options)
  await h.saveJournal()
  assert.equal(h.state.writes.length, 0)
  assert.equal(h.state.saved, false)
  cases++
}
{
  let finish
  const h = harness({ authWait: new Promise(done => { finish = done }) })
  const first = h.saveJournal()
  await h.saveJournal()
  h.updateJournalDraft('Blocked while saving', false)
  assert.equal(h.state.text, 'My unfinished entry')
  finish()
  await first
  assert.equal(h.state.writes.length, 1)
  cases++
}
{
  const h = harness({ notReady: true })
  h.state.draft.set(h.key, JSON.stringify({ text: 'Restored private writing', isPrivate: true }))
  h.hydrateJournal('client-profile', '2026-10-03', { content: 'Older saved entry', is_private: false }, false)
  assert.equal(h.state.text, 'Restored private writing')
  assert.equal(h.state.private, true)
  assert.equal(h.state.saved, false)
  h.hydrateJournal('client-profile', '2026-10-03', { content: 'Focus refresh', is_private: false }, false)
  assert.equal(h.state.text, 'Restored private writing')
  h.hydrateJournal('client-profile', '2026-10-04', null, false)
  assert.equal(h.state.text, 'Restored private writing')
  assert.equal(h.state.activeDate, '2026-10-03')
  h.hydrateJournal('another-profile', '2026-10-04', null, false)
  assert.equal(h.state.text, '')
  assert.equal(h.state.private, true)
  cases += 4
}
for (const stored of ['not json', JSON.stringify({ text: 10, isPrivate: false }), JSON.stringify({ text: 'wrong flag', isPrivate: 'false' })]) {
  const h = harness({ notReady: true })
  h.state.draft.set(h.key, stored)
  h.hydrateJournal('client-profile', '2026-10-03', { content: 'Confirmed server entry', is_private: true }, false)
  assert.equal(h.state.text, 'Confirmed server entry')
  assert.equal(h.state.private, true)
  cases++
}
{
  const h = harness({ notReady: true, preview: true })
  h.state.draft.set(h.key, JSON.stringify({ text: 'Never read in preview', isPrivate: true }))
  h.hydrateJournal('client-profile', '2026-10-03', null, true)
  h.updateJournalDraft('Never write in preview', false)
  assert.equal(h.state.text, '')
  assert(h.state.draft.has(h.key))
  cases++
}
{
  const h = harness({ activeDate: '2026-10-02', key: 'journal-draft:client-profile:2026-10-02' })
  h.updateJournalDraft('Finish yesterday', true)
  await h.saveJournal()
  assert.equal(h.state.writes[0].payload.entry_date, '2026-10-02')
  assert.equal(h.state.refreshes, 1)
  h.hydrateJournal('client-profile', '2026-10-03', null, false)
  assert.equal(h.state.text, '')
  assert.equal(h.state.activeDate, '2026-10-03')
  cases++
}
{
  let finish
  const h = harness({ writeWait: new Promise(done => { finish = done }) })
  h.updateJournalDraft('Previous account draft', true)
  const first = h.saveJournal()
  await Promise.resolve()
  h.hydrateJournal('another-profile', '2026-10-03', null, false)
  finish()
  await first
  assert.equal(h.state.saved, false)
  assert.equal(h.state.text, '')
  cases++
}
assert(source.includes('error: journalReadError'))
for (const earlier of [JSON.stringify({ text: 'Yesterday across a reload', isPrivate: false }), 'malformed', JSON.stringify({ text: '', isPrivate: true })]) {
  const h = harness({ notReady: true })
  const oldKey = 'journal-draft:client-profile:2026-10-02'
  h.state.draft.set('journal-draft-active:client-profile', oldKey)
  h.state.draft.set(oldKey, earlier)
  h.hydrateJournal('client-profile', '2026-10-03', { content: 'Today', is_private: true }, false)
  const valid = earlier.includes('Yesterday')
  assert.equal(h.state.text, valid ? 'Yesterday across a reload' : 'Today')
  assert.equal(h.state.activeDate, valid ? '2026-10-02' : '2026-10-03')
  assert.equal(h.state.private, !valid)
  cases++
}
{
  const h = harness({ notReady: true, storageThrows: true })
  h.hydrateJournal('client-profile', '2026-10-03', { content: 'Server entry', is_private: true }, false)
  assert.equal(h.state.text, 'Server entry')
  assert.equal(h.context.journalDirty.current, false)
  h.hydrateJournal('client-profile', '2026-10-04', null, false)
  assert.equal(h.state.activeDate, '2026-10-04')
  assert.equal(h.state.text, '')
  cases++
}
assert(source.includes('if (!cancelled)'))
assert(source.includes('disabled={!journalEditable}'))
console.log(`Journal smoke tests passed (${cases} cases)`)
