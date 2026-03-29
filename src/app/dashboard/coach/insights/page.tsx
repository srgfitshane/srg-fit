'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  purple:'#8b5cf6', purpleDim:'#8b5cf615', red:'#ef4444', redDim:'#ef444415',
  green:'#22c55e', greenDim:'#22c55e15', yellow:'#facc15',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const INSIGHT_TYPES = [
  { id:'checkin_brief',      label:'Check-in Brief',      icon:'📋', color:'#00c9b1', desc:'Summary of recent check-in trends' },
  { id:'progression',        label:'Progression Analysis', icon:'📈', color:'#f5a623', desc:'Workout & metrics progress patterns' },
  { id:'red_flag',           label:'Red Flag Scan',        icon:'🚨', color:'#ef4444', desc:'Identify concerning patterns' },
  { id:'recommended_action', label:'Recommended Action',   icon:'⚡', color:'#8b5cf6', desc:'One high-impact suggestion' },
]

const FLAG_META: Record<string,{label:string,color:string,bg:string}> = {
  urgent: { label:'Urgent',  color:'#ef4444', bg:'#ef444418' },
  high:   { label:'High',    color:'#f5a623', bg:'#f5a62318' },
  normal: { label:'Normal',  color:'#00c9b1', bg:'#00c9b115' },
  low:    { label:'Low',     color:'#5a5a78', bg:'#5a5a7818' },
}

const TYPE_LABELS: Record<string,string> = {
  checkin_brief:'Check-in Brief', progression:'Progression', red_flag:'Red Flag', recommended_action:'Action'
}

const CATEGORY_LABELS: Record<string, string> = {
  low_adherence: 'Low adherence',
  recovery_risk: 'Recovery risk',
  motivation_drop: 'Motivation drop',
  nutrition_inconsistency: 'Nutrition inconsistency',
  plateau: 'Plateau',
  likely_exercise_mismatch: 'Exercise mismatch',
  at_risk_churn: 'At-risk churn',
}

const FEEDBACK_OPTIONS = [
  { id: 'helpful', label: 'Helpful', color: '#22c55e' },
  { id: 'too_obvious', label: 'Too obvious', color: '#f5a623' },
  { id: 'off_target', label: 'Off target', color: '#ef4444' },
] as const

type ClientListItem = {
  id: string
  profiles?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null
}

type CoachOption = {
  label?: string | null
  rationale?: string | null
  tradeoff?: string | null
}

type InsightContent = {
  title?: string | null
  summary?: string | null
  evidence?: string[] | null
  bullets?: string[] | null
  suggested_action?: string | null
  follow_up?: string | null
  coach_options?: CoachOption[] | null
  draft_message?: string | null
  coaching_note?: string | null
}

type InsightRecord = {
  id: string
  type: string
  client_id: string
  flag_level?: string | null
  generated_at?: string | null
  is_dismissed?: boolean | null
  read?: boolean | null
  is_saved?: boolean | null
  is_reviewed?: boolean | null
  action_status?: string | null
  confidence?: number | null
  category?: string | null
  severity?: string | null
  content?: InsightContent | null
  source_refs?: Record<string, unknown> | null
  coach_draft?: {
    client_message?: string | null
    coach_note?: string | null
    programming_adjustment?: string | null
  } | null
  generation_meta?: {
    model?: string | null
  } | null
  insight_data?: {
    checkins_analyzed?: number | null
    sessions_analyzed?: number | null
    metrics_analyzed?: number | null
  } | null
  surfaced_count?: number | null
  coach_feedback?: string | null
}

