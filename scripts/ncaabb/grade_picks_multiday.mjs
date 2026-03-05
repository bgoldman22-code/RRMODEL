#!/usr/bin/env node
/**
 * NCAA MBB Variant B — Multi-Day Pick Grading & Trend Analysis
 * Fetches picks from GitHub + scores from ESPN for a date range,
 * grades every ML pick, and produces aggregate + per-day stats + trend breakdowns.
 *
 * Usage:  node scripts/ncaabb/grade_picks_multiday.mjs [days_back]
 *   Default: 14 days back from today
 */

const DAYS_BACK = parseInt(process.argv[2] || '14', 10);
const BASE_PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

// ─── Date Helpers ──────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtESPN(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ─── Team Name Matching (proven from Feb 11 grading) ──────────
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

    // Method 1: Direct substring match
    const homeMatch = espnHome.includes(homeNorm) || homeNorm.includes(espnHome) ||
                      espnHomeShort.includes(homeNorm) || homeNorm.includes(espnHomeShort) ||
                      espnHome.includes(homeKeys[0] || '___') || (homeKeys[0] && espnHomeShort.includes(homeKeys[0]));
    const awayMatch = espnAway.includes(awayNorm) || awayNorm.includes(espnAway) ||
                      espnAwayShort.includes(awayNorm) || awayNorm.includes(espnAwayShort) ||
                      espnAway.includes(awayKeys[0] || '___') || (awayKeys[0] && espnAwayShort.includes(awayKeys[0]));

    if (homeMatch && awayMatch) return g;

    // Method 2: Key word overlap
    const espnHomeKeys = keyWords(g.homeName);
    const espnAwayKeys = keyWords(g.awayName);
    const homeOverlap = homeKeys.some(k => espnHomeKeys.includes(k) || espnHome.includes(k));
    const awayOverlap = awayKeys.some(k => espnAwayKeys.includes(k) || espnAway.includes(k));
    if (homeOverlap && awayOverlap) return g;
  }
  return null;
}

