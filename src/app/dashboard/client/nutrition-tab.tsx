import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'

const FS_API = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/nutrition-search`
const USDA_API_KEY = process.env.NEXT_PUBLIC_USDA_API_KEY || 'DEMO_KEY'

// Auth header required by the Edge Function — use the public anon key
const fsHeaders = {
  'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
}

const MEAL_LABELS = [
  { id:'breakfast',   label:'Breakfast',   icon:'🌅' },
  { id:'lunch',       label:'Lunch',       icon:'🥙' },
  { id:'dinner',      label:'Dinner',      icon:'🍽️' },
  { id:'snack',       label:'Snack',       icon:'🍎' },
  { id:'pre_workout', label:'Pre-Workout', icon:'⚡' },
  { id:'post_workout',label:'Post-Workout',icon:'💪' },
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
  serving_qty?: number | null
  logged_at: string
  photo_url?: string | null
  source?: string | null
}
type AddMode = 'none' | 'search' | 'quick' | 'barcode' | 'saved' | 'image' | 'confirmed'

type NutritionPlan = {
  id: string
  name?: string | null
  notes?: string | null
  calories_target?: number | null
  protein_g?: number | null
  carbs_g?: number | null
  fat_g?: number | null
}

type NutritionDailyLog = {
  id: string
  total_calories?: number | null
  total_protein?: number | null
  total_carbs?: number | null
  total_fat?: number | null
}

type SavedFood = {
  food_name: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  serving_size: string
  serving_qty?: number | null
  logged_at?: string
}

type SearchResult = FatSecretSearchFood | USDAFoodSearchResult

type FatSecretServing = {
  calories?: string | number | null
  protein?: string | number | null
  carbohydrate?: string | number | null
  fat?: string | number | null
  serving_description?: string | null
  metric_serving_amount?: string | number | null
}

type FatSecretFoodDetail = {
  food_name: string
  servings?: { serving?: FatSecretServing | FatSecretServing[] }
}

type FatSecretSearchFood = {
  food_id: string
  food_name: string
  food_description?: string | null
  food_type?: string | null
}

type USDANutrient = {
  nutrientName?: string | null
  value?: number | null
}

type USDAFoodPortion = {
  gramWeight?: number | string | null
  amount?: number | string | null
  modifier?: string | null
  portionDescription?: string | null
  measureUnit?: { name?: string | null } | null
}

type USDAFoodSearchResult = {
  fdcId?: number
  description?: string | null
  dataType?: string | null
  foodNutrients?: USDANutrient[]
  servingSize?: number | string | null
  servingSizeUnit?: string | null
  householdServingFullText?: string | null
  foodPortions?: USDAFoodPortion[]
  foodMeasures?: USDAFoodPortion[]
}

type NutritionTabProps = {
  clientRecord: {
    id: string
    coach_id?: string | null
    show_macros?: boolean | null
  } | null
  supabase: ReturnType<typeof createClient>
  t: {
    surface: string
    surfaceHigh: string
    border: string
    text: string
    textDim: string
    textMuted: string
    teal: string
    orange: string
  }
}

function isFatSecretFood(food: SearchResult): food is FatSecretSearchFood {
  return 'food_id' in food
}

export default function NutritionTab({ clientRecord, supabase, t }: NutritionTabProps) {
  const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` })()
  const [plan,            setPlan]            = useState<NutritionPlan | null>(null)
  const [log,             setLog]             = useState<NutritionDailyLog | null>(null)
  const [entries,         setEntries]         = useState<FoodEntry[]>([])
  const [loading,         setLoading]         = useState(true)
  const [addMode,         setAddMode]         = useState<AddMode>('none')
  const [lastSavedLabel,  setLastSavedLabel]  = useState('')   // e.g. "Chicken Breast → Lunch"
  const [returnMode,      setReturnMode]      = useState<AddMode>('search') // where Add More goes back to
  const [selectedDate,    setSelectedDate]    = useState(today)
  const [searchQ,         setSearchQ]         = useState('')
  const [searchResults,   setSearchResults]   = useState<SearchResult[]>([])
  const [searching,       setSearching]       = useState(false)
  const [searchError,     setSearchError]     = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [quick, setQuick] = useState({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
  const [pendingFood,     setPendingFood]     = useState<Partial<FoodEntry> | null>(null)
  const [pendingServings, setPendingServings] = useState(1)
  const [saving,          setSaving]          = useState(false)
  const [editingEntry,    setEditingEntry]    = useState<string|null>(null)
  const [editServings,    setEditServings]    = useState(1)
  const [savedFoods,      setSavedFoods]      = useState<SavedFood[]>([])
  const [barcodeVal,      setBarcodeVal]      = useState('')
  const [barcodeLoading,  setBarcodeLoading]  = useState(false)
  const [barcodeErr,      setBarcodeErr]      = useState('')
  // Photo log state (replaces old AI recognition)
  const imageInputRef     = useRef<HTMLInputElement>(null)
  const imageGalleryRef   = useRef<HTMLInputElement>(null)
  const [photoCaption,    setPhotoCaption]    = useState('')
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string|null>(null)
  const [photoStorageUrl, setPhotoStorageUrl] = useState<string|null>(null)
  const [photoUploading,  setPhotoUploading]  = useState(false)
  const [photoErr,        setPhotoErr]        = useState('')

  const loadData = useCallback(async () => {
    if (!clientRecord?.id) return
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
    const { data: prev } = await supabase.from('food_entries')
      .select('food_name,calories,protein_g,carbs_g,fat_g,serving_size,serving_qty,logged_at,source')
      .eq('client_id', clientRecord.id)
      .or('source.is.null,source.neq.photo')
      .order('logged_at', { ascending: false }).limit(30)
    if (prev) {
      const seen = new Set<string>()
      setSavedFoods((prev as SavedFood[]).filter((food) => { if (seen.has(food.food_name)) return false; seen.add(food.food_name); return true }))
    }
    setLoading(false)
  }, [clientRecord?.id, selectedDate, supabase])

  useEffect(() => { if (clientRecord?.id) void loadData() }, [clientRecord?.id, loadData, selectedDate])

  async function ensureLog() {
    if (!clientRecord) return null
    if (log) return log
    const { data: newLog, error } = await supabase.from('nutrition_daily_logs').upsert({
      client_id: clientRecord.id, coach_id: clientRecord.coach_id,
      plan_id: plan?.id || null, log_date: selectedDate,
    }, { onConflict: 'client_id,log_date' }).select().single()
    if (error) { console.error('ensureLog error:', error.message, error.code, error.details); return null }
    setLog(newLog); return newLog
  }

  async function commitEntry(meal_time: string) {
    if (!pendingFood) return
    if (!clientRecord) return
    setSaving(true)
    let succeeded = false
    try {
      const s = pendingServings
      const isPhoto = pendingFood.source === 'photo'
      const currentLog = await ensureLog()
      if (!currentLog?.id) { console.error('commitEntry: ensureLog returned null'); setSaving(false); return }
      const { data: saved, error } = await supabase.from('food_entries').insert({
        daily_log_id: currentLog.id, client_id: clientRecord.id, meal_time,
        food_name:    pendingFood.food_name || '',
        serving_size: isPhoto ? '1 photo' : `${s > 1 ? s+'x ' : ''}${pendingFood.serving_size || '1 serving'}`,
        serving_qty:  isPhoto ? null : s,
        source:       pendingFood.source || null,
        photo_url:    pendingFood.photo_url || null,
        calories:  !isPhoto && pendingFood.calories  != null ? Math.round(pendingFood.calories  * s * 10) / 10 : null,
        protein_g: !isPhoto && pendingFood.protein_g != null ? Math.round(pendingFood.protein_g * s * 10) / 10 : null,
        carbs_g:   !isPhoto && pendingFood.carbs_g   != null ? Math.round(pendingFood.carbs_g   * s * 10) / 10 : null,
        fat_g:     !isPhoto && pendingFood.fat_g     != null ? Math.round(pendingFood.fat_g     * s * 10) / 10 : null,
      }).select().single()
      if (error) { console.error('food_entries insert error:', error.message); setSaving(false); return }
      if (saved) {
        succeeded = true
        const mealLabel = MEAL_LABELS.find(m => m.id === meal_time)?.label || meal_time
        setLastSavedLabel(`${pendingFood.food_name} → ${mealLabel}`)
        setReturnMode(
          addMode === 'image' ? 'image' :
          addMode === 'barcode' ? 'barcode' :
          addMode === 'quick' ? 'quick' :
          addMode === 'saved' ? 'saved' : 'search'
        )
        const fresh = await supabase.from('food_entries').select('calories,protein_g,carbs_g,fat_g').eq('daily_log_id', currentLog.id)
        await recalcTotals(currentLog.id, fresh.data || [])
        await loadData()
      }
    } catch (e) { console.error('commitEntry exception:', e) }
    finally {
      if (succeeded) {
        setPendingFood(null); setPendingServings(1); setAddMode('confirmed')
        setSearchQ(''); setSearchResults([])
        setPhotoCaption(''); setPhotoPreviewUrl(null); setPhotoStorageUrl(null)
        setQuick({ food_name:'', calories:'', protein_g:'', carbs_g:'', fat_g:'', serving_size:'1 serving' })
      }
      setSaving(false)
    }
  }

  async function removeEntry(id: string) {
    await supabase.from('food_entries').delete().eq('id', id)
    if (log) {
      const fresh = await supabase.from('food_entries').select('calories,protein_g,carbs_g,fat_g').eq('daily_log_id', log.id)
      await recalcTotals(log.id, fresh.data || [])
    }
    await loadData()
  }

  async function updateEntryServings(entry: FoodEntry, newServings: number) {
    const oldQty = entry.serving_qty || 1
    const scale  = newServings / oldQty
    const updated = {
      serving_qty:  newServings,
      serving_size: `${newServings > 1 ? newServings+'x ' : ''}${(entry.serving_size || '').replace(/^\d+x\s*/,'')}`,
      calories:  entry.calories  != null ? Math.round(entry.calories  * scale * 10) / 10 : null,
      protein_g: entry.protein_g != null ? Math.round(entry.protein_g * scale * 10) / 10 : null,
      carbs_g:   entry.carbs_g   != null ? Math.round(entry.carbs_g   * scale * 10) / 10 : null,
      fat_g:     entry.fat_g     != null ? Math.round(entry.fat_g     * scale * 10) / 10 : null,
    }
    await supabase.from('food_entries').update(updated).eq('id', entry.id)
    setEditingEntry(null)
    if (log) {
      const fresh = await supabase.from('food_entries').select('calories,protein_g,carbs_g,fat_g').eq('daily_log_id', log.id)
      await recalcTotals(log.id, fresh.data || [])
    }
    await loadData()
  }

  async function recalcTotals(logId: string, ents: Array<Pick<FoodEntry, 'calories' | 'protein_g' | 'carbs_g' | 'fat_g'>>) {
    const totals = ents.reduce((acc, e) => ({
      total_calories: acc.total_calories + (e.calories  || 0),
      total_protein:  acc.total_protein  + (e.protein_g || 0),
      total_carbs:    acc.total_carbs    + (e.carbs_g   || 0),
      total_fat:      acc.total_fat      + (e.fat_g     || 0),
    }), { total_calories:0, total_protein:0, total_carbs:0, total_fat:0 })
    const { data: updated } = await supabase.from('nutrition_daily_logs').update(totals).eq('id', logId).select().single()
    if (updated) setLog(updated)
  }

  // ── Search ────────────────────────────────────────────────────────────────
  function handleSearchInput(val: string) {
    setSearchQ(val); setSearchError('')
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (!val.trim()) { setSearchResults([]); return }
    searchTimer.current = setTimeout(() => doSearch(val), 350)
  }

  async function doSearch(q: string) {
    setSearching(true)
    try {
      const res  = await fetch(`${FS_API}?q=${encodeURIComponent(q)}`, { headers: fsHeaders })
      const data = await res.json()
      if (data?.foods?.food) {
        const raw = data.foods.food
        setSearchResults(Array.isArray(raw) ? raw : [raw])
        setSearching(false); return
      }
      const usda = await fetch(
        `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_API_KEY}&query=${encodeURIComponent(q)}&pageSize=12&dataType=Branded,Foundation,SR%20Legacy`
      )
      const usdaData = await usda.json()
      setSearchResults((usdaData.foods || []).slice(0, 10))
    } catch { setSearchResults([]) }
    setSearching(false)
  }

  // ── USDA serving resolution ───────────────────────────────────────────────
  function getUSDAServing(food: USDAFoodSearchResult): { grams: number; label: string } | null {
    const sSize = Number(food?.servingSize)
    const sUnit = typeof food?.servingSizeUnit === 'string' ? food.servingSizeUnit.toLowerCase() : ''
    if (sSize > 0) {
      const grams = sUnit.includes('oz') ? Math.round(sSize * 28.3495 * 10) / 10 : sSize
      const label = food?.householdServingFullText?.trim() || `${sSize}${food.servingSizeUnit}`
      return { grams, label }
    }
    const portions = Array.isArray(food?.foodPortions) ? food.foodPortions
      : Array.isArray(food?.foodMeasures) ? food.foodMeasures : []
    const portion = portions.find((p) => Number(p?.gramWeight) > 0)
    if (portion) {
      const amt = Number(portion.amount || 1)
      const parts = [amt !== 1 ? amt : '', portion.modifier || portion.measureUnit?.name || portion.portionDescription].filter(Boolean)
      return { grams: Number(portion.gramWeight), label: parts.join(' ').trim() || `${Math.round(Number(portion.gramWeight))}g` }
    }
    if (food?.householdServingFullText) {
      const m = String(food.householdServingFullText).match(/\(([\d.]+)\s*g\)/i)
      if (m) return { grams: Number(m[1]), label: String(food.householdServingFullText).trim() }
    }
    return null
  }

  async function pickUSDAFood(food: USDAFoodSearchResult) {
    const nutrients = food.foodNutrients || []
    const get = (name: string) => { const n = nutrients.find((item) => item.nutrientName?.toLowerCase().includes(name)); return n?.value ?? null }
    const isBranded = food.dataType === 'Branded'
    let cal = get('energy'); let pro = get('protein'); let carb = get('carbohydrate'); let fat = get('total lipid')
    const name = food.description || ''
    const cleaned = name === name.toUpperCase() ? name.toLowerCase().replace(/(^\w|,\s*\w)/g, (c:string) => c.toUpperCase()) : name
    if (isBranded) {
      const sSize = Number(food.servingSize)
      const sLabel = food.householdServingFullText?.trim() || (sSize > 0 ? `${sSize}${food.servingSizeUnit||'g'}` : '1 serving')
      setPendingFood({ food_name: cleaned, calories: cal != null ? Math.round(cal*10)/10 : null, protein_g: pro != null ? Math.round(pro*10)/10 : null, carbs_g: carb != null ? Math.round(carb*10)/10 : null, fat_g: fat != null ? Math.round(fat*10)/10 : null, serving_size: sLabel })
      return
    }
    let serving = getUSDAServing(food)
    if (!serving && food?.fdcId) {
      try {
        const det = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${food.fdcId}?api_key=${USDA_API_KEY}`)
        const detFood = await det.json()
        serving = getUSDAServing(detFood)
        const dn = detFood.foodNutrients || []
        const dget = (name: string) => { const n = (dn as Array<{ nutrient?: { name?: string | null } | null; amount?: number | null }>).find((v) => v.nutrient?.name?.toLowerCase().includes(name)); return n?.amount ?? null }
        if (cal == null) cal = dget('energy'); if (pro == null) pro = dget('protein')
        if (carb == null) carb = dget('carbohydrat'); if (fat == null) fat = dget('total lipid')
      } catch { serving = null }
    }
    if (!serving) { setSearchError('No serving size found for this food. Try a branded result or Quick Add.'); return }
    const scale = serving.grams / 100
    const r = (v: number | null) => v != null ? Math.round(v * scale * 10) / 10 : null
    setPendingFood({ food_name: cleaned, calories: r(cal), protein_g: r(pro), carbs_g: r(carb), fat_g: r(fat), serving_size: serving.label })
  }

  // ── FatSecret food picker ─────────────────────────────────────────────────
  function pickBestFSServing(food: FatSecretFoodDetail): FatSecretServing | null {
    const raw = food.servings?.serving; if (!raw) return null
    const all = Array.isArray(raw) ? raw : [raw]
    return all.find((s) => { const amt = parseFloat(String(s.metric_serving_amount || '0')); return amt > 0 && Math.round(amt) !== 100 }) || all[0]
  }

  function pickFSFood(food: FatSecretFoodDetail | FatSecretSearchFood) {
    const serving = pickBestFSServing(food); if (!serving) return
    const r = (v: string | number | null | undefined) => v != null ? Math.round(parseFloat(String(v)) * 10) / 10 : null
    setPendingFood({ food_name: food.food_name, calories: r(serving.calories), protein_g: r(serving.protein), carbs_g: r(serving.carbohydrate), fat_g: r(serving.fat), serving_size: serving.serving_description || '1 serving' })
  }

  function parseFSDescription(desc: string) {
    if (!desc) return { cal: null, pro: null, servingLabel: '1 serving' }
    const calM = desc.match(/(\d+\.?\d*)\s*Calorie/); const proM = desc.match(/(\d+\.?\d*)g\s*Protein/); const perM = desc.match(/^Per ([^:]+):/)
    return { cal: calM ? parseFloat(calM[1]) : null, pro: proM ? parseFloat(proM[1]) : null, servingLabel: perM ? perM[1] : '1 serving' }
  }

  // ── Barcode lookup ────────────────────────────────────────────────────────
  async function lookupBarcode(code: string) {
    setBarcodeLoading(true); setBarcodeErr('')
    try {
      const fsRes  = await fetch(`${FS_API}?barcode=${encodeURIComponent(code)}`, { headers: fsHeaders })
      const fsData = await fsRes.json()
      const foodId = fsData?.food_id?.value || fsData?.food_id
      if (foodId) {
        const detRes  = await fetch(`${FS_API}?food_id=${foodId}`, { headers: fsHeaders })
        const detData = await detRes.json()
        const food = detData?.food
        if (food) { pickFSFood(food); setBarcodeVal(''); setAddMode('none'); setBarcodeLoading(false); return }
      }
      const offRes  = await fetch(`https://world.openfoodfacts.org/api/v0/product/${code}.json`)
      const offData = await offRes.json()
      if (offData?.status === 1) {
        const p = offData.product; const n = p.nutriments || {}
        const r = (v: string | number | null | undefined) => v != null ? Math.round(parseFloat(String(v)) * 10) / 10 : null
        if (!p.serving_size && n['energy-kcal_serving'] == null) {
          setBarcodeErr('Product found but serving info is missing. Try search or Quick Add.')
        } else {
          setPendingFood({ food_name: p.product_name || 'Unknown product', calories: r(n['energy-kcal_serving']), protein_g: r(n.proteins_serving), carbs_g: r(n.carbohydrates_serving), fat_g: r(n.fat_serving), serving_size: p.serving_size || '1 serving' })
          setBarcodeVal(''); setAddMode('none')
        }
      } else { setBarcodeErr('Product not found. Try searching by name or Quick Add.') }
    } catch { setBarcodeErr('Lookup failed. Try Quick Add instead.') }
    setBarcodeLoading(false)
  }

  // ── Photo log — upload to storage, then go to meal picker ─────────────────
  async function handlePhotoFile(file: File) {
    if (!clientRecord) return
    setPhotoErr(''); setPhotoUploading(true)
    const localUrl = URL.createObjectURL(file)
    setPhotoPreviewUrl(localUrl)
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `food-photos/${clientRecord.id}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('workout-reviews').upload(path, file, { upsert: false })
      if (upErr) throw new Error(upErr.message)
      const { data: urlData } = supabase.storage.from('workout-reviews').getPublicUrl(path)
      setPhotoStorageUrl(urlData.publicUrl)
    } catch (e) {
      setPhotoErr('Upload failed — try again.')
      setPhotoPreviewUrl(null)
      console.error('Photo upload error:', e)
    }
    setPhotoUploading(false)
  }

  function confirmPhoto(storageUrl: string) {
    setPendingFood({
      food_name:   photoCaption.trim() || 'Photo Log',
      serving_size:'1 photo',
      calories:    null,
      protein_g:   null,
      carbs_g:     null,
      fat_g:       null,
      source:      'photo',
      photo_url:   storageUrl,
    })
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const totals = entries.reduce((acc, e) => ({
    calories: acc.calories + (e.calories || 0),
    protein:  acc.protein  + (e.protein_g || 0),
    carbs:    acc.carbs    + (e.carbs_g   || 0),
    fat:      acc.fat      + (e.fat_g     || 0),
  }), { calories:0, protein:0, carbs:0, fat:0 })
  const pct = (val: number, target: number) => target > 0 ? Math.min(100, Math.round((val/target)*100)) : 0
  const macros = [
    { label:'Calories', val:Math.round(totals.calories), target:plan?.calories_target, unit:'kcal', color:'#c8f545' },
    { label:'Protein',  val:Math.round(totals.protein),  target:plan?.protein_g,       unit:'g',    color:'#60a5fa' },
    { label:'Carbs',    val:Math.round(totals.carbs),    target:plan?.carbs_g,         unit:'g',    color:'#f5a623' },
    { label:'Fat',      val:Math.round(totals.fat),      target:plan?.fat_g,           unit:'g',    color:'#f472b6' },
  ]
  const byMeal: Record<string, FoodEntry[]> = {}
  for (const e of entries) { const k = e.meal_time||'snack'; if (!byMeal[k]) byMeal[k]=[]; byMeal[k].push(e) }
  const mealOrder = MEAL_LABELS.map(m => m.id)
  const usedMeals = [...new Set([...mealOrder.filter(m=>byMeal[m]),...Object.keys(byMeal).filter(m=>!mealOrder.includes(m))])]
  const inp = { width:'100%', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:9, padding:'9px 12px', color:t.text, fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' } as const
  const macroRow = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(72px,1fr))', gap:6 } as const

  if (!clientRecord) return null

  const resetAdd = () => {
    setAddMode('none'); setSearchQ(''); setSearchResults([]); setSearchError('')
    setBarcodeVal(''); setBarcodeErr('')
    setPhotoCaption(''); setPhotoPreviewUrl(null); setPhotoStorageUrl(null); setPhotoErr('')
    setLastSavedLabel('')
  }

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
        {clientRecord?.show_macros !== false && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10, marginBottom:20 }}>
          {macros.map(m => {
            const p = pct(m.val, m.target ?? 0); const r=22, circ=2*Math.PI*r
            return (
              <div key={m.label} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'12px 8px', textAlign:'center' }}>
                <svg width="56" height="56" style={{ display:'block', margin:'0 auto 6px' }}>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={t.surfaceHigh} strokeWidth="4"/>
                  <circle cx="28" cy="28" r={r} fill="none" stroke={m.color} strokeWidth="4" strokeDasharray={circ} strokeDashoffset={circ-circ*p/100} strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition:'stroke-dashoffset 0.5s ease' }}/>
                  <text x="28" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill={m.color}>{p}%</text>
                </svg>
                <div style={{ fontSize:14, fontWeight:800 }}>{m.val}<span style={{ fontSize:10, color:t.textMuted, fontWeight:400 }}>{m.unit}</span></div>
                {m.target ? <div style={{ fontSize:10, color:t.textMuted }}>/{m.target}{m.unit}</div> : <div style={{ fontSize:10, color:t.textMuted }}>&mdash;</div>}
                <div style={{ fontSize:10, color:t.textMuted, marginTop:2 }}>{m.label}</div>
              </div>
            )
          })}
        </div>
        )}

        {/* Add food buttons */}
        {addMode === 'none' && !pendingFood && (
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:13, fontWeight:800, color:t.textDim, marginBottom:10 }}>Add food to {selectedDate===today?'Today':selectedDate}</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:8 }}>
              {([
                {mode:'search' as AddMode, icon:'🔍', label:'Search'},
                {mode:'quick'  as AddMode, icon:'➕',  label:'Quick Add'},
                {mode:'saved'  as AddMode, icon:'🕑', label:'Recent'},
              ]).map(({mode,icon,label})=>(
                <button key={mode} onClick={()=>setAddMode(mode)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim }}>{label}</span>
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
              {([
                {mode:'barcode' as AddMode, icon:'🔢', label:'Barcode'},
                {mode:'image'   as AddMode, icon:'📸', label:'Photo'},
              ]).map(({mode,icon,label})=>(
                <button key={mode} onClick={()=>setAddMode(mode)} style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'14px 8px', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:t.textDim }}>{label}</span>
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
              <button onClick={resetAdd} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>x</button>
            </div>
            <input value={searchQ} onChange={e=>handleSearchInput(e.target.value)} placeholder="e.g. chicken breast, greek yogurt..." autoFocus style={{ ...inp, marginBottom:10 }}/>
            {searching && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center' as const, padding:'8px 0' }}>Searching...</div>}
            {searchError && <div style={{ fontSize:12, color:t.orange, marginBottom:8 }}>{searchError}</div>}
            {searchResults.map((food) => {
              if (isFatSecretFood(food)) {
                const { cal, pro, servingLabel } = parseFSDescription(food.food_description || '')
                return (
                  <button key={food.food_id} onClick={async () => {
                    try {
                      const res  = await fetch(`${FS_API}?food_id=${food.food_id}`, { headers: fsHeaders })
                      const data = await res.json()
                      pickFSFood(data?.food || food)
                    } catch { pickFSFood(food) }
                  }} style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{food.food_name}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{cal != null ? Math.round(cal)+' kcal' : '—'} · {pro != null ? pro+'g protein' : '—'} · per {servingLabel}</div>
                  </button>
                )
              } else {
                const n = food.foodNutrients || []
                const cal = n.find((x: USDANutrient) => x.nutrientName?.toLowerCase().includes('energy'))?.value
                const pro = n.find((x: USDANutrient) => x.nutrientName?.toLowerCase().includes('protein'))?.value
                const serving = getUSDAServing(food)
                return (
                  <button key={food.fdcId} onClick={()=>pickUSDAFood(food)} style={{ width:'100%', background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:10, padding:'10px 12px', marginBottom:6, cursor:'pointer', textAlign:'left' as const, fontFamily:"'DM Sans',sans-serif", display:'block' }}>
                    <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{food.description}</div>
                    <div style={{ fontSize:11, color:t.textMuted }}>{cal ? Math.round(cal)+' kcal' : '—'} · {pro ? Math.round(pro)+'g protein' : '—'} · {serving ? `per ${serving.label}` : 'tap to check serving'}</div>
                  </button>
                )
              }
            })}
            {!searching && searchQ.length>1 && searchResults.length===0 && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center', padding:'8px 0' }}>No results — try Quick Add</div>}
          </div>
        )}

        {/* QUICK ADD MODE */}
        {addMode==='quick' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>➕ Quick Add</span>
              <button onClick={resetAdd} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>x</button>
            </div>
            <input value={quick.food_name} onChange={e=>setQuick(p=>({...p,food_name:e.target.value}))} placeholder="Food name..." autoFocus style={{ ...inp, marginBottom:8 }}/>
            <div style={{ ...macroRow, marginBottom:8 }}>
              {([{f:'calories',p:'kcal',l:'Calories'},{f:'protein_g',p:'g',l:'Protein'},{f:'carbs_g',p:'g',l:'Carbs'},{f:'fat_g',p:'g',l:'Fat'}] as const).map(field=>(
                <div key={field.f}>
                  <div style={{ fontSize:10, color:t.textMuted, marginBottom:3 }}>{field.l}</div>
                  <input type="number" placeholder={field.p} value={quick[field.f]} onChange={e=>setQuick(p=>({...p,[field.f]:e.target.value}))} style={{ ...inp, padding:'8px', textAlign:'center', fontSize:14 }}/>
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
              <button onClick={()=>{ resetAdd(); setBarcodeVal(''); setBarcodeErr('') }} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>x</button>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={barcodeVal} onChange={e=>setBarcodeVal(e.target.value.replace(/\D/g,''))}
                placeholder="Enter barcode number..." inputMode="numeric" autoFocus
                onKeyDown={e=>{ if(e.key==='Enter' && barcodeVal.length>5) lookupBarcode(barcodeVal) }}
                style={{ ...inp, flex:1 }}/>
              <button onClick={()=>{ if(barcodeVal.length>5) lookupBarcode(barcodeVal) }}
                disabled={barcodeVal.length<6||barcodeLoading}
                style={{ background:t.teal, border:'none', borderRadius:9, padding:'9px 16px', fontSize:13, fontWeight:700, color:'#0f0f0f', cursor:'pointer', whiteSpace:'nowrap' as const, opacity:barcodeVal.length<6?0.5:1 }}>
                {barcodeLoading ? '...' : 'Look Up'}
              </button>
            </div>
            {barcodeErr && (
              <div style={{ marginTop:8 }}>
                <div style={{ fontSize:12, color:t.orange, marginBottom:6 }}>{barcodeErr}</div>
                <button onClick={()=>{ setBarcodeErr(''); setAddMode('quick') }}
                  style={{ fontSize:12, fontWeight:700, color:t.teal, background:'#00c9b115', border:'1px solid '+t.teal+'40', borderRadius:8, padding:'6px 14px', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  → Try Quick Add
                </button>
              </div>
            )}
            {barcodeLoading && <div style={{ fontSize:12, color:t.textMuted, textAlign:'center' as const, padding:'10px 0' }}>Looking up product...</div>}
          </div>
        )}

        {/* PHOTO LOG MODE — upload photo, optional caption, then meal picker */}
        {addMode==='image' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>📸 Photo Log</span>
              <button onClick={resetAdd} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>x</button>
            </div>
            {/* Two hidden file inputs — one for camera, one for gallery */}
            <input ref={imageInputRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }}
              onChange={e=>{ const f = e.target.files?.[0]; if(f) handlePhotoFile(f) }}/>
            <input ref={imageGalleryRef} type="file" accept="image/*" style={{ display:'none' }}
              onChange={e=>{ const f = e.target.files?.[0]; if(f) handlePhotoFile(f) }}/>

            {/* No photo yet — show camera + gallery buttons */}
            {!photoPreviewUrl && !photoUploading && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                <button onClick={()=>imageInputRef.current?.click()}
                  style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'18px 8px', fontSize:13, fontWeight:700, color:t.text, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:24 }}>📷</span>
                  <span style={{ fontSize:11, color:t.textDim }}>Take Photo</span>
                </button>
                <button onClick={()=>imageGalleryRef.current?.click()}
                  style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:12, padding:'18px 8px', fontSize:13, fontWeight:700, color:t.text, cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                  <span style={{ fontSize:24 }}>🖼️</span>
                  <span style={{ fontSize:11, color:t.textDim }}>Choose Photo</span>
                </button>
              </div>
            )}

            {/* Uploading spinner */}
            {photoUploading && (
              <div style={{ textAlign:'center', padding:'24px 0', color:t.textMuted, fontSize:13 }}>Uploading photo...</div>
            )}

            {/* Photo preview + caption + confirm */}
            {photoPreviewUrl && !photoUploading && (
              <>
                <img src={photoPreviewUrl} alt="Food photo preview"
                  style={{ width:'100%', borderRadius:10, marginBottom:12, maxHeight:260, objectFit:'cover', display:'block' }}/>
                <input value={photoCaption} onChange={e=>setPhotoCaption(e.target.value)}
                  placeholder="What did you eat? (optional caption)"
                  style={{ ...inp, marginBottom:10 }}/>
                {photoErr && <div style={{ fontSize:12, color:t.orange, marginBottom:8 }}>{photoErr}</div>}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={()=>{ setPhotoPreviewUrl(null); setPhotoStorageUrl(null); setPhotoCaption(''); setPhotoErr('') }}
                    style={{ flex:1, background:'none', border:`1px solid ${t.border}`, borderRadius:10, padding:'10px', fontSize:13, color:t.textMuted, cursor:'pointer' }}>
                    Retake
                  </button>
                  <button onClick={()=>{ if(photoStorageUrl) confirmPhoto(photoStorageUrl) }} disabled={!photoStorageUrl}
                    style={{ flex:2, background:photoStorageUrl?t.teal:'#333', border:'none', borderRadius:10, padding:'10px', fontSize:13, fontWeight:800, color:'#0f0f0f', cursor:photoStorageUrl?'pointer':'not-allowed' }}>
                    {photoStorageUrl ? 'Next: Choose Meal →' : 'Uploading...'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* CONFIRMED STATE — logged successfully, Add More or Done */}
        {addMode==='confirmed' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
              <div style={{ width:32, height:32, borderRadius:'50%', background:t.teal+'20', border:`1px solid ${t.teal}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>✓</div>
              <div>
                <div style={{ fontSize:13, fontWeight:800, color:t.teal }}>Logged!</div>
                <div style={{ fontSize:12, color:t.textMuted }}>{lastSavedLabel}</div>
              </div>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={()=>{ setAddMode(returnMode) }}
                style={{ flex:1, background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'11px', fontSize:13, fontWeight:700, color:t.text, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                + Add More
              </button>
              <button
                onClick={resetAdd}
                style={{ flex:1, background:`linear-gradient(135deg,${t.teal},${t.teal}cc)`, border:'none', borderRadius:10, padding:'11px', fontSize:13, fontWeight:800, color:'#0f0f0f', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Done
              </button>
            </div>
          </div>
        )}

        {/* SAVED FOODS MODE */}
        {addMode==='saved' && !pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:16, padding:16, marginBottom:16 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
              <span style={{ fontSize:15, fontWeight:800 }}>🕑 Recent Foods</span>
              <button onClick={resetAdd} style={{ marginLeft:'auto', background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:20 }}>x</button>
            </div>
            {savedFoods.length === 0 && <div style={{ fontSize:13, color:t.textMuted, textAlign:'center', padding:'20px 0' }}>Foods you log will appear here for quick re-adding.</div>}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
              {savedFoods.map((f) => (
                <button key={f.food_name} onClick={()=>setPendingFood({ food_name:f.food_name, calories:f.calories, protein_g:f.protein_g, carbs_g:f.carbs_g, fat_g:f.fat_g, serving_size:f.serving_size })}
                  style={{ background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 8px', cursor:'pointer', textAlign:'center' as const }}>
                  <div style={{ fontSize:12, fontWeight:700, color:t.text, marginBottom:3, lineHeight:1.3 }}>{f.food_name.length>18?f.food_name.slice(0,16)+'…':f.food_name}</div>
                  {f.calories != null && <div style={{ fontSize:10, color:t.orange }}>{Math.round(f.calories)} kcal</div>}
                  {f.protein_g != null && <div style={{ fontSize:10, color:'#60a5fa' }}>{f.protein_g}g P</div>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* PENDING FOOD — meal picker (shared by all modes) */}
        {pendingFood && (
          <div style={{ background:t.surface, border:`1px solid ${t.teal}40`, borderRadius:16, padding:16, marginBottom:16 }}>
            {/* Photo preview in meal picker */}
            {pendingFood.source === 'photo' && pendingFood.photo_url && (
              <img src={pendingFood.photo_url} alt="Food"
                style={{ width:'100%', borderRadius:10, marginBottom:12, maxHeight:200, objectFit:'cover', display:'block' }}/>
            )}
            <div style={{ fontSize:13, fontWeight:800, marginBottom:12 }}>
              {pendingFood.source === 'photo' ? (pendingFood.food_name === 'Photo Log' ? '📸 Photo Log' : `📸 ${pendingFood.food_name}`) : `Adding: ${pendingFood.food_name}`}
            </div>

            {/* Servings adjuster — only for non-photo entries */}
            {pendingFood.source !== 'photo' && (
              <div style={{ display:'flex', alignItems:'center', gap:12, background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:10, color:t.textMuted, marginBottom:2 }}>SERVINGS</div>
                  <div style={{ fontSize:13, fontWeight:700, color:t.teal }}>
                    {pendingFood.calories != null ? `${Math.round(pendingFood.calories * pendingServings)} kcal` : '—'}
                    {pendingFood.protein_g != null ? ` · ${Math.round(pendingFood.protein_g * pendingServings * 10)/10}g P` : ''}
                  </div>
                  <div style={{ fontSize:11, color:t.textMuted }}>{pendingServings}x {pendingFood.serving_size}</div>
                </div>
                <div style={{ display:'flex', alignItems:'center', background:t.surface, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
                  <button onClick={()=>setPendingServings(s=>Math.max(0.5, Math.round((s-0.5)*10)/10))}
                    style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'8px 14px', lineHeight:1 }}>−</button>
                  <div style={{ fontSize:14, fontWeight:800, color:t.teal, minWidth:40, textAlign:'center' as const }}>{pendingServings}</div>
                  <button onClick={()=>setPendingServings(s=>Math.round((s+0.5)*10)/10)}
                    style={{ background:'none', border:'none', color:t.text, cursor:'pointer', fontSize:18, fontWeight:700, padding:'8px 14px', lineHeight:1 }}>+</button>
                </div>
              </div>
            )}

            <div style={{ fontSize:12, fontWeight:700, color:t.textDim, marginBottom:10 }}>Which meal is this?</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:12 }}>
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
            <div style={{ background:t.surface, border:`1px solid ${t.border}`, borderRadius:14, padding:'32px 16px', textAlign:'center', color:t.textMuted, fontSize:13 }}>Nothing logged yet — tap Add above.</div>
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
                {mealEntries.map((e:FoodEntry)=>{
                  const isPhoto = e.source === 'photo'
                  return (
                    <div key={e.id} style={{ background:t.surface, border:`1px solid ${editingEntry===e.id?t.teal+'60':t.border}`, borderRadius:10, marginBottom:5, overflow:'hidden' }}>
                      {/* Photo entry — show image then name + delete */}
                      {isPhoto && e.photo_url ? (
                        <div>
                          <img src={e.photo_url} alt={e.food_name}
                            style={{ width:'100%', maxHeight:180, objectFit:'cover', display:'block' }}/>
                          <div style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px' }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:700 }}>{e.food_name === 'Photo Log' ? '📸 Photo Log' : `📸 ${e.food_name}`}</div>
                              <div style={{ fontSize:11, color:t.textMuted }}>Visual log only</div>
                            </div>
                            <button onClick={()=>removeEntry(e.id)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'2px 4px', lineHeight:1 }}>x</button>
                          </div>
                        </div>
                      ) : (
                        /* Standard entry — name, macros, optional servings editor */
                        <div style={{ padding:'10px 12px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <div style={{ flex:1, cursor:'pointer' }} onClick={()=>{ setEditingEntry(editingEntry===e.id?null:e.id); setEditServings(e.serving_qty||1) }}>
                              <div style={{ fontSize:13, fontWeight:600 }}>{e.food_name}</div>
                              <div style={{ fontSize:11, color:t.textMuted }}>
                                {e.serving_size}{e.calories?` · ${Math.round(e.calories)} kcal`:''}{e.protein_g?` · ${e.protein_g}g P`:''}{e.carbs_g?` · ${e.carbs_g}g C`:''}{e.fat_g?` · ${e.fat_g}g F`:''}
                              </div>
                            </div>
                            <button onClick={()=>removeEntry(e.id)} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:18, padding:'2px 4px', lineHeight:1 }}>x</button>
                          </div>
                          {editingEntry === e.id && (
                            <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${t.border}`, display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ fontSize:11, color:t.textMuted, flex:1 }}>Adjust servings:</div>
                              <div style={{ display:'flex', alignItems:'center', background:t.surfaceHigh, border:`1px solid ${t.border}`, borderRadius:10, overflow:'hidden' }}>
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
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

      </>)}
    </div>
  )
}
