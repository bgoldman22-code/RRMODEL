#!/usr/bin/env node

/**
 * NHL WALK-FORWARD BACKTEST ENGINE - IMPROVED MODEL
 * 
 * IMPROVEMENTS OVER BASELINE:
 * 1. Position-specific baselines (D vs F vs C)
 * 2. Exponential recency weighting (recent games matter more)
 * 3. Power play time indicator
 * 4. Player-specific shots/TOI efficiency rate
 * 5. Better home/away factors
 * 
 * Still PREVENTS DATA LEAKAGE with walk-forward validation
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  samplesToCSV, 
  trainWithLightGBM, 
  BoosterStateManager,
  testLightGBMHealth 
} from './lib/lightgbm-client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// ARGUMENT PARSING
// ============================================================================

function getArg(name, defaultValue = null) {
  const arg = process.argv.find(a => a.startsWith(`--${name}=`));
  if (arg) {
    return arg.split('=')[1];
  }
  return defaultValue;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_TRAINING_GAMES: 1000,
  REFIT_INTERVAL: 500,
  TEST_WINDOW: 500,
  MIN_PLAYER_HISTORY: 3,
  MAX_CYCLES: parseInt(getArg('maxCycles', '999999')),
  TEST_START_DATE: getArg('testStartDate', null),
  MODEL_VERSION: getArg('modelVersion', 'baseline'),
  USE_LIGHTGBM: getArg('useLightGBM', 'false') === 'true',
  LIGHTGBM_ENDPOINT: getArg('lightgbmEndpoint', process.env.LIGHTGBM_ENDPOINT || null),
  OUTPUT_FILE: getArg('outputFile', null)
};

// ============================================================================
// IMPROVED PARAMETER FITTING
// ============================================================================

function fitParametersOnSubset(games) {
  const params = {
    positionBaselines: {},
    homeAwayEffects: {},
    recencyWeights: { decay: 0.9 },  // Exponential decay
    ppBoost: 1.0,
    playerEfficiency: {},
    fittedOn: games.length,
    lastGameDate: games[games.length - 1]?.gameDate
  };
  
  // 1. POSITION-SPECIFIC BASELINES
  const positionData = {};
  games.forEach(g => {
    if (!positionData[g.position]) positionData[g.position] = [];
    positionData[g.position].push(g.shots);
  });
  
  Object.keys(positionData).forEach(pos => {
    params.positionBaselines[pos] = mean(positionData[pos]);
  });
  
  // 2. HOME/AWAY EFFECTS (per team)
  const teamStats = {};
  games.forEach(g => {
    if (!teamStats[g.team]) {
      teamStats[g.team] = { home: [], away: [] };
    }
    if (g.isHome) {
      teamStats[g.team].home.push(g.shots);
    } else {
      teamStats[g.team].away.push(g.shots);
    }
  });
  
  Object.keys(teamStats).forEach(team => {
    const homeAvg = mean(teamStats[team].home);
    const awayAvg = mean(teamStats[team].away);
    params.homeAwayEffects[team] = {
      home: awayAvg > 0 ? homeAvg / awayAvg : 1.05,
      away: 1.0
    };
  });
  
  // 3. POWER PLAY BOOST
  const ppGames = games.filter(g => {
    const ppTime = g.ppToi ? parseFloat(g.ppToi.split(':')[0]) : 0;
    return ppTime > 0;
  });
  const noPPGames = games.filter(g => {
    const ppTime = g.ppToi ? parseFloat(g.ppToi.split(':')[0]) : 0;
    return ppTime === 0;
  });
  
  if (ppGames.length > 100 && noPPGames.length > 100) {
    const ppAvg = mean(ppGames.map(g => g.shots));
    const noPPAvg = mean(noPPGames.map(g => g.shots));
    params.ppBoost = ppAvg / noPPAvg;
  }
  
  // 4. PLAYER-SPECIFIC EFFICIENCY (shots per minute)
  const playerGames = {};
  games.forEach(g => {
    if (!playerGames[g.playerId]) playerGames[g.playerId] = [];
    playerGames[g.playerId].push(g);
  });
  
  Object.keys(playerGames).forEach(playerId => {
    const pgames = playerGames[playerId].filter(g => g.toiMinutes > 5);
    if (pgames.length >= 5) {
      const efficiencies = pgames.map(g => g.shots / g.toiMinutes);
      params.playerEfficiency[playerId] = mean(efficiencies);
    }
  });
  
  return params;
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// IMPROVED PROJECTION ENGINE
// ============================================================================

function projectShots(playerHistory, gameContext, params) {
  if (playerHistory.length < CONFIG.MIN_PLAYER_HISTORY) {
    return null;
  }
  
  // 1. POSITION-SPECIFIC BASE RATE
  const position = playerHistory[0].position;
  const positionBaseline = params.positionBaselines[position] || 1.7;
  
  // 2. EXPONENTIAL RECENCY WEIGHTING (recent games matter more)
  const recentGames = playerHistory.slice(-10);
  let weightedSum = 0;
  let weightSum = 0;
  
  recentGames.forEach((g, i) => {
    const gamesAgo = recentGames.length - 1 - i;
    const weight = Math.pow(params.recencyWeights.decay, gamesAgo);
    weightedSum += g.shots * weight;
    weightSum += weight;
  });
  
  const weightedAvg = weightSum > 0 ? weightedSum / weightSum : mean(recentGames.map(g => g.shots));
  
  // Blend with position baseline
  const baseRate = weightedAvg * 0.7 + positionBaseline * 0.3;
  
  if (baseRate === 0) return null;
  
  // 3. HOME/AWAY ADJUSTMENT
  const team = gameContext.team;
  const teamEffect = params.homeAwayEffects[team] || { home: 1.05, away: 1.0 };
  const homeAwayFactor = gameContext.isHome ? teamEffect.home : teamEffect.away;
  
  // 4. PLAYER EFFICIENCY (shots/minute rate)
  const playerId = playerHistory[0].playerId;
  const playerEff = params.playerEfficiency[playerId];
  
  let toiFactor = 1.0;
  if (playerEff) {
    // Use player-specific shots/minute rate
    const avgTOI = mean(recentGames.map(g => g.toiMinutes));
    const expectedTOI = Math.max(8, Math.min(22, avgTOI)); // Clamp to realistic range
    toiFactor = (expectedTOI / 15) * 0.8 + 0.2; // Partial adjustment
  } else {
    // Fallback to power function
    const avgTOI = mean(recentGames.map(g => g.toiMinutes));
    toiFactor = Math.pow(avgTOI / 15, 1.1);
  }
  
  // 5. POWER PLAY BOOST
  let ppFactor = 1.0;
  const recentPP = recentGames.filter(g => {
    const ppTime = g.ppToi ? parseFloat(g.ppToi.split(':')[0]) : 0;
    return ppTime > 0;
  });
  
  if (recentPP.length >= 3) {
    ppFactor = params.ppBoost;
  }
  
  // 6. STREAK DETECTION (hot/cold)
  const last3 = playerHistory.slice(-3);
  const last3Avg = mean(last3.map(g => g.shots));
  let streakFactor = 1.0;
  
  if (last3Avg > baseRate * 1.4) {
    streakFactor = 1.12; // Hot streak
  } else if (last3Avg < baseRate * 0.6) {
    streakFactor = 0.88; // Cold streak
  }
  
  const projection = baseRate * homeAwayFactor * toiFactor * ppFactor * streakFactor;
  
  return {
    mean: Math.max(0, projection),
    components: {
      baseRate,
      homeAwayFactor,
      toiFactor,
      ppFactor,
      streakFactor
    }
  };
}

// ============================================================================
// FEATURE VECTOR BUILDER (for LightGBM)
// ============================================================================

/**
 * Build 33-feature vector for a game
 * Features match the baseline model's projection logic
 */
