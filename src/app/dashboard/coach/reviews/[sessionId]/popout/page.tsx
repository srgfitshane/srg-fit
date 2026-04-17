'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const t = {
  bg: '#080810', surface: '#13131f', surfaceHigh: '#1a1a2e',
  border: 'rgba(255,255,255,0.08)', text: '#f0f0f8', textMuted: 'rgba(255,255,255,0.45)',
  teal: '#00C9B1', green: '#4ade80', orange: '#f97316', red: '#ef4444', yellow: '#facc15',
}

type SetRow = { set_number: number; reps_completed: number | null; weight_value: string | null; weight_unit: string | null; notes: string | null }
type Exercise = { id: string; exercise_name: string; sets_prescribed: number | null; reps_prescribed: string | null; sets_completed: number | null; client_video_url: string | null; notes_client: string | null; skipped: boolean | null; sets: SetRow[] }
type Session = { title: string; client_name: string; scheduled_date: string; duration_seconds: number | null; session_rpe: number | null; notes_client: string | null; exercises: Exercise[] }

function fmtDuration(s: number | null) {
  if (!s) return '—'
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

export default function ReviewPopout() {
  const { sessionId } = useParams<{ sessionId: string }>()
  const supabase = createClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: ws } = await supabase
        .from('workout_sessions')
        .select('title, scheduled_date, duration_seconds, session_rpe, notes_client, client:clients!workout_sessions_client_id_fkey(full_name, profile_id)')
        .eq('id', sessionId).single()
      if (!ws) { setLoading(false); return }

      const { data: exs } = await supabase
        .from('session_exercises')
        .select('id, exercise_name, sets_prescribed, reps_prescribed, sets_completed, client_video_url, notes_client, skipped, exercise:exercises!session_exercises_exercise_id_fkey(name)')
        .eq('session_id', sessionId).order('order_index')

      const exercises: Exercise[] = await Promise.all((exs || []).map(async (ex: any) => {
        const { data: sets } = await supabase
          .from('exercise_sets')
          .select('set_number, reps_completed, weight_value, weight_unit, notes')
          .eq('session_exercise_id', ex.id).order('set_number')
        const signedUrl = ex.client_video_url
          ? (await supabase.storage.from('form-checks').createSignedUrl(ex.client_video_url, 60 * 60)).data?.signedUrl || null
          : null
        return {
          ...ex,
          exercise_name: ex.exercise_name || ex.exercise?.name || '',
          client_video_url: signedUrl,
          sets: sets || [],
        }
      }))

      setSession({
        title: ws.title,
        client_name: (ws.client as any)?.full_name || 'Client',
        scheduled_date: ws.scheduled_date,
        duration_seconds: ws.duration_seconds,
        session_rpe: ws.session_rpe,
        notes_client: ws.notes_client,
        exercises,
      })
      setLoading(false)
    }
    load()
  }, [sessionId])

  if (loading) return (
    <div style={{ minHeight:'100vh', background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', color:t.teal, fontFamily:"'DM Sans',sans-serif", fontSize:16 }}>
      Loading session...
    </div>
  )
  if (!session) return (
    <div style={{ minHeight:'100vh', background:t.bg, display:'flex', alignItems:'center', justifyContent:'center', color:t.textMuted, fontFamily:"'DM Sans',sans-serif" }}>
      Session not found
    </div>
  )

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:"'DM Sans',sans-serif", padding:'32px 48px', maxWidth:1200, margin:'0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom:32, borderBottom:`1px solid ${t.border}`, paddingBottom:20 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:28, fontWeight:900, background:`linear-gradient(135deg,${t.teal},#00a896)`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>
              {session.title}
            </div>
            <div style={{ fontSize:16, color:t.textMuted }}>{session.client_name} · {new Date(session.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>
          <div style={{ display:'flex', gap:24, textAlign:'center' as const }}>
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:t.teal }}>{fmtDuration(session.duration_seconds)}</div>
              <div style={{ fontSize:11, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>Duration</div>
            </div>
            {session.session_rpe && (
              <div>
                <div style={{ fontSize:22, fontWeight:800, color:t.orange }}>{session.session_rpe}/10</div>
                <div style={{ fontSize:11, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>RPE</div>
              </div>
            )}
            <div>
              <div style={{ fontSize:22, fontWeight:800, color:t.green }}>{session.exercises.filter(e => !e.skipped && e.sets_completed && e.sets_completed > 0).length}/{session.exercises.length}</div>
              <div style={{ fontSize:11, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em' }}>Exercises</div>
            </div>
          </div>
        </div>
        {session.notes_client && (
          <div style={{ marginTop:16, background:t.surface, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 16px' }}>
            <div style={{ fontSize:11, fontWeight:800, color:t.yellow, textTransform:'uppercase' as const, letterSpacing:'0.06em', marginBottom:6 }}>💬 Client Note</div>
            <div style={{ fontSize:14, lineHeight:1.6, whiteSpace:'pre-wrap' }}>{session.notes_client}</div>
          </div>
        )}
      </div>

      {/* Exercises grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(520px, 1fr))', gap:20 }}>
        {session.exercises.map((ex, idx) => (
          <div key={ex.id} style={{ background:t.surface, border:`1px solid ${ex.skipped ? t.border : ex.client_video_url ? t.teal+'40' : t.border}`, borderRadius:16, overflow:'hidden' }}>

            {/* Exercise header */}
            <div style={{ padding:'16px 20px 12px', borderBottom:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:t.teal, flexShrink:0 }}>
                {idx + 1}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:16, fontWeight:800, color:ex.skipped ? t.textMuted : t.text, textDecoration:ex.skipped ? 'line-through' : 'none' }}>
                  {ex.exercise_name || 'Exercise'}
                </div>
                <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>
                  {ex.sets_prescribed} sets · {ex.reps_prescribed} reps prescribed
                  {ex.skipped && <span style={{ color:t.red, marginLeft:8, fontWeight:700 }}>SKIPPED</span>}
                </div>
              </div>
              {ex.client_video_url && (
                <div style={{ background:t.teal+'22', border:`1px solid ${t.teal}40`, borderRadius:8, padding:'4px 10px', fontSize:11, fontWeight:800, color:t.teal }}>
                  📹 Form Check
                </div>
              )}
            </div>

            <div style={{ display:'flex', gap:0 }}>
              {/* Sets table */}
              <div style={{ flex:1, padding:'14px 20px' }}>
                {ex.sets.length > 0 ? (
                  <table style={{ width:'100%', borderCollapse:'collapse' as const, fontSize:13 }}>
                    <thead>
                      <tr>
                        {['#', 'Reps', 'Weight', 'Notes'].map(h => (
                          <th key={h} style={{ textAlign:'left' as const, fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', paddingBottom:8, paddingRight:12 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ex.sets.map(s => (
                        <tr key={s.set_number}>
                          <td style={{ padding:'5px 12px 5px 0', color:t.textMuted, fontWeight:700 }}>{s.set_number}</td>
                          <td style={{ padding:'5px 12px 5px 0', color:t.teal, fontWeight:800, fontSize:15 }}>{s.reps_completed ?? '—'}</td>
                          <td style={{ padding:'5px 12px 5px 0', color:s.weight_value ? t.orange : t.textMuted, fontWeight:s.weight_value ? 700 : 400 }}>
                            {s.weight_value ? `${s.weight_value}${s.weight_unit && s.weight_unit !== 'bw' ? s.weight_unit : ''}` : s.weight_unit === 'bw' ? 'BW' : '—'}
                          </td>
                          <td style={{ padding:'5px 0', color:t.textMuted, fontSize:12 }}>{s.notes || ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize:13, color:t.textMuted, fontStyle:'italic' }}>No sets logged</div>
                )}
                {ex.notes_client && (
                  <div style={{ marginTop:10, fontSize:12, color:t.yellow, background:t.yellow+'10', borderRadius:8, padding:'8px 12px', lineHeight:1.5 }}>
                    💬 {ex.notes_client}
                  </div>
                )}
              </div>

              {/* Form check video */}
              {ex.client_video_url && (
                <div style={{ width:220, flexShrink:0, padding:'14px 16px 14px 0' }}>
                  <video src={ex.client_video_url} controls playsInline muted
                    style={{ width:'100%', borderRadius:10, background:'#000', display:'block' }}/>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ marginTop:40, paddingTop:20, borderTop:`1px solid ${t.border}`, textAlign:'center' as const, fontSize:12, color:t.textMuted }}>
        SRG Fit · Coach Review Session
      </div>
    </div>
  )
}
