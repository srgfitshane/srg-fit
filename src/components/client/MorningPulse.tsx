'use client'
/**
 * MorningPulse — 3-tap daily check-in
 * Step 1: Sleep quality (1-5 stars)
 * Step 2: Energy level (1-5 bolts)
 * Step 3: Mood emoji pick
 * Then: optional journal entry
 */
import { useState } from 'react'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6', purpleDim:'#8b5cf615',
  pink:'#f472b6', yellow:'#facc15', green:'#22c55e', red:'#ef4444',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const MOODS = [
  { emoji:'😴', label:'Tired'    },
  { emoji:'😐', label:'Meh'      },
  { emoji:'🙂', label:'Good'     },
  { emoji:'😄', label:'Great'    },
  { emoji:'🔥', label:'On fire!' },
]

interface Props {
  clientId: string
  today: string
  supabase: any
  // Existing data if already submitted today
  existing?: {
    sleep_quality?: number
    energy_score?: number
    mood_emoji?: string
    body?: string
    is_private?: boolean
  } | null
  onSaved?: () => void
}

export default function MorningPulse({ clientId, today, supabase, existing, onSaved }: Props) {
  const alreadyDone = !!(existing?.sleep_quality || existing?.energy_score || existing?.mood_emoji)

  const [step,         setStep]         = useState<'sleep'|'energy'|'mood'|'journal'|'done'>(alreadyDone ? 'done' : 'sleep')
  const [sleep,        setSleep]        = useState(existing?.sleep_quality || 0)
  const [energy,       setEnergy]       = useState(existing?.energy_score  || 0)
  const [mood,         setMood]         = useState(existing?.mood_emoji    || '')
  const [journal,      setJournal]      = useState(existing?.body          || '')
  const [isPrivate,    setIsPrivate]    = useState(existing?.is_private    ?? true)
  const [saving,       setSaving]       = useState(false)
  const [collapsed,    setCollapsed]    = useState(alreadyDone)

  const save = async (finalJournal = journal, finalPrivate = isPrivate) => {
    if (!clientId) return
    setSaving(true)
    await supabase.from('daily_checkins').upsert({
      client_id:     clientId,
      checkin_date:  today,
      sleep_quality: sleep || null,
      energy_score:  energy || null,
      mood_emoji:    mood   || null,
      body:          finalJournal.trim() || null,
      is_private:    finalPrivate,
    }, { onConflict: 'client_id,checkin_date' })
    setSaving(false)
    setStep('done')
    setCollapsed(true)
    onSaved?.()
  }

  const stepNext = (val: number, setter: (v: number) => void, next: 'sleep'|'energy'|'mood'|'journal'|'done') => {
    setter(val)
    setTimeout(() => setStep(next), 180) // slight delay feels snappy
  }

  const pickMood = (emoji: string) => {
    setMood(emoji)
    setTimeout(() => setStep('journal'), 180)
  }

  // ── Done / collapsed state ───────────────────────────────────────────────
  if (step === 'done' || collapsed) {
    const summary = [
      sleep  ? '⭐'.repeat(sleep)          : null,
      energy ? '⚡'.repeat(energy)         : null,
      mood   || null,
    ].filter(Boolean).join('  ')

    return (
      <div style={{ background:t.surface, border:'1px solid '+t.green+'40', borderRadius:16, overflow:'hidden', marginBottom:14 }}>
        <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }}/>
        <button onClick={()=>setCollapsed(c=>!c)}
          style={{ width:'100%', background:'none', border:'none', padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ width:38, height:38, borderRadius:11, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
            {mood || '🌅'}
          </div>
          <div style={{ flex:1, textAlign:'left' as const }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.text }}>Morning Pulse</div>
            <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>
              {summary ? summary : '✓ Logged today'}
            </div>
          </div>
          <span style={{ fontSize:11, color:t.green, fontWeight:700 }}>✓ Done</span>
        </button>

        {!collapsed && (
          <div style={{ padding:'0 16px 16px' }}>
            {/* Re-show summary with edit option */}
            <div style={{ display:'flex', gap:16, marginBottom:14, flexWrap:'wrap' }}>
              {sleep > 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>SLEEP</div>
                  <div style={{ display:'flex', gap:2 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ fontSize:20, opacity: n<=sleep?1:0.2 }}>⭐</span>
                    ))}
                  </div>
                </div>
              )}
              {energy > 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>ENERGY</div>
                  <div style={{ display:'flex', gap:2 }}>
                    {[1,2,3,4,5].map(n => (
                      <span key={n} style={{ fontSize:20, opacity: n<=energy?1:0.2 }}>⚡</span>
                    ))}
                  </div>
                </div>
              )}
              {mood && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>MOOD</div>
                  <span style={{ fontSize:28 }}>{mood}</span>
                </div>
              )}
            </div>
            {journal && (
              <div style={{ background:t.surfaceHigh, borderRadius:10, padding:'10px 12px', fontSize:13, color:t.textDim, lineHeight:1.6, marginBottom:12 }}>
                {journal}
              </div>
            )}
            <button onClick={()=>{ setStep('sleep'); setCollapsed(false) }}
              style={{ background:'none', border:'1px solid '+t.border, borderRadius:10, padding:'8px 16px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Edit today's check-in
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Active check-in ──────────────────────────────────────────────────────
  return (
    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }}>
      <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }}/>
      <div style={{ padding:'16px 16px 20px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
            🌅
          </div>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>Morning Pulse</div>
            <div style={{ fontSize:11, color:t.textMuted }}>Quick check-in — 3 taps</div>
          </div>
          {/* Step dots */}
          <div style={{ marginLeft:'auto', display:'flex', gap:5 }}>
            {(['sleep','energy','mood','journal'] as const).map((s, i) => (
              <div key={s} style={{ width:6, height:6, borderRadius:'50%', background: step===s ? t.teal : (
                (s==='sleep'&&sleep) || (s==='energy'&&energy) || (s==='mood'&&mood) ? t.teal+'60' : t.border
              )}}/>
            ))}
          </div>
        </div>

        {/* ── STEP 1: SLEEP ── */}
        {step === 'sleep' && (
          <div style={{ textAlign:'center' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>How did you sleep?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Tap a star</div>
            <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n}
                  onClick={()=>stepNext(n, setSleep, 'energy')}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:40, padding:'4px', transform: sleep===n?'scale(1.2)':'scale(1)', transition:'transform 0.1s', WebkitTapHighlightColor:'transparent' }}>
                  {n <= (sleep || 0) ? '⭐' : '☆'}
                </button>
              ))}
            </div>
            {sleep > 0 && (
              <div style={{ marginTop:12, fontSize:12, color:t.teal, fontWeight:700 }}>
                {['','Rough night 😓','Could be better','Not bad 🙂','Pretty good!','Crushed it! 💪'][sleep]}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: ENERGY ── */}
        {step === 'energy' && (
          <div style={{ textAlign:'center' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Energy level?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Tap a bolt</div>
            <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n}
                  onClick={()=>stepNext(n, setEnergy, 'mood')}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:40, padding:'4px', opacity: n <= (energy || 0) ? 1 : 0.25, transition:'opacity 0.1s, transform 0.1s', transform: energy===n?'scale(1.2)':'scale(1)', WebkitTapHighlightColor:'transparent' }}>
                  ⚡
                </button>
              ))}
            </div>
            {energy > 0 && (
              <div style={{ marginTop:12, fontSize:12, color:t.yellow, fontWeight:700 }}>
                {['','Running on empty','Low tank','Half charged','Feeling good','FULLY CHARGED! 🔋'][energy]}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: MOOD ── */}
        {step === 'mood' && (
          <div style={{ textAlign:'center' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>How's your mood?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Pick one</div>
            <div style={{ display:'flex', justifyContent:'center', gap:8 }}>
              {MOODS.map(m => (
                <button key={m.emoji}
                  onClick={()=>pickMood(m.emoji)}
                  style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4, background: mood===m.emoji ? t.tealDim : t.surfaceHigh, border:'1px solid '+(mood===m.emoji ? t.teal+'40' : t.border), borderRadius:12, padding:'10px 8px', cursor:'pointer', transition:'all 0.15s', WebkitTapHighlightColor:'transparent', minWidth:52 }}>
                  <span style={{ fontSize:28, lineHeight:1 }}>{m.emoji}</span>
                  <span style={{ fontSize:9, color: mood===m.emoji ? t.teal : t.textMuted, fontWeight:700, fontFamily:"'DM Sans',sans-serif" }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 4: JOURNAL ── */}
        {step === 'journal' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>Anything on your mind?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>Optional — this is your space</div>

            {/* Summary pills */}
            <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap' }}>
              {sleep > 0 && <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>{'⭐'.repeat(sleep)} sleep</span>}
              {energy > 0 && <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>{'⚡'.repeat(energy)} energy</span>}
              {mood && <span style={{ fontSize:16 }}>{mood}</span>}
            </div>

            <textarea
              value={journal}
              onChange={e=>setJournal(e.target.value)}
              placeholder="Wins, worries, whatever's on your mind. Shane sees this only if you choose to share it."
              rows={3}
              autoFocus
              style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:11, padding:'11px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none', lineHeight:1.6, boxSizing:'border-box' as const, colorScheme:'dark' as const, marginBottom:10 }}
            />

            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <button onClick={()=>setIsPrivate(p=>!p)}
                style={{ display:'flex', alignItems:'center', gap:6, background:isPrivate?t.surfaceHigh:t.tealDim, border:'1px solid '+(isPrivate?t.border:t.teal+'40'), borderRadius:20, padding:'5px 12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
                <span style={{ fontSize:12 }}>{isPrivate ? '🔒' : '👁️'}</span>
                <span style={{ fontSize:11, fontWeight:700, color:isPrivate?t.textMuted:t.teal }}>
                  {isPrivate ? 'Private' : 'Share with Coach'}
                </span>
              </button>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>save('', isPrivate)} disabled={saving}
                  style={{ background:'none', border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Skip
                </button>
                <button onClick={()=>save(journal, isPrivate)} disabled={saving}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'9px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
                  {saving ? 'Saving...' : 'Done ✓'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back link for sleep/energy/mood steps */}
        {step !== 'journal' && (
          <div style={{ textAlign:'center' as const, marginTop:16 }}>
            <button onClick={()=>{
              if(step==='energy') setStep('sleep')
              else if(step==='mood') setStep('energy')
            }} style={{ background:'none', border:'none', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity: step==='sleep'?0:1, pointerEvents: step==='sleep'?'none':'auto' }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
