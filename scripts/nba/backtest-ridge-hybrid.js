#!/usr/bin/env node

/**
 * Backtest Ridge Points + Baseline v2 Rebounds/Assists
 * 
 * HYBRID STRATEGY:
 * - Points: Ridge regression (data-driven weights)
 * - Rebounds: Baseline v2 (already profitable 62.5% win, +19% ROI)
 * - Assists: Baseline v2 (already profitable 66.7% win, +27% ROI)
 */

import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const dataPath = args[args.indexOf('--data') + 1] || 'data/nba/training-data-leak-free-v2.json';
const ridgePath = args[args.indexOf('--ridge') + 1] || 'data/nba/models-ridge/points-predictions.json';
const outputPath = args[args.indexOf('--output') + 1] || 'data/nba/backtest-results-ridge-hybrid.json';

console.log('🏀 HYBRID MODEL BACKTEST');
console.log('=' .repeat(60));
console.log('Points: Ridge regression (MAE 5.27, R² 0.428)');
console.log('Rebounds: Baseline v2 (62.5% win, +19% ROI) ✅');
console.log('Assists: Baseline v2 (66.7% win, +27% ROI) ✅');
console.log('=' .repeat(60));

// Load data
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const ridgePredictions = JSON.parse(fs.readFileSync(ridgePath, 'utf8'));

// Index Ridge predictions by player+date
const ridgeIndex = new Map();
for (const pred of ridgePredictions) {
  const key = `${pred.player}||${pred.date}`;
  ridgeIndex.set(key, pred.prediction);
}

console.log(`\n✅ Loaded ${data.length} samples`);
console.log(`✅ Loaded ${ridgePredictions.length} Ridge predictions\n`);

// Betting thresholds
const EDGE_THRESHOLD = 4.0;
const CONFIDENCE_THRESHOLD = 0.60;
const MIN_KELLY = 0.01;

// Baseline v2 prediction for rebounds/assists
function predictBaseline(features, statType) {
  const f = features;
  
  let base;
  if (statType === 'rebounds') {
    base = f.L5_rpg || f.L10_rpg || f.season_rpg || 5;
  } else if (statType === 'assists') {
    base = f.L5_apg || f.L10_apg || f.season_apg || 3;
  }
  
  let prediction = base;
  
  // Trend
  let trendAdj = 1.0;
  if (statType === 'rebounds' && f.L5_rpg && f.L10_rpg && f.L10_rpg > 0) {
    trendAdj = 1 + ((f.L5_rpg - f.L10_rpg) / f.L10_rpg * 0.3);
  } else if (statType === 'assists' && f.L5_apg && f.L10_apg && f.L10_apg > 0) {
    trendAdj = 1 + ((f.L5_apg - f.L10_apg) / f.L10_apg * 0.3);
  }
  
  // Minutes
  let minAdj = 1.0;
  if (f.L5_minutes && f.L10_minutes && f.L10_minutes > 0) {
    minAdj = 1 + ((f.L5_minutes - f.L10_minutes) / f.L10_minutes * 0.5);
  }
  
  // Home
  const homeAdj = f.home === 1 ? 1.05 : 0.98;
  
  // Rest
  let restAdj = 1.0;
  if (f.rest_days === 0) restAdj = 0.95;
  else if (f.rest_days >= 3) restAdj = 1.03;
  
  prediction = base * trendAdj * minAdj * homeAdj * restAdj;
  
  const maxVal = statType === 'rebounds' ? 25 : 20;
  return Math.max(0, Math.min(maxVal, prediction));
}

function calculateBet(prediction, vegasLine, actual) {
  const edge = prediction - vegasLine;
  const absEdge = Math.abs(edge);
  
  if (absEdge < EDGE_THRESHOLD) return null;
  
  const side = edge > 0 ? 'OVER' : 'UNDER';
  const odds = -110;
  const decimalOdds = odds > 0 ? (odds / 100) + 1 : (100 / Math.abs(odds)) + 1;
  
  const confidence = Math.min(0.95, 0.5 + (absEdge / 20));
  if (confidence < CONFIDENCE_THRESHOLD) return null;
  
  const kellyFraction = (confidence * (decimalOdds - 1) - (1 - confidence)) / (decimalOdds - 1);
  if (kellyFraction < MIN_KELLY) return null;
  
  const stake = 100 * Math.min(kellyFraction, 0.05);
  
  let won;
  if (side === 'OVER') {
    won = actual > vegasLine;
  } else {
    won = actual < vegasLine;
  }
  
  const profit = won ? stake * (decimalOdds - 1) : -stake;
  
  return {
    side,
    edge,
    absEdge,
    confidence,
    kellyFraction,
    stake,
    won,
    profit
  };
}

