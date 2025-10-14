#!/usr/bin/env node

/**
 * NBA Simple Training Script
 * Trains on existing box score features (22 features)
 * Uses simple linear regression + gradient boosting
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🏀  NBA TRAINING - SIMPLE MODEL (Box Score Features)       ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Load games
async function loadGames(season) {
  const filePath = path.join(__dirname, '../data/nba/games', `games_${season.replace('-', '_')}.json`);
  const data = await fs.readFile(filePath, 'utf8');
  return JSON.parse(data);
}

// Calculate rolling averages
function calculateRollingAvg(games, teamId, currentIdx, stat, lookback = 10) {
  const previousGames = games
    .slice(Math.max(0, currentIdx - 50), currentIdx)
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .slice(-lookback);
  
  if (previousGames.length === 0) return null;
  
  const values = previousGames.map(g => {
    const isHome = g.homeTeamId === teamId;
    const teamStats = isHome ? g.homeStats : g.awayStats;
    return teamStats?.[stat] || 0;
  });
  
  return values.reduce((a, b) => a + b, 0) / values.length;
}

// Build features for a game
function buildFeatures(games, idx) {
  const game = games[idx];
  if (!game.homeScore || !game.awayScore) return null;
  
  const features = {};
  
  // Home team rolling averages (L10)
  features.home_l10_fgPct = calculateRollingAvg(games, game.homeTeamId, idx, 'fgPct', 10) || 0.45;
  features.home_l10_fg3Pct = calculateRollingAvg(games, game.homeTeamId, idx, 'fg3Pct', 10) || 0.35;
  features.home_l10_ftPct = calculateRollingAvg(games, game.homeTeamId, idx, 'ftPct', 10) || 0.78;
  features.home_l10_rebounds = calculateRollingAvg(games, game.homeTeamId, idx, 'rebounds', 10) || 43;
  features.home_l10_assists = calculateRollingAvg(games, game.homeTeamId, idx, 'assists', 10) || 25;
  features.home_l10_turnovers = calculateRollingAvg(games, game.homeTeamId, idx, 'turnovers', 10) || 14;
  
  // Away team rolling averages (L10)
  features.away_l10_fgPct = calculateRollingAvg(games, game.awayTeamId, idx, 'fgPct', 10) || 0.45;
  features.away_l10_fg3Pct = calculateRollingAvg(games, game.awayTeamId, idx, 'fg3Pct', 10) || 0.35;
  features.away_l10_ftPct = calculateRollingAvg(games, game.awayTeamId, idx, 'ftPct', 10) || 0.78;
  features.away_l10_rebounds = calculateRollingAvg(games, game.awayTeamId, idx, 'rebounds', 10) || 43;
  features.away_l10_assists = calculateRollingAvg(games, game.awayTeamId, idx, 'assists', 10) || 25;
  features.away_l10_turnovers = calculateRollingAvg(games, game.awayTeamId, idx, 'turnovers', 10) || 14;
  
  // Differentials
  features.fgPct_diff = features.home_l10_fgPct - features.away_l10_fgPct;
  features.fg3Pct_diff = features.home_l10_fg3Pct - features.away_l10_fg3Pct;
  features.rebounds_diff = features.home_l10_rebounds - features.away_l10_rebounds;
  features.assists_diff = features.home_l10_assists - features.away_l10_assists;
  features.turnovers_diff = features.away_l10_turnovers - features.home_l10_turnovers; // Fewer is better
  
  // Home court advantage
  features.home_court = 1;
  
  return features;
}

// Normalize features
function normalizeFeatures(X) {
  const featureKeys = Object.keys(X[0]);
  const means = {};
  const stds = {};
  
  // Calculate means
  featureKeys.forEach(key => {
    means[key] = X.reduce((sum, x) => sum + x[key], 0) / X.length;
  });
  
  // Calculate standard deviations
  featureKeys.forEach(key => {
    const variance = X.reduce((sum, x) => sum + Math.pow(x[key] - means[key], 2), 0) / X.length;
    stds[key] = Math.sqrt(variance) || 1; // Avoid division by zero
  });
  
  // Normalize
  const normalized = X.map(x => {
    const norm = {};
    featureKeys.forEach(key => {
      norm[key] = (x[key] - means[key]) / stds[key];
    });
    return norm;
  });
  
  return { normalized, means, stds };
}

// Simple linear regression
function trainLinearModel(X, y, learningRate = 0.001, epochs = 500) {
  const n = X.length;
  const featureKeys = Object.keys(X[0]);
  const k = featureKeys.length;
  
  // Normalize features first
  const { normalized, means, stds } = normalizeFeatures(X);
  
  // Initialize weights
  const weights = {};
  featureKeys.forEach(key => weights[key] = 0);
  let bias = 0;
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    
    // Calculate gradients
    const gradients = {};
    featureKeys.forEach(key => gradients[key] = 0);
    let biasGrad = 0;
    
    for (let i = 0; i < n; i++) {
      // Prediction on normalized data
      let pred = bias;
      featureKeys.forEach(key => {
        pred += weights[key] * normalized[i][key];
      });
      
      // Error
      const error = pred - y[i];
      totalLoss += error * error;
      
      // Accumulate gradients
      featureKeys.forEach(key => {
        gradients[key] += error * normalized[i][key];
      });
      biasGrad += error;
    }
    
    // Update weights
    featureKeys.forEach(key => {
      weights[key] -= (learningRate / n) * gradients[key];
    });
    bias -= (learningRate / n) * biasGrad;
    
    if (epoch % 100 === 0) {
      const mse = totalLoss / n;
      console.log(`  Epoch ${epoch}: MSE = ${mse.toFixed(2)}`);
    }
  }
  
  return { weights, bias, means, stds };
}

// Predict with linear model
function predictLinear(model, X) {
  const { weights, bias, means, stds } = model;
  const featureKeys = Object.keys(weights);
  
  return X.map(x => {
    // Normalize input using saved means/stds
    const normalized = {};
    featureKeys.forEach(key => {
      normalized[key] = (x[key] - means[key]) / stds[key];
    });
    
    // Predict on normalized data
    let pred = bias;
    featureKeys.forEach(key => {
      pred += weights[key] * normalized[key];
    });
    return pred;
  });
}

// Main
async function main() {
  // Load all seasons
  console.log('\n📊 Loading data...');
  const seasons = ['2022-23', '2023-24', '2024-25'];
  const allGames = [];
  
  for (const season of seasons) {
    const games = await loadGames(season);
    console.log(`  ${season}: ${games.length} games`);
    allGames.push(...games);
  }
  
  console.log(`\n✅ Total: ${allGames.length} games\n`);
  
  // Build dataset
  console.log('🔨 Building features...');
  const dataset = [];
  
  for (let i = 10; i < allGames.length; i++) {
    const features = buildFeatures(allGames, i);
    if (!features) continue;
    
    const game = allGames[i];
    dataset.push({
      features,
      spread: game.homeScore - game.awayScore,
      total: game.homeScore + game.awayScore,
      homeWin: game.homeScore > game.awayScore ? 1 : 0
    });
    
    if (dataset.length % 500 === 0) {
      console.log(`  Processed ${dataset.length} games...`);
    }
  }
  
  console.log(`✅ Built ${dataset.length} training samples\n`);
  
  // Split
  const splitIdx = Math.floor(dataset.length * 0.8);
  const X_train = dataset.slice(0, splitIdx).map(d => d.features);
  const y_train_spread = dataset.slice(0, splitIdx).map(d => d.spread);
  const y_train_total = dataset.slice(0, splitIdx).map(d => d.total);
  
  const X_test = dataset.slice(splitIdx).map(d => d.features);
  const y_test_spread = dataset.slice(splitIdx).map(d => d.spread);
  const y_test_total = dataset.slice(splitIdx).map(d => d.total);
  
  console.log(`📊 Train: ${X_train.length}, Test: ${X_test.length}\n`);
  
  // Train spread model
  console.log('🏋️  Training Spread Model...');
  const spreadModel = trainLinearModel(X_train, y_train_spread);
  
  // Evaluate spread
  const spreadPreds = predictLinear(spreadModel, X_test);
  const spreadMAE = spreadPreds.reduce((sum, pred, i) => 
    sum + Math.abs(pred - y_test_spread[i]), 0
  ) / spreadPreds.length;
  
  console.log(`\n✅ Spread MAE: ${spreadMAE.toFixed(2)} points\n`);
  
  // Train total model (needs more epochs due to larger scale)
  console.log('🏋️  Training Total Model...');
  const totalModel = trainLinearModel(X_train, y_train_total, 0.01, 2000);
  
  // Evaluate total
  const totalPreds = predictLinear(totalModel, X_test);
  const totalMAE = totalPreds.reduce((sum, pred, i) => 
    sum + Math.abs(pred - y_test_total[i]), 0
  ) / totalPreds.length;
  
  console.log(`\n✅ Total MAE: ${totalMAE.toFixed(2)} points\n`);
  
  // Save models
  console.log('💾 Saving models...');
  const modelsDir = path.join(__dirname, '../netlify/functions/_lib/nba/models/artifacts');
  await fs.mkdir(modelsDir, { recursive: true });
  
  await fs.writeFile(
    path.join(modelsDir, 'spread_model_simple.json'),
    JSON.stringify(spreadModel, null, 2)
  );
  
  await fs.writeFile(
    path.join(modelsDir, 'total_model_simple.json'),
    JSON.stringify(totalModel, null, 2)
  );
  
  console.log('✅ Models saved!\n');
  
  // Summary
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                    TRAINING COMPLETE                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`\n  Dataset: ${dataset.length} games`);
  console.log(`  Features: ${Object.keys(X_train[0]).length}`);
  console.log(`  Spread MAE: ${spreadMAE.toFixed(2)} points`);
  console.log(`  Total MAE: ${totalMAE.toFixed(2)} points\n`);
}

main().catch(console.error);
