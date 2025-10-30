#!/usr/bin/env node

/**
 * Diagnostic script: Debug Points model failure
 *
 * Usage:
 *  node scripts/nba/debug-points-failure.js --results data/nba/backtest-results-baseline.json --data data/nba/training-data-leak-free.json
 */

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const resultsPath = argv[argv.indexOf('--results') + 1] || 'data/nba/backtest-results-baseline.json';
const dataPath = argv[argv.indexOf('--data') + 1] || 'data/nba/training-data-leak-free.json';

function pearson(x, y) {
  const n = x.length;
  if (n === 0) return NaN;
  const meanX = x.reduce((s, v) => s + v, 0) / n;
  const meanY = y.reduce((s, v) => s + v, 0) / n;
  let num = 0, denX = 0, denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den === 0 ? 0 : num / den;
}

// Load files
const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
const allData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

const windowName = Object.keys(results.windows)[0] || 'Feb 2025';
const window = results.windows[windowName];
if (!window) {
  console.error('No window found in results');
  process.exit(1);
}

const bets = window.points.bets || [];
console.log('\n=== Points Bets Summary ===');
console.log('Window:', windowName);
console.log('Total bets in backtest results:', bets.length);

if (bets.length === 0) {
  console.log('No point bets to analyze.');
  process.exit(0);
}

// Compute OVER vs UNDER statistics
let over = {count:0, wins:0, edges:[], signedErrors:[]};
let under = {count:0, wins:0, edges:[], signedErrors:[]};
let all = {count:0, wins:0, edges:[], signedErrors:[], errors:[]};

// Map sample by player+date for feature lookup
const sampleIndex = new Map();
for (const s of allData) {
  const key = `${s.playerName}||${s.gameDate}`;
  sampleIndex.set(key, s);
}

// For feature correlations
const featuresToCheck = ['L5_ppg','L10_ppg','season_ppg','L5_minutes','L10_minutes','L5_fga','opp_ppg_allowed','rest_days','home'];
const featureArrays = {};
for (const f of featuresToCheck) featureArrays[f] = [];
const signedErrors = [];

for (const b of bets) {
  const side = b.side; // 'OVER' or 'UNDER'
  const won = !!b.won;
  const edge = b.absEdge || Math.abs(b.edge || 0);
  const signedError = (b.prediction - b.actual);
  const key = `${b.player}||${b.date}`;
  const sample = sampleIndex.get(key);

  all.count += 1;
  if (won) all.wins += 1;
  all.edges.push(edge);
  all.signedErrors.push(signedError);
  all.errors.push(Math.abs(signedError));

  if (side === 'OVER') {
    over.count +=1; if (won) over.wins +=1; over.edges.push(edge); over.signedErrors.push(signedError);
  } else {
    under.count +=1; if (won) under.wins +=1; under.edges.push(edge); under.signedErrors.push(signedError);
  }

  // gather feature arrays for correlation if sample available
  if (sample && sample.features) {
    const f = sample.features;
    for (const fname of featuresToCheck) {
      let val = f[fname];
      if (val === null || val === undefined) val = NaN;
      featureArrays[fname].push(val);
    }
    signedErrors.push(signedError);
  }
}

function stats(arr) {
  if (!arr || arr.length === 0) return {n:0, mean:NaN, median:NaN};
  const n = arr.length;
  const mean = arr.reduce((s,v)=>s+v,0)/n;
  const sorted = arr.slice().sort((a,b)=>a-b);
  const median = sorted[Math.floor(n/2)];
  return {n, mean, median};
}

console.log('\nOverall bets:', all.count);
console.log('Wins:', all.wins, 'Losses:', all.count - all.wins, 'Win rate:', (all.wins / all.count * 100).toFixed(1)+'%');
console.log('Avg abs edge:', stats(all.edges).mean.toFixed(2));
console.log('Avg signed error (pred-actual):', stats(all.signedErrors).mean.toFixed(2));
console.log('MAE on bets:', stats(all.errors).mean.toFixed(2));

