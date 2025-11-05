import fs from 'fs'
import path from 'path'

// 12-make-public-bundle.mjs
// Merges spread/total/ML predictions into a single bundle matching current UI schema

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')

// Load individual prediction outputs
const spreadsPath = path.join(outDir, 'spreads_raw.json')
const totalsPath = path.join(outDir, 'totals_raw.json')
const mlPath = path.join(outDir, 'ml_probs.json')

if (!fs.existsSync(spreadsPath)) {
  console.error('Missing spreads_raw.json - run 04-predict-spread.mjs first')
  process.exit(1)
}
if (!fs.existsSync(totalsPath)) {
  console.error('Missing totals_raw.json - run 05-predict-total.mjs first')
  process.exit(1)
}
if (!fs.existsSync(mlPath)) {
  console.error('Missing ml_probs.json - run 12-predict-ml-direct.mjs first')
  process.exit(1)
}

const spreads = JSON.parse(fs.readFileSync(spreadsPath, 'utf8'))
const totals = JSON.parse(fs.readFileSync(totalsPath, 'utf8'))
const ml = JSON.parse(fs.readFileSync(mlPath, 'utf8'))

// Build bundle matching current UI schema
const rows = []
const gameIds = new Set([...Object.keys(spreads), ...Object.keys(totals), ...Object.keys(ml)])

for (const gid of gameIds) {
  const spr = spreads[gid]
  const tot = totals[gid]
  const mlData = ml[gid]
  
  if (!spr || !tot || !mlData) {
    console.warn(`Missing data for game ${gid}`)
    continue
  }
  
  // Determine moneyline pick (use calibrated p_final)
  const homeProb = mlData.p_final || 0.5
  const mlTeam = homeProb > 0.5 ? spr.home_team : spr.away_team
  const mlPrice = homeProb > 0.5 ? (mlData.home_price || -110) : (mlData.away_price || -110)
  const mlConf = Math.max(homeProb, 1 - homeProb) // confidence is the higher probability
  
  // Spread pick
  const spreadSide = spr.model_line > 0 ? 1 : -1 // 1 = away covers, -1 = home covers
  const spreadTeam = spreadSide === -1 ? spr.home_team : spr.away_team
  const spreadLine = Math.abs(spr.model_line)
  const spreadPrice = spr.vegas_line_price || -110
  const spreadConf = spr.confidence || 0.55
  
  // Total pick
  const totalSide = tot.model_total > tot.vegas_total ? 'over' : 'under'
  const totalValue = tot.vegas_total
  const totalPrice = tot.vegas_total_price || -110
  const totalConf = tot.confidence || 0.55
  
  rows.push({
    id: gid,
    matchup: `${spr.away_team} @ ${spr.home_team}`,
    homeTeam: spr.home_team,
    awayTeam: spr.away_team,
    kickoff: spr.kickoff || tot.kickoff || mlData.kickoff,
    
    moneyline: {
      team: mlTeam,
      price: mlPrice,
      confidence: mlConf,
      edge: mlData.edge || 0,
      p_home: homeProb
    },
    
    spread: {
      side: spreadSide,
      team: spreadTeam,
      line: spreadLine,
      price: spreadPrice,
      confidence: spreadConf,
      edge: spr.edge || 0,
      model_line: spr.model_line,
      vegas_line: spr.vegas_line
    },
    
    total: {
      side: totalSide,
      total: totalValue,
      price: totalPrice,
      confidence: totalConf,
      edge: tot.edge || 0,
      model_total: tot.model_total,
      vegas_total: tot.vegas_total
    }
  })
}

const bundle = {
  meta: {
    model: 'NFL-V4.1',
    updated_at: new Date().toISOString(),
    games: rows.length,
    spread_source: 'V3/V4 EPA Model',
    total_source: 'V3 Pace+EPA Model',
    ml_source: 'Direct ML Logistic (Platt Calibrated)'
  },
  rows
}

// Write bundle
const bundlePath = path.join(outDir, 'bundle.json')
fs.writeFileSync(bundlePath, JSON.stringify(bundle, null, 2))
console.log(`✅ Created bundle with ${rows.length} games at ${bundlePath}`)