export default function CoachInsightsPage() {
  const supabase = useMemo(() => createClient(), [])
  const router   = useRouter()
  const [clients,   setClients]   = useState<ClientListItem[]>([])
  const [insights,  setInsights]  = useState<InsightRecord[]>([])
  const [loading,   setLoading]   = useState(true)
  const [coachId,   setCoachId]   = useState('')
  const [generating,setGenerating]= useState(false)
  const [genClient, setGenClient] = useState('')
  const [genType,   setGenType]   = useState('checkin_brief')
  const [expanded,  setExpanded]  = useState<string|null>(null)
  const [filter,    setFilter]    = useState<'all'|'unread'|'saved'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [saving,    setSaving]    = useState<string|null>(null)
  const [addingCal, setAddingCal] = useState<string|null>(null)
  const [actingOn, setActingOn] = useState<string|null>(null)
  const [feedbacking, setFeedbacking] = useState<string|null>(null)
  const [copiedDraft, setCopiedDraft] = useState<string|null>(null)

  const load = useCallback(async () => {
    const {data:{user}} = await supabase.auth.getUser()
    if (!user){router.push('/login');return}
    setCoachId(user.id)
    const [{data:cls},{data:ins}] = await Promise.all([
      supabase.from('clients').select('id, profiles!profile_id(full_name)').eq('coach_id',user.id).eq('status','active'),
      supabase.from('ai_insights').select('*').eq('coach_id',user.id).eq('is_dismissed',false).order('generated_at',{ascending:false}).limit(50),
    ])
    const safeClients = (cls || []) as ClientListItem[]
    setClients(safeClients)
    setInsights((ins || []) as InsightRecord[])
    setGenClient((current) => current || safeClients[0]?.id || '')
    setLoading(false)
  }, [router, supabase])

  useEffect(()=>{ void load() },[load])

  const generate = async () => {
    if (!genClient || !coachId) return
    setGenerating(true)
    const {data:{session}} = await supabase.auth.getSession()
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-ai-insight`, {
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token}`},
        body: JSON.stringify({ client_id: genClient, coach_id: coachId, type: genType }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      await load()
      setExpanded(data.insight_id)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      alert('Generation failed: ' + message)
    }
    setGenerating(false)
  }

  const markRead = async (id:string) => {
    await supabase.from('ai_insights').update({read:true}).eq('id',id)
    setInsights(p=>p.map(i=>i.id===id?{...i,read:true}:i))
  }

  const toggleSave = async (id:string, saved:boolean) => {
    setSaving(id)
    await supabase.from('ai_insights').update({is_saved:!saved}).eq('id',id)
    setInsights(p=>p.map(i=>i.id===id?{...i,is_saved:!saved}:i))
    setSaving(null)
  }

  const dismiss = async (id:string) => {
    await supabase.from('ai_insights').update({is_dismissed:true}).eq('id',id)
    setInsights(p=>p.filter(i=>i.id!==id))
  }

  const submitFeedback = async (id: string, coach_feedback: string) => {
    setFeedbacking(id)
    await supabase.from('ai_insights').update({ coach_feedback }).eq('id', id)
    setInsights(prev => prev.map(insight => insight.id === id ? { ...insight, coach_feedback } : insight))
    setFeedbacking(null)
  }

  const copyDraft = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedDraft(id)
      setTimeout(() => setCopiedDraft((current) => current === id ? null : current), 2000)
    } catch {
      // best effort only
    }
  }

  const updateActionStatus = async (id: string, action_status: string, extra: Record<string, unknown> = {}) => {
    setActingOn(id)
    await supabase.from('ai_insights').update({
      action_status,
      ...extra,
    }).eq('id', id)
    setInsights(prev => prev.map(insight => insight.id === id ? { ...insight, action_status, ...extra } : insight))
    setActingOn(null)
  }

  const addToCalendar = async (insight: InsightRecord) => {
    if (!coachId) return
    setAddingCal(insight.id)
    const c = insight.content || {}
    const name = clientName(insight.client_id)
    const title = c.title || `${name} — ${TYPE_LABELS[insight.type] || insight.type}`
    const description = [c.summary, c.suggested_action ? `⚡ Action: ${c.suggested_action}` : null]
      .filter(Boolean).join('\n\n')
    // Default to tomorrow 10am
    const start = new Date()
    start.setDate(start.getDate() + 1)
    start.setHours(10, 0, 0, 0)
    const end = new Date(start)
    end.setMinutes(end.getMinutes() + 30)
    const typeColors: Record<string,string> = {
      checkin_brief:'#00c9b1', progression:'#f5a623', red_flag:'#ef4444', recommended_action:'#8b5cf6'
    }
    await supabase.from('calendar_events').insert({
      coach_id: coachId,
      client_id: insight.client_id,
      title,
      description,
      event_type: 'note',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      color: typeColors[insight.type] || '#00c9b1',
    })
    // Sync to Google Calendar via server action would go here in production
    // For now the event lives in Supabase calendar_events and shows in the in-app calendar
    setAddingCal(null)
    await supabase.from('ai_insights').update({ is_reviewed: true, reviewed_at: new Date().toISOString() }).eq('id', insight.id)
    setInsights(p => p.map(i => i.id === insight.id ? { ...i, is_reviewed: true } : i))
  }

  const clientName = (id:string) => {
    const c = clients.find(c=>c.id===id)
    const p = c?.profiles
    return Array.isArray(p)?p[0]?.full_name:p?.full_name||'Client'
  }

  const filtered = insights.filter(i=>{
    if (filter==='unread') return !i.read
    if (filter==='saved') return i.is_saved
    return true
  }).filter(i => categoryFilter === 'all' ? true : i.category === categoryFilter)

  const unreadCount = insights.filter(i=>!i.read).length
  const groupedCounts = insights.reduce<Record<string, number>>((acc, insight) => {
    const key = insight.category || 'uncategorized'
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  const getSourceCount = (refs: unknown) => {
    if (!refs || typeof refs !== 'object') return 0
    return Object.values(refs as Record<string, unknown>).reduce<number>((sum, value) => {
      if (Array.isArray(value)) return sum + value.length
      return sum
    }, 0)
  }

  const inp = {background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'9px 12px',fontSize:13,color:t.text,outline:'none' as const,fontFamily:"'DM Sans',sans-serif",width:'100%'}

  if (loading) return <div style={{background:t.bg,minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:"'DM Sans',sans-serif",color:t.teal,fontSize:14,fontWeight:700}}>Loading...</div>

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}
        .insights-grid{display:grid;grid-template-columns:300px 1fr;gap:20px;}
        @media(max-width:700px){.insights-grid{grid-template-columns:1fr;}}
      `}</style>
      <div style={{background:t.bg,minHeight:'100vh',fontFamily:"'DM Sans',sans-serif",color:t.text}}>

        {/* Top bar */}
        <div style={{background:t.surface,borderBottom:'1px solid '+t.border,padding:'0 24px',display:'flex',alignItems:'center',height:60,gap:12}}>
          <button onClick={()=>router.push('/dashboard/coach')} aria-label="Back to coach dashboard" style={{background:'none',border:'none',color:t.textMuted,cursor:'pointer',fontSize:13,fontWeight:600,fontFamily:"'DM Sans',sans-serif"}}>← Back</button>
          <div style={{width:1,height:28,background:t.border}}/>
          <div style={{fontSize:14,fontWeight:700}}>🤖 Coach Copilot</div>
          {unreadCount>0 && <div style={{background:t.purple,color:'#fff',borderRadius:20,padding:'2px 8px',fontSize:11,fontWeight:800}}>{unreadCount} new</div>}
          <div style={{flex:1}}/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'min(300px,100%)',maxWidth:1200,margin:'0 auto',padding:24,gap:20}}
          className="insights-grid">

          {/* Left: Generator panel */}
          <div>
            <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:16,padding:20,marginBottom:16}}>
              <div style={{fontSize:13,fontWeight:800,marginBottom:16,color:t.text}}>✨ Generate Copilot Brief</div>

              <div style={{marginBottom:12}}>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:5,textTransform:'uppercase'}}>Client</label>
                <select value={genClient} onChange={e=>setGenClient(e.target.value)} style={inp}>
                  {clients.map(c=>{
                    const p=c.profiles; const n=Array.isArray(p)?p[0]?.full_name:p?.full_name||'Client'
                    return <option key={c.id} value={c.id}>{n}</option>
                  })}
                </select>
              </div>

              <div style={{marginBottom:16}}>
                <label style={{fontSize:11,fontWeight:700,color:t.textMuted,display:'block',marginBottom:8,textTransform:'uppercase'}}>Insight Type</label>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {INSIGHT_TYPES.map(it=>(
                    <button key={it.id} onClick={()=>setGenType(it.id)} aria-pressed={genType===it.id}
                      style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:10,border:'1px solid '+(genType===it.id?it.color+'50':t.border),background:genType===it.id?it.color+'12':'transparent',cursor:'pointer',textAlign:'left' as const,fontFamily:"'DM Sans',sans-serif"}}>
                      <span style={{fontSize:18,flexShrink:0}}>{it.icon}</span>
                      <div>
                        <div style={{fontSize:12,fontWeight:700,color:genType===it.id?it.color:t.text}}>{it.label}</div>
                        <div style={{fontSize:10,color:t.textMuted}}>{it.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button onClick={generate} disabled={generating||!genClient}
                style={{width:'100%',background:generating?t.surfaceHigh:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)',border:'none',borderRadius:10,padding:'12px',fontSize:13,fontWeight:800,color:generating?t.textMuted:'#fff',cursor:generating?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all 0.2s'}}>
                {generating ? '⏳ Generating...' : '✨ Generate Brief'}
              </button>
              {generating && <div style={{fontSize:11,color:t.textMuted,textAlign:'center',marginTop:8}}>Analyzing client context and preparing coach options...</div>}
            </div>

            {/* Stats */}
            <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:14,padding:16}}>
              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:12}}>Library</div>
              {[ 
                {label:'Total Insights',val:insights.length,color:t.teal},
                {label:'Unread',val:unreadCount,color:t.purple},
                {label:'Saved',val:insights.filter(i=>i.is_saved).length,color:t.yellow},
                {label:'High/Urgent',val:insights.filter(i=>i.severity==='high'||i.severity==='urgent').length,color:t.red},
              ].map(s=>(
                <div key={s.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid '+t.border+'44'}}>
                  <div style={{fontSize:12,color:t.textDim}}>{s.label}</div>
                  <div style={{fontSize:14,fontWeight:800,color:s.color}}>{s.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Insights feed */}
          <div>
            {/* Filter tabs */}
            <div style={{display:'flex',gap:6,marginBottom:16}}>
              {(['all','unread','saved'] as const).map(f=>(
                <button key={f} onClick={()=>setFilter(f)} aria-pressed={filter===f}
                  style={{padding:'6px 14px',borderRadius:20,border:'1px solid '+(filter===f?t.teal+'60':t.border),background:filter===f?t.tealDim:'transparent',color:filter===f?t.teal:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700,textTransform:'capitalize'}}>
                  {f}{f==='unread'&&unreadCount>0?` (${unreadCount})`:''}
                </button>
              ))}
            </div>
            <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
              <button
                onClick={()=>setCategoryFilter('all')}
                aria-pressed={categoryFilter==='all'}
                style={{padding:'6px 14px',borderRadius:20,border:'1px solid '+(categoryFilter==='all'?t.orange+'60':t.border),background:categoryFilter==='all'?t.orangeDim:'transparent',color:categoryFilter==='all'?t.orange:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}
              >
                All categories
              </button>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <button
                  key={key}
                  onClick={()=>setCategoryFilter(key)}
                  aria-pressed={categoryFilter===key}
                  style={{padding:'6px 14px',borderRadius:20,border:'1px solid '+(categoryFilter===key?t.orange+'60':t.border),background:categoryFilter===key?t.orangeDim:'transparent',color:categoryFilter===key?t.orange:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:12,fontWeight:700}}
                >
                  {label} {groupedCounts[key] ? `(${groupedCounts[key]})` : ''}
                </button>
              ))}
            </div>

            {filtered.length===0 ? (
              <div style={{background:t.surface,border:'1px solid '+t.border,borderRadius:16,padding:'60px 24px',textAlign:'center'}}>
                <div style={{fontSize:40,marginBottom:12}}>🤖</div>
                <div style={{fontSize:15,fontWeight:800,marginBottom:8}}>
                  {filter==='unread'?'All caught up!':filter==='saved'?'No saved insights yet':'No insights yet'}
                </div>
                <div style={{fontSize:13,color:t.textMuted,maxWidth:340,margin:'0 auto'}}>
                  {filter==='all'?'Select a client and insight type, then hit Generate to get your first AI-powered coaching brief.':''}
                </div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10}}>
                {filtered.map(insight=>{
                  const c = insight.content || {}
                  const fm = FLAG_META[insight.flag_level||'normal'] || FLAG_META.normal
                  const isExpanded = expanded===insight.id
                  const typeLabel = TYPE_LABELS[insight.type]||insight.type
                  const categoryLabel = insight.category ? (CATEGORY_LABELS[insight.category] || 'Uncategorized') : 'Uncategorized'
                  const coachOptions = Array.isArray(c.coach_options) ? c.coach_options : []
                  const bullets = Array.isArray(c.bullets) ? c.bullets : []
                  const sourceCount = getSourceCount(insight.source_refs)
                  const draftMessage = typeof c.draft_message === 'string' ? c.draft_message : insight.coach_draft?.client_message
                  const coachingNote = typeof c.coaching_note === 'string' ? c.coaching_note : insight.coach_draft?.coach_note
                  const programmingAdjustment = insight.coach_draft?.programming_adjustment

                  return (
                    <div key={insight.id}
                      style={{background:t.surface,border:'1px solid '+(insight.flag_level==='urgent'||insight.flag_level==='high'?fm.color+'40':t.border),borderRadius:14,overflow:'hidden',opacity:insight.is_dismissed?0.5:1}}>

                      {/* Header */}
                      <div style={{padding:'14px 16px',cursor:'pointer',display:'flex',gap:12,alignItems:'flex-start'}}
                        onClick={()=>{ setExpanded(isExpanded?null:insight.id); if(!insight.read) markRead(insight.id) }}>

                        <div style={{width:38,height:38,borderRadius:10,background:fm.bg,border:'1px solid '+fm.color+'40',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>
                          {INSIGHT_TYPES.find(it=>it.id===insight.type)?.icon||'🤖'}
                        </div>

                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:3,flexWrap:'wrap'}}>
                            {!insight.read && <div style={{width:7,height:7,borderRadius:'50%',background:t.purple,flexShrink:0}}/>}
                            <div style={{fontSize:13,fontWeight:700}}>{c.title||`${clientName(insight.client_id)} — ${typeLabel}`}</div>
                          </div>
                          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
                            <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,background:fm.bg,color:fm.color}}>{fm.label}</span>
                            <span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:t.surfaceHigh,color:t.textMuted}}>{typeLabel}</span>
                            <span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:t.orangeDim,color:t.orange}}>{categoryLabel}</span>
                            <span style={{fontSize:10,color:t.textMuted}}>👤 {clientName(insight.client_id)}</span>
                            <span style={{fontSize:10,color:t.textMuted}}>
                              {insight.generated_at ? new Date(insight.generated_at).toLocaleDateString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : ''}
                            </span>
                          </div>
                          {!isExpanded && c.summary && (
                            <div style={{fontSize:12,color:t.textDim,marginTop:6,lineHeight:1.5,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as const}}>{c.summary}</div>
                          )}
                        </div>

                        <div style={{display:'flex',gap:4,flexShrink:0}}>
                          <button onClick={e=>{e.stopPropagation();toggleSave(insight.id, !!insight.is_saved)}}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:16,opacity:saving===insight.id?0.5:1}} title="Save">
                            {insight.is_saved?'⭐':'☆'}
                          </button>
                          <button onClick={e=>{e.stopPropagation();dismiss(insight.id)}}
                            style={{background:'none',border:'none',cursor:'pointer',fontSize:12,color:t.textMuted,opacity:0.7}} title="Dismiss">✕</button>
                          <span style={{color:t.textMuted,fontSize:12,marginLeft:4}}>{isExpanded?'▲':'▼'}</span>
                        </div>
                      </div>

                      {/* Expanded body */}
                      {isExpanded && (
                        <div style={{padding:'0 16px 16px',borderTop:'1px solid '+t.border}}>
                          {c.summary && (
                            <div style={{background:t.surfaceUp,borderRadius:10,padding:'12px 14px',marginTop:12,marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',marginBottom:6}}>Summary</div>
                              <div style={{fontSize:13,color:t.text,lineHeight:1.6}}>{c.summary}</div>
                            </div>
                          )}

                          {Array.isArray(c.evidence) && c.evidence.length > 0 && (
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',marginBottom:8}}>Evidence</div>
                              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                {c.evidence.map((item: string, index: number) => (
                                  <div key={index} style={{fontSize:12,color:t.textDim,lineHeight:1.5}}>• {item}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          {bullets.length > 0 && (
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',marginBottom:8}}>Key Points</div>
                              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                                {bullets.map((b:string,i:number)=>(
                                  <div key={i} style={{display:'flex',gap:8,alignItems:'flex-start'}}>
                                    <div style={{width:5,height:5,borderRadius:'50%',background:fm.color,flexShrink:0,marginTop:6}}/>
                                    <div style={{fontSize:12,color:t.textDim,lineHeight:1.5}}>{b}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {c.suggested_action && (
                            <div style={{background:t.purple+'12',border:'1px solid '+t.purple+'30',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.purple,textTransform:'uppercase',marginBottom:4}}>⚡ Suggested Action</div>
                              <div style={{fontSize:13,color:t.text,lineHeight:1.5}}>{c.suggested_action}</div>
                            </div>
                          )}

                          {c.follow_up && (
                            <div style={{background:t.tealDim,border:'1px solid '+t.teal+'30',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.teal,textTransform:'uppercase',marginBottom:4}}>Follow-up</div>
                              <div style={{fontSize:13,color:t.text,lineHeight:1.5}}>{c.follow_up}</div>
                            </div>
                          )}

                          {coachOptions.length > 0 && (
                            <div style={{marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',marginBottom:8}}>Best Options</div>
                              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                                {coachOptions.map((option: CoachOption, index: number) => (
                                  <div key={`${insight.id}-option-${index}`} style={{background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:10,padding:'12px 14px'}}>
                                    <div style={{fontSize:11,fontWeight:800,color:index===0?t.green:index===1?t.orange:t.purple,textTransform:'uppercase',marginBottom:5}}>
                                      {option.label || `Option ${index + 1}`}
                                    </div>
                                    <div style={{fontSize:13,color:t.text,lineHeight:1.5,marginBottom:option.tradeoff ? 6 : 0}}>{option.rationale}</div>
                                    {option.tradeoff && (
                                      <div style={{fontSize:11,color:t.textMuted,lineHeight:1.5}}>Tradeoff: {option.tradeoff}</div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {draftMessage && (
                            <div style={{background:t.surfaceUp,border:'1px solid '+t.border,borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:8}}>
                                <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase'}}>Draft Message</div>
                                <button
                                  onClick={()=>copyDraft(insight.id, draftMessage)}
                                  style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'4px 8px',fontSize:11,fontWeight:700,color:copiedDraft===insight.id?t.green:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}
                                >
                                  {copiedDraft===insight.id ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <div style={{fontSize:13,color:t.text,lineHeight:1.6,whiteSpace:'pre-wrap' as const}}>{draftMessage}</div>
                            </div>
                          )}

                          {(coachingNote || programmingAdjustment) && (
                            <div style={{background:t.orangeDim,border:'1px solid '+t.orange+'30',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
                              <div style={{fontSize:11,fontWeight:800,color:t.orange,textTransform:'uppercase',marginBottom:6}}>Coach Assist</div>
                              {coachingNote && <div style={{fontSize:13,color:t.text,lineHeight:1.5,marginBottom:programmingAdjustment ? 8 : 0}}>{coachingNote}</div>}
                              {programmingAdjustment && <div style={{fontSize:12,color:t.textDim,lineHeight:1.5}}>Programming note: {programmingAdjustment}</div>}
                            </div>
                          )}

                          <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
                            <div style={{fontSize:11,color:t.textMuted,background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:20,padding:'4px 10px'}}>
                              {sourceCount > 0 ? `${sourceCount} source references` : 'No source references stored'}
                            </div>
                            {insight.generation_meta?.model && (
                              <div style={{fontSize:11,color:t.textMuted,background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:20,padding:'4px 10px'}}>
                                {insight.generation_meta.model}
                              </div>
                            )}
                            {(insight.surfaced_count || 0) > 1 && (
                              <div style={{fontSize:11,color:t.textMuted,background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:20,padding:'4px 10px'}}>
                                surfaced {insight.surfaced_count}x
                              </div>
                            )}
                          </div>

                          <div style={{marginBottom:12}}>
                            <div style={{fontSize:11,fontWeight:800,color:t.textMuted,textTransform:'uppercase',marginBottom:8}}>Coach Feedback</div>
                            <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                              {FEEDBACK_OPTIONS.map((option) => (
                                <button
                                  key={option.id}
                                  onClick={()=>submitFeedback(insight.id, option.id)}
                                  disabled={feedbacking===insight.id}
                                  style={{padding:'6px 12px',borderRadius:20,border:'1px solid '+((insight.coach_feedback||'')===option.id ? option.color+'60' : t.border),background:(insight.coach_feedback||'')===option.id ? option.color+'18' : 'transparent',color:(insight.coach_feedback||'')===option.id ? option.color : t.textMuted,cursor:feedbacking===insight.id?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",fontSize:11,fontWeight:700}}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div style={{display:'flex',gap:8,alignItems:'center',justifyContent:'space-between',flexWrap:'wrap'}}>
                            <div style={{fontSize:11,color:t.textMuted}}>
                              Confidence: <span style={{fontWeight:700,color:(insight.confidence || 0) >= 0.75 ? t.green : (insight.confidence || 0) >= 0.5 ? t.orange : t.textMuted}}>{typeof insight.confidence === 'number' ? `${Math.round(insight.confidence * 100)}%` : '—'}</span>
                              {' · '}
                              Status: <span style={{fontWeight:700,color:t.text}}>{insight.action_status || 'unread'}</span>
                              {insight.insight_data?.checkins_analyzed!=null && ` · ${insight.insight_data.checkins_analyzed} check-ins · ${insight.insight_data.sessions_analyzed} sessions · ${insight.insight_data.metrics_analyzed} metrics`}
                            </div>
                            <div style={{display:'flex',gap:6}}>
                              <button onClick={()=>updateActionStatus(insight.id, 'acted_on', { acted_on_at: new Date().toISOString(), is_reviewed: true, reviewed_at: new Date().toISOString() })}
                                disabled={actingOn===insight.id}
                                style={{background:t.greenDim,border:'1px solid '+t.green+'40',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.green,cursor:actingOn===insight.id?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                {actingOn===insight.id ? 'Saving...' : 'Acted on'}
                              </button>
                              <button onClick={()=>updateActionStatus(insight.id, 'snoozed', { snoozed_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() })}
                                disabled={actingOn===insight.id}
                                style={{background:t.surfaceHigh,border:'1px solid '+t.border,borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.textMuted,cursor:actingOn===insight.id?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                Snooze 1d
                              </button>
                              <button onClick={()=>addToCalendar(insight)} disabled={addingCal===insight.id}
                                style={{background:insight.is_reviewed?t.surfaceHigh:t.tealDim,border:'1px solid '+(insight.is_reviewed?t.border:t.teal+'40'),borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:insight.is_reviewed?t.textMuted:t.teal,cursor:addingCal===insight.id?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:addingCal===insight.id?0.6:1}}>
                                {addingCal===insight.id?'Adding...':insight.is_reviewed?'✓ On Calendar':'📅 Add to Calendar'}
                              </button>
                              <button onClick={()=>toggleSave(insight.id, !!insight.is_saved)}
                                style={{background:insight.is_saved?t.yellow+'18':'transparent',border:'1px solid '+(insight.is_saved?t.yellow+'60':t.border),borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:insight.is_saved?t.yellow:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                {insight.is_saved?'⭐ Saved':'☆ Save'}
                              </button>
                              <button onClick={()=>dismiss(insight.id)}
                                style={{background:t.redDim,border:'1px solid '+t.red+'40',borderRadius:8,padding:'5px 10px',fontSize:11,fontWeight:700,color:t.red,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                                Dismiss
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
