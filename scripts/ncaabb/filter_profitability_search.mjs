#!/usr/bin/env node
/**
 * NCAAMBB Variant B — Comprehensive Filter Profitability Search
 * Re-grades ALL picks Dec 16 → Feb 16 (63 days) with every filter combo
 * to find which filters would have kept us profitable.
 *
 * Dimensions tested:
 *   - Edge floor / ceiling
 *   - Odds floor / ceiling (drop big favorites, drop big dogs, etc.)
 *   - Side (home only, away only, both)
 *   - Model probability minimum
 *   - Max picks per day
 *   - Combos of the above
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

// ─── P/L Calculation ──────────────────────────────────────────
function calcProfit(won, odds, betSize) {
  if (won) {
    return odds > 0 ? betSize * (odds / 100) : betSize * (100 / Math.abs(odds));
  }
  return -betSize;
}

// ─── Filter evaluation ───────────────────────────────────────
function evaluateFilter(gradedPicks, filter) {
  const { label, test } = filter;
  const passing = gradedPicks.filter(test);
  if (passing.length < 20) return null; // need min sample

  const wins = passing.filter(r => r.won).length;
  const losses = passing.filter(r => !r.won).length;
  const wagered = passing.reduce((s, r) => s + r.betSize, 0);
  const pl = passing.reduce((s, r) => s + r.profit, 0);
  const roi = wagered > 0 ? (pl / wagered * 100) : 0;

  return {
    label,
    count: passing.length,
    wins,
    losses,
    winPct: wins / (wins + losses) * 100,
    wagered,
    pl: Math.round(pl),
    roi: parseFloat(roi.toFixed(2)),
  };
}

// ─── Main ─────────────────────────────────────────────────────
async function main() {
  const start = new Date(START_DATE + 'T00:00:00Z');
  const end = new Date(END_DATE + 'T00:00:00Z');
  const totalDays = Math.round((end - start) / 86400000) + 1;

  console.log(`\n🔍 NCAAMBB Variant B — Filter Profitability Search`);
  console.log(`${'═'.repeat(90)}`);
  console.log(`Full season: ${START_DATE} → ${END_DATE} (${totalDays} days)\n`);

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

  const picksResults = await fetchBatch(picksRequests, 12);
  const daysWithPicks = picksResults
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  process.stderr.write(` ${daysWithPicks.length} days\n`);

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

  const espnResults = await fetchBatch(espnRequests, 8);
  for (const r of espnResults) {
    if (r.status === 'fulfilled' && r.value) {
      espnCache.set(r.value.espnDate, r.value.games);
    }
  }
  process.stderr.write(` ${espnCache.size} dates cached\n`);

  function getESPNGames(dateStr) {
    const d = new Date(dateStr + 'T00:00:00Z');
    const d1 = fmtESPN(d);
    const d2 = fmtESPN(addDays(d, 1));
    const games = [...(espnCache.get(d1) || []), ...(espnCache.get(d2) || [])];
    const seen = new Set();
    return games.filter(g => { if (seen.has(g.id)) return false; seen.add(g.id); return true; });
  }

  // ── Phase 3: Grade ALL picks (no filter) ──────────────────
  process.stderr.write(`Phase 3: Grading all picks...\n`);
  const allGraded = [];

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

      allGraded.push({
        date: dateStr,
        pickedTeam: side === 'home' ? pick.home_team : pick.away_team,
        home_team: pick.home_team,
        away_team: pick.away_team,
        side,
        odds,
        edge: pick.edge,
        modelProb: pick.model_prob,
        betSize,
        won,
        profit: Math.round(profit),
        isFav: odds < 0,
        isDog: odds > 0,
      });
    }
  }

  const totalW = allGraded.filter(r => r.won).length;
  const totalL = allGraded.filter(r => !r.won).length;
  const totalWag = allGraded.reduce((s, r) => s + r.betSize, 0);
  const totalPL = allGraded.reduce((s, r) => s + r.profit, 0);

  console.log(`\n📊 BASELINE (no filter): ${totalW}-${totalL} (${((totalW/(totalW+totalL))*100).toFixed(1)}%)  Wagered: $${totalWag.toLocaleString()}  P/L: ${totalPL >= 0 ? '+' : ''}$${Math.round(totalPL).toLocaleString()}  ROI: ${((totalPL/totalWag)*100).toFixed(1)}%`);
  console.log(`   Total graded picks: ${allGraded.length}\n`);

  // ── Phase 4: Test every filter combo ──────────────────────
  console.log(`${'═'.repeat(90)}`);
  console.log(`🔬 SINGLE-DIMENSION FILTERS`);
  console.log(`${'═'.repeat(90)}\n`);

  const singleFilters = [
    // --- Edge filters ---
    { label: 'Edge ≥ 15%',               test: r => r.edge >= 0.15 },
    { label: 'Edge ≥ 20%',               test: r => r.edge >= 0.20 },
    { label: 'Edge ≥ 25%',               test: r => r.edge >= 0.25 },
    { label: 'Edge ≥ 30%',               test: r => r.edge >= 0.30 },
    { label: 'Edge ≥ 35%',               test: r => r.edge >= 0.35 },
    { label: 'Edge ≥ 40%',               test: r => r.edge >= 0.40 },
    { label: 'Edge < 20%',               test: r => r.edge < 0.20 },
    { label: 'Edge < 25%',               test: r => r.edge < 0.25 },
    { label: 'Edge < 30%',               test: r => r.edge < 0.30 },
    { label: 'Edge < 35%',               test: r => r.edge < 0.35 },
    { label: 'Edge < 40%',               test: r => r.edge < 0.40 },
    { label: 'Edge 10-20%',              test: r => r.edge >= 0.10 && r.edge < 0.20 },
    { label: 'Edge 10-25%',              test: r => r.edge >= 0.10 && r.edge < 0.25 },
    { label: 'Edge 10-30%',              test: r => r.edge >= 0.10 && r.edge < 0.30 },
    { label: 'Edge 15-30%',              test: r => r.edge >= 0.15 && r.edge < 0.30 },
    { label: 'Edge 15-35%',              test: r => r.edge >= 0.15 && r.edge < 0.35 },
    { label: 'Edge 20-40%',              test: r => r.edge >= 0.20 && r.edge < 0.40 },
    { label: 'Edge 20-35%',              test: r => r.edge >= 0.20 && r.edge < 0.35 },
    { label: 'Edge 30%+',               test: r => r.edge >= 0.30 },
    { label: 'Edge 40%+',               test: r => r.edge >= 0.40 },

    // --- Odds filters ---
    { label: 'Fav only (odds < 0)',       test: r => r.odds < 0 },
    { label: 'Dog only (odds > 0)',       test: r => r.odds > 0 },
    { label: 'Odds -300 to +100',        test: r => r.odds >= -300 && r.odds <= 100 },
    { label: 'Odds -300 to -100',        test: r => r.odds >= -300 && r.odds < -100 },
    { label: 'Odds -250 to +100',        test: r => r.odds >= -250 && r.odds <= 100 },
    { label: 'Odds -200 to +100',        test: r => r.odds >= -200 && r.odds <= 100 },
    { label: 'Odds -200 to +150',        test: r => r.odds >= -200 && r.odds <= 150 },
    { label: 'Odds -150 to +150',        test: r => r.odds >= -150 && r.odds <= 150 },
    { label: 'Odds -300 to +150',        test: r => r.odds >= -300 && r.odds <= 150 },
    { label: 'Odds -300 to +200',        test: r => r.odds >= -300 && r.odds <= 200 },
    { label: 'No big fav (odds > -300)',  test: r => r.odds > -300 },
    { label: 'No big fav (odds > -250)',  test: r => r.odds > -250 },
    { label: 'No big fav (odds > -200)',  test: r => r.odds > -200 },
    { label: 'No big dog (odds < +150)',  test: r => r.odds < 150 },
    { label: 'No big dog (odds < +200)',  test: r => r.odds < 200 },
    { label: 'No big dog (odds < +130)',  test: r => r.odds < 130 },
    { label: 'Odds -150 to -100 (sm fav)', test: r => r.odds >= -150 && r.odds < -100 },
    { label: 'Fav -300 to -150',         test: r => r.odds >= -300 && r.odds < -150 },

    // --- Side filters ---
    { label: 'Home picks only',          test: r => r.side === 'home' },
    { label: 'Away picks only',          test: r => r.side === 'away' },

    // --- Model probability filters ---
    { label: 'Model prob ≥ 60%',         test: r => r.modelProb >= 0.60 },
    { label: 'Model prob ≥ 70%',         test: r => r.modelProb >= 0.70 },
    { label: 'Model prob ≥ 75%',         test: r => r.modelProb >= 0.75 },
    { label: 'Model prob ≥ 80%',         test: r => r.modelProb >= 0.80 },
    { label: 'Model prob ≥ 85%',         test: r => r.modelProb >= 0.85 },
    { label: 'Model prob ≥ 90%',         test: r => r.modelProb >= 0.90 },
    { label: 'Model prob ≥ 95%',         test: r => r.modelProb >= 0.95 },
    { label: 'Model prob < 80%',         test: r => r.modelProb < 0.80 },
    { label: 'Model prob < 90%',         test: r => r.modelProb < 0.90 },

    // --- Bet size filters ---
    { label: 'Bet size = $1000 (flat)',   test: r => r.betSize === 1000 },
    { label: 'Bet size > $1000',          test: r => r.betSize > 1000 },
    { label: 'Bet size ≥ $800',           test: r => r.betSize >= 800 },
    { label: 'Bet size ≥ $500',           test: r => r.betSize >= 500 },
  ];

  const singleResults = [];
  for (const f of singleFilters) {
    const result = evaluateFilter(allGraded, f);
    if (result) singleResults.push(result);
  }

  // Sort by ROI descending
  singleResults.sort((a, b) => b.roi - a.roi);

  console.log(`${'Filter'.padEnd(38)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(90));
  for (const r of singleResults) {
    const plStr = r.pl >= 0 ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
    const roiStr = r.roi >= 0 ? `+${r.roi.toFixed(1)}%` : `${r.roi.toFixed(1)}%`;
    const marker = r.roi > 0 ? ' ✅' : '';
    console.log(
      `${r.label.padEnd(38)} ${String(r.count).padStart(5)} ${(r.wins + '-' + r.losses).padStart(9)} ${r.winPct.toFixed(1).padStart(5)}% ` +
      `${('$' + r.wagered.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}${marker}`
    );
  }

  // ── Phase 5: Multi-dimensional combos ─────────────────────
  console.log(`\n${'═'.repeat(90)}`);
  console.log(`🧬 MULTI-DIMENSION FILTER COMBOS`);
  console.log(`${'═'.repeat(90)}\n`);

  const comboFilters = [
    // Edge + Odds combos
    { label: 'Edge 10-30% + Fav only',                    test: r => r.edge >= 0.10 && r.edge < 0.30 && r.odds < 0 },
    { label: 'Edge 10-30% + Odds -300 to -100',          test: r => r.edge >= 0.10 && r.edge < 0.30 && r.odds >= -300 && r.odds < -100 },
    { label: 'Edge 10-25% + Fav only',                    test: r => r.edge >= 0.10 && r.edge < 0.25 && r.odds < 0 },
    { label: 'Edge 10-25% + Odds -300 to -100',          test: r => r.edge >= 0.10 && r.edge < 0.25 && r.odds >= -300 && r.odds < -100 },
    { label: 'Edge 15-35% + Fav only',                    test: r => r.edge >= 0.15 && r.edge < 0.35 && r.odds < 0 },
    { label: 'Edge 15-30% + Fav only',                    test: r => r.edge >= 0.15 && r.edge < 0.30 && r.odds < 0 },
    { label: 'Edge 20-40% + Fav only',                    test: r => r.edge >= 0.20 && r.edge < 0.40 && r.odds < 0 },
    { label: 'Edge < 30% + No big fav/dog (-250,+150)',   test: r => r.edge < 0.30 && r.odds > -250 && r.odds < 150 },
    { label: 'Edge < 30% + No big fav/dog (-300,+150)',   test: r => r.edge < 0.30 && r.odds > -300 && r.odds < 150 },
    { label: 'Edge < 25% + No big fav/dog (-300,+150)',   test: r => r.edge < 0.25 && r.odds > -300 && r.odds < 150 },
    { label: 'Edge < 35% + Odds -300 to +150',           test: r => r.edge < 0.35 && r.odds >= -300 && r.odds <= 150 },
    { label: 'Edge 10-30% + Odds -300 to +150',          test: r => r.edge >= 0.10 && r.edge < 0.30 && r.odds >= -300 && r.odds <= 150 },
    { label: 'Edge 10-25% + Odds -250 to +150',          test: r => r.edge >= 0.10 && r.edge < 0.25 && r.odds >= -250 && r.odds <= 150 },

    // Edge + Model prob combos
    { label: 'Edge < 30% + Model ≥ 80%',                  test: r => r.edge < 0.30 && r.modelProb >= 0.80 },
    { label: 'Edge < 30% + Model ≥ 85%',                  test: r => r.edge < 0.30 && r.modelProb >= 0.85 },
    { label: 'Edge < 30% + Model ≥ 90%',                  test: r => r.edge < 0.30 && r.modelProb >= 0.90 },
    { label: 'Edge < 25% + Model ≥ 90%',                  test: r => r.edge < 0.25 && r.modelProb >= 0.90 },
    { label: 'Edge 10-25% + Model ≥ 85%',                test: r => r.edge >= 0.10 && r.edge < 0.25 && r.modelProb >= 0.85 },
    { label: 'Edge 10-30% + Model ≥ 85%',                test: r => r.edge >= 0.10 && r.edge < 0.30 && r.modelProb >= 0.85 },
    { label: 'Edge 10-30% + Model ≥ 90%',                test: r => r.edge >= 0.10 && r.edge < 0.30 && r.modelProb >= 0.90 },

    // Odds + Model prob combos
    { label: 'Fav only + Model ≥ 85%',                    test: r => r.odds < 0 && r.modelProb >= 0.85 },
    { label: 'Fav only + Model ≥ 90%',                    test: r => r.odds < 0 && r.modelProb >= 0.90 },
    { label: 'Fav only + Model ≥ 95%',                    test: r => r.odds < 0 && r.modelProb >= 0.95 },
    { label: 'Odds -300 to -100 + Model ≥ 90%',          test: r => r.odds >= -300 && r.odds < -100 && r.modelProb >= 0.90 },
    { label: 'Odds -250 to +150 + Model ≥ 80%',          test: r => r.odds >= -250 && r.odds <= 150 && r.modelProb >= 0.80 },
    { label: 'Odds -300 to +150 + Model ≥ 85%',          test: r => r.odds >= -300 && r.odds <= 150 && r.modelProb >= 0.85 },
    { label: 'No big dog (<+150) + Model ≥ 85%',         test: r => r.odds < 150 && r.modelProb >= 0.85 },
    { label: 'No big dog (<+130) + Model ≥ 90%',         test: r => r.odds < 130 && r.modelProb >= 0.90 },

    // Triple combos
    { label: 'Edge<30% + Fav + Model≥90%',                test: r => r.edge < 0.30 && r.odds < 0 && r.modelProb >= 0.90 },
    { label: 'Edge<30% + Fav + Model≥85%',                test: r => r.edge < 0.30 && r.odds < 0 && r.modelProb >= 0.85 },
    { label: 'Edge<25% + Fav + Model≥90%',                test: r => r.edge < 0.25 && r.odds < 0 && r.modelProb >= 0.90 },
    { label: 'Edge<25% + Fav + Model≥85%',                test: r => r.edge < 0.25 && r.odds < 0 && r.modelProb >= 0.85 },
    { label: 'Edge<30% + Odds(-300,+150) + Model≥85%',   test: r => r.edge < 0.30 && r.odds >= -300 && r.odds <= 150 && r.modelProb >= 0.85 },
    { label: 'Edge<30% + Odds(-300,+150) + Model≥90%',   test: r => r.edge < 0.30 && r.odds >= -300 && r.odds <= 150 && r.modelProb >= 0.90 },
    { label: 'Edge<25% + Odds(-250,+150) + Model≥90%',   test: r => r.edge < 0.25 && r.odds >= -250 && r.odds <= 150 && r.modelProb >= 0.90 },
    { label: 'Edge 10-25% + Fav + Model≥90%',            test: r => r.edge >= 0.10 && r.edge < 0.25 && r.odds < 0 && r.modelProb >= 0.90 },
    { label: 'Edge 10-25% + Fav -300 to -100 + M≥90%',   test: r => r.edge >= 0.10 && r.edge < 0.25 && r.odds >= -300 && r.odds < -100 && r.modelProb >= 0.90 },
    { label: 'Edge 10-30% + Fav -300 to -100 + M≥85%',   test: r => r.edge >= 0.10 && r.edge < 0.30 && r.odds >= -300 && r.odds < -100 && r.modelProb >= 0.85 },
    { label: 'Edge 10-30% + Odds(-300,+150) + M≥85%',    test: r => r.edge >= 0.10 && r.edge < 0.30 && r.odds >= -300 && r.odds <= 150 && r.modelProb >= 0.85 },
    { label: 'Edge<30% + Away + Model≥90%',               test: r => r.edge < 0.30 && r.side === 'away' && r.modelProb >= 0.90 },
    { label: 'Edge<30% + Away + Fav',                      test: r => r.edge < 0.30 && r.side === 'away' && r.odds < 0 },
    { label: 'Edge<30% + Away + Odds(-300,+150)',         test: r => r.edge < 0.30 && r.side === 'away' && r.odds >= -300 && r.odds <= 150 },

    // Quadruple combos
    { label: 'Edge<30% + Fav(-300,-100) + Model≥90% + Away', test: r => r.edge < 0.30 && r.odds >= -300 && r.odds < -100 && r.modelProb >= 0.90 && r.side === 'away' },
    { label: 'Edge<30% + Fav(-300,-100) + Model≥85% + Away', test: r => r.edge < 0.30 && r.odds >= -300 && r.odds < -100 && r.modelProb >= 0.85 && r.side === 'away' },
    { label: 'Edge<25% + Fav + Model≥90% + Away',            test: r => r.edge < 0.25 && r.odds < 0 && r.modelProb >= 0.90 && r.side === 'away' },
  ];

  const comboResults = [];
  for (const f of comboFilters) {
    const result = evaluateFilter(allGraded, f);
    if (result) comboResults.push(result);
  }

  comboResults.sort((a, b) => b.roi - a.roi);

  console.log(`${'Filter'.padEnd(50)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(102));
  for (const r of comboResults) {
    const plStr = r.pl >= 0 ? `+$${r.pl.toLocaleString()}` : `-$${Math.abs(r.pl).toLocaleString()}`;
    const roiStr = r.roi >= 0 ? `+${r.roi.toFixed(1)}%` : `${r.roi.toFixed(1)}%`;
    const marker = r.roi > 0 ? ' ✅' : '';
    console.log(
      `${r.label.padEnd(50)} ${String(r.count).padStart(5)} ${(r.wins + '-' + r.losses).padStart(9)} ${r.winPct.toFixed(1).padStart(5)}% ` +
      `${('$' + r.wagered.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}${marker}`
    );
  }

  // ── Phase 6: PROFITABLE ONLY summary ─────────────────────
  const allProfitable = [...singleResults, ...comboResults].filter(r => r.roi > 0).sort((a, b) => b.roi - a.roi);

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`💰 ALL PROFITABLE FILTERS (sorted by ROI)`);
  console.log(`${'═'.repeat(90)}\n`);

  console.log(`${'#'.padStart(3)} ${'Filter'.padEnd(50)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
  console.log('─'.repeat(105));

  allProfitable.forEach((r, i) => {
    const plStr = `+$${r.pl.toLocaleString()}`;
    const roiStr = `+${r.roi.toFixed(1)}%`;
    console.log(
      `${String(i + 1).padStart(3)} ${r.label.padEnd(50)} ${String(r.count).padStart(5)} ${(r.wins + '-' + r.losses).padStart(9)} ${r.winPct.toFixed(1).padStart(5)}% ` +
      `${('$' + r.wagered.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}`
    );
  });

  if (allProfitable.length === 0) {
    console.log(`  (none found)`);
  }

  // ── Phase 7: Best practical filters ───────────────────────
  // Find the best filters that have decent volume (≥100 picks)
  const practical = allProfitable.filter(r => r.count >= 100);

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`🏆 BEST PRACTICAL FILTERS (≥100 picks, profitable)`);
  console.log(`${'═'.repeat(90)}\n`);

  if (practical.length === 0) {
    console.log(`  (none found — may need volume threshold < 100)\n`);
    // Also show best with ≥50
    const practical50 = allProfitable.filter(r => r.count >= 50);
    if (practical50.length > 0) {
      console.log(`  Relaxing to ≥50 picks:\n`);
      console.log(`${'#'.padStart(3)} ${'Filter'.padEnd(50)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
      console.log('─'.repeat(105));
      practical50.forEach((r, i) => {
        const plStr = `+$${r.pl.toLocaleString()}`;
        const roiStr = `+${r.roi.toFixed(1)}%`;
        console.log(
          `${String(i + 1).padStart(3)} ${r.label.padEnd(50)} ${String(r.count).padStart(5)} ${(r.wins + '-' + r.losses).padStart(9)} ${r.winPct.toFixed(1).padStart(5)}% ` +
          `${('$' + r.wagered.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}`
        );
      });
    }
  } else {
    console.log(`${'#'.padStart(3)} ${'Filter'.padEnd(50)} ${'N'.padStart(5)} ${'W-L'.padStart(9)} ${'Win%'.padStart(6)} ${'Wagered'.padStart(11)} ${'P/L'.padStart(10)} ${'ROI'.padStart(7)}`);
    console.log('─'.repeat(105));
    practical.forEach((r, i) => {
      const plStr = `+$${r.pl.toLocaleString()}`;
      const roiStr = `+${r.roi.toFixed(1)}%`;
      console.log(
        `${String(i + 1).padStart(3)} ${r.label.padEnd(50)} ${String(r.count).padStart(5)} ${(r.wins + '-' + r.losses).padStart(9)} ${r.winPct.toFixed(1).padStart(5)}% ` +
        `${('$' + r.wagered.toLocaleString()).padStart(11)} ${plStr.padStart(10)} ${roiStr.padStart(7)}`
      );
    });
  }

  console.log(`\n${'═'.repeat(90)}`);
  console.log(`✅ Filter search complete — tested ${singleFilters.length} single filters + ${comboFilters.length} combos`);
  console.log(`   ${allProfitable.length} profitable filters found\n`);

  // ── Save full report ──────────────────────────────────────
  const report = {
    baseline: { record: `${totalW}-${totalL}`, winPct: ((totalW/(totalW+totalL))*100).toFixed(1), wagered: totalWag, pl: Math.round(totalPL), roi: ((totalPL/totalWag)*100).toFixed(1) },
    profitable_filters: allProfitable,
    all_single_results: singleResults,
    all_combo_results: comboResults,
  };
  const jsonPath = join(OUT_DIR, 'filter_profitability_search.json');
  writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`📁 JSON saved → ${jsonPath}`);
}

main().catch(e => console.error(e));
