'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'

// Fallback only — the Edge Function returns the real total in `data.totalBatches`
// (Math.ceil(exercise_count / 40)). 30 = ceil(1163 / 40) at time of writing.
const TOTAL_BATCHES = 30

export default function EnrichExercisesPage() {
  const [running,  setRunning]  = useState(false)
  const [done,     setDone]     = useState(false)
  const [log,      setLog]      = useState<string[]>([])
  const [progress, setProgress] = useState(0)
  const supabase = createClient()

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function getToken(): Promise<string | null> {
    // Always refresh session to get a fresh token
    const { data } = await supabase.auth.refreshSession()
    return data.session?.access_token ?? null
  }

  async function runEnrichment() {
    setRunning(true)
    setDone(false)
    setLog([])
    setProgress(0)

    const fnUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enrich-exercises`

    let batch = 0
    let totalUpdated = 0
    let totalSkipped = 0

    while (true) {
      addLog(`Batch ${batch + 1}/${TOTAL_BATCHES} — calling Claude...`)

      // Refresh token before every batch
      const token = await getToken()
      if (!token) {
        addLog('ERROR: Could not refresh session — please reload and try again')
        break
      }

      try {
        const res = await fetch(fnUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ batch }),
        })
        const data = await res.json()
        if (!res.ok || data.error) {
          addLog(`ERROR on batch ${batch + 1}: ${data.error || res.statusText}`)
          break
        }
        totalUpdated += data.updated ?? 0
        totalSkipped += data.skipped ?? 0
        addLog(`  ✓ Updated: ${data.updated}, Skipped: ${data.skipped}`)
        setProgress(Math.round(((batch + 1) / (data.totalBatches ?? TOTAL_BATCHES)) * 100))
        if (data.done) {
          addLog(`\nAll done! Total updated: ${totalUpdated}, skipped: ${totalSkipped}`)
          setDone(true)
          break
        }
        batch++
        await new Promise(r => setTimeout(r, 800))
      } catch (err: any) {
        addLog(`EXCEPTION on batch ${batch + 1}: ${err.message}`)
        break
      }
    }
    setRunning(false)
  }

  const t = {
    bg: '#080810', surface: '#12121f', border: '#2a2a3d',
    teal: '#00C9B1', tealDim: '#00C9B11a', text: '#f0f0ff',
    textMuted: '#8888aa', green: '#4caf50', red: '#f44336',
  }

  return (
    <div style={{ minHeight:'100vh', background:t.bg, color:t.text, fontFamily:"'DM Sans',sans-serif", padding:32, maxWidth:720, margin:'0 auto' }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:11, color:t.textMuted, marginBottom:4, textTransform:'uppercase', letterSpacing:'0.1em' }}>Coach Admin</div>
        <h1 style={{ fontSize:22, fontWeight:900, margin:0 }}>🤖 AI Exercise Enrichment</h1>
        <p style={{ fontSize:13, color:t.textMuted, marginTop:8, lineHeight:1.6 }}>
          Runs all exercises through Claude in batches of 40. Fixes names, muscles, movement patterns, equipment, and adds a description to every exercise. Takes about 15-20 minutes total.
        </p>
      </div>

      {(running || done) && (
        <div style={{ marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12, color:t.textMuted }}>
            <span>{done ? 'Complete!' : 'Running...'}</span>
            <span>{progress}%</span>
          </div>
          <div style={{ background:t.surface, borderRadius:999, height:8, border:'1px solid '+t.border }}>
            <div style={{ width:`${progress}%`, height:'100%', borderRadius:999, background:`linear-gradient(90deg,${t.teal},${t.teal}cc)`, transition:'width 0.4s ease' }}/>
          </div>
        </div>
      )}

      <button onClick={runEnrichment} disabled={running}
        style={{
          background: running ? t.surface : `linear-gradient(135deg,${t.teal},${t.teal}cc)`,
          border: running ? '1px solid '+t.border : 'none',
          borderRadius:12, padding:'14px 28px', fontSize:15, fontWeight:800,
          color: running ? t.textMuted : '#000', cursor: running ? 'default' : 'pointer',
          fontFamily:"'DM Sans',sans-serif", marginBottom:24,
        }}>
        {running ? '⏳ Running...' : done ? '✓ Run Again' : '🚀 Start Enrichment'}
      </button>

      {log.length > 0 && (
        <div style={{ background:t.surface, border:'1px solid '+t.border, borderRadius:14, padding:16, fontFamily:'monospace', fontSize:12, lineHeight:1.8, maxHeight:480, overflowY:'auto' }}>
          {log.map((line, i) => (
            <div key={i} style={{
              color: line.startsWith('ERROR') || line.startsWith('EXCEPTION') ? t.red
                   : line.includes('✓') ? t.green
                   : line.startsWith('All done') ? t.teal
                   : t.textMuted
            }}>{line}</div>
          ))}
        </div>
      )}

      {done && (
        <div style={{ marginTop:16, background:t.tealDim, border:'1px solid '+t.teal+'40', borderRadius:12, padding:16, fontSize:13, color:t.teal, fontWeight:700 }}>
          ✓ Exercise library enriched. Head to the exercise library to check the results.
        </div>
      )}
    </div>
  )
}