#!/usr/bin/env node
/**
 * NCAA MBB Variant B — Filtered Scenario Re-Run
 * Fetches 58 days of picks + ESPN scores ONCE, then grades under 4 filter scenarios:
 *   A) Edge ≥ 40% only
 *   B) No favorites worse than -250
 *   C) Top 8 edges per day
 *   D) Combined A + B + C
 *
 * Usage:  node scripts/ncaabb/grade_filtered_scenarios.mjs [days_back]
 */

const DAYS_BACK = parseInt(process.argv[2] || '58', 10);
const BASE_PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

// ─── Helpers ────────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtESPN(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

function normalize(name) {
  return name.toLowerCase().replace(/\./g, '').replace(/['']/g, '').replace(/\s+/g, ' ').trim();
}

function keyWords(name) {
  const n = normalize(name);
  const stripped = n
    .replace(/(leopards|greyhounds|paladins|bears|governors|royals|wolves|lions|lobos|antelopes|eagles|mountain hawks|dolphins|hatters|bulls|cardinals|flames|aggies|monarchs|thundering herd|coyotes|fighting hawks|yellow jackets|demon deacons|bluejays|bisons|colonels|terriers|blue demons|falcons|huskies|owls|tigers|hokies|gators|bulldogs|buffaloes|red raiders|wildcats|wolverines|golden|warriors|spartans|knights|cougars|braves|raiders|rockets|hawks|hornets|panthers|rams|rebels|mustangs|pirates|saints|miners|lumberjacks|penguins|bearcats|highlanders|racers|ospreys|retrievers|spiders|tribe|phoenix|billikens|musketeers|friars|explorers|gaels|jaspers|dukes|toreros|zags|commodores|boilermakers|cyclones|jayhawks|mountaineers|sooners|longhorns|badgers|tar heels|seminoles|cavaliers|hoosiers|buckeyes|nittany lions|fighting irish|terrapins|cornhuskers|razorbacks|volunteers|crimson tide|gamecocks)$/g, '')
    .trim();
  return stripped.split(' ').filter(w => w.length > 2);
}

function findGame(pick, espnGames) {
  const homeNorm = normalize(pick.home_team);
  const awayNorm = normalize(pick.away_team);
  const homeKeys = keyWords(pick.home_team);
  const awayKeys = keyWords(pick.away_team);

  for (const g of espnGames) {
    const espnHome = normalize(g.homeName);
    const espnAway = normalize(g.awayName);
    const espnHomeShort = normalize(g.homeShort || '');
    const espnAwayShort = normalize(g.awayShort || '');

    const homeMatch = espnHome.includes(homeNorm) || homeNorm.includes(espnHome) ||
                      espnHomeShort.includes(homeNorm) || homeNorm.includes(espnHomeShort) ||
                      espnHome.includes(homeKeys[0] || '___') || (homeKeys[0] && espnHomeShort.includes(homeKeys[0]));
    const awayMatch = espnAway.includes(awayNorm) || awayNorm.includes(espnAway) ||
                      espnAwayShort.includes(awayNorm) || awayNorm.includes(espnAwayShort) ||
                      espnAway.includes(awayKeys[0] || '___') || (awayKeys[0] && espnAwayShort.includes(awayKeys[0]));

    if (homeMatch && awayMatch) return g;

    const espnHomeKeys = keyWords(g.homeName);
    const espnAwayKeys = keyWords(g.awayName);
    const homeOverlap = homeKeys.some(k => espnHomeKeys.includes(k) || espnHome.includes(k));
    const awayOverlap = awayKeys.some(k => espnAwayKeys.includes(k) || espnAway.includes(k));
    if (homeOverlap && awayOverlap) return g;
  }
  return null;
}

async function fetchBatch(urls, batchSize = 6) {
  const results = [];
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(async ({ url, parser }) => {
      const res = await fetch(url);
      return parser(res);
    }));
    results.push(...batchResults);
  }
  return results;
}

