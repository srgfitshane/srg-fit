import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the actual route handlers with closed imports and fake services.
// No test can contact Supabase, send an email, or read real environment secrets.
const compiled = new Map()
const env = {
  NEXT_PUBLIC_SITE_URL: 'https://app.example.test/',
  NEXT_PUBLIC_SUPABASE_URL: 'https://db.example.test',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-public-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
}
const nextServer = { NextResponse: { json: Response.json, redirect: Response.redirect } }
function load(path, mocks = {}, globals = {}) {
  if (!compiled.has(path)) {
    compiled.set(path, ts.transpileModule(readFileSync(resolve(path), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText)
  }
  const testModule = { exports: {} }
  vm.runInNewContext(compiled.get(path), {
    module: testModule, exports: testModule.exports, URL, Request, Response, Error,
    process: { env: { ...env } },
    console: { error() {}, log() {} },
    fetch() { throw new Error('Unexpected network call in account tests') },
    require(name) {
      if (name === 'next/server') return nextServer
      if (Object.hasOwn(mocks, name)) return mocks[name]
      throw new Error(`Unmocked import: ${name}`)
    },
    ...globals,
  }, { filename: path })
  return testModule.exports
}

const utilities = load('src/lib/invite-utils.ts')
const CLIENT = '10000000-0000-4000-8000-000000000001'
const COACH = 'coach-1'
const USER = 'client-user'
const EMAIL = 'client@example.test'
const request = body => new Request('https://app.example.test/api/test', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const malformedRequest = () => new Request('https://app.example.test/api/test', { method: 'POST', body: '{' })
const validInvite = { email: EMAIL, fullName: 'Test Client' }
const validDirect = { email: EMAIL, name: 'Test Client', token: 'test-signup-token' }
const routePaths = {
  invite: 'src/app/api/invite/route.ts',
  resend: 'src/app/api/invite/resend/route.ts',
  direct: 'src/app/api/invite/direct/route.ts',
  activate: 'src/app/api/activate-client/route.ts',
  accept: 'src/app/api/invite/accept/route.ts',
}

function fixture(options = {}) {
  const tables = {
    profiles: [{ id: COACH, role: 'coach', email: 'coach@example.test' }, { id: USER, role: 'client', email: EMAIL }],
    clients: [{ id: CLIENT, profile_id: USER, coach_id: COACH, active: false, onboarding_completed: false, profile: { email: EMAIL } }],
    client_invites: [],
    signup_tokens: [{ id: 'token-1', token: validDirect.token, coach_id: COACH, used_at: null, used_by_email: null, used_by_profile_id: null }],
    onboarding_forms: [],
    ...structuredClone(options.tables ?? {}),
  }
  const effects = []
  let generatedId = 0
  function query(table) {
    let action = 'select'
    let payload
    let mode = 'many'
    let max = Infinity
    const filters = []
    const chain = {
      select() { return chain },
      insert(value) { action = 'insert'; payload = value; return chain },
      update(value) { action = 'update'; payload = value; return chain },
      eq(key, value) { filters.push(row => row[key] === value); return chain },
      is(key, value) { filters.push(row => (row[key] ?? null) === value); return chain },
      order() { return chain },
      limit(value) { max = value; return chain },
      single() { mode = 'single'; return chain },
      maybeSingle() { mode = 'maybe'; return chain },
      then(onResolve, onReject) {
        return Promise.resolve().then(() => {
          const operation = { table, action, payload }
          effects.push(operation)
          if (options.fail?.(operation)) return { data: null, error: new Error('Simulated database rejection') }
          if (options.noRows?.(operation)) return { data: null, error: null }
          let rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, max)
          if (action === 'insert') {
            rows = (Array.isArray(payload) ? payload : [payload]).map(row => ({ id: `new-${++generatedId}`, ...row }))
            tables[table].push(...rows)
          } else if (action === 'update') {
            rows.forEach(row => Object.assign(row, payload))
          }
          if (mode !== 'many') {
            if (rows.length > 1 || (mode === 'single' && rows.length === 0)) return { data: null, error: new Error('Expected one row') }
            return { data: rows[0] ?? null, error: null }
          }
          return { data: rows, error: null }
        }).then(onResolve, onReject)
      },
    }
    return chain
  }
  const admin = {
    from: query,
    auth: { admin: { async inviteUserByEmail(email, settings) {
      effects.push({ action: 'invite-email', email, settings })
      if (options.emailError) return { data: { user: null }, error: new Error('Mail provider rejected request') }
      return { data: { user: options.noAuthUser ? null : { id: USER } }, error: null }
    } } },
  }
  const server = {
    createAdminClient: () => admin,
    requireCoachApi: async () => options.gateStatus
      ? { error: Response.json({ error: 'Denied' }, { status: options.gateStatus }) }
      : { user: { id: COACH } },
    createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: options.userId ?? USER, email: EMAIL } } }) } }),
    async sendAccountAccessEmail(email) {
      effects.push({ action: 'recovery-email', email })
      if (options.emailError) throw new Error('Mail provider rejected request')
    },
  }
  return {
    tables, effects,
    route(name) {
      return load(routePaths[name], {
        '@/lib/supabase-server': server,
        '@/lib/invite-utils': utilities,
        '@/lib/date': { localDateStr: () => '2026-09-29' },
      }, { fetch: async (...args) => { effects.push({ action: 'notification', args }); return Response.json({ success: true }) } }).POST
    },
  }
}

