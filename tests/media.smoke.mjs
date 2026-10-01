import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

// Execute the actual resolver, with synthetic paths and an isolated clock/SDK.
const source = readFileSync(new URL('../src/lib/media.ts', import.meta.url), 'utf8')
const compiledMedia = { exports: {} }
let now = 1000000
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: compiledMedia, exports: compiledMedia.exports, URL, Date: { now: () => now } })
const { resolveSignedMediaUrl: resolve, resolveSignedMediaUrls: batch, getStoragePathFromUrl: parse } = compiledMedia.exports
const plain = value => JSON.parse(JSON.stringify(value))
let cases = 0
const deferred = () => {
  let finish
  const promise = new Promise(done => { finish = done })
  return { promise, finish }
}
function client(origin = 'https://test.supabase.co') {
  const calls = []
  let userId = 'first-user', authError = null, listener, response, sessionResponse
  const api = {
    auth: {
      onAuthStateChange(callback) { listener = callback },
      async getSession() {
        if (sessionResponse) return sessionResponse()
        return { data: { session: userId ? { user: { id: userId } } : null }, error: authError }
      },
    },
    storage: { from: bucket => ({
      getPublicUrl: path => ({ data: { publicUrl: encodeURI(`${origin}/storage/v1/object/public/${bucket}/${path}`) } }),
      async createSignedUrls(paths, ttl) {
        calls.push({ bucket, paths, ttl })
        if (response) return response(paths)
        return { data: paths.map(path => ({ path, signedUrl: `${origin}/storage/v1/object/sign/${bucket}/${encodeURI(path)}?token=${calls.length}` })), error: null }
      },
    }) },
  }
  return { api, calls, setResponse(fn) { response = fn }, setSession(fn) { sessionResponse = fn },
    setAuthError(error) { authError = error },
    emit(event, user = userId) { userId = user; listener?.(event, user ? { user: { id: user } } : null) },
  }
}