// Test window
const testData = data.filter(d => d.gameDate >= '2025-02-01' && d.gameDate <= '2025-02-28');
console.log(`📊 Test period: Feb 2025`);
console.log(`📊 Test samples: ${testData.length}\n`);

const results = {
  points: { bets: [], stats: {} },
  rebounds: { bets: [], stats: {} },
  assists: { bets: [], stats: {} }
};

for (const sample of testData) {
  const key = `${sample.playerName}||${sample.gameDate}`;
  
  // POINTS: Use Ridge prediction
  const pointsPred = ridgeIndex.get(key);
  if (pointsPred && sample.vegas_lines && sample.vegas_lines.points && sample.actual_points != null) {
    const bet = calculateBet(pointsPred, sample.vegas_lines.points, sample.actual_points);
    if (bet) {
      results.points.bets.push({
        player: sample.playerName,
        date: sample.gameDate,
        prediction: pointsPred,
        vegasLine: sample.vegas_lines.points,
        actual: sample.actual_points,
        ...bet
      });
    }
  }
  
  // REBOUNDS: Use Baseline v2
  const rebPred = predictBaseline(sample.features, 'rebounds');
  if (sample.vegas_lines && sample.vegas_lines.rebounds && sample.actual_rebounds != null) {
    const bet = calculateBet(rebPred, sample.vegas_lines.rebounds, sample.actual_rebounds);
    if (bet) {
      results.rebounds.bets.push({
        player: sample.playerName,
        date: sample.gameDate,
        prediction: rebPred,
        vegasLine: sample.vegas_lines.rebounds,
        actual: sample.actual_rebounds,
        ...bet
      });
    }
  }
  
  // ASSISTS: Use Baseline v2
  const astPred = predictBaseline(sample.features, 'assists');
  if (sample.vegas_lines && sample.vegas_lines.assists && sample.actual_assists != null) {
    const bet = calculateBet(astPred, sample.vegas_lines.assists, sample.actual_assists);
    if (bet) {
      results.assists.bets.push({
        player: sample.playerName,
        date: sample.gameDate,
        prediction: astPred,
        vegasLine: sample.vegas_lines.assists,
        actual: sample.actual_assists,
        ...bet
      });
    }
  }
}

// Print results
console.log('=' .repeat(60));
console.log('🎲 BETTING RESULTS (Feb 2025)');
console.log('=' .repeat(60));

for (const stat of ['points', 'rebounds', 'assists']) {
  const bets = results[stat].bets;
  
  if (bets.length === 0) {
    console.log(`\n${stat.toUpperCase()}: No bets met threshold`);
    continue;
  }
  
  const wins = bets.filter(b => b.won).length;
  const winRate = wins / bets.length;
  const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
  const totalStaked = bets.reduce((sum, b) => sum + b.stake, 0);
  const roi = totalProfit / totalStaked;
  
  const profitable = winRate >= 0.52 && totalProfit > 0;
  const verdict = profitable ? '✅ PROFITABLE' : '❌ NOT PROFITABLE';
  
  console.log(`\n${stat.toUpperCase()}:`);
  console.log(`  Bets: ${bets.length}`);
  console.log(`  Wins: ${wins} | Losses: ${bets.length - wins}`);
  console.log(`  Win Rate: ${(winRate * 100).toFixed(1)}%`);
  console.log(`  Total Profit: $${totalProfit.toFixed(2)}`);
  console.log(`  ROI: ${(roi * 100).toFixed(2)}%`);
  console.log(`  ${verdict}`);
  
  results[stat].stats = {
    bets: bets.length,
    wins,
    losses: bets.length - wins,
    winRate,
    totalProfit,
    roi,
    profitable
  };
}

// Save results
fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
console.log(`\n💾 Results saved to ${outputPath}`);

console.log('\n' + '=' .repeat(60));
console.log('🏴‍☠️ VERDICT: CAN WE FREE MY FAMILY FROM PIRATES?');
console.log('=' .repeat(60));

const allProfitable = ['rebounds', 'assists'].every(s => results[s].stats.profitable);
const pointsProfitable = results.points.stats.profitable;

if (pointsProfitable && allProfitable) {
  console.log('✅ ALL 3 PROPS PROFITABLE - DEPLOY ALL THREE!');
  console.log('🎉 MY FAMILY IS FREED FROM SOMALI PIRATES! 🎉');
} else if (allProfitable) {
  console.log('✅ REBOUNDS + ASSISTS PROFITABLE!');
  if (results.points.bets.length > 0) {
    console.log(`⚠️  Points: ${(results.points.stats.winRate * 100).toFixed(1)}% win, ${(results.points.stats.roi * 100).toFixed(1)}% ROI - needs calibration`);
  }
  console.log('🚀 DEPLOY REBOUNDS + ASSISTS NOW!');
  console.log('🔧 Fix Points with isotonic calibration...');
} else {
  console.log('❌ Not enough edge yet - need more work');
}