let passed = 0
const failures = []
async function test(name, run) {
  try { await run(); passed++ } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`) }
}
function noEmail(f) { assert.equal(f.effects.some(event => event.action.endsWith('-email')), false) }
function noWrite(f) { assert.equal(f.effects.some(event => ['insert', 'update', 'notification'].includes(event.action)), false) }
async function status(handler, body, expected) {
  const response = await handler(body instanceof Request ? body : request(body))
  assert.equal(response.status, expected, JSON.stringify(await response.clone().json()))
  return response.json()
}

for (const name of ['invite', 'resend']) {
  for (const gateStatus of [401, 403]) await test(`${name} enforces ${gateStatus} coach gate`, async () => {
    const f = fixture({ gateStatus })
    await status(f.route(name), validInvite, gateStatus)
    assert.equal(f.effects.length, 0)
  })
}
for (const name of Object.keys(routePaths)) {
  for (const body of [null, [], 'invalid', malformedRequest()]) await test(`${name} rejects malformed body ${String(body)}`, async () => {
    const f = fixture()
    await status(f.route(name), body, 400)
    noEmail(f); noWrite(f)
  })
}

await test('invite normalizes email and resends existing active account without creating records', async () => {
  const f = fixture()
  f.tables.clients[0].active = true
  await status(f.route('invite'), { ...validInvite, email: '  CLIENT@EXAMPLE.TEST  ' }, 200)
  assert.equal(f.effects.find(event => event.action === 'recovery-email')?.email, EMAIL)
  assert.equal(f.tables.client_invites.length, 0)
  noWrite(f)
})
await test('invite sends new-account mail and records an inactive linked client', async () => {
  const f = fixture({ tables: { profiles: [], clients: [] } })
  await status(f.route('invite'), validInvite, 200)
  assert.equal(f.effects.find(event => event.action === 'invite-email')?.settings.redirectTo, 'https://app.example.test/auth/callback?next=/set-password')
  assert.equal(f.tables.clients[0].active, false)
  assert.equal(f.tables.clients[0].profile_id, USER)
  assert.equal(f.tables.client_invites[0].profile_id, USER)
})
await test('invite refreshes pending invite rather than adding another', async () => {
  const f = fixture({ tables: { client_invites: [{ id: 'old', email: EMAIL, coach_id: COACH, status: 'pending', expires_at: '2020-01-01' }] } })
  await status(f.route('invite'), validInvite, 200)
  assert.equal(f.tables.client_invites.length, 1)
  assert.ok(Date.parse(f.tables.client_invites[0].expires_at) > Date.now())
})
for (const name of ['invite', 'direct']) {
  await test(`${name} rejects coach account email`, async () => {
    const f = fixture()
    await status(f.route(name), { ...(name === 'invite' ? validInvite : validDirect), email: 'coach@example.test' }, 409)
    noEmail(f); noWrite(f)
  })
  await test(`${name} rejects a client belonging to another coach before email or writes`, async () => {
    const f = fixture()
    f.tables.clients[0].coach_id = 'different-coach'
    await status(f.route(name), name === 'invite' ? validInvite : validDirect, 409)
    noEmail(f); noWrite(f)
  })
  await test(`${name} surfaces mail provider rejection`, async () => {
    const f = fixture({ emailError: true })
    await status(f.route(name), name === 'invite' ? validInvite : validDirect, 502)
    assert.equal(f.effects.some(event => event.action === 'notification'), false)
    assert.equal(f.tables.signup_tokens[0].used_by_profile_id, null)
  })
  await test(`${name} rejects missing Auth user after invite`, async () => {
    const f = fixture({ noAuthUser: true })
    f.tables.profiles = f.tables.profiles.filter(row => row.role === 'coach')
    await status(f.route(name), name === 'invite' ? validInvite : validDirect, 502)
    assert.equal(f.tables.client_invites.length, 0)
  })
  await test(`${name} surfaces failed client creation`, async () => {
    const f = fixture({ tables: { clients: [] }, fail: event => event.table === 'clients' && event.action === 'insert' })
    await status(f.route(name), name === 'invite' ? validInvite : validDirect, 502)
    assert.equal(f.tables.client_invites.length, 0)
  })
}
await test('invite surfaces failed history save', async () => {
  const f = fixture({ fail: event => event.table === 'client_invites' && event.action === 'insert' })
  await status(f.route('invite'), validInvite, 502)
})
await test('invite rejects a foreign onboarding form before sending email', async () => {
  const f = fixture({ tables: { onboarding_forms: [{ id: 'form', coach_id: 'other' }] } })
  await status(f.route('invite'), { ...validInvite, onboarding_form_id: 'form' }, 400)
  noEmail(f); noWrite(f)
})

await test('resend validates client ID', async () => {
  const f = fixture()
  await status(f.route('resend'), { clientId: 'invalid' }, 400)
  assert.equal(f.effects.length, 0)
})
await test('resend rejects another coach client', async () => {
  const f = fixture()
  f.tables.clients[0].coach_id = 'other'
  await status(f.route('resend'), { clientId: CLIENT }, 403)
  noEmail(f)
})
for (const profile of [{ email: ' CLIENT@EXAMPLE.TEST ' }, [{ email: ' CLIENT@EXAMPLE.TEST ' }]]) await test('resend supports joined profile and normalizes address', async () => {
  const f = fixture()
  f.tables.clients[0].profile = profile
  await status(f.route('resend'), { clientId: CLIENT }, 200)
  assert.equal(f.effects.find(event => event.action === 'recovery-email')?.email, EMAIL)
})
await test('resend fails visibly when mail fails', async () => {
  const f = fixture({ emailError: true })
  await status(f.route('resend'), { clientId: CLIENT }, 502)
})
await test('resend rejects missing client email', async () => {
  const f = fixture()
  f.tables.clients[0].profile = null
  await status(f.route('resend'), { clientId: CLIENT }, 400)
  noEmail(f)
})

await test('direct invite completes claimed link after account setup', async () => {
  const f = fixture()
  await status(f.route('direct'), validDirect, 200)
  assert.equal(f.tables.signup_tokens[0].used_by_profile_id, USER)
  assert.equal(f.tables.signup_tokens[0].used_by_email, EMAIL)
  assert.equal(f.effects.filter(event => event.action === 'notification').length, 1)
})
await test('direct invite rejects unknown token', async () => {
  const f = fixture({ tables: { signup_tokens: [] } })
  await status(f.route('direct'), validDirect, 403)
  noEmail(f); noWrite(f)
})
for (const used of [{ used_by_email: 'other@example.test' }, { used_by_email: EMAIL, used_by_profile_id: USER }]) await test('direct invite prevents reused token', async () => {
  const f = fixture()
  Object.assign(f.tables.signup_tokens[0], { used_at: '2026-01-01' }, used)
  await status(f.route('direct'), validDirect, 410)
  noEmail(f); noWrite(f)
})
await test('direct invite resumes incomplete claim for the same email', async () => {
  const f = fixture()
  Object.assign(f.tables.signup_tokens[0], { used_at: '2026-01-01', used_by_email: EMAIL })
  await status(f.route('direct'), validDirect, 200)
  assert.equal(f.tables.signup_tokens[0].used_by_profile_id, USER)
})
await test('direct invite loses atomic claim safely without email', async () => {
  const f = fixture({ noRows: event => event.table === 'signup_tokens' && event.payload?.used_at })
  await status(f.route('direct'), validDirect, 409)
  noEmail(f)
})
await test('direct invite surfaces failed token completion without notifying coach', async () => {
  const f = fixture({ fail: event => event.table === 'signup_tokens' && event.payload?.used_by_profile_id })
  await status(f.route('direct'), validDirect, 502)
  assert.equal(f.effects.some(event => event.action === 'notification'), false)
})

await test('activation requires authenticated user', async () => {
  const f = fixture({ noUser: true })
  await status(f.route('activate'), { user_id: USER }, 401)
  assert.equal(f.effects.length, 0)
})
await test('activation rejects another user ID', async () => {
  const f = fixture()
  await status(f.route('activate'), { user_id: 'other' }, 403)
  assert.equal(f.effects.length, 0)
})
await test('activation rejects missing client record', async () => {
  const f = fixture({ tables: { clients: [] } })
  await status(f.route('activate'), { user_id: USER }, 409)
  noWrite(f)
})
await test('activation sets new client active and accepts pending invites', async () => {
  const f = fixture({ tables: { client_invites: [{ id: 'invite', profile_id: USER, status: 'pending' }] } })
  const body = await status(f.route('activate'), { user_id: USER }, 200)
  assert.equal(body.next, '/onboarding')
  assert.equal(f.tables.clients[0].active, true)
  assert.equal(f.tables.client_invites[0].status, 'accepted')
})
for (const state of [{ paused: true }, { archived: true }, { active: false, onboarding_completed: true }]) await test(`activation preserves disabled client ${JSON.stringify(state)}`, async () => {
  const f = fixture()
  Object.assign(f.tables.clients[0], state)
  await status(f.route('activate'), { user_id: USER }, 200)
  assert.equal(f.tables.clients[0].active, false)
  noWrite(f)
})
for (const table of ['clients', 'client_invites']) await test(`activation surfaces ${table} save failure`, async () => {
  const f = fixture({ fail: event => event.table === table && event.action === 'update' })
  await status(f.route('activate'), { user_id: USER }, 500)
})
await test('coach recovery routes to coach dashboard without client activation', async () => {
  const f = fixture({ userId: COACH })
  const body = await status(f.route('activate'), { user_id: COACH }, 200)
  assert.equal(body.next, '/dashboard/coach')
  noWrite(f)
})

function callbackFixture(options = {}) {
  const calls = []
  const auth = {}
  for (const method of ['exchangeCodeForSession', 'verifyOtp']) auth[method] = async value => {
    calls.push({ method, value })
    return options.fail ? { data: { session: null }, error: { code: 'expired' } } : { data: { session: { access_token: 'test-access', refresh_token: 'test-refresh' } }, error: null }
  }
  const { GET } = load('src/app/auth/callback/route.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth }) },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }) },
  })
  return { calls, get: query => GET(new Request(`https://app.example.test/auth/callback${query}`)) }
}
await test('callback preserves implicit-flow destination without creating new credentials', async () => {
  const f = callbackFixture()
  const response = await f.get('?next=/set-password')
  assert.equal(response.headers.get('location'), 'https://app.example.test/set-password')
  assert.equal(f.calls.length, 0)
})
for (const next of ['https://evil.example/', '//evil.example/', '/api/private']) await test(`callback rejects unapproved destination ${next}`, async () => {
  const f = callbackFixture()
  const response = await f.get(`?code=test-code&next=${encodeURIComponent(next)}`)
  const target = new URL(response.headers.get('location'))
  assert.equal(target.origin, 'https://app.example.test')
  assert.equal(target.pathname, '/set-password')
  assert.equal(target.search, '')
  assert.ok(target.hash.includes('access_token=test-access'))
})
await test('callback verifies recovery token hash and places tokens only in fragment', async () => {
  const f = callbackFixture()
  const response = await f.get('?token_hash=test-hash&type=recovery&next=/onboarding')
  const target = new URL(response.headers.get('location'))
  assert.equal(target.pathname, '/onboarding')
  assert.equal(target.search, '')
  assert.equal(f.calls[0].value.type, 'recovery')
  assert.ok(target.hash.includes('refresh_token=test-refresh'))
})
for (const query of ['?code=expired', '?token_hash=expired&type=recovery', '?token_hash=test&type=admin', '?error=access_denied']) await test(`callback rejects bad auth result ${query}`, async () => {
  const f = callbackFixture({ fail: true })
  const response = await f.get(query)
  assert.equal(response.headers.get('location'), 'https://app.example.test/set-password?error=auth-rejected')
})

