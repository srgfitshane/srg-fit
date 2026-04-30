'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import { localDateStr } from '@/lib/date'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const SITE_URL = 'https://srgfit.app'
const DIRECT_TOKEN = process.env.NEXT_PUBLIC_COACH_INVITE_TOKEN || ''
const COACH_ID = '133f93d0-2399-4542-bc57-db4de8b98d79'

type Invite = {
  id: string; email: string; full_name: string | null; status: string
  created_at: string; accepted_at: string | null
}

export default function InvitesPage() {
  const supabase = createClient()
  const router   = useRouter()

  // Online invite state
  const [invites,  setInvites]  = useState<Invite[]>([])
  const [loading,  setLoading]  = useState(true)
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [sent,     setSent]     = useState(false)
  const [error,    setError]    = useState('')
  const [copied,   setCopied]   = useState(false)

  // Offline client state
  const [ipName,   setIpName]   = useState('')
  const [ipEmail,  setIpEmail]  = useState('')
  const [ipPhone,  setIpPhone]  = useState('')
  const [ipSaving, setIpSaving] = useState(false)
  const [ipDone,   setIpDone]   = useState(false)
  const [ipError,  setIpError]  = useState('')

  const directLink = `${SITE_URL}/join/direct?token=${DIRECT_TOKEN}`

  const loadInvites = useCallback(async () => {
    const { data } = await supabase
      .from('client_invites').select('id,email,full_name,status,created_at,accepted_at')
      .eq('coach_id', COACH_ID).order('created_at', { ascending: false }).limit(50)
    setInvites(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { void loadInvites() }, [loadInvites])

  const copyLink = async () => {
    await navigator.clipboard.writeText(directLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const sendInvite = async () => {
    if (!email.trim() || !name.trim()) { setError('Name and email required'); return }
    setSending(true); setError(''); setSent(false)
    const res = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), fullName: name.trim() }),
    })
    const result = await res.json()
    if (!res.ok) { setError(result.error || 'Failed to send'); setSending(false); return }
    setSent(true); setSending(false); setEmail(''); setName('')
    void loadInvites()
  }

  const saveOfflineClient = async () => {
    if (!ipName.trim()) { setIpError('Name is required'); return }
    setIpSaving(true); setIpError('')
    const { error: err } = await supabase.from('clients').insert({
      coach_id: COACH_ID,
      display_name: ipName.trim(),
      contact_email: ipEmail.trim() || null,
      contact_phone: ipPhone.trim() || null,
      client_type: 'offline',
      active: true,
      start_date: localDateStr(),
    })
    if (err) { setIpError(err.message); setIpSaving(false); return }
    setIpDone(true); setIpSaving(false)
    setIpName(''); setIpEmail(''); setIpPhone('')
    setTimeout(() => setIpDone(false), 3000)
  }

  const inp: React.CSSProperties = {
    width:'100%', background:t.surfaceUp, border:`1px solid ${t.border}`,
    borderRadius:10, padding:'10px 13px', fontSize:13, color:t.text,
    outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box',
  }

  const card: React.CSSProperties = {
    background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24,
  }

  return (
    <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>
      <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 24px', height:60, display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
        <div style={{ width:1, height:28, background:t.border }}/>
        <div style={{ fontSize:15, fontWeight:800 }}>Add Client</div>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto', padding:'32px 24px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── Share link ── */}
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>📎 Share Signup Link</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:16, lineHeight:1.6 }}>
            For clients who want access to the app. They sign up, set a password, and go through onboarding automatically.
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ flex:1, background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 13px', fontSize:12, color:t.textDim, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as const }}>
              {directLink}
            </div>
            <button onClick={copyLink} style={{ background: copied ? t.green+'20' : t.tealDim, border:`1px solid ${copied ? t.green+'40' : t.teal+'40'}`, borderRadius:10, padding:'10px 16px', fontSize:12, fontWeight:700, color: copied ? t.green : t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0, whiteSpace:'nowrap' as const }}>
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>
        </div>

        {/* ── Send invite by email ── */}
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>✉️ Send Invite by Email</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:16, lineHeight:1.6 }}>
            Enter their details and we&apos;ll email them a personalized invite link directly.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Full Name</label>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Client's full name" style={inp} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Email Address</label>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="client@email.com" onKeyDown={e=>e.key==='Enter'&&sendInvite()} style={inp} />
            </div>
            {error && <div style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'9px 13px', fontSize:12, color:t.red }}>{error}</div>}
            {sent  && <div style={{ background:t.green+'15', border:'1px solid '+t.green+'40', borderRadius:8, padding:'9px 13px', fontSize:12, color:t.green }}>✓ Invite sent!</div>}
            <button onClick={sendInvite} disabled={sending||!email||!name} style={{ background: sending||!email||!name ? t.surfaceHigh : 'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color: sending||!email||!name ? t.textMuted : '#000', cursor: sending||!email||!name ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {sending ? 'Sending...' : 'Send Invite'}
            </button>
          </div>
        </div>

        {/* ── In-person / offline client ── */}
        <div style={card}>
          <div style={{ fontSize:14, fontWeight:800, marginBottom:4 }}>🏋️ Add In-Person Client</div>
          <div style={{ fontSize:12, color:t.textMuted, marginBottom:16, lineHeight:1.6 }}>
            For clients who train with you in person and don&apos;t need app access. They&apos;ll appear in your client list for tracking.
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Full Name <span style={{ color:t.red }}>*</span></label>
              <input value={ipName} onChange={e=>setIpName(e.target.value)} placeholder="Client's full name" style={inp} />
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Email (optional)</label>
                <input type="email" value={ipEmail} onChange={e=>setIpEmail(e.target.value)} placeholder="for notes only" style={inp} />
              </div>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Phone (optional)</label>
                <input type="tel" value={ipPhone} onChange={e=>setIpPhone(e.target.value)} placeholder="for notes only" style={inp} />
              </div>
            </div>
            {ipError && <div style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'9px 13px', fontSize:12, color:t.red }}>{ipError}</div>}
            {ipDone  && <div style={{ background:t.green+'15', border:'1px solid '+t.green+'40', borderRadius:8, padding:'9px 13px', fontSize:12, color:t.green }}>✓ Client added!</div>}
            <button onClick={saveOfflineClient} disabled={ipSaving||!ipName} style={{ background: ipSaving||!ipName ? t.surfaceHigh : 'linear-gradient(135deg,'+t.orange+','+t.orange+'cc)', border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color: ipSaving||!ipName ? t.textMuted : '#000', cursor: ipSaving||!ipName ? 'not-allowed' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {ipSaving ? 'Adding...' : 'Add Client'}
            </button>
          </div>
        </div>

        {/* ── Invite history ── */}
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid '+t.border, fontSize:13, fontWeight:800 }}>Recent Invites</div>
          {loading ? (
            <div style={{ padding:'32px', textAlign:'center', color:t.textMuted, fontSize:13 }}>Loading...</div>
          ) : invites.length === 0 ? (
            <div style={{ padding:'32px', textAlign:'center', color:t.textMuted, fontSize:13 }}>No invites sent yet.</div>
          ) : invites.map((inv, i) => (
            <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 20px', borderBottom: i < invites.length-1 ? '1px solid '+t.border : 'none' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{inv.full_name || inv.email}</div>
                <div style={{ fontSize:11, color:t.textMuted }}>{inv.email}</div>
              </div>
              <span style={{ fontSize:11, fontWeight:700, flexShrink:0, borderRadius:20, padding:'3px 10px',
                color: inv.status==='accepted' ? t.green : inv.status==='pending' ? t.orange : t.textMuted,
                background: inv.status==='accepted' ? t.green+'15' : inv.status==='pending' ? t.orangeDim : t.surfaceHigh }}>
                {inv.status==='accepted' ? 'Joined' : inv.status==='pending' ? 'Pending' : inv.status}
              </span>
              <div style={{ fontSize:11, color:t.textMuted, flexShrink:0 }}>
                {new Date(inv.created_at).toLocaleDateString([], { month:'short', day:'numeric' })}
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
