'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'
import RichMessageThread from '@/components/messaging/RichMessageThread'
import NotificationBell from '@/components/notifications/NotificationBell'
import NutritionTab from './nutrition-tab'

const TENOR_KEY = process.env.NEXT_PUBLIC_TENOR_KEY || ''

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  yellow:"#eab308", yellowDim:"#eab30815", green:"#22c55e", greenDim:"#22c55e15",
  pink:"#f472b6", pinkDim:"#f472b615",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const NAV = [
  { id:'today',     icon:'home',      label:'Home'      },
  { id:'nutrition', icon:'nutrition', label:'Nutrition' },
  { id:'resources', icon:'resources', label:'Resources' },
  { id:'messages',  icon:'messages',  label:'Messages'  },
  { id:'metrics',   icon:'metrics',   label:'Metrics'   },
]

// SVG icons — cleaner than emoji for bottom nav
const NavIcon = ({ id, active }: { id: string, active: boolean }) => {
  const c = active ? '#00c9b1' : '#5a5a78'
  const s = { width:22, height:22 } as const
  if (id === 'home' || id === 'today') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active?2.2:1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><polyline points="9 21 9 12 15 12 15 21"/>
    </svg>
  )
  if (id === 'resources') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active?2.2:1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
    </svg>
  )
  if (id === 'nutrition') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active?2.2:1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
    </svg>
  )
  if (id === 'messages') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active?2.2:1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
    </svg>
  )
  if (id === 'metrics') return (
    <svg {...s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={active?2.2:1.8} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  )
  return null
}

export default function ClientDashboard() {
  return (
    <Suspense fallback={null}>
      <ClientDashboardInner />
    </Suspense>
  )
}

