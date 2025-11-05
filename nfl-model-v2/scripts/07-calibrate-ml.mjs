#!/usr/bin/env node
/**
 * NFL Model V4 - Isotonic Regression Calibrator
 * 
 * Fits out-of-fold isotonic regression to calibrate ML probabilities.
 * Improves monotonicity by ensuring predicted probabilities match actual win rates.
 * 
 * K-fold cross-validation prevents overfitting to training data.
 * 
 * Run: node nfl-model-v2/scripts/07-calibrate-ml.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const PREDICTIONS_DIR = path.join(__dirname, '../data/processed-features');
const ODDS_DIR = path.join(__dirname, '../data/historical-odds');
const CALIBRATION_DIR = path.join(__dirname, '../data/calibration');

/**
 * Load predictions and actual outcomes for all seasons
 */
async function loadPredictionsWithOutcomes() {
  const data = [];
  
  for (const season of config.seasons) {
    // Load predictions
    const predFile = path.join(PREDICTIONS_DIR, `predictions_${season}.json`);
    const predictions = JSON.parse(await fs.readFile(predFile, 'utf-8'));
    
    // Load games with actual outcomes
    const gamesFile = path.join(__dirname, '../data/nflverse', `game_aggregates_${season}.json`);
    const games = JSON.parse(await fs.readFile(gamesFile, 'utf-8'));
    
    // Match predictions to outcomes
    for (const pred of predictions) {
      const game = games.find(g => g.game_id === pred.game_id);
      if (game) {
        const homeWon = game.home_score > game.away_score;
        data.push({
          season: season,
          week: pred.week,
          game_id: pred.game_id,
          predicted_prob: pred.predictions.moneyline.home_win_prob,
          actual_outcome: homeWon ? 1 : 0,
          home_score: game.home_score,
          away_score: game.away_score
        });
      }
    }
  }
  
  return data;
}

/**
 * Split data into K folds for cross-validation
 * Use time-based splits to maintain temporal ordering
 */
function createTimeFolds(data, k) {
  // Sort by season and week
  const sorted = [...data].sort((a, b) => {
    if (a.season !== b.season) return a.season - b.season;
    return a.week - b.week;
  });
  
  const foldSize = Math.floor(sorted.length / k);
  const folds = [];
  
  for (let i = 0; i < k; i++) {
    const start = i * foldSize;
    const end = i === k - 1 ? sorted.length : (i + 1) * foldSize;
    folds.push(sorted.slice(start, end));
  }
  
  return folds;
}

/**
 * Isotonic regression (Pool Adjacent Violators algorithm)
 * Monotonically increasing function that minimizes squared error
 */
function isotonicRegression(xValues, yValues) {
  const n = xValues.length;
  if (n === 0) return [];
  
  // Create points with weights
  const points = xValues.map((x, i) => ({
    x: x,
    y: yValues[i],
    weight: 1
  }));
  
  // Sort by x
  points.sort((a, b) => a.x - b.x);
  
  // Pool Adjacent Violators algorithm
  const result = [...points];
  
  let i = 0;
  while (i < result.length - 1) {
    if (result[i].y > result[i + 1].y) {
      // Violation: merge adjacent points
      const totalWeight = result[i].weight + result[i + 1].weight;
      const mergedY = (result[i].y * result[i].weight + result[i + 1].y * result[i + 1].weight) / totalWeight;
      
      result[i] = {
        x: result[i].x,
        y: mergedY,
        weight: totalWeight
      };
      
      result.splice(i + 1, 1);
      
      // Backtrack to check previous points
      if (i > 0) i--;
    } else {
      i++;
    }
  }
  
  return result;
}

/**
 * Fit isotonic regression on training data
 */
