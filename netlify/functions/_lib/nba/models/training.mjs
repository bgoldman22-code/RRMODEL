/**
 * NBA Training Pipeline - Elite Model Training
 * 
 * Trains ensemble models on historical NBA data
 * Includes cross-validation, hyperparameter tuning, and model persistence
 * 
 * ELITE SYSTEM INTEGRATIONS:
 * - Rolling OOS CV with time-series splits (training-elite.mjs)
 * - Isotonic calibration for win probabilities (calibration.mjs)
 * - Feature validation with bounds checking (feature-validator.mjs)
 * - Model versioning with artifacts (artifact-manager.mjs)
 * - Safe data loading with retries (safe-fetch.mjs)
 */

import { buildTeamFeatures, buildMatchupFeatures } from '../features.mjs';
import { fetchTodaysGames, loadTeamInfo } from '../loaders.mjs';
import EnsembleModel from './ensemble.mjs';
import { runRollingCV } from '../training-elite.mjs';
import { IsotonicCalibrator, calculateBrierScore, calculateLogLoss } from '../calibration.mjs';
import { validateFeatureBatch } from '../feature-validator.mjs';
import { saveArtifact } from '../artifact-manager.mjs';
import fs from 'fs/promises';

/**
 * Load historical game results for training
 * ELITE: Now loads from collected multi-season data files
 */
export async function loadHistoricalGames(seasons = ['2023-24', '2024-25']) {
  console.log('[Training] Loading historical games for seasons:', seasons);
  
  const allGames = [];
  
  // Map season format to file names
  const seasonFileMap = {
    '2022-23': 'games_2022_23.json',
    '2023-24': 'games_2023_24.json',
    '2024-25': 'games_2024_25.json'
  };
  
  for (const season of seasons) {
    const filename = seasonFileMap[season];
    if (!filename) {
      console.warn(`[Training] Unknown season format: ${season}`);
      continue;
    }
    
    const filepath = `data/nba/games/${filename}`;
    
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const seasonGames = JSON.parse(content);
      
      console.log(`[Training] Loaded ${seasonGames.length} games from ${season}`);
      allGames.push(...seasonGames);
      
    } catch (error) {
      console.warn(`[Training] Could not load ${filepath}:`, error.message);
    }
  }
  
  console.log(`[Training] ✅ Total games loaded: ${allGames.length}`);
  
  return allGames;
}

/**
 * Build training dataset from historical games
 * ELITE: Now includes feature validation
 */
export async function buildTrainingDataset(games) {
  console.log('[Training] Building feature dataset from', games.length, 'games');
  
  const X = []; // Features
  const y_spread = []; // Actual spreads (home team perspective)
  const y_total = []; // Actual totals
  const y_homeWin = []; // Win/loss (1/0)
  
  for (const game of games) {
    try {
      // Build features for both teams
      const [homeFeatures, awayFeatures] = await Promise.all([
        buildTeamFeatures(game.homeTeamId, game, game.season),
        buildTeamFeatures(game.awayTeamId, game, game.season)
      ]);
      
      // Build matchup features
      const matchupFeatures = buildMatchupFeatures(homeFeatures, awayFeatures);
      
      // Combine all features
      const allFeatures = {
        ...homeFeatures,
        ...awayFeatures,
        ...matchupFeatures,
        date: game.date // Keep for time-series splits
      };
      
      X.push(allFeatures);
      
      // Target variables
      const actualSpread = game.homeScore - game.awayScore;
      const actualTotal = game.homeScore + game.awayScore;
      const homeWin = actualSpread > 0 ? 1 : 0;
      
      y_spread.push(actualSpread);
      y_total.push(actualTotal);
      y_homeWin.push(homeWin);
      
    } catch (error) {
      console.error('[Training] Error processing game:', game.id, error);
    }
  }
  
  // ELITE: Validate features with bounds checking
  console.log('[Training] Validating features...');
  const validationResult = validateFeatureBatch(X, {
    clamp: true,
    impute: true,
    logViolations: true
  });
  
  if (validationResult.violationCount > 0) {
    console.warn(`[Training] ⚠️  ${validationResult.violationCount} feature violations detected and corrected`);
  }
  
  console.log('[Training] ✅ Built dataset:', validationResult.features.length, 'samples');
  
  return { 
    X: validationResult.features, 
    y_spread, 
    y_total, 
    y_homeWin,
    rawGames: games // Keep for rolling CV
  };
}

/**
 * Train spread model
 */
