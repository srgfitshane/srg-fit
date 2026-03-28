'use client'

import { useState, useCallback, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'

const t = {
  bg:"#080810", surface:"#0f0f1a", surfaceUp:"#161624", surfaceHigh:"#1d1d2e", border:"#252538",
  teal:"#00c9b1", tealDim:"#00c9b115", orange:"#f5a623", orangeDim:"#f5a62315",
  purple:"#8b5cf6", purpleDim:"#8b5cf615", red:"#ef4444", redDim:"#ef444415",
  green:"#22c55e", greenDim:"#22c55e15", yellow:"#eab308",
  text:"#eeeef8", textMuted:"#5a5a78", textDim:"#8888a8",
}

// Your Google Drive folder ID from the shared link
const ROOT_FOLDER_ID = '1KICXWyVMtZ4634rs2j0RryWgE6qrAyD2'

// Maps Drive folder names to Supabase muscle group values
const MUSCLE_FOLDER_MAP: Record<string, string[]> = {
  'Abdominals':       ['Core'],
  'Back':             ['Back'],
  'Biceps':           ['Biceps'],
  'Cardio-Functional':['Cardio'],
  'Chest':            ['Chest'],
  'Forearms':         ['Forearms'],
  'Legs':             ['Quads','Hamstrings','Glutes'],
  'Powerlifting':     ['Quads','Hamstrings','Glutes','Chest','Back'],
  'Shoulder':         ['Shoulders'],
  'Stretching':       ['Full Body'],
  'Triceps':          ['Triceps'],
}

// Movement pattern detection from exercise name
const MOVEMENT_MAP: Record<string, string> = {
  squat:'squat', lunge:'lunge', split:'lunge',
  deadlift:'hinge', rdl:'hinge', hip:'hinge', swing:'hinge',
  press:'push', pushup:'push', dip:'push', fly:'push', flye:'push', raise:'push',
  row:'pull', pullup:'pull', pulldown:'pull', curl:'pull',
  carry:'carry', farmer:'carry',
  plank:'core', crunch:'core', situp:'core', rollout:'core',
  extension:'isolation', kickback:'isolation',
}

interface DriveFile {
  id: string
  name: string
  mimeType: string
  thumbnailLink?: string
  webViewLink?: string
}

interface ParsedVideo {
  driveFileId: string
  driveName: string
  folderName: string
  exerciseName: string
  muscles: string[]
  movementPattern: string
  thumbnailLink?: string
  status: 'pending' | 'importing' | 'done' | 'updated' | 'error'
  error?: string
}

function stripSuffix(filename: string): string {
  // Remove extension, then strip trailing " (2)" or " (N)" pattern
  return filename
    .replace(/\.[^.]+$/, '')        // remove .mp4
    .replace(/\s*\(\d+\)\s*$/, '')  // remove (2)
    .trim()
}

function toTitleCase(str: string): string {
  return str.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

function detectMovement(name: string): string {
  const lower = name.toLowerCase().replace(/\s+/g,'')
  for (const [key, pattern] of Object.entries(MOVEMENT_MAP)) {
    if (lower.includes(key)) return pattern
  }
  return 'general'
}

function fuzzyMatch(driveName: string, exercises: any[]): any | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g,'')
  const target = norm(driveName)
  // Exact match first
  const exact = exercises.find(e => norm(e.name) === target)
  if (exact) return exact
  // Substring match
  const sub = exercises.find(e => norm(e.name).includes(target) || target.includes(norm(e.name)))
  return sub || null
}

