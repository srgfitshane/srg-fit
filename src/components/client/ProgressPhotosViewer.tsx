'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type ProgressPhoto = {
  id: string
  client_id: string
  storage_path: string
  photo_date: string
  angle?: string | null
  caption?: string | null
  weight_at_time?: number | null
  signedUrl?: string
}

type ThemeTokens = {
  surface: string
  surfaceHigh: string
  border: string
  text: string
  textMuted: string
  textDim?: string
  teal: string
  tealDim?: string
  purple: string
  purpleDim?: string
  orange: string
  green: string
  red: string
}

type Props = {
  supabase: SupabaseClient
  // The auth.uid of the client who owns the photos.
  // progress_photos.client_id stores profile_id (auth.uid), not clients.id.
  clientProfileId: string
  // Earliest photo_date to load (YYYY-MM-DD). Optional.
  fromDate?: string
  // Theme tokens — host passes its own so we work in either token style.
  t: ThemeTokens
  // Bump this number to force a reload (e.g. after a new upload).
  refreshKey?: number
}

const ANGLE_ORDER = ['front', 'back', 'side_left', 'side_right', 'other'] as const
const ANGLE_LABELS: Record<string, string> = {
  front: 'Front',
  back: 'Back',
  side_left: 'Side (Left)',
  side_right: 'Side (Right)',
  other: 'Other',
}

function fmtShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtFull(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default function ProgressPhotosViewer({
  supabase,
  clientProfileId,
  fromDate,
  t,
  refreshKey,
}: Props) {
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [compareAngle, setCompareAngle] = useState<string | null>(null)
  const [compareSel, setCompareSel] = useState<ProgressPhoto[]>([])
  const [lightbox, setLightbox] = useState<ProgressPhoto | null>(null)
  const [compareView, setCompareView] = useState<[ProgressPhoto, ProgressPhoto] | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      let q = supabase
        .from('progress_photos')
        .select('*')
        .eq('client_id', clientProfileId)
        .order('photo_date', { ascending: false })
      if (fromDate) q = q.gte('photo_date', fromDate)
      const { data } = await q
      if (cancelled) return
      const rows = (data || []) as ProgressPhoto[]
      if (!rows.length) {
        setPhotos([])
        setLoading(false)
        return
      }
      const withUrls = await Promise.all(rows.map(async (p) => {
        const { data: url } = await supabase.storage
          .from('progress-photos')
          .createSignedUrl(p.storage_path, 3600)
        return { ...p, signedUrl: url?.signedUrl }
      }))
      if (cancelled) return
      setPhotos(withUrls)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [supabase, clientProfileId, fromDate, refreshKey])

  // Group photos by angle, preserving date-desc order within each group.
  const grouped = useMemo(() => {
    const byAngle: Record<string, ProgressPhoto[]> = {}
    for (const p of photos) {
      const key = p.angle && (ANGLE_ORDER as readonly string[]).includes(p.angle)
        ? p.angle
        : 'other'
      if (!byAngle[key]) byAngle[key] = []
      byAngle[key].push(p)
    }
    return ANGLE_ORDER
      .map(angle => ({ angle: angle as string, photos: byAngle[angle] || [] }))
      .filter(g => g.photos.length > 0)
  }, [photos])

  function toggleCompareSel(p: ProgressPhoto) {
    setCompareSel(prev => {
      const exists = prev.find(x => x.id === p.id)
      if (exists) return prev.filter(x => x.id !== p.id)
      if (prev.length >= 2) return [prev[1], p]
      return [...prev, p]
    })
  }

  function startCompare(angle: string) {
    setCompareAngle(angle)
    setCompareSel([])
  }

  function cancelCompare() {
    setCompareAngle(null)
    setCompareSel([])
  }

  function openCompareView() {
    if (compareSel.length !== 2) return
    const sorted = [...compareSel].sort((a, b) => a.photo_date.localeCompare(b.photo_date))
    setCompareView([sorted[0], sorted[1]])
  }

  if (loading) {
    return (
      <div style={{ background: t.surface, border: '1px solid ' + t.border, borderRadius: 16, padding: 24, textAlign: 'center', color: t.textMuted, fontSize: 13 }}>
        Loading photos…
      </div>
    )
  }

  if (!photos.length) {
    return (
      <div style={{ background: t.surface, border: '1px solid ' + t.border, borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📸</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.text, marginBottom: 4 }}>No progress photos yet</div>
        <div style={{ fontSize: 12, color: t.textMuted }}>Photos uploaded during check-ins or from the Progress page will appear here.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {grouped.map(group => {
        const isCollapsed = !!collapsed[group.angle]
        const isComparing = compareAngle === group.angle
        const tealDim = t.tealDim || (t.teal + '15')

        return (
          <div key={group.angle} style={{ background: t.surface, border: '1px solid ' + t.border, borderRadius: 16, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', cursor: 'pointer', borderBottom: isCollapsed ? 'none' : '1px solid ' + t.border, background: isComparing ? tealDim : 'transparent' }}
              onClick={() => setCollapsed(c => ({ ...c, [group.angle]: !c[group.angle] }))}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.text }}>{ANGLE_LABELS[group.angle] || group.angle}</div>
                  <div style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>
                    {group.photos.length} photo{group.photos.length === 1 ? '' : 's'}
                    {group.photos[0] && <> · newest {fmtShort(group.photos[0].photo_date)}</>}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                {!isComparing && group.photos.length >= 2 && (
                  <button onClick={() => startCompare(group.angle)}
                    style={{ background: 'transparent', border: '1px solid ' + t.border, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: t.textMuted, cursor: 'pointer' }}>
                    Compare
                  </button>
                )}
                {isComparing && (
                  <>
                    <span style={{ fontSize: 11, color: t.teal, fontWeight: 700 }}>
                      {compareSel.length}/2 selected
                    </span>
                    <button onClick={openCompareView} disabled={compareSel.length !== 2}
                      style={{ background: compareSel.length === 2 ? t.teal : 'transparent',
                        border: '1px solid ' + (compareSel.length === 2 ? t.teal : t.border),
                        borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 800,
                        color: compareSel.length === 2 ? '#000' : t.textMuted,
                        cursor: compareSel.length === 2 ? 'pointer' : 'not-allowed' }}>
                      View
                    </button>
                    <button onClick={cancelCompare}
                      style={{ background: 'transparent', border: '1px solid ' + t.border, borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 700, color: t.textMuted, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </>
                )}
                <span style={{ fontSize: 11, color: t.textMuted }}>{isCollapsed ? '▸' : '▾'}</span>
              </div>
            </div>

            {!isCollapsed && (
              <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
                {group.photos.map(p => {
                  const selected = isComparing && compareSel.find(s => s.id === p.id)
                  const selIdx = compareSel.findIndex(s => s.id === p.id)
                  return (
                    <div key={p.id}
                      onClick={() => isComparing ? toggleCompareSel(p) : setLightbox(p)}
                      style={{ position: 'relative', borderRadius: 10, overflow: 'hidden',
                        border: '2px solid ' + (selected ? t.teal : t.border),
                        cursor: 'pointer', transition: 'transform 0.15s ease, border-color 0.15s ease' }}
                      onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                      onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}>
                      {selected && (
                        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 3, background: t.teal, color: '#000', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>
                          {selIdx + 1}
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 6, left: 6, zIndex: 3, background: 'rgba(0,0,0,0.65)', color: '#fff', borderRadius: 6, padding: '2px 7px', fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans', sans-serif", letterSpacing: '0.02em' }}>
                        {fmtShort(p.photo_date)}
                      </div>
                      {p.signedUrl && (
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '3 / 4' }}>
                          <img
                            src={p.signedUrl}
                            alt={(ANGLE_LABELS[group.angle] || 'Progress') + ' photo from ' + fmtFull(p.photo_date)}
                            style={{ objectFit: 'cover', display: 'block', width: '100%', height: '100%' }}
                          />
                        </div>
                      )}
                      {p.weight_at_time && (
                        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.65)', color: t.orange, padding: '4px 8px', fontSize: 11, fontWeight: 700, textAlign: 'right' }}>
                          {p.weight_at_time} lbs
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {lightbox && (
        <div onClick={() => setLightbox(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 520, width: '100%' }}>
            {lightbox.signedUrl && (
              <img src={lightbox.signedUrl}
                alt={(ANGLE_LABELS[lightbox.angle || 'other'] || 'Progress') + ' photo from ' + fmtFull(lightbox.photo_date)}
                style={{ width: '100%', height: 'auto', maxHeight: '75vh', objectFit: 'contain', borderRadius: '12px 12px 0 0', display: 'block' }} />
            )}
            <div style={{ background: t.surface, padding: '12px 16px', borderRadius: '0 0 12px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.teal }}>
                {ANGLE_LABELS[lightbox.angle || 'other'] || 'Other'} · {fmtFull(lightbox.photo_date)}
              </div>
              {lightbox.weight_at_time && (
                <div style={{ fontSize: 12, color: t.orange, marginTop: 2 }}>{lightbox.weight_at_time} lbs</div>
              )}
              {lightbox.caption && (
                <div style={{ fontSize: 12, color: t.text, marginTop: 4 }}>{lightbox.caption}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {compareView && (
        <div onClick={() => { setCompareView(null); cancelCompare() }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 20, overflowY: 'auto' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 980 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: t.text, textAlign: 'center', marginBottom: 14 }}>
              Photo Comparison
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {compareView.map((p, i) => {
                const labelColor = i === 0 ? t.teal : t.purple
                const labelBg = i === 0 ? (t.tealDim || t.teal + '15') : (t.purpleDim || t.purple + '15')
                return (
                  <div key={p.id} style={{ background: t.surface, borderRadius: 14, overflow: 'hidden', border: '2px solid ' + labelColor }}>
                    <div style={{ background: labelBg, color: labelColor, padding: '8px 14px', fontSize: 11, fontWeight: 800, display: 'flex', justifyContent: 'space-between' }}>
                      <span>{i === 0 ? 'Before' : 'After'}</span>
                      <span style={{ color: t.textMuted }}>
                        {p.weight_at_time ? `${p.weight_at_time} lbs · ` : ''}{fmtFull(p.photo_date)}
                      </span>
                    </div>
                    {p.signedUrl && (
                      <img src={p.signedUrl}
                        alt={(i === 0 ? 'Earlier' : 'Later') + ' photo from ' + fmtFull(p.photo_date)}
                        style={{ width: '100%', height: 'auto', maxHeight: '60vh', objectFit: 'contain', display: 'block' }} />
                    )}
                    {p.caption && (
                      <div style={{ padding: '8px 14px', background: t.surfaceHigh, fontSize: 12, color: t.textDim || t.textMuted }}>
                        {p.caption}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {compareView[0].weight_at_time != null && compareView[1].weight_at_time != null && (
              <div style={{ marginTop: 14, background: t.surfaceHigh, borderRadius: 10, padding: '10px 16px', textAlign: 'center' }}>
                <span style={{ fontSize: 12, color: t.textMuted }}>Weight change: </span>
                <span style={{ fontSize: 15, fontWeight: 800,
                  color: (compareView[1].weight_at_time - compareView[0].weight_at_time) < 0 ? t.green : t.red }}>
                  {(compareView[1].weight_at_time - compareView[0].weight_at_time) > 0 ? '+' : ''}
                  {(compareView[1].weight_at_time - compareView[0].weight_at_time).toFixed(1)} lbs
                </span>
                <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 10 }}>
                  over {Math.round((new Date(compareView[1].photo_date).getTime() - new Date(compareView[0].photo_date).getTime()) / 86400000)} days
                </span>
              </div>
            )}
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <button onClick={() => { setCompareView(null); cancelCompare() }}
                style={{ background: t.surfaceHigh, border: '1px solid ' + t.border, borderRadius: 10, padding: '8px 22px', fontSize: 12, fontWeight: 700, color: t.textMuted, cursor: 'pointer' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
