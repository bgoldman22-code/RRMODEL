#!/usr/bin/env node

/**
 * PASS 1 DIAGNOSTIC - What's wrong with the predictions?
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
const paramsPath = path.join(REPO_ROOT, 'data/nhl/learned_parameters.json');

const oddsData = JSON.parse(fs.readFileSync(oddsPath, 'utf8'));
const predsData = JSON.parse(fs.readFileSync(predsPath, 'utf8'));
const params = JSON.parse(fs.readFileSync(paramsPath, 'utf8'));

const gamesWithOdds = oddsData.data.filter(g => g.oddsAvailable && g.odds.length > 0);

console.log(`📊 Analyzing ${gamesWithOdds.length} games with odds\n`);

// Match and analyze
const diagnostics = [];

for (const game of gamesWithOdds.slice(0, 20)) { // First 20 for detailed view
  const pred = predsData.predictions?.find(p => 
    p.playerId === game.playerId && 
    p.gameDate === game.gameDate
  );
  
  if (!pred) continue;

  const bestOdds = game.odds.reduce((best, curr) => 
    curr.overPrice > best.overPrice ? curr : best
  );

  diagnostics.push({
    player: game.playerName,
    date: game.gameDate,
    predicted: pred.projection.toFixed(2),
    actual: game.actualShots,
    line: bestOdds.line,
    overOdds: bestOdds.overPrice.toFixed(2),
    underOdds: bestOdds.underPrice.toFixed(2),
    predVsLine: (pred.projection - bestOdds.line).toFixed(2),
    actualVsLine: game.actualShots - bestOdds.line
  });
}

// Print table
console.log('Player               | Date       | Pred | Actual | Line | Over$ | Under$ | Pred-Line | Actual-Line |');
console.log('---------------------|------------|------|--------|------|-------|--------|-----------|-------------|');

diagnostics.forEach(d => {
  console.log(
    `${d.player.padEnd(20)} | ${d.date} | ${d.predicted.toString().padStart(4)} | ${d.actual.toString().padStart(6)} | ${d.line.toString().padStart(4)} | ` +
    `${d.overOdds.padStart(5)} | ${d.underOdds.padStart(6)} | ${d.predVsLine.padStart(9)} | ${d.actualVsLine.toString().padStart(11)} |`
  );
});

// Summary stats
const avgPred = diagnostics.reduce((sum, d) => sum + parseFloat(d.predicted), 0) / diagnostics.length;
const avgActual = diagnostics.reduce((sum, d) => sum + d.actual, 0) / diagnostics.length;
const avgLine = diagnostics.reduce((sum, d) => sum + d.line, 0) / diagnostics.length;

console.log(`\n📊 Summary (first 20 games):`);
console.log(`Avg Predicted: ${avgPred.toFixed(2)} shots`);
console.log(`Avg Actual:    ${avgActual.toFixed(2)} shots`);
console.log(`Avg Line:      ${avgLine.toFixed(2)}`);
console.log(`\nPred vs Actual: ${(avgPred - avgActual).toFixed(2)} (${avgPred > avgActual ? 'OVERPREDICTING' : 'UNDERPREDICTING'})`);
console.log(`Pred vs Line:   ${(avgPred - avgLine).toFixed(2)} (${avgPred > avgLine ? 'ABOVE line' : 'BELOW line'})`);
