'use client'
import { useState, useEffect, useRef } from 'react'

const USDA_KEY = process.env.NEXT_PUBLIC_USDA_API_KEY || ''
const FDC_URL  = 'https://api.nal.usda.gov/fdc/v1'

const MEAL_LABELS = [
  { id:'breakfast',   label:'Breakfast',    icon:'🌅' },
  { id:'lunch',       label:'Lunch',        icon:'🥙' },
  { id:'dinner',      label:'Dinner',       icon:'🍽️' },
  { id:'snack',       label:'Snack',        icon:'🍎' },
  { id:'pre_workout', label:'Pre-Workout',  icon:'⚡' },
  { id:'post_workout',label:'Post-Workout', icon:'💪' },
]

type FoodEntry = {
  id: string
  food_name: string
  meal_time: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  serving_size: string
  logged_at: string
}

type AddMode = 'none' | 'search' | 'quick' | 'barcode' | 'saved'

export default function NutritionTab({ clientRecord, supabase, t }: any) {
  const today = new Date().toISOString().split('T')[0]
  const [plan,          setPlan]          = useState<any>(null)
  const [log,           setLog]           = useState<any>(null)
  const [entries,       setEntries]       = useState<FoodEntry[]>([])
  const [loading,       setLoading]       = useState(true)
  const [addMode,       setAddMode]       = useState<AddMode>('none')
  const [selectedDate,  setSelectedDate]  = useState(today)
  // Search
  const [searchQ,       setSearchQ]       = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searching,     setSearching]     = useState(false)
  const searchTimer = useRef<any>(null)
  // Quick add
  const [quick, setQuick] = useState({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
  // Meal label picker — shown after choosing a food
  const [pendingFood,   setPendingFood]   = useState<Partial<FoodEntry> | null>(null)
  const [saving,        setSaving]        = useState(false)
  // Barcode
  const [barcodeVal,    setBarcodeVal]    = useState('')
  const [barcodeResult, setBarcodeResult] = useState<any>(null)
  const [barcodeErr,    setBarcodeErr]    = useState('')
  const [barcodeLoading,setBarcodeLoading]= useState(false)
  // Saved foods
  const [savedFoods,    setSavedFoods]    = useState<any[]>([])

  useEffect(() => { if (clientRecord?.id) loadData() }, [clientRecord?.id, selectedDate])

  async function loadData() {
    setLoading(true)
    const [{ data: activePlan }, { data: dailyLog }] = await Promise.all([
      supabase.from('nutrition_plans').select('*').eq('client_id', clientRecord.id).eq('is_active', true).single(),
      supabase.from('nutrition_daily_logs').select('*').eq('client_id', clientRecord.id).eq('log_date', selectedDate).single()
    ])
    setPlan(activePlan)
    if (dailyLog) {
      setLog(dailyLog)
      const { data: ents } = await supabase.from('food_entries').select('*')
        .eq('daily_log_id', dailyLog.id).order('logged_at')
      setEntries(ents || [])
    } else {
      setLog(null); setEntries([])
    }
    // load saved foods (distinct food names logged before)
    const { data: prev } = await supabase.from('food_entries').select('food_name,calories,protein_g,carbs_g,fat_g,serving_size')
      .eq('client_id', clientRecord.id).order('logged_at', { ascending: false }).limit(60)
    if (prev) {
      const seen = new Set<string>()
      const unique = prev.filter((f:any) => { if (seen.has(f.food_name)) return false; seen.add(f.food_name); return true })
      setSavedFoods(unique.slice(0, 20))
    }
    setLoading(false)
  }

  async function ensureLog() {
    if (log) return log
    const { data: newLog } = await supabase.from('nutrition_daily_logs').upsert({
      client_id: clientRecord.id, coach_id: clientRecord.coach_id,
      plan_id: plan?.id || null, log_date: selectedDate,
    }, { onConflict: 'client_id,log_date' }).select().single()
    setLog(newLog); return newLog
  }

  async function commitEntry(meal_time: string) {
    if (!pendingFood) return
    setSaving(true)
    const currentLog = await ensureLog()
    const entry = {
      daily_log_id: currentLog.id, client_id: clientRecord.id, meal_time,
      food_name:   pendingFood.food_name   || '',
      serving_size:pendingFood.serving_size|| '1 serving',
      serving_qty: 1,
      calories:    pendingFood.calories    ?? null,
      protein_g:   pendingFood.protein_g   ?? null,
      carbs_g:     pendingFood.carbs_g     ?? null,
      fat_g:       pendingFood.fat_g       ?? null,
    }
    const { data: saved } = await supabase.from('food_entries').insert(entry).select().single()
    if (saved) {
      const next = [...entries, saved]
      setEntries(next)
      await recalcTotals(currentLog.id, next)
    }
    setPendingFood(null); setAddMode('none')
    setSearchQ(''); setSearchResults([])
    setQuick({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
    setBarcodeVal(''); setBarcodeResult(null); setBarcodeErr('')
    setSaving(false)
  }

  async function removeEntry(id: string) {
    await supabase.from('food_entries').delete().eq('id', id)
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    if (log) await recalcTotals(log.id, updated)
  }

  async function recalcTotals(logId: string, ents: any[]) {
    const totals = ents.reduce((acc, e) => ({
      total_calories: acc.total_calories + (e.calories  || 0),
      total_protein:  acc.total_protein  + (e.protein_g || 0),
      total_carbs:    acc.total_carbs    + (e.carbs_g   || 0),
      total_fat:      acc.total_fat      + (e.fat_g     || 0),
    }), { total_calories:0, total_protein:0, total_carbs:0, total_fat:0 })
    const { data: updated } = await supabase.from('nutrition_daily_logs').update(totals).eq('id', logId).select().single()
    if (updated) setLog(updated)
  }

  // ── USDA search ──────────────────────────────────────────────────────────
  function handleSearchInput(val: string) {
    setSearchQ(val)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(() => doSearch(val), 500)
  }

  async function doSearch(q: string) {
    setSearching(true)
    try {
      const res = await fetch(`${FDC_URL}/foods/search?api_key=${USDA_KEY}&query=${encodeURIComponent(q)}&pageSize=10&dataType=Survey%20(FNDDS),SR%20Legacy,Branded`)
      const data = await res.json()
      setSearchResults(data.foods || [])
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  function pickUSDAFood(food: any) {
    const nutrients = food.foodNutrients || []
    const get = (name: string) => {
      const n = nutrients.find((x:any) => x.nutrientName?.toLowerCase().includes(name))
      return n ? Math.round(n.value * 10) / 10 : null
    }
    setPendingFood({
      food_name:   food.description,
      calories:    get('energy'),
      protein_g:   get('protein'),
      carbs_g:     get('carbohydrate'),
      fat_g:       get('total lipid'),
      serving_size: food.servingSize ? `${food.servingSize}${food.servingSizeUnit || 'g'}` : '100g',
    })
  }

  // ── Barcode lookup ────────────────────────────────────────────────────────
  async function lookupBarcode(code: string) {
    setBarcodeLoading(true); setBarcodeErr(''); setBarcodeResult(null)
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      const data = await res.json()
      if (data.status === 1 && data.product) {
        const p = data.product
        const n = p.nutriments || {}
        setBarcodeResult({
          food_name:   p.product_name || p.product_name_en || 'Unknown product',
          calories:    n['energy-kcal_100g'] || n['energy-kcal'] || null,
          protein_g:   n.proteins_100g       || n.proteins      || null,
          carbs_g:     n.carbohydrates_100g  || n.carbohydrates || null,
          fat_g:       n.fat_100g            || n.fat           || null,
          serving_size: p.serving_size || '100g',
        })
      } else { setBarcodeErr('Product not found. Try Quick Add instead.') }
    } catch { setBarcodeErr('Lookup failed. Check your connection.') }
    setBarcodeLoading(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const totals = {
    calories: log?.total_calories || 0,
    protein:  log?.total_protein  || 0,
    carbs:    log?.total_carbs    || 0,
    fat:      log?.total_fat      || 0,
  }
  const pct = (val: number, target: number) => target > 0 ? Math.min(100, Math.round((val/target)*100)) : 0
  const macros = [
    { label:'Calories', val:Math.round(totals.calories), target:plan?.calories_target, unit:'kcal', color:'#c8f545' },
    { label:'Protein',  val:Math.round(totals.protein),  target:plan?.protein_g,       unit:'g',    color:'#60a5fa' },
    { label:'Carbs',    val:Math.round(totals.carbs),    target:plan?.carbs_g,         unit:'g',    color:'#f5a623' },
    { label:'Fat',      val:Math.round(totals.fat),      target:plan?.fat_g,           unit:'g',    color:'#f472b6' },
  ]

  // group entries by meal
  const byMeal: Record<string, FoodEntry[]> = {}
  for (const e of entries) {
    const k = e.meal_time || 'snack'
    if (!byMeal[k]) byMeal[k] = []
    byMeal[k].push(e)
  }
  const mealOrder = MEAL_LABELS.map(m => m.id)
  const usedMeals = [...new Set([...mealOrder.filter(m => byMeal[m]), ...Object.keys(byMeal).filter(m => !mealOrder.includes(m))])]

  if (!clientRecord) return null

  // shared input style
  const inp = { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'9px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' } as const
  const macroRow = { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 } as const

  return (
    <div style={{ paddingBottom:80 }}>

      {/* ── Date bar ── */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'7px 12px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        {selectedDate !== today && (
          <button onClick={()=>setSelectedDate(today)}
            style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.textDim, cursor:'pointer' }}>
            Today
          </button>
        )}
        {plan && <span style={{ fontSize:12, color:t.teal, marginLeft:'auto' }}>📋 {plan.name}</span>}
      </div>

      {loading ? (
        <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted }}>Loading...</div>
      ) : (<>

        {/* ── No plan notice ── */}
        {!plan && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'16px 18px', marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:26, marginBottom:6 }}>🥗</div>
            <p style={{ fontSize:13, fontWeight:700, color:t.textDim }}>No active nutrition plan yet</p>
            <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your targets. You can still log food below!</p>
          </div>
        )}

        {/* ── Coach note ── */}
        {plan?.notes && (
          <div style={{ background:'#1a1a0a', border:'1px solid #3a3a1a', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', gap:8 }}>
            <span style={{ fontSize:15 }}>📌</span>
            <p style={{ fontSize:13, color:t.orange, lineHeight:1.5 }}>{plan.notes}</p>
          </div>
        )}

        {/* ── Macro rings ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
          {macros.map(m => {
            const p = pct(m.val, m.target)
            const r = 22, circ = 2 * Math.PI * r
            return (
              <div key={m.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'12px 8px', textAlign:'center' }}>
                <svg width="56" height="56" style={{ display:'block', margin:'0 auto 6px' }}>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={t.surfaceHigh} strokeWidth="4"/>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={m.color} strokeWidth="4"
                    strokeDasharray={circ} strokeDashoffset={circ - circ * p / 100}
                    strokeLinecap="round" transform="rotate(-90 28 28)"
                    style={{ transition:'stroke-dashoffset 0.5s ease' }}/>
                  <text x="28" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill={m.color}>{p}%</text>
                </svg>
                <div style={{ fontSize:14, fontWeight:800, color:t.text }}>{m.val}<span style={{ fontSize:10, color:t.textMuted, fontWeight:400 }}>{m.unit}</span></div>
                {m.target ? <div style={{ fontSize:10, color:t.textMuted }}>/{m.target}{m.unit}</div> : <div style={{ fontSize:10, color:t.textMuted }}>—</div>}
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{m.label}</div>
              </div>
            )
          })}
        </div>

        {/* ── Add food button row ── */}
        {addMode === 'none' && !pendingFood && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:t.textDim, marginBottom:10 }}>Add food to {selectedDate === today ? 'Today' : selectedDate}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
              {([
                { mode:'search' as AddMode,  icon:'🔍', label:'Search Foods' },
                { mode:'quick'  as AddMode,  icon:'➕', label:'Quick Add'    },
                { mode:'barcode'as AddMode,  icon:'📷', label:'Barcode'      },
                { mode:'saved'  as AddMode,  icon:'⭐', label:'Saved Foods'  },
              ]).map(({ mode, icon, label }) => (
                <button key={mode} onClick={()=>setAddMode(mode)}
                  style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim, lineHeight:1.2, textAlign:'center' }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── SEARCH MODE ── */}
        {addMode === 'search' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>🔍 Search Foods</span>
              <button onClick={()=>{setAddMode('none');setSearchQ('');setSearchResults([])}}
                style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <input value={searchQ} onChange={e=>handleSearchInput(e.target.value)}
              placeholder="e.g. chicken breast, greek yogurt, banana..." autoFocus
              style={{ ...inp, marginBottom:10 }}/>
            {searching && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center', padding:'8px 0' }}>Searching USDA database...</div>}
            {searchResults.map((food:any) => {
              const n = food.foodNutrients || []
              const cal = n.find((x:any)=>x.nutrientName?.toLowerCase().includes('energy'))?.value
              const pro = n.find((x:any)=>x.nutrientName?.toLowerCase().includes('protein'))?.value
              return (
                <button key={food.fdcId} onClick={()=>pickUSDAFood(food)}
                  style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:t.text, marginBottom:2 }}>{food.description}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>
                    {cal ? `${Math.round(cal)} kcal` : '—'} · {pro ? `${Math.round(pro)}g protein` : '—'} · per 100g
                  </div>
                </button>
              )
            })}
            {!searching && searchQ.length > 1 && searchResults.length === 0 && (
              <div style={{ fontSize:12, color:t.textMuted, textAlign:'center', padding:'8px 0' }}>No results — try Quick Add to enter manually</div>
            )}
          </div>
        )}

        {/* ── QUICK ADD MODE ── */}
        {addMode === 'quick' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>➕ Quick Add</span>
              <button onClick={()=>setAddMode('none')}
                style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <input value={quick.food_name} onChange={e=>setQuick(p=>({...p,food_name:e.target.value}))}
              placeholder="Food name..." autoFocus style={{ ...inp, marginBottom:8 }}/>
            <div style={{ ...macroRow, marginBottom:8 }}>
              {([{f:'calories',p:'kcal',l:'Calories'},{f:'protein_g',p:'g',l:'Protein'},{f:'carbs_g',p:'g',l:'Carbs'},{f:'fat_g',p:'g',l:'Fat'}] as const).map(field=>(
                <div key={field.f}>
                  <div style={{ fontSize:10, color:t.textMuted, marginBottom:3 }}>{field.l}</div>
                  <input type="number" placeholder={field.p} value={(quick as any)[field.f]}
                    onChange={e=>setQuick(p=>({...p,[field.f]:e.target.value}))}
                    style={{ ...inp, padding:'8px', textAlign:'center', fontSize:14 }}/>
                </div>
              ))}
            </div>
            <input value={quick.serving_size} onChange={e=>setQuick(p=>({...p,serving_size:e.target.value}))}
              placeholder="Serving size (e.g. 1 cup, 100g)" style={{ ...inp, marginBottom:10 }}/>
            <button onClick={()=>{ if(!quick.food_name) return; setPendingFood({ food_name:quick.food_name, calories:parseFloat(quick.calories)||null, protein_g:parseFloat(quick.protein_g)||null, carbs_g:parseFloat(quick.carbs_g)||null, fat_g:parseFloat(quick.fat_g)||null, serving_size:quick.serving_size }) }}
              disabled={!quick.food_name}
              style={{ width:'100%', background:t.teal, border:'none', borderRadius:10, padding:'11px', fontSize:14, fontWeight:800, color:'#0f0f0f', cursor:'pointer', opacity:quick.food_name?1:0.5 }}>
              Next: Choose Meal →
            </button>
          </div>
        )}

        {/* ── BARCODE MODE ── */}
        {addMode === 'barcode' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>📷 Barcode Lookup</span>
              <button onClick={()=>{setAddMode('none');setBarcodeVal('');setBarcodeResult(null);setBarcodeErr('')}}
                style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <div style={{ fontSize:12, color:t.textMuted, marginBottom:10 }}>
              Enter the barcode number from the product packaging, then tap Look Up.
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:10 }}>
              <input value={barcodeVal} onChange={e=>setBarcodeVal(e.target.value.replace(/\D/g,''))}
                placeholder="e.g. 021130126026" inputMode="numeric" autoFocus
                style={{ ...inp, flex:1 }}/>
              <button onClick={()=>{ if(barcodeVal.length>5) lookupBarcode(barcodeVal) }}
                disabled={barcodeVal.length<6||barcodeLoading}
                style={{ background:t.teal, border:'none', borderRadius:9, padding:'9px 16px', fontSize:13, fontWeight:700, color:'#0f0f0f', cursor:'pointer', whiteSpace:'nowrap', opacity:barcodeVal.length<6?0.5:1 }}>
                {barcodeLoading ? '...' : 'Look Up'}
              </button>
            </div>
            {barcodeErr && <div style={{ fontSize:12, color:t.red, marginBottom:8 }}>{barcodeErr}</div>}
            {barcodeResult && (
              <div style={{ background:t.surfaceHigh, border:`1px solid ${t.teal}40`, borderRadius:12, padding:12 }}>
                <div style={{ fontSize:14, fontWeight:800, marginBottom:6 }}>{barcodeResult.food_name}</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6, marginBottom:10 }}>
                  {[{l:'Cal',v:barcodeResult.calories,u:'kcal',c:'#c8f545'},{l:'Pro',v:barcodeResult.protein_g,u:'g',c:'#60a5fa'},{l:'Carb',v:barcodeResult.carbs_g,u:'g',c:'#f5a623'},{l:'Fat',v:barcodeResult.fat_g,u:'g',c:'#f472b6'}].map(m=>(
                    <div key={m.l} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:15, fontWeight:800, color:m.c }}>{m.v!=null?Math.round(m.v):'—'}<span style={{ fontSize:10 }}>{m.u}</span></div>
                      <div style={{ fontSize:10, color:t.textMuted }}>{m.l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize:11, color:t.textMuted, marginBottom:10 }}>Per {barcodeResult.serving_size}</div>
                <button onClick={()=>setPendingFood(barcodeResult)}
                  style={{ width:'100%', background:t.teal, border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:800, color:'#0f0f0f', cursor:'pointer' }}>
                  Add This Food →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── SAVED FOODS MODE ── */}
        {addMode === 'saved' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>⭐ Saved Foods</span>
              <button onClick={()=>setAddMode('none')}
                style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            {savedFoods.length === 0
              ? <div style={{ fontSize:13, color:t.textMuted, textAlign:'center', padding:'16px 0' }}>No saved foods yet — they'll appear here after you log meals.</div>
              : savedFoods.map((f:any, i:number) => (
                <button key={i} onClick={()=>setPendingFood({ food_name:f.food_name, calories:f.calories, protein_g:f.protein_g, carbs_g:f.carbs_g, fat_g:f.fat_g, serving_size:f.serving_size })}
                  style={{ width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                  <div style={{ fontSize:13, fontWeight:700, color:t.text, marginBottom:2 }}>{f.food_name}</div>
                  <div style={{ fontSize:11, color:t.textMuted }}>
                    {f.calories ? `${Math.round(f.calories)} kcal` : '—'} · {f.protein_g ? `${f.protein_g}g P` : ''} · {f.serving_size || ''}
                  </div>
                </button>
              ))
            }
          </div>
        )}

        {/* ── MEAL LABEL PICKER (shown after any food is selected) ── */}
        {pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:4 }}>Adding: {pendingFood.food_name}</div>
            <div style={{ fontSize:11, color:t.textMuted, marginBottom:14 }}>
              {pendingFood.calories ? `${Math.round(pendingFood.calories)} kcal` : ''} {pendingFood.protein_g ? `· ${pendingFood.protein_g}g protein` : ''} · {pendingFood.serving_size}
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:t.textDim, marginBottom:10 }}>Which meal is this?</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
              {MEAL_LABELS.map(m => (
                <button key={m.id} onClick={()=>commitEntry(m.id)} disabled={saving}
                  style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, opacity:saving?0.6:1 }}>
                  <span style={{ fontSize:20 }}>{m.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim }}>{m.label}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>{ setPendingFood(null); setBarcodeResult(null) }}
              style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:9, padding:'8px 16px', fontSize:12, color:t.textMuted, cursor:'pointer' }}>
              ← Back
            </button>
          </div>
        )}

        {/* ── Food log ── */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:800, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.06em' }}>Food Log</div>
            <div style={{ fontSize:12, color:t.textMuted }}>{entries.length} item{entries.length!==1?'s':''}</div>
          </div>

          {entries.length === 0 && (
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'32px 16px', textAlign:'center', color:t.textMuted, fontSize:13 }}>
              Nothing logged yet — tap "Add food to Today" above to get started.
            </div>
          )}

          {usedMeals.map(mealId => {
            const meal = MEAL_LABELS.find(m => m.id === mealId) || { label: mealId, icon:'🍴' }
            const mealEntries = byMeal[mealId] || []
            const mealCals = mealEntries.reduce((a,e) => a + (e.calories||0), 0)
            return (
              <div key={mealId} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:15 }}>{meal.icon}</span>
                  <span style={{ fontSize:13, fontWeight:800 }}>{meal.label}</span>
                  <span style={{ fontSize:11, color:t.orange, marginLeft:'auto', fontWeight:700 }}>{Math.round(mealCals)} kcal</span>
                </div>
                {mealEntries.map((e:FoodEntry) => (
                  <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 12px', marginBottom:5 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{e.food_name}</div>
                      <div style={{ fontSize:11, color:t.textMuted }}>
                        {e.serving_size}
                        {e.calories    ? ` · ${Math.round(e.calories)} kcal`  : ''}
                        {e.protein_g   ? ` · ${e.protein_g}g P`               : ''}
                        {e.carbs_g     ? ` · ${e.carbs_g}g C`                 : ''}
                        {e.fat_g       ? ` · ${e.fat_g}g F`                   : ''}
                      </div>
                    </div>
                    <button onClick={()=>removeEntry(e.id)}
                      style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'2px 4px', lineHeight:1 }}>×</button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>

      </>)}
    </div>
  )
}
