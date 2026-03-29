'use client'
import { useState, useEffect, useRef } from 'react'

const FS_API = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/nutrition-search`

const MEAL_LABELS = [
  { id:'breakfast',    label:'Breakfast',    icon:'🌅' },
  { id:'lunch',        label:'Lunch',        icon:'🥙' },
  { id:'dinner',       label:'Dinner',       icon:'🍽️' },
  { id:'snack',        label:'Snack',        icon:'🍎' },
  { id:'pre_workout',  label:'Pre-Workout',  icon:'⚡' },
  { id:'post_workout', label:'Post-Workout', icon:'💪' },
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
  const [plan,           setPlan]           = useState<any>(null)
  const [log,            setLog]            = useState<any>(null)
  const [entries,        setEntries]        = useState<FoodEntry[]>([])
  const [loading,        setLoading]        = useState(true)
  const [addMode,        setAddMode]        = useState<AddMode>('none')
  const [selectedDate,   setSelectedDate]   = useState(today)
  const [searchQ,        setSearchQ]        = useState('')
  const [searchResults,  setSearchResults]  = useState<any[]>([])
  const [searching,      setSearching]      = useState(false)
  const searchTimer = useRef<any>(null)
  const [quick, setQuick] = useState({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
  const [pendingFood,    setPendingFood]    = useState<Partial<FoodEntry> | null>(null)
  const [pendingServings,setPendingServings]= useState(1)
  const [saving,         setSaving]         = useState(false)
  const [editingEntry,   setEditingEntry]   = useState<string|null>(null)
  const [editServings,   setEditServings]   = useState(1)
  const [savedFoods,     setSavedFoods]     = useState<any[]>([])
  const [barcodeVal,     setBarcodeVal]     = useState('')
  const [barcodeLoading, setBarcodeLoading] = useState(false)
  const [barcodeErr,     setBarcodeErr]     = useState('')

  async function loadData() {
    setLoading(true)
    const [{ data: activePlan }, { data: dailyLog }] = await Promise.all([
      supabase.from('nutrition_plans').select('*').eq('client_id', clientRecord.id).eq('is_active', true).single(),
      supabase.from('nutrition_daily_logs').select('*').eq('client_id', clientRecord.id).eq('log_date', selectedDate).single()
    ])
    setPlan(activePlan)
    if (dailyLog) {
      setLog(dailyLog)
      const { data: ents } = await supabase.from('food_entries').select('*').eq('daily_log_id', dailyLog.id).order('logged_at')
      setEntries(ents || [])
    } else { setLog(null); setEntries([]) }
    const { data: prev } = await supabase.from('food_entries').select('food_name,calories,protein_g,carbs_g,fat_g,serving_size')
      .eq('client_id', clientRecord.id).order('logged_at', { ascending: false }).limit(60)
    if (prev) {
      const seen = new Set<string>()
      setSavedFoods(prev.filter((f:any) => { if (seen.has(f.food_name)) return false; seen.add(f.food_name); return true }).slice(0,20))
    }
    setLoading(false)
  }

  useEffect(() => { if (clientRecord?.id) loadData() }, [clientRecord?.id, selectedDate])

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
    try {
      const s = pendingServings
      const currentLog = await ensureLog()
      if (!currentLog?.id) { console.error('commitEntry: ensureLog returned null'); setSaving(false); return }

      const { data: saved, error } = await supabase.from('food_entries').insert({
        daily_log_id: currentLog.id, client_id: clientRecord.id, meal_time,
        food_name: pendingFood.food_name || '',
        serving_size: `${s > 1 ? s+'x ' : ''}${pendingFood.serving_size || '1 serving'}`,
        serving_qty: s,
        calories:  pendingFood.calories  != null ? Math.round(pendingFood.calories  * s * 10) / 10 : null,
        protein_g: pendingFood.protein_g != null ? Math.round(pendingFood.protein_g * s * 10) / 10 : null,
        carbs_g:   pendingFood.carbs_g   != null ? Math.round(pendingFood.carbs_g   * s * 10) / 10 : null,
        fat_g:     pendingFood.fat_g     != null ? Math.round(pendingFood.fat_g     * s * 10) / 10 : null,
      }).select().single()

      if (error) { console.error('food_entries insert error:', error.message); setSaving(false); return }
      if (saved) { const next = [...entries, saved]; setEntries(next); await recalcTotals(currentLog.id, next) }
    } catch (e) { console.error('commitEntry exception:', e) }

    setPendingFood(null); setPendingServings(1); setAddMode('none')
    setSearchQ(''); setSearchResults([])
    setQuick({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
    setSaving(false)
  }

  async function removeEntry(id: string) {
    await supabase.from('food_entries').delete().eq('id', id)
    const updated = entries.filter(e => e.id !== id)
    setEntries(updated)
    if (log) await recalcTotals(log.id, updated)
  }

  async function updateEntryServings(entry: FoodEntry, newServings: number) {
    // Find original per-serving values from serving_qty stored in DB
    // We stored scaled values, so divide by old qty and multiply by new
    const oldQty = (entry as any).serving_qty || 1
    const scale = newServings / oldQty
    const updated = {
      serving_qty: newServings,
      serving_size: `${newServings > 1 ? newServings+'x ' : ''}${(entry.serving_size || '').replace(/^\d+x\s*/,'')}`,
      calories:  entry.calories  != null ? Math.round(entry.calories  * scale * 10) / 10 : null,
      protein_g: entry.protein_g != null ? Math.round(entry.protein_g * scale * 10) / 10 : null,
      carbs_g:   entry.carbs_g   != null ? Math.round(entry.carbs_g   * scale * 10) / 10 : null,
      fat_g:     entry.fat_g     != null ? Math.round(entry.fat_g     * scale * 10) / 10 : null,
    }
    await supabase.from('food_entries').update(updated).eq('id', entry.id)
    const next = entries.map(e => e.id === entry.id ? { ...e, ...updated } : e)
    setEntries(next)
    if (log) await recalcTotals(log.id, next)
    setEditingEntry(null)
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

  // ── USDA search ───────────────────────────────────────────────────────────
  function handleSearchInput(val: string) {
    setSearchQ(val)
    clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(() => doSearch(val), 300)
  }
  async function doSearch(q: string) {
    setSearching(true)
    try {
      const res  = await fetch(`${FS_API}?q=${encodeURIComponent(q)}`)
      const data = await res.json()

      // FatSecret configured and returned results
      if (data?.foods?.food) {
        const raw   = data.foods.food
        const foods = Array.isArray(raw) ? raw : [raw]
        setSearchResults(foods.slice(0, 10))
        setSearching(false)
        return
      }

      // FatSecret not configured or returned error — fall back to USDA
      const usda = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${process.env.NEXT_PUBLIC_USDA_API_KEY || 'DEMO_KEY'}&query=${encodeURIComponent(q)}&pageSize=12&dataType=Branded,Foundation,SR%20Legacy`
      )
      const usdaData = await usda.json()
      setSearchResults((usdaData.foods || []).slice(0, 10))
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  // USDA fallback picker (per-100g values, scale to serving if available)
  function pickUSDAFood(food: any) {
    const nutrients = food.foodNutrients || []
    const get = (name: string) => { const n = nutrients.find((x:any) => x.nutrientName?.toLowerCase().includes(name)); return n ? n.value : null }
    const cal100 = get('energy'); const pro100 = get('protein')
    const carb100 = get('carbohydrate'); const fat100 = get('total lipid')

    const name = food.description || ''
    const cleaned = name === name.toUpperCase()
      ? name.toLowerCase().replace(/(^\w|,\s*\w)/g, (c:string) => c.toUpperCase()) : name

    // Check for real serving size (branded foods have this)
    const servingG = food.servingSize && food.servingSizeUnit?.toLowerCase().includes('g') ? food.servingSize
                   : food.servingSize && food.servingSizeUnit?.toLowerCase().includes('oz') ? food.servingSize * 28.3495 : null

    if (servingG) {
      // Branded food with real serving — use it directly, let serving multiplier handle quantity
      const scale = servingG / 100
      const r = (v: number | null) => v != null ? Math.round(v * scale * 10) / 10 : null
      setPendingFood({ food_name: cleaned, calories: r(cal100), protein_g: r(pro100), carbs_g: r(carb100), fat_g: r(fat100), serving_size: `${food.servingSize}${food.servingSizeUnit||'g'}` })
    } else {
      // Generic food (SR Legacy) — values are per 100g
      // Treat 100g as "1 serving" so the serving multiplier on the next screen does the work
      const r = (v: number | null) => v != null ? Math.round(v * 10) / 10 : null
      setPendingFood({ food_name: cleaned, calories: r(cal100), protein_g: r(pro100), carbs_g: r(carb100), fat_g: r(fat100), serving_size: '100g' })
    }
  }

  // FatSecret food picker - servings already per-serving, no math needed
  function pickFSFood(food: any) {    // Get the first/best serving from FatSecret
    const servings = food.servings?.serving
    const serving  = Array.isArray(servings) ? servings[0] : servings
    const round1   = (v: any) => v != null ? Math.round(parseFloat(v) * 10) / 10 : null
    const servingDesc = serving?.serving_description || '1 serving'
    setPendingFood({
      food_name:   food.food_name,
      calories:    round1(serving?.calories),
      protein_g:   round1(serving?.protein),
      carbs_g:     round1(serving?.carbohydrate),
      fat_g:       round1(serving?.fat),
      serving_size: servingDesc,
    })
  }

  // For search results list display - parse FatSecret food_description string
  // e.g. "Per 1 Large: 72 Calories | 0.4g Carbs | 4.8g Fat | 6.3g Protein"
  function parseFSDescription(desc: string) {
    if (!desc) return { cal: null, pro: null, servingLabel: '1 serving' }
    const calMatch = desc.match(/(\d+\.?\d*)\s*Calorie/)
    const proMatch = desc.match(/(\d+\.?\d*)g\s*Protein/)
    const perMatch = desc.match(/^Per ([^:]+):/)
    return {
      cal: calMatch ? parseFloat(calMatch[1]) : null,
      pro: proMatch ? parseFloat(proMatch[1]) : null,
      servingLabel: perMatch ? perMatch[1] : '1 serving',
    }
  }



  // Barcode lookup via Edge Function (manual input only — no camera)
  async function lookupBarcode(code: string) {
    setBarcodeLoading(true); setBarcodeErr('')
    try {
      const fsRes  = await fetch(`${FS_API}?barcode=${encodeURIComponent(code)}`)
      const fsData = await fsRes.json()
      const foodId = fsData?.food_id?.value || fsData?.food_id
      if (foodId) {
        const detailRes  = await fetch(`${FS_API}?food_id=${foodId}`)
        const detailData = await detailRes.json()
        const food = detailData?.food
        if (food) {
          const servings = food.servings?.serving
          const serving  = Array.isArray(servings) ? servings[0] : servings
          const r = (v: any) => v != null ? Math.round(parseFloat(v) * 10) / 10 : null
          setPendingFood({ food_name: food.food_name, calories: r(serving?.calories), protein_g: r(serving?.protein), carbs_g: r(serving?.carbohydrate), fat_g: r(serving?.fat), serving_size: serving?.serving_description || '1 serving' })
          setBarcodeVal(''); setAddMode('none')
          setBarcodeLoading(false); return
        }
      }
      const offRes  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      const offData = await offRes.json()
      if (offData?.status === 1) {
        const p = offData.product; const n = p.nutriments || {}
        const r = (v: any) => v != null ? Math.round(parseFloat(v) * 10) / 10 : null
        setPendingFood({ food_name: p.product_name || 'Unknown product', calories: r(n['energy-kcal_serving'] ?? n['energy-kcal_100g']), protein_g: r(n.proteins_serving ?? n.proteins_100g), carbs_g: r(n.carbohydrates_serving ?? n.carbohydrates_100g), fat_g: r(n.fat_serving ?? n.fat_100g), serving_size: p.serving_size || '1 serving' })
        setBarcodeVal(''); setAddMode('none')
      } else {
        setBarcodeErr('Product not found. Try searching by name or use Quick Add.')
      }
    } catch { setBarcodeErr('Lookup failed. Check your connection and try again.') }
    setBarcodeLoading(false)
  }

  const totals = { calories: log?.total_calories||0, protein: log?.total_protein||0, carbs: log?.total_carbs||0, fat: log?.total_fat||0 }
  const pct = (val: number, target: number) => target > 0 ? Math.min(100, Math.round((val/target)*100)) : 0
  const macros = [
    { label:'Calories', val:Math.round(totals.calories), target:plan?.calories_target, unit:'kcal', color:'#c8f545' },
    { label:'Protein',  val:Math.round(totals.protein),  target:plan?.protein_g,       unit:'g',    color:'#60a5fa' },
    { label:'Carbs',    val:Math.round(totals.carbs),    target:plan?.carbs_g,         unit:'g',    color:'#f5a623' },
    { label:'Fat',      val:Math.round(totals.fat),      target:plan?.fat_g,           unit:'g',    color:'#f472b6' },
  ]
  const remainingMacros = macros.map(m => ({
    ...m,
    remaining: typeof m.target === 'number' ? Math.max(0, Math.round(m.target - m.val)) : null,
  }))
  const leadMacro = remainingMacros
    .filter(m => typeof m.target === 'number')
    .sort((a, b) => pct(a.val, a.target as number) - pct(b.val, b.target as number))[0]
  const byMeal: Record<string, FoodEntry[]> = {}
  for (const e of entries) { const k = e.meal_time||'snack'; if (!byMeal[k]) byMeal[k]=[]; byMeal[k].push(e) }
  const mealOrder = MEAL_LABELS.map(m => m.id)
  const usedMeals = [...new Set([...mealOrder.filter(m=>byMeal[m]),...Object.keys(byMeal).filter(m=>!mealOrder.includes(m))])]
  const inp = { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'9px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' } as const
  const macroRow = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(72px,1fr))', gap:6 } as const

  if (!clientRecord) return null

  return (
    <div style={{ paddingBottom:80 }}>

      {/* Date bar */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}
          style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'7px 12px', color:t.text, fontSize:13, fontFamily:"'DM Sans',sans-serif" }}/>
        {selectedDate !== today && <button onClick={()=>setSelectedDate(today)} style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:8, padding:'6px 12px', fontSize:12, color:t.textDim, cursor:'pointer' }}>Today</button>}
        {plan && <span style={{ fontSize:12, color:t.teal, marginLeft:'auto' }}>📋 {plan.name}</span>}
      </div>

      {loading ? <div style={{ padding:'40px 0', textAlign:'center', color:t.textMuted }}>Loading...</div> : (<>

        {!plan && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'16px 18px', marginBottom:16, textAlign:'center' }}>
            <div style={{ fontSize:26, marginBottom:6 }}>🥗</div>
            <p style={{ fontSize:13, fontWeight:700, color:t.textDim }}>No active nutrition plan yet</p>
            <p style={{ fontSize:12, color:t.textMuted, marginTop:4 }}>Your coach will assign your targets. You can still log food below!</p>
          </div>
        )}
        {plan?.notes && (
          <div style={{ background:'#1a1a0a', border:'1px solid #3a3a1a', borderRadius:12, padding:'10px 14px', marginBottom:14, display:'flex', gap:8 }}>
            <span style={{ fontSize:15 }}>📌</span><p style={{ fontSize:13, color:t.orange, lineHeight:1.5 }}>{plan.notes}</p>
          </div>
        )}


        {/* Macro rings */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(88px,1fr))', gap:10, marginBottom:20 }}>
          {macros.map(m => {
            const p = pct(m.val, m.target); const r=22, circ=2*Math.PI*r
            return (
              <div key={m.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'12px 8px', textAlign:'center' }}>
                <svg width="56" height="56" style={{ display:'block', margin:'0 auto 6px' }}>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={t.surfaceHigh} strokeWidth="4"/>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={m.color} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={circ-circ*p/100} strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition:'stroke-dashoffset 0.5s ease' }}/>
                  <text x="28" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill={m.color}>{p}%</text>
                </svg>
                <div style={{ fontSize:14, fontWeight:800 }}>{m.val}<span style={{ fontSize:10, color:t.textMuted, fontWeight:400 }}>{m.unit}</span></div>
                {m.target ? <div style={{ fontSize:10, color:t.textMuted }}>/{m.target}{m.unit}</div> : <div style={{ fontSize:10, color:t.textMuted }}>—</div>}
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{m.label}</div>
              </div>
            )
          })}
        </div>

        {/* Add food buttons */}
        {addMode === 'none' && !pendingFood && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:t.textDim, marginBottom:10 }}>Add food to {selectedDate===today?'Today':selectedDate}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(110px,1fr))', gap:8 }}>
              {([{mode:'search' as AddMode,icon:'🔍',label:'Search Foods'},{mode:'quick' as AddMode,icon:'➕',label:'Quick Add'},{mode:'barcode' as AddMode,icon:'📷',label:'Barcode'},{mode:'saved' as AddMode,icon:'⭐',label:'Saved Foods'}]).map(({mode,icon,label})=>(
                <button key={mode} onClick={()=>setAddMode(mode)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim, textAlign:'center', lineHeight:1.2 }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* SEARCH MODE */}
        {addMode==='search' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>🔍 Search Foods</span>
              <button onClick={()=>{setAddMode('none');setSearchQ('');setSearchResults([])}} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <input value={searchQ} onChange={e=>handleSearchInput(e.target.value)} placeholder="e.g. chicken breast, greek yogurt..." autoFocus style={{ ...inp, marginBottom:10 }}/>
            {searching && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center' as const, padding:'8px 0' }}>Searching FatSecret database...</div>}
            {searchResults.map((food:any) => {
              // Handle both FatSecret and USDA formats
              const isFS = !!food.food_id
              if (isFS) {
                const { cal, pro, servingLabel } = parseFSDescription(food.food_description || '')
                return (
                  <button key={food.food_id} onClick={async () => {
                    try {
                      const res  = await fetch(`${FS_API}?food_id=${food.food_id}`)
                      const data = await res.json()
                      pickFSFood(data?.food || food)
                    } catch { pickFSFood(food) }
                  }} style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{food.food_name}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>
                      {cal != null ? Math.round(cal)+' kcal' : '—'} · {pro != null ? pro+'g protein' : '—'} · per {servingLabel}
                    </div>
                  </button>
                )
              } else {
                // USDA fallback format
                const n = food.foodNutrients || []
                const cal = n.find((x:any)=>x.nutrientName?.toLowerCase().includes('energy'))?.value
                const pro = n.find((x:any)=>x.nutrientName?.toLowerCase().includes('protein'))?.value
                return (
                  <button key={food.fdcId} onClick={()=>pickUSDAFood(food)} style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{food.description}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>
                      {cal ? Math.round(cal)+' kcal' : '—'} · {pro ? Math.round(pro)+'g protein' : '—'} · {food.servingSize ? `per ${food.servingSize}${food.servingSizeUnit||'g'}` : 'per 100g'}
                    </div>
                  </button>
                )
              }
            })}
            {!searching && searchQ.length>1 && searchResults.length===0 && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center', padding:'8px 0' }}>No results — try Quick Add to enter manually</div>}
          </div>
        )}

        {/* QUICK ADD MODE */}
        {addMode==='quick' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>➕ Quick Add</span>
              <button onClick={()=>setAddMode('none')} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <input value={quick.food_name} onChange={e=>setQuick(p=>({...p,food_name:e.target.value}))} placeholder="Food name..." autoFocus style={{ ...inp, marginBottom:8 }}/>
            <div style={{ ...macroRow, marginBottom:8 }}>
              {([{f:'calories',p:'kcal',l:'Calories'},{f:'protein_g',p:'g',l:'Protein'},{f:'carbs_g',p:'g',l:'Carbs'},{f:'fat_g',p:'g',l:'Fat'}] as const).map(field=>(
                <div key={field.f}>
                  <div style={{ fontSize:10, color:t.textMuted, marginBottom:3 }}>{field.l}</div>
                  <input type="number" placeholder={field.p} value={(quick as any)[field.f]} onChange={e=>setQuick(p=>({...p,[field.f]:e.target.value}))} style={{ ...inp, padding:'8px', textAlign:'center', fontSize:14 }}/>
                </div>
              ))}
            </div>
            <input value={quick.serving_size} onChange={e=>setQuick(p=>({...p,serving_size:e.target.value}))} placeholder="Serving size (e.g. 1 cup, 100g)" style={{ ...inp, marginBottom:10 }}/>
            <button onClick={()=>{ if(!quick.food_name) return; setPendingFood({ food_name:quick.food_name, calories:parseFloat(quick.calories)||null, protein_g:parseFloat(quick.protein_g)||null, carbs_g:parseFloat(quick.carbs_g)||null, fat_g:parseFloat(quick.fat_g)||null, serving_size:quick.serving_size }) }}
              disabled={!quick.food_name} style={{ width:'100%', background:t.teal, border:'none', borderRadius:10, padding:'11px', fontSize:14, fontWeight:800, color:'#0f0f0f', cursor:'pointer', opacity:quick.food_name?1:0.5 }}>
              Next: Choose Meal →
            </button>
          </div>
        )}

        {/* BARCODE MODE */}
        {addMode==='barcode' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>🔢 Barcode Lookup</span>
              <button onClick={()=>{ setAddMode('none'); setBarcodeVal(''); setBarcodeErr('') }} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>×</button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={barcodeVal} onChange={e=>setBarcodeVal(e.target.value.replace(/\D/g,''))}
                placeholder="Type barcode number..." inputMode="numeric" autoFocus
                onKeyDown={e=>{ if(e.key==='Enter' && barcodeVal.length>5) lookupBarcode(barcodeVal) }}
                style={{ ...inp, flex:1 }}/>
              <button onClick={()=>{ if(barcodeVal.length>5) lookupBarcode(barcodeVal) }}
                disabled={barcodeVal.length<6||barcodeLoading}
                style={{ background:t.teal, border:'none', borderRadius:9, padding:'9px 16px', fontSize:13, fontWeight:700, color:'#0f0f0f', cursor:'pointer', whiteSpace:'nowrap' as const, opacity:barcodeVal.length<6?0.5:1 }}>
                {barcodeLoading ? '...' : 'Look Up'}
              </button>
            </div>
            {barcodeErr && <div style={{ fontSize:12, color:t.red, marginTop:8 }}>{barcodeErr}</div>}
            {barcodeLoading && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center' as const, padding:'10px 0' }}>Looking up product...</div>}
          </div>
        )}

        {pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:800, marginBottom:4 }}>Adding: {pendingFood.food_name}</div>

            {/* Servings stepper */}
            <div style={{ display:'flex', alignItems:'center', gap:12, background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:10, color:t.textMuted, marginBottom:2 }}>
                  {pendingFood.serving_size === '100g' ? 'AMOUNT (grams)' : 'SERVINGS'}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color:t.teal }}>
                  {pendingFood.calories != null ? `${Math.round(pendingFood.calories * pendingServings)} kcal` : '—'}
                  {pendingFood.protein_g != null ? ` · ${Math.round(pendingFood.protein_g * pendingServings * 10)/10}g P` : ''}
                </div>
                <div style={{ fontSize:11, color:t.textMuted }}>
                  {pendingFood.serving_size === '100g'
                    ? `${Math.round(pendingServings * 100)}g`
                    : `${pendingServings}x ${pendingFood.serving_size}`}
                </div>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:0, background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
                <button onClick={()=>setPendingServings(s=>Math.max(
                  pendingFood.serving_size === '100g' ? 0.1 : 0.5,
                  Math.round((s - (pendingFood.serving_size === '100g' ? 0.1 : 0.5))*10)/10
                ))}
                  style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'8px 14px', lineHeight:1 }}>−</button>
                <div style={{ fontSize:14, fontWeight:800, color:t.teal, minWidth:40, textAlign:'center' as const }}>
                  {pendingFood.serving_size === '100g'
                    ? `${Math.round(pendingServings * 100)}g`
                    : pendingServings}
                </div>
                <button onClick={()=>setPendingServings(s=>Math.round((s + (pendingFood.serving_size === '100g' ? 0.1 : 0.5))*10)/10)}
                  style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'8px 14px', lineHeight:1 }}>+</button>
              </div>
            </div>

            <div style={{ fontSize:12, fontWeight:700, color:t.textDim, marginBottom:10 }}>Which meal is this?</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(92px,1fr))', gap:8, marginBottom:12 }}>
              {MEAL_LABELS.map(m=>(
                <button key={m.id} onClick={()=>commitEntry(m.id)} disabled={saving}
                  style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'12px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:4, opacity:saving?0.6:1 }}>
                  <span style={{ fontSize:20 }}>{m.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim }}>{m.label}</span>
                </button>
              ))}
            </div>
            <button onClick={()=>{ setPendingFood(null); setPendingServings(1) }}
              style={{ background:'none', border:`1px solid ${t.border}`, borderRadius:9, padding:'8px 16px', fontSize:12, color:t.textMuted, cursor:'pointer' }}>← Back</button>
          </div>
        )}

        {/* FOOD LOG */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ fontSize:12, fontWeight:800, color:t.textDim, textTransform:'uppercase', letterSpacing:'0.06em' }}>Food Log</div>
            <div style={{ fontSize:12, color:t.textMuted }}>{entries.length} item{entries.length!==1?'s':''}</div>
          </div>
          {entries.length===0 && (
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'32px 16px', textAlign:'center', color:t.textMuted, fontSize:13 }}>Nothing logged yet — tap "Add food to Today" above.</div>
          )}
          {usedMeals.map(mealId=>{
            const meal = MEAL_LABELS.find(m=>m.id===mealId)||{ label:mealId, icon:'🍴' }
            const mealEntries = byMeal[mealId]||[]
            const mealCals = mealEntries.reduce((a,e)=>a+(e.calories||0),0)
            return (
              <div key={mealId} style={{ marginBottom:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:15 }}>{meal.icon}</span>
                  <span style={{ fontSize:13, fontWeight:800 }}>{meal.label}</span>
                  <span style={{ fontSize:11, color:t.orange, marginLeft:'auto', fontWeight:700 }}>{Math.round(mealCals)} kcal</span>
                </div>
                {mealEntries.map((e:FoodEntry)=>(
                  <div key={e.id} style={{ background:t.surface, border:`1px solid ${editingEntry===e.id?t.teal+'60':t.border}`, borderRadius:10, padding:'10px 12px', marginBottom:5, transition:'border-color 0.15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ flex:1, cursor:'pointer' }} onClick={()=>{ setEditingEntry(editingEntry===e.id?null:e.id); setEditServings((e as any).serving_qty||1) }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{e.food_name}</div>
                        <div style={{ fontSize:11, color:t.textMuted }}>
                          {e.serving_size}{e.calories?` · ${Math.round(e.calories)} kcal`:''}{e.protein_g?` · ${e.protein_g}g P`:''}{e.carbs_g?` · ${e.carbs_g}g C`:''}{e.fat_g?` · ${e.fat_g}g F`:''}
                        </div>
                      </div>
                      <button onClick={()=>removeEntry(e.id)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'2px 4px', lineHeight:1 }}>×</button>
                    </div>
                    {editingEntry === e.id && (
                      <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ fontSize:11, color:t.textMuted, flex:1 }}>Adjust servings:</div>
                        <div style={{ display:'flex', alignItems:'center', gap:0, background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
                          <button onClick={()=>setEditServings(s=>Math.max(0.5, Math.round((s-0.5)*10)/10))}
                            style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'6px 12px', lineHeight:1 }}>−</button>
                          <div style={{ fontSize:14, fontWeight:800, color:t.teal, minWidth:28, textAlign:'center' }}>{editServings}</div>
                          <button onClick={()=>setEditServings(s=>Math.round((s+0.5)*10)/10)}
                            style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'6px 12px', lineHeight:1 }}>+</button>
                        </div>
                        <button onClick={()=>updateEntryServings(e, editServings)}
                          style={{ background:t.teal, border:'none', borderRadius:8, padding:'7px 14px', fontSize:12, fontWeight:700, color:'#0f0f0f', cursor:'pointer' }}>
                          Save
                        </button>
                      </div>
                    )}
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
