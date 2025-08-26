
// src/nfl/negcorr/engine.js
import metrics from '/data/nfl/player_metrics_small.json';

function z(arr){ const n=arr.length; const m=arr.reduce((a,b)=>a+b,0)/n; const s=Math.sqrt(arr.map(x=>(x-m)*(x-m)).reduce((a,b)=>a+b,0)/Math.max(1,n-1)); return {m,s}; }
function zscore(arr,v){ const {m,s}=z(arr); return s? (v-m)/s : 0; }

export function scoreNegCorr(){
  const arr = metrics.filter(m => m.pos !== 'QB');
  const ad = arr.map(m=>+m.aDOT||0), ts = arr.map(m=>+m.target_share||0), ypr = arr.map(m=>+m.yards_per_rec||0), cr = arr.map(m=>+m.catch_rate||0);
  return arr.map(m=>{
    const s1 = zscore(ts, +m.target_share||0) + zscore(cr, +m.catch_rate||0) - zscore(ad, +m.aDOT||0) - zscore(ypr, +m.yards_per_rec||0);
    const s2 = zscore(ad, +m.aDOT||0) + zscore(ypr, +m.yards_per_rec||0) - zscore(ts, +m.target_share||0);
    return {...m, s1:+s1.toFixed(2), s2:+s2.toFixed(2)};
  }).sort((a,b)=>b.s1-a.s1);
}

export function suggestLines(m){
  let alt=3, rec=4.5, yds=50;
  const role=(m.role||'').toLowerCase();
  if(role.includes('alpha-possession')){ alt=5; rec=6.5; yds=58; }
  if(role.includes('alpha-deep')){ alt=3; rec=4.5; yds=56; }
  if(role.includes('speed')){ alt=2; rec=3.5; yds=34; }
  if(role.includes('rookie')){ alt=2; rec=3.5; yds=30; }
  return { altRecFloor:alt, recLine:rec, ydsLine:yds };
}
