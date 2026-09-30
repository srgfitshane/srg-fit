import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { webcrypto, createHmac } from 'node:crypto'
import ts from 'typescript'

const serviceKey = 'test-service-key'
const cronKey = 'a'.repeat(64)
const env = { SUPABASE_SERVICE_ROLE_KEY: serviceKey, SUPABASE_URL: 'https://db.example.test', STRIPE_WEBHOOK_SECRET: 'test-webhook-secret' }
function load(path, mocks = {}, overrides = {}) {
  let handler
  const testModule = { exports: {} }
  const code = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    module: testModule, exports: testModule.exports, Request, Response, URL, TextEncoder, crypto: webcrypto,
    console: { log() {}, error() {} },
    Deno: { env: { get: key => env[key] }, serve: fn => { handler = fn } },
    fetch() { throw new Error('Unexpected network call in Edge tests') },
    require(name) {
      if (name.includes('/http/server.ts')) return { serve: fn => { handler = fn } }
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.includes('supabase-js')) return { createClient: () => overrides.db }
      if (name.includes('web-push')) return { default: {} }
      throw new Error(`Unmocked import: ${name}`)
    },
    ...overrides,
  }, { filename: path })
  return { ...testModule.exports, handler }
}
function request(headers = {}, body = {}) {
  return new Request('https://db.example.test/functions/v1/test', { method: 'POST', headers, body: JSON.stringify(body) })
}
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++ } catch (error) { throw new Error(`${name}: ${error.message}`, { cause: error }) }
}
let rpcError = null
const db = { rpc: async (_name, { candidate }) => ({ data: candidate === cronKey, error: rpcError }) }
const auth = load('supabase/functions/_shared/auth.ts', {}, { db })
await test('public key is not a service credential', () => assert.equal(auth.isServiceCaller(request({ apikey: 'test-public-key' })), false))
await test('valid bearer service credential', () => assert.equal(auth.isServiceCaller(request({ authorization: `Bearer ${serviceKey}` })), true))
await test('valid apikey service credential', () => assert.equal(auth.isServiceCaller(request({ apikey: serviceKey })), true))
await test('unauthenticated scheduler request denied', async () => assert.equal((await auth.requireServiceCaller(request())).status, 401))
await test('valid cron credential accepted', async () => assert.equal(await auth.requireServiceCaller(request({ 'x-cron-secret': cronKey })), null))
await test('wrong cron credential denied', async () => assert.equal((await auth.requireServiceCaller(request({ 'x-cron-secret': 'wrong' }))).status, 401))
await test('cron credential forbidden for service-only handler', async () => assert.equal((await auth.requireServiceCaller(request({ 'x-cron-secret': cronKey }), { allowCron: false })).status, 401))
await test('scheduler verifier failure fails closed', async () => {
  rpcError = new Error('offline')
  assert.equal((await auth.requireServiceCaller(request({ 'x-cron-secret': cronKey }))).status, 503)
  rpcError = null
})
await test('service-only endpoints reject GET', async () => assert.equal((await auth.requireServiceCaller(new Request('https://db.example.test'))).status, 405))
await test('user authentication checks provider result', async () => {
  const admin = { auth: { getUser: async token => ({ data: { user: token === 'valid' ? { id: 'user' } : null }, error: null }) } }
  assert.equal(await auth.requireUser(request(), admin), null)
  assert.equal(await auth.requireUser(request({ authorization: 'Bearer invalid' }), admin), null)
  assert.equal((await auth.requireUser(request({ authorization: 'Bearer valid' }), admin)).id, 'user')
})
await test('anonymous users cannot notify', async () => assert.equal(await auth.requireUser(request({ authorization: 'Bearer valid' }), { auth: { getUser: async () => ({ data: { user: { id: 'anon', is_anonymous: true } }, error: null }) } }), null))

function notifyDb(role, relation = true) {
  return { from(table) {
    const filters = {}
    const query = {
      select() { return query }, eq(key, value) { filters[key] = value; return query },
      async maybeSingle() {
        if (table === 'profiles') return { data: { role }, error: null }
        return { data: relation ? (filters.profile_id === 'sender' ? { coach_id: 'coach' } : { id: 'client' }) : null, error: null }
      },
    }
    return query
  } }
}
for (const [role, recipient, type, relation, expected] of [
  ['coach', 'client', 'review_ready', true, true],
  ['coach', 'client', 'review_ready', false, false],
  ['coach', 'client', 'payment_failed', true, false],
  ['client', 'coach', 'new_message', true, true],
  ['client', 'peer', 'new_message', true, false],
  ['client', 'peer', 'community_reply', true, true],
  ['client', 'peer', 'community_reply', false, false],
  ['client', 'coach', 'announcement', true, false],
]) await test(`notification ownership ${role}/${type}/${relation}`, async () => assert.equal(await auth.canNotify(notifyDb(role, relation), 'sender', recipient, type), expected))
await test('self notification denied', async () => assert.equal(await auth.canNotify(notifyDb('coach'), 'sender', 'sender', 'new_message'), false))

