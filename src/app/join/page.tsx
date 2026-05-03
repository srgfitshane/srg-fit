'use client'
import { useState } from 'react'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', orangeDim:'#f5a62315',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444',
}

const PLANS = [
  {
    id: 'monthly', label: 'Monthly', price: '$200', interval: '/month', badge: 'Most Popular',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_MONTHLY || 'price_MONTHLY',
    description: 'Billed monthly after trial. Cancel anytime.',
  },
  {
    id: 'weekly', label: 'Weekly', price: '$50', interval: '/week', badge: null,
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_WEEKLY || 'price_WEEKLY',
    description: 'Billed weekly after trial. No commitment.',
  },
]

// Copy lead with what the CLIENT experiences and gains; coach support
// is the enabler, not the feature. Aim for ~70/30 client/coach framing.
const FEATURES = [
  { icon:'🎯', title:'A Plan That\'s Actually Yours', desc:'Built around your goals, schedule, equipment, and body — and adjusted weekly based on how you\'re actually doing.' },
  { icon:'🏋️', title:'Train Without Guessing', desc:'Every workout you log gets eyes on it. Form notes back within 24 hours so you train smarter, recover faster, and trust what you\'re doing.' },
  { icon:'📈', title:'See Yourself Get Stronger', desc:'Workouts, nutrition, sleep, and mood — all in one place. Patterns get obvious, wins stack up, and the work pays off.' },
  { icon:'💬', title:'Never Train Alone', desc:'Real messaging with a real coach who shows up. No bots, no autoresponders — someone in your corner when you need it.' },
]

