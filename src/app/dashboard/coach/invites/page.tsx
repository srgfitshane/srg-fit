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
type Form = { id: string; title: string; is_default: boolean }

export default function InvitesPage() {
  const supabase = createClient()
  const router = useRouter()
  const [invites,   setInvites]   = useState<Invite[]>([])
  const [forms,     setForms]     = useState<Form[]>([])
  const [loading,   setLoading]   = useState(true)
  const [coachId,   setCoachId]   = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [modalMode, setModalMode] = useState<'invite'|'inperson'>('invite')
  const [sending,   setSending]   = useState(false)
  const [filter,    setFilter]    = useState<'all'|'pending'|'accepted'|'cancelled'>('all')
  const [form, setForm] = useState({ email:'', full_name:'', message:'', onboarding_form_id:'' })

  // In-person client form
  const [ipForm, setIpForm] = useState({ full_name:'', email:'', phone:'', notes:'' })
  const [ipSaving, setIpSaving] = useState(false)
  const [ipDone,   setIpDone]   = useState(false)

  // Post-send "What's next?" modal
  const [showNext,     setShowNext]     = useState(false)
  const [lastInvite,   setLastInvite]   = useState<Invite|null>(null)
  const [nextFormId,   setNextFormId]   = useState('')
  const [nextNote,     setNextNote]     = useState('')
  const [assigning,    setAssigning]    = useState(false)
  const [assignDone,   setAssignDone]   = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCoachId(user.id)
      const [{ data: inv }, { data: frms }] = await Promise.all([
        supabase.from('client_invites').select('*').eq('coach_id', user.id).order('created_at', { ascending: false }),
        supabase.from('onboarding_forms').select('id,title,is_default').eq('coach_id', user.id)
      ])
      setInvites(inv || [])
      setForms(frms || [])
      setLoading(false)
    }
    load()
  }, [])

  const [sendResult, setSendResult] = useState<{url?:string, note?:string} | null>(null)

  const sendInvite = async () => {
    if (!form.email || !coachId) return
    setSending(true)
    const payload: any = { coach_id: coachId, email: form.email.trim().toLowerCase() }
    if (form.full_name) payload.full_name = form.full_name
    if (form.message) payload.message = form.message
    if (form.onboarding_form_id) payload.onboarding_form_id = form.onboarding_form_id
    const { data, error } = await supabase.from('client_invites').insert(payload).select().single()
    if (!error && data) {
      const { data: fnResult } = await supabase.functions.invoke('send-invite-email', { body: { invite_id: data.id } })
      setInvites(p => [data, ...p])
      setLastInvite(data)
      // Capture result to show if email was sent or link needed
      if (fnResult?.note || fnResult?.invite_url) {
        setSendResult({ url: fnResult.invite_url, note: fnResult.note })
      }
      const chosenForm = form.onboarding_form_id || forms.find(f=>f.is_default)?.id || ''
      setNextFormId(chosenForm)
      setShowModal(false)
      setForm({ email:'', full_name:'', message:'', onboarding_form_id:'' })
      setShowNext(true)
    }
    setSending(false)
  }

  const assignFormToInvite = async () => {
    if (!nextFormId || !lastInvite || !coachId) return
    setAssigning(true)
    // We don't have a client_id yet (not accepted), so we store on the invite itself
    // and the accept flow will pick it up. For now just update the invite's form.
    await supabase.from('client_invites').update({ onboarding_form_id: nextFormId }).eq('id', lastInvite.id)
    setAssignDone(true)
    setAssigning(false)
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

  const addInPersonClient = async () => {
    if (!ipForm.full_name || !coachId) return
    setIpSaving(true)
    // 1. Create a bare-bones profile row (no auth user — coach manages everything)
    const { data: newProfile, error: profErr } = await supabase
      .from('profiles')
      .insert({ full_name: ipForm.full_name, email: ipForm.email || null, role: 'client' })
      .select()
      .single()
    if (profErr || !newProfile) { setIpSaving(false); alert('Failed to create profile: ' + profErr?.message); return }

    // 2. Create the client record linked to the coach
    const { error: clientErr } = await supabase
      .from('clients')
      .insert({
        profile_id: newProfile.id,
        coach_id: coachId,
        active: true,
        subscription_status: 'active',
        coach_notes: ipForm.notes || null,
      })
    if (clientErr) { setIpSaving(false); alert('Failed to create client: ' + clientErr.message); return }

    setIpSaving(false)
    setIpDone(true)
    // Reload client list after a moment
    setTimeout(() => {
      setShowModal(false)
      setIpForm({ full_name:'', email:'', phone:'', notes:'' })
      setIpDone(false)
    }, 1800)
  }

  const filtered = filter === 'all' ? invites : invites.filter(i => i.status === filter)
  const statusColor = (s: string) => s === 'accepted' ? t.green : s === 'pending' ? t.orange : t.textMuted
  const statusBg   = (s: string) => s === 'accepted' ? t.greenDim : s === 'pending' ? t.orangeDim : t.surfaceHigh

  const sty = { width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:9, padding:'10px 12px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as any }

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
          <button onClick={()=>{ setShowModal(true); setModalMode('invite') }}
            style={{ background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:11, padding:'10px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + Add Client
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

        {/* ── Add Client modal ── */}
        {showModal && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:24, width:'100%', maxWidth:460 }}>

              {/* Mode toggle */}
              <div style={{ display:'flex', gap:6, marginBottom:20, background:t.surfaceHigh, borderRadius:12, padding:4 }}>
                <button onClick={()=>setModalMode('invite')}
                  style={{ flex:1, padding:'8px', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', border:'none', background:modalMode==='invite'?t.teal:'transparent', color:modalMode==='invite'?'#000':t.textMuted, fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s' }}>
                  📨 Invite via Email
                </button>
                <button onClick={()=>setModalMode('inperson')}
                  style={{ flex:1, padding:'8px', borderRadius:9, fontSize:13, fontWeight:700, cursor:'pointer', border:'none', background:modalMode==='inperson'?t.orange:'transparent', color:modalMode==='inperson'?'#000':t.textMuted, fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s' }}>
                  🤝 In-Person Only
                </button>
              </div>

              {/* ── Invite mode ── */}
              {modalMode === 'invite' && (<>
                <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>Invite a Client</div>
                <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>They'll get an email with a link to sign up and get started.</div>

                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Email *</div>
                    <input value={form.email} onChange={e=>setForm(p=>({...p,email:e.target.value}))} placeholder="client@email.com" type="email" style={sty} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Name (optional)</div>
                    <input value={form.full_name} onChange={e=>setForm(p=>({...p,full_name:e.target.value}))} placeholder="First Last" style={sty} />
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Attach a Form</div>
                    <select value={form.onboarding_form_id} onChange={e=>setForm(p=>({...p,onboarding_form_id:e.target.value}))}
                      style={{ ...sty, appearance:'none' as any, color:form.onboarding_form_id?t.text:t.textMuted }}>
                      <option value="">None (assign later)</option>
                      {forms.map(f => <option key={f.id} value={f.id} style={{ background:t.surfaceHigh }}>{f.title}{f.is_default?' (default)':''}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Personal Note (optional)</div>
                    <textarea value={form.message} onChange={e=>setForm(p=>({...p,message:e.target.value}))} rows={3}
                      placeholder="Hey! I'm excited to work with you..."
                      style={{ ...sty, resize:'vertical' as any }} />
                  </div>
                </div>

                <div style={{ display:'flex', gap:10, marginTop:20 }}>
                  <button onClick={()=>{ setShowModal(false); setForm({ email:'', full_name:'', message:'', onboarding_form_id:'' }) }}
                    style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Cancel
                  </button>
                  <button onClick={sendInvite} disabled={!form.email || sending}
                    style={{ flex:2, background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:sending||!form.email?'not-allowed':'pointer', opacity:(!form.email||sending)?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
                    {sending ? 'Sending...' : '📨 Send Invite'}
                  </button>
                </div>
              </>)}

              {/* ── In-person mode ── */}
              {modalMode === 'inperson' && (<>
                <div style={{ fontSize:18, fontWeight:900, marginBottom:4 }}>Add In-Person Client</div>
                <div style={{ fontSize:12, color:t.textMuted, marginBottom:20 }}>No app access, no invite, no payment flow — just adds them to your client roster so you can track their programs and notes.</div>

                {ipDone ? (
                  <div style={{ textAlign:'center', padding:'24px 0' }}>
                    <div style={{ fontSize:36, marginBottom:10 }}>✅</div>
                    <div style={{ fontSize:16, fontWeight:800 }}>{ipForm.full_name} added!</div>
                    <div style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>They're now in your client roster.</div>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Full Name *</div>
                      <input value={ipForm.full_name} onChange={e=>setIpForm(p=>({...p,full_name:e.target.value}))} placeholder="First Last" style={sty} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Email (optional — for reference only)</div>
                      <input value={ipForm.email} onChange={e=>setIpForm(p=>({...p,email:e.target.value}))} placeholder="their@email.com" type="email" style={sty} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Phone (optional)</div>
                      <input value={ipForm.phone} onChange={e=>setIpForm(p=>({...p,phone:e.target.value}))} placeholder="(555) 555-5555" style={sty} />
                    </div>
                    <div>
                      <div style={{ fontSize:11, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Notes (optional)</div>
                      <textarea value={ipForm.notes} onChange={e=>setIpForm(p=>({...p,notes:e.target.value}))} rows={2}
                        placeholder="e.g. Tuesday/Thursday sessions, parking lot gym..."
                        style={{ ...sty, resize:'vertical' as any }} />
                    </div>
                  </div>
                )}

                {!ipDone && (
                  <div style={{ display:'flex', gap:10, marginTop:20 }}>
                    <button onClick={()=>{ setShowModal(false); setIpForm({ full_name:'', email:'', phone:'', notes:'' }) }}
                      style={{ flex:1, background:'transparent', border:'1px solid '+t.border, borderRadius:11, padding:'11px', fontSize:13, fontWeight:700, color:t.textMuted, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                      Cancel
                    </button>
                    <button onClick={addInPersonClient} disabled={!ipForm.full_name || ipSaving}
                      style={{ flex:2, background:`linear-gradient(135deg,${t.orange},${t.orange}cc)`, border:'none', borderRadius:11, padding:'11px', fontSize:13, fontWeight:800, color:'#000', cursor:ipSaving||!ipForm.full_name?'not-allowed':'pointer', opacity:(!ipForm.full_name||ipSaving)?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
                      {ipSaving ? 'Adding...' : '🤝 Add Client'}
                    </button>
                  </div>
                )}
              </>)}

            </div>
          </div>
        )}

        {/* ── Post-invite "What's next?" modal ── */}
        {showNext && lastInvite && (
          <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, padding:28, width:'100%', maxWidth:480 }}>
              <div style={{ textAlign:'center', marginBottom:20 }}>
                <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
                <div style={{ fontSize:17, fontWeight:900, marginBottom:4 }}>Invite sent!</div>
                <div style={{ fontSize:13, color:t.textMuted }}>
                  {lastInvite.full_name || lastInvite.email} will get an email shortly.
                </div>
              </div>

              {/* Show direct link if email may not have gone out */}
              {sendResult?.url && (
                <div style={{ background:t.orangeDim, border:'1px solid '+t.orange+'40', borderRadius:12, padding:'12px 14px', marginBottom:16 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:t.orange, marginBottom:6 }}>
                    ⚠️ {sendResult.note || 'Email may not have sent — share this link directly:'}
                  </div>
                  <div style={{ fontSize:11, color:t.text, wordBreak:'break-all', background:t.surfaceHigh, borderRadius:8, padding:'8px 10px', marginBottom:8, fontFamily:'monospace' }}>
                    {sendResult.url}
                  </div>
                  <button onClick={()=>navigator.clipboard.writeText(sendResult.url!)}
                    style={{ background:t.orange, border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    📋 Copy Link
                  </button>
                </div>
              )}

              <div style={{ background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:14, padding:16, marginBottom:16 }}>
                <div style={{ fontSize:12, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Attach a Form</div>
                <div style={{ fontSize:13, color:t.textDim, marginBottom:10, lineHeight:1.5 }}>
                  They'll be prompted to fill this out after signing up.
                </div>
                <select value={nextFormId} onChange={e=>setNextFormId(e.target.value)}
                  style={{ ...sty, color:nextFormId?t.text:t.textMuted, appearance:'none' as any }}>
                  <option value="">No form</option>
                  {forms.map(f => <option key={f.id} value={f.id} style={{ background:t.surfaceHigh }}>{f.title}{f.is_default?' (default)':''}</option>)}
                </select>
                {nextFormId && (
                  <div style={{ marginTop:10 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:5 }}>Note to client (optional)</div>
                    <input value={nextNote} onChange={e=>setNextNote(e.target.value)} placeholder="e.g. Please fill this out before our first call"
                      style={sty} />
                  </div>
                )}
                {nextFormId && !assignDone && (
                  <button onClick={assignFormToInvite} disabled={assigning}
                    style={{ marginTop:10, width:'100%', background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:9, padding:'9px', fontSize:12, fontWeight:700, color:t.teal, cursor:assigning?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:assigning?.6:1 }}>
                    {assigning ? 'Saving...' : '✓ Attach Form to Invite'}
                  </button>
                )}
                {assignDone && (
                  <div style={{ marginTop:10, background:t.greenDim, border:'1px solid '+t.green+'30', borderRadius:9, padding:'9px', fontSize:12, fontWeight:700, color:t.green, textAlign:'center' }}>
                    ✓ Form attached!
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
                <button onClick={()=>{ setShowNext(false); router.push('/dashboard/coach/onboarding') }}
                  style={{ padding:'11px', borderRadius:11, border:'1px solid '+t.border, background:t.surfaceHigh, fontSize:12, fontWeight:700, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  📝 Manage Forms
                </button>
                <button onClick={()=>{ setShowNext(false); setShowModal(true) }}
                  style={{ padding:'11px', borderRadius:11, border:'1px solid '+t.teal+'40', background:t.tealDim, fontSize:12, fontWeight:700, color:t.teal, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  + Invite Another
                </button>
              </div>

              <button onClick={()=>{ setShowNext(false); setAssignDone(false); setNextFormId(''); setNextNote(''); setSendResult(null) }}
                style={{ width:'100%', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:11, padding:'12px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
