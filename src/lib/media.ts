import type { SupabaseClient } from '@supabase/supabase-js'

const STORAGE_PREFIXES = [
  'avatars/',
  'message-media/',
  'form-checks/',
  'progress-photos/',
  'exercise-videos/',
  'resources/',
  'workout-reviews/',
  'community-media/',
]

const PUBLIC_BUCKETS = new Set(['avatars', 'exercise-videos', 'resources', 'community-media'])
type CachedUrl = { promise: Promise<string | null>; expiresAt: number }
type MediaCache = { urls: Map<string, CachedUrl>; userId: string | null; generation: number }
// Scope URLs to the SDK client/project and account, never to a global file path.
const mediaCaches = new WeakMap<SupabaseClient, MediaCache>()

function cacheFor(supabase: SupabaseClient) {
  let cache = mediaCaches.get(supabase)
  if (cache) return cache
  cache = { urls: new Map(), userId: null, generation: 0 }
  mediaCaches.set(supabase, cache)
  const current = cache
  supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user.id || null
    if (event === 'SIGNED_OUT' || userId !== current.userId) {
      current.urls.clear()
      current.generation++
      current.userId = userId
    }
  })
  return cache
}

export function isStoragePath(value?: string | null) {
  if (!value) return false
  return STORAGE_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function getStoragePathFromUrl(url?: string | null) {
  if (!url) return null
  if (isStoragePath(url)) return url
  try {
    const match = new URL(url).pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/[^/]+\/(.+)$/)
    return match ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}

// A batch signs only uncached files, preserving the coach review's single request.
export async function resolveSignedMediaUrls(
  supabase: SupabaseClient,
  bucket: string,
  values: (string | null | undefined)[],
  expiresIn = 60 * 60
): Promise<(string | null)[]> {
  const storage = supabase.storage.from(bucket)
  const publicBase = new URL(storage.getPublicUrl('').data.publicUrl)
  const paths = values.map(value => {
    if (!value) return { url: null }
    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value)
        // External videos, or files owned by another project, are not ours to sign.
        if (url.origin !== publicBase.origin) return { url: value }
        const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/)
        if (!url.pathname.startsWith('/storage/v1/object/')) return { url: value }
        if (!match || decodeURIComponent(match[1]) !== bucket) return { url: null }
        return { path: decodeURIComponent(match[2]) }
      } catch {
        return { url: null }
      }
    }
    return { path: value.startsWith(bucket + '/') ? value.slice(bucket.length + 1) : value }
  })
  if (PUBLIC_BUCKETS.has(bucket)) {
    return paths.map(item => item.path ? storage.getPublicUrl(item.path).data.publicUrl : item.url ?? null)
  }
  if (!paths.some(item => item.path)) return paths.map(item => item.url ?? null)
  if (!Number.isInteger(expiresIn) || expiresIn <= 0) throw new Error('Media URL lifetime must be a positive integer')

  const cache = cacheFor(supabase)
  const beforeSession = cache.generation
  const { data: { session }, error } = await supabase.auth.getSession()
  const userId = session?.user.id || null
  if (error || !userId) return paths.map(item => item.url ?? null)
  if (cache.generation !== beforeSession && userId !== cache.userId) return paths.map(item => item.url ?? null)
  if (userId !== cache.userId) {
    cache.urls.clear()
    cache.generation++
    cache.userId = userId
  }
  const generation = cache.generation
  const now = Date.now()
  const missing = new Map<string, { entry: CachedUrl; resolve: (url: string | null) => void }>()
  const results = paths.map(item => {
    if (!item.path) return Promise.resolve(item.url ?? null)
    const key = JSON.stringify([bucket, item.path, expiresIn])
    const cached = cache.urls.get(key)
    if (cached && cached.expiresAt > now) return cached.promise
    let resolve!: (url: string | null) => void
    const promise = new Promise<string | null>(done => { resolve = done })
    // Refresh early; account for request time and don't persist private URLs.
    const entry = { promise, expiresAt: now + expiresIn * 1000 - Math.min(300000, expiresIn * 100) }
    cache.urls.set(key, entry)
    missing.set(item.path, { entry, resolve })
    while (cache.urls.size > 500) cache.urls.delete(cache.urls.keys().next().value!)
    return promise
  })

  if (missing.size) {
    void (async () => {
      try {
        const { data, error: signingError } = await storage.createSignedUrls([...missing.keys()], expiresIn)
        const signed = new Map((data || []).map(item => [item.path, item.error ? null : item.signedUrl]))
        for (const [path, pending] of missing) {
          const url = !signingError && cache.generation === generation && pending.entry.expiresAt > Date.now()
            ? signed.get(path) || null : null
          const key = JSON.stringify([bucket, path, expiresIn])
          if (!url && cache.urls.get(key) === pending.entry) cache.urls.delete(key)
          pending.resolve(url)
        }
      } catch {
        for (const [path, pending] of missing) {
          const key = JSON.stringify([bucket, path, expiresIn])
          if (cache.urls.get(key) === pending.entry) cache.urls.delete(key)
          pending.resolve(null)
        }
      }
    })()
  }
  const urls = await Promise.all(results)
  return cache.generation === generation ? urls : paths.map(item => item.url ?? null)
}

export async function resolveSignedMediaUrl(
  supabase: SupabaseClient,
  bucket: string,
  value?: string | null,
  expiresIn = 60 * 60
) {
  return (await resolveSignedMediaUrls(supabase, bucket, [value], expiresIn))[0]
}
