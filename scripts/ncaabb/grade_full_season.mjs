#!/usr/bin/env node
// NCAA MBB — FULL SEASON backtest of V2 strategies
// Walk-forward isotonic calibration, every day from season start

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
    // Minimum training days before we start betting
    const MIN_TRAINING_DAYS = 14;

    console.log('NCAA MBB — FULL SEASON BACKTEST');
    console.log(`Season: ${seasonStart} → ${lastGameDate}`);
    console.log(`Min ${MIN_TRAINING_DAYS} days of data before betting begins\n`);

    // ── Fetch ALL pick files ──
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

    const pickDates=Object.keys(allPicksByFile).sort();
    console.log(`Pick dates range: ${pickDates[0]} → ${pickDates[pickDates.length-1]}`);

    // ── Fetch ESPN scores for EVERY pick date ──
    // Each pick file's games could be on that date or the next day
    const espnDatesNeeded=new Set();
    for(const pd of pickDates){
      espnDatesNeeded.add(pd);
      const next=new Date(pd+'T12:00:00Z');next.setDate(next.getDate()+1);
      espnDatesNeeded.add(next.toISOString().slice(0,10));
    }
    console.log(`Need ESPN data for ${espnDatesNeeded.size} dates, fetching...`);

    const espnGamesByDate={};
    const espnBatches=[];
    const espnArr=[...espnDatesNeeded].sort();
    for(let i=0;i<espnArr.length;i+=batchSize){espnBatches.push(espnArr.slice(i,i+batchSize));}
    
    let espnFetched=0;
    for(const batch of espnBatches){
      const results=await Promise.all(batch.map(async checkDate=>{
        try{
          const r=await fetch(`${ESPN}?dates=${yyyymmdd(checkDate)}&limit=300&groups=50`);
          if(!r.ok)return null;
          const jd=await r.json();const games=[];
          for(const ev of(jd.events||[])){const comp=ev.competitions?.[0];if(!comp?.status?.type?.completed)continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away)continue;games.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner:parseInt(home.score)>parseInt(away.score)?'home':'away'});}
          return{date:checkDate,games};
        }catch(e){return null;}
      }));
      for(const r of results){if(r){espnGamesByDate[r.date]=r.games;espnFetched++;}}
      if(espnFetched%50===0)process.stdout.write(`  ${espnFetched} ESPN dates fetched...\r`);
    }
    console.log(`ESPN dates fetched: ${espnFetched}                    `);

    // ── Grade function ──
    function gradePicksForDate(fileDate){
      const picks=allPicksByFile[fileDate]||[];const graded=[];
      const nextDay=new Date(fileDate+'T12:00:00Z');nextDay.setDate(nextDay.getDate()+1);
      const espnPools=[...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDay.toISOString().slice(0,10)]||[])];
      for(const p of picks){const g=findGame(p,espnPools);if(!g)continue;graded.push({model_prob:p.model_prob,won:g.winner===p.side,odds:p.odds,side:p.side});}
      return graded;
    }

    // ── Define strategies ──
    const strategies = [
      { name: 'V1 (all picks, no filter)',    filter: (p, calEdge) => true, minEdge: 0 },
      { name: 'Dogs ≤+150 @ 5%',             filter: (p) => p.odds > 0 && p.odds <= 150, minEdge: 0.05 },
      { name: 'Dogs ≤+150 @ 5% + skip 151-200 + 201-250@10%',
        tiered: [{lo:1,hi:150,edge:0.05},{lo:201,hi:250,edge:0.10}], minEdge: 0 },
      { name: 'Dogs ≤+150 @ 5% + 151-250@10%',
        tiered: [{lo:1,hi:150,edge:0.05},{lo:151,hi:250,edge:0.10}], minEdge: 0 },
      { name: 'Dogs ≤+200 @ 5%',             filter: (p) => p.odds > 0 && p.odds <= 200, minEdge: 0.05 },
      { name: 'Away+Dog ≤+150 @ 5% (old V2)', filter: (p) => p.side==='away' && p.odds > 0 && p.odds <= 150, minEdge: 0.05 },
    ];

    // Accumulate results per strategy, per date
    const stratResults = {};
    for (const s of strategies) {
      stratResults[s.name] = { daily: [], totalW: 0, totalL: 0, totalPL: 0, totalWag: 0, monthlyBuckets: {} };
    }

    // ── Walk through every game date ──
    // Build training set incrementally
    const allTraining = [];
    let bettingStarted = false;
    let firstBetDate = null;
    let daysProcessed = 0;

    for (const fileDate of pickDates) {
      // Find game dates (could be fileDate or fileDate+1)
      const nextDay = new Date(fileDate+'T12:00:00Z'); nextDay.setDate(nextDay.getDate()+1);
      const nextDayStr = nextDay.toISOString().slice(0,10);

      // Grade this file's picks to add to training for future days
      const graded = gradePicksForDate(fileDate);

      // Do we have enough training data to start betting?
      if (!bettingStarted) {
        // Add to training
        for (const g of graded) allTraining.push({ x: g.model_prob, y: g.won ? 1 : 0 });
        // Check if we have enough distinct dates
        daysProcessed++;
        if (daysProcessed >= MIN_TRAINING_DAYS && allTraining.length >= 50) {
          bettingStarted = true;
          firstBetDate = fileDate;
          console.log(`\nBetting starts after ${daysProcessed} days of training (${allTraining.length} samples)`);
          console.log(`First bet date: ${fileDate}\n`);
        }
        continue;
      }

      // ── Build walk-forward calibrator from all PRIOR data ──
      let calibrate = x => x;
      if (allTraining.length >= 50) calibrate = fitIsotonic(allTraining);

      // ── Find ESPN games for this pick file ──
      const espnGames = [...(espnGamesByDate[fileDate]||[]), ...(espnGamesByDate[nextDayStr]||[])];

      // ── Process each strategy ──
      for (const strat of strategies) {
        const picks = allPicksByFile[fileDate] || [];
        let w = 0, l = 0, pl = 0, wag = 0;

        for (const p of picks) {
          // V1: no filter
          if (strat.name === 'V1 (all picks, no filter)') {
            const g = findGame(p, espnGames);
            if (!g) continue;
            const won = g.winner === p.side;
            const bet = p.bet_size_dollars || 1000;
            pl += Math.round(oddsPL(won, p.odds, bet));
            wag += bet; w += won?1:0; l += won?0:1;
            continue;
          }

          // Tiered strategies
          if (strat.tiered) {
            if (p.odds <= 0) continue;
            let qualifies = false;
            for (const tier of strat.tiered) {
              if (p.odds >= tier.lo && p.odds <= tier.hi) {
                const calProb = calibrate(p.model_prob);
                const calEdge = calProb - impliedProb(p.odds);
                if (calEdge >= tier.edge) { qualifies = true; break; }
              }
            }
            if (!qualifies) continue;
          } else {
            // Simple filter strategies
            if (!strat.filter(p)) continue;
            if (strat.minEdge > 0) {
              const calProb = calibrate(p.model_prob);
              const calEdge = calProb - impliedProb(p.odds);
              if (calEdge < strat.minEdge) continue;
            }
          }

          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1;
        }

        const sr = stratResults[strat.name];
        sr.daily.push({ date: fileDate, w, l, pl, wag });
        sr.totalW += w; sr.totalL += l; sr.totalPL += pl; sr.totalWag += wag;

        // Monthly bucket
        const monthKey = fileDate.slice(0, 7); // YYYY-MM
        if (!sr.monthlyBuckets[monthKey]) sr.monthlyBuckets[monthKey] = { w: 0, l: 0, pl: 0, wag: 0 };
        sr.monthlyBuckets[monthKey].w += w;
        sr.monthlyBuckets[monthKey].l += l;
        sr.monthlyBuckets[monthKey].pl += pl;
        sr.monthlyBuckets[monthKey].wag += wag;
      }

      // Add TODAY's results to training for future days
      for (const g of graded) allTraining.push({ x: g.model_prob, y: g.won ? 1 : 0 });
      daysProcessed++;
    }

    console.log(`Total training samples by end: ${allTraining.length}`);
    console.log(`Days with picks processed for betting: ${daysProcessed - MIN_TRAINING_DAYS}`);

    // ═══════════════════════════════════════════════════════
    // RESULTS
    // ═══════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(105));
    console.log('FULL SEASON RESULTS');
    console.log('═'.repeat(105));
    console.log(`${'Strategy'.padEnd(50)} ${'Record'.padEnd(12)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(7)} ${'Wagered'.padEnd(14)} ${'P/L'.padEnd(16)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(105));

    for (const strat of strategies) {
      const sr = stratResults[strat.name];
      const total = sr.totalW + sr.totalL;
      const winPct = total > 0 ? ((sr.totalW / total) * 100).toFixed(1) + '%' : '-';
      const roi = sr.totalWag > 0 ? ((sr.totalPL / sr.totalWag) * 100).toFixed(1) + '%' : '-';
      const plStr = (sr.totalPL >= 0 ? '+' : '') + '$' + sr.totalPL.toLocaleString();
      console.log(`${strat.name.padEnd(50)} ${(sr.totalW + '-' + sr.totalL).padEnd(12)} ${winPct.padEnd(8)} ${String(total).padEnd(7)} ${'$' + sr.totalWag.toLocaleString().padEnd(13)} ${plStr.padEnd(16)} ${roi.padEnd(8)}`);
    }

    // ═══════════════════════════════════════════════════════
    // MONTHLY BREAKDOWN for key strategies
    // ═══════════════════════════════════════════════════════
    const keyStrats = [
      'Dogs ≤+150 @ 5%',
      'Dogs ≤+150 @ 5% + skip 151-200 + 201-250@10%',
      'Dogs ≤+150 @ 5% + 151-250@10%',
      'V1 (all picks, no filter)'
    ];

    for (const sname of keyStrats) {
      const sr = stratResults[sname];
      if (!sr) continue;
      console.log('\n' + '─'.repeat(80));
      console.log(`MONTHLY: ${sname}`);
      console.log('─'.repeat(80));
      console.log(`${'Month'.padEnd(12)} ${'Record'.padEnd(12)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(7)} ${'P/L'.padEnd(16)} ${'ROI'.padEnd(10)} ${'Cum P/L'.padEnd(14)}`);
      console.log('-'.repeat(79));

      const months = Object.keys(sr.monthlyBuckets).sort();
      let cumPL = 0;
      for (const m of months) {
        const mb = sr.monthlyBuckets[m];
        const total = mb.w + mb.l;
        if (total === 0) continue;
        cumPL += mb.pl;
        const winPct = ((mb.w / total) * 100).toFixed(1) + '%';
        const roi = mb.wag > 0 ? ((mb.pl / mb.wag) * 100).toFixed(1) + '%' : '-';
        const plStr = (mb.pl >= 0 ? '+' : '') + '$' + mb.pl.toLocaleString();
        const cumStr = (cumPL >= 0 ? '+' : '') + '$' + cumPL.toLocaleString();
        console.log(`${m.padEnd(12)} ${(mb.w + '-' + mb.l).padEnd(12)} ${winPct.padEnd(8)} ${String(total).padEnd(7)} ${plStr.padEnd(16)} ${roi.padEnd(10)} ${cumStr.padEnd(14)}`);
      }
    }

    // ═══════════════════════════════════════════════════════
    // Rolling equity curve (every 7 days) for Dog ≤+150
    // ═══════════════════════════════════════════════════════
    console.log('\n' + '─'.repeat(80));
    console.log('ROLLING EQUITY CURVE — Dogs ≤+150 @ 5%');
    console.log('─'.repeat(80));
    const sr150 = stratResults['Dogs ≤+150 @ 5%'];
    let cumPL = 0; let cumW = 0; let cumL = 0;
    const dailySorted = sr150.daily.filter(d => d.w + d.l > 0);
    for (const d of dailySorted) {
      cumPL += d.pl; cumW += d.w; cumL += d.l;
      const total = cumW + cumL;
      const cumROI = sr150.totalWag > 0 ? ((cumPL / (total * 1000)) * 100).toFixed(1) + '%' : '-';
      const bar = cumPL > 0 ? '█'.repeat(Math.min(40, Math.round(cumPL / 500))) : '░'.repeat(Math.min(40, Math.round(Math.abs(cumPL) / 500)));
      const plStr = (cumPL >= 0 ? '+' : '') + '$' + cumPL.toLocaleString();
      console.log(`${d.date}  ${(cumW+'-'+cumL).padEnd(10)} ${plStr.padEnd(14)} ${cumROI.padEnd(8)} ${cumPL >= 0 ? '📈' : '📉'} ${bar}`);
    }

  }catch(e){console.error('Error:',e);}
})();
