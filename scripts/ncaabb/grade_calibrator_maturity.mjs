#!/usr/bin/env node
// NCAA MBB — Calibrator maturity analysis
// How does Dogs ≤+150 @ 5% perform as the calibrator gets MORE data?
// Break season into calibrator size buckets

const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function normalize(s){return(s||'').toLowerCase().replace(/\./g,'').replace(/[''´`]/g,'').replace(/\s+/g,' ').trim();}
function keyWords(name){const n=normalize(name);return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks|rattlers|golden lions|lancers|blue hose)$/g,'').trim().split(' ').filter(w=>w.length>2);}
function findGame(p,games){const hn=normalize(p.home_team),an=normalize(p.away_team),hk=keyWords(p.home_team),ak=keyWords(p.away_team);for(const g of games){const eh=normalize(g.homeName||''),ea=normalize(g.awayName||''),ehs=normalize(g.homeShort||''),eas=normalize(g.awayShort||'');const hm=eh.includes(hn)||hn.includes(eh)||ehs.includes(hn)||hn.includes(ehs)||(hk[0]&&(eh.includes(hk[0])||ehs.includes(hk[0])));const am=ea.includes(an)||an.includes(ea)||eas.includes(an)||an.includes(eas)||(ak[0]&&(ea.includes(ak[0])||eas.includes(ak[0])));if(hm&&am)return g;const ehk=keyWords(g.homeName||''),eak=keyWords(g.awayName||'');if(hk.some(k=>ehk.includes(k)||eh.includes(k))&&ak.some(k=>eak.includes(k)||ea.includes(k)))return g;}return null;}
function oddsPL(won,odds,bet){if(won)return odds>0?bet*(odds/100):bet*(100/Math.abs(odds));return -bet;}
function impliedProb(odds){return odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100);}

function fitIsotonic(data){
  if(data.length===0)return x=>x;
  const sorted=[...data].sort((a,b)=>a.x-b.x);
  const xs=sorted.map(d=>d.x),ys=sorted.map(d=>d.y);
  const n=xs.length;const result=[...ys];const weight=new Array(n).fill(1);
  let i=0;while(i<n-1){if(result[i]>result[i+1]){const merged=(result[i]*weight[i]+result[i+1]*weight[i+1])/(weight[i]+weight[i+1]);result[i]=merged;result[i+1]=merged;weight[i]=weight[i]+weight[i+1];weight[i+1]=weight[i];let j=i;while(j>0&&result[j-1]>result[j]){const m2=(result[j-1]*weight[j-1]+result[j]*weight[j])/(weight[j-1]+weight[j]);result[j-1]=m2;result[j]=m2;weight[j-1]=weight[j-1]+weight[j];weight[j]=weight[j-1];j--;}i++;}else{i++;}}
  const blocks=[];let bi=0;while(bi<n){let bj=bi;while(bj<n-1&&Math.abs(result[bj]-result[bj+1])<1e-9)bj++;blocks.push({lo:xs[bi],hi:xs[bj],val:result[bi]});bi=bj+1;}
  return function(x){if(x<=blocks[0].lo)return blocks[0].val;if(x>=blocks[blocks.length-1].hi)return blocks[blocks.length-1].val;for(const b of blocks){if(x>=b.lo&&x<=b.hi)return b.val;}for(let k=0;k<blocks.length-1;k++){if(x>blocks[k].hi&&x<blocks[k+1].lo){const t=(x-blocks[k].hi)/(blocks[k+1].lo-blocks[k].hi);return blocks[k].val+t*(blocks[k+1].val-blocks[k].val);}}return x;};
}

function yyyymmdd(ds){return ds.replace(/-/g,'');}

(async()=>{
  try{
    const lastGameDate='2026-03-04';
    const seasonStart='2025-11-04';
    const MIN_TRAINING_DAYS=14;

    console.log('NCAA MBB — CALIBRATOR MATURITY ANALYSIS');
    console.log('How does Dogs ≤+150 @ 5% perform at different calibrator sizes?\n');

    // Fetch picks
    const allDates=[];
    for(let d=new Date(seasonStart+'T12:00:00Z');d<=new Date(lastGameDate+'T12:00:00Z');d.setDate(d.getDate()+1)){
      allDates.push(d.toISOString().slice(0,10));
    }
    const allPicksByFile={};
    let fetchedFiles=0;
    const batchSize=15;
    for(let i=0;i<allDates.length;i+=batchSize){
      const batch=allDates.slice(i,i+batchSize);
      const results=await Promise.all(batch.map(async f=>{
        try{const r=await fetch(BASE+f+'.json');if(!r.ok)return null;const d=await r.json();return{date:f,picks:d.picks||[]};}catch(e){return null;}
      }));
      for(const r of results){if(r&&r.picks.length>0){allPicksByFile[r.date]=r.picks;fetchedFiles++;}}
    }
    console.log(`Fetched ${fetchedFiles} pick files`);

    // Fetch ESPN
    const espnDatesNeeded=new Set();
    const pickDates=Object.keys(allPicksByFile).sort();
    for(const pd of pickDates){espnDatesNeeded.add(pd);const next=new Date(pd+'T12:00:00Z');next.setDate(next.getDate()+1);espnDatesNeeded.add(next.toISOString().slice(0,10));}
    
    const espnGamesByDate={};
    const espnArr=[...espnDatesNeeded].sort();
    for(let i=0;i<espnArr.length;i+=batchSize){
      const batch=espnArr.slice(i,i+batchSize);
      const results=await Promise.all(batch.map(async checkDate=>{
        try{const r=await fetch(`${ESPN}?dates=${yyyymmdd(checkDate)}&limit=300&groups=50`);if(!r.ok)return null;const jd=await r.json();const games=[];
          for(const ev of(jd.events||[])){const comp=ev.competitions?.[0];if(!comp?.status?.type?.completed)continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away)continue;games.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner:parseInt(home.score)>parseInt(away.score)?'home':'away'});}
          return{date:checkDate,games};}catch(e){return null;}
      }));
      for(const r of results){if(r){espnGamesByDate[r.date]=r.games;}}
    }
    console.log(`ESPN dates fetched: ${Object.keys(espnGamesByDate).length}\n`);

    function gradePicksForDate(fileDate){
      const picks=allPicksByFile[fileDate]||[];const graded=[];
      const nextDay=new Date(fileDate+'T12:00:00Z');nextDay.setDate(nextDay.getDate()+1);
      const espnPools=[...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDay.toISOString().slice(0,10)]||[])];
      for(const p of picks){const g=findGame(p,espnPools);if(!g)continue;graded.push({model_prob:p.model_prob,won:g.winner===p.side,odds:p.odds,side:p.side});}
      return graded;
    }

    // ═══════════════════════════════════════════════════════
    // Walk through every game date, tracking calibrator state
    // ═══════════════════════════════════════════════════════
    const allTraining=[];
    let daysProcessed=0;
    let bettingStarted=false;

    // Detailed per-bet log
    const betLog = [];

    // Calibrator quality tracking — sample some calibration values at checkpoints
    const calCheckpoints = [];

    for(const fileDate of pickDates){
      const nextDay=new Date(fileDate+'T12:00:00Z');nextDay.setDate(nextDay.getDate()+1);
      const nextDayStr=nextDay.toISOString().slice(0,10);
      const graded=gradePicksForDate(fileDate);

      if(!bettingStarted){
        for(const g of graded)allTraining.push({x:g.model_prob,y:g.won?1:0});
        daysProcessed++;
        if(daysProcessed>=MIN_TRAINING_DAYS&&allTraining.length>=50){bettingStarted=true;}
        continue;
      }

      // Build calibrator
      let calibrate=x=>x;
      if(allTraining.length>=50)calibrate=fitIsotonic(allTraining);
      const trainingSize = allTraining.length;

      // Sample calibration curve at this point
      if ([104,200,400,600,800,1000,1200].some(n => Math.abs(trainingSize - n) < 30) || fileDate === pickDates[pickDates.length-1]) {
        const testPoints = [0.50,0.55,0.60,0.65,0.70,0.75,0.80,0.85,0.90,0.95];
        const calValues = testPoints.map(p => ({ raw: p, cal: calibrate(p) }));
        calCheckpoints.push({ date: fileDate, trainingSize, calValues });
      }

      // Grade with filter
      const espnGames=[...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDayStr]||[])];
      const picks=allPicksByFile[fileDate]||[];

      for(const p of picks){
        if(p.odds<=0||p.odds>150)continue;
        const calProb=calibrate(p.model_prob);
        const imp=impliedProb(p.odds);
        const calEdge=calProb-imp;
        if(calEdge<0.05)continue;
        const g=findGame(p,espnGames);
        if(!g)continue;
        const won=g.winner===p.side;
        const bet=1000;
        const pl=Math.round(oddsPL(won,p.odds,bet));
        betLog.push({
          date:fileDate,
          trainSize:trainingSize,
          team:p.side==='home'?p.home_team:p.away_team,
          side:p.side,
          odds:p.odds,
          rawProb:(p.model_prob*100).toFixed(1),
          calProb:(calProb*100).toFixed(1),
          implied:(imp*100).toFixed(1),
          calEdge:(calEdge*100).toFixed(1),
          won,pl
        });
      }

      // Add today's data to training
      for(const g of graded)allTraining.push({x:g.model_prob,y:g.won?1:0});
      daysProcessed++;
    }

    // ═══════════════════════════════════════════════════════
    // PART 1: Calibration curve evolution
    // ═══════════════════════════════════════════════════════
    console.log('═'.repeat(90));
    console.log('PART 1: HOW THE CALIBRATOR EVOLVES (raw model prob → calibrated prob)');
    console.log('═'.repeat(90));
    console.log('Shows what the calibrator outputs at various raw model probabilities\n');

    console.log(`${'Date'.padEnd(12)} ${'Train#'.padEnd(8)} ${'0.50'.padEnd(7)} ${'0.55'.padEnd(7)} ${'0.60'.padEnd(7)} ${'0.65'.padEnd(7)} ${'0.70'.padEnd(7)} ${'0.75'.padEnd(7)} ${'0.80'.padEnd(7)} ${'0.85'.padEnd(7)} ${'0.90'.padEnd(7)} ${'0.95'.padEnd(7)}`);
    console.log('-'.repeat(90));
    for(const cp of calCheckpoints){
      let line = `${cp.date.padEnd(12)} ${String(cp.trainingSize).padEnd(8)}`;
      for(const cv of cp.calValues){
        line += ` ${cv.cal.toFixed(3).padEnd(6)}`;
      }
      console.log(line);
    }

    console.log('\nKey insight: If model says 70% but calibrated says 55%, the model is overconfident.');
    console.log('A mature calibrator should show LOWER values than raw (correcting overconfidence).\n');

    // ═══════════════════════════════════════════════════════
    // PART 2: Performance by calibrator training size buckets
    // ═══════════════════════════════════════════════════════
    console.log('═'.repeat(90));
    console.log('PART 2: PERFORMANCE BY CALIBRATOR MATURITY');
    console.log('═'.repeat(90));

    const sizeBuckets = [
      { label: '50–200 samples (early)', lo: 50, hi: 200 },
      { label: '200–400 samples', lo: 200, hi: 400 },
      { label: '400–600 samples', lo: 400, hi: 600 },
      { label: '600–800 samples', lo: 600, hi: 800 },
      { label: '800–1000 samples', lo: 800, hi: 1000 },
      { label: '1000+ samples (mature)', lo: 1000, hi: 99999 },
    ];

    console.log(`${'Calibrator Stage'.padEnd(30)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(10)} ${'Avg CalEdge'.padEnd(12)}`);
    console.log('-'.repeat(90));

    for(const bucket of sizeBuckets){
      const bets=betLog.filter(b=>b.trainSize>=bucket.lo&&b.trainSize<bucket.hi);
      const w=bets.filter(b=>b.won).length;
      const l=bets.length-w;
      const pl=bets.reduce((s,b)=>s+b.pl,0);
      const wag=bets.length*1000;
      const total=bets.length;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const avgEdge=total>0?(bets.reduce((s,b)=>s+parseFloat(b.calEdge),0)/total).toFixed(1)+'%':'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${bucket.label.padEnd(30)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(10)} ${avgEdge.padEnd(12)}`);
    }

    // ═══════════════════════════════════════════════════════
    // PART 3: Performance if we ONLY started at 400+ samples
    // ═══════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(90));
    console.log('PART 3: WHAT IF WE REQUIRED MORE TRAINING DATA BEFORE BETTING?');
    console.log('═'.repeat(90));

    const minThresholds = [50, 100, 200, 300, 400, 500, 600, 800];
    console.log(`${'Min Train Samples'.padEnd(22)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(10)} ${'First Bet Date'.padEnd(14)}`);
    console.log('-'.repeat(84));

    for(const minTrain of minThresholds){
      const bets=betLog.filter(b=>b.trainSize>=minTrain);
      const w=bets.filter(b=>b.won).length;
      const l=bets.length-w;
      const pl=bets.reduce((s,b)=>s+b.pl,0);
      const wag=bets.length*1000;
      const total=bets.length;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      const firstDate=bets.length>0?bets[0].date:'-';
      console.log(`${('≥'+minTrain).padEnd(22)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(10)} ${firstDate.padEnd(14)}`);
    }

    // ═══════════════════════════════════════════════════════
    // PART 4: Every single bet detail
    // ═══════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(110));
    console.log('PART 4: ALL BETS (Dogs ≤+150 @ 5% cal edge, full season)');
    console.log('═'.repeat(110));
    console.log(`${'Date'.padEnd(12)} ${'Train#'.padEnd(7)} ${'Team'.padEnd(30)} ${'Side'.padEnd(6)} ${'Odds'.padEnd(7)} ${'Raw%'.padEnd(7)} ${'Cal%'.padEnd(7)} ${'Imp%'.padEnd(7)} ${'Edge'.padEnd(7)} ${'Result'.padEnd(8)} ${'P/L'.padEnd(10)}`);
    console.log('-'.repeat(110));

    let cumPL = 0;
    for(const b of betLog){
      cumPL += b.pl;
      const marker=b.won?'✅':'❌';
      const plStr=b.won?`+$${b.pl.toLocaleString()}`:`-$${Math.abs(b.pl).toLocaleString()}`;
      const oddsStr=b.odds>0?`+${b.odds}`:`${b.odds}`;
      console.log(`${b.date.padEnd(12)} ${String(b.trainSize).padEnd(7)} ${b.team.substring(0,29).padEnd(30)} ${b.side.padEnd(6)} ${oddsStr.padEnd(7)} ${b.rawProb.padEnd(7)} ${b.calProb.padEnd(7)} ${b.implied.padEnd(7)} ${b.calEdge.padEnd(7)} ${marker.padEnd(6)} ${plStr.padEnd(10)}`);
    }

    console.log('\n' + '-'.repeat(50));
    console.log(`TOTAL: ${betLog.filter(b=>b.won).length}-${betLog.filter(b=>!b.won).length}  |  P/L: ${(cumPL>=0?'+':'')}$${cumPL.toLocaleString()}  |  ROI: ${((cumPL/(betLog.length*1000))*100).toFixed(1)}%`);

  }catch(e){console.error('Error:',e);}
})();