{
  const c = client()
  for (const bucket of ['exercise-videos', 'resources', 'avatars', 'community-media']) {
    const a = await resolve(c.api, bucket, 'folder/demo clip.mp4')
    assert.equal(a, await resolve(c.api, bucket, a))
    assert(a.includes('/object/public/'))
    assert(!a.includes('token='))
  }
  assert.equal(c.calls.length, 0)
  cases += 4
}
{
  const c = client()
  const first = await resolve(c.api, 'form-checks', 'folder/demo clip.mov')
  const publicUrl = 'https://test.supabase.co/storage/v1/object/public/form-checks/folder/demo%20clip.mov'
  assert.equal(first, await resolve(c.api, 'form-checks', publicUrl))
  assert.equal(first, await resolve(c.api, 'form-checks', first))
  assert.equal(first, await resolve(c.api, 'form-checks', 'form-checks/folder/demo clip.mov'))
  assert.equal(c.calls.length, 1)
  assert.equal(c.calls[0].paths[0], 'folder/demo clip.mov')
  cases++
}
{
  const c = client()
  assert.deepEqual(plain(await batch(c.api, 'form-checks', [null, '', undefined])), [null, null, null])
  for (const url of ['https://caps.srgfit.app/demo', 'https://example.com/supabase-guide', 'https://other.supabase.co/storage/v1/object/public/form-checks/demo.mov']) {
    assert.equal(await resolve(c.api, 'form-checks', url), url)
  }
  for (const url of ['https://test.supabase.co/storage/v1/object/public/progress-photos/demo.jpg', 'https://test.supabase.co/storage/v1/object/sign/form-checks/%XX', 'https://[']) {
    assert.equal(await resolve(c.api, 'form-checks', url), null)
  }
  assert.equal(c.calls.length, 0)
  cases += 7
}
{
  const c = client(), held = deferred()
  c.setResponse(async paths => { await held.promise; return { data: paths.map(path => ({ path, signedUrl: `signed:${path}` })), error: null } })
  const first = batch(c.api, 'progress-photos', ['a.jpg', 'a.jpg', 'b.jpg'])
  const concurrent = resolve(c.api, 'progress-photos', 'a.jpg')
  await new Promise(done => setImmediate(done))
  assert.equal(c.calls.length, 1)
  assert.deepEqual(plain(c.calls[0].paths), ['a.jpg', 'b.jpg'])
  held.finish()
  assert.deepEqual(plain(await first), ['signed:a.jpg', 'signed:a.jpg', 'signed:b.jpg'])
  assert.equal(await concurrent, 'signed:a.jpg')
  await batch(c.api, 'progress-photos', ['b.jpg', 'c.jpg'])
  assert.deepEqual(plain(c.calls[1].paths), ['c.jpg'])
  cases += 2
}
{
  const c = client()
  const first = await resolve(c.api, 'form-checks', 'a.mov')
  now += 3299000
  assert.equal(first, await resolve(c.api, 'form-checks', 'a.mov'))
  now += 1000
  assert.notEqual(first, await resolve(c.api, 'form-checks', 'a.mov'))
  assert.equal(c.calls.length, 2)
  const short = await resolve(c.api, 'form-checks', 'short.mov', 10)
  now += 9000
  assert.notEqual(short, await resolve(c.api, 'form-checks', 'short.mov', 10))
  cases += 2
}
{
  const c = client()
  const first = await resolve(c.api, 'message-media', 'a.mp4')
  c.emit('TOKEN_REFRESHED')
  assert.equal(first, await resolve(c.api, 'message-media', 'a.mp4'))
  c.emit('SIGNED_OUT', null)
  assert.equal(await resolve(c.api, 'message-media', 'a.mp4'), null)
  c.emit('SIGNED_IN', 'second-user')
  assert.notEqual(first, await resolve(c.api, 'message-media', 'a.mp4'))
  assert.equal(c.calls.length, 2)
  cases += 3
}
{
  const c = client(), held = deferred()
  c.setResponse(async paths => { await held.promise; return { data: paths.map(path => ({ path, signedUrl: 'old-user-secret-url' })), error: null } })
  const pending = resolve(c.api, 'progress-photos', 'a.jpg')
  await new Promise(done => setImmediate(done))
  c.emit('SIGNED_OUT', null)
  c.emit('SIGNED_IN', 'second-user')
  held.finish()
  assert.equal(await pending, null)
  c.setResponse(null)
  assert((await resolve(c.api, 'progress-photos', 'a.jpg')).includes('token=2'))
  cases++
}
{
  const c = client(), held = deferred()
  c.setSession(() => held.promise)
  const pending = resolve(c.api, 'form-checks', 'a.mov')
  c.emit('SIGNED_OUT', null)
  held.finish({ data: { session: { user: { id: 'first-user' } } }, error: null })
  assert.equal(await pending, null)
  assert.equal(c.calls.length, 0)
  cases++
}
{
  const first = client(), second = client(), otherProject = client('https://another.example.com')
  await resolve(first.api, 'form-checks', 'a.mov')
  await resolve(second.api, 'form-checks', 'a.mov')
  assert((await resolve(otherProject.api, 'form-checks', 'a.mov')).startsWith('https://another.example.com'))
  await resolve(first.api, 'workout-reviews', 'a.mov')
  await resolve(first.api, 'form-checks', 'a.mov', 60)
  assert.equal(first.calls.length, 3)
  assert.equal(second.calls.length, 1)
  assert.equal(otherProject.calls.length, 1)
  cases += 3
}
for (const response of [() => ({ data: null, error: { message: 'denied' } }), () => { throw new Error('network') }, paths => ({ data: paths.map(path => ({ path, error: 'denied', signedUrl: null })), error: null })]) {
  const c = client()
  c.setResponse(response)
  assert.equal(await resolve(c.api, 'form-checks', 'a.mov'), null)
  c.setResponse(null)
  assert(await resolve(c.api, 'form-checks', 'a.mov'))
  assert.equal(c.calls.length, 2)
  cases++
}
{
  const c = client()
  c.setAuthError({ message: 'expired' })
  assert.equal(await resolve(c.api, 'form-checks', 'a.mov'), null)
  assert.equal(c.calls.length, 0)
  for (const ttl of [0, -1, NaN, Infinity, 1.5]) await assert.rejects(resolve(c.api, 'form-checks', 'a.mov', ttl))
  cases += 2
}
{
  const c = client()
  await batch(c.api, 'progress-photos', Array.from({ length: 501 }, (_, index) => `${index}.jpg`))
  await resolve(c.api, 'progress-photos', '500.jpg')
  assert.equal(c.calls.length, 1)
  await resolve(c.api, 'progress-photos', '0.jpg')
  assert.equal(c.calls.length, 2)
  assert.equal(parse('https://test.supabase.co/storage/v1/object/sign/form-checks/a%20b.mov?token=old'), 'a b.mov')
  assert.equal(parse('not a url'), null)
  cases += 2
}
{
  const c = client(), held = deferred()
  c.setResponse(async paths => { await held.promise; return { data: paths.map(path => ({ path, signedUrl: 'expired-url' })), error: null } })
  const pending = resolve(c.api, 'form-checks', 'a.mov', 10)
  await new Promise(done => setImmediate(done))
  now += 10000
  held.finish()
  assert.equal(await pending, null)
  c.setResponse(null)
  assert(await resolve(c.api, 'form-checks', 'a.mov', 10))
  cases++
}

