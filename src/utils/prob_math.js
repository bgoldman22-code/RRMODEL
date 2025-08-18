// src/utils/prob_math.js
// Basic probability helpers for binomial and Poisson-style approximations.

export function clamp01(x){ return Math.max(0, Math.min(1, Number(x)||0)); }

export function binomPMF(n, p, k){
  n = Math.max(0, Math.floor(n)); p = clamp01(p); k = Math.max(0, Math.floor(k));
  if (k>n) return 0;
  // Use log-factorials for numeric stability
  const logC = lognCk(n, k);
  const val = Math.exp(logC + k*Math.log(p||1e-12) + (n-k)*Math.log(1-p||1e-12));
  return val;
}

export function binomCDF(n, p, k){ // P(X <= k)
  n = Math.max(0, Math.floor(n)); p = clamp01(p); k = Math.max(0, Math.floor(k));
  let s = 0; for (let i=0;i<=k;i++) s += binomPMF(n,p,i);
  return Math.min(1, Math.max(0, s));
}

export function probAtLeastK(n, p, k){ // P(X >= k)
  return 1 - binomCDF(n, p, k-1);
}

export function poissonProbAtLeastOnce(lambda){
  const L = Math.max(0, Number(lambda)||0);
  return 1 - Math.exp(-L);
}

function lognCk(n, k){
  if(k<0 || k>n) return -Infinity;
  if(k===0 || k===n) return 0;
  return logFactorial(n) - logFactorial(k) - logFactorial(n-k);
}
const _lf_cache = new Map([[0,0],[1,0]]);
function logFactorial(n){
  if(_lf_cache.has(n)) return _lf_cache.get(n);
  let acc = _lf_cache.get(_lf_cache.size-1) || 0;
  for(let i=_lf_cache.size; i<=n; i++){
    acc += Math.log(i);
    _lf_cache.set(i, acc);
  }
  return _lf_cache.get(n);
}
