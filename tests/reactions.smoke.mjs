import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const paths = {
  message:'../src/components/messaging/RichMessageThread.tsx',
  community:'../src/components/community/CommunityFeed.tsx',
}
const handlers = {}
const effects = {}
let emptyThreadExpression
for (const [kind, path] of Object.entries(paths)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(kind + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  handlers[kind] = new Map()
  effects[kind] = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) handlers[kind].set(node.name.text, 'const ' + node.getText(ast))
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects[kind].push(node.getText(ast))
    if (kind === 'message' && ts.isJsxExpression(node) && node.expression?.getText(ast).includes('No messages yet')) emptyThreadExpression = node.expression.getText(ast)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  // The thread-wide click dismiss was the source of the disappearing picker.
  if (kind === 'message') assert.ok(!source.replace(/\r\n/g, '\n').includes("overflow:'hidden' }}\n        onClick={()=>setReactTarget(null)}"))
}
const compile = code => ts.transpileModule(code, { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS, jsx:ts.JsxEmit.React } }).outputText
const plain = value => JSON.parse(JSON.stringify(value))
const flush = () => new Promise(resolve => setImmediate(resolve))
const deferred = () => {
  let resolve
  const promise = new Promise(r => { resolve = r })
  return { promise, resolve }
}
let cases = 0
function harness(kind, options = {}) {
  const foreign = { id:'theirs', user_id:'other', emoji:'fire' }
  const mine = { id:'mine', user_id:'me', emoji:'fire' }
  const state = { rows:[{ id:'target', reactions:options.remove ? [foreign, mine] : [foreign] }], writes:[], errors:[], picker:'target', refreshes:0 }
  const context = {
    Error, Date, Object, Set, Promise, Map,
    useCallback: fn => fn, useEffect: fn => fn(),
    myId:options.noUser ? '' : 'me', otherId:'other', me:options.noUser ? null : { id:'me' }, coachId:'coach',
    thread:state.rows, posts:state.rows,
    reactionLock:{ current:false }, threadLoadRequest:{ current:0 }, postsLoadRequest:{ current:0 },
    setReacting: value => { state.reacting = value }, setReactionError: value => state.errors.push(value), toastError: value => state.errors.push(value),
    setReactTarget: value => { state.picker = value }, setReactOpen: value => { state.picker = value },
    loadThread: () => { state.refreshes++ }, loadPosts: () => { state.refreshes++ },
    setThread: update => { state.rows = update(state.rows); context.thread = state.rows },
    setPosts: update => { state.rows = update(state.rows); context.posts = state.rows },
    supabase:{ from: table => {
      assert.equal(table, kind === 'message' ? 'message_reactions' : 'community_reactions')
      let write
      const chain = {
        insert: payload => { write = { kind:'insert', payload:plain(payload), filters:[] }; state.writes.push(write); return chain },
        delete: () => { write = { kind:'delete', filters:[] }; state.writes.push(write); return chain },
        eq: (name, value) => { write.filters.push([name, value]); return chain },
        select: fields => { assert.equal(fields, 'id'); return chain },
        single: async () => {
          if (options.wait) await options.wait
          if (options.throws) throw new Error('Private provider details')
          return { data:options.noRow ? null : { id:options.remove ? 'mine' : 'confirmed' }, error:options.error ? { message:'Private provider details' } : null }
        },
      }
      return chain
    } },
  }
  vm.runInNewContext(compile(handlers[kind].get('toggleReaction') + '\nglobalThis.toggle=toggleReaction'), context)
  return { state, context, toggle:context.toggle }
}
for (const kind of ['message', 'community']) {
  for (const remove of [false, true]) {
    const h = harness(kind, { remove }); await h.toggle('target', 'fire')
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.picker, null)
    assert.equal(h.state.reacting, false); assert.equal(h.context.reactionLock.current, false)
    assert.equal(h.state.rows[0].reactions[0].id, 'theirs')
    assert.equal(h.state.rows[0].reactions.length, remove ? 1 : 2)
    assert.equal(h.state.refreshes, 1) // Independent refresh also catches concurrent reactions.
    assert.equal((kind === 'message' ? h.context.threadLoadRequest : h.context.postsLoadRequest).current, 1)
    if (remove) assert.deepEqual(h.state.writes[0].filters, [['id','mine'],['user_id','me']])
    else assert.deepEqual(h.state.writes[0].payload, { [kind === 'message' ? 'message_id' : 'post_id']:'target', user_id:'me', emoji:'fire' })
    cases++
    for (const mode of ['error', 'noRow', 'throws']) {
      const failed = harness(kind, { remove, [mode]:true }); const before = plain(failed.state.rows)
      await failed.toggle('target', 'fire')
      assert.deepEqual(plain(failed.state.rows), before); assert.equal(failed.state.picker, 'target')
      assert.equal(failed.state.refreshes, 0)
      assert.ok(failed.state.errors.at(-1)); assert.ok(!failed.state.errors.at(-1).includes('Private provider'))
      assert.equal(failed.context.reactionLock.current, false); assert.equal(failed.state.reacting, false); cases++
    }
  }
  for (const options of [{ noUser:true }, {}]) {
    const h = harness(kind, options); await h.toggle(options.noUser ? 'target' : 'missing', 'fire')
    assert.equal(h.state.writes.length, 0); assert.ok(h.state.errors.at(-1)); cases++
  }
  {
    const waiting = deferred(); const h = harness(kind, { wait:waiting.promise })
    const first = h.toggle('target', 'fire'); await h.toggle('target', 'fire')
    assert.equal(h.state.writes.length, 1); assert.equal(h.state.reacting, true)
    waiting.resolve(); await first; assert.equal(h.state.rows[0].reactions.length, 2); cases++
  }
  {
    const waiting = deferred(); const h = harness(kind, { wait:waiting.promise })
    const first = h.toggle('target', 'fire')
    // Simulate a realtime refresh landing before the insert response returns.
    h.state.rows[0].reactions.push({ id:'confirmed', user_id:'me', emoji:'fire' })
    waiting.resolve(); await first
    assert.equal(h.state.rows[0].reactions.length, 2)
    assert.equal(h.state.rows[0].reactions.filter(r => r.user_id === 'me').length, 1); cases++
  }
  {
    const options = { error:true }; const h = harness(kind, options)
    await h.toggle('target', 'fire'); options.error = false; await h.toggle('target', 'fire')
    assert.equal(h.state.picker, null); assert.equal(h.state.rows[0].reactions.length, 2); cases++
  }
  {
    const h = harness(kind); await h.toggle('target', 'fire'); await h.toggle('target', 'fire')
    assert.equal(h.state.writes[1].kind, 'delete'); assert.equal(h.state.rows[0].reactions.length, 1); cases++
  }
}

