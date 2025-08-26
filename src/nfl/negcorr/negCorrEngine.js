
import metrics from '/data/nfl/player_metrics_small.json';
function z(arr,v){const n=arr.length,mu=arr.reduce((a,b)=>a+b,0)/n;const sd=Math.sqrt(arr.map(x=>(x-mu)*(x-mu)).reduce((a,b)=>a+b,0)/Math.max(1,n-1));return sd? (v-mu)/sd : 0;}
export function scoreNegCorr(){
  const arr = metrics.filter(m=>m.pos!=='QB');
  const ad=arr.map(m=>+m.aDOT||0), ts=arr.map(m=>+m.target_share||0), yr=arr.map(m=>+m.yards_per_rec||0), cr=arr.map(m=>+m.catch_rate||0);
  return arr.map(m=>{
    const s1 = z(ts,+m.target_share||0) + z(cr,+m.catch_rate||0) - z(ad,+m.aDOT||0) - z(yr,+m.yards_per_rec||0);
    const s2 = z(ad,+m.aDOT||0) + z(yr,+m.yards_per_rec||0) - z(ts,+m.target_share||0);
    return {...m, profiles:{receptionsOver_yardsUnder:+s1.toFixed(2), receptionsUnder_yardsOver:+s2.toFixed(2)}};
  }).sort((a,b)=> b.profiles.receptionsOver_yardsUnder - a.profiles.receptionsOver_yardsUnder);
}
export function suggestLines(m){
  const role=(m.role||'').toLowerCase(); let altRecFloor=3, recLine=4.5, ydsLine=50;
  if(role.includes('alpha-possession')){altRecFloor=5;recLine=6.5;ydsLine=58;}
  if(role.includes('alpha-deep')){altRecFloor=3;recLine=4.5;ydsLine=56;}
  if(role.includes('speed')){altRecFloor=2;recLine=3.5;ydsLine=34;}
  if(role.includes('rookie')){altRecFloor=2;recLine=3.5;ydsLine=30;}
  return {altRecFloor, recLine, ydsLine};
}
