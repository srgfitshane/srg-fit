import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const own = '00000000-0000-4000-8000-000000000001'
const coach = '00000000-0000-4000-8000-000000000002'
const peer = '00000000-0000-4000-8000-000000000003'
const outsider = '00000000-0000-4000-8000-000000000004'
const featured = '00000000-0000-4000-8000-000000000005'
const names = [own, coach, peer].map(id => ({ id, full_name: id === peer ? 'Peer Member' : 'Test Name', email: 'must-not-return', stripe_customer_id: 'must-not-return' }))
const plain = value => JSON.parse(JSON.stringify(value))

function database(expectations) {
  const pending = [...expectations]
  const calls = []
  const unexpected = []
  return {
    calls,
    done() { assert.deepEqual(unexpected, []); assert.equal(pending.length, 0) },
    from(table) {
      const query = { table, filters: [] }
      const execute = async () => {
        const expected = pending.shift()
        if (!expected || table !== expected.table) {
          unexpected.push(query)
          throw new Error('Unexpected query')
        }
        calls.push(query)
        if (expected.throw) throw new Error('Private database failure')
        return { data: expected.data ?? null, error: expected.error ?? null }
      }
      const chain = {
        select(columns) { query.columns = columns; return chain },
        eq(column, value) { query.filters.push([column, value]); return chain },
        in(column, value) { query.filters.push([column, plain(value)]); return chain },
        maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject) },
      }
      return chain
    },
  }
}

function route(options = {}) {
  const serverQueries = []
  if (!options.noUser && !options.authError) {
    serverQueries.push({ table: 'profiles', data: options.missingProfile ? null : { role: options.role || 'client' }, error: options.profileError })
    if (!options.invalid && !options.profileError && !options.missingProfile && (options.role || 'client') === 'client') {
      serverQueries.push({ table: 'clients', data: options.noCoach ? null : { coach_id: coach }, error: options.clientError })
    }
  }
  const server = database(serverQueries)
  server.auth = { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.role === 'coach' ? coach : own } }, error: options.authError }) }
  let adminCreated = 0
  const admin = database(options.adminQueries || [])
  const compiled = { exports: {} }
  const code = ts.transpileModule(readFileSync(new URL('../src/app/api/community/profiles/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module: compiled, exports: compiled.exports,
    require(name) {
      if (name === 'next/server') return { NextResponse: { json: (body, options = {}) => ({ body, status: options.status || 200, headers: options.headers }) } }
      if (name === '@/lib/supabase-server') return {
        createServerSupabaseClient: async () => server,
        createAdminClient: () => { adminCreated++; return admin },
      }
      throw new Error(`Unexpected dependency ${name}`)
    },
  })
  return { POST: compiled.exports.POST, admin, server, get adminCreated() { return adminCreated }, done() { server.done(); admin.done() } }
}
const request = (body = { authorIds: [own, peer, outsider], featuredClientIds: [featured, outsider] }) => ({ json: async () => body })
const members = { table: 'clients', data: [
  { id: featured, profile_id: peer, display_name: 'Display Name' },
  { id: '00000000-0000-4000-8000-000000000006', profile_id: own, display_name: 'Own Name' },
] }
const profileNames = { table: 'profiles', data: names }
let cases = 0

for (const role of ['client', 'coach']) {
  const test = route({ role, adminQueries: [members, profileNames] })
  const result = await test.POST(request())
  assert.equal(result.status, 200)
  assert.deepEqual(plain(result.body), { profiles: names.map(({ id, full_name }) => ({ id, full_name })), featuredFirstNames: { [featured]: 'Peer' } })
  assert.deepEqual(test.admin.calls[0].filters, [['coach_id', coach]])
  assert.equal(test.admin.calls[1].columns, 'id, full_name')
  assert(!test.admin.calls[1].filters[0][1].includes(outsider))
  assert.equal(result.headers['Cache-Control'], 'private, no-store')
  test.done(); cases++
}
for (const options of [{ noUser: true }, { authError: { message: 'expired' } }]) {
  const test = route(options)
  assert.equal((await test.POST(request())).status, 401)
  assert.equal(test.adminCreated, 0); test.done(); cases++
}
for (const options of [{ role: 'admin' }, { missingProfile: true }, { noCoach: true }]) {
  const test = route(options)
  assert.equal((await test.POST(request())).status, 403)
  assert.equal(test.adminCreated, 0); test.done(); cases++
}
for (const body of [null, [], 'bad', {}, { authorIds: [], featuredClientIds: null }, { authorIds: [1], featuredClientIds: [] }, { authorIds: ['not-a-uuid'], featuredClientIds: [] }, { authorIds: Array(1001).fill(own), featuredClientIds: [] }]) {
  const test = route({ invalid: true })
  assert.equal((await test.POST(request(body))).status, 400)
  assert.equal(test.adminCreated, 0); test.done(); cases++
}
{
  const test = route({ invalid: true })
  assert.equal((await test.POST({ json: async () => { throw new Error('bad JSON') } })).status, 400)
  test.done(); cases++
}
for (const options of [
  { profileError: { message: 'secret' } },
  { clientError: { message: 'secret' } },
  { adminQueries: [{ table: 'clients', error: { message: 'secret' } }] },
  { adminQueries: [members, { table: 'profiles', error: { message: 'secret' } }] },
  { adminQueries: [{ table: 'clients', throw: true }] },
]) {
  const test = route(options)
  const result = await test.POST(request())
  assert.equal(result.status, 500)
  assert(!JSON.stringify(result.body).includes('secret'))
  test.done(); cases++
}
{
  const test = route({ adminQueries: [members, { table: 'profiles', data: [{ id: coach, full_name: 'Coach' }] }] })
  const result = await test.POST(request({ authorIds: [outsider], featuredClientIds: [featured] }))
  assert.equal(result.body.featuredFirstNames[featured], 'Display')
  assert.deepEqual(test.admin.calls[1].filters[0][1], [coach, peer])
  test.done(); cases++
}
console.log(`Profile privacy route checks passed: ${cases} cases`)
