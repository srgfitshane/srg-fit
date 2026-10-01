import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Run the actual page handlers with isolated state/storage. No live health data.
const source = readFileSync(new URL('../src/app/dashboard/client/profile/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('profile.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const definitions = {}
const effects = []
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.initializer) definitions[node.name.getText(ast)] = node.initializer.getText(ast)
  if (ts.isFunctionDeclaration(node) && node.name) definitions[node.name.text] = node.getText(ast)
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects.push(node.arguments[0].getText(ast))
  ts.forEachChild(node, collect)
}
collect(ast)
const plain = value => JSON.parse(JSON.stringify(value))
function evaluate(text, globals = {}) {
  const code = ts.transpileModule(text, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const compiled = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports, Error,
    require: name => {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      throw new Error(`Unexpected dependency ${name}`)
    },
    ...globals,
  })
  return compiled.exports
}
const parser = evaluate(`const EDITABLE_INTAKE_FIELDS = ${definitions.EDITABLE_INTAKE_FIELDS}; ${definitions.parseProfileDraft}; export { parseProfileDraft, EDITABLE_INTAKE_FIELDS }`)
let cases = 0
{
  const draft = parser.parseProfileDraft(JSON.stringify({ motivation_why: 'My writing', stress_level: 0, preferred_days: ['Monday'], date_of_birth: null, menstrual_cycle_tracking: false, coach_notes: 'Never save', client_id: 'another-client', unknown: {}, phone: {} }))
  assert.deepEqual(plain(draft), { motivation_why: 'My writing', stress_level: 0, preferred_days: ['Monday'], date_of_birth: null, menstrual_cycle_tracking: false })
  for (const input of ['null', '[]', '"invalid"']) assert.deepEqual(plain(parser.parseProfileDraft(input)), {})
  assert.throws(() => parser.parseProfileDraft('{'))
  const pageFields = [...source.matchAll(/field="([a-z_]+)"/g)].map(match => match[1])
  for (const field of pageFields) assert(parser.EDITABLE_INTAKE_FIELDS.has(field), `Missing draft field: ${field}`)
  cases++
}

