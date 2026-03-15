'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', red:'#ef4444',
  green:'#22c55e', text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

export default function InviteAcceptPage() {
  const supabase = createClient()
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const [invite, setInvite] = useState<any>(null)
  const [coach, setCoach] = useState<any>(null)
  const [status, setStatus] = useState<'loading'|'valid'|'expired'|'already_accepted'|'invalid'|'accepting'>('loading')
  const [error, setError] = useState<string|null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: inv } = await supabase.from('client_invites').select('*').eq('token', token).single()
      if (!inv) { setStatus('invalid'); return }
      if (inv.status === 'accepted') { setStatus('already_accepted'); return }
      if (inv.status === 'cancelled' || new Date(inv.expires_at) < new Date()) { setStatus('expired'); return }
      const { data: coachProfile } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', inv.coach_id).single()
      setInvite(inv)
      setCoach(coachProfile)
      setStatus('valid')
    }
    load()
  }, [token])

  const acceptInvite = async () => {
    setStatus('accepting')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Store token in sessionStorage, redirect to login/signup, come back
      sessionStorage.setItem('pending_invite_token', token)
      router.push('/login?redirect=/invite/'+token)
      return
    }

    // Check if already a client for this coach
    const { data: existing } = await supabase.from('clients').select('id').eq('profile_id', user.id).eq('coach_id', invite.coach_id).single()
    if (existing) { router.push('/onboarding'); return }

    // Create client record
    const { data: cl, error: clErr } = await supabase.from('clients').insert({
      profile_id: user.id, coach_id: invite.coach_id, active: true,
      start_date: new Date().toISOString().split('T')[0], invite_id: invite.id
    }).select().single()

    if (clErr || !cl) { setError('Something went wrong. Please try again or contact your coach.'); setStatus('valid'); return }

    // Update invite
    await supabase.from('client_invites').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', invite.id)
    // Update profile name if not set
    if (invite.full_name) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      if (!prof?.full_name) await supabase.from('profiles').update({ full_name: invite.full_name }).eq('id', user.id)
    }
    router.push('/onboarding')
  }

  if (status === 'loading') return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:32, marginBottom:12 }}>⚡</div>Loading your invite...</div>
    </div>
  )

  const Card = ({ icon, title, body, cta, onCta }: any) => (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:32, maxWidth:420, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>{icon}</div>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:14, color:t.textMuted, marginBottom:cta?24:0, lineHeight:1.7 }}>{body}</div>
        {cta && <button onClick={onCta} style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:12, padding:'12px 32px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{cta}</button>}
      </div>
    </div>
  )

  if (status === 'expired') return <Card icon="⏰" title="This invite has expired" body="Invites are valid for 7 days. Ask your coach to send a new one." />
  if (status === 'invalid') return <Card icon="🔍" title="Invite not found" body="This link may be invalid or already used. Check your email or contact your coach." />
  if (status === 'already_accepted') return <Card icon="✅" title="Already accepted" body="You've already accepted this invite." cta="Go to Dashboard" onCta={()=>router.push('/dashboard/client')} />

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:32, maxWidth:440, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:32, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>SRG FIT</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:28 }}>Strength · Nutrition · Mental Health</div>

          {coach?.avatar_url && (
            <div style={{ width:64, height:64, borderRadius:'50%', overflow:'hidden', margin:'0 auto 16px', border:'2px solid '+t.teal+'40' }}>
              <img src={coach.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" />
            </div>
          )}

          <div style={{ fontSize:18, fontWeight:900, marginBottom:8 }}>
            You've been invited{coach?.full_name ? ` by ${coach.full_name}` : ''}!
          </div>
          <div style={{ fontSize:14, color:t.textMuted, marginBottom:invite?.message?20:28, lineHeight:1.7 }}>
            Join SRG Fit — your coaching platform for strength, nutrition, and mental health.
          </div>

          {invite?.message && (
            <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:12, padding:'12px 14px', marginBottom:24, textAlign:'left', fontSize:13, color:t.textDim, lineHeight:1.7, fontStyle:'italic' }}>
              "{invite.message}"
            </div>
          )}

          {error && <div style={{ fontSize:13, color:t.red, marginBottom:16 }}>{error}</div>}

          <button onClick={acceptInvite} disabled={status==='accepting'}
            style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:14, padding:'14px', fontSize:15, fontWeight:900, color:'#000', cursor:status==='accepting'?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:status==='accepting'?.6:1 }}>
            {status === 'accepting' ? 'Setting up your account...' : '🚀 Accept Invite & Get Started'}
          </button>
          <div style={{ fontSize:11, color:t.textMuted, marginTop:12 }}>Expires {new Date(invite?.expires_at).toLocaleDateString()}</div>
        </div>
      </div>
    </>
  )
}
