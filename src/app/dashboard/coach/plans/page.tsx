'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#0f0f0f', surface:'#1a1a1a', surfaceHigh:'#242424',
  border:'#2a2a2a', accent:'#c8f545', accentDim:'#a8d435',
  text:'#f0f0f0', textDim:'#888', textMuted:'#555', danger:'#ef4444',
  warn:'#f59e0b', success:'#22c55e'
}

interface Plan {
  id: string
  name: string
  description: string | null
  stripe_price_id: string
  amount_cents: number
  currency: string
  interval: string
  is_active: boolean
  is_default: boolean
  created_at: string
}

const INTERVALS = [
  { value: 'week', label: 'Weekly' },
  { value: 'month', label: 'Monthly' },
  { value: 'year', label: 'Yearly' },
  { value: 'one_time', label: 'One-Time' },
]

export default function PlansPage() {
  const supabase = createClient()
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '', description: '', stripe_price_id: '',
    amount_cents: '', interval: 'month', is_active: true, is_default: false
  })
  const [error, setError] = useState('')
  const [bannerDismissed, setBannerDismissed] = useState(false)

  useEffect(() => { fetchPlans() }, [])

  async function fetchPlans() {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data } = await supabase
      .from('coaching_plans').select('*')
      .eq('coach_id', user.id).order('created_at')
    setPlans(data || [])
    setLoading(false)
  }

  function openCreate() {
    setEditingId(null)
    setForm({ name:'', description:'', stripe_price_id:'', amount_cents:'', interval:'month', is_active:true, is_default:false })
    setError('')
    setShowForm(true)
  }

  function openEdit(plan: Plan) {
    setEditingId(plan.id)
    setForm({
      name: plan.name, description: plan.description || '',
      stripe_price_id: plan.stripe_price_id,
      amount_cents: String(plan.amount_cents / 100),
      interval: plan.interval, is_active: plan.is_active, is_default: plan.is_default
    })
    setError('')
    setShowForm(true)
  }

  async function savePlan() {
    if (!form.name.trim()) { setError('Plan name is required'); return }
    if (!form.stripe_price_id.trim()) { setError('Stripe Price ID is required'); return }
    const cents = Math.round(parseFloat(form.amount_cents) * 100)
    if (isNaN(cents) || cents <= 0) { setError('Enter a valid amount'); return }

    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      coach_id: user.id,
      name: form.name.trim(),
      description: form.description.trim() || null,
      stripe_price_id: form.stripe_price_id.trim(),
      amount_cents: cents,
      currency: 'usd',
      interval: form.interval,
      is_active: form.is_active,
      is_default: form.is_default,
    }

    if (editingId) {
      const { error: err } = await supabase.from('coaching_plans').update(payload).eq('id', editingId)
      if (err) { setError(err.message); setSaving(false); return }
      if (form.is_default) {
        await supabase.from('coaching_plans')
          .update({ is_default: false }).eq('coach_id', user.id).neq('id', editingId)
      }
    } else {
      const { data: newPlan, error: err } = await supabase
        .from('coaching_plans').insert(payload).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      if (form.is_default && newPlan) {
        await supabase.from('coaching_plans')
          .update({ is_default: false }).eq('coach_id', user.id).neq('id', newPlan.id)
      }
    }

    setSaving(false)
    setShowForm(false)
    fetchPlans()
  }

  async function toggleActive(plan: Plan) {
    await supabase.from('coaching_plans').update({ is_active: !plan.is_active }).eq('id', plan.id)
    setPlans(prev => prev.map(p => p.id === plan.id ? { ...p, is_active: !p.is_active } : p))
  }

  async function deletePlan(id: string) {
    if (!confirm('Delete this plan? This cannot be undone.')) return
    await supabase.from('coaching_plans').delete().eq('id', id)
    setPlans(prev => prev.filter(p => p.id !== id))
  }

  const fmtAmount = (cents: number, interval: string) => {
    const amt = `$${(cents / 100).toFixed(2)}`
    if (interval === 'week') return `${amt}/wk`
    if (interval === 'month') return `${amt}/mo`
    if (interval === 'year') return `${amt}/yr`
    return `${amt} one-time`
  }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:"'DM Sans',sans-serif", padding:'32px 24px' }}>
      <div style={{ maxWidth:800, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:32 }}>
          <div>
            <button onClick={()=>router.push('/dashboard/coach')}
              style={{ background:'none', border:'none', color:t.textDim, cursor:'pointer', fontSize:13, marginBottom:8, display:'block' }}>
              ← Back to Dashboard
            </button>
            <h1 style={{ fontSize:26, fontWeight:800, margin:0 }}>Coaching Plans</h1>
            <p style={{ color:t.textDim, fontSize:13, margin:'4px 0 0' }}>
              Set up your pricing tiers. Each plan maps to a Stripe Price ID.
            </p>
          </div>
          <button onClick={openCreate}
            style={{ background:t.accent, color:'#0f0f0f', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, fontSize:14, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
            + New Plan
          </button>
        </div>

        {!bannerDismissed && (
        <div style={{ background:'#1a1a0a', border:'1px solid #3a3a0a', borderRadius:12, padding:'14px 18px', marginBottom:24, display:'flex', gap:12, alignItems:'flex-start' }}>
          <span style={{ fontSize:18 }}>⚡</span>
          <div style={{ flex:1 }}>
            <p style={{ margin:0, fontWeight:700, fontSize:13, color:t.warn }}>Setup Required Before Plans Work</p>
            <p style={{ margin:'4px 0 0', fontSize:12, color:t.textDim, lineHeight:1.5 }}>
              Add <code style={{color:t.accent}}>STRIPE_SECRET_KEY</code>, <code style={{color:t.accent}}>STRIPE_WEBHOOK_SECRET</code>, and <code style={{color:t.accent}}>NEXT_PUBLIC_SITE_URL</code> to your Supabase Edge Function secrets.
              Register the stripe-webhook edge function URL in your Stripe dashboard under Webhooks.
            </p>
          </div>
          <button onClick={()=>setBannerDismissed(true)}
            style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 4px', flexShrink:0 }}>
            ×
          </button>
        </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', color:t.textDim, paddingTop:60 }}>Loading plans...</div>
        ) : plans.length === 0 ? (
          <div style={{ textAlign:'center', background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:60 }}>
            <p style={{ fontSize:36, marginBottom:12 }}>💳</p>
            <p style={{ color:t.textDim, margin:0 }}>No plans yet. Create your first coaching plan to get started.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {plans.map(plan => (
              <div key={plan.id} style={{
                background:t.surface, border:`1px solid ${plan.is_default ? t.accent+'44' : t.border}`,
                borderRadius:14, padding:'18px 20px', display:'flex', alignItems:'center', gap:16,
                opacity: plan.is_active ? 1 : 0.5
              }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontWeight:800, fontSize:15 }}>{plan.name}</span>
                    {plan.is_default && <span style={{ background:t.accent+'22', color:t.accent, fontSize:10, fontWeight:700, borderRadius:6, padding:'2px 8px' }}>DEFAULT</span>}
                    {!plan.is_active && <span style={{ background:t.textMuted+'33', color:t.textMuted, fontSize:10, fontWeight:700, borderRadius:6, padding:'2px 8px' }}>INACTIVE</span>}
                  </div>
                  {plan.description && <p style={{ color:t.textDim, fontSize:12, margin:'0 0 6px' }}>{plan.description}</p>}
                  <div style={{ display:'flex', gap:16, fontSize:12, color:t.textDim }}>
                    <span style={{ color:t.accent, fontWeight:700 }}>{fmtAmount(plan.amount_cents, plan.interval)}</span>
                    <span>Price ID: <code style={{color:t.textDim}}>{plan.stripe_price_id}</code></span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>toggleActive(plan)}
                    style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    {plan.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button onClick={()=>openEdit(plan)}
                    style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Edit
                  </button>
                  <button onClick={()=>deletePlan(plan.id)}
                    style={{ background:'none', border:`1px solid ${t.danger}44`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.danger, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999, padding:20 }}>
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:28, width:'100%', maxWidth:480 }}>
            <h2 style={{ margin:'0 0 20px', fontSize:18, fontWeight:800 }}>{editingId ? 'Edit Plan' : 'New Coaching Plan'}</h2>
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {[
                { label:'Plan Name', key:'name', placeholder:'e.g. Monthly Coaching' },
                { label:'Description (optional)', key:'description', placeholder:"What's included..." },
                { label:'Stripe Price ID', key:'stripe_price_id', placeholder:'price_xxxxxxxxxxxxx' },
                { label:'Amount (USD)', key:'amount_cents', placeholder:'149.00' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ fontSize:12, color:t.textDim, fontWeight:700, display:'block', marginBottom:6 }}>{field.label}</label>
                  <input
                    value={(form as any)[field.key]}
                    onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                    style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px', color:t.text, fontSize:14, outline:'none', fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}
                  />
                </div>
              ))}
              <div>
                <label style={{ fontSize:12, color:t.textDim, fontWeight:700, display:'block', marginBottom:6 }}>Billing Interval</label>
                <select value={form.interval} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}
                  style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'10px 12px', color:t.text, fontSize:14, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                  {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', gap:20 }}>
                {[{ label:'Active', key:'is_active' }, { label:'Set as Default', key:'is_default' }].map(toggle => (
                  <label key={toggle.key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:t.textDim }}>
                    <input type="checkbox" checked={(form as any)[toggle.key]} onChange={e => setForm(f => ({ ...f, [toggle.key]: e.target.checked }))} />
                    {toggle.label}
                  </label>
                ))}
              </div>
              {error && <p style={{ color:t.danger, fontSize:12, margin:0 }}>{error}</p>}
              <div style={{ display:'flex', gap:10, marginTop:6 }}>
                <button onClick={()=>setShowForm(false)}
                  style={{ flex:1, background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'11px', fontSize:14, color:t.textDim, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Cancel
                </button>
                <button onClick={savePlan} disabled={saving}
                  style={{ flex:2, background:t.accent, border:'none', borderRadius:10, padding:'11px', fontSize:14, fontWeight:700, color:'#0f0f0f', cursor:saving?'default':'pointer', opacity:saving?0.7:1, fontFamily:"'DM Sans',sans-serif" }}>
                  {saving ? 'Saving...' : (editingId ? 'Save Changes' : 'Create Plan')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