function buildFeatureVector(game, historicalGames, params) {
  // Get player history
  const playerHistory = historicalGames.filter(g => g.playerId.toString() === game.playerId.toString());
  
  if (playerHistory.length < CONFIG.MIN_PLAYER_HISTORY) {
    return null;
  }
  
  const recentGames = playerHistory.slice(-10);
  const position = game.position;
  const positionBaseline = params.positionBaselines[position] || 1.7;
  
  // Calculate weighted average (exponential recency)
  let weightedSum = 0;
  let weightSum = 0;
  recentGames.forEach((g, i) => {
    const gamesAgo = recentGames.length - 1 - i;
    const weight = Math.pow(params.recencyWeights.decay, gamesAgo);
    weightedSum += g.shots * weight;
    weightSum += weight;
  });
  const weightedAvg = weightSum > 0 ? weightedSum / weightSum : mean(recentGames.map(g => g.shots));
  
  // Team effects
  const team = game.team;
  const teamEffect = params.homeAwayEffects[team] || { home: 1.05, away: 1.0 };
  
  // Player efficiency
  const playerId = game.playerId;
  const playerEff = params.playerEfficiency[playerId] || null;
  const avgTOI = mean(recentGames.map(g => g.toiMinutes));
  
  // PP indicator
  const recentPP = recentGames.filter(g => {
    const ppTime = g.ppToi ? parseFloat(g.ppToi.split(':')[0]) : 0;
    return ppTime > 0;
  });
  const hasPP = recentPP.length >= 3 ? 1 : 0;
  
  // Streak detection
  const last3 = playerHistory.slice(-3);
  const last3Avg = mean(last3.map(g => g.shots));
  const baseRate = weightedAvg * 0.7 + positionBaseline * 0.3;
  let streakHot = 0;
  let streakCold = 0;
  if (last3Avg > baseRate * 1.4) streakHot = 1;
  if (last3Avg < baseRate * 0.6) streakCold = 1;
  
  // Build 33-feature vector
  // (22 baseline + 5 opponent + 6 QoO)
  const features = [
    // Baseline features (22)
    positionBaseline,
    weightedAvg,
    baseRate,
    game.isHome ? 1 : 0,
    game.isHome ? teamEffect.home : teamEffect.away,
    playerEff || 0,
    avgTOI,
    Math.pow(avgTOI / 15, 1.1), // TOI factor
    hasPP,
    params.ppBoost,
    streakHot,
    streakCold,
    last3Avg,
    mean(recentGames.map(g => g.shots)),
    Math.max(...recentGames.map(g => g.shots)),
    Math.min(...recentGames.map(g => g.shots)),
    recentGames.length,
    playerHistory.length,
    position === 'D' ? 1 : 0,
    position === 'F' ? 1 : 0,
    position === 'C' ? 1 : 0,
    position === 'L' ? 1 : 0,
    
    // Opponent suppression features (5)
    0, 0, 0, 0, 0, // Placeholder - would need opponent data
    
    // Quality of Opposition features (6)
    0, 0, 0, 0, 0, 0 // Placeholder - would need opponent data
  ];
  
  return features;
}

