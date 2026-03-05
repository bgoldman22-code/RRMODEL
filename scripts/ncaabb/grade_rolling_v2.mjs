#!/usr/bin/env node
// Grade NCAA MBB V2 (away dogs ≤ +150, walk-forward isotonic calibration, ≥5% cal edge)
// Same date range as V1: 16 days ending 3/4/2026

const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function normalize(s) { return (s || '').toLowerCase().replace(/\./g, '').replace(/[''´`]/g, '').replace(/\s+/g, ' ').trim(); }

function keyWords(name) {
  const n = normalize(name);
  return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks|rattlers|golden lions|lancers|blue hose)$/g, '').trim().split(' ').filter(w => w.length > 2);
}

function findGame(p, games) {
  const hn = normalize(p.home_team), an = normalize(p.away_team);
  const hk = keyWords(p.home_team), ak = keyWords(p.away_team);
  for (const g of games) {
    const eh = normalize(g.homeName || ''); const ea = normalize(g.awayName || '');
    const ehs = normalize(g.homeShort || ''); const eas = normalize(g.awayShort || '');
    const hm = eh.includes(hn) || hn.includes(eh) || ehs.includes(hn) || hn.includes(ehs) || (hk[0] && (eh.includes(hk[0]) || ehs.includes(hk[0])));
    const am = ea.includes(an) || an.includes(ea) || eas.includes(an) || an.includes(eas) || (ak[0] && (ea.includes(ak[0]) || eas.includes(ak[0])));
    if (hm && am) return g;
    const ehk = keyWords(g.homeName || ''); const eak = keyWords(g.awayName || '');
    if (hk.some(k => ehk.includes(k) || eh.includes(k)) && ak.some(k => eak.includes(k) || ea.includes(k))) return g;
  }
  return null;
}

function oddsPL(won, odds, bet) {
  if (won) return odds > 0 ? bet * (odds / 100) : bet * (100 / Math.abs(odds));
  return -bet;
}
function fmtOdds(o) { return o > 0 ? `+${o}` : `${o}`; }

// Isotonic regression (Pool Adjacent Violators)
function fitIsotonic(data) {
  if (data.length === 0) return x => x;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  const xs = sorted.map(d => d.x);
  const ys = sorted.map(d => d.y);
  // PAV
  const n = xs.length;
  const result = [...ys];
  const weight = new Array(n).fill(1);
  let i = 0;
  while (i < n - 1) {
    if (result[i] > result[i + 1]) {
      const merged = (result[i] * weight[i] + result[i + 1] * weight[i + 1]) / (weight[i] + weight[i + 1]);
      result[i] = merged; result[i + 1] = merged;
      weight[i] = weight[i] + weight[i + 1]; weight[i + 1] = weight[i];
      let j = i;
      while (j > 0 && result[j - 1] > result[j]) {
        const m2 = (result[j - 1] * weight[j - 1] + result[j] * weight[j]) / (weight[j - 1] + weight[j]);
        result[j - 1] = m2; result[j] = m2;
        weight[j - 1] = weight[j - 1] + weight[j]; weight[j] = weight[j - 1];
        j--;
      }
      i++;
    } else { i++; }
  }
  // Build stepwise function
  const blocks = [];
  let bi = 0;
  while (bi < n) {
    let bj = bi;
    while (bj < n - 1 && Math.abs(result[bj] - result[bj + 1]) < 1e-9) bj++;
    blocks.push({ lo: xs[bi], hi: xs[bj], val: result[bi] });
    bi = bj + 1;
  }
  return function(x) {
    if (x <= blocks[0].lo) return blocks[0].val;
    if (x >= blocks[blocks.length - 1].hi) return blocks[blocks.length - 1].val;
    for (const b of blocks) {
      if (x >= b.lo && x <= b.hi) return b.val;
    }
    // interpolate between blocks
    for (let k = 0; k < blocks.length - 1; k++) {
      if (x > blocks[k].hi && x < blocks[k + 1].lo) {
        const t = (x - blocks[k].hi) / (blocks[k + 1].lo - blocks[k].hi);
        return blocks[k].val + t * (blocks[k + 1].val - blocks[k].val);
      }
    }
    return x;
  };
}

function impliedProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function dateRange(endDate, days) {
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function yyyymmdd(dateStr) { return dateStr.replace(/-/g, ''); }

(async () => {
  try {
    const today = '2026-03-05';
    const gameDate = new Date(today);
    gameDate.setDate(gameDate.getDate() - 1);
    const allGameDates = dateRange(gameDate, 16); // 3/4 back to 2/17

    console.log(`NCAA MBB V2 Grading (Away Dogs ≤ +150, Isotonic WF Cal, ≥5% Cal Edge)`);
    console.log(`Date range: ${allGameDates[allGameDates.length - 1]} → ${allGameDates[0]}\n`);

    // ── Fetch ALL picks ever (for walk-forward calibration training) ──
    // Go back to season start (~Nov 2025) to have enough training data
    const seasonStart = new Date('2025-11-04');
    const allDates = [];
    for (let d = new Date(seasonStart); d <= gameDate; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }

    const allPicksByFile = {};
    let fetchedFiles = 0;
    for (const f of allDates) {
      try {
        const r = await fetch(BASE + f + '.json');
        if (!r.ok) continue;
        const d = await r.json();
        allPicksByFile[f] = d.picks || [];
        fetchedFiles++;
      } catch (e) {}
    }
    console.log(`Fetched ${fetchedFiles} pick files (full season for calibration training)`);

    // ── Fetch ESPN scores for the 16-day grading window ──
    const espnGamesByDate = {};
    for (const gd of allGameDates) {
      const ed = yyyymmdd(gd);
      try {
        const r = await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`);
        if (!r.ok) continue;
        const jd = await r.json();
        const games = [];
        for (const ev of (jd.events || [])) {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp || !comp.status || !comp.status.type || !comp.status.type.completed) continue;
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          if (!home || !away) continue;
          games.push({
            homeName: home.team.displayName, homeShort: home.team.shortDisplayName,
            homeScore: parseInt(home.score), awayName: away.team.displayName,
            awayShort: away.team.shortDisplayName, awayScore: parseInt(away.score),
            winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away'
          });
        }
        espnGamesByDate[gd] = games;
      } catch (e) {}
    }

    // Also fetch ESPN for all historical dates (for building graded training set)
    // We'll fetch in batches — but to keep it manageable, only fetch dates where we have picks
    const historicalDates = allDates.filter(d => allPicksByFile[d] && !allGameDates.includes(d));
    console.log(`Fetching ESPN scores for ${historicalDates.length} historical dates (for calibration training)...`);
    
    let histFetched = 0;
    for (const hd of historicalDates) {
      // Also check the next day (picks file might be for next day's games)
      const nextDay = new Date(hd);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().slice(0, 10);
      
      for (const checkDate of [hd, nextDayStr]) {
        if (espnGamesByDate[checkDate]) continue;
        const ed = yyyymmdd(checkDate);
        try {
          const r = await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`);
          if (!r.ok) continue;
          const jd = await r.json();
          const games = [];
          for (const ev of (jd.events || [])) {
            const comp = ev.competitions && ev.competitions[0];
            if (!comp || !comp.status || !comp.status.type || !comp.status.type.completed) continue;
            const home = comp.competitors.find(c => c.homeAway === 'home');
            const away = comp.competitors.find(c => c.homeAway === 'away');
            if (!home || !away) continue;
            games.push({
              homeName: home.team.displayName, homeShort: home.team.shortDisplayName,
              homeScore: parseInt(home.score), awayName: away.team.displayName,
              awayShort: away.team.shortDisplayName, awayScore: parseInt(away.score),
              winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away'
            });
          }
          espnGamesByDate[checkDate] = games;
          histFetched++;
        } catch (e) {}
      }
    }
    console.log(`Fetched ${histFetched} additional historical ESPN dates`);

    // ── Build graded picks for walk-forward calibration ──
    function gradePicksForDate(fileDate) {
      const picks = allPicksByFile[fileDate] || [];
      const graded = [];
      // Check same-day and next-day ESPN
      const nextDay = new Date(fileDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const espnPools = [
        ...(espnGamesByDate[fileDate] || []),
        ...(espnGamesByDate[nextDay.toISOString().slice(0, 10)] || [])
      ];
      for (const p of picks) {
        const g = findGame(p, espnPools);
        if (!g) continue;
        const won = g.winner === p.side;
        graded.push({ model_prob: p.model_prob, won, odds: p.odds, side: p.side, fileDate });
      }
      return graded;
    }

    // ── Grade each game date with walk-forward V2 logic ──
    const dailyResults = {};

    for (const gd of allGameDates) {
      const espnGames = espnGamesByDate[gd] || [];

      // Gather picks for this game date
      const prev = new Date(gd); prev.setDate(prev.getDate() - 1);
      const prevStr = prev.toISOString().slice(0, 10);
      let picks = [];
      for (const src of [prevStr, gd]) {
        if (allPicksByFile[src]) {
          allPicksByFile[src].forEach(p => picks.push({ ...p, _fileDate: src }));
        }
      }
      const seen = new Set();
      picks = picks.filter(p => {
        const k = `${p.home_team}|${p.away_team}|${p.side}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });

      // Walk-forward: train isotonic calibrator on ALL graded picks BEFORE this date
      const trainingData = [];
      for (const fd of Object.keys(allPicksByFile).sort()) {
        if (fd >= gd) break; // strict walk-forward
        const graded = gradePicksForDate(fd);
        for (const g of graded) {
          trainingData.push({ x: g.model_prob, y: g.won ? 1 : 0 });
        }
      }

      let calibrate = x => x; // fallback: identity
      if (trainingData.length >= 50) {
        calibrate = fitIsotonic(trainingData);
      }

      // Apply V2 filter: away dogs ≤ +150, ≥5% calibrated edge
      let v2W = 0, v2L = 0, v2PL = 0, v2Wag = 0;
      const v2Results = [];
      let v2Skipped = 0;

      for (const p of picks) {
        // V2 filter: away only, underdog (positive odds), ≤ +150
        if (p.side !== 'away') { v2Skipped++; continue; }
        if (p.odds <= 0 || p.odds > 150) { v2Skipped++; continue; }

        // Calibrate
        const calProb = calibrate(p.model_prob);
        const implProb = impliedProb(p.odds);
        const calEdge = calProb - implProb;

        if (calEdge < 0.05) { v2Skipped++; continue; } // need ≥5% calibrated edge

        // Grade
        const g = findGame(p, espnGames);
        if (!g) { v2Skipped++; continue; }
        const won = g.winner === p.side;
        const bet = p.bet_size_dollars || 1000;
        const thisPL = Math.round(oddsPL(won, p.odds, bet));
        v2W += won ? 1 : 0; v2L += won ? 0 : 1;
        v2PL += thisPL; v2Wag += bet;
        v2Results.push({
          team: p.away_team, odds: p.odds, bet, won, pl: thisPL,
          modelProb: (p.model_prob * 100).toFixed(1),
          calProb: (calProb * 100).toFixed(1),
          calEdge: (calEdge * 100).toFixed(1),
          score: `${g.awayName} ${g.awayScore} - ${g.homeName} ${g.homeScore}`
        });
      }

      dailyResults[gd] = { w: v2W, l: v2L, pl: v2PL, wag: v2Wag, results: v2Results, skipped: v2Skipped, trainingSize: trainingData.length };
    }

    // ── Print last night detail ──
    const lastNight = allGameDates[0];
    const ln = dailyResults[lastNight];
    console.log('\n' + '═'.repeat(70));
    console.log(`LAST NIGHT (${lastNight}) — NCAA MBB V2`);
    console.log('═'.repeat(70));
    if (ln.w + ln.l === 0) {
      console.log('No qualifying V2 picks for this date.');
    } else {
      console.log(`Record: ${ln.w}-${ln.l} (${((ln.w / (ln.w + ln.l)) * 100).toFixed(1)}%)`);
      console.log(`Wagered: $${ln.wag.toLocaleString()}  |  P/L: ${ln.pl >= 0 ? '+' : ''}$${ln.pl.toLocaleString()}  |  ROI: ${ln.wag > 0 ? ((ln.pl / ln.wag) * 100).toFixed(1) : 'N/A'}%`);
      console.log(`Training samples: ${ln.trainingSize}\n`);
      console.log('Pick-by-pick:');
      console.log('-'.repeat(90));
      for (const r of ln.results) {
        const marker = r.won ? '✅' : '❌';
        const plStr = r.won ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
        console.log(`${marker} ${r.team.padEnd(35)} ${fmtOdds(r.odds).padStart(6)}  ${plStr.padStart(9)}  cal:${r.calProb}%  edge:${r.calEdge}%`);
        console.log(`   Score: ${r.score}`);
      }
    }

    // ── Rolling windows ──
    function aggregate(dates) {
      let tw = 0, tl = 0, tpl = 0, twag = 0;
      for (const d of dates) {
        const dr = dailyResults[d];
        if (!dr) continue;
        tw += dr.w; tl += dr.l; tpl += dr.pl; twag += dr.wag;
      }
      return { w: tw, l: tl, pl: tpl, wag: twag };
    }

    const windows = [
      { label: 'Last 5 days', days: 5 },
      { label: 'Last 10 days', days: 10 },
      { label: 'Last 16 days', days: 16 },
    ];

    console.log('\n\n' + '═'.repeat(70));
    console.log('ROLLING WINDOWS — NCAA MBB V2 (Calibrated Away Dogs ≤ +150)');
    console.log('═'.repeat(70));
    console.log('');
    console.log(`${'Window'.padEnd(18)} ${'Dates'.padEnd(24)} ${'Record'.padEnd(12)} ${'Win%'.padEnd(8)} ${'Wagered'.padEnd(12)} ${'P/L'.padEnd(12)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(94));

    for (const win of windows) {
      const dates = allGameDates.slice(0, win.days);
      const agg = aggregate(dates);
      const total = agg.w + agg.l;
      const winPct = total > 0 ? ((agg.w / total) * 100).toFixed(1) + '%' : 'N/A';
      const roi = agg.wag > 0 ? ((agg.pl / agg.wag) * 100).toFixed(1) + '%' : 'N/A';
      const plStr = (agg.pl >= 0 ? '+' : '') + '$' + agg.pl.toLocaleString();
      const dateRangeStr = `${dates[dates.length - 1]} → ${dates[0]}`;
      console.log(`${win.label.padEnd(18)} ${dateRangeStr.padEnd(24)} ${(agg.w + '-' + agg.l).padEnd(12)} ${winPct.padEnd(8)} ${'$' + agg.wag.toLocaleString().padEnd(11)} ${plStr.padEnd(12)} ${roi.padEnd(8)}`);
    }

    // ── Daily breakdown ──
    console.log('\n\n' + '═'.repeat(70));
    console.log('DAILY BREAKDOWN — V2 (last 16 days)');
    console.log('═'.repeat(70));
    console.log('');
    console.log(`${'Date'.padEnd(14)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Wagered'.padEnd(12)} ${'P/L'.padEnd(12)} ${'ROI'.padEnd(8)} ${'Train'.padEnd(8)}`);
    console.log('-'.repeat(72));

    for (const gd of allGameDates) {
      const dr = dailyResults[gd];
      const total = dr.w + dr.l;
      const winPct = total > 0 ? ((dr.w / total) * 100).toFixed(1) + '%' : '-';
      const roi = dr.wag > 0 ? ((dr.pl / dr.wag) * 100).toFixed(1) + '%' : '-';
      const plStr = total > 0 ? ((dr.pl >= 0 ? '+' : '') + '$' + dr.pl.toLocaleString()) : '-';
      console.log(`${gd.padEnd(14)} ${(total > 0 ? dr.w + '-' + dr.l : '0-0').padEnd(10)} ${winPct.padEnd(8)} ${(total > 0 ? '$' + dr.wag.toLocaleString() : '-').padEnd(12)} ${plStr.padEnd(12)} ${roi.padEnd(8)} ${String(dr.trainingSize).padEnd(8)}`);
    }

    // ── Side-by-side comparison ──
    console.log('\n\n' + '═'.repeat(70));
    console.log('V1 vs V2 COMPARISON (last 16 days)');
    console.log('═'.repeat(70));
    const v2_16 = aggregate(allGameDates);
    console.log(`\nV1: 174-149 (53.9%)  Wagered $288,172  P/L -$28,309  ROI -9.8%`);
    console.log(`V2: ${v2_16.w}-${v2_16.l} (${(v2_16.w + v2_16.l) > 0 ? ((v2_16.w / (v2_16.w + v2_16.l)) * 100).toFixed(1) : 'N/A'}%)  Wagered $${v2_16.wag.toLocaleString()}  P/L ${v2_16.pl >= 0 ? '+' : ''}$${v2_16.pl.toLocaleString()}  ROI ${v2_16.wag > 0 ? ((v2_16.pl / v2_16.wag) * 100).toFixed(1) : 'N/A'}%`);

  } catch (e) { console.error('Error:', e); }
})();
