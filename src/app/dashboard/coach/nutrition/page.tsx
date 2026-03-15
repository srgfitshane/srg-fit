'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', accent:'#c8f545', accentDim:'#c8f54515',
  text:'#f0f0f0', textDim:'#888', textMuted:'#555',
  red:'#ff4d6d', green:'#22c55e', greenDim:'#22c55e15', purple:'#a855f7'
}

interface Client { id: string; profile_id: string; full_name: string }
interface Plan {
  id: string; name: string; client_id: string; calories_target: number
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number
  water_oz: number; approach: string; notes_coach: string; is_active: boolean
  clients?: { profiles?: { full_name: string } }
}
export default function CoachNutritionPage() {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [view, setView] = useState<'list'|'create'|'edit'>('list')
  const [editing, setEditing] = useState<Plan|null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_id:'', name:'Nutrition Plan', approach:'flexible',
    calories_target:'', protein_g:'', carbs_g:'', fat_g:'',
    fiber_g:'25', water_oz:'64', notes_coach:''
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user.id).single()

    const [{ data: cls }, { data: pls }] = await Promise.all([
      supabase.from('clients').select('id, profile_id').eq('coach_id', profile?.id).neq('status','archived'),
      supabase.from('nutrition_plans').select(`*, clients(id, profiles(full_name))`).eq('coach_id', profile?.id).order('created_at', { ascending: false })
    ])

    const clientsWithNames: Client[] = []
    for (const c of cls || []) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', c.profile_id).single()
      clientsWithNames.push({ ...c, full_name: p?.full_name || 'Unknown' })
    }

    setClients(clientsWithNames)
    setPlans(pls || [])
    setLoading(false)
  }

  function inp(f: string, v: string) { setForm(prev => ({ ...prev, [f]: v })) }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setForm({
      client_id: plan.client_id,
      name: plan.name,
      approach: plan.approach || 'flexible',
      calories_target: String(plan.calories_target || ''),
      protein_g: String(plan.protein_g || ''),
      carbs_g: String(plan.carbs_g || ''),
      fat_g: String(plan.fat_g || ''),
      fiber_g: String(plan.fiber_g || '25'),
      water_oz: String(plan.water_oz || '64'),
      notes_coach: plan.notes_coach || ''
    })
    setView('edit')
  }

  async function savePlan() {
    if (!form.client_id) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('id').eq('user_id', user!.id).single()

    const payload = {
      client_id: form.client_id,
      coach_id: profile?.id,
      name: form.name,
      approach: form.approach,
      calories_target: parseInt(form.calories_target) || null,
      protein_g: parseInt(form.protein_g) || null,
      carbs_g: parseInt(form.carbs_g) || null,
      fat_g: parseInt(form.fat_g) || null,
      fiber_g: parseInt(form.fiber_g) || null,
      water_oz: parseInt(form.water_oz) || 64,
      notes: form.notes_coach || null,
      is_active: true
    }

    if (view === 'edit' && editing) {
      await supabase.from('nutrition_plans').update(payload).eq('id', editing.id)
    } else {
      // deactivate existing active plan for this client first
      await supabase.from('nutrition_plans').update({ is_active: false })
        .eq('client_id', form.client_id).eq('is_active', true)
      const { data: newPlan } = await supabase.from('nutrition_plans').insert(payload).select().single()
      // notify client
      const client = clients.find(c => c.id === form.client_id)
      if (client && newPlan) {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: client.profile_id,
            notification_type: 'program_assigned',
            title: `New nutrition plan: ${form.name}`,
            body: `Your coach has assigned you a new nutrition plan`,
            link_url: '/dashboard/client'
          })
        })
      }
    }

    setSaving(false)
    setView('list')
    setEditing(null)
    loadData()
  }

  async function toggleActive(plan: Plan) {
    await supabase.from('nutrition_plans').update({ is_active: !plan.is_active }).eq('id', plan.id)
    loadData()
  }

  const macroCalc = () => {
    const p = parseInt(form.protein_g)||0
    const c = parseInt(form.carbs_g)||0
    const f = parseInt(form.fat_g)||0
    return (p*4) + (c*4) + (f*9)
  }

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",padding:'24px',maxWidth:900,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:13}}>← Dashboard</button>
          <div style={{flex:1}}/>
          <h1 style={{fontSize:22,fontWeight:900}}>🥗 Nutrition</h1>
          <div style={{flex:1}}/>
          {view==='list' ? (
            <button onClick={()=>{setView('create');setEditing(null);setForm({client_id:'',name:'Nutrition Plan',approach:'flexible',calories_target:'',protein_g:'',carbs_g:'',fat_g:'',fiber_g:'25',water_oz:'64',notes_coach:''})}}
              style={{background:t.accent,border:'none',borderRadius:10,padding:'8px 18px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer'}}>
              + Assign Plan
            </button>
          ) : (
            <button onClick={()=>{setView('list');setEditing(null)}}
              style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:10,padding:'8px 14px',fontSize:13,color:t.textDim,cursor:'pointer'}}>
              ← Back
            </button>
          )}
        </div>

        {loading ? (
          <div style={{color:t.textMuted,textAlign:'center',paddingTop:60}}>Loading...</div>
        ) : view === 'list' ? (
          <PlanList plans={plans} clients={clients} onEdit={openEdit} onToggle={toggleActive} t={t} router={router}/>
        ) : (
          <PlanForm form={form} inp={inp} clients={clients} view={view} macroCalc={macroCalc}
            savePlan={savePlan} saving={saving} t={t} APPROACHES={APPROACHES}/>
        )}
      </div>
    </>
  )
}

