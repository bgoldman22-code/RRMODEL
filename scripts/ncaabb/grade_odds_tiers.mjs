#!/usr/bin/env node
// NCAA MBB — Analyze underdog tiers by odds range and min-edge thresholds
// Goal: Find the optimal odds ceiling and whether higher-odds dogs need higher edges

const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function normalize(s) { return (s||'').toLowerCase().replace(/\./g,'').replace(/[''´`]/g,'').replace(/\s+/g,' ').trim(); }
function keyWords(name) {
  const n = normalize(name);
  return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks|rattlers|golden lions|lancers|blue hose)$/g,'').trim().split(' ').filter(w=>w.length>2);
}
function findGame(p,games){const hn=normalize(p.home_team),an=normalize(p.away_team),hk=keyWords(p.home_team),ak=keyWords(p.away_team);for(const g of games){const eh=normalize(g.homeName||''),ea=normalize(g.awayName||''),ehs=normalize(g.homeShort||''),eas=normalize(g.awayShort||'');const hm=eh.includes(hn)||hn.includes(eh)||ehs.includes(hn)||hn.includes(ehs)||(hk[0]&&(eh.includes(hk[0])||ehs.includes(hk[0])));const am=ea.includes(an)||an.includes(ea)||eas.includes(an)||an.includes(eas)||(ak[0]&&(ea.includes(ak[0])||eas.includes(ak[0])));if(hm&&am)return g;const ehk=keyWords(g.homeName||''),eak=keyWords(g.awayName||'');if(hk.some(k=>ehk.includes(k)||eh.includes(k))&&ak.some(k=>eak.includes(k)||ea.includes(k)))return g;}return null;}
function oddsPL(won,odds,bet){if(won)return odds>0?bet*(odds/100):bet*(100/Math.abs(odds));return -bet;}
function impliedProb(odds){return odds>0?100/(odds+100):Math.abs(odds)/(Math.abs(odds)+100);}

function fitIsotonic(data) {
  if (data.length === 0) return x => x;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  const xs = sorted.map(d => d.x), ys = sorted.map(d => d.y);
  const n = xs.length; const result = [...ys]; const weight = new Array(n).fill(1);
  let i = 0;
  while (i < n - 1) {
    if (result[i] > result[i + 1]) {
      const merged = (result[i]*weight[i]+result[i+1]*weight[i+1])/(weight[i]+weight[i+1]);
      result[i]=merged;result[i+1]=merged;weight[i]=weight[i]+weight[i+1];weight[i+1]=weight[i];
      let j=i;while(j>0&&result[j-1]>result[j]){const m2=(result[j-1]*weight[j-1]+result[j]*weight[j])/(weight[j-1]+weight[j]);result[j-1]=m2;result[j]=m2;weight[j-1]=weight[j-1]+weight[j];weight[j]=weight[j-1];j--;}i++;
    } else { i++; }
  }
  const blocks=[];let bi=0;
  while(bi<n){let bj=bi;while(bj<n-1&&Math.abs(result[bj]-result[bj+1])<1e-9)bj++;blocks.push({lo:xs[bi],hi:xs[bj],val:result[bi]});bi=bj+1;}
  return function(x){
    if(x<=blocks[0].lo)return blocks[0].val;if(x>=blocks[blocks.length-1].hi)return blocks[blocks.length-1].val;
    for(const b of blocks){if(x>=b.lo&&x<=b.hi)return b.val;}
    for(let k=0;k<blocks.length-1;k++){if(x>blocks[k].hi&&x<blocks[k+1].lo){const t=(x-blocks[k].hi)/(blocks[k+1].lo-blocks[k].hi);return blocks[k].val+t*(blocks[k+1].val-blocks[k].val);}}
    return x;
  };
}

function dateRange(endDate, days) {
  const dates = [];
  for (let i = 0; i < days; i++) { const d = new Date(endDate); d.setDate(d.getDate() - i); dates.push(d.toISOString().slice(0, 10)); }
  return dates;
}
function yyyymmdd(ds) { return ds.replace(/-/g, ''); }

(async () => {
  try {
    const today = '2026-03-05';
    const gameDate = new Date(today); gameDate.setDate(gameDate.getDate() - 1);
    const allGameDates = dateRange(gameDate, 16);

    console.log('NCAA MBB — Odds Tier Analysis (16 days: 2/17 → 3/4)');
    console.log('Walk-forward isotonic calibration applied to all tiers\n');

    // Fetch ALL pick files for the season
    const seasonStart = new Date('2025-11-04');
    const allDates = [];
    for (let d = new Date(seasonStart); d <= gameDate; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    const allPicksByFile = {};
    let fetchedFiles = 0;
    for (const f of allDates) {
      try { const r = await fetch(BASE + f + '.json'); if (!r.ok) continue; const d = await r.json(); allPicksByFile[f] = d.picks || []; fetchedFiles++; } catch(e){}
    }
    console.log(`Fetched ${fetchedFiles} pick files`);

    // Fetch ESPN for grading window
    const espnGamesByDate = {};
    for (const gd of allGameDates) {
      const ed = yyyymmdd(gd);
      try { const r = await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`); if (!r.ok) continue; const jd = await r.json(); const games = [];
        for (const ev of (jd.events||[])){const comp=ev.competitions?.[0];if(!comp?.status?.type?.completed)continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away)continue;games.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner:parseInt(home.score)>parseInt(away.score)?'home':'away'});}
        espnGamesByDate[gd]=games;
      } catch(e){}
    }
    // Historical ESPN for calibration
    const historicalDates = allDates.filter(d => allPicksByFile[d] && !allGameDates.includes(d));
    for (const hd of historicalDates) {
      const nextDay = new Date(hd); nextDay.setDate(nextDay.getDate()+1); const nextDayStr = nextDay.toISOString().slice(0,10);
      for (const checkDate of [hd, nextDayStr]) {
        if (espnGamesByDate[checkDate]) continue;
        try { const r = await fetch(`${ESPN}?dates=${yyyymmdd(checkDate)}&limit=300&groups=50`); if (!r.ok) continue; const jd = await r.json(); const games = [];
          for (const ev of (jd.events||[])){const comp=ev.competitions?.[0];if(!comp?.status?.type?.completed)continue;const home=comp.competitors.find(c=>c.homeAway==='home');const away=comp.competitors.find(c=>c.homeAway==='away');if(!home||!away)continue;games.push({homeName:home.team.displayName,homeShort:home.team.shortDisplayName,homeScore:parseInt(home.score),awayName:away.team.displayName,awayShort:away.team.shortDisplayName,awayScore:parseInt(away.score),winner:parseInt(home.score)>parseInt(away.score)?'home':'away'});}
          espnGamesByDate[checkDate]=games;
        } catch(e){}
      }
    }
    console.log(`ESPN dates fetched: ${Object.keys(espnGamesByDate).length}\n`);

    function gradePicksForDate(fileDate) {
      const picks = allPicksByFile[fileDate]||[]; const graded = [];
      const nextDay = new Date(fileDate); nextDay.setDate(nextDay.getDate()+1);
      const espnPools = [...(espnGamesByDate[fileDate]||[]),...(espnGamesByDate[nextDay.toISOString().slice(0,10)]||[])];
      for (const p of picks) { const g = findGame(p, espnPools); if (!g) continue; graded.push({model_prob:p.model_prob,won:g.winner===p.side,odds:p.odds,side:p.side}); }
      return graded;
    }

    // ═══════════════════════════════════════════════════════════
    // PART 1: Odds ceiling sweep (+100 to +250 in steps of 10)
    // ═══════════════════════════════════════════════════════════
    console.log('═'.repeat(95));
    console.log('PART 1: ODDS CEILING SWEEP (Dogs from +100 to ceiling, min 5% cal edge)');
    console.log('═'.repeat(95));
    console.log(`${'Ceiling'.padEnd(10)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'Wagered'.padEnd(14)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(70));

    for (let ceiling = 100; ceiling <= 300; ceiling += 10) {
      let w=0,l=0,pl=0,wag=0;
      for (const gd of allGameDates) {
        const espnGames = espnGamesByDate[gd]||[];
        const prev = new Date(gd); prev.setDate(prev.getDate()-1); const prevStr = prev.toISOString().slice(0,10);
        let picks = [];
        for (const src of [prevStr,gd]){if(allPicksByFile[src])allPicksByFile[src].forEach(p=>picks.push({...p,_fileDate:src}));}
        const seen = new Set();
        picks = picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true;});

        // Walk-forward calibrator
        const trainingData = [];
        for (const fd of Object.keys(allPicksByFile).sort()){if(fd>=gd)break;for(const g of gradePicksForDate(fd))trainingData.push({x:g.model_prob,y:g.won?1:0});}
        let calibrate = x=>x;
        if(trainingData.length>=50) calibrate = fitIsotonic(trainingData);

        for (const p of picks) {
          if (p.odds <= 0 || p.odds > ceiling) continue;
          const calProb = calibrate(p.model_prob);
          const calEdge = calProb - impliedProb(p.odds);
          if (calEdge < 0.05) continue;
          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1;
        }
      }
      const total=w+l;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      const marker = ceiling===150?' ◄ current':'';
      console.log(`+${String(ceiling).padEnd(9)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${'$'+wag.toLocaleString().padEnd(13)} ${plStr.padEnd(14)} ${roi.padEnd(8)}${marker}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PART 2: Odds BAND analysis (where does each range perform?)
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(95));
    console.log('PART 2: ODDS BAND BREAKDOWN (5% cal edge, isolated performance per band)');
    console.log('═'.repeat(95));
    console.log(`${'Odds Band'.padEnd(14)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'Avg Odds'.padEnd(10)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(70));

    const bands = [
      [1, 110, '+100–110'],
      [111, 130, '+111–130'],
      [131, 150, '+131–150'],
      [151, 175, '+151–175'],
      [176, 200, '+176–200'],
      [201, 250, '+201–250'],
      [251, 350, '+251–350'],
      [351, 999, '+351+'],
    ];

    for (const [lo, hi, label] of bands) {
      let w=0,l=0,pl=0,wag=0,oddsSum=0;
      for (const gd of allGameDates) {
        const espnGames = espnGamesByDate[gd]||[];
        const prev = new Date(gd); prev.setDate(prev.getDate()-1); const prevStr = prev.toISOString().slice(0,10);
        let picks = [];
        for (const src of [prevStr,gd]){if(allPicksByFile[src])allPicksByFile[src].forEach(p=>picks.push({...p,_fileDate:src}));}
        const seen = new Set();
        picks = picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true;});

        const trainingData = [];
        for (const fd of Object.keys(allPicksByFile).sort()){if(fd>=gd)break;for(const g of gradePicksForDate(fd))trainingData.push({x:g.model_prob,y:g.won?1:0});}
        let calibrate = x=>x;
        if(trainingData.length>=50) calibrate = fitIsotonic(trainingData);

        for (const p of picks) {
          if (p.odds < lo || p.odds > hi) continue;
          const calProb = calibrate(p.model_prob);
          const calEdge = calProb - impliedProb(p.odds);
          if (calEdge < 0.05) continue;
          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1; oddsSum += p.odds;
        }
      }
      const total=w+l;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const avgOdds=total>0?'+'+Math.round(oddsSum/total):'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${label.padEnd(14)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${avgOdds.padEnd(10)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PART 3: Tiered edge thresholds — higher odds need higher edge?
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(95));
    console.log('PART 3: TIERED EDGE — Can we add +151–200 with a HIGHER edge requirement?');
    console.log('═'.repeat(95));

    const edgeThresholds = [0.05, 0.07, 0.08, 0.10, 0.12, 0.15, 0.20];
    console.log(`\nDogs +151 to +200 at various min-edge thresholds:`);
    console.log(`${'Min Edge'.padEnd(10)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'Avg Odds'.padEnd(10)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(66));

    for (const minEdge of edgeThresholds) {
      let w=0,l=0,pl=0,wag=0,oddsSum=0;
      for (const gd of allGameDates) {
        const espnGames = espnGamesByDate[gd]||[];
        const prev = new Date(gd); prev.setDate(prev.getDate()-1); const prevStr = prev.toISOString().slice(0,10);
        let picks = [];
        for (const src of [prevStr,gd]){if(allPicksByFile[src])allPicksByFile[src].forEach(p=>picks.push({...p,_fileDate:src}));}
        const seen = new Set();
        picks = picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true;});

        const trainingData = [];
        for (const fd of Object.keys(allPicksByFile).sort()){if(fd>=gd)break;for(const g of gradePicksForDate(fd))trainingData.push({x:g.model_prob,y:g.won?1:0});}
        let calibrate = x=>x;
        if(trainingData.length>=50) calibrate = fitIsotonic(trainingData);

        for (const p of picks) {
          if (p.odds < 151 || p.odds > 200) continue;
          const calProb = calibrate(p.model_prob);
          const calEdge = calProb - impliedProb(p.odds);
          if (calEdge < minEdge) continue;
          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1; oddsSum += p.odds;
        }
      }
      const total=w+l;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const avgOdds=total>0?'+'+Math.round(oddsSum/total):'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${(minEdge*100).toFixed(0).padEnd(1)}%`.padEnd(10) + ` ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${avgOdds.padEnd(10)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

    // Same for +201-250
    console.log(`\nDogs +201 to +250 at various min-edge thresholds:`);
    console.log(`${'Min Edge'.padEnd(10)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'Avg Odds'.padEnd(10)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(66));

    for (const minEdge of edgeThresholds) {
      let w=0,l=0,pl=0,wag=0,oddsSum=0;
      for (const gd of allGameDates) {
        const espnGames = espnGamesByDate[gd]||[];
        const prev = new Date(gd); prev.setDate(prev.getDate()-1); const prevStr = prev.toISOString().slice(0,10);
        let picks = [];
        for (const src of [prevStr,gd]){if(allPicksByFile[src])allPicksByFile[src].forEach(p=>picks.push({...p,_fileDate:src}));}
        const seen = new Set();
        picks = picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true;});

        const trainingData = [];
        for (const fd of Object.keys(allPicksByFile).sort()){if(fd>=gd)break;for(const g of gradePicksForDate(fd))trainingData.push({x:g.model_prob,y:g.won?1:0});}
        let calibrate = x=>x;
        if(trainingData.length>=50) calibrate = fitIsotonic(trainingData);

        for (const p of picks) {
          if (p.odds < 201 || p.odds > 250) continue;
          const calProb = calibrate(p.model_prob);
          const calEdge = calProb - impliedProb(p.odds);
          if (calEdge < minEdge) continue;
          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1; oddsSum += p.odds;
        }
      }
      const total=w+l;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const avgOdds=total>0?'+'+Math.round(oddsSum/total):'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${(minEdge*100).toFixed(0).padEnd(1)}%`.padEnd(10) + ` ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${avgOdds.padEnd(10)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

    // ═══════════════════════════════════════════════════════════
    // PART 4: Composite — best tiered strategy
    // ═══════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(95));
    console.log('PART 4: COMPOSITE STRATEGIES (combining tiers)');
    console.log('═'.repeat(95));

    const strategies = [
      { name: 'Current V2: Dogs ≤+150 @ 5%', tiers: [{lo:1,hi:150,edge:0.05}] },
      { name: 'Dogs ≤+175 @ 5%', tiers: [{lo:1,hi:175,edge:0.05}] },
      { name: 'Dogs ≤+200 @ 5%', tiers: [{lo:1,hi:200,edge:0.05}] },
      { name: '≤+150@5% + +151-200@10%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:200,edge:0.10}] },
      { name: '≤+150@5% + +151-200@8%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:200,edge:0.08}] },
      { name: '≤+150@5% + +151-175@7%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:175,edge:0.07}] },
      { name: '≤+150@5% + +151-200@7%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:200,edge:0.07}] },
      { name: '≤+150@5% + +151-250@10%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:250,edge:0.10}] },
      { name: '≤+150@5% + +151-250@15%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:250,edge:0.15}] },
      { name: '≤+150@5% + +151-200@10% + +201-300@15%', tiers: [{lo:1,hi:150,edge:0.05},{lo:151,hi:200,edge:0.10},{lo:201,hi:300,edge:0.15}] },
      { name: '≤+175@5% + +176-250@10%', tiers: [{lo:1,hi:175,edge:0.05},{lo:176,hi:250,edge:0.10}] },
      { name: '≤+200@5% + +201-300@10%', tiers: [{lo:1,hi:200,edge:0.05},{lo:201,hi:300,edge:0.10}] },
    ];

    console.log(`${'Strategy'.padEnd(45)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(91));

    for (const strat of strategies) {
      let w=0,l=0,pl=0,wag=0;
      for (const gd of allGameDates) {
        const espnGames = espnGamesByDate[gd]||[];
        const prev = new Date(gd); prev.setDate(prev.getDate()-1); const prevStr = prev.toISOString().slice(0,10);
        let picks = [];
        for (const src of [prevStr,gd]){if(allPicksByFile[src])allPicksByFile[src].forEach(p=>picks.push({...p,_fileDate:src}));}
        const seen = new Set();
        picks = picks.filter(p=>{const k=`${p.home_team}|${p.away_team}|${p.side}`;if(seen.has(k))return false;seen.add(k);return true;});

        const trainingData = [];
        for (const fd of Object.keys(allPicksByFile).sort()){if(fd>=gd)break;for(const g of gradePicksForDate(fd))trainingData.push({x:g.model_prob,y:g.won?1:0});}
        let calibrate = x=>x;
        if(trainingData.length>=50) calibrate = fitIsotonic(trainingData);

        for (const p of picks) {
          if (p.odds <= 0) continue;
          // Check if pick qualifies under any tier
          let qualifies = false;
          for (const tier of strat.tiers) {
            if (p.odds >= tier.lo && p.odds <= tier.hi) {
              const calProb = calibrate(p.model_prob);
              const calEdge = calProb - impliedProb(p.odds);
              if (calEdge >= tier.edge) { qualifies = true; break; }
            }
          }
          if (!qualifies) continue;
          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = 1000;
          pl += Math.round(oddsPL(won, p.odds, bet));
          wag += bet; w += won?1:0; l += won?0:1;
        }
      }
      const total=w+l;
      const winPct=total>0?((w/total)*100).toFixed(1)+'%':'-';
      const roi=wag>0?((pl/wag)*100).toFixed(1)+'%':'-';
      const plStr=(pl>=0?'+':'')+`$${pl.toLocaleString()}`;
      console.log(`${strat.name.padEnd(45)} ${(w+'-'+l).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

  } catch(e) { console.error('Error:', e); }
})();