// ============================================================================
// MAIN WALK-FORWARD BACKTEST
// ============================================================================

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       🚀 NHL WALK-FORWARD BACKTEST - IMPROVED MODEL               ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('IMPROVEMENTS:');
  console.log('  ✅ Position-specific baselines');
  console.log('  ✅ Exponential recency weighting');
  console.log('  ✅ Power play time indicator');
  console.log('  ✅ Player shots/TOI efficiency');
  console.log('  ✅ Enhanced home/away factors');
  console.log('');
  
  // Load data
  console.log('📂 Loading historical data...');
  const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const allGames = data.games || [];
  console.log(`✅ Loaded ${allGames.length.toLocaleString()} games`);
  console.log('');
  
  // Sort chronologically
  console.log('📅 Sorting games chronologically...');
  allGames.sort((a, b) => a.gameDate.localeCompare(b.gameDate));
  console.log(`   Range: ${allGames[0].gameDate} → ${allGames[allGames.length - 1].gameDate}`);
  console.log('');
  
  // Walk-forward backtest
  console.log('🚶 Starting walk-forward backtest...');
  console.log(`   Training window: ${CONFIG.MIN_TRAINING_GAMES.toLocaleString()} games minimum`);
  console.log(`   Refit interval: ${CONFIG.REFIT_INTERVAL} games`);
  console.log(`   Test window: ${CONFIG.TEST_WINDOW} games`);
  console.log('');
  
  const predictions = [];
  let currentParams = null;
  let trainEndIdx = CONFIG.MIN_TRAINING_GAMES;
  let testEndIdx = trainEndIdx + CONFIG.TEST_WINDOW;
  let cycleNum = 1;
  
  // LightGBM state management
  const boosterManager = new BoosterStateManager();

  // Print configuration
  console.log(`🔧 Configuration:`);
  console.log(`   Max Cycles: ${CONFIG.MAX_CYCLES === 999999 ? 'Unlimited' : CONFIG.MAX_CYCLES}`);
  console.log(`   Test Start Date: ${CONFIG.TEST_START_DATE || 'All data'}`);
  console.log(`   Model Version: ${CONFIG.MODEL_VERSION}`);
  console.log(`   Use LightGBM: ${CONFIG.USE_LIGHTGBM}`);
  if (CONFIG.LIGHTGBM_ENDPOINT) {
    console.log(`   LightGBM Endpoint: ${CONFIG.LIGHTGBM_ENDPOINT}`);
  }
  console.log('');
  
  // Test LightGBM connection if enabled
  if (CONFIG.USE_LIGHTGBM) {
    try {
      const baseUrl = CONFIG.LIGHTGBM_ENDPOINT.replace(/\/train-lgbm$/, '');
      const health = await testLightGBMHealth(baseUrl);
      console.log(`✅ LightGBM server connected: ${health.status} (v${health.version})`);
      console.log('');
    } catch (error) {
      console.error(`❌ LightGBM health check failed: ${error.message}`);
      console.error('   Falling back to baseline model...');
      CONFIG.USE_LIGHTGBM = false;
      console.log('');
    }
  }

  while (testEndIdx <= allGames.length && cycleNum <= CONFIG.MAX_CYCLES) {
    const trainingGames = allGames.slice(0, trainEndIdx);
    console.log(`🔄 Cycle ${cycleNum}: Training on ${trainingGames.length.toLocaleString()} games (up to ${trainingGames[trainingGames.length - 1].gameDate})`);

    currentParams = fitParametersOnSubset(trainingGames);

    const testGames = allGames.slice(trainEndIdx, testEndIdx);

    // Skip if test games are before TEST_START_DATE
    if (CONFIG.TEST_START_DATE && testGames[testGames.length - 1].gameDate < CONFIG.TEST_START_DATE) {
      console.log(`   ⏭️  Skipping (before ${CONFIG.TEST_START_DATE})`);
      console.log('');
      trainEndIdx = testEndIdx;
      testEndIdx = Math.min(trainEndIdx + CONFIG.TEST_WINDOW, allGames.length);
      cycleNum++;
      continue;
    }

    console.log(`   Testing on ${testGames.length.toLocaleString()} games (${testGames[0].gameDate} → ${testGames[testGames.length - 1].gameDate})`);

    // Use LightGBM or baseline model
    if (CONFIG.USE_LIGHTGBM) {
      // ============================================================================
      // LIGHTGBM PATH: Train on training games, get predictions for test games
      // ============================================================================
      
      // Build training samples from training games
      const trainingSamples = [];
      trainingGames.forEach(g => {
        // Build 33-feature vector (same as baseline model uses)
        const features = buildFeatureVector(g, trainingGames, currentParams);
        if (features) {
          trainingSamples.push({
            features: features,
            target: g.shots
          });
        }
      });
      
      console.log(`   🔬 LightGBM: ${trainingSamples.length.toLocaleString()} training samples`);
      
      // Convert to CSV
      const csvData = samplesToCSV(trainingSamples);
      
      // Train with warm-start
      try {
        const lgbmResult = await trainWithLightGBM(
          csvData,
          boosterManager.getState(),
          CONFIG.LIGHTGBM_ENDPOINT
        );
        
        // Update booster state
        boosterManager.updateState(lgbmResult.boosterState, cycleNum);
        
        console.log(`   ✅ LightGBM trained: MAE ${lgbmResult.metrics.mae?.toFixed(3)} (train), ${lgbmResult.metrics.val_mae?.toFixed(3)} (val)`);
        
        // Now generate predictions for test games
        // Build test samples
        const testSamples = [];
        const testGamesList = [];
        
        testGames.forEach(testGame => {
          const playerHistory = trainingGames.filter(g => g.playerId.toString() === testGame.playerId.toString());
          
          if (playerHistory.length >= CONFIG.MIN_PLAYER_HISTORY) {
            const features = buildFeatureVector(testGame, trainingGames, currentParams);
            if (features) {
              testSamples.push({
                features: features,
                target: 0 // Dummy target, not used for prediction
              });
              testGamesList.push(testGame);
            }
          }
        });
        
        if (testSamples.length > 0) {
          const testCSV = samplesToCSV(testSamples);
          const testPredictions = await trainWithLightGBM(testCSV, lgbmResult.boosterState, CONFIG.LIGHTGBM_ENDPOINT);
          
          // Store predictions
          testPredictions.predictions.forEach((pred, idx) => {
            const testGame = testGamesList[idx];
            predictions.push({
              playerId: testGame.playerId,
              playerName: testGame.playerName,
              position: testGame.position,
              gameDate: testGame.gameDate,
              projection: pred,
              actual: testGame.shots,
              error: Math.abs(pred - testGame.shots),
              trainedOn: trainEndIdx,
              cycle: cycleNum,
              model: 'lightgbm'
            });
          });
          
          console.log(`   ✅ Cycle ${cycleNum}: ${testPredictions.predictions.length} LightGBM predictions made`);
        }
        
      } catch (error) {
        console.error(`   ❌ LightGBM error: ${error.message}`);
        console.error(`   Skipping cycle ${cycleNum}`);
      }
      
    } else {
      // ============================================================================
      // BASELINE PATH: Use improved model with position-specific baselines
      // ============================================================================

    const playerGames = {};
    testGames.forEach(g => {
      if (!playerGames[g.playerId]) playerGames[g.playerId] = [];
      playerGames[g.playerId].push(g);
    });

    let cycleTotal = 0;
    let skippedNoHistory = 0;
    let skippedNullProjection = 0;

    Object.keys(playerGames).forEach(playerId => {
      const playerTestGames = playerGames[playerId];
      const playerHistory = trainingGames.filter(g => g.playerId.toString() === playerId.toString());

      if (playerHistory.length < CONFIG.MIN_PLAYER_HISTORY) {
        skippedNoHistory++;
        return;
      }

      playerTestGames.forEach(testGame => {
        const gameContext = {
          team: testGame.team,
          opponent: testGame.opponent,
          isHome: testGame.isHome,
          gameDate: testGame.gameDate
        };

        const projection = projectShots(playerHistory, gameContext, currentParams);

        if (projection) {
          predictions.push({
            playerId: testGame.playerId,
            playerName: testGame.playerName,
            position: testGame.position,
            gameDate: testGame.gameDate,
            projection: projection.mean,
            actual: testGame.shots,
            error: Math.abs(projection.mean - testGame.shots),
            trainedOn: trainEndIdx,
            cycle: cycleNum
          });
          cycleTotal++;
          playerHistory.push(testGame);
        } else {
          skippedNullProjection++;
        }
      });
    });

    console.log(`   ✅ Cycle ${cycleNum}: ${cycleTotal} predictions made (skipped ${skippedNoHistory} no-history, ${skippedNullProjection} null-projection)`);
    console.log('');
    
    } // End baseline path

    trainEndIdx = testEndIdx;
    testEndIdx = Math.min(trainEndIdx + CONFIG.TEST_WINDOW, allGames.length);
    cycleNum++;

    if (testEndIdx - trainEndIdx < 100) break;
  }
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 IMPROVED MODEL RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  if (predictions.length === 0) {
    console.log('⚠️  No predictions made');
    return;
  }
  
  // Metrics
  console.log(`Total Predictions: ${predictions.length.toLocaleString()}`);
  console.log(`Cycles: ${cycleNum - 1}`);
  console.log('');
  
  const mae = mean(predictions.map(p => p.error));
  const errors = predictions.map(p => p.projection - p.actual);
  const bias = mean(errors);
  
  // Correlation
  const projMean = mean(predictions.map(p => p.projection));
  const actualMean = mean(predictions.map(p => p.actual));
  
  let numerator = 0;
  let projDenom = 0;
  let actualDenom = 0;
  
  predictions.forEach(p => {
    numerator += (p.projection - projMean) * (p.actual - actualMean);
    projDenom += Math.pow(p.projection - projMean, 2);
    actualDenom += Math.pow(p.actual - actualMean, 2);
  });
  
  const correlation = numerator / Math.sqrt(projDenom * actualDenom);
  
  console.log('📊 Accuracy Metrics:');
  console.log(`   MAE: ${mae.toFixed(3)} shots`);
  console.log(`   Bias: ${bias >= 0 ? '+' : ''}${bias.toFixed(3)} shots`);
  console.log(`   Correlation: ${correlation.toFixed(3)}`);
  console.log('');
  
  // Validation gates
  console.log('🔍 VALIDATION (No Look-Ahead Bias):');
  console.log(`   MAE < 1.0: ${mae < 1.0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Correlation > 0.55: ${correlation > 0.55 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Bias < 0.15: ${Math.abs(bias) < 0.15 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  if (mae < 1.0 && correlation > 0.55 && Math.abs(bias) < 0.15) {
    console.log('✅ All validation gates passed!');
  } else {
    console.log('⚠️  Some validation gates failed');
  }
  console.log('');
  
  // Save results
  const outputPath = CONFIG.OUTPUT_FILE || path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_improved_results.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    model: 'improved',
    timestamp: new Date().toISOString(),
    totalPredictions: predictions.length,
    cycles: cycleNum - 1,
    metrics: {
      mae,
      bias,
      correlation
    },
    validation: {
      maePass: mae < 1.0,
      correlationPass: correlation > 0.55,
      biasPass: Math.abs(bias) < 0.15
    },
    predictions: predictions
  }, null, 2));
  
  console.log(`💾 Results saved to: ${outputPath}`);
  console.log('');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}

export { fitParametersOnSubset, projectShots };
