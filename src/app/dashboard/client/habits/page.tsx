'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function getWeekDates() {
  const today = new Date()
  const day = today.getDay()
  const sunday = new Date(today); sunday.setDate(today.getDate() - day)
  return Array.from({ length:7 }, (_, i) => {
    const d = new Date(sunday); d.setDate(sunday.getDate() + i)
    return d.toISOString().split('T')[0]
  })
}

export default function ClientHabits() {
  const [habits,   setHabits]   = useState<any[]>([])
  const [logs,     setLogs]     = useState<Record<string,boolean>>({})
  const [loading,  setLoading]  = useState(true)
  const [clientId, setClientId] = useState<string|null>(null)
  const router   = useRouter()
  const supabase = createClient()
  const weekDates = getWeekDates()
  const todayStr  = new Date().toISOString().split('T')[0]

  useEffect(() => { load() }, [])

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: clientData } = await supabase
      .from('clients').select('id').eq('profile_id', user.id).single()
    if (!clientData) { setLoading(false); return }
    setClientId(clientData.id)

    const { data: habitList } = await supabase
      .from('habits').select('*')
      .eq('client_id', clientData.id).eq('active', true)
      .order('created_at')
    setHabits(habitList || [])

    // Load logs for this week
    const { data: logList } = await supabase
      .from('habit_logs').select('habit_id, logged_date, completed')
      .eq('client_id', clientData.id)
      .in('logged_date', weekDates)
    const map: Record<string,boolean> = {}
    for (const l of logList || []) {
      map[`${l.habit_id}::${l.logged_date}`] = l.completed
    }
    setLogs(map)
    setLoading(false)
  }

  const toggleLog = async (habitId: string, date: string) => {
    if (!clientId) return
    const key = `${habitId}::${date}`
    const current = logs[key] || false
    const next = !current
    setLogs(prev => ({ ...prev, [key]: next }))

    // Upsert log
    await supabase.from('habit_logs').upsert({
      habit_id:    habitId,
      client_id:   clientId,
      logged_date: date,
      completed:   next,
    }, { onConflict: 'habit_id,logged_date' })
  }

  const streakCount = (habitId: string) => {
    let streak = 0
    const today = new Date()
    for (let i = 0; i < 30; i++) {
      const d = new Date(today); d.setDate(today.getDate() - i)
      const ds = d.toISOString().split('T')[0]
      if (logs[`${habitId}::${ds}`]) streak++
      else break
    }
    return streak
  }

  const weekCompletion = (habitId: string) => {
    const completed = weekDates.filter(d => logs[`${habitId}::${d}`]).length
    return { completed, total: 7, pct: Math.round((completed/7)*100) }
  }

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading habits...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 20px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/client')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:700 }}>✅ Habit Tracker</div>
        </div>

        <div style={{ maxWidth:700, margin:'0 auto', padding:24 }}>

          {/* Week header */}
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:13, fontWeight:800 }}>This Week</div>
              <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                {new Date(weekDates[0]).toLocaleDateString([], { month:'short', day:'numeric' })} – {new Date(weekDates[6]).toLocaleDateString([], { month:'short', day:'numeric' })}
              </div>
            </div>
            <div style={{ fontSize:12, color:t.teal, fontWeight:700 }}>
              Tap a day to mark complete ✓
            </div>
          </div>

          {habits.length === 0 ? (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'56px', textAlign:'center' }}>
              <div style={{ fontSize:32, marginBottom:12 }}>🌱</div>
              <div style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>No habits assigned yet</div>
              <div style={{ fontSize:13, color:t.textMuted }}>Your coach will assign habits for you to track here.</div>
            </div>
          ) : habits.map(habit => {
            const wc = weekCompletion(habit.id)
            const streak = streakCount(habit.id)
            const color = habit.color || t.teal
            return (
              <div key={habit.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:18, marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                  <div style={{ fontSize:22 }}>{habit.icon || '✅'}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800 }}>{habit.label}</div>
                    {habit.description && <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>{habit.description}</div>}
                    {habit.target && <div style={{ fontSize:11, color:color, marginTop:2 }}>Target: {habit.target} {habit.unit||''}</div>}
                  </div>
                  <div style={{ textAlign:'right' }}>
                    {streak > 0 && <div style={{ fontSize:11, fontWeight:800, color:t.orange }}>🔥 {streak} day streak</div>}
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{wc.completed}/7 this week</div>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height:4, background:t.surfaceHigh, borderRadius:2, marginBottom:12, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:wc.pct+'%', background:`linear-gradient(90deg,${color}88,${color})`, borderRadius:2, transition:'width 0.3s' }} />
                </div>

                {/* Day buttons */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
                  {weekDates.map((date, i) => {
                    const done = logs[`${habit.id}::${date}`] || false
                    const isToday = date === todayStr
                    const isPast = date < todayStr
                    const isFuture = date > todayStr
                    return (
                      <button key={date} onClick={()=>!isFuture && toggleLog(habit.id, date)}
                        style={{
                          background: done ? color : isToday ? t.surfaceHigh : 'transparent',
                          border: '1px solid '+(done ? color+'60' : isToday ? color+'40' : t.border),
                          borderRadius:10, padding:'8px 4px', textAlign:'center',
                          cursor: isFuture ? 'default' : 'pointer',
                          opacity: isFuture ? 0.35 : 1, transition:'all 0.15s',
                        }}>
                        <div style={{ fontSize:9, fontWeight:700, color: done?'#000':isToday?color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.04em' }}>{DAYS[i]}</div>
                        <div style={{ fontSize:14, marginTop:2 }}>{done ? '✓' : isToday ? '•' : ''}</div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
