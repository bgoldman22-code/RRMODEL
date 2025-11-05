import fs from 'fs'
import path from 'path'
import { buildMLDataset } from './_lib/ml_features.mjs'
import { sigmoid, logit, auc, brier } from './_lib/metrics.mjs'

// 11-evaluate-holdout.mjs
// Evaluates the full ML pipeline on the 2024 holdout set.
// Computes AUC, Brier, monotonicity, and ROI.
// Gates ML enabling based on acceptance criteria.

const repoRoot = process.cwd()
const cfgPath = path.join(repoRoot, 'nfl-model-v4.1/config.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const holdout = cfg.ml.holdout_year || 2024

// Load trained models
const mlDirect = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_direct.json'), 'utf8'))
const stackModel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_stack.json'), 'utf8'))
const calibModel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_calibration.json'), 'utf8'))

// Build holdout dataset
const ds = buildMLDataset([holdout])
console.log(`Holdout ${holdout} dataset: ${ds.length} rows`)

// Predict p_final for each row
function predictDirect(x, model) {
  const feats = model.feats
  const xVec = feats.map(f => Number(x[f] || 0))
  const xStd = xVec.map((v,i)=> (v - model.mean[i]) / model.std[i])
  const z = xStd.reduce((s,v,i)=>s + v * model.w[i], 0) + model.b
  return sigmoid(z)
}

const predictions = []
for (const r of ds) {
  const p_direct = predictDirect(r.x, mlDirect)
  const spread_proxy = (r.x.epa_offense_diff || 0) * 35
  const p_prior = Math.min(Math.max(0.53 + 0.025 * spread_proxy, 0.02), 0.98)
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
  // Clamp per prob_cap
  const probCap = cfg.ml.prob_cap || [0.02, 0.98]
  const p_clamped = Math.min(Math.max(p_final, probCap[0]), probCap[1])
  predictions.push({ ...r, p_direct, p_prior, p_stack, p_final: p_clamped })
}

const yTrue = predictions.map(p => p.y)
const yPred = predictions.map(p => p.p_final)

const aucVal = auc(yTrue, yPred)
const brierVal = brier(yTrue, yPred)
console.log(`Holdout AUC: ${aucVal.toFixed(4)}`)
console.log(`Holdout Brier: ${brierVal.toFixed(4)}`)

// Compute monotonicity (simple bucket check: higher prob -> higher win rate)
const buckets = [0.0, 0.45, 0.5, 0.55, 0.6, 1.0]
const bucketStats = []
for (let i=0; i<buckets.length-1; i++) {
  const low = buckets[i]
  const high = buckets[i+1]
  const inBucket = predictions.filter(p => p.p_final >= low && p.p_final < high)
  if (inBucket.length === 0) continue
  const wins = inBucket.filter(p => p.y === 1).length
  const wr = wins / inBucket.length
  bucketStats.push({ low, high, count: inBucket.length, wr })
}
console.log('Monotonicity buckets:')
for (const b of bucketStats) {
  console.log(`  [${b.low.toFixed(2)}, ${b.high.toFixed(2)}): ${b.count} games, WR ${(b.wr*100).toFixed(1)}%`)
}
// Simple monotonicity score: check if each bucket WR >= prev
let mono = 1.0
for (let i=1; i<bucketStats.length; i++) {
  if (bucketStats[i].wr < bucketStats[i-1].wr) mono = 0.0
}
console.log(`Monotonicity: ${mono.toFixed(2)}`)

// Compute ROI (simple: assume flat 1u bets at -110 odds)
// For each bet with p_final >= ev_threshold, compute EV and track ROI
const evThreshold = cfg.ml.ev_threshold || 0.03
const maxLongshotOdds = cfg.ml.max_longshot_odds || 4.0
let totalBets = 0, totalWins = 0, totalProfit = 0
for (const p of predictions) {
  const impliedOdds = 1 / p.p_final
  if (impliedOdds > maxLongshotOdds) continue // skip longshots
  const ev = p.p_final * 0.909 - (1 - p.p_final) * 1.0 // assume -110
  if (ev >= evThreshold) {
    totalBets++
    if (p.y === 1) {
      totalWins++
      totalProfit += 0.909
    } else {
      totalProfit -= 1.0
    }
  }
}
const roi = totalBets > 0 ? totalProfit / totalBets : 0
console.log(`Bets placed: ${totalBets}, Wins: ${totalWins}, ROI: ${(roi*100).toFixed(2)}%`)

// Acceptance gates (user-defined): AUC ≥0.68, Brier ≤0.235, monotonicity ≥0.60, ROI ≥ -0.05
const acceptanceGates = {
  auc: 0.68,
  brier: 0.235,
  monotonicity: 0.60,
  roi: -0.05
}
const pass = aucVal >= acceptanceGates.auc && brierVal <= acceptanceGates.brier && mono >= acceptanceGates.monotonicity && roi >= acceptanceGates.roi
console.log(`\nAcceptance gates: AUC≥${acceptanceGates.auc}, Brier≤${acceptanceGates.brier}, Mono≥${acceptanceGates.monotonicity}, ROI≥${acceptanceGates.roi}`)
console.log(`Pass: ${pass}`)

// Save results
const results = {
  holdout_year: holdout,
  auc: aucVal,
  brier: brierVal,
  monotonicity: mono,
  bets: totalBets,
  wins: totalWins,
  roi,
  pass,
  acceptance_gates: acceptanceGates
}
const outPath = path.join(repoRoot, 'nfl-model-v4.1/data/models/holdout_results.json')
fs.writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`Saved results to ${outPath}`)

if (pass) {
  console.log('\n✅ ML model passed acceptance gates. You can now set config.ml.enabled = true')
} else {
  console.log('\n❌ ML model did NOT pass acceptance gates. Do not enable ML bets yet.')
}
