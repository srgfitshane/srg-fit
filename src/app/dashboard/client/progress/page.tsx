'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const t = {
  bg:'#0f0f0f', surface:'#1a1a1a', surfaceHigh:'#242424', border:'#2a2a2a',
  text:'#f0f0f0', textMuted:'#888', textDim:'#aaa',
  green:'#4ade80', teal:'#2dd4bf', tealDim:'#2dd4bf15',
  blue:'#60a5fa', purple:'#a78bfa', purpleDim:'#a78bfa15',
  orange:'#fb923c', pink:'#f472b6',
  red:'#f87171', yellow:'#facc15',
}
const TIMEFRAMES = [
  { label:'1M', days:30 }, { label:'3M', days:90 },
  { label:'6M', days:180 }, { label:'1Y', days:365 }, { label:'All', days:9999 },
]
const METRIC_GROUPS = [
  { key:'weight', label:'Weight', color:t.teal, fields:['weight'] },
  { key:'bodyfat', label:'Body Fat %', color:t.orange, fields:['body_fat'] },
  { key:'measurements', label:'Measurements', color:t.purple,
    fields:['waist','hips','chest','left_arm','right_arm'] },
]
const MCOLORS:Record<string,string> = {
  waist:t.teal, hips:t.pink, chest:t.blue, left_arm:t.green, right_arm:t.purple,
}
const ANGLES = ['front','back','side_left','side_right','other']
function fmt(d:string){ return new Date(d+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) }