function ClientDashboardInner() {
  const [profile,      setProfile]      = useState<any>(null)
  const [clientRecord, setClientRecord] = useState<any>(null)
  const [coachProfileId, setCoachProfileId] = useState<string|null>(null)
  const [habits,       setHabits]       = useState<any[]>([])
  const [habitLogs,    setHabitLogs]    = useState<Record<string,number>>({})
  const [milestones,   setMilestones]   = useState<any[]>([])
  const [recentPRs,    setRecentPRs]    = useState<any[]>([])
  const [workoutLogs,  setWorkoutLogs]  = useState<any[]>([])
  const [nextSession,  setNextSession]  = useState<any>(null)
  const [pendingCheckins, setPendingCheckins] = useState<any[]>([])
  const [loading,      setLoading]      = useState(true)
  const [activeNav,    setActiveNav]    = useState('today')
  const [plusOpen,     setPlusOpen]     = useState(false)
  const [logPopup,     setLogPopup]     = useState<{ habit: any, draft: string } | null>(null)
  const [messagesView, setMessagesView] = useState<'hub'|'coach'>('hub')
  // Habit daily refresh tracking
  const [habitLoadDate, setHabitLoadDate] = useState('')
  // Mental health check-in
  const [mentalCheckin,    setMentalCheckin]    = useState({ stress:5, mood:5, energy:5 })
  const [mentalSubmitted,  setMentalSubmitted]  = useState(false)
  const [mentalCollapsed,  setMentalCollapsed]  = useState(false)
  // Journal
  const [journalText,      setJournalText]      = useState('')
  const [journalPrivate,   setJournalPrivate]   = useState(true)
  const [journalSaved,     setJournalSaved]     = useState(false)
  const [journalSaving,    setJournalSaving]    = useState(false)
  const [journalDate,      setJournalDate]      = useState('')
  const [pastEntries,      setPastEntries]      = useState<any[]>([])
  const [pastEntriesOpen,  setPastEntriesOpen]  = useState(false)
  const router       = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const today    = new Date().toISOString().split('T')[0]

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single()
      setProfile(prof)

      const { data: clientData } = await supabase
        .from('clients')
        .select('*')
        .eq('profile_id', user.id)
        .eq('active', true)
        .single()
      setClientRecord(clientData)

      if (clientData) {
        // Fetch coach's profile ID for messaging
        const { data: coachProf } = await supabase
          .from('profiles').select('id').eq('id', clientData.coach_id).single()
        if (coachProf) setCoachProfileId(coachProf.id)
        const { data: habitData } = await supabase
          .from('habits')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('active', true)
        setHabits(habitData || [])

        const { data: habitLogData } = await supabase
          .from('habit_logs')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('logged_date', today)
        const logMap: Record<string,number> = {}
        habitLogData?.forEach((l:any) => { logMap[l.habit_id] = l.value })
        setHabitLogs(logMap)
        setHabitLoadDate(today)

        const { data: milestoneData } = await supabase
          .from('milestones')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('seen', false)
          .order('created_at', { ascending: false })
        setMilestones(milestoneData || [])

        const { data: prData } = await supabase
          .from('personal_records')
          .select('*, exercise:exercises(name)')
          .eq('client_id', clientData.id)
          .order('logged_date', { ascending: false })
          .limit(3)
        setRecentPRs(prData || [])

        const { data: wlData } = await supabase
          .from('workout_logs')
          .select('*')
          .eq('client_id', clientData.id)
          .order('started_at', { ascending: false })
          .limit(5)
        setWorkoutLogs(wlData || [])

        // Today's workout session — only show if scheduled for today or already in progress
        const { data: nextSess } = await supabase
          .from('workout_sessions')
          .select('id, title, scheduled_date, status')
          .eq('client_id', clientData.id)
          .or(`scheduled_date.eq.${today},status.eq.in_progress`)
          .in('status', ['assigned', 'in_progress'])
          .order('scheduled_date', { ascending: true })
          .limit(1)
          .single()
        setNextSession(nextSess || null)

        // Pending check-in form assignments
        const { data: pendingCI } = await supabase
          .from('client_form_assignments')
          .select('id, note, form:onboarding_forms(title, is_checkin_type)')
          .eq('client_id', clientData.id)
          .eq('status', 'pending')
          .eq('onboarding_forms.is_checkin_type', true)
          .limit(3)
        setPendingCheckins((pendingCI || []).filter((a: any) => a.form?.is_checkin_type))

        // Load today's mental check-in if already submitted
        const { data: todayCheckin } = await supabase
          .from('daily_checkins')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('checkin_date', today)
          .single()
        if (todayCheckin) {
          setMentalCheckin({
            stress: todayCheckin.stress_score || 5,
            mood:   todayCheckin.mood_score   || 5,
            energy: todayCheckin.energy_score || 5,
          })
          setMentalSubmitted(true)
          setMentalCollapsed(true)
        }

        // Load today's journal entry if already written
        const { data: todayJournal } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('client_id', clientData.id)
          .eq('entry_date', today)
          .single()
        if (todayJournal) {
          setJournalText(todayJournal.body || '')
          setJournalPrivate(todayJournal.is_private ?? true)
          setJournalDate(today)
        }

        // Load past journal entries (last 30, excluding today)
        const { data: pastData } = await supabase
          .from('journal_entries')
          .select('*')
          .eq('client_id', clientData.id)
          .neq('entry_date', today)
          .order('entry_date', { ascending: false })
          .limit(30)
        setPastEntries(pastData || [])
      }

      setLoading(false)
    }
    load()

    // Read ?tab param from bottom nav (e.g. coming from Resources page)
    const tab = searchParams.get('tab')
    if (tab) setActiveNav(tab)

    // Midnight refresh — re-run when the date rolls over so Today tab stays fresh
    const now = new Date()
    const msUntilMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()
    const midnightTimer = setTimeout(() => { load() }, msUntilMidnight)
    return () => clearTimeout(midnightTimer)
  }, [])


  const logHabit = async (habitId: string, value: number) => {
    if (!clientRecord) return
    setHabitLogs(prev => ({ ...prev, [habitId]: value }))

    // Write to habit_logs (primary log)
    const existing = await supabase
      .from('habit_logs')
      .select('id')
      .eq('habit_id', habitId)
      .eq('client_id', clientRecord.id)
      .eq('logged_date', today)
      .single()
    if (existing.data) {
      await supabase.from('habit_logs').update({ value }).eq('id', existing.data.id)
    } else {
      await supabase.from('habit_logs').insert({ habit_id: habitId, client_id: clientRecord.id, logged_date: today, value })
    }

    // Mirror trackable numeric habits into daily_checkins for coach trend view
    const habit = habits.find((h:any) => h.id === habitId)
    if (habit && habit.habit_type !== 'check' && value > 0) {
      const labelKey = habit.label?.toLowerCase().trim()
      const columnMap: Record<string, string> = {
        'sleep':        'sleep_hours',
        'sleep hours':  'sleep_hours',
        'daily steps':  'steps',
        'steps':        'steps',
        'water':        'water_oz',
        'drink water':  'water_oz',
        'hydration':    'water_oz',
      }
      const col = Object.entries(columnMap).find(([k]) => labelKey?.includes(k))?.[1]
      if (col) {
        await supabase.from('daily_checkins').upsert({
          client_id:    clientRecord.id,
          checkin_date: today,
          [col]:        value,
        }, { onConflict: 'client_id,checkin_date' })
      }
    }
  }

  const dismissMilestone = async (id: string) => {
    await supabase.from('milestones').update({ seen: true }).eq('id', id)
    setMilestones(prev => prev.filter(m => m.id !== id))
  }

  const saveMentalCheckin = async () => {
    if (!clientRecord) return
    await supabase.from('daily_checkins').upsert({
      client_id: clientRecord.id,
      checkin_date: today,
      stress_score: mentalCheckin.stress,
      mood_score:   mentalCheckin.mood,
      energy_score: mentalCheckin.energy,
    }, { onConflict: 'client_id,checkin_date' })
    setMentalSubmitted(true)
    setTimeout(() => setMentalCollapsed(true), 800)
  }

  const saveJournal = async () => {
    if (!clientRecord || !journalText.trim()) return
    setJournalSaving(true)
    await supabase.from('journal_entries').upsert({
      client_id:  clientRecord.id,
      entry_date: today,
      body:       journalText.trim(),
      is_private: journalPrivate,
    }, { onConflict: 'client_id,entry_date' })
    setJournalDate(today)
    setJournalSaving(false)
    setJournalSaved(true)
    setTimeout(() => setJournalSaved(false), 2500)
    // Refresh past entries list
    const { data: pastData } = await supabase
      .from('journal_entries')
      .select('*')
      .eq('client_id', clientRecord.id)
      .neq('entry_date', today)
      .order('entry_date', { ascending: false })
      .limit(30)
    setPastEntries(pastData || [])
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  // Reset journal if the client keeps the app open past midnight
  useEffect(() => {
    if (journalDate && journalDate !== today) {
      setJournalText('')
      setJournalPrivate(true)
      setJournalSaved(false)
      setJournalDate(today)
    }
  }, [today, journalDate])

  // Reset habit logs if the client keeps the app open past midnight
  useEffect(() => {
    if (habitLoadDate && habitLoadDate !== today) {
      setHabitLogs({})
      setHabitLoadDate(today)
    }
  }, [today, habitLoadDate])

  if (loading) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
    </div>
  )

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        body{background:${t.bg};}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        @keyframes scaleIn{from{opacity:0;transform:scale(0.85);}to{opacity:1;transform:scale(1);}}
        .fade{animation:fadeUp 0.3s ease forwards;}
        .plus-action{animation:scaleIn 0.15s ease forwards;}
      `}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', flexDirection:'column', maxWidth:480, margin:'0 auto', position:'relative' }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 18px', display:'flex', alignItems:'center', height:52, flexShrink:0, position:'sticky', top:0, zIndex:10 }}>
          <div style={{ fontSize:15, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>SRG FIT</div>
          <div style={{ flex:1 }} />
          {/* Calendar & Settings quick access */}
          <button onClick={()=>router.push('/dashboard/client/calendar')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', padding:'6px', marginRight:4, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </button>
          {profile?.id && <NotificationBell userId={profile.id} accentColor={t.teal} />}
          <button onClick={()=>setActiveNav('billing')}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', padding:'6px 0 6px 6px', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
            </svg>
          </button>
        </div>

        {/* Main content — padded for bottom nav */}
        <div style={{ flex:1, overflowY: activeNav === 'messages' ? 'hidden' : 'auto', padding: activeNav === 'messages' ? 0 : '16px 16px 96px' }}>

          {/* Click-outside dismiss for + menu */}
          {plusOpen && <div onClick={()=>setPlusOpen(false)} style={{ position:'fixed', inset:0, zIndex:19 }} />}

          {/* ── TODAY TAB ── */}
          {activeNav === 'today' && <>

          {/* ── 1. GREETING ── */}
          <div style={{ marginBottom:20 }} className="fade">
            <div style={{ fontSize:23, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', lineHeight:1.2, marginBottom:3 }}>
              {getGreeting()}, {profile?.full_name?.split(' ')[0]} 👋
            </div>
            <div style={{ fontSize:12, color:t.textMuted }}>{new Date().toLocaleDateString([], { weekday:'long', month:'long', day:'numeric' })}</div>
          </div>

          {/* ── 2. RECENT WINS PLAQUE ── */}
          {(milestones.length > 0 || recentPRs.length > 0) && (
            <div className="fade" style={{ background:'linear-gradient(135deg,'+t.yellow+'18,'+t.orange+'0a)', border:'1px solid '+t.yellow+'35', borderRadius:16, padding:'14px 16px', marginBottom:14, position:'relative', overflow:'hidden' }}>
              <div style={{ position:'absolute', top:-10, right:-10, fontSize:64, opacity:0.06, lineHeight:1 }}>🏆</div>
              <div style={{ fontSize:11, fontWeight:800, color:t.yellow, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>🏆 Recent Wins</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {recentPRs.map((pr:any) => (
                  <div key={pr.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:t.yellow, flexShrink:0 }}/>
                    <div style={{ fontSize:13, fontWeight:700, color:t.text }}>New PR — {pr.exercise?.name}</div>
                    <div style={{ fontSize:12, fontWeight:800, color:t.yellow, marginLeft:'auto' }}>{pr.weight_pr} lbs 💪</div>
                  </div>
                ))}
                {milestones.map((m:any) => (
                  <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:t.orange, flexShrink:0 }}/>
                    <div style={{ fontSize:13, color:t.text, flex:1, lineHeight:1.4 }}>{m.message}</div>
                    <button onClick={()=>dismissMilestone(m.id)} style={{ fontSize:10, color:t.textMuted, background:'none', border:'none', cursor:'pointer', flexShrink:0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── 3. MENTAL HEALTH CHECK-IN ── */}
          <div className="fade" style={{ background:t.surface, border:'1px solid '+(mentalSubmitted?t.green+'40':t.border), borderRadius:16, overflow:'hidden', marginBottom:14 }}>
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.pink+')' }}/>
            <div style={{ padding:'14px 16px' }}>
              <button onClick={()=>setMentalCollapsed(c=>!c)} style={{ width:'100%', background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontFamily:"'DM Sans',sans-serif" }}>
                <div style={{ width:38, height:38, borderRadius:11, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>🧠</div>
                <div style={{ flex:1, textAlign:'left' as const }}>
                  <div style={{ fontSize:14, fontWeight:800, color:t.text }}>How are you feeling?</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>
                    {mentalSubmitted ? '✓ Logged today' : 'Stress · Mood · Energy'}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: mentalCollapsed?'rotate(-90deg)':'rotate(0deg)', transition:'transform 0.2s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {!mentalCollapsed && (
                <div style={{ marginTop:14 }}>
                  {([
                    { key:'stress', label:'😤 Stress', low:'Chill', high:'Maxed', color:t.red },
                    { key:'mood',   label:'😊 Mood',   low:'Low',   high:'Great', color:t.pink },
                    { key:'energy', label:'⚡ Energy',  low:'Drained',high:'Energized', color:t.yellow },
                  ] as const).map(({ key, label, low, high, color }) => (
                    <div key={key} style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:t.textDim }}>{label}</div>
                        <div style={{ fontSize:14, fontWeight:900, color }}>{mentalCheckin[key]}</div>
                      </div>
                      <input type="range" min={1} max={10} value={mentalCheckin[key]}
                        onChange={e=>setMentalCheckin(p=>({...p,[key]:+e.target.value}))}
                        style={{ width:'100%', accentColor:color, cursor:'pointer' }}/>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginTop:2 }}>
                        <span>1 — {low}</span><span>10 — {high}</span>
                      </div>
                    </div>
                  ))}
                  <button onClick={saveMentalCheckin}
                    style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', color:'#fff', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {mentalSubmitted ? '✓ Saved!' : 'Save Check-in'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 4. TODAY'S WORKOUT ── */}
          <div style={{ background:t.surface, border:'1px solid '+(nextSession ? t.border : t.border), borderRadius:16, overflow:'hidden', marginBottom:14 }} className="fade">
            <div style={{ height:3, background: nextSession ? 'linear-gradient(90deg,'+t.teal+','+t.orange+')' : 'linear-gradient(90deg,'+t.purple+','+t.teal+')' }}/>
            <div style={{ padding:'14px 16px' }}>
              {nextSession ? (
                <>
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:11, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>💪</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:14, fontWeight:800 }}>{nextSession.title}</div>
                      <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>
                        {nextSession.scheduled_date ? `Scheduled ${nextSession.scheduled_date}` : 'Ready when you are'}
                      </div>
                    </div>
                  </div>
                  <button onClick={()=>router.push(`/dashboard/client/workout/${nextSession.id}`)}
                    style={{ width:'100%', padding:'11px', borderRadius:11, border:'none', background:'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', color:'#000', fontSize:13, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Start Workout 💪
                  </button>
                </>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:11, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🛏️</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800 }}>Rest Day!</div>
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>Recovery is part of the program — enjoy it 💜</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── 5. TASKS / HABITS ── */}
          {habits.length > 0 && (
            <div style={{ marginBottom:14 }} className="fade">
              <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Tasks & Habits</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {habits.map((h:any) => {
                  const val = habitLogs[h.id] || 0
                  const pct = h.habit_type==='check' ? (val?100:0) : Math.min(100, Math.round((val/h.target)*100))
                  const done = pct >= 100
                  const color = h.color || t.teal

                  if (h.habit_type === 'check') return (
                    <div key={h.id} onClick={()=>logHabit(h.id, val?0:1)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13, cursor:'pointer', transition:'all 0.2s ease' }}>
                      <div style={{ width:32, height:32, borderRadius:9, background:done?'linear-gradient(135deg,'+color+','+color+'aa)':t.surfaceHigh, border:'1px solid '+(done?color+'60':t.border), display:'flex', alignItems:'center', justifyContent:'center', fontSize:done?13:16, flexShrink:0, transition:'all 0.2s ease' }}>
                        {done ? '✓' : h.icon||'✅'}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>{done?'Done! 🎉':'Tap to complete'}</div>
                      </div>
                    </div>
                  )

                  return (
                    <div key={h.id} onClick={()=>setLogPopup({ habit:h, draft:String(val||'') })}
                      style={{ padding:'12px 14px', background:done?color+'12':t.surface, border:'1px solid '+(done?color+'40':t.border), borderRadius:13, cursor:'pointer', transition:'all 0.2s ease' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:18 }}>{h.icon||'📊'}</span>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:700, color:done?color:t.text }}>{h.label}</div>
                          <div style={{ fontSize:11, color:t.textMuted }}>Target: {h.target}{h.unit}</div>
                        </div>
                        <div style={{ textAlign:'right' as const }}>
                          <div style={{ fontSize:15, fontWeight:800, color:done?color:t.textDim }}>{val||0}<span style={{ fontSize:10, color:t.textMuted }}>{h.unit}</span></div>
                          <div style={{ fontSize:10, color:t.textMuted }}>Tap to log</div>
                        </div>
                      </div>
                      <div style={{ height:4, background:t.surfaceHigh, borderRadius:3, marginTop:8, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+color+','+color+'bb)', borderRadius:3, transition:'width 0.4s ease' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 6. JOURNAL ── */}
          <div className="fade" style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }}>
            <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }}/>
            <div style={{ padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                <div style={{ width:38, height:38, borderRadius:11, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, flexShrink:0 }}>✍️</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>How did today go?</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>Your daily journal</div>
                </div>
                {pastEntries.length > 0 && (
                  <button onClick={()=>setPastEntriesOpen(true)}
                    style={{ background:'none', border:'1px solid '+t.border, borderRadius:20, padding:'4px 11px', fontSize:11, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                    Past entries
                  </button>
                )}
              </div>
              <textarea
                value={journalText}
                onChange={e=>setJournalText(e.target.value)}
                placeholder="Write anything — wins, struggles, how you're really feeling. No judgment here."
                rows={4}
                style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:11, padding:'11px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none', lineHeight:1.6, boxSizing:'border-box' as const, colorScheme:'dark' }}
              />
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:10 }}>
                <button onClick={()=>setJournalPrivate(p=>!p)}
                  style={{ display:'flex', alignItems:'center', gap:7, background:journalPrivate?t.surfaceHigh:t.tealDim, border:'1px solid '+(journalPrivate?t.border:t.teal+'40'), borderRadius:20, padding:'5px 12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={journalPrivate?t.textMuted:t.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {journalPrivate
                      ? <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>
                      : <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/> }
                  </svg>
                  <span style={{ fontSize:11, fontWeight:700, color:journalPrivate?t.textMuted:t.teal }}>
                    {journalPrivate ? 'Private' : 'Visible to Coach'}
                  </span>
                </button>
                <button onClick={saveJournal} disabled={journalSaving||!journalText.trim()}
                  style={{ background:journalText.trim()?'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)':t.surfaceHigh, border:'none', borderRadius:11, padding:'9px 20px', fontSize:13, fontWeight:800, color:journalText.trim()?'#000':t.textMuted, cursor:journalText.trim()?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
                  {journalSaved ? '✓ Saved!' : journalSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Empty state */}
          {habits.length === 0 && !nextSession && (
            <div style={{ background:'linear-gradient(135deg,'+t.teal+'12,'+t.orange+'08)', border:'1px solid '+t.teal+'25', borderRadius:16, padding:'24px 18px', textAlign:'center', marginBottom:14 }} className="fade">
              <div style={{ fontSize:32, marginBottom:10 }}>🚀</div>
              <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>You're all set!</div>
              <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Shane is setting up your program. Check back soon and let's get to work.</div>
            </div>
          )}

          </> /* end today content */}

          {/* ── TRAINING TAB ── */}
          {activeNav === 'training' && (
            <TrainingTab clientRecord={clientRecord} supabase={supabase} router={router} t={t} />
          )}

          {/* ── NUTRITION TAB ── */}
          {activeNav === 'nutrition' && (
            <NutritionTab clientRecord={clientRecord} supabase={supabase} t={t} />
          )}

          {/* ── MESSAGES TAB ── */}
          {activeNav === 'messages' && messagesView === 'hub' && (
            <div style={{ paddingBottom:32 }}>
              <div style={{ fontSize:22, fontWeight:900, marginBottom:6, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
                Connect
              </div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>Message your coach or check in with the community</div>

              {/* Coach message card */}
              <button onClick={()=>setMessagesView('coach')}
                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:20, overflow:'hidden', marginBottom:14, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.orange+')' }} />
                <div style={{ padding:'18px 18px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,'+t.teal+'30,'+t.orange+'18)', border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                    </svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:3 }}>Message Coach Shane</div>
                    <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5 }}>Direct line to your coach — questions, check-ins, anything</div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>

              {/* Community card */}
              <button onClick={()=>router.push('/dashboard/client/community')}
                style={{ width:'100%', background:t.surface, border:'1px solid '+t.border, borderRadius:20, overflow:'hidden', cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                <div style={{ height:3, background:'linear-gradient(90deg,'+t.purple+','+t.pink+')' }} />
                <div style={{ padding:'18px 18px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:52, height:52, borderRadius:16, background:'linear-gradient(135deg,'+t.purple+'30,'+t.pink+'18)', border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={t.purple} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
                    </svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:800, color:t.text, marginBottom:3 }}>SRG Fit Community</div>
                    <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.5 }}>Share your wins and hype up your crew</div>
                  </div>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </div>
              </button>
            </div>
          )}

          {/* ── MESSAGES: Coach thread ── */}
          {activeNav === 'messages' && messagesView === 'coach' && (
            <div style={{ height:'calc(100vh - 52px - 60px)', overflow:'hidden', display:'flex', flexDirection:'column' }}>
              {/* Back button */}
              <div style={{ padding:'10px 0 6px', flexShrink:0 }}>
                <button onClick={()=>setMessagesView('hub')}
                  style={{ background:'none', border:'none', color:t.teal, fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:"'DM Sans',sans-serif", padding:0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Back
                </button>
              </div>
              <div style={{ flex:1, overflow:'hidden' }}>
                {profile && coachProfileId ? (
                  <RichMessageThread
                    myId={profile.id}
                    otherId={coachProfileId}
                    otherName="Coach Shane"
                    tenorKey={TENOR_KEY}
                    height="100%"
                  />
                ) : (
                  <div style={{ padding:40, textAlign:'center', color:t.textMuted, fontSize:13 }}>
                    {!clientRecord ? 'No coach assigned yet.' : 'Loading messages...'}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Billing Tab ── */}
          {activeNav === 'billing' && (
            <BillingTab clientRecord={clientRecord} supabase={supabase} />
          )}

          {/* Tagline — shown on nutrition, metrics, and other content tabs */}
          {activeNav !== 'today' && activeNav !== 'messages' && activeNav !== 'billing' && (
          <div style={{ textAlign:'center', padding:'8px 0 24px', fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>
          )}

        </div>

        {/* ── Floating + button — hidden on message thread ── */}
        {!(activeNav === 'messages' && messagesView === 'coach') && (
        <div style={{ position:'fixed', bottom:72, right:'max(16px, calc(50vw - 240px + 16px))', zIndex:30 }}>
          {/* Action menu */}
          {plusOpen && (
            <div className="plus-action" style={{ position:'absolute', bottom:60, right:0, display:'flex', flexDirection:'column', gap:10, alignItems:'flex-end', pointerEvents:'all' }}>
              <button onClick={()=>{ setPlusOpen(false); setActiveNav('nutrition') }}
                style={{ display:'flex', alignItems:'center', gap:10, background:t.surface, border:'1px solid '+t.teal+'40', borderRadius:14, padding:'12px 18px', fontSize:13, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>
                </svg>
                Log Food
              </button>
              <button onClick={()=>{ setPlusOpen(false); nextSession ? router.push(`/dashboard/client/workout/${nextSession.id}`) : setActiveNav('training') }}
                style={{ display:'flex', alignItems:'center', gap:10, background:t.surface, border:'1px solid '+t.orange+'40', borderRadius:14, padding:'12px 18px', fontSize:13, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap', boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={t.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><path d="M8 6h8M8 18h8"/><line x1="6" y1="8" x2="6" y2="16"/><line x1="18" y1="8" x2="18" y2="16"/>
                </svg>
                {nextSession ? 'Start Workout' : 'Log Activity'}
              </button>
            </div>
          )}
          {/* + button */}
          <button onClick={()=>setPlusOpen(o=>!o)}
            style={{ width:52, height:52, borderRadius:26, background:plusOpen ? t.surfaceHigh : `linear-gradient(135deg,${t.teal},${t.teal}cc)`, border: plusOpen ? '1px solid '+t.border : 'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', boxShadow:'0 4px 20px rgba(0,201,177,0.35)', transition:'all 0.2s ease', transform: plusOpen ? 'rotate(45deg)' : 'rotate(0deg)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={plusOpen ? t.textMuted : '#000'} strokeWidth="2.5" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        )}

        {/* ── Past Journal Entries Sheet ── */}
        {pastEntriesOpen && (
          <>
            <div onClick={()=>setPastEntriesOpen(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(4px)' }}/>
            <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:t.surface, borderTop:'1px solid '+t.border, borderRadius:'20px 20px 0 0', zIndex:41, fontFamily:"'DM Sans',sans-serif", maxHeight:'75vh', display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'14px 18px 10px', flexShrink:0 }}>
                <div style={{ width:36, height:4, borderRadius:2, background:t.border, margin:'0 auto 16px' }}/>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:15, fontWeight:800 }}>✍️ Past Journal Entries</div>
                  <button onClick={()=>setPastEntriesOpen(false)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, lineHeight:1 }}>✕</button>
                </div>
              </div>
              <div style={{ overflowY:'auto', padding:'0 18px 32px', flex:1 }}>
                {pastEntries.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'40px 0', color:t.textMuted, fontSize:13 }}>No previous entries yet</div>
                ) : pastEntries.map((entry:any) => (
                  <div key={entry.id} style={{ borderBottom:'1px solid '+t.border, paddingBottom:14, marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:t.teal }}>
                        {new Date(entry.entry_date+'T00:00:00').toLocaleDateString([], { weekday:'short', month:'long', day:'numeric' })}
                      </div>
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={entry.is_private?t.textMuted:t.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          {entry.is_private
                            ? <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>
                            : <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>}
                        </svg>
                        <span style={{ fontSize:10, color:entry.is_private?t.textMuted:t.teal, fontWeight:600 }}>
                          {entry.is_private ? 'Private' : 'Shared'}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize:13, color:t.textDim, lineHeight:1.6, whiteSpace:'pre-wrap' as const }}>
                      {entry.body}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Log Habit Popup ── */}
        {logPopup && (
          <>
            <div onClick={()=>setLogPopup(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:40, backdropFilter:'blur(4px)' }} />
            <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:t.surface, borderTop:'1px solid '+t.border, borderRadius:'20px 20px 0 0', padding:'24px 20px 40px', zIndex:41, fontFamily:"'DM Sans',sans-serif" }}>
              {/* Handle bar */}
              <div style={{ width:36, height:4, borderRadius:2, background:t.border, margin:'0 auto 20px' }} />
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
                <span style={{ fontSize:24 }}>{logPopup.habit.icon||'📊'}</span>
                <div>
                  <div style={{ fontSize:16, fontWeight:800 }}>{logPopup.habit.label}</div>
                  <div style={{ fontSize:12, color:t.textMuted }}>Target: {logPopup.habit.target}{logPopup.habit.unit}</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20 }}>
                <input
                  type="number"
                  autoFocus
                  inputMode="numeric"
                  placeholder={'0'}
                  value={logPopup.draft}
                  onChange={e=>setLogPopup(p=>p?{...p, draft:e.target.value}:null)}
                  onKeyDown={e=>{ if(e.key==='Enter'){ logHabit(logPopup.habit.id, +logPopup.draft||0); setLogPopup(null) }}}
                  style={{ flex:1, background:t.surfaceUp, border:'2px solid '+(logPopup.habit.color||t.teal)+'60', borderRadius:12, padding:'14px 16px', fontSize:24, fontWeight:800, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark', textAlign:'center' as const }}
                />
                <div style={{ fontSize:16, fontWeight:700, color:t.textMuted, flexShrink:0 }}>{logPopup.habit.unit}</div>
              </div>
              <button
                onClick={()=>{ logHabit(logPopup.habit.id, +logPopup.draft||0); setLogPopup(null) }}
                style={{ width:'100%', padding:'14px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+(logPopup.habit.color||t.teal)+','+(logPopup.habit.color||t.teal)+'cc)', color:'#000', fontSize:15, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Save ✓
              </button>
            </div>
          </>
        )}

        {/* ── Bottom Nav ── */}
        <div style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480, background:t.surface, borderTop:'1px solid '+t.border, display:'flex', alignItems:'center', height:60, zIndex:20, paddingBottom:'env(safe-area-inset-bottom)' }}>
          {NAV.map(n => (
            <button key={n.id} onClick={()=>{ 
              if(n.id === 'metrics'){ router.push('/dashboard/client/progress'); return }
              if(n.id === 'resources'){ router.push('/dashboard/client/resources'); return }
              if(n.id !== 'messages') setMessagesView('hub')
              setActiveNav(n.id) 
            }}
              style={{ flex:1, background:'none', border:'none', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:4, cursor:'pointer', padding:'8px 0', position:'relative' }}>
              {activeNav === n.id && (
                <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:20, height:2.5, borderRadius:2, background:t.teal }} />
              )}
              <NavIcon id={n.id} active={activeNav === n.id} />
            </button>
          ))}
        </div>

      </div>
    </>
  )
}


// ── BillingTab ────────────────────────────────────────────────────────────
function BillingTab({ clientRecord, supabase }: { clientRecord: any, supabase: any }) {
  const [sub, setSub] = useState<any>(null)
  const [plan, setPlan] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)

  const tc = {
    bg:'#0f0f0f', surface:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
    accent:'#00c9b1', text:'#eeeef8', textDim:'#8888a8', textMuted:'#5a5a78',
    success:'#22c55e', warn:'#f59e0b', danger:'#ef4444'
  }

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const { data: subData } = await supabase
        .from('subscriptions').select('*')
        .eq('client_id', clientRecord.id)
        .order('created_at', { ascending: false })
        .limit(1).single()
      setSub(subData)

      if (subData?.plan_id) {
        const { data: planData } = await supabase
          .from('coaching_plans').select('*').eq('id', subData.plan_id).single()
        setPlan(planData)
      }
      setLoading(false)
    }
    load()
  }, [clientRecord])

  async function openPortal() {
    setPortalLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/stripe-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session?.access_token}`
      },
      body: JSON.stringify({ return_url: window.location.href })
    })
    const data = await res.json()
    if (data.url) window.location.href = data.url
    else alert('Could not open billing portal: ' + (data.error || 'Unknown error'))
    setPortalLoading(false)
  }

  const statusColors: Record<string, string> = {
    active: tc.success, trialing: tc.accent, past_due: tc.warn,
    canceled: tc.danger, unpaid: tc.danger, paused: tc.textDim, none: tc.textMuted
  }

  const statusLabel: Record<string, string> = {
    active: '✅ Active', trialing: '🔄 Trial', past_due: '⚠️ Past Due',
    canceled: '❌ Canceled', unpaid: '❌ Unpaid', paused: '⏸ Paused', none: '— No subscription'
  }

  const status = clientRecord?.subscription_status || 'none'
  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '—'
  const fmtAmt = (cents: number, interval: string) => {
    if (!cents) return '—'
    const amt = `$${(cents / 100).toFixed(2)}`
    if (interval === 'month') return `${amt}/mo`
    if (interval === 'year') return `${amt}/yr`
    return amt
  }

  return (
    <div style={{ padding:'0 0 32px' }}>
      <h2 style={{ fontSize:18, fontWeight:800, marginBottom:20 }}>Billing & Subscription</h2>

      {loading ? (
        <p style={{ color:tc.textMuted, fontSize:13 }}>Loading billing info...</p>
      ) : (
        <>
          {/* Status Card */}
          <div style={{ background:tc.surface, border:`1px solid ${tc.border}`, borderRadius:14, padding:'20px 22px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: sub ? 16 : 0 }}>
              <div>
                <p style={{ fontSize:12, color:tc.textMuted, margin:'0 0 4px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Status</p>
                <p style={{ fontSize:20, fontWeight:800, margin:0, color: statusColors[status] || tc.textDim }}>
                  {statusLabel[status] || status}
                </p>
              </div>
              {plan && (
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:12, color:tc.textMuted, margin:'0 0 4px', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Plan</p>
                  <p style={{ fontSize:15, fontWeight:800, margin:0, color:tc.accent }}>{fmtAmt(plan.amount_cents, plan.interval)}</p>
                  <p style={{ fontSize:11, color:tc.textDim, margin:'2px 0 0' }}>{plan.name}</p>
                </div>
              )}
            </div>

            {sub && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                {[
                  { label:'Current Period', value: sub.current_period_end ? `Renews ${fmtDate(sub.current_period_end)}` : '—' },
                  { label:'Started', value: fmtDate(sub.created_at) },
                  ...(sub.trial_end ? [{ label:'Trial Ends', value: fmtDate(sub.trial_end) }] : []),
                  ...(sub.cancel_at_period_end ? [{ label:'Cancels', value: fmtDate(sub.current_period_end) }] : []),
                  ...(sub.grace_period_end ? [{ label:'Grace Period Ends', value: fmtDate(sub.grace_period_end) }] : []),
                ].map(item => (
                  <div key={item.label} style={{ background:tc.surfaceHigh, borderRadius:8, padding:'10px 12px' }}>
                    <p style={{ fontSize:11, color:tc.textMuted, margin:'0 0 3px', fontWeight:600 }}>{item.label}</p>
                    <p style={{ fontSize:13, fontWeight:700, margin:0 }}>{item.value}</p>
                  </div>
                ))}
              </div>
            )}

            {status === 'past_due' && (
              <div style={{ background:'#f59e0b18', border:'1px solid #f59e0b44', borderRadius:10, padding:'10px 14px', marginTop:14 }}>
                <p style={{ margin:0, fontSize:13, color:tc.warn, fontWeight:700 }}>⚠️ Payment Past Due</p>
                <p style={{ margin:'4px 0 0', fontSize:12, color:tc.textDim }}>Please update your payment method to keep your access.</p>
              </div>
            )}
          </div>

          {/* Manage Button */}
          {clientRecord?.stripe_customer_id && (
            <button onClick={openPortal} disabled={portalLoading}
              style={{ width:'100%', background:'linear-gradient(135deg,#00c9b1,#00a090)', border:'none', borderRadius:12, padding:'14px', fontSize:15, fontWeight:700, color:'#000', cursor: portalLoading ? 'default' : 'pointer', opacity: portalLoading ? 0.7 : 1, fontFamily:"'DM Sans',sans-serif" }}>
              {portalLoading ? 'Opening...' : '💳 Manage Billing & Payment Method'}
            </button>
          )}

          {status === 'none' && (
            <div style={{ background:tc.surface, border:`1px solid ${tc.border}`, borderRadius:14, padding:'32px 22px', textAlign:'center' }}>
              <p style={{ fontSize:24, marginBottom:8 }}>💳</p>
              <p style={{ color:tc.textDim, fontSize:13, margin:0 }}>No active subscription. Contact your coach to get set up.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── ProfileNudge: shown on dashboard if intake not filled ──────────────────
function ProfileNudge({ clientId, onOpen }: { clientId: string|null, onOpen: ()=>void }) {
  const supabase = createClient()
  const [pct, setPct] = useState<number|null>(null)

  useEffect(() => {
    if (!clientId) return
    const check = async () => {
      const { data } = await supabase.from('client_intake_profiles').select('primary_goal,training_experience,activity_level,dietary_approach,date_of_birth,starting_weight_lbs').eq('client_id', clientId).single()
      if (!data) { setPct(0); return }
      const fields = [data.primary_goal, data.training_experience, data.activity_level, data.dietary_approach, data.date_of_birth, data.starting_weight_lbs]
      setPct(Math.round(fields.filter(Boolean).length / fields.length * 100))
    }
    check()
  }, [clientId])

  if (pct === null || pct === 100) return null

  const colors = { teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', surface:'#0f0f1a', border:'#252538', text:'#eeeef8', textMuted:'#5a5a78' }
  const c = colors

  return (
    <div style={{ background:'linear-gradient(135deg,'+c.teal+'18,'+c.orange+'08)', border:'1px solid '+c.teal+'30', borderRadius:16, padding:'14px 16px', marginBottom:14 }} className="fade">
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ fontSize:22, flexShrink:0 }}>📋</div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:13, fontWeight:800, marginBottom:2 }}>Complete your intake profile</div>
          <div style={{ fontSize:11, color:c.textMuted, marginBottom:8 }}>Help your coach build the perfect program for you — {pct}% complete</div>
          <div style={{ height:4, background:'rgba(255,255,255,0.08)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:pct+'%', background:'linear-gradient(90deg,'+c.teal+','+c.orange+')', borderRadius:4 }} />
          </div>
        </div>
        <button onClick={onOpen} style={{ background:'linear-gradient(135deg,'+c.teal+','+c.teal+'cc)', border:'none', borderRadius:9, padding:'8px 14px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0 }}>
          {pct === 0 ? 'Get Started' : 'Continue →'}
        </button>
      </div>
    </div>
  )
}


// ── TrainingTab ───────────────────────────────────────────────────────────
function TrainingTab({ clientRecord, supabase, router, t }: any) {
  const [program, setProgram] = useState<any>(null)
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'program'|'workouts'>('program')

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    const load = async () => {
      const [{ data: prog }, { data: sess }] = await Promise.all([
        supabase.from('programs').select('id, name, description, goal, duration_weeks, difficulty')
          .eq('client_id', clientRecord.id).eq('is_template', false)
          .order('created_at', { ascending: false }).limit(1).single(),
        supabase.from('workout_sessions')
          .select('id, title, status, scheduled_date, day_label, session_rpe, mood, completed_at, duration_seconds, notes_coach')
          .eq('client_id', clientRecord.id)
          .order('scheduled_date', { ascending: true })
          .limit(50),
      ])
      setProgram(prog || null)
      setSessions(sess || [])
      setLoading(false)
    }
    load()
  }, [clientRecord?.id])

  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')
  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m` : null

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading training...</div>

  if (view === 'workouts') return (
    <div style={{ paddingBottom:32 }}>
      {/* Back to program */}
      <button onClick={() => setView('program')}
        style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6, marginBottom:18, padding:0 }}>
        ← {program?.name || 'Program'}
      </button>

      {/* Upcoming sessions */}
      <div style={{ marginBottom:20 }}>
        <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
          Upcoming ({upcoming.length})
        </p>
        {upcoming.length === 0 ? (
          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
            <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
            <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>All caught up!</p>
          </div>
        ) : upcoming.map(s => (
          <div key={s.id} onClick={() => router.push(`/dashboard/client/workout/${s.id}`)}
            style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', marginBottom:10, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:s.status==='in_progress'?t.tealDim:t.orangeDim, border:'1px solid '+(s.status==='in_progress'?t.teal:t.orange)+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
              {s.status === 'in_progress' ? '▶️' : '💪'}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:700, fontSize:15 }}>{s.title}</div>
              <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>
                {s.scheduled_date}{s.day_label ? ` · ${s.day_label}` : ''}
              </div>
              {s.notes_coach && <div style={{ fontSize:11, color:t.orange, marginTop:4 }}>📌 {s.notes_coach.slice(0,60)}{s.notes_coach.length>60?'...':''}</div>}
            </div>
            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:s.status==='in_progress'?t.tealDim:t.orangeDim, color:s.status==='in_progress'?t.teal:t.orange, border:`1px solid ${s.status==='in_progress'?t.teal:t.orange}30` }}>
              {s.status === 'in_progress' ? 'Resume' : 'Start'}
            </span>
          </div>
        ))}
      </div>

      {/* Completed sessions */}
      {completed.length > 0 && (
        <div>
          <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
            Completed ({completed.length})
          </p>
          <div style={{ display:'grid', gap:8 }}>
            {completed.map(s => (
              <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                <span style={{ fontSize:18 }}>✅</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:t.textDim }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : s.scheduled_date}</div>
                </div>
                <div style={{ textAlign:'right' as const }}>
                  {fmtDur(s.duration_seconds) && <div style={{ fontSize:12, fontWeight:700, color:t.orange }}>{fmtDur(s.duration_seconds)}</div>}
                  {s.session_rpe && <div style={{ fontSize:11, color:t.textMuted }}>RPE {s.session_rpe}</div>}
                  {s.mood && <div style={{ fontSize:14 }}>{{ great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }[s.mood as 'great'|'good'|'okay'|'tired'|'awful']}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // Default view: program card
  return (
    <div style={{ paddingBottom:32 }}>
      {!program ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:'40px 20px', textAlign:'center' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>💪</div>
          <div style={{ fontSize:15, fontWeight:800, marginBottom:6 }}>No program assigned yet</div>
          <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>Your coach is building your program. Check back soon!</div>
        </div>
      ) : (
        <>
          {/* Program card */}
          <div style={{ background:t.surface, border:'1px solid '+t.teal+'30', borderRadius:16, overflow:'hidden', marginBottom:16 }}>
            <div style={{ height:4, background:`linear-gradient(90deg,${t.teal},${t.orange})` }} />
            <div style={{ padding:'20px 20px 16px' }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:14, marginBottom:16 }}>
                <div style={{ width:48, height:48, borderRadius:14, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>💪</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>{program.name}</div>
                  {program.description && <div style={{ fontSize:13, color:t.textDim, lineHeight:1.6 }}>{program.description}</div>}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                {[
                  { label:'Duration', val: program.duration_weeks ? `${program.duration_weeks}w` : '—', color:t.teal },
                  { label:'Difficulty', val: program.difficulty || '—', color:t.orange },
                  { label:'Goal', val: program.goal || '—', color:t.green },
                ].map(s => (
                  <div key={s.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'12px', textAlign:'center' as const }}>
                    <div style={{ fontSize:15, fontWeight:800, color:s.color, marginBottom:2 }}>{s.val}</div>
                    <div style={{ fontSize:10, color:t.textMuted, textTransform:'uppercase' as const, letterSpacing:'0.06em', fontWeight:700 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Sessions summary + CTA */}
              <div style={{ background:t.surfaceHigh, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>
                    {upcoming.length > 0
                      ? `${upcoming.length} workout${upcoming.length!==1?'s':''} scheduled`
                      : sessions.length > 0 ? 'All workouts completed! 🎉' : 'No sessions yet'}
                  </div>
                  {upcoming.length > 0 && (
                    <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                      Next: {upcoming[0]?.scheduled_date}
                    </div>
                  )}
                  {completed.length > 0 && (
                    <div style={{ fontSize:11, color:t.green, marginTop:2 }}>✅ {completed.length} completed</div>
                  )}
                </div>
                <button onClick={() => setView('workouts')}
                  style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'10px 18px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' as const }}>
                  View All →
                </button>
              </div>
            </div>
          </div>

          {/* Quick-start: next session */}
          {upcoming.length > 0 && (
            <div onClick={() => router.push(`/dashboard/client/workout/${upcoming[0].id}`)}
              style={{ background:t.surface, border:'1px solid '+t.orange+'40', borderRadius:16, overflow:'hidden', cursor:'pointer' }}>
              <div style={{ height:3, background:`linear-gradient(90deg,${t.orange},${t.yellow})` }} />
              <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:t.orangeDim, border:'1px solid '+t.orange+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {upcoming[0].status === 'in_progress' ? '▶️' : '💪'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:800 }}>
                    {upcoming[0].status === 'in_progress' ? 'Resume Workout' : 'Up Next'}
                  </div>
                  <div style={{ fontSize:13, color:t.text, marginTop:2 }}>{upcoming[0].title}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>{upcoming[0].scheduled_date}{upcoming[0].day_label ? ` · ${upcoming[0].day_label}` : ''}</div>
                </div>
                <div style={{ background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, borderRadius:10, padding:'10px 16px', fontSize:13, fontWeight:800, color:'#000', whiteSpace:'nowrap' as const }}>
                  {upcoming[0].status === 'in_progress' ? 'Resume ▶' : 'Start 💪'}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}


// ── WorkoutsTab ───────────────────────────────────────────────────────────
function WorkoutsTab({ clientRecord, supabase, router, t }: any) {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientRecord?.id) return
    supabase.from('workout_sessions')
      .select('id, title, status, scheduled_date, day_label, mood, session_rpe, completed_at, duration_seconds, notes_coach')
      .eq('client_id', clientRecord.id)
      .order('scheduled_date', { ascending: false })
      .limit(30)
      .then(({ data }: any) => { setSessions(data || []); setLoading(false) })
  }, [clientRecord?.id])

  const upcoming = sessions.filter(s => s.status === 'assigned' || s.status === 'in_progress')
  const completed = sessions.filter(s => s.status === 'completed')

  const statusStyle = (s: string) => ({
    background: s === 'completed' ? t.greenDim : s === 'in_progress' ? t.tealDim : t.orangeDim,
    color: s === 'completed' ? t.green : s === 'in_progress' ? t.teal : t.orange,
    border: `1px solid ${s === 'completed' ? t.green : s === 'in_progress' ? t.teal : t.orange}30`
  })

  const fmtDur = (s: number) => s ? `${Math.floor(s/60)}m` : null

  if (!clientRecord) return (
    <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>No coach assigned yet.</div>
  )

  return (
    <div style={{ paddingBottom:32 }}>
      {loading ? (
        <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading workouts...</div>
      ) : (
        <>
          {/* Upcoming */}
          <div style={{ marginBottom:24 }}>
            <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
              Upcoming ({upcoming.length})
            </p>
            {upcoming.length === 0 ? (
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>💤</div>
                <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>No workouts assigned yet</p>
                <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your next session here</p>
              </div>
            ) : upcoming.map(s => (
              <div key={s.id}
                onClick={() => router.push(`/dashboard/client/workout/${s.id}`)}
                style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'16px 18px', marginBottom:10, cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>
                  {s.status === 'in_progress' ? '▶️' : '💪'}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15 }}>{s.title}</div>
                  <div style={{ fontSize:12, color:t.textDim, marginTop:2 }}>
                    {s.scheduled_date || 'No date'}{s.day_label ? ` · ${s.day_label}` : ''}
                  </div>
                  {s.notes_coach && (
                    <div style={{ fontSize:11, color:t.orange, marginTop:4 }}>📌 {s.notes_coach.slice(0,60)}{s.notes_coach.length>60?'...':''}</div>
                  )}
                </div>
                <div>
                  <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, ...statusStyle(s.status) }}>
                    {s.status === 'in_progress' ? 'In Progress' : 'Start'}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Completed */}
          {completed.length > 0 && (
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>
                Completed ({completed.length})
              </p>
              <div style={{ display:'grid', gap:8 }}>
                {completed.map(s => (
                  <div key={s.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:18 }}>✅</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, fontSize:14 }}>{s.title}</div>
                      <div style={{ fontSize:11, color:t.textDim }}>{s.completed_at ? new Date(s.completed_at).toLocaleDateString([], { weekday:'short', month:'short', day:'numeric' }) : s.scheduled_date}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      {fmtDur(s.duration_seconds) && <div style={{ fontSize:12, fontWeight:700, color:t.orange }}>{fmtDur(s.duration_seconds)}</div>}
                      {s.session_rpe && <div style={{ fontSize:11, color:t.textMuted }}>RPE {s.session_rpe}</div>}
                      {s.mood && <div style={{ fontSize:14 }}>{{ great:'😄', good:'🙂', okay:'😐', tired:'😴', awful:'😓' }[s.mood as 'great'|'good'|'okay'|'tired'|'awful']}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── ProgramsTab ───────────────────────────────────────────────────────────
function ProgramsTab({ clientRecord, supabase, router, t }: any) {
  const [programs, setPrograms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!clientRecord?.id) { setLoading(false); return }
    supabase.from('programs')
      .select('id, name, description, duration_weeks, days_per_week, goal, level, active, start_date')
      .eq('client_id', clientRecord.id)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .then(({ data }: any) => { setPrograms(data || []); setLoading(false) })
  }, [clientRecord?.id])

  const levelColor = (l: string) => ({
    beginner: t.green, intermediate: t.orange, advanced: t.red
  }[l?.toLowerCase()] || t.textDim)

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading...</div>

  return (
    <div style={{ paddingBottom:32 }}>
      {programs.length === 0 ? (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'28px 20px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <p style={{ fontSize:13, color:t.textDim, fontWeight:600 }}>No program assigned yet</p>
          <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your program here</p>
        </div>
      ) : programs.map((p: any) => (
        <div key={p.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'18px 20px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:12, marginBottom:12 }}>
            <div style={{ fontSize:32 }}>📋</div>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:800, fontSize:17, marginBottom:4 }}>{p.name}</div>
              {p.description && <div style={{ fontSize:13, color:t.textDim, lineHeight:1.5 }}>{p.description}</div>}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
            {[
              { label:'Duration', value: p.duration_weeks ? `${p.duration_weeks} weeks` : '—' },
              { label:'Frequency', value: p.days_per_week ? `${p.days_per_week}x/week` : '—' },
              { label:'Level', value: p.level || '—', color: levelColor(p.level) },
            ].map(stat => (
              <div key={stat.label} style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                <div style={{ fontSize:14, fontWeight:800, color:(stat as any).color || t.accent }}>{stat.value}</div>
                <div style={{ fontSize:11, color:t.textMuted }}>{stat.label}</div>
              </div>
            ))}
          </div>
          {p.goal && (
            <div style={{ marginTop:12, background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:10, padding:'10px 14px' }}>
              <span style={{ fontSize:12, color:t.teal }}>🎯 Goal: {p.goal}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── ExercisesTab ──────────────────────────────────────────────────────────
function ExercisesTab({ supabase, t }: any) {
  const [exercises, setExercises] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterGroup, setFilterGroup] = useState('all')
  const [expanded, setExpanded] = useState<string|null>(null)
  const [groups, setGroups] = useState<string[]>([])

  useEffect(() => {
    supabase.from('exercises')
      .select('id, name, muscle_group, exercise_type, description, instructions, video_url')
      .order('name')
      .then(({ data }: any) => {
        setExercises(data || [])
        const g = [...new Set((data || []).map((e: any) => e.muscle_group).filter(Boolean))] as string[]
        setGroups(g.sort())
        setLoading(false)
      })
  }, [])

  const filtered = exercises.filter(e => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase()) || e.muscle_group?.toLowerCase().includes(search.toLowerCase())
    const matchGroup = filterGroup === 'all' || e.muscle_group === filterGroup
    return matchSearch && matchGroup
  })

  if (loading) return <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading library...</div>

  return (
    <div style={{ paddingBottom:32 }}>
      <div style={{ marginBottom:12, display:'flex', gap:8, flexDirection:'column' }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises..."
          style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif" }}/>
        <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:2 }}>
          <button onClick={() => setFilterGroup('all')}
            style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background: filterGroup==='all' ? t.teal : t.surfaceHigh, color: filterGroup==='all' ? '#0f0f0f' : t.textDim, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            All
          </button>
          {groups.map(g => (
            <button key={g} onClick={() => setFilterGroup(g)}
              style={{ flexShrink:0, padding:'5px 12px', borderRadius:20, border:'none', background: filterGroup===g ? t.teal : t.surfaceHigh, color: filterGroup===g ? '#0f0f0f' : t.textDim, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {g}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize:12, color:t.textMuted, marginBottom:10 }}>{filtered.length} exercise{filtered.length !== 1 ? 's' : ''}</div>
      <div style={{ display:'grid', gap:6 }}>
        {filtered.map(ex => (
          <div key={ex.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:12, overflow:'hidden' }}>
            <div onClick={() => setExpanded(expanded === ex.id ? null : ex.id)}
              style={{ padding:'12px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:14 }}>{ex.name}</div>
                {ex.muscle_group && <div style={{ fontSize:11, color:t.textMuted }}>{ex.muscle_group}{ex.exercise_type ? ` · ${ex.exercise_type}` : ''}</div>}
              </div>
              <span style={{ fontSize:12, color:t.textDim }}>{expanded === ex.id ? '▲' : '▼'}</span>
            </div>
            {expanded === ex.id && (ex.description || ex.instructions || ex.video_url) && (
              <div style={{ padding:'0 16px 14px', borderTop:'1px solid '+t.border }}>
                {ex.description && <p style={{ fontSize:13, color:t.textDim, lineHeight:1.6, marginTop:10 }}>{ex.description}</p>}
                {ex.instructions && <p style={{ fontSize:12, color:t.textMuted, lineHeight:1.6, marginTop:6 }}>{ex.instructions}</p>}
                {ex.video_url && (
                  <a href={ex.video_url} target="_blank" rel="noreferrer"
                    style={{ display:'inline-block', marginTop:10, fontSize:12, color:t.teal, fontWeight:700 }}>
                    ▶ Watch Demo
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── NutritionTab lives in ./nutrition-tab.tsx ─────────────────────────────