// ─── Grade a set of picks against ESPN, return result objects ──
function gradePicksList(picks, espnGames) {
  const results = [];
  for (const pick of picks) {
    const game = findGame(pick, espnGames);
    const pickedSide = pick.side;
    const pickedTeam = pickedSide === 'home' ? pick.home_team : pick.away_team;
    const odds = pick.odds;
    const betSize = pick.bet_size_dollars;
    const edge = pick.edge;
    const modelProb = pick.model_prob;

    if (!game) {
      results.push({ pickedTeam, odds, edge, betSize, won: null, profit: 0, modelProb, side: pickedSide });
      continue;
    }

    const won = game.winner === pickedSide;
    let profit = 0;
    if (won) {
      profit = odds > 0 ? betSize * (odds / 100) : betSize * (100 / Math.abs(odds));
    } else {
      profit = -betSize;
    }
    results.push({ pickedTeam, odds, edge, betSize, won, profit: Math.round(profit), modelProb, side: pickedSide });
  }
  return results;
}

// ─── Summarize graded results ───────────────────────────────
function summarize(results, label) {
  const graded = results.filter(r => r.won !== null);
  const wins = graded.filter(r => r.won).length;
  const losses = graded.filter(r => !r.won).length;
  const total = wins + losses;
  const wagered = graded.reduce((s, r) => s + r.betSize, 0);
  const pl = graded.reduce((s, r) => s + r.profit, 0);
  const roi = wagered > 0 ? (pl / wagered * 100) : 0;
  const unmatched = results.filter(r => r.won === null).length;
  return { label, total, wins, losses, wagered, pl, roi, unmatched, graded };
}

