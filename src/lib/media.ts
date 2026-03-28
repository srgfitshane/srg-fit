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

export function isStoragePath(value?: string | null) {
  if (!value) return false
  return STORAGE_PREFIXES.some((prefix) => value.startsWith(prefix))
}

export function getStoragePathFromUrl(url?: string | null) {
  if (!url) return null
  if (isStoragePath(url)) return url

  const marker = '/object/public/'
  const idx = url.indexOf(marker)
  if (idx === -1) return null

  const path = url.slice(idx + marker.length)
  const slash = path.indexOf('/')
  return slash === -1 ? null : path.slice(slash + 1)
}

export async function resolveSignedMediaUrl(
  supabase: SupabaseClient,
  bucket: string,
  value?: string | null,
  expiresIn = 60 * 60
) {
  if (!value) return null
  const storagePath = getStoragePathFromUrl(value)

  if (!storagePath) {
    return value
  }

  const { data } = await supabase.storage.from(bucket).createSignedUrl(storagePath, expiresIn)
  return data?.signedUrl || null
}
