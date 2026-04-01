'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444', redDim:'#ef444415',
}

export default function DirectJoinPage() {
  return (
    <Suspense fallback={<div style={{ background:t.bg, minHeight:'100vh' }} />}>
      <DirectJoinInner />
    </Suspense>
  )
}

function DirectJoinInner() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token') || ''

  const [name,    setName]    = useState('')
  const [email,   setEmail]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string|null>(null)
  const [done,    setDone]    = useState(false)
  const [invalid, setInvalid] = useState(false)

  useEffect(() => {
    if (!token) setInvalid(true)
  }, [token])

  const inp: React.CSSProperties = {
    width:'100%', background:t.surfaceUp, border:`1px solid ${t.border}`,
    borderRadius:10, padding:'12px 14px', fontSize:14, color:t.text,
    outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box',
    colorScheme:'dark',
  }

  const handleJoin = async () => {
    if (!name.trim())  { setError('Please enter your name'); return }
    if (!email.trim() || !email.includes('@')) { setError('Please enter a valid email'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/invite/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), token }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  if (invalid) return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ textAlign:'center', padding:24 }}>
        <div style={{ fontSize:40, marginBottom:16 }}>🔒</div>
        <div style={{ fontSize:16, fontWeight:700, color:t.text, marginBottom:8 }}>Invalid invite link</div>
        <div style={{ fontSize:13, color:t.textMuted }}>Please use the link provided by Coach Shane.</div>
      </div>
    </div>
  )

  return (
    <>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ minHeight:'100vh', background:t.bg, fontFamily:"'DM Sans',sans-serif", color:t.text, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
        <div style={{ width:'100%', maxWidth:420 }}>

          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:32 }}>
            <div style={{ fontSize:28, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:6 }}>
              SRG FIT
            </div>
            <div style={{ fontSize:12, color:t.textMuted, letterSpacing:'0.1em', textTransform:'uppercase' }}>
              Strength · Compassion · Legendary Support
            </div>
          </div>

          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:20, padding:32 }}>
            {done ? (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:44, marginBottom:16 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>You&apos;re in!</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.7 }}>
                  Check your email at <strong style={{ color:t.teal }}>{email}</strong> for a link to set your password and get started.
                </div>
                <div style={{ marginTop:16, fontSize:12, color:t.textMuted }}>
                  Didn&apos;t get it? Check your spam folder.
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:20, fontWeight:800, marginBottom:4 }}>Welcome to SRG Fit 💪</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
                  Coach Shane has invited you. Enter your details below to create your account.
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Full Name</label>
                    <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" style={inp} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Email Address</label>
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@email.com"
                      onKeyDown={e=>e.key==='Enter'&&handleJoin()} style={inp} />
                  </div>

                  {error && (
                    <div style={{ background:t.redDim, border:`1px solid ${t.red}40`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red }}>
                      {error}
                    </div>
                  )}

                  <button onClick={handleJoin} disabled={loading||!name||!email}
                    style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
                      background: loading||!name||!email ? '#1d1d2e' : 'linear-gradient(135deg,#00c9b1,#00c9b1cc)',
                      color: loading||!name||!email ? t.textMuted : '#000',
                      fontSize:14, fontWeight:800, cursor: loading||!name||!email ? 'not-allowed' : 'pointer',
                      fontFamily:"'DM Sans',sans-serif" }}>
                    {loading ? 'Creating your account...' : 'Get Started →'}
                  </button>
                </div>

                <div style={{ marginTop:20, fontSize:12, color:t.textMuted, textAlign:'center', lineHeight:1.6 }}>
                  By signing up you agree to work with Coach Shane under the SRG Fit platform.
                </div>
              </>
            )}
          </div>

          <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:t.textMuted }}>
            Be Kind to Yourself & Stay Awesome 💪
          </div>
        </div>
      </div>
    </>
  )
}
