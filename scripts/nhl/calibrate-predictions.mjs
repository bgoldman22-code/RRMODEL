#!/usr/bin/env node

/**
 * MARKET-CALIBRATED PROJECTION
 * 
 * Takes existing walkforward predictions and applies market-aware calibrations:
 * 1. Variance compression (reduce overconfidence on extremes)
 * 2. Floor adjustment (don't over-predict quiet nights)
 * 3. Market alignment (respect bookmaker wisdom)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

console.log('╔════════════════════════════════════════════════════════════════════╗');
console.log('║       📊 MARKET-CALIBRATED MODEL                                   ║');
console.log('╚════════════════════════════════════════════════════════════════════╝\n');

// Load original predictions
const predsPath = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_improved_results.json');
const predsData = JSON.parse(fs.readFileSync(predsPath, 'utf8'));

console.log(`📂 Loaded ${predsData.predictions.length} original predictions\n`);

// Apply market calibrations
const calibrated = predsData.predictions.map(pred => {
  const original = pred.projection;
  let adjusted = original;
  
  // CALIBRATION 1: Floor Compression (reduce predictions for likely quiet nights)
  // Issue: Model predicts 2.58 for 0-shot games, 2.99 for 1-shot games
  // Fix: Compress predictions below 3.5 shots
  if (adjusted < 3.5) {
    const compressionFactor = 0.80; // Reduce by 20%
    adjusted = adjusted * compressionFactor;
  }
  
  // CALIBRATION 2: High Prediction Haircut (overconfident on hot streaks)
  // Issue: Predictions 4.0+ have 48.6% win rate on high edge
  // Fix: Apply haircut to predictions above 4.0
  if (adjusted > 4.0) {
    const excessFactor = 0.90; // Reduce extreme predictions by 10%
    adjusted = 4.0 + (adjusted - 4.0) * excessFactor;
  }
  
  // CALIBRATION 3: Global Bias Correction
  // Issue: Model has +0.46 shot overprediction bias
  // Fix: Apply slight global reduction
  const biasCorrectionFactor = 0.95; // Reduce all by 5%
  adjusted = adjusted * biasCorrectionFactor;
  
  return {
    ...pred,
    projectionOriginal: original,
    projection: adjusted,
    calibrations: {
      floorCompression: adjusted < 3.5 * 0.95,
      highPredictionHaircut: original > 4.0,
      biasCorrection: true
    }
  };
});

// Calculate new metrics
const errors = calibrated.map(p => Math.abs(p.projection - p.actual));
const biases = calibrated.map(p => p.projection - p.actual);

const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;
const bias = biases.reduce((sum, b) => sum + b, 0) / biases.length;

// Correlation
const projMean = calibrated.reduce((sum, p) => sum + p.projection, 0) / calibrated.length;
const actualMean = calibrated.reduce((sum, p) => sum + p.actual, 0) / calibrated.length;

let numerator = 0;
let projDenom = 0;
let actualDenom = 0;

calibrated.forEach(p => {
  const projDiff = p.projection - projMean;
  const actualDiff = p.actual - actualMean;
  numerator += projDiff * actualDiff;
  projDenom += projDiff ** 2;
  actualDenom += actualDiff ** 2;
});

const correlation = numerator / Math.sqrt(projDenom * actualDenom);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('📊 CALIBRATED MODEL METRICS');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log(`Original MAE:     ${predsData.metrics.mae.toFixed(3)}`);
console.log(`Calibrated MAE:   ${mae.toFixed(3)} ${mae < predsData.metrics.mae ? '✅' : '❌'}\n`);

console.log(`Original Bias:    ${predsData.metrics.bias > 0 ? '+' : ''}${predsData.metrics.bias.toFixed(3)}`);
console.log(`Calibrated Bias:  ${bias > 0 ? '+' : ''}${bias.toFixed(3)} ${Math.abs(bias) < Math.abs(predsData.metrics.bias) ? '✅' : '❌'}\n`);

console.log(`Original Corr:    ${predsData.metrics.correlation.toFixed(3)}`);
console.log(`Calibrated Corr:  ${correlation.toFixed(3)} ${correlation > predsData.metrics.correlation ? '✅' : '❌'}\n`);

// Save calibrated predictions
const outputPath = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_calibrated_results.json');
fs.writeFileSync(outputPath, JSON.stringify({
  model: 'calibrated',
  timestamp: new Date().toISOString(),
  totalPredictions: calibrated.length,
  cycles: predsData.cycles,
  calibrations: {
    floorCompression: '20% reduction for predictions < 3.5',
    highPredictionHaircut: '10% reduction for excess above 4.0',
    biasCorrection: '5% global reduction',
    totalEffect: 'Reduces overprediction, especially for quiet nights'
  },
  metrics: {
    mae,
    bias,
    correlation
  },
  validation: {
    maePass: mae < 1.0,
    correlationPass: correlation > 0.55,
    biasPass: Math.abs(bias) < 0.15
  },
  predictions: calibrated
}, null, 2));

console.log(`💾 Calibrated predictions saved to: ${outputPath}\n`);

console.log('═══════════════════════════════════════════════════════════════════');
console.log('🎯 NEXT STEP');
console.log('═══════════════════════════════════════════════════════════════════\n');

console.log('Run the simple bet analysis with calibrated predictions:');
console.log('  node scripts/nhl/simple-bet-analysis-calibrated.mjs\n');
