#!/usr/bin/env node
/**
 * NCAAMBB Variant B — Calibration R&D (Track B)
 * 
 * This script keeps the current production model UNTOUCHED.
 * It re-fetches + re-grades every pick from Dec 16 → Feb 16,
 * then builds calibration correctors (Platt scaling + isotonic regression)
 * using walk-forward training, and simulates what P/L would have looked like
 * if edge & bet sizing were recalculated with calibrated probabilities.
 *
 * Sections:
 *   1. Fetch & grade all picks (same as filter_profitability_search)
 *   2. Measure raw miscalibration in detail
 *   3. Train Platt scaling (logistic fit) on cumulative data
 *   4. Train isotonic regression on cumulative data
 *   5. Walk-forward simulation: re-calibrate → re-calculate edge → re-size → re-grade
 *   6. Compare original vs calibrated P/L
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

// ─── Helpers ──────────────────────────────────────────────────
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
    const espnHome = normalize(g.homeName); const espnAway = normalize(g.awayName);
    const espnHomeShort = normalize(g.homeShort || ''); const espnAwayShort = normalize(g.awayShort || '');
    const homeMatch = espnHome.includes(homeNorm) || homeNorm.includes(espnHome) ||
                      espnHomeShort.includes(homeNorm) || homeNorm.includes(espnHomeShort) ||
                      espnHome.includes(homeKeys[0] || '___') || (homeKeys[0] && espnHomeShort.includes(homeKeys[0]));
    const awayMatch = espnAway.includes(awayNorm) || awayNorm.includes(espnAway) ||
                      espnAwayShort.includes(awayNorm) || awayNorm.includes(espnAwayShort) ||
                      espnAway.includes(awayKeys[0] || '___') || (awayKeys[0] && espnAwayShort.includes(awayKeys[0]));
    if (homeMatch && awayMatch) return g;
    const espnHomeKeys = keyWords(g.homeName); const espnAwayKeys = keyWords(g.awayName);
    const homeOverlap = homeKeys.some(k => espnHomeKeys.includes(k) || espnHome.includes(k));
    const awayOverlap = awayKeys.some(k => espnAwayKeys.includes(k) || espnAway.includes(k));
    if (homeOverlap && awayOverlap) return g;
  }
  return null;
}
async function fetchBatch(items, batchSize = 6) {
  const results = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(async ({ url, parser }) => {
      const res = await fetch(url); return parser(res);
    }));
    results.push(...batchResults);
  }
  return results;
}

// ─── Odds → implied prob ──────────────────────────────────────
function oddsToImpliedProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100);
  return 100 / (odds + 100);
}

// ─── P/L calc ─────────────────────────────────────────────────
function calcProfit(won, odds, betSize) {
  if (won) return odds > 0 ? betSize * (odds / 100) : betSize * (100 / Math.abs(odds));
  return -betSize;
}

// ═══════════════════════════════════════════════════════════════
// CALIBRATION METHODS
// ═══════════════════════════════════════════════════════════════

/**
 * Platt Scaling: fit logistic regression   calibrated = 1 / (1 + exp(A*rawProb + B))
 * We find A, B via gradient descent on log-loss over training data.
 */
function fitPlatt(trainingData) {
  // trainingData: [{modelProb, outcome}]  outcome = 1 (win) or 0 (loss)
  let A = 0, B = 0;
  const lr = 0.01;
  const epochs = 5000;

  for (let epoch = 0; epoch < epochs; epoch++) {
    let gradA = 0, gradB = 0;
    for (const { modelProb, outcome } of trainingData) {
      const z = A * modelProb + B;
      const p = 1 / (1 + Math.exp(-z));
      const err = p - outcome;
      gradA += err * modelProb;
      gradB += err;
    }
    A -= lr * gradA / trainingData.length;
    B -= lr * gradB / trainingData.length;
  }

  return { A, B, calibrate: (rawProb) => 1 / (1 + Math.exp(-(A * rawProb + B))) };
}

