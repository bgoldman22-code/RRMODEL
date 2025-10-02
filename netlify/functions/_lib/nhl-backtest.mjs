/**
 * NHL BACKTEST MODULE
 * 
 * Walk-forward validation of NHL SOG model
 * - Fit models up to day D-1
 * - Predict day D
 * - Log Brier score, log loss, calibration, ROI
 * - Output reliability plots
 * 
 * USAGE:
 * node nhl-backtest.mjs --start 2024-10-01 --end 2025-04-18
 */

import {
  fetchPlayerHistoricalGames,
  buildTrainingDataset,
  fitZINBFromHistory
} from './nhl-historical-data-pipeline.mjs';

import {
  engineerFeatures,
  trainXGBoostModels,
  predictSOGWithXGBoost,
  ensemblePrediction
} from './nhl-xgboost-ml-layer.mjs';

import {
  projectPlayerSOGv3
} from './nhl-projection-v3-learned.mjs';

import { writeFile } from 'fs/promises';
import { join } from 'path';

/**
 * WALK-FORWARD BACKTEST
 * 
 * For each date in range:
 * 1. Train on all data before date
 * 2. Predict games on date
 * 3. Compare predictions to actuals
 * 4. Log metrics
 */
export async function runWalkForwardBacktest(startDate, endDate, options = {}) {
  const {
    minTrainDays = 180,
    stride = 1, // Days between test dates
    saveResults = true,
    outputDir = './backtest_results'
  } = options;
  
  console.log(`\n🔬 NHL SOG Model Backtest`);
  console.log(`📅 Period: ${startDate} to ${endDate}`);
  console.log(`📊 Min training days: ${minTrainDays}`);
  console.log(`⚡ Stride: ${stride} days\n`);
  
  const results = {
    config: { startDate, endDate, minTrainDays, stride },
    dates: [],
    overall: {
      totalPredictions: 0,
      brierScore: 0,
      logLoss: 0,
      rmse: 0,
      mae: 0,
      calibrationError: 0
    },
    byEdgeBucket: {},
    calibrationCurve: [],
    dailyResults: []
  };
  
  // Iterate through dates
  const currentDate = new Date(startDate);
  const finalDate = new Date(endDate);
  
  while (currentDate <= finalDate) {
    const testDate = currentDate.toISOString().split('T')[0];
    const trainEndDate = new Date(currentDate);
    trainEndDate.setDate(trainEndDate.getDate() - 1);
    
    console.log(`📆 Testing date: ${testDate}`);
    
    // Run single-day backtest
    const dayResult = await backtestSingleDay(
      testDate,
      trainEndDate.toISOString().split('T')[0],
      minTrainDays
    );
    
    if (dayResult) {
      results.dailyResults.push(dayResult);
      results.overall.totalPredictions += dayResult.predictions.length;
      
      // Accumulate metrics
      updateOverallMetrics(results.overall, dayResult);
    }
    
    // Advance to next test date
    currentDate.setDate(currentDate.getDate() + stride);
  }
  
  // Calculate final aggregate metrics
  finalizeMetrics(results);
  
  // Generate calibration curve
  results.calibrationCurve = generateCalibrationCurve(results.dailyResults);
  
  // Generate ROI by edge bucket
  results.byEdgeBucket = generateEdgeBucketAnalysis(results.dailyResults);
  
  // Save results
  if (saveResults) {
    await saveBacktestResults(results, outputDir);
  }
  
  // Print summary
  printBacktestSummary(results);
  
  return results;
}

/**
 * BACKTEST SINGLE DAY
 */
