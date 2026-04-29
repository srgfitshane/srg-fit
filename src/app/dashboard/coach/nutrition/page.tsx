'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:'#080810', surface:'#0f0f1a', surfaceUp:'#161624', surfaceHigh:'#1d1d2e',
  border:'#252538', teal:'#00c9b1', tealDim:'#00c9b115', orange:'#f5a623',
  orangeDim:'#f5a62315', accent:'#c8f545', accentDim:'#c8f54515',
  text:'#f0f0f0', textDim:'#888', textMuted:'#555',
  red:'#ff4d6d', green:'#22c55e', greenDim:'#22c55e15', purple:'#a855f7',
  purpleDim:'#a855f715'
}

interface Client { id: string; profile_id: string; full_name: string }
interface Plan {
  id: string; name: string; client_id: string; calories_target: number
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number
  water_oz: number; approach: string; notes_coach: string; is_active: boolean
  clients?: { profiles?: { full_name: string } }
}
interface Template {
  id: string; name: string; approach: string; calories_target: number
  protein_g: number; carbs_g: number; fat_g: number; fiber_g: number
  water_oz: number; notes_coach: string
}

const APPROACHES = [
  { id:'flexible',    label:'Flexible / IIFYM',    desc:'Hit macros, food choices open' },
  { id:'macros_only', label:'Macros Only',          desc:'Track macros, no meal timing' },
  { id:'meal_plan',   label:'Structured Meal Plan', desc:'Specific meals at specific times' },
  { id:'intuitive',   label:'Intuitive Eating',     desc:'No tracking, mindful eating cues' },
]

const EMPTY_FORM = {
  client_id:'', name:'Nutrition Plan', approach:'flexible',
  calories_target:'', protein_g:'', carbs_g:'', fat_g:'',
  fiber_g:'25', water_oz:'64', notes_coach:''
}

