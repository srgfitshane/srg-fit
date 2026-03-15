'use client'
import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const t = {
  bg:'#0f0f0f', surface:'#1a1a1a', surfaceHigh:'#242424', border:'#2a2a2a',
  text:'#f0f0f0', textMuted:'#888', green:'#4ade80', teal:'#2dd4bf',
  blue:'#60a5fa', purple:'#a78bfa', orange:'#fb923c', pink:'#f472b6',
  red:'#f87171', yellow:'#facc15',
}

const TIMEFRAMES = [
  { label:'1M', days:30 }, { label:'3M', days:90 },
  { label:'6M', days:180 }, { label:'1Y', days:365 }, { label:'All', days:9999 },
]

const METRIC_GROUPS = [
  { key:'weight',   label:'Weight (lbs)',   color:t.teal,   fields:['weight'] },
  { key:'bodyfat',  label:'Body Fat %',     color:t.orange, fields:['body_fat'] },
  { key:'measurements', label:'Measurements (in)', color:t.purple,
    fields:['waist','hips','chest','left_arm','right_arm','neck','shoulders','calves'] },
]

function fmt(d:string){ return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) }

const MCOLORS:Record<string,string> = {
  waist:t.teal, hips:t.pink, chest:t.blue, left_arm:t.green,
  right_arm:t.purple, neck:t.orange, shoulders:t.yellow, calves:t.red,
}