function helperFixture(options = {}) {
  const calls = []
  const client = { auth: { resetPasswordForEmail: async (...args) => {
    calls.push({ action: 'send', args })
    return { error: options.fail ? new Error('Mail rejected') : null }
  } } }
  const helpers = load('src/lib/supabase-server.ts', {
    '@supabase/ssr': { createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: USER } } }) },
      from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { role: options.role ?? 'client' } }) }) }) }),
    }) },
    '@supabase/supabase-js': { createClient: (...args) => { calls.push({ action: 'create', args }); return client } },
    'next/headers': { cookies: async () => ({ getAll: () => [], set() {} }) },
    'next/navigation': { redirect() { throw new Error('Unexpected redirect') } },
  }, options.noSite ? { process: { env: { ...env, NEXT_PUBLIC_SITE_URL: '' } } } : {})
  return { calls, helpers }
}
await test('shared mail helper requests recovery mail using public credentials', async () => {
  const f = helperFixture()
  await f.helpers.sendAccountAccessEmail(' CLIENT@EXAMPLE.TEST ')
  assert.equal(f.calls[0].args[1], 'test-public-key')
  assert.equal(f.calls[0].args[2].auth.persistSession, false)
  assert.equal(f.calls[1].args[0], EMAIL)
  assert.equal(f.calls[1].args[1].redirectTo, 'https://app.example.test/auth/callback?next=/set-password')
})
await test('shared mail helper propagates provider failure', async () => {
  const f = helperFixture({ fail: true })
  await assert.rejects(f.helpers.sendAccountAccessEmail(EMAIL), /Mail rejected/)
})
await test('shared mail helper fails without configured site URL before sending', async () => {
  const f = helperFixture({ noSite: true })
  await assert.rejects(f.helpers.sendAccountAccessEmail(EMAIL), /configured/)
  assert.equal(f.calls.length, 0)
})
for (const [options, expected] of [[{ noUser: true }, 401], [{ role: 'client' }, 403], [{ role: 'coach' }, 200]]) await test(`real coach gate returns ${expected}`, async () => {
  const f = helperFixture(options)
  const result = await f.helpers.requireCoachApi()
  assert.equal(result.error?.status ?? 200, expected)
})

