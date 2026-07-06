import type { SupabaseClient } from '@supabase/supabase-js'

// Water is tracked in the habit tracker (single source of truth). The coach
// still sets a water target on the nutrition plan, so when they save it we
// mirror that target onto the client's water habit — updating the existing
// one, or creating it if none exists — so the client can actually log water
// against it. The dashboard log popup treats unit 'oz' as an additive habit
// with quick-add presets, which is why we normalise to 'oz'.
//
// Best-effort by design: the nutrition-plan save is the primary action and
// must not fail if habit provisioning hiccups. It's idempotent — re-saving
// the plan updates the same habit rather than spawning duplicates.
export async function syncWaterHabit(
  supabase: SupabaseClient,
  opts: { clientId: string; coachId: string; targetOz: number },
): Promise<void> {
  const { clientId, coachId, targetOz } = opts
  if (!clientId || !coachId || !targetOz || targetOz <= 0) return
  try {
    // Match any existing hydration habit (active or not) so we don't create a
    // duplicate "Water" alongside a coach's "Drink Water" / "Hydration".
    const { data: existing } = await supabase
      .from('habits')
      .select('id, unit')
      .eq('client_id', clientId)
      .or('label.ilike.%water%,label.ilike.%hydrat%,label.ilike.%drink%')
      .limit(1)

    if (existing && existing.length > 0) {
      const h = existing[0] as { id: string; unit: string | null }
      const unit = (h.unit || '').toLowerCase().trim()
      // The plan target is in oz. Only push it onto a habit that's actually
      // measured in oz (or has no unit yet) — don't clobber a coach's
      // glasses/cups/ml water habit with an oz number.
      if (unit === '' || unit === 'oz') {
        await supabase.from('habits')
          .update({ target: targetOz, unit: 'oz', active: true })
          .eq('id', h.id)
      }
    } else {
      await supabase.from('habits').insert({
        coach_id: coachId, client_id: clientId,
        label: 'Water', icon: '💧',
        habit_type: 'number', unit: 'oz', target: targetOz,
        color: '#38bdf8', category: 'nutrition', active: true, frequency: 'daily',
      })
    }
  } catch { /* best-effort — the plan save already succeeded */ }
}
