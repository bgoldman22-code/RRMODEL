#!/usr/bin/env node

/**
 * SIMPLE BET ANALYSIS - Just bet the model prediction vs the line
 * 
 * Strategy:
 * - If model predicts > line → Bet OVER
 * - If model predicts < line → Bet UNDER
 * - No edge thresholds, no complex probability calcs
 * - Just: did we pick the right side?
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

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       📊 SIMPLE BET ANALYSIS (Model vs Line)                      ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

const oddsData = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
const predsData = JSON.parse(fs.readFileSync(predsPath, 'utf8'));

const gamesWithOdds = oddsData.data.filter(g => g.oddsAvailable && g.odds.length > 0);
console.log(`📂 Loaded ${gamesWithOdds.length} games with odds\n`);

// Prepare bets
const bets = [];

for (const game of gamesWithOdds) {
  const pred = predsData.predictions?.find(p => 
    p.playerId === game.playerId && 
    p.gameDate === game.gameDate
  );
  
  if (!pred) continue;

  // Get best odds (highest overPrice = best payout for over bet)
  const bestOdds = game.odds.reduce((best, curr) => 
    curr.overPrice > best.overPrice ? curr : best
  );

  const line = bestOdds.line;
  const predicted = pred.projection;
  const actual = game.actualShots;

  // Determine bet side
  let betSide, betOdds, won;
  
  if (predicted > line) {
    // Bet OVER
    betSide = 'over';
    betOdds = bestOdds.overPrice;
    won = actual > line;
  } else if (predicted < line) {
    // Bet UNDER
    betSide = 'under';
    betOdds = bestOdds.underPrice;
    won = actual < line;
  } else {
    // Skip if exactly on the line
    continue;
  }

  const profit = won ? (betOdds - 1) : -1;

  bets.push({
    playerName: game.playerName,
    gameDate: game.gameDate,
    predicted,
    actual,
    line,
    betSide,
    betOdds,
    won,
    profit,
    edge: Math.abs(predicted - line)
  });
}

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 OVERALL RESULTS (Flat 1 unit per bet)');
console.log('═══════════════════════════════════════════════════════════════════\n');

const totalBets = bets.length;
const wins = bets.filter(b => b.won).length;
const losses = totalBets - wins;
const winRate = (wins / totalBets * 100).toFixed(1);

const totalStaked = totalBets;
const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
const roi = (totalProfit / totalStaked * 100).toFixed(2);

console.log(`Total Bets:       ${totalBets}`);
console.log(`Wins:             ${wins} (${winRate}%)`);
console.log(`Losses:           ${losses}`);
console.log(`Win Rate:         ${winRate}%`);
console.log(`Total Staked:     ${totalStaked.toFixed(2)} units`);
console.log(`Total Profit:     ${totalProfit > 0 ? '+' : ''}${totalProfit.toFixed(2)} units`);
console.log(`ROI:              ${roi > 0 ? '+' : ''}${roi}%\n`);

// Breakeven calc
const avgOdds = bets.reduce((sum, b) => sum + b.betOdds, 0) / bets.length;
const breakevenWinRate = (1 / avgOdds * 100).toFixed(1);
console.log(`Average Odds:     ${avgOdds.toFixed(2)}`);
console.log(`Breakeven Rate:   ${breakevenWinRate}%`);
console.log(`Actual vs Break:  ${(parseFloat(winRate) - parseFloat(breakevenWinRate)).toFixed(1)}% ${parseFloat(winRate) > parseFloat(breakevenWinRate) ? '✅' : '❌'}\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 BY BET TYPE');
console.log('═══════════════════════════════════════════════════════════════════\n');

const overBets = bets.filter(b => b.betSide === 'over');
const underBets = bets.filter(b => b.betSide === 'under');

function analyzeSubset(subset, label) {
  const total = subset.length;
  const w = subset.filter(b => b.won).length;
  const l = total - w;
  const wr = (w / total * 100).toFixed(1);
  const profit = subset.reduce((sum, b) => sum + b.profit, 0);
  const r = (profit / total * 100).toFixed(2);
  
  console.log(`${label}:`);
  console.log(`  Bets:       ${total}`);
  console.log(`  Wins:       ${w} (${wr}%)`);
  console.log(`  Losses:     ${l}`);
  console.log(`  Profit:     ${profit > 0 ? '+' : ''}${profit.toFixed(2)} units`);
  console.log(`  ROI:        ${r > 0 ? '+' : ''}${r}%\n`);
}

analyzeSubset(overBets, 'OVER Bets (pred > line)');
analyzeSubset(underBets, 'UNDER Bets (pred < line)');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 BY CONFIDENCE (edge size)');
console.log('═══════════════════════════════════════════════════════════════════\n');

const lowEdge = bets.filter(b => b.edge < 0.5);
const medEdge = bets.filter(b => b.edge >= 0.5 && b.edge < 1.0);
const highEdge = bets.filter(b => b.edge >= 1.0);

analyzeSubset(lowEdge, 'Low Edge (|pred - line| < 0.5)');
analyzeSubset(medEdge, 'Medium Edge (0.5 ≤ edge < 1.0)');
analyzeSubset(highEdge, 'High Edge (edge ≥ 1.0)');

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 SAMPLE BETS');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('First 10 Bets:');
console.log('Player               | Date       | Pred | Line |  Bet  | Actual | Result | Profit');
console.log('---------------------|------------|------|------|-------|--------|--------|--------');

bets.slice(0, 10).forEach(b => {
  const resultEmoji = b.won ? '✅' : '❌';
  console.log(
    `${b.playerName.padEnd(20)} | ${b.gameDate} | ${b.predicted.toFixed(1).padStart(4)} | ${b.line.toString().padStart(4)} | ` +
    `${b.betSide.toUpperCase().padStart(5)} | ${b.actual.toString().padStart(6)} | ${resultEmoji.padStart(6)} | ${b.profit > 0 ? '+' : ''}${b.profit.toFixed(2).padStart(6)}`
  );
});

console.log('\nWorst 5 Losses:');
const worstLosses = bets.filter(b => !b.won).sort((a, b) => Math.abs(a.actual - a.line) - Math.abs(b.actual - b.line)).slice(0, 5);
console.log('Player               | Date       | Pred | Line |  Bet  | Actual | Miss By');
console.log('---------------------|------------|------|------|-------|--------|--------');
worstLosses.forEach(b => {
  const missBy = Math.abs(b.actual - b.line);
  console.log(
    `${b.playerName.padEnd(20)} | ${b.gameDate} | ${b.predicted.toFixed(1).padStart(4)} | ${b.line.toString().padStart(4)} | ` +
    `${b.betSide.toUpperCase().padStart(5)} | ${b.actual.toString().padStart(6)} | ${missBy.toFixed(1).padStart(7)}`
  );
});

console.log('\nBest 5 Wins:');
const bestWins = bets.filter(b => b.won).sort((a, b) => Math.abs(b.actual - b.line) - Math.abs(a.actual - a.line)).slice(0, 5);
console.log('Player               | Date       | Pred | Line |  Bet  | Actual | Win By | Profit');
console.log('---------------------|------------|------|------|-------|--------|--------|--------');
bestWins.forEach(b => {
  const winBy = Math.abs(b.actual - b.line);
  console.log(
    `${b.playerName.padEnd(20)} | ${b.gameDate} | ${b.predicted.toFixed(1).padStart(4)} | ${b.line.toString().padStart(4)} | ` +
    `${b.betSide.toUpperCase().padStart(5)} | ${b.actual.toString().padStart(6)} | ${winBy.toFixed(1).padStart(6)} | ${b.profit > 0 ? '+' : ''}${b.profit.toFixed(2).padStart(6)}`
  );
});

console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('🎯 DECISION GATE');
console.log('═══════════════════════════════════════════════════════════════════\n');

if (parseFloat(roi) > 5) {
  console.log('✅ STRONG - Proceed with Pass 2');
  console.log(`   ROI of ${roi}% is excellent.\n`);
} else if (parseFloat(roi) > 2) {
  console.log('✅ PROMISING - Proceed with Pass 2');
  console.log(`   ROI of ${roi}% is profitable.\n`);
} else if (parseFloat(roi) > 0) {
  console.log('⚠️  MARGINAL - Consider Pass 2 cautiously');
  console.log(`   ROI of ${roi}% is barely profitable.\n`);
} else {
  console.log('❌ UNPROFITABLE - Skip Pass 2');
  console.log(`   ROI of ${roi}% means model loses money.\n`);
}

// Save results
const resultsPath = path.join(REPO_ROOT, 'data/nhl/simple_bet_analysis.json');
fs.writeFileSync(resultsPath, JSON.stringify({
  summary: {
    totalBets,
    wins,
    losses,
    winRate: parseFloat(winRate),
    totalStaked,
    totalProfit,
    roi: parseFloat(roi)
  },
  byType: {
    over: {
      bets: overBets.length,
      wins: overBets.filter(b => b.won).length,
      profit: overBets.reduce((sum, b) => sum + b.profit, 0)
    },
    under: {
      bets: underBets.length,
      wins: underBets.filter(b => b.won).length,
      profit: underBets.reduce((sum, b) => sum + b.profit, 0)
    }
  },
  bets: bets.map(b => ({
    player: b.playerName,
    date: b.gameDate,
    predicted: b.predicted,
    line: b.line,
    actual: b.actual,
    betSide: b.betSide,
    won: b.won,
    profit: b.profit
  }))
}, null, 2));

console.log(`💾 Detailed results saved to: ${resultsPath}\n`);