// Real touch handlers: hold opens; release suppresses the compatibility click;
// short taps, scroll cancellation and normal desktop clicks remain unaffected.
for (const gesture of ['hold', 'tap', 'scroll', 'cancel', 'hold-scroll', 'hold-cancel']) {
  const state = { target:null, prevented:false, stopped:false, cancelled:false }
  const context = {
    reactTarget:null, longPressRef:{ current:null }, longPressFired:{ current:false },
    navigator:{ vibrate:() => {} }, setReactTarget: value => { state.target = value }, setReactPos: value => { state.pos = value },
    setTimeout: fn => { state.fire = fn; return 1 }, clearTimeout: () => { state.cancelled = true },
  }
  vm.runInNewContext(compile(['handlePressStart','handlePressEnd'].map(name => handlers.message.get(name)).join('\n') + '\nglobalThis.start=handlePressStart;globalThis.end=handlePressEnd'), context)
  const event = { type:gesture.includes('scroll') ? 'touchmove' : gesture.includes('cancel') ? 'touchcancel' : 'touchend', touches:[{ clientX:120, clientY:300 }], preventDefault:() => { state.prevented = true }, stopPropagation:() => { state.stopped = true } }
  context.start('target', event)
  if (gesture.startsWith('hold')) state.fire()
  context.end(event)
  assert.equal(state.cancelled, true); assert.equal(context.longPressRef.current, null)
  assert.equal(state.target, gesture === 'hold' ? 'target' : null)
  assert.equal(state.prevented, gesture === 'hold'); assert.equal(state.stopped, gesture === 'hold')
  assert.equal(context.longPressFired.current, false); cases++
}

