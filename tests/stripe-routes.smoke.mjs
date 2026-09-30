import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the real handlers with isolated providers: no network, email, or charges.
const root = resolve(import.meta.dirname, '..')
const environment = {
  STRIPE_SECRET_KEY: 'test-only', STRIPE_WEBHOOK_SECRET: 'test-only',
  COACH_PROFILE_ID: 'coach-1', NEXT_PUBLIC_SITE_URL: 'https://srgfit.example',
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example', SUPABASE_SERVICE_ROLE_KEY: 'test-only',
}

function loadSource(source, mocks = {}, globals = {}) {
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText
  const compiledModule = { exports: {} }
  vm.runInNewContext(code, {
    module: compiledModule, exports: compiledModule.exports,
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      throw new Error(`Unexpected dependency: ${name}`)
    },
    process: { env: environment }, console: { error() {} },
    fetch() { throw new Error('Unexpected network request') },
    ...globals,
  })
  return compiledModule.exports
}

function loadFile(path, mocks, globals) {
  return loadSource(readFileSync(resolve(root, path), 'utf8'), mocks, globals)
}

const { subscriptionSnapshot } = loadFile('src/lib/stripe-subscription.ts')
const next = { NextResponse: { json: (body, options = {}) => ({ status: options.status || 200, body }) } }
const plain = value => JSON.parse(JSON.stringify(value))

function database(expectations) {
  const pending = [...expectations]
  const calls = []
  const unexpected = []
  return {
    calls,
    done() {
      assert.deepEqual(unexpected, [], 'Handler caught an unexpected query')
      assert.equal(pending.length, 0, `Unconsumed queries: ${JSON.stringify(pending)}`)
    },
    from(table) {
      const query = { table, action: 'select', filters: [] }
      const execute = async () => {
        const expected = pending.shift()
        if (!expected || table !== expected.table || query.action !== (expected.action || 'select')) {
          unexpected.push(query)
          throw new Error(`Unexpected query: ${JSON.stringify(query)}`)
        }
        calls.push(query)
        return { data: expected.data ?? null, error: expected.error ?? null }
      }
      const chain = {
        select(columns) { query.columns = columns; return chain },
        eq(column, value) { query.filters.push([column, value]); return chain },
        order() { return chain }, limit() { return chain },
        insert(value) { query.action = 'insert'; query.value = plain(value); return chain },
        upsert(value, options) { query.action = 'upsert'; query.value = plain(value); query.options = plain(options); return chain },
        update(value) { query.action = 'update'; query.value = plain(value); return chain },
        single: execute, maybeSingle: execute,
        then(resolvePromise, rejectPromise) { return execute().then(resolvePromise, rejectPromise) },
      }
      return chain
    },
  }
}

const subscription = (overrides = {}) => ({
  id: 'sub-1', customer: 'cus-1', status: 'active',
  items: { data: [{ price: { id: 'price-1', unit_amount: 19900, currency: 'usd', recurring: { interval: 'month', interval_count: 1 } } }] },
  trial_end: null, current_period_start: 1775000000, current_period_end: 1777600000,
  cancel_at_period_end: false, canceled_at: null, ...overrides,
})
const clientQuery = { table: 'clients', data: { id: 'client-1', stripe_customer_id: 'cus-1' } }
const subQuery = { table: 'subscriptions', data: { stripe_subscription_id: 'sub-1' } }
const surveySave = { table: 'cancel_survey_responses', action: 'insert' }
const subSave = { table: 'subscriptions', action: 'update', data: { id: 'db-sub-1', client_id: 'client-1', stripe_customer_id: 'cus-1' } }
const clientSave = { table: 'clients', action: 'update', data: { id: 'client-1' } }
const request = (input = { reason: 'cost', details: 'Feedback' }) => ({ json: async () => input })

function cancelRoute(queries, options = {}) {
  const admin = database(queries)
  const updates = []
  const server = database(options.auth === false ? [] : [{ table: 'profiles', data: { role: options.role || 'client' } }])
  server.auth = { getUser: async () => ({ data: { user: options.auth === false ? null : { id: 'user-1' } }, error: null }) }
  const current = options.current || subscription()
  class Stripe {
    subscriptions = {
      retrieve: async () => current,
      update: async (id, change) => {
        updates.push({ id, change: plain(change) })
        if (options.stripeError) throw new Error('Stripe unavailable')
        return { ...current, ...change }
      },
    }
  }
  const { POST } = loadFile('src/app/api/stripe/cancel/route.ts', {
    'next/server': next, stripe: Stripe,
    '@/lib/supabase-server': { createAdminClient: () => admin, createServerSupabaseClient: async () => server },
    '@/lib/stripe-subscription': { subscriptionSnapshot },
  })
  return { POST, admin, updates, done() { admin.done(); server.done() } }
}

