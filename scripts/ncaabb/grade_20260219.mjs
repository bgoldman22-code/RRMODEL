#!/usr/bin/env node
// Grade NCAA MBB Variant B V1 picks for 2026-02-19
const BASE = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

function normalize(s) { return (s || '').toLowerCase().replace(/\./g, '').replace(/['']/g, '').replace(/\s+/g, ' ').trim(); }

function keyWords(name) {
  const n = normalize(name);
  return n.replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks|rattlers|golden lions|lancers|blue hose|bulldogs|tigers)$/g, '').trim().split(' ').filter(w => w.length > 2);
}

function findGame(p, games) {
  const hn = normalize(p.home_team), an = normalize(p.away_team);
  const hk = keyWords(p.home_team), ak = keyWords(p.away_team);
  for (const g of games) {
    const eh = normalize(g.homeName || '');
    const ea = normalize(g.awayName || '');
    const ehs = normalize(g.homeShort || '');
    const eas = normalize(g.awayShort || '');
    // Direct substring matches
    const hm = eh.includes(hn) || hn.includes(eh) || ehs.includes(hn) || hn.includes(ehs) ||
               (hk[0] && (eh.includes(hk[0]) || ehs.includes(hk[0])));
    const am = ea.includes(an) || an.includes(ea) || eas.includes(an) || an.includes(eas) ||
               (ak[0] && (ea.includes(ak[0]) || eas.includes(ak[0])));
    if (hm && am) return g;
    // Keyword overlap
    const ehk = keyWords(g.homeName || '');
    const eak = keyWords(g.awayName || '');
    if (hk.some(k => ehk.includes(k) || eh.includes(k)) && ak.some(k => eak.includes(k) || ea.includes(k))) return g;
  }
  return null;
}

function oddsPL(won, odds, bet) {
  if (won) return odds > 0 ? bet * (odds / 100) : bet * (100 / Math.abs(odds));
  return -bet;
}

function fmtOdds(o) { return o > 0 ? `+${o}` : `${o}`; }

(async () => {
  try {
    // Grade picks for games played on 2/18
    const files = ['2026-02-17', '2026-02-18'];
    let picks = [];
    for (const f of files) {
      try {
        const r = await fetch(BASE + f + '.json');
        if (!r.ok) continue;
        const d = await r.json();
        (d.picks || []).forEach(p => { p._fileDate = f; picks.push(p); });
      } catch (e) {}
    }
    // Dedupe by matchup + side
    const seen = new Set();
    picks = picks.filter(p => {
      const k = `${p.home_team}|${p.away_team}|${p.side}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    console.log(`Found ${picks.length} V1 picks from files: ${files.join(', ')}`);

    // Fetch ESPN completed games for Feb 18 and Feb 19 (to catch late finishes)
    const espnDates = ['20260218', '20260219'];
    let espnGames = [];
    for (const ed of espnDates) {
      try {
        const r = await fetch(`${ESPN}?dates=${ed}&limit=300&groups=50`);
        if (!r.ok) continue;
        const jd = await r.json();
        for (const ev of (jd.events || [])) {
          const comp = ev.competitions && ev.competitions[0];
          if (!comp || !comp.status || !comp.status.type || !comp.status.type.completed) continue;
          const home = comp.competitors.find(c => c.homeAway === 'home');
          const away = comp.competitors.find(c => c.homeAway === 'away');
          if (!home || !away) continue;
          espnGames.push({
            homeName: home.team.displayName,
            homeShort: home.team.shortDisplayName,
            homeScore: parseInt(home.score),
            awayName: away.team.displayName,
            awayShort: away.team.shortDisplayName,
            awayScore: parseInt(away.score),
            winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away'
          });
        }
      } catch (e) {}
    }

    console.log(`ESPN completed games found: ${espnGames.length}`);

    // Grade
    let unmatched = 0;
    let v1W = 0, v1L = 0, v1PL = 0, v1Wag = 0;
    const v1List = [];
    const unmatchedList = [];

    for (const p of picks) {
      const g = findGame(p, espnGames);
      if (!g) { unmatched++; unmatchedList.push(`${p.away_team} @ ${p.home_team}`); continue; }
      const won = g.winner === p.side;
      const bet = p.bet_size_dollars || 1000;
      const pl = Math.round(oddsPL(won, p.odds, bet));
      v1W += won ? 1 : 0;
      v1L += won ? 0 : 1;
      v1PL += pl;
      v1Wag += bet;
      v1List.push({
        team: p.side === 'home' ? p.home_team : p.away_team,
        side: p.side,
        odds: p.odds,
        bet,
        won,
        pl,
        modelProb: (p.model_prob * 100).toFixed(1) + '%',
        edge: (p.edge * 100).toFixed(1) + '%',
        score: `${g.awayName} ${g.awayScore} - ${g.homeName} ${g.homeScore}`
      });
    }

    console.log('\n' + '═'.repeat(60));
    console.log('NCAA MBB V1 Results for 2026-02-18');
    console.log('═'.repeat(60) + '\n');

    console.log(`Matches: ${v1W + v1L}  |  Unmatched: ${unmatched}`);
    console.log(`Record: ${v1W}-${v1L} (${(v1W + v1L) > 0 ? ((v1W / (v1W + v1L)) * 100).toFixed(1) : '0'}%)`);
    console.log(`Wagered: $${v1Wag.toLocaleString()}`);
    console.log(`P/L: ${v1PL >= 0 ? '+' : ''}$${v1PL.toLocaleString()}`);
    console.log(`ROI: ${v1Wag > 0 ? ((v1PL / v1Wag) * 100).toFixed(1) : '0'}%\n`);

    console.log('Pick-by-pick:');
    console.log('-'.repeat(90));
    for (const r of v1List) {
      const marker = r.won ? '✅' : '❌';
      const plStr = r.won ? `+$${r.pl}` : `-$${Math.abs(r.pl)}`;
      console.log(`${marker} ${r.team.padEnd(32)} ${fmtOdds(r.odds).padStart(6)}  $${r.bet.toLocaleString().padStart(6)}  ${plStr.padStart(8)}  ${r.modelProb.padStart(6)}  ${r.side}`);
      console.log(`   Score: ${r.score}`);
    }

    if (unmatchedList.length > 0) {
      console.log(`\nUnmatched picks (${unmatchedList.length}):`);
      unmatchedList.forEach(u => console.log(`  • ${u}`));
    }
  } catch (e) { console.error('Error', e); }
})();
