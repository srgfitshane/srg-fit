'use client'

import { useState, useEffect, Suspense, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', red:'#ef4444', redDim:'#ef444415',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ background:t.bg, minHeight:'100vh' }} />}>
      <SetPasswordInner />
    </Suspense>
  )
}

function SetPasswordInner() {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [otpEmail,  setOtpEmail]  = useState('')
  const [otpCode,   setOtpCode]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [sessionOk, setSessionOk] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const checkSession = async () => {
      // 1. Hash fragment flow (desktop email clients)
      if (window.location.hash.includes('access_token=')) {
        const hashParams = new URLSearchParams(window.location.hash.substring(1))
        const access_token = hashParams.get('access_token')
        const refresh_token = hashParams.get('refresh_token')
        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({ access_token, refresh_token })
          if (!setErr) { setSessionOk(true); window.location.hash = ''; return }
        }
      }

      // 2. PKCE code exchange (from /auth/callback redirect)
      const code = searchParams.get('code')
      if (code) {
        const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (!codeErr && data.session) { setSessionOk(true); return }
      }

      // 3. Session already exists
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setSessionOk(true); return }

      // 4. Pre-fill email from query param if provided (e.g. ?email=...)
      const emailParam = searchParams.get('email')
      if (emailParam) setOtpEmail(emailParam)
    }
    checkSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setSessionOk(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [searchParams, supabase])

  const handleVerifyOtp = async () => {
    setError('')
    setLoading(true)
    const { data, error: otpError } = await supabase.auth.verifyOtp({ email: otpEmail, token: otpCode, type: 'invite' })
    if (otpError) {
      setError(`Verification failed: ${otpError.message}`)
      setLoading(false)
      return
    }
    if (data.session) setSessionOk(true)
    setLoading(false)
  }

  const handleSubmit = async () => {
    setError('')
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }
    setDone(true)
    setTimeout(() => router.push('/onboarding'), 2000)
  }

  const inp = {
    width: '100%',
    background: '#161624',
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 14,
    color: t.text,
    outline: 'none',
    fontFamily: "'DM Sans',sans-serif",
    boxSizing: 'border-box' as const,
    colorScheme: 'dark' as const,
  }

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
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
                <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Password set!</div>
                <div style={{ fontSize:13, color:t.textMuted }}>Setting up your profile...</div>
              </div>
            ) : !sessionOk ? (
              /* ── Step 1: Verify identity via OTP ── */
              <>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Check your email</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
                  We sent a 6-digit code to your email. Enter it below to continue.
                </div>

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Email Address</label>
                  <input type="email" value={otpEmail} onChange={e => setOtpEmail(e.target.value)}
                    placeholder="you@email.com" style={inp} />
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>6-Digit Code</label>
                  <input type="text" inputMode="numeric" value={otpCode} onChange={e => setOtpCode(e.target.value.replace(/\D/g,''))}
                    placeholder="123456" maxLength={6}
                    onKeyDown={e => e.key === 'Enter' && handleVerifyOtp()}
                    style={{ ...inp, letterSpacing:'0.2em', fontSize:22, fontWeight:'bold', textAlign:'center' as const }} />
                </div>

                {error && (
                  <div style={{ background:t.redDim, border:`1px solid ${t.red}40`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:16 }}>
                    {error}
                  </div>
                )}

                <button onClick={handleVerifyOtp} disabled={loading || !otpEmail || otpCode.length !== 6}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
                    background: loading || !otpEmail || otpCode.length !== 6 ? '#1d1d2e' : `linear-gradient(135deg,${t.orange},${t.orange}cc)`,
                    color: loading || !otpEmail || otpCode.length !== 6 ? t.textMuted : '#000',
                    fontSize:14, fontWeight:800, cursor: loading || !otpEmail || otpCode.length !== 6 ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {loading ? 'Verifying...' : 'Verify Code →'}
                </button>
              </>
            ) : (
              /* ── Step 2: Set password ── */
              <>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Create your password</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
                  Almost there — set a password to access your SRG Fit account.
                </div>

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" style={inp} />
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Confirm Password</label>
                  <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter password" style={inp}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
                </div>

                {error && (
                  <div style={{ background:t.redDim, border:`1px solid ${t.red}40`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:16 }}>
                    {error}
                  </div>
                )}

                <button onClick={handleSubmit} disabled={loading || !password || !confirm}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
                    background: loading || !password || !confirm ? '#1d1d2e' : 'linear-gradient(135deg,#00c9b1,#00c9b1cc)',
                    color: loading || !password || !confirm ? t.textMuted : '#000',
                    fontSize:14, fontWeight:800, cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {loading ? 'Setting password...' : 'Set Password & Continue →'}
                </button>
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