const checkout = {
  id: 'cs_test_123', mode: 'subscription', customer: 'cus-1', subscription: 'sub-1',
  customer_details: { email: ' CLIENT@example.com ', name: 'Test Client' },
}
const provisionedQuery = { table: 'subscriptions' }
const profileQuery = { table: 'profiles', data: { id: 'user-1', role: 'client' } }
const existingClientQuery = { table: 'clients', data: { id: 'client-1', coach_id: 'coach-1' } }
const subscriptionUpsert = { table: 'subscriptions', action: 'upsert', data: { id: 'db-sub-1' } }

function webhookRoute(queries, options = {}) {
  const admin = database(queries)
  const invites = [], accessEmails = [], notifications = [], retrieved = []
  admin.auth = { admin: {
    inviteUserByEmail: async (email, params) => {
      invites.push({ email, params })
      return options.inviteError ? { data: {}, error: new Error('Email provider failed') } : { data: { user: { id: 'user-1' } }, error: null }
    },
    getUserById: async () => ({ data: { user: { id: 'user-1', last_sign_in_at: options.neverSignedIn ? null : '2026-01-01' } }, error: null }),
  } }
  class Stripe {
    webhooks = { constructEvent: () => {
      if (options.badSignature) throw new Error('Invalid signature')
      return { id: 'evt-1', type: options.type || 'checkout.session.completed', data: { object: options.object || checkout } }
    } }
    subscriptions = { retrieve: async id => { retrieved.push(id); return options.current || subscription() } }
  }
  const { POST } = loadFile('src/app/api/stripe/webhook/route.ts', {
    'next/server': next, stripe: Stripe,
    '@/lib/supabase-server': { createAdminClient: () => admin, sendAccountAccessEmail: async email => {
      accessEmails.push(email)
      if (options.emailError) throw new Error('Email failed')
    } },
    '@/lib/stripe-subscription': { subscriptionSnapshot }, '@/lib/date': { localDateStr: () => '2026-09-29' },
  }, { fetch: async (url, input) => { notifications.push({ url, input }); return { ok: true } } })
  return {
    POST: (signature = 'valid-test-signature') => POST({ text: async () => '{}', headers: { get: () => signature } }),
    admin, invites, accessEmails, notifications, retrieved,
  }
}

let count = 0
async function test(name, action) {
  await action()
  count += 1
  console.log(`PASS ${name}`)
}

await test('snapshot uses actual schema columns and preserves cancellation state', () => {
  const snapshot = subscriptionSnapshot(subscription({ cancel_at_period_end: true }))
  assert.equal(snapshot.status, 'active')
  assert.equal(snapshot.plan_name, 'monthly')
  assert.equal(snapshot.cancel_at_period_end, true)
  assert.equal(snapshot.current_period_end, new Date(1777600000 * 1000).toISOString())
  assert.equal(snapshot.amount_cents, 19900)
  for (const [interval, plan] of [['week', 'weekly'], ['month', 'monthly'], ['year', 'yearly']]) {
    const sub = subscription()
    sub.items.data[0].price.recurring.interval = interval
    assert.equal(subscriptionSnapshot(sub).plan_name, plan)
  }
  const unsupported = subscription()
  unsupported.items.data[0].price.recurring.interval_count = 3
  assert.throws(() => subscriptionSnapshot(unsupported), /Unsupported/)
})

for (const [name, options, input, status] of [
  ['signed-out request', { auth: false }, undefined, 401],
  ['coach request', { role: 'coach' }, undefined, 403],
  ['invalid cancellation reason', {}, { reason: 'unknown' }, 400],
  ['oversized feedback', {}, { reason: 'cost', details: 'x'.repeat(5001) }, 400],
  ['malformed input', {}, null, 400],
]) await test(`cancellation rejects ${name} before touching billing`, async () => {
  const route = cancelRoute([], options)
  assert.equal((await route.POST(request(input))).status, status)
  assert.equal(route.updates.length, 0)
  route.done()
})

await test('missing subscription returns conflict, not success', async () => {
  const route = cancelRoute([clientQuery, { table: 'subscriptions' }])
  assert.equal((await route.POST(request())).status, 409)
  route.done()
})

await test('customer mismatch cannot cancel another Stripe customer', async () => {
  const route = cancelRoute([clientQuery, subQuery], { current: subscription({ customer: 'someone-else' }) })
  assert.equal((await route.POST(request())).status, 502)
  assert.equal(route.updates.length, 0)
  route.done()
})

