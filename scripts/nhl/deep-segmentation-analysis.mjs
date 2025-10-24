#!/usr/bin/env node

/**
 * DEEP SEGMENTATION ANALYSIS FOR NHL SHOTS PROPS
 *
 * Joins predictions, market odds, and per-game history to surface
 * actionable micro-segments: line buckets, price bins, edge bins,
 * home/away, month/DOW, usage (TOI), recent shots, trainedOn, and
 * market dispersion. Outputs a JSON report and CSV of top segments.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// CLI overrides
const argv = process.argv.slice(2);
function getArg(name, def) {
  const a = argv.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
}

const oddsPath = getArg('odds', path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json'));
const predsPath = getArg('preds', path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_improved_results.json'));
const gamesPath = getArg('games', path.join(REPO_ROOT, 'data/nhl/historical_game_data.json'));

const outJson = getArg('outJson', path.join(REPO_ROOT, 'data/nhl/deep_segmentation_report.json'));
const outCsv = getArg('outCsv', path.join(REPO_ROOT, 'data/nhl/top_segments.csv'));

function loadJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function parseDate(d) {
  return new Date(d + 'T00:00:00Z');
}

function fmtPct(x) { return Number.isFinite(x) ? +(x * 100).toFixed(2) : null; }
function safeDiv(a, b) { return b ? a / b : 0; }

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║           🧭 NHL Deep Segmentation Analysis                        ║');
console.log('╚════════════════════════════════════════════════════════════════════╝');

const oddsFull = loadJson(oddsPath);
const predsFull = loadJson(predsPath);
const gamesFull = loadJson(gamesPath);

const oddsData = oddsFull.data.filter(g => g.oddsAvailable && g.odds && g.odds.length > 0);
const predsIdx = new Map();
for (const p of predsFull.predictions || []) {
  predsIdx.set(`${p.playerId}|${p.gameDate}`, p);
}

// Build per-player game history index for rolling features
const gamesByPlayer = new Map();
for (const g of gamesFull.games || []) {
  if (!gamesByPlayer.has(g.playerId)) gamesByPlayer.set(g.playerId, []);
  gamesByPlayer.get(g.playerId).push(g);
}
for (const [pid, arr] of gamesByPlayer) {
  arr.sort((a, b) => (a.gameDate < b.gameDate ? -1 : a.gameDate > b.gameDate ? 1 : 0));
}

function rollingContext(playerId, gameDate, n = 10) {
  const arr = gamesByPlayer.get(playerId) || [];
  // Only prior games strictly before the current date
  const prior = arr.filter(g => g.gameDate < gameDate);
  const lastN = prior.slice(-n);
  const last5 = prior.slice(-5);
  const last1 = prior.slice(-1);
  const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const std = (xs) => {
    if (!xs.length) return null;
    const m = avg(xs);
    const v = avg(xs.map(x => (x - m) ** 2));
    return Math.sqrt(v);
  };
  const shotsLast10 = lastN.map(g => g.shots ?? 0);
  const shotsLast5 = last5.map(g => g.shots ?? 0);
  const toiLast10 = lastN.map(g => g.toiMinutes ?? 0);
  const toiLast5 = last5.map(g => g.toiMinutes ?? 0);
  return {
    gamesPrior: prior.length,
    L10_shots_avg: avg(shotsLast10),
    L10_shots_std: std(shotsLast10),
    L5_shots_avg: avg(shotsLast5),
    L10_toi_avg: avg(toiLast10),
    L5_toi_avg: avg(toiLast5),
    lastGameShots: last1.length ? (last1[0].shots ?? null) : null,
    b2b: (() => {
      if (last1.length === 0) return false;
      const prevDate = parseDate(last1[0].gameDate);
      const currDate = parseDate(gameDate);
      const diffDays = (currDate - prevDate) / (24 * 3600 * 1000);
      return diffDays === 1; // exact back-to-back
    })(),
  };
}

// Assemble bets similar to simple-bet-analysis, but with rich fields
const bets = [];
for (const g of oddsData) {
  const pred = predsIdx.get(`${g.playerId}|${g.gameDate}`);
  if (!pred) continue;

  // Choose best payout line at available bookmaker lines
  const best = g.odds.reduce((best, curr) => {
    // For over bets, we want highest overPrice; for under bets, highest underPrice.
    // But we don't yet know side; pick by max of both prices to define a price anchor per line.
    const bestPrice = Math.max(best.overPrice ?? -Infinity, best.underPrice ?? -Infinity);
    const currPrice = Math.max(curr.overPrice ?? -Infinity, curr.underPrice ?? -Infinity);
    return currPrice > bestPrice ? curr : best;
  });

  const line = best.line;
  const predicted = pred.projection;
  const actual = g.actualShots;

  let betSide, betOdds, won;
  if (predicted > line) {
    betSide = 'over';
    betOdds = best.overPrice;
    won = actual > line;
  } else if (predicted < line) {
    betSide = 'under';
    betOdds = best.underPrice;
    won = actual < line;
  } else {
    continue;
  }
  const profit = won ? (betOdds - 1) : -1;

  // Market dispersion across books for this player-date
  const lines = g.odds.map(o => o.line).filter(x => Number.isFinite(x));
  const overPrices = g.odds.map(o => o.overPrice).filter(x => Number.isFinite(x));
  const underPrices = g.odds.map(o => o.underPrice).filter(x => Number.isFinite(x));
  const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const std = (xs) => {
    if (!xs.length) return null;
    const m = mean(xs);
    const v = mean(xs.map(x => (x - m) ** 2));
    return Math.sqrt(v);
  };

  // Rolling usage/recency context
  const rc = rollingContext(g.playerId, g.gameDate, 10);

  bets.push({
    playerId: g.playerId,
    playerName: g.playerName,
    gameDate: g.gameDate,
    team: g.team,
    opponent: g.opponent,
    isHome: g.isHome,
    line,
    predicted,
    actual,
    betSide,
    betOdds,
    won,
    profit,
    edge: predicted - line,
    absEdge: Math.abs(predicted - line),
    oddsCount: g.oddsCount ?? g.odds?.length ?? 0,
    lineMean: mean(lines),
    lineStd: std(lines),
    overPriceMean: mean(overPrices),
    underPriceMean: mean(underPrices),
    overPriceStd: std(overPrices),
    underPriceStd: std(underPrices),
    trainedOn: pred.trainedOn ?? null,
    cycle: pred.cycle ?? null,
    // rolling features
    gamesPrior: rc.gamesPrior,
    L10_shots_avg: rc.L10_shots_avg,
    L10_shots_std: rc.L10_shots_std,
    L5_shots_avg: rc.L5_shots_avg,
    L10_toi_avg: rc.L10_toi_avg,
    L5_toi_avg: rc.L5_toi_avg,
    lastGameShots: rc.lastGameShots,
    b2b: rc.b2b,
    // calendar
    month: parseInt(g.gameDate.slice(5, 7), 10),
    dow: parseDate(g.gameDate).getUTCDay(),
  });
}

console.log(`📦 Joined ${bets.length} bets with predictions + odds + history.`);

// Segmentation helpers
function binLine(x) {
  if (!Number.isFinite(x)) return 'unknown';
  return x.toFixed(1); // e.g., "1.5", "2.5"
}
function binEdge(x) {
  const ax = Math.abs(x);
  if (ax < 0.5) return 'edge_<0.5';
  if (ax < 1.0) return 'edge_0.5-1.0';
  return 'edge_>=1.0';
}
function binOdds(odds) {
  if (!Number.isFinite(odds)) return 'odds_unknown';
  if (odds < 1.80) return 'odds_<1.80';
  if (odds < 2.00) return 'odds_1.80-2.00';
  if (odds < 2.20) return 'odds_2.00-2.20';
  return 'odds_>=2.20';
}
function binToi(x) {
  if (!Number.isFinite(x)) return 'toi_unknown';
  if (x < 15) return 'toi_<15';
  if (x < 18) return 'toi_15-18';
  return 'toi_>=18';
}
function binShotsAvg(x) {
  if (!Number.isFinite(x)) return 'shotsAvg_unknown';
  if (x < 2) return 'shotsAvg_<2';
  if (x < 3) return 'shotsAvg_2-3';
  if (x < 4) return 'shotsAvg_3-4';
  return 'shotsAvg_>=4';
}
function binLastShots(x) {
  if (!Number.isFinite(x)) return 'lastShots_unknown';
  if (x <= 1) return 'lastShots_0-1';
  if (x <= 3) return 'lastShots_2-3';
  return 'lastShots_>=4';
}
function binTrainedOn(x) {
  if (!Number.isFinite(x)) return 'trained_unknown';
  if (x < 500) return 'trained_<500';
  if (x < 2000) return 'trained_500-2000';
  return 'trained_>=2000';
}
function binOddsCount(n) {
  if (!Number.isFinite(n)) return 'books_unknown';
  if (n <= 1) return 'books_1';
  if (n <= 3) return 'books_2-3';
  return 'books_>=4';
}

// Aggregate helper
function aggMetrics(rows) {
  const total = rows.length;
  const wins = rows.filter(r => r.won).length;
  const profit = rows.reduce((s, r) => s + r.profit, 0);
  const roi = safeDiv(profit, total);
  const avgEdge = rows.reduce((s, r) => s + r.absEdge, 0) / (total || 1);
  const avgOdds = rows.reduce((s, r) => s + (r.betOdds ?? 0), 0) / (total || 1);
  const avgPred = rows.reduce((s, r) => s + (r.predicted ?? 0), 0) / (total || 1);
  const avgLine = rows.reduce((s, r) => s + (r.line ?? 0), 0) / (total || 1);
  const avgActual = rows.reduce((s, r) => s + (r.actual ?? 0), 0) / (total || 1);
  const modelBias = avgActual - avgPred;
  const marketBias = avgActual - avgLine;
  return { total, wins, losses: total - wins, profit, roi, avgOdds, avgEdge, avgPred, avgLine, avgActual, modelBias, marketBias };
}

function groupBy(rows, keyFn) {
  const m = new Map();
  for (const r of rows) {
    const k = keyFn(r);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}

// Build segmentation groups
function buildSegments(rows) {
  const segments = {};

  const addSeg = (name, keyFn) => {
    const groups = groupBy(rows, keyFn);
    const items = [];
    for (const [key, arr] of groups) {
      const m = aggMetrics(arr);
      items.push({ key, ...m });
    }
    // sort descending by roi then by total desc
    items.sort((a, b) => (b.roi - a.roi) || (b.total - a.total));
    segments[name] = items;
  };

  addSeg('by_side', r => r.betSide);
  addSeg('by_line_bucket', r => `${binLine(r.line)}_${r.betSide}`);
  addSeg('by_edge_bin', r => `${binEdge(r.edge)}_${r.betSide}`);
  addSeg('by_odds_bin', r => `${binOdds(r.betOdds)}_${r.betSide}`);
  addSeg('by_month', r => `${r.month}_${r.betSide}`);
  addSeg('by_dow', r => `${r.dow}_${r.betSide}`);
  addSeg('by_home', r => `${r.isHome ? 'home' : 'away'}_${r.betSide}`);
  addSeg('by_L10_toi', r => `${binToi(r.L10_toi_avg)}_${r.betSide}`);
  addSeg('by_L10_shots_avg', r => `${binShotsAvg(r.L10_shots_avg)}_${r.betSide}`);
  addSeg('by_last_game_shots', r => `${binLastShots(r.lastGameShots)}_${r.betSide}`);
  addSeg('by_trainedOn', r => `${binTrainedOn(r.trainedOn)}_${r.betSide}`);
  addSeg('by_books_count', r => `${binOddsCount(r.oddsCount)}_${r.betSide}`);
  // dispersion effects
  addSeg('by_line_dispersion', r => {
    const s = r.lineStd;
    if (!Number.isFinite(s)) return `lineDisp_unknown_${r.betSide}`;
    if (s === 0) return `lineDisp_0_${r.betSide}`;
    if (s < 0.05) return `lineDisp_<0.05_${r.betSide}`;
    return `lineDisp_>=0.05_${r.betSide}`;
  });
  addSeg('by_price_dispersion', r => {
    const s = Math.max(r.overPriceStd ?? 0, r.underPriceStd ?? 0);
    if (!Number.isFinite(s) || s === 0) return `priceDisp_low_${r.betSide}`;
    if (s < 0.05) return `priceDisp_med_${r.betSide}`;
    return `priceDisp_high_${r.betSide}`;
  });

  return segments;
}

const overall = aggMetrics(bets);
const segments = buildSegments(bets);

// Produce top segments CSV (min sample threshold)
const MIN_SAMPLES = 20;
const topRows = [];
for (const [name, arr] of Object.entries(segments)) {
  for (const it of arr) {
    if (it.total >= MIN_SAMPLES) {
      topRows.push({ segment: name, key: it.key, total: it.total, wins: it.wins, losses: it.losses, profit: +it.profit.toFixed(2), roi: +it.roi.toFixed(4), avgOdds: +it.avgOdds.toFixed(3), modelBias: +it.modelBias.toFixed(3), marketBias: +it.marketBias.toFixed(3) });
    }
  }
}
topRows.sort((a, b) => (b.roi - a.roi) || (b.total - a.total));

const csvHeader = 'segment,key,total,wins,losses,profit,roi,avgOdds,modelBias,marketBias\n';
const csvBody = topRows.map(r => `${r.segment},${r.key},${r.total},${r.wins},${r.losses},${r.profit},${r.roi},${r.avgOdds},${r.modelBias},${r.marketBias}`).join('\n');
fs.writeFileSync(outCsv, csvHeader + csvBody);

// Save JSON report
fs.writeFileSync(outJson, JSON.stringify({ overall, segments, sampleSize: bets.length }, null, 2));

console.log('📄 Report JSON:', outJson);
console.log('📄 Top segments CSV:', outCsv);
console.log('✔️ Done.');