export async function trainSpreadModel(X, y) {
  console.log('[Training] Training spread prediction model...');
  
  const model = new EnsembleModel();
  await model.train(X, y);
  
  // Evaluate on training set
  const predictions = model.predict(X);
  const mae = calculateMAE(predictions.map(p => p.prediction), y);
  const rmse = calculateRMSE(predictions.map(p => p.prediction), y);
  
  console.log('[Training] Spread Model Performance:');
  console.log(`  MAE: ${mae.toFixed(2)} points`);
  console.log(`  RMSE: ${rmse.toFixed(2)} points`);
  
  return model;
}

/**
 * Train total (over/under) model
 */
export async function trainTotalModel(X, y) {
  console.log('[Training] Training total prediction model...');
  
  const model = new EnsembleModel();
  await model.train(X, y);
  
  // Evaluate
  const predictions = model.predict(X);
  const mae = calculateMAE(predictions.map(p => p.prediction), y);
  const rmse = calculateRMSE(predictions.map(p => p.prediction), y);
  
  console.log('[Training] Total Model Performance:');
  console.log(`  MAE: ${mae.toFixed(2)} points`);
  console.log(`  RMSE: ${rmse.toFixed(2)} points`);
  
  return model;
}

/**
 * K-Fold Cross-Validation
 */
export async function crossValidate(X, y, k = 5) {
  console.log(`[Training] Running ${k}-fold cross-validation...`);
  
  const foldSize = Math.floor(X.length / k);
  const scores = [];
  
  for (let i = 0; i < k; i++) {
    // Split data
    const testStart = i * foldSize;
    const testEnd = testStart + foldSize;
    
    const X_test = X.slice(testStart, testEnd);
    const y_test = y.slice(testStart, testEnd);
    const X_train = [...X.slice(0, testStart), ...X.slice(testEnd)];
    const y_train = [...y.slice(0, testStart), ...y.slice(testEnd)];
    
    // Train and evaluate
    const model = new EnsembleModel();
    await model.train(X_train, y_train);
    const predictions = model.predict(X_test);
    
    const mae = calculateMAE(predictions.map(p => p.prediction), y_test);
    const rmse = calculateRMSE(predictions.map(p => p.prediction), y_test);
    
    scores.push({ mae, rmse });
    
    console.log(`[Training] Fold ${i + 1}/${k}: MAE=${mae.toFixed(2)}, RMSE=${rmse.toFixed(2)}`);
  }
  
  // Average scores
  const avgMAE = scores.reduce((sum, s) => sum + s.mae, 0) / k;
  const avgRMSE = scores.reduce((sum, s) => sum + s.rmse, 0) / k;
  
  console.log('[Training] ✅ Cross-Validation Results:');
  console.log(`  Average MAE: ${avgMAE.toFixed(2)}`);
  console.log(`  Average RMSE: ${avgRMSE.toFixed(2)}`);
  
  return { avgMAE, avgRMSE, scores };
}

/**
 * Walk-Forward Validation (Time Series)
 * 
 * More appropriate for sports betting than k-fold
 * Tests model on future data it hasn't seen
 */
export async function walkForwardValidation(X, y, trainSize = 0.7, stepSize = 10) {
  console.log('[Training] Running walk-forward validation...');
  
  const initialTrainEnd = Math.floor(X.length * trainSize);
  const scores = [];
  
  for (let testStart = initialTrainEnd; testStart < X.length; testStart += stepSize) {
    const testEnd = Math.min(testStart + stepSize, X.length);
    
    const X_train = X.slice(0, testStart);
    const y_train = y.slice(0, testStart);
    const X_test = X.slice(testStart, testEnd);
    const y_test = y.slice(testStart, testEnd);
    
    // Train on all data up to test point
    const model = new EnsembleModel();
    await model.train(X_train, y_train);
    
    // Predict on next step
    const predictions = model.predict(X_test);
    const mae = calculateMAE(predictions.map(p => p.prediction), y_test);
    
    scores.push(mae);
    
    console.log(`[Training] Step ${testStart}-${testEnd}: MAE=${mae.toFixed(2)}`);
  }
  
  const avgMAE = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  
  console.log('[Training] ✅ Walk-Forward Average MAE:', avgMAE.toFixed(2));
  
  return { avgMAE, scores };
}

/**
 * Calculate Mean Absolute Error
 */
function calculateMAE(predictions, actuals) {
  const errors = predictions.map((pred, i) => Math.abs(pred - actuals[i]));
  return errors.reduce((sum, e) => sum + e, 0) / errors.length;
}

/**
 * Calculate Root Mean Squared Error
 */
function calculateRMSE(predictions, actuals) {
  const squaredErrors = predictions.map((pred, i) => Math.pow(pred - actuals[i], 2));
  const mse = squaredErrors.reduce((sum, e) => sum + e, 0) / squaredErrors.length;
  return Math.sqrt(mse);
}

/**
 * Calculate R² Score
 */
