/**
 * Quick test of NFL receiving props simulation
 * Tests if the model generates reasonable probabilities
 */

import {
  simulateReceptionsProbOver,
  simulateYardsProbOver,
  estimateParameters,
  calibrateProb,
  DEFAULT_CALIBRATION
} from './netlify/functions/_lib/elite-pricing-engine.mjs';

// Test with CeeDee Lamb
const player = {
  id: 'ceedee-lamb',
  name: 'CeeDee Lamb',
  team: 'DAL',
  avgTargets: 9.2,
  targetVariance: 12.5,
  avgCatchRate: 0.68,
  catchRateVariance: 0.042,
  avgYardsPerCatch: 13.1,
  aDOT: 11.2,
  avgYAC: 4.8
};

const gameContext = {
  gameDate: '2025-10-20',
  spread: 0,
  weather: 'dome',
  opponent: null
};

console.log('🏈 Testing NFL Receiving Props Model');
console.log('=' .repeat(60));
console.log(`Player: ${player.name}`);
console.log(`Avg Targets: ${player.avgTargets}`);
console.log(`Catch Rate: ${player.avgCatchRate}`);
console.log(`Yards/Catch: ${player.avgYardsPerCatch}`);
console.log('');

// Estimate parameters
const params = estimateParameters(player, gameContext);
console.log('Parameters:', JSON.stringify(params, null, 2));
console.log('');

// Test receptions probabilities
console.log('RECEPTIONS PROBABILITIES:');
const recLines = [3.5, 4.5, 5.5, 6.5, 7.5];
for (const line of recLines) {
  const probRaw = simulateReceptionsProbOver(params, line);
  const probCal = calibrateProb(probRaw, DEFAULT_CALIBRATION);
  const edge = probCal - 0.5238; // vs -110
  
  console.log(`  ${line}: Raw=${(probRaw*100).toFixed(1)}%, Cal=${(probCal*100).toFixed(1)}%, Edge=${(edge*100).toFixed(1)}%`);
}

console.log('');
console.log('YARDS PROBABILITIES:');
const yardLines = [45.5, 55.5, 65.5, 75.5, 85.5];
for (const line of yardLines) {
  const probRaw = simulateYardsProbOver(params, line);
  const probCal = calibrateProb(probRaw, DEFAULT_CALIBRATION);
  const edge = probCal - 0.5238; // vs -110
  
  console.log(`  ${line}: Raw=${(probRaw*100).toFixed(1)}%, Cal=${(probCal*100).toFixed(1)}%, Edge=${(edge*100).toFixed(1)}%`);
}

console.log('');
console.log('THRESHOLD ANALYSIS:');
console.log(`  55% threshold (2.5% edge): ${recLines.filter((line, i) => {
  const prob = calibrateProb(simulateReceptionsProbOver(params, line), DEFAULT_CALIBRATION);
  return prob >= 0.55 || (1-prob) >= 0.55;
}).length} receptions lines qualify`);

console.log(`  55% threshold (2.5% edge): ${yardLines.filter((line, i) => {
  const prob = calibrateProb(simulateYardsProbOver(params, line), DEFAULT_CALIBRATION);
  return prob >= 0.55 || (1-prob) >= 0.55;
}).length} yards lines qualify`);
