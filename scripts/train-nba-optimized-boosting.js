#!/usr/bin/env node

/**
 * NBA OPTIMIZED GRADIENT BOOSTING
 * 
 * Faster implementation with:
 * - Simplified tree building (greedy algorithm)
 * - Reduced feature set for speed
 * - Progress indicators
 * - Early stopping
 * 
 * Target: <10 MAE in reasonable time
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║   🚀  NBA OPTIMIZED GRADIENT BOOSTING                        ║
║                                                               ║
║   Fast training with smart feature selection                 ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Simplified fast regression tree
class FastRegressionTree {
  constructor(maxDepth = 5) {
    this.maxDepth = maxDepth;
    this.tree = null;
  }

  fit(X, residuals) {
    this.tree = this._buildTree(X, residuals, 0);
  }

  _buildTree(X, residuals, depth) {
    if (depth >= this.maxDepth || X.length < 50) {
      // Leaf node
      const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
      return { value: mean };
    }

    // Find best split (sample features for speed)
    const features = Object.keys(X[0]);
    const sampleSize = Math.min(20, features.length); // Sample features
    const sampledFeatures = [];
    
    for (let i = 0; i < sampleSize; i++) {
      sampledFeatures.push(features[Math.floor(Math.random() * features.length)]);
    }

    let bestGain = -Infinity;
    let bestSplit = null;

    for (const feature of sampledFeatures) {
      const values = X.map(x => x[feature]);
      const median = values.sort((a, b) => a - b)[Math.floor(values.length / 2)];

      const leftIndices = [];
      const rightIndices = [];

      for (let i = 0; i < X.length; i++) {
        if (X[i][feature] <= median) {
          leftIndices.push(i);
        } else {
          rightIndices.push(i);
        }
      }

      if (leftIndices.length < 20 || rightIndices.length < 20) continue;

      const gain = this._calculateGain(residuals, leftIndices, rightIndices);

      if (gain > bestGain) {
        bestGain = gain;
        bestSplit = { feature, threshold: median, leftIndices, rightIndices };
      }
    }

    if (!bestSplit) {
      const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
      return { value: mean };
    }

    // Build subtrees
    const leftX = bestSplit.leftIndices.map(i => X[i]);
    const leftResiduals = bestSplit.leftIndices.map(i => residuals[i]);
    const rightX = bestSplit.rightIndices.map(i => X[i]);
    const rightResiduals = bestSplit.rightIndices.map(i => residuals[i]);

    return {
      feature: bestSplit.feature,
      threshold: bestSplit.threshold,
      left: this._buildTree(leftX, leftResiduals, depth + 1),
      right: this._buildTree(rightX, rightResiduals, depth + 1)
    };
  }

  _calculateGain(residuals, leftIndices, rightIndices) {
    const variance = (indices) => {
      if (indices.length === 0) return 0;
      const values = indices.map(i => residuals[i]);
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0);
    };

    const totalVar = variance(Array.from({ length: residuals.length }, (_, i) => i));
    const leftVar = variance(leftIndices);
    const rightVar = variance(rightIndices);

    return totalVar - leftVar - rightVar;
  }

  predict(x) {
    let node = this.tree;
    while (node.value === undefined) {
      if (x[node.feature] <= node.threshold) {
        node = node.left;
      } else {
        node = node.right;
      }
    }
    return node.value;
  }
}

// Fast Gradient Boosting
class FastGradientBoosting {
  constructor(nEstimators = 50, learningRate = 0.1, maxDepth = 5) {
    this.nEstimators = nEstimators;
    this.learningRate = learningRate;
    this.maxDepth = maxDepth;
    this.trees = [];
    this.baseValue = 0;
  }

  fit(X_train, y_train, X_val, y_val) {
    this.baseValue = y_train.reduce((a, b) => a + b, 0) / y_train.length;
    
    let predictions = Array(X_train.length).fill(this.baseValue);
    let valPredictions = Array(X_val.length).fill(this.baseValue);
    
    let bestValMAE = Infinity;
    let roundsWithoutImprovement = 0;

    console.log(`\n🌳 Building ${this.nEstimators} trees (fast mode)...\n`);

    const startTime = Date.now();

    for (let i = 0; i < this.nEstimators; i++) {
      const iterStart = Date.now();

      // Calculate residuals
      const residuals = y_train.map((y, idx) => y - predictions[idx]);

      // Build tree
      const tree = new FastRegressionTree(this.maxDepth);
      tree.fit(X_train, residuals);
      this.trees.push(tree);

      // Update predictions
      for (let j = 0; j < X_train.length; j++) {
        predictions[j] += this.learningRate * tree.predict(X_train[j]);
      }

      for (let j = 0; j < X_val.length; j++) {
        valPredictions[j] += this.learningRate * tree.predict(X_val[j]);
      }

      // Calculate metrics
      const trainMAE = this._mae(y_train, predictions);
      const valMAE = this._mae(y_val, valPredictions);

      const iterTime = Date.now() - iterStart;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const eta = ((iterTime * (this.nEstimators - i - 1)) / 1000).toFixed(1);

      console.log(`  Tree ${String(i + 1).padStart(3)}/${this.nEstimators} | Train: ${trainMAE.toFixed(3)} | Val: ${valMAE.toFixed(3)} | ${iterTime}ms | ETA: ${eta}s`);

      // Early stopping
      if (valMAE < bestValMAE) {
        bestValMAE = valMAE;
        roundsWithoutImprovement = 0;
      } else {
        roundsWithoutImprovement++;
        if (roundsWithoutImprovement >= 10) {
          console.log(`  🛑 Early stopping at tree ${i + 1} (best val MAE: ${bestValMAE.toFixed(3)})`);
          break;
        }
      }
    }

    console.log(`\n✅ Training complete in ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);
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

  _mae(y_true, y_pred) {
    return y_true.reduce((sum, y, i) => sum + Math.abs(y - y_pred[i]), 0) / y_true.length;
  }
}

// Load data
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

console.log(`\n✅ Total: ${games.length} games\n`);

// Optimized feature extraction (L10 only, most important features)
function buildOptimizedFeatures(games, idx) {
  const game = games[idx];
  
  const homeGames = games.slice(0, idx).filter(g => 
    g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId
  ).slice(-10);
  
  const awayGames = games.slice(0, idx).filter(g => 
    g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId
  ).slice(-10);

  const calcStats = (teamGames, teamId) => {
    if (teamGames.length === 0) {
      return { pace: 100, offRtg: 110, defRtg: 110, ppg: 110, winPct: 0.5, netRtg: 0 };
    }

    let pace = 0, offRtg = 0, defRtg = 0, ppg = 0, wins = 0;
    let count = 0;

    for (const g of teamGames) {
      const isHome = g.homeTeamId === teamId;
      const adv = isHome ? g.homeAdvanced : g.awayAdvanced;
      
      if (adv) {
        pace += adv.pace || 100;
        offRtg += adv.offRtg || 110;
        defRtg += adv.defRtg || 110;
        count++;
      }
      
      ppg += isHome ? g.homeScore : g.awayScore;
      if ((isHome && g.homeScore > g.awayScore) || (!isHome && g.awayScore > g.homeScore)) {
        wins++;
      }
    }

    if (count > 0) {
      pace /= count;
      offRtg /= count;
      defRtg /= count;
    }
    ppg /= teamGames.length;
    const winPct = wins / teamGames.length;
    const netRtg = offRtg - defRtg;

    return { pace, offRtg, defRtg, ppg, winPct, netRtg };
  };

  const home = calcStats(homeGames, game.homeTeamId);
  const away = calcStats(awayGames, game.awayTeamId);

  // Core 24 features (most predictive)
  return {
    h_pace: home.pace,
    h_offRtg: home.offRtg,
    h_defRtg: home.defRtg,
    h_netRtg: home.netRtg,
    h_ppg: home.ppg,
    h_winPct: home.winPct,
    
    a_pace: away.pace,
    a_offRtg: away.offRtg,
    a_defRtg: away.defRtg,
    a_netRtg: away.netRtg,
    a_ppg: away.ppg,
    a_winPct: away.winPct,
    
    // Matchup features (12)
    pace_diff: home.pace - away.pace,
    offRtg_diff: home.offRtg - away.offRtg,
    defRtg_diff: home.defRtg - away.defRtg,
    netRtg_diff: home.netRtg - away.netRtg,
    ppg_diff: home.ppg - away.ppg,
    winPct_diff: home.winPct - away.winPct,
    
    h_off_vs_a_def: home.offRtg - away.defRtg,
    a_off_vs_h_def: away.offRtg - home.defRtg,
    expected_pace: (home.pace + away.pace) / 2,
    expected_total: home.ppg + away.ppg,
    rating_advantage: home.netRtg - away.netRtg,
    home_adv: 3.5
  };
}

console.log('🔨 Building optimized features (24 core features)...');

const X = [];
const y_spread = [];
const y_total = [];

for (let i = 0; i < games.length; i++) {
  const game = games[i];
  
  const homeHistory = games.slice(0, i).filter(g => 
    g.homeTeamId === game.homeTeamId || g.awayTeamId === game.homeTeamId
  );
  const awayHistory = games.slice(0, i).filter(g => 
    g.homeTeamId === game.awayTeamId || g.awayTeamId === game.awayTeamId
  );
  
  if (homeHistory.length < 10 || awayHistory.length < 10) continue;
  
  const features = buildOptimizedFeatures(games, i);
  
  X.push(features);
  y_spread.push(game.homeScore - game.awayScore);
  y_total.push(game.homeScore + game.awayScore);
}

console.log(`✅ Built ${X.length} samples with 24 features\n`);

// Normalize
const features = Object.keys(X[0]);
const means = {};
const stds = {};

features.forEach(feat => {
  const values = X.map(x => x[feat]);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  
  means[feat] = mean;
  stds[feat] = Math.sqrt(variance) || 1;
});

const X_norm = X.map(x => {
  const norm = {};
  features.forEach(feat => {
    norm[feat] = (x[feat] - means[feat]) / stds[feat];
  });
  return norm;
});

// Split: 70/15/15
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

console.log(`📊 Split: Train=${X_train.length}, Val=${X_val.length}, Test=${X_test.length}\n`);

// Train Spread Model
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║              SPREAD MODEL (Gradient Boosting)               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const spreadGBM = new FastGradientBoosting(60, 0.08, 5);
spreadGBM.fit(X_train, y_train_spread, X_val, y_val_spread);

const spreadPreds = spreadGBM.predict(X_test);
const spreadMAE = spreadPreds.reduce((sum, pred, i) => 
  sum + Math.abs(pred - y_test_spread[i]), 0) / spreadPreds.length;

console.log(`\n📊 SPREAD TEST MAE: ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 UNDER 10!' : spreadMAE < 11 ? '✅ Under 11!' : ''}\n`);

// Train Total Model
console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║               TOTAL MODEL (Gradient Boosting)               ║');
console.log('╚══════════════════════════════════════════════════════════════╝');

const totalGBM = new FastGradientBoosting(60, 0.08, 5);
totalGBM.fit(X_train, y_train_total, X_val, y_val_total);

const totalPreds = totalGBM.predict(X_test);
const totalMAE = totalPreds.reduce((sum, pred, i) => 
  sum + Math.abs(pred - y_test_total[i]), 0) / totalPreds.length;

console.log(`\n📊 TOTAL TEST MAE: ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 UNDER 13!' : ''}\n`);

// Serialize and save
function serializeTree(node) {
  if (node.value !== undefined) {
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
  model: {
    baseValue: spreadGBM.baseValue,
    learningRate: spreadGBM.learningRate,
    trees: spreadGBM.trees.map(t => serializeTree(t.tree)),
    nTrees: spreadGBM.trees.length
  },
  means,
  stds,
  type: 'gradient_boosting',
  performance: { mae: spreadMAE, testSamples: X_test.length }
};

const totalModelData = {
  model: {
    baseValue: totalGBM.baseValue,
    learningRate: totalGBM.learningRate,
    trees: totalGBM.trees.map(t => serializeTree(t.tree)),
    nTrees: totalGBM.trees.length
  },
  means,
  stds,
  type: 'gradient_boosting',
  performance: { mae: totalMAE, testSamples: X_test.length }
};

const modelsDir = path.join(__dirname, '..', 'netlify', 'functions', '_lib', 'nba', 'models', 'artifacts');
fs.mkdirSync(modelsDir, { recursive: true });

fs.writeFileSync(
  path.join(modelsDir, 'spread_model_gbm.json'),
  JSON.stringify(spreadModelData, null, 2)
);

fs.writeFileSync(
  path.join(modelsDir, 'total_model_gbm.json'),
  JSON.stringify(totalModelData, null, 2)
);

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                  GRADIENT BOOSTING COMPLETE! 🎉               ║
╚═══════════════════════════════════════════════════════════════╝

  📊 FINAL RESULTS:
  
  Spread MAE: ${spreadMAE.toFixed(3)} points ${spreadMAE < 10 ? '🎯 UNDER 10 TARGET MET!' : spreadMAE < 11 ? '✅ Under 11!' : ''}
  Total MAE:  ${totalMAE.toFixed(3)} points ${totalMAE < 13 ? '🎯 UNDER 13 TARGET MET!' : ''}
  
  Improvement vs Linear (12.01/14.53):
    Spread: ${((12.01 - spreadMAE) / 12.01 * 100).toFixed(1)}% better
    Total:  ${((14.53 - totalMAE) / 14.53 * 100).toFixed(1)}% better
  
  💾 Models saved:
    - spread_model_gbm.json (${spreadGBM.trees.length} trees)
    - total_model_gbm.json (${totalGBM.trees.length} trees)
  
  Features: 24 core features (optimized for speed & accuracy)
  Trees: ${spreadGBM.trees.length} per model
`);
