#!/usr/bin/env node

/**
 * DEEP DIAGNOSTIC - Find the fundamental model problem
 * 
 * Questions to answer:
 * 1. What type of predictions are WRONG?
 * 2. What's different about wins vs losses?
 * 3. Are there systematic patterns in errors?
 * 4. What features correlate with success/failure?
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Load data
const oddsPath = path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json');
const predsPath = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_improved_results.json');

const oddsData = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
const predsData = JSON.parse(fs.readFileSync(predsPath, 'utf8'));

const gamesWithOdds = oddsData.data.filter(g => g.oddsAvailable && g.odds.length > 0);

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       🔍 DEEP DIAGNOSTIC - Find the Root Cause                    ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Match predictions to odds
const matched = [];

for (const game of gamesWithOdds) {
  const pred = predsData.predictions?.find(p => 
    p.playerId === game.playerId && 
    p.gameDate === game.gameDate
  );
  
  if (!pred) continue;

  const bestOdds = game.odds.reduce((best, curr) => 
    curr.overPrice > best.overPrice ? curr : best
  );

  const line = bestOdds.line;
  const predicted = pred.projection;
  const actual = game.actualShots;
  
  // Determine bet
  if (predicted === line) continue;
  
  const betSide = predicted > line ? 'over' : 'under';
  const won = (betSide === 'over' && actual > line) || (betSide === 'under' && actual < line);
  const edge = Math.abs(predicted - line);
  const error = Math.abs(predicted - actual);
  const predBias = predicted - actual; // Positive = overpredicted
  
  matched.push({
    playerName: game.playerName,
    position: pred.position,
    gameDate: game.gameDate,
    team: game.team,
    opponent: game.opponent,
    isHome: game.isHome,
    predicted,
    actual,
    line,
    betSide,
    won,
    edge,
    error,
    predBias,
    overOdds: bestOdds.overPrice,
    underOdds: bestOdds.underPrice
  });
}

console.log(`📊 Analyzing ${matched.length} matched predictions\n`);

// ============================================================================
// ANALYSIS 1: Prediction Accuracy by Actual Shot Count
// ============================================================================

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 1: Accuracy by Actual Shot Count');
console.log('═══════════════════════════════════════════════════════════════════\n');

const byActual = {};
matched.forEach(m => {
  const bucket = Math.floor(m.actual);
  if (!byActual[bucket]) byActual[bucket] = [];
  byActual[bucket].push(m);
});

console.log('Shots | Count | Avg Pred | Avg Error | Win Rate | Pred Bias');
console.log('------|-------|----------|-----------|----------|----------');

Object.keys(byActual).sort((a, b) => a - b).forEach(shots => {
  const games = byActual[shots];
  const avgPred = games.reduce((sum, g) => sum + g.predicted, 0) / games.length;
  const avgError = games.reduce((sum, g) => sum + g.error, 0) / games.length;
  const winRate = (games.filter(g => g.won).length / games.length * 100).toFixed(1);
  const avgBias = games.reduce((sum, g) => sum + g.predBias, 0) / games.length;
  
  console.log(`${shots.toString().padStart(5)} | ${games.length.toString().padStart(5)} | ${avgPred.toFixed(2).padStart(8)} | ${avgError.toFixed(2).padStart(9)} | ${winRate.padStart(8)}% | ${avgBias > 0 ? '+' : ''}${avgBias.toFixed(2).padStart(8)}`);
});

// ============================================================================
// ANALYSIS 2: Win Rate by Prediction Range
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 2: Performance by Predicted Value');
console.log('═══════════════════════════════════════════════════════════════════\n');

const byPred = {
  '<2.0': matched.filter(m => m.predicted < 2.0),
  '2.0-2.9': matched.filter(m => m.predicted >= 2.0 && m.predicted < 3.0),
  '3.0-3.9': matched.filter(m => m.predicted >= 3.0 && m.predicted < 4.0),
  '4.0-4.9': matched.filter(m => m.predicted >= 4.0 && m.predicted < 5.0),
  '5.0+': matched.filter(m => m.predicted >= 5.0)
};

console.log('Pred Range | Bets | Wins | Win Rate |  ROI  | Avg Actual | Avg Line | Bias');
console.log('-----------|------|------|----------|-------|------------|----------|------');

Object.entries(byPred).forEach(([range, games]) => {
  if (games.length === 0) return;
  const wins = games.filter(g => g.won).length;
  const winRate = (wins / games.length * 100).toFixed(1);
  const profit = games.reduce((sum, g) => {
    const odds = g.betSide === 'over' ? g.overOdds : g.underOdds;
    return sum + (g.won ? (odds - 1) : -1);
  }, 0);
  const roi = (profit / games.length * 100).toFixed(1);
  const avgActual = (games.reduce((sum, g) => sum + g.actual, 0) / games.length).toFixed(2);
  const avgLine = (games.reduce((sum, g) => sum + g.line, 0) / games.length).toFixed(2);
  const avgBias = (games.reduce((sum, g) => sum + g.predBias, 0) / games.length).toFixed(2);
  
  console.log(`${range.padEnd(11)}| ${games.length.toString().padStart(4)} | ${wins.toString().padStart(4)} | ${winRate.padStart(8)}% | ${roi.padStart(5)}% | ${avgActual.padStart(10)} | ${avgLine.padStart(8)} | ${avgBias > 0 ? '+' : ''}${avgBias.padStart(4)}`);
});

// ============================================================================
// ANALYSIS 3: Over vs Under Performance by Line
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 3: Over vs Under by Line Value');
console.log('═══════════════════════════════════════════════════════════════════\n');

const byLine = {
  '1.5': matched.filter(m => m.line === 1.5),
  '2.5': matched.filter(m => m.line === 2.5),
  '3.5': matched.filter(m => m.line === 3.5),
  '4.5': matched.filter(m => m.line === 4.5),
  '5.5+': matched.filter(m => m.line >= 5.5)
};

console.log('Line | Over Bets | Over Win% | Over ROI | Under Bets | Under Win% | Under ROI');
console.log('-----|-----------|-----------|----------|------------|------------|----------');

Object.entries(byLine).forEach(([line, games]) => {
  if (games.length === 0) return;
  
  const overBets = games.filter(g => g.betSide === 'over');
  const underBets = games.filter(g => g.betSide === 'under');
  
  const overWins = overBets.filter(g => g.won).length;
  const underWins = underBets.filter(g => g.won).length;
  
  const overWinRate = overBets.length > 0 ? (overWins / overBets.length * 100).toFixed(1) : 'N/A';
  const underWinRate = underBets.length > 0 ? (underWins / underBets.length * 100).toFixed(1) : 'N/A';
  
  const overProfit = overBets.reduce((sum, g) => sum + (g.won ? (g.overOdds - 1) : -1), 0);
  const underProfit = underBets.reduce((sum, g) => sum + (g.won ? (g.underOdds - 1) : -1), 0);
  
  const overROI = overBets.length > 0 ? (overProfit / overBets.length * 100).toFixed(1) : 'N/A';
  const underROI = underBets.length > 0 ? (underProfit / underBets.length * 100).toFixed(1) : 'N/A';
  
  console.log(`${line.padEnd(5)}| ${overBets.length.toString().padStart(9)} | ${overWinRate.toString().padStart(9)}% | ${overROI.toString().padStart(8)}% | ${underBets.length.toString().padStart(10)} | ${underWinRate.toString().padStart(10)}% | ${underROI.toString().padStart(9)}%`);
});

// ============================================================================
// ANALYSIS 4: Position Breakdown
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 4: Performance by Position');
console.log('═══════════════════════════════════════════════════════════════════\n');

const byPosition = {};
matched.forEach(m => {
  if (!byPosition[m.position]) byPosition[m.position] = [];
  byPosition[m.position].push(m);
});

console.log('Pos | Bets | Win% |  ROI  | Avg Pred | Avg Actual | Pred Bias');
console.log('----|------|------|-------|----------|------------|----------');

Object.entries(byPosition).forEach(([pos, games]) => {
  const wins = games.filter(g => g.won).length;
  const winRate = (wins / games.length * 100).toFixed(1);
  const profit = games.reduce((sum, g) => {
    const odds = g.betSide === 'over' ? g.overOdds : g.underOdds;
    return sum + (g.won ? (odds - 1) : -1);
  }, 0);
  const roi = (profit / games.length * 100).toFixed(1);
  const avgPred = (games.reduce((sum, g) => sum + g.predicted, 0) / games.length).toFixed(2);
  const avgActual = (games.reduce((sum, g) => sum + g.actual, 0) / games.length).toFixed(2);
  const avgBias = (games.reduce((sum, g) => sum + g.predBias, 0) / games.length).toFixed(2);
  
  console.log(`${pos.padEnd(4)}| ${games.length.toString().padStart(4)} | ${winRate.padStart(4)}% | ${roi.padStart(5)}% | ${avgPred.padStart(8)} | ${avgActual.padStart(10)} | ${avgBias > 0 ? '+' : ''}${avgBias.padStart(8)}`);
});

// ============================================================================
// ANALYSIS 5: Edge Size vs Success
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 5: Why Does Higher Edge = Worse Performance?');
console.log('═══════════════════════════════════════════════════════════════════\n');

const byEdge = {
  '<0.3': matched.filter(m => m.edge < 0.3),
  '0.3-0.6': matched.filter(m => m.edge >= 0.3 && m.edge < 0.6),
  '0.6-1.0': matched.filter(m => m.edge >= 0.6 && m.edge < 1.0),
  '1.0-1.5': matched.filter(m => m.edge >= 1.0 && m.edge < 1.5),
  '1.5+': matched.filter(m => m.edge >= 1.5)
};

console.log('Edge Range | Bets | Win% |  ROI  | Over% | Avg Pred | Avg Actual | Avg Error');
console.log('-----------|------|------|-------|-------|----------|------------|----------');

Object.entries(byEdge).forEach(([range, games]) => {
  if (games.length === 0) return;
  const wins = games.filter(g => g.won).length;
  const winRate = (wins / games.length * 100).toFixed(1);
  const profit = games.reduce((sum, g) => {
    const odds = g.betSide === 'over' ? g.overOdds : g.underOdds;
    return sum + (g.won ? (odds - 1) : -1);
  }, 0);
  const roi = (profit / games.length * 100).toFixed(1);
  const overPct = (games.filter(g => g.betSide === 'over').length / games.length * 100).toFixed(0);
  const avgPred = (games.reduce((sum, g) => sum + g.predicted, 0) / games.length).toFixed(2);
  const avgActual = (games.reduce((sum, g) => sum + g.actual, 0) / games.length).toFixed(2);
  const avgError = (games.reduce((sum, g) => sum + g.error, 0) / games.length).toFixed(2);
  
  console.log(`${range.padEnd(11)}| ${games.length.toString().padStart(4)} | ${winRate.padStart(4)}% | ${roi.padStart(5)}% | ${overPct.padStart(5)}% | ${avgPred.padStart(8)} | ${avgActual.padStart(10)} | ${avgError.padStart(9)}`);
});

// ============================================================================
// ANALYSIS 6: Extreme Cases
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('📊 ANALYSIS 6: Most Confident Wrong Predictions (High Edge Losses)');
console.log('═══════════════════════════════════════════════════════════════════\n');

const bigLosses = matched.filter(m => !m.won && m.edge >= 1.0).sort((a, b) => b.edge - a.edge).slice(0, 10);

console.log('Player               | Pos | Pred | Line |  Bet  | Actual | Edge | Why Wrong?');
console.log('---------------------|-----|------|------|-------|--------|------|------------');

bigLosses.forEach(m => {
  let reason = '';
  if (m.betSide === 'over' && m.actual < m.line) {
    reason = `Pred ${m.predicted.toFixed(1)} vs Act ${m.actual}`;
  } else if (m.betSide === 'under' && m.actual > m.line) {
    reason = `Pred ${m.predicted.toFixed(1)} vs Act ${m.actual}`;
  }
  
  console.log(`${m.playerName.padEnd(20)} | ${m.position.padEnd(3)} | ${m.predicted.toFixed(1).padStart(4)} | ${m.line.toString().padStart(4)} | ${m.betSide.toUpperCase().padStart(5)} | ${m.actual.toString().padStart(6)} | ${m.edge.toFixed(2).padStart(4)} | ${reason}`);
});

// ============================================================================
// KEY INSIGHTS SUMMARY
// ============================================================================

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('💡 KEY INSIGHTS');
console.log('═══════════════════════════════════════════════════════════════════\n');

// 1. Overall bias
const avgPredBias = matched.reduce((sum, m) => sum + m.predBias, 0) / matched.length;
console.log(`1. PREDICTION BIAS: ${avgPredBias > 0 ? '+' : ''}${avgPredBias.toFixed(2)} shots`);
console.log(`   Model ${avgPredBias > 0 ? 'OVERPREDICTS' : 'UNDERPREDICTS'} on average\n`);

// 2. Line tracking
const avgPred = matched.reduce((sum, m) => sum + m.predicted, 0) / matched.length;
const avgLine = matched.reduce((sum, m) => sum + m.line, 0) / matched.length;
const avgActual = matched.reduce((sum, m) => sum + m.actual, 0) / matched.length;

console.log(`2. AVERAGES:`);
console.log(`   Model predicts:  ${avgPred.toFixed(2)} shots`);
console.log(`   Market line:     ${avgLine.toFixed(2)}`);
console.log(`   Actual result:   ${avgActual.toFixed(2)} shots`);
console.log(`   Market is ${avgLine > avgActual ? 'HIGHER' : 'LOWER'} than reality by ${Math.abs(avgLine - avgActual).toFixed(2)}`);
console.log(`   Model is ${avgPred > avgActual ? 'HIGHER' : 'LOWER'} than reality by ${Math.abs(avgPred - avgActual).toFixed(2)}\n`);

// 3. Edge paradox
const lowEdgeGames = matched.filter(m => m.edge < 0.5);
const highEdgeGames = matched.filter(m => m.edge >= 1.0);

const lowEdgeWinRate = (lowEdgeGames.filter(m => m.won).length / lowEdgeGames.length * 100).toFixed(1);
const highEdgeWinRate = (highEdgeGames.filter(m => m.won).length / highEdgeGames.length * 100).toFixed(1);

console.log(`3. EDGE PARADOX:`);
console.log(`   Low edge (<0.5): ${lowEdgeWinRate}% win rate ✅`);
console.log(`   High edge (≥1.0): ${highEdgeWinRate}% win rate ❌`);
console.log(`   When model is CONFIDENT, it's WRONG\n`);

// 4. Over/Under asymmetry
const overBets = matched.filter(m => m.betSide === 'over');
const underBets = matched.filter(m => m.betSide === 'under');

const overWinRate = (overBets.filter(m => m.won).length / overBets.length * 100).toFixed(1);
const underWinRate = (underBets.filter(m => m.won).length / underBets.length * 100).toFixed(1);

console.log(`4. OVER/UNDER ASYMMETRY:`);
console.log(`   Over bets: ${overBets.length} bets, ${overWinRate}% win rate`);
console.log(`   Under bets: ${underBets.length} bets, ${underWinRate}% win rate`);
console.log(`   Model makes ${(overBets.length / matched.length * 100).toFixed(0)}% over bets (should be ~50%)\n`);

console.log('═══════════════════════════════════════════════════════════════════\n');
