import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const plain = value => JSON.parse(JSON.stringify(value))
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const helperSource = readFileSync(new URL('../src/lib/progress-photo.ts', import.meta.url), 'utf8')
let cases = 0
function imageHarness(options = {}) {
  const state = { decoded: 0, closed: 0, draw: [], fill: [] }
  const bitmap = { width: options.width ?? 4032, height: options.height ?? 3024, close: () => state.closed++ }
  const canvas = {
    width: 0, height: 0,
    getContext: () => options.noContext ? null : {
      fillRect: (...args) => state.fill.push(args),
      drawImage: (...args) => state.draw.push(args.slice(1)),
    },
    toBlob(callback, type, quality) {
      assert.equal(type, 'image/jpeg'); assert.equal(quality, 0.9)
      state.dimensions = [canvas.width, canvas.height]
      callback(options.noBlob ? null : new Blob([new Uint8Array(options.bytes ?? 3000)], { type: options.blobType ?? 'image/jpeg' }))
    },
  }
  const context = {
    module: { exports: {} }, File, Blob, Error,
    createImageBitmap: async (file, config) => {
      state.decoded++; assert.equal(config.imageOrientation, 'from-image')
      if (options.decodeError) throw new Error('decode')
      return bitmap
    },
    document: { createElement: tag => { assert.equal(tag, 'canvas'); return canvas } },
  }
  context.exports = context.module.exports
  vm.runInNewContext(compile(helperSource), context)
  return { ...context.module.exports, state, canvas }
}
for (const [width, height, expected] of [[4032, 3024, [1920, 1440]], [3024, 4032, [1440, 1920]], [2000, 2000, [1920, 1920]], [800, 600, [800, 600]], [1, 4032, [1, 1920]]]) {
  const h = imageHarness({ width, height })
  const input = new File([new Uint8Array(6000)], 'original.png', { type: 'image/png' })
  const output = await h.prepareProgressPhoto(input)
  assert.deepEqual(h.state.dimensions, expected)
  assert.deepEqual(h.state.draw, [[0, 0, ...expected]])
  assert.deepEqual(h.state.fill, [[0, 0, ...expected]])
  assert.equal(output.name, 'original.jpg'); assert.equal(output.type, 'image/jpeg')
  assert.equal(input.size, 6000); assert.equal(input.type, 'image/png')
  assert.equal(h.state.closed, 1); assert.equal(h.canvas.width, 0); assert.equal(h.canvas.height, 0)
  cases++
}
for (const [type, name] of [['image/jpeg', 'photo.jpg'], ['image/webp', 'photo.webp'], ['image/heic', 'photo.heic'], ['image/heif', 'photo.heif'], ['', 'photo.JPEG']]) {
  const h = imageHarness()
  assert.equal((await h.prepareProgressPhoto(new File(['synthetic'], name, { type }))).type, 'image/jpeg')
  cases++
}
for (const [type, name] of [['image/jpeg', 'a.jpg'], ['image/png', 'a.png'], ['image/webp', 'a.webp'], ['', 'a.JPG']]) {
  const h = imageHarness({ width: 800, height: 600 })
  const input = new File(['small'], name, { type })
  const output = await h.prepareProgressPhoto(input)
  assert.equal(output.size, input.size); assert.equal(output.type, type || 'image/jpeg')
  if (type) assert.equal(output, input)
  assert.equal(h.state.closed, 1); cases++
}
for (const file of [new File(['gif'], 'a.gif', { type: 'image/gif' }), new File(['svg'], 'a.svg', { type: 'image/svg+xml' }), new File([], 'empty.jpg', { type: 'image/jpeg' }), { type: 'image/jpeg', size: 30 * 1024 * 1024 + 1, name: 'big.jpg' }, new File(['fake'], 'a.jpg', { type: 'text/plain' })]) {
  const h = imageHarness()
  await assert.rejects(h.prepareProgressPhoto(file))
  assert.equal(h.state.decoded, 0)
  cases++
}
for (const options of [{ decodeError: true }, { width: 0 }, { width: 10000, height: 6000 }, { noContext: true }, { noBlob: true }, { blobType: 'image/png' }, { bytes: 0 }, { bytes: 10 * 1024 * 1024 + 1 }]) {
  const h = imageHarness(options)
  await assert.rejects(h.prepareProgressPhoto(new File(['synthetic'], 'a.heic', { type: 'image/heic' })))
  assert.equal(h.state.closed, options.decodeError ? 0 : 1)
  assert.equal(h.canvas.width, 0)
  cases++
}

