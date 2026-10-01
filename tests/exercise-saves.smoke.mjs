import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/dashboard/coach/exercises/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('exercises.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(ast))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) handlers.set(node.name.text, 'const ' + node.getText(ast))
  ts.forEachChild(node, collect)
}
collect(ast)
const plain = value => JSON.parse(JSON.stringify(value))
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const file = () => new File(['synthetic media'], 'demo.mp4', { type: 'video/mp4' })
const fields = { name: 'Example', muscles: [], secondary_muscles: [], equipment_list: [], difficulty: 'Intermediate', movement_pattern: '', modifiers: [], is_timed: false, default_duration_seconds: 30, tags: [], description: 'Keep this description', cues: 'Keep these cues', video_url: '', image_url: '', _videoFile: null, _imageFile: null }
let cases = 0
function harness(options = {}) {
  const state = { writes: [], uploads: [], errors: [], rows: [{ id: 'exercise', coach_id: 'coach', name: 'Original' }], editingId: 'exercise', pending: null, modal: true }
  let uuid = 0
  const context = {
    module: { exports: {} }, Error, Map, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    crypto: { randomUUID: () => `version-${++uuid}` },
    blank: fields, newEx: { ...fields, ...options.newEx },
    saveLock: { current: false }, newExerciseId: { current: null }, uploadedMedia: { current: new WeakMap() },
    setUploading: value => { state.uploading = value },
    setSaving: value => { state.saving = value }, setSaveError: value => state.errors.push(value),
    setExercises: update => { state.rows = update(state.rows) },
    setEditingId: value => { state.editingId = value },
    setNewEx: value => { context.newEx = value }, setShowNew: value => { state.modal = value },
    setPendingUpload: value => { state.pending = value },
    supabase: {
      auth: { getUser: async () => {
        if (options.authWait) await options.authWait
        if (options.authThrows) throw new Error('offline')
        return { data: { user: options.noUser ? null : { id: 'coach' } }, error: options.authError }
      } },
      storage: { from: bucket => {
        assert.equal(bucket, 'exercise-videos')
        return {
          upload: async (path, selected, config) => {
            state.uploads.push({ path, selected, config })
            if (options.uploadThrows) throw new Error('offline')
            return { data: options.noUploadRow ? null : { path }, error: options.uploadError }
          },
          getPublicUrl: path => ({ data: { publicUrl: 'https://media.example/' + path } }),
        }
      } },
      from: table => {
        assert.equal(table, 'exercises')
        let write
        const chain = {
          insert: payload => { write = { kind: 'insert', payload: plain(payload), filters: [] }; state.writes.push(write); return chain },
          update: payload => { write = { kind: 'update', payload: plain(payload), filters: [] }; state.writes.push(write); return chain },
          eq: (key, value) => { write.filters.push([key, value]); return chain },
          select: () => chain,
          single: async () => {
            if (options.throwKind === write.kind) throw new Error('offline')
            const id = write.kind === 'insert' ? 'created' : write.filters[0][1]
            return { data: options.noRowKind === write.kind ? null : { id, ...write.payload }, error: options.errorKind === write.kind ? {} : null }
          },
        }
        return chain
      },
    },
  }
  context.exports = context.module.exports
  const names = ['exerciseDraftKey', 'readExerciseDraft', 'keepExerciseDraft', 'uploadMedia', 'saveNew', 'saveEdit', 'quickUpload', 'duplicateExercise']
  vm.runInNewContext(compile(names.map(name => handlers.get(name)).join('\n') + `\nexport { ${names.join(',')} }`), context)
  return { ...context.module.exports, state, context, options }
}
for (const operation of ['saveNew', 'saveEdit', 'quickUpload', 'duplicateExercise']) {
  for (const options of [{ noUser: true }, { authError: {} }, { authThrows: true }]) {
    const h = harness(options)
    await h[operation](operation === 'duplicateExercise' ? fields : 'exercise', operation === 'quickUpload' ? file() : { ...fields })
    assert.equal(h.state.writes.length, 0); assert.equal(h.state.uploads.length, 0)
    assert.ok(h.state.errors.at(-1)); assert.equal(h.context.saveLock.current, false)
    assert.equal(h.state.saving, false); cases++
  }
}
for (const options of [{ errorKind: 'update' }, { noRowKind: 'update' }, { throwKind: 'update' }, { uploadError: {} }, { noUploadRow: true }, { uploadThrows: true }]) {
  const h = harness(options); const selected = file(); const changes = { ...fields, _videoFile: selected }
  assert.equal(await h.saveEdit('exercise', changes), false)
  assert.equal(changes._videoFile, selected)
  assert.equal(h.state.editingId, 'exercise'); assert.equal(h.state.rows[0].name, 'Original')
  assert.ok(h.state.errors.at(-1)); assert.equal(h.state.saving, false); cases++
}
for (const kind of ['insert', 'update']) {
  for (const mode of ['errorKind', 'noRowKind', 'throwKind']) {
    const h = harness({ [mode]: kind, newEx: { _videoFile: file() } }); await h.saveNew()
    assert.equal(h.state.modal, true); assert.ok(h.context.newEx._videoFile)
    assert.equal(h.context.newEx.cues, fields.cues); assert.ok(h.state.errors.at(-1)); cases++
  }
}
{
  const h = harness({ errorKind: 'update', newEx: { _videoFile: file() } })
  await h.saveNew(); h.options.errorKind = null; await h.saveNew()
  assert.equal(h.state.writes.filter(w => w.kind === 'insert').length, 1)
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.modal, false)
  assert.equal(h.context.newExerciseId.current, null)
  assert.equal(h.state.rows.filter(row => row.id === 'created').length, 1); cases++
}
{
  const h = harness({ uploadError: {}, newEx: { _videoFile: file() } })
  await h.saveNew(); h.options.uploadError = null; await h.saveNew()
  assert.equal(h.state.writes.filter(w => w.kind === 'insert').length, 1)
  assert.equal(h.state.modal, false); cases++
}
for (const operation of ['saveEdit', 'quickUpload']) {
  const h = harness({ errorKind: 'update' }); const selected = file()
  const run = () => operation === 'saveEdit' ? h.saveEdit('exercise', { ...fields, _videoFile: selected }) : h.quickUpload('exercise', selected)
  await run()
  if (operation === 'quickUpload') assert.equal(h.state.pending.file, selected)
  h.options.errorKind = null; await run()
  assert.equal(h.state.uploads.length, 1)
  assert.deepEqual(h.state.writes.at(-1).filters, [['id', 'exercise'], ['coach_id', 'coach']])
  assert.equal(h.state.rows[0].video_url, 'https://media.example/exercise/video_url-version-1.mp4')
  assert.equal(h.state.uploads[0].config.upsert, false); cases++
}
for (const field of ['video_url', 'video_url_female', 'image_url']) {
  const h = harness(); await h.quickUpload('exercise', file(), field)
  assert.ok(h.state.rows[0][field]); assert.equal(h.state.pending, null); cases++
}
{
  let release
  const h = harness({ authWait: new Promise(resolve => { release = resolve }) })
  const first = h.saveNew(); await h.saveNew(); await h.quickUpload('exercise', file()); release(); await first
  assert.equal(h.state.writes.filter(w => w.kind === 'insert').length, 1); cases++
}
for (const options of [{ errorKind: 'insert' }, { noRowKind: 'insert' }, { throwKind: 'insert' }, {}]) {
  const h = harness(options); await h.duplicateExercise(fields)
  assert.equal(h.state.rows.length, Object.keys(options).length ? 1 : 2)
  if (Object.keys(options).length) assert.ok(h.state.errors.at(-1)); cases++
}
for (const saved of [false, true]) {
  let cleared = false
  const context = { module: { exports: {} }, draft: { ...fields }, ex: { id: 'exercise' }, coachId: 'coach', keepExerciseDraft: () => {}, onSave: async () => saved, setDraft: value => { cleared = value === null } }
  context.exports = context.module.exports
  vm.runInNewContext(compile(handlers.get('submit') + '\nexport { submit }'), context)
  await context.module.exports.submit(); assert.equal(cleared, saved); cases++
}
{
  const h = harness(); const storage = new Map()
  h.context.localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key),
  }
  const savedId = '00000000-0000-4000-8000-000000000001'
  h.keepExerciseDraft('coach', 'new', { ...fields, savedId, _videoFile: file() })
  assert.deepEqual(plain(h.readExerciseDraft('coach', 'new')), { name: fields.name, description: fields.description, cues: fields.cues, savedId })
  assert.equal(JSON.stringify([...storage.values()]).includes('_videoFile'), false)
  assert.deepEqual(plain(h.readExerciseDraft('other-coach', 'new')), { savedId: null })
  h.keepExerciseDraft('coach', 'new', null); assert.equal(storage.size, 0)
  storage.set(h.exerciseDraftKey('coach', 'new'), '{broken')
  assert.deepEqual(plain(h.readExerciseDraft('coach', 'new')), {})
  h.context.localStorage.setItem = () => { throw new Error('quota') }
  h.keepExerciseDraft('coach', 'new', fields); cases++
}
{
  const h = harness()
  h.context.newExerciseId.current = 'created'
  await h.saveNew()
  assert.equal(h.state.writes.filter(w => w.kind === 'insert').length, 0)
  assert.equal(h.state.modal, false); cases++
}
{
  const h = harness(); const selected = file()
  const first = await h.uploadMedia('exercise', selected, 'video_url')
  assert.equal(await h.uploadMedia('exercise', selected, 'video_url'), first)
  assert.notEqual(await h.uploadMedia('exercise', selected, 'video_url_female'), first)
  assert.notEqual(await h.uploadMedia('other-exercise', selected, 'video_url'), first)
  assert.equal(h.state.uploads.length, 3); cases++
}
assert.ok(source.includes('<fieldset disabled={saving}'))
assert.ok(source.includes('Retry Media Save'))
assert.ok(!source.includes('console.error('))
console.log(`Exercise save checks passed (${cases} cases; synthetic records/media only).`)