export default function ClientProgressPage() {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [metrics, setMetrics] = useState<any[]>([])
  const [photos, setPhotos] = useState<any[]>([])
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2])
  const [activeGroup, setActiveGroup] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [logForm, setLogForm] = useState<Record<string,string>>({})
  const [photoForm, setPhotoForm] = useState({ angle:'front', caption:'', weight_at_time:'' })
  const [photoFile, setPhotoFile] = useState<File|null>(null)
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState<any>(null)
  const [compareMode,  setCompareMode]  = useState(false)
  const [compareSelection, setCompareSelection] = useState<any[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { init() }, [])

  async function init() {
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('clients').select('*').eq('profile_id', user.id).single()
    setClientRecord(data)
    setLoading(false)
  }

  const loadData = useCallback(async () => {
    if (!clientRecord) return
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - timeframe.days)
    const dateStr = timeframe.days===9999 ? '2000-01-01' : cutoff.toISOString().split('T')[0]

    const [{ data: mData }, { data: pData }] = await Promise.all([
      supabase.from('metrics').select('*').eq('client_id', clientRecord.id)
        .gte('logged_date', dateStr).order('logged_date'),
      supabase.from('progress_photos').select('*').eq('client_id', user.id)
        .gte('photo_date', dateStr).order('photo_date', { ascending: false }),
    ])
    setMetrics(mData || [])
    if (pData?.length) {
      const withUrls = await Promise.all(pData.map(async (p: any) => {
        const { data: url } = await supabase.storage.from('progress-photos').createSignedUrl(p.storage_path, 3600)
        return { ...p, signedUrl: url?.signedUrl }
      }))
      setPhotos(withUrls)
    } else { setPhotos([]) }
  }, [clientRecord, timeframe])

  useEffect(() => { loadData() }, [loadData])

  const first = metrics[0], last = metrics[metrics.length-1]
  const weightChange = first&&last ? (last.weight-first.weight).toFixed(1) : null
  const bfChange = first&&last&&first.body_fat&&last.body_fat ? (last.body_fat-first.body_fat).toFixed(1) : null
  const chartData = metrics.map(m => ({
    date: fmt(m.logged_date),
    ...METRIC_GROUPS[activeGroup].fields.reduce((acc:any,f) => {
      if (m[f]!=null) acc[f]=parseFloat(m[f]); return acc
    },{})
  }))

  async function saveMetric() {
    if (!clientRecord) return
    setSaving(true)
    const payload:any = { client_id: clientRecord.id, logged_date: logForm.date||new Date().toISOString().split('T')[0] }
    ;['weight','body_fat','waist','hips','chest','left_arm','right_arm','neck','shoulders','calves']
      .forEach(f => { if (logForm[f]) payload[f]=parseFloat(logForm[f]) })
    if (logForm.notes) payload.notes = logForm.notes
    await supabase.from('metrics').insert(payload)
    setLogOpen(false); setLogForm({}); setSaving(false); loadData()
  }

  async function uploadPhoto() {
    if (!photoFile) return
    setSaving(true)
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const ext = photoFile.name.split('.').pop()
    const path = `${user.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('progress-photos').upload(path, photoFile)
    if (!upErr) {
      await supabase.from('progress_photos').insert({
        client_id: user.id, storage_path: path,
        photo_date: new Date().toISOString().split('T')[0],
        angle: photoForm.angle, caption: photoForm.caption||null,
        weight_at_time: photoForm.weight_at_time ? parseFloat(photoForm.weight_at_time) : null,
      })
    }
    setPhotoOpen(false); setSaving(false); setPhotoFile(null)
    setPhotoForm({ angle:'front', caption:'', weight_at_time:'' }); loadData()
  }

  const toggleComparePhoto = (photo: any) => {
    setCompareSelection(prev => {
      const exists = prev.find(p => p.id === photo.id)
      if (exists) return prev.filter(p => p.id !== photo.id)
      if (prev.length >= 2) return [prev[1], photo] // slide window
      return [...prev, photo]
    })
  }

  if (loading) return <div style={{color:t.textMuted,padding:40,textAlign:'center'}}>Loading...</div>

  return (
    <div style={{ background:t.bg, minHeight:'100vh', color:t.text, fontFamily:'system-ui,sans-serif', padding:24 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>📈 My Progress</h1>
          <p style={{ color:t.textMuted, margin:'4px 0 0', fontSize:13 }}>Track your transformation over time</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={()=>setPhotoOpen(true)} style={{ background:t.purple+'22', color:t.purple, border:'1px solid '+t.purple+'44',
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            📸 Add Photo
          </button>
          <button onClick={()=>setLogOpen(true)} style={{ background:t.teal, color:'#000', border:'none',
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            + Log Metrics
          </button>
        </div>
      </div>

      {/* Stats summary */}
      {metrics.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:20 }}>
          {[
            { label:'Current Weight', val: last?.weight ? `${last.weight} lbs` : '—', color:t.teal },
            { label:'Change', val: weightChange ? `${+weightChange>0?'+':''}${weightChange} lbs` : '—',
              color: weightChange ? (+weightChange<0?t.green:t.red) : t.textMuted },
            { label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '—', color:t.orange },
            { label:'BF% Change', val: bfChange ? `${+bfChange>0?'+':''}${bfChange}%` : '—',
              color: bfChange ? (+bfChange<0?t.green:t.red) : t.textMuted },
            { label:'Entries', val: metrics.length, color:t.purple },
          ].map(s => (
            <div key={s.label} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:3 }}>{s.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:s.color }}>{s.val}</div>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:10 }}>
          <div style={{ display:'flex', gap:6 }}>
            {METRIC_GROUPS.map((g,i) => (
              <button key={g.key} onClick={()=>setActiveGroup(i)}
                style={{ padding:'6px 12px', borderRadius:20, border:'1px solid',
                  borderColor: activeGroup===i?g.color:t.border,
                  background: activeGroup===i?g.color+'22':'transparent',
                  color: activeGroup===i?g.color:t.textMuted,
                  cursor:'pointer', fontSize:12, fontWeight:600 }}>
                {g.label}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {TIMEFRAMES.map(tf => (
              <button key={tf.label} onClick={()=>setTimeframe(tf)}
                style={{ padding:'5px 10px', borderRadius:8, border:'1px solid',
                  borderColor: timeframe.label===tf.label?t.teal:t.border,
                  background: timeframe.label===tf.label?t.teal+'22':'transparent',
                  color: timeframe.label===tf.label?t.teal:t.textMuted,
                  cursor:'pointer', fontSize:11, fontWeight:700 }}>
                {tf.label}
              </button>
            ))}
          </div>
        </div>
        {metrics.length===0 ? (
          <div style={{ textAlign:'center', color:t.textMuted, padding:60, fontSize:14 }}>
            No data yet — log your first entry to start tracking! 💪
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
              <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text }} />
              <Legend wrapperStyle={{ paddingTop:12, color:t.textMuted, fontSize:12 }} />
              {METRIC_GROUPS[activeGroup].fields.map(f => (
                <Line key={f} type="monotone" dataKey={f}
                  stroke={METRIC_GROUPS[activeGroup].fields.length===1 ? METRIC_GROUPS[activeGroup].color : MCOLORS[f]||t.teal}
                  strokeWidth={2.5} dot={{ r:4 }} connectNulls activeDot={{ r:6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Progress Photos */}
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:20, marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:8 }}>
          <div style={{ fontSize:13, fontWeight:700, color:t.textMuted }}>PROGRESS PHOTOS ({photos.length})</div>
          <div style={{ display:'flex', gap:8 }}>
            {photos.length >= 2 && (
              <button onClick={()=>{ setCompareMode(!compareMode); setCompareSelection([]) }}
                style={{ padding:'6px 14px', borderRadius:20, border:'1px solid', cursor:'pointer', fontSize:12, fontWeight:600,
                  borderColor: compareMode ? t.teal : t.border,
                  background:  compareMode ? t.tealDim : 'transparent',
                  color:       compareMode ? t.teal : t.textMuted }}>
                {compareMode ? '✕ Cancel Compare' : '⇔ Compare Photos'}
              </button>
            )}
          </div>
        </div>

        {/* Compare mode instructions */}
        {compareMode && (
          <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px', marginBottom:14, fontSize:12, color:t.teal }}>
            {compareSelection.length === 0 && 'Select two photos to compare side by side'}
            {compareSelection.length === 1 && 'Good — now select a second photo'}
            {compareSelection.length === 2 && (
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span>2 photos selected — ready to compare!</span>
                <button onClick={()=>setLightbox({ compare: true, photos: compareSelection })}
                  style={{ background:t.teal, border:'none', borderRadius:8, padding:'5px 14px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer' }}>
                  Compare →
                </button>
              </div>
            )}
          </div>
        )}

        {photos.length === 0 ? (
          <div style={{ textAlign:'center', color:t.textMuted, padding:40, fontSize:13 }}>
            No photos yet — add your first progress photo to track visual changes!
          </div>
        ) : (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
            {photos.map(p => {
              const selected = compareSelection.find(s => s.id === p.id)
              const selIdx   = compareSelection.findIndex(s => s.id === p.id)
              return (
                <div key={p.id}
                  onClick={() => compareMode ? toggleComparePhoto(p) : setLightbox(p)}
                  style={{ borderRadius:12, overflow:'hidden', border:'2px solid '+(selected ? t.teal : t.border),
                    cursor:'pointer', transition:'transform 0.15s, border-color 0.15s', position:'relative' }}
                  onMouseEnter={e=>(e.currentTarget.style.transform='scale(1.03)')}
                  onMouseLeave={e=>(e.currentTarget.style.transform='scale(1)')}>
                  {selected && (
                    <div style={{ position:'absolute', top:6, right:6, zIndex:2, background:t.teal, color:'#000', borderRadius:'50%', width:22, height:22, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800 }}>
                      {selIdx + 1}
                    </div>
                  )}
                  <img src={p.signedUrl} alt={p.angle} style={{ width:'100%', aspectRatio:'3/4', objectFit:'cover', display:'block' }} />
                  <div style={{ padding:'7px 10px', background:t.surfaceHigh }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.teal, textTransform:'capitalize' }}>{p.angle?.replace('_',' ')}</div>
                    <div style={{ fontSize:10, color:t.textMuted }}>{fmt(p.photo_date)}</div>
                    {p.weight_at_time && <div style={{ fontSize:10, color:t.orange }}>{p.weight_at_time} lbs</div>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Log Metrics Modal */}
      {logOpen && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:26, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>Log Metrics</div>
              <button onClick={()=>setLogOpen(false)} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { key:'date', label:'Date', type:'date', full:true },
                { key:'weight', label:'Weight (lbs)' }, { key:'body_fat', label:'Body Fat %' },
                { key:'waist', label:'Waist (in)' }, { key:'hips', label:'Hips (in)' },
                { key:'chest', label:'Chest (in)' }, { key:'left_arm', label:'Left Arm (in)' },
                { key:'right_arm', label:'Right Arm (in)' },
                { key:'notes', label:'Notes', type:'text', full:true },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full?'1/-1':'auto' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'number'} step="0.1"
                    defaultValue={f.key==='date' ? new Date().toISOString().split('T')[0] : ''}
                    onChange={e => setLogForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                      borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <button onClick={saveMetric} disabled={saving}
              style={{ marginTop:16, width:'100%', background:t.teal, color:'#000', border:'none',
                borderRadius:10, padding:'12px', fontWeight:800, cursor:'pointer', fontSize:14 }}>
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Upload Photo Modal */}
      {photoOpen && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:26, width:'100%', maxWidth:420 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>📸 Add Progress Photo</div>
              <button onClick={()=>setPhotoOpen(false)} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            {/* File drop zone */}
            <div onClick={()=>fileRef.current?.click()}
              style={{ border:'2px dashed '+t.border, borderRadius:12, padding:32, textAlign:'center',
                cursor:'pointer', marginBottom:16, color:t.textMuted, fontSize:13,
                background: photoFile ? t.green+'11' : 'transparent' }}>
              {photoFile ? `✅ ${photoFile.name}` : '📁 Click to select photo'}
              <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
                onChange={e => setPhotoFile(e.target.files?.[0]||null)} />
            </div>
            <div style={{ display:'grid', gap:12 }}>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>Angle</label>
                <select value={photoForm.angle} onChange={e=>setPhotoForm(p=>({...p,angle:e.target.value}))}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                    borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13 }}>
                  {ANGLES.map(a => <option key={a} value={a}>{a.replace('_',' ')}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>Weight at time (lbs)</label>
                <input type="number" step="0.1" value={photoForm.weight_at_time}
                  onChange={e=>setPhotoForm(p=>({...p,weight_at_time:e.target.value}))}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                    borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>Caption (optional)</label>
                <input type="text" value={photoForm.caption}
                  onChange={e=>setPhotoForm(p=>({...p,caption:e.target.value}))}
                  style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                    borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' }} />
              </div>
            </div>
            <button onClick={uploadPhoto} disabled={saving||!photoFile}
              style={{ marginTop:16, width:'100%', background: photoFile?t.purple:'#333', color: photoFile?'#fff':t.textMuted,
                border:'none', borderRadius:10, padding:'12px', fontWeight:800, cursor: photoFile?'pointer':'not-allowed', fontSize:14 }}>
              {saving ? 'Uploading...' : 'Upload Photo'}
            </button>
          </div>
        </div>
      )}

      {/* Lightbox — single photo */}
      {lightbox && !lightbox.compare && (
        <div onClick={()=>setLightbox(null)} style={{ position:'fixed', inset:0, background:'#000d', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ maxWidth:500, width:'100%' }}>
            <img src={lightbox.signedUrl} style={{ width:'100%', borderRadius:16, display:'block' }} />
            <div style={{ background:t.surface, borderRadius:'0 0 16px 16px', padding:'12px 16px' }}>
              <div style={{ fontWeight:700, color:t.teal, textTransform:'capitalize' }}>{lightbox.angle?.replace('_',' ')} — {fmt(lightbox.photo_date)}</div>
              {lightbox.weight_at_time && <div style={{ color:t.orange, fontSize:13 }}>{lightbox.weight_at_time} lbs</div>}
              {lightbox.caption && <div style={{ color:t.text, fontSize:13, marginTop:4 }}>{lightbox.caption}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — side-by-side compare */}
      {lightbox?.compare && lightbox.photos?.length === 2 && (
        <div onClick={()=>{ setLightbox(null); setCompareMode(false); setCompareSelection([]) }}
          style={{ position:'fixed', inset:0, background:'#000e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:200, padding:20, overflowY:'auto' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:900 }}>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, textAlign:'center', marginBottom:16 }}>📸 Photo Comparison</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {lightbox.photos.map((p: any, i: number) => (
                <div key={p.id} style={{ background:t.surface, borderRadius:16, overflow:'hidden', border:'2px solid '+(i===0 ? t.teal : t.purple) }}>
                  <div style={{ background:i===0 ? t.tealDim : t.purpleDim, padding:'8px 14px', fontSize:11, fontWeight:700, color:i===0?t.teal:t.purple, display:'flex', alignItems:'center', gap:6 }}>
                    <span>{i===0 ? '① Before' : '② After'}</span>
                    <span style={{ marginLeft:'auto', color:t.textMuted }}>
                      {p.weight_at_time ? `${p.weight_at_time} lbs · ` : ''}{fmt(p.photo_date)}
                    </span>
                  </div>
                  <img src={p.signedUrl} alt={p.angle} style={{ width:'100%', display:'block', objectFit:'cover', maxHeight:500 }} />
                  <div style={{ padding:'8px 14px', background:t.surfaceHigh }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'capitalize' }}>{p.angle?.replace('_',' ')}</div>
                    {p.caption && <div style={{ fontSize:11, color:t.textDim, marginTop:2 }}>{p.caption}</div>}
                  </div>
                </div>
              ))}
            </div>
            {/* Delta if both have weight */}
            {lightbox.photos[0].weight_at_time && lightbox.photos[1].weight_at_time && (
              <div style={{ marginTop:12, background:t.surfaceHigh, borderRadius:12, padding:'12px 16px', textAlign:'center' }}>
                <span style={{ fontSize:13, color:t.textMuted }}>Weight change: </span>
                <span style={{ fontSize:16, fontWeight:800, color: (lightbox.photos[1].weight_at_time - lightbox.photos[0].weight_at_time) < 0 ? t.green : t.red }}>
                  {((lightbox.photos[1].weight_at_time - lightbox.photos[0].weight_at_time) > 0 ? '+' : '')}
                  {(lightbox.photos[1].weight_at_time - lightbox.photos[0].weight_at_time).toFixed(1)} lbs
                </span>
              </div>
            )}
            <button onClick={()=>{ setLightbox(null); setCompareMode(false); setCompareSelection([]) }}
              style={{ marginTop:16, display:'block', marginLeft:'auto', marginRight:'auto', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'9px 24px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
