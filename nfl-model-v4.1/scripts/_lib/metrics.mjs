export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z))
}

export function logit(p) {
  p = Math.min(Math.max(p, 1e-6), 1-1e-6)
  return Math.log(p / (1-p))
}

export function auc(yTrue, yScore) {
  // simple AUC: sort by score and compute ROC trapezoid
  const combined = yTrue.map((y,i)=>({y:y, s: yScore[i]})).sort((a,b)=>b.s - a.s)
  let pos = 0, neg = 0
  for (const c of combined) {
    if (c.y===1) pos++;
    else neg++;
  }
  if (pos===0 || neg===0) return 0.5
  let tp = 0, fp = 0, prev_s = null, auc = 0, prev_tpr = 0, prev_fpr = 0
  for (const c of combined) {
    if (c.y === 1) tp++;
    else fp++;
    const tpr = tp / pos
    const fpr = fp / neg
    if (prev_s !== null && c.s !== prev_s) {
      auc += (fpr - prev_fpr) * (tpr + prev_tpr) / 2
      prev_tpr = tpr
      prev_fpr = fpr
    } else {
      prev_tpr = tpr
      prev_fpr = fpr
    }
    prev_s = c.s
  }
  // finalize
  auc += (1 - prev_fpr) * (1 + prev_tpr) / 2
  return Math.max(0, Math.min(1, auc))
}

export function brier(yTrue, yProb) {
  const n = yTrue.length
  let s=0
  for (let i=0;i<n;i++) s += Math.pow(yProb[i]-yTrue[i],2)
  return s/n
}
