// Offline queue for workout set logs. Survives gym Wi-Fi flickers:
// when an exercise_sets insert fails (or the device is offline), the
// payload is parked in localStorage. The workout page registers an
// "online" listener and flushes the queue automatically on reconnect.
// Flush dedupes against the DB so a refresh-while-offline + reconnect
// can't double-insert.
//
// Why localStorage and not IndexedDB: this queue is tiny (one row per
// set, a few sets per minute, a few KB total). The synchronous API
// keeps the call site simple and pre-React-state-update.
//
// Scope: only set log inserts. skip-set / finish-workout / etc. are
// rare and can fail loudly via toast for now.

import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'srg-pending-set-logs'

export type QueuedSetLog = {
  // Stable id for the queued item (NOT a DB row id; the row hasn't been
  // inserted yet). Used to dedupe within the queue and let callers
  // identify their own queued rows.
  client_uid: string
  session_id: string
  session_exercise_id: string
  set_number: number
  // Full insert body — passed verbatim to supabase.from('exercise_sets').insert
  payload: Record<string, unknown>
  queued_at: string
}

export function readQueue(): QueuedSetLog[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedSetLog[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedSetLog[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // localStorage full / private mode — drop quietly
  }
}

export function enqueueSetLog(
  item: Omit<QueuedSetLog, 'client_uid' | 'queued_at'>
): QueuedSetLog {
  const full: QueuedSetLog = {
    ...item,
    client_uid:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    queued_at: new Date().toISOString(),
  }
  writeQueue([...readQueue(), full])
  return full
}

export function pendingForSession(sessionId: string): QueuedSetLog[] {
  return readQueue().filter(i => i.session_id === sessionId)
}

export function pendingCount(): number {
  return readQueue().length
}

export type FlushResult = { flushed: number; remaining: number }

// Drains the queue. Each item is checked against the DB first to avoid
// double-inserting if the row already landed via a different path
// (e.g. user refreshed mid-flush, or another tab was online).
export async function flushQueue(supabase: SupabaseClient): Promise<FlushResult> {
  const items = readQueue()
  if (items.length === 0) return { flushed: 0, remaining: 0 }

  const survivors: QueuedSetLog[] = []
  let flushed = 0

  for (const item of items) {
    try {
      const { data: existing } = await supabase
        .from('exercise_sets')
        .select('id')
        .eq('session_exercise_id', item.session_exercise_id)
        .eq('set_number', item.set_number)
        .limit(1)

      if (existing && existing.length > 0) {
        // Already in DB — drop the queued copy
        flushed++
        continue
      }

      const { error } = await supabase.from('exercise_sets').insert(item.payload)
      if (error) {
        survivors.push(item)
      } else {
        flushed++
      }
    } catch {
      survivors.push(item)
    }
  }

  writeQueue(survivors)
  return { flushed, remaining: survivors.length }
}
