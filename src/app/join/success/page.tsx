'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', border:'#252538',
  teal:'#00c9b1', orange:'#f5a623',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444',
}

export default function JoinSuccessPage() {
  return (
    <Suspense fallback={<div style={{ background:t.bg, minHeight:'100vh' }} />}>
      <JoinSuccessInner />
    </Suspense>
  )
}

function JoinSuccessInner() {
  const params = useSearchParams()
  const router = useRouter()
  const sessionId = params.get('session_id')
  const [status, setStatus] = useState<'loading'|'creating'|'done'|'error'>('loading')
  const [errorMsg, setErrorMsg] = useState<string|null>(null)
  const [email, setEmail] = useState<string|null>(null)

  useEffect(() => {
    if (!sessionId) { setStatus('error'); setErrorMsg('No session ID found. Please contact support.'); return }
    const run = async () => {
      setStatus('creating')
      try {
        const res = await fetch('/api/stripe/create-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Account creation failed')
        setEmail(data.email)
        setStatus('done')
      } catch (err: any) {
        setErrorMsg(err.message)
        setStatus('error')
      }
    }
    run()
  }, [sessionId])

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
        <div style={{ maxWidth:440, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:32, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:32 }}>
            SRG FIT
          </div>

          {(status === 'loading' || status === 'creating') && (
            <div>
              <div style={{ fontSize:48, marginBottom:20 }}>⚡</div>
              <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>
                {status === 'loading' ? 'Verifying payment...' : 'Setting up your account...'}
              </div>
              <div style={{ fontSize:14, color:t.textMuted }}>This only takes a moment.</div>
            </div>
          )}

          {status === 'done' && (
            <div>
              <div style={{ fontSize:48, marginBottom:20 }}>🎉</div>
              <div style={{ fontSize:24, fontWeight:900, color:t.green, marginBottom:12 }}>You're in!</div>
              <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.7, marginBottom:24 }}>
                Payment confirmed. We've sent a welcome email to <strong style={{ color:t.text }}>{email}</strong> — check your inbox to set your password and get started.
              </div>
              <div style={{ background:'#0f0f1a', border:`1px solid ${t.border}`, borderRadius:14, padding:'16px 20px', fontSize:13, color:t.textMuted, lineHeight:1.7 }}>
                📧 <strong style={{ color:t.text }}>Check your email</strong> for a link to set your password. It may take a minute to arrive. Check your spam folder if you don't see it.
              </div>
            </div>
          )}

          {status === 'error' && (
            <div>
              <div style={{ fontSize:48, marginBottom:20 }}>😬</div>
              <div style={{ fontSize:20, fontWeight:900, color:t.red, marginBottom:12 }}>Something went wrong</div>
              <div style={{ fontSize:14, color:t.textMuted, lineHeight:1.7, marginBottom:20 }}>
                {errorMsg || 'There was an issue setting up your account.'}
              </div>
              <div style={{ fontSize:13, color:t.textMuted }}>
                Your payment went through — email <a href="mailto:shane@srgfit.training" style={{ color:t.teal }}>shane@srgfit.training</a> and I'll get you sorted immediately.
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
