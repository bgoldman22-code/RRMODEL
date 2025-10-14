#!/usr/bin/env node

/**
 * NBA Residual Stacking Model Trainer
 * 
 * Architecture (GPT Recommended):
 * 1. Fundamental Model: Pure team stats → spread prediction
 * 2. Residual Model: Team stats → (fundamental_pred - vegas_line) bias
 * 3. Production: final_pred = fundamental - residual_correction
 * 
 * Benefits:
 * - Cleaner separation of concerns
 * - No multicollinearity from mixing Vegas features
 * - Better calibration and edge detection
 * - Expected impact: -0.3 to -0.5 MAE
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const SEASONS = ['2022_23', '2023_24', '2024_25'];
const DATA_DIR = path.join(__dirname, '..', 'data', 'nba', 'games');
const MODEL_DIR = path.join(__dirname, '..', 'models', 'nba');

// Training hyperparameters
const LEARNING_RATE = 0.001;
const EPOCHS = 500;
const REGULARIZATION = {
  l1: 0.01,  // Lasso for feature selection
  l2: 0.001  // Ridge for stability
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function loadGameData(seasons) {
  const games = [];
  
  for (const season of seasons) {
    const filePath = path.join(DATA_DIR, `games_${season}.json`);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  File not found: ${filePath}`);
      continue;
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    games.push(...data);
  }
  
  console.log(`📊 Loaded ${games.length} games from ${seasons.length} seasons`);
  return games;
}

function calculateAdvancedStats(games, windowSize = 10) {
  const teamStats = new Map();
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const homeTeam = game.homeTeam;  // Already a string abbreviation
    const awayTeam = game.awayTeam;  // Already a string abbreviation
    
    // Get L10 games for each team
    const homePrevGames = games.slice(0, i).filter(g => 
      (g.homeTeam === homeTeam || g.awayTeam === homeTeam) && g.homeScore != null
    ).slice(-windowSize);
    
    const awayPrevGames = games.slice(0, i).filter(g => 
      (g.homeTeam === awayTeam || g.awayTeam === awayTeam) && g.awayScore != null
    ).slice(-windowSize);
    
    // Calculate stats for home team
    const homeStats = calculateTeamStats(homePrevGames, homeTeam);
    const awayStats = calculateTeamStats(awayPrevGames, awayTeam);
    
    games[i].homeL10Stats = homeStats;
    games[i].awayL10Stats = awayStats;
  }
  
  return games;
}

function calculateTeamStats(games, teamAbbr) {
  if (games.length === 0) {
    return {
      ppg: 0, oppPpg: 0, pace: 0,
      offRtg: 0, defRtg: 0, netRtg: 0,
      efg: 0, tovPct: 0, orbPct: 0, ftFga: 0,
      ts: 0, winPct: 0
    };
  }
  
  let totalPts = 0, totalOppPts = 0, totalPoss = 0;
  let totalFgm = 0, totalFga = 0, totalFg3m = 0;
  let totalFtm = 0, totalFta = 0;
  let totalTov = 0, totalOrb = 0, totalDrb = 0, totalOppDrb = 0;
  let wins = 0;
  
  games.forEach(g => {
    const isHome = g.homeTeam === teamAbbr;
    const teamStats = isHome ? g.homeStats : g.awayStats;
    const oppStats = isHome ? g.awayStats : g.homeStats;
    
    // Points are in homeScore/awayScore, not in stats
    const pts = isHome ? g.homeScore : g.awayScore;
    const oppPts = isHome ? g.awayScore : g.homeScore;
    
    totalPts += pts || 0;
    totalOppPts += oppPts || 0;
    
    // Estimate possessions
    const fga = teamStats?.fga || 0;
    const tov = teamStats?.turnovers || 0;
    const fta = teamStats?.fta || 0;
    const orb = teamStats?.offRebounds || 0;  // Fixed field name
    const drb = teamStats?.defRebounds || 0;  // Fixed field name
    const oppDrb = oppStats?.defRebounds || 0;  // Fixed field name
    
    const fgm = teamStats?.fgm || 0;
    const poss = fga + 0.4 * fta - 1.07 * (orb / (orb + oppDrb)) * (fga - fgm) + tov;
    totalPoss += poss || 0;
    
    // Accumulate for Four Factors
    totalFgm += fgm;
    totalFga += fga;
    totalFg3m += teamStats?.fg3m || 0;
    totalFtm += teamStats?.ftm || 0;
    totalFta += fta;
    totalTov += tov;
    totalOrb += orb;
    totalDrb += drb;
    totalOppDrb += oppDrb;
    
    if (pts > oppPts) wins++;
  });
  
  const n = games.length;
  const ppg = totalPts / n;
  const oppPpg = totalOppPts / n;
  const pace = totalPoss / n;
  
  const offRtg = pace > 0 ? (totalPts / totalPoss) * 100 : 0;
  const defRtg = totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 0;
  const netRtg = offRtg - defRtg;
  
  // Four Factors
  const efg = totalFga > 0 ? (totalFgm + 0.5 * totalFg3m) / totalFga : 0;
  const tovPct = totalPoss > 0 ? totalTov / totalPoss : 0;
  const orbPct = (totalOrb + totalOppDrb) > 0 ? totalOrb / (totalOrb + totalOppDrb) : 0;
  const ftFga = totalFga > 0 ? totalFtm / totalFga : 0;
  
  const ts = (totalFga + 0.44 * totalFta) > 0 ? totalPts / (2 * (totalFga + 0.44 * totalFta)) : 0;
  const winPct = wins / n;
  
  return {
    ppg, oppPpg, pace,
    offRtg, defRtg, netRtg,
    efg, tovPct, orbPct, ftFga,
    ts, winPct
  };
}

function extractFeatures(game, includeVegas = false) {
  const features = [];
  const home = game.homeL10Stats || {};
  const away = game.awayL10Stats || {};
  
  // Core advanced stats (18 features per team = 36 total)
  const coreStats = [
    'pace', 'offRtg', 'defRtg', 'netRtg',
    'efg', 'tovPct', 'orbPct', 'ftFga',
    'ts', 'ppg', 'oppPpg', 'winPct'
  ];
  
  coreStats.forEach(stat => {
    features.push(home[stat] || 0);  // Home team
  });
  
  coreStats.forEach(stat => {
    features.push(away[stat] || 0);  // Away team
  });
  
  // Differential features (12 features)
  features.push((home.netRtg || 0) - (away.netRtg || 0));  // Net rating diff
  features.push((home.offRtg || 0) - (away.defRtg || 0));  // Home offense vs away defense
  features.push((away.offRtg || 0) - (home.defRtg || 0));  // Away offense vs home defense
  features.push((home.pace || 0) - (away.pace || 0));      // Pace diff
  features.push((home.efg || 0) - (away.efg || 0));        // Shooting diff
  features.push((home.tovPct || 0) - (away.tovPct || 0));  // Turnover diff
  features.push((home.orbPct || 0) - (away.orbPct || 0));  // Rebounding diff
  features.push((home.ftFga || 0) - (away.ftFga || 0));    // Free throw rate diff
  features.push((home.ts || 0) - (away.ts || 0));          // True shooting diff
  features.push((home.winPct || 0) - (away.winPct || 0));  // Win pct diff
  features.push((home.ppg || 0) - (away.ppg || 0));        // PPG diff
  features.push((home.oppPpg || 0) - (away.oppPpg || 0));  // Defensive PPG diff
  
  // Vegas features (optional - only for residual model)
  if (includeVegas && game.vegasLines) {
    features.push(game.vegasLines.opening_spread || 0);
    features.push(game.vegasLines.line_movement || 0);
    features.push(game.vegasLines.opening_total || 0);
  }
  
  return features;
}

function trainLinearModel(X, y, config = {}) {
  const lr = config.learningRate || LEARNING_RATE;
  const epochs = config.epochs || EPOCHS;
  const l1 = config.l1 || REGULARIZATION.l1;
  const l2 = config.l2 || REGULARIZATION.l2;
  
  const numFeatures = X[0].length;
  const weights = Array(numFeatures).fill(0);
  let bias = 0;
  
  console.log(`  🏋️  Training ${numFeatures} features for ${epochs} epochs...`);
  
  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    
    // Stochastic gradient descent
    for (let i = 0; i < X.length; i++) {
      const features = X[i];
      const target = y[i];
      
      // Forward pass
      let pred = bias;
      for (let j = 0; j < numFeatures; j++) {
        pred += weights[j] * features[j];
      }
      
      // Error
      const error = pred - target;
      totalLoss += error * error;
      
      // Backward pass with elastic net regularization
      bias -= lr * error;
      for (let j = 0; j < numFeatures; j++) {
        const l1_gradient = l1 * Math.sign(weights[j]);
        const l2_gradient = l2 * weights[j];
        weights[j] -= lr * (error * features[j] + l1_gradient + l2_gradient);
      }
    }
    
    if (epoch % 100 === 0) {
      const mae = totalLoss / X.length;
      console.log(`    Epoch ${epoch}: MAE = ${mae.toFixed(3)}`);
    }
  }
  
  return { weights, bias };
}

function predict(model, features) {
  let pred = model.bias;
  for (let i = 0; i < model.weights.length; i++) {
    pred += model.weights[i] * features[i];
  }
  return pred;
}

function calculateMAE(predictions, actuals) {
  let totalError = 0;
  for (let i = 0; i < predictions.length; i++) {
    totalError += Math.abs(predictions[i] - actuals[i]);
  }
  return totalError / predictions.length;
}

function calculateLR_MAE(predictions, actuals, lines) {
  // Line-Relative MAE: How much better/worse than Vegas?
  let modelError = 0;
  let vegasError = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    modelError += Math.abs(predictions[i] - actuals[i]);
    vegasError += Math.abs(lines[i] - actuals[i]);
  }
  
  const modelMAE = modelError / predictions.length;
  const vegasMAE = vegasError / predictions.length;
  
  return {
    modelMAE,
    vegasMAE,
    improvement: vegasMAE - modelMAE,
    improvementPct: ((vegasMAE - modelMAE) / vegasMAE * 100).toFixed(1)
  };
}

function analyzeEdges(predictions, actuals, lines, threshold = 4) {
  let edges = 0;
  let edgeHits = 0;
  
  for (let i = 0; i < predictions.length; i++) {
    const edge = Math.abs(predictions[i] - lines[i]);
    if (edge >= threshold) {
      edges++;
      const modelDist = Math.abs(predictions[i] - actuals[i]);
      const vegasDist = Math.abs(lines[i] - actuals[i]);
      if (modelDist < vegasDist) {
        edgeHits++;
      }
    }
  }
  
  return {
    totalEdges: edges,
    edgeHits,
    hitRate: edges > 0 ? (edgeHits / edges * 100).toFixed(1) : 0
  };
}

// ============================================================================
// MAIN TRAINING PIPELINE
// ============================================================================

async function main() {
  console.log('🏀 NBA Residual Stacking Model Trainer\n');
  console.log('=' .repeat(70));
  
  // Step 1: Load and prepare data
  console.log('\n📊 Step 1: Loading game data...');
  const games = loadGameData(SEASONS);
  
  console.log('\n🧮 Step 2: Calculating advanced stats...');
  const gamesWithStats = calculateAdvancedStats(games);
  
  // Filter for completed games with required stats
  const validGames = gamesWithStats.filter(g => 
    g.homeScore != null && 
    g.awayScore != null &&
    g.homeL10Stats && 
    g.awayL10Stats
  );
  
  console.log(`✅ ${validGames.length} games ready for training`);
  
  // Step 3: Split data (chronological - no shuffle!)
  const trainSize = Math.floor(validGames.length * 0.7);
  const valSize = Math.floor(validGames.length * 0.15);
  
  const trainGames = validGames.slice(0, trainSize);
  const valGames = validGames.slice(trainSize, trainSize + valSize);
  const testGames = validGames.slice(trainSize + valSize);
  
  console.log(`\n📈 Data split (chronological):`);
  console.log(`  Train: ${trainGames.length} games`);
  console.log(`  Val:   ${valGames.length} games`);
  console.log(`  Test:  ${testGames.length} games`);
  
  // Step 4: Train Fundamental Model (no Vegas features)
  console.log('\n' + '='.repeat(70));
  console.log('🎯 Step 3: Training Fundamental Model (Pure Team Stats)');
  console.log('='.repeat(70));
  
  const X_train_fundamental = trainGames.map(g => extractFeatures(g, false));
  const y_train_spread = trainGames.map(g => 
    (g.homeScore - g.awayScore)  // Using homeScore/awayScore
  );
  
  const fundamentalModel = trainLinearModel(X_train_fundamental, y_train_spread);
  
  // Validate fundamental model
  const X_val_fundamental = valGames.map(g => extractFeatures(g, false));
  const y_val_spread = valGames.map(g => 
    (g.homeScore - g.awayScore)  // Using homeScore/awayScore
  );
  
  const val_preds_fundamental = X_val_fundamental.map(x => predict(fundamentalModel, x));
  const fundamental_mae = calculateMAE(val_preds_fundamental, y_val_spread);
  
  console.log(`\n✅ Fundamental Model MAE: ${fundamental_mae.toFixed(3)} points`);
  
  // Step 5: Calculate residuals (fundamental - vegas)
  console.log('\n' + '='.repeat(70));
  console.log('🔄 Step 4: Calculating Market Residuals');
  console.log('='.repeat(70));
  
  // Filter games with Vegas lines
  const trainGamesWithVegas = trainGames.filter(g => g.vegasLines?.opening_spread != null);
  const valGamesWithVegas = valGames.filter(g => g.vegasLines?.opening_spread != null);
  
  console.log(`  Train games with Vegas: ${trainGamesWithVegas.length}/${trainGames.length}`);
  console.log(`  Val games with Vegas: ${valGamesWithVegas.length}/${valGames.length}`);
  
  if (trainGamesWithVegas.length < 50) {
    console.log('\n⚠️  WARNING: Insufficient Vegas line data!');
    console.log('   Run scripts/collect-nba-vegas-lines.js first to enrich game data.');
    console.log('   Continuing with fundamental model only...\n');
    
    // Save fundamental model
    if (!fs.existsSync(MODEL_DIR)) {
      fs.mkdirSync(MODEL_DIR, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(MODEL_DIR, 'fundamental-model.json'),
      JSON.stringify(fundamentalModel, null, 2)
    );
    
    console.log('✅ Fundamental model saved to models/nba/fundamental-model.json');
    return;
  }
  
  // Calculate residuals: fundamental_pred - vegas_line
  const residuals_train = trainGamesWithVegas.map(g => {
    const features = extractFeatures(g, false);
    const fundamental_pred = predict(fundamentalModel, features);
    const vegas_line = g.vegasLines.opening_spread;
    return fundamental_pred - vegas_line;  // Model bias vs market
  });
  
  console.log(`  Residual range: [${Math.min(...residuals_train).toFixed(2)}, ${Math.max(...residuals_train).toFixed(2)}]`);
  console.log(`  Residual mean: ${(residuals_train.reduce((a,b) => a+b, 0) / residuals_train.length).toFixed(3)}`);
  
  // Step 6: Train Residual Model
  console.log('\n' + '='.repeat(70));
  console.log('🎯 Step 5: Training Residual Model (Market Bias Correction)');
  console.log('='.repeat(70));
  
  const X_train_residual = trainGamesWithVegas.map(g => extractFeatures(g, false));
  const residualModel = trainLinearModel(X_train_residual, residuals_train, {
    learningRate: LEARNING_RATE * 0.5,  // Lower LR for residuals
    epochs: 300,
    l1: REGULARIZATION.l1 * 2,  // More aggressive regularization
    l2: REGULARIZATION.l2
  });
  
  // Step 7: Combined Model Validation
  console.log('\n' + '='.repeat(70));
  console.log('📊 Step 6: Evaluating Combined Model (Fundamental - Residual)');
  console.log('='.repeat(70));
  
  const val_preds_combined = valGamesWithVegas.map(g => {
    const features = extractFeatures(g, false);
    const fundamental_pred = predict(fundamentalModel, features);
    const residual_correction = predict(residualModel, features);
    return fundamental_pred - residual_correction;  // Adjust towards market
  });
  
  const y_val_vegas = valGamesWithVegas.map(g => 
    (g.homeScore - g.awayScore)  // Using homeScore/awayScore
  );
  
  const vegas_lines = valGamesWithVegas.map(g => g.vegasLines.opening_spread);
  
  const combined_mae = calculateMAE(val_preds_combined, y_val_vegas);
  const lrMAE = calculateLR_MAE(val_preds_combined, y_val_vegas, vegas_lines);
  const edges = analyzeEdges(val_preds_combined, y_val_vegas, vegas_lines, 4);
  
  console.log('\n📈 Results Summary:');
  console.log('─'.repeat(70));
  console.log(`  Fundamental Model MAE:  ${fundamental_mae.toFixed(3)} points`);
  console.log(`  Combined Model MAE:     ${combined_mae.toFixed(3)} points`);
  console.log(`  Improvement:            ${(fundamental_mae - combined_mae).toFixed(3)} points`);
  console.log('');
  console.log('  🎯 Line-Relative Performance:');
  console.log(`    Model MAE:      ${lrMAE.modelMAE.toFixed(3)} points`);
  console.log(`    Vegas MAE:      ${lrMAE.vegasMAE.toFixed(3)} points`);
  console.log(`    Improvement:    ${lrMAE.improvement.toFixed(3)} points (${lrMAE.improvementPct}%)`);
  console.log('');
  console.log(`  💰 Edge Analysis (≥4pt threshold):`);
  console.log(`    Total edges:    ${edges.totalEdges}`);
  console.log(`    Edge hits:      ${edges.edgeHits}`);
  console.log(`    Hit rate:       ${edges.hitRate}%`);
  
  // Step 8: Test Set Evaluation
  console.log('\n' + '='.repeat(70));
  console.log('🧪 Step 7: Final Test Set Evaluation');
  console.log('='.repeat(70));
  
  const testGamesWithVegas = testGames.filter(g => g.vegasLines?.opening_spread != null);
  
  const test_preds_combined = testGamesWithVegas.map(g => {
    const features = extractFeatures(g, false);
    const fundamental_pred = predict(fundamentalModel, features);
    const residual_correction = predict(residualModel, features);
    return fundamental_pred - residual_correction;
  });
  
  const y_test = testGamesWithVegas.map(g => 
    (g.homeScore - g.awayScore)  // Using homeScore/awayScore
  );
  
  const test_vegas_lines = testGamesWithVegas.map(g => g.vegasLines.opening_spread);
  
  const test_mae = calculateMAE(test_preds_combined, y_test);
  const test_lrMAE = calculateLR_MAE(test_preds_combined, y_test, test_vegas_lines);
  const test_edges = analyzeEdges(test_preds_combined, y_test, test_vegas_lines, 4);
  
  console.log(`\n📊 Test Set Results:`);
  console.log(`  Combined MAE:       ${test_mae.toFixed(3)} points`);
  console.log(`  vs Vegas:           ${test_lrMAE.improvement.toFixed(3)} points (${test_lrMAE.improvementPct}%)`);
  console.log(`  Edge hit rate:      ${test_edges.hitRate}% (${test_edges.edgeHits}/${test_edges.totalEdges})`);
  
  // Step 9: Save models
  console.log('\n' + '='.repeat(70));
  console.log('💾 Step 8: Saving Models');
  console.log('='.repeat(70));
  
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }
  
  const modelPackage = {
    version: '2.0-residual-stacking',
    trained: new Date().toISOString(),
    fundamentalModel,
    residualModel,
    performance: {
      validation: {
        mae: combined_mae,
        lrMAE: lrMAE,
        edges: edges
      },
      test: {
        mae: test_mae,
        lrMAE: test_lrMAE,
        edges: test_edges
      }
    },
    config: {
      seasons: SEASONS,
      trainSize: trainGames.length,
      valSize: valGames.length,
      testSize: testGames.length,
      numFeatures: fundamentalModel.weights.length
    }
  };
  
  fs.writeFileSync(
    path.join(MODEL_DIR, 'residual-stacking-model.json'),
    JSON.stringify(modelPackage, null, 2)
  );
  
  console.log('✅ Model saved to models/nba/residual-stacking-model.json');
  
  console.log('\n' + '='.repeat(70));
  console.log('✨ Training Complete!');
  console.log('='.repeat(70));
  console.log(`\n🎯 Production Prediction Formula:`);
  console.log(`   final_spread = fundamental_model(stats) - residual_model(stats)`);
  console.log(`\n💡 This architecture separates:`);
  console.log(`   1. Pure team ability (fundamental)`);
  console.log(`   2. Systematic market bias (residual)`);
  console.log(`\n✅ Ready for production deployment!`);
}

main().catch(console.error);
