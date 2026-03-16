'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', purple:'#8b5cf6', purpleDim:'#8b5cf615',
  red:'#ef4444', redDim:'#ef444415', green:'#22c55e', greenDim:'#22c55e15',
  yellow:'#eab308', yellowDim:'#eab30815',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

// Pre-written message templates per trigger type
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  missed_checkin: {
    subject: 'Hey — checking in on you 👋',
    body: `Hey {name}! I noticed I didn't get a check-in from you this week. No pressure at all — just wanted to make sure everything's okay and see if you need anything from me. Drop me a note when you get a chance! 💪`
  },
  missed_workout: {
    subject: 'Missing you in the gym 💪',
    body: `Hey {name}! Looks like a session got skipped this week — totally happens, life gets busy. Just checking in to see if you need any adjustments to your schedule or program. What's going on? Let's figure it out together.`
  },
  no_activity: {
    subject: 'Let\'s reconnect 🤝',
    body: `Hey {name}! It's been a little quiet on your end lately — I just wanted to reach out and check in. How are you feeling? Any roadblocks or anything I can help with? I'm here for you.`
  },
}

type Trigger = {
  type: 'missed_checkin' | 'missed_workout' | 'no_activity'
  client: any
  detail: string
  icon: string
  color: string
}

export default function OutreachPage() {
  const supabase = createClient()
  const router = useRouter()
  const [coachId, setCoachId] = useState<string|null>(null)
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [loading, setLoading] = useState(true)
  const [composing, setComposing] = useState<Trigger|null>(null)
  const [msgBody, setMsgBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [templates, setTemplates] = useState<any[]>([])

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)

    // Load active clients
    const { data: clients } = await supabase
      .from('clients')
      .select('id, profile_id, profile:profiles!profile_id(full_name, email)')
      .eq('coach_id', user.id).eq('active', true).eq('paused', false)

    if (!clients?.length) { setLoading(false); return }

    const now = new Date()
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const found: Trigger[] = []

    for (const client of clients) {
      const name = (client.profile as any)?.full_name || 'your client'

      // Check: no check-in in last 7 days
      const { data: recentCheckin } = await supabase
        .from('checkins').select('id').eq('client_id', client.id)
        .gte('submitted_at', sevenDaysAgo).limit(1)
      if (!recentCheckin?.length) {
        found.push({
          type: 'missed_checkin', client,
          detail: 'No check-in in 7+ days',
          icon: '📋', color: t.orange
        })
      }

      // Check: no completed workout in 7 days
      const { data: recentWorkout } = await supabase
        .from('workout_sessions').select('id').eq('client_id', client.id)
        .eq('status', 'completed').gte('completed_at', sevenDaysAgo).limit(1)
      if (!recentWorkout?.length) {
        // Only flag if they have assigned workouts (otherwise might not have a program)
        const { data: hasWorkouts } = await supabase
          .from('workout_sessions').select('id').eq('client_id', client.id).limit(1)
        if (hasWorkouts?.length) {
          found.push({
            type: 'missed_workout', client,
            detail: 'No completed workout in 7+ days',
            icon: '💪', color: t.red
          })
        }
      }

      // Check: totally inactive for 14 days (no checkin, no workout, no message)
      const { data: recentMsg } = await supabase
        .from('messages').select('id').eq('sender_id', client.profile_id)
        .gte('created_at', fourteenDaysAgo).limit(1)
      const { data: recentCheckin14 } = await supabase
        .from('checkins').select('id').eq('client_id', client.id)
        .gte('submitted_at', fourteenDaysAgo).limit(1)
      if (!recentMsg?.length && !recentCheckin14?.length) {
        // Don't double-add if already has a missed_checkin trigger
        const alreadyFlagged = found.some(f => f.client.id === client.id && f.type === 'missed_checkin')
        if (!alreadyFlagged) {
          found.push({
            type: 'no_activity', client,
            detail: 'No activity in 14+ days',
            icon: '😴', color: t.purple
          })
        }
      }
    }

    // Load custom message templates
    const { data: tmpl } = await supabase.from('message_templates').select('*').eq('coach_id', user.id)
    setTemplates(tmpl || [])
    setTriggers(found)
    setLoading(false)
  }

  function openCompose(trigger: Trigger) {
    const tmpl = DEFAULT_TEMPLATES[trigger.type]
    const name = (trigger.client.profile as any)?.full_name?.split(' ')[0] || 'there'
    setMsgBody(tmpl.body.replace('{name}', name))
    setComposing(trigger)
  }

  async function sendMessage() {
    if (!composing || !msgBody.trim() || !coachId) return
    setSending(true)
    await supabase.from('messages').insert({
      sender_id: coachId,
      recipient_id: composing.client.profile_id,
      body: msgBody.trim(),
      read: false,
    })
    // Notify the client
    await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: composing.client.profile_id,
        notification_type: 'message',
        title: 'New message from your coach',
        body: msgBody.trim().slice(0, 80) + (msgBody.length > 80 ? '...' : ''),
        link_url: '/dashboard/client'
      })
    }).catch(() => {})
    const key = `${composing.type}-${composing.client.id}`
    setSentIds(prev => new Set([...prev, key]))
    setSending(false)
    setComposing(null)
    setMsgBody('')
  }

  async function dismiss(trigger: Trigger) {
    const key = `${trigger.type}-${trigger.client.id}`
    setSentIds(prev => new Set([...prev, key]))
  }

  const active = triggers.filter(tr => !sentIds.has(`${tr.type}-${tr.client.id}`))

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",padding:'24px',maxWidth:760,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>← Dashboard</button>
          <div style={{flex:1}}/>
          <h1 style={{fontSize:22,fontWeight:900}}>📣 Outreach</h1>
          <div style={{flex:1}}/>
          <button onClick={load} style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:9,padding:'7px 14px',fontSize:12,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>↻ Refresh</button>
        </div>

        {/* Info banner */}
        <div style={{background:t.tealDim,border:`1px solid ${t.teal}30`,borderRadius:12,padding:'12px 16px',marginBottom:20,fontSize:13,color:t.teal,lineHeight:1.6}}>
          <strong>How it works:</strong> These clients may need a check-in from you. Review each one, edit the pre-written message if needed, and hit Send. You're always in control — nothing goes out without you clicking send.
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>Scanning client activity...</div>
        ) : active.length === 0 ? (
          <div style={{textAlign:'center',padding:'60px 20px'}}>
            <div style={{fontSize:48,marginBottom:16}}>🎉</div>
            <div style={{fontSize:18,fontWeight:800,marginBottom:8}}>All caught up!</div>
            <div style={{fontSize:14,color:t.textMuted}}>No clients need outreach right now. Check back later or refresh.</div>
          </div>
        ) : (
          <>
            <div style={{fontSize:13,color:t.textMuted,marginBottom:14}}>
              {active.length} client{active.length !== 1 ? 's' : ''} may need a message from you
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {active.map(trigger => {
                const name = (trigger.client.profile as any)?.full_name || 'Client'
                const initials = name.split(' ').map((n:string)=>n[0]).join('')
                const isComposing = composing?.type === trigger.type && composing?.client.id === trigger.client.id
                return (
                  <div key={`${trigger.type}-${trigger.client.id}`}
                    style={{background:t.surface,border:`1px solid ${isComposing?trigger.color+'60':t.border}`,borderRadius:16,overflow:'hidden',transition:'border-color .2s'}}>

                    {/* Top accent line */}
                    <div style={{height:3,background:`linear-gradient(90deg,${trigger.color},${trigger.color}88)`}}/>

                    {/* Card content */}
                    <div style={{padding:'14px 18px',display:'flex',alignItems:'center',gap:14}}>
                      {/* Avatar */}
                      <div style={{width:44,height:44,borderRadius:12,background:`linear-gradient(135deg,${trigger.color},${trigger.color}88)`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,fontWeight:900,color:'#000',flexShrink:0}}>
                        {initials}
                      </div>
                      <div style={{flex:1}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3}}>
                          <span style={{fontSize:14,fontWeight:800}}>{name}</span>
                          <span style={{fontSize:10,fontWeight:700,color:trigger.color,background:trigger.color+'22',borderRadius:6,padding:'2px 8px'}}>
                            {trigger.icon} {trigger.detail}
                          </span>
                        </div>
                        <div style={{fontSize:12,color:t.textMuted}}>{(trigger.client.profile as any)?.email}</div>
                      </div>
                      <div style={{display:'flex',gap:8}}>
                        <button onClick={()=>router.push('/dashboard/coach/clients/'+trigger.client.id)}
                          style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:9,padding:'7px 12px',fontSize:12,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                          Profile →
                        </button>
                        <button onClick={()=>dismiss(trigger)}
                          style={{background:'transparent',border:`1px solid ${t.border}`,borderRadius:9,padding:'7px 10px',fontSize:12,color:t.textMuted,cursor:'pointer'}}>
                          ✕
                        </button>
                        <button onClick={()=>isComposing ? setComposing(null) : openCompose(trigger)}
                          style={{background:isComposing?t.surfaceHigh:`linear-gradient(135deg,${trigger.color},${trigger.color}cc)`,border:`1px solid ${isComposing?t.border:'transparent'}`,borderRadius:9,padding:'7px 14px',fontSize:12,fontWeight:700,color:isComposing?t.textDim:'#000',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                          {isComposing ? 'Cancel' : '✉️ Send Message'}
                        </button>
                      </div>
                    </div>

                    {/* Compose area */}
                    {isComposing && (
                      <div style={{padding:'0 18px 18px',borderTop:`1px solid ${t.border}`,paddingTop:16}}>
                        <div style={{fontSize:11,fontWeight:700,color:t.textMuted,marginBottom:8,textTransform:'uppercase',letterSpacing:'0.08em'}}>Message to {name.split(' ')[0]}</div>
                        <textarea
                          value={msgBody}
                          onChange={e=>setMsgBody(e.target.value)}
                          rows={5}
                          style={{width:'100%',background:t.surfaceUp,border:`1px solid ${trigger.color}40`,borderRadius:10,padding:'11px 14px',fontSize:13,color:t.text,outline:'none',resize:'vertical',fontFamily:"'DM Sans',sans-serif",lineHeight:1.6,colorScheme:'dark',boxSizing:'border-box'}}
                        />
                        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:10}}>
                          <button onClick={()=>setComposing(null)}
                            style={{background:'transparent',border:`1px solid ${t.border}`,borderRadius:9,padding:'9px 16px',fontSize:13,fontWeight:600,color:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                            Cancel
                          </button>
                          <button onClick={sendMessage} disabled={!msgBody.trim()||sending}
                            style={{background:`linear-gradient(135deg,${trigger.color},${trigger.color}cc)`,border:'none',borderRadius:9,padding:'9px 20px',fontSize:13,fontWeight:800,color:'#000',cursor:!msgBody.trim()||sending?'not-allowed':'pointer',fontFamily:"'DM Sans',sans-serif",opacity:!msgBody.trim()||sending?.6:1}}>
                            {sending ? 'Sending...' : '✓ Send Message'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}
