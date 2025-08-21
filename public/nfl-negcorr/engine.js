
export async function loadMetrics(){
  const res = await fetch('/data/nfl/player_metrics_small.json', {cache:'no-store'});
  return res.json();
}
function zscore(arr, v){
  const n = arr.length;
  const mean = arr.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(arr.map(x => (x-mean)*(x-mean)).reduce((a,b)=>a+b,0)/Math.max(1,n-1));
  if(!sd) return 0;
  return (v - mean)/sd;
}
export function scoreNegCorr(metrics){
  const arr = metrics.filter(m => m.pos !== 'QB');
  const adots = arr.map(m => Number(m.aDOT||0));
  const tshares = arr.map(m => Number(m.target_share||0));
  const yprs = arr.map(m => Number(m.yards_per_rec||0));
  const catchRates = arr.map(m => Number(m.catch_rate||0));
  return arr.map(m => {
    const s1 = zscore(tshares, Number(m.target_share||0)) + zscore(catchRates, Number(m.catch_rate||0)) - zscore(adots, Number(m.aDOT||0)) - zscore(yprs, Number(m.yards_per_rec||0));
    const s2 = zscore(adots, Number(m.aDOT||0)) + zscore(yprs, Number(m.yards_per_rec||0)) - zscore(tshares, Number(m.target_share||0));
    return { ...m,
      profiles: {
        receptionsOver_yardsUnder: Number(s1.toFixed(2)),
        receptionsUnder_yardsOver: Number(s2.toFixed(2)),
      }
    };
  }).sort((a,b)=> b.profiles.receptionsOver_yardsUnder - a.profiles.receptionsOver_yardsUnder);
}
export function suggestLines(row){
  const role = (row.role||'').toLowerCase();
  let altRecFloor=3, recLine=4.5, ydsLine=50;
  if(role.includes('alpha-possession')){ altRecFloor=5; recLine=6.5; ydsLine=58; }
  if(role.includes('alpha-deep')){ altRecFloor=3; recLine=4.5; ydsLine=56; }
  if(role.includes('speed')){ altRecFloor=2; recLine=3.5; ydsLine=34; }
  if(role.includes('rookie')){ altRecFloor=2; recLine=3.5; ydsLine=30; }
  return { altRecFloor, recLine, ydsLine };
}
