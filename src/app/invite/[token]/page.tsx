'use client'
import Image from 'next/image'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useParams } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623', red:'#ef4444',
  green:'#22c55e', text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type InviteStatus = 'loading' | 'valid' | 'expired' | 'already_accepted' | 'invalid' | 'accepting'

type InviteRecord = {
  coach_id: string
  full_name: string | null
  message: string | null
  expires_at: string
  status: string
}

type CoachProfile = {
  full_name: string | null
  avatar_url: string | null
}

type CardProps = {
  icon: string
  title: string
  body: string
  cta?: string
  onCta?: () => void
}

function InviteStateCard({ icon, title, body, cta, onCta }: CardProps) {
  return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:32, maxWidth:420, width:'100%', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>{icon}</div>
        <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>{title}</div>
        <div style={{ fontSize:14, color:t.textMuted, marginBottom:cta ? 24 : 0, lineHeight:1.7 }}>{body}</div>
        {cta && <button onClick={onCta} style={{ background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:12, padding:'12px 32px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>{cta}</button>}
      </div>
    </div>
  )
}

export default function InviteAcceptPage() {
  const supabase = useMemo(() => createClient(), [])
  const router = useRouter()
  const { token } = useParams<{ token: string }>()
  const [invite, setInvite] = useState<InviteRecord | null>(null)
  const [coach, setCoach] = useState<CoachProfile | null>(null)
  const [status, setStatus] = useState<InviteStatus>('loading')
  const [error, setError] = useState<string|null>(null)

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/invite/${token}`)
      if (!res.ok) {
        setStatus(res.status === 404 ? 'invalid' : 'invalid')
        return
      }

      const data = await res.json() as {
        availability?: Exclude<InviteStatus, 'loading' | 'accepting'>
        invite?: InviteRecord
        coach?: CoachProfile | null
      }

      if (!data.availability || !data.invite) {
        setStatus('invalid')
        return
      }

      setInvite(data.invite)
      setCoach(data.coach || null)
      setStatus(data.availability === 'valid' ? 'valid' : data.availability)
    }
    void load()
  }, [token, supabase])

  const acceptInvite = async () => {
    setStatus('accepting')
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      // Store token in sessionStorage, redirect to login/signup, come back
      sessionStorage.setItem('pending_invite_token', token)
      router.push('/login?redirect=/invite/'+token)
      return
    }

    const res = await fetch('/api/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const result = await res.json()

    if (!res.ok) {
      setError(result.error || 'Something went wrong. Please try again or contact your coach.')
      setStatus(result.error === 'Invite expired' ? 'expired' : 'valid')
      return
    }

    if (!invite) {
      setError('Invite data was unavailable. Please reopen the invite link and try again.')
      setStatus('valid')
      return
    }

    // Auto welcome message from coach
    try {
      const coachName = coach?.full_name?.split(' ')[0] || 'Your coach'
      const clientFirstName = invite.full_name?.split(' ')[0] || 'there'
      await supabase.from('messages').insert({
        sender_id: invite.coach_id,
        recipient_id: user.id,
        body: `Hey ${clientFirstName}! 👋 Welcome to SRG Fit — I'm pumped to have you here. I'm setting up your program now and will be in touch soon. Feel free to message me anytime. Let's get to work! 💪\n\n— ${coachName}`,
        read: false,
      })
    } catch {
      // Non-blocking welcome message.
    }

    router.push('/onboarding')
  }

  if (status === 'loading') return (
    <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>
      <div style={{ textAlign:'center' }}><div style={{ fontSize:32, marginBottom:12 }}>⚡</div>Loading your invite...</div>
    </div>
  )

  if (status === 'expired') return <InviteStateCard icon="⏰" title="This invite has expired" body="Invites are valid for 7 days. Ask your coach to send a new one." />
  if (status === 'invalid') return <InviteStateCard icon="🔍" title="Invite not found" body="This link may be invalid or already used. Check your email or contact your coach." />
  if (status === 'already_accepted') return <InviteStateCard icon="✅" title="Already accepted" body="You&apos;ve already accepted this invite." cta="Go to Dashboard" onCta={()=>router.push('/dashboard/client')} />
  if (!invite) return <InviteStateCard icon="⚠️" title="Invite unavailable" body="We couldn't load your invite details. Please reopen the link or ask your coach to resend it." />

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", padding:20 }}>
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:32, maxWidth:440, width:'100%', textAlign:'center' }}>
          <div style={{ fontSize:32, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', marginBottom:4 }}>SRG FIT</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:28 }}>Strength · Nutrition · Mental Health</div>

          {coach?.avatar_url && (
            <div style={{ width:64, height:64, borderRadius:'50%', overflow:'hidden', margin:'0 auto 16px', border:'2px solid '+t.teal+'40' }}>
              <Image src={coach.avatar_url} style={{ width:'100%', height:'100%', objectFit:'cover' }} alt="" width={64} height={64} unoptimized />
            </div>
          )}

          <div style={{ fontSize:18, fontWeight:900, marginBottom:8 }}>
            You&apos;ve been invited{coach?.full_name ? ` by ${coach.full_name}` : ''}!
          </div>
          <div style={{ fontSize:14, color:t.textMuted, marginBottom:invite?.message?20:28, lineHeight:1.7 }}>
            Join SRG Fit — your coaching platform for strength, nutrition, and mental health.
          </div>

          {invite?.message && (
            <div style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:12, padding:'12px 14px', marginBottom:24, textAlign:'left', fontSize:13, color:t.textDim, lineHeight:1.7, fontStyle:'italic' }}>
              &ldquo;{invite.message}&rdquo;
            </div>
          )}

          {error && <div style={{ fontSize:13, color:t.red, marginBottom:16 }}>{error}</div>}

          <button onClick={acceptInvite} disabled={status==='accepting'}
            style={{ width:'100%', background:`linear-gradient(135deg,${t.teal},${t.orange})`, border:'none', borderRadius:14, padding:'14px', fontSize:15, fontWeight:900, color:'#000', cursor:status==='accepting'?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:status==='accepting'?.6:1 }}>
            {status === 'accepting' ? 'Setting up your account...' : '🚀 Accept Invite & Get Started'}
          </button>
          <div style={{ fontSize:11, color:t.textMuted, marginTop:12 }}>Expires {new Date(invite.expires_at).toLocaleDateString()}</div>
        </div>
      </div>
    </>
  )
}
