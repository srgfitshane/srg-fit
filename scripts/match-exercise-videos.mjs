// Match Supabase bucket files to exercise DB records and generate update SQL
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import { readFileSync } from 'fs'

// Parse .env.local manually
const envFile = readFileSync('.env.local', 'utf-8')
const env = Object.fromEntries(envFile.split('\n').filter(l=>l.includes('=')).map(l=>{
  const [k,...v]=l.split('='); return [k.trim(), v.join('=').trim().replace(/^["']|["']$/g,'')]
}))

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing env vars. Ensure .env.local has NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/\s*\(\d+\)\s*/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchScore(a, b) {
  const wa = new Set(a.split(' ').filter(w => w.length > 2))
  const wb = new Set(b.split(' ').filter(w => w.length > 2))
  if (wa.size === 0 || wb.size === 0) return 0
  let matches = 0
  for (const w of wa) if (wb.has(w)) matches++
  return matches / Math.max(wa.size, wb.size)
}

async function run() {
  const FOLDERS = ['Abdominals','Back','Biceps','Cardio-Functional','Chest',
    'Forearms','Powerlifting','Stretching','Triceps']
  // Note: actual bucket folders confirmed from DB query

  const allFiles = []
  for (const folder of FOLDERS) {
    const { data } = await supabase.storage.from('exercise-videos').list(folder, { limit: 500 })
    if (data) {
      for (const f of data) {
        if (f.name && f.name.endsWith('.mp4')) {
          allFiles.push({ path: `${folder}/${f.name}`, folder, filename: f.name })
        }
      }
    }
  }
  console.log(`Found ${allFiles.length} videos in bucket`)

  const { data: exercises } = await supabase.from('exercises').select('id, name, video_url').order('name')
  console.log(`Found ${exercises.length} exercises in DB`)

  const BUCKET_BASE = `${SUPABASE_URL}/storage/v1/object/public/exercise-videos`
  const updates = [], noMatch = [], alreadyMigrated = []

  for (const ex of exercises) {
    if (ex.video_url && ex.video_url.includes('supabase') && ex.video_url.includes('exercise-videos')) {
      alreadyMigrated.push(ex.name); continue
    }
    const exNorm = normalize(ex.name)
    let bestScore = 0, bestFile = null

    for (const f of allFiles) {
      const fileNorm = normalize(f.filename.replace('.mp4', ''))
      if (fileNorm === exNorm) { bestScore = 1; bestFile = f; break }
      const score = matchScore(exNorm, fileNorm)
      if (score > bestScore) { bestScore = score; bestFile = f }
    }

    if (bestFile && bestScore >= 0.6) {
      const url = `${BUCKET_BASE}/${folder_encode(bestFile.folder)}/${file_encode(bestFile.filename)}`
      updates.push({ id: ex.id, name: ex.name, file: bestFile.path, score: bestScore.toFixed(2), url })
    } else {
      noMatch.push({ name: ex.name, score: bestScore.toFixed(2), closest: bestFile?.path || 'none' })
    }
  }

  console.log(`\n✅ Matched: ${updates.length}`)
  console.log(`⚠️  Already migrated: ${alreadyMigrated.length}`)
  console.log(`❌ No match (score < 0.6): ${noMatch.length}`)

  fs.writeFileSync('scripts/exercise-no-match.json', JSON.stringify(noMatch, null, 2))
  fs.writeFileSync('scripts/exercise-matched.json', JSON.stringify(updates.map(u=>({name:u.name,file:u.file,score:u.score})), null, 2))
  console.log('\nReview scripts/exercise-matched.json then run with --apply to update DB')

  if (process.argv.includes('--apply')) {
    console.log('\nApplying...')
    let done = 0
    for (const u of updates) {
      await supabase.from('exercises').update({ video_url: u.url }).eq('id', u.id)
      if (++done % 50 === 0) console.log(`  ${done}/${updates.length}`)
    }
    console.log(`✅ Done: ${done} exercises updated to Supabase Storage URLs`)
  }
}

const folder_encode = s => s.split('/').map(encodeURIComponent).join('/')
const file_encode = s => encodeURIComponent(s)

run().catch(console.error)
