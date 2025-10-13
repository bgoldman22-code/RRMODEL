/**
 * NBA Elite Training System
 * 
 * Rolling Out-of-Sample Cross-Validation with time-series splits
 * Prevents leakage, ensures temporal integrity, tracks per-fold performance
 * 
 * Features:
 * - Time-series CV (train on ≤T, validate on >T)
 * - Rolling window splits (weeks/months)
 * - Per-fold metrics (MAE, Brier, log loss)
 * - Team-wise leakage guards
 * - Calibration integration
 */

import { IsotonicCalibrator, calculateBrierScore, calculateLogLoss } from './calibration.mjs';

/**
 * Generate time-series cross-validation splits
 * 
 * @param {Array<object>} games - All games with dates
 * @param {object} options - Split configuration
 * @returns {Array<object>} Train/validation splits
 */
export function generateTimeSeriesSplits(games, options = {}) {
  const {
    minTrainSize = 200,      // Minimum games for training
    validationSize = 50,     // Games per validation window
    step = 25,               // Sliding window step
    maxSplits = null         // Limit number of splits
  } = options;
  
  // Sort games chronologically
  const sortedGames = games
    .filter(g => g.date)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  const splits = [];
  let trainEndIdx = minTrainSize;
  
  while (trainEndIdx + validationSize <= sortedGames.length) {
    const trainGames = sortedGames.slice(0, trainEndIdx);
    const valGames = sortedGames.slice(trainEndIdx, trainEndIdx + validationSize);
    
    // Extract date ranges for logging
    const trainDateRange = {
      start: trainGames[0].date,
      end: trainGames[trainGames.length - 1].date
    };
    
    const valDateRange = {
      start: valGames[0].date,
      end: valGames[valGames.length - 1].date
    };
    
    splits.push({
      fold: splits.length + 1,
      trainIndices: Array.from({ length: trainEndIdx }, (_, i) => i),
      valIndices: Array.from({ length: validationSize }, (_, i) => trainEndIdx + i),
      trainGames,
      valGames,
      trainDateRange,
      valDateRange,
      trainSize: trainGames.length,
      valSize: valGames.length
    });
    
    trainEndIdx += step;
    
    if (maxSplits && splits.length >= maxSplits) break;
  }
  
  console.log(`[TrainingElite] Generated ${splits.length} time-series splits`);
  console.log(`  Train size range: ${minTrainSize} to ${sortedGames.length - validationSize}`);
  console.log(`  Validation size: ${validationSize} games per fold`);
  
  return splits;
}

/**
 * Validate no team appears in both train and validation on same date
 * Critical for preventing leakage in same-day predictions
 * 
 * @param {Array<object>} trainGames - Training games
 * @param {Array<object>} valGames - Validation games
 * @returns {boolean} True if no leakage detected
 */
export function validateNoLeakage(trainGames, valGames) {
  // Get all validation dates and teams
  const valDateTeams = new Set();
  
  for (const game of valGames) {
    const dateStr = new Date(game.date).toISOString().split('T')[0];
    valDateTeams.add(`${dateStr}_${game.homeTeam}`);
    valDateTeams.add(`${dateStr}_${game.awayTeam}`);
  }
  
  // Check training games don't include same team on same date
  for (const game of trainGames) {
    const dateStr = new Date(game.date).toISOString().split('T')[0];
    const homeKey = `${dateStr}_${game.homeTeam}`;
    const awayKey = `${dateStr}_${game.awayTeam}`;
    
    if (valDateTeams.has(homeKey) || valDateTeams.has(awayKey)) {
      console.error(`[TrainingElite] LEAKAGE DETECTED: ${game.homeTeam} vs ${game.awayTeam} on ${dateStr}`);
      return false;
    }
  }
  
  return true;
}

/**
 * Train model on single fold with calibration
 * 
 * @param {object} split - Train/val split from generateTimeSeriesSplits
 * @param {Function} trainModelFn - Model training function
 * @param {Function} predictFn - Prediction function
 * @returns {object} Fold results with metrics and calibrator
 */