// A failed read must keep the last known reactions instead of replacing them
// with an empty list. Exercise the actual early-error branches for both views.
for (const kind of ['message', 'community']) {
  const state = { errors:[], changed:false }
  const context = {
    myId:'me', otherId:'other', coachId:'coach', useCallback:fn => fn,
    threadLoadRequest:{ current:0 }, postsLoadRequest:{ current:0 },
    setThreadLoading:value => { state.loading = value }, setReactionError:value => state.errors.push(value), toastError:value => state.errors.push(value),
    setThread:() => { state.changed = true }, setPosts:() => { state.changed = true },
    supabase:{ from:table => {
      const chain = { select:() => chain, or:() => chain, eq:() => chain, order:() => chain,
        limit:async () => ({ data:null, error:{} }), in:async () => ({ data:null, error:{} }),
        then:resolve => resolve({ data:null, error:{} }) }
      return chain
    } },
  }
  const name = kind === 'message' ? 'loadThread' : 'loadPosts'
  vm.runInNewContext(compile(handlers[kind].get(name) + '\nglobalThis.reload=' + name), context)
  await context.reload(); assert.equal(state.changed, false); assert.ok(state.errors.at(-1))
  if (kind === 'message') assert.equal(state.loading, false)
  cases++
}

// Execute real reloads with out-of-order responses and verify confirmed UI wins.
for (const kind of ['message', 'community']) {
  const pending = deferred(); let reads = 0
  const state = { rows:[], errors:[] }
  const context = {
    Date, Object, Set, Promise, useCallback:fn => fn, myId:'me', otherId:'other', coachId:'coach',
    threadLoadRequest:{ current:0 }, postsLoadRequest:{ current:0 },
    MEDIA_BUCKETS:{}, resolveSignedMediaUrl:() => { throw new Error('No media in synthetic rows') },
    setThreadLoading:() => {}, setReactionError: value => state.errors.push(value), toastError: value => state.errors.push(value),
    setThread: value => { state.rows = value }, setPosts: value => { state.rows = value },
    setReplies:() => {}, setProfiles:() => {}, setFeaturedFirstNames:() => {},
    fetch:async () => ({ ok:true, json:async () => ({ profiles:[], featuredFirstNames:{} }) }),
    setTimeout:() => {}, scrollToBottom:() => {},
    supabase:{ from:table => {
      const chain = {
        select:() => chain, or:() => chain, eq:() => chain, in:() => chain, update:() => chain,
        order:() => {
          if (table === 'messages' || table === 'community_posts') {
            const value = ++reads === 1 ? pending.promise : Promise.resolve({ data:[{ id:'latest', reactions:[{ id:'new' }] }], error:null })
            if (kind === 'message') return value
            chain.limit = () => value
            return chain
          }
          return Promise.resolve({ data:[], error:null })
        },
        then:resolve => resolve({ data:[], error:null }),
      }
      if (table === 'message_reactions') chain.in = () => Promise.resolve({ data:[{ id:'new', message_id:'latest' }], error:null })
      return chain
    } },
  }
  const name = kind === 'message' ? 'loadThread' : 'loadPosts'
  // Community has three .order calls; only .limit is the query boundary.
  if (kind === 'community') context.supabase.from = table => {
    const chain = { select:() => chain, eq:() => chain, in:() => chain, order:() => chain,
      limit:() => ++reads === 1 ? pending.promise : Promise.resolve({ data:[{ id:'latest', reactions:[{ id:'new' }] }], error:null }),
      then:resolve => resolve({ data:[], error:null }) }
    assert.ok(table === 'community_posts' || table === 'community_replies'); return chain
  }
  vm.runInNewContext(compile(handlers[kind].get(name) + '\nglobalThis.reload=' + name), context)
  const old = context.reload(); await flush(); await context.reload()
  pending.resolve({ data:[{ id:'stale', reactions:[] }], error:null }); await old
  assert.equal(state.rows[0].id, 'latest'); assert.ok(state.errors.every(error => error === null)); cases++
}

