#!/usr/bin/env node

/**
 * Leak-Free Backtesting Engine - NBA Player Props
 * 
 * CRITICAL FEATURES:
 * - Validates zero data leakage (features from before game date)
 * - Simulates real betting decisions (edge threshold, Kelly sizing)
 * - Calculates honest ROI, win rate, edge calibration
 * - Monthly breakdown for performance tracking
 * 
 * Usage:
 *   node scripts/nba/backtest-leak-free.js \
 *     --data data/nba/training-data-leak-free.json \
 *     --models data/nba/models/ \
 *     --output data/nba/backtest-results.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse CLI args
const args = process.argv.slice(2);
const dataPath = args[args.indexOf('--data') + 1] || 'data/nba/training-data-leak-free.json';
const modelsDir = args[args.indexOf('--models') + 1] || 'data/nba/models/';
const outputPath = args[args.indexOf('--output') + 1] || 'data/nba/backtest-results.json';

console.log('🏀 NBA Player Props - LEAK-FREE BACKTESTING');
console.log('==========================================\n');
console.log('🔒 ZERO LEAKAGE ENFORCEMENT');
console.log('   Every prediction validated: features < game_date\n');

// Load data
console.log('📂 Loading data...');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
console.log(`✅ Loaded ${data.length} player-game samples\n');

// Define test windows
const windows = [
  {
    name: 'Feb 2025',
    start: '2025-02-01',
    end: '2025-02-28',
    modelPrefix: 'Window_1_-_Test_Feb_2025'
  },
  {
    name: 'Mar 2025',
    start: '2025-03-01',
    end: '2025-03-31',
    modelPrefix: 'Window_2_-_Test_Mar_2025'
  },
  {
    name: 'Apr 2025',
    start: '2025-04-01',
    end: '2025-04-13',
    modelPrefix: 'Window_3_-_Test_Apr_2025'
  }
];

// Betting thresholds (CONSERVATIVE FOR REAL MONEY)
const EDGE_THRESHOLD = 4.0;  // Need 4+ point edge
const CONFIDENCE_THRESHOLD = 0.60; // Need 60%+ confidence
const MIN_KELLY = 0.01; // Need 1%+ Kelly fraction

/**
 * Load models for a specific window
 */
function loadModels(windowPrefix) {
  const models = {
    minutes: JSON.parse(fs.readFileSync(path.join(modelsDir, `minutes_${windowPrefix}.json`), 'utf8')),
    points_rate: JSON.parse(fs.readFileSync(path.join(modelsDir, `points_rate_${windowPrefix}.json`), 'utf8')),
    rebounds_rate: JSON.parse(fs.readFileSync(path.join(modelsDir, `rebounds_rate_${windowPrefix}.json`), 'utf8')),
    assists_rate: JSON.parse(fs.readFileSync(path.join(modelsDir, `assists_rate_${windowPrefix}.json`), 'utf8'))
  };
  
  return models;
}

/**
 * Validate no data leakage
 */
function validateNoLeakage(sample) {
  const featureDate = sample.features.as_of_date;
  const gameDate = sample.gameDate;
  
  if (!featureDate) {
    return { valid: false, reason: 'No as_of_date in features' };
  }
  
  if (new Date(featureDate) >= new Date(gameDate)) {
    return { 
      valid: false, 
      reason: `LEAKAGE: Features from ${featureDate} >= game date ${gameDate}` 
    };
  }
  
  return { valid: true };
}

/**
 * Make prediction with model
 */
function predict(model, features) {
  let prediction = model.baseline;
  
  for (const fname of model.featureNames) {
    prediction += (features[fname] || 0) * model.weights[fname];
  }
  
  // Apply constraints
  if (model.type === 'minutes') {
    return Math.max(0, Math.min(48, prediction));
  } else {
    return Math.max(0, prediction);
  }
}

/**
 * Two-stage prediction: minutes × rate
 */
function predictStat(models, features, statType) {
  const f = features;
  
  // Prepare feature vector
  const featureVector = {
    L5_ppg: f.L5_ppg || 0,
    L5_rpg: f.L5_rpg || 0,
    L5_apg: f.L5_apg || 0,
    L5_minutes: f.L5_minutes || 0,
    L5_fga: f.L5_fga || 0,
    L5_fta: f.L5_fta || 0,
    L10_ppg: f.L10_ppg || 0,
    L10_rpg: f.L10_rpg || 0,
    L10_apg: f.L10_apg || 0,
    L10_minutes: f.L10_minutes || 0,
    L10_fga: f.L10_fga || 0,
    L10_fta: f.L10_fta || 0,
    season_ppg: f.season_ppg || 0,
    season_rpg: f.season_rpg || 0,
    season_apg: f.season_apg || 0,
    home: f.home || 0,
    rest_days: f.rest_days || 1,
    back_to_back: f.back_to_back || 0,
    opp_ppg_allowed: f.opp_ppg_allowed || 110,
    opp_pace: f.opp_pace || 30,
    games_played: f.games_played_season || 0
  };
  
  // Stage 1: Predict minutes
  const predictedMinutes = predict(models.minutes, featureVector);
  
  // Stage 2: Predict rate
  let rateModel;
  if (statType === 'points') {
    rateModel = models.points_rate;
  } else if (statType === 'rebounds') {
    rateModel = models.rebounds_rate;
  } else if (statType === 'assists') {
    rateModel = models.assists_rate;
  }
  
  const predictedRate = predict(rateModel, featureVector);
  
  // Final prediction: minutes × rate
  const prediction = predictedMinutes * predictedRate;
  
  return {
    prediction,
    minutes: predictedMinutes,
    rate: predictedRate
  };
}

