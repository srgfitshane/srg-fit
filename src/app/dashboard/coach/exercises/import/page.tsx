'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", yellow:"#eab308",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

// Equipment keywords to detect from filename prefix
const EQUIPMENT_MAP: Record<string, string> = {
  barbell:'Barbell', dumbbell:'Dumbbell', db:'Dumbbell', cable:'Cable',
  machine:'Machine', bodyweight:'Bodyweight', bw:'Bodyweight',
  kettlebell:'Kettlebell', kb:'Kettlebell', band:'Resistance Band',
  resistance:'Resistance Band', ez:'EZ Bar', trap:'Trap Bar',
  smith:'Smith Machine', sled:'Sled', landmine:'Landmine',
  plate:'Plate', bench:'Bodyweight', box:'Bodyweight',
}

// Movement pattern detection from exercise name keywords
const MOVEMENT_MAP: Record<string, string> = {
  squat:'squat', lunge:'lunge', split:'lunge', stepup:'lunge',
  deadlift:'hinge', rdl:'hinge', goodmorning:'hinge', hip:'hinge', swing:'hinge',
  press:'push', pushup:'push', dip:'push', fly:'push', flye:'push',
  row:'pull', pullup:'pull', pulldown:'pull', curl:'pull', facepull:'pull',
  carry:'carry', walk:'carry', farmer:'carry',
  plank:'core', crunch:'core', situp:'core', ab:'core', hollow:'core',
  raise:'isolation', extension:'isolation', kickback:'isolation',
}

// Muscle group folder name normalization
const MUSCLE_FOLDER_MAP: Record<string, string[]> = {
  chest:     ['Chest'],
  back:      ['Back'],
  shoulders: ['Shoulders'], shoulder: ['Shoulders'], delts: ['Shoulders'],
  biceps:    ['Biceps'], bicep: ['Biceps'],
  triceps:   ['Triceps'], tricep: ['Triceps'],
  legs:      ['Quads','Hamstrings','Glutes'], leg: ['Quads','Hamstrings','Glutes'],
  quads:     ['Quads'], quad: ['Quads'],
  hamstrings:['Hamstrings'], hamstring: ['Hamstrings'], hams: ['Hamstrings'],
  glutes:    ['Glutes'], glute: ['Glutes'], butt: ['Glutes'],
  calves:    ['Calves'], calf: ['Calves'],
  core:      ['Core'], abs: ['Core'], ab: ['Core'],
  fullbody:  ['Full Body'], full: ['Full Body'], compound: ['Full Body'],
  forearms:  ['Forearms'], forearm: ['Forearms'],
  cardio:    ['Cardio'],
}

interface ParsedFile {
  file: File
  folderName: string
  muscles: string[]
  equipment: string
  exerciseName: string
  movementPattern: string
  status: 'pending' | 'uploading' | 'done' | 'exists' | 'error'
  videoUrl?: string
  error?: string
  duplicate?: boolean
}

function parseFileName(filename: string, folderName: string): Omit<ParsedFile, 'file' | 'status'> {
  const base = filename.replace(/\.[^.]+$/, '') // remove extension
  const parts = base.split(/[_\s-]+/).filter(Boolean)

  // Detect equipment from leading word(s)
  let equipment = 'Other'
  let nameStart = 0
  for (let i = 1; i <= Math.min(3, parts.length); i++) {
    const prefix = parts.slice(0, i).join('').toLowerCase()
    if (EQUIPMENT_MAP[prefix]) { equipment = EQUIPMENT_MAP[prefix]; nameStart = i; break }
    if (EQUIPMENT_MAP[parts[0].toLowerCase()]) { equipment = EQUIPMENT_MAP[parts[0].toLowerCase()]; nameStart = 1; break }
  }

  // Exercise name = remaining parts, title cased
  const nameParts = parts.slice(nameStart)
  const exerciseName = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')
    || parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ')

  // Movement pattern from name keywords
  const nameKey = nameParts.join('').toLowerCase()
  let movementPattern = 'general'
  for (const [key, pattern] of Object.entries(MOVEMENT_MAP)) {
    if (nameKey.includes(key)) { movementPattern = pattern; break }
  }

  // Muscle groups from folder name
  const folderKey = folderName.toLowerCase().replace(/[^a-z]/g, '')
  const muscles = MUSCLE_FOLDER_MAP[folderKey] || [folderName.charAt(0).toUpperCase() + folderName.slice(1)]

  return { folderName, muscles, equipment, exerciseName, movementPattern }
}

