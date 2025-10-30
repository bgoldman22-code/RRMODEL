#!/usr/bin/env node

/**
 * NBA Player Props - Baseline Predictor (CORRECT Implementation)
 * 
 * Strategy: Recency-weighted average with contextual adjustments
 * - Use ONLY L5 average as base (most predictive)
 * - Adjust for: opponent strength, home/away, rest days
 * - NO model training - just smart averages
 * 
 * Why this works:
 * - Recent performance (L5) is most predictive
 * - Vegas uses similar logic
 * - Our edge comes from better opponent adjustments
 */

import fs from 'fs';
import path from 'path';

// Parse arguments
const args = process.argv.slice(2);
const dataPath = args[args.indexOf('--input') + 1];
const outputDir = args[args.indexOf('--output') + 1];

console.log('🏀 NBA Player Props - Baseline Predictor v2');
console.log('==========================================\n');
console.log('📊 Strategy: Recency-weighted averages + adjustments');
console.log('   - Base: L5 average (most recent)');
console.log('   - Adjustments: opponent, home/away, rest, trend\n');

// Load data
console.log('📂 Loading training data...');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`✅ Loaded ${data.length} player-game samples\n`);

// Walk-forward windows
const windows = [
  {
    name: 'Window 1 - Test Feb 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-01-31',
    testStart: '2025-02-01',
    testEnd: '2025-02-28'
  },
  {
    name: 'Window 2 - Test Mar 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-02-28',
    testStart: '2025-03-01',
    testEnd: '2025-03-31'
  },
  {
    name: 'Window 3 - Test Apr 2025',
    trainStart: '2024-10-22',
    trainEnd: '2025-03-31',
    testStart: '2025-04-01',
    testEnd: '2025-04-13'
  }
];

/**
 * Calculate baseline prediction using ONLY relevant features
 * 
 * Philosophy:
 * - L5 average is the BASE (most predictive)
 * - Adjustments should be MULTIPLICATIVE (not additive)
 * - Each adjustment is small (5-15% max)
 */
function predictStat(features, statType) {
  const f = features;
  
  // Base prediction: L5 average (most recent performance)
  let base;
  if (statType === 'points') {
    base = f.L5_ppg || f.L10_ppg || f.season_ppg || 10;
  } else if (statType === 'rebounds') {
    base = f.L5_rpg || f.L10_rpg || f.season_rpg || 5;
  } else if (statType === 'assists') {
    base = f.L5_apg || f.L10_apg || f.season_apg || 3;
  }
  
  // Start with base
  let prediction = base;
  
  // Adjustment 1: Trend (is player improving or declining?)
  // Compare L5 vs L10 - if L5 > L10, player is hot
  let trendAdjustment = 1.0;
  if (statType === 'points' && f.L5_ppg && f.L10_ppg) {
    const trend = (f.L5_ppg - f.L10_ppg) / f.L10_ppg;
    trendAdjustment = 1 + (trend * 0.3); // 30% weight on trend
  } else if (statType === 'rebounds' && f.L5_rpg && f.L10_rpg) {
    const trend = (f.L5_rpg - f.L10_rpg) / f.L10_rpg;
    trendAdjustment = 1 + (trend * 0.3);
  } else if (statType === 'assists' && f.L5_apg && f.L10_apg) {
    const trend = (f.L5_apg - f.L10_apg) / f.L10_apg;
    trendAdjustment = 1 + (trend * 0.3);
  }
  
  // Adjustment 2: Minutes trend (playing more = more stats)
  let minutesAdjustment = 1.0;
  if (f.L5_minutes && f.L10_minutes && f.L10_minutes > 0) {
    const minutesTrend = (f.L5_minutes - f.L10_minutes) / f.L10_minutes;
    minutesAdjustment = 1 + (minutesTrend * 0.5); // 50% weight - minutes matter!
  }
  
  // Adjustment 3: Home court advantage
  const homeAdjustment = f.home === 1 ? 1.05 : 0.98; // +5% home, -2% away
  
  // Adjustment 4: Rest (more rest = better performance)
  let restAdjustment = 1.0;
  if (f.rest_days !== null && f.rest_days !== undefined) {
    if (f.rest_days === 0) {
      restAdjustment = 0.95; // Back to back = -5%
    } else if (f.rest_days >= 3) {
      restAdjustment = 1.03; // Well rested = +3%
    }
  }
  
  // Adjustment 5: Opponent strength
  // For now, use a small adjustment (opponent defense rating)
  let oppAdjustment = 1.0;
  if (statType === 'points' && f.opp_ppg_allowed && f.opp_ppg_allowed > 0) {
    // League average is ~112 PPG
    // If opponent allows 120 PPG (bad defense) = 1.07x multiplier (+7%)
    // If opponent allows 105 PPG (good defense) = 0.94x multiplier (-6%)
    const oppRating = f.opp_ppg_allowed / 112;
    // Dampen the effect - only 30% weight
    oppAdjustment = 1 + ((oppRating - 1) * 0.3);
  }
  
  // Apply all adjustments (MULTIPLICATIVE)
  prediction = base * trendAdjustment * minutesAdjustment * homeAdjustment * restAdjustment * oppAdjustment;
  
  // Constrain to reasonable ranges
  if (statType === 'points') {
    prediction = Math.max(0, Math.min(60, prediction));
  } else if (statType === 'rebounds') {
    prediction = Math.max(0, Math.min(25, prediction));
  } else if (statType === 'assists') {
    prediction = Math.max(0, Math.min(20, prediction));
  }
  
  return {
    prediction,
    base,
    adjustments: {
      trend: trendAdjustment,
      minutes: minutesAdjustment,
      home: homeAdjustment,
      rest: restAdjustment,
      opponent: oppAdjustment
    }
  };
}