export default function CoachNutritionPage() {
  const supabase = createClient()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [view, setView] = useState<'plans'|'templates'|'create'|'edit'|'newTemplate'>('plans')
  const [editing, setEditing] = useState<Plan|null>(null)
  const [editingTemplate, setEditingTemplate] = useState<Template|null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [coachId, setCoachId] = useState<string|null>(null)
  const [showTemplatePicker, setShowTemplatePicker] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [templateForm, setTemplateForm] = useState({
    name:'', approach:'flexible',
    calories_target:'', protein_g:'', carbs_g:'', fat_g:'',
    fiber_g:'25', water_oz:'64', notes_coach:''
  })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setCoachId(user.id)

    const [{ data: cls }, { data: pls }, { data: tmpl }] = await Promise.all([
      supabase.from('clients').select('id, profile_id').eq('coach_id', user.id).eq('active', true),
      supabase.from('nutrition_plans').select(`*, clients(id, profiles(full_name))`).eq('coach_id', user.id).order('created_at', { ascending: false }),
      supabase.from('nutrition_templates').select('*').eq('coach_id', user.id).order('created_at')
    ])

    const clientsWithNames: Client[] = []
    for (const c of cls || []) {
      const { data: p } = await supabase.from('profiles').select('full_name').eq('id', c.profile_id).single()
      clientsWithNames.push({ ...c, full_name: p?.full_name || 'Unknown' })
    }

    setClients(clientsWithNames)
    setPlans(pls || [])
    setTemplates(tmpl || [])
    setLoading(false)
  }

  function inp(f: string, v: string) { setForm(prev => ({ ...prev, [f]: v })) }
  function tInp(f: string, v: string) { setTemplateForm(prev => ({ ...prev, [f]: v })) }

  function applyTemplate(tmpl: Template) {
    setForm(prev => ({
      ...prev,
      name: tmpl.name,
      approach: tmpl.approach || 'flexible',
      calories_target: String(tmpl.calories_target || ''),
      protein_g: String(tmpl.protein_g || ''),
      carbs_g: String(tmpl.carbs_g || ''),
      fat_g: String(tmpl.fat_g || ''),
      fiber_g: String(tmpl.fiber_g || '25'),
      water_oz: String(tmpl.water_oz || '64'),
      notes_coach: tmpl.notes_coach || '',
    }))
    setShowTemplatePicker(false)
  }

  function openEdit(plan: Plan) {
    setEditing(plan)
    setForm({
      client_id: plan.client_id, name: plan.name,
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
    if (!form.client_id || !coachId) return
    setSaving(true)
    const payload = {
      client_id: form.client_id, coach_id: coachId, name: form.name,
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
      await supabase.from('nutrition_plans').update({ is_active: false })
        .eq('client_id', form.client_id).eq('is_active', true)
      const { data: newPlan } = await supabase.from('nutrition_plans').insert(payload).select().single()
      const client = clients.find(c => c.id === form.client_id)
      if (client && newPlan) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.access_token) {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-notification`, {
            method: 'POST', headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            },
            body: JSON.stringify({
              user_id: client.profile_id,
              notification_type: 'program_assigned',
              title: `New nutrition plan: ${form.name}`,
              body: `Your coach has assigned you a new nutrition plan`,
              link_url: '/dashboard/client?tab=nutrition'
            })
          })
        }
      }
    }
    setSaving(false); setView('plans'); setEditing(null)
    loadData()
  }

  async function saveTemplate() {
    if (!templateForm.name || !coachId) return
    setSaving(true)
    const payload = {
      coach_id: coachId, name: templateForm.name, approach: templateForm.approach,
      calories_target: parseInt(templateForm.calories_target) || null,
      protein_g: parseInt(templateForm.protein_g) || null,
      carbs_g: parseInt(templateForm.carbs_g) || null,
      fat_g: parseInt(templateForm.fat_g) || null,
      fiber_g: parseInt(templateForm.fiber_g) || null,
      water_oz: parseInt(templateForm.water_oz) || 64,
      notes_coach: templateForm.notes_coach || null,
    }
    if (editingTemplate) {
      await supabase.from('nutrition_templates').update(payload).eq('id', editingTemplate.id)
    } else {
      await supabase.from('nutrition_templates').insert(payload)
    }
    setSaving(false); setView('templates'); setEditingTemplate(null)
    setTemplateForm({ name:'', approach:'flexible', calories_target:'', protein_g:'', carbs_g:'', fat_g:'', fiber_g:'25', water_oz:'64', notes_coach:'' })
    loadData()
  }

  async function deleteTemplate(id: string) {
    await supabase.from('nutrition_templates').delete().eq('id', id)
    setTemplates(p => p.filter(t => t.id !== id))
  }

  async function toggleActive(plan: Plan) {
    await supabase.from('nutrition_plans').update({ is_active: !plan.is_active }).eq('id', plan.id)
    loadData()
  }

  const macroCalc = (f: any = form) => {
    const p = parseInt((f as any).protein_g)||0
    const c = parseInt((f as any).carbs_g)||0
    const fat = parseInt((f as any).fat_g)||0
    return (p*4) + (c*4) + (fat*9)
  }

  const sty = {
    inp: { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:8, padding:'9px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' as const, colorScheme:'dark' as const },
    label: { fontSize:11, color:t.textDim, display:'block', marginBottom:4, fontWeight:600 } as const,
  }

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:${t.border};border-radius:4px;}`}</style>
      <div style={{minHeight:'100vh',background:t.bg,color:t.text,fontFamily:"'DM Sans',sans-serif",padding:'24px',maxWidth:900,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
          <button onClick={()=>router.push('/dashboard/coach')}
            style={{background:'none',border:'none',color:t.textDim,cursor:'pointer',fontSize:13,fontFamily:"'DM Sans',sans-serif"}}>← Dashboard</button>
          <div style={{flex:1}}/>
          <h1 style={{fontSize:22,fontWeight:900}}>🥗 Nutrition</h1>
          <div style={{flex:1}}/>
          {/* Action button based on view */}
          {(view==='plans'||view==='templates') ? (
            <div style={{display:'flex',gap:8}}>
              {view==='plans' && (
                <button onClick={()=>{setView('create');setEditing(null);setForm({...EMPTY_FORM});setShowTemplatePicker(false)}}
                  style={{background:t.accent,border:'none',borderRadius:10,padding:'8px 18px',fontSize:13,fontWeight:700,color:'#0f0f0f',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  + Assign Plan
                </button>
              )}
              {view==='templates' && (
                <button onClick={()=>{setView('newTemplate');setEditingTemplate(null);setTemplateForm({name:'',approach:'flexible',calories_target:'',protein_g:'',carbs_g:'',fat_g:'',fiber_g:'25',water_oz:'64',notes_coach:''})}}
                  style={{background:t.purple,border:'none',borderRadius:10,padding:'8px 18px',fontSize:13,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                  + New Template
                </button>
              )}
            </div>
          ) : (
            <button onClick={()=>{setView(view==='create'||view==='edit'?'plans':'templates');setEditing(null)}}
              style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:10,padding:'8px 14px',fontSize:13,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
              ← Back
            </button>
          )}
        </div>

        {/* Tab bar */}
        {(view==='plans'||view==='templates') && (
          <div style={{display:'flex',gap:6,marginBottom:20,background:t.surface,borderRadius:12,padding:'4px',border:`1px solid ${t.border}`}}>
            {[{id:'plans',label:'📋 Plans'},{id:'templates',label:'⚡ Templates'}].map(tab=>(
              <button key={tab.id} onClick={()=>setView(tab.id as any)}
                style={{flex:1,padding:'8px',borderRadius:9,border:'none',background:view===tab.id?t.accent:'transparent',color:view===tab.id?'#0f0f0f':t.textDim,fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",transition:'all .15s'}}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{color:t.textMuted,textAlign:'center',paddingTop:60}}>Loading...</div>
        ) : view === 'plans' ? (
          <PlanList plans={plans} clients={clients} onEdit={openEdit} onToggle={toggleActive} t={t} router={router}/>
        ) : view === 'templates' ? (
          <TemplateList templates={templates} onEdit={(tmpl:Template)=>{setEditingTemplate(tmpl);setTemplateForm({name:tmpl.name,approach:tmpl.approach||'flexible',calories_target:String(tmpl.calories_target||''),protein_g:String(tmpl.protein_g||''),carbs_g:String(tmpl.carbs_g||''),fat_g:String(tmpl.fat_g||''),fiber_g:String(tmpl.fiber_g||'25'),water_oz:String(tmpl.water_oz||'64'),notes_coach:tmpl.notes_coach||''});setView('newTemplate')}} onDelete={deleteTemplate} t={t}/>
        ) : (view === 'create' || view === 'edit') ? (
          <PlanForm
            form={form} inp={inp} clients={clients} view={view} macroCalc={()=>macroCalc()}
            savePlan={savePlan} saving={saving} t={t} APPROACHES={APPROACHES} sty={sty}
            templates={templates} showTemplatePicker={showTemplatePicker}
            setShowTemplatePicker={setShowTemplatePicker} applyTemplate={applyTemplate}
          />
        ) : (
          <TemplateForm
            form={templateForm} inp={tInp} macroCalc={()=>macroCalc(templateForm)}
            saveTemplate={saveTemplate} saving={saving} editing={editingTemplate}
            t={t} APPROACHES={APPROACHES} sty={sty}
          />
        )}
      </div>
    </>
  )
}

// ── Plan list ────────────────────────────────────────────────────────────
function PlanList({ plans, clients, onEdit, onToggle, t, router }: any) {
  const clientName = (plan: any) => plan.clients?.profiles?.full_name || clients.find((c:any)=>c.id===plan.client_id)?.full_name || 'Client'
  return (
    <div>
      {plans.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>🥗</div>
          <p style={{fontSize:15,fontWeight:600,color:t.textDim}}>No nutrition plans yet</p>
          <p style={{fontSize:13}}>Click "Assign Plan" to get started</p>
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
                  <button onClick={()=>onEdit(plan)} style={{background:t.surfaceHigh,border:`1px solid ${t.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:t.textDim,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Edit</button>
                  <button onClick={()=>onToggle(plan)} style={{background:plan.is_active?t.orangeDim:'#1a1a2e',border:`1px solid ${plan.is_active?t.orange+'40':t.border}`,borderRadius:8,padding:'6px 12px',fontSize:12,color:plan.is_active?t.orange:t.textMuted,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
                    {plan.is_active?'Deactivate':'Activate'}
                  </button>
                </div>
              </div>
              {(plan.calories_target || plan.protein_g) && (
                <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                  {[
                    {label:'Calories',val:plan.calories_target,unit:'kcal',color:'#c8f545'},
                    {label:'Protein',val:plan.protein_g,unit:'g',color:'#60a5fa'},
                    {label:'Carbs',val:plan.carbs_g,unit:'g',color:t.orange},
                    {label:'Fat',val:plan.fat_g,unit:'g',color:'#f472b6'},
                    {label:'Water',val:plan.water_oz,unit:'oz',color:t.teal},
                  ].filter(m=>m.val).map(m=>(
                    <div key={m.label} style={{background:t.surfaceHigh,borderRadius:8,padding:'6px 10px',textAlign:'center',minWidth:64}}>
                      <div style={{fontSize:14,fontWeight:800,color:m.color}}>{m.val}{m.unit}</div>
                      <div style={{fontSize:10,color:t.textMuted}}>{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Template list ────────────────────────────────────────────────────────
function TemplateList({ templates, onEdit, onDelete, t }: any) {
  return (
    <div>
      {templates.length === 0 ? (
        <div style={{textAlign:'center',padding:'60px 20px',color:t.textMuted}}>
          <div style={{fontSize:40,marginBottom:12}}>⚡</div>
          <p style={{fontSize:15,fontWeight:600,color:t.textDim}}>No templates yet</p>
          <p style={{fontSize:13}}>Save time — create reusable plan blueprints for common goals</p>
          <p style={{fontSize:12,color:t.textMuted,marginTop:8}}>e.g. "Fat Loss 1800", "Maintenance 2400", "Lean Bulk 2800"</p>
        </div>
      ) : (
        <div style={{display:'grid',gap:10}}>
          {templates.map((tmpl: any) => (
            <div key={tmpl.id} style={{background:t.surface,border:`1px solid ${t.purple}30`,borderRadius:14,padding:'16px 18px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{width:40,height:40,borderRadius:10,background:t.purpleDim,border:`1px solid ${t.purple}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>⚡</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:14,marginBottom:2}}>{tmpl.name}</div>
                <div style={{fontSize:12,color:t.textDim}}>{APPROACHES.find((a:any)=>a.id===tmpl.approach)?.label}</div>
                <div style={{display:'flex',gap:6,marginTop:4,flexWrap:'wrap'}}>
                  {[
                    {label:'kcal',val:tmpl.calories_target,color:'#c8f545'},
                    {label:'P',val:tmpl.protein_g?tmpl.protein_g+'g':null,color:'#60a5fa'},
                    {label:'C',val:tmpl.carbs_g?tmpl.carbs_g+'g':null,color:t.orange},
                    {label:'F',val:tmpl.fat_g?tmpl.fat_g+'g':null,color:'#f472b6'},
                  ].filter(m=>m.val).map(m=>(
                    <span key={m.label} style={{fontSize:11,fontWeight:700,color:m.color,background:t.surfaceHigh,borderRadius:6,padding:'2px 7px'}}>{m.label}: {m.val}</span>
                  ))}
                </div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button onClick={()=>onEdit(tmpl)} style={{background:t.purpleDim,border:`1px solid ${t.purple}40`,borderRadius:8,padding:'6px 12px',fontSize:12,fontWeight:700,color:t.purple,cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>Edit</button>
                <button onClick={()=>onDelete(tmpl.id)} style={{background:'#1a0a0a',border:`1px solid ${t.red}40`,borderRadius:8,padding:'6px 10px',fontSize:12,color:t.red,cursor:'pointer'}}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Shared macro inputs ──────────────────────────────────────────────────
function MacroFields({ form, inp, macroCalc, t, sty }: any) {
  const calcCals = macroCalc()
  return (
    <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
      <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Daily Targets</p>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:12}}>
        {[
          {label:'Calories (kcal)',field:'calories_target',placeholder:'2000'},
          {label:'Protein (g)',field:'protein_g',placeholder:'150'},
          {label:'Carbs (g)',field:'carbs_g',placeholder:'200'},
          {label:'Fat (g)',field:'fat_g',placeholder:'65'},
          {label:'Fiber (g)',field:'fiber_g',placeholder:'25'},
          {label:'Water (oz)',field:'water_oz',placeholder:'64'},
        ].map(f=>(
          <div key={f.field}>
            <label style={sty.label}>{f.label}</label>
            <input type="number" value={(form as any)[f.field]} onChange={e=>inp(f.field,e.target.value)} placeholder={f.placeholder} style={sty.inp}/>
          </div>
        ))}
      </div>
      {calcCals > 0 && (
        <div style={{background:'#c8f54515',border:'1px solid #c8f54530',borderRadius:8,padding:'8px 12px',fontSize:12,color:'#c8f545'}}>
          💡 From macros: ~{calcCals} kcal/day
          {form.calories_target && Math.abs(calcCals - parseInt(form.calories_target)) > 50 &&
            ` (target ${form.calories_target} kcal — ${Math.abs(calcCals - parseInt(form.calories_target))} kcal off)`}
        </div>
      )}
    </div>
  )
}

// ── Plan form (assign to client) ─────────────────────────────────────────
function PlanForm({ form, inp, clients, view, macroCalc, savePlan, saving, t, APPROACHES, sty, templates, showTemplatePicker, setShowTemplatePicker, applyTemplate }: any) {
  return (
    <div style={{maxWidth:620}}>
      {/* Template picker strip */}
      {templates.length > 0 && (
        <div style={{background:t.purpleDim,border:`1px solid ${t.purple}30`,borderRadius:12,padding:'12px 16px',marginBottom:16,display:'flex',alignItems:'center',gap:10}}>
          <span style={{fontSize:13,color:t.purple,fontWeight:700,flex:1}}>⚡ Use a template to pre-fill macros</span>
          <button onClick={()=>setShowTemplatePicker(!showTemplatePicker)}
            style={{background:t.purple,border:'none',borderRadius:9,padding:'6px 14px',fontSize:12,fontWeight:700,color:'#fff',cursor:'pointer',fontFamily:"'DM Sans',sans-serif"}}>
            {showTemplatePicker ? 'Close' : 'Pick Template →'}
          </button>
        </div>
      )}

      {/* Template picker dropdown */}
      {showTemplatePicker && (
        <div style={{background:t.surface,border:`1px solid ${t.purple}40`,borderRadius:12,padding:'12px',marginBottom:16,display:'grid',gap:8}}>
          {templates.map((tmpl: any) => (
            <button key={tmpl.id} onClick={()=>applyTemplate(tmpl)}
              style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',borderRadius:10,border:`1px solid ${t.border}`,background:t.surfaceHigh,cursor:'pointer',fontFamily:"'DM Sans',sans-serif",textAlign:'left'}}>
              <span style={{fontSize:16}}>⚡</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:700,color:t.text}}>{tmpl.name}</div>
                <div style={{fontSize:11,color:t.textDim}}>{[tmpl.calories_target?tmpl.calories_target+'kcal':null,tmpl.protein_g?tmpl.protein_g+'g P':null,tmpl.carbs_g?tmpl.carbs_g+'g C':null,tmpl.fat_g?tmpl.fat_g+'g F':null].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{color:t.purple,fontSize:13}}>Apply →</span>
            </button>
          ))}
        </div>
      )}

      {/* Plan details */}
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Plan Details</p>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div>
            <label style={sty.label}>Client *</label>
            <select value={form.client_id} onChange={e=>inp('client_id',e.target.value)} style={{...sty.inp,appearance:'none'}}>
              <option value="">Select client...</option>
              {clients.map((c:any)=><option key={c.id} value={c.id}>{c.full_name}</option>)}
            </select>
          </div>
          <div>
            <label style={sty.label}>Plan Name</label>
            <input value={form.name} onChange={e=>inp('name',e.target.value)} style={sty.inp}/>
          </div>
        </div>
        <label style={sty.label}>Approach</label>
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

      {form.approach !== 'intuitive' && <MacroFields form={form} inp={inp} macroCalc={macroCalc} t={t} sty={sty}/>}

      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <label style={sty.label}>Coach Notes (visible to client)</label>
        <textarea value={form.notes_coach} onChange={e=>inp('notes_coach',e.target.value)}
          placeholder="Focus on hitting protein first. Don't stress about hitting calories exact..." rows={3}
          style={{...sty.inp,resize:'vertical',lineHeight:1.5}}/>
      </div>

      <button onClick={savePlan} disabled={!form.client_id||saving}
        style={{width:'100%',background:form.client_id?t.accent:'#2a2a3a',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontWeight:700,color:form.client_id?'#0f0f0f':t.textMuted,cursor:form.client_id?'pointer':'not-allowed',fontFamily:"'DM Sans',sans-serif"}}>
        {saving ? 'Saving...' : view==='edit' ? '✓ Update Plan' : '✓ Assign Nutrition Plan'}
      </button>
    </div>
  )
}

// ── Template form (save reusable blueprint) ──────────────────────────────
function TemplateForm({ form, inp, macroCalc, saveTemplate, saving, editing, t, APPROACHES, sty }: any) {
  return (
    <div style={{maxWidth:620}}>
      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <p style={{fontSize:12,fontWeight:700,color:t.textDim,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:14}}>Template Details</p>
        <div style={{marginBottom:12}}>
          <label style={sty.label}>Template Name *</label>
          <input value={form.name} onChange={e=>inp('name',e.target.value)} placeholder="e.g. Fat Loss 1800, Lean Bulk 2800..." style={sty.inp}/>
        </div>
        <label style={sty.label}>Approach</label>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {APPROACHES.map((a:any)=>(
            <div key={a.id} onClick={()=>inp('approach',a.id)}
              style={{padding:'10px 14px',borderRadius:10,border:`1px solid ${form.approach===a.id?t.purple:t.border}`,background:form.approach===a.id?t.purpleDim:t.surfaceHigh,cursor:'pointer'}}>
              <div style={{fontSize:13,fontWeight:700,color:form.approach===a.id?t.purple:t.text}}>{a.label}</div>
              <div style={{fontSize:11,color:t.textMuted}}>{a.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {form.approach !== 'intuitive' && <MacroFields form={form} inp={inp} macroCalc={macroCalc} t={t} sty={sty}/>}

      <div style={{background:t.surface,border:`1px solid ${t.border}`,borderRadius:14,padding:'20px',marginBottom:16}}>
        <label style={sty.label}>Default Notes (optional, copied to plans using this template)</label>
        <textarea value={form.notes_coach} onChange={e=>inp('notes_coach',e.target.value)}
          placeholder="Standard notes for this template type..." rows={3}
          style={{...sty.inp,resize:'vertical',lineHeight:1.5}}/>
      </div>

      <button onClick={saveTemplate} disabled={!form.name||saving}
        style={{width:'100%',background:form.name?t.purple:'#2a2a3a',border:'none',borderRadius:12,padding:'14px',fontSize:15,fontWeight:700,color:form.name?'#fff':t.textMuted,cursor:form.name?'pointer':'not-allowed',fontFamily:"'DM Sans',sans-serif"}}>
        {saving ? 'Saving...' : editing ? '✓ Update Template' : '⚡ Save Template'}
      </button>
    </div>
  )
}
