#!/usr/bin/env node
/**
 * NCAAMBB Variant B — Calibration + Dog/Away Deep Dive
 * 
 * Focused test: every combination of calibrator × {dog, away, dog+away} × edge threshold
 * Plus day-by-day equity curves for the profitable combos.
 * 
 * Production model is UNCHANGED — simulation only.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const BASE_PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const START_DATE = '2025-12-16';
const END_DATE   = '2026-02-16';

// ─── Helpers (same proven pattern) ────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtESPN(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function normalize(name) { return name.toLowerCase().replace(/\./g, '').replace(/['']/g, '').replace(/\s+/g, ' ').trim(); }
function keyWords(name) {
  const n = normalize(name);
  return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks)$/g, '').trim().split(' ').filter(w => w.length > 2);
}
function findGame(pick, espnGames) {
  const homeNorm = normalize(pick.home_team), awayNorm = normalize(pick.away_team);
  const homeKeys = keyWords(pick.home_team), awayKeys = keyWords(pick.away_team);
  for (const g of espnGames) {
    const eh = normalize(g.homeName), ea = normalize(g.awayName);
    const ehs = normalize(g.homeShort||''), eas = normalize(g.awayShort||'');
    const hm = eh.includes(homeNorm)||homeNorm.includes(eh)||ehs.includes(homeNorm)||homeNorm.includes(ehs)||eh.includes(homeKeys[0]||'___')||(homeKeys[0]&&ehs.includes(homeKeys[0]));
    const am = ea.includes(awayNorm)||awayNorm.includes(ea)||eas.includes(awayNorm)||awayNorm.includes(eas)||ea.includes(awayKeys[0]||'___')||(awayKeys[0]&&eas.includes(awayKeys[0]));
    if (hm && am) return g;
    const ehk = keyWords(g.homeName), eak = keyWords(g.awayName);
    if (homeKeys.some(k=>ehk.includes(k)||eh.includes(k)) && awayKeys.some(k=>eak.includes(k)||ea.includes(k))) return g;
  }
  return null;
}
async function fetchBatch(items, bs=6) {
  const r=[]; for(let i=0;i<items.length;i+=bs){const b=items.slice(i,i+bs);r.push(...await Promise.allSettled(b.map(async({url,parser})=>{const res=await fetch(url);return parser(res)})));} return r;
}
function oddsToImpliedProb(odds) { return odds < 0 ? Math.abs(odds)/(Math.abs(odds)+100) : 100/(odds+100); }
function calcProfit(won, odds, betSize) { if(won) return odds>0?betSize*(odds/100):betSize*(100/Math.abs(odds)); return -betSize; }

// ─── Calibration methods ─────────────────────────────────────
function fitPlatt(data) {
  let A=0, B=0; const lr=0.01;
  for(let e=0;e<5000;e++){let gA=0,gB=0;for(const{modelProb:mp,outcome:y}of data){const z=A*mp+B;const p=1/(1+Math.exp(-z));gA+=(p-y)*mp;gB+=(p-y);}A-=lr*gA/data.length;B-=lr*gB/data.length;}
  return{A,B,calibrate:p=>1/(1+Math.exp(-(A*p+B)))};
}
function fitIsotonic(data) {
  const sorted=[...data].sort((a,b)=>a.modelProb-b.modelProb);
  let blocks=sorted.map((d,i)=>({start:i,end:i,value:d.outcome,weight:1,sumX:d.modelProb}));
  let changed=true;
  while(changed){changed=false;const nb=[blocks[0]];for(let i=1;i<blocks.length;i++){const p=nb[nb.length-1],c=blocks[i];if(p.value>c.value){const tw=p.weight+c.weight;p.value=(p.value*p.weight+c.value*c.weight)/tw;p.weight=tw;p.end=c.end;p.sumX+=c.sumX;changed=true;}else nb.push(c);}blocks=nb;}
  const knots=blocks.map(b=>({x:b.sumX/b.weight,y:b.value}));
  return{knots,calibrate:p=>{if(!knots.length)return p;if(p<=knots[0].x)return knots[0].y;if(p>=knots[knots.length-1].x)return knots[knots.length-1].y;for(let i=0;i<knots.length-1;i++){if(p>=knots[i].x&&p<=knots[i+1].x){const t=(p-knots[i].x)/(knots[i+1].x-knots[i].x);return knots[i].y+t*(knots[i+1].y-knots[i].y);}}return knots[knots.length-1].y;}};
}
function fitBinned(data, numBins=10) {
  const bins=[];for(let i=0;i<numBins;i++){const lo=i/numBins,hi=(i+1)/numBins;const inB=data.filter(d=>d.modelProb>=lo&&d.modelProb<hi);if(inB.length>0){bins.push({lo,hi,avgProb:inB.reduce((s,d)=>s+d.modelProb,0)/inB.length,winRate:inB.filter(d=>d.outcome===1).length/inB.length,count:inB.length});}}
  return{bins,calibrate:p=>{const bin=bins.find(b=>p>=b.lo&&p<b.hi);if(bin)return bin.winRate;let c=bins[0];for(const b of bins)if(Math.abs(b.avgProb-p)<Math.abs(c.avgProb-p))c=b;return c?c.winRate:p;}};
}

// ═══════════════════════════════════════════════════════════════
async function main() {
  const start = new Date(START_DATE+'T00:00:00Z'), end = new Date(END_DATE+'T00:00:00Z');
  const totalDays = Math.round((end-start)/86400000)+1;
  const output = [];
  function log(line='') { console.log(line); output.push(line); }

  log(`\n🐕 NCAAMBB Variant B — Calibration + Dog/Away Deep Dive`);
  log(`${'═'.repeat(90)}`);
  log(`Full season: ${START_DATE} → ${END_DATE} (${totalDays} days)\n`);

  // ── Fetch picks + ESPN ────────────────────────────────────
  process.stderr.write(`Fetching picks...`);
  const dates=[];for(let i=0;i<totalDays;i++)dates.push(fmt(addDays(start,i)));
  const pr=await fetchBatch(dates.map(d=>({url:`${BASE_PICKS_URL}${d}.json`,parser:async r=>{if(!r.ok)return null;const j=await r.json();return j.picks&&j.picks.length>0?{dateStr:d,picks:j.picks}:null;}})),12);
  const daysWithPicks=pr.filter(r=>r.status==='fulfilled'&&r.value).map(r=>r.value).sort((a,b)=>a.dateStr.localeCompare(b.dateStr));
  process.stderr.write(` ${daysWithPicks.length} days\n`);

  process.stderr.write(`Fetching ESPN...`);
  const espnNeeded=new Set();for(const{dateStr}of daysWithPicks){const d=new Date(dateStr+'T00:00:00Z');espnNeeded.add(fmtESPN(d));espnNeeded.add(fmtESPN(addDays(d,1)));}
  const espnCache=new Map();
  const er=await fetchBatch([...espnNeeded].map(ed=>({url:`${ESPN_BASE}?dates=${ed}&limit=300&groups=50`,parser:async r=>{const d=await r.json();const g=[];for(const e of(d.events||[])){const c=e.competitions?.[0];if(!c||!c.status?.type?.completed)continue;const h=c.competitors.find(x=>x.homeAway==='home'),a=c.competitors.find(x=>x.homeAway==='away');if(!h||!a)continue;g.push({id:e.id,homeName:h.team.displayName,homeShort:h.team.shortDisplayName,homeScore:+h.score,awayName:a.team.displayName,awayShort:a.team.shortDisplayName,awayScore:+a.score,winner:+h.score>+a.score?'home':'away'});}return{espnDate:ed,games:g};}})),8);
  for(const r of er)if(r.status==='fulfilled'&&r.value)espnCache.set(r.value.espnDate,r.value.games);
  process.stderr.write(` ${espnCache.size} dates\n`);
  function getESPN(ds){const d=new Date(ds+'T00:00:00Z');const g=[...(espnCache.get(fmtESPN(d))||[]),...(espnCache.get(fmtESPN(addDays(d,1)))||[])];const s=new Set();return g.filter(x=>{if(s.has(x.id))return false;s.add(x.id);return true;});}

  // ── Grade all picks ───────────────────────────────────────
  process.stderr.write(`Grading...\n`);
  const allPicks=[];
  for(const{dateStr,picks}of daysWithPicks){const eg=getESPN(dateStr);for(const pick of picks){const game=findGame(pick,eg);if(!game)continue;const side=pick.side,won=game.winner===side;allPicks.push({date:dateStr,side,odds:pick.odds,edge:pick.edge,modelProb:pick.model_prob,betSize:pick.bet_size_dollars,won,profit:Math.round(calcProfit(won,pick.odds,pick.bet_size_dollars))});}}

  const picksByDate=new Map();for(const p of allPicks){if(!picksByDate.has(p.date))picksByDate.set(p.date,[]);picksByDate.get(p.date).push(p);}
  const sortedDates=[...picksByDate.keys()].sort();

  const origW=allPicks.filter(r=>r.won).length, origL=allPicks.filter(r=>!r.won).length;
  const origWag=allPicks.reduce((s,r)=>s+r.betSize,0), origPL=allPicks.reduce((s,r)=>s+r.profit,0);
  log(`Baseline: ${origW}-${origL} (${((origW/(origW+origL))*100).toFixed(1)}%)  Wag: $${origWag.toLocaleString()}  P/L: ${origPL>=0?'+':''}$${Math.round(origPL).toLocaleString()}  ROI: ${((origPL/origWag)*100).toFixed(1)}%`);
  log(`Picks: ${allPicks.length}  |  Days: ${sortedDates.length}\n`);

  // ── Walk-forward engine ───────────────────────────────────
  const MIN_TRAIN = 14;

  function runWalkForward(calFitFn, filterFn, edgeMin) {
    let w=0,l=0,wag=0,pl=0,skip=0;
    const dailyEquity = [];
    let cumPL = 0;

    for(let di=0;di<sortedDates.length;di++){
      const today=sortedDates[di];
      const todayPicks=picksByDate.get(today);
      let calibrate;
      if(!calFitFn){calibrate=p=>p;}
      else{const prior=sortedDates.slice(0,di);if(prior.length<MIN_TRAIN){calibrate=p=>p;}else{const td=[];for(const d of prior)for(const p of picksByDate.get(d))td.push({modelProb:p.modelProb,outcome:p.won?1:0});calibrate=calFitFn(td).calibrate;}}

      let dayW=0,dayL=0,dayWag=0,dayPL=0,daySkip=0,dayBets=0;
      for(const pick of todayPicks){
        if(!filterFn(pick)){daySkip++;continue;}
        const cp=calibrate(pick.modelProb);
        const ip=oddsToImpliedProb(pick.odds);
        const calEdge=cp-ip;
        if(calEdge<edgeMin){daySkip++;continue;}
        dayWag+=pick.betSize;
        const profit=calcProfit(pick.won,pick.odds,pick.betSize);
        dayPL+=profit; dayBets++;
        if(pick.won)dayW++;else dayL++;
      }
      w+=dayW;l+=dayL;wag+=dayWag;pl+=dayPL;skip+=daySkip;
      cumPL+=dayPL;
      if(dayBets>0) dailyEquity.push({date:today,dayW,dayL,dayPL:Math.round(dayPL),dayBets,cumPL:Math.round(cumPL)});
    }
    return{w,l,wag,pl:Math.round(pl),skip,roi:wag>0?(pl/wag*100):0,dailyEquity};
  }

  // ── Define the matrix ─────────────────────────────────────
  const calMethods = [
    { name: 'No Calibration', fitFn: null },
    { name: 'WF Platt', fitFn: d => fitPlatt(d) },
    { name: 'WF Isotonic', fitFn: d => fitIsotonic(d) },
    { name: 'WF Binned(5)', fitFn: d => fitBinned(d, 5) },
    { name: 'WF Binned(10)', fitFn: d => fitBinned(d, 10) },
  ];

  const filters = [
    { name: 'All picks', fn: () => true },
    { name: 'Dog only', fn: p => p.odds > 0 },
    { name: 'Away only', fn: p => p.side === 'away' },
    { name: 'Dog + Away', fn: p => p.odds > 0 && p.side === 'away' },
    { name: 'Dog OR Away', fn: p => p.odds > 0 || p.side === 'away' },
    { name: 'Away Dog (<+200)', fn: p => p.odds > 0 && p.odds <= 200 && p.side === 'away' },
    { name: 'Away Dog (<+150)', fn: p => p.odds > 0 && p.odds <= 150 && p.side === 'away' },
    { name: 'Dog + Away + Edge<40%', fn: p => p.odds > 0 && p.side === 'away' && p.edge < 0.40 },
    { name: 'Dog + Away + Edge≥30%', fn: p => p.odds > 0 && p.side === 'away' && p.edge >= 0.30 },
  ];

  const edgeThresholds = [0.00, 0.03, 0.05, 0.08, 0.10];

  log(`${'═'.repeat(90)}`);
  log(`🔬 FULL MATRIX: Calibrator × Filter × Edge Threshold`);
  log(`${'═'.repeat(90)}\n`);

  const allResults = [];

  for (const edge of edgeThresholds) {
    log(`\n${'─'.repeat(90)}`);
    log(`CALIBRATED EDGE THRESHOLD: ≥ ${(edge*100).toFixed(0)}%`);
    log(`${'─'.repeat(90)}`);
    log(`${'Calibrator'.padEnd(16)} ${'Filter'.padEnd(24)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)} ${'Skip'.padStart(5)}`);
    log('─'.repeat(100));

    for (const cal of calMethods) {
      for (const filt of filters) {
        const r = runWalkForward(cal.fitFn, filt.fn, edge);
        const total = r.w + r.l;
        if (total < 10) continue;

        const plStr = r.pl >= 0 ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
        const roiStr = r.roi >= 0 ? `+${r.roi.toFixed(1)}%` : `${r.roi.toFixed(1)}%`;
        const marker = r.roi > 0 ? ' ✅' : '';
        log(
          `${cal.name.padEnd(16)} ${filt.name.padEnd(24)} ${String(total).padStart(5)} ${(r.w+'-'+r.l).padStart(9)} ` +
          `${((r.w/total)*100).toFixed(1).padStart(5)}% ${('$'+r.wag.toLocaleString()).padStart(11)} ` +
          `${plStr.padStart(10)} ${roiStr.padStart(7)}${marker} ${String(r.skip).padStart(5)}`
        );
        allResults.push({ cal: cal.name, filter: filt.name, edgeMin: edge, ...r, total });
      }
    }
  }

  // ── Profitable summary ────────────────────────────────────
  const profitable = allResults.filter(r => r.roi > 0 && r.total >= 20).sort((a, b) => b.pl - a.pl);

  log(`\n${'═'.repeat(90)}`);
  log(`💰 ALL PROFITABLE COMBOS (≥20 picks, sorted by P/L)`);
  log(`${'═'.repeat(90)}\n`);

  log(`${'#'.padStart(3)} ${'Calibrator'.padEnd(16)} ${'Filter'.padEnd(24)} ${'Edge≥'.padStart(5)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wag'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  log('─'.repeat(103));

  for (let i = 0; i < profitable.length; i++) {
    const r = profitable[i];
    const plStr = `+$${r.pl.toLocaleString()}`;
    const roiStr = `+${r.roi.toFixed(1)}%`;
    log(
      `${String(i+1).padStart(3)} ${r.cal.padEnd(16)} ${r.filter.padEnd(24)} ${(r.edgeMin*100).toFixed(0).padStart(4)}% ` +
      `${String(r.total).padStart(5)} ${(r.w+'-'+r.l).padStart(9)} ${((r.w/r.total)*100).toFixed(1).padStart(5)}% ` +
      `${('$'+r.wag.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}`
    );
  }

  // ── Equity curves for top 5 ───────────────────────────────
  log(`\n${'═'.repeat(90)}`);
  log(`📈 EQUITY CURVES — Top 5 Profitable Combos (day-by-day cumulative P/L)`);
  log(`${'═'.repeat(90)}`);

  const top5 = profitable.slice(0, 5);
  for (const combo of top5) {
    // Re-run to get equity curve
    const r = runWalkForward(
      calMethods.find(c => c.name === combo.cal).fitFn,
      filters.find(f => f.name === combo.filter).fn,
      combo.edgeMin
    );

    log(`\n── ${combo.cal} + ${combo.filter} (edge ≥${(combo.edgeMin*100).toFixed(0)}%) ──`);
    log(`   ${combo.w}-${combo.l}  P/L: +$${combo.pl.toLocaleString()}  ROI: +${combo.roi.toFixed(1)}%\n`);
    log(`${'Date'.padEnd(12)} ${'W'.padStart(3)} ${'L'.padStart(3)} ${'Day P/L'.padStart(9)} ${'Cum P/L'.padStart(10)} ${'Bets'.padStart(5)}`);
    log('─'.repeat(46));

    let maxDrawdown = 0, peak = 0;
    for (const day of r.dailyEquity) {
      const dayPlStr = day.dayPL >= 0 ? `+$${day.dayPL.toLocaleString()}` : `-$${Math.abs(day.dayPL).toLocaleString()}`;
      const cumPlStr = day.cumPL >= 0 ? `+$${day.cumPL.toLocaleString()}` : `-$${Math.abs(day.cumPL).toLocaleString()}`;
      log(`${day.date.padEnd(12)} ${String(day.dayW).padStart(3)} ${String(day.dayL).padStart(3)} ${dayPlStr.padStart(9)} ${cumPlStr.padStart(10)} ${String(day.dayBets).padStart(5)}`);
      if (day.cumPL > peak) peak = day.cumPL;
      const dd = peak - day.cumPL;
      if (dd > maxDrawdown) maxDrawdown = dd;
    }

    log(`\n   Peak: +$${peak.toLocaleString()}  |  Max Drawdown: $${maxDrawdown.toLocaleString()}  |  Active Days: ${r.dailyEquity.length}/${sortedDates.length}`);
  }

  // ── Save ──────────────────────────────────────────────────
  const reportPath = join(OUT_DIR, 'calibration_dog_away_deep_dive.txt');
  writeFileSync(reportPath, output.join('\n'));
  log(`\n📁 Report saved → ${reportPath}`);

  const jsonPath = join(OUT_DIR, 'calibration_dog_away_deep_dive.json');
  writeFileSync(jsonPath, JSON.stringify({ profitable, allResults: allResults.filter(r => r.total >= 20) }, null, 2));
  log(`📁 JSON saved → ${jsonPath}`);
}

main().catch(e => console.error(e));
