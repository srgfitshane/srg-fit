'use client'
import { useState } from 'react'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444',
}

// ── Drop your real Stripe price IDs here ──────────────────────────────────
const PLANS = [
  {
    id: 'monthly',
    label: 'Monthly',
    price: '$200',
    interval: '/month',
    badge: null,
    priceId: 'price_REPLACE_WITH_MONTHLY_PRICE_ID',
    description: 'Billed once a month. Cancel anytime.',
  },
  {
    id: 'weekly',
    label: 'Weekly',
    price: '$50',
    interval: '/week',
    badge: 'Most Flexible',
    priceId: 'price_REPLACE_WITH_WEEKLY_PRICE_ID',
    description: 'Billed every week. No commitment.',
  },
]

const FEATURES = [
  { icon:'🎥', title:'Async Video Review', desc:'Every workout reviewed with personal video feedback within 24 hours — your coaching, not an AI.' },
  { icon:'📋', title:'Custom Programming', desc:'Programs built specifically for you, adjusted every week based on how you\'re actually doing.' },
  { icon:'📊', title:'Full Progress Tracking', desc:'Workouts, nutrition, sleep, mood — all in one place so nothing gets missed.' },
  { icon:'💬', title:'Direct Access to Shane', desc:'Real messaging, real accountability. You get me, not a chatbot.' },
]

export default function JoinPage() {
  const [selected, setSelected] = useState<string>('monthly')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

  const selectedPlan = PLANS.find(p => p.id === selected)!

  const handleJoin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: selectedPlan.priceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Hero */}
        <div style={{ maxWidth:600, margin:'0 auto', padding:'60px 24px 32px', textAlign:'center' }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:34, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>
              SRG FIT
            </div>
            <div style={{ fontSize:11, color:t.textMuted, letterSpacing:'0.15em', textTransform:'uppercase' }}>
              STRENGTH · COMPASSION · LEGENDARY SUPPORT
            </div>
          </div>
          <div style={{ fontSize:30, fontWeight:900, lineHeight:1.2, marginBottom:12 }}>
            Real Coaching.<br />
            <span style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              Not a Template.
            </span>
          </div>
          <div style={{ fontSize:15, color:t.textMuted, lineHeight:1.7, maxWidth:460, margin:'0 auto' }}>
            1-on-1 online coaching built around you. Every workout reviewed personally by Coach Shane within 24 hours.
          </div>
        </div>

        {/* Plan selector */}
        <div style={{ maxWidth:600, margin:'0 auto', padding:'0 24px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:14 }}>
            Choose Your Plan
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {PLANS.map(plan => {
              const active = selected === plan.id
              return (
                <button key={plan.id} onClick={() => setSelected(plan.id)}
                  style={{
                    background: active ? t.tealDim : t.surface,
                    border: `2px solid ${active ? t.teal : t.border}`,
                    borderRadius:16, padding:'18px 16px', cursor:'pointer',
                    fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const,
                    position:'relative', transition:'all .15s',
                  }}>
                  {plan.badge && (
                    <div style={{ position:'absolute', top:-10, right:12, background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, color:'#000', fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:20, letterSpacing:'0.05em' }}>
                      {plan.badge}
                    </div>
                  )}
                  <div style={{ fontSize:13, fontWeight:700, color: active ? t.teal : t.textMuted, marginBottom:6 }}>{plan.label}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
                    <span style={{ fontSize:28, fontWeight:900, color:t.text }}>{plan.price}</span>
                    <span style={{ fontSize:13, color:t.textMuted }}>{plan.interval}</span>
                  </div>
                  <div style={{ fontSize:11, color:t.textDim, marginTop:6, lineHeight:1.5 }}>{plan.description}</div>
                  {active && (
                    <div style={{ position:'absolute', top:12, right:14, width:18, height:18, borderRadius:'50%', background:t.teal, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* CTA */}
          <button onClick={handleJoin} disabled={loading}
            style={{
              width:'100%', padding:'16px', borderRadius:14, border:'none',
              background: loading ? t.surfaceUp : `linear-gradient(135deg,${t.teal},${t.orange})`,
              color: loading ? t.textMuted : '#000',
              fontSize:16, fontWeight:900, cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily:"'DM Sans',sans-serif", transition:'all .2s', marginBottom:10,
            }}>
            {loading ? 'Redirecting to checkout...' : `Start ${selectedPlan.label} Coaching →`}
          </button>
          <div style={{ fontSize:12, color:t.textDim, textAlign:'center', marginBottom: error ? 12 : 0 }}>
            🔒 Secure checkout powered by Stripe · Cancel anytime
          </div>
          {error && (
            <div style={{ marginTop:10, fontSize:13, color:t.red, background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px' }}>
              {error}
            </div>
          )}
        </div>

        {/* Features */}
        <div style={{ maxWidth:600, margin:'32px auto 0', padding:'0 24px 80px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:16 }}>
            What's Included
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:10 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'16px 18px' }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:5 }}>{f.title}</div>
                <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:28, background:t.tealDim, border:`1px solid ${t.teal}30`, borderRadius:14, padding:'16px 18px', textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:800, color:t.teal, marginBottom:5 }}>Questions before you join?</div>
            <div style={{ fontSize:12, color:t.textMuted, lineHeight:1.6 }}>
              Reach out at <a href="mailto:shane@srgfit.training" style={{ color:t.teal, textDecoration:'none' }}>shane@srgfit.training</a> — I personally respond to every message.
            </div>
          </div>
          <div style={{ textAlign:'center', marginTop:28, fontSize:11, color:t.textDim }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>
        </div>
      </div>
    </>
  )
}
