'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', red:'#ef4444', redDim:'#ef444415', green:'#22c55e',
  greenDim:'#22c55e15', text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
}

const COLORS = ['#00c9b1','#f5a623','#8b5cf6','#ef4444','#22c55e','#3b82f6']

export default function ArchivedClientsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [restoring, setRestoring] = useState<string|null>(null)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('clients')
        .select('*, profile:profiles!clients_profile_id_fkey(full_name, email, avatar_url)')
        .eq('coach_id', user.id)
        .eq('archived', true)
        .order('archived_at', { ascending: false })
      setClients(data || [])
      setLoading(false)
    }
    load()
  }, [])

  const restore = async (id: string) => {
    setRestoring(id)
    await supabase.from('clients').update({ archived: false, active: true, archived_at: null }).eq('id', id)
    setClients(p => p.filter(c => c.id !== id))
    setRestoring(null)
  }

  if (loading) return <div style={{ background:t.bg, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'DM Sans',sans-serif", color:t.textMuted }}>Loading...</div>

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}`}</style>

      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text, maxWidth:680, margin:'0 auto', padding:'20px 20px 80px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <button onClick={()=>router.push('/dashboard/coach')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:20, fontWeight:900, color:t.text }}>Archived Clients</div>
            <div style={{ fontSize:12, color:t.textMuted }}>{clients.length} archived</div>
          </div>
        </div>

        {clients.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', color:t.textMuted }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📦</div>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>No archived clients</div>
            <div style={{ fontSize:12 }}>Archived clients will appear here</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {clients.map((client, i) => {
              const initials = client.profile?.full_name?.split(' ').map((n:string)=>n[0]).join('') || '?'
              const color = COLORS[i % COLORS.length]
              return (
                <div key={client.id} style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:'14px 16px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:42, height:42, borderRadius:13, background:'linear-gradient(135deg,'+color+','+color+'88)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:'#000', flexShrink:0, opacity:.7 }}>
                    {initials}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:2, color:t.textDim }}>{client.profile?.full_name || 'Unknown'}</div>
                    <div style={{ fontSize:12, color:t.textMuted }}>{client.profile?.email}</div>
                    {client.archived_at && <div style={{ fontSize:11, color:t.textMuted, marginTop:2 }}>Archived {new Date(client.archived_at).toLocaleDateString()}</div>}
                  </div>
                  <button onClick={()=>restore(client.id)} disabled={restoring===client.id}
                    style={{ padding:'7px 14px', borderRadius:9, fontSize:12, fontWeight:700, border:'1px solid '+t.green+'40', background:t.greenDim, color:t.green, cursor:restoring===client.id?'not-allowed':'pointer', opacity:restoring===client.id?.5:1, fontFamily:"'DM Sans',sans-serif" }}>
                    {restoring===client.id ? '...' : '↩ Restore'}
                  </button>
                  <button onClick={()=>router.push('/dashboard/coach/clients/'+client.id)}
                    style={{ padding:'7px 14px', borderRadius:9, fontSize:12, fontWeight:700, border:'1px solid '+t.border, background:t.surfaceHigh, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    View →
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}
