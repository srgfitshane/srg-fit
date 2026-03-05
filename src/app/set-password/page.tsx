'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", orange:"#f5a623",
  text:"#eeeef8", textMuted:"#5a5a78",
}

export default function SetPassword() {
  const [password,   setPassword]   = useState('')
  const [confirm,    setConfirm]    = useState('')
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')
  const [done,       setDone]       = useState(false)
  const [sessionOk,  setSessionOk]  = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase puts the token in the URL hash — we need to let it process
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        setSessionOk(true)
      }
    })
    // Also check if already has session from magic link
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setSessionOk(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setLoading(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) { setError(updateError.message); setLoading(false); return }
    setDone(true)
    setTimeout(() => router.push('/dashboard'), 2500)
  }


  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : /[A-Z]/.test(password) && /[0-9]/.test(password) ? 4 : 3
  const strengthLabel = ['','Weak','Fair','Good','Strong'][strength]
  const strengthColor = [t.teal, t.red, t.orange, t.teal, t.green][strength]

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
        <div style={{ width:'100%', maxWidth:420 }}>

          {/* Logo */}
          <div style={{ textAlign:'center', marginBottom:32 }}>
            <div style={{ fontSize:28, fontWeight:900, background:'linear-gradient(135deg,'+t.teal+','+t.orange+')', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:8 }}>SRG FIT</div>
            <div style={{ fontSize:13, color:t.textMuted }}>Set your password to get started</div>
          </div>

          <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28 }}>

            {done ? (
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:40, marginBottom:12 }}>🎉</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>You're all set!</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:16 }}>Redirecting you to your dashboard...</div>
                <div style={{ height:4, background:t.surfaceUp, borderRadius:2, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:'100%', background:'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:2, animation:'progress 2.5s linear forwards' }} />
                </div>
                <style>{`@keyframes progress{from{transform:scaleX(0);transform-origin:left}to{transform:scaleX(1);transform-origin:left}}`}</style>
              </div>
            ) : !sessionOk ? (
              <div style={{ textAlign:'center', padding:'16px 0' }}>
                <div style={{ fontSize:32, marginBottom:12 }}>🔗</div>
                <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>Checking your invite link...</div>
                <div style={{ fontSize:13, color:t.textMuted, lineHeight:1.6 }}>
                  If this takes too long, your link may have expired.<br />
                  Contact Shane to resend your invite.
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:16, fontWeight:800, marginBottom:6 }}>Create your password</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>Welcome to SRG Fit! Set a password to secure your account.</div>

                {/* Password field */}
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Password</div>
                  <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'12px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                  {password.length > 0 && (
                    <div style={{ marginTop:8 }}>
                      <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                        {[1,2,3,4].map(i => (
                          <div key={i} style={{ flex:1, height:3, borderRadius:2, background:strength>=i ? strengthColor : t.surfaceUp, transition:'all 0.2s ease' }} />
                        ))}
                      </div>
                      <div style={{ fontSize:11, color:strengthColor, fontWeight:700 }}>{strengthLabel}</div>
                    </div>
                  )}
                </div>

                {/* Confirm field */}
                <div style={{ marginBottom:20 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Confirm Password</div>
                  <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)}
                    placeholder="Repeat your password"
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+(confirm && confirm!==password ? t.red : t.border), borderRadius:10, padding:'12px 14px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
                  {confirm && confirm !== password && <div style={{ fontSize:11, color:t.red, marginTop:6, fontWeight:600 }}>Passwords don't match</div>}
                  {confirm && confirm === password && password.length >= 8 && <div style={{ fontSize:11, color:t.green, marginTop:6, fontWeight:600 }}>✓ Passwords match</div>}
                </div>

                {error && (
                  <div style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red, marginBottom:16 }}>{error}</div>
                )}

                <button onClick={handleSubmit} disabled={loading || !password || !confirm}
                  style={{ width:'100%', padding:'13px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:loading||!password||!confirm?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:loading||!password||!confirm?0.6:1, transition:'opacity 0.15s ease' }}>
                  {loading ? 'Setting password...' : 'Set Password & Enter →'}
                </button>

                <div style={{ textAlign:'center', marginTop:16, fontSize:12, color:t.textMuted, fontStyle:'italic' }}>
                  Be Kind to Yourself & Stay Awesome 💪
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