/**
 * Evaluate predictions on test set
 */
function evaluate(testData, statType) {
  let totalError = 0;
  let totalSquaredError = 0;
  let count = 0;
  
  const predictions = [];
  
  for (const sample of testData) {
    // Skip if missing required data
    if (!sample.features || sample.features.games_played_season < 5) continue;
    
    let actual;
    if (statType === 'points') {
      actual = sample.actual_points;
    } else if (statType === 'rebounds') {
      actual = sample.actual_rebounds;
    } else if (statType === 'assists') {
      actual = sample.actual_assists;
    }
    
    if (actual === null || actual === undefined) continue;
    
    const result = predictStat(sample.features, statType);
    const pred = result.prediction;
    
    const error = Math.abs(pred - actual);
    totalError += error;
    totalSquaredError += error * error;
    count++;
    
    predictions.push({
      player: sample.playerName,
      date: sample.gameDate,
      prediction: pred,
      actual,
      error,
      base: result.base,
      adjustments: result.adjustments
    });
  }
  
  const mae = count > 0 ? totalError / count : NaN;
  const rmse = count > 0 ? Math.sqrt(totalSquaredError / count) : NaN;
  
  // Calculate R² (coefficient of determination)
  const actualMean = predictions.reduce((sum, p) => sum + p.actual, 0) / count;
  const totalSS = predictions.reduce((sum, p) => sum + Math.pow(p.actual - actualMean, 2), 0);
  const residualSS = predictions.reduce((sum, p) => sum + Math.pow(p.actual - p.prediction, 2), 0);
  const r2 = count > 0 ? 1 - (residualSS / totalSS) : NaN;
  
  return {
    mae,
    rmse,
    r2,
    count,
    predictions: predictions.slice(0, 10) // Sample for review
  };
}

/**
 * Save "model" (really just the prediction logic)
 */
function saveModel(statType, windowName, testResults) {
  const model = {
    type: 'baseline_v2',
    statType,
    window: windowName,
    strategy: 'recency_weighted_with_adjustments',
    description: 'L5 average as base, multiplicative adjustments for trend/minutes/home/rest/opponent',
    testPerformance: {
      mae: testResults.mae,
      rmse: testResults.rmse,
      r2: testResults.r2,
      samples: testResults.count
    },
    samplePredictions: testResults.predictions
  };
  
  const modelPath = path.join(outputDir, `${statType}_${windowName.replace(/\s+/g, '_')}.json`);
  fs.writeFileSync(modelPath, JSON.stringify(model, null, 2));
  console.log(`  💾 Saved model to ${modelPath}`);
}

/**
 * Main training loop
 */
async function trainAllModels() {
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const allResults = {};
  
  for (const window of windows) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 ${window.name}`);
    console.log('='.repeat(60));
    
    // Filter data for this window
    const trainData = data.filter(d => d.gameDate >= window.trainStart && d.gameDate <= window.trainEnd);
    const testData = data.filter(d => d.gameDate >= window.testStart && d.gameDate <= window.testEnd);
    
    console.log(`\n📊 Data split:`);
    console.log(`  Training: ${trainData.length} samples (not used - using direct L5 avg)`);
    console.log(`  Testing: ${testData.length} samples`);
    
    const windowResults = {};
    
    // Evaluate on test set for each stat
    for (const statType of ['points', 'rebounds', 'assists']) {
      console.log(`\n🔮 Evaluating ${statType} predictions...`);
      
      const testResults = evaluate(testData, statType);
      
      console.log(`  📊 Test MAE: ${testResults.mae.toFixed(2)}`);
      console.log(`  📊 Test RMSE: ${testResults.rmse.toFixed(2)}`);
      console.log(`  📊 R²: ${testResults.r2.toFixed(3)}`);
      console.log(`  📊 Samples: ${testResults.count}`);
      
      // Show sample predictions
      if (testResults.predictions.length > 0) {
        console.log(`\n  🎯 Sample predictions:`);
        testResults.predictions.slice(0, 3).forEach(p => {
          console.log(`     ${p.player}: Pred=${p.prediction.toFixed(1)}, Actual=${p.actual}, Error=${p.error.toFixed(1)}`);
        });
      }
      
      saveModel(statType, window.name, testResults);
      windowResults[statType] = testResults;
    }
    
    allResults[window.name] = windowResults;
  }
  
  // Final summary
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('🎉 EVALUATION COMPLETE - ALL WINDOWS');
  console.log('='.repeat(60));
  
  for (const [windowName, results] of Object.entries(allResults)) {
    console.log(`\n${windowName}:`);
    console.log(`  Points:   MAE=${results.points.mae.toFixed(2)}, R²=${results.points.r2.toFixed(3)}`);
    console.log(`  Rebounds: MAE=${results.rebounds.mae.toFixed(2)}, R²=${results.rebounds.r2.toFixed(3)}`);
    console.log(`  Assists:  MAE=${results.assists.mae.toFixed(2)}, R²=${results.assists.r2.toFixed(3)}`);
  }
  
  console.log(`\n💾 All models saved to: ${outputDir}`);
  console.log('\n✅ Ready for backtesting!');
  
  return allResults;
}

// Run
trainAllModels().catch(console.error);
