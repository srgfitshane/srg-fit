'use client'
/**
 * MorningPulse — daily check-in
 * Step 1: Sleep quality (1-5 stars)
 * Step 2: Energy level (1-5 bolts)
 * Step 3: Sliders — Stress / Mood / Energy (1-10)
 * Step 4: Optional journal
 */
import { useState } from 'react'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', purple:'#8b5cf6', purpleDim:'#8b5cf615',
  pink:'#f472b6', yellow:'#facc15', green:'#22c55e', red:'#ef4444',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

interface Props {
  clientId: string
  today: string
  supabase: any
  existing?: {
    sleep_quality?: number
    energy_score?: number
    stress_score?: number
    mood_score?: number
    body?: string
    is_private?: boolean
  } | null
  onSaved?: () => void
}

export default function MorningPulse({ clientId, today, supabase, existing, onSaved }: Props) {
  const alreadyDone = !!(existing?.sleep_quality || existing?.energy_score || existing?.stress_score)

  const [step,      setStep]      = useState<'sleep'|'energy'|'sliders'|'journal'|'done'>(alreadyDone ? 'done' : 'sleep')
  const [sleep,     setSleep]     = useState(existing?.sleep_quality || 0)
  const [energy,    setEnergy]    = useState(existing?.energy_score  || 0)
  const [sliders,   setSliders]   = useState({
    stress: existing?.stress_score || 5,
    mood:   existing?.mood_score   || 5,
  })
  const [journal,   setJournal]   = useState(existing?.body       || '')
  const [isPrivate, setIsPrivate] = useState(existing?.is_private ?? true)
  const [saving,    setSaving]    = useState(false)
  const [collapsed, setCollapsed] = useState(alreadyDone)

  const save = async (finalJournal = journal, finalPrivate = isPrivate) => {
    if (!clientId) return
    setSaving(true)
    await supabase.from('daily_checkins').upsert({
      client_id:     clientId,
      checkin_date:  today,
      sleep_quality: sleep  || null,
      energy_score:  energy || null,
      stress_score:  sliders.stress,
      mood_score:    sliders.mood,
      body:          finalJournal.trim() || null,
      is_private:    finalPrivate,
    }, { onConflict: 'client_id,checkin_date' })
    setSaving(false)
    setStep('done')
    setCollapsed(true)
    onSaved?.()
  }

  const stepNext = (val: number, setter: (v: number) => void, next: 'sleep'|'energy'|'sliders'|'journal'|'done') => {
    setter(val)
    setTimeout(() => setStep(next), 180)
  }

  // ── Done / collapsed ──────────────────────────────────────────────────────
  if (step === 'done' || collapsed) {
    const summary = [
      sleep  ? '⭐'.repeat(sleep)  : null,
      energy ? '⚡'.repeat(energy) : null,
    ].filter(Boolean).join('  ')

    return (
      <div style={{ background:t.surface, border:'1px solid '+t.green+'40', borderRadius:16, overflow:'hidden', marginBottom:14 }}>
        <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }}/>
        <button onClick={()=>setCollapsed(c=>!c)}
          style={{ width:'100%', background:'none', border:'none', padding:'14px 16px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontFamily:"'DM Sans',sans-serif" }}>
          <div style={{ width:38, height:38, borderRadius:11, background:t.tealDim, border:'1px solid '+t.teal+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🌅</div>
          <div style={{ flex:1, textAlign:'left' as const }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.text }}>Morning Pulse</div>
            <div style={{ fontSize:11, color:t.textMuted, marginTop:1 }}>
              {summary || '✓ Logged today'}
              {sliders.stress > 0 && <>  · Stress {sliders.stress}/10 · Mood {sliders.mood}/10</>}
            </div>
          </div>
          <span style={{ fontSize:11, color:t.green, fontWeight:700 }}>✓ Done</span>
        </button>

        {!collapsed && (
          <div style={{ padding:'0 16px 16px' }}>
            <div style={{ display:'flex', gap:16, marginBottom:14, flexWrap:'wrap' as const }}>
              {sleep > 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>SLEEP</div>
                  <div style={{ display:'flex', gap:2 }}>
                    {[1,2,3,4,5].map(n=><span key={n} style={{ fontSize:20, opacity:n<=sleep?1:0.2 }}>⭐</span>)}
                  </div>
                </div>
              )}
              {energy > 0 && (
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>ENERGY</div>
                  <div style={{ display:'flex', gap:2 }}>
                    {[1,2,3,4,5].map(n=><span key={n} style={{ fontSize:20, opacity:n<=energy?1:0.2 }}>⚡</span>)}
                  </div>
                </div>
              )}
              {[
                { label:'STRESS', val:sliders.stress, color:t.red },
                { label:'MOOD',   val:sliders.mood,   color:t.pink },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>{s.label}</div>
                  <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}<span style={{ fontSize:10, color:t.textMuted }}>/10</span></div>
                </div>
              ))}
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
  const STEPS = ['sleep','energy','sliders','journal'] as const
  const stepIdx = STEPS.indexOf(step as any)

  return (
    <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden', marginBottom:14 }}>
      <div style={{ height:3, background:'linear-gradient(90deg,'+t.teal+','+t.purple+')' }}/>
      <div style={{ padding:'16px 16px 20px' }}>

        {/* Header + step dots */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
          <div style={{ width:38, height:38, borderRadius:11, background:t.purpleDim, border:'1px solid '+t.purple+'30', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🌅</div>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>Morning Pulse</div>
            <div style={{ fontSize:11, color:t.textMuted }}>Daily check-in</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:5 }}>
            {STEPS.map((s,i) => (
              <div key={s} style={{ width:6, height:6, borderRadius:'50%', background: i===stepIdx ? t.teal : i<stepIdx ? t.teal+'60' : t.border }}/>
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
                <button key={n} onClick={()=>stepNext(n, setSleep, 'energy')}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:40, padding:'4px', transform:sleep===n?'scale(1.2)':'scale(1)', transition:'transform 0.1s', WebkitTapHighlightColor:'transparent' }}>
                  {n<=(sleep||0)?'⭐':'☆'}
                </button>
              ))}
            </div>
            {sleep>0 && <div style={{ marginTop:12, fontSize:12, color:t.teal, fontWeight:700 }}>{['','Rough night 😓','Could be better','Not bad 🙂','Pretty good!','Crushed it! 💪'][sleep]}</div>}
          </div>
        )}

        {/* ── STEP 2: ENERGY ── */}
        {step === 'energy' && (
          <div style={{ textAlign:'center' as const }}>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>Energy level?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>Tap a bolt</div>
            <div style={{ display:'flex', justifyContent:'center', gap:10 }}>
              {[1,2,3,4,5].map(n => (
                <button key={n} onClick={()=>stepNext(n, setEnergy, 'sliders')}
                  style={{ background:'none', border:'none', cursor:'pointer', fontSize:40, padding:'4px', opacity:n<=(energy||0)?1:0.25, transition:'opacity 0.1s, transform 0.1s', transform:energy===n?'scale(1.2)':'scale(1)', WebkitTapHighlightColor:'transparent' }}>
                  ⚡
                </button>
              ))}
            </div>
            {energy>0 && <div style={{ marginTop:12, fontSize:12, color:t.yellow, fontWeight:700 }}>{['','Running on empty','Low tank','Half charged','Feeling good','FULLY CHARGED! 🔋'][energy]}</div>}
          </div>
        )}

        {/* ── STEP 3: SLIDERS ── */}
        {step === 'sliders' && (
          <div>
            <div style={{ fontSize:16, fontWeight:800, marginBottom:4 }}>How are you feeling?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:18 }}>Stress & Mood</div>
            {([
              { key:'stress' as const, label:'😤 Stress', low:'Chill', high:'Maxed',    color:t.red  },
              { key:'mood'   as const, label:'😊 Mood',   low:'Low',  high:'Great',     color:t.pink },
            ]).map(({ key, label, low, high, color }) => (
              <div key={key} style={{ marginBottom:18 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:t.textDim }}>{label}</div>
                  <div style={{ fontSize:16, fontWeight:900, color }}>{sliders[key]}</div>
                </div>
                <input type="range" min={1} max={10} value={sliders[key]}
                  onChange={e=>setSliders(p=>({...p,[key]:+e.target.value}))}
                  style={{ width:'100%', accentColor:color, cursor:'pointer', height:4 }}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:t.textMuted, marginTop:3 }}>
                  <span>1 — {low}</span><span>10 — {high}</span>
                </div>
              </div>
            ))}
            <button onClick={()=>setStep('journal')}
              style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.purple+','+t.purple+'cc)', color:'#fff', fontSize:14, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginTop:4 }}>
              Next →
            </button>
          </div>
        )}

        {/* ── STEP 4: JOURNAL ── */}
        {step === 'journal' && (
          <div>
            <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>Anything on your mind?</div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:12 }}>Optional — this is your space</div>
            <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap' as const }}>
              {sleep>0  && <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>{'⭐'.repeat(sleep)} sleep</span>}
              {energy>0 && <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>{'⚡'.repeat(energy)} energy</span>}
              <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>Stress {sliders.stress}/10</span>
              <span style={{ fontSize:12, background:t.surfaceHigh, borderRadius:20, padding:'4px 10px', color:t.textDim }}>Mood {sliders.mood}/10</span>
            </div>
            <textarea value={journal} onChange={e=>setJournal(e.target.value)} autoFocus rows={3}
              placeholder="Wins, worries, whatever's on your mind. Shane sees this only if you choose to share it."
              style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:11, padding:'11px 13px', fontSize:13, color:t.text, fontFamily:"'DM Sans',sans-serif", resize:'none', outline:'none', lineHeight:1.6, boxSizing:'border-box' as const, colorScheme:'dark' as const, marginBottom:10 }}
            />
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <button onClick={()=>setIsPrivate(p=>!p)}
                style={{ display:'flex', alignItems:'center', gap:6, background:isPrivate?t.surfaceHigh:t.tealDim, border:'1px solid '+(isPrivate?t.border:t.teal+'40'), borderRadius:20, padding:'5px 12px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", transition:'all 0.2s' }}>
                <span style={{ fontSize:12 }}>{isPrivate?'🔒':'👁️'}</span>
                <span style={{ fontSize:11, fontWeight:700, color:isPrivate?t.textMuted:t.teal }}>{isPrivate?'Private':'Share with Coach'}</span>
              </button>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={()=>save('', isPrivate)} disabled={saving}
                  style={{ background:'none', border:'1px solid '+t.border, borderRadius:10, padding:'9px 14px', fontSize:12, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Skip
                </button>
                <button onClick={()=>save(journal, isPrivate)} disabled={saving}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'9px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:saving?0.6:1 }}>
                  {saving?'Saving...':'Done ✓'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Back button */}
        {step !== 'journal' && (
          <div style={{ textAlign:'center' as const, marginTop:16 }}>
            <button onClick={()=>{
              if(step==='energy') setStep('sleep')
              else if(step==='sliders') setStep('energy')
            }} style={{ background:'none', border:'none', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity:step==='sleep'?0:1, pointerEvents:step==='sleep'?'none':'auto' }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