function fitIsotonic(trainData, minBin = 200) {
  // Group predictions into bins
  const bins = [];
  for (let i = 0; i < trainData.length; i += minBin) {
    const chunk = trainData.slice(i, Math.min(i + minBin, trainData.length));
    if (chunk.length >= 20) { // Min 20 samples per bin
      const avgPred = chunk.reduce((sum, d) => sum + d.predicted_prob, 0) / chunk.length;
      const actualRate = chunk.reduce((sum, d) => sum + d.actual_outcome, 0) / chunk.length;
      bins.push({ x: avgPred, y: actualRate });
    }
  }
  
  // Apply isotonic regression to bins
  const xValues = bins.map(b => b.x);
  const yValues = bins.map(b => b.y);
  const calibrated = isotonicRegression(xValues, yValues);
  
  return calibrated;
}

/**
 * Apply isotonic calibration to a probability
 */
function applyIsotonicCalibration(prob, isotonicMap) {
  if (isotonicMap.length === 0) return prob;
  
  // Find nearest points in calibration map
  if (prob <= isotonicMap[0].x) return isotonicMap[0].y;
  if (prob >= isotonicMap[isotonicMap.length - 1].x) {
    return isotonicMap[isotonicMap.length - 1].y;
  }
  
  // Linear interpolation between nearest points
  for (let i = 0; i < isotonicMap.length - 1; i++) {
    if (prob >= isotonicMap[i].x && prob <= isotonicMap[i + 1].x) {
      const t = (prob - isotonicMap[i].x) / (isotonicMap[i + 1].x - isotonicMap[i].x);
      return isotonicMap[i].y + t * (isotonicMap[i + 1].y - isotonicMap[i].y);
    }
  }
  
  return prob; // Fallback
}

/**
 * Calculate calibration metrics
 */
function calculateCalibrationMetrics(data) {
  // Brier score
  const brierScore = data.reduce((sum, d) => {
    const error = d.predicted_prob - d.actual_outcome;
    return sum + (error * error);
  }, 0) / data.length;
  
  // Log loss
  const logLoss = -data.reduce((sum, d) => {
    const p = Math.max(0.001, Math.min(0.999, d.predicted_prob)); // Avoid log(0)
    return sum + (d.actual_outcome * Math.log(p) + (1 - d.actual_outcome) * Math.log(1 - p));
  }, 0) / data.length;
  
  // AUC approximation (sort by predicted prob)
  const sorted = [...data].sort((a, b) => a.predicted_prob - b.predicted_prob);
  const positives = sorted.filter(d => d.actual_outcome === 1).length;
  const negatives = sorted.length - positives;
  
  let auc = 0;
  let posRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].actual_outcome === 1) {
      posRank += i + 1;
    }
  }
  auc = (posRank - positives * (positives + 1) / 2) / (positives * negatives);
  
  return { brierScore, logLoss, auc };
}

/**
 * Main execution
 */