function PlanList({ plans, clients, onEdit, onToggle, t, router }: any) {
  const clientName = (plan: any) => plan.clients?.profiles?.full_name || clients.find((c:any)=>c.id===plan.client_id)?.full_name || 'Client'
  return (
    <div>
      {plans.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>🥗</div>
          <p style={{fontSize:15,fontWeight:600,color:t.textDim}}>No nutrition plans yet</p>
          <p style={{fontSize:13}}>Click "Assign Plan" to create one</p>
        </div>
      ) : (
        <div style={{display:'grid',gap:12}}>
          {plans.map((plan: any) => (
            <div key={plan.id} style={{background:t.surface,border:`1px solid ${plan.is_active?t.teal+'40':t.border}`,borderRadius:14,padding:'18px 20px'}}>
              <div style={{display:'flex',alignItems:'flex-start',gap:12,marginBottom:12}}>
                <div style={{flex:1}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                    <span style={{fontWeight:800,fontSize:16}}>{plan.name}</span>
                    {plan.is_active && <span style={{fontSize:10,fontWeight:700,color:t.teal,background:t.tealDim,padding:'2px 8px',borderRadius:20}}>ACTIVE</span>}
                  </div>
                  <div style={{fontSize:13,color:t.textDim}}>{clientName(plan)}</div>
                  {plan.approach && <div style={{fontSize:12,color:t.orange,marginTop:2}}>{APPROACHES.find((a:any)=>a.id===plan.approach)?.label}</div>}
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={()=>onEdit(plan)}
                    style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:t.textDim,cursor:'pointer'}}>
                    Edit
                  </button>
                  <button onClick={()=>onToggle(plan)}
                    style={{background:plan.is_active?t.orangeDim:'#1a1a2e',border:`1px solid ${plan.is_active?t.orange+'40':t.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:plan.is_active?t.orange:t.textMuted,cursor:'pointer'}}>
                    {plan.is_active?'Deactivate':'Activate'}
                  </button>
                </div>
              </div>
              {(plan.calories_target || plan.protein_g) && (
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {[
                    { label:'Calories', val: plan.calories_target, unit:'kcal', color:t.accent },
                    { label:'Protein',  val: plan.protein_g,       unit:'g',    color:'#60a5fa' },
                    { label:'Carbs',    val: plan.carbs_g,         unit:'g',    color:t.orange },
                    { label:'Fat',      val: plan.fat_g,           unit:'g',    color:'#f472b6' },
                    { label:'Water',    val: plan.water_oz,        unit:'oz',   color:t.teal },
                  ].filter(m=>m.val).map(m=>(
                    <div key={m.label} style={{background:t.surfaceHigh,borderRadius:8,padding:'6px 10px',textAlign:'center',minWidth:64}}>
                      <div style={{fontSize:14,fontWeight:800,color:m.color}}>{m.val}{m.unit}</div>
                      <div style={{fontSize:10,color:t.textMuted}}>{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {plan.notes && (
                <div style={{marginTop:10,fontSize:12,color:t.textDim,borderTop:`1px solid ${t.border}`,paddingTop:10}}>
                  📌 {plan.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const APPROACHES = [
  { id:'flexible',    label:'Flexible / IIFYM',    desc:'Hit macros, food choices open' },
  { id:'macros_only', label:'Macros Only',          desc:'Track macros, no meal timing' },
  { id:'meal_plan',   label:'Structured Meal Plan', desc:'Specific meals at specific times' },
  { id:'intuitive',   label:'Intuitive Eating',     desc:'No tracking, mindful eating cues' },
]

function PlanForm({ form, inp, clients, view, macroCalc, savePlan, saving, t, APPROACHES }: any) {
  const calcCals = macroCalc()
  const canSave = form.client_id

  return (
    <div style={{maxWidth:620}}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Plan Details</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Client *</label>
            <select value={form.client_id} onChange={e=>inp('client_id',e.target.value)}
              style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:form.client_id?t.text:t.textMuted,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}>
              <option value="">Select client...</option>
              {clients.map((c:any)=><option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:4}}>Plan Name</label>
            <input value={form.name} onChange={e=>inp('name',e.target.value)}
              style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'9px 12px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
          </div>
        </div>
        <div style={{marginBottom:12}}>
          <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:8}}>Approach</label>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {APPROACHES.map((a:any)=>(
              <div key={a.id} onClick={()=>inp('approach',a.id)}
                style={{padding:'10px 14px',borderRadius:10,border:`1px solid ${form.approach===a.id?t.teal:t.border}`,background:form.approach===a.id?t.tealDim:t.surfaceHigh,cursor:'pointer'}}>
                <div style={{fontSize:13,fontWeight:700,color:form.approach===a.id?t.teal:t.text}}>{a.label}</div>
                <div style={{fontSize:11,color:t.textMuted}}>{a.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {form.approach !== 'intuitive' && (
        <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
          <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Daily Targets</p>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
            {[
              {label:'Calories (kcal)', field:'calories_target', placeholder:'2000'},
              {label:'Protein (g)',     field:'protein_g',       placeholder:'150'},
              {label:'Carbs (g)',       field:'carbs_g',         placeholder:'200'},
              {label:'Fat (g)',         field:'fat_g',           placeholder:'65'},
              {label:'Fiber (g)',       field:'fiber_g',         placeholder:'25'},
              {label:'Water (oz)',      field:'water_oz',        placeholder:'64'},
            ].map(f=>(
              <div key={f.field}>
                <label style={{fontSize:11,color:t.textDim,display:'block',marginBottom:3}}>{f.label}</label>
                <input type="number" value={(form as any)[f.field]} onChange={e=>inp(f.field,e.target.value)} placeholder={f.placeholder}
                  style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'8px 10px',color:t.text,fontSize:14,fontFamily:"'DM Sans',sans-serif"}}/>
              </div>
            ))}
          </div>
          {calcCals > 0 && (
            <div style={{background:t.accentDim,border:`1px solid ${t.accent}30`,borderRadius:8,padding:'8px 12px',fontSize:12,color:t.accent}}>
              💡 Calculated from macros: ~{calcCals} kcal/day
              {form.calories_target && Math.abs(calcCals - parseInt(form.calories_target)) > 50 &&
                ` (vs. target ${form.calories_target} kcal — ${Math.abs(calcCals - parseInt(form.calories_target))} kcal difference)`}
            </div>
          )}
        </div>
      )}

      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <label style={{fontSize:12,color:t.textDim,display:'block',marginBottom:6}}>Coach Notes (visible to client)</label>
        <textarea value={form.notes_coach} onChange={e=>inp('notes_coach',e.target.value)}
          placeholder="Focus on hitting protein first. Don't stress about hitting calories exact — within 100 kcal is great..."
          rows={3}
          style={{width:'100%',background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'10px 12px',color:t.text,fontSize:14,resize:'vertical',fontFamily:"'DM Sans',sans-serif"}}/>
      </div>

      <button onClick={savePlan} disabled={!canSave||saving}
        style={{width:'100%',background:canSave?t.accent:'#2a2a3a',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontWeight:700,color:canSave?'#0f0f0f':t.textMuted,cursor:canSave?'pointer':'not-allowed',fontFamily:"'DM Sans',sans-serif"}}>
        {saving ? 'Saving...' : view==='edit' ? '✓ Update Plan' : '✓ Assign Nutrition Plan'}
      </button>
    </div>
  )
}
