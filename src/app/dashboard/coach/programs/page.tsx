'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", text:"#eeeef8", textMuted:"#5a5a78",
  red:"#ef4444", redDim:"#ef444415", green:"#22c55e",
}

export default function ProgramsList() {
  const [programs,  setPrograms]  = useState<any[]>([])
  const [clients,   setClients]   = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showNew,   setShowNew]   = useState(false)
  const [newName,   setNewName]   = useState('')
  const [newClient, setNewClient] = useState('')
  const [creating,  setCreating]  = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      const { data: progs } = await supabase
        .from('programs')
        .select(`*, client:clients(*, profile:profiles!clients_profile_id_fkey(full_name))`)
        .eq('coach_id', user?.id)
        .order('created_at', { ascending: false })
      setPrograms(progs || [])

      const { data: cls } = await supabase
        .from('clients')
        .select(`*, profile:profiles!clients_profile_id_fkey(full_name)`)
        .eq('coach_id', user?.id).eq('active', true)
      setClients(cls || [])
      setLoading(false)
    }
    load()
  }, [])

  const createProgram = async () => {
    if (!newName) return
    setCreating(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: prog } = await supabase.from('programs').insert({
      name: newName,
      coach_id: user?.id,
      client_id: newClient || null,
      active: true,
    }).select().single()
    if (prog) router.push('/dashboard/coach/programs/'+prog.id)
  }

  const deleteProgram = async (id: string) => {
    await supabase.from('programs').delete().eq('id', id)
    setPrograms(prev => prev.filter(p => p.id !== id))
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Programs</div>
          <div style={{ flex:1 }} />
          <button onClick={()=>setShowNew(true)} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 18px', fontSize:13, fontWeight:700, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Program
          </button>
        </div>

        <div style={{ maxWidth:900, margin:'0 auto', padding:28 }}>
          {loading ? (
            <div style={{ color:t.teal, fontSize:14, fontWeight:700 }}>Loading...</div>
          ) : programs.length === 0 ? (
            <div style={{ textAlign:'center', padding:'64px 20px' }}>
              <div style={{ fontSize:48, marginBottom:16 }}>📋</div>
              <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>No programs yet</div>
              <div style={{ fontSize:13, color:t.textMuted, marginBottom:24 }}>Create your first program and assign it to a client.</div>
              <button onClick={()=>setShowNew(true)} style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'12px 28px', fontSize:14, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Create Program
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
              {programs.map(p => (
                <div key={p.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:18, padding:'20px', cursor:'pointer', transition:'all 0.15s ease' }}
                  onClick={()=>router.push('/dashboard/coach/programs/'+p.id)}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=t.teal+'40')}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=t.border)}>
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:12 }}>
                    <div style={{ fontSize:15, fontWeight:800 }}>{p.name}</div>
                    <button onClick={e=>{ e.stopPropagation(); deleteProgram(p.id) }}
                      style={{ background:'none', border:'none', color:t.red+'60', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                  {p.client?.profile?.full_name
                    ? <div style={{ fontSize:12, color:t.teal, fontWeight:700, marginBottom:8 }}>👤 {p.client.profile.full_name}</div>
                    : <div style={{ fontSize:12, color:t.textMuted, marginBottom:8 }}>No client assigned</div>
                  }
                  <div style={{ fontSize:11, color:t.textMuted }}>
                    {p.start_date ? 'Started '+new Date(p.start_date).toLocaleDateString() : 'No start date'}
                  </div>
                  <div style={{ marginTop:12, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ background:p.active?t.tealDim:t.surfaceHigh, border:'1px solid '+(p.active?t.teal+'30':t.border), borderRadius:6, padding:'3px 10px', fontSize:10, fontWeight:700, color:p.active?t.teal:t.textMuted }}>
                      {p.active ? 'Active' : 'Inactive'}
                    </div>
                    <div style={{ fontSize:11, color:t.teal, fontWeight:700 }}>Open →</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* New program modal */}
        {showNew && (
          <div onClick={()=>setShowNew(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', backdropFilter:'blur(10px)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
            <div onClick={e=>e.stopPropagation()} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:20, width:'100%', maxWidth:420, padding:28 }}>
              <div style={{ fontSize:16, fontWeight:800, marginBottom:20 }}>Create Program</div>
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Program Name</div>
                <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. 12-Week Strength Block"
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }} />
              </div>
              <div style={{ marginBottom:24 }}>
                <div style={{ fontSize:11, fontWeight:700, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Assign to Client (optional)</div>
                <select value={newClient} onChange={e=>setNewClient(e.target.value)}
                  style={{ width:'100%', background:t.surfaceUp, border:'1px solid '+t.border, borderRadius:10, padding:'11px 13px', fontSize:13, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", colorScheme:'dark' }}>
                  <option value=''>— Unassigned —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.profile?.full_name}</option>)}
                </select>
              </div>
              <button onClick={createProgram} disabled={!newName||creating}
                style={{ width:'100%', padding:'12px', borderRadius:12, border:'none', background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', color:'#000', fontSize:14, fontWeight:800, cursor:!newName||creating?'not-allowed':'pointer', fontFamily:"'DM Sans',sans-serif", opacity:!newName||creating?0.6:1 }}>
                {creating ? 'Creating...' : 'Create & Open Builder →'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
