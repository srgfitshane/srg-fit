'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const s = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', red:'#ef4444', text:'#eeeef8', muted:'#5a5a78', dim:'#8888a8',
}

const inp: React.CSSProperties = {
  width:'100%', background:'#161624', border:'1px solid #252538',
  borderRadius:10, padding:'11px 14px', fontSize:16, color:'#eeeef8',
  outline:'none', fontFamily:'DM Sans,sans-serif', colorScheme:'dark',
  boxSizing:'border-box',
}

export default function LoginPage() {
  const [mode,     setMode]     = useState<'login'|'forgot'|'sent'>('login')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true); setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    if (profile?.role === 'coach') {
      router.push('/dashboard/coach')
      return
    }
    // For clients — check if onboarding is complete
    const { data: clientRow } = await supabase.from('clients').select('id').eq('profile_id', data.user.id).single()
    if (clientRow) {
      const { data: intake } = await supabase.from('client_intake_profiles').select('intake_completed_at').eq('client_id', clientRow.id).single()
      if (!intake?.intake_completed_at) {
        router.push('/onboarding')
        return
      }
    }
    router.push('/dashboard/client')
  }

  const handleForgot = async () => {
    if (!email) { setError('Please enter your email address'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    })
    setLoading(false)
    if (error) { setError(error.message); return }
    setMode('sent')
  }

  return (
    <div style={{ background:s.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans,sans-serif', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:32, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:8 }}>SRG FIT</div>
          <div style={{ fontSize:14, color:s.muted }}>
            {mode === 'login'  && 'Sign in to your account'}
            {mode === 'forgot' && 'Reset your password'}
            {mode === 'sent'   && 'Check your inbox'}
          </div>
        </div>

        <div style={{ background:s.surface, border:'1px solid '+s.border, borderRadius:20, padding:32 }}>

          {/* Error */}
          {error && (
            <div style={{ background:'#ef444418', border:'1px solid #ef444440', borderRadius:10, padding:'10px 14px', fontSize:13, color:s.red, marginBottom:16 }}>
              {error}
            </div>
          )}

          {/* ── LOGIN ── */}
          {mode === 'login' && (
            <>
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:s.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Email</div>
                <input value={email} onChange={e=>setEmail(e.target.value)} type='email' placeholder='you@example.com' style={inp}/>
              </div>
              <div style={{ marginBottom:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:s.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Password</div>
                <div style={{ position:'relative' }}>
                  <input value={password} onChange={e=>setPassword(e.target.value)} type={showPass?'text':'password'} placeholder='••••••••'
                    onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={{...inp, paddingRight:44}}/>
                  <button onClick={()=>setShowPass(p=>!p)} type="button"
                    style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:0, color:s.dim, display:'flex', alignItems:'center' }}>
                    {showPass
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              {/* Forgot password link */}
              <div style={{ textAlign:'right', marginBottom:24 }}>
                <button onClick={()=>{ setMode('forgot'); setError('') }}
                  style={{ background:'none', border:'none', color:s.teal, fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'DM Sans,sans-serif', padding:0 }}>
                  Forgot password?
                </button>
              </div>
              <button onClick={handleLogin} disabled={loading||!email||!password}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#00c9b1,#00c9b1cc)', color:'#000', fontSize:14, fontWeight:800, cursor:loading||!email||!password?'not-allowed':'pointer', fontFamily:'DM Sans,sans-serif', opacity:loading||!email||!password?0.6:1 }}>
                {loading ? 'Signing in...' : 'Sign In →'}
              </button>
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {mode === 'forgot' && (
            <>
              <div style={{ fontSize:13, color:s.dim, marginBottom:20, lineHeight:1.6 }}>
                Enter your email and we&apos;ll send you a link to reset your password.
              </div>
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:s.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Email</div>
                <input value={email} onChange={e=>setEmail(e.target.value)} type='email' placeholder='you@example.com'
                  onKeyDown={e=>e.key==='Enter'&&handleForgot()} style={inp} autoFocus/>
              </div>
              <button onClick={handleForgot} disabled={loading||!email}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#00c9b1,#00c9b1cc)', color:'#000', fontSize:14, fontWeight:800, cursor:loading||!email?'not-allowed':'pointer', fontFamily:'DM Sans,sans-serif', opacity:loading||!email?0.6:1, marginBottom:12 }}>
                {loading ? 'Sending...' : 'Send Reset Link →'}
              </button>
              <button onClick={()=>{ setMode('login'); setError('') }}
                style={{ width:'100%', padding:'11px', borderRadius:12, border:'1px solid '+s.border, background:'transparent', color:s.muted, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                ← Back to Sign In
              </button>
            </>
          )}

          {/* ── EMAIL SENT ── */}
          {mode === 'sent' && (
            <div style={{ textAlign:'center', padding:'12px 0' }}>
              <div style={{ fontSize:44, marginBottom:16 }}>📬</div>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:10, color:s.text }}>Reset link sent!</div>
              <div style={{ fontSize:13, color:s.dim, lineHeight:1.6, marginBottom:24 }}>
                We sent a password reset link to <strong style={{ color:s.text }}>{email}</strong>.
                Check your inbox (and spam folder just in case).
              </div>
              <button onClick={()=>{ setMode('login'); setError('') }}
                style={{ width:'100%', padding:'11px', borderRadius:12, border:'1px solid '+s.border, background:'transparent', color:s.muted, fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:'DM Sans,sans-serif' }}>
                ← Back to Sign In
              </button>
            </div>
          )}

        </div>

        <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:s.muted }}>
          Be Kind to Yourself and Stay Awesome 💪
        </div>
      </div>
    </div>
  )
}