// Use the actual Supabase request builder, not a query-chain stub. Large
// histories must keep a constant-size GET and load their nested reactions in
// that same read, including messages without any reactions.
for (const count of [0, 1, 627, 1000]) {
  const rows = Array.from({ length:count }, (_, i) => ({
    id:`00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
    message_type:'text', media_url:null,
    reactions:i % 2 ? [] : [{ id:`reaction-${i}`, user_id:'other', emoji:'fire' }],
  }))
  const state = { rows:null, errors:[], requests:[] }
  let fail = false
  const supabase = createClient('https://synthetic.supabase.co', 'synthetic-key', {
    auth:{ persistSession:false, autoRefreshToken:false, detectSessionInUrl:false },
    global:{ fetch:async (input, init) => {
      const url = new URL(input)
      state.requests.push({ url, method:init.method })
      assert.equal(url.pathname, '/rest/v1/messages')
      if (init.method === 'PATCH') return new Response(null, { status:204 })
      assert.equal(url.searchParams.get('select'), '*,reactions:message_reactions!message_reactions_message_id_fkey(*)')
      assert.equal(url.searchParams.get('order'), 'created_at.asc')
      assert.equal(url.searchParams.get('or'), '(and(sender_id.eq.me,recipient_id.eq.other),and(sender_id.eq.other,recipient_id.eq.me))')
      assert.ok(url.href.length < 1024, 'Request size must not depend on message count')
      return new Response(JSON.stringify(fail ? { message:'Private provider details' } : rows), {
        status:fail ? 400 : 200, headers:{ 'Content-Type':'application/json' },
      })
    } },
  })
  const context = {
    useCallback:fn => fn, myId:'me', otherId:'other', supabase,
    threadLoadRequest:{ current:0 }, MEDIA_BUCKETS:{},
    setThreadLoading:() => {}, setThread:value => { state.rows = plain(value) }, setReactionError:value => state.errors.push(value),
    setTimeout:() => {}, scrollToBottom:() => {},
  }
  vm.runInNewContext(compile(handlers.message.get('loadThread') + '\nglobalThis.reload=loadThread'), context)
  await context.reload()
  assert.deepEqual(state.rows, rows)
  assert.equal(state.requests.filter(r => r.method === 'GET').length, 1)
  assert.equal(state.errors.at(-1), null); cases++
  if (count === 627) {
    fail = true; await context.reload()
    assert.deepEqual(state.rows, rows)
    assert.ok(state.errors.at(-1)); assert.ok(!state.errors.at(-1).includes('Private provider'))
    assert.equal(state.requests.filter(r => r.method === 'PATCH').length, 1); cases++
    fail = false; await context.reload()
    assert.deepEqual(state.rows, rows); assert.equal(state.errors.at(-1), null); cases++
  }
}

// Execute the real private-media resolver with the real thread loader. A cold
// history signs in one batch; a warm refresh reuses the account-scoped URLs.
const compiledMedia = { exports:{} }
vm.runInNewContext(compile(readFileSync(new URL('../src/lib/media.ts', import.meta.url), 'utf8')), {
  exports:compiledMedia.exports, module:compiledMedia, URL, Date,
})
for (const superseded of [false, true]) {
  const waiting = deferred()
  let rows = Array.from({ length:60 }, (_, i) => ({ id:`media-${i}`, message_type:['image','video','audio','file'][i % 4], media_url:`message-media/attachment-${i % 30}`, reactions:[] }))
  rows.push({ id:'text', message_type:'text', media_url:null, reactions:[] })
  rows.push({ id:'resource', message_type:'resource', media_url:'https://example.com/resource', reactions:[] })
  const state = { rows:[], loading:[], signing:[] }
  const supabase = {
    auth:{ onAuthStateChange:() => {}, getSession:async () => ({ data:{ session:{ user:{ id:'me' } } }, error:null }) },
    storage:{ from:bucket => ({
      getPublicUrl:path => ({ data:{ publicUrl:`https://synthetic.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
      createSignedUrls:async paths => {
        state.signing.push({ bucket, paths:plain(paths) }); await waiting.promise
        return { data:paths.map(path => ({ path, signedUrl:`https://synthetic.supabase.co/signed/${path}` })), error:null }
      },
    }) },
    from:table => {
      assert.equal(table, 'messages')
      const chain = { select:() => chain, or:() => chain, update:() => chain, eq:() => chain,
        order:async () => ({ data:rows, error:null }), then:resolve => resolve({ error:null }) }
      return chain
    },
  }
  const context = {
    myId:'me', otherId:'other', supabase, useCallback:fn => fn, threadLoadRequest:{ current:0 },
    MEDIA_BUCKETS:{ image:'message-media', video:'message-media', audio:'message-media', file:'message-media' },
    resolveSignedMediaUrls:compiledMedia.exports.resolveSignedMediaUrls,
    setThread:value => { state.rows = plain(value) }, setThreadLoading:value => state.loading.push(value),
    setReactionError:() => {}, setTimeout:() => {}, scrollToBottom:() => {},
  }
  vm.runInNewContext(compile(handlers.message.get('loadThread') + '\nglobalThis.reload=loadThread'), context)
  const first = context.reload(); await flush()
  assert.equal(state.signing.length, 1); assert.equal(state.signing[0].bucket, 'message-media')
  assert.equal(state.signing[0].paths.length, 30); assert.equal(state.loading.at(-1), true)
  assert.deepEqual(state.rows, []) // Never render raw private paths while signing.
  if (superseded) {
    rows = [{ id:'latest', message_type:'text', media_url:null, reactions:[] }]
    await context.reload()
  }
  waiting.resolve(); await first
  assert.equal(state.loading.at(-1), false)
  if (superseded) assert.equal(state.rows[0].id, 'latest')
  else {
    assert.equal(state.rows.length, 62)
    assert.ok(state.rows.slice(0,60).every(row => row.media_url.startsWith('https://synthetic.supabase.co/signed/')))
    assert.equal(state.rows[60].media_url, null); assert.equal(state.rows[61].media_url, 'https://example.com/resource')
    await context.reload(); assert.equal(state.signing.length, 1)
  }
  cases++
}