for (const name of ['send-daily-recap', 'send-weekly-checkins', 'send-weekly-digest', 'send-community-digest', 'send-workout-reminders', 'check-program-endings', 'notify-new-client', 'send-invite-email']) {
  const { handler } = load(`supabase/functions/${name}/index.ts`, { '../_shared/auth.ts': auth }, { db })
  await test(`${name} denies public requests before work`, async () => assert.equal((await handler(request())).status, 401))
}
const notification = load('supabase/functions/send-notification/index.ts', { '../_shared/auth.ts': auth }, { db }).handler
await test('send-notification denies public requests', async () => assert.equal((await notification(request())).status, 401))
for (const name of ['stripe-checkout', 'stripe-portal']) {
  const handler = load(`supabase/functions/${name}/index.ts`, { '../_shared/auth.ts': auth }, { db }).handler
  await test(`${name} requires user authentication`, async () => assert.equal((await handler(request())).status, 401))
  await test(`${name} supports browser preflight`, async () => {
    const response = await handler(new Request('https://db.example.test', { method: 'OPTIONS' }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://srgfit.app')
  })
}
await test('checkout cannot charge another client account', async () => {
  const ownershipDb = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) }, from(table) {
    const filters = {}
    const query = { select() { return query }, eq(key, value) { filters[key] = value; return query },
      async single() {
        if (table === 'coaching_plans') return { data: { id: 'plan', is_active: true, coach_id: 'coach', stripe_price_id: 'price' }, error: null }
        assert.equal(filters.id, 'someone-elses-client')
        assert.equal(filters.profile_id, 'owner')
        return { data: null, error: new Error('no owned row') }
      },
    }
    return query
  } }
  const handler = load('supabase/functions/stripe-checkout/index.ts', { '../_shared/auth.ts': auth }, { db: ownershipDb }).handler
  assert.equal((await handler(request({ authorization: 'Bearer user-token' }, { plan_id: 'plan', client_id: 'someone-elses-client' }))).status, 404)
})
await test('checkout rejects external redirect before payment creation', async () => {
  const userDb = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) } }
  const handler = load('supabase/functions/stripe-checkout/index.ts', { '../_shared/auth.ts': auth }, { db: userDb }).handler
  assert.equal((await handler(request({ authorization: 'Bearer user-token' }, { plan_id: 'plan', client_id: 'client', success_url: 'https://attacker.example' }))).status, 400)
})

function webhookFixture(options = {}) {
  const writes = []
  let processed = options.processed ?? false
  const tables = { clients: { id: 'client', profile_id: 'profile', coach_id: 'coach', stripe_customer_id: 'cus_test' }, subscriptions: { id: 'sub-row', client_id: 'client' } }
  const db = { from(table) {
    let action = 'select'
    let value
    const query = {
      select() { return query }, eq() { return query }, maybeSingle() { return query }, single() { return query },
      insert(payload) { action = 'insert'; value = payload; return query },
      update(payload) { action = 'update'; value = payload; return query },
      upsert(payload) { action = 'upsert'; value = payload; return query },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          if (options.failTable === table && action !== 'select') return { data: null, error: new Error('save failed') }
          if (action !== 'select') writes.push({ table, action, value })
          if (table === 'stripe_events' && action === 'select') return { data: { processed }, error: null }
          if (table === 'stripe_events' && action === 'update') processed = value.processed
          return { data: tables[table] ?? {}, error: null }
        }).then(resolve, reject)
      },
    }
    return query
  } }
  const subscription = { id: 'sub_test', status: 'active', customer: 'cus_test', current_period_start: 1700000000, current_period_end: 1700600000, cancel_at_period_end: false, items: { data: [{ price: { id: 'price_test', recurring: { interval: 'month' }, unit_amount: 1000 } }] }, currency: 'usd' }
  const handler = load('supabase/functions/stripe-webhook/index.ts', {}, { db, fetch: async url => {
    if (url.startsWith('https://api.stripe.com/v1/subscriptions/')) return Response.json(subscription)
    if (url.includes('/send-notification')) return Response.json({ success: true })
    throw new Error('Unexpected billing request')
  } }).handler
  const event = { id: 'evt_test', type: options.type ?? 'checkout.session.completed', data: { object: { mode: 'subscription', customer: 'cus_test', subscription: 'sub_test', metadata: { client_id: 'client', coach_id: 'coach' } } } }
  const body = JSON.stringify(event)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = createHmac('sha256', env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${body}`).digest('hex')
  return { writes, run: signatureValue => handler(new Request('https://db.example.test/webhook', { method: 'POST', body, headers: { 'stripe-signature': signatureValue ?? `t=${timestamp},v1=${signature}` } })) }
}
await test('webhook rejects bad signature before writes', async () => {
  const f = webhookFixture()
  assert.equal((await f.run('invalid')).status, 400)
  assert.equal(f.writes.length, 0)
})
await test('unprocessed event can retry required subscription writes', async () => {
  const f = webhookFixture()
  assert.equal((await f.run()).status, 200)
  const saved = f.writes.find(x => x.table === 'subscriptions').value
  assert.equal(saved.user_id, 'profile')
  assert.equal(saved.plan_name, 'monthly')
  assert.equal(f.writes.find(x => x.table === 'clients').value.paused, undefined)
  assert.equal(f.writes.at(-1).value.processed, true)
})
await test('processed events do not repeat work', async () => {
  const f = webhookFixture({ processed: true })
  assert.equal((await f.run()).status, 200)
  assert.equal(f.writes.length, 0)
})
for (const failTable of ['subscriptions', 'clients', 'stripe_events']) await test(`webhook ${failTable} save failure requests retry`, async () => {
  const f = webhookFixture({ failTable })
  assert.equal((await f.run()).status, 500)
  assert.equal(f.writes.some(x => x.table === 'stripe_events' && x.value.processed === true), false)
})
for (const name of ['send-invite-email', 'notify-new-client', 'send-daily-recap']) await test(`${name} sends only from the verified SRG Fit domain`, () => {
  const source = readFileSync(`supabase/functions/${name}/index.ts`, 'utf8')
  assert.match(source, /from:\s*'SRG Fit <noreply@srgfit\.training>'/)
  assert.doesNotMatch(source, /onboarding@resend\.dev|info@srg\.fitness/)
})
console.log(`Edge security: ${passed} passed (mocked services; no live actions)`)