await test('failed feedback save does not change Stripe', async () => {
  const route = cancelRoute([clientQuery, subQuery, { ...surveySave, error: { message: 'write denied' } }])
  assert.equal((await route.POST(request())).status, 502)
  assert.equal(route.updates.length, 0)
  route.done()
})

await test('Stripe failure does not update local cancellation state', async () => {
  const route = cancelRoute([clientQuery, subQuery, surveySave], { stripeError: true })
  assert.equal((await route.POST(request())).status, 502)
  route.done()
})

await test('successful cancellation retains active access through period end', async () => {
  const route = cancelRoute([clientQuery, subQuery, surveySave, subSave, clientSave])
  const response = await route.POST(request())
  assert.equal(response.status, 200)
  assert.equal(response.body.success, true)
  assert.equal(response.body.subscription.status, 'active')
  assert.equal(response.body.subscription.cancel_at_period_end, true)
  assert.deepEqual(route.admin.calls.at(-1).value, { subscription_status: 'active' })
  assert.deepEqual(route.updates, [{ id: 'sub-1', change: { cancel_at_period_end: true } }])
  route.done()
})

await test('retry after scheduled cancellation syncs without canceling or collecting feedback twice', async () => {
  const route = cancelRoute([clientQuery, subQuery, subSave, clientSave], { current: subscription({ cancel_at_period_end: true }) })
  assert.equal((await route.POST(request())).status, 200)
  assert.equal(route.updates.length, 0)
  route.done()
})

for (const [name, saves] of [
  ['subscription write error', [{ ...subSave, data: null, error: { message: 'write denied' } }]],
  ['subscription write affected no row', [{ ...subSave, data: null }]],
  ['client write error', [subSave, { ...clientSave, data: null, error: { message: 'write denied' } }]],
]) await test(`${name} returns an explicit partial-completion message`, async () => {
  const route = cancelRoute([clientQuery, subQuery, surveySave, ...saves])
  const response = await route.POST(request())
  assert.equal(response.status, 502)
  assert.match(response.body.error, /Stripe scheduled your cancellation/)
  route.done()
})

await test('webhook rejects missing or invalid signatures', async () => {
  for (const options of [{}, { badSignature: true }]) {
    const route = webhookRoute([], options)
    assert.equal((await route.POST(options.badSignature ? 'invalid' : null)).status, 400)
    route.admin.done()
  }
})

await test('failed new-user invitation fails webhook so Stripe retries', async () => {
  const route = webhookRoute([provisionedQuery, { table: 'profiles' }], { inviteError: true })
  assert.equal((await route.POST()).status, 500)
  assert.equal(route.invites[0].email, 'client@example.com')
  assert.equal(route.invites[0].params.redirectTo, 'https://srgfit.example/auth/callback?next=/set-password')
  assert.equal(route.notifications.length, 0)
  route.admin.done()
})

await test('failed existing-user access email fails webhook before marking provisioned', async () => {
  const route = webhookRoute([provisionedQuery, profileQuery, existingClientQuery], { neverSignedIn: true, emailError: true })
  assert.equal((await route.POST()).status, 500)
  assert.deepEqual(route.accessEmails, ['client@example.com'])
  route.admin.done()
})

await test('new checkout provisions with correct schema fields and plan', async () => {
  const route = webhookRoute([
    provisionedQuery, { table: 'profiles' }, { table: 'clients' },
    { table: 'clients', action: 'insert', data: { id: 'client-1' } }, subscriptionUpsert, clientSave,
  ])
  assert.equal((await route.POST()).status, 200)
  const saved = route.admin.calls.find(call => call.action === 'upsert')
  assert.equal(saved.value.plan_name, 'monthly')
  assert.equal(saved.value.amount_cents, 19900)
  assert.equal(saved.value.stripe_price_id, 'price-1')
  assert.deepEqual(saved.options, { onConflict: 'stripe_subscription_id' })
  assert.equal(route.invites.length, 1)
  assert.equal(route.notifications.length, 1)
  route.admin.done()
})

await test('returning signed-in client needs no duplicate setup email', async () => {
  const route = webhookRoute([provisionedQuery, profileQuery, existingClientQuery, subscriptionUpsert, clientSave])
  assert.equal((await route.POST()).status, 200)
  assert.equal(route.accessEmails.length, 0)
  assert.equal(route.invites.length, 0)
  route.admin.done()
})

