#!/usr/bin/env node
/**
 * Grade NBA Picks from Nov 6, 2025
 * Compare predictions vs actual results
 */

import { readFile } from 'fs/promises';

// Our picks from Nov 6
const picks = [
  { player: "Collin Gillespie", prop: "assists", line: 4.5, pick: "Over", predicted: 6.1, edge: 21.9, units: 3.0 },
  { player: "Collin Gillespie", prop: "rebounds", line: 3.5, pick: "Over", predicted: 3.7, edge: 21.5, units: 3.0 },
  { player: "Ryan Dunn", prop: "assists", line: 1.5, pick: "Over", predicted: 1.6, edge: 18.9, units: 3.0 },
  { player: "Grayson Allen", prop: "rebounds", line: 3.5, pick: "Over", predicted: 3.8, edge: 16.0, units: 3.0 },
  { player: "John Collins", prop: "assists", line: 1.5, pick: "Under", predicted: 0.6, edge: 16.0, units: 3.0 },
  { player: "Ivica Zubac", prop: "assists", line: 2.5, pick: "Under", predicted: 2.2, edge: 15.7, units: 3.0 },
  { player: "John Collins", prop: "rebounds", line: 6.5, pick: "Under", predicted: 4.5, edge: 15.5, units: 3.0 },
  { player: "Mark Williams", prop: "rebounds", line: 9.5, pick: "Over", predicted: 10.6, edge: 15.0, units: 3.0 },
  { player: "Mark Williams", prop: "assists", line: 1.5, pick: "Under", predicted: 1.3, edge: 12.8, units: 3.0 },
  { player: "Devin Booker", prop: "rebounds", line: 3.5, pick: "Over", predicted: 4.1, edge: 9.4, units: 3.0 },
  { player: "Ivica Zubac", prop: "rebounds", line: 11.5, pick: "Under", predicted: 10.7, edge: 8.9, units: 3.0 },
  { player: "Royce O'Neale", prop: "rebounds", line: 4.5, pick: "Over", predicted: 6.4, edge: 8.9, units: 3.0 },
  { player: "Royce O'Neale", prop: "assists", line: 2.5, pick: "Over", predicted: 4.0, edge: 8.5, units: 3.0 },
  { player: "Ryan Dunn", prop: "rebounds", line: 4.5, pick: "Over", predicted: 5.3, edge: 8.1, units: 3.0 },
  { player: "Devin Booker", prop: "assists", line: 7.5, pick: "Over", predicted: 7.6, edge: 7.5, units: 3.0 },
  { player: "Grayson Allen", prop: "assists", line: 3.5, pick: "Over", predicted: 4.7, edge: 4.7, units: 3.0 },
  { player: "Bradley Beal", prop: "assists", line: 3.5, pick: "Under", predicted: 1.2, edge: 4.4, units: 3.0 }
];

// Actual results (stats array: [MIN, PTS, OREB, DREB, REB, AST, ...])
const actuals = {
  "Ivica Zubac": { rebounds: 11, assists: 2 },
  "Bradley Beal": { rebounds: 1, assists: 1 },
  "John Collins": { rebounds: 4, assists: 1 },
  "Royce O'Neale": { rebounds: 4, assists: 2 },
  "Mark Williams": { rebounds: 10, assists: 0 },
  "Grayson Allen": { rebounds: 3, assists: 4 },
  "Devin Booker": { rebounds: 6, assists: 7 },
  "Ryan Dunn": { rebounds: 5, assists: 3 },
  "Collin Gillespie": { rebounds: 5, assists: 7 }
};

console.log('🏀 NBA PICKS GRADING - November 6, 2025');
console.log('Clippers @ Suns');
console.log('='.repeat(120));
console.log();

let wins = 0;
let losses = 0;
let unitsWon = 0;
let unitsRisked = 0;

const results = [];

for (const pick of picks) {
  const actual = actuals[pick.player];
  
  if (!actual) {
    console.log(`⚠️  ${pick.player} - NO DATA FOUND`);
    continue;
  }

  const actualValue = pick.prop === 'rebounds' ? actual.rebounds : actual.assists;
  const line = pick.line;
  
  let hit = false;
  if (pick.pick === 'Over') {
    hit = actualValue > line;
  } else {
    hit = actualValue < line;
  }

  const result = hit ? '✅ WIN' : '❌ LOSS';
  const predError = Math.abs(actualValue - pick.predicted);
  const predErrorPct = ((predError / actualValue) * 100).toFixed(1);
  
  // Calculate units won/lost (assuming -110 odds as baseline)
  const unitsResult = hit ? pick.units * 0.91 : -pick.units; // -110 = 0.91 return
  
  if (hit) {
    wins++;
    unitsWon += unitsResult;
  } else {
    losses++;
  }
  unitsRisked += pick.units;

  results.push({
    player: pick.player,
    prop: pick.prop,
    pick: pick.pick,
    line,
    predicted: pick.predicted,
    actual: actualValue,
    result: hit ? 'WIN' : 'LOSS',
    predError,
    predErrorPct,
    edge: pick.edge,
    units: pick.units,
    unitsResult
  });

  console.log(`${result}  ${pick.player.padEnd(20)} ${pick.prop.padEnd(8)} ${pick.pick.padEnd(5)} ${line.toString().padStart(4)}`);
  console.log(`       Predicted: ${pick.predicted.toFixed(1).padStart(4)} | Actual: ${actualValue.toString().padStart(2)} | Error: ${predError.toFixed(1)} (${predErrorPct}%) | Edge: ${pick.edge}% | ${unitsResult > 0 ? '+' : ''}${unitsResult.toFixed(2)}U`);
  console.log();
}

