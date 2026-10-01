import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the real loader/effects with synthetic results, not a duplicate loader.
const source = readFileSync(new URL('../src/app/dashboard/coach/exercises/page.tsx', import.meta.url), 'utf8')
const ast = ts.createSourceFile('exercises.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let loadCode
let refreshEffect
let visibilityEffect
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === 'load') loadCode = 'const ' + node.getText(ast)
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') {
    if (node.getText(ast).includes('const timer = setTimeout')) refreshEffect = node.getText(ast)
    if (node.getText(ast).includes("document.addEventListener('visibilitychange'")) visibilityEffect = node.getText(ast)
  }
  ts.forEachChild(node, collect)
}
collect(ast)
assert.ok(loadCode && refreshEffect && visibilityEffect)
const compile = code => ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const plain = value => JSON.parse(JSON.stringify(value))
const flush = () => new Promise(resolve => setImmediate(resolve))
const stats = { total:1211, withVideo:600, withMuscles:1100, withPattern:900, withCues:800 }
const result = (name = 'New row', total = 1211) => ({ data:{ items:[{ id:name, name }], total, stats }, error:null })
let cases = 0
function harness(options = {}) {
  const state = { rows:[{ id:'old', name:'Retained' }], total:1211, stats, requests:[], errors:[], navigations:[], timers:[], listeners:new Map(), cleanups:[] }
  const context = {
    module:{ exports:{} }, Error, Number, Math, Date,
    useCallback: fn => fn,
    useEffect: fn => { const cleanup = fn(); if (cleanup) state.cleanups.push(cleanup) },
    loadRequest:{ current:0 }, refreshBlocked:false,
    search:'quad', filterMuscle:'Quads', filterPattern:'squat', filterVideo:'missing', filterDetail:'missing', page:2, PAGE_SIZE:25,
    setLoading: value => { state.loading = value }, setLoadError: value => { state.errors.push(value) },
    setCoachId: value => { state.coachId = value }, setExercises: value => { state.rows = value },
    setTotal: value => { state.total = value }, setStats: value => { state.stats = value },
    setPage: value => { state.page = value }, router:{ push: value => state.navigations.push(value) },
    setTimeout: (fn, delay) => { const timer = { fn, delay }; state.timers.push(timer); return timer },
    clearTimeout: timer => { timer.cancelled = true },
    document:{ visibilityState:'visible', addEventListener: (name, fn) => state.listeners.set(name, fn), removeEventListener: name => state.listeners.delete(name) },
    supabase:{
      auth:{ getUser: async () => {
        if (options.authWait) await options.authWait
        if (options.authThrows) throw new Error('Session check failed')
        return { data:{ user:options.noUser ? null : { id:'coach' } }, error:options.authError }
      } },
      rpc: async (name, params) => {
        state.requests.push({ name, params:plain(params) })
        if (options.rpcThrows) throw new Error('Request failed')
        if (options.rpc) return options.rpc()
        return options.response || result()
      },
    },
  }
  Object.assign(context, options.context)
  context.exports = context.module.exports
  vm.runInNewContext(compile(loadCode + '\nexport { load }'), context)
  return { state, context, load:context.module.exports.load,
    runRefresh: () => vm.runInNewContext(compile(refreshEffect), context),
    runVisibility: () => vm.runInNewContext(compile(visibilityEffect), context),
  }
}
{
  const h = harness(); await h.load()
  assert.deepEqual(h.state.requests, [{ name:'get_coach_exercise_library', params:{ p_search:'quad', p_muscle:'Quads', p_pattern:'squat', p_video:'missing', p_detail:'missing', p_offset:25, p_limit:25 } }])
  assert.equal(h.state.rows[0].name, 'New row'); assert.equal(h.state.coachId, 'coach')
  assert.equal(h.state.total, 1211); assert.deepEqual(plain(h.state.stats), stats)
  assert.equal(h.state.loading, false); assert.equal(h.state.errors.at(-1), null); cases++
}
for (const options of [{ noUser:true }, { authError:{} }, { authThrows:true }]) {
  const h = harness(options); await h.load()
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.rows[0].id, 'old')
  assert.ok(h.state.errors.at(-1)); assert.equal(h.state.loading, false)
  assert.equal(h.state.navigations.length, options.noUser ? 1 : 0); cases++
}
for (const options of [
  { response:{ data:null, error:{} } }, { response:{ data:null, error:null } },
  { response:{ data:{ items:null, total:4, stats }, error:null } },
  { response:{ data:{ items:[], total:4 }, error:null } },
  { response:{ data:{ items:[], total:-1, stats }, error:null } },
  { response:{ data:{ items:[], total:'4', stats }, error:null } }, { rpcThrows:true },
]) {
  const h = harness(options); await h.load()
  assert.ok(h.state.errors.at(-1)); assert.equal(h.state.rows[0].id, 'old')
  assert.equal(h.state.total, 1211); assert.equal(h.state.loading, false); cases++
}
{
  const options = { response:{ data:null, error:{} } }; const h = harness(options)
  await h.load(); options.response = result('Retried'); await h.load()
  assert.equal(h.state.rows[0].id, 'Retried'); assert.equal(h.state.errors.at(-1), null); cases++
}
{
  const h = harness({ response:{ data:{ items:[], total:0, stats }, error:null }, context:{ page:1 } }); await h.load()
  assert.deepEqual(plain(h.state.rows), []); assert.equal(h.state.total, 0); assert.equal(h.state.errors.at(-1), null); cases++
}
for (const total of [0, 25, 26]) {
  const h = harness({ response:result('Out of bounds', total), context:{ page:5 } }); await h.load()
  assert.equal(h.state.page, Math.max(1, Math.ceil(total / 25)))
  assert.equal(h.state.rows[0].id, 'old'); assert.equal(h.state.loading, false); cases++
}
function deferred() {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
for (const lateResult of [result('Stale'), { data:null, error:{} }]) {
  const waiting = deferred(); let call = 0
  const h = harness({ rpc:() => ++call === 1 ? waiting.promise : Promise.resolve(result('Latest')) })
  const oldLoad = h.load(); await flush()
  assert.equal(h.state.requests.length, 1)
  h.context.search = 'Latest'; await h.load()
  waiting.resolve(lateResult); await oldLoad
  assert.equal(h.state.rows[0].id, 'Latest'); assert.equal(h.state.errors.at(-1), null)
  assert.equal(h.state.loading, false); cases++
}
{
  const waiting = deferred(); const h = harness({ authWait:waiting.promise })
  const oldLoad = h.load(); h.context.loadRequest.current++; waiting.resolve(); await oldLoad
  assert.equal(h.state.requests.length, 0); assert.equal(h.state.rows[0].id, 'old')
  assert.equal(h.state.errors.at(-1), null); cases++
}
{
  const waiting = deferred(); const h = harness({ rpc:() => waiting.promise })
  const oldLoad = h.load(); await flush(); h.runRefresh()
  h.state.cleanups.at(-1)(); waiting.resolve(result('Unmounted')); await oldLoad
  assert.equal(h.state.rows[0].id, 'old'); assert.ok(h.state.timers[0].cancelled); cases++
}
for (const blocked of [false, true]) {
  const h = harness({ context:{ refreshBlocked:blocked } }); h.runRefresh()
  assert.equal(h.state.timers.length, blocked ? 0 : 1)
  if (!blocked) {
    assert.equal(h.state.timers[0].delay, 300); await h.state.timers[0].fn()
    await flush()
    assert.equal(h.state.requests.length, 1)
    h.state.cleanups.at(-1)(); assert.ok(h.state.timers[0].cancelled)
  } else assert.equal(h.state.loading, false)
  cases++
}
for (const blocked of [false, true]) {
  const h = harness({ context:{ refreshBlocked:blocked } }); h.runVisibility()
  const onVis = h.state.listeners.get('visibilitychange')
  h.context.document.visibilityState = 'hidden'; onVis(); await Promise.resolve()
  assert.equal(h.state.requests.length, 0)
  h.context.document.visibilityState = 'visible'; onVis(); onVis()
  await flush()
  assert.equal(h.state.requests.length, blocked ? 0 : 1)
  h.state.cleanups.at(-1)(); assert.equal(h.state.listeners.size, 0); cases++
}
console.log(`Exercise library checks passed (${cases} cases; synthetic results only).`)