export async function trainFold(split, trainModelFn, predictFn) {
  console.log(`\n[TrainingElite] Training Fold ${split.fold}`);
  console.log(`  Train: ${split.trainDateRange.start} to ${split.trainDateRange.end} (${split.trainSize} games)`);
  console.log(`  Val: ${split.valDateRange.start} to ${split.valDateRange.end} (${split.valSize} games)`);
  
  // Validate no leakage
  if (!validateNoLeakage(split.trainGames, split.valGames)) {
    throw new Error(`Fold ${split.fold}: Leakage detected between train and validation sets`);
  }
  
  // Train model
  const model = await trainModelFn(split.trainGames);
  
  // Generate predictions on validation set
  const predictions = [];
  const outcomes = [];
  const spreads = [];
  const actualSpreads = [];
  const totals = [];
  const actualTotals = [];
  
  for (const game of split.valGames) {
    const pred = await predictFn(model, game);
    
    predictions.push(pred.homeWinProb);
    outcomes.push(game.homeWin ? 1 : 0);
    
    if (pred.spread !== undefined) {
      spreads.push(pred.spread);
      actualSpreads.push(game.actualSpread || (game.homeScore - game.awayScore));
    }
    
    if (pred.total !== undefined) {
      totals.push(pred.total);
      actualTotals.push(game.actualTotal || (game.homeScore + game.awayScore));
    }
  }
  
  // Calculate raw metrics
  const spreadMAE = spreads.length > 0
    ? spreads.reduce((sum, pred, i) => sum + Math.abs(pred - actualSpreads[i]), 0) / spreads.length
    : null;
  
  const totalMAE = totals.length > 0
    ? totals.reduce((sum, pred, i) => sum + Math.abs(pred - actualTotals[i]), 0) / totals.length
    : null;
  
  const brierScore = calculateBrierScore(predictions, outcomes);
  const logLoss = calculateLogLoss(predictions, outcomes);
  
  // Train calibrator on validation predictions
  const calibrator = new IsotonicCalibrator();
  calibrator.fit(predictions, outcomes);
  
  // Generate calibrated predictions
  const calibratedPredictions = calibrator.transform(predictions);
  const calibratedBrier = calculateBrierScore(calibratedPredictions, outcomes);
  const calibratedLogLoss = calculateLogLoss(calibratedPredictions, outcomes);
  
  // Calculate improvement from calibration
  const brierImprovement = ((brierScore - calibratedBrier) / brierScore * 100).toFixed(1);
  const logLossImprovement = ((logLoss - calibratedLogLoss) / logLoss * 100).toFixed(1);
  
  console.log(`  Metrics (Raw → Calibrated):`);
  console.log(`    Spread MAE: ${spreadMAE?.toFixed(2) || 'N/A'} pts`);
  console.log(`    Total MAE: ${totalMAE?.toFixed(2) || 'N/A'} pts`);
  console.log(`    Brier: ${brierScore.toFixed(4)} → ${calibratedBrier.toFixed(4)} (${brierImprovement}% better)`);
  console.log(`    Log Loss: ${logLoss.toFixed(4)} → ${calibratedLogLoss.toFixed(4)} (${logLossImprovement}% better)`);
  
  return {
    fold: split.fold,
    model,
    calibrator,
    metrics: {
      raw: {
        spreadMAE,
        totalMAE,
        brier: brierScore,
        logLoss
      },
      calibrated: {
        brier: calibratedBrier,
        logLoss: calibratedLogLoss
      },
      improvement: {
        brier: parseFloat(brierImprovement),
        logLoss: parseFloat(logLossImprovement)
      }
    },
    predictions: {
      raw: predictions,
      calibrated: calibratedPredictions,
      outcomes
    },
    dateRange: split.valDateRange
  };
}

/**
 * Run complete rolling OOS cross-validation
 * 
 * @param {Array<object>} games - All games
 * @param {Function} trainModelFn - Model training function
 * @param {Function} predictFn - Prediction function
 * @param {object} options - CV configuration
 * @returns {object} Aggregated CV results
 */
