import fs from 'fs'
import path from 'path'
import { buildMLDataset } from './_lib/ml_features.mjs'
import { sigmoid, logit } from './_lib/metrics.mjs'
import { getCurrentSeason, detectCurrentWeek } from './_lib/schedule.mjs'

// 12-predict-ml-direct.mjs
// Uses trained ML model to predict game outcomes for current/upcoming week
// Output: ml_probs.json with calibrated probabilities per game

const repoRoot = process.cwd()
const currentSeason = getCurrentSeason()
const currentWeek = detectCurrentWeek()

console.log(`🎯 Predicting ML for ${currentSeason} Week ${currentWeek}`)

// Load trained models
const mlDirect = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_direct.json'), 'utf8'))
const stackModel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_stack.json'), 'utf8'))
const calibModel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_calibration.json'), 'utf8'))

const cfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/config.json'), 'utf8'))

// Helper: predict p_direct from feature row
function predictDirect(x, model) {
  const feats = model.feats
  const xVec = feats.map(f => Number(x[f] || 0))
  const xStd = xVec.map((v,i)=> (v - model.mean[i]) / model.std[i])
  const z = xStd.reduce((s,v,i)=>s + v * model.w[i], 0) + model.b
  return sigmoid(z)
}

// Use current season games
const ds = buildMLDataset([currentSeason])

console.log(`Predicting ML for ${ds.length} games in ${currentSeason} Week ${currentWeek}`)

const predictions = {}
for (const r of ds) {
  const gid = r.meta.game_id
  const p_direct = predictDirect(r.x, mlDirect)
  
  // Compute spread-based prior
  const spread_proxy = (r.x.epa_offense_diff || 0) * 35
  const p_prior = Math.min(Math.max(0.53 + 0.025 * spread_proxy, 0.02), 0.98)
  
  // Stack
  let p_stack
  if (stackModel.method === 'blend') {
    const lam = stackModel.lambda
    p_stack = lam * p_direct + (1-lam) * p_prior
  } else {
    const w = stackModel.w
    const b = stackModel.b
    p_stack = sigmoid(p_direct * w[0] + p_prior * w[1] + b)
  }
  
  // Calibrate
  const logit_stack = logit(Math.min(Math.max(p_stack, 1e-6), 1-1e-6))
  const p_final = sigmoid(calibModel.a * logit_stack + calibModel.b)
  
  // Clamp
  const probCap = cfg.ml.prob_cap || [0.02, 0.98]
  const p_clamped = Math.min(Math.max(p_final, probCap[0]), probCap[1])
  
  // Compute edge (need market odds - stub for now)
  const homeOdds = p_clamped > 0.5 ? -150 : 150 // stub
  const awayOdds = p_clamped > 0.5 ? 130 : -130 // stub
  const impliedHome = homeOdds < 0 ? Math.abs(homeOdds) / (Math.abs(homeOdds) + 100) : 100 / (homeOdds + 100)
  const edge = (p_clamped - impliedHome) * 100
  
  predictions[gid] = {
    game_id: gid,
    home_team: r.meta.home_team,
    away_team: r.meta.away_team,
    kickoff: null, // TODO: add from schedule
    p_direct,
    p_prior,
    p_stack,
    p_final: p_clamped,
    home_price: homeOdds,
    away_price: awayOdds,
    edge,
    season: r.meta.season,
    week: r.meta.week
  }
}

const outDir = path.join(repoRoot, 'nfl-model-v4.1/output')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'ml_probs.json'), JSON.stringify(predictions, null, 2))
console.log(`✅ Saved ${Object.keys(predictions).length} ML predictions to nfl-model-v4.1/output/ml_probs.json`)
