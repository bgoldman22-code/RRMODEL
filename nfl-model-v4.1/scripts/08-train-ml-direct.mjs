import fs from 'fs'
import path from 'path'
import { buildMLDataset, featureNames } from './_lib/ml_features.mjs'
import { sigmoid, auc, brier } from './_lib/metrics.mjs'

// 08-train-ml-direct.mjs
// Minimal logistic (L2) trainer with time-aware leave-one-season-out CV.
// Saves model to data/models/ml_direct.json and OOF probs to data/models/ml_oof_probs.json

const repoRoot = process.cwd()
const cfgPath = path.join(repoRoot, 'nfl-model-v4.1/config.json')
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
const holdout = cfg.ml && cfg.ml.holdout_year ? cfg.ml.holdout_year : 2024

// build dataset for seasons excluding holdout
const seasons = [2020,2021,2022,2023,2024]
const trainSeasons = seasons.filter(s => s !== holdout)
const ds = buildMLDataset(trainSeasons)
if (!ds.length) {
  console.error('No training data found. Aborting.')
  process.exit(1)
}

const feats = featureNames()
// Build X and y and meta
const X = ds.map(r => feats.map(f => Number(r.x[f] || 0)))
const y = ds.map(r => Number(r.y || 0))
const metas = ds.map(r => r.meta)

// helper: z = X*w + b
function predictProbs(Xmat, w, b) {
  return Xmat.map(row => sigmoid(row.reduce((s,v,i)=>s + v * w[i], 0) + b))
}

function logloss(yTrue, p) {
  let s = 0
  for (let i=0;i<yTrue.length;i++) {
    const pt = Math.min(Math.max(p[i], 1e-15), 1-1e-15)
    s += - (yTrue[i]*Math.log(pt) + (1-yTrue[i])*Math.log(1-pt))
  }
  return s / yTrue.length
}

// train logistic with L2 using batch GD
function trainLogistic(Xtr, ytr, lambda=1.0, opts={epochs:800, lr:0.1}){
  const n = Xtr[0].length
  let w = new Array(n).fill(0)
  let b = 0
  const m = Xtr.length
  for (let epoch=0; epoch<opts.epochs; epoch++){
    const p = predictProbs(Xtr, w, b)
    const gradW = new Array(n).fill(0)
    let gradB = 0
    for (let i=0;i<m;i++){
      const err = p[i] - ytr[i]
      for (let j=0;j<n;j++) gradW[j] += err * Xtr[i][j]
      gradB += err
    }
    // apply L2
    for (let j=0;j<n;j++) gradW[j] = gradW[j]/m + lambda * w[j]
    gradB = gradB / m
    // update
    for (let j=0;j<n;j++) w[j] -= opts.lr * gradW[j]
    b -= opts.lr * gradB
    // small lr decay
    if (epoch % 200 === 0) opts.lr *= 0.99
  }
  return { w, b }
}

// leave-one-season-out CV using metas[].season
const seasonsInData = [...new Set(metas.map(m=>m.season))].sort()
const folds = seasonsInData.map(s => ({season: s, idxs: metas.map((m,i)=> m.season===s ? i : -1).filter(i=>i>=0)}))

const lambdas = [0.01, 0.1, 1, 10]
let best = { lambda: null, auc: -1, oof: null }

for (const lambda of lambdas) {
  const oofProbs = new Array(y.length).fill(null)
  const oofY = new Array(y.length).fill(null)
  for (const f of folds) {
    // skip if this season not in trainSeasons
    if (!trainSeasons.includes(f.season)) continue
    const valIdxs = f.idxs
    const trainIdxs = []
    for (let i=0;i<y.length;i++) if (!valIdxs.includes(i)) trainIdxs.push(i)
    const Xtr = trainIdxs.map(i=>X[i])
    const ytr = trainIdxs.map(i=>y[i])
    const Xval = valIdxs.map(i=>X[i])
    const yval = valIdxs.map(i=>y[i])
    if (!Xtr.length || !Xval.length) continue
    // standardize using train mean/std
    const nfeat = X[0].length
    const mean = new Array(nfeat).fill(0)
    const std = new Array(nfeat).fill(0)
    for (let j=0;j<nfeat;j++){
      mean[j] = Xtr.reduce((s,row)=>s+row[j],0)/Xtr.length
      std[j] = Math.sqrt(Math.max(1e-9, Xtr.reduce((s,row)=>s+Math.pow(row[j]-mean[j],2),0)/Xtr.length))
    }
    const XtrS = Xtr.map(row=>row.map((v,j)=>(v-mean[j])/std[j]))
    const XvalS = Xval.map(row=>row.map((v,j)=>(v-mean[j])/std[j]))
    // train
    const model = trainLogistic(XtrS, ytr, lambda, {epochs:800, lr:0.3})
    const pval = predictProbs(XvalS, model.w, model.b)
    for (let k=0;k<valIdxs.length;k++){
      oofProbs[valIdxs[k]] = pval[k]
      oofY[valIdxs[k]] = yval[k]
    }
  }
  // compute AUC on non-null oof
  const validIdxs = oofProbs.map((v,i)=> v===null ? -1 : i).filter(i=>i>=0)
  const yTrue = validIdxs.map(i=>oofY[i])
  const yPred = validIdxs.map(i=>oofProbs[i])
  const curAuc = auc(yTrue, yPred)
  console.log(`lambda=${lambda} oof_rows=${yPred.length} auc=${curAuc.toFixed(4)} brier=${brier(yTrue,yPred).toFixed(4)}`)
  if (curAuc > best.auc) best = { lambda, auc: curAuc, oof: { idxs: validIdxs, yTrue, yPred } }
}

console.log('best lambda', best.lambda, 'auc', best.auc)

// Train final model on all train data with best lambda
// standardize full train
const nfeat = X[0].length
const meanFull = new Array(nfeat).fill(0)
const stdFull = new Array(nfeat).fill(0)
for (let j=0;j<nfeat;j++){
  meanFull[j] = X.reduce((s,row)=>s+row[j],0)/X.length
  stdFull[j] = Math.sqrt(Math.max(1e-9, X.reduce((s,row)=>s+Math.pow(row[j]-meanFull[j],2),0)/X.length))
}
const XfullS = X.map(row=>row.map((v,j)=>(v-meanFull[j])/stdFull[j]))
const finalModel = trainLogistic(XfullS, y, best.lambda, {epochs:1200, lr:0.2})

// save model and oof
const outDir = path.join(repoRoot, 'nfl-model-v4.1/data/models')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'ml_direct.json'), JSON.stringify({ feats, mean: meanFull, std: stdFull, w: finalModel.w, b: finalModel.b, lambda: best.lambda }, null, 2))

// save OOF probs mapping to meta
const oofRecords = []
if (best.oof && best.oof.idxs) {
  for (let idx of best.oof.idxs) {
    oofRecords.push({ meta: metas[idx], y: best.oof.yTrue.shift(), oof_prob: best.oof.yPred.shift() })
  }
}
fs.writeFileSync(path.join(outDir, 'ml_oof_probs.json'), JSON.stringify(oofRecords, null, 2))

console.log('Saved model to', path.join(outDir, 'ml_direct.json'))