export default function JoinPage() {
  const [selected, setSelected] = useState<string>('monthly')
  const [name,     setName]     = useState('')
  const [email,    setEmail]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string|null>(null)

  const selectedPlan = PLANS.find(p => p.id === selected)!

  const handleJoin = async () => {
    if (!name.trim())                           { setError('Please enter your name'); return }
    if (!email.trim() || !email.includes('@'))  { setError('Please enter a valid email address'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId: selectedPlan.priceId, email: email.trim(), name: name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setLoading(false)
    }
  }

  const inp: React.CSSProperties = {
    width:'100%', background:'#161624', border:'1px solid #252538',
    borderRadius:10, padding:'12px 14px', fontSize:14, color:'#eeeef8',
    outline:'none', fontFamily:"'DM Sans',sans-serif",
    colorScheme:'dark' as any, boxSizing:'border-box' as any,
  }

  const ctaReady = !loading && email.trim() && name.trim()

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:#080810;}`}</style>
      <div style={{ background:'#080810', minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:'#eeeef8' }}>

        {/* Top bar — link back to the marketing site so visitors who land
            here can still browse Shane's full story without backtracking. */}
        <div style={{ maxWidth:600, margin:'0 auto', padding:'18px 24px 0', display:'flex', justifyContent:'flex-end' }}>
          <a href="https://srgfit.training" style={{ fontSize:11, color:'#5a5a78', textDecoration:'none', letterSpacing:'0.05em', borderBottom:'1px dashed #5a5a7855', paddingBottom:1 }}>
            ← srgfit.training
          </a>
        </div>

        {/* Hero */}
        <div style={{ maxWidth:600, margin:'0 auto', padding:'40px 24px 32px', textAlign:'center' }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:34, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>SRG FIT</div>
            <div style={{ fontSize:11, color:'#5a5a78', letterSpacing:'0.15em', textTransform:'uppercase' }}>Strength · Compassion · Legendary Support</div>
          </div>
          <div style={{ fontSize:30, fontWeight:900, lineHeight:1.2, marginBottom:12 }}>
            Your Plan. Your Pace.<br/>
            <span style={{ background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Real Support.</span>
          </div>
          <div style={{ fontSize:15, color:'#5a5a78', lineHeight:1.7, maxWidth:460, margin:'0 auto' }}>
            For the person who's done with cookie-cutter apps and ready to actually feel strong, capable, and at home in their own body. You bring the work. Shane brings the plan, the eyes-on, and the steady support.
          </div>
        </div>

        {/* Form */}
        <div style={{ maxWidth:600, margin:'0 auto', padding:'0 24px' }}>

          {/* Trial banner */}
          <div style={{ background:'#00c9b118', border:'1px solid #00c9b140', borderRadius:14, padding:'14px 18px', marginBottom:20, textAlign:'center' }}>
            <div style={{ fontSize:18, fontWeight:900, color:'#00c9b1', marginBottom:3 }}>🔥 7-Day Free Trial</div>
            <div style={{ fontSize:13, color:'#5a5a78', lineHeight:1.6 }}>Start training today. Card collected upfront, nothing charged for 7 days. Cancel before your trial ends and you won't pay a thing.</div>
          </div>

          {/* Plan selector */}
          <div style={{ fontSize:12, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:14 }}>Choose Your Plan</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
            {PLANS.map(plan => {
              const active = selected === plan.id
              return (
                <button key={plan.id} onClick={() => setSelected(plan.id)}
                  style={{ background:active?'#00c9b115':'#0f0f1a', border:`2px solid ${active?'#00c9b1':'#252538'}`, borderRadius:16, padding:'18px 16px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' as const, position:'relative', transition:'all .15s' }}>
                  {plan.badge && (
                    <div style={{ position:'absolute', top:-10, right:12, background:'linear-gradient(135deg,#f5a623,#f5a623cc)', color:'#000', fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:20 }}>{plan.badge}</div>
                  )}
                  <div style={{ fontSize:13, fontWeight:700, color:active?'#00c9b1':'#5a5a78', marginBottom:6 }}>{plan.label}</div>
                  <div style={{ display:'flex', alignItems:'baseline', gap:3 }}>
                    <span style={{ fontSize:28, fontWeight:900, color:'#eeeef8' }}>{plan.price}</span>
                    <span style={{ fontSize:13, color:'#5a5a78' }}>{plan.interval}</span>
                  </div>
                  <div style={{ fontSize:11, color:'#8888a8', marginTop:6, lineHeight:1.5 }}>{plan.description}</div>
                  {active && (
                    <div style={{ position:'absolute', top:12, right:14, width:18, height:18, borderRadius:'50%', background:'#00c9b1', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><polyline points="2 6 5 9 10 3" stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Name + Email */}
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Your Name</div>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="First and last name" style={inp} />
            </div>
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Email Address</div>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com" onKeyDown={e => e.key === 'Enter' && handleJoin()}
                style={inp} />
            </div>
          </div>

          {/* CTA */}
          <button onClick={handleJoin} disabled={!ctaReady}
            style={{ width:'100%', padding:'16px', borderRadius:14, border:'none', background:ctaReady?'linear-gradient(135deg,#00c9b1,#f5a623)':'#161624', color:ctaReady?'#000':'#5a5a78', fontSize:16, fontWeight:900, cursor:ctaReady?'pointer':'not-allowed', fontFamily:"'DM Sans',sans-serif", transition:'all .2s', marginBottom:10 }}>
            {loading ? 'Redirecting to checkout...' : `Start Your Free 7-Day Trial →`}
          </button>
          <div style={{ fontSize:12, color:'#8888a8', textAlign:'center', marginBottom:error?12:0 }}>
            🔒 Secure checkout · Card required · Cancel anytime before day 7
          </div>
          {error && (
            <div style={{ marginTop:10, fontSize:13, color:'#ef4444', background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px' }}>{error}</div>
          )}
        </div>

        {/* Features */}
        <div style={{ maxWidth:600, margin:'32px auto 0', padding:'0 24px 80px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:16 }}>What You'll Get</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:10 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:'#0f0f1a', border:'1px solid #252538', borderRadius:14, padding:'16px 18px' }}>
                <div style={{ fontSize:22, marginBottom:8 }}>{f.icon}</div>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:5 }}>{f.title}</div>
                <div style={{ fontSize:12, color:'#5a5a78', lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:28, background:'#00c9b115', border:'1px solid #00c9b130', borderRadius:14, padding:'16px 18px', textAlign:'center' }}>
            <div style={{ fontSize:13, fontWeight:800, color:'#00c9b1', marginBottom:5 }}>Not sure if it's right for you?</div>
            <div style={{ fontSize:12, color:'#5a5a78', lineHeight:1.6 }}>
              Send a note to <a href="mailto:shane@srgfit.training" style={{ color:'#00c9b1', textDecoration:'none' }}>shane@srgfit.training</a> — Shane reads and answers every one personally. No pressure either way.
            </div>
          </div>
          <div style={{ textAlign:'center', marginTop:28, fontSize:11, color:'#8888a8' }}>Be Kind to Yourself & Stay Awesome 💪</div>
          <div style={{ textAlign:'center', marginTop:14, fontSize:11, color:'#5a5a78' }}>
            Want to learn more first? Visit{' '}
            <a href="https://srgfit.training" style={{ color:'#5a5a78', textDecoration:'underline' }}>srgfit.training</a>
          </div>
        </div>
      </div>
    </>
  )
}
