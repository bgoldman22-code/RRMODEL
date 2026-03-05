#!/usr/bin/env node
// NCAA MBB — Maturity analysis for EACH odds band
// Key question: Is +151-200 actually good with a mature calibrator?

const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function normalize(s){return(s||'').toLowerCase().replace(/\./g,'').replace(/[''´`]/g,'').replace(/\s+/g,' ').trim();}
function keyWords(name){const n=normalize(name);return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks|rattlers|golden lions|lancers|blue hose)$/g,'').trim().split(' ').filter(w=>w.length>2);}
function findGame(p,games){const hn=normalize(p.home_team),an=normalize(p.away_team),hk=keyWords(p.home_team),ak=keyWords(p.away_team);for(const g of games){const eh=normalize(g.homeName||''),ea=normalize(g.awayName||''),ehs=normalize(g.homeShort||''),eas=normalize(g.awayShort||'');const hm=eh.includes(hn)||hn.includes(eh)||ehs.includes(hn)||hn.includes(ehs)||(hk[0]&&(eh.includes(hk[0])||ehs.includes(hk[0])));const am=ea.includes(an)||an.includes(ea)||eas.includes(an)||an.includes(eas)||(ak[0]&&(ea.includes(ak[0])||eas.includes(ak[0])));if(hm&&am)return g;const ehk=keyWords(g.homeName||''),eak=keyWords(g.awayName||'');if(hk.some(k=>ehk.includes(k)||eh.includes(k))&&ak.some(k=>eak.includes(k)||ea.includes(k)))return g;}return null;}
function oddsPL(won,odds,bet){if(won)return odds>0?bet*(odds/100):bet*(100/Math.abs(odds));return -bet;}
function impliedProb(odds){return odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100);}
function fitIsotonic(data){if(data.length===0)return x=>x;const sorted=[...data].sort((a,b)=>a.x-b.x);const xs=sorted.map(d=>d.x),ys=sorted.map(d=>d.y);const n=xs.length;const result=[...ys];const weight=new Array(n).fill(1);let i=0;while(i<n-1){if(result[i]>result[i+1]){const merged=(result[i]*weight[i]+result[i+1]*weight[i+1])/(weight[i]+weight[i+1]);result[i]=merged;result[i+1]=merged;weight[i]=weight[i]+weight[i+1];weight[i+1]=weight[i];let j=i;while(j>0&&result[j-1]>result[j]){const m2=(result[j-1]*weight[j-1]+result[j]*weight[j])/(weight[j-1]+weight[j]);result[j-1]=m2;result[j]=m2;weight[j-1]=weight[j-1]+weight[j];weight[j]=weight[j-1];j--;}i++;}else{i++;}}const blocks=[];let bi=0;while(bi<n){let bj=bi;while(bj<n-1&&Math.abs(result[bj]-result[bj+1])<1e-9)bj++;blocks.push({lo:xs[bi],hi:xs[bj],val:result[bi]});bi=bj+1;}return function(x){if(x<=blocks[0].lo)return blocks[0].val;if(x>=blocks[blocks.length-1].hi)return blocks[blocks.length-1].val;for(const b of blocks){if(x>=b.lo&&x<=b.hi)return b.val;}for(let k=0;k<blocks.length-1;k++){if(x>blocks[k].hi&&x<blocks[k+1].lo){const t=(x-blocks[k].hi)/(blocks[k+1].lo-blocks[k].hi);return blocks[k].val+t*(blocks[k+1].val-blocks[k].val);}}return x;};}
function yyyymmdd(ds){return ds.replace(/-/g,'');}

(async()=>{
  try{
    const lastGameDate='2026-03-04';
    const seasonStart='2025-11-04';
    const MIN_TRAINING_DAYS=14;

    console.log('NCAA MBB — ODDS BAND × CALIBRATOR MATURITY DEEP DIVE');
    console.log('Question: Is +151-200 actually profitable with a MATURE calibrator?\n');

    // Fetch picks
    const allDates=[];
    for(let d=new Date(seasonStart+'T12:00:00Z');d<=new Date(lastGameDate+'T12:00:00Z');d.setDate(d.getDate()+1)){allDates.push(d.toISOString().slice(0,10));}
    const allPicksByFile={};let fetchedFiles=0;const batchSize=15;
    for(let i=0;i<allDates.length;i+=batchSize){const batch=allDates.slice(i,i+batchSize);const results=await Promise.all(batch.map(async f=>{try{const r=await fetch(BASE+f+'.json');if(!r.ok)return null;const d=await r.json();return{date:f,picks:d.picks||[]};}catch(e){return null;}}));for(const r of results){if(r&&r.picks.length>0){allPicksByFile[r.date]=r.picks;fetchedFiles++;}}}
    console.log(`Fetched ${fetchedFiles} pick files`);

    const pickDates=Object.keys(allPicksByFile).sort();
    const espnDatesNeeded=new Set();
    for(const pd of pickDates){espnDatesNeeded.add(pd);const next=new Date(pd+'T12:00:00Z');next.setDate(next.getDate()+1);espnDatesNeeded.add(next.toISOString().slice(0,10));}
    const espnGamesByDate={};const espnArr=[...espnDatesNeeded].sort();
    for(let i=0;i<espnArr.length;i+=batchSize){const batch=espnArr.slice(i,i+batchSize);const results=await Promise.all(batch.map(async checkDate=>{try{const r=await fetch(`${ESPN}?dates=${yyyymmdd(checkDate)}&limit=300&groups=50`);if(!r.ok)return null;const jd=await r.json();const games=[];for(const ev of(jd.events||[])){const comp=ev.competitions?.[0];if(!comp?.status?.type?.completed)continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away)continue;games.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner:parseInt(home.score)>parseInt(away.score)?'home':'away'});}return{date:checkDate,games};}catch(e){return null;}}));for(const r of results){if(r){espnGamesByDate[r.date]=r.games;}}}
    console.log(`ESPN dates fetched: ${Object.keys(espnGamesByDate).length}\n`);

    function gradePicksForDate(fileDate){const picks=allPicksByFile[fileDate]||[];const graded=[];const nextDay=new Date(fileDate+'T12:00:00Z');nextDay.setDate(nextDay.getDate()+1);const espnPools=[...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDay.toISOString().slice(0,10)]||[])];for(const p of picks){const g=findGame(p,espnPools);if(!g)continue;graded.push({model_prob:p.model_prob,won:g.winner===p.side,odds:p.odds,side:p.side});}return graded;}

    // Define odds bands and edge thresholds to test
    const configs = [
      { label: 'Dogs +100–150 @ 5% edge', lo: 100, hi: 150, minEdge: 0.05 },
      { label: 'Dogs +151–200 @ 5% edge', lo: 151, hi: 200, minEdge: 0.05 },
      { label: 'Dogs +151–200 @ 8% edge', lo: 151, hi: 200, minEdge: 0.08 },
      { label: 'Dogs +151–200 @ 10% edge', lo: 151, hi: 200, minEdge: 0.10 },
      { label: 'Dogs +151–200 @ 15% edge', lo: 151, hi: 200, minEdge: 0.15 },
      { label: 'Dogs +201–250 @ 5% edge', lo: 201, hi: 250, minEdge: 0.05 },
      { label: 'Dogs +201–250 @ 10% edge', lo: 201, hi: 250, minEdge: 0.10 },
      { label: 'Dogs +201–250 @ 15% edge', lo: 201, hi: 250, minEdge: 0.15 },
    ];

    // Maturity buckets
    const matBuckets = [
      { label: '<400 (immature)', lo: 0, hi: 400 },
      { label: '400–800 (mid)', lo: 400, hi: 800 },
      { label: '800–1000', lo: 800, hi: 1000 },
      { label: '1000+ (mature)', lo: 1000, hi: 99999 },
    ];

    // Collect bets per config
    const betsByConfig = {};
    for (const c of configs) betsByConfig[c.label] = [];

    const allTraining=[];
    let daysProcessed=0;
    let bettingStarted=false;

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

      let calibrate=x=>x;
      if(allTraining.length>=50)calibrate=fitIsotonic(allTraining);
      const trainingSize=allTraining.length;

      const espnGames=[...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDayStr]||[])];
      const picks=allPicksByFile[fileDate]||[];

      for(const c of configs){
        for(const p of picks){
          if(p.odds<c.lo||p.odds>c.hi)continue;
          const calProb=calibrate(p.model_prob);
          const imp=impliedProb(p.odds);
          const calEdge=calProb-imp;
          if(calEdge<c.minEdge)continue;
          const g=findGame(p,espnGames);
          if(!g)continue;
          const won=g.winner===p.side;
          const bet=1000;
          const pl=Math.round(oddsPL(won,p.odds,bet));
          betsByConfig[c.label].push({date:fileDate,trainSize:trainingSize,team:p.side==='home'?p.home_team:p.away_team,side:p.side,odds:p.odds,rawProb:p.model_prob,calProb,calEdge,won,pl});
        }
      }

      for(const g of graded)allTraining.push({x:g.model_prob,y:g.won?1:0});
      daysProcessed++;
    }

    // ═══════════════════════════════════════════════════════
    // Print cross-tab: config × maturity
    // ═══════════════════════════════════════════════════════
    console.log('═'.repeat(110));
    console.log('ODDS BAND × CALIBRATOR MATURITY (full season)');
    console.log('═'.repeat(110));

    for(const c of configs){
      const bets=betsByConfig[c.label];
      console.log(`\n${'─'.repeat(100)}`);
      console.log(`  ${c.label}  (${bets.length} total bets)`);
      console.log(`${'─'.repeat(100)}`);
      console.log(`${'Maturity'.padEnd(22)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(10)} ${'Avg CalEdge'.padEnd(12)}`);
      console.log('-'.repeat(82));

      // Full season first
      {
        const w=bets.filter(b=>b.won).length;const l=bets.length-w;
        const pl=bets.reduce((s,b)=>s+b.pl,0);const wag=bets.length*1000;
        const winPct=bets.length>0?((w/bets.length)*100).toFixed(1)+'%':'-';
        const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
        const avgEdge=bets.length>0?(bets.reduce((s,b)=>s+b.calEdge,0)/bets.length*100).toFixed(1)+'%':'-';
        const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
        console.log(`${'FULL SEASON'.padEnd(22)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(bets.length).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(10)} ${avgEdge}`);
      }

      for(const mb of matBuckets){
        const subset=bets.filter(b=>b.trainSize>=mb.lo&&b.trainSize<mb.hi);
        const w=subset.filter(b=>b.won).length;const l=subset.length-w;
        const pl=subset.reduce((s,b)=>s+b.pl,0);const wag=subset.length*1000;
        const winPct=subset.length>0?((w/subset.length)*100).toFixed(1)+'%':'-';
        const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
        const avgEdge=subset.length>0?(subset.reduce((s,b)=>s+b.calEdge,0)/subset.length*100).toFixed(1)+'%':'-';
        const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
        console.log(`  ${mb.label.padEnd(20)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(subset.length).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(10)} ${avgEdge}`);
      }
    }

    // ═══════════════════════════════════════════════════════
    // EVERY BET for +151-200 range (all edges)
    // ═══════════════════════════════════════════════════════
    console.log('\n\n' + '═'.repeat(120));
    console.log('EVERY BET: Dogs +151–200 @ 5% edge (full season)');
    console.log('═'.repeat(120));
    console.log(`${'Date'.padEnd(12)} ${'Train#'.padEnd(7)} ${'Team'.padEnd(30)} ${'Side'.padEnd(6)} ${'Odds'.padEnd(7)} ${'Raw%'.padEnd(7)} ${'Cal%'.padEnd(7)} ${'Imp%'.padEnd(7)} ${'Edge'.padEnd(7)} ${'Result'.padEnd(8)} ${'P/L'.padEnd(10)} ${'CumPL'.padEnd(10)}`);
    console.log('-'.repeat(120));

    let cumPL=0;
    for(const b of betsByConfig['Dogs +151–200 @ 5% edge']){
      cumPL+=b.pl;
      const marker=b.won?'✅':'❌';
      const plStr=b.won?`+$${b.pl.toLocaleString()}`:`-$${Math.abs(b.pl).toLocaleString()}`;
      const cumStr=(cumPL>=0?'+':'')+`$${cumPL.toLocaleString()}`;
      const oddsStr=`+${b.odds}`;
      console.log(`${b.date.padEnd(12)} ${String(b.trainSize).padEnd(7)} ${b.team.substring(0,29).padEnd(30)} ${b.side.padEnd(6)} ${oddsStr.padEnd(7)} ${(b.rawProb*100).toFixed(1).padEnd(7)} ${(b.calProb*100).toFixed(1).padEnd(7)} ${(impliedProb(b.odds)*100).toFixed(1).padEnd(7)} ${(b.calEdge*100).toFixed(1).padEnd(7)} ${marker.padEnd(6)} ${plStr.padEnd(10)} ${cumStr}`);
    }

    // Same for +201-250
    console.log('\n\n' + '═'.repeat(120));
    console.log('EVERY BET: Dogs +201–250 @ 10% edge (full season)');
    console.log('═'.repeat(120));
    console.log(`${'Date'.padEnd(12)} ${'Train#'.padEnd(7)} ${'Team'.padEnd(30)} ${'Side'.padEnd(6)} ${'Odds'.padEnd(7)} ${'Raw%'.padEnd(7)} ${'Cal%'.padEnd(7)} ${'Imp%'.padEnd(7)} ${'Edge'.padEnd(7)} ${'Result'.padEnd(8)} ${'P/L'.padEnd(10)} ${'CumPL'.padEnd(10)}`);
    console.log('-'.repeat(120));

    cumPL=0;
    for(const b of betsByConfig['Dogs +201–250 @ 10% edge']){
      cumPL+=b.pl;
      const marker=b.won?'✅':'❌';
      const plStr=b.won?`+$${b.pl.toLocaleString()}`:`-$${Math.abs(b.pl).toLocaleString()}`;
      const cumStr=(cumPL>=0?'+':'')+`$${cumPL.toLocaleString()}`;
      const oddsStr=`+${b.odds}`;
      console.log(`${b.date.padEnd(12)} ${String(b.trainSize).padEnd(7)} ${b.team.substring(0,29).padEnd(30)} ${b.side.padEnd(6)} ${oddsStr.padEnd(7)} ${(b.rawProb*100).toFixed(1).padEnd(7)} ${(b.calProb*100).toFixed(1).padEnd(7)} ${(impliedProb(b.odds)*100).toFixed(1).padEnd(7)} ${(b.calEdge*100).toFixed(1).padEnd(7)} ${marker.padEnd(6)} ${plStr.padEnd(10)} ${cumStr}`);
    }

    // ═══════════════════════════════════════════════════════
    // FINAL: Composite with mature calibrator only
    // ═══════════════════════════════════════════════════════
    console.log('\n\n' + '═'.repeat(100));
    console.log('COMPOSITE STRATEGIES — MATURE CALIBRATOR ONLY (1000+ samples, ~Feb 17+)');
    console.log('═'.repeat(100));

    const composites = [
      { name: 'Dogs ≤+150 @ 5%', configs: ['Dogs +100–150 @ 5% edge'] },
      { name: 'Dogs ≤+150@5% + 151-200@10%', configs: ['Dogs +100–150 @ 5% edge', 'Dogs +151–200 @ 10% edge'] },
      { name: 'Dogs ≤+150@5% + 151-200@15%', configs: ['Dogs +100–150 @ 5% edge', 'Dogs +151–200 @ 15% edge'] },
      { name: 'Dogs ≤+150@5% + 201-250@10%', configs: ['Dogs +100–150 @ 5% edge', 'Dogs +201–250 @ 10% edge'] },
      { name: 'Dogs ≤+150@5% + skip 151-200 + 201-250@10%', configs: ['Dogs +100–150 @ 5% edge', 'Dogs +201–250 @ 10% edge'] },
      { name: 'Dogs ≤+150@5% + 151-200@10% + 201-250@10%', configs: ['Dogs +100–150 @ 5% edge', 'Dogs +151–200 @ 10% edge', 'Dogs +201–250 @ 10% edge'] },
    ];

    console.log(`${'Strategy'.padEnd(55)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(101));

    for(const comp of composites){
      // Merge bets from all configs, dedupe by date+team
      let allBets=[];
      for(const cname of comp.configs){
        allBets.push(...(betsByConfig[cname]||[]).filter(b=>b.trainSize>=1000));
      }
      // Dedupe
      const seen=new Set();
      allBets=allBets.filter(b=>{const k=`${b.date}|${b.team}|${b.side}`;if(seen.has(k))return false;seen.add(k);return true;});
      allBets.sort((a,b)=>a.date.localeCompare(b.date));

      const w=allBets.filter(b=>b.won).length;const l=allBets.length-w;
      const pl=allBets.reduce((s,b)=>s+b.pl,0);const wag=allBets.length*1000;
      const winPct=allBets.length>0?((w/allBets.length)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${comp.name.padEnd(55)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(allBets.length).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

  }catch(e){console.error('Error:',e);}
})();