console.log('='.repeat(120));
console.log('\n📊 SUMMARY STATISTICS\n');

const winRate = ((wins / (wins + losses)) * 100).toFixed(1);
const roi = ((unitsWon / unitsRisked) * 100).toFixed(1);
const avgEdge = (picks.reduce((sum, p) => sum + p.edge, 0) / picks.length).toFixed(1);

console.log(`Win Rate:     ${wins}W - ${losses}L (${winRate}%)`);
console.log(`Units:        ${unitsWon > 0 ? '+' : ''}${unitsWon.toFixed(2)}U on ${unitsRisked.toFixed(1)}U risked`);
console.log(`ROI:          ${roi}%`);
console.log(`Avg Edge:     ${avgEdge}%`);
console.log();

// Prediction accuracy analysis
const avgPredError = results.reduce((sum, r) => sum + r.predError, 0) / results.length;
const avgPredErrorPct = results.reduce((sum, r) => sum + parseFloat(r.predErrorPct), 0) / results.length;

console.log('🎯 PREDICTION ACCURACY\n');
console.log(`Average Error:     ${avgPredError.toFixed(2)} (${avgPredErrorPct.toFixed(1)}%)`);
console.log(`Median Error:      ${results.map(r => r.predError).sort((a,b) => a-b)[Math.floor(results.length/2)].toFixed(2)}`);
console.log();

// Break down by pick type
const overPicks = results.filter(r => r.pick === 'Over');
const underPicks = results.filter(r => r.pick === 'Under');

const overWins = overPicks.filter(r => r.result === 'WIN').length;
const underWins = underPicks.filter(r => r.result === 'WIN').length;

console.log('📈 BREAKDOWN BY PICK TYPE\n');
console.log(`Overs:  ${overWins}W - ${overPicks.length - overWins}L (${((overWins/overPicks.length)*100).toFixed(1)}%) - ${overPicks.length} picks`);
console.log(`Unders: ${underWins}W - ${underPicks.length - underWins}L (${((underWins/underPicks.length)*100).toFixed(1)}%) - ${underPicks.length} picks`);
console.log();

// Break down by prop type
const reboundPicks = results.filter(r => r.prop === 'rebounds');
const assistPicks = results.filter(r => r.prop === 'assists');

const reboundWins = reboundPicks.filter(r => r.result === 'WIN').length;
const assistWins = assistPicks.filter(r => r.result === 'WIN').length;

console.log('🏀 BREAKDOWN BY PROP TYPE\n');
console.log(`Rebounds: ${reboundWins}W - ${reboundPicks.length - reboundWins}L (${((reboundWins/reboundPicks.length)*100).toFixed(1)}%)`);
console.log(`Assists:  ${assistWins}W - ${assistPicks.length - assistWins}L (${((assistWins/assistPicks.length)*100).toFixed(1)}%)`);
console.log();

// Best and worst picks
console.log('⭐ BEST PICKS (by edge)\n');
results.sort((a, b) => b.edge - a.edge).slice(0, 3).forEach((r, i) => {
  console.log(`${i+1}. ${r.result === 'WIN' ? '✅' : '❌'} ${r.player} ${r.prop} ${r.pick} ${r.line} - ${r.edge}% edge - Pred: ${r.predicted.toFixed(1)}, Actual: ${r.actual}`);
});

console.log();
console.log('💰 MOST PROFITABLE PICKS\n');
results.sort((a, b) => b.unitsResult - a.unitsResult).slice(0, 3).forEach((r, i) => {
  console.log(`${i+1}. ${r.result === 'WIN' ? '✅' : '❌'} ${r.player} ${r.prop} ${r.pick} ${r.line} - ${r.unitsResult > 0 ? '+' : ''}${r.unitsResult.toFixed(2)}U`);
});

console.log();
console.log('💸 BIGGEST LOSSES\n');
results.sort((a, b) => a.unitsResult - b.unitsResult).slice(0, 3).forEach((r, i) => {
  console.log(`${i+1}. ${r.result === 'WIN' ? '✅' : '❌'} ${r.player} ${r.prop} ${r.pick} ${r.line} - ${r.unitsResult > 0 ? '+' : ''}${r.unitsResult.toFixed(2)}U (Pred: ${r.predicted.toFixed(1)}, Actual: ${r.actual})`);
});

console.log();
console.log('='.repeat(120));

// Model calibration check
console.log('\n🔬 MODEL CALIBRATION\n');
const overPerformers = results.filter(r => r.actual > r.predicted);
const underPerformers = results.filter(r => r.actual < r.predicted);
console.log(`Over-predicted:  ${underPerformers.length} picks (${((underPerformers.length/results.length)*100).toFixed(1)}%)`);
console.log(`Under-predicted: ${overPerformers.length} picks (${((overPerformers.length/results.length)*100).toFixed(1)}%)`);
console.log(`Perfect:         ${results.filter(r => r.actual === r.predicted).length} picks`);

const avgActual = results.reduce((sum, r) => sum + r.actual, 0) / results.length;
const avgPredicted = results.reduce((sum, r) => sum + r.predicted, 0) / results.length;
console.log(`\nAvg Predicted: ${avgPredicted.toFixed(2)} | Avg Actual: ${avgActual.toFixed(2)} | Bias: ${(avgPredicted - avgActual).toFixed(2)}`);