// Execute the real component handlers; no private media or live accounts are used.
const pageSource = readFileSync(new URL('../src/app/dashboard/client/progress/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('progress.tsx', pageSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const handlers = new Map()
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name) handlers.set(node.name.text, node.getText(ast))
  ts.forEachChild(node, collect)
}
collect(ast)
function uploadHarness(options = {}) {
  const state = { errors: [], uploads: [], writes: [], prepared: 0, refreshes: 0, draft: new Map(), open: true, pending: { current: null }, lock: { current: false }, saving: [] }
  const file = new File(['synthetic'], 'original.png', { type: 'image/png' })
  const initial = { angle: 'front', caption: '  My personal note  ', weight_at_time: '155.5', ...options.form }
  const chain = {
    upsert(payload, config) { state.writes.push(plain({ payload, config })); return chain },
    select(columns) { assert.equal(columns, 'id'); return chain },
    async single() {
      if (options.writeThrows) throw new Error('network')
      return { data: options.noRow ? null : { id: 'photo-id' }, error: options.writeError }
    },
  }
  const context = {
    module: { exports: {} }, Error, Number, crypto: { randomUUID: () => 'photo-id' },
    clientProfileId: 'profile', photoFile: options.noFile ? null : file, photoForm: initial,
    saving: !!options.saving, ANGLES: ['front', 'back', 'side_left', 'side_right', 'other'],
    photoUploadingRef: state.lock, pendingPhotoRef: state.pending, fileRef: { current: { value: 'selected' } },
    setSaving: value => state.saving.push(value), setPhotoError: value => state.errors.push(value),
    setPhotoOpen: value => { state.open = value }, setPhotoFile: value => { state.file = value },
    setPhotoForm: value => { state.form = value; context.photoForm = value },
    setPhotoRefreshKey: () => state.refreshes++, localDateStr: () => '2026-09-30',
    prepareProgressPhoto: async input => { assert.equal(input, file); state.prepared++; if (options.prepareError) throw new Error('Unsupported photo'); return new File(['prepared'], 'a.jpg', { type: options.preparedType ?? 'image/jpeg' }) },
    localStorage: {
      getItem: key => { if (options.storageThrows) throw new Error('blocked'); return state.draft.get(key) ?? null },
      setItem: (key, value) => { if (options.storageThrows) throw new Error('blocked'); state.draft.set(key, value) },
      removeItem: key => { if (options.storageThrows) throw new Error('blocked'); state.draft.delete(key) },
    },
    supabase: {
      auth: { getUser: async () => {
        if (options.authWait) await options.authWait
        if (options.authThrows) throw new Error('network')
        return { data: { user: options.noUser ? null : { id: options.changedUser ? 'other' : 'profile' } }, error: options.authError }
      } },
      storage: { from: bucket => {
        assert.equal(bucket, 'progress-photos')
        return { upload: async (path, prepared, config) => {
          state.uploads.push(plain({ path, config, type: prepared.type }))
          if (options.uploadThrows) throw new Error('network')
          return { data: options.noUploadData ? null : { path }, error: options.uploadError }
        } }
      } },
      from: table => { assert.equal(table, 'progress_photos'); return chain },
    },
  }
  context.exports = context.module.exports
  const names = ['photoDraftKey', 'openPhoto', 'updatePhotoForm', 'uploadPhoto']
  vm.runInNewContext(compile(names.map(name => handlers.get(name)).join('\n') + `\nexport { ${names.join(',')} }`), context)
  state.draft.set('progress-photo-draft:v1:profile', JSON.stringify(initial))
  return { ...context.module.exports, state, context, options }
}
for (const options of [{ noFile: true }, { saving: true }]) {
  const h = uploadHarness(options); await h.uploadPhoto(); assert.equal(h.state.uploads.length, 0); cases++
}
for (const options of [{ noUser: true }, { changedUser: true }, { authError: {} }, { authThrows: true }, { prepareError: true }, { uploadError: {} }, { uploadThrows: true }, { noUploadData: true }, { writeError: {} }, { noRow: true }, { writeThrows: true }, { form: { weight_at_time: 'abc' } }, { form: { weight_at_time: '-1' } }, { form: { angle: 'invalid' } }]) {
  const h = uploadHarness(options)
  await h.uploadPhoto()
  assert.equal(h.state.open, true); assert.equal(h.state.file, undefined)
  assert.equal(h.state.refreshes, 0); assert.ok(h.state.errors.at(-1))
  assert.equal(h.state.draft.size, 1); assert.equal(h.state.lock.current, false)
  assert.equal(h.state.saving.at(-1), false)
  cases++
}
{
  const h = uploadHarness(); await h.uploadPhoto()
  assert.equal(h.state.open, false); assert.equal(h.state.file, null)
  assert.equal(h.state.draft.size, 0); assert.equal(h.state.pending.current, null)
  assert.equal(h.state.refreshes, 1)
  assert.deepEqual(h.state.uploads[0], { path: 'profile/photo-id.jpg', config: { contentType: 'image/jpeg', cacheControl: '3600', upsert: false }, type: 'image/jpeg' })
  assert.deepEqual(h.state.writes[0], { payload: { id: 'photo-id', client_id: 'profile', storage_path: 'profile/photo-id.jpg', photo_date: '2026-09-30', angle: 'front', caption: 'My personal note', weight_at_time: 155.5 }, config: { onConflict: 'id' } })
  cases++
}
for (const options of [{ writeError: {} }, { writeThrows: true }, { noRow: true }]) {
  const h = uploadHarness(options); await h.uploadPhoto()
  options.writeError = null; options.writeThrows = false; options.noRow = false
  await h.uploadPhoto()
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.prepared, 1)
  assert.equal(h.state.writes.length, 2); assert.equal(h.state.writes[0].payload.id, h.state.writes[1].payload.id)
  assert.equal(h.state.open, false); cases++
}
for (const [type, extension] of [['image/png', 'png'], ['image/webp', 'webp']]) {
  const h = uploadHarness({ preparedType: type }); await h.uploadPhoto()
  assert.equal(h.state.uploads[0].path, `profile/photo-id.${extension}`)
  assert.equal(h.state.uploads[0].config.contentType, type)
  assert.equal(h.state.open, false); cases++
}
{
  const h = uploadHarness({ form: { caption: '   ', weight_at_time: '' } }); await h.uploadPhoto()
  assert.equal(h.state.writes[0].payload.weight_at_time, null)
  assert.equal(h.state.writes[0].payload.caption, null); cases++
}
{
  let release
  const h = uploadHarness({ authWait: new Promise(resolve => { release = resolve }) })
  const first = h.uploadPhoto(); await h.uploadPhoto(); release(); await first
  assert.equal(h.state.uploads.length, 1); assert.equal(h.state.writes.length, 1); cases++
}
for (const raw of [JSON.stringify({ angle: 'back', caption: 'Restored', weight_at_time: '' }), 'invalid', 'null', JSON.stringify({ angle: 'invalid', caption: 'a', weight_at_time: '' })]) {
  const h = uploadHarness(); h.state.draft.set('progress-photo-draft:v1:profile', raw); h.openPhoto()
  assert.equal(h.state.open, true)
  if (raw.includes('Restored')) assert.equal(h.state.form.caption, 'Restored')
  else assert.equal(h.state.form, undefined)
  cases++
}
{
  const h = uploadHarness(); h.updatePhotoForm({ caption: 'Typed note' })
  assert.equal(JSON.parse(h.state.draft.get('progress-photo-draft:v1:profile')).caption, 'Typed note')
  assert.equal(h.state.form.angle, 'front'); cases++
}
{
  const h = uploadHarness({ storageThrows: true }); h.openPhoto(); h.updatePhotoForm({ caption: 'Kept in memory' }); await h.uploadPhoto()
  assert.equal(h.state.open, false); assert.equal(h.state.refreshes, 1); cases++
}
assert.ok(pageSource.includes('role="alert"'))
assert.ok(pageSource.includes('zIndex:10020'))
assert.ok(pageSource.includes('fontSize:16'))
assert.ok(!helperSource.includes('fetch('))
console.log(`Progress-photo checks passed (${cases} grouped cases): resizing, private upload, confirmed save, draft recovery, and retry safety.`)
