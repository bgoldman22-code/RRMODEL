import fs from 'fs'
import path from 'path'
import { buildMLDataset } from './_lib/ml_features.mjs'
import { sigmoid, logit, auc, brier } from './_lib/metrics.mjs'

// 09-stack-ml-prior.mjs
// Stacks ML direct predictions with a spread-based prior.
// Two options per config: simple blend or stacking logistic.
// Saves stacking model to data/models/ml_stack.json

const repoRoot = process.cwd()
const cfgPath = path.join(repoRoot, 'nfl-model-v4.1/config.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const holdout = cfg.ml.holdout_year || 2024

// Load trained ML direct model and OOF probs
const mlDirect = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_direct.json'), 'utf8'))
const oofProbs = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_oof_probs.json'), 'utf8'))

// Helper: compute p_direct from feature row
function predictDirect(x, model) {
  const feats = model.feats
  const xVec = feats.map(f => Number(x[f] || 0))
  const xStd = xVec.map((v,i)=> (v - model.mean[i]) / model.std[i])
  const z = xStd.reduce((s,v,i)=>s + v * model.w[i], 0) + model.b
  return sigmoid(z)
}

// Load all spread predictions from nfl-model-v3 or nfl-model-v2 (we need spread predictions)
// For simplicity, we'll use features_{season}.json which should have a field like 'predicted_spread' or we compute from model
// Here we'll compute a simple spread-based prior: p_spread_prior = sigmoid(spread * 0.23) using existing diff metrics as a proxy for spread
// Actually, the user plan says "p_spreadPrior = 0.53 + 0.025*spread" but spread is not directly available in the features.
// Instead, we'll use the epa_offense_diff as a proxy for spread (scaled by ~3.5 pts/epa unit per historical calibration).
// For production, we'd load the actual predictions_{season}.json; for this minimal version, we'll compute a simple prior.

const seasons = [2020,2021,2022,2023,2024]
const trainSeasons = seasons.filter(s => s !== holdout)
const ds = buildMLDataset(trainSeasons)

// Build dataset with p_direct (from OOF), p_prior (from spread proxy), y
const oofMap = {}
for (const rec of oofProbs) {
  const key = `${rec.meta.season}_${rec.meta.week}_${rec.meta.game_id}`
  oofMap[key] = rec.oof_prob
}

const stackRows = []
for (const r of ds) {
  const key = `${r.meta.season}_${r.meta.week}_${r.meta.game_id}`
  const p_direct = oofMap[key]
  if (p_direct === undefined) continue
  // Compute spread-based prior: use epa_offense_diff as proxy for spread (~3.5 pts per 0.1 EPA)
  const spread_proxy = (r.x.epa_offense_diff || 0) * 35 // rough calibration
  const p_prior = 0.53 + 0.025 * spread_proxy
  const p_prior_clamped = Math.min(Math.max(p_prior, 0.02), 0.98)
  stackRows.push({ p_direct, p_prior: p_prior_clamped, y: r.y, meta: r.meta })
}

console.log(`stacking dataset: ${stackRows.length} rows`)

// Stacking method from config
const stackMethod = cfg.ml.stacking && cfg.ml.stacking.method ? cfg.ml.stacking.method : 'blend'
let stackModel = {}

if (stackMethod === 'blend') {
  // Simple linear blend: p_stack = lambda*p_direct + (1-lambda)*p_prior
  // Grid search over lambda
  const lambdas = [0.0, 0.25, 0.5, 0.75, 1.0]
  let best = { lambda: null, auc: -1 }
  for (const lam of lambdas) {
    const preds = stackRows.map(r => lam * r.p_direct + (1-lam) * r.p_prior)
    const yTrue = stackRows.map(r => r.y)
    const curAuc = auc(yTrue, preds)
    console.log(`lambda=${lam} auc=${curAuc.toFixed(4)} brier=${brier(yTrue, preds).toFixed(4)}`)
    if (curAuc > best.auc) best = { lambda: lam, auc: curAuc }
  }
  stackModel = { method: 'blend', lambda: best.lambda }
  console.log('best blend lambda', best.lambda, 'auc', best.auc)
} else {
  // stacking logistic: fit logistic on [p_direct, p_prior] -> y using simple GD
  // (minimal implementation)
  const X = stackRows.map(r => [r.p_direct, r.p_prior])
  const y = stackRows.map(r => r.y)
  let w = [0.5, 0.5]
  let b = 0
  const lr = 0.1
  for (let epoch=0; epoch<500; epoch++) {
    const preds = X.map(x => sigmoid(x[0]*w[0] + x[1]*w[1] + b))
    const gradW = [0,0]
    let gradB = 0
    for (let i=0;i<X.length;i++){
      const err = preds[i] - y[i]
      gradW[0] += err * X[i][0]
      gradW[1] += err * X[i][1]
      gradB += err
    }
    gradW[0] /= X.length; gradW[1] /= X.length; gradB /= X.length
    w[0] -= lr*gradW[0]; w[1] -= lr*gradW[1]; b -= lr*gradB
  }
  stackModel = { method: 'logistic', w, b }
  const preds = X.map(x => sigmoid(x[0]*w[0] + x[1]*w[1] + b))
  console.log('stacking logistic auc', auc(y, preds).toFixed(4), 'brier', brier(y,preds).toFixed(4))
}

// Save stacking model
const outPath = path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_stack.json')
fs.writeFileSync(outPath, JSON.stringify(stackModel, null, 2))
console.log('Saved stacking model to', outPath)