// ─── Print a full scenario report ───────────────────────────
function printScenario(summary, dailySummaries) {
  const { label, total, wins, losses, wagered, pl, roi, unmatched, graded } = summary;
  const plStr = pl >= 0 ? `+$${Math.round(pl).toLocaleString()}` : `-$${Math.abs(Math.round(pl)).toLocaleString()}`;

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`📊 ${label}`);
  console.log(`${'═'.repeat(90)}`);

  // Daily breakdown
  console.log(`\n📅 DAILY BREAKDOWN`);
  console.log(`${'Date'.padEnd(12)} ${'Picks'.padStart(5)} ${'W'.padStart(3)} ${'L'.padStart(3)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(9)} ${'P/L'.padStart(9)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(60));

  for (const d of dailySummaries) {
    if (d.graded === 0 && d.picks === 0) continue; // skip empty days
    const dayPL = d.pl >= 0 ? `+$${d.pl.toLocaleString()}` : `-$${Math.abs(d.pl).toLocaleString()}`;
    console.log(
      `${d.date.padEnd(12)} ${String(d.picks).padStart(5)} ${String(d.wins).padStart(3)} ${String(d.losses).padStart(3)} ` +
      `${d.winPct.toFixed(1).padStart(5)}% ${('$' + d.wagered.toLocaleString()).padStart(9)} ${dayPL.padStart(9)} ` +
      `${d.roi.toFixed(1).padStart(6)}%`
    );
  }

  // Aggregate
  console.log(`\n  Record:        ${wins}-${losses} (${total > 0 ? ((wins / total) * 100).toFixed(1) : 0}%)`);
  console.log(`  Picks:         ${total} (from ${dailySummaries.filter(d => d.picks > 0).length} days)`);
  console.log(`  Total Wagered: $${wagered.toLocaleString()}`);
  console.log(`  Net P/L:       ${plStr}`);
  console.log(`  ROI:           ${roi.toFixed(1)}%`);
  console.log(`  Avg Picks/Day: ${dailySummaries.filter(d => d.picks > 0).length > 0 ? (total / dailySummaries.filter(d => d.picks > 0).length).toFixed(1) : 0}`);
  if (unmatched > 0) console.log(`  Unmatched:     ${unmatched}`);

  // Edge bucket analysis
  console.log(`\n  📈 EDGE BUCKETS`);
  const edgeBuckets = [
    { label: '10-20%', min: 0.10, max: 0.20 },
    { label: '20-30%', min: 0.20, max: 0.30 },
    { label: '30-40%', min: 0.30, max: 0.40 },
    { label: '40-50%', min: 0.40, max: 0.50 },
    { label: '50%+',   min: 0.50, max: 1.00 },
  ];
  console.log(`  ${'Edge'.padEnd(10)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(10)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)} ${'AvgOdds'.padStart(8)}`);
  console.log(`  ${'─'.repeat(60)}`);
  for (const b of edgeBuckets) {
    const inB = graded.filter(r => r.edge >= b.min && r.edge < b.max);
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const avgOdds = Math.round(inB.reduce((s, r) => s + r.odds, 0) / inB.length);
    const bplStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `  ${b.label.padEnd(10)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${('$' + bWag.toLocaleString()).padStart(10)} ${bplStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}% ` +
      `${(avgOdds > 0 ? '+' + avgOdds : String(avgOdds)).padStart(8)}`
    );
  }

  // Odds bucket analysis
  console.log(`\n  🎲 ODDS BUCKETS`);
  const oddsBuckets = [
    { label: 'Big Fav (<-300)', test: o => o < -300 },
    { label: 'Fav (-300 to -150)', test: o => o >= -300 && o < -150 },
    { label: 'Sm Fav (-150 to -100)', test: o => o >= -150 && o < -100 },
    { label: 'Pick\'em (-100 to +100)', test: o => o >= -100 && o <= 100 },
    { label: 'Sm Dog (+101 to +150)', test: o => o > 100 && o <= 150 },
    { label: 'Dog (+151 to +300)', test: o => o > 150 && o <= 300 },
    { label: 'Big Dog (>+300)', test: o => o > 300 },
  ];
  console.log(`  ${'Bucket'.padEnd(24)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log(`  ${'─'.repeat(58)}`);
  for (const b of oddsBuckets) {
    const inB = graded.filter(r => b.test(r.odds));
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const bplStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `  ${b.label.padEnd(24)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${bplStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}%`
    );
  }

  // Home vs Away
  console.log(`\n  🏠 HOME vs AWAY`);
  for (const side of ['home', 'away']) {
    const sidePicks = graded.filter(r => r.side === side);
    if (sidePicks.length === 0) continue;
    const sW = sidePicks.filter(r => r.won).length;
    const sL = sidePicks.filter(r => !r.won).length;
    const sWag = sidePicks.reduce((s, r) => s + r.betSize, 0);
    const sPL = sidePicks.reduce((s, r) => s + r.profit, 0);
    const sRoi = sWag > 0 ? (sPL / sWag * 100) : 0;
    const splStr = sPL >= 0 ? `+$${Math.round(sPL).toLocaleString()}` : `-$${Math.abs(Math.round(sPL)).toLocaleString()}`;
    console.log(`    ${side.toUpperCase().padEnd(6)} ${sW}-${sL} (${((sW / (sW + sL)) * 100).toFixed(1)}%)  P/L: ${splStr}  ROI: ${sRoi.toFixed(1)}%`);
  }
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = addDays(today, -1);
  const startDate = addDays(endDate, -(DAYS_BACK - 1));

  console.log(`🏀 NCAA MBB Variant B — FILTERED SCENARIO ANALYSIS`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`Date range: ${fmt(startDate)} → ${fmt(endDate)} (${DAYS_BACK} days)`);
  console.log(`Scenarios:`);
  console.log(`  A) Edge ≥ 40% only`);
  console.log(`  B) No favorites worse than -250`);
  console.log(`  C) Top 8 edges per day`);
  console.log(`  D) Combined A + B + C`);
  console.log(`${'═'.repeat(90)}`);

  // ── Phase 1: Fetch picks ──────────────────────────────────
  process.stderr.write(`\nPhase 1: Fetching picks from GitHub...`);
  const dates = [];
  for (let i = 0; i < DAYS_BACK; i++) dates.push(fmt(addDays(startDate, i)));

  const picksRequests = dates.map(dateStr => ({
    url: `${BASE_PICKS_URL}${dateStr}.json`,
    parser: async (res) => {
      if (!res.ok) return null;
      const data = await res.json();
      return data.picks && data.picks.length > 0 ? { dateStr, picks: data.picks } : null;
    }
  }));

  const picksResults = await fetchBatch(picksRequests, 10);
  const daysWithPicks = picksResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);
  process.stderr.write(` ${daysWithPicks.length} days with picks found\n`);

  // ── Phase 2: Fetch ESPN ───────────────────────────────────
  process.stderr.write(`Phase 2: Fetching ESPN scores...`);
  const espnDatesNeeded = new Set();
  for (const { dateStr } of daysWithPicks) {
    const d = new Date(dateStr + 'T00:00:00Z');
    espnDatesNeeded.add(fmtESPN(d));
    espnDatesNeeded.add(fmtESPN(addDays(d, 1)));
  }

  const espnCache = new Map();
  const espnRequests = [...espnDatesNeeded].map(espnDate => ({
    url: `${ESPN_BASE}?dates=${espnDate}&limit=300&groups=50`,
    parser: async (res) => {
      const data = await res.json();
      const games = [];
      for (const event of (data.events || [])) {
        const comp = event.competitions?.[0];
        if (!comp || !comp.status?.type?.completed) continue;
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) continue;
        games.push({
          id: event.id,
          homeName: home.team.displayName,
          homeAbbr: home.team.abbreviation,
          homeShort: home.team.shortDisplayName,
          homeScore: parseInt(home.score),
          awayName: away.team.displayName,
          awayAbbr: away.team.abbreviation,
          awayShort: away.team.shortDisplayName,
          awayScore: parseInt(away.score),
          winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away',
        });
      }
      return { espnDate, games };
    }
  }));

  const espnResults = await fetchBatch(espnRequests, 5);
  for (const r of espnResults) {
    if (r.status === 'fulfilled' && r.value) {
      espnCache.set(r.value.espnDate, r.value.games);
    }
  }
  process.stderr.write(` ${espnCache.size} ESPN dates cached\n`);

  function getESPNGames(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const d1 = fmtESPN(d);
    const d2 = fmtESPN(addDays(d, 1));
    const games = [...(espnCache.get(d1) || []), ...(espnCache.get(d2) || [])];
    const seen = new Set();
    return games.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
  }

  // ── Phase 3: Define filter functions ──────────────────────
  const filters = {
    'BASELINE (unfiltered)': {
      label: 'BASELINE — No Filters (reference)',
      fn: (picks, _dateStr) => picks,
    },
    'A': {
      label: 'SCENARIO A — Edge ≥ 40% Only',
      fn: (picks, _dateStr) => picks.filter(p => p.edge >= 0.40),
    },
    'B': {
      label: 'SCENARIO B — No Favorites Worse Than -250',
      fn: (picks, _dateStr) => picks.filter(p => !(p.odds < 0 && p.odds < -250)),
    },
    'C': {
      label: 'SCENARIO C — Top 8 Edges Per Day',
      fn: (picks, _dateStr) => {
        const sorted = [...picks].sort((a, b) => b.edge - a.edge);
        return sorted.slice(0, 8);
      },
    },
    'D': {
      label: 'SCENARIO D — Combined (Edge ≥ 40% + No Fav < -250 + Top 8/Day)',
      fn: (picks, _dateStr) => {
        // First: remove heavy favorites
        let filtered = picks.filter(p => !(p.odds < 0 && p.odds < -250));
        // Then: edge ≥ 40%
        filtered = filtered.filter(p => p.edge >= 0.40);
        // Then: top 8 by edge
        filtered.sort((a, b) => b.edge - a.edge);
        return filtered.slice(0, 8);
      },
    },
  };

  // ── Phase 4: Run each scenario ────────────────────────────
  process.stderr.write(`Phase 3: Grading scenarios...\n`);

  for (const [key, { label, fn }] of Object.entries(filters)) {
    const allResults = [];
    const dailySummaries = [];

    for (const { dateStr, picks } of daysWithPicks) {
      const espnGames = getESPNGames(dateStr);

      // Apply filter
      const filteredPicks = fn(picks, dateStr);

      // Grade
      const dayResults = gradePicksList(filteredPicks, espnGames);

      const dayGraded = dayResults.filter(r => r.won !== null);
      const dayWins = dayGraded.filter(r => r.won).length;
      const dayLosses = dayGraded.filter(r => !r.won).length;
      const dayWagered = dayGraded.reduce((s, r) => s + r.betSize, 0);
      const dayPL = dayGraded.reduce((s, r) => s + r.profit, 0);
      const dayTotal = dayWins + dayLosses;

      dailySummaries.push({
        date: dateStr,
        picks: filteredPicks.length,
        graded: dayTotal,
        wins: dayWins,
        losses: dayLosses,
        unmatched: dayResults.filter(r => r.won === null).length,
        winPct: dayTotal > 0 ? (dayWins / dayTotal * 100) : 0,
        wagered: dayWagered,
        pl: Math.round(dayPL),
        roi: dayWagered > 0 ? (dayPL / dayWagered * 100) : 0,
      });

      allResults.push(...dayResults);
    }

    const summary = summarize(allResults, label);
    printScenario(summary, dailySummaries);
    process.stderr.write(`  ✅ ${key}: ${summary.wins}-${summary.losses}, ROI ${summary.roi.toFixed(1)}%\n`);
  }

  // ── Phase 5: Comparison Table ─────────────────────────────
  console.log(`\n${'═'.repeat(90)}`);
  console.log(`📊 SCENARIO COMPARISON SUMMARY`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`${'Scenario'.padEnd(50)} ${'Record'.padStart(10)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(10)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)} ${'Picks/Day'.padStart(10)}`);
  console.log('─'.repeat(103));

  // Re-run calculations for the summary table
  for (const [key, { label, fn }] of Object.entries(filters)) {
    let allResults = [];
    let daysActive = 0;
    for (const { dateStr, picks } of daysWithPicks) {
      const espnGames = getESPNGames(dateStr);
      const filteredPicks = fn(picks, dateStr);
      if (filteredPicks.length > 0) daysActive++;
      allResults.push(...gradePicksList(filteredPicks, espnGames));
    }
    const s = summarize(allResults, label);
    const plStr = s.pl >= 0 ? `+$${Math.round(s.pl).toLocaleString()}` : `-$${Math.abs(Math.round(s.pl)).toLocaleString()}`;
    const perDay = daysActive > 0 ? (s.total / daysActive).toFixed(1) : '0';
    const shortLabel = key === 'BASELINE (unfiltered)' ? '⬜ Baseline (unfiltered)' :
                       key === 'A' ? '🅰️  Edge ≥ 40%' :
                       key === 'B' ? '🅱️  No fav < -250' :
                       key === 'C' ? '🅲  Top 8 edges/day' :
                                     '🅳  Combined (A+B+C)';
    console.log(
      `${shortLabel.padEnd(50)} ${(s.wins + '-' + s.losses).padStart(10)} ` +
      `${s.total > 0 ? ((s.wins / s.total) * 100).toFixed(1) : '0.0'}% `.padStart(7) +
      `${('$' + s.wagered.toLocaleString()).padStart(10)} ${plStr.padStart(10)} ${s.roi.toFixed(1).padStart(6)}% ${String(perDay).padStart(10)}`
    );
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`✅ All scenarios complete\n`);
}

main().catch(e => console.error(e));
