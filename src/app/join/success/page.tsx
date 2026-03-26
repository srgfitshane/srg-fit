'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e',
}

export default function JoinSuccess() {
  return <Suspense fallback={<div style={{ background:t.bg, minHeight:'100vh' }}/>}><SuccessInner /></Suspense>
}

function SuccessInner() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const [email, setEmail] = useState<string|null>(null)

  useEffect(() => {
    // Optionally fetch session email to personalise the message
    if (!sessionId) return
    fetch(`/api/stripe/session?id=${sessionId}`)
      .then(r => r.json())
      .then(d => { if (d.email) setEmail(d.email) })
      .catch(() => {})
  }, [sessionId])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ minHeight:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ maxWidth:480, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:64, marginBottom:20 }}>🎉</div>
          <div style={{ fontSize:28, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:12, lineHeight:1.2 }}>
            You're in!
          </div>
          <div style={{ fontSize:15, color:t.textMuted, lineHeight:1.7, marginBottom:32 }}>
            {email ? `We sent a setup link to ${email}.` : 'Check your email for a setup link.'}{' '}
            Click it to create your password and access your SRG Fit account. Your 7-day free trial starts now.
          </div>

          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:24, marginBottom:24, textAlign:'left' }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:14, color:t.teal }}>What happens next</div>
            {[
              { step:'1', text:'Check your email and click the setup link' },
              { step:'2', text:'Create your password — takes 30 seconds' },
              { step:'3', text:'Coach Shane will set up your program' },
              { step:'4', text:'Your trial ends in 7 days — cancel anytime before then' },
            ].map(s => (
              <div key={s.step} style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:12 }}>
                <div style={{ width:24, height:24, borderRadius:'50%', background:`linear-gradient(135deg,${t.teal},${t.orange})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:'#000', flexShrink:0 }}>{s.step}</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.5, paddingTop:3 }}>{s.text}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:12, color:t.textDim }}>
            Questions? Email <a href="mailto:shane@srgfit.training" style={{ color:t.teal, textDecoration:'none' }}>shane@srgfit.training</a>
          </div>
          <div style={{ marginTop:24, fontSize:11, color:t.textDim }}>Be Kind to Yourself & Stay Awesome 💪</div>
        </div>
      </div>
    </>
  )
}