// Also verify the installed SDK's batch response/path encoding contract.
{
  let requests = 0
  const sdk = createClient('https://sdk.example.com', 'synthetic-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      requests++
      assert.equal(String(url), 'https://sdk.example.com/storage/v1/object/sign/form-checks')
      assert.equal(options.method, 'POST')
      const body = JSON.parse(options.body)
      assert.deepEqual(body.paths, ['folder/demo clip.mov'])
      return new Response(JSON.stringify(body.paths.map(path => ({ path, signedURL: `/object/sign/form-checks/${path}?token=synthetic` }))), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      })
    } },
  })
  sdk.auth.onAuthStateChange = () => ({ data: { subscription: { unsubscribe() {} } } })
  sdk.auth.getSession = async () => ({ data: { session: { user: { id: 'synthetic-user' }, access_token: 'synthetic-test-token' } }, error: null })
  const first = await resolve(sdk, 'form-checks', 'folder/demo clip.mov')
  assert.equal(first, 'https://sdk.example.com/storage/v1/object/sign/form-checks/folder/demo%20clip.mov?token=synthetic')
  assert.equal(first, await resolve(sdk, 'form-checks', first))
  assert.equal(requests, 1)
  assert.equal(await resolve(sdk, 'exercise-videos', 'demo clip.mp4'), 'https://sdk.example.com/storage/v1/object/public/exercise-videos/demo%20clip.mp4')
  assert.equal(requests, 1)
  cases++
}