function harness(options = {}) {
  const state = { draft: options.currentDraft || { motivation_why: 'My writing' }, errors: [], saved: [], saving: [], removed: [], writes: [], events: [], profile: { id: 'own' }, intake: {}, loading: [] }
  let requests = 0
  const supabase = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.changedUser ? 'another' : 'own' } }, error: options.authError }) },
    storage: { from: () => ({ upload: async (path, file, config) => {
      state.upload = { path, config: plain(config) }
      if (options.uploadThrow) throw new Error('Network unavailable')
      return { error: options.uploadError }
    } }) },
    from(table) {
      const call = { table }
      state.writes.push(call)
      const chain = {
        upsert(payload, config) { call.payload = plain(payload); call.config = plain(config); return chain },
        update(payload) { call.payload = plain(payload); return chain },
        select(columns) { call.columns = columns; return chain },
        eq(column, value) { call.filter = [column, value]; return chain },
        async single() {
          requests++
          if (options.queryThrow) throw new Error('Network unavailable')
          const failed = options.failAt === requests
          return { data: options.noRow || failed ? null : { id: 'own', client_id: 'client' }, error: options.queryError || (failed ? { message: 'denied' } : null) }
        },
      }
      return chain
    },
  }
  const globals = {
    clientId: options.noClient ? null : 'client', profile: state.profile,
    draftChanges: { motivation_why: 'My writing' }, draftStorageKey: 'profile-draft:v1:client',
    intake: { coach_notes: 'Must not write', created_at: 'Must not write', motivation_why: 'My writing' },
    saving: false, photoUploading: false, themeSaving: false, supabase,
    setSaving: value => state.saving.push(value), setSaved: value => state.saved.push(value),
    setSubmitError: value => state.errors.push(value), setRestoredDraft: value => { state.restored = value },
    setDraftChanges: update => { state.draft = typeof update === 'function' ? update(state.draft) : update },
    setThemeSaving: value => { state.themeSaving = value }, setThemePreference: value => { state.theme = value },
    setPhotoUploading: value => { state.photoUploading = value },
    setIntake: update => { state.intake = typeof update === 'function' ? update(state.intake) : update },
    setProfile: update => { state.profile = typeof update === 'function' ? update(state.profile) : update },
    setTimeout() {}, crypto: { randomUUID: () => 'unique-image' },
    resolveSignedMediaUrl: async () => 'https://images.example/photo',
    CustomEvent: class { constructor(name, init) { this.name = name; this.detail = init.detail } },
    window: { localStorage: { removeItem: key => { state.removed.push(key); if (options.storageError) throw new Error('Storage disabled') } }, dispatchEvent: event => state.events.push(event) },
  }
  return { state, globals, handler(name) { return evaluate(`export const handler = ${definitions[name]}`, globals).handler } }
}
for (const options of [{ queryError: { message: 'denied' } }, { noRow: true }, { queryThrow: true }, { noUser: true }, { changedUser: true }, { authError: { message: 'expired' } }, { noClient: true }]) {
  const test = harness(options)
  await test.handler('save')()
  assert(test.state.errors.at(-1))
  assert(!test.state.saved.includes(true))
  assert.equal(test.state.removed.length, 0)
  assert.deepEqual(test.state.draft, { motivation_why: 'My writing' })
  if (!options.noClient) assert.equal(test.state.saving.at(-1), false)
  cases++
}
for (const options of [{}, { storageError: true }, { currentDraft: { motivation_why: 'New writing while saving', phone: 'Unsaved phone' } }]) {
  const test = harness(options)
  await test.handler('save')()
  assert.equal(test.state.saved.at(-1), true)
  assert.equal(test.state.saving.at(-1), false)
  assert.deepEqual(test.state.writes[0].payload, { motivation_why: 'My writing', client_id: 'client', intake_completed_by: 'client' })
  assert.equal(test.state.writes[0].columns, 'client_id')
  assert.deepEqual(plain(test.state.draft), options.currentDraft || {})
  assert.equal(test.state.removed.length, 1)
  cases++
}
for (const options of [{}, { queryError: { message: 'denied' } }, { noRow: true }, { queryThrow: true }]) {
  const test = harness(options)
  await test.handler('updateTheme')('light')
  const success = Object.keys(options).length === 0
  assert.equal(test.state.events.length, success ? 1 : 0)
  assert.equal(test.state.theme, success ? 'light' : undefined)
  assert.equal(test.state.themeSaving, false)
  if (!success) assert(test.state.errors.at(-1))
  cases++
}
for (const options of [{}, { uploadError: { message: 'denied' } }, { uploadThrow: true }, { failAt: 1 }, { failAt: 2 }, { noRow: true }, { queryThrow: true }, { noUser: true }, { changedUser: true }, { invalidFile: true }]) {
  const test = harness(options)
  await test.handler('uploadPhoto')({ name: 'photo.png', type: options.invalidFile ? 'text/html' : 'image/png' })
  const success = Object.keys(options).length === 0
  assert.equal(test.state.profile.avatar_url, success ? 'https://images.example/photo' : undefined)
  if (!options.invalidFile) assert.equal(test.state.photoUploading, false)
  if (success) {
    assert.equal(test.state.upload.config.upsert, false)
    assert.equal(test.state.writes[0].payload.profile_photo_url, 'profile-photos/client/unique-image.png')
    assert.equal(test.state.writes[1].payload.avatar_url, 'profile-photos/client/unique-image.png')
  } else assert(test.state.errors.at(-1))
  cases++
}
for (const draft of [{ motivation_why: 'Unsaved writing' }, {}]) {
  const stored = new Map(), listeners = new Map()
  let timer, cleared = false
  const window = {
    localStorage: { setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) },
    setTimeout: callback => { timer = callback; return 1 }, clearTimeout: () => { cleared = true },
    addEventListener: (name, callback) => listeners.set(name, callback), removeEventListener: name => listeners.delete(name),
  }
  const persistDraftRef = { current: () => {} }
  const effect = evaluate(`export const effect = ${effects[1]}`, { window, persistDraftRef, draftStorageKey: 'profile-draft:v1:client', loading: false, draftChanges: draft }).effect
  const cleanup = effect()
  assert.equal(stored.size, 0)
  listeners.get('pagehide')()
  timer()
  assert.equal(stored.size, Object.keys(draft).length ? 1 : 0)
  if (stored.size) assert.deepEqual(JSON.parse(stored.values().next().value), draft)
  cleanup(); assert(cleared); assert.equal(listeners.size, 0)
  stored.clear()
  evaluate(`export const effect = ${effects[2]}`, { persistDraftRef }).effect()()
  assert.equal(stored.size, Object.keys(draft).length ? 1 : 0)
  cases++
}
for (const options of [{}, { emptyIntake: true }, { failAt: 1 }, { failAt: 2 }, { failAt: 3 }, { badDraft: true }, { storageError: true }]) {
  const state = { errors: [], loading: [] }
  let query = 0
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'own' } } }) },
    from: () => {
      const chain = {
        select: () => chain, eq: () => chain,
        single: async () => {
          query++
          return { data: query === 1 ? { id: 'own' } : { id: 'client', theme_preference: 'dark' }, error: options.failAt === query ? { message: 'denied' } : null }
        },
        maybeSingle: async () => {
          query++
          return { data: options.emptyIntake ? null : { motivation_why: 'Server answer', coach_notes: 'Not draftable' }, error: options.failAt === query ? { message: 'denied' } : null }
        },
      }
      return chain
    },
  }
  const effect = evaluate(`export const effect = ${effects[0]}`, {
    supabase, router: { push() {} }, parseProfileDraft: parser.parseProfileDraft,
    resolveSignedMediaUrl: async () => null,
    window: { localStorage: { getItem: () => {
      if (options.storageError) throw new Error('Storage disabled')
      return options.badDraft ? '{' : JSON.stringify({ motivation_why: 'Restored writing', coach_notes: 'Must not overwrite' })
    } } },
    setProfile() {}, setThemePreference() {}, setClientId: value => { state.clientId = value },
    setIntake: value => { state.intake = value }, setDraftChanges: value => { state.draft = value },
    setRestoredDraft: value => { state.restored = value }, setLoadError: value => state.errors.push(value),
    setLoading: value => state.loading.push(value),
  }).effect
  effect()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.loading.at(-1), false)
  if (options.failAt) {
    assert.equal(state.errors.at(-1), true)
    assert.equal(state.clientId, undefined)
  } else {
    assert.equal(state.clientId, 'client')
    const restored = !options.badDraft && !options.storageError
    assert.equal(state.restored, restored)
    assert.equal(state.intake.motivation_why, restored ? 'Restored writing' : 'Server answer')
    assert.deepEqual(plain(state.draft), restored ? { motivation_why: 'Restored writing' } : {})
    if (!options.emptyIntake) assert.equal(state.intake.coach_notes, 'Not draftable')
  }
  cases++
}
for (const [component, field, inputType, entered, expected] of [
  ['Input', 'current_weight_lbs', 'number', '', null],
  ['Input', 'current_weight_lbs', 'number', '185', '185'],
  ['Input', 'date_of_birth', 'date', '', null],
  ['Select', 'training_frequency', undefined, '', null],
]) {
  let answer
  const element = evaluate(`export const component = ${definitions[component]}`, {
    _Ctx: {}, _uc: () => ({ intake: { training_frequency: 0 }, set: (_field, value) => { answer = value }, t: {} }), sharedInputStyle: {},
  }).component({ field, type: inputType, options: [] })
  element.props.onChange({ target: { value: entered } })
  assert.equal(answer, expected)
  if (component === 'Select') assert.equal(element.props.value, '0')
  cases++
}
assert(source.includes('role="alert"') && source.includes('const allSaved = saved && Object.keys(draftChanges).length === 0'))
console.log(`Client profile checks passed: ${cases} cases`)
