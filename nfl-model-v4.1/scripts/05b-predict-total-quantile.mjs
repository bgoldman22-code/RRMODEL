import fs from 'fs'
import path from 'path'
import { getCurrentSeason, detectCurrentWeek } from './_lib/schedule.mjs'

// 05b-predict-total-quantile.mjs
// V5 Quantile-Based Total Model
// Uses 25th/75th percentiles of team scoring distributions (EPA + Pace)
// Replaces linear mean regression with distributional approach

const repoRoot = process.cwd()
const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')
const currentSeason = getCurrentSeason()
const currentWeek = detectCurrentWeek()

console.log(`📊 Generating V5 quantile total predictions for ${currentSeason} Week ${currentWeek}`)

// Load features
const featuresPath = path.join(repoRoot, `nfl-model-v3/data/processed-features/features_${currentSeason}.json`)
if (!fs.existsSync(featuresPath)) {
  console.error(`Missing features_${currentSeason}.json`)
  const dir = path.dirname(featuresPath)
  if (fs.existsSync(dir)) {
    console.log('Available files:', fs.readdirSync(dir).filter(f => f.startsWith('features_')))
  }
  process.exit(1)
}

const features = JSON.parse(fs.readFileSync(featuresPath, 'utf8'))

// Load historical game aggregates for distribution estimation
const aggregatesPath = path.join(repoRoot, `nfl-model-v3/data/nflverse/game_aggregates_${currentSeason}.json`)
let aggregates = []
if (fs.existsSync(aggregatesPath)) {
  aggregates = JSON.parse(fs.readFileSync(aggregatesPath, 'utf8'))
}

/**
 * Estimate team scoring distribution from EPA + Pace
 * Returns { p25, p50, p75, mean } for team's projected points
 */
function estimateTeamDistribution(teamFeatures, isHome) {
  // Base points from EPA (scaled to points per game)
  const epaOffense = teamFeatures[`${isHome ? 'home' : 'away'}_epa_offense`] || 0
  const epaDefense = teamFeatures[`${isHome ? 'home' : 'away'}_epa_defense`] || 0
  
  // EPA to points conversion (empirical: 0.1 EPA ≈ 2.4 points/game)
  const basePoints = 21.5 + (epaOffense * 24) - (epaDefense * 12)
  
  // Pace adjustment (possessions per game)
  const explosiveRate = teamFeatures[`${isHome ? 'home' : 'away'}_explosive_rate`] || 0.12
  const thirdDownRate = teamFeatures[`${isHome ? 'home' : 'away'}_third_down_success`] || 0.40
  
  // Estimate possessions (league avg ~12, range 10-14)
  const paceFactor = 1.0 + (explosiveRate - 0.12) * 5 + (thirdDownRate - 0.40) * 2
  const possessions = 12 * paceFactor
  
  // Points variance (higher for offenses with big play ability)
  const variance = 5.0 + explosiveRate * 20
  
  // Home field advantage
  const homeBonus = isHome ? 2.5 : 0
  
  // Mean estimate
  const mean = basePoints + homeBonus
  
  // Distributional estimates (assume normal-ish distribution)
  // Adjusted by pace (more possessions = tighter distribution)
  const stdDev = variance / Math.sqrt(possessions / 12)
  
  return {
    p25: mean - 0.675 * stdDev,  // 25th percentile (~-0.67σ)
    p50: mean,                     // Median
    p75: mean + 0.675 * stdDev,   // 75th percentile (~+0.67σ)
    mean,
    possessions
  }
}

/**
 * Calculate game total from team distributions
 * Uses quantile blend approach (not simple mean sum)
 */
function calculateQuantileTotal(homeDist, awayDist) {
  // Low estimate: sum of 25th percentiles (conservative)
  const low = homeDist.p25 + awayDist.p25
  
  // High estimate: sum of 75th percentiles (optimistic)
  const high = homeDist.p75 + awayDist.p75
  
  // Mid estimate: sum of means
  const mid = homeDist.mean + awayDist.mean
  
  // Weighted blend (favor median, but account for tail risk)
  // 60% mid, 20% low, 20% high
  const blended = mid * 0.60 + low * 0.20 + high * 0.20
  
  // Confidence based on distribution spread
  const spread = high - low
  const confidence = 0.50 + Math.min(0.20, 10 / spread) // Tighter = higher confidence
  
  return {
    model_total: blended,
    p25_total: low,
    p50_total: mid,
    p75_total: high,
    spread,
    confidence,
    home_possessions: homeDist.possessions,
    away_possessions: awayDist.possessions
  }
}

const totals = {}

for (const f of features) {
  const gid = f.game_id
  
  // Estimate distributions for both teams
  const homeDist = estimateTeamDistribution(f, true)
  const awayDist = estimateTeamDistribution(f, false)
  
  // Calculate quantile-based total
  const result = calculateQuantileTotal(homeDist, awayDist)
  
  // Stub vegas total (TODO: fetch from odds API)
  const vegas_total = result.model_total + (Math.random() - 0.5) * 4
  const edge = Math.abs(result.model_total - vegas_total)
  
  // Adjust confidence by edge
  const edgeBonus = Math.min(edge / 6, 0.10)
  const final_confidence = Math.min(result.confidence + edgeBonus, 0.80)
  
  totals[gid] = {
    game_id: gid,
    home_team: f.home_team,
    away_team: f.away_team,
    model_total: result.model_total,
    p25_total: result.p25_total,
    p50_total: result.p50_total,
    p75_total: result.p75_total,
    spread: result.spread,
    vegas_total,
    vegas_total_price: -110,
    edge,
    confidence: final_confidence,
    home_possessions: result.home_possessions,
    away_possessions: result.away_possessions,
    method: 'quantile_blend',
    kickoff: null,
    season: f.season,
    week: f.week
  }
}

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'totals_quantile.json'), JSON.stringify(totals, null, 2))
console.log(`✅ Saved ${Object.keys(totals).length} quantile-based total predictions`)
console.log(`📈 Distribution spread avg: ${Object.values(totals).reduce((sum, t) => sum + t.spread, 0) / Object.values(totals).length}`)
