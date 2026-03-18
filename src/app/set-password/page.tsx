'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', red:'#ef4444', redDim:'#ef444415',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

export default function SetPasswordPage() {
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const [done,      setDone]      = useState(false)
  const [sessionOk, setSessionOk] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase auth handles the recovery token from the URL hash automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') {
        if (session) setSessionOk(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

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
    setTimeout(() => router.push('/dashboard/client'), 2000)
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
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
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
                <div style={{ fontSize:40, marginBottom:16 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>You're all set!</div>
                <div style={{ fontSize:13, color:t.textMuted }}>Taking you to your dashboard...</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:4 }}>Set your password</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.6 }}>
                  Create a password to access your SRG Fit account.
                </div>

                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    style={inp}
                  />
                </div>

                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    style={inp}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  />
                </div>

                {error && (
                  <div style={{ background:t.redDim, border:`1px solid ${t.red}40`, borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:16 }}>
                    {error}
                  </div>
                )}

                {!sessionOk && (
                  <div style={{ background:'#f5a62315', border:'1px solid #f5a62340', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#f5a623', marginBottom:16 }}>
                    ⚠️ Waiting for your invite link to be verified... If this persists, try clicking the link in your email again.
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading || !password || !confirm}
                  style={{
                    width: '100%',
                    padding: '13px',
                    borderRadius: 12,
                    border: 'none',
                    background: loading || !password || !confirm
                      ? '#1d1d2e'
                      : 'linear-gradient(135deg,#00c9b1,#00c9b1cc)',
                    color: loading || !password || !confirm ? t.textMuted : '#000',
                    fontSize: 14,
                    fontWeight: 800,
                    cursor: loading || !password || !confirm ? 'not-allowed' : 'pointer',
                    fontFamily: "'DM Sans',sans-serif",
                    transition: 'all 0.2s',
                  }}>
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