console.log('\nOVER bets:', over.count, 'Wins:', over.wins, 'Win rate:', (over.wins/Math.max(1,over.count)*100).toFixed(1)+'%');
console.log('UNDER bets:', under.count, 'Wins:', under.wins, 'Win rate:', (under.wins/Math.max(1,under.count)*100).toFixed(1)+'%');

// Correlations between signed error and features
console.log('\nFeature correlations with signed prediction error (prediction - actual):');
const corrs = [];
for (const fname of featuresToCheck) {
  const arr = featureArrays[fname].filter(v => !Number.isNaN(v));
  if (arr.length === 0) { corrs.push({fname, corr: NaN}); continue; }
  const minLen = Math.min(arr.length, signedErrors.length);
  const x = arr.slice(0, minLen);
  const y = signedErrors.slice(0, minLen);
  const c = pearson(x,y);
  corrs.push({fname, corr: c});
}
// sort by absolute correlation
corrs.sort((a,b)=>Math.abs(b.corr||0)-Math.abs(a.corr||0));
for (const c of corrs) {
  console.log(`  ${c.fname}: ${isNaN(c.corr)?'NaN':c.corr.toFixed(3)}`);
}

// Compare model vs raw L5 baseline on full test set (not only bets)
console.log('\nComparing model predictions to raw L5 baseline on full test set (Feb 2025)...');
const testStart = '2025-02-01';
const testEnd = '2025-02-28';
const testData = allData.filter(s => s.gameDate >= testStart && s.gameDate <= testEnd && s.features && s.features.games_played_season >=5);

let sumModelError = 0, sumL5Error = 0, cnt=0;
for (const s of testData) {
  const key = `${s.playerName}||${s.gameDate}`;
  // find corresponding bet if exists
  // model prediction is from baseline v2 logic in backtest script; recompute here to be sure
  const base = s.features.L5_ppg || s.features.L10_ppg || s.features.season_ppg || 10;
  // apply same adjustments
  const trend = (s.features.L5_ppg && s.features.L10_ppg && s.features.L10_ppg>0) ? (1 + ((s.features.L5_ppg - s.features.L10_ppg)/s.features.L10_ppg)*0.3) : 1;
  const minutesAdjustment = (s.features.L5_minutes && s.features.L10_minutes && s.features.L10_minutes>0) ? (1 + ((s.features.L5_minutes - s.features.L10_minutes)/s.features.L10_minutes)*0.5) : 1;
  const homeAdj = s.features.home===1 ? 1.05 : 0.98;
  let restAdj = 1; if (s.features.rest_days === 0) restAdj = 0.95; else if (s.features.rest_days >=3) restAdj = 1.03;
  let oppAdj = 1; if (s.features.opp_ppg_allowed && s.features.opp_ppg_allowed>0) { oppAdj = 1 + (((s.features.opp_ppg_allowed/112)-1)*0.3); }
  const modelPred = Math.max(0, Math.min(60, base * trend * minutesAdjustment * homeAdj * restAdj * oppAdj));
  const l5Pred = base;
  const actual = s.actual_points;
  if (actual === null || actual === undefined) continue;
  sumModelError += Math.abs(modelPred - actual);
  sumL5Error += Math.abs(l5Pred - actual);
  cnt++;
}
if (cnt>0) {
  console.log('Samples in full test set:', cnt);
  console.log('Model MAE:', (sumModelError/cnt).toFixed(2));
  console.log('L5 baseline MAE:', (sumL5Error/cnt).toFixed(2));
  console.log('Delta (Model - L5):', ((sumModelError - sumL5Error)/cnt).toFixed(2));
}

// Top offenders (largest absolute errors from bets)
console.log('\nTop 10 largest absolute errors among bets:');
const sortedByError = bets.slice().sort((a,b)=>Math.abs(b.prediction - b.actual) - Math.abs(a.prediction - a.actual));
for (let i=0;i<Math.min(10,sortedByError.length);i++) {
  const b = sortedByError[i];
  console.log(` ${i+1}. ${b.player} ${b.date} | Pred=${b.prediction.toFixed(1)} Line=${b.vegasLine} Actual=${b.actual} Side=${b.side} Won=${b.won} Error=${(b.prediction - b.actual).toFixed(1)}`);
}

console.log('\nDiagnostic script finished.');
