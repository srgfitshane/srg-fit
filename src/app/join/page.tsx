'use client'
import { useState } from 'react'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444',
}

const FEATURES = [
  { icon:'🎥', title:'Async Video Review', desc:'Every workout reviewed with personal video feedback within 24 hours — your coaching, not an AI.' },
  { icon:'📋', title:'Custom Programming', desc:'Programs built specifically for you, adjusted every week based on how you\'re actually doing.' },
  { icon:'📊', title:'Full Progress Tracking', desc:'Workouts, nutrition, sleep, mood — all in one place so nothing gets missed.' },
  { icon:'💬', title:'Direct Access to Shane', desc:'Real messaging, real accountability. You get me, not a chatbot.' },
]

export default function JoinPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)

  const handleJoin = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
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
        <div style={{ maxWidth:640, margin:'0 auto', padding:'60px 24px 40px', textAlign:'center' }}>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:36, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>
              SRG FIT
            </div>
            <div style={{ fontSize:11, color:t.textMuted, letterSpacing:'0.15em', textTransform:'uppercase' }}>
              STRENGTH · COMPASSION · LEGENDARY SUPPORT
            </div>
          </div>

          <div style={{ fontSize:32, fontWeight:900, lineHeight:1.2, marginBottom:16 }}>
            Real Coaching.<br />
            <span style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>
              Not a Template.
            </span>
          </div>
          <div style={{ fontSize:16, color:t.textMuted, lineHeight:1.7, marginBottom:36, maxWidth:480, margin:'0 auto 36px' }}>
            1-on-1 online coaching built around you — your schedule, your goals, your life. Every workout reviewed personally by Coach Shane within 24 hours.
          </div>

          {/* CTA Card */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:20, padding:'32px 28px', marginBottom:16 }}>
            <div style={{ fontSize:13, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Monthly Coaching</div>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'center', gap:4, marginBottom:4 }}>
              <span style={{ fontSize:48, fontWeight:900, color:t.text }}>$199</span>
              <span style={{ fontSize:16, color:t.textMuted }}>/month</span>
            </div>
            <div style={{ fontSize:13, color:t.textDim, marginBottom:28 }}>Cancel anytime. No contracts.</div>

            <button
              onClick={handleJoin}
              disabled={loading}
              style={{
                width:'100%', padding:'16px', borderRadius:14, border:'none',
                background: loading ? t.surfaceUp : `linear-gradient(135deg,${t.teal},${t.orange})`,
                color: loading ? t.textMuted : '#000',
                fontSize:16, fontWeight:900, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily:"'DM Sans',sans-serif", transition:'all .2s',
              }}>
              {loading ? 'Redirecting to checkout...' : 'Start Coaching →'}
            </button>

            {error && (
              <div style={{ marginTop:14, fontSize:13, color:t.red, background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px' }}>
                {error}
              </div>
            )}
          </div>
          <div style={{ fontSize:12, color:t.textDim }}>🔒 Secure checkout powered by Stripe</div>
        </div>

        {/* Features */}
        <div style={{ maxWidth:640, margin:'0 auto', padding:'0 24px 80px' }}>
          <div style={{ fontSize:13, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', marginBottom:20 }}>
            What's Included
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:12 }}>
            {FEATURES.map(f => (
              <div key={f.title} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:'18px 20px' }}>
                <div style={{ fontSize:24, marginBottom:10 }}>{f.icon}</div>
                <div style={{ fontSize:14, fontWeight:800, marginBottom:6 }}>{f.title}</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>

          {/* Guarantee note */}
          <div style={{ marginTop:32, background:t.tealDim, border:`1px solid ${t.teal}30`, borderRadius:14, padding:'18px 20px', textAlign:'center' }}>
            <div style={{ fontSize:14, fontWeight:800, color:t.teal, marginBottom:6 }}>Questions before you join?</div>
            <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>
              Reach out at <a href="mailto:shane@srgfit.training" style={{ color:t.teal, textDecoration:'none' }}>shane@srgfit.training</a> — I personally respond to every message.
            </div>
          </div>

          <div style={{ textAlign:'center', marginTop:32, fontSize:11, color:t.textDim }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>
        </div>
      </div>
    </>
  )
}
