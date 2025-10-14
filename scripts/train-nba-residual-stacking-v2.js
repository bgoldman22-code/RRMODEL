#!/usr/bin/env node

/**
 * NBA Residual Stacking Training System
 * 
 * Architecture (GPT Recommended):
 * 1. Fundamental Model: Team stats only → predicts matchup outcome
 * 2. Residual Model: Learns (fundamental_pred - opening_line) bias
 * 3. Production: final_pred = fundamental - residual
 * 
 * Benefits:
 * - Cleaner separation of signals
 * - No multicollinearity from Vegas features
 * - Clear edge measurement vs market
 * 
 * Target: <10 MAE (from current 11.606)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// STEP 1: LOAD DATA
// ============================================================================

async function loadGameData() {
  const dataPath = path.join(__dirname, '../data/nba/games/games_2024_25.json');
  const games = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  
  console.log(`📊 Loaded ${games.length} games from 2024-25 season\n`);
  
  // Filter to games with final scores
  const completedGames = games.filter(g => 
    g.homeScore != null && 
    g.awayScore != null &&
    g.homeStats != null &&
    g.awayStats != null
  );
  
  console.log(`✅ ${completedGames.length} completed games with stats\n`);
  
  return completedGames;
}

// ============================================================================
// STEP 2: CALCULATE ADVANCED STATS
// ============================================================================

function calculateAdvancedStats(games, teamId, beforeIdx, window = 10) {
  // Get games before this one
  const relevantGames = games.slice(0, beforeIdx)
    .filter(g => 
      g.homeTeamId === teamId || g.awayTeamId === teamId ||
      g.homeTeam === teamId || g.awayTeam === teamId
    )
    .slice(-window);
  
  if (relevantGames.length === 0) {
    return null; // Not enough history
  }
  
  const stats = {
    pace: 0,
    offRtg: 0,
    defRtg: 0,
    efg: 0,
    ts: 0,
    tovPct: 0,
    orbPct: 0,
    ftFga: 0,
    ppg: 0,
    oppPpg: 0,
    wins: 0,
    games: 0
  };
  
  for (const game of relevantGames) {
    const isHome = game.homeTeamId === teamId || game.homeTeam === teamId;
    const teamStats = isHome ? game.homeStats : game.awayStats;
    const oppStats = isHome ? game.awayStats : game.homeStats;
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const oppScore = isHome ? game.awayScore : game.homeScore;
    
    if (!teamStats || !oppStats) continue;
    
    // Possessions
    const teamPoss = teamStats.fga + 0.44 * teamStats.fta - teamStats.offRebounds + teamStats.turnovers;
    const oppPoss = oppStats.fga + 0.44 * oppStats.fta - oppStats.offRebounds + oppStats.turnovers;
    const possessions = (teamPoss + oppPoss) / 2;
    
    const pace = possessions > 0 ? (possessions / 48) * 48 : 100;
    const offRtg = possessions > 0 ? (teamScore / possessions) * 100 : 114.5;
    const defRtg = possessions > 0 ? (oppScore / possessions) * 100 : 114.5;
    
    const efg = teamStats.fga > 0 ? (teamStats.fgm + 0.5 * teamStats.fg3m) / teamStats.fga : 0.535;
    const tsa = teamStats.fga + 0.44 * teamStats.fta;
    const ts = tsa > 0 ? teamScore / (2 * tsa) : 0.575;
    
    const tovPct = possessions > 0 ? teamStats.turnovers / possessions : 0.138;
    const totalRebs = teamStats.offRebounds + oppStats.defRebounds;
    const orbPct = totalRebs > 0 ? teamStats.offRebounds / totalRebs : 0.25;
    const ftFga = teamStats.fga > 0 ? teamStats.fta / teamStats.fga : 0.22;
    
    stats.pace += pace;
    stats.offRtg += offRtg;
    stats.defRtg += defRtg;
    stats.efg += efg;
    stats.ts += ts;
    stats.tovPct += tovPct;
    stats.orbPct += orbPct;
    stats.ftFga += ftFga;
    stats.ppg += teamScore;
    stats.oppPpg += oppScore;
    
    if (teamScore > oppScore) stats.wins++;
    stats.games++;
  }
  
  // Average
  if (stats.games > 0) {
    stats.pace /= stats.games;
    stats.offRtg /= stats.games;
    stats.defRtg /= stats.games;
    stats.efg /= stats.games;
    stats.ts /= stats.games;
    stats.tovPct /= stats.games;
    stats.orbPct /= stats.games;
    stats.ftFga /= stats.games;
    stats.ppg /= stats.games;
    stats.oppPpg /= stats.games;
  }
  
  stats.netRtg = stats.offRtg - stats.defRtg;
  stats.winPct = stats.games > 0 ? stats.wins / stats.games : 0.50;
  
  return stats;
}

function buildFeatures(homeStats, awayStats) {
  // 55 elite features (same as elite model)
  const features = {};
  
  // Core stats
  features.h10_pace = homeStats.pace;
  features.h10_offRtg = homeStats.offRtg;
  features.h10_defRtg = homeStats.defRtg;
  features.h10_netRtg = homeStats.netRtg;
  features.h10_efg = homeStats.efg;
  features.h10_ts = homeStats.ts;
  features.h10_tovPct = homeStats.tovPct;
  features.h10_orbPct = homeStats.orbPct;
  features.h10_ftFga = homeStats.ftFga;
  features.h10_winPct = homeStats.winPct;
  
  features.a10_pace = awayStats.pace;
  features.a10_offRtg = awayStats.offRtg;
  features.a10_defRtg = awayStats.defRtg;
  features.a10_netRtg = awayStats.netRtg;
  features.a10_efg = awayStats.efg;
  features.a10_ts = awayStats.ts;
  features.a10_tovPct = awayStats.tovPct;
  features.a10_orbPct = awayStats.orbPct;
  features.a10_ftFga = awayStats.ftFga;
  features.a10_winPct = awayStats.winPct;
  
  // Interactions
  features.netRtg_diff = homeStats.netRtg - awayStats.netRtg;
  features.offRtg_diff = homeStats.offRtg - awayStats.offRtg;
  features.defRtg_diff = homeStats.defRtg - awayStats.defRtg;
  features.pace_diff = homeStats.pace - awayStats.pace;
  features.winPct_diff = homeStats.winPct - awayStats.winPct;
  
  features.netRtg_product = homeStats.netRtg * awayStats.netRtg;
  features.pace_product = homeStats.pace * awayStats.pace;
  features.efg_product = homeStats.efg * awayStats.efg;
  
  features.offense_vs_defense = homeStats.offRtg * awayStats.defRtg;
  features.defense_vs_offense = homeStats.defRtg * awayStats.offRtg;
  
  features.pace_netRtg_home = homeStats.pace * homeStats.netRtg;
  features.pace_netRtg_away = awayStats.pace * awayStats.netRtg;
  
  features.ts_diff = homeStats.ts - awayStats.ts;
  features.tovPct_diff = homeStats.tovPct - awayStats.tovPct;
  features.orbPct_diff = homeStats.orbPct - awayStats.orbPct;
  
  features.efg_diff = homeStats.efg - awayStats.efg;
  features.ftFga_diff = homeStats.ftFga - awayStats.ftFga;
  
  features.momentum_home = homeStats.winPct * homeStats.netRtg;
  features.momentum_away = awayStats.winPct * awayStats.netRtg;
  features.momentum_diff = features.momentum_home - features.momentum_away;
  
  features.rating_consistency = Math.abs(homeStats.offRtg - homeStats.defRtg) - 
                               Math.abs(awayStats.offRtg - awayStats.defRtg);
  
  features.shooting_edge = (homeStats.efg + homeStats.ts) - (awayStats.efg + awayStats.ts);
  features.rebound_edge = homeStats.orbPct - awayStats.orbPct;
  features.turnover_battle = awayStats.tovPct - homeStats.tovPct;
  
  features.home_court = 1;
  
  return features;
}

// ============================================================================
// STEP 3: BUILD TRAINING DATA
// ============================================================================

async function buildTrainingData(games) {
  const samples = [];
  
  console.log('🔨 Building training samples...\n');
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    
    // Need at least 10 games history for both teams
    if (i < 20) continue;
    
    const homeId = game.homeTeamId || game.homeTeam;
    const awayId = game.awayTeamId || game.awayTeam;
    
    const homeStats = calculateAdvancedStats(games, homeId, i, 10);
    const awayStats = calculateAdvancedStats(games, awayId, i, 10);
    
    if (!homeStats || !awayStats) continue;
    if (homeStats.games < 5 || awayStats.games < 5) continue;
    
    const features = buildFeatures(homeStats, awayStats);
    
    // Target: actual spread (home score - away score)
    const actualSpread = game.homeScore - game.awayScore;
    
    // We'll add Vegas lines later (for residual model)
    samples.push({
      gameId: game.gameId || `${i}`,
      date: game.gameDate || game.date,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      features,
      actualSpread,
      homeStats,
      awayStats
    });
    
    if (samples.length % 100 === 0) {
      process.stdout.write(`\r  Processed ${samples.length} games...`);
    }
  }
  
  console.log(`\r✅ Built ${samples.length} training samples\n`);
  
  return samples;
}

// ============================================================================
// STEP 4: LINEAR REGRESSION
// ============================================================================

function normalize(X) {
  const n = X.length;
  const m = X[0].length;
  
  const means = new Array(m).fill(0);
  const stds = new Array(m).fill(0);
  
  // Calculate means
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      means[j] += X[i][j];
    }
    means[j] /= n;
  }
  
  // Calculate stds
  for (let j = 0; j < m; j++) {
    for (let i = 0; i < n; i++) {
      stds[j] += Math.pow(X[i][j] - means[j], 2);
    }
    stds[j] = Math.sqrt(stds[j] / n);
    if (stds[j] === 0) stds[j] = 1; // Prevent division by zero
  }
  
  // Normalize
  const X_norm = X.map(row => 
    row.map((val, j) => (val - means[j]) / stds[j])
  );
  
  return { X_norm, means, stds };
}

function trainLinearRegression(X, y, learningRate = 0.01, epochs = 1000, lambda = 0.1) {
  const n = X.length;
  const m = X[0].length;
  
  // Normalize features
  const { X_norm, means, stds } = normalize(X);
  
  // Initialize weights
  let weights = new Array(m).fill(0);
  let bias = 0;
  
  // Gradient descent with L2 regularization
  for (let epoch = 0; epoch < epochs; epoch++) {
    let predictions = X_norm.map((row, i) => {
      let pred = bias;
      for (let j = 0; j < m; j++) {
        pred += weights[j] * row[j];
      }
      return pred;
    });
    
    // Calculate gradients
    let dWeights = new Array(m).fill(0);
    let dBias = 0;
    
    for (let i = 0; i < n; i++) {
      const error = predictions[i] - y[i];
      dBias += error;
      for (let j = 0; j < m; j++) {
        dWeights[j] += error * X_norm[i][j];
      }
    }
    
    // Update with L2 regularization
    bias -= (learningRate / n) * dBias;
    for (let j = 0; j < m; j++) {
      dWeights[j] = dWeights[j] / n + lambda * weights[j];
      weights[j] -= learningRate * dWeights[j];
    }
    
    // Log progress
    if (epoch % 200 === 0) {
      const mae = predictions.reduce((sum, pred, i) => 
        sum + Math.abs(pred - y[i]), 0) / n;
      process.stdout.write(`\r  Epoch ${epoch}/${epochs} - MAE: ${mae.toFixed(3)}`);
    }
  }
  
  console.log(''); // New line
  
  return { weights, bias, means, stds };
}

function predict(model, X) {
  const { weights, bias, means, stds } = model;
  
  return X.map(row => {
    // Normalize
    const normalized = row.map((val, j) => (val - means[j]) / stds[j]);
    
    // Predict
    let pred = bias;
    for (let j = 0; j < row.length; j++) {
      pred += weights[j] * normalized[j];
    }
    return pred;
  });
}

function calculateMAE(predictions, actuals) {
  return predictions.reduce((sum, pred, i) => 
    sum + Math.abs(pred - actuals[i]), 0) / predictions.length;
}

// ============================================================================
// STEP 5: RESIDUAL STACKING TRAINING
// ============================================================================

async function trainResidualStacking(samples) {
  console.log('🎯 PHASE 1: Train Fundamental Model (Team Stats Only)\n');
  console.log('=' .repeat(60) + '\n');
  
  // Split data
  const trainSize = Math.floor(samples.length * 0.7);
  const valSize = Math.floor(samples.length * 0.15);
  
  const trainSamples = samples.slice(0, trainSize);
  const valSamples = samples.slice(trainSize, trainSize + valSize);
  const testSamples = samples.slice(trainSize + valSize);
  
  console.log(`📊 Data Split:`);
  console.log(`   Train: ${trainSamples.length} games`);
  console.log(`   Val:   ${valSamples.length} games`);
  console.log(`   Test:  ${testSamples.length} games\n`);
  
  // Extract features and targets
  const featureNames = Object.keys(trainSamples[0].features);
  
  const X_train = trainSamples.map(s => featureNames.map(f => s.features[f]));
  const y_train = trainSamples.map(s => s.actualSpread);
  
  const X_val = valSamples.map(s => featureNames.map(f => s.features[f]));
  const y_val = valSamples.map(s => s.actualSpread);
  
  const X_test = testSamples.map(s => featureNames.map(f => s.features[f]));
  const y_test = testSamples.map(s => s.actualSpread);
  
  // Train fundamental model
  console.log('🔥 Training Fundamental Model...\n');
  const fundamentalModel = trainLinearRegression(X_train, y_train, 0.01, 1000, 0.1);
  
  // Evaluate fundamental model
  const train_preds = predict(fundamentalModel, X_train);
  const val_preds = predict(fundamentalModel, X_val);
  const test_preds = predict(fundamentalModel, X_test);
  
  const train_mae = calculateMAE(train_preds, y_train);
  const val_mae = calculateMAE(val_preds, y_val);
  const test_mae = calculateMAE(test_preds, y_test);
  
  console.log(`\n📈 Fundamental Model Performance:`);
  console.log(`   Train MAE: ${train_mae.toFixed(3)}`);
  console.log(`   Val MAE:   ${val_mae.toFixed(3)}`);
  console.log(`   Test MAE:  ${test_mae.toFixed(3)}\n`);
  
  // Build feature -> weight map
  const featureWeights = {};
  featureNames.forEach((name, i) => {
    featureWeights[name] = fundamentalModel.weights[i];
  });
  
  const fundamentalModelExport = {
    weights: featureWeights,
    bias: fundamentalModel.bias,
    means: Object.fromEntries(featureNames.map((name, i) => [name, fundamentalModel.means[i]])),
    stds: Object.fromEntries(featureNames.map((name, i) => [name, fundamentalModel.stds[i]])),
    mae: test_mae,
    samples: trainSamples.length
  };
  
  // Save fundamental model
  const modelsDir = path.join(__dirname, '../models/nba');
  await fs.mkdir(modelsDir, { recursive: true });
  await fs.writeFile(
    path.join(modelsDir, 'fundamental-model.json'),
    JSON.stringify(fundamentalModelExport, null, 2)
  );
  
  console.log(`✅ Saved fundamental model to models/nba/fundamental-model.json\n`);
  
  // TODO: Phase 2 - Train residual model (needs Vegas lines)
  console.log('⏭️  PHASE 2: Residual Model (requires Vegas lines data)\n');
  console.log('   Next step: Collect opening lines and train residual model\n');
  
  return {
    fundamentalModel: fundamentalModelExport,
    testMAE: test_mae
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  NBA RESIDUAL STACKING TRAINING');
  console.log('  Target: <10 MAE (from 11.606)');
  console.log('='.repeat(60) + '\n');
  
  try {
    // Load data
    const games = await loadGameData();
    
    // Build training samples
    const samples = await buildTrainingData(games);
    
    // Train residual stacking
    const result = await trainResidualStacking(samples);
    
    console.log('='.repeat(60));
    console.log('✅ TRAINING COMPLETE');
    console.log('='.repeat(60));
    console.log(`\n📊 Fundamental Model MAE: ${result.testMAE.toFixed(3)}`);
    console.log(`🎯 Target with Residual: <10.0 MAE\n`);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
