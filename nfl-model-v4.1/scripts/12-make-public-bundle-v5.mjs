import fs from 'fs'
import path from 'path'
import { getCurrentSeason, detectCurrentWeek, getSeasonDisplay } from './_lib/schedule.mjs'

// 12-make-public-bundle-v5.mjs
// V5 Hybrid Bundle: Best-of-breed model composition
// - Spread: Poisson EPA (from 04-predict-spread.mjs)
// - Total: Quantile blend (from 05b-predict-total-quantile.mjs)
// - Moneyline: OMITTED (not profitable, awaiting better model)

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')
const currentSeason = getCurrentSeason()
const currentWeek = detectCurrentWeek()
const seasonDisplay = getSeasonDisplay()

console.log(`🔧 Building V5 hybrid bundle for ${seasonDisplay} Week ${currentWeek}`)

// Load predictions
const spreadsPath = path.join(outDir, 'spreads_raw.json')
const totalsPath = path.join(outDir, 'totals_quantile.json')

if (!fs.existsSync(spreadsPath)) {
  console.error('Missing spreads_raw.json - run 04-predict-spread.mjs first')
  process.exit(1)
}

if (!fs.existsSync(totalsPath)) {
  console.error('Missing totals_quantile.json - run 05b-predict-total-quantile.mjs first')
  process.exit(1)
}

const spreads = JSON.parse(fs.readFileSync(spreadsPath, 'utf8'))
const totals = JSON.parse(fs.readFileSync(totalsPath, 'utf8'))

// Merge into public schema
const rows = []

for (const [gid, spread] of Object.entries(spreads)) {
  const total = totals[gid]
  
  if (!total) {
    console.warn(`Missing total for game ${gid}`)
    continue
  }
  
  // Determine spread pick (home or away)
  const spreadSide = spread.model_line > spread.vegas_line ? 'home' : 'away'
  const spreadTeam = spreadSide === 'home' ? spread.home_team : spread.away_team
  const spreadLine = Math.abs(spread.vegas_line)
  
  // Determine total pick (over or under)
  const totalSide = total.model_total > total.vegas_total ? 'over' : 'under'
  
  rows.push({
    matchup: `${spread.away_team} @ ${spread.home_team}`,
    homeTeam: spread.home_team,
    awayTeam: spread.away_team,
    kickoff: spread.kickoff || null, // TODO: add from schedule
    season: currentSeason,
    week: currentWeek,
    
    // Spread prediction (Poisson EPA model)
    spread: {
      side: spreadSide,
      team: spreadTeam,
      line: spreadLine,
      price: spread.vegas_line_price || -110,
      confidence: spread.confidence,
      edge: spread.edge,
      model: 'poisson_epa_v3'
    },
    
    // Total prediction (Quantile blend model)
    total: {
      side: totalSide,
      total: total.vegas_total,
      price: total.vegas_total_price || -110,
      confidence: total.confidence,
      edge: total.edge,
      model_total: total.model_total,
      p25: total.p25_total,
      p50: total.p50_total,
      p75: total.p75_total,
      model: 'quantile_blend_v5'
    },
    
    // Moneyline: OMITTED (not profitable)
    moneyline: null
  })
}

// Sort by confidence (highest first)
rows.sort((a, b) => {
  const aConf = Math.max(a.spread.confidence, a.total.confidence)
  const bConf = Math.max(b.spread.confidence, b.total.confidence)
  return bConf - aConf
})

// Build bundle
const bundle = {
  meta: {
    modelVersion: 'v5',
    architecture: 'hybrid_best_of_breed',
    season: seasonDisplay,
    week: currentWeek,
    updated_at: new Date().toISOString(),
    games: rows.length,
    models: {
      spread: 'Poisson EPA V3 (+37% ROI backtested)',
      total: 'Quantile Blend V5 (25th/75th percentiles)',
      moneyline: 'Omitted (awaiting profitable model)'
    },
    notes: [
      'V5 uses best-performing model for each bet type',
      'Spread: Proven +37% ROI on 2020-2024 backtest',
      'Total: New quantile approach, replaces linear regression',
      'Moneyline: Excluded until we have stable profitable model'
    ]
  },
  rows
}

// Save bundle
fs.writeFileSync(path.join(outDir, 'bundle_v5.json'), JSON.stringify(bundle, null, 2))
console.log(`✅ Saved V5 bundle: ${rows.length} games`)
console.log(`📊 Avg spread confidence: ${(rows.reduce((s, r) => s + r.spread.confidence, 0) / rows.length * 100).toFixed(1)}%`)
console.log(`📊 Avg total confidence: ${(rows.reduce((s, r) => s + r.total.confidence, 0) / rows.length * 100).toFixed(1)}%`)
console.log(`🚫 Moneyline predictions omitted (awaiting profitable model)`)
