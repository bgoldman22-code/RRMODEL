#!/usr/bin/env node

/**
 * Baseline v3: PURE L5 (Zero Adjustments)
 * 
 * The ONLY unbiased test. If this is profitable, we ship it.
 * If not, THEN we know context matters and use regularized regression.
 * 
 * Philosophy: L5_ppg is the empirical recent average. No human bias.
 * 
 * Usage:
 *  node scripts/nba/train-baseline-v3-pure-l5.js --input data/nba/training-data-leak-free.json --output data/nba/models-pure-l5/
 */

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const inputPath = argv[argv.indexOf('--input') + 1];
const outputDir = argv[argv.indexOf('--output') + 1];

if (!inputPath || !outputDir) {
  console.error('Usage: node train-baseline-v3-pure-l5.js --input <training-data.json> --output <models-dir>');
  process.exit(1);
}

// Load training data
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
console.log(`Loaded ${data.length} samples`);

// Filter: need at least 5 games played
const filtered = data.filter(s => s.features && s.features.games_played_season >= 5);
console.log(`Filtered to ${filtered.length} samples (games_played >= 5)`);

// Windows (same as baseline-v2 for comparison)
const windows = [
  { train: ['2024-10-01', '2025-01-31'], test: ['2025-02-01', '2025-02-28'], name: 'Feb 2025' },
  { train: ['2024-10-01', '2025-02-28'], test: ['2025-03-01', '2025-03-31'], name: 'Mar 2025' },
  { train: ['2024-10-01', '2025-03-31'], test: ['2025-04-01', '2025-04-30'], name: 'Apr 2025' }
];

function predictPureL5(features, stat) {
  // ZERO adjustments. Pure L5 average.
  const l5Key = `L5_${stat === 'points' ? 'ppg' : stat === 'rebounds' ? 'rpg' : 'apg'}`;
  const l10Key = `L10_${stat === 'points' ? 'ppg' : stat === 'rebounds' ? 'rpg' : 'apg'}`;
  const seasonKey = `season_${stat === 'points' ? 'ppg' : stat === 'rebounds' ? 'rpg' : 'apg'}`;
  
  // Fallback chain: L5 → L10 → season → default
  const base = features[l5Key] ?? features[l10Key] ?? features[seasonKey] ?? 10;
  
  // Return base with min/max clamps only (physical limits, not bias)
  const maxValues = { points: 60, rebounds: 25, assists: 20 };
  return Math.max(0, Math.min(maxValues[stat], base));
}

function evaluateWindow(trainData, testData, stat) {
  if (testData.length === 0) {
    return { mae: null, rmse: null, r2: null, samples: 0 };
  }

  let sumError = 0, sumSqError = 0, sumActual = 0, sumSqActual = 0;
  const actualKey = `actual_${stat}`;

  for (const sample of testData) {
    const actual = sample[actualKey];
    if (actual === null || actual === undefined) continue;
    
    const pred = predictPureL5(sample.features, stat);
    const error = pred - actual;
    
    sumError += Math.abs(error);
    sumSqError += error * error;
    sumActual += actual;
    sumSqActual += actual * actual;
  }

  const n = testData.length;
  const mae = sumError / n;
  const rmse = Math.sqrt(sumSqError / n);
  const meanActual = sumActual / n;
  const variance = (sumSqActual / n) - (meanActual * meanActual);
  const r2 = variance > 0 ? 1 - (sumSqError / n / variance) : 0;

  return { mae, rmse, r2, samples: n };
}

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const stats = ['points', 'rebounds', 'assists'];
const models = {};

console.log('\n=== Training Pure L5 Baseline (ZERO Adjustments) ===\n');

for (const stat of stats) {
  console.log(`\n--- ${stat.toUpperCase()} ---`);
  
  const windowResults = [];
  
  for (const window of windows) {
    const trainSamples = filtered.filter(s => s.gameDate >= window.train[0] && s.gameDate <= window.train[1]);
    const testSamples = filtered.filter(s => s.gameDate >= window.test[0] && s.gameDate <= window.test[1]);
    
    console.log(`\nWindow: ${window.name}`);
    console.log(`  Train: ${trainSamples.length} samples`);
    console.log(`  Test: ${testSamples.length} samples`);
    
    const metrics = evaluateWindow(trainSamples, testSamples, stat);
    windowResults.push({ window: window.name, ...metrics });
    
    if (metrics.samples > 0) {
      console.log(`  MAE: ${metrics.mae.toFixed(2)}`);
      console.log(`  RMSE: ${metrics.rmse.toFixed(2)}`);
      console.log(`  R²: ${metrics.r2.toFixed(3)}`);
    } else {
      console.log('  (No test samples)');
    }
  }
  
  // Average metrics across windows with data
  const validWindows = windowResults.filter(w => w.samples > 0);
  if (validWindows.length > 0) {
    const avgMAE = validWindows.reduce((s, w) => s + w.mae, 0) / validWindows.length;
    const avgR2 = validWindows.reduce((s, w) => s + w.r2, 0) / validWindows.length;
    console.log(`\n  AVERAGE (across ${validWindows.length} windows):`);
    console.log(`    MAE: ${avgMAE.toFixed(2)}`);
    console.log(`    R²: ${avgR2.toFixed(3)}`);
  }
  
  // Save model metadata
  models[stat] = {
    type: 'pure_l5_baseline',
    version: 'v3',
    description: 'Pure L5 average with zero adjustments. Unbiased empirical baseline.',
    windows: windowResults,
    createdAt: new Date().toISOString()
  };
}

// Save models
for (const stat of stats) {
  const modelPath = path.join(outputDir, `${stat}-model.json`);
  fs.writeFileSync(modelPath, JSON.stringify(models[stat], null, 2));
  console.log(`\nSaved ${stat} model to ${modelPath}`);
}

console.log('\n✅ Pure L5 Baseline Training Complete');
console.log('\nNEXT STEP: Run backtest with these models');
console.log(`  node scripts/nba/backtest-leak-free.js --data ${inputPath} --models ${outputDir} --output data/nba/backtest-results-pure-l5.json`);
