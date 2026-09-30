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
  const [linkRequested, setLinkRequested] = useState(false)
  const [passwordSaved, setPasswordSaved] = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [sessionOk, setSessionOk] = useState(false)
  const [checking,  setChecking]  = useState(true)
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
          if (!setErr) { setSessionOk(true); setChecking(false); window.location.hash = ''; return }
        }
      }

      // 2. PKCE code exchange (from /auth/callback redirect)
      const code = searchParams.get('code')
      if (code) {
        const { data, error: codeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (!codeErr && data.session) { setSessionOk(true); setChecking(false); return }
      }

      // 3. Session already exists (set by /auth/callback server-side)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setSessionOk(true); setChecking(false); return }

      // A missing or expired session needs a fresh account-access link.
      const emailParam = searchParams.get('email')
      if (emailParam) setOtpEmail(emailParam)
      if (searchParams.get('error') || window.location.hash.includes('error=')) {
        setError('This link is invalid or has expired. Request a new link below.')
      }
      setChecking(false)
    }
    void checkSession().catch(() => {
      setError('Could not verify your session. Please try a new account link.')
      setChecking(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        setSessionOk(true)
        setChecking(false)
      }
    })
    return () => subscription.unsubscribe()
  }, [searchParams, supabase])

  const handleRequestLink = async () => {
    if (loading) return
    setError('')
    setLoading(true)
    try {
      const { error: sendError } = await supabase.auth.resetPasswordForEmail(otpEmail.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/set-password`,
      })
      if (sendError) throw sendError
      setLinkRequested(true)
    } catch {
      setError('Could not send an account link. Please try again or contact your coach.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async () => {
    if (loading) return
    setError('')
    if (!passwordSaved && (!password || password.length < 8)) {
      setError('Password must be at least 8 characters')
      return
    }
    if (!passwordSaved && password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      if (!passwordSaved) {
        const { error: updateError } = await supabase.auth.updateUser({ password })
        if (updateError) throw updateError
        setPasswordSaved(true)
      }
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('Your session has expired. Please request a new account link.')
      const response = await fetch('/api/activate-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      })
      const result = await response.json()
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Your password was saved, but account setup could not finish. Please retry.')
      }
      setDone(true)
      router.replace(result.next === '/dashboard/client' || result.next === '/dashboard/coach' ? result.next : '/onboarding')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Could not finish account setup. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inp = {
    width: '100%',
    background: '#161624',
    border: `1px solid ${t.border}`,
    borderRadius: 10,
    padding: '12px 14px',
    fontSize: 16,
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
            {checking ? (
              <div style={{ textAlign:'center', padding:'20px 0' }}>
                <div style={{ fontSize:13, color:t.textMuted }}>Verifying your invite link...</div>
              </div>
            ) : done ? (
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Password set!</div>
                <div style={{ fontSize:13, color:t.textMuted }}>Setting up your profile...</div>
              </div>
            ) : !sessionOk ? (
              /* Request a fresh link when no authenticated session is available. */
              <>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Get an account link</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
                  Open the link in your invitation email, or request a fresh link to set your password.
                </div>

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Email Address</label>
                  <input type="email" autoComplete="email" aria-label="Email address" value={otpEmail} onChange={e => { setOtpEmail(e.target.value); setLinkRequested(false) }}
                    placeholder="you@email.com" style={inp} />
                </div>

                {linkRequested && <p role="status" style={{ color:t.teal, fontSize:13, marginBottom:16 }}>If an account exists for this email, a link has been requested. Check your inbox and spam folder.</p>}

                {error && (
                  <div style={{ background:t.redDim, border:`1px solid ${t.red}40`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:16 }}>
                    {error}
                  </div>
                )}

                <button onClick={handleRequestLink} disabled={loading || !otpEmail.includes('@') || linkRequested}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:'none',
                    background: loading || linkRequested ? '#1d1d2e' : `linear-gradient(135deg,${t.orange},${t.orange}cc)`,
                    color: loading || linkRequested ? t.textMuted : '#000',
                    fontSize:14, fontWeight:800, cursor: loading || linkRequested ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  {loading ? 'Requesting...' : 'Email Me a Link →'}
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
                  <input type="password" autoComplete="new-password" aria-label="Password" disabled={passwordSaved} value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" style={inp} />
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:6, lineHeight:1.5 }}>
                    Must be at least 8 characters and include a letter, a number, and a special character (e.g. <span style={{ fontFamily:'monospace' }}>!</span>, <span style={{ fontFamily:'monospace' }}>@</span>, <span style={{ fontFamily:'monospace' }}>#</span>)
                  </div>
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Confirm Password</label>
                  <input type="password" autoComplete="new-password" aria-label="Confirm password" disabled={passwordSaved} value={confirm} onChange={e => setConfirm(e.target.value)}
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
                  {loading ? 'Finishing setup...' : passwordSaved ? 'Retry Account Setup →' : 'Set Password & Continue →'}
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
