import fs from 'fs'
import path from 'path'
import { buildMLDataset } from './_lib/ml_features.mjs'
import { sigmoid, logit, auc, brier } from './_lib/metrics.mjs'

// 10-calibrate-ml.mjs
// Fits Platt scaling (logistic calibration) on OOF stacked probs.
// Saves calibration model to data/models/ml_calibration.json

const repoRoot = process.cwd()
const cfgPath = path.join(repoRoot, 'nfl-model-v4.1/config.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const holdout = cfg.ml.holdout_year || 2024

// Load trained models
const mlDirect = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_direct.json'), 'utf8'))
const oofProbs = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_oof_probs.json'), 'utf8'))
const stackModel = JSON.parse(fs.readFileSync(path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_stack.json'), 'utf8'))

// Build OOF stacked probs
const seasons = [2020,2021,2022,2023,2024]
const trainSeasons = seasons.filter(s => s !== holdout)
const ds = buildMLDataset(trainSeasons)

const oofMap = {}
for (const rec of oofProbs) {
  const key = `${rec.meta.season}_${rec.meta.week}_${rec.meta.game_id}`
  oofMap[key] = rec.oof_prob
}

const calibRows = []
for (const r of ds) {
  const key = `${r.meta.season}_${r.meta.week}_${r.meta.game_id}`
  const p_direct = oofMap[key]
  if (p_direct === undefined) continue
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
  calibRows.push({ p_stack, y: r.y, meta: r.meta })
}

console.log(`calibration dataset: ${calibRows.length} rows`)

// Fit Platt scaling: logit(p_calib) = a * logit(p_stack) + b
// We'll use simple GD
const X = calibRows.map(r => logit(Math.min(Math.max(r.p_stack, 1e-6), 1-1e-6)))
const y = calibRows.map(r => r.y)

let a = 1.0
let b = 0.0
let lr = 0.05
for (let epoch=0; epoch<800; epoch++) {
  const preds = X.map(x => sigmoid(a*x + b))
  let gradA = 0, gradB = 0
  for (let i=0;i<X.length;i++) {
    const err = preds[i] - y[i]
    gradA += err * X[i]
    gradB += err
  }
  gradA /= X.length; gradB /= X.length
  a -= lr * gradA
  b -= lr * gradB
  if (epoch % 200 === 0 && epoch > 0) lr *= 0.9 // decay
}

const calibPreds = X.map(x => sigmoid(a*x + b))
console.log('Platt scaling a', a, 'b', b)
console.log('calibrated auc', auc(y, calibPreds).toFixed(4), 'brier', brier(y, calibPreds).toFixed(4))

// Save calibration model
const calibModel = { method: 'platt', a, b }
const outPath = path.join(repoRoot, 'nfl-model-v4.1/data/models/ml_calibration.json')
fs.writeFileSync(outPath, JSON.stringify(calibModel, null, 2))
console.log('Saved calibration model to', outPath)
