'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

const localDateStr = (d: Date = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

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

type ClientRecord = {
  id: string
  profile_id?: string | null
  show_progress_photos?: boolean | null
  show_body_metrics?: boolean | null
}

type MetricEntry = {
  id: string
  client_id: string
  logged_date: string
  weight?: number | string | null
  body_fat?: number | string | null
  waist?: number | string | null
  hips?: number | string | null
  chest?: number | string | null
  left_arm?: number | string | null
  right_arm?: number | string | null
  notes?: string | null
}

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

type PulseEntry = {
  checkin_date: string
  sleep_quality?: number | null
  energy_score?: number | null
  mood_emoji?: string | null
}

type CompareLightbox = {
  compare: true
  photos: [ProgressPhoto, ProgressPhoto]
}

type LightboxState = ProgressPhoto | CompareLightbox | null

function isCompareLightbox(lightbox: LightboxState): lightbox is CompareLightbox {
  return !!lightbox && 'compare' in lightbox && lightbox.compare === true
}

export default function ClientProgressPage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const [clientRecord, setClientRecord] = useState<ClientRecord | null>(null)
  const [metrics, setMetrics] = useState<MetricEntry[]>([])
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2])
  const [activeGroup, setActiveGroup] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logOpen, setLogOpen] = useState(false)
  const [photoOpen, setPhotoOpen] = useState(false)
  const [logForm, setLogForm] = useState<Record<string,string>>({})
  const [photoForm, setPhotoForm] = useState({ angle:'front', caption:'', weight_at_time:'' })
  const [photoFile, setPhotoFile] = useState<File|null>(null)
  const [saving, setSaving] = useState(false)
  const [lightbox, setLightbox] = useState<LightboxState>(null)
  const [compareMode,  setCompareMode]  = useState(false)
  const [compareSelection, setCompareSelection] = useState<ProgressPhoto[]>([])
  const [pulseHistory, setPulseHistory] = useState<PulseEntry[]>([])
  const [pulseTimeframe, setPulseTimeframe] = useState(30)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user) return
        const { data } = await supabase.from('clients').select('id, profile_id, show_progress_photos, show_body_metrics').eq('profile_id', user.id).single<ClientRecord>()
        setClientRecord(data)
        setLoading(false)
      })()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [supabase])

  const loadData = useCallback(async () => {
    if (!clientRecord) return
    const { data:{ user } } = await supabase.auth.getUser()
    if (!user) return
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - timeframe.days)
    const dateStr = timeframe.days===9999 ? '2000-01-01' : localDateStr(cutoff)

    const [{ data: mData }, { data: pData }, { data: pulseData }] = await Promise.all([
      supabase.from('metrics').select('*').eq('client_id', clientRecord.id)
        .gte('logged_date', dateStr).order('logged_date'),
      supabase.from('progress_photos').select('*').eq('client_id', user.id)
        .gte('photo_date', dateStr).order('photo_date', { ascending: false }),
      supabase.from('daily_checkins').select('checkin_date,sleep_quality,energy_score,mood_emoji')
        .eq('client_id', clientRecord.id)
        .order('checkin_date', { ascending: true })
        .limit(90),
    ])
    setMetrics((mData || []) as MetricEntry[])
    setPulseHistory((pulseData || []) as PulseEntry[])
    if (pData?.length) {
      const withUrls = await Promise.all((pData as ProgressPhoto[]).map(async (p) => {
        console.log('creating signed url for:', p.storage_path)
        const { data: url, error: urlErr } = await supabase.storage.from('progress-photos').createSignedUrl(p.storage_path, 3600)
        console.log('signed url result:', url?.signedUrl, urlErr)
        return { ...p, signedUrl: url?.signedUrl }
      }))
      setPhotos(withUrls)
    } else { setPhotos([]) }
  }, [clientRecord, supabase, timeframe])

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadData() }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadData])

  const first = metrics[0], last = metrics[metrics.length-1]
  const weightChange = first?.weight != null && last?.weight != null ? (Number(last.weight) - Number(first.weight)).toFixed(1) : null
  const bfChange = first?.body_fat != null && last?.body_fat != null ? (Number(last.body_fat) - Number(first.body_fat)).toFixed(1) : null
  const latestPulse = pulseHistory[pulseHistory.length - 1]
  const singlePhotoLightbox = lightbox && !isCompareLightbox(lightbox) ? lightbox : null
  const chartData = metrics.map(m => ({
    date: fmt(m.logged_date),
    ...METRIC_GROUPS[activeGroup].fields.reduce<Record<string, number>>((acc, f) => {
      const value = m[f as keyof MetricEntry]
      if (value != null) acc[f] = parseFloat(String(value))
      return acc
    }, {})
  }))

  async function saveMetric() {
    if (!clientRecord) return
    setSaving(true)
    const payload: Record<string, number | string> = { client_id: clientRecord.id, logged_date: logForm.date||localDateStr() }
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
        photo_date: localDateStr(),
        angle: photoForm.angle, caption: photoForm.caption||null,
        weight_at_time: photoForm.weight_at_time ? parseFloat(photoForm.weight_at_time) : null,
      })
    }
    setPhotoOpen(false); setSaving(false); setPhotoFile(null)
    setPhotoForm({ angle:'front', caption:'', weight_at_time:'' }); loadData()
  }

  const toggleComparePhoto = (photo: ProgressPhoto) => {
    setCompareSelection(prev => {
      const exists = prev.find(p => p.id === photo.id)
      if (exists) return prev.filter(p => p.id !== photo.id)
      if (prev.length >= 2) return [prev[1], photo] // slide window
      return [...prev, photo]
    })
  }

  if (loading) return <div style={{color:t.textMuted,padding:40,textAlign:'center'}}>Loading...</div>

  return (
    <>
      <div style={{ background:t.bg, minHeight:'100vh', color:t.text, fontFamily:'system-ui,sans-serif', padding:'24px 24px 0' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24, flexWrap:'wrap', gap:10 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:800, margin:0 }}>📈 My Progress</h1>
          <p style={{ color:t.textMuted, margin:'4px 0 0', fontSize:13 }}>Track your transformation over time</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {clientRecord?.show_progress_photos !== false && <button onClick={()=>setPhotoOpen(true)} style={{ background:t.purple+'22', color:t.purple, border:'1px solid '+t.purple+'44',
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            📸 Add Photo
          </button>}
          {!(clientRecord != null && !clientRecord.show_body_metrics) && <button onClick={()=>setLogOpen(true)} style={{ background:t.teal, color:'#000', border:'none',
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            + Log Metrics
          </button>}
        </div>
      </div>

      {!(clientRecord != null && !clientRecord.show_body_metrics) && (<>
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'16px 18px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', gap:12, flexWrap:'wrap', alignItems:'flex-start' }}>
          <div style={{ flex:'1 1 240px' }}>
            <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Progress Snapshot</div>
            <div style={{ fontSize:16, fontWeight:800, color:t.text }}>
              {metrics.length === 0 ? 'Start with your first metric or progress photo' : 'Your progress story is building'}
            </div>
            <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5, marginTop:4 }}>
              {metrics.length === 0
                ? 'Consistent check-ins make it easier to spot what is working before motivation dips.'
                : latestPulse
                ? `Latest recovery check-in: sleep ${latestPulse.sleep_quality ?? '—'}/5, energy ${latestPulse.energy_score ?? '—'}/5.`
                : 'Keep logging photos and measurements so coaching adjustments stay evidence-based.'}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:8, flex:'1 1 260px' }}>
            <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Metric Entries</div>
              <div style={{ fontSize:16, fontWeight:800, color:t.teal }}>{metrics.length}</div>
            </div>
            <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Photo Checkpoints</div>
              <div style={{ fontSize:16, fontWeight:800, color:t.purple }}>{photos.length}</div>
            </div>
            <div style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:12, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:4 }}>Current Focus</div>
              <div style={{ fontSize:16, fontWeight:800, color:t.orange }}>{METRIC_GROUPS[activeGroup].label}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Stats summary */}
      {metrics.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:20 }}>
          {[
            { label:'Current Weight', val: last?.weight ? `${last.weight} lbs` : '—', color:t.teal },
            { label:'Change', val: weightChange ? `${+weightChange>0?'+':''}${weightChange} lbs` : '—',
              color: weightChange ? (+weightChange<0?t.green:t.red) : t.textMuted },
            { label:'Body Fat', val: last?.body_fat ? `${last.body_fat}%` : '—', color:t.orange, hidden: clientRecord != null && !clientRecord.show_body_metrics },
            { label:'BF% Change', val: bfChange ? `${+bfChange>0?'+':''}${bfChange}%` : '—',
              color: bfChange ? (+bfChange<0?t.green:t.red) : t.textMuted, hidden: clientRecord != null && !clientRecord.show_body_metrics },
            { label:'Entries', val: metrics.length, color:t.purple },
          ].filter((s:any) => !s.hidden).map(s => (
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
            {(!(clientRecord != null && !clientRecord.show_body_metrics) ? METRIC_GROUPS : METRIC_GROUPS.filter(g => g.key === 'weight')).map((g,i) => (
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


      {/* Daily Pulse Charts */}
      {pulseHistory.length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:800 }}>Morning Pulse</div>
              <div style={{ fontSize:12, color:t.textMuted, marginTop:2 }}>Sleep & energy trends over time</div>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {[30,60,90].map(d => (
                <button key={d} onClick={()=>setPulseTimeframe(d)}
                  style={{ padding:'4px 10px', borderRadius:8, border:'1px solid '+(pulseTimeframe===d?t.teal:t.border),
                    background:pulseTimeframe===d?t.teal+'20':'transparent',
                    color:pulseTimeframe===d?t.teal:t.textMuted,
                    fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {d}d
                </button>
              ))}
            </div>
          </div>

          {/* Sleep & Energy line chart */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'16px 8px 8px', marginBottom:12 }}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart
                data={pulseHistory.slice(-pulseTimeframe).map((d: PulseEntry) => ({
                  date: new Date(d.checkin_date+'T00:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}),
                  sleep: d.sleep_quality,
                  energy: d.energy_score,
                }))}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
                <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:9 }} axisLine={false} tickLine={false}
                  interval={Math.floor(pulseHistory.slice(-pulseTimeframe).length / 5)} />
                <YAxis domain={[0,5]} ticks={[1,2,3,4,5]} tick={{ fill:t.textMuted, fontSize:9 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text, fontSize:12 }} />
                <Legend wrapperStyle={{ paddingTop:8, color:t.textMuted, fontSize:11 }} />
                <Line type="monotone" dataKey="sleep" name="🌙 Sleep" stroke={t.purple} strokeWidth={2} dot={false} connectNulls />
                <Line type="monotone" dataKey="energy" name="⚡ Energy" stroke={t.yellow} strokeWidth={2} dot={false} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Mood strip */}
          {(() => {
            const recent = pulseHistory.slice(-pulseTimeframe)
            const withMood = recent.filter((d: PulseEntry) => d.mood_emoji)
            if (!withMood.length) return null
            return (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'12px 14px' }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:10 }}>Mood Log</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                  {withMood.slice(-30).map((d: PulseEntry, i:number) => (
                    <div key={i} title={d.checkin_date} style={{ fontSize:18, lineHeight:1 }}>{d.mood_emoji}</div>
                  ))}
                </div>
              </div>
            )
          })()}
        </div>
      )}
      </>)}

      {/* Progress Photos */}
      {clientRecord?.show_progress_photos !== false && (
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
                <button onClick={()=>setLightbox({ compare: true, photos: [compareSelection[0], compareSelection[1]] })}
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
                  {p.signedUrl && (
                    <div style={{ position:'relative', width:'100%', aspectRatio:'3 / 4' }}>
                      <img
                        src={p.signedUrl}
                        alt={`${p.angle?.replace('_',' ') || 'Progress'} photo from ${fmt(p.photo_date)}`}
                        style={{ objectFit:'cover', display:'block', width:'100%', height:'100%' }}
                      />
                    </div>
                  )}
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
      )}

      {/* Log Metrics Modal */}
      {logOpen && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:26, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>Log Metrics</div>
              <button onClick={()=>setLogOpen(false)} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
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
                    defaultValue={f.key==='date' ? localDateStr() : ''}
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
      {singlePhotoLightbox && (
        <div onClick={()=>setLightbox(null)} style={{ position:'fixed', inset:0, background:'#000d', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:20 }}>
          <div onClick={e=>e.stopPropagation()} style={{ maxWidth:500, width:'100%' }}>
            {singlePhotoLightbox.signedUrl && (
              <div style={{ position:'relative', width:'100%', aspectRatio:'3 / 4' }}>
                <img
                  src={singlePhotoLightbox.signedUrl}
                  alt={`${singlePhotoLightbox.angle?.replace('_',' ') || 'Progress'} photo from ${fmt(singlePhotoLightbox.photo_date)}`}
                  style={{ objectFit:'cover', display:'block', width:'100%', height:'100%', borderRadius:12 }}
                />
              </div>
            )}
            <div style={{ background:t.surface, borderRadius:'0 0 16px 16px', padding:'12px 16px' }}>
              <div style={{ fontWeight:700, color:t.teal, textTransform:'capitalize' }}>{singlePhotoLightbox.angle?.replace('_',' ')} — {fmt(singlePhotoLightbox.photo_date)}</div>
              {singlePhotoLightbox.weight_at_time && <div style={{ color:t.orange, fontSize:13 }}>{singlePhotoLightbox.weight_at_time} lbs</div>}
              {singlePhotoLightbox.caption && <div style={{ color:t.text, fontSize:13, marginTop:4 }}>{singlePhotoLightbox.caption}</div>}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox — side-by-side compare */}
      {isCompareLightbox(lightbox) && lightbox.photos.length === 2 && (
        <div onClick={()=>{ setLightbox(null); setCompareMode(false); setCompareSelection([]) }}
          style={{ position:'fixed', inset:0, background:'#000e', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', zIndex:200, padding:20, overflowY:'auto' }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:'100%', maxWidth:900 }}>
            <div style={{ fontSize:16, fontWeight:800, color:t.text, textAlign:'center', marginBottom:16 }}>📸 Photo Comparison</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:12 }}>
              {lightbox.photos.map((p: ProgressPhoto, i: number) => (
                <div key={p.id} style={{ background:t.surface, borderRadius:16, overflow:'hidden', border:'2px solid '+(i===0 ? t.teal : t.purple) }}>
                  <div style={{ background:i===0 ? t.tealDim : t.purpleDim, padding:'8px 14px', fontSize:11, fontWeight:700, color:i===0?t.teal:t.purple, display:'flex', alignItems:'center', gap:6 }}>
                    <span>{i===0 ? '① Before' : '② After'}</span>
                    <span style={{ marginLeft:'auto', color:t.textMuted }}>
                      {p.weight_at_time ? `${p.weight_at_time} lbs · ` : ''}{fmt(p.photo_date)}
                    </span>
                  </div>
                  {p.signedUrl && (
                    <div style={{ position:'relative', width:'100%', minHeight:320, maxHeight:500 }}>
                      <img
                        src={p.signedUrl}
                        alt={`${p.angle?.replace('_',' ') || 'Progress'} photo from ${fmt(p.photo_date)}`}
                        style={{ objectFit:'cover', display:'block', width:'100%', height:'100%' }}
                      />
                    </div>
                  )}
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
    <ClientBottomNav />
    </>
  )
}