// Execute the actual JSX condition: loading and errors must not masquerade as
// an empty history, and refreshing must never hide previously loaded messages.
assert.ok(emptyThreadExpression)
for (const [thread, threadLoading, reactionError, expected] of [
  [[], true, null, 'Loading messages...'], [[], false, null, 'No messages yet'],
  [[], false, 'Failed', null], [[{ id:'confirmed' }], true, null, null],
]) {
  const context = { thread, threadLoading, reactionError, c:{}, React:{ createElement:(type, props, ...children) => ({ type, props, children }) } }
  vm.runInNewContext(compile('globalThis.view = (' + emptyThreadExpression + ')'), context)
  if (expected) assert.ok(context.view.children.join('').includes(expected))
  else assert.ok(!context.view)
  if (threadLoading && thread.length === 0) assert.equal(context.view.props.role, 'status')
  cases++
}

// Separate simulated screens each receive the INSERT/DELETE subscription event.
for (const kind of ['message', 'community']) {
  for (const event of ['INSERT','DELETE']) {
    const screens = []
    for (let screen = 0; screen < 2; screen++) {
      const subscriptions = []; const state = { refreshes:0 }
      const channel = { on:(name, options, fn) => { subscriptions.push({ name, options, fn }); return channel }, subscribe:() => channel }
      const context = { myId:'me', otherId:'other', coachId:'coach', useEffect:fn => fn(),
        loadThread:() => { state.refreshes++ }, loadPosts:() => { state.refreshes++ },
        supabase:{ channel:() => channel, removeChannel:() => {} } }
      const code = effects[kind].find(effect => effect.includes(".on('postgres_changes'") && effect.includes(kind === 'message' ? 'message_reactions' : 'community_reactions'))
      assert.ok(code); vm.runInNewContext(compile(code), context)
      const subscription = subscriptions.find(s => s.options.table === (kind === 'message' ? 'message_reactions' : 'community_reactions') && s.options.event === event)
      assert.ok(subscription); if (event === 'DELETE') assert.equal(subscription.options.filter, undefined)
      subscription.fn(); screens.push(state)
    }
    assert.ok(screens.every(screen => screen.refreshes === 1)); cases++
  }
}
console.log(`Reaction checks passed (${cases} cases; synthetic touch events, rows and subscriptions only).`)
