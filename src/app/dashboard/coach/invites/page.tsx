'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', purple:'#8b5cf6', purpleDim:'#8b5cf615',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

type Invite = {
  id: string; email: string; full_name: string | null; status: string
  created_at: string; expires_at: string; accepted_at: string | null; message: string | null
}

type Form = { id: string; title: string }

export default function InvitesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [invites, setInvites] = useState<Invite[]>([])
  const [forms, setForms] = useState<Form[]>([])
  const [loading, setLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [filter, setFilter] = useState<'all'|'pending'|'accepted'|'cancelled'>('all')
  const [form, setForm] = useState({
    email: '', full_name: '', message: '', onboarding_form_id: ''
  })

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      const [{ data: inv }, { data: frms }] = await Promise.all([
        supabase.from('client_invites').select('*').eq('coach_id', user.id).order('created_at', { ascending: false }),
        supabase.from('onboarding_forms').select('id,title').eq('coach_id', user.id)
      ])
      setInvites(inv || [])
      setForms(frms || [])
      setLoading(false)
    }
    load()
  }, [])

  const sendInvite = async () => {
    if (!form.email || !coachId) return
    setSending(true)
    const payload: any = { coach_id: coachId, email: form.email.trim().toLowerCase() }
    if (form.full_name) payload.full_name = form.full_name
    if (form.message) payload.message = form.message
    if (form.onboarding_form_id) payload.onboarding_form_id = form.onboarding_form_id
    const { data, error } = await supabase.from('client_invites').insert(payload).select().single()
    if (!error && data) {
      // Send email via edge function
      await supabase.functions.invoke('send-invite-email', { body: { invite_id: data.id } })
      setInvites(p => [data, ...p])
      setSent(true)
      setTimeout(() => { setSent(false); setShowModal(false); setForm({ email:'', full_name:'', message:'', onboarding_form_id:'' }) }, 2000)
    }
    setSending(false)
  }

  const cancelInvite = async (id: string) => {
    await supabase.from('client_invites').update({ status: 'cancelled' }).eq('id', id)
    setInvites(p => p.map(i => i.id === id ? { ...i, status: 'cancelled' } : i))
  }

  const resendInvite = async (id: string) => {
    await supabase.from('client_invites').update({ status: 'pending', expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString() }).eq('id', id)
    await supabase.functions.invoke('send-invite-email', { body: { invite_id: id } })
    setInvites(p => p.map(i => i.id === id ? { ...i, status: 'pending' } : i))
  }

  const filtered = filter === 'all' ? invites : invites.filter(i => i.status === filter)
  const statusColor = (s: string) => s === 'accepted' ? t.green : s === 'pending' ? t.orange : t.textMuted
  const statusBg   = (s: string) => s === 'accepted' ? t.greenDim : s === 'pending' ? t.orangeDim : t.surfaceHigh

  const Input = ({ field, placeholder, type='text' }: any) => (
    <input value={(form as any)[field]} onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))}
      placeholder={placeholder} type={type}
      style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any }} />
  )

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>Loading...</div>

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:800, margin:'0 auto', padding:'20px 20px 80px' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:22, fontWeight:900, background:`linear-gradient(135deg,${t.teal},${t.orange})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent' }}>Client Invites</div>
            <div style={{ fontSize:12, color:t.textMuted }}>{invites.filter(i=>i.status==='pending').length} pending · {invites.filter(i=>i.status==='accepted').length} accepted</div>
          </div>
          <button onClick={()=>setShowModal(true)}
            style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:11, padding:'10px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Invite Client
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:16 }}>
          {(['all','pending','accepted','cancelled'] as const).map(f => (
            <button key={f} onClick={()=>setFilter(f)}
              style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:'1px solid '+(filter===f?t.teal+'60':t.border), background:filter===f?t.tealDim:'transparent', color:filter===f?t.teal:t.textDim, fontFamily:"'DM Sans',sans-serif", textTransform:'capitalize' }}>
              {f}
            </button>
          ))}
        </div>

        {/* Invite list */}
        {filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📨</div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No invites yet</div>
            <div style={{ fontSize:12 }}>Send your first invite to get clients into the app</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {filtered.map(inv => (
              <div key={inv.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:42, height:42, borderRadius:'50%', background:t.surfaceHigh, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                  {inv.status === 'accepted' ? '✅' : inv.status === 'cancelled' ? '❌' : '📧'}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>{inv.full_name || inv.email}</div>
                  <div style={{ fontSize:12, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{inv.email}</div>
                  <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>
                    Sent {new Date(inv.created_at).toLocaleDateString()} · Expires {new Date(inv.expires_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800, background:statusBg(inv.status), color:statusColor(inv.status), textTransform:'capitalize' }}>
                    {inv.status}
                  </div>
                  {inv.status === 'pending' && (
                    <>
                      <button onClick={()=>resendInvite(inv.id)} style={{ background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Resend</button>
                      <button onClick={()=>cancelInvite(inv.id)} style={{ background:t.redDim, border:'1px solid '+t.red+'40', borderRadius:8, padding:'5px 10px', fontSize:11, fontWeight:700, color:t.red, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Cancel</button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Send invite modal */}
        {showModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:460 }}>
              <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>Invite a Client</div>
              <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>They'll receive an email with a link to sign up and complete onboarding.</div>

              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <div><div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Email *</div><Input field="email" placeholder="client@email.com" type="email" /></div>
                <div><div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Name (optional)</div><Input field="full_name" placeholder="First Last" /></div>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Onboarding Form</div>
                  <select value={form.onboarding_form_id} onChange={e=>setForm(p=>({...p, onboarding_form_id:e.target.value}))}
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:form.onboarding_form_id?t.text:t.textMuted, outline:'none', fontFamily:"'DM Sans',sans-serif", appearance:'none' as any }}>
                    <option value="">None (use default if set)</option>
                    {forms.map(f => <option key={f.id} value={f.id} style={{ background:t.surfaceHigh }}>{f.title}</option>)}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Personal Note (optional)</div>
                  <textarea value={form.message} onChange={e=>setForm(p=>({...p, message:e.target.value}))} rows={3}
                    placeholder="Hey! I'm excited to work with you. Here's your invite to SRG Fit..."
                    style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", resize:'vertical' }} />
                </div>
              </div>

              <div style={{ display:'flex', gap:10, marginTop:20 }}>
                <button onClick={()=>{ setShowModal(false); setForm({ email:'', full_name:'', message:'', onboarding_form_id:'' }) }}
                  style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={sendInvite} disabled={!form.email || sending}
                  style={{ flex:2, background: sent?t.green:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:sending?'not-allowed':'pointer', opacity:(!form.email||sending)?.5:1, fontFamily:"'DM Sans',sans-serif", transition:'background .3s' }}>
                  {sent ? '✓ Invite Sent!' : sending ? 'Sending...' : '📨 Send Invite'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
