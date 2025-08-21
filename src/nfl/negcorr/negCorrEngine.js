
// src/nfl/negcorr/negCorrEngine.js
// Pure JS module; no side-effects; isolated from TD & HR code.
import metrics from '/data/nfl/player_metrics_small.json';

export function zscore(arr, v){
  const n = arr.length;
  const mean = arr.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(arr.map(x => (x-mean)*(x-mean)).reduce((a,b)=>a+b,0)/Math.max(1,n-1));
  if(!sd) return 0;
  return (v - mean)/sd;
}

function buildIndex(){
  const arr = metrics.filter(m => m.pos !== 'QB');
  const adots = arr.map(m => Number(m.aDOT||0));
  const tshares = arr.map(m => Number(m.target_share||0));
  const yprs = arr.map(m => Number(m.yards_per_rec||0));
  return {arr, adots, tshares, yprs};
}

export function scoreNegCorr(){
  const {arr, adots, tshares, yprs} = buildIndex();
  return arr.map(m => {
    const s_vol_low_yd = zscore(tshares, Number(m.target_share||0)) + (m.catch_rate? zscore(arr.map(x=>Number(x.catch_rate||0)), Number(m.catch_rate||0)) : 0) - zscore(adots, Number(m.aDOT||0)) - zscore(yprs, Number(m.yards_per_rec||0));
    const s_deep_low_vol = zscore(adots, Number(m.aDOT||0)) + zscore(yprs, Number(m.yards_per_rec||0)) - zscore(tshares, Number(m.target_share||0));
    return {
      player: m.player,
      team: m.team,
      seasons: m.seasons,
      role: m.role,
      profiles: {
        receptionsOver_yardsUnder: Number(s_vol_low_yd.toFixed(2)),
        receptionsUnder_yardsOver: Number(s_deep_low_vol.toFixed(2)),
      }
    };
  }).sort((a,b)=> (b.profiles.receptionsOver_yardsUnder - a.profiles.receptionsOver_yardsUnder));
}

// Build suggested alt lines when odds lines are missing.
// crude but practical: derive from role and metrics.
export function suggestLines(playerRow){
  const role = playerRow.role || '';
  // default baselines
  let recLow = 3; // alt floor
  let recHigh = 4.5; // standard line
  let ydsLine = 40; // standard receiving yards

  if(role.includes('alpha-possession')){ recLow = 5; recHigh = 6.5; ydsLine = 58; }
  if(role.includes('alpha-deep')){ recLow = 3; recHigh = 4.5; ydsLine = 56; }
  if(role.includes('speed-deep')){ recLow = 2; recHigh = 3.5; ydsLine = 34; }
  if(role.includes('rookie')){ recLow = 2; recHigh = 3.5; ydsLine = 30; }

  return {
    altRecFloor: recLow,
    recLine: recHigh,
    ydsLine
  };
}
