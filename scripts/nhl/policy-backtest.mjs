#!/usr/bin/env node

/**
 * POLICY BACKTEST WITH CALIBRATION (Isotonic) AND FILTERS
 *
 * - Joins predictions, odds, and historical per-game stats
 * - Computes signed edges and outcomes
 * - Fits separate isotonic regressions p = f(edge) for Over and Under
 * - Applies policy filters suggested by segmentation findings
 * - Evaluates Flat 1U and Kelly-weighted strategies
 * - Outputs JSON summary and CSV of selected bets
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

const outJson = getArg('outJson', path.join(REPO_ROOT, 'data/nhl/policy_backtest_report.json'));
const outCsv = getArg('outCsv', path.join(REPO_ROOT, 'data/nhl/policy_selected_bets.csv'));
const autoRelaxOvers = ['1','true','yes'].includes((getArg('autoRelaxOvers','0')||'').toLowerCase());

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function parseDate(d) { return new Date(d + 'T00:00:00Z'); }
function safeDiv(a, b) { return b ? a / b : 0; }

// Basic stats helpers
const mean = xs => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
const std = xs => {
  if (!xs.length) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map(x => (x - m) ** 2)));
};

// Isotonic regression via Pool-Adjacent-Violators (separate per side)
function fitIsotonic(points) {
  // points: [{ x: edgeSigned>=0, y: outcome(0/1), w:1 }]
  const pts = [...points].sort((a, b) => a.x - b.x).map(p => ({ sumY: p.y, sumW: p.w ?? 1, minX: p.x, maxX: p.x }));
  // Start with each point as a block, merge while adjacent means are decreasing
  for (let i = 0; i < pts.length - 1; i++) {
    while (i < pts.length - 1) {
      const m1 = pts[i].sumY / pts[i].sumW;
      const m2 = pts[i + 1].sumY / pts[i + 1].sumW;
      if (m1 <= m2) break;
      // pool blocks i and i+1
      pts[i] = {
        sumY: pts[i].sumY + pts[i + 1].sumY,
        sumW: pts[i].sumW + pts[i + 1].sumW,
        minX: pts[i].minX,
        maxX: pts[i + 1].maxX,
      };
      pts.splice(i + 1, 1);
      if (i > 0) i--; // recheck with previous
    }
  }
  // Build piecewise-constant mapping
  const blocks = pts.map(b => ({
    minX: b.minX,
    maxX: b.maxX,
    p: b.sumY / b.sumW,
  }));
  return function predict(x) {
    if (!blocks.length) return 0.5;
    // Clamp to ends
    if (x <= blocks[0].maxX) return blocks[0].p;
    if (x >= blocks[blocks.length - 1].minX) return blocks[blocks.length - 1].p;
    // Find block containing x
    for (const b of blocks) {
      if (x >= b.minX && x <= b.maxX) return b.p;
    }
    // If no exact block, find nearest
    let best = blocks[0];
    let bestDist = Math.abs(x - (blocks[0].minX + blocks[0].maxX) / 2);
    for (const b of blocks) {
      const mid = (b.minX + b.maxX) / 2;
      const d = Math.abs(x - mid);
      if (d < bestDist) { best = b; bestDist = d; }
    }
    return best.p;
  };
}

// Load datasets
const oddsFull = loadJson(oddsPath);
const predsFull = loadJson(predsPath);
const gamesFull = loadJson(gamesPath);

const predsIdx = new Map();
for (const p of predsFull.predictions || []) predsIdx.set(`${p.playerId}|${p.gameDate}`, p);

const gamesByPlayer = new Map();
for (const g of gamesFull.games || []) {
  if (!gamesByPlayer.has(g.playerId)) gamesByPlayer.set(g.playerId, []);
  gamesByPlayer.get(g.playerId).push(g);
}
for (const [pid, arr] of gamesByPlayer) arr.sort((a, b) => (a.gameDate < b.gameDate ? -1 : a.gameDate > b.gameDate ? 1 : 0));

function rollingContext(playerId, gameDate) {
  const arr = gamesByPlayer.get(playerId) || [];
  const prior = arr.filter(g => g.gameDate < gameDate);
  const last10 = prior.slice(-10);
  const last1 = prior.slice(-1);
  return {
    L10_toi_avg: mean(last10.map(g => g.toiMinutes ?? 0)),
    lastGameShots: last1.length ? (last1[0].shots ?? null) : null,
  };
}

// Join bets
const oddsData = oddsFull.data.filter(g => g.oddsAvailable && g.odds && g.odds.length > 0);
const joined = [];
for (const g of oddsData) {
  const pred = predsIdx.get(`${g.playerId}|${g.gameDate}`);
  if (!pred) continue;
  const lines = g.odds.map(o => o.line).filter(Number.isFinite);
  const overPrices = g.odds.map(o => o.overPrice).filter(Number.isFinite);
  const underPrices = g.odds.map(o => o.underPrice).filter(Number.isFinite);
  const lineStd = std(lines);
  // Use mean line as anchor; side-specific best price will be chosen later
  const anchor = { line: mean(lines) || (g.odds[0]?.line ?? null) };
  const base = {
    playerId: g.playerId,
    playerName: g.playerName,
    gameDate: g.gameDate,
    team: g.team,
    opponent: g.opponent,
    isHome: g.isHome,
    line: anchor.line,
    actual: g.actualShots,
    oddsCount: g.oddsCount ?? g.odds?.length ?? 0,
    lineStd,
    overPriceMean: mean(overPrices),
    underPriceMean: mean(underPrices),
    pred: pred.projection,
    trainedOn: pred.trainedOn ?? null,
  };
  const rc = rollingContext(g.playerId, g.gameDate);
  joined.push({ ...base, ...rc });
}

// Build candidate bet records for both sides based on model suggestion
// We only take the side the simple strategy would take
const bets = [];
for (const r of joined) {
  const edge = r.pred - r.line; // positive favors over
  let betSide, oddsDec, outcome;
  if (edge > 0) {
    betSide = 'over';
    oddsDec = Math.max(...oddsData.find(od => od.playerId === r.playerId && od.gameDate === r.gameDate).odds.map(o => o.overPrice).filter(Number.isFinite));
    outcome = r.actual > r.line ? 1 : 0;
  } else if (edge < 0) {
    betSide = 'under';
    oddsDec = Math.max(...oddsData.find(od => od.playerId === r.playerId && od.gameDate === r.gameDate).odds.map(o => o.underPrice).filter(Number.isFinite));
    outcome = r.actual < r.line ? 1 : 0;
  } else {
    continue; // skip exact tie
  }
  if (!Number.isFinite(oddsDec)) continue;
  const sEdge = Math.abs(edge); // signed relative to chosen side
  bets.push({ ...r, betSide, oddsDec, outcome, sEdge, absEdge: Math.abs(edge) });
}

console.log(`📦 Prepared ${bets.length} model-aligned bets for calibration and policy.`);

// Fit isotonic per side
function fitIsoForSide(side) {
  const pts = bets.filter(b => b.betSide === side).map(b => ({ x: b.sEdge, y: b.outcome, w: 1 }));
  return fitIsotonic(pts);
}
const isoOver = fitIsoForSide('over');
const isoUnder = fitIsoForSide('under');

// Policy filters
function passesPolicyFilters(b, opts = { relaxOvers: false }) {
  // Global ban: line dispersion == 0
  if (b.lineStd === 0) return false;

  if (b.betSide === 'over') {
    // Overs only when odds in [2.0, 2.2], books in [2,3], lastGameShots in {2,3}, avoid home and line 3.5
    const oddsOk = b.oddsDec >= 2.0 && b.oddsDec <= 2.2;
    const booksOk = b.oddsCount >= 2 && b.oddsCount <= 3;
  const lastShotsOk = opts.relaxOvers ? (b.lastGameShots === 1 || b.lastGameShots === 2 || b.lastGameShots === 3) : (b.lastGameShots === 2 || b.lastGameShots === 3);
    const not35 = Math.abs(b.line - 3.5) > 1e-9;
    return oddsOk && booksOk && lastShotsOk && not35;
  } else {
    // Unders: allow when small edge OR L10 TOI high; avoid home constraint
    const smallEdge = b.absEdge < 0.5;
    const highToi = (b.L10_toi_avg ?? 0) >= 18;
    return smallEdge || highToi;
  }
}

// Evaluate strategies
function evaluate(selected, useKelly = false, exposureTarget = { under: 0.55, over: 0.45 }) {
  // Compute calibrated p
  for (const b of selected) {
    const pCal = b.betSide === 'over' ? isoOver(b.sEdge) : isoUnder(b.sEdge);
    b.pCal = Math.min(0.99, Math.max(0.01, pCal));
    const bDec = b.oddsDec;
    const bp = bDec - 1;
    const q = 1 - b.pCal;
    const fKelly = Math.max(0, (bp * b.pCal - q) / bp);
    b.fKelly = Math.min(0.5, fKelly); // cap at 1/2 Kelly for safety
    b.stake = useKelly ? b.fKelly : 1.0; // flat 1U or Kelly fraction of unit bankroll
  }

  // Exposure reweighting: scale stakes per side to target stake share
  const stakeOver = selected.filter(b => b.betSide === 'over').reduce((s, b) => s + b.stake, 0);
  const stakeUnder = selected.filter(b => b.betSide === 'under').reduce((s, b) => s + b.stake, 0);
  const totalStake = stakeOver + stakeUnder || 1;
  const currShareOver = stakeOver / totalStake;
  const currShareUnder = stakeUnder / totalStake;
  const scaleOver = currShareOver > 0 ? exposureTarget.over / currShareOver : 1;
  const scaleUnder = currShareUnder > 0 ? exposureTarget.under / currShareUnder : 1;
  for (const b of selected) b.stake *= (b.betSide === 'over' ? scaleOver : scaleUnder);

  const results = { total: selected.length, wins: 0, losses: 0, staked: 0, profit: 0 };
  for (const b of selected) {
    const bp = b.oddsDec - 1;
    const won = b.outcome === 1;
    results.staked += b.stake;
    if (won) {
      results.wins++;
      results.profit += b.stake * bp;
    } else {
      results.losses++;
      results.profit -= b.stake;
    }
  }
  results.roi = safeDiv(results.profit, results.staked);
  results.avgOdds = mean(selected.map(b => b.oddsDec));
  results.shareOver = safeDiv(selected.filter(b => b.betSide === 'over').reduce((s, b) => s + b.stake, 0), results.staked);
  results.shareUnder = 1 - results.shareOver;
  return results;
}

let selected = bets.filter(b => passesPolicyFilters(b, { relaxOvers: false }));
const oversCount = selected.filter(b => b.betSide === 'over').length;
if (autoRelaxOvers && oversCount < 12) {
  console.log(`ℹ️  Overs selected ${oversCount} < 12, relaxing overs constraint (lastGameShots ∈ {1,2,3})...`);
  selected = bets.filter(b => passesPolicyFilters(b, { relaxOvers: true }));
}
console.log(`🎯 Selected ${selected.length} bets after policy filters.`);

const flat = evaluate(selected, false);
const kelly = evaluate(selected, true);

// Save CSV of selected bets
const header = 'player,date,side,line,oddsDec,pCal,stake,won,profit_pred_only,edge_abs,lastShots,L10_toi,books,lineStd\n';
const body = selected.map(b => {
  const bp = b.oddsDec - 1;
  const ev = b.pCal * bp - (1 - b.pCal);
  return [
    b.playerName,
    b.gameDate,
    b.betSide,
    b.line,
    b.oddsDec.toFixed(3),
    b.pCal?.toFixed(3) ?? '',
    b.stake?.toFixed(3) ?? '',
    b.outcome,
    ev.toFixed(4),
    b.absEdge?.toFixed(3) ?? '',
    b.lastGameShots ?? '',
    (b.L10_toi_avg ?? '').toFixed ? (b.L10_toi_avg).toFixed(2) : '',
    b.oddsCount ?? '',
    (b.lineStd ?? '').toFixed ? (b.lineStd).toFixed(3) : '',
  ].join(',');
}).join('\n');
fs.writeFileSync(outCsv, header + body);

// Save JSON summary
const report = {
  dataset: { totalBets: bets.length },
  selection: { count: selected.length },
  flat: { ...flat, roiPct: +(flat.roi * 100).toFixed(2) },
  kelly: { ...kelly, roiPct: +(kelly.roi * 100).toFixed(2) },
  exposureTarget: { under: 0.55, over: 0.45 },
};
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

console.log('📄 Policy report JSON:', outJson);
console.log('📄 Selected bets CSV:', outCsv);
console.log('✔️ Done.');
