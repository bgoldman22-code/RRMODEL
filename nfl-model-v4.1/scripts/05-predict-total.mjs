import fs from 'fs'
import path from 'path'
import { getCurrentSeason, detectCurrentWeek } from './_lib/schedule.mjs'

// 05-predict-total.mjs
// STUB: Uses V3 total projection (EPA_sum + pace estimator)
// TODO: Replace with actual V3 total model

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')
const currentSeason = getCurrentSeason()
const currentWeek = detectCurrentWeek()

console.log(`🏈 Generating total predictions for ${currentSeason} Week ${currentWeek} (V3 model)`)

// Load features
const featuresPath = path.join(repoRoot, `nfl-model-v3/data/processed-features/features_${currentSeason}.json`)
if (!fs.existsSync(featuresPath)) {
  console.error(`Missing features_${currentSeason}.json`)
  process.exit(1)
}

const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))
const totals = {}

for (const f of features) {
  const gid = f.game_id
  
  // Simple total model (stub - replace with actual V3 model)
  const home_epa = f.home_epa_offense || 0
  const away_epa = f.away_epa_offense || 0
  const pace_factor = 1.0 // TODO: add pace from features
  
  // Stub formula (replace with actual V3 total model)
  const model_total = 44 + (home_epa + away_epa) * 100 * pace_factor
  
  // Stub vegas total (TODO: fetch from odds API)
  const vegas_total = model_total + (Math.random() - 0.5) * 5
  const edge = Math.abs(model_total - vegas_total)
  const confidence = 0.50 + Math.min(edge / 8, 0.12)
  
  totals[gid] = {
    game_id: gid,
    home_team: f.home_team,
    away_team: f.away_team,
    model_total,
    vegas_total,
    vegas_total_price: -110,
    edge,
    confidence,
    kickoff: null,
    season: f.season,
    week: f.week
  }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'totals_raw.json'), JSON.stringify(totals, null, 2))
console.log(`✅ Saved ${Object.keys(totals).length} total predictions`)
