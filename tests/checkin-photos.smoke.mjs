import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../src/app/dashboard/client/forms/[formAssignmentId]/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('form.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const declarations = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) declarations.set(node.name.text, node.getText(ast))
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) declarations.set(node.name.text, 'const ' + node.getText(ast))
  ts.forEachChild(node, collect)
}
collect(ast)
const plain = value => JSON.parse(JSON.stringify(value))
const compile = code => ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const path = n => `profile/${id(n)}.jpg`
const file = name => new File(['synthetic photo'], name, { type: 'image/jpeg' })
const photoQuestion = { id: 'photo', question_type: 'file', maps_to: 'progress_photo_front', required: true }
let cases = 0

function harness(options = {}) {
  const state = { events: [], uploads: [], rows: [], formReads: [], errors: [], warnings: [], draft: new Map(), cleared: [], completed: false, lock: { current: false }, prepared: 0 }
  const picked = options.files ?? { photo: [file('one.jpg')] }
  let uuid = 0
  const context = {
    module: { exports: {} }, Error, Set, Number, Date,
    profileId: 'profile', formAssignmentId: 'assignment', assignment: { id: 'assignment', client_id: 'client', form_id: 'assigned-form', ...options.assignment },
    form: options.noForm ? null : { form_type: options.notCheckin ? 'intake' : 'check_in' },
    answers: { note: 'Long personal response', ...options.answers }, files: picked,
    questions: options.questions ?? [photoQuestion, { id: 'note', question_type: 'textarea', required: true }],
    submitting: !!options.submitting, submitted: !!options.submitted, submittingRef: state.lock,
    setSubmitting: value => { state.busy = value; context.submitting = value },
    setSubmitted: value => { state.completed = value; context.submitted = value; state.events.push('success') },
    setSubmitError: value => state.errors.push(value), setSubmitWarning: value => state.warnings.push(value),
    setErrors: value => { state.validation = typeof value === 'function' ? value(state.validation ?? {}) : value },
    setAnswers: value => { context.answers = value; state.answers = plain(value) },
    setFiles: update => { context.files = update(context.files); state.files = context.files },
    localDateStr: () => '2026-09-30', crypto: { randomUUID: () => id(++uuid) },
    prepareProgressPhoto: async input => {
      state.prepared++; if (options.prepareError) throw new Error('Photo cannot be opened')
      return new File([input], 'prepared.jpg', { type: options.preparedType ?? 'image/jpeg' })
    },
    clearServerDraft: async (profile, key) => { state.cleared.push([profile, key]); if (options.clearThrows) throw new Error('offline') },
    window: { localStorage: {
      setItem: (key, value) => { if (options.storageThrows) throw new Error('quota'); state.draft.set(key, value) },
      removeItem: key => { if (options.storageThrows) throw new Error('quota'); state.draft.delete(key) },
    } },
    require: name => {
      if (name === '@/lib/ai-insights') return { triggerAiInsight: () => state.events.push('insight') }
      throw new Error(`Unexpected dependency ${name}`)
    },
    supabase: {
      auth: { getUser: async () => {
        if (options.authWait) await options.authWait
        if (options.authThrows) throw new Error('Network unavailable')
        return { data: { user: options.noUser ? null : { id: options.changedUser ? 'other' : 'profile' } }, error: options.authError }
      } },
      storage: { from: bucket => {
        assert.equal(bucket, 'progress-photos')
        return { upload: async (uploadedPath, prepared, config) => {
          state.uploads.push({ path: uploadedPath, type: prepared.type, config: plain(config) }); state.events.push('upload')
          if (options.uploadThrows) throw new Error('Network unavailable')
          const error = options.uploadError || (options.failUploadAt === state.uploads.length ? {} : null)
          return { data: options.noUploadRow ? null : { path: uploadedPath }, error }
        } }
      } },
      from: table => {
        let mutation = null
        const read = { columns: null, filters: [] }
        const chain = {
          select: columns => { read.columns = columns; return chain },
          eq: (column, value) => { (mutation ? mutation.filters : read.filters).push([column, value]); return chain },
          upsert: (payload, config) => { mutation = { table, kind: 'upsert', payload: plain(payload), config: plain(config), filters: [] }; state.rows.push(mutation); state.events.push(table); return chain },
          update: payload => { mutation = { table, kind: 'update', payload: plain(payload), filters: [] }; state.rows.push(mutation); state.events.push(table); return chain },
          single: async () => {
            if (!mutation && table === 'onboarding_forms') {
              state.formReads.push(plain(read))
              if (options.formThrows) throw new Error('Network unavailable')
              return { data: options.noFormRow ? null : {
                id: options.wrongForm ? 'other-form' : 'assigned-form',
                form_type: options.notCheckin ? 'intake' : 'check_in', is_checkin_type: false,
              }, error: options.formReadError }
            }
            if (!mutation) return { data: options.noClient ? null : { id: 'client', coach_id: options.noCoach ? null : 'coach' }, error: options.clientError }
            if (options.throwTable === table) throw new Error('Network unavailable')
            return { data: options.noRowTable === table ? null : { id: table === 'client_form_assignments' ? 'assignment' : 'row' }, error: options.errorTable === table ? {} : null }
          },
          then: (resolve, reject) => {
            if (options.throwTable === table) return Promise.reject(new Error('Network unavailable')).then(resolve, reject)
            const data = options.noRowTable === table ? null : options.shortPhotos ? [] : mutation.payload.map(row => ({ id: row.id }))
            return Promise.resolve({ data, error: options.errorTable === table ? {} : null }).then(resolve, reject)
          },
        }
        return chain
      },
    },
  }
  context.exports = context.module.exports
  const names = ['uploadedPhotoPaths', 'progressPhotoAngle', 'keepDraft', 'validate', 'metricColumns', 'submit']
  vm.runInNewContext(compile(names.map(name => declarations.get(name)).join('\n') + `\nexport { ${names.join(',')} }`), context)
  return { ...context.module.exports, state, context, options }
}

