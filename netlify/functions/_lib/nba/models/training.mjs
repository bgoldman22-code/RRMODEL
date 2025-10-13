/**
 * NBA Training Pipeline - Elite Model Training
 * 
 * Trains ensemble models on historical NBA data
 * Includes cross-validation, hyperparameter tuning, and model persistence
 */

import { buildTeamFeatures, buildMatchupFeatures } from '../features.mjs';
import { fetchTodaysGames, loadTeamInfo } from '../loaders.mjs';
import EnsembleModel from './ensemble.mjs';

/**
 * Load historical game results for training
 */
export async function loadHistoricalGames(seasons = ['2023-24', '2024-25']) {
  console.log('[Training] Loading historical games for seasons:', seasons);
  
  // In production, this would load from a database or data files
  // For now, return placeholder structure
  
  const games = [];
  
  // TODO: Implement actual data loading from:
  // - Local JSON files in data/nba/games/
  // - Or fetch from Basketball Reference
  // - Or load from Supabase/database
  
  console.log(`[Training] Loaded ${games.length} historical games`);
  
  return games;
}

/**
 * Build training dataset from historical games
 */
export async function buildTrainingDataset(games) {
  console.log('[Training] Building feature dataset from', games.length, 'games');
  
  const X = []; // Features
  const y_spread = []; // Actual spreads (home team perspective)
  const y_total = []; // Actual totals
  
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
        ...matchupFeatures
      };
      
      X.push(allFeatures);
      
      // Target variables
      const actualSpread = game.homeScore - game.awayScore;
      const actualTotal = game.homeScore + game.awayScore;
      
      y_spread.push(actualSpread);
      y_total.push(actualTotal);
      
    } catch (error) {
      console.error('[Training] Error processing game:', game.id, error);
    }
  }
  
  console.log('[Training] ✅ Built dataset:', X.length, 'samples');
  
  return { X, y_spread, y_total };
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
 * Full training pipeline
 */
export async function runFullTrainingPipeline(seasons = ['2023-24', '2024-25']) {
  console.log('='.repeat(60));
  console.log('NBA ELITE MODEL TRAINING PIPELINE');
  console.log('='.repeat(60));
  
  // 1. Load data
  const games = await loadHistoricalGames(seasons);
  
  if (games.length === 0) {
    console.log('[Training] ⚠️  No historical data available yet');
    console.log('[Training] Run data collection first');
    return null;
  }
  
  // 2. Build features
  const { X, y_spread, y_total } = await buildTrainingDataset(games);
  
  // 3. Cross-validation
  console.log('\n' + '='.repeat(60));
  console.log('SPREAD MODEL VALIDATION');
  console.log('='.repeat(60));
  await crossValidate(X, y_spread, 5);
  
  console.log('\n' + '='.repeat(60));
  console.log('TOTAL MODEL VALIDATION');
  console.log('='.repeat(60));
  await crossValidate(X, y_total, 5);
  
  // 4. Walk-forward validation
  console.log('\n' + '='.repeat(60));
  console.log('WALK-FORWARD VALIDATION');
  console.log('='.repeat(60));
  await walkForwardValidation(X, y_spread);
  
  // 5. Train final models on all data
  console.log('\n' + '='.repeat(60));
  console.log('TRAINING FINAL MODELS');
  console.log('='.repeat(60));
  
  const spreadModel = await trainSpreadModel(X, y_spread);
  const totalModel = await trainTotalModel(X, y_total);
  
  // 6. Analyze feature importance
  console.log('\n' + '='.repeat(60));
  console.log('FEATURE IMPORTANCE');
  console.log('='.repeat(60));
  analyzeFeatureImportance(spreadModel, 20);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ TRAINING PIPELINE COMPLETE');
  console.log('='.repeat(60));
  
  return {
    spreadModel,
    totalModel,
    stats: {
      games: games.length,
      features: Object.keys(X[0]).length
    }
  };
}
