// public/nfl-negcorr/engine.js
export function zscore(arr, v){
  const n = arr.length||1;
  const mean = arr.reduce((a,b)=>a+b,0)/n;
  const sd = Math.sqrt(arr.map(x => (x-mean)*(x-mean)).reduce((a,b)=>a+b,0)/Math.max(1,n-1));
  return sd ? (v-mean)/sd : 0;
}

export function scoreRows(metrics){
  const arr = metrics.filter(m => m.pos !== 'QB');
  const adots   = arr.map(m => Number(m.aDOT||0));
  const tshares = arr.map(m => Number(m.target_share||0));
  const yprs    = arr.map(m => Number(m.yards_per_rec||0));
  const catches = arr.map(m => Number(m.catch_rate||0));

  const rows = arr.map(m => {
    const s_vol_low_yd =
      zscore(tshares, Number(m.target_share||0)) +
      zscore(catches, Number(m.catch_rate||0)) -
      zscore(adots, Number(m.aDOT||0)) -
      zscore(yprs, Number(m.yards_per_rec||0));

    const s_deep_low_vol =
      zscore(adots, Number(m.aDOT||0)) +
      zscore(yprs, Number(m.yards_per_rec||0)) -
      zscore(tshares, Number(m.target_share||0));

    return {
      player: m.player, team: m.team, seasons: m.seasons, role: m.role,
      profiles: {
        recOver_ydsUnder: Number(s_vol_low_yd.toFixed(2)),
        recUnder_ydsOver: Number(s_deep_low_vol.toFixed(2)),
      }
    };
  });
  rows.sort((a,b)=> b.profiles.recOver_ydsUnder - a.profiles.recOver_ydsUnder);
  return rows;
}

export function suggestLines(row){
  const role = (row.role||'').toLowerCase();
  let altRecFloor=3, recLine=4.5, ydsLine=50;
  if(role.includes('alpha-possession')){ altRecFloor=5; recLine=6.5; ydsLine=58; }
  if(role.includes('alpha-deep')){ altRecFloor=3; recLine=4.5; ydsLine=56; }
  if(role.includes('speed-deep')){ altRecFloor=2; recLine=3.5; ydsLine=34; }
  if(role.includes('rookie')){ altRecFloor=2; recLine=3.5; ydsLine=30; }
  return { altRecFloor, recLine, ydsLine };
}
