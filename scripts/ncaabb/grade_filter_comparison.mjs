#!/usr/bin/env node
// Grade NCAA MBB V2-ALT: Away OR Underdog (≤ +150), walk-forward isotonic cal, ≥5% cal edge
// Compare with V2 (Away AND Underdog) and V1 (all picks)

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

function fitIsotonic(data) {
  if (data.length === 0) return x => x;
  const sorted = [...data].sort((a, b) => a.x - b.x);
  const xs = sorted.map(d => d.x); const ys = sorted.map(d => d.y);
  const n = xs.length; const result = [...ys]; const weight = new Array(n).fill(1);
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
    for (const b of blocks) { if (x >= b.lo && x <= b.hi) return b.val; }
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
    const d = new Date(endDate); d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}
function yyyymmdd(ds) { return ds.replace(/-/g, ''); }

(async () => {
  try {
    const today = '2026-03-05';
    const gameDate = new Date(today); gameDate.setDate(gameDate.getDate() - 1);
    const allGameDates = dateRange(gameDate, 16);

    console.log('NCAA MBB Filter Comparison (16 days: 2/17 → 3/4)');
    console.log('Filters tested:');
    console.log('  V2-AND: Away AND Dog ≤ +150 + ≥5% cal edge');
    console.log('  V2-OR:  Away OR  Dog ≤ +150 + ≥5% cal edge');
    console.log('  Away-only:    side=away + ≥5% cal edge (any odds)');
    console.log('  Dog-only:     odds > 0 & ≤ +150 + ≥5% cal edge (any side)\n');

    // Fetch picks
    const seasonStart = new Date('2025-11-04');
    const allDates = [];
    for (let d = new Date(seasonStart); d <= gameDate; d.setDate(d.getDate() + 1)) {
      allDates.push(d.toISOString().slice(0, 10));
    }
    const allPicksByFile = {};
    let fetchedFiles = 0;
    for (const f of allDates) {
      try { const r = await fetch(BASE + f + '.json'); if (!r.ok) continue; const d = await r.json(); allPicksByFile[f] = d.picks || []; fetchedFiles++; } catch (e) {}
    }
    console.log(`Fetched ${fetchedFiles} pick files`);

    // Fetch ESPN
    const espnGamesByDate = {};
    // Grading window
    for (const gd of allGameDates) {
      const ed = yyyymmdd(gd);
      try { const r = await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`); if (!r.ok) continue; const jd = await r.json(); const games = [];
        for (const ev of (jd.events || [])) { const comp = ev.competitions?.[0]; if (!comp?.status?.type?.completed) continue; const home = comp.competitors.find(c => c.homeAway === 'home'); const away = comp.competitors.find(c => c.homeAway === 'away'); if (!home || !away) continue; games.push({ homeName: home.team.displayName, homeShort: home.team.shortDisplayName, homeScore: parseInt(home.score), awayName: away.team.displayName, awayShort: away.team.shortDisplayName, awayScore: parseInt(away.score), winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away' }); }
        espnGamesByDate[gd] = games;
      } catch (e) {}
    }
    // Historical for calibration
    const historicalDates = allDates.filter(d => allPicksByFile[d] && !allGameDates.includes(d));
    for (const hd of historicalDates) {
      const nextDay = new Date(hd); nextDay.setDate(nextDay.getDate() + 1); const nextDayStr = nextDay.toISOString().slice(0, 10);
      for (const checkDate of [hd, nextDayStr]) {
        if (espnGamesByDate[checkDate]) continue;
        try { const r = await fetch(`${ESPN}?dates=${yyyymmdd(checkDate)}&limit=300&groups=50`); if (!r.ok) continue; const jd = await r.json(); const games = [];
          for (const ev of (jd.events || [])) { const comp = ev.competitions?.[0]; if (!comp?.status?.type?.completed) continue; const home = comp.competitors.find(c => c.homeAway === 'home'); const away = comp.competitors.find(c => c.homeAway === 'away'); if (!home || !away) continue; games.push({ homeName: home.team.displayName, homeShort: home.team.shortDisplayName, homeScore: parseInt(home.score), awayName: away.team.displayName, awayShort: away.team.shortDisplayName, awayScore: parseInt(away.score), winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away' }); }
          espnGamesByDate[checkDate] = games;
        } catch (e) {}
      }
    }
    console.log(`ESPN dates fetched: ${Object.keys(espnGamesByDate).length}\n`);

    function gradePicksForDate(fileDate) {
      const picks = allPicksByFile[fileDate] || []; const graded = [];
      const nextDay = new Date(fileDate); nextDay.setDate(nextDay.getDate() + 1);
      const espnPools = [...(espnGamesByDate[fileDate] || []), ...(espnGamesByDate[nextDay.toISOString().slice(0, 10)] || [])];
      for (const p of picks) { const g = findGame(p, espnPools); if (!g) continue; graded.push({ model_prob: p.model_prob, won: g.winner === p.side, odds: p.odds, side: p.side }); }
      return graded;
    }

    // Define filters
    const filters = {
      'V2-AND (Away+Dog)': (p) => p.side === 'away' && p.odds > 0 && p.odds <= 150,
      'V2-OR (Away|Dog)':  (p) => p.side === 'away' || (p.odds > 0 && p.odds <= 150),
      'Away-only':         (p) => p.side === 'away',
      'Dog-only (≤+150)':  (p) => p.odds > 0 && p.odds <= 150,
    };

    // Accumulate results per filter per day
    const filterResults = {};
    for (const fname of Object.keys(filters)) {
      filterResults[fname] = { daily: {}, totalW: 0, totalL: 0, totalPL: 0, totalWag: 0 };
    }

    for (const gd of allGameDates) {
      const espnGames = espnGamesByDate[gd] || [];
      const prev = new Date(gd); prev.setDate(prev.getDate() - 1); const prevStr = prev.toISOString().slice(0, 10);
      let picks = [];
      for (const src of [prevStr, gd]) { if (allPicksByFile[src]) allPicksByFile[src].forEach(p => picks.push({ ...p, _fileDate: src })); }
      const seen = new Set();
      picks = picks.filter(p => { const k = `${p.home_team}|${p.away_team}|${p.side}`; if (seen.has(k)) return false; seen.add(k); return true; });

      // Walk-forward calibrator
      const trainingData = [];
      for (const fd of Object.keys(allPicksByFile).sort()) {
        if (fd >= gd) break;
        for (const g of gradePicksForDate(fd)) trainingData.push({ x: g.model_prob, y: g.won ? 1 : 0 });
      }
      let calibrate = x => x;
      if (trainingData.length >= 50) calibrate = fitIsotonic(trainingData);

      for (const [fname, filterFn] of Object.entries(filters)) {
        let w = 0, l = 0, pl = 0, wag = 0;
        const dayResults = [];

        for (const p of picks) {
          if (!filterFn(p)) continue;
          const calProb = calibrate(p.model_prob);
          const implProb = impliedProb(p.odds);
          const calEdge = calProb - implProb;
          if (calEdge < 0.05) continue;

          const g = findGame(p, espnGames);
          if (!g) continue;
          const won = g.winner === p.side;
          const bet = p.bet_size_dollars || 1000;
          const thisPL = Math.round(oddsPL(won, p.odds, bet));
          w += won ? 1 : 0; l += won ? 0 : 1; pl += thisPL; wag += bet;
          dayResults.push({ team: p.side === 'home' ? p.home_team : p.away_team, side: p.side, odds: p.odds, won, pl: thisPL, calEdge: (calEdge * 100).toFixed(1) });
        }

        filterResults[fname].daily[gd] = { w, l, pl, wag, results: dayResults };
        filterResults[fname].totalW += w;
        filterResults[fname].totalL += l;
        filterResults[fname].totalPL += pl;
        filterResults[fname].totalWag += wag;
      }
    }

    // ── Print comparison table ──
    console.log('═'.repeat(90));
    console.log('16-DAY TOTALS (2/17 → 3/4)');
    console.log('═'.repeat(90));
    console.log('');
    console.log(`${'Filter'.padEnd(25)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Bets'.padEnd(6)} ${'Wagered'.padEnd(14)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
    console.log('-'.repeat(85));

    for (const [fname, fr] of Object.entries(filterResults)) {
      const total = fr.totalW + fr.totalL;
      const winPct = total > 0 ? ((fr.totalW / total) * 100).toFixed(1) + '%' : '-';
      const roi = fr.totalWag > 0 ? ((fr.totalPL / fr.totalWag) * 100).toFixed(1) + '%' : '-';
      const plStr = (fr.totalPL >= 0 ? '+' : '') + '$' + fr.totalPL.toLocaleString();
      console.log(`${fname.padEnd(25)} ${(fr.totalW + '-' + fr.totalL).padEnd(10)} ${winPct.padEnd(8)} ${String(total).padEnd(6)} ${'$' + fr.totalWag.toLocaleString().padEnd(13)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
    }

    // ── Rolling windows for each ──
    for (const windowDays of [5, 10, 16]) {
      const dates = allGameDates.slice(0, windowDays);
      console.log(`\nLast ${windowDays} days (${dates[dates.length - 1]} → ${dates[0]}):`);
      console.log(`${'Filter'.padEnd(25)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Wagered'.padEnd(14)} ${'P/L'.padEnd(14)} ${'ROI'.padEnd(8)}`);
      console.log('-'.repeat(79));

      for (const [fname, fr] of Object.entries(filterResults)) {
        let w = 0, l = 0, pl = 0, wag = 0;
        for (const d of dates) {
          const dd = fr.daily[d];
          if (!dd) continue;
          w += dd.w; l += dd.l; pl += dd.pl; wag += dd.wag;
        }
        const total = w + l;
        const winPct = total > 0 ? ((w / total) * 100).toFixed(1) + '%' : '-';
        const roi = wag > 0 ? ((pl / wag) * 100).toFixed(1) + '%' : '-';
        const plStr = (pl >= 0 ? '+' : '') + '$' + pl.toLocaleString();
        console.log(`${fname.padEnd(25)} ${(w + '-' + l).padEnd(10)} ${winPct.padEnd(8)} ${'$' + wag.toLocaleString().padEnd(13)} ${plStr.padEnd(14)} ${roi.padEnd(8)}`);
      }
    }

    // ── Last night detail for V2-OR ──
    const lastNight = allGameDates[0];
    const orLN = filterResults['V2-OR (Away|Dog)'].daily[lastNight];
    console.log('\n' + '═'.repeat(70));
    console.log(`LAST NIGHT (${lastNight}) — V2-OR (Away | Dog ≤ +150)`);
    console.log('═'.repeat(70));
    if (orLN.w + orLN.l === 0) {
      console.log('No qualifying picks.');
    } else {
      console.log(`Record: ${orLN.w}-${orLN.l}  |  P/L: ${orLN.pl >= 0 ? '+' : ''}$${orLN.pl.toLocaleString()}  |  ROI: ${orLN.wag > 0 ? ((orLN.pl / orLN.wag) * 100).toFixed(1) : 'N/A'}%\n`);
      for (const r of orLN.results) {
        const marker = r.won ? '✅' : '❌';
        const plStr = r.won ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
        console.log(`${marker} ${r.team.padEnd(35)} ${fmtOdds(r.odds).padStart(6)}  ${plStr.padStart(9)}  edge:${r.calEdge}%  ${r.side}`);
      }
    }

  } catch (e) { console.error('Error:', e); }
})();
