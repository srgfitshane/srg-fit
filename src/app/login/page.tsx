'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single()
    console.log('profile:', profile)
    router.push(profile?.role === 'coach' ? '/dashboard/coach' : '/dashboard/client')
  }

  return (
    <div style={{ background:'#080810', minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'DM Sans,sans-serif', padding:20 }}>
      <div style={{ width:'100%', maxWidth:420 }}>
        <div style={{ textAlign:'center', marginBottom:40 }}>
          <div style={{ fontSize:32, fontWeight:900, background:'linear-gradient(135deg,#00c9b1,#f5a623)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:8 }}>SRG FIT</div>
          <div style={{ fontSize:14, color:'#5a5a78' }}>Sign in to your account</div>
        </div>
        <div style={{ background:'#0f0f1a', border:'1px solid #252538', borderRadius:20, padding:32 }}>
          {error && <div style={{ background:'#ef444418', border:'1px solid #ef444440', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#ef4444', marginBottom:16 }}>{error}</div>}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Email</div>
            <input value={email} onChange={e=>setEmail(e.target.value)} type='email' placeholder='you@example.com' style={{ width:'100%', background:'#161624', border:'1px solid #252538', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#eeeef8', outline:'none', fontFamily:'DM Sans,sans-serif', colorScheme:'dark', boxSizing:'border-box' }} />
          </div>
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#5a5a78', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Password</div>
            <input value={password} onChange={e=>setPassword(e.target.value)} type='password' placeholder='••••••••' onKeyDown={e=>e.key==='Enter'&&handleLogin()} style={{ width:'100%', background:'#161624', border:'1px solid #252538', borderRadius:10, padding:'11px 14px', fontSize:13, color:'#eeeef8', outline:'none', fontFamily:'DM Sans,sans-serif', colorScheme:'dark', boxSizing:'border-box' }} />
          </div>
          <button onClick={handleLogin} disabled={loading||!email||!password} style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,#00c9b1,#00c9b1cc)', color:'#000', fontSize:14, fontWeight:800, cursor:loading?'not-allowed':'pointer', fontFamily:'DM Sans,sans-serif', opacity:loading||!email||!password?0.6:1 }}>
            {loading ? 'Signing in...' : 'Sign In →'}
          </button>
        </div>
        <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#5a5a78' }}>Be Kind to Yourself and Stay Awesome 💪</div>
      </div>
    </div>
  )
}