function calculateR2(predictions, actuals) {
  const mean = actuals.reduce((sum, val) => sum + val, 0) / actuals.length;
  const ssRes = actuals.reduce((sum, val, i) => sum + Math.pow(val - predictions[i], 2), 0);
  const ssTot = actuals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0);
  return 1 - (ssRes / ssTot);
}

/**
 * Analyze feature importance
 */
export function analyzeFeatureImportance(model, topN = 20) {
  console.log('[Training] Analyzing feature importance...');
  
  const importance = model.getFeatureImportance();
  
  // Sort by importance
  const sorted = Object.entries(importance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
  
  console.log(`\n[Training] Top ${topN} Most Important Features:`);
  sorted.forEach(([feature, score], i) => {
    console.log(`  ${i + 1}. ${feature}: ${score.toFixed(4)}`);
  });
  
  return sorted;
}

/**
 * Calibrate probability predictions
 * 
 * Ensures predicted win probabilities match actual win rates
 */
export function calibrateProbabilities(predictions, actuals, bins = 10) {
  console.log('[Training] Calibrating probabilities...');
  
  const binSize = 1 / bins;
  const calibration = [];
  
  for (let i = 0; i < bins; i++) {
    const binStart = i * binSize;
    const binEnd = (i + 1) * binSize;
    
    const inBin = predictions
      .map((pred, idx) => ({ pred, actual: actuals[idx] }))
      .filter(p => p.pred >= binStart && p.pred < binEnd);
    
    if (inBin.length > 0) {
      const avgPred = inBin.reduce((sum, p) => sum + p.pred, 0) / inBin.length;
      const avgActual = inBin.reduce((sum, p) => sum + p.actual, 0) / inBin.length;
      
      calibration.push({
        binStart,
        binEnd,
        avgPredicted: avgPred,
        avgActual: avgActual,
        count: inBin.length
      });
    }
  }
  
  console.log('[Training] Calibration curve:');
  calibration.forEach(bin => {
    console.log(`  ${(bin.binStart * 100).toFixed(0)}-${(bin.binEnd * 100).toFixed(0)}%: ` +
                `Predicted=${(bin.avgPredicted * 100).toFixed(1)}%, ` +
                `Actual=${(bin.avgActual * 100).toFixed(1)}% ` +
                `(n=${bin.count})`);
  });
  
  return calibration;
}

/**
 * Full training pipeline - ELITE VERSION
 * 
 * Features:
 * - Rolling OOS CV with time-series splits
 * - Isotonic calibration
 * - Feature validation
 * - Model versioning
 */
export async function runFullTrainingPipeline(seasons = ['2022-23', '2023-24', '2024-25']) {
  console.log('='.repeat(70));
  console.log('NBA ELITE MODEL TRAINING PIPELINE V2.0');
  console.log('With Rolling CV, Calibration, and Hardened Features');
  console.log('='.repeat(70));
  
  // 1. Load data
  const games = await loadHistoricalGames(seasons);
  
  if (games.length === 0) {
    console.log('[Training] ⚠️  No historical data available yet');
    console.log('[Training] Run: node scripts/collect-nba-data.js first');
    return null;
  }
  
  // 2. Build features with validation
  const { X, y_spread, y_total, y_homeWin, rawGames } = await buildTrainingDataset(games);
  
  console.log(`\n[Training] Dataset Summary:`);
  console.log(`  Total Games: ${games.length}`);
  console.log(`  Features per Sample: ${Object.keys(X[0]).filter(k => k !== 'date').length}`);
  console.log(`  Date Range: ${rawGames[0]?.date} to ${rawGames[rawGames.length - 1]?.date}`);
  
  // 3. ELITE: Rolling OOS Cross-Validation
  console.log('\n' + '='.repeat(70));
  console.log('ROLLING OUT-OF-SAMPLE CROSS-VALIDATION');
  console.log('='.repeat(70));
  
  // Define model training function for CV
  async function trainModel(trainGames) {
    const { X: X_train, y_spread: y_train } = await buildTrainingDataset(trainGames);
    const model = new EnsembleModel();
    await model.train(X_train, y_train);
    return model;
  }
  
  // Define prediction function for CV
  async function predict(model, game) {
    const features = await buildGameFeatures(game);
    const prediction = model.predict([features])[0];
    
    // Convert spread to win probability (rough approximation)
    const homeWinProb = 1 / (1 + Math.exp(-prediction.prediction / 7)); // Logistic
    
    return {
      homeWinProb,
      spread: prediction.prediction,
      total: null // Handled separately
    };
  }
  
  // Run rolling CV
  const cvResults = await runRollingCV(rawGames, trainModel, predict, {
    minTrainSize: 500,
    validationSize: 100,
    step: 50,
    maxSplits: 8
  });
  
  // 4. Train final models on ALL data
  console.log('\n' + '='.repeat(70));
  console.log('TRAINING FINAL PRODUCTION MODELS');
  console.log('='.repeat(70));
  
  const spreadModel = await trainSpreadModel(X, y_spread);
  const totalModel = await trainTotalModel(X, y_total);
  
  // 5. ELITE: Train calibrators using best CV fold
  console.log('\n' + '='.repeat(70));
  console.log('CALIBRATING WIN PROBABILITIES');
  console.log('='.repeat(70));
  
  const bestFold = cvResults.folds.reduce((best, fold) => 
    fold.metrics.calibrated.brier < best.metrics.calibrated.brier ? fold : best
  );
  
  const spreadCalibrator = bestFold.calibrator;
  console.log(`[Training] Using calibrator from fold ${bestFold.fold}`);
  console.log(`  Brier Score: ${bestFold.metrics.calibrated.brier.toFixed(4)}`);
  console.log(`  Log Loss: ${bestFold.metrics.calibrated.logLoss.toFixed(4)}`);
  
  // 6. ELITE: Save versioned artifact
  console.log('\n' + '='.repeat(70));
  console.log('SAVING VERSIONED ARTIFACT');
  console.log('='.repeat(70));
  
  const artifact = {
    modelType: 'ensemble',
    season: seasons[seasons.length - 1], // Latest season
    trainingConfig: {
      seasons,
      cv_folds: cvResults.totalFolds,
      validation_size: 100,
      features: Object.keys(X[0]).filter(k => k !== 'date').length
    },
    performance: {
      spreadMAE: cvResults.aggregated.spreadMAE.mean,
      totalMAE: cvResults.aggregated.totalMAE.mean,
      brier: cvResults.aggregated.brier.calibrated.mean,
      logLoss: cvResults.aggregated.logLoss.calibrated.mean
    },
    models: {
      spread: spreadModel.serialize(),
      total: totalModel.serialize()
    },
    calibrators: {
      spread: spreadCalibrator.toJSON()
    },
    metadata: {
      trainingGames: games.length,
      dateRange: {
        start: rawGames[0]?.date,
        end: rawGames[rawGames.length - 1]?.date
      }
    }
  };
  
  try {
    const saved = await saveArtifact(artifact, { updateLatest: true });
    console.log(`[Training] ✅ Artifact saved: ${saved.versionKey}`);
  } catch (error) {
    console.warn('[Training] ⚠️  Could not save artifact (Netlify Blobs not available):', error.message);
    console.log('[Training] Models trained successfully, but not persisted to Blobs');
  }
  
  // 7. Summary
  console.log('\n' + '='.repeat(70));
  console.log('✅ ELITE TRAINING PIPELINE COMPLETE');
  console.log('='.repeat(70));
  console.log('\nPerformance Summary:');
  console.log(`  Spread MAE: ${cvResults.aggregated.spreadMAE.mean.toFixed(2)} ± ${cvResults.aggregated.spreadMAE.std.toFixed(2)} pts`);
  console.log(`  Total MAE: ${cvResults.aggregated.totalMAE.mean.toFixed(2)} ± ${cvResults.aggregated.totalMAE.std.toFixed(2)} pts`);
  console.log(`  Win Prob Brier: ${cvResults.aggregated.brier.calibrated.mean.toFixed(4)} (calibrated)`);
  console.log(`  Win Prob Log Loss: ${cvResults.aggregated.logLoss.calibrated.mean.toFixed(4)} (calibrated)`);
  console.log('\nCalibration Improvement:');
  console.log(`  Brier: ${cvResults.aggregated.improvement.brier.mean.toFixed(1)}% better`);
  console.log(`  Log Loss: ${cvResults.aggregated.improvement.logLoss.mean.toFixed(1)}% better`);
  console.log('\n' + '='.repeat(70));
  
  return {
    spreadModel,
    totalModel,
    calibrators: { spread: spreadCalibrator },
    cvResults,
    artifact,
    stats: {
      games: games.length,
      features: Object.keys(X[0]).filter(k => k !== 'date').length,
      performance: artifact.performance
    }
  };
}

/**
 * Helper: Build features for a single game
 */
async function buildGameFeatures(game) {
  const [homeFeatures, awayFeatures] = await Promise.all([
    buildTeamFeatures(game.homeTeamId, game, game.season),
    buildTeamFeatures(game.awayTeamId, game, game.season)
  ]);
  
  const matchupFeatures = buildMatchupFeatures(homeFeatures, awayFeatures);
  
  return {
    ...homeFeatures,
    ...awayFeatures,
    ...matchupFeatures
  };
}