/**
 * Isotonic Regression (pool adjacent violators algorithm)
 * Fits a monotonically increasing step function to the data.
 */
function fitIsotonic(trainingData) {
  // Sort by model probability
  const sorted = [...trainingData].sort((a, b) => a.modelProb - b.modelProb);

  // Pool Adjacent Violators
  const n = sorted.length;
  const blocks = sorted.map((d, i) => ({
    start: i, end: i, value: d.outcome, weight: 1, sumX: d.modelProb
  }));

  // Merge blocks that violate monotonicity
  let merged = [...blocks];
  let changed = true;
  while (changed) {
    changed = false;
    const newMerged = [merged[0]];
    for (let i = 1; i < merged.length; i++) {
      const prev = newMerged[newMerged.length - 1];
      const curr = merged[i];
      if (prev.value > curr.value) {
        // Merge
        const totalWeight = prev.weight + curr.weight;
        prev.value = (prev.value * prev.weight + curr.value * curr.weight) / totalWeight;
        prev.weight = totalWeight;
        prev.end = curr.end;
        prev.sumX = prev.sumX + curr.sumX;
        changed = true;
      } else {
        newMerged.push(curr);
      }
    }
    merged = newMerged;
  }

  // Build lookup: for each block, compute average modelProb as the "knot"
  const knots = merged.map(b => ({
    x: b.sumX / b.weight,   // avg model prob in this block
    y: b.value,              // calibrated prob
  }));

  return {
    knots,
    calibrate: (rawProb) => {
      if (knots.length === 0) return rawProb;
      if (rawProb <= knots[0].x) return knots[0].y;
      if (rawProb >= knots[knots.length - 1].x) return knots[knots.length - 1].y;
      // Linear interpolation between knots
      for (let i = 0; i < knots.length - 1; i++) {
        if (rawProb >= knots[i].x && rawProb <= knots[i + 1].x) {
          const t = (rawProb - knots[i].x) / (knots[i + 1].x - knots[i].x);
          return knots[i].y + t * (knots[i + 1].y - knots[i].y);
        }
      }
      return knots[knots.length - 1].y;
    }
  };
}

/**
 * Binned calibration: simple bin averaging (the most robust for small N)
 * Divide model probs into bins, replace with observed win rate per bin.
 */
function fitBinned(trainingData, numBins = 10) {
  const bins = [];
  for (let i = 0; i < numBins; i++) {
    const lo = i / numBins;
    const hi = (i + 1) / numBins;
    const inBin = trainingData.filter(d => d.modelProb >= lo && d.modelProb < hi);
    if (inBin.length > 0) {
      const avgProb = inBin.reduce((s, d) => s + d.modelProb, 0) / inBin.length;
      const winRate = inBin.filter(d => d.outcome === 1).length / inBin.length;
      bins.push({ lo, hi, avgProb, winRate, count: inBin.length });
    }
  }

  return {
    bins,
    calibrate: (rawProb) => {
      // Find the bin this prob falls in
      const bin = bins.find(b => rawProb >= b.lo && rawProb < b.hi);
      if (bin) return bin.winRate;
      // Fallback: nearest bin
      let closest = bins[0];
      for (const b of bins) {
        if (Math.abs(b.avgProb - rawProb) < Math.abs(closest.avgProb - rawProb)) closest = b;
      }
      return closest ? closest.winRate : rawProb;
    }
  };
}

