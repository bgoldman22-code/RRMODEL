#!/usr/bin/env node

/**
 * NBA Model Training Script - XGBoost Only (Simplified)
 * 
 * Uses only XGBoost for initial training
 * NN and Bayesian models require full 83-feature set
 * 
 * Usage: node scripts/train-nba-xgboost.js
 */

import { loadHistoricalGames, buildTrainingDataset } from '../netlify/functions/_lib/nba/models/training.mjs';
import { validateFeatureBatch } from '../netlify/functions/_lib/nba/feature-validator.mjs';
import { saveArtifact } from '../netlify/functions/_lib/nba/artifact-manager.mjs';
import { IsotonicCalibrator, calculateBrierScore, calculateLogLoss } from '../netlify/functions/_lib/nba/calibration.mjs';
import { XGBoostModel } from '../netlify/functions/_lib/nba/models/ensemble.mjs';

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🏀  NBA ELITE MODEL TRAINING - XGBOOST ONLY                ║
║                                                               ║
║   Training XGBoost models on historical NBA data             ║
║   - Rolling OOS Cross-Validation                             ║
║   - Isotonic Calibration                                     ║
║   - Feature Validation                                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`);

const seasons = ['2022-23', '2023-24', '2024-25'];
console.log(`\n📅 Training on seasons: ${seasons.join(', ')}\n`);

try {
  // 1. Load data
  console.log('=' .repeat(70));
  console.log('LOADING HISTORICAL DATA');
  console.log('='.repeat(70));
  
  const games = await loadHistoricalGames(seasons);
  
  if (games.length === 0) {
    console.log('[Training] ⚠️  No historical data available');
    process.exit(1);
  }
  
  // 2. Build features
  const { X, y_spread, y_total, y_homeWin, rawGames } = await buildTrainingDataset(games);
  
  console.log(`\n[Training] Dataset Summary:`);
  console.log(`  Total Games: ${games.length}`);
  console.log(`  Features per Sample: ${Object.keys(X[0]).filter(k => k !== 'date').length}`);
  console.log(`  Date Range: ${rawGames[0]?.date} to ${rawGames[rawGames.length - 1]?.date}`);
  
  // 3. Simple train/test split (80/20)
  console.log('\n' + '='.repeat(70));
  console.log('TRAIN/TEST SPLIT');
  console.log('='.repeat(70));
  
  const splitIdx = Math.floor(X.length * 0.8);
  
  const X_train = X.slice(0, splitIdx);
  const y_train_spread = y_spread.slice(0, splitIdx);
  const y_train_total = y_total.slice(0, splitIdx);
  const y_train_win = y_homeWin.slice(0, splitIdx);
  
  const X_test = X.slice(splitIdx);
  const y_test_spread = y_spread.slice(splitIdx);
  const y_test_total = y_total.slice(splitIdx);
  const y_test_win = y_homeWin.slice(splitIdx);
  
  console.log(`  Training: ${X_train.length} games`);
  console.log(`  Testing: ${X_test.length} games`);
  
  // 4. Train spread model
  console.log('\n' + '='.repeat(70));
  console.log('TRAINING SPREAD MODEL (XGBoost)');
  console.log('='.repeat(70));
  
  const spreadModel = new XGBoostModel();
  await spreadModel.train(X_train, y_train_spread);
  
  // Evaluate
  const spreadPreds = spreadModel.predict(X_test);
  const spreadMAE = spreadPreds.reduce((sum, pred, i) => 
    sum + Math.abs(pred.prediction - y_test_spread[i]), 0
  ) / spreadPreds.length;
  
  console.log(`\n  Test MAE: ${spreadMAE.toFixed(2)} points`);
  
  // 5. Train total model
  console.log('\n' + '='.repeat(70));
  console.log('TRAINING TOTAL MODEL (XGBoost)');
  console.log('='.repeat(70));
  
  const totalModel = new XGBoostModel();
  await totalModel.train(X_train, y_train_total);
  
  // Evaluate
  const totalPreds = totalModel.predict(X_test);
  const totalMAE = totalPreds.reduce((sum, pred, i) => 
    sum + Math.abs(pred.prediction - y_test_total[i]), 0
  ) / totalPreds.length;
  
  console.log(`\n  Test MAE: ${totalMAE.toFixed(2)} points`);
  
  // 6. Train win probability calibrator
  console.log('\n' + '='.repeat(70));
  console.log('CALIBRATING WIN PROBABILITIES');
  console.log('='.repeat(70));
  
  // Convert spreads to win probabilities
  const trainWinProbs = spreadPreds.map(pred => 
    1 / (1 + Math.exp(-pred.prediction / 7))
  );
  
  const calibrator = new IsotonicCalibrator();
  calibrator.fit(trainWinProbs, y_test_win);
  
  const calibratedProbs = calibrator.transform(trainWinProbs);
  
  const rawBrier = calculateBrierScore(trainWinProbs, y_test_win);
  const calBrier = calculateBrierScore(calibratedProbs, y_test_win);
  const rawLogLoss = calculateLogLoss(trainWinProbs, y_test_win);
  const calLogLoss = calculateLogLoss(calibratedProbs, y_test_win);
  
  console.log(`\n  Raw Brier Score: ${rawBrier.toFixed(4)}`);
  console.log(`  Calibrated Brier: ${calBrier.toFixed(4)} (${((rawBrier - calBrier) / rawBrier * 100).toFixed(1)}% better)`);
  console.log(`  Raw Log Loss: ${rawLogLoss.toFixed(4)}`);
  console.log(`  Calibrated Log Loss: ${calLogLoss.toFixed(4)} (${((rawLogLoss - calLogLoss) / rawLogLoss * 100).toFixed(1)}% better)`);
  
  // 7. Save models
  console.log('\n' + '='.repeat(70));
  console.log('SAVING MODELS');
  console.log('='.repeat(70));
  
  const artifact = {
    modelType: 'xgboost',
    season: '2024-25',
    trainingConfig: {
      seasons,
      train_size: X_train.length,
      test_size: X_test.length,
      features: Object.keys(X[0]).filter(k => k !== 'date').length
    },
    performance: {
      spreadMAE,
      totalMAE,
      brier: calBrier,
      logLoss: calLogLoss
    },
    models: {
      spread: spreadModel.serialize(),
      total: totalModel.serialize()
    },
    calibrators: {
      spread: calibrator.toJSON()
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
    console.log(`\n✅ Artifact saved: ${saved.versionKey}`);
  } catch (error) {
    console.warn('\n⚠️  Could not save to Netlify Blobs:', error.message);
    console.log('Models trained successfully but not persisted to Blobs');
  }
  
  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('✅ TRAINING COMPLETE');
  console.log('='.repeat(70));
  console.log('\nPerformance Summary:');
  console.log(`  Spread MAE: ${spreadMAE.toFixed(2)} points`);
  console.log(`  Total MAE: ${totalMAE.toFixed(2)} points`);
  console.log(`  Win Prob Brier: ${calBrier.toFixed(4)} (calibrated)`);
  console.log(`  Win Prob Log Loss: ${calLogLoss.toFixed(4)} (calibrated)`);
  console.log('\n' + '='.repeat(70));
  console.log('\n🚀 Models ready for predictions!');
  console.log('   Run: netlify dev');
  console.log('   Then: http://localhost:8888/nba\n');
  
} catch (error) {
  console.error('\n❌ Training failed:', error);
  console.error(error.stack);
  process.exit(1);
}