export async function runRollingCV(games, trainModelFn, predictFn, options = {}) {
  console.log('\n========================================');
  console.log('NBA ELITE TRAINING: Rolling OOS CV');
  console.log('========================================\n');
  
  // Generate splits
  const splits = generateTimeSeriesSplits(games, options);
  
  // Train each fold
  const foldResults = [];
  
  for (const split of splits) {
    const result = await trainFold(split, trainModelFn, predictFn);
    foldResults.push(result);
  }
  
  // Aggregate metrics across folds
  const aggregated = aggregateMetrics(foldResults);
  
  // Display summary
  console.log('\n========================================');
  console.log('CV SUMMARY');
  console.log('========================================\n');
  console.log(`Total Folds: ${foldResults.length}`);
  console.log(`Total Validation Games: ${foldResults.reduce((sum, f) => sum + f.predictions.outcomes.length, 0)}`);
  console.log('\nAggregate Metrics (Mean ± Std):');
  console.log(`  Spread MAE: ${aggregated.spreadMAE.mean.toFixed(2)} ± ${aggregated.spreadMAE.std.toFixed(2)} pts`);
  console.log(`  Total MAE: ${aggregated.totalMAE.mean.toFixed(2)} ± ${aggregated.totalMAE.std.toFixed(2)} pts`);
  console.log(`  Brier (Raw): ${aggregated.brier.raw.mean.toFixed(4)} ± ${aggregated.brier.raw.std.toFixed(4)}`);
  console.log(`  Brier (Calibrated): ${aggregated.brier.calibrated.mean.toFixed(4)} ± ${aggregated.brier.calibrated.std.toFixed(4)}`);
  console.log(`  Log Loss (Raw): ${aggregated.logLoss.raw.mean.toFixed(4)} ± ${aggregated.logLoss.raw.std.toFixed(4)}`);
  console.log(`  Log Loss (Calibrated): ${aggregated.logLoss.calibrated.mean.toFixed(4)} ± ${aggregated.logLoss.calibrated.std.toFixed(4)}`);
  console.log(`\nCalibration Improvement:`);
  console.log(`  Brier: ${aggregated.improvement.brier.mean.toFixed(1)}% ± ${aggregated.improvement.brier.std.toFixed(1)}%`);
  console.log(`  Log Loss: ${aggregated.improvement.logLoss.mean.toFixed(1)}% ± ${aggregated.improvement.logLoss.std.toFixed(1)}%`);
  console.log('========================================\n');
  
  return {
    folds: foldResults,
    aggregated,
    totalGames: games.length,
    totalFolds: foldResults.length
  };
}

/**
 * Aggregate metrics across folds
 * 
 * @param {Array<object>} foldResults - Results from trainFold
 * @returns {object} Mean and std for each metric
 */
function aggregateMetrics(foldResults) {
  const metrics = {
    spreadMAE: [],
    totalMAE: [],
    brier: { raw: [], calibrated: [] },
    logLoss: { raw: [], calibrated: [] },
    improvement: { brier: [], logLoss: [] }
  };
  
  for (const fold of foldResults) {
    if (fold.metrics.raw.spreadMAE !== null) {
      metrics.spreadMAE.push(fold.metrics.raw.spreadMAE);
    }
    if (fold.metrics.raw.totalMAE !== null) {
      metrics.totalMAE.push(fold.metrics.raw.totalMAE);
    }
    metrics.brier.raw.push(fold.metrics.raw.brier);
    metrics.brier.calibrated.push(fold.metrics.calibrated.brier);
    metrics.logLoss.raw.push(fold.metrics.raw.logLoss);
    metrics.logLoss.calibrated.push(fold.metrics.calibrated.logLoss);
    metrics.improvement.brier.push(fold.metrics.improvement.brier);
    metrics.improvement.logLoss.push(fold.metrics.improvement.logLoss);
  }
  
  return {
    spreadMAE: calculateStats(metrics.spreadMAE),
    totalMAE: calculateStats(metrics.totalMAE),
    brier: {
      raw: calculateStats(metrics.brier.raw),
      calibrated: calculateStats(metrics.brier.calibrated)
    },
    logLoss: {
      raw: calculateStats(metrics.logLoss.raw),
      calibrated: calculateStats(metrics.logLoss.calibrated)
    },
    improvement: {
      brier: calculateStats(metrics.improvement.brier),
      logLoss: calculateStats(metrics.improvement.logLoss)
    }
  };
}

/**
 * Calculate mean and standard deviation
 * 
 * @param {Array<number>} values - Numeric values
 * @returns {object} Mean and std
 */
function calculateStats(values) {
  if (values.length === 0) return { mean: null, std: null };
  
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const std = Math.sqrt(variance);
  
  return { mean, std };
}

/**
 * USAGE EXAMPLE:
 * 
 * // Define model training and prediction functions
 * async function trainModel(games) {
 *   // Build features, train XGBoost/NN/Bayesian ensemble
 *   return trainedModel;
 * }
 * 
 * async function predict(model, game) {
 *   // Generate prediction
 *   return {
 *     homeWinProb: 0.62,
 *     spread: -5.5,
 *     total: 220.5
 *   };
 * }
 * 
 * // Run rolling CV
 * const results = await runRollingCV(allGames, trainModel, predict, {
 *   minTrainSize: 500,
 *   validationSize: 100,
 *   step: 50,
 *   maxSplits: 10
 * });
 * 
 * // Best fold calibrator
 * const bestFold = results.folds.reduce((best, f) => 
 *   f.metrics.calibrated.brier < best.metrics.calibrated.brier ? f : best
 * );
 * const productionCalibrator = bestFold.calibrator;
 */
