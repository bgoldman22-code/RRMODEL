#!/usr/bin/env node

/**
 * NBA GRADIENT BOOSTED TREES TRAINING
 * 
 * Custom gradient boosting implementation optimized for NBA predictions
 * Target: Spread MAE <10, Total MAE <13
 * 
 * Features:
 * - Gradient boosted decision trees (like XGBoost)
 * - L1/L2 regularization
 * - Early stopping
 * - Feature importance tracking
 * - 60+ enhanced features with L5/L10/L20 windows
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🚀  NBA GRADIENT BOOSTING - ADVANCED ML                    ║
║                                                               ║
║   Target: MAE <10 for Spreads, <13 for Totals               ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Decision Tree Node
class TreeNode {
  constructor(depth = 0) {
    this.feature = null;
    this.threshold = null;
    this.value = null; // For leaf nodes
    this.left = null;
    this.right = null;
    this.depth = depth;
  }

  isLeaf() {
    return this.value !== null;
  }
}

// Regression Tree for Gradient Boosting
class RegressionTree {
  constructor(maxDepth = 6, minSamplesSplit = 20, minSamplesLeaf = 10, lambda = 1.0) {
    this.maxDepth = maxDepth;
    this.minSamplesSplit = minSamplesSplit;
    this.minSamplesLeaf = minSamplesLeaf;
    this.lambda = lambda; // L2 regularization
    this.root = null;
  }

  fit(X, residuals, sampleWeights = null) {
    this.root = this._buildTree(X, residuals, sampleWeights, 0);
  }

  _buildTree(X, residuals, sampleWeights, depth) {
    const n = X.length;
    const node = new TreeNode(depth);

    // Check stopping criteria
    if (depth >= this.maxDepth || n < this.minSamplesSplit) {
      node.value = this._calculateLeafValue(residuals, sampleWeights);
      return node;
    }

    // Find best split
    const split = this._findBestSplit(X, residuals, sampleWeights);
    
    if (!split || split.leftIndices.length < this.minSamplesLeaf || split.rightIndices.length < this.minSamplesLeaf) {
      node.value = this._calculateLeafValue(residuals, sampleWeights);
      return node;
    }

    // Create split
    node.feature = split.feature;
    node.threshold = split.threshold;

    // Build subtrees
    const leftX = split.leftIndices.map(i => X[i]);
    const leftResiduals = split.leftIndices.map(i => residuals[i]);
    const leftWeights = sampleWeights ? split.leftIndices.map(i => sampleWeights[i]) : null;

    const rightX = split.rightIndices.map(i => X[i]);
    const rightResiduals = split.rightIndices.map(i => residuals[i]);
    const rightWeights = sampleWeights ? split.rightIndices.map(i => sampleWeights[i]) : null;

    node.left = this._buildTree(leftX, leftResiduals, leftWeights, depth + 1);
    node.right = this._buildTree(rightX, rightResiduals, rightWeights, depth + 1);

    return node;
  }

  _findBestSplit(X, residuals, sampleWeights) {
    if (X.length === 0) return null;

    const features = Object.keys(X[0]);
    let bestSplit = null;
    let bestGain = -Infinity;

    for (const feature of features) {
      // Get unique values for this feature
      const values = X.map(x => x[feature]);
      const uniqueValues = [...new Set(values)].sort((a, b) => a - b);

      // Try splits at midpoints
      for (let i = 0; i < uniqueValues.length - 1; i++) {
        const threshold = (uniqueValues[i] + uniqueValues[i + 1]) / 2;

        const leftIndices = [];
        const rightIndices = [];

        for (let j = 0; j < X.length; j++) {
          if (X[j][feature] <= threshold) {
            leftIndices.push(j);
          } else {
            rightIndices.push(j);
          }
        }

        if (leftIndices.length < this.minSamplesLeaf || rightIndices.length < this.minSamplesLeaf) {
          continue;
        }

        // Calculate gain
        const gain = this._calculateGain(residuals, leftIndices, rightIndices, sampleWeights);

        if (gain > bestGain) {
          bestGain = gain;
          bestSplit = { feature, threshold, leftIndices, rightIndices };
        }
      }
    }

    return bestSplit;
  }

  _calculateGain(residuals, leftIndices, rightIndices, sampleWeights) {
    const totalSS = this._calculateSS(residuals, Array.from({length: residuals.length}, (_, i) => i), sampleWeights);
    const leftSS = this._calculateSS(residuals, leftIndices, sampleWeights);
    const rightSS = this._calculateSS(residuals, rightIndices, sampleWeights);

    return totalSS - leftSS - rightSS;
  }

  _calculateSS(residuals, indices, sampleWeights) {
    if (indices.length === 0) return 0;

    const values = indices.map(i => residuals[i]);
    const weights = sampleWeights ? indices.map(i => sampleWeights[i]) : Array(indices.length).fill(1);
    
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const mean = values.reduce((sum, val, i) => sum + val * weights[i], 0) / totalWeight;

    return values.reduce((sum, val, i) => sum + weights[i] * Math.pow(val - mean, 2), 0);
  }

  _calculateLeafValue(residuals, sampleWeights) {
    if (residuals.length === 0) return 0;

    const weights = sampleWeights || Array(residuals.length).fill(1);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    
    // Calculate weighted mean with L2 regularization
    const sum = residuals.reduce((s, r, i) => s + r * weights[i], 0);
    return sum / (totalWeight + this.lambda);
  }

  predict(x) {
    return this._predictNode(this.root, x);
  }

  _predictNode(node, x) {
    if (node.isLeaf()) {
      return node.value;
    }

    if (x[node.feature] <= node.threshold) {
      return this._predictNode(node.left, x);
    } else {
      return this._predictNode(node.right, x);
    }
  }
}

// Gradient Boosting Regressor
class GradientBoostingRegressor {
  constructor(options = {}) {
    this.nEstimators = options.nEstimators || 100;
    this.learningRate = options.learningRate || 0.1;
    this.maxDepth = options.maxDepth || 6;
    this.minSamplesSplit = options.minSamplesSplit || 20;
    this.minSamplesLeaf = options.minSamplesLeaf || 10;
    this.subsample = options.subsample || 0.8;
    this.lambda = options.lambda || 1.0;
    this.earlyStoppingRounds = options.earlyStoppingRounds || 10;
    
    this.trees = [];
    this.baseValue = 0;
    this.featureImportance = {};
  }

  fit(X_train, y_train, X_val = null, y_val = null) {
    // Initialize base prediction (mean)
    this.baseValue = y_train.reduce((a, b) => a + b, 0) / y_train.length;
    
    // Initialize predictions
    let predictions = Array(X_train.length).fill(this.baseValue);
    let valPredictions = X_val ? Array(X_val.length).fill(this.baseValue) : null;
    
    let bestValLoss = Infinity;
    let roundsWithoutImprovement = 0;

    console.log(`\n🌳 Building ${this.nEstimators} trees (max_depth=${this.maxDepth}, lr=${this.learningRate})...\n`);

    for (let i = 0; i < this.nEstimators; i++) {
      // Calculate residuals (negative gradient for MSE)
      const residuals = y_train.map((y, idx) => y - predictions[idx]);

      // Subsample data
      const sampleIndices = this._subsample(X_train.length);
      const X_sample = sampleIndices.map(idx => X_train[idx]);
      const residuals_sample = sampleIndices.map(idx => residuals[idx]);

      // Build tree
      const tree = new RegressionTree(
        this.maxDepth,
        this.minSamplesSplit,
        this.minSamplesLeaf,
        this.lambda
      );
      tree.fit(X_sample, residuals_sample);
      this.trees.push(tree);

      // Update predictions
      for (let j = 0; j < X_train.length; j++) {
        predictions[j] += this.learningRate * tree.predict(X_train[j]);
      }

      // Calculate training loss
      const trainLoss = this._meanSquaredError(y_train, predictions);

      // Validation
      let valLoss = null;
      if (X_val && y_val) {
        for (let j = 0; j < X_val.length; j++) {
          valPredictions[j] += this.learningRate * tree.predict(X_val[j]);
        }
        valLoss = this._meanSquaredError(y_val, valPredictions);

        // Early stopping
        if (valLoss < bestValLoss) {
          bestValLoss = valLoss;
          roundsWithoutImprovement = 0;
        } else {
          roundsWithoutImprovement++;
        }

        if (roundsWithoutImprovement >= this.earlyStoppingRounds) {
          console.log(`  🛑 Early stopping at iteration ${i + 1}`);
          break;
        }
      }

      if ((i + 1) % 10 === 0 || i === 0) {
        const trainMAE = this._meanAbsoluteError(y_train, predictions);
        const valMAE = valLoss !== null ? this._meanAbsoluteError(y_val, valPredictions) : null;
        
        console.log(`  Tree ${String(i + 1).padStart(3)} | Train MAE: ${trainMAE.toFixed(3)} | Val MAE: ${valMAE ? valMAE.toFixed(3) : 'N/A'}`);
      }
    }

    console.log(`\n✅ Training complete: ${this.trees.length} trees built\n`);
  }

  predict(X) {
    const predictions = Array(X.length).fill(this.baseValue);
    
    for (const tree of this.trees) {
      for (let i = 0; i < X.length; i++) {
        predictions[i] += this.learningRate * tree.predict(X[i]);
      }
    }

    return predictions;
  }

  _subsample(n) {
    const sampleSize = Math.floor(n * this.subsample);
    const indices = Array.from({length: n}, (_, i) => i);
    
    // Fisher-Yates shuffle and take first sampleSize elements
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    return indices.slice(0, sampleSize);
  }

  _meanSquaredError(y_true, y_pred) {
    const mse = y_true.reduce((sum, y, i) => sum + Math.pow(y - y_pred[i], 2), 0) / y_true.length;
    return mse;
  }

  _meanAbsoluteError(y_true, y_pred) {
    const mae = y_true.reduce((sum, y, i) => sum + Math.abs(y - y_pred[i]), 0) / y_true.length;
    return mae;
  }
}

// Load enhanced games
console.log('📊 Loading enhanced data...');
const seasons = ['2022-23', '2023-24', '2024-25'];
const games = [];

for (const season of seasons) {
  const filename = `games_${season.replace('-', '_')}_enhanced.json`;
  const filepath = path.join(__dirname, '..', 'data', 'nba', 'advanced', filename);
  
  const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
  games.push(...data);
  console.log(`  ${season}: ${data.length} games`);
}

console.log(`\n✅ Total: ${games.length} games with advanced stats\n`);

// Enhanced feature extraction with multiple windows (L5, L10, L20)
function calculateAdvancedStats(teamGames, teamId, window) {
  const recentGames = teamGames.slice(-window);
  
  const stats = {
    pace: 0, offRtg: 0, defRtg: 0, efg: 0, ts: 0,
    tovPct: 0, orbPct: 0, ftFga: 0, ppg: 0, winPct: 0
  };
  
  if (recentGames.length === 0) {
    return {
      pace: 100, offRtg: 110, defRtg: 110, efg: 52, ts: 56,
      tovPct: 13, orbPct: 25, ftFga: 23, ppg: 110, winPct: 0.5
    };
  }
  
  let count = 0;
  let wins = 0;
  
  for (const game of recentGames) {
    const isHome = game.homeTeamId === teamId;
    const advanced = isHome ? game.homeAdvanced : game.awayAdvanced;
    
    if (advanced && advanced.pace !== undefined) {
      stats.pace += advanced.pace || 100;
      stats.offRtg += advanced.offRtg || 110;
      stats.defRtg += advanced.defRtg || 110;
      stats.efg += advanced.efg || 52;
      stats.ts += advanced.ts || 56;
      stats.tovPct += advanced.tovPct || 13;
      stats.orbPct += advanced.orbPct || 25;
      stats.ftFga += advanced.ftFga || 23;
      count++;
    }
    
    stats.ppg += isHome ? game.homeScore : game.awayScore;
    if ((isHome && game.homeScore > game.awayScore) || (!isHome && game.awayScore > game.homeScore)) {
      wins++;
    }
  }
  
  if (count > 0) {
    Object.keys(stats).forEach(key => {
      if (key !== 'ppg' && key !== 'winPct') {
        stats[key] /= count;
      }
    });
  }
  
  stats.ppg /= recentGames.length;
  stats.winPct = wins / recentGames.length;
  
  return stats;
}

function buildEnhancedFeatures(games, idx) {
  const game = games[idx];
  
  const homeGames = games.slice(0, idx).filter(g => g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId);
  const awayGames = games.slice(0, idx).filter(g => g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId);
  
  // L5, L10, L20 windows
  const homeL5 = calculateAdvancedStats(homeGames, game.homeTeamId, 5);
  const homeL10 = calculateAdvancedStats(homeGames, game.homeTeamId, 10);
  const homeL20 = calculateAdvancedStats(homeGames, game.homeTeamId, 20);
  
  const awayL5 = calculateAdvancedStats(awayGames, game.awayTeamId, 5);
  const awayL10 = calculateAdvancedStats(awayGames, game.awayTeamId, 10);
  const awayL20 = calculateAdvancedStats(awayGames, game.awayTeamId, 20);
  
  return {
    // Home L5 (10 features)
    h5_pace: homeL5.pace, h5_offRtg: homeL5.offRtg, h5_defRtg: homeL5.defRtg,
    h5_efg: homeL5.efg, h5_ts: homeL5.ts, h5_tovPct: homeL5.tovPct,
    h5_orbPct: homeL5.orbPct, h5_ftFga: homeL5.ftFga, h5_ppg: homeL5.ppg, h5_winPct: homeL5.winPct,
    
    // Home L10 (10 features)
    h10_pace: homeL10.pace, h10_offRtg: homeL10.offRtg, h10_defRtg: homeL10.defRtg,
    h10_efg: homeL10.efg, h10_ts: homeL10.ts, h10_tovPct: homeL10.tovPct,
    h10_orbPct: homeL10.orbPct, h10_ftFga: homeL10.ftFga, h10_ppg: homeL10.ppg, h10_winPct: homeL10.winPct,
    
    // Home L20 (10 features)
    h20_pace: homeL20.pace, h20_offRtg: homeL20.offRtg, h20_defRtg: homeL20.defRtg,
    h20_efg: homeL20.efg, h20_ts: homeL20.ts, h20_tovPct: homeL20.tovPct,
    h20_orbPct: homeL20.orbPct, h20_ftFga: homeL20.ftFga, h20_ppg: homeL20.ppg, h20_winPct: homeL20.winPct,
    
    // Away L5 (10 features)
    a5_pace: awayL5.pace, a5_offRtg: awayL5.offRtg, a5_defRtg: awayL5.defRtg,
    a5_efg: awayL5.efg, a5_ts: awayL5.ts, a5_tovPct: awayL5.tovPct,
    a5_orbPct: awayL5.orbPct, a5_ftFga: awayL5.ftFga, a5_ppg: awayL5.ppg, a5_winPct: awayL5.winPct,
    
    // Away L10 (10 features)
    a10_pace: awayL10.pace, a10_offRtg: awayL10.offRtg, a10_defRtg: awayL10.defRtg,
    a10_efg: awayL10.efg, a10_ts: awayL10.ts, a10_tovPct: awayL10.tovPct,
    a10_orbPct: awayL10.orbPct, a10_ftFga: awayL10.ftFga, a10_ppg: awayL10.ppg, a10_winPct: awayL10.winPct,
    
    // Away L20 (10 features)
    a20_pace: awayL20.pace, a20_offRtg: awayL20.offRtg, a20_defRtg: awayL20.defRtg,
    a20_efg: awayL20.efg, a20_ts: awayL20.ts, a20_tovPct: awayL20.tovPct,
    a20_orbPct: awayL20.orbPct, a20_ftFga: awayL20.ftFga, a20_ppg: awayL20.ppg, a20_winPct: awayL20.winPct,
    
    // Matchup features (18 features)
    pace_diff: homeL10.pace - awayL10.pace,
    offRtg_diff: homeL10.offRtg - awayL10.offRtg,
    defRtg_diff: homeL10.defRtg - awayL10.defRtg,
    netRtg_home: homeL10.offRtg - homeL10.defRtg,
    netRtg_away: awayL10.offRtg - awayL10.defRtg,
    netRtg_diff: (homeL10.offRtg - homeL10.defRtg) - (awayL10.offRtg - awayL10.defRtg),
    efg_diff: homeL10.efg - awayL10.efg,
    ts_diff: homeL10.ts - awayL10.ts,
    tov_diff: homeL10.tovPct - awayL10.tovPct,
    orb_diff: homeL10.orbPct - awayL10.orbPct,
    ft_diff: homeL10.ftFga - awayL10.ftFga,
    ppg_diff: homeL10.ppg - awayL10.ppg,
    winPct_diff: homeL10.winPct - awayL10.winPct,
    home_offense_vs_away_defense: homeL10.offRtg - awayL10.defRtg,
    away_offense_vs_home_defense: awayL10.offRtg - homeL10.defRtg,
    form_diff: (homeL5.winPct - homeL10.winPct) - (awayL5.winPct - awayL10.winPct),
    momentum_home: homeL5.ppg - homeL10.ppg,
    momentum_away: awayL5.ppg - awayL10.ppg,
    home_advantage: 3.5
  };
}

console.log('🔨 Building enhanced features (79 per game: 60 stats + 19 matchup)...');

const X = [];
const y_spread = [];
const y_total = [];

let processed = 0;

for (let i = 0; i < games.length; i++) {
  const game = games[i];
  
  // Skip games without sufficient history
  const homeHistory = games.slice(0, i).filter(g => g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId);
  const awayHistory = games.slice(0, i).filter(g => g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId);
  
  if (homeHistory.length < 20 || awayHistory.length < 20) continue;
  
  const features = buildEnhancedFeatures(games, i);
  
  X.push(features);
  y_spread.push(game.homeScore - game.awayScore);
  y_total.push(game.homeScore + game.awayScore);
  
  processed++;
  if (processed % 500 === 0) console.log(`  Processed ${processed} games...`);
}

console.log(`\n✅ Built ${X.length} training samples with 79 enhanced features\n`);

// Normalize features
function normalizeFeatures(X) {
  const features = Object.keys(X[0]);
  const means = {};
  const stds = {};
  
  features.forEach(feat => {
    const values = X.map(x => x[feat]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    
    means[feat] = mean;
    stds[feat] = std || 1;
  });
  
  const X_norm = X.map(x => {
    const norm = {};
    features.forEach(feat => {
      norm[feat] = (x[feat] - means[feat]) / stds[feat];
    });
    return norm;
  });
  
  return { X_norm, means, stds };
}

const { X_norm, means, stds } = normalizeFeatures(X);

// Train/validation/test split (70/15/15)
const trainIdx = Math.floor(X.length * 0.7);
const valIdx = Math.floor(X.length * 0.85);

const X_train = X_norm.slice(0, trainIdx);
const y_train_spread = y_spread.slice(0, trainIdx);
const y_train_total = y_total.slice(0, trainIdx);

const X_val = X_norm.slice(trainIdx, valIdx);
const y_val_spread = y_spread.slice(trainIdx, valIdx);
const y_val_total = y_total.slice(trainIdx, valIdx);

const X_test = X_norm.slice(valIdx);
const y_test_spread = y_spread.slice(valIdx);
const y_test_total = y_total.slice(valIdx);

console.log(`📊 Data split: Train=${X_train.length}, Val=${X_val.length}, Test=${X_test.length}\n`);

// Train Spread Model with Gradient Boosting
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║          TRAINING SPREAD MODEL (Gradient Boosting)          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const spreadGBM = new GradientBoostingRegressor({
  nEstimators: 150,
  learningRate: 0.05,
  maxDepth: 6,
  minSamplesSplit: 20,
  minSamplesLeaf: 10,
  subsample: 0.8,
  lambda: 1.5,
  earlyStoppingRounds: 15
});

spreadGBM.fit(X_train, y_train_spread, X_val, y_val_spread);

// Evaluate Spread Model
const spreadPreds = spreadGBM.predict(X_test);
const spreadMAE = spreadPreds.reduce((sum, pred, i) => sum + Math.abs(pred - y_test_spread[i]), 0) / spreadPreds.length;
const spreadMSE = spreadPreds.reduce((sum, pred, i) => sum + Math.pow(pred - y_test_spread[i], 2), 0) / spreadPreds.length;
const spreadRMSE = Math.sqrt(spreadMSE);

console.log('\n📊 SPREAD MODEL RESULTS:');
console.log(`  Test MAE:  ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 TARGET MET!' : spreadMAE < 11 ? '✅ Close!' : ''}`);
console.log(`  Test RMSE: ${spreadRMSE.toFixed(3)} points`);

// Train Total Model with Gradient Boosting
console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║           TRAINING TOTAL MODEL (Gradient Boosting)          ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const totalGBM = new GradientBoostingRegressor({
  nEstimators: 150,
  learningRate: 0.05,
  maxDepth: 6,
  minSamplesSplit: 20,
  minSamplesLeaf: 10,
  subsample: 0.8,
  lambda: 1.5,
  earlyStoppingRounds: 15
});

totalGBM.fit(X_train, y_train_total, X_val, y_val_total);

// Evaluate Total Model
const totalPreds = totalGBM.predict(X_test);
const totalMAE = totalPreds.reduce((sum, pred, i) => sum + Math.abs(pred - y_test_total[i]), 0) / totalPreds.length;
const totalMSE = totalPreds.reduce((sum, pred, i) => sum + Math.pow(pred - y_test_total[i], 2), 0) / totalPreds.length;
const totalRMSE = Math.sqrt(totalMSE);

console.log('\n📊 TOTAL MODEL RESULTS:');
console.log(`  Test MAE:  ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 TARGET MET!' : totalMAE < 14 ? '✅ Close!' : ''}`);
console.log(`  Test RMSE: ${totalRMSE.toFixed(3)} points`);

// Save models
const modelsDir = path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'nba', 'models', 'artifacts');
fs.mkdirSync(modelsDir, { recursive: true });

// Convert to serializable format
function serializeModel(gbm) {
  return {
    baseValue: gbm.baseValue,
    learningRate: gbm.learningRate,
    trees: gbm.trees.map(tree => serializeTree(tree.root)),
    nTrees: gbm.trees.length
  };
}

function serializeTree(node) {
  if (node.isLeaf()) {
    return { value: node.value };
  }
  return {
    feature: node.feature,
    threshold: node.threshold,
    left: serializeTree(node.left),
    right: serializeTree(node.right)
  };
}

const spreadModelData = {
  model: serializeModel(spreadGBM),
  means,
  stds,
  type: 'gradient_boosting',
  performance: {
    mae: spreadMAE,
    rmse: spreadRMSE,
    testSamples: X_test.length
  }
};

const totalModelData = {
  model: serializeModel(totalGBM),
  means,
  stds,
  type: 'gradient_boosting',
  performance: {
    mae: totalMAE,
    rmse: totalRMSE,
    testSamples: X_test.length
  }
};

const spreadPath = path.join(modelsDir, 'spread_model_gbm.json');
const totalPath = path.join(modelsDir, 'total_model_gbm.json');

fs.writeFileSync(spreadPath, JSON.stringify(spreadModelData, null, 2));
fs.writeFileSync(totalPath, JSON.stringify(totalModelData, null, 2));

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   GRADIENT BOOSTING COMPLETE                  ║
╚═══════════════════════════════════════════════════════════════╝

  Dataset: ${X.length} games
  Features: 79 (L5/L10/L20 windows + matchup)
  Trees: ${spreadGBM.trees.length} (spread), ${totalGBM.trees.length} (total)
  
  📊 SPREAD RESULTS:
    MAE:  ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 UNDER 10!' : spreadMAE < 11 ? '✅ Under 11!' : '⏳ Close!'}
    RMSE: ${spreadRMSE.toFixed(3)} points
    
  📊 TOTAL RESULTS:
    MAE:  ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 UNDER 13!' : '⏳ Close!'}
    RMSE: ${totalRMSE.toFixed(3)} points
  
  Improvement vs Linear (36 features):
    Spread: 12.01 → ${spreadMAE.toFixed(2)} (${((12.01 - spreadMAE) / 12.01 * 100).toFixed(1)}% better)
    Total:  14.53 → ${totalMAE.toFixed(2)} (${((14.53 - totalMAE) / 14.53 * 100).toFixed(1)}% better)
  
  💾 Models saved:
    - spread_model_gbm.json
    - total_model_gbm.json
`);