for (const value of [undefined, null, '', ['picked.jpg'], ['other/' + id(1) + '.jpg'], ['https://example.com/photo.jpg'], ['profile/../a.jpg'], ['profile/' + id(1) + '.svg']]) {
  const h = harness({ files: {}, answers: { photo: value } })
  assert.equal(h.validate(), false); await h.submit(); assert.equal(h.state.rows.length, 0); cases++
}
{
  const h = harness({ files: {}, answers: { photo: [path(9), path(9), 'filename.jpg'] } })
  assert.deepEqual(plain(h.uploadedPhotoPaths(h.context.answers.photo, 'profile')), [path(9)])
  assert.equal(h.validate(), true); await h.submit(); assert.equal(h.state.uploads.length, 0)
  assert.equal(h.state.rows.find(row => row.table === 'progress_photos').payload[0].id, id(9))
  assert.equal(h.state.completed, true); cases++
}
for (const [mapping, angle] of [['progress_photo_front', 'front'], ['progress_photo_back', 'back'], ['progress_photo_side', 'other'], ['progress_photo_side_left', 'side_left'], ['progress_photo_side_right', 'side_right']]) {
  const h = harness({ questions: [{ ...photoQuestion, maps_to: mapping }] }); await h.submit()
  assert.equal(h.state.rows.find(row => row.table === 'progress_photos').payload[0].angle, angle)
  assert.equal(h.state.completed, true); cases++
}
for (const options of [{ noUser: true }, { changedUser: true }, { authError: {} }, { authThrows: true }, { noClient: true }, { clientError: {} }, { assignment: { client_id: 'someone-else' } }, { assignment: { id: 'other' } }, { noFormRow: true }, { formReadError: {} }, { formThrows: true }, { wrongForm: true }, { prepareError: true }, { uploadError: true }, { uploadThrows: true }, { noUploadRow: true }, { errorTable: 'progress_photos' }, { noRowTable: 'progress_photos' }, { shortPhotos: true }, { throwTable: 'progress_photos' }, { errorTable: 'client_form_assignments' }, { noRowTable: 'client_form_assignments' }, { throwTable: 'client_form_assignments' }]) {
  const h = harness(options); await h.submit()
  assert.equal(h.state.completed, false); assert.ok(h.state.errors.at(-1))
  assert.equal(h.state.draft.size, 1); assert.equal(h.state.cleared.length, 0)
  assert.equal(h.state.busy, false); assert.equal(h.state.lock.current, false)
  if (options.errorTable !== 'client_form_assignments' && options.noRowTable !== 'client_form_assignments' && options.throwTable !== 'client_form_assignments') {
    assert.equal(h.state.rows.filter(row => row.table === 'client_form_assignments').length, 0)
  }
  cases++
}
{
  // A tab with null cached metadata must recover through the actual form read.
  const h = harness({ noForm: true }); await h.submit()
  assert.equal(h.state.completed, true)
  assert.deepEqual(h.state.formReads, [{ columns: 'id, form_type, is_checkin_type', filters: [['id', 'assigned-form']] }])
  assert.equal(h.state.rows.filter(row => row.table === 'progress_photos').length, 1); cases++
}
for (const options of [{ noUser: true }, { changedUser: true }, { noClient: true }, { assignment: { client_id: 'someone-else' } }, { assignment: { id: 'other' } }]) {
  const h = harness(options); await h.submit()
  assert.equal(h.state.formReads.length, 0); assert.equal(h.state.uploads.length, 0)
  assert.equal(h.state.rows.length, 0); cases++
}
for (const options of [{ noFormRow: true }, { formReadError: {} }, { formThrows: true }, { wrongForm: true }]) {
  const h = harness(options); await h.submit()
  assert.equal(h.state.uploads.length, 0); assert.equal(h.state.rows.length, 0)
  assert.equal(h.context.files.photo.length, 1); cases++
}
{
  const options = { failUploadAt: 2 }
  const h = harness({ ...options, files: { photo: [file('first.jpg'), file('second.jpg')] } })
  await h.submit(); assert.equal(h.state.completed, false)
  assert.deepEqual(h.state.answers.photo, [path(1)])
  assert.equal(h.context.files.photo.length, 1)
  assert.deepEqual(JSON.parse(h.state.draft.get('form-draft:assignment')).photo, [path(1)])
  h.options.failUploadAt = null; await h.submit()
  assert.equal(h.state.uploads.length, 3); assert.equal(h.state.completed, true)
  const response = h.state.rows.find(row => row.table === 'client_form_assignments').payload.response
  assert.equal(response.photo.length, 2); assert.equal(response.note, 'Long personal response')
  assert.equal(h.state.draft.size, 0); cases++
}
for (const table of ['progress_photos', 'client_form_assignments']) {
  const options = { errorTable: table }
  const h = harness(options); await h.submit(); options.errorTable = null; await h.submit()
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.completed, true)
  const attempts = h.state.rows.filter(row => row.table === 'progress_photos')
  assert.equal(attempts[0].payload[0].id, attempts[1].payload[0].id); cases++
}
{
  const h = harness(); await h.submit()
  assert.equal(h.state.completed, true)
  assert.ok(h.state.events.indexOf('progress_photos') < h.state.events.indexOf('client_form_assignments'))
  const completion = h.state.rows.find(row => row.table === 'client_form_assignments')
  assert.deepEqual(completion.filters, [['id', 'assignment'], ['client_id', 'client']])
  assert.deepEqual(completion.payload.response.photo, [path(1)])
  assert.deepEqual(h.state.uploads[0].config, { upsert: false, contentType: 'image/jpeg', cacheControl: '3600' })
  cases++
}
for (const options of [{ errorTable: 'metrics' }, { noRowTable: 'metrics' }, { throwTable: 'metrics' }, { errorTable: 'clients' }, { noRowTable: 'clients' }, { throwTable: 'clients' }]) {
  const h = harness({ ...options, questions: [photoQuestion, { id: 'weight', question_type: 'number', maps_to: 'weight' }], answers: { weight: 155 } })
  await h.submit(); assert.equal(h.state.completed, true); assert.ok(h.state.warnings.at(-1))
  assert.equal(h.state.errors.at(-1), null); assert.equal(h.state.draft.size, 0); cases++
}
for (const options of [{ submitting: true }, { submitted: true }]) {
  const h = harness(options); await h.submit(); assert.equal(h.state.uploads.length, 0); cases++
}
{
  let release
  const h = harness({ authWait: new Promise(resolve => { release = resolve }) })
  const first = h.submit(); await h.submit(); release(); await first
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.completed, true); cases++
}
for (const options of [{ notCheckin: true }, { noCoach: true }, { storageThrows: true }, { clearThrows: true }]) {
  const h = harness(options); await h.submit(); assert.equal(h.state.completed, true); cases++
}
for (const [type, extension] of [['image/png', 'png'], ['image/webp', 'webp']]) {
  const h = harness({ preparedType: type }); await h.submit()
  assert.equal(h.state.uploads[0].path, `profile/${id(1)}.${extension}`)
  assert.equal(h.state.uploads[0].config.contentType, type); cases++
}
{
  const h = harness({ questions: [{ ...photoQuestion, maps_to: 'progress_photo_unknown' }] }); await h.submit()
  assert.equal(h.state.uploads.length, 0); assert.equal(h.state.completed, false); cases++
}
{
  const h = harness({ files: {}, questions: [{ id: 'note', question_type: 'textarea', required: true }] }); await h.submit()
  assert.equal(h.state.uploads.length, 0); assert.equal(h.state.completed, true); cases++
}
{
  // Refresh after a confirmed upload but failed save: restore paths and text,
  // not browser File objects, then retry using the same photo row id.
  const first = harness({ errorTable: 'client_form_assignments' }); await first.submit()
  const restored = JSON.parse(first.state.draft.get('form-draft:assignment'))
  const second = harness({ files: {}, answers: restored }); await second.submit()
  assert.equal(second.state.uploads.length, 0); assert.equal(second.state.completed, true)
  assert.equal(first.state.rows[0].payload[0].id, second.state.rows[0].payload[0].id); cases++
}
{
  let cleanup; const events = []; const image = { removeAttribute: attribute => events.push(['remove', attribute]) }
  const context = { module: { exports: {} }, useRef: () => ({ current: image }), useEffect: fn => { cleanup = fn() },
    URL: { createObjectURL: () => { events.push('create'); return 'blob:synthetic' }, revokeObjectURL: url => events.push(['revoke', url]) },
    require: name => { assert.equal(name, 'react/jsx-runtime'); return { jsx: (tag, props) => ({ tag, props }) } },
  }
  context.exports = context.module.exports
  vm.runInNewContext(compile(declarations.get('SelectedPhotoPreview') + '\nexport { SelectedPhotoPreview }'), context)
  context.module.exports.SelectedPhotoPreview({ file: file('preview.jpg') })
  assert.equal(image.src, 'blob:synthetic'); cleanup()
  assert.deepEqual(events, ['create', ['remove', 'src'], ['revoke', 'blob:synthetic']]); cases++
}
assert.ok(source.includes('<fieldset disabled={submitting}'))
assert.ok(source.includes('role="alert"'))
assert.ok(!source.includes('console.error('))
assert.ok(!source.includes('setTimeout(() => { setSubmitted(true)'))
assert.ok(source.includes('if (!formAssignmentId || submitted || submitting) return'))
console.log(`Check-in photo checks passed (${cases} grouped cases; no live client data or submissions).`)
