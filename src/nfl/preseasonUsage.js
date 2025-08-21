// src/nfl/preseasonUsage.js
export function weightForSnap(snap){
  const qW = [0, 1.0, 0.6, 0.2, 0.1][snap.quarter ?? 4] || 0.1;
  const unitW = (snap.unit === 'first') ? 1.0 : (snap.unit === 'second' ? 0.5 : 0.2);
  const series = Math.max(1, Math.min(12, snap.series ?? 9));
  const seriesW = Math.max(0.2, 1.2 - 0.1 * (series - 1)); // series1=1.2, series6=0.7, floor 0.2
  const oppW = (snap.opp_unit === 'first') ? 1.0 : (snap.opp_unit === 'second' ? 0.6 : 0.3);
  const garbage = Math.abs(snap.score_diff ?? 0) >= 14 ? 0.8 : 1.0; // dampen garbage
  return qW * unitW * seriesW * oppW * garbage;
}

export function computeStarterRepWeights(preseasonSnaps = []){
  const byPlayer = new Map();
  for(const s of preseasonSnaps){
    const name = s.player?.trim();
    if(!name) continue;
    const w = weightForSnap(s);
    byPlayer.set(name, (byPlayer.get(name) || 0) + w);
  }
  // normalize to 0..1 by dividing by 95th percentile
  const vals = [...byPlayer.values()].sort((a,b)=>a-b);
  const p95 = vals.length ? vals[intClamp(0.95*(vals.length-1))] || 1 : 1;
  const out = {};
  for(const [k,v] of byPlayer.entries()){
    out[k] = Math.max(0, Math.min(1, v / (p95 || 1)));
  }
  return out;
}

function intClamp(x){ return Math.max(0, Math.min(10**9, Math.round(x))); }
