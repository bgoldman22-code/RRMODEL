// src/utils/rrEV.js
// Compute expected profit (in units per $1) for a round robin across legs=[2,3] by default.
// rows: [{ prob: number (0..1), american: number }]
// bankroll: total $ to split equally across all combos
export function americanToDecimal(a){
  return a >= 0 ? 1 + a/100 : 1 + 100/(-a);
}

export function rrExpectedUnits(rows, bankroll=100, legs=[2,3]){
  const picks = rows
    .filter(r => typeof r.prob === 'number' && r.prob > 0 && typeof r.american === 'number')
    .map(r => ({ p: r.prob, dec: americanToDecimal(r.american) }));
  if (picks.length === 0) return { units: 0, stakePerCombo: 0, combos: 0 };

  // build combinations
  function* combos(arr, k, start=0, prev=[]){
    if(k===0){ yield prev; return; }
    for(let i=start;i<=arr.length-k;i++){
      yield* combos(arr, k-1, i+1, prev.concat([arr[i]]));
    }
  }

  const sets = [];
  for(const k of legs){
    for(const c of combos(picks, k)){
      sets.push(c);
    }
  }
  if(sets.length === 0) return { units: 0, stakePerCombo: 0, combos: 0 };

  const stakePerCombo = bankroll / sets.length;
  let totalEV = 0;
  for(const c of sets){
    const prob = c.reduce((acc, x) => acc * x.p, 1);
    const dec  = c.reduce((acc, x) => acc * x.dec, 1);
    const evPer1 = prob * dec - 1;      // expected profit per $1 stake
    totalEV += evPer1;
  }
  // Total expected profit in units (assuming 1 unit = 1 dollar)
  const units = stakePerCombo * totalEV;
  return { units, stakePerCombo, combos: sets.length };
}