// Exercise the actual upload handler. A storage success is not a saved exercise.
const workoutSource = readFileSync(new URL('../src/app/dashboard/client/workout/[sessionId]/page.tsx', import.meta.url), 'utf8')
const workoutAst = ts.createSourceFile('workout.tsx', workoutSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let uploadCode
function collect(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'uploadFormVideo') uploadCode = node.getText(workoutAst)
  ts.forEachChild(node, collect)
}
collect(workoutAst)
assert(uploadCode)
async function uploadHarness(options = {}) {
  const state = { errors: [], uploading: {}, previews: {}, uploads: 0, writes: 0, signs: 0, filters: [] }
  const chain = {
    update(payload) { state.writes++; state.payload = payload; return chain },
    eq(key, value) { state.filters.push([key, value]); return chain },
    select(columns) { assert.equal(columns, 'id'); return chain },
    async single() {
      if (options.writeThrows) throw new Error('network')
      return { data: options.noRow ? null : { id: 'exercise' }, error: options.writeError }
    },
  }
  const compiled = { exports: {} }
  vm.runInNewContext(ts.transpileModule(`${uploadCode}; export { uploadFormVideo }`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiled, exports: compiled.exports, Date,
    sessionId: 'session', toastError: message => state.errors.push(message),
    setVideoUploading: update => { state.uploading = update(state.uploading) },
    setVideoUploads: update => { state.previews = update(state.previews) },
    resolveSignedMediaUrl: async () => { state.signs++; return options.signFailure ? null : 'signed-preview' },
    supabase: {
      auth: { getUser: async () => {
        if (options.authThrows) throw new Error('network')
        return { data: { user: options.noUser ? null : { id: 'own' } }, error: options.authError }
      } },
      storage: { from: bucket => {
        assert.equal(bucket, 'form-checks')
        return { upload: async path => {
          state.uploads++; state.path = path
          if (options.uploadThrows) throw new Error('network')
          return { error: options.uploadError }
        } }
      } },
      from: table => { assert.equal(table, 'session_exercises'); return chain },
    },
  })
  await compiled.exports.uploadFormVideo('exercise', { name: 'test.mov', size: options.size ?? 4096 })
  assert.equal(state.uploading.exercise || false, false)
  return state
}
for (const options of [{ noUser: true }, { authError: {} }, { authThrows: true }, { uploadError: {} }, { uploadThrows: true }, { writeError: {} }, { noRow: true }, { writeThrows: true }]) {
  const state = await uploadHarness(options)
  assert.equal(state.errors.length, 1)
  assert.deepEqual(state.previews, {})
  assert.equal(state.signs, 0)
  cases++
}
{
  const state = await uploadHarness({ signFailure: true })
  assert(state.errors[0].includes('was saved'))
  assert.deepEqual(state.previews, {})
  assert.equal(state.writes, 1)
  cases++
}
{
  const state = await uploadHarness()
  assert.deepEqual(state.errors, [])
  assert.equal(state.previews.exercise, 'signed-preview')
  assert.equal(state.payload.client_video_url, state.path)
  assert(!state.path.includes('token='))
  assert.deepEqual(state.filters, [['id', 'exercise'], ['session_id', 'session']])
  cases++
}
{
  const rejected = await uploadHarness({ size: 150 * 1024 * 1024 + 1 })
  assert.equal(rejected.uploads, 0)
  assert(rejected.errors[0].includes('150MB'))
  const accepted = await uploadHarness({ size: 150 * 1024 * 1024 })
  assert.equal(accepted.uploads, 1)
  assert.deepEqual(accepted.errors, [])
  cases += 2
}
// Verify the shared photo loader's error/cancellation states with synthetic rows.
const photoSource = readFileSync(new URL('../src/components/client/ProgressPhotosViewer.tsx', import.meta.url), 'utf8')
const photoAst = ts.createSourceFile('photos.tsx', photoSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let photoEffect
function photoCollect(node) {
  if (ts.isCallExpression(node) && node.expression.getText(photoAst) === 'useEffect') photoEffect = node.arguments[0].getText(photoAst)
  ts.forEachChild(node, photoCollect)
}
photoCollect(photoAst)
async function photoHarness(options = {}) {
  const state = { errors: [], photos: [], loading: [], reset: 0 }
  const rows = options.empty ? [] : [{ id: 'photo', storage_path: 'own/photo.jpg' }]
  const query = {
    select() { return query }, eq() { return query }, order() { return query }, gte() { return query },
    then(resolve, reject) {
      return (options.throwQuery ? Promise.reject(new Error('network')) : Promise.resolve({ data: rows, error: options.queryError })).then(resolve, reject)
    },
  }
  const compiled = { exports: {} }
  vm.runInNewContext(ts.transpileModule(`export const effect = ${photoEffect}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: compiled, exports: compiled.exports,
    supabase: { from: table => { assert.equal(table, 'progress_photos'); return query } },
    clientProfileId: 'own', fromDate: null,
    resolveSignedMediaUrls: async () => options.signFailure ? [null] : ['signed-photo'],
    setLoading: value => state.loading.push(value), setLoadError: value => state.errors.push(value),
    setPhotos: value => state.photos.push(plain(value)), setLightbox: () => state.reset++,
    setCompareView: () => state.reset++, setCompareSel: () => state.reset++,
  })
  const cleanup = compiled.exports.effect()
  if (options.cancel) cleanup()
  await new Promise(done => setImmediate(done))
  return state
}
for (const options of [{ queryError: {} }, { throwQuery: true }, { signFailure: true }]) {
  const state = await photoHarness(options)
  assert(state.errors.at(-1).includes('Could not load'))
  assert.deepEqual(state.photos, [[]])
  assert.equal(state.loading.at(-1), false)
  cases++
}
{
  const state = await photoHarness()
  assert.equal(state.photos.at(-1)[0].signedUrl, 'signed-photo')
  assert.equal(state.reset, 3)
  assert.equal(state.loading.at(-1), false)
  assert.equal(state.errors.at(-1), null)
  const empty = await photoHarness({ empty: true })
  assert.deepEqual(empty.photos, [[]])
  assert.equal(empty.loading.at(-1), false)
  const cancelled = await photoHarness({ cancel: true })
  assert.deepEqual(cancelled.photos, [[]])
  assert.deepEqual(cancelled.loading, [true])
  assert(photoSource.includes('loading="lazy"'))
  assert(photoSource.includes('unoptimized'))
  cases += 4
}
console.log(`Media efficiency and upload smoke checks passed (${cases} grouped cases).`)
