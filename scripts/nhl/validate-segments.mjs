#!/usr/bin/env node

/**
 * VALIDATION SEGMENT ANALYSIS
 * 
 * Tests the 13 profitable segments discovered in Pass 1 (Oct 2023 - Feb 2024)
 * on fresh validation data (Dec 2024 - Apr 2025) to see if they hold up.
 * 
 * This is critical out-of-sample testing to avoid overfitting.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');

// Load validation odds data (Dec 2024 - Apr 2025)
const oddsData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/nhl/historical_odds_data_v2.json'), 'utf-8')
);

// Load calibrated predictions (these have the actual prediction array)
const calibratedData = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'data/nhl/walkforward_backtest_calibrated_results.json'), 'utf-8')
);

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║                                                                    ║');
console.log('║       🔬 VALIDATION SEGMENT ANALYSIS                               ║');
console.log('║       Testing Pass 1 segments on fresh Dec 2024 - Apr 2025 data   ║');
console.log('║                                                                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

console.log('📊 Data loaded:');
console.log(`   Validation odds: ${oddsData.gamesWithOdds} games with odds`);
console.log(`   Date range: ${oddsData.data[0].date} to ${oddsData.data[oddsData.data.length - 1].date}`);
console.log(`   Predictions: ${calibratedData.predictions?.length || 0} player-games\n`);

// Build prediction lookup
const predMap = new Map();
const allPredictions = calibratedData.predictions || [];
for (const pred of allPredictions) {
  const key = `${pred.playerId}_${pred.gameDate}`;
  predMap.set(key, pred);
}

// Apply calibrations (same as Pass 1)
function calibratePrediction(pred) {
  let calibrated = pred;
  
  // 1. Floor compression (20% reduction for low predictions)
  if (calibrated < 3.5) {
    calibrated = calibrated * 0.8;
  }
  
  // 2. High prediction haircut (10% reduction for excess above 4.0)
  if (calibrated > 4.0) {
    const excess = calibrated - 4.0;
    calibrated = 4.0 + (excess * 0.9);
  }
  
  // 3. Global bias correction (5% reduction)
  calibrated = calibrated * 0.95;
  
  return calibrated;
}

// Process validation bets
const bets = [];
let matched = 0;
let unmatched = 0;

for (const game of oddsData.data) {
  if (!game.oddsAvailable || !game.odds || game.odds.length === 0) continue;
  
  const key = `${game.playerId}_${game.gameDate}`;
  const pred = predMap.get(key);
  
  if (!pred) {
    unmatched++;
    continue;
  }
  
  matched++;
  
  // Use ALREADY calibrated prediction from the calibrated results file
  const calibratedPred = pred.predictedShots;  // This is already calibrated!
  
  // Get consensus line (average across bookmakers)
  const lines = game.odds.map(o => o.line);
  const avgLine = lines.reduce((a, b) => a + b, 0) / lines.length;
  
  // Get average odds
  const avgOverOdds = game.odds.reduce((a, o) => a + o.overPrice, 0) / game.odds.length;
  const avgUnderOdds = game.odds.reduce((a, o) => a + o.underPrice, 0) / game.odds.length;
  
  // Bet logic: Over if pred > line, Under if pred < line
  const betDirection = calibratedPred > avgLine ? 'over' : 'under';
  const betOdds = betDirection === 'over' ? avgOverOdds : avgUnderOdds;
  const actualShots = game.actualShots;
  
  let won;
  if (betDirection === 'over') {
    won = actualShots > avgLine;
  } else {
    won = actualShots < avgLine;
  }
  
  const profit = won ? (betOdds - 1) : -1;
  const edge = Math.abs(calibratedPred - avgLine);
  
  bets.push({
    date: game.date,
    player: game.playerName,
    team: game.team,
    opponent: game.opponent,
    prediction: pred.predictedShots,
    calibratedPred,
    line: avgLine,
    edge,
    direction: betDirection,
    odds: betOdds,
    actual: actualShots,
    won,
    profit
  });
}

console.log('🔗 Matching validation odds to predictions:');
console.log(`   Matched: ${matched}`);
console.log(`   Unmatched: ${unmatched}`);
console.log(`   Total bets: ${bets.length}\n`);

// Overall validation performance
const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
const winRate = (bets.filter(b => b.won).length / bets.length) * 100;
const roi = (totalProfit / bets.length) * 100;
const breakEvenRate = (1 / (bets.reduce((sum, b) => sum + b.odds, 0) / bets.length)) * 100;

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 OVERALL VALIDATION PERFORMANCE');
console.log('═══════════════════════════════════════════════════════════════════\n');
console.log(`Total bets: ${bets.length}`);
console.log(`Win rate: ${winRate.toFixed(1)}%`);
console.log(`ROI: ${roi.toFixed(2)}%`);
console.log(`Total profit: ${totalProfit.toFixed(2)} units`);
console.log(`Break-even rate needed: ${breakEvenRate.toFixed(1)}%`);
console.log(`Decision: ${roi > 0 ? '✅ PROFITABLE' : '❌ UNPROFITABLE'}\n`);

// Test all 13 segments from Pass 1
console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 SEGMENT VALIDATION (Testing Pass 1 discoveries)');
console.log('═══════════════════════════════════════════════════════════════════\n');

const segments = [
  {
    name: 'Under pred 3.0-3.5',
    filter: b => b.direction === 'under' && b.calibratedPred >= 3.0 && b.calibratedPred < 3.5,
    pass1: { bets: 6, winRate: 83.3, roi: 39.7 }
  },
  {
    name: 'Under edge 0.8-1.0',
    filter: b => b.direction === 'under' && b.edge >= 0.8 && b.edge < 1.0,
    pass1: { bets: 11, winRate: 81.8, roi: 38.5 }
  },
  {
    name: 'U1.5 pred 1.3-1.5',
    filter: b => b.direction === 'under' && b.line === 1.5 && b.calibratedPred >= 1.3 && b.calibratedPred < 1.5,
    pass1: { bets: 5, winRate: 60.0, roi: 26.0 }
  },
  {
    name: 'U3.5 pred < 2.5',
    filter: b => b.direction === 'under' && b.line === 3.5 && b.calibratedPred < 2.5,
    pass1: { bets: 9, winRate: 77.8, roi: 25.4 }
  },
  {
    name: 'Under 3.5 (all)',
    filter: b => b.direction === 'under' && b.line === 3.5,
    pass1: { bets: 20, winRate: 75.0, roi: 24.9 }
  },
  {
    name: 'Under edge < 0.2',
    filter: b => b.direction === 'under' && b.edge < 0.2,
    pass1: { bets: 23, winRate: 65.2, roi: 19.9 }
  },
  {
    name: 'U3.5 edge > 0.5',
    filter: b => b.direction === 'under' && b.line === 3.5 && b.edge > 0.5,
    pass1: { bets: 14, winRate: 71.4, roi: 18.6 }
  },
  {
    name: 'Under pred 2.5-3.0',
    filter: b => b.direction === 'under' && b.calibratedPred >= 2.5 && b.calibratedPred < 3.0,
    pass1: { bets: 13, winRate: 69.2, roi: 19.0 }
  },
  {
    name: 'Under edge 0.4-0.6',
    filter: b => b.direction === 'under' && b.edge >= 0.4 && b.edge < 0.6,
    pass1: { bets: 20, winRate: 65.0, roi: 13.7 }
  },
  {
    name: 'U2.5 pred < 2.0',
    filter: b => b.direction === 'under' && b.line === 2.5 && b.calibratedPred < 2.0,
    pass1: { bets: 7, winRate: 71.4, roi: 10.9 }
  },
  {
    name: 'Under pred 2.0-2.5',
    filter: b => b.direction === 'under' && b.calibratedPred >= 2.0 && b.calibratedPred < 2.5,
    pass1: { bets: 32, winRate: 62.5, roi: 8.8 }
  },
  {
    name: 'Under edge 0.6-0.8',
    filter: b => b.direction === 'under' && b.edge >= 0.6 && b.edge < 0.8,
    pass1: { bets: 14, winRate: 64.3, roi: 8.3 }
  },
  {
    name: 'Under edge 0.2-0.4',
    filter: b => b.direction === 'under' && b.edge >= 0.2 && b.edge < 0.4,
    pass1: { bets: 31, winRate: 61.3, roi: 6.1 }
  }
];

const validationResults = [];

for (const segment of segments) {
  const segmentBets = bets.filter(segment.filter);
  
  if (segmentBets.length === 0) {
    validationResults.push({
      name: segment.name,
      pass1Bets: segment.pass1.bets,
      pass1WinRate: segment.pass1.winRate,
      pass1ROI: segment.pass1.roi,
      valBets: 0,
      valWinRate: 0,
      valROI: 0,
      valProfit: 0,
      status: '⚠️  NO DATA'
    });
    continue;
  }
  
  const wins = segmentBets.filter(b => b.won).length;
  const valWinRate = (wins / segmentBets.length) * 100;
  const valProfit = segmentBets.reduce((sum, b) => sum + b.profit, 0);
  const valROI = (valProfit / segmentBets.length) * 100;
  
  // Status: Compare to Pass 1
  let status;
  if (valROI > segment.pass1.roi * 0.5) {
    status = '✅ CONFIRMED';
  } else if (valROI > 0) {
    status = '⚠️  WEAKER';
  } else {
    status = '❌ FAILED';
  }
  
  validationResults.push({
    name: segment.name,
    pass1Bets: segment.pass1.bets,
    pass1WinRate: segment.pass1.winRate,
    pass1ROI: segment.pass1.roi,
    valBets: segmentBets.length,
    valWinRate,
    valROI,
    valProfit,
    status
  });
  
  console.log(`${status} ${segment.name}`);
  console.log(`   Pass 1: ${segment.pass1.bets} bets, ${segment.pass1.winRate.toFixed(1)}% win, ${segment.pass1.roi > 0 ? '+' : ''}${segment.pass1.roi.toFixed(1)}% ROI`);
  console.log(`   Validation: ${segmentBets.length} bets, ${valWinRate.toFixed(1)}% win, ${valROI > 0 ? '+' : ''}${valROI.toFixed(1)}% ROI, ${valProfit > 0 ? '+' : ''}${valProfit.toFixed(2)} units`);
  console.log('');
}

// Summary statistics
const confirmed = validationResults.filter(r => r.status === '✅ CONFIRMED').length;
const weaker = validationResults.filter(r => r.status === '⚠️  WEAKER').length;
const failed = validationResults.filter(r => r.status === '❌ FAILED').length;
const noData = validationResults.filter(r => r.status === '⚠️  NO DATA').length;

const profitableValidation = validationResults.filter(r => r.valROI > 0);
const totalValidationBets = profitableValidation.reduce((sum, r) => sum + r.valBets, 0);
const totalValidationProfit = profitableValidation.reduce((sum, r) => sum + r.valProfit, 0);
const avgValidationROI = totalValidationBets > 0 
  ? (totalValidationProfit / totalValidationBets) * 100 
  : 0;

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📈 VALIDATION SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════\n');
console.log(`Segments tested: 13`);
console.log(`✅ Confirmed (>50% of Pass 1 ROI): ${confirmed}`);
console.log(`⚠️  Weaker (positive but <50% of Pass 1): ${weaker}`);
console.log(`❌ Failed (negative ROI): ${failed}`);
console.log(`⚠️  No data: ${noData}\n`);

console.log('Profitable segments in validation:');
console.log(`   Count: ${profitableValidation.length}`);
console.log(`   Total bets: ${totalValidationBets}`);
console.log(`   Total profit: ${totalValidationProfit > 0 ? '+' : ''}${totalValidationProfit.toFixed(2)} units`);
console.log(`   Average ROI: ${avgValidationROI > 0 ? '+' : ''}${avgValidationROI.toFixed(2)}%\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 FINAL VERDICT');
console.log('═══════════════════════════════════════════════════════════════════\n');

if (confirmed >= 8 && avgValidationROI > 10) {
  console.log('✅ STRONG VALIDATION');
  console.log('   Most segments confirmed with strong ROI.');
  console.log('   Recommendation: PROCEED with filtered betting strategy.\n');
} else if (confirmed >= 5 && avgValidationROI > 5) {
  console.log('⚠️  MODERATE VALIDATION');
  console.log('   Some segments confirmed but weaker performance.');
  console.log('   Recommendation: Deploy cautiously or improve model first.\n');
} else {
  console.log('❌ WEAK VALIDATION');
  console.log('   Most segments failed or severely weakened.');
  console.log('   Recommendation: DO NOT DEPLOY - Improve model first.\n');
}

// Save detailed results
const output = {
  validationDate: new Date().toISOString(),
  dataRange: {
    start: oddsData.data[0].date,
    end: oddsData.data[oddsData.data.length - 1].date
  },
  overall: {
    bets: bets.length,
    winRate,
    roi,
    profit: totalProfit
  },
  segments: validationResults,
  summary: {
    confirmed,
    weaker,
    failed,
    noData,
    profitableCount: profitableValidation.length,
    totalValidationBets,
    totalValidationProfit,
    avgValidationROI
  }
};

fs.writeFileSync(
  path.join(ROOT, 'data/nhl/validation_results.json'),
  JSON.stringify(output, null, 2)
);

console.log('💾 Detailed results saved to: data/nhl/validation_results.json\n');