for (const state of [{ coach_id: 'other-coach' }, { paused: true }, { archived: true }, { active: false, onboarding_completed: true }]) await test('acceptance preserves client coach and protected state', async () => {
  const f = fixture({ tables: { client_invites: [{ id: 'invite', token: 'invite-token', email: EMAIL, coach_id: COACH, status: 'pending', expires_at: '2099-01-01' }] } })
  Object.assign(f.tables.clients[0], state)
  await status(f.route('accept'), { token: 'invite-token' }, state.coach_id ? 409 : 403)
  noWrite(f)
})
await test('acceptance does not consume invitation when profile save fails', async () => {
  const f = fixture({ tables: { client_invites: [{ id: 'invite', token: 'invite-token', email: EMAIL, full_name: 'Client', coach_id: COACH, status: 'pending', expires_at: '2099-01-01' }] }, fail: event => event.table === 'profiles' && event.action === 'update' })
  await status(f.route('accept'), { token: 'invite-token' }, 500)
  assert.equal(f.tables.client_invites[0].status, 'pending')
  assert.equal(f.tables.clients[0].active, false)
})
await test('acceptance saves profile and client before consuming invitation', async () => {
  const f = fixture({ tables: { client_invites: [{ id: 'invite', token: 'invite-token', email: EMAIL, full_name: 'Client', coach_id: COACH, status: 'pending', expires_at: '2099-01-01' }] } })
  await status(f.route('accept'), { token: 'invite-token' }, 200)
  assert.equal(f.tables.client_invites[0].status, 'accepted')
  assert.equal(f.tables.clients[0].active, true)
  assert.equal(f.tables.profiles.find(x => x.id === USER).full_name, 'Client')
})
console.log(`Account access: ${passed} passed, ${failures.length} failed (mocked services; no emails sent)`)
if (failures.length) process.exitCode = 1
