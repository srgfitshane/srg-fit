'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', border:'#252538',
  teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  text:'#eeeef8', textMuted:'#5a5a78', textDim:'#8888a8',
  green:'#22c55e', red:'#ef4444', yellow:'#eab308',
}

interface SubData {
  plan_name: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  amount_cents: number
  currency: string
}

export default function BillingTab({ userId }: { userId: string }) {
  const supabase = createClient()
  const [sub, setSub] = useState<SubData | null>(null)
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_name,status,current_period_end,cancel_at_period_end,amount_cents,currency')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      setSub(data)
      setLoading(false)
    }
    load()
  }, [userId])

  const openPortal = async () => {
    setPortalLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open billing portal')
      window.location.href = data.url
    } catch (err: any) {
      setError(err.message)
      setPortalLoading(false)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const formatAmount = (cents: number, currency: string) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'usd' }).format(cents / 100)
  }

  const statusColor = (status: string) => {
    if (status === 'active') return t.green
    if (status === 'past_due') return t.orange
    if (status === 'canceled') return t.red
    return t.textMuted
  }

  const statusLabel = (status: string) => {
    if (status === 'active') return '● Active'
    if (status === 'past_due') return '⚠ Past Due'
    if (status === 'canceled') return '✕ Canceled'
    if (status === 'trialing') return '◎ Trial'
    return status
  }

  if (loading) return (
    <div style={{ padding:'40px 20px', textAlign:'center', color:t.textMuted, fontSize:14 }}>
      Loading billing info...
    </div>
  )

  return (
    <div style={{ padding:'20px 16px 80px', maxWidth:500, margin:'0 auto' }}>
      <div style={{ fontSize:18, fontWeight:900, marginBottom:20 }}>Billing</div>

      {!sub ? (
        <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:'24px 20px', textAlign:'center' }}>
          <div style={{ fontSize:32, marginBottom:12 }}>💳</div>
          <div style={{ fontSize:15, fontWeight:800, marginBottom:8 }}>No active subscription</div>
          <div style={{ fontSize:13, color:t.textMuted, marginBottom:20 }}>
            Contact your coach to get set up with a coaching plan.
          </div>
        </div>
      ) : (
        <>
          {/* Plan card */}
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:'20px', marginBottom:12 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:4 }}>Current Plan</div>
                <div style={{ fontSize:18, fontWeight:900 }}>{sub.plan_name}</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:statusColor(sub.status) }}>
                {statusLabel(sub.status)}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div style={{ background:t.surfaceUp, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:t.textMuted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em' }}>Amount</div>
                <div style={{ fontSize:16, fontWeight:800 }}>{formatAmount(sub.amount_cents, sub.currency)}<span style={{ fontSize:12, color:t.textMuted, fontWeight:400 }}>/mo</span></div>
              </div>
              <div style={{ background:t.surfaceUp, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:11, color:t.textMuted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em' }}>
                  {sub.cancel_at_period_end ? 'Ends On' : 'Renews On'}
                </div>
                <div style={{ fontSize:14, fontWeight:700 }}>{formatDate(sub.current_period_end)}</div>
              </div>
            </div>

            {sub.cancel_at_period_end && (
              <div style={{ marginTop:12, background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red }}>
                ⚠ Your subscription will end on {formatDate(sub.current_period_end)}. You can reactivate any time before then.
              </div>
            )}
          </div>

          {/* Manage button */}
          <button
            onClick={openPortal}
            disabled={portalLoading}
            style={{
              width:'100%', padding:'14px', borderRadius:14, border:`1px solid ${t.border}`,
              background: portalLoading ? t.surfaceUp : t.surfaceUp,
              color: portalLoading ? t.textMuted : t.text,
              fontSize:14, fontWeight:800, cursor: portalLoading ? 'not-allowed' : 'pointer',
              fontFamily:"'DM Sans',sans-serif",
            }}>
            {portalLoading ? 'Opening billing portal...' : '⚙ Manage Subscription'}
          </button>
          <div style={{ fontSize:12, color:t.textDim, textAlign:'center', marginTop:8 }}>
            Update payment method, cancel, or view invoices via Stripe's secure portal.
          </div>

          {error && (
            <div style={{ marginTop:12, background:'#ef444415', border:'1px solid #ef444430', borderRadius:10, padding:'10px 14px', fontSize:13, color:t.red }}>
              {error}
            </div>
          )}
        </>
      )}
    </div>
  )
}