export default function CoachProgressPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [clients, setClients] = useState<any[]>([])
  const [selectedClient, setSelectedClient] = useState<any>(null)
  const [metrics, setMetrics] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2]) // default 6M
  const [activeGroup, setActiveGroup] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [logForm, setLogForm] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase
      .from('clients').select('id, profile_id, status, profiles:profile_id(full_name, avatar_url)')
      .eq('coach_id', user.id).eq('status','active').order('created_at')
    if (data?.length) { setClients(data); setSelectedClient(data[0]) }
    setLoading(false)
  }

  const loadData = useCallback(async () => {
    if (!selectedClient) return
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - timeframe.days)
    const dateStr = timeframe.days === 9999 ? '2000-01-01' : cutoff.toISOString().split('T')[0]

    const [{ data: mData }, { data: pData }] = await Promise.all([
      supabase.from('metrics').select('*')
        .eq('client_id', selectedClient.id)
        .gte('logged_date', dateStr)
        .order('logged_date'),
      supabase.from('progress_photos').select('*')
        .eq('client_id', selectedClient.profile_id)  // profile_id = auth user id
        .gte('photo_date', dateStr)
        .order('photo_date', { ascending: false }),
    ])
    setMetrics(mData || [])
    // Generate signed URLs for photos
    if (pData?.length) {
      const withUrls = await Promise.all(pData.map(async (p: any) => {
        const { data: url } = await supabase.storage
          .from('progress-photos').createSignedUrl(p.storage_path, 3600)
        return { ...p, signedUrl: url?.signedUrl }
      }))
      setPhotos(withUrls)
    } else { setPhotos([]) }
  }, [selectedClient, timeframe])

  useEffect(() => { loadData() }, [loadData])

  // Compute change stats
  const first = metrics[0]
  const last  = metrics[metrics.length - 1]
  const weightChange = first && last ? (last.weight - first.weight).toFixed(1) : null
  const bfChange = first && last && first.body_fat && last.body_fat
    ? (last.body_fat - first.body_fat).toFixed(1) : null

  // Chart data
  const chartData = metrics.map(m => ({
    date: fmt(m.logged_date),
    ...METRIC_GROUPS[activeGroup].fields.reduce((acc:any, f) => {
      if (m[f] != null) acc[f] = parseFloat(m[f])
      return acc
    }, {})
  }))

  async function saveMetric() {
    if (!selectedClient) return
    setSaving(true)
    const payload: any = { client_id: selectedClient.id, logged_date: logForm.date || new Date().toISOString().split('T')[0] }
    const numFields = ['weight','body_fat','waist','hips','chest','left_arm','right_arm','neck','shoulders','calves']
    numFields.forEach(f => { if (logForm[f]) payload[f] = parseFloat(logForm[f]) })
    if (logForm.notes) payload.notes = logForm.notes
    await supabase.from('metrics').insert(payload)
    setLogOpen(false); setLogForm({}); setSaving(false); loadData()
  }

  if (loading) return <div style={{color:t.textMuted,padding:40,textAlign:'center'}}>Loading...</div>

  return (
    <div style={{ background:t.bg, minHeight:'100vh', color:t.text, fontFamily:'system-ui,sans-serif', padding:24 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>📈 Progress Tracking</h1>
          <p style={{ color:t.textMuted, margin:'4px 0 0', fontSize:13 }}>Metrics, charts & progress photos</p>
        </div>
        <button onClick={()=>setLogOpen(true)} style={{ background:t.teal, color:'#000', border:'none',
          borderRadius:10, padding:'10px 18px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
          + Log Metrics
        </button>
      </div>

      {/* Client selector */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:24 }}>
        {clients.map(c => (
          <button key={c.id} onClick={()=>setSelectedClient(c)}
            style={{ padding:'8px 14px', borderRadius:20, border:'1px solid',
              borderColor: selectedClient?.id===c.id ? t.teal : t.border,
              background: selectedClient?.id===c.id ? t.teal+'22' : t.surface,
              color: selectedClient?.id===c.id ? t.teal : t.textMuted,
              cursor:'pointer', fontWeight:600, fontSize:13 }}>
            {c.profiles?.full_name || 'Client'}
          </button>
        ))}
      </div>

      {/* Stats bar */}
      {metrics.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:24 }}>
          {[
            { label:'Latest Weight', val: last?.weight ? `${last.weight} lbs` : '—', color:t.teal },
            { label:'Weight Change', val: weightChange ? `${+weightChange>0?'+':''}${weightChange} lbs` : '—',
              color: weightChange ? (+weightChange<0 ? t.green : t.red) : t.textMuted },
            { label:'Latest Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '—', color:t.orange },
            { label:'BF% Change', val: bfChange ? `${+bfChange>0?'+':''}${bfChange}%` : '—',
              color: bfChange ? (+bfChange<0 ? t.green : t.red) : t.textMuted },
            { label:'Data Points', val: metrics.length, color:t.purple },
            { label:'Timespan', val: metrics.length>1
              ? `${Math.round((new Date(last.logged_date).getTime()-new Date(first.logged_date).getTime())/(86400000*7))} wks`
              : '—', color:t.blue },
          ].map(s => (
            <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'14px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart section */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:20 }}>
        {/* Chart type tabs + timeframe toggle */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:6 }}>
            {METRIC_GROUPS.map((g,i) => (
              <button key={g.key} onClick={()=>setActiveGroup(i)}
                style={{ padding:'6px 12px', borderRadius:20, border:'1px solid',
                  borderColor: activeGroup===i ? g.color : t.border,
                  background: activeGroup===i ? g.color+'22' : 'transparent',
                  color: activeGroup===i ? g.color : t.textMuted,
                  cursor:'pointer', fontSize:12, fontWeight:600 }}>
                {g.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf.label} onClick={()=>setTimeframe(tf)}
                style={{ padding:'5px 10px', borderRadius:8, border:'1px solid',
                  borderColor: timeframe.label===tf.label ? t.teal : t.border,
                  background: timeframe.label===tf.label ? t.teal+'22' : 'transparent',
                  color: timeframe.label===tf.label ? t.teal : t.textMuted,
                  cursor:'pointer', fontSize:11, fontWeight:700 }}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        {metrics.length === 0 ? (
          <div style={{ textAlign:'center', color:t.textMuted, padding:60, fontSize:14 }}>
            No metrics logged for this timeframe yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false}
                domain={['auto','auto']} />
              <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border,
                borderRadius:10, color:t.text }} />
              <Legend wrapperStyle={{ paddingTop:12, color:t.textMuted, fontSize:12 }} />
              {METRIC_GROUPS[activeGroup].fields.map(f => (
                <Line key={f} type="monotone" dataKey={f}
                  stroke={METRIC_GROUPS[activeGroup].fields.length===1
                    ? METRIC_GROUPS[activeGroup].color
                    : MCOLORS[f] || t.teal}
                  strokeWidth={2.5} dot={{ r:4, fill:METRIC_GROUPS[activeGroup].color }}
                  connectNulls activeDot={{ r:6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Raw data table */}
      {metrics.length > 0 && (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:20, overflowX:'auto' }}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:t.textMuted }}>RAW DATA</div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ color:t.textMuted }}>
                {['Date','Weight','BF%','Waist','Hips','Chest','L.Arm','R.Arm','Notes'].map(h=>(
                  <th key={h} style={{ padding:'6px 10px', textAlign:'left', borderBottom:'1px solid '+t.border, fontWeight:700, whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...metrics].reverse().map((m,i) => (
                <tr key={m.id} style={{ background: i%2===0 ? 'transparent' : t.surfaceHigh+'44' }}>
                  {[fmt(m.logged_date), m.weight??'—', m.body_fat??'—', m.waist??'—',
                    m.hips??'—', m.chest??'—', m.left_arm??'—', m.right_arm??'—',
                    m.notes||''].map((v,j)=>(
                    <td key={j} style={{ padding:'8px 10px', borderBottom:'1px solid '+t.border+'44',
                      color: j===0 ? t.text : t.textMuted }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress Photos */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:t.textMuted }}>PROGRESS PHOTOS</div>
        {photos.length === 0 ? (
          <div style={{ textAlign:'center', color:t.textMuted, padding:40, fontSize:13 }}>
            No progress photos yet for this timeframe.
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12 }}>
            {photos.map(p => (
              <div key={p.id} style={{ borderRadius:12, overflow:'hidden', border:'1px solid '+t.border, position:'relative' }}>
                <img src={p.signedUrl} alt={p.angle} style={{ width:'100%', aspectRatio:'3/4', objectFit:'cover', display:'block' }} />
                <div style={{ padding:'8px 10px', background:t.surfaceHigh }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.teal, textTransform:'capitalize' }}>{p.angle?.replace('_',' ')}</div>
                  <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.photo_date)}</div>
                  {p.caption && <div style={{ fontSize:11, color:t.text, marginTop:2 }}>{p.caption}</div>}
                  {p.weight_at_time && <div style={{ fontSize:10, color:t.orange }}>{p.weight_at_time} lbs</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Log Metrics Modal */}
      {logOpen && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'100%', maxWidth:520, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>Log Metrics</div>
              <button onClick={()=>setLogOpen(false)} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { key:'date', label:'Date', type:'date', full:true },
                { key:'weight', label:'Weight (lbs)' }, { key:'body_fat', label:'Body Fat %' },
                { key:'waist', label:'Waist (in)' }, { key:'hips', label:'Hips (in)' },
                { key:'chest', label:'Chest (in)' }, { key:'left_arm', label:'Left Arm (in)' },
                { key:'right_arm', label:'Right Arm (in)' }, { key:'neck', label:'Neck (in)' },
                { key:'shoulders', label:'Shoulders (in)' }, { key:'calves', label:'Calves (in)' },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full ? '1/-1' : 'auto' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'number'} step="0.1"
                    defaultValue={f.key==='date' ? new Date().toISOString().split('T')[0] : ''}
                    onChange={e => setLogForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                      borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' }} />
                </div>
              ))}
              <div style={{ gridColumn:'1/-1' }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>Notes</label>
                <input type="text" onChange={e => setLogForm(p => ({ ...p, notes: e.target.value }))}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                    borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <button onClick={saveMetric} disabled={saving}
              style={{ marginTop:18, width:'100%', background:t.teal, color:'#000', border:'none',
                borderRadius:10, padding:'12px', fontWeight:800, cursor:'pointer', fontSize:14 }}>
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