export default function BulkImporter() {
  const [files,     setFiles]     = useState<ParsedFile[]>([])
  const [importing, setImporting] = useState(false)
  const [progress,  setProgress]  = useState({ done:0, total:0 })
  const [done,      setDone]      = useState(false)
  const router  = useRouter()
  const supabase = createClient()

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    const items = Array.from(e.dataTransfer.items)
    const parsed: ParsedFile[] = []

    for (const item of items) {
      if (item.kind !== 'file') continue
      const entry = item.webkitGetAsEntry?.()
      if (!entry) continue
      await traverseEntry(entry, '', parsed)
    }

    setFiles(parsed)
  }, [])

  const traverseEntry = (entry: any, path: string, results: ParsedFile[]): Promise<void> => {
    return new Promise(resolve => {
      if (entry.isFile) {
        entry.getFile((file: File) => {
          if (!file.name.match(/\.(mp4|mov|webm|avi)$/i)) return resolve()
          const folderName = path || 'misc'
          const parsed = parseFileName(file.name, folderName)
          results.push({ file, status:'pending', ...parsed })
          resolve()
        })
      } else if (entry.isDirectory) {
        const reader = entry.createReader()
        const folderName = entry.name
        reader.readEntries(async (entries: any[]) => {
          for (const child of entries) {
            await traverseEntry(child, folderName, results)
          }
          resolve()
        })
      } else resolve()
    })
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || [])
    const parsed: ParsedFile[] = fileList
      .filter(f => f.name.match(/\.(mp4|mov|webm|avi)$/i))
      .map(file => {
        // webkitRelativePath gives us folder/file.mp4
        const parts = (file as any).webkitRelativePath?.split('/') || [file.name]
        const folderName = parts.length > 1 ? parts[parts.length - 2] : 'misc'
        return { file, status: 'pending' as const, ...parseFileName(file.name, folderName) }
      })
    setFiles(parsed)
  }


  const runImport = async () => {
    setImporting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const total = files.filter(f => f.status === 'pending').length
    setProgress({ done: 0, total })
    let done = 0

    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (f.status !== 'pending') continue

      setFiles(prev => prev.map((p,j) => j===i ? {...p, status:'uploading'} : p))

      try {
        // Check if exercise already exists by name
        const { data: existing } = await supabase.from('exercises')
          .select('id, video_url').eq('name', f.exerciseName).eq('coach_id', user?.id).single()

        // Upload video to Supabase Storage
        const ext = f.file.name.split('.').pop()
        const storagePath = `${user?.id}/${f.folderName}/${f.exerciseName.replace(/\s+/g,'_')}.${ext}`
        const { data: upload, error: uploadErr } = await supabase.storage
          .from('exercise-videos')
          .upload(storagePath, f.file, { upsert: true, contentType: `video/${ext}` })

        if (uploadErr) throw uploadErr

        const { data: { publicUrl } } = supabase.storage
          .from('exercise-videos').getPublicUrl(storagePath)

        if (existing) {
          // Update existing exercise with video URL
          await supabase.from('exercises').update({ video_url: publicUrl }).eq('id', existing.id)
          setFiles(prev => prev.map((p,j) => j===i ? {...p, status:'exists', videoUrl: publicUrl, duplicate: true} : p))
        } else {
          // Create new exercise record
          await supabase.from('exercises').insert({
            coach_id: user?.id,
            name: f.exerciseName,
            muscles: f.muscles,
            equipment: f.equipment,
            movement_pattern: f.movementPattern,
            video_url: publicUrl,
            difficulty: 'Intermediate',
            tags: [],
          })
          setFiles(prev => prev.map((p,j) => j===i ? {...p, status:'done', videoUrl: publicUrl} : p))
        }
      } catch (err: any) {
        setFiles(prev => prev.map((p,j) => j===i ? {...p, status:'error', error: err.message} : p))
      }

      done++
      setProgress({ done, total })
    }

    setDone(true)
    setImporting(false)
  }

  const updateParsed = (i: number, field: keyof ParsedFile, value: any) => {
    setFiles(prev => prev.map((f,j) => j===i ? {...f, [field]: value} : f))
  }

  const stats = {
    pending: files.filter(f=>f.status==='pending').length,
    done:    files.filter(f=>f.status==='done').length,
    exists:  files.filter(f=>f.status==='exists').length,
    error:   files.filter(f=>f.status==='error').length,
  }

  const muscleColors: Record<string,string> = {
    Chest:t.orange, Back:t.teal, Shoulders:t.purple, Biceps:t.blue,
    Triceps:t.pink, Quads:t.green, Hamstrings:t.yellow, Glutes:t.orange,
    Core:t.red, Calves:t.teal, 'Full Body':t.teal, Forearms:t.textMuted,
  }


  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select{color-scheme:dark;}
        .status-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;}
      `}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach/exercises')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>Bulk Video Importer</div>
          <div style={{ flex:1 }} />
          {files.length > 0 && !importing && !done && (
            <button onClick={runImport}
              style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ⚡ Import {stats.pending} Videos
            </button>
          )}
          {done && (
            <button onClick={()=>router.push('/dashboard/coach/exercises')}
              style={{ background:'linear-gradient(135deg,'+t.green+','+t.green+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ✓ Done — View Library
            </button>
          )}
        </div>

        <div style={{ maxWidth:960, margin:'0 auto', padding:28 }}>

          {/* Drop zone — shown when no files loaded */}
          {files.length === 0 && (
            <div>
              <div style={{ background:t.surface, border:'2px dashed '+t.border, borderRadius:20, padding:'60px 40px', textAlign:'center', marginBottom:20 }}
                onDragOver={e=>{ e.preventDefault(); e.currentTarget.style.borderColor=t.teal }}
                onDragLeave={e=>{ e.currentTarget.style.borderColor=t.border }}
                onDrop={e=>{ e.currentTarget.style.borderColor=t.border; handleFolderDrop(e) }}>
                <div style={{ fontSize:48, marginBottom:16 }}>📁</div>
                <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>Drag your muscle group folders here</div>
                <div style={{ fontSize:13, color:t.textMuted, marginBottom:24, lineHeight:1.7 }}>
                  Drop your <span style={{ color:t.teal }}>chest/</span>, <span style={{ color:t.orange }}>back/</span>, <span style={{ color:t.purple }}>legs/</span> folders all at once.<br/>
                  Files named like <code style={{ background:t.surfaceHigh, padding:'2px 6px', borderRadius:4, fontSize:12 }}>Barbell_bench_press.mp4</code> will be parsed automatically.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:12, justifyContent:'center' }}>
                  <div style={{ height:1, width:60, background:t.border }} />
                  <span style={{ fontSize:12, color:t.textMuted }}>or</span>
                  <div style={{ height:1, width:60, background:t.border }} />
                </div>
                <label style={{ display:'inline-block', marginTop:20, background:t.purpleDim, border:'1px solid '+t.purple+'40', borderRadius:10, padding:'10px 24px', fontSize:13, fontWeight:700, color:t.purple, cursor:'pointer' }}>
                  📂 Browse Folders
                  <input type="file" accept="video/*" multiple style={{ display:'none' }}
                    {...{ webkitdirectory:'', directory:'' } as any}
                    onChange={handleFileInput} />
                </label>
              </div>

              {/* How it works */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:16, color:t.teal }}>How it works</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
                  {[
                    ['📁','Reads folder names','chest/ → Chest muscle group'],
                    ['🏷','Parses filenames','Barbell_bench_press.mp4 → Equipment: Barbell, Exercise: Bench Press'],
                    ['⚡','Uploads & links','Creates exercise records with video URLs, skips duplicates'],
                  ].map(([icon,title,desc]) => (
                    <div key={title} style={{ background:t.surfaceUp, borderRadius:12, padding:16 }}>
                      <div style={{ fontSize:24, marginBottom:8 }}>{icon}</div>
                      <div style={{ fontSize:12, fontWeight:800, marginBottom:4 }}>{title}</div>
                      <div style={{ fontSize:11, color:t.textMuted, lineHeight:1.5 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Progress bar during import */}
          {importing && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:24, marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <div style={{ fontSize:14, fontWeight:800 }}>Uploading videos...</div>
                <div style={{ fontSize:13, color:t.teal, fontWeight:700 }}>{progress.done} / {progress.total}</div>
              </div>
              <div style={{ background:t.surfaceHigh, borderRadius:8, height:10, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:8, transition:'width 0.3s ease', width: progress.total > 0 ? (progress.done/progress.total*100)+'%' : '0%' }} />
              </div>
            </div>
          )}

          {/* Stats row */}
          {files.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
              {[
                ['Total',    files.length,  t.text,   t.border],
                ['Ready',    stats.pending, t.teal,   t.teal+'30'],
                ['Imported', stats.done,    t.green,  t.green+'30'],
                ['Updated',  stats.exists,  t.orange, t.orange+'30'],
              ].map(([label,val,color,border]) => (
                <div key={label as string} style={{ background:t.surface, border:'1px solid '+(border as string), borderRadius:12, padding:'14px 18px' }}>
                  <div style={{ fontSize:22, fontWeight:900, color: color as string }}>{val}</div>
                  <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>{label}</div>
                </div>
              ))}
            </div>
          )}


          {/* File preview table */}
          {files.length > 0 && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden' }}>
              <div style={{ padding:'16px 20px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ fontSize:13, fontWeight:800 }}>{files.length} videos parsed — review before importing</div>
                {!importing && !done && (
                  <button onClick={()=>setFiles([])} style={{ background:'none', border:'none', color:t.textMuted, fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>Clear</button>
                )}
              </div>

              {/* Column headers */}
              <div style={{ display:'grid', gridTemplateColumns:'24px 1fr 120px 120px 120px 80px', gap:12, padding:'8px 20px', borderBottom:'1px solid '+t.border, background:t.surfaceUp }}>
                {['','Exercise Name','Muscle Group','Equipment','Movement','Status'].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                ))}
              </div>

              {/* File rows */}
              <div style={{ maxHeight:520, overflowY:'auto' }}>
                {files.map((f,i) => {
                  const statusColor = f.status==='done'?t.green : f.status==='exists'?t.orange : f.status==='error'?t.red : f.status==='uploading'?t.teal : t.textMuted
                  const statusLabel = f.status==='done'?'New ✓' : f.status==='exists'?'Updated' : f.status==='error'?'Error' : f.status==='uploading'?'...' : 'Ready'
                  const mc = muscleColors[f.muscles[0]] || t.teal

                  return (
                    <div key={i} style={{ display:'grid', gridTemplateColumns:'24px 1fr 120px 120px 120px 80px', gap:12, padding:'10px 20px', borderBottom:'1px solid '+t.border+'80', alignItems:'center', background: f.status==='error' ? t.redDim : 'transparent' }}>
                      {/* Status dot */}
                      <div className="status-dot" style={{ background: statusColor }} />

                      {/* Exercise name — editable */}
                      <input value={f.exerciseName} onChange={e=>updateParsed(i,'exerciseName',e.target.value)}
                        disabled={importing || f.status==='done'}
                        style={{ background:'transparent', border:'none', borderBottom:'1px solid '+t.border+'60', fontSize:13, fontWeight:700, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif", width:'100%', padding:'2px 0' }} />

                      {/* Muscle group */}
                      <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                        {f.muscles.map(m => (
                          <span key={m} style={{ background:(muscleColors[m]||t.teal)+'18', border:'1px solid '+(muscleColors[m]||t.teal)+'30', borderRadius:4, padding:'1px 6px', fontSize:10, fontWeight:700, color: muscleColors[m]||t.teal }}>{m}</span>
                        ))}
                      </div>

                      {/* Equipment — editable dropdown */}
                      <select value={f.equipment} onChange={e=>updateParsed(i,'equipment',e.target.value)}
                        disabled={importing || f.status==='done'}
                        style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:6, padding:'3px 6px', fontSize:11, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                        {['Barbell','Dumbbell','Cable','Machine','Bodyweight','Kettlebell','Resistance Band','EZ Bar','Trap Bar','Smith Machine','Landmine','Sled','Plate','Other'].map(eq=>(
                          <option key={eq} value={eq}>{eq}</option>
                        ))}
                      </select>

                      {/* Movement pattern */}
                      <select value={f.movementPattern} onChange={e=>updateParsed(i,'movementPattern',e.target.value)}
                        disabled={importing || f.status==='done'}
                        style={{ background:t.surfaceHigh, border:'1px solid '+t.border, borderRadius:6, padding:'3px 6px', fontSize:11, color:t.text, outline:'none', fontFamily:"'DM Sans',sans-serif" }}>
                        {['push','pull','squat','hinge','lunge','carry','core','isolation','general'].map(p=>(
                          <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
                        ))}
                      </select>

                      {/* Status */}
                      <div style={{ fontSize:11, fontWeight:700, color: statusColor }}>{statusLabel}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