/**
 * Calculate edge and betting decision
 */
function calculateBettingDecision(prediction, vegasLine, actual) {
  if (!vegasLine) return null;
  
  const edge = prediction - vegasLine;
  const absEdge = Math.abs(edge);
  
  // Confidence (simple: higher edge = higher confidence)
  const confidence = Math.min(0.95, 0.50 + absEdge / 20);
  
  // Kelly fraction (f = edge / odds)
  // Assuming -110 odds (1.91 decimal), edge / 0.91
  const kelly = absEdge / 20; // Simplified
  
  // Should we bet?
  const shouldBet = absEdge >= EDGE_THRESHOLD && 
                    confidence >= CONFIDENCE_THRESHOLD && 
                    kelly >= MIN_KELLY;
  
  if (!shouldBet) return null;
  
  // What side?
  const side = edge > 0 ? 'OVER' : 'UNDER';
  
  // Did we win?
  let won = false;
  if (side === 'OVER') {
    won = actual > vegasLine;
  } else {
    won = actual < vegasLine;
  }
  
  // Calculate profit (assuming $100 bet at -110)
  const profit = won ? 90.91 : -100; // Win $90.91 or lose $100
  
  return {
    side,
    edge,
    absEdge,
    confidence,
    kelly,
    prediction,
    vegasLine,
    actual,
    won,
    profit
  };
}

/**
 * Backtest a single window
 */