// ─── ESPN Scoreboard Fetch ────────────────────────────────────
async function fetchESPNScores(dateStr) {
  // Fetch the date and the next day (UTC boundary handling)
  const d = new Date(dateStr + 'T00:00:00Z');
  const next = addDays(d, 1);
  const urls = [
    `${ESPN_BASE}?dates=${fmtESPN(d)}&limit=300&groups=50`,
    `${ESPN_BASE}?dates=${fmtESPN(next)}&limit=300&groups=50`,
  ];

  const games = [];
  const seen = new Set();
  for (const url of urls) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      for (const event of (data.events || [])) {
        if (seen.has(event.id)) continue;
        seen.add(event.id);
        const comp = event.competitions?.[0];
        if (!comp || !comp.status?.type?.completed) continue;
        const home = comp.competitors.find(c => c.homeAway === 'home');
        const away = comp.competitors.find(c => c.homeAway === 'away');
        if (!home || !away) continue;
        games.push({
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
    } catch (e) { /* skip failed fetches */ }
  }
  return games;
}

// ─── Parallel fetch helper (batch N at a time) ───────────────
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

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build date range: go back DAYS_BACK days, but stop at yesterday (today's games may not be done)
  const endDate = addDays(today, -1); // yesterday
  const startDate = addDays(endDate, -(DAYS_BACK - 1));

  process.stderr.write(`\n🏀 NCAA MBB Variant B — Multi-Day Grading & Trend Analysis\n`);
  process.stderr.write(`Date range: ${fmt(startDate)} → ${fmt(endDate)} (${DAYS_BACK} days)\n`);

  console.log(`\n🏀 NCAA MBB Variant B — Multi-Day Grading & Trend Analysis`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`Date range: ${fmt(startDate)} → ${fmt(endDate)} (${DAYS_BACK} days)\n`);

  // ── Phase 1: Fetch all picks files in parallel ────────────
  process.stderr.write(`Phase 1: Fetching picks from GitHub...`);
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

  // ── Phase 2: Fetch ESPN scores for those days (parallel batches) ──
  process.stderr.write(`Phase 2: Fetching ESPN scores for ${daysWithPicks.length} days...`);

  // Collect all unique ESPN date strings we need
  const espnDatesNeeded = new Set();
  for (const { dateStr } of daysWithPicks) {
    const d = new Date(dateStr + 'T00:00:00Z');
    espnDatesNeeded.add(fmtESPN(d));
    espnDatesNeeded.add(fmtESPN(addDays(d, 1)));
  }

  const espnCache = new Map(); // espnDateStr -> games[]

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

  // Helper to get ESPN games for a pick date (merges date + next day, deduped)
  function getESPNGames(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const d1 = fmtESPN(d);
    const d2 = fmtESPN(addDays(d, 1));
    const games = [...(espnCache.get(d1) || []), ...(espnCache.get(d2) || [])];
    const seen = new Set();
    return games.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
  }

  // ── Phase 3: Grade picks ──────────────────────────────────
  process.stderr.write(`Phase 3: Grading picks...\n`);

  const allResults = [];
  const dailySummaries = [];
  let totalPicksFile = daysWithPicks.length;
  let totalNoFile = DAYS_BACK - totalPicksFile;

  for (const { dateStr, picks } of daysWithPicks) {
    const espnGames = getESPNGames(dateStr);

    let dayWins = 0, dayLosses = 0, dayWagered = 0, dayReturn = 0, dayUnmatched = 0;

    for (const pick of picks) {
      const game = findGame(pick, espnGames);
      const pickedSide = pick.side;
      const pickedTeam = pickedSide === 'home' ? pick.home_team : pick.away_team;
      const odds = pick.odds;
      const betSize = pick.bet_size_dollars;
      const edge = pick.edge;
      const modelProb = pick.model_prob;

      if (!game) {
        allResults.push({ date: dateStr, pickedTeam, odds, edge, betSize, won: null, profit: 0, modelProb, side: pickedSide });
        dayUnmatched++;
        continue;
      }

      const won = game.winner === pickedSide;
      dayWagered += betSize;

      let profit = 0;
      if (won) {
        profit = odds > 0 ? betSize * (odds / 100) : betSize * (100 / Math.abs(odds));
        dayWins++;
      } else {
        profit = -betSize;
        dayLosses++;
      }
      dayReturn += profit;

      allResults.push({
        date: dateStr,
        game: `${game.awayName} @ ${game.homeName}`,
        score: `${game.awayScore}-${game.homeScore}`,
        pickedTeam,
        side: pickedSide,
        odds,
        edge,
        modelProb,
        betSize,
        won,
        profit: Math.round(profit),
      });
    }

    const total = dayWins + dayLosses;
    dailySummaries.push({
      date: dateStr,
      picks: picks.length,
      graded: total,
      wins: dayWins,
      losses: dayLosses,
      unmatched: dayUnmatched,
      winPct: total > 0 ? (dayWins / total * 100) : 0,
      wagered: dayWagered,
      pl: Math.round(dayReturn),
      roi: dayWagered > 0 ? (dayReturn / dayWagered * 100) : 0,
    });

    // (parallel pre-fetched — no per-day delay needed)
  }

  // ─── Per-Day Table ────────────────────────────────────────
  console.log(`📅 DAILY BREAKDOWN`);
  console.log(`${'Date'.padEnd(12)} ${'Picks'.padStart(5)} ${'W'.padStart(3)} ${'L'.padStart(3)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(9)} ${'P/L'.padStart(9)} ${'ROI'.padStart(7)} ${'Unmatched'.padStart(9)}`);
  console.log('─'.repeat(72));

  for (const d of dailySummaries) {
    const plStr = d.pl >= 0 ? `+$${d.pl.toLocaleString()}` : `-$${Math.abs(d.pl).toLocaleString()}`;
    console.log(
      `${d.date.padEnd(12)} ${String(d.picks).padStart(5)} ${String(d.wins).padStart(3)} ${String(d.losses).padStart(3)} ` +
      `${d.winPct.toFixed(1).padStart(5)}% ${('$' + d.wagered.toLocaleString()).padStart(9)} ${plStr.padStart(9)} ` +
      `${d.roi.toFixed(1).padStart(6)}% ${String(d.unmatched).padStart(9)}`
    );
  }

  // ─── Aggregate Summary ────────────────────────────────────
  const graded = allResults.filter(r => r.won !== null);
  const wins = graded.filter(r => r.won).length;
  const losses = graded.filter(r => !r.won).length;
  const totalWagered = graded.reduce((s, r) => s + r.betSize, 0);
  const totalPL = graded.reduce((s, r) => s + r.profit, 0);
  const unmatched = allResults.filter(r => r.won === null).length;

  console.log(`\n${'═'.repeat(72)}`);
  console.log(`📊 AGGREGATE (${DAYS_BACK} days, ${totalPicksFile} days w/ picks)`);
  console.log(`  Record:        ${wins}-${losses} (${((wins / (wins + losses)) * 100).toFixed(1)}%)`);
  console.log(`  Total Wagered: $${totalWagered.toLocaleString()}`);
  console.log(`  Net P/L:       ${totalPL >= 0 ? '+' : ''}$${Math.round(totalPL).toLocaleString()}`);
  console.log(`  ROI:           ${((totalPL / totalWagered) * 100).toFixed(1)}%`);
  console.log(`  Avg Picks/Day: ${(graded.length / totalPicksFile).toFixed(1)}`);
  if (unmatched > 0) console.log(`  Unmatched:     ${unmatched} picks (no ESPN score found)`);

  // ─── Edge Bucket Analysis ─────────────────────────────────
  console.log(`\n📈 EDGE BUCKET ANALYSIS`);
  const buckets = [
    { label: '10-20%', min: 0.10, max: 0.20 },
    { label: '20-30%', min: 0.20, max: 0.30 },
    { label: '30-40%', min: 0.30, max: 0.40 },
    { label: '40-50%', min: 0.40, max: 0.50 },
    { label: '50%+',   min: 0.50, max: 1.00 },
  ];

  console.log(`${'Edge'.padEnd(10)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(10)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)} ${'Avg Odds'.padStart(9)}`);
  console.log('─'.repeat(62));

  for (const b of buckets) {
    const inBucket = graded.filter(r => r.edge >= b.min && r.edge < b.max);
    if (inBucket.length === 0) continue;
    const bW = inBucket.filter(r => r.won).length;
    const bL = inBucket.filter(r => !r.won).length;
    const bWag = inBucket.reduce((s, r) => s + r.betSize, 0);
    const bPL = inBucket.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const avgOdds = Math.round(inBucket.reduce((s, r) => s + r.odds, 0) / inBucket.length);
    const plStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `${b.label.padEnd(10)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${('$' + bWag.toLocaleString()).padStart(10)} ${plStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}% ` +
      `${(avgOdds > 0 ? '+' + avgOdds : String(avgOdds)).padStart(9)}`
    );
  }

  // ─── Odds Bucket Analysis ─────────────────────────────────
  console.log(`\n🎲 ODDS BUCKET ANALYSIS`);
  const oddsBuckets = [
    { label: 'Big Fav (<-300)', test: o => o < -300 },
    { label: 'Fav (-300 to -150)', test: o => o >= -300 && o < -150 },
    { label: 'Sm Fav (-150 to -100)', test: o => o >= -150 && o < -100 },
    { label: 'Pick\'em (-100 to +100)', test: o => o >= -100 && o <= 100 },
    { label: 'Sm Dog (+101 to +150)', test: o => o > 100 && o <= 150 },
    { label: 'Dog (+151 to +300)', test: o => o > 150 && o <= 300 },
    { label: 'Big Dog (>+300)', test: o => o > 300 },
  ];

  console.log(`${'Bucket'.padEnd(24)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(58));

  for (const b of oddsBuckets) {
    const inBucket = graded.filter(r => b.test(r.odds));
    if (inBucket.length === 0) continue;
    const bW = inBucket.filter(r => r.won).length;
    const bL = inBucket.filter(r => !r.won).length;
    const bWag = inBucket.reduce((s, r) => s + r.betSize, 0);
    const bPL = inBucket.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const plStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    console.log(
      `${b.label.padEnd(24)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${plStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}%`
    );
  }

  // ─── Home vs Away ─────────────────────────────────────────
  console.log(`\n🏠 HOME vs AWAY`);
  for (const side of ['home', 'away']) {
    const sidePicks = graded.filter(r => r.side === side);
    if (sidePicks.length === 0) continue;
    const sW = sidePicks.filter(r => r.won).length;
    const sL = sidePicks.filter(r => !r.won).length;
    const sWag = sidePicks.reduce((s, r) => s + r.betSize, 0);
    const sPL = sidePicks.reduce((s, r) => s + r.profit, 0);
    const sRoi = sWag > 0 ? (sPL / sWag * 100) : 0;
    const plStr = sPL >= 0 ? `+$${Math.round(sPL).toLocaleString()}` : `-$${Math.abs(Math.round(sPL)).toLocaleString()}`;
    console.log(`  ${side.toUpperCase().padEnd(6)} ${sW}-${sL} (${((sW / (sW + sL)) * 100).toFixed(1)}%)  P/L: ${plStr}  ROI: ${sRoi.toFixed(1)}%`);
  }

  // ─── Rolling 3-Day Trend ──────────────────────────────────
  console.log(`\n📉 ROLLING 3-DAY TREND`);
  if (dailySummaries.length >= 3) {
    console.log(`${'Window'.padEnd(27)} ${'W-L'.padStart(6)} ${'Win%'.padStart(6)} ${'P/L'.padStart(9)} ${'ROI'.padStart(7)}`);
    console.log('─'.repeat(58));
    for (let i = 0; i <= dailySummaries.length - 3; i++) {
      const window = dailySummaries.slice(i, i + 3);
      const wW = window.reduce((s, d) => s + d.wins, 0);
      const wL = window.reduce((s, d) => s + d.losses, 0);
      const wWag = window.reduce((s, d) => s + d.wagered, 0);
      const wPL = window.reduce((s, d) => s + d.pl, 0);
      const wRoi = wWag > 0 ? (wPL / wWag * 100) : 0;
      const plStr = wPL >= 0 ? `+$${wPL.toLocaleString()}` : `-$${Math.abs(wPL).toLocaleString()}`;
      const label = `${window[0].date} → ${window[2].date}`;
      console.log(
        `${label.padEnd(27)} ${(wW + '-' + wL).padStart(6)} ${wWag > 0 ? ((wW / (wW + wL)) * 100).toFixed(1).padStart(5) + '%' : '  N/A '} ` +
        `${plStr.padStart(9)} ${wRoi.toFixed(1).padStart(6)}%`
      );
    }
  }

  // ─── Top Wins & Worst Losses ──────────────────────────────
  const sorted = [...graded].sort((a, b) => b.profit - a.profit);
  console.log(`\n🏆 TOP 10 WINS`);
  for (const r of sorted.filter(r => r.won).slice(0, 10)) {
    const oddsStr = r.odds > 0 ? `+${r.odds}` : `${r.odds}`;
    console.log(`  ${r.date}  ${r.pickedTeam.padEnd(25)} ${oddsStr.padStart(5)}  +$${r.profit.toLocaleString()}`);
  }

  console.log(`\n💀 TOP 10 LOSSES`);
  for (const r of sorted.filter(r => !r.won).slice(-10).reverse()) {
    const oddsStr = r.odds > 0 ? `+${r.odds}` : `${r.odds}`;
    console.log(`  ${r.date}  ${r.pickedTeam.padEnd(25)} ${oddsStr.padStart(5)}  -$${Math.abs(r.profit).toLocaleString()}`);
  }

  // ─── Model Prob Calibration ───────────────────────────────
  console.log(`\n🎯 MODEL PROBABILITY CALIBRATION`);
  const calBuckets = [
    { label: '50-60%', min: 0.50, max: 0.60 },
    { label: '60-70%', min: 0.60, max: 0.70 },
    { label: '70-80%', min: 0.70, max: 0.80 },
    { label: '80-90%', min: 0.80, max: 0.90 },
    { label: '90%+',   min: 0.90, max: 1.01 },
  ];
  console.log(`${'Model Prob'.padEnd(12)} ${'Count'.padStart(6)} ${'W-L'.padStart(7)} ${'Actual%'.padStart(8)} ${'Calibration'.padStart(12)}`);
  console.log('─'.repeat(50));

  for (const b of calBuckets) {
    const inBucket = graded.filter(r => r.modelProb >= b.min && r.modelProb < b.max);
    if (inBucket.length === 0) continue;
    const bW = inBucket.filter(r => r.won).length;
    const bL = inBucket.filter(r => !r.won).length;
    const actual = bW / (bW + bL) * 100;
    const expected = (b.min + b.max) / 2 * 100;
    const diff = actual - expected;
    const arrow = diff > 5 ? '📈 OVER' : diff < -5 ? '📉 UNDER' : '✅ OK';
    console.log(
      `${b.label.padEnd(12)} ${String(bW + bL).padStart(6)} ${(bW + '-' + bL).padStart(7)} ${actual.toFixed(1).padStart(7)}% ${arrow.padStart(12)}`
    );
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`✅ Analysis complete — ${graded.length} picks graded across ${totalPicksFile} days\n`);
}

main().catch(e => console.error(e));
