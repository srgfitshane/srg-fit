'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623",
  purple:"#8b5cf6", red:"#ef4444", green:"#22c55e", greenDim:"#22c55e15",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const METRICS = [
  { key:'weight',      label:'Weight',       unit:'lbs', icon:'⚖️',  color:'#00c9b1' },
  { key:'body_fat',    label:'Body Fat %',   unit:'%',   icon:'📊',  color:'#f5a623' },
  { key:'waist',       label:'Waist',        unit:'in',  icon:'📏',  color:'#ef4444' },
  { key:'chest',       label:'Chest',        unit:'in',  icon:'💪',  color:'#8b5cf6' },
  { key:'hips',        label:'Hips',         unit:'in',  icon:'🔵',  color:'#f472b6' },
  { key:'shoulders',   label:'Shoulders',    unit:'in',  icon:'🔷',  color:'#38bdf8' },
  { key:'left_arm',    label:'Left Arm',     unit:'in',  icon:'💪',  color:'#22c55e' },
  { key:'right_arm',   label:'Right Arm',    unit:'in',  icon:'💪',  color:'#22c55e' },
  { key:'left_thigh',  label:'Left Thigh',   unit:'in',  icon:'🦵',  color:'#a78bfa' },
  { key:'right_thigh', label:'Right Thigh',  unit:'in',  icon:'🦵',  color:'#a78bfa' },
  { key:'neck',        label:'Neck',         unit:'in',  icon:'🔲',  color:'#fb923c' },
  { key:'calves',      label:'Calves',       unit:'in',  icon:'🦵',  color:'#84cc16' },
]

function SparkLine({ data, color }: { data:number[], color:string }) {
  if (data.length < 2) return null
  const w = 80, h = 28
  const min = Math.min(...data), max = Math.max(...data), range = max-min||1
  const pts = data.map((v,i) => `${(i/(data.length-1))*(w-4)+2},${h-2-((v-min)/range)*(h-4)}`).join(' ')
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export default function ClientMetrics() {
  const [clientId,  setClientId]  = useState<string|null>(null)
  const [coachId,   setCoachId]   = useState<string|null>(null)
  const [history,   setHistory]   = useState<any[]>([])
  const [values,    setValues]    = useState<Record<string,string>>({})
  const [logDate,   setLogDate]   = useState(new Date().toISOString().split('T')[0])
  const [loading,   setLoading]   = useState(true)
  const [saving,    setSaving]    = useState(false)
  const [saved,     setSaved]     = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: clientData } = await supabase
      .from('clients').select('id, coach_id').eq('profile_id', user.id).single()
    if (!clientData) { setLoading(false); return }
    setClientId(clientData.id)
    setCoachId(clientData.coach_id)
    const { data: hist } = await supabase
      .from('metrics').select('*').eq('client_id', clientData.id)
      .order('logged_date', { ascending: false }).limit(12)
    setHistory(hist || [])
    setLoading(false)
  }

  const handleSave = async () => {
    if (!clientId) return
    setSaving(true)
    const payload: any = { client_id: clientId, logged_date: logDate }
    if (coachId) payload.coach_id = coachId
    METRICS.forEach(m => { if (values[m.key]) payload[m.key] = parseFloat(values[m.key]) })
    await supabase.from('metrics').upsert(payload, { onConflict: 'client_id,logged_date' })
    const { data: hist } = await supabase
      .from('metrics').select('*').eq('client_id', clientId)
      .order('logged_date', { ascending: false }).limit(12)
    setHistory(hist || [])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const sparkFor = (key: string) =>
    [...history].reverse().map(e => e[key]).filter(v => v != null)

  const latestFor = (key: string) => {
    for (const e of history) { if (e[key] != null) return e[key] }
    return null
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};} input[type=number]::-webkit-inner-spin-button{opacity:0.4}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 20px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>📏 Log Measurements</div>
          {saved && <div style={{ fontSize:12, fontWeight:700, color:t.green, background:t.greenDim, borderRadius:8, padding:'4px 10px' }}>✓ Saved!</div>}
        </div>

        <div style={{ maxWidth:700, margin:'0 auto', padding:24 }}>

          {/* Date picker */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>📅 Log Date</div>
            <input type="date" value={logDate} onChange={e=>setLogDate(e.target.value)}
              style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:8, padding:'7px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
            <div style={{ fontSize:11, color:t.textMuted }}>Fill in only what you have — all fields optional</div>
          </div>

          {/* Input grid */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            {METRICS.map(m => {
              const prev = latestFor(m.key)
              const spark = sparkFor(m.key)
              return (
                <div key={m.key} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700 }}>{m.icon} {m.label}</div>
                      {prev != null && (
                        <div style={{ fontSize:10, color:t.textDim, marginTop:2 }}>Last: {prev} {m.unit}</div>
                      )}
                    </div>
                    <SparkLine data={spark} color={m.color} />
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <input type="number" step="0.1" value={values[m.key]||''} onChange={e=>setValues(v=>({...v,[m.key]:e.target.value}))}
                      placeholder={prev != null ? String(prev) : '—'}
                      style={{ flex:1, background:t.surfaceUp, border:'1px solid '+(values[m.key]?m.color+'60':t.border), borderRadius:8, padding:'9px 12px', fontSize:14, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                    <span style={{ fontSize:11, color:t.textMuted, minWidth:24 }}>{m.unit}</span>
                  </div>
                </div>
              )
            })}
          </div>

          <button onClick={handleSave} disabled={saving}
            style={{ width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'14px', fontSize:14, fontWeight:800, color:'#000', cursor:saving?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
            {saving ? 'Saving...' : '💾 Save Measurements'}
          </button>

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop:28 }}>
              <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14 }}>Recent History</div>
              {history.slice(0,5).map(e => (
                <div key={e.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', marginBottom:10 }}>
                  <div style={{ fontSize:12, fontWeight:700, color:t.teal, marginBottom:8 }}>
                    {new Date(e.logged_date).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric', year:'numeric' })}
                  </div>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                    {METRICS.filter(m=>e[m.key]!=null).map(m => (
                      <span key={m.key} style={{ fontSize:11, background:t.surfaceHigh, borderRadius:6, padding:'3px 8px', color:t.textDim }}>
                        <span style={{ color:m.color, fontWeight:700 }}>{m.label}:</span> {e[m.key]} {m.unit}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
