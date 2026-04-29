import { createClient } from './supabase-browser'

// Cross-device draft sync for long-form client surfaces. localStorage stays
// the primary fast path (no network, instant restore on reload). The server
// row is the backup so a client can start a check-in on phone, walk to the
// laptop, and pick up where they left off.
//
// Conflict policy: localStorage wins on the same device because edits write
// it synchronously. The server only takes precedence when the local store
// is empty (i.e., the client is on a fresh device or cleared their browser).

type ServerDraft = { payload: unknown; updated_at: string } | null

export async function fetchServerDraft(profileId: string, formKey: string): Promise<ServerDraft> {
  if (!profileId || !formKey) return null
  const supabase = createClient()
  const { data, error } = await supabase
    .from('form_drafts')
    .select('payload, updated_at')
    .eq('profile_id', profileId)
    .eq('form_key', formKey)
    .maybeSingle()
  if (error) {
    console.warn('[form-drafts] fetch failed', error.message)
    return null
  }
  return data as ServerDraft
}

export async function saveServerDraft(profileId: string, formKey: string, payload: unknown): Promise<void> {
  if (!profileId || !formKey) return
  const supabase = createClient()
  const { error } = await supabase
    .from('form_drafts')
    .upsert(
      { profile_id: profileId, form_key: formKey, payload, updated_at: new Date().toISOString() },
      { onConflict: 'profile_id,form_key' },
    )
  if (error) console.warn('[form-drafts] save failed', error.message)
}

export async function clearServerDraft(profileId: string, formKey: string): Promise<void> {
  if (!profileId || !formKey) return
  const supabase = createClient()
  await supabase
    .from('form_drafts')
    .delete()
    .eq('profile_id', profileId)
    .eq('form_key', formKey)
}
