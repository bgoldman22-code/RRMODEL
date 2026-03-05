#!/usr/bin/env node
// Grade NCAA MBB V1 picks for a date range ending 3/5/2026
// Reports: last night (3/4), last 5 days, last 10 days, last 16 days

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

// Generate date strings YYYY-MM-DD for a range
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
    // We grade games played on 3/4 (last night) back through 16 days (2/17)
    const today = '2026-03-05';
    const gameDate = new Date(today);
    gameDate.setDate(gameDate.getDate() - 1); // last night = 3/4
    
    const allGameDates = dateRange(gameDate, 16); // 3/4 back to 2/17
    
    console.log(`Fetching picks and scores for ${allGameDates.length} days: ${allGameDates[0]} to ${allGameDates[allGameDates.length - 1]}\n`);
    
    // Fetch all picks files (day before and day of each game date)
    const pickFileSet = new Set();
    for (const gd of allGameDates) {
      pickFileSet.add(gd);
      const prev = new Date(gd);
      prev.setDate(prev.getDate() - 1);
      pickFileSet.add(prev.toISOString().slice(0, 10));
    }
    
    // Fetch all unique pick files
    const allPicksByFile = {};
    let fetchedFiles = 0;
    for (const f of pickFileSet) {
      try {
        const r = await fetch(BASE + f + '.json');
        if (!r.ok) continue;
        const d = await r.json();
        allPicksByFile[f] = d.picks || [];
        fetchedFiles++;
      } catch (e) {}
    }
    console.log(`Fetched ${fetchedFiles} pick files`);
    
    // Fetch all ESPN scoreboards
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
            homeScore: parseInt(home.score),
            awayName: away.team.displayName, awayShort: away.team.shortDisplayName,
            awayScore: parseInt(away.score),
            winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away'
          });
        }
        espnGamesByDate[gd] = games;
      } catch (e) {}
    }
    console.log(`Fetched ESPN scores for ${Object.keys(espnGamesByDate).length} dates\n`);
    
    // Grade each game date
    const dailyResults = {};
    
    for (const gd of allGameDates) {
      const espnGames = espnGamesByDate[gd] || [];
      
      // Gather picks: from the day-before file and same-day file
      const prev = new Date(gd); prev.setDate(prev.getDate() - 1);
      const prevStr = prev.toISOString().slice(0, 10);
      
      let picks = [];
      for (const src of [prevStr, gd]) {
        if (allPicksByFile[src]) {
          allPicksByFile[src].forEach(p => picks.push({ ...p, _fileDate: src }));
        }
      }
      
      // Dedupe
      const seen = new Set();
      picks = picks.filter(p => {
        const k = `${p.home_team}|${p.away_team}|${p.side}`;
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      
      let w = 0, l = 0, pl = 0, wag = 0;
      const results = [];
      let unmatched = 0;
      
      for (const p of picks) {
        const g = findGame(p, espnGames);
        if (!g) { unmatched++; continue; }
        const won = g.winner === p.side;
        const bet = p.bet_size_dollars || 1000;
        const thisPL = Math.round(oddsPL(won, p.odds, bet));
        w += won ? 1 : 0; l += won ? 0 : 1;
        pl += thisPL; wag += bet;
        results.push({ team: p.side === 'home' ? p.home_team : p.away_team, side: p.side, odds: p.odds, bet, won, pl: thisPL });
      }
      
      dailyResults[gd] = { w, l, pl, wag, results, unmatched, totalPicks: picks.length };
    }
    
    // Print last night detail
    const lastNight = allGameDates[0];
    const ln = dailyResults[lastNight];
    console.log('═'.repeat(70));
    console.log(`LAST NIGHT (${lastNight}) — NCAA MBB V1`);
    console.log('═'.repeat(70));
    console.log(`Record: ${ln.w}-${ln.l} (${(ln.w + ln.l) > 0 ? ((ln.w / (ln.w + ln.l)) * 100).toFixed(1) : 'N/A'}%)`);
    console.log(`Wagered: $${ln.wag.toLocaleString()}  |  P/L: ${ln.pl >= 0 ? '+' : ''}$${ln.pl.toLocaleString()}  |  ROI: ${ln.wag > 0 ? ((ln.pl / ln.wag) * 100).toFixed(1) : 'N/A'}%`);
    console.log(`Matched: ${ln.w + ln.l}  |  Unmatched: ${ln.unmatched}\n`);
    
    console.log('Pick-by-pick:');
    console.log('-'.repeat(70));
    for (const r of ln.results) {
      const marker = r.won ? '✅' : '❌';
      const plStr = r.won ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
      console.log(`${marker} ${r.team.padEnd(35)} ${fmtOdds(r.odds).padStart(6)}  $${r.bet.toLocaleString().padStart(6)}  ${plStr.padStart(9)}  ${r.side}`);
    }
    
    // Aggregate windows
    function aggregate(dates) {
      let tw = 0, tl = 0, tpl = 0, twag = 0, tu = 0;
      for (const d of dates) {
        const dr = dailyResults[d];
        if (!dr) continue;
        tw += dr.w; tl += dr.l; tpl += dr.pl; twag += dr.wag; tu += dr.unmatched;
      }
      return { w: tw, l: tl, pl: tpl, wag: twag, unmatched: tu };
    }
    
    const windows = [
      { label: 'Last 5 days', days: 5 },
      { label: 'Last 10 days', days: 10 },
      { label: 'Last 16 days', days: 16 },
    ];
    
    console.log('\n\n' + '═'.repeat(70));
    console.log('ROLLING WINDOWS — NCAA MBB V1');
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
      const dateRange = `${dates[dates.length - 1]} → ${dates[0]}`;
      console.log(`${win.label.padEnd(18)} ${dateRange.padEnd(24)} ${(agg.w + '-' + agg.l).padEnd(12)} ${winPct.padEnd(8)} ${'$' + agg.wag.toLocaleString().padEnd(11)} ${plStr.padEnd(12)} ${roi.padEnd(8)}`);
    }
    
    // Daily breakdown table
    console.log('\n\n' + '═'.repeat(70));
    console.log('DAILY BREAKDOWN (last 16 days)');
    console.log('═'.repeat(70));
    console.log('');
    console.log(`${'Date'.padEnd(14)} ${'Record'.padEnd(10)} ${'Win%'.padEnd(8)} ${'Wagered'.padEnd(12)} ${'P/L'.padEnd(12)} ${'ROI'.padEnd(8)} ${'Unmatched'.padEnd(10)}`);
    console.log('-'.repeat(74));
    
    for (const gd of allGameDates) {
      const dr = dailyResults[gd];
      const total = dr.w + dr.l;
      if (total === 0 && dr.unmatched === 0) continue; // skip days with no data
      const winPct = total > 0 ? ((dr.w / total) * 100).toFixed(1) + '%' : 'N/A';
      const roi = dr.wag > 0 ? ((dr.pl / dr.wag) * 100).toFixed(1) + '%' : 'N/A';
      const plStr = (dr.pl >= 0 ? '+' : '') + '$' + dr.pl.toLocaleString();
      console.log(`${gd.padEnd(14)} ${(dr.w + '-' + dr.l).padEnd(10)} ${winPct.padEnd(8)} ${'$' + dr.wag.toLocaleString().padEnd(11)} ${plStr.padEnd(12)} ${roi.padEnd(8)} ${String(dr.unmatched).padEnd(10)}`);
    }
    
  } catch (e) { console.error('Error:', e); }
})();