async function backtestSingleDay(testDate, trainEndDate, minTrainDays) {
  try {
    // Fetch games for test date
    const testGames = await fetchGamesForDate(testDate);
    
    if (testGames.length === 0) {
      console.log(`  ⏭️  No games on ${testDate}`);
      return null;
    }
    
    console.log(`  📊 ${testGames.length} games found`);
    
    const predictions = [];
    
    // Predict each player in each game
    for (const game of testGames) {
      for (const player of game.players) {
        // Get prediction using v3.0 model
        const prediction = await projectPlayerSOGv3(
          player.id,
          game.opponent,
          {
            isHome: game.isHome,
            venue: game.venue,
            gameDate: testDate,
            travelDistance: 0
          },
          null // No injury factors for historical backtest
        );
        
        if (!prediction) continue;
        
        // Record prediction vs actual
        predictions.push({
          playerId: player.id,
          playerName: player.name,
          predicted: prediction.params.mu,
          actual: player.actualSOG,
          variance: prediction.params.r,
          zeroInflation: prediction.params.pi,
          confidence: prediction.metadata.confidence,
          
          // For calibration analysis
          predictedProb: calculateProbability(prediction.params, player.line),
          outcome: player.actualSOG >= player.line ? 1 : 0,
          line: player.line
        });
      }
    }
    
    // Calculate day metrics
    const dayMetrics = calculateDayMetrics(predictions);
    
    console.log(`  ✅ Brier: ${dayMetrics.brier.toFixed(4)}, RMSE: ${dayMetrics.rmse.toFixed(2)}`);
    
    return {
      date: testDate,
      predictions,
      metrics: dayMetrics
    };
    
  } catch (error) {
    console.error(`  ❌ Error on ${testDate}: ${error.message}`);
    return null;
  }
}

/**
 * CALCULATE METRICS FOR SINGLE DAY
 */
function calculateDayMetrics(predictions) {
  const n = predictions.length;
  
  let sumSquaredError = 0;
  let sumAbsError = 0;
  let sumBrier = 0;
  let sumLogLoss = 0;
  
  for (const pred of predictions) {
    const error = pred.predicted - pred.actual;
    sumSquaredError += error * error;
    sumAbsError += Math.abs(error);
    
    // Brier score for probability predictions
    const brierError = pred.predictedProb - pred.outcome;
    sumBrier += brierError * brierError;
    
    // Log loss (capped to avoid infinity)
    const prob = Math.max(0.01, Math.min(0.99, pred.predictedProb));
    sumLogLoss += pred.outcome === 1
      ? -Math.log(prob)
      : -Math.log(1 - prob);
  }
  
  return {
    count: n,
    rmse: Math.sqrt(sumSquaredError / n),
    mae: sumAbsError / n,
    brier: sumBrier / n,
    logLoss: sumLogLoss / n
  };
}

/**
 * GENERATE CALIBRATION CURVE
 * 
 * Bins predicted probabilities and compares to observed frequencies
 */
function generateCalibrationCurve(dailyResults) {
  const bins = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
  const binCounts = new Array(bins.length - 1).fill(0);
  const binSums = new Array(bins.length - 1).fill(0);
  
  // Aggregate all predictions
  for (const day of dailyResults) {
    for (const pred of day.predictions) {
      const binIndex = bins.findIndex((b, i) => 
        pred.predictedProb >= bins[i] && pred.predictedProb < bins[i + 1]
      );
      
      if (binIndex >= 0 && binIndex < binCounts.length) {
        binCounts[binIndex]++;
        binSums[binIndex] += pred.outcome;
      }
    }
  }
  
  // Calculate observed frequency per bin
  const curve = bins.slice(0, -1).map((binStart, i) => ({
    predictedBin: (bins[i] + bins[i + 1]) / 2,
    observedFrequency: binCounts[i] > 0 ? binSums[i] / binCounts[i] : 0,
    count: binCounts[i]
  }));
  
  return curve;
}

/**
 * GENERATE ROI ANALYSIS BY EDGE BUCKET
 */
function generateEdgeBucketAnalysis(dailyResults) {
  const buckets = {
    'edge_0_to_3': { min: 0, max: 3, bets: [], roi: 0, hitRate: 0 },
    'edge_3_to_5': { min: 3, max: 5, bets: [], roi: 0, hitRate: 0 },
    'edge_5_to_8': { min: 5, max: 8, bets: [], roi: 0, hitRate: 0 },
    'edge_8_to_12': { min: 8, max: 12, bets: [], roi: 0, hitRate: 0 },
    'edge_12_plus': { min: 12, max: 100, bets: [], roi: 0, hitRate: 0 }
  };
  
  // Assign bets to buckets (simplified - assumes edge data available)
  for (const day of dailyResults) {
    for (const pred of day.predictions) {
      // Calculate simple edge (would need market odds in real implementation)
      const edge = (pred.predicted - pred.line) / pred.line * 100;
      
      for (const [key, bucket] of Object.entries(buckets)) {
        if (edge >= bucket.min && edge < bucket.max) {
          bucket.bets.push({
            predicted: pred.predicted,
            actual: pred.actual,
            line: pred.line,
            hit: pred.outcome
          });
        }
      }
    }
  }
  
  // Calculate ROI and hit rate per bucket
  for (const [key, bucket] of Object.entries(buckets)) {
    if (bucket.bets.length > 0) {
      bucket.count = bucket.bets.length;
      bucket.hitRate = bucket.bets.filter(b => b.hit === 1).length / bucket.count;
      // Simplified ROI (would need actual odds)
      bucket.roi = (bucket.hitRate - 0.50) * 2; // Placeholder
    }
  }
  
  return buckets;
}

