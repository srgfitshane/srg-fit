import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const paths = {
  message:'../src/components/messaging/RichMessageThread.tsx',
  community:'../src/components/community/CommunityFeed.tsx',
}
const handlers = {}
const effects = {}
for (const [kind, path] of Object.entries(paths)) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const ast = ts.createSourceFile(kind + '.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  handlers[kind] = new Map()
  effects[kind] = []
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) handlers[kind].set(node.name.text, 'const ' + node.getText(ast))
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect') effects[kind].push(node.getText(ast))
    ts.forEachChild(node, visit)
  }
  visit(ast)
  // The thread-wide click dismiss was the source of the disappearing picker.
  if (kind === 'message') assert.ok(!source.replace(/\r\n/g, '\n').includes("overflow:'hidden' }}\n        onClick={()=>setReactTarget(null)}"))
}
const compile = code => ts.transpileModule(code, { compilerOptions:{ target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS } }).outputText
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
    setReactionError:value => state.errors.push(value), toastError:value => state.errors.push(value),
    setThread:() => { state.changed = true }, setPosts:() => { state.changed = true },
    supabase:{ from:table => {
      const chain = { select:() => chain, or:() => chain, eq:() => chain, order:() => chain,
        limit:async () => ({ data:null, error:{} }), in:async () => ({ data:null, error:{} }),
        then:resolve => resolve({ data:table === 'messages' ? [{ id:'target' }] : null, error:table === 'messages' ? null : {} }) }
      return chain
    } },
  }
  const name = kind === 'message' ? 'loadThread' : 'loadPosts'
  vm.runInNewContext(compile(handlers[kind].get(name) + '\nglobalThis.reload=' + name), context)
  await context.reload(); assert.equal(state.changed, false); assert.ok(state.errors.at(-1)); cases++
}

// Execute real reloads with out-of-order responses and verify confirmed UI wins.
for (const kind of ['message', 'community']) {
  const pending = deferred(); let reads = 0
  const state = { rows:[], errors:[] }
  const context = {
    Date, Object, Set, Promise, useCallback:fn => fn, myId:'me', otherId:'other', coachId:'coach',
    threadLoadRequest:{ current:0 }, postsLoadRequest:{ current:0 },
    MEDIA_BUCKETS:{}, resolveSignedMediaUrl:() => { throw new Error('No media in synthetic rows') },
    setReactionError: value => state.errors.push(value), toastError: value => state.errors.push(value),
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
  assert.equal(state.rows[0].id, 'latest'); assert.equal(state.errors.length, 0); cases++
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
