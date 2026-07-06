// Offline queue for food log entries. Mirrors workout-offline-queue:
// when a food_entries insert fails (or the device is offline), the
// payload is parked in localStorage. The nutrition tab registers an
// "online" listener and flushes the queue automatically on reconnect.
//
// Extra wrinkle vs workout sets: a food entry needs a daily_log_id, and
// the nutrition_daily_logs row itself may not exist yet while offline.
// So the queue stores the log coordinates (client_id/coach_id/plan_id/
// log_date) and the flush resolves-or-creates the daily log first, then
// inserts the entry and recalcs the log's totals.
//
// Dedupe: food_entries has no natural unique key (two bananas at lunch
// are two legit rows), so the payload carries logged_at stamped at
// queue time and the flush checks for an existing row with the same
// daily_log_id + logged_at before inserting.

import type { SupabaseClient } from '@supabase/supabase-js'

const KEY = 'srg-pending-food-logs'

export type QueuedFoodEntry = {
  // Stable id for the queued item (NOT a DB row id; the row hasn't been
  // inserted yet). Doubles as the entry id in the tab's optimistic UI.
  client_uid: string
  client_id: string
  coach_id: string | null
  plan_id: string | null
  // YYYY-MM-DD the entry belongs to (the tab's selectedDate, not today)
  log_date: string
  // Insert body minus daily_log_id, which is resolved at flush time.
  payload: Record<string, unknown>
  queued_at: string
}

export function readFoodQueue(): QueuedFoodEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as QueuedFoodEntry[]) : []
  } catch {
    return []
  }
}

function writeQueue(items: QueuedFoodEntry[]) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // localStorage full / private mode — drop quietly
  }
}

export function enqueueFoodEntry(
  item: Omit<QueuedFoodEntry, 'client_uid' | 'queued_at'>
): QueuedFoodEntry {
  const full: QueuedFoodEntry = {
    ...item,
    client_uid:
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2),
    queued_at: new Date().toISOString(),
  }
  writeQueue([...readFoodQueue(), full])
  return full
}

// The queued row is deletable from the food log like a saved one —
// it just comes out of localStorage instead of the DB.
export function removeQueuedFoodEntry(clientUid: string) {
  writeQueue(readFoodQueue().filter(i => i.client_uid !== clientUid))
}

export function pendingFoodForDate(clientId: string, logDate: string): QueuedFoodEntry[] {
  return readFoodQueue().filter(i => i.client_id === clientId && i.log_date === logDate)
}

export function pendingFoodCount(): number {
  return readFoodQueue().length
}

export type FlushResult = { flushed: number; remaining: number }

export async function flushFoodQueue(supabase: SupabaseClient): Promise<FlushResult> {
  const items = readFoodQueue()
  if (items.length === 0) return { flushed: 0, remaining: 0 }

  const survivors: QueuedFoodEntry[] = []
  let flushed = 0
  // Resolve each (client, date) daily log once per flush; collect the
  // logs that received rows so totals recalc once per log, not per item.
  const logIds = new Map<string, string>()
  const touched = new Set<string>()

  for (const item of items) {
    try {
      const logKey = `${item.client_id}:${item.log_date}`
      let logId = logIds.get(logKey)
      if (!logId) {
        const { data, error } = await supabase.from('nutrition_daily_logs').upsert({
          client_id: item.client_id, coach_id: item.coach_id,
          plan_id: item.plan_id, log_date: item.log_date,
        }, { onConflict: 'client_id,log_date' }).select('id').single()
        if (error || !data) { survivors.push(item); continue }
        logId = data.id as string
        logIds.set(logKey, logId)
      }

      const { data: existing } = await supabase
        .from('food_entries')
        .select('id')
        .eq('daily_log_id', logId)
        .eq('logged_at', item.payload.logged_at as string)
        .limit(1)

      if (existing && existing.length > 0) {
        // Already in DB — drop the queued copy
        flushed++
        continue
      }

      const { error: insErr } = await supabase
        .from('food_entries')
        .insert({ ...item.payload, daily_log_id: logId })
      if (insErr) {
        survivors.push(item)
      } else {
        flushed++
        touched.add(logId)
      }
    } catch {
      survivors.push(item)
    }
  }

  // Totals recalc is best-effort: the entries themselves landed, and the
  // next in-tab mutation recalcs from scratch anyway.
  for (const logId of touched) {
    try {
      const { data: ents } = await supabase
        .from('food_entries')
        .select('calories,protein_g,carbs_g,fat_g,fiber_g')
        .eq('daily_log_id', logId)
      if (!ents) continue
      const totals = ents.reduce((acc, e) => ({
        total_calories: acc.total_calories + (e.calories  || 0),
        total_protein:  acc.total_protein  + (e.protein_g || 0),
        total_carbs:    acc.total_carbs    + (e.carbs_g   || 0),
        total_fat:      acc.total_fat      + (e.fat_g     || 0),
        total_fiber:    acc.total_fiber    + (e.fiber_g   || 0),
      }), { total_calories: 0, total_protein: 0, total_carbs: 0, total_fat: 0, total_fiber: 0 })
      await supabase.from('nutrition_daily_logs').update(totals).eq('id', logId)
    } catch { /* see above */ }
  }

  writeQueue(survivors)
  return { flushed, remaining: survivors.length }
}