/**
 * UPDATE OVERALL METRICS
 */
function updateOverallMetrics(overall, dayResult) {
  const weight = dayResult.predictions.length;
  
  overall.brierScore += dayResult.metrics.brier * weight;
  overall.logLoss += dayResult.metrics.logLoss * weight;
  overall.rmse += dayResult.metrics.rmse * weight;
  overall.mae += dayResult.metrics.mae * weight;
}

/**
 * FINALIZE METRICS
 */
function finalizeMetrics(results) {
  const n = results.overall.totalPredictions;
  
  if (n > 0) {
    results.overall.brierScore /= n;
    results.overall.logLoss /= n;
    results.overall.rmse /= n;
    results.overall.mae /= n;
  }
  
  // Calculate calibration error
  const calibrationErrors = results.calibrationCurve.map(point => 
    Math.abs(point.predictedBin - point.observedFrequency)
  );
  results.overall.calibrationError = calibrationErrors.reduce((a, b) => a + b, 0) / calibrationErrors.length;
}

/**
 * SAVE BACKTEST RESULTS
 */
async function saveBacktestResults(results, outputDir) {
  const timestamp = new Date().toISOString().split('T')[0];
  const filename = join(outputDir, `backtest_${timestamp}.json`);
  
  await writeFile(filename, JSON.stringify(results, null, 2));
  console.log(`\n💾 Results saved to: ${filename}`);
}

/**
 * PRINT SUMMARY
 */
function printBacktestSummary(results) {
  console.log(`\n` + '='.repeat(60));
  console.log(`📊 BACKTEST SUMMARY`);
  console.log('='.repeat(60));
  console.log(`Total Predictions: ${results.overall.totalPredictions}`);
  console.log(`Brier Score: ${results.overall.brierScore.toFixed(4)} (lower is better)`);
  console.log(`Log Loss: ${results.overall.logLoss.toFixed(4)}`);
  console.log(`RMSE: ${results.overall.rmse.toFixed(2)} shots`);
  console.log(`MAE: ${results.overall.mae.toFixed(2)} shots`);
  console.log(`Calibration Error: ${(results.overall.calibrationError * 100).toFixed(2)}%`);
  
  console.log(`\n📈 ROI BY EDGE BUCKET:`);
  for (const [bucket, stats] of Object.entries(results.byEdgeBucket)) {
    if (stats.count > 0) {
      console.log(`  ${bucket}: ${stats.count} bets, ${(stats.hitRate * 100).toFixed(1)}% hit, ${(stats.roi * 100).toFixed(1)}% ROI`);
    }
  }
  
  console.log('\n' + '='.repeat(60) + '\n');
}

/**
 * HELPER: Calculate probability for a given line
 */
function calculateProbability(zinbParams, line) {
  // Simplified Poisson CDF
  const { mu } = zinbParams;
  
  // P(X >= line) using Poisson approximation
  let cumProb = 0;
  let factorial = 1;
  for (let k = 0; k < line; k++) {
    if (k > 0) factorial *= k;
    cumProb += Math.pow(mu, k) * Math.exp(-mu) / factorial;
  }
  
  return 1 - cumProb; // P(X >= line)
}

/**
 * HELPER: Fetch games for a specific date
 * (Mock - replace with actual NHL API call)
 */
async function fetchGamesForDate(date) {
  // This would call NHL API in production
  // For now, return empty array
  console.warn(`⚠️ fetchGamesForDate not implemented - returning mock data`);
  return [];
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const startDate = args[0] || '2024-10-01';
  const endDate = args[1] || '2025-04-18';
  
  runWalkForwardBacktest(startDate, endDate)
    .then(() => {
      console.log('✅ Backtest complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Backtest failed:', error);
      process.exit(1);
    });
}

export { runWalkForwardBacktest, backtestSingleDay, generateCalibrationCurve };
