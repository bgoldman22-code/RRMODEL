import fs from 'fs'
import path from 'path'
import { getCurrentSeason, detectCurrentWeek } from './_lib/schedule.mjs'

// 04-predict-spread.mjs
// STUB: Uses V3/V4 spread model (EPA + success + explosive + pressure + RZ)
// TODO: Replace with actual model call or integrate existing nfl-model-v3 spread predictions

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')
const currentSeason = getCurrentSeason()
const currentWeek = detectCurrentWeek()

console.log(`🏈 Generating spread predictions for ${currentSeason} Week ${currentWeek} (V3/V4 model)`)

// TODO: Load actual spread model from nfl-model-v3/scripts/04-predict-games.mjs
// or integrate with existing R pipeline output

// For now, use current season games from features
const featuresPath = path.join(repoRoot, `nfl-model-v3/data/processed-features/features_${currentSeason}.json`)
console.log(`Looking for features at: ${featuresPath} (Season ${currentSeason}, Week ${currentWeek})`)
if (!fs.existsSync(featuresPath)) {
  console.error(`Missing features_${currentSeason}.json at`, featuresPath)
  const dir = path.dirname(featuresPath)
  if (fs.existsSync(dir)) {
    console.log('Available files:', fs.readdirSync(dir))
  }
  process.exit(1)
}

const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
const spreads = {}

for (const f of features) {
  const gid = f.game_id
  // Simple linear spread model (stub - replace with actual V3/V4 weights)
  const epa_diff = f.epa_offense_diff || 0
  const third_down_diff = f.third_down_diff || 0
  const pressure_diff = f.pressure_diff || 0
  const explosive_diff = f.explosive_diff || 0
  
  // Stub formula (replace with actual V3/V4 model)
  const model_line = epa_diff * 35 + third_down_diff * 15 + pressure_diff * 10 + explosive_diff * 12
  
  // Stub vegas line (TODO: fetch from odds API)
  const vegas_line = model_line + (Math.random() - 0.5) * 3
  const edge = Math.abs(model_line - vegas_line)
  const confidence = 0.50 + Math.min(edge / 10, 0.15) // simple confidence scaling
  
  spreads[gid] = {
    game_id: gid,
    home_team: f.home_team,
    away_team: f.away_team,
    model_line,
    vegas_line,
    vegas_line_price: -110,
    edge,
    confidence,
    kickoff: null, // TODO: add from schedule
    season: f.season,
    week: f.week
  }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'spreads_raw.json'), JSON.stringify(spreads, null, 2))
console.log(`✅ Saved ${Object.keys(spreads).length} spread predictions`)