await test('failed client linking retries and repairs already-saved subscription', async () => {
  const failure = webhookRoute([provisionedQuery, profileQuery, existingClientQuery, subscriptionUpsert, { ...clientSave, data: null, error: { message: 'write denied' } }])
  assert.equal((await failure.POST()).status, 500)
  failure.admin.done()
  const retry = webhookRoute([{ table: 'subscriptions', data: { id: 'db-sub-1' } }, subSave, clientSave])
  assert.equal((await retry.POST()).status, 200)
  assert.equal(retry.invites.length + retry.accessEmails.length, 0)
  assert.equal(retry.admin.calls.at(-1).value.subscription_id, 'db-sub-1')
  retry.admin.done()
})

await test('old events sync current Stripe status instead of reverting it', async () => {
  const route = webhookRoute([subSave, clientSave], {
    type: 'customer.subscription.updated', object: subscription({ status: 'past_due' }), current: subscription({ status: 'active' }),
  })
  assert.equal((await route.POST()).status, 200)
  assert.deepEqual(route.retrieved, ['sub-1'])
  assert.equal(route.admin.calls[0].value.status, 'active')
  route.admin.done()
})

await test('subscription event before checkout provisioning fails for a retry', async () => {
  const route = webhookRoute([{ ...subSave, data: null, error: { message: 'no row' } }], {
    type: 'invoice.payment_succeeded', object: { subscription: 'sub-1' },
  })
  assert.equal((await route.POST()).status, 500)
  route.admin.done()
})

const source = readFileSync(resolve(root, 'src/app/dashboard/client/page.tsx'), 'utf8')
const sourceFile = ts.createSourceFile('client.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let submitCancel
function findSubmit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'submitCancel') submitCancel = node.initializer.getText(sourceFile)
  ts.forEachChild(node, findSubmit)
}
findSubmit(sourceFile)
assert.ok(submitCancel, 'Billing submit handler must exist')

for (const [name, response, shouldComplete] of [
  ['server failure', { ok: false, result: { error: 'Billing sync failed' } }, false],
  ['unconfirmed result', { ok: true, result: { success: true, subscription: { cancel_at_period_end: false } } }, false],
  ['confirmed result', { ok: true, result: { success: true, subscription: { status: 'active', cancel_at_period_end: true } } }, true],
  ['network failure', { networkError: true }, false],
]) await test(`cancellation UI handles ${name} and preserves drafts appropriately`, async () => {
  const state = { steps: [], errors: [], removed: [], canceling: [] }
  const handler = loadSource(`export const submitCancel = ${submitCancel}`, {}, {
    cancelReason: 'cost', cancelDetails: 'Draft feedback', canceling: false, draftKey: 'form-draft:test',
    setCanceling: value => state.canceling.push(value), setCancelError: value => state.errors.push(value),
    setCancelStep: value => state.steps.push(value), setSub: update => { state.sub = update({ status: 'active' }) },
    localStorage: { removeItem: key => state.removed.push(key) },
    fetch: async () => {
      if (response.networkError) throw new Error('Connection lost')
      return { ok: response.ok, json: async () => response.result }
    },
  }).submitCancel
  await handler()
  assert.equal(state.steps.includes('done'), shouldComplete)
  assert.equal(state.removed.length, shouldComplete ? 1 : 0)
  assert.equal(state.canceling.at(-1), false)
  if (!shouldComplete) assert.ok(state.errors.at(-1))
})

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textContent).join(' ')
  return node?.props ? textContent(node.props.children) : ''
}

for (const [name, sessionId, session, confirmed] of [
  ['direct visit', undefined, null, false],
  ['invalid session identifier', 'not-a-checkout', null, false],
  ['expired checkout', 'cs_test_123', { mode: 'subscription', status: 'expired', payment_status: 'unpaid' }, false],
  ['unpaid checkout', 'cs_test_123', { mode: 'subscription', status: 'complete', payment_status: 'unpaid' }, false],
  ['completed checkout', 'cs_test_123', { mode: 'subscription', status: 'complete', payment_status: 'paid' }, true],
  ['completed free trial', 'cs_test_123', { mode: 'subscription', status: 'complete', payment_status: 'no_payment_required', subscription: { status: 'trialing', trial_end: 1777600000 } }, true],
]) await test(`signup success page verifies ${name}`, async () => {
  let retrieved = 0
  class Stripe { checkout = { sessions: { retrieve: async () => { retrieved += 1; return session } } } }
  const jsx = (type, props) => ({ type, props })
  const page = loadFile('src/app/join/success/page.tsx', { stripe: Stripe, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' } }).default
  const output = textContent(await page({ searchParams: Promise.resolve({ session_id: sessionId }) }))
  assert.equal(output.includes('Checkout confirmed'), confirmed)
  assert.equal(retrieved, session ? 1 : 0)
  if (!confirmed) assert.match(output, /do not pay again/)
})

console.log(`Stripe route smoke tests passed (${count} cases).`)