async function main() {
  console.log('🎯 NFL Model V4 - Isotonic Calibration');
  console.log('='.repeat(60));
  
  if (!config.calibration?.enable_isotonic) {
    console.log('❌ Isotonic calibration disabled in config');
    return;
  }
  
  console.log(`K-Fold: ${config.calibration.kfold}`);
  console.log(`Min Bin Size: ${config.calibration.min_bin}`);
  console.log('='.repeat(60));
  
  // Create calibration directory
  await fs.mkdir(CALIBRATION_DIR, { recursive: true });
  
  // Load all predictions with outcomes
  console.log('\n📥 Loading predictions and outcomes...');
  const allData = await loadPredictionsWithOutcomes();
  console.log(`   ✅ Loaded ${allData.length} games`);
  
  // Calculate pre-calibration metrics
  console.log('\n📊 Pre-Calibration Metrics:');
  const preMetrics = calculateCalibrationMetrics(allData);
  console.log(`   Brier Score: ${preMetrics.brierScore.toFixed(4)}`);
  console.log(`   Log Loss: ${preMetrics.logLoss.toFixed(4)}`);
  console.log(`   AUC: ${preMetrics.auc.toFixed(4)}`);
  
  // Create time-based folds
  console.log(`\n🔀 Creating ${config.calibration.kfold}-fold splits...`);
  const folds = createTimeFolds(allData, config.calibration.kfold);
  console.log(`   ✅ ${folds.length} folds created`);
  
  // Out-of-fold calibration
  console.log('\n🎯 Fitting isotonic regression (out-of-fold)...');
  const calibratedData = [];
  
  for (let i = 0; i < folds.length; i++) {
    const valFold = folds[i];
    const trainFolds = folds.filter((_, idx) => idx !== i);
    const trainData = trainFolds.flat();
    
    // Fit on train
    const isotonicMap = fitIsotonic(trainData, config.calibration.min_bin);
    
    // Apply to validation
    for (const point of valFold) {
      const calibratedProb = applyIsotonicCalibration(point.predicted_prob, isotonicMap);
      calibratedData.push({
        ...point,
        calibrated_prob: calibratedProb
      });
    }
    
    console.log(`   Fold ${i + 1}/${folds.length}: Train=${trainData.length}, Val=${valFold.length}, Bins=${isotonicMap.length}`);
  }
  
  // Calculate post-calibration metrics
  console.log('\n📊 Post-Calibration Metrics:');
  const postData = calibratedData.map(d => ({
    ...d,
    predicted_prob: d.calibrated_prob
  }));
  const postMetrics = calculateCalibrationMetrics(postData);
  console.log(`   Brier Score: ${postMetrics.brierScore.toFixed(4)} (${((postMetrics.brierScore - preMetrics.brierScore) / preMetrics.brierScore * 100).toFixed(1)}%)`);
  console.log(`   Log Loss: ${postMetrics.logLoss.toFixed(4)} (${((postMetrics.logLoss - preMetrics.logLoss) / preMetrics.logLoss * 100).toFixed(1)}%)`);
  console.log(`   AUC: ${postMetrics.auc.toFixed(4)} (${((postMetrics.auc - preMetrics.auc) / preMetrics.auc * 100).toFixed(1)}%)`);
  
  // Fit final isotonic map on all data
  console.log('\n🔧 Fitting final isotonic map on all data...');
  const finalIsotonicMap = fitIsotonic(allData, config.calibration.min_bin);
  console.log(`   ✅ Created ${finalIsotonicMap.length} calibration bins`);
  
  // Save calibration map
  const outputPath = path.join(CALIBRATION_DIR, 'ml_isotonic.json');
  await fs.writeFile(outputPath, JSON.stringify({
    created_at: new Date().toISOString(),
    model_version: 'v4',
    k_folds: config.calibration.kfold,
    min_bin_size: config.calibration.min_bin,
    total_games: allData.length,
    num_bins: finalIsotonicMap.length,
    pre_calibration: preMetrics,
    post_calibration: postMetrics,
    improvement: {
      brier_pct: ((postMetrics.brierScore - preMetrics.brierScore) / preMetrics.brierScore * 100).toFixed(2),
      logloss_pct: ((postMetrics.logLoss - preMetrics.logLoss) / preMetrics.logLoss * 100).toFixed(2),
      auc_pct: ((postMetrics.auc - preMetrics.auc) / preMetrics.auc * 100).toFixed(2)
    },
    isotonic_map: finalIsotonicMap
  }, null, 2));
  
  console.log(`   ✅ Saved to ${outputPath}`);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Calibration Complete!');
  console.log(`   Improvement: Brier ${((postMetrics.brierScore - preMetrics.brierScore) / preMetrics.brierScore * 100).toFixed(1)}%, AUC ${((postMetrics.auc - preMetrics.auc) / preMetrics.auc * 100).toFixed(1)}%`);
  console.log('='.repeat(60));
  
  console.log('\n📝 Next Step: Re-run predictions with calibration enabled\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
