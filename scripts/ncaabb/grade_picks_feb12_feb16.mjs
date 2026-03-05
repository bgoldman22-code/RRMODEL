#!/usr/bin/env node
/**
 * Grade NCAA MBB Variant B Picks: Feb 12 → Feb 16, 2026
 * Covers the 5-day window since last grading (multiday report ended Feb 11)
 * Fetches picks from GitHub + scores from ESPN, grades ML picks
 * Outputs: console report + out/multiday_report_feb12_feb16.txt
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, 'out');
mkdirSync(OUT_DIR, { recursive: true });

const BASE_PICKS_URL = 'https://raw.githubusercontent.com/bgoldman22-code/NCAAMBBModel/main/data/ncaabb/picks/variant_b_picks_odds_aware_';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';

// Fixed date range
const START_DATE = '2026-02-12';
const END_DATE = '2026-02-16';

// ─── Date Helpers ──────────────────────────────────────────────
function fmt(d) { return d.toISOString().slice(0, 10); }
function fmtESPN(d) { return d.toISOString().slice(0, 10).replace(/-/g, ''); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// ─── Team Name Matching ───────────────────────────────────────
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

// ─── Parallel fetch helper ────────────────────────────────────
async function fetchBatch(items, batchSize = 6) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
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
  const start = new Date(START_DATE + 'T00:00:00Z');
  const end = new Date(END_DATE + 'T00:00:00Z');
  const totalDays = Math.round((end - start) / 86400000) + 1;

  const output = []; // collect all output lines for file writing
  function log(line = '') { console.log(line); output.push(line); }

  log(`\n🏀 NCAA MBB Variant B — Multi-Day Grading & Trend Analysis`);
  log(`${'═'.repeat(90)}`);
  log(`Date range: ${START_DATE} → ${END_DATE} (${totalDays} days)\n`);

  // ── Phase 1: Fetch picks ──────────────────────────────────
  process.stderr.write(`Phase 1: Fetching picks from GitHub...`);
  const dates = [];
  for (let i = 0; i < totalDays; i++) dates.push(fmt(addDays(start, i)));

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
    .map(r => r.value)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  process.stderr.write(` ${daysWithPicks.length} days with picks found\n`);
  log(`Phase 1: ${daysWithPicks.length} days with picks found`);

  // ── Phase 2: Fetch ESPN scores ────────────────────────────
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
  log(`Phase 2: ${espnCache.size} ESPN dates cached`);

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
  log(`Phase 3: Grading picks...`);

  const allResults = [];
  const dailySummaries = [];

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
  }

  // ─── Per-Day Table ────────────────────────────────────────
  log(`\n📅 DAILY BREAKDOWN`);
  log(`${'Date'.padEnd(12)} ${'Picks'.padStart(5)} ${'W'.padStart(3)} ${'L'.padStart(3)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(9)} ${'P/L'.padStart(9)} ${'ROI'.padStart(7)} ${'Unmatched'.padStart(9)}`);
  log('─'.repeat(72));

  for (const d of dailySummaries) {
    const plStr = d.pl >= 0 ? `+$${d.pl.toLocaleString()}` : `-$${Math.abs(d.pl).toLocaleString()}`;
    log(
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

  log(`\n${'═'.repeat(72)}`);
  log(`📊 AGGREGATE (${totalDays} days, ${daysWithPicks.length} days w/ picks)`);
  log(`  Record:        ${wins}-${losses} (${((wins / (wins + losses)) * 100).toFixed(1)}%)`);
  log(`  Total Wagered: $${totalWagered.toLocaleString()}`);
  log(`  Net P/L:       ${totalPL >= 0 ? '+' : ''}$${Math.round(totalPL).toLocaleString()}`);
  log(`  ROI:           ${((totalPL / totalWagered) * 100).toFixed(1)}%`);
  log(`  Avg Picks/Day: ${(allResults.length / daysWithPicks.length).toFixed(1)}`);
  if (unmatched > 0) log(`  Unmatched:     ${unmatched} picks (no ESPN score found)`);

  // ─── Edge Bucket Analysis ─────────────────────────────────
  log(`\n📈 EDGE BUCKET ANALYSIS`);
  const buckets = [
    { label: '10-20%', min: 0.10, max: 0.20 },
    { label: '20-30%', min: 0.20, max: 0.30 },
    { label: '30-40%', min: 0.30, max: 0.40 },
    { label: '40-50%', min: 0.40, max: 0.50 },
    { label: '50%+',   min: 0.50, max: 1.00 },
  ];
  log(`${'Edge'.padEnd(10)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(10)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)} ${'Avg Odds'.padStart(9)}`);
  log('─'.repeat(62));

  for (const b of buckets) {
    const inB = graded.filter(r => r.edge >= b.min && r.edge < b.max);
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const avgOdds = Math.round(inB.reduce((s, r) => s + r.odds, 0) / inB.length);
    const plStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    log(
      `${b.label.padEnd(10)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${('$' + bWag.toLocaleString()).padStart(10)} ${plStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}% ` +
      `${(avgOdds > 0 ? '+' + avgOdds : String(avgOdds)).padStart(9)}`
    );
  }

  // ─── Odds Bucket Analysis ─────────────────────────────────
  log(`\n🎲 ODDS BUCKET ANALYSIS`);
  const oddsBuckets = [
    { label: 'Big Fav (<-300)', test: o => o < -300 },
    { label: 'Fav (-300 to -150)', test: o => o >= -300 && o < -150 },
    { label: 'Sm Fav (-150 to -100)', test: o => o >= -150 && o < -100 },
    { label: "Pick'em (-100 to +100)", test: o => o >= -100 && o <= 100 },
    { label: 'Sm Dog (+101 to +150)', test: o => o > 100 && o <= 150 },
    { label: 'Dog (+151 to +300)', test: o => o > 150 && o <= 300 },
    { label: 'Big Dog (>+300)', test: o => o > 300 },
  ];
  log(`${'Bucket'.padEnd(24)} ${'W-L'.padStart(7)} ${'Win%'.padStart(6)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  log('─'.repeat(58));
  for (const b of oddsBuckets) {
    const inB = graded.filter(r => b.test(r.odds));
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const bWag = inB.reduce((s, r) => s + r.betSize, 0);
    const bPL = inB.reduce((s, r) => s + r.profit, 0);
    const bRoi = bWag > 0 ? (bPL / bWag * 100) : 0;
    const plStr = bPL >= 0 ? `+$${Math.round(bPL).toLocaleString()}` : `-$${Math.abs(Math.round(bPL)).toLocaleString()}`;
    log(
      `${b.label.padEnd(24)} ${(bW + '-' + bL).padStart(7)} ${((bW / (bW + bL)) * 100).toFixed(1).padStart(5)}% ` +
      `${plStr.padStart(10)} ${bRoi.toFixed(1).padStart(6)}%`
    );
  }

  // ─── Home vs Away ─────────────────────────────────────────
  log(`\n🏠 HOME vs AWAY`);
  for (const side of ['home', 'away']) {
    const sidePicks = graded.filter(r => r.side === side);
    if (sidePicks.length === 0) continue;
    const sW = sidePicks.filter(r => r.won).length;
    const sL = sidePicks.filter(r => !r.won).length;
    const sWag = sidePicks.reduce((s, r) => s + r.betSize, 0);
    const sPL = sidePicks.reduce((s, r) => s + r.profit, 0);
    const sRoi = sWag > 0 ? (sPL / sWag * 100) : 0;
    const plStr = sPL >= 0 ? `+$${Math.round(sPL).toLocaleString()}` : `-$${Math.abs(Math.round(sPL)).toLocaleString()}`;
    log(`  ${side.toUpperCase().padEnd(6)} ${sW}-${sL} (${((sW / (sW + sL)) * 100).toFixed(1)}%)  P/L: ${plStr}  ROI: ${sRoi.toFixed(1)}%`);
  }

  // ─── Top Wins & Worst Losses ──────────────────────────────
  const sorted = [...graded].sort((a, b) => b.profit - a.profit);
  log(`\n🏆 TOP 5 WINS`);
  for (const r of sorted.filter(r => r.won).slice(0, 5)) {
    const oddsStr = r.odds > 0 ? `+${r.odds}` : `${r.odds}`;
    log(`  ${r.date}  ${r.pickedTeam.padEnd(30)} ${oddsStr.padStart(5)}  +$${r.profit.toLocaleString()}`);
  }

  log(`\n💀 TOP 5 LOSSES`);
  for (const r of sorted.filter(r => !r.won).slice(-5).reverse()) {
    const oddsStr = r.odds > 0 ? `+${r.odds}` : `${r.odds}`;
    log(`  ${r.date}  ${r.pickedTeam.padEnd(30)} ${oddsStr.padStart(5)}  -$${Math.abs(r.profit).toLocaleString()}`);
  }

  // ─── Model Prob Calibration ───────────────────────────────
  log(`\n🎯 MODEL PROBABILITY CALIBRATION`);
  const calBuckets = [
    { label: '50-60%', min: 0.50, max: 0.60 },
    { label: '60-70%', min: 0.60, max: 0.70 },
    { label: '70-80%', min: 0.70, max: 0.80 },
    { label: '80-90%', min: 0.80, max: 0.90 },
    { label: '90%+',   min: 0.90, max: 1.01 },
  ];
  log(`${'Model Prob'.padEnd(12)} ${'Count'.padStart(6)} ${'W-L'.padStart(7)} ${'Actual%'.padStart(8)} ${'Calibration'.padStart(12)}`);
  log('─'.repeat(50));
  for (const b of calBuckets) {
    const inB = graded.filter(r => r.modelProb >= b.min && r.modelProb < b.max);
    if (inB.length === 0) continue;
    const bW = inB.filter(r => r.won).length;
    const bL = inB.filter(r => !r.won).length;
    const actual = bW / (bW + bL) * 100;
    const expected = (b.min + b.max) / 2 * 100;
    const diff = actual - expected;
    const arrow = diff > 5 ? '📈 OVER' : diff < -5 ? '📉 UNDER' : '✅ OK';
    log(
      `${b.label.padEnd(12)} ${String(bW + bL).padStart(6)} ${(bW + '-' + bL).padStart(7)} ${actual.toFixed(1).padStart(7)}% ${arrow.padStart(12)}`
    );
  }

  // ─── Cumulative with prior 58-day window ──────────────────
  // Prior window (Dec 16 → Feb 11): 470-379, wagered $738,995, P/L -$38,303
  const priorWins = 470, priorLosses = 379, priorWagered = 738995, priorPL = -38303;
  const cumWins = priorWins + wins;
  const cumLosses = priorLosses + losses;
  const cumWagered = priorWagered + totalWagered;
  const cumPL = priorPL + Math.round(totalPL);

  log(`\n${'═'.repeat(72)}`);
  log(`📊 CUMULATIVE (Dec 16 → Feb 16 = prior 58-day + this ${totalDays}-day window)`);
  log(`  Prior (Dec 16 → Feb 11):  470-379 (55.4%)  P/L: -$38,303  ROI: -5.2%`);
  log(`  This window (Feb 12-16):  ${wins}-${losses} (${((wins/(wins+losses))*100).toFixed(1)}%)  P/L: ${totalPL >= 0 ? '+' : ''}$${Math.round(totalPL).toLocaleString()}  ROI: ${((totalPL/totalWagered)*100).toFixed(1)}%`);
  log(`  COMBINED:                 ${cumWins}-${cumLosses} (${((cumWins/(cumWins+cumLosses))*100).toFixed(1)}%)  P/L: ${cumPL >= 0 ? '+' : ''}$${cumPL.toLocaleString()}  ROI: ${((cumPL/cumWagered)*100).toFixed(1)}%`);

  log(`\n${'═'.repeat(90)}`);
  log(`✅ Analysis complete — ${graded.length} picks graded across ${daysWithPicks.length} days\n`);

  // ── Write file ────────────────────────────────────────────
  const outPath = join(OUT_DIR, 'multiday_report_feb12_feb16.txt');
  writeFileSync(outPath, output.join('\n'));
  console.log(`📁 Report saved → ${outPath}`);

  // ── Write JSON ────────────────────────────────────────────
  const jsonReport = {
    date_range: { start: START_DATE, end: END_DATE },
    days_total: totalDays,
    days_with_picks: daysWithPicks.length,
    aggregate: { wins, losses, win_pct: parseFloat(((wins/(wins+losses))*100).toFixed(1)), total_wagered: totalWagered, net_pl: Math.round(totalPL), roi: parseFloat(((totalPL/totalWagered)*100).toFixed(1)), unmatched },
    cumulative: { wins: cumWins, losses: cumLosses, win_pct: parseFloat(((cumWins/(cumWins+cumLosses))*100).toFixed(1)), total_wagered: cumWagered, net_pl: cumPL, roi: parseFloat(((cumPL/cumWagered)*100).toFixed(1)) },
    daily: dailySummaries,
    picks: allResults,
  };
  const jsonPath = join(OUT_DIR, 'multiday_report_feb12_feb16.json');
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  console.log(`📁 JSON saved → ${jsonPath}`);
}

main().catch(e => console.error(e));