export default function DriveImporter() {
  const [step,        setStep]        = useState<'connect'|'scanning'|'review'|'importing'|'done'>('connect')
  const [accessToken, setAccessToken] = useState<string|null>(null)
  const [videos,      setVideos]      = useState<ParsedVideo[]>([])
  const [progress,    setProgress]    = useState({ done:0, total:0, folder:'' })
  const [existingEx,  setExistingEx]  = useState<any[]>([])
  const router  = useRouter()
  const supabase = createClient()

  // ── Step 1: Google OAuth for Drive readonly scope ──────────────────────────
  const connectDrive = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/drive.readonly',
        redirectTo: window.location.href,
        queryParams: { access_type: 'offline', prompt: 'consent' },
        skipBrowserRedirect: false,
      }
    })
    if (error) alert('OAuth error: ' + error.message)
  }

  // ── On mount: check if we have a Google access token from session ──────────
  const checkSession = async () => {
    // First try the session provider_token
    const { data: { session } } = await supabase.auth.getSession()
    let token = session?.provider_token

    // Fallback: parse access_token from URL hash (right after OAuth redirect)
    if (!token && typeof window !== 'undefined') {
      const hash = window.location.hash
      const params = new URLSearchParams(hash.replace('#', ''))
      const hashToken = params.get('provider_token') || params.get('access_token')
      if (hashToken) token = hashToken
    }

    if (token) {
      setAccessToken(token)
      // Load existing exercises for fuzzy matching
      const { data: { user } } = await supabase.auth.getUser()
      const { data: exList } = await supabase.from('exercises').select('id,name').eq('coach_id', user?.id)
      setExistingEx(exList || [])
      return true
    }
    return false
  }

  // Run once on mount
  useEffect(() => { checkSession() }, [])

  // ── Step 2: Scan Drive folders ─────────────────────────────────────────────
  const scanDrive = async () => {
    // Always re-fetch token fresh to avoid stale closure
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.provider_token || accessToken
    if (!token) { await connectDrive(); return }
    setStep('scanning')
    const parsed: ParsedVideo[] = []

    try {
      // Get all subfolders of root folder
      const foldersRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q='${ROOT_FOLDER_ID}'+in+parents+and+mimeType='application/vnd.google-apps.folder'+and+trashed=false&fields=files(id,name)&pageSize=50`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      const foldersData = await foldersRes.json()
      const folders: DriveFile[] = foldersData.files || []

      for (const folder of folders) {
        setProgress(p => ({ ...p, folder: folder.name }))
        const muscles = MUSCLE_FOLDER_MAP[folder.name] || [folder.name]

        // Get all mp4 files in this folder (paginate if needed)
        let pageToken = ''
        do {
          const pageParam = pageToken ? `&pageToken=${pageToken}` : ''
          const filesRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q='${folder.id}'+in+parents+and+mimeType+contains+'video/'+and+trashed=false&fields=files(id,name,mimeType,thumbnailLink,webViewLink),nextPageToken&pageSize=200${pageParam}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const filesData = await filesRes.json()
          const files: DriveFile[] = filesData.files || []
          pageToken = filesData.nextPageToken || ''

          for (const file of files) {
            const cleanName = stripSuffix(file.name)
            const exerciseName = toTitleCase(cleanName)
            parsed.push({
              driveFileId:   file.id,
              driveName:     cleanName,
              folderName:    folder.name,
              exerciseName,
              muscles,
              movementPattern: detectMovement(cleanName),
              thumbnailLink: file.thumbnailLink,
              status: 'pending',
            })
          }
        } while (pageToken)
      }

      setVideos(parsed)
      setStep('review')
    } catch (err: any) {
      alert('Drive scan error: ' + err.message)
      setStep('connect')
    }
  }

  // ── Step 3: Import — store Drive file IDs in Supabase ─────────────────────
  const runImport = async () => {
    setStep('importing')
    const { data: { user } } = await supabase.auth.getUser()
    const pending = videos.filter(v => v.status === 'pending')
    setProgress({ done:0, total: pending.length, folder:'' })
    let done = 0

    for (let i = 0; i < videos.length; i++) {
      const v = videos[i]
      if (v.status !== 'pending') continue

      setVideos(prev => prev.map((p,j) => j===i ? {...p, status:'importing'} : p))

      try {
        // Generate embeddable Drive URL
        const driveEmbedUrl   = `https://drive.google.com/file/d/${v.driveFileId}/preview`
        const driveLinkUrl    = `https://drive.google.com/file/d/${v.driveFileId}/view`

        // Check if exercise already exists (fuzzy match)
        const match = fuzzyMatch(v.exerciseName, existingEx)

        if (match) {
          // Update existing exercise with Drive video info
          await supabase.from('exercises').update({
            video_url:          driveEmbedUrl,
            drive_file_id:      v.driveFileId,
            drive_thumbnail:    v.thumbnailLink || null,
            drive_link:         driveLinkUrl,
          }).eq('id', match.id)
          setVideos(prev => prev.map((p,j) => j===i ? {...p, status:'updated'} : p))
        } else {
          // Create new exercise record
          await supabase.from('exercises').insert({
            coach_id:           user?.id,
            name:               v.exerciseName,
            muscles:            v.muscles,
            equipment:          'Other',
            difficulty:         'Beginner',
            tags:               [],
            movement_pattern:   v.movementPattern,
            video_url:          driveEmbedUrl,
            drive_file_id:      v.driveFileId,
            drive_thumbnail:    v.thumbnailLink || null,
            drive_link:         driveLinkUrl,
          })
          setVideos(prev => prev.map((p,j) => j===i ? {...p, status:'done'} : p))
        }
      } catch (err: any) {
        setVideos(prev => prev.map((p,j) => j===i ? {...p, status:'error', error: err.message} : p))
      }

      done++
      setProgress(p => ({ ...p, done }))
    }

    setStep('done')
  }

  const stats = {
    pending: videos.filter(v=>v.status==='pending').length,
    done:    videos.filter(v=>v.status==='done').length,
    updated: videos.filter(v=>v.status==='updated').length,
    error:   videos.filter(v=>v.status==='error').length,
  }

  const muscleColor: Record<string,string> = {
    'Core':t.red,'Back':t.teal,'Chest':t.orange,'Shoulders':t.purple,
    'Biceps':'#60a5fa','Triceps':'#f472b6','Quads':t.green,
    'Hamstrings':t.yellow,'Glutes':t.orange,'Forearms':t.textMuted,
    'Full Body':t.teal,'Cardio':t.green,
  }

  return (
    <>      <style>{`*{box-sizing:border-box;margin:0;padding:0;}body{background:${t.bg};}input,select{color-scheme:dark;}`}</style>
      <div style={{ background:t.bg, minHeight:'100vh', fontFamily:"'DM Sans',sans-serif", color:t.text }}>

        {/* Top bar */}
        <div style={{ background:t.surface, borderBottom:'1px solid '+t.border, padding:'0 28px', display:'flex', alignItems:'center', height:60, gap:12 }}>
          <button onClick={()=>router.push('/dashboard/coach/exercises')} style={{ background:'none', border:'none', color:t.textMuted, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:"'DM Sans',sans-serif" }}>← Back</button>
          <div style={{ width:1, height:28, background:t.border }} />
          <div style={{ fontSize:14, fontWeight:800 }}>📁 Drive Video Importer</div>
          <div style={{ flex:1 }} />
          {step === 'review' && (
            <button onClick={runImport}
              style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ⚡ Import {stats.pending} Videos
            </button>
          )}
          {step === 'done' && (
            <button onClick={()=>router.push('/dashboard/coach/exercises')}
              style={{ background:'linear-gradient(135deg,'+t.green+','+t.green+'cc)', border:'none', borderRadius:9, padding:'8px 20px', fontSize:13, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              ✓ Done — View Library
            </button>
          )}
        </div>

        <div style={{ maxWidth:980, margin:'0 auto', padding:28 }}>

          {/* ── CONNECT SCREEN ── */}
          {(step === 'connect') && (
            <div style={{ textAlign:'center', padding:'80px 40px' }}>
              <div style={{ fontSize:56, marginBottom:20 }}>📁</div>
              <div style={{ fontSize:24, fontWeight:900, marginBottom:12 }}>Import from Google Drive</div>
              <div style={{ fontSize:14, color:t.textMuted, marginBottom:8, lineHeight:1.7, maxWidth:480, margin:'0 auto 32px' }}>
                Connects to your SRG Fit exercise video library on Google Drive.<br/>
                Videos stay in Drive — we just store the file IDs in Supabase.
              </div>
              <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:40 }}>
                {['11 muscle group folders','1000+ videos','No upload costs','Fast Google CDN'].map(f=>(
                  <div key={f} style={{ background:t.tealDim, border:'1px solid '+t.teal+'30', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, color:t.teal }}>{f}</div>
                ))}
              </div>
              {accessToken ? (
                <button onClick={scanDrive}
                  style={{ background:'linear-gradient(135deg,'+t.teal+','+t.teal+'cc)', border:'none', borderRadius:12, padding:'14px 36px', fontSize:15, fontWeight:800, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  🔍 Scan Exercise Library
                </button>
              ) : (
                <button onClick={connectDrive}
                  style={{ background:'white', border:'none', borderRadius:12, padding:'14px 36px', fontSize:15, fontWeight:800, color:'#111', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:10 }}>
                  <svg width="20" height="20" viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.4 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.9z"/><path fill="#34A853" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.8 1.1 7.9 3l5.7-5.7C34.4 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#FBBC05" d="M24 44c5.2 0 9.9-1.9 13.4-5l-6.2-5.2C29.2 35.4 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.3C9.7 36.4 16.3 44 24 44z"/><path fill="#EA4335" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.1-2.2 4-4 5.4l.1-.1 6.2 5.2C37.3 41 44 36 44 24c0-1.3-.1-2.7-.4-3.9z"/></svg>
                  Connect Google Account
                </button>
              )}
              {accessToken && (
                <p style={{ fontSize:12, color:t.green, marginTop:16 }}>✓ Google account connected</p>
              )}
            </div>
          )}

          {/* ── SCANNING SCREEN ── */}
          {step === 'scanning' && (
            <div style={{ textAlign:'center', padding:'80px 40px' }}>
              <div style={{ fontSize:48, marginBottom:20, animation:'spin 1s linear infinite' }}>⏳</div>
              <div style={{ fontSize:20, fontWeight:800, marginBottom:8 }}>Scanning Drive folders...</div>
              <div style={{ fontSize:13, color:t.teal }}>{progress.folder || 'Connecting...'}</div>
              <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
            </div>
          )}

          {/* ── IMPORTING PROGRESS ── */}
          {step === 'importing' && (
            <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, padding:28, marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ fontSize:15, fontWeight:800 }}>Linking videos...</div>
                <div style={{ fontSize:14, color:t.teal, fontWeight:700 }}>{progress.done} / {progress.total}</div>
              </div>
              <div style={{ background:t.surfaceHigh, borderRadius:8, height:12, overflow:'hidden' }}>
                <div style={{ height:'100%', background:'linear-gradient(90deg,'+t.teal+','+t.orange+')', borderRadius:8, transition:'width 0.3s ease',
                  width: progress.total > 0 ? (progress.done/progress.total*100)+'%' : '0%' }} />
              </div>
              <div style={{ fontSize:12, color:t.textMuted, marginTop:8 }}>No uploads — just storing Drive file IDs in Supabase</div>
            </div>
          )}

          {/* ── REVIEW TABLE ── */}
          {(step === 'review' || step === 'importing' || step === 'done') && videos.length > 0 && (
            <>
              {/* Stats row */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
                {[
                  ['Total',    videos.length,  t.text,   t.border],
                  ['New',      stats.done,     t.green,  t.green+'30'],
                  ['Updated',  stats.updated,  t.orange, t.orange+'30'],
                  ['Errors',   stats.error,    t.red,    t.red+'30'],
                ].map(([label,val,color,border]) => (
                  <div key={label as string} style={{ background:t.surface, border:'1px solid '+(border as string), borderRadius:12, padding:'14px 18px' }}>
                    <div style={{ fontSize:22, fontWeight:900, color: color as string }}>{val}</div>
                    <div style={{ fontSize:11, color:t.textMuted, fontWeight:700 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Video grid preview */}
              <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:16, overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid '+t.border, display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <div style={{ fontSize:13, fontWeight:800 }}>{videos.length} videos found across 11 muscle groups</div>
                  <div style={{ fontSize:12, color:t.textMuted }}>Videos stay in Google Drive · Only IDs stored in Supabase</div>
                </div>

                {/* Column headers */}
                <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 130px 80px 80px', gap:12, padding:'8px 20px', borderBottom:'1px solid '+t.border, background:t.surfaceUp }}>
                  {['','Exercise Name','Muscle Group','Folder','Status'].map(h => (
                    <div key={h} style={{ fontSize:10, fontWeight:800, color:t.textMuted, textTransform:'uppercase', letterSpacing:'0.08em' }}>{h}</div>
                  ))}
                </div>

                <div style={{ maxHeight:560, overflowY:'auto' }}>
                  {videos.map((v,i) => {
                    const statusColor = v.status==='done'?t.green : v.status==='updated'?t.orange : v.status==='error'?t.red : v.status==='importing'?t.teal : t.textMuted
                    const statusLabel = v.status==='done'?'✓ New' : v.status==='updated'?'↑ Updated' : v.status==='error'?'✗ Error' : v.status==='importing'?'...' : 'Ready'
                    return (
                      <div key={v.driveFileId} style={{ display:'grid', gridTemplateColumns:'40px 1fr 130px 80px 80px', gap:12, padding:'8px 20px', borderBottom:'1px solid '+t.border+'80', alignItems:'center', background: v.status==='error' ? t.redDim : 'transparent' }}>
                        {/* Thumbnail */}
                        <div style={{ width:36, height:28, borderRadius:4, overflow:'hidden', background:t.surfaceHigh, flexShrink:0 }}>
                          {v.thumbnailLink
                            ? <img src={v.thumbnailLink} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🎬</div>
                          }
                        </div>
                        {/* Exercise name */}
                        <div style={{ fontSize:12, fontWeight:700, color:t.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.exerciseName}</div>
                        {/* Muscles */}
                        <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                          {v.muscles.slice(0,2).map(m => (
                            <span key={m} style={{ background:(muscleColor[m]||t.teal)+'18', border:'1px solid '+(muscleColor[m]||t.teal)+'30', borderRadius:4, padding:'1px 5px', fontSize:9, fontWeight:700, color:muscleColor[m]||t.teal }}>{m}</span>
                          ))}
                        </div>
                        {/* Folder */}
                        <div style={{ fontSize:10, color:t.textMuted, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.folderName}</div>
                        {/* Status */}
                        <div style={{ fontSize:11, fontWeight:700, color: statusColor }}>{statusLabel}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </>
  )
}
