'use client'
import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import ClientBottomNav from '@/components/client/ClientBottomNav'
import ProgressPhotosViewer from '@/components/client/ProgressPhotosViewer'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'
import { alpha } from '@/lib/theme'
import { localDateStr } from '@/lib/date'

const t = {
  bg:"var(--bg)", surface:"var(--surface)", surfaceHigh:"var(--surface-high)", border:"var(--border)",
  text:"var(--text)", textMuted:"var(--text-muted)", textDim:"var(--text-dim)",
  green:"var(--green)", teal:"var(--teal)", tealDim:"var(--teal-dim)",
  blue:"var(--blue)", purple:"var(--purple)", purpleDim:"var(--purple-dim)",
  orange:"var(--orange)", pink:"var(--pink)",
  red:"var(--red)", yellow:"var(--yellow)",
}
const TIMEFRAMES = [
  { label:'1M', days:30 }, { label:'3M', days:90 },
  { label:'6M', days:180 }, { label:'1Y', days:365 }, { label:'All', days:9999 },
]
const METRIC_GROUPS = [
  { key:'weight',       label:'Weight',      color:t.teal,   fields:['weight'],                                    unit:'lbs',   habit:false },
  { key:'measurements', label:'Measurements',color:t.purple, fields:['waist','hips','chest','left_arm','right_arm'],unit:'in',    habit:false },
  { key:'sleep',        label:'Sleep',       color:t.blue,   fields:['sleep'],                                     unit:'hrs',   habit:true  },
  { key:'steps',        label:'Steps',       color:t.green,  fields:['steps'],                                     unit:'steps', habit:true  },
  { key:'water',        label:'Water',       color:t.teal,   fields:['water'],                                     unit:'oz',    habit:true  },
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

export default function ClientProgressPage() {
  const supabase = useMemo(() => createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ), [])
  const [clientRecord, setClientRecord] = useState<ClientRecord | null>(null)
  const [clientProfileId, setClientProfileId] = useState<string | null>(null)
  const [photoRefreshKey, setPhotoRefreshKey] = useState(0)
  const [metrics, setMetrics] = useState<MetricEntry[]>([])
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[2])
  const [activeGroupIdx, setActiveGroup] = useState(0)
  const [loading, setLoading] = useState(true)
  const [logOpen,        setLogOpen]        = useState<'none'|'weight'|'measurements'>('none')
  const [photoOpen, setPhotoOpen] = useState(false)
  const [logForm, setLogForm] = useState<Record<string,string>>({})
  const [photoForm, setPhotoForm] = useState({ angle:'front', caption:'', weight_at_time:'' })
  const [photoFile, setPhotoFile] = useState<File|null>(null)
  const [saving, setSaving] = useState(false)
  const [pulseHistory, setPulseHistory] = useState<PulseEntry[]>([])
  const [habitLogs,    setHabitLogs]    = useState<Record<string, Record<string,number>>>({}) // date → {sleep,steps,water}
  const [pulseTimeframe, setPulseTimeframe] = useState(30)
  const [journalEntries, setJournalEntries] = useState<{id:string,entry_date:string,content:string,is_private:boolean}[]>([])
  const [expandedEntry, setExpandedEntry] = useState<string|null>(null)
  const [activeGoals, setActiveGoals] = useState<{id:string,title:string,description:string|null,type:string,status:string,current_value:number|null,target_value:number|null,unit:string|null,deadline:string|null}[]>([])
  const [suggestGoalOpen,   setSuggestGoalOpen]   = useState(false)
  const [suggestGoalText,   setSuggestGoalText]   = useState('')
  const [suggestGoalSaving, setSuggestGoalSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void (async () => {
        const { data:{ user } } = await supabase.auth.getUser()
        if (!user) return
        setClientProfileId(user.id)
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

    const [{ data: mData }, { data: pulseData }, { data: hData }, { data: jData }, { data: goalsData }] = await Promise.all([
      supabase.from('metrics').select('*').eq('client_id', clientRecord.id)
        .gte('logged_date', dateStr).order('logged_date'),
      supabase.from('daily_checkins').select('checkin_date,sleep_quality,energy_score,mood_emoji')
        .eq('client_id', clientRecord.id)
        .order('checkin_date', { ascending: true })
        .limit(90),
      supabase.from('habit_logs')
        .select('logged_date, value, habit:habits(label, unit)')
        .eq('client_id', clientRecord.id)
        .gte('logged_date', dateStr)
        .order('logged_date'),
      supabase.from('journal_entries')
        .select('id, entry_date, content, is_private')
        .eq('client_id', user.id)
        .order('entry_date', { ascending: false })
        .limit(60),
      supabase.from('client_goals')
        .select('id,title,description,type,status,current_value,target_value,unit,deadline')
        .eq('client_id', clientRecord.id)
        .in('status', ['active','completed'])
        .order('created_at', { ascending: false }),
    ])

    // Aggregate habit logs by date — average multiple entries per day, classify by keyword
    const byDate: Record<string, Record<string, number[]>> = {}
    for (const row of (hData || []) as any[]) {
      const label = (row.habit?.label || '').toLowerCase()
      const key = label.includes('sleep') ? 'sleep'
        : label.includes('step') ? 'steps'
        : label.includes('water') || label.includes('drink') ? 'water'
        : null
      if (!key) continue
      const d = row.logged_date
      if (!byDate[d]) byDate[d] = {}
      if (!byDate[d][key]) byDate[d][key] = []
      byDate[d][key].push(Number(row.value))
    }
    const habitByDate: Record<string, Record<string,number>> = {}
    for (const [d, keys] of Object.entries(byDate)) {
      habitByDate[d] = {}
      for (const [k, vals] of Object.entries(keys)) {
        habitByDate[d][k] = Math.round((vals.reduce((a,b)=>a+b,0) / vals.length) * 10) / 10
      }
    }
    setMetrics((mData || []) as MetricEntry[])
    setHabitLogs(habitByDate)
    setPulseHistory((pulseData || []) as PulseEntry[])
    setJournalEntries((jData || []) as {id:string,entry_date:string,content:string,is_private:boolean}[])
    setActiveGoals((goalsData || []) as any[])
  }, [clientRecord, supabase, timeframe])

  useEffect(() => {
    const timeoutId = setTimeout(() => { void loadData() }, 0)
    return () => clearTimeout(timeoutId)
  }, [loadData])

  const first = metrics[0], last = metrics[metrics.length-1]
  // Current Weight + Change need the most-recent / oldest entries that
  // ACTUALLY have a weight value. Walking metrics[length-1] alone breaks
  // when the latest row is a measurements-only log (arms but no weigh-in)
  // and renders "—" even though earlier rows have weights.
  const weightSeries = (metrics as Array<MetricEntry & { weight?: number | string | null }>).filter(m => m.weight != null && String(m.weight).trim() !== '')
  const firstWeight = weightSeries[0]
  const lastWeight  = weightSeries[weightSeries.length - 1]
  const weightChange = firstWeight && lastWeight ? (Number(lastWeight.weight) - Number(firstWeight.weight)).toFixed(1) : null
  const latestPulse = pulseHistory[pulseHistory.length - 1]

  const activeGroup = METRIC_GROUPS[activeGroupIdx]

  // Build unified chart data — habit groups use habitLogs, metric groups use metrics
  const chartData = useMemo(() => {
    if (activeGroup.habit) {
      return Object.entries(habitLogs)
        .filter(([, vals]) => vals[activeGroup.fields[0]] != null)
        .sort((a, b) => a[0].localeCompare(b[0]))  // sort on raw YYYY-MM-DD before formatting
        .map(([date, vals]) => ({ date: fmt(date), [activeGroup.fields[0]]: vals[activeGroup.fields[0]] }))
    }
    return metrics
      .slice()
      .sort((a, b) => a.logged_date.localeCompare(b.logged_date))  // ensure chronological
      .map(m => ({
        date: fmt(m.logged_date),
        ...activeGroup.fields.reduce<Record<string, number>>((acc, f) => {
          const value = m[f as keyof MetricEntry]
          if (value != null) acc[f] = parseFloat(String(value))
          return acc
        }, {})
      }))
  }, [activeGroup, metrics, habitLogs])

  // Running average for current group over the selected timeframe
  const runningAvg = useMemo(() => {
    if (!chartData.length) return null
    const field = activeGroup.fields[0]
    const vals = chartData.map(d => (d as unknown as Record<string,number>)[field]).filter((v): v is number => v != null)
    if (!vals.length) return null
    return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(
      activeGroup.unit === 'steps' ? 0 : 1
    )
  }, [chartData, activeGroup])

  async function suggestGoal() {
    if (!suggestGoalText.trim() || !clientRecord) return
    setSuggestGoalSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      // Send as a message to coach — simplest path, no separate table needed
      const { data: coachData } = await supabase.from('clients')
        .select('coach_id').eq('id', clientRecord.id).single()
      if (coachData?.coach_id) {
        await supabase.from('messages').insert({
          sender_id: user.id,
          recipient_id: coachData.coach_id,
          content: `💡 Goal suggestion: ${suggestGoalText.trim()}`,
        })
      }
    }
    setSuggestGoalText('')
    setSuggestGoalOpen(false)
    setSuggestGoalSaving(false)
  }

  async function saveMetric() {
    if (!clientRecord) return
    setSaving(true)
    const payload: Record<string, number | string> = { client_id: clientRecord.id, logged_date: logForm.date||localDateStr() }
    ;['weight','waist','hips','chest','left_arm','right_arm','neck','shoulders','calves']
      .forEach(f => { if (logForm[f]) payload[f]=parseFloat(logForm[f]) })
    if (logForm.notes) payload.notes = logForm.notes
    await supabase.from('metrics').insert(payload)
    setLogOpen('none'); setLogForm({}); setSaving(false); loadData()
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
    setPhotoForm({ angle:'front', caption:'', weight_at_time:'' })
    setPhotoRefreshKey(k => k + 1)
    loadData()
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
          {clientRecord?.show_progress_photos !== false && <button onClick={()=>setPhotoOpen(true)} style={{ background:alpha(t.purple, 13), color:t.purple, border:'1px solid '+alpha(t.purple, 27),
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            📸 Add Photo
          </button>}
          <button onClick={()=>setLogOpen('weight')} style={{ background:t.teal, color:'#000', border:'none',
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            + Log Weight
          </button>
          <button onClick={()=>setLogOpen('measurements')} style={{ background:t.surfaceHigh, color:t.text, border:`1px solid ${t.border}`,
            borderRadius:10, padding:'9px 16px', fontWeight:700, cursor:'pointer', fontSize:13 }}>
            + Log Measurements
          </button>
        </div>
      </div>

      {/* ── GOALS ── */}
      {activeGoals.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.08em', marginBottom:10 }}>My Goals</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {activeGoals.map((goal) => {
              const pct = goal.target_value && goal.current_value != null
                ? Math.min(100, Math.round((goal.current_value / goal.target_value) * 100))
                : null
              const isComplete = goal.status === 'completed' || (pct !== null && pct >= 100)
              const color = isComplete ? t.teal : goal.type === 'consistency' ? t.orange : goal.type === 'bodyweight' ? t.purple : t.yellow
              const icon = isComplete ? '🏆' : goal.type === 'consistency' ? '🔥' : goal.type === 'bodyweight' ? '⚖️' : '🏋️'
              const today = new Date(); today.setHours(0,0,0,0)
              const daysLeft = goal.deadline
                ? Math.ceil((new Date(goal.deadline).getTime() - today.getTime()) / 86400000)
                : null
              return (
                <div key={goal.id} style={{ background:t.surface, border:`1px solid ${isComplete ? alpha(t.teal, 25) : alpha(color, 19)}`, borderRadius:13, padding:'12px 14px' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom: pct !== null ? 8 : 0 }}>
                    <div style={{ width:32, height:32, borderRadius:9, background:alpha(color, 9), border:`1px solid ${alpha(color, 25)}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                      {icon}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color: isComplete ? t.teal : t.text }}>{goal.title}</div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                        {goal.target_value != null && goal.unit
                          ? `${Number(goal.current_value ?? 0).toFixed(goal.type === 'bodyweight' ? 1 : 0)} / ${goal.target_value} ${goal.unit}`
                          : goal.description || ''}
                        {daysLeft !== null && !isComplete && (
                          <span style={{ marginLeft:6, color: daysLeft <= 7 ? t.red : t.textMuted }}>
                            · {daysLeft > 0 ? `${daysLeft}d left` : 'Due today'}
                          </span>
                        )}
                      </div>
                    </div>
                    {isComplete && <span style={{ fontSize:11, fontWeight:800, color:t.teal }}>Done ✓</span>}
                  </div>
                  {pct !== null && (
                    <div>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginBottom:4 }}>
                        <span>Progress</span>
                        <span style={{ fontWeight:700, color: pct >= 100 ? t.teal : color }}>{pct}%</span>
                      </div>
                      <div style={{ height:6, borderRadius:4, background:t.surfaceHigh, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, borderRadius:4, background: pct >= 100 ? t.teal : `linear-gradient(90deg,${color},${alpha(color, 67)})`, transition:'width 0.6s ease' }}/>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          {suggestGoalOpen ? (
            <div style={{ marginTop:10, display:'flex', gap:8 }}>
              <input value={suggestGoalText} onChange={e=>setSuggestGoalText(e.target.value)}
                placeholder="e.g. Hit 225lb squat, Run a 5K..."
                style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+alpha(t.teal, 31), borderRadius:10, padding:'9px 12px', fontSize:13, color:t.text, fontFamily:'system-ui,sans-serif', outline:'none' }}/>
              <button onClick={suggestGoal} disabled={!suggestGoalText.trim()||suggestGoalSaving}
                style={{ background:t.teal, border:'none', borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:'system-ui,sans-serif' }}>
                {suggestGoalSaving ? '...' : 'Send'}
              </button>
              <button onClick={()=>setSuggestGoalOpen(false)}
                style={{ background:'transparent', border:'1px solid '+t.border, borderRadius:10, padding:'9px 12px', fontSize:12, color:t.textMuted, cursor:'pointer', fontFamily:'system-ui,sans-serif' }}>✕</button>
            </div>
          ) : (
            <button onClick={()=>setSuggestGoalOpen(true)}
              style={{ marginTop:10, width:'100%', background:'transparent', border:'1px dashed '+t.border, borderRadius:10, padding:'9px', fontSize:12, fontWeight:600, color:t.textMuted, cursor:'pointer', fontFamily:'system-ui,sans-serif' }}>
              + Suggest a goal to your coach
            </button>
          )}
        </div>
      )}

      {/* Stats summary */}
      {metrics.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:10, marginBottom:20 }}>
          {[
            { label:'Current Weight', val: lastWeight?.weight ? `${lastWeight.weight} lbs` : '—', color:t.teal },
            { label:'Change', val: weightChange ? `${+weightChange>0?'+':''}${weightChange} lbs` : '—',
              color: weightChange ? (+weightChange<0?t.green:t.red) : t.textMuted },
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
        {/* Metric tabs — horizontally scrollable on mobile */}
        <div style={{ overflowX:'auto', WebkitOverflowScrolling:'touch', marginBottom:10, marginLeft:-20, marginRight:-20, paddingLeft:20, paddingRight:20 }}>
          <div style={{ display:'flex', gap:6, width:'max-content' }}>
            {(clientRecord == null || clientRecord.show_body_metrics
              ? METRIC_GROUPS
              : METRIC_GROUPS.filter(g => g.key === 'weight' || g.habit)
            ).map((g,i) => (
              <button key={g.key} onClick={()=>setActiveGroup(i)}
                style={{ padding:'6px 12px', borderRadius:20, border:'1px solid', whiteSpace:'nowrap',
                  borderColor: activeGroupIdx===i?g.color:t.border,
                  background: activeGroupIdx===i?alpha(g.color, 13):'transparent',
                  color: activeGroupIdx===i?g.color:t.textMuted,
                  cursor:'pointer', fontSize:12, fontWeight:600, flexShrink:0 }}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
        {/* Timeframe row */}
        <div style={{ display:'flex', gap:4, marginBottom:16 }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf.label} onClick={()=>setTimeframe(tf)}
              style={{ padding:'5px 10px', borderRadius:8, border:'1px solid',
                borderColor: timeframe.label===tf.label?t.teal:t.border,
                background: timeframe.label===tf.label?alpha(t.teal, 13):'transparent',
                color: timeframe.label===tf.label?t.teal:t.textMuted,
                cursor:'pointer', fontSize:11, fontWeight:700 }}>
              {tf.label}
            </button>
          ))}
        </div>

        {/* Running average stat */}
        {runningAvg && (
          <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:14, padding:'10px 14px', background:alpha(activeGroup.color, 7), border:`1px solid ${alpha(activeGroup.color, 19)}`, borderRadius:12 }}>
            <div>
              <div style={{ fontSize:10, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em' }}>{timeframe.label} Average</div>
              <div style={{ fontSize:22, fontWeight:900, color:activeGroup.color }}>{runningAvg} <span style={{ fontSize:13, fontWeight:600 }}>{activeGroup.unit}</span></div>
            </div>
            <div style={{ fontSize:12, color:t.textMuted }}>
              {chartData.length} {chartData.length === 1 ? 'entry' : 'entries'} logged
            </div>
          </div>
        )}

        {chartData.length === 0 ? (
          <div style={{ textAlign:'center', color:t.textMuted, padding:60, fontSize:14 }}>
            {activeGroup.habit
              ? `No ${activeGroup.label.toLowerCase()} logged yet — track it in your daily habits! 💪`
              : 'No data yet — log your first entry to start tracking! 💪'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top:5, right:20, left:0, bottom:5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border} />
              <XAxis dataKey="date" tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:t.textMuted, fontSize:11 }} axisLine={false} tickLine={false} domain={['auto','auto']} />
              <Tooltip contentStyle={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, color:t.text }} />
              <Legend wrapperStyle={{ paddingTop:12, color:t.textMuted, fontSize:12 }} />
              {METRIC_GROUPS[activeGroupIdx].fields.map(f => (
                <Line key={f} type="monotone" dataKey={f}
                  stroke={METRIC_GROUPS[activeGroupIdx].fields.length===1 ? METRIC_GROUPS[activeGroupIdx].color : MCOLORS[f]||t.teal}
                  strokeWidth={2.5} dot={{ r:4 }} connectNulls activeDot={{ r:6 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
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
                    background:pulseTimeframe===d?alpha(t.teal, 13):'transparent',
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

      {/* Progress Photos */}
      {clientRecord?.show_progress_photos !== false && clientProfileId && (
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10, flexWrap:'wrap', gap:8 }}>
            <div style={{ fontSize:13, fontWeight:700, color:t.textMuted }}>PROGRESS PHOTOS</div>
          </div>
          <ProgressPhotosViewer
            supabase={supabase}
            clientProfileId={clientProfileId}
            t={{
              surface: t.surface,
              surfaceHigh: t.surfaceHigh,
              border: t.border,
              text: t.text,
              textMuted: t.textMuted,
              textDim: t.textDim,
              teal: t.teal,
              tealDim: t.tealDim,
              purple: t.purple,
              purpleDim: t.purpleDim,
              orange: t.orange,
              green: t.green,
              red: t.red,
            }}
            refreshKey={photoRefreshKey}
          />
        </div>
      )}

      {/* Log Metrics Modal */}
      {/* Log Weight Modal */}
      {logOpen === 'weight' && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:26, width:'100%', maxWidth:360 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>⚖️ Log Weight</div>
              <button onClick={()=>setLogOpen('none')} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[
                { key:'date', label:'Date', type:'date' },
                { key:'weight', label:'Weight (lbs)' },
                { key:'notes', label:'Notes (optional)', type:'text' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'number'} step="0.1"
                    defaultValue={f.key==='date' ? localDateStr() : ''}
                    onChange={e => setLogForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                      borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' as const }} />
                </div>
              ))}
            </div>
            <button onClick={saveMetric} disabled={saving}
              style={{ marginTop:16, width:'100%', background:t.teal, color:'#000', border:'none',
                borderRadius:10, padding:'12px', fontWeight:800, cursor:'pointer', fontSize:14 }}>
              {saving ? 'Saving...' : 'Save Weight'}
            </button>
          </div>
        </div>
      )}

      {/* Log Measurements Modal */}
      {logOpen === 'measurements' && (
        <div style={{ position:'fixed', inset:0, background:'#000a', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100, padding:20 }}>
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:26, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div style={{ fontWeight:800, fontSize:17 }}>📏 Log Measurements</div>
              <button onClick={()=>setLogOpen('none')} style={{ background:'none', border:'none', color:t.textMuted, fontSize:20, cursor:'pointer' }}>✕</button>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12 }}>
              {[
                { key:'date', label:'Date', type:'date', full:true },
                { key:'waist',       label:'Waist (in)'      },
                { key:'hips',        label:'Hips (in)'       },
                { key:'chest',       label:'Chest (in)'      },
                { key:'left_arm',    label:'Left Arm (in)'   },
                { key:'right_arm',   label:'Right Arm (in)'  },
                { key:'notes', label:'Notes (optional)', type:'text', full:true },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.full?'1/-1':'auto' }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'number'} step="0.1"
                    defaultValue={f.key==='date' ? localDateStr() : ''}
                    onChange={e => setLogForm(p => ({ ...p, [f.key]: e.target.value }))}
                    style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border,
                      borderRadius:8, padding:'9px 12px', color:t.text, fontSize:13, boxSizing:'border-box' as const }} />
                </div>
              ))}
            </div>
            <button onClick={saveMetric} disabled={saving}
              style={{ marginTop:16, width:'100%', background:t.teal, color:'#000', border:'none',
                borderRadius:10, padding:'12px', fontWeight:800, cursor:'pointer', fontSize:14 }}>
              {saving ? 'Saving...' : 'Save Measurements'}
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
                background: photoFile ? alpha(t.green, 7) : 'transparent' }}>
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

    </div>
        {/* Journal History */}
        {journalEntries.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>✍️ Journal</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {journalEntries.map(entry => (
                <div key={entry.id}
                  onClick={()=>setExpandedEntry(expandedEntry===entry.id ? null : entry.id)}
                  style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 14px', cursor:'pointer' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: expandedEntry===entry.id ? 10 : 0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:t.teal }}>
                      {new Date(entry.entry_date+'T00:00:00').toLocaleDateString([], { weekday:'short', month:'long', day:'numeric' })}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontSize:10, color:entry.is_private ? t.textMuted : t.teal, fontWeight:600 }}>
                        {entry.is_private ? '🔒 Private' : '👁 Shared'}
                      </span>
                      <span style={{ fontSize:10, color:t.textMuted }}>{expandedEntry===entry.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {expandedEntry !== entry.id && (
                    <div style={{ fontSize:12, color:t.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
                      {entry.content}
                    </div>
                  )}
                  {expandedEntry === entry.id && (
                    <div style={{ fontSize:13, color:t.textDim, lineHeight:1.65, whiteSpace:'pre-wrap' as const }}>
                      {entry.content}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

    <ClientBottomNav />
    </>
  )
}