// ─── Bet sizing from edge ─────────────────────────────────────
function calculateBetSize(calibratedProb, odds) {
  const impliedProb = oddsToImpliedProb(odds);
  const edge = calibratedProb - impliedProb;

  // Only bet if we have positive edge (≥ 10% to match current model threshold)
  if (edge < 0.10) return { betSize: 0, edge, skip: true };

  // Kelly fraction (quarter-Kelly for safety, as the real model likely uses)
  const kellyFraction = 0.25;
  let kelly;
  if (odds > 0) {
    const b = odds / 100;
    kelly = (calibratedProb * b - (1 - calibratedProb)) / b;
  } else {
    const b = 100 / Math.abs(odds);
    kelly = (calibratedProb * b - (1 - calibratedProb)) / b;
  }

  kelly = Math.max(0, kelly) * kellyFraction;

  // Cap at bankroll fraction, floor at $0, cap at $1000 to match current model
  const bankroll = 10000; // notional
  let betSize = Math.round(kelly * bankroll);
  betSize = Math.max(0, Math.min(betSize, 1000));

  return { betSize, edge, skip: betSize === 0 };
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  const start = new Date(START_DATE + 'T00:00:00Z');
  const end = new Date(END_DATE + 'T00:00:00Z');
  const totalDays = Math.round((end - start) / 86400000) + 1;

  const output = [];
  function log(line = '') { console.log(line); output.push(line); }

  log(`\n🧪 NCAAMBB Variant B — Calibration R&D`);
  log(`${'═'.repeat(90)}`);
  log(`Full season: ${START_DATE} → ${END_DATE} (${totalDays} days)`);
  log(`Production model is UNCHANGED — this is simulation only.\n`);

  // ── Phase 1: Fetch & grade all picks ──────────────────────
  process.stderr.write(`Phase 1: Fetching picks...`);
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
  const picksResults = await fetchBatch(picksRequests, 12);
  const daysWithPicks = picksResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  process.stderr.write(` ${daysWithPicks.length} days\n`);

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
          id: event.id, homeName: home.team.displayName, homeAbbr: home.team.abbreviation,
          homeShort: home.team.shortDisplayName, homeScore: parseInt(home.score),
          awayName: away.team.displayName, awayAbbr: away.team.abbreviation,
          awayShort: away.team.shortDisplayName, awayScore: parseInt(away.score),
          winner: parseInt(home.score) > parseInt(away.score) ? 'home' : 'away',
        });
      }
      return { espnDate, games };
    }
  }));
  const espnResults = await fetchBatch(espnRequests, 8);
  for (const r of espnResults) {
    if (r.status === 'fulfilled' && r.value) espnCache.set(r.value.espnDate, r.value.games);
  }
  process.stderr.write(` ${espnCache.size} dates\n`);

  function getESPNGames(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const d1 = fmtESPN(d); const d2 = fmtESPN(addDays(d, 1));
    const games = [...(espnCache.get(d1) || []), ...(espnCache.get(d2) || [])];
    const seen = new Set();
    return games.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
  }

  process.stderr.write(`Phase 3: Grading all picks...\n`);
  const allPicks = []; // chronological, with outcomes

  for (const { dateStr, picks } of daysWithPicks) {
    const espnGames = getESPNGames(dateStr);
    for (const pick of picks) {
      const game = findGame(pick, espnGames);
      if (!game) continue;
      const side = pick.side;
      const won = game.winner === side;
      const odds = pick.odds;
      const betSize = pick.bet_size_dollars;
      const profit = calcProfit(won, odds, betSize);

      allPicks.push({
        date: dateStr,
        pickedTeam: side === 'home' ? pick.home_team : pick.away_team,
        side, odds, edge: pick.edge, modelProb: pick.model_prob,
        betSize, won, profit: Math.round(profit),
      });
    }
  }

  log(`Total graded picks: ${allPicks.length}`);
  const origW = allPicks.filter(r => r.won).length;
  const origL = allPicks.filter(r => !r.won).length;
  const origWag = allPicks.reduce((s, r) => s + r.betSize, 0);
  const origPL = allPicks.reduce((s, r) => s + r.profit, 0);
  log(`Original: ${origW}-${origL} (${((origW/(origW+origL))*100).toFixed(1)}%)  Wagered: $${origWag.toLocaleString()}  P/L: ${origPL >= 0 ? '+' : ''}$${Math.round(origPL).toLocaleString()}  ROI: ${((origPL/origWag)*100).toFixed(1)}%\n`);

  // ═══════════════════════════════════════════════════════════
  // SECTION 2: DETAILED MISCALIBRATION ANALYSIS
  // ═══════════════════════════════════════════════════════════
  log(`${'═'.repeat(90)}`);
  log(`📏 SECTION 2: DETAILED MISCALIBRATION ANALYSIS`);
  log(`${'═'.repeat(90)}\n`);

  // Fine-grained 5%-wide buckets
  const calBuckets = [];
  for (let lo = 0.40; lo < 1.0; lo += 0.05) {
    const hi = lo + 0.05;
    const inBucket = allPicks.filter(p => p.modelProb >= lo && p.modelProb < hi);
    if (inBucket.length === 0) continue;
    const w = inBucket.filter(p => p.won).length;
    const n = inBucket.length;
    const actual = w / n;
    const expected = (lo + hi) / 2;
    calBuckets.push({ label: `${(lo*100).toFixed(0)}-${(hi*100).toFixed(0)}%`, lo, hi, n, w, actual, expected, gap: actual - expected });
  }

  log(`${'Model Prob'.padEnd(12)} ${'Count'.padStart(6)} ${'W-L'.padStart(8)} ${'Expected'.padStart(9)} ${'Actual'.padStart(8)} ${'Gap'.padStart(8)} ${'Direction'.padStart(10)}`);
  log('─'.repeat(70));
  for (const b of calBuckets) {
    const arrow = b.gap > 0.03 ? '📈 OVER' : b.gap < -0.03 ? '📉 UNDER' : '✅ OK';
    log(
      `${b.label.padEnd(12)} ${String(b.n).padStart(6)} ${(b.w + '-' + (b.n - b.w)).padStart(8)} ` +
      `${(b.expected * 100).toFixed(1).padStart(8)}% ${(b.actual * 100).toFixed(1).padStart(7)}% ` +
      `${((b.gap * 100) >= 0 ? '+' : '') + (b.gap * 100).toFixed(1).padStart(6)}% ${arrow.padStart(10)}`
    );
  }

  // Overall calibration error (ECE - Expected Calibration Error)
  let ece = 0;
  let totalN = 0;
  for (const b of calBuckets) { ece += b.n * Math.abs(b.gap); totalN += b.n; }
  ece /= totalN;
  log(`\nExpected Calibration Error (ECE): ${(ece * 100).toFixed(2)}%`);

  // Average model prob vs actual win rate
  const avgModelProb = allPicks.reduce((s, p) => s + p.modelProb, 0) / allPicks.length;
  const actualWinRate = origW / (origW + origL);
  log(`Average model probability: ${(avgModelProb * 100).toFixed(1)}%`);
  log(`Actual season win rate:    ${(actualWinRate * 100).toFixed(1)}%`);
  log(`Overconfidence gap:        ${((avgModelProb - actualWinRate) * 100).toFixed(1)} percentage points\n`);

  // ═══════════════════════════════════════════════════════════
  // SECTION 3: TRAIN CALIBRATORS (FULL-SEASON FIT)
  // ═══════════════════════════════════════════════════════════
  log(`${'═'.repeat(90)}`);
  log(`🔧 SECTION 3: CALIBRATOR TRAINING (full-season fit)`);
  log(`${'═'.repeat(90)}\n`);

  const trainingData = allPicks.map(p => ({ modelProb: p.modelProb, outcome: p.won ? 1 : 0 }));

  // Platt
  const platt = fitPlatt(trainingData);
  log(`Platt Scaling: A=${platt.A.toFixed(4)}, B=${platt.B.toFixed(4)}`);
  log(`  Raw 0.95 → Calibrated ${(platt.calibrate(0.95) * 100).toFixed(1)}%`);
  log(`  Raw 0.90 → Calibrated ${(platt.calibrate(0.90) * 100).toFixed(1)}%`);
  log(`  Raw 0.80 → Calibrated ${(platt.calibrate(0.80) * 100).toFixed(1)}%`);
  log(`  Raw 0.70 → Calibrated ${(platt.calibrate(0.70) * 100).toFixed(1)}%`);
  log(`  Raw 0.60 → Calibrated ${(platt.calibrate(0.60) * 100).toFixed(1)}%`);
  log(`  Raw 0.50 → Calibrated ${(platt.calibrate(0.50) * 100).toFixed(1)}%`);

  // Isotonic
  const isotonic = fitIsotonic(trainingData);
  log(`\nIsotonic Regression: ${isotonic.knots.length} knots`);
  log(`  Raw 0.95 → Calibrated ${(isotonic.calibrate(0.95) * 100).toFixed(1)}%`);
  log(`  Raw 0.90 → Calibrated ${(isotonic.calibrate(0.90) * 100).toFixed(1)}%`);
  log(`  Raw 0.80 → Calibrated ${(isotonic.calibrate(0.80) * 100).toFixed(1)}%`);
  log(`  Raw 0.70 → Calibrated ${(isotonic.calibrate(0.70) * 100).toFixed(1)}%`);
  log(`  Raw 0.60 → Calibrated ${(isotonic.calibrate(0.60) * 100).toFixed(1)}%`);
  log(`  Raw 0.50 → Calibrated ${(isotonic.calibrate(0.50) * 100).toFixed(1)}%`);

  // Binned
  const binned = fitBinned(trainingData, 10);
  log(`\nBinned Calibration (10 bins):`);
  for (const b of binned.bins) {
    log(`  Bin ${(b.lo*100).toFixed(0)}-${(b.hi*100).toFixed(0)}%: n=${b.count}, avg model=${(b.avgProb*100).toFixed(1)}%, actual win=${(b.winRate*100).toFixed(1)}%`);
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 4: FULL-SEASON RE-SIMULATION
  //   "What if we had used calibrated probs for edge & bet sizing?"
  // ═══════════════════════════════════════════════════════════
  log(`\n${'═'.repeat(90)}`);
  log(`📊 SECTION 4: FULL-SEASON RE-SIMULATION (hindsight, no walk-forward)`);
  log(`${'═'.repeat(90)}\n`);
  log(`NOTE: This uses calibrators trained on ALL data (in-sample). Walk-forward follows.\n`);

  const methods = [
    { name: 'Original (no calibration)', calibrate: (p) => p },
    { name: 'Platt Scaling', calibrate: platt.calibrate },
    { name: 'Isotonic Regression', calibrate: isotonic.calibrate },
    { name: 'Binned (10 bins)', calibrate: binned.calibrate },
  ];

  for (const method of methods) {
    let w = 0, l = 0, wagered = 0, pl = 0, skipped = 0;

    for (const pick of allPicks) {
      const calProb = method.calibrate(pick.modelProb);
      const { betSize, edge, skip } = calculateBetSize(calProb, pick.odds);

      if (skip || betSize <= 0) {
        skipped++;
        continue;
      }

      wagered += betSize;
      const profit = calcProfit(pick.won, pick.odds, betSize);
      pl += profit;
      if (pick.won) w++; else l++;
    }

    const roi = wagered > 0 ? (pl / wagered * 100) : 0;
    const plStr = pl >= 0 ? `+$${Math.round(pl).toLocaleString()}` : `-$${Math.abs(Math.round(pl)).toLocaleString()}`;
    log(`${method.name.padEnd(30)} ${w}-${l} (${((w/(w+l||1))*100).toFixed(1)}%)  Bet: ${w+l}  Skip: ${skipped}  Wag: $${wagered.toLocaleString()}  P/L: ${plStr}  ROI: ${roi.toFixed(1)}%`);
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 5: WALK-FORWARD SIMULATION (honest, out-of-sample)
  //   Train on first N days, predict day N+1, slide forward
  // ═══════════════════════════════════════════════════════════
  log(`\n${'═'.repeat(90)}`);
  log(`🚶 SECTION 5: WALK-FORWARD SIMULATION (out-of-sample)`);
  log(`${'═'.repeat(90)}\n`);
  log(`Method: Train calibrator on all picks BEFORE each day, then apply to that day's picks.`);
  log(`Minimum training window: 14 days of picks data.\n`);

  // Group picks by date
  const picksByDate = new Map();
  for (const p of allPicks) {
    if (!picksByDate.has(p.date)) picksByDate.set(p.date, []);
    picksByDate.get(p.date).push(p);
  }
  const sortedDates = [...picksByDate.keys()].sort();

  const MIN_TRAIN_DAYS = 14;

  // Walk-forward for each calibration method
  const wfMethods = [
    { name: 'Original (no cal)', fitFn: null },
    { name: 'WF Platt Scaling', fitFn: (data) => fitPlatt(data) },
    { name: 'WF Isotonic', fitFn: (data) => fitIsotonic(data) },
    { name: 'WF Binned (10)', fitFn: (data) => fitBinned(data, 10) },
    { name: 'WF Binned (5)', fitFn: (data) => fitBinned(data, 5) },
  ];

  // We also want to simulate with different edge thresholds
  const edgeThresholds = [0.05, 0.10, 0.15];

  for (const edgeMin of edgeThresholds) {
    log(`\n── Edge threshold: ${(edgeMin*100).toFixed(0)}% ──────────────────────────────────`);

    for (const method of wfMethods) {
      let totalW = 0, totalL = 0, totalWag = 0, totalPL = 0, totalSkipped = 0;
      const dailyPL = [];

      for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
        const today = sortedDates[dayIdx];
        const todayPicks = picksByDate.get(today);

        // If no calibration, use original model probs
        let calibrate;
        if (!method.fitFn) {
          calibrate = (p) => p;
        } else {
          // Collect all picks from prior days as training data
          const priorDays = sortedDates.slice(0, dayIdx);
          if (priorDays.length < MIN_TRAIN_DAYS) {
            // Not enough training data — use raw probs
            calibrate = (p) => p;
          } else {
            const trainingPicks = [];
            for (const d of priorDays) {
              for (const p of picksByDate.get(d)) {
                trainingPicks.push({ modelProb: p.modelProb, outcome: p.won ? 1 : 0 });
              }
            }
            const fitted = method.fitFn(trainingPicks);
            calibrate = fitted.calibrate;
          }
        }

        let dayW = 0, dayL = 0, dayWag = 0, dayPL = 0, daySkip = 0;

        for (const pick of todayPicks) {
          const calProb = calibrate(pick.modelProb);
          const impliedProb = oddsToImpliedProb(pick.odds);
          const edge = calProb - impliedProb;

          if (edge < edgeMin) {
            daySkip++;
            continue;
          }

          // Use original bet size (flat $1000 from model) for fair comparison
          // OR re-calculate bet size from calibrated edge
          const betSize = pick.betSize; // keep original sizing for apples-to-apples
          dayWag += betSize;
          const profit = calcProfit(pick.won, pick.odds, betSize);
          dayPL += profit;
          if (pick.won) dayW++; else dayL++;
        }

        totalW += dayW; totalL += dayL; totalWag += dayWag; totalPL += dayPL; totalSkipped += daySkip;
        dailyPL.push({ date: today, w: dayW, l: dayL, pl: Math.round(dayPL), wagered: dayWag });
      }

      const roi = totalWag > 0 ? (totalPL / totalWag * 100) : 0;
      const plStr = totalPL >= 0 ? `+$${Math.round(totalPL).toLocaleString()}` : `-$${Math.abs(Math.round(totalPL)).toLocaleString()}`;
      const marker = roi > 0 ? ' ✅' : '';
      log(
        `  ${method.name.padEnd(22)} ${totalW}-${totalL} (${((totalW/(totalW+totalL||1))*100).toFixed(1)}%)  ` +
        `Bet: ${totalW+totalL}  Skip: ${totalSkipped}  Wag: $${totalWag.toLocaleString()}  P/L: ${plStr}  ROI: ${roi.toFixed(1)}%${marker}`
      );
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 6: WALK-FORWARD WITH RE-CALCULATED BET SIZING
  // ═══════════════════════════════════════════════════════════
  log(`\n${'═'.repeat(90)}`);
  log(`💰 SECTION 6: WALK-FORWARD WITH CALIBRATED BET SIZING`);
  log(`${'═'.repeat(90)}\n`);
  log(`Same walk-forward, but bet size is recalculated using calibrated edge + quarter-Kelly.\n`);

  for (const edgeMin of [0.05, 0.10]) {
    log(`── Edge threshold: ${(edgeMin*100).toFixed(0)}% ──────────────────────────────────`);

    for (const method of wfMethods) {
      let totalW = 0, totalL = 0, totalWag = 0, totalPL = 0, totalSkipped = 0;

      for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
        const today = sortedDates[dayIdx];
        const todayPicks = picksByDate.get(today);

        let calibrate;
        if (!method.fitFn) {
          calibrate = (p) => p;
        } else {
          const priorDays = sortedDates.slice(0, dayIdx);
          if (priorDays.length < MIN_TRAIN_DAYS) {
            calibrate = (p) => p;
          } else {
            const trainingPicks = [];
            for (const d of priorDays) {
              for (const p of picksByDate.get(d)) {
                trainingPicks.push({ modelProb: p.modelProb, outcome: p.won ? 1 : 0 });
              }
            }
            calibrate = method.fitFn(trainingPicks).calibrate;
          }
        }

        for (const pick of todayPicks) {
          const calProb = calibrate(pick.modelProb);
          const { betSize, edge, skip } = calculateBetSize(calProb, pick.odds);

          if (edge < edgeMin || skip || betSize <= 0) {
            totalSkipped++;
            continue;
          }

          totalWag += betSize;
          const profit = calcProfit(pick.won, pick.odds, betSize);
          totalPL += profit;
          if (pick.won) totalW++; else totalL++;
        }
      }

      const roi = totalWag > 0 ? (totalPL / totalWag * 100) : 0;
      const plStr = totalPL >= 0 ? `+$${Math.round(totalPL).toLocaleString()}` : `-$${Math.abs(Math.round(totalPL)).toLocaleString()}`;
      const marker = roi > 0 ? ' ✅' : '';
      log(
        `  ${method.name.padEnd(22)} ${totalW}-${totalL} (${((totalW/(totalW+totalL||1))*100).toFixed(1)}%)  ` +
        `Bet: ${totalW+totalL}  Skip: ${totalSkipped}  Wag: $${totalWag.toLocaleString()}  P/L: ${plStr}  ROI: ${roi.toFixed(1)}%${marker}`
      );
    }
    log('');
  }

  // ═══════════════════════════════════════════════════════════
  // SECTION 7: BEST CALIBRATED FILTER COMBOS
  // ═══════════════════════════════════════════════════════════
  log(`${'═'.repeat(90)}`);
  log(`🏆 SECTION 7: CALIBRATED + FILTER COMBOS (walk-forward)`);
  log(`${'═'.repeat(90)}\n`);
  log(`Testing: Best calibrator from above + profitable filter combos from filter search.\n`);

  // Run WF Platt + Isotonic + Binned with best edge threshold + Dog/Fav filters
  const filterCombos = [
    { label: 'All picks', test: () => true },
    { label: 'Fav only', test: (p) => p.odds < 0 },
    { label: 'Dog only', test: (p) => p.odds > 0 },
    { label: 'Odds -300 to +150', test: (p) => p.odds >= -300 && p.odds <= 150 },
    { label: 'No big fav (>-250)', test: (p) => p.odds > -250 },
    { label: 'Away only', test: (p) => p.side === 'away' },
  ];

  const bestCalMethods = [
    { name: 'WF Platt', fitFn: (data) => fitPlatt(data) },
    { name: 'WF Isotonic', fitFn: (data) => fitIsotonic(data) },
    { name: 'WF Binned(5)', fitFn: (data) => fitBinned(data, 5) },
  ];

  for (const calMethod of bestCalMethods) {
    log(`── ${calMethod.name} ──────────────────────────────────`);

    for (const filter of filterCombos) {
      let totalW = 0, totalL = 0, totalWag = 0, totalPL = 0, totalSkipped = 0;

      for (let dayIdx = 0; dayIdx < sortedDates.length; dayIdx++) {
        const today = sortedDates[dayIdx];
        const todayPicks = picksByDate.get(today);

        let calibrate;
        const priorDays = sortedDates.slice(0, dayIdx);
        if (priorDays.length < MIN_TRAIN_DAYS) {
          calibrate = (p) => p;
        } else {
          const trainingPicks = [];
          for (const d of priorDays) {
            for (const p of picksByDate.get(d)) {
              trainingPicks.push({ modelProb: p.modelProb, outcome: p.won ? 1 : 0 });
            }
          }
          calibrate = calMethod.fitFn(trainingPicks).calibrate;
        }

        for (const pick of todayPicks) {
          if (!filter.test(pick)) { totalSkipped++; continue; }

          const calProb = calibrate(pick.modelProb);
          const impliedProb = oddsToImpliedProb(pick.odds);
          const calEdge = calProb - impliedProb;

          if (calEdge < 0.05) { totalSkipped++; continue; }

          totalWag += pick.betSize;
          const profit = calcProfit(pick.won, pick.odds, pick.betSize);
          totalPL += profit;
          if (pick.won) totalW++; else totalL++;
        }
      }

      const roi = totalWag > 0 ? (totalPL / totalWag * 100) : 0;
      const plStr = totalPL >= 0 ? `+$${Math.round(totalPL).toLocaleString()}` : `-$${Math.abs(Math.round(totalPL)).toLocaleString()}`;
      const marker = roi > 0 ? ' ✅' : '';
      log(
        `  ${filter.label.padEnd(22)} ${totalW}-${totalL} (${((totalW/(totalW+totalL||1))*100).toFixed(1)}%)  ` +
        `Bet: ${totalW+totalL}  Skip: ${totalSkipped}  Wag: $${totalWag.toLocaleString()}  P/L: ${plStr}  ROI: ${roi.toFixed(1)}%${marker}`
      );
    }
    log('');
  }

  // ── Save report ───────────────────────────────────────────
  const reportPath = join(OUT_DIR, 'calibration_rd_report.txt');
  writeFileSync(reportPath, output.join('\n'));
  log(`\n📁 Report saved → ${reportPath}`);

  const jsonReport = {
    baseline: { wins: origW, losses: origL, wagered: origWag, pl: Math.round(origPL), roi: ((origPL/origWag)*100).toFixed(1) },
    calibration_analysis: calBuckets,
    ece: (ece * 100).toFixed(2),
    avg_model_prob: (avgModelProb * 100).toFixed(1),
    actual_win_rate: (actualWinRate * 100).toFixed(1),
    platt: { A: platt.A, B: platt.B },
    isotonic_knots: isotonic.knots.length,
    binned_bins: binned.bins,
  };
  const jsonPath = join(OUT_DIR, 'calibration_rd_report.json');
  writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2));
  log(`📁 JSON saved → ${jsonPath}`);
}

main().catch(e => console.error(e));