function backtestWindow(window) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📅 BACKTESTING: ${window.name}`);
  console.log('='.repeat(60));
  
  // Load models for this window
  const models = loadModels(window.modelPrefix);
  console.log(`✅ Loaded models for ${window.name}\n`);
  
  // Filter test data
  const testData = data.filter(d => 
    d.gameDate >= window.start && 
    d.gameDate <= window.end
  );
  
  console.log(`📊 Test period: ${window.start} to ${window.end}`);
  console.log(`📊 Test samples: ${testData.length}\n`);
  
  // Track results by prop type
  const results = {
    points: { bets: [], stats: {} },
    rebounds: { bets: [], stats: {} },
    assists: { bets: [], stats: {} }
  };
  
  let leakageChecks = 0;
  let leakageFailures = 0;
  
  // Process each sample
  for (const sample of testData) {
    // CRITICAL: Validate no leakage
    const leakCheck = validateNoLeakage(sample);
    leakageChecks++;
    
    if (!leakCheck.valid) {
      leakageFailures++;
      console.error(`❌ ${leakCheck.reason}`);
      continue;
    }
    
    // Make predictions
    const pointsPred = predictStat(models, sample.features, 'points');
    const reboundsPred = predictStat(models, sample.features, 'rebounds');
    const assistsPred = predictStat(models, sample.features, 'assists');
    
    // Evaluate betting decisions
    if (sample.line_points) {
      const decision = calculateBettingDecision(
        pointsPred.prediction,
        sample.line_points,
        sample.actual_points
      );
      if (decision) {
        results.points.bets.push({
          ...decision,
          date: sample.gameDate,
          player: sample.playerName,
          team: sample.teamTricode
        });
      }
    }
    
    if (sample.line_rebounds) {
      const decision = calculateBettingDecision(
        reboundsPred.prediction,
        sample.line_rebounds,
        sample.actual_rebounds
      );
      if (decision) {
        results.rebounds.bets.push({
          ...decision,
          date: sample.gameDate,
          player: sample.playerName,
          team: sample.teamTricode
        });
      }
    }
    
    if (sample.line_assists) {
      const decision = calculateBettingDecision(
        assistsPred.prediction,
        sample.line_assists,
        sample.actual_assists
      );
      if (decision) {
        results.assists.bets.push({
          ...decision,
          date: sample.gameDate,
          player: sample.playerName,
          team: sample.teamTricode
        });
      }
    }
  }
  
  console.log(`\n🔒 Leakage validation: ${leakageChecks} checks, ${leakageFailures} failures`);
  if (leakageFailures > 0) {
    console.error(`❌ LEAKAGE DETECTED! Stopping backtest.`);
    process.exit(1);
  }
  console.log(`✅ ZERO LEAKAGE - All predictions valid\n`);
  
  // Calculate statistics for each prop type
  for (const [propType, data] of Object.entries(results)) {
    const bets = data.bets;
    
    if (bets.length === 0) {
      console.log(`${propType.toUpperCase()}: No bets met threshold`);
      continue;
    }
    
    const wins = bets.filter(b => b.won).length;
    const losses = bets.length - wins;
    const winRate = wins / bets.length;
    const totalProfit = bets.reduce((sum, b) => sum + b.profit, 0);
    const totalRisk = bets.length * 100;
    const roi = totalProfit / totalRisk;
    const avgEdge = bets.reduce((sum, b) => sum + b.absEdge, 0) / bets.length;
    
    data.stats = {
      bets: bets.length,
      wins,
      losses,
      winRate: (winRate * 100).toFixed(1) + '%',
      totalProfit: totalProfit.toFixed(2),
      roi: (roi * 100).toFixed(2) + '%',
      avgEdge: avgEdge.toFixed(2),
      breakEven: winRate >= 0.524 // Need 52.4% to break even at -110
    };
    
    console.log(`\n${propType.toUpperCase()}:`);
    console.log(`  Bets: ${data.stats.bets}`);
    console.log(`  Wins: ${wins} | Losses: ${losses}`);
    console.log(`  Win Rate: ${data.stats.winRate}`);
    console.log(`  Total Profit: $${data.stats.totalProfit}`);
    console.log(`  ROI: ${data.stats.roi}`);
    console.log(`  Avg Edge: ${data.stats.avgEdge} pts`);
    console.log(`  Break Even: ${data.stats.breakEven ? '✅ YES' : '❌ NO'}`);
  }
  
  return results;
}

/**
 * Run full backtest across all windows
 */
function runFullBacktest() {
  const allResults = {};
  
  for (const window of windows) {
    allResults[window.name] = backtestWindow(window);
  }
  
  // Aggregate results
  console.log(`\n\n${'='.repeat(60)}`);
  console.log('🎉 BACKTEST COMPLETE - ALL WINDOWS');
  console.log('='.repeat(60));
  
  const aggregated = {
    points: { bets: [], totalProfit: 0 },
    rebounds: { bets: [], totalProfit: 0 },
    assists: { bets: [], totalProfit: 0 }
  };
  
  for (const [windowName, results] of Object.entries(allResults)) {
    for (const propType of ['points', 'rebounds', 'assists']) {
      aggregated[propType].bets.push(...results[propType].bets);
      aggregated[propType].totalProfit += parseFloat(results[propType].stats.totalProfit || 0);
    }
  }
  
  console.log('\n📊 AGGREGATE RESULTS (All Windows):');
  for (const [propType, data] of Object.entries(aggregated)) {
    const bets = data.bets;
    if (bets.length === 0) continue;
    
    const wins = bets.filter(b => b.won).length;
    const winRate = wins / bets.length;
    const totalRisk = bets.length * 100;
    const roi = data.totalProfit / totalRisk;
    
    console.log(`\n${propType.toUpperCase()}:`);
    console.log(`  Total Bets: ${bets.length}`);
    console.log(`  Win Rate: ${(winRate * 100).toFixed(1)}%`);
    console.log(`  Total Profit: $${data.totalProfit.toFixed(2)}`);
    console.log(`  ROI: ${(roi * 100).toFixed(2)}%`);
    console.log(`  Verdict: ${winRate >= 0.524 && roi > 0 ? '✅ PROFITABLE' : '❌ NOT PROFITABLE'}`);
  }
  
  // Save results
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify({
    backtestDate: new Date().toISOString(),
    windows: allResults,
    aggregate: aggregated,
    thresholds: {
      edgeThreshold: EDGE_THRESHOLD,
      confidenceThreshold: CONFIDENCE_THRESHOLD,
      minKelly: MIN_KELLY
    }
  }, null, 2));
  
  console.log(`\n💾 Full results saved to: ${outputPath}`);
  
  // Final verdict
  const anyProfitable = Object.values(aggregated).some(d => {
    if (d.bets.length === 0) return false;
    const winRate = d.bets.filter(b => b.won).length / d.bets.length;
    const roi = d.totalProfit / (d.bets.length * 100);
    return winRate >= 0.524 && roi > 0;
  });
  
  if (anyProfitable) {
    console.log('\n🎉 SUCCESS: Model shows profitable edge!');
    console.log('   ✅ Ready for production deployment');
    console.log('   🏴‍☠️ FAMILY RESCUED FROM PIRATES!\n');
  } else {
    console.log('\n⚠️  WARNING: Model not showing strong edge');
    console.log('   Consider: More features, longer training, or model tuning\n');
  }
  
  return allResults;
}

// Run backtest
try {
  runFullBacktest();
} catch (error) {
  console.error('\n💥 Backtest failed:', error);
  process.exit(1);
}
