#!/usr/bin/env node

/**
 * NHL WALK-FORWARD BACKTEST ENGINE
 * 
 * PREVENTS DATA LEAKAGE by:
 * 1. Sorting all games chronologically
 * 2. Using ONLY past data to fit parameters
 * 3. Testing predictions on FUTURE games
 * 4. Re-fitting parameters periodically (e.g., every 500 games)
 * 
 * This is the ONLY valid way to backtest without look-ahead bias.
 * 
 * Timeline:
 * ├─ Games 1-1000    → Fit parameters v1 → Test on games 1001-1500
 * ├─ Games 1-1500    → Fit parameters v2 → Test on games 1501-2000
 * ├─ Games 1-2000    → Fit parameters v3 → Test on games 2001-2500
 * └─ ...continue until end
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  MIN_TRAINING_GAMES: 1000,      // Minimum games before first prediction
  REFIT_INTERVAL: 500,           // Re-fit parameters every N new games
  TEST_WINDOW: 500,              // Number of games to test per cycle
  MIN_PLAYER_HISTORY: 3          // Min games before predicting player (lowered from 10)
};

// ============================================================================
// PARAMETER FITTING (Simplified for walk-forward)
// ============================================================================

function fitParametersOnSubset(games) {
  /**
   * Fit parameters using ONLY the provided games (past data only)
   * This is a simplified version - uses same logic as fit-parameters.mjs
   * but constrained to a temporal subset
   */
  
  // Group by player
  const playerGames = {};
  games.forEach(g => {
    if (!playerGames[g.playerId]) playerGames[g.playerId] = [];
    playerGames[g.playerId].push(g);
  });
  
  // Calculate simple statistics (expand this to match fit-parameters.mjs)
  const params = {
    homeAwayEffects: {},
    toiCurve: { exponent: 1.2 },
    streakEffects: { hot: 1.15, cold: 0.85 },
    dispersion: { forward: 1.1, defenseman: 1.2 },
    fittedOn: games.length,
    lastGameDate: games[games.length - 1]?.gameDate
  };
  
  // Home/away per team
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
  
  // TOI curve (simplified - would do regression)
  const toiPairs = games.filter(g => g.toiMinutes > 0 && g.shots >= 0)
    .map(g => ({ toi: g.toiMinutes, shots: g.shots }));
  
  if (toiPairs.length > 100) {
    // Fit power law: shots ~ TOI^exponent
    // Simplified: just use correlation-based estimate
    params.toiCurve.exponent = 1.2; // Would calculate via regression
  }
  
  return params;
}

function mean(arr) {
  if (!arr || arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ============================================================================
// PROJECTION ENGINE
// ============================================================================

function projectShots(playerHistory, gameContext, params) {
  /**
   * Make prediction using ONLY:
   * - playerHistory: games BEFORE the target game
   * - params: fitted on games BEFORE the target game
   */
  
  if (playerHistory.length < CONFIG.MIN_PLAYER_HISTORY) {
    return null; // Not enough history
  }
  
  // Base rate (last 10 games)
  const last10 = playerHistory.slice(-10);
  const baseRate = mean(last10.map(g => g.shots));
  
  if (baseRate === 0) return null;
  
  // Home/away adjustment
  const team = gameContext.team;
  const teamEffect = params.homeAwayEffects[team] || { home: 1.05, away: 1.0 };
  const homeAwayFactor = gameContext.isHome ? teamEffect.home : teamEffect.away;
  
  // TOI adjustment
  const avgTOI = mean(last10.map(g => g.toiMinutes));
  const toiFactor = Math.pow(avgTOI / 15, params.toiCurve.exponent);
  
  // Streak (last 5 games)
  const last5 = playerHistory.slice(-5);
  const last5Avg = mean(last5.map(g => g.shots));
  let streakFactor = 1.0;
  
  if (last5Avg > baseRate * 1.3) {
    streakFactor = params.streakEffects.hot;
  } else if (last5Avg < baseRate * 0.7) {
    streakFactor = params.streakEffects.cold;
  }
  
  const projection = baseRate * homeAwayFactor * toiFactor * streakFactor;
  
  return {
    mean: projection,
    components: { baseRate, homeAwayFactor, toiFactor, streakFactor }
  };
}

// ============================================================================
// WALK-FORWARD BACKTEST
// ============================================================================

async function runWalkForwardBacktest() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║                                                                    ║');
  console.log('║       🚶 NHL WALK-FORWARD BACKTEST (No Look-Ahead Bias)           ║');
  console.log('║                                                                    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  // Load data
  console.log('📂 Loading historical data...');
  const dataPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
  
  if (!fs.existsSync(dataPath)) {
    console.error('❌ historical_game_data.json not found');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const allGames = data.games || [];
  
  console.log(`✅ Loaded ${allGames.length.toLocaleString()} games`);
  console.log('');
  
  // CRITICAL: Sort chronologically
  console.log('📅 Sorting games chronologically...');
  allGames.sort((a, b) => new Date(a.gameDate) - new Date(b.gameDate));
  
  const firstDate = allGames[0]?.gameDate;
  const lastDate = allGames[allGames.length - 1]?.gameDate;
  console.log(`   Range: ${firstDate} → ${lastDate}`);
  console.log('');
  
  // Walk-forward loop
  console.log('🚶 Starting walk-forward backtest...');
  console.log(`   Training window: ${CONFIG.MIN_TRAINING_GAMES} games minimum`);
  console.log(`   Refit interval: ${CONFIG.REFIT_INTERVAL} games`);
  console.log(`   Test window: ${CONFIG.TEST_WINDOW} games`);
  console.log('');
  
  const predictions = [];
  let currentParams = null;
  let trainEndIdx = CONFIG.MIN_TRAINING_GAMES;
  let testEndIdx = trainEndIdx + CONFIG.TEST_WINDOW;
  let cycleNum = 1;
  
  while (testEndIdx <= allGames.length) {
    // Fit parameters on training data (all games up to trainEndIdx)
    const trainingGames = allGames.slice(0, trainEndIdx);
    console.log(`🔄 Cycle ${cycleNum}: Training on ${trainingGames.length.toLocaleString()} games (up to ${trainingGames[trainingGames.length - 1].gameDate})`);
    
    currentParams = fitParametersOnSubset(trainingGames);
    
    // Test on next TEST_WINDOW games
    const testGames = allGames.slice(trainEndIdx, testEndIdx);
    console.log(`   Testing on ${testGames.length.toLocaleString()} games (${testGames[0].gameDate} → ${testGames[testGames.length - 1].gameDate})`);
    
    // Group test games by player
    const playerGames = {};
    testGames.forEach(g => {
      if (!playerGames[g.playerId]) playerGames[g.playerId] = [];
      playerGames[g.playerId].push(g);
    });
    
    // Make predictions
    let cycleCorrect = 0;
    let cycleTotal = 0;
    let skippedNoHistory = 0;
    let skippedNullProjection = 0;
    
    Object.keys(playerGames).forEach(playerId => {
      const playerTestGames = playerGames[playerId];
      
      // Get player's history from training data
      const playerHistory = trainingGames.filter(g => g.playerId.toString() === playerId.toString());
      
      if (playerHistory.length < CONFIG.MIN_PLAYER_HISTORY) {
        skippedNoHistory++;
        return; // Skip - not enough history
      }
      
      // Predict each test game
      playerTestGames.forEach(testGame => {
        const gameContext = {
          team: testGame.team,
          opponent: testGame.opponent,
          isHome: testGame.isHome,
          gameDate: testGame.gameDate
        };
        
        const projection = projectShots(playerHistory, gameContext, currentParams);
        
        if (projection) {
          const pred = {
            playerId: testGame.playerId,
            playerName: testGame.playerName,
            gameDate: testGame.gameDate,
            projection: projection.mean,
            actual: testGame.shots,
            error: Math.abs(projection.mean - testGame.shots),
            trainedOn: trainEndIdx,
            cycle: cycleNum
          };
          
          predictions.push(pred);
          cycleTotal++;
          
          // Update player history for next prediction in this cycle
          playerHistory.push(testGame);
        } else {
          skippedNullProjection++;
        }
      });
    });
    
    console.log(`   ✅ Cycle ${cycleNum}: ${cycleTotal} predictions made (skipped ${skippedNoHistory} no-history, ${skippedNullProjection} null-projection)`);
    console.log('');
    
    // Move to next cycle
    trainEndIdx = testEndIdx;
    testEndIdx = Math.min(trainEndIdx + CONFIG.TEST_WINDOW, allGames.length);
    cycleNum++;
    
    // Safety: stop if not enough data for next test
    if (testEndIdx - trainEndIdx < 100) break;
  }
  
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('📊 WALK-FORWARD BACKTEST RESULTS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  
  if (predictions.length === 0) {
    console.log('⚠️  No predictions made (insufficient data)');
    return;
  }
  
  // Calculate metrics
  const mae = mean(predictions.map(p => p.error));
  const errors = predictions.map(p => p.projection - p.actual);
  const bias = mean(errors);
  
  // Correlation
  const projMean = mean(predictions.map(p => p.projection));
  const actualMean = mean(predictions.map(p => p.actual));
  
  let num = 0, denProj = 0, denActual = 0;
  predictions.forEach(p => {
    const projDiff = p.projection - projMean;
    const actualDiff = p.actual - actualMean;
    num += projDiff * actualDiff;
    denProj += projDiff * projDiff;
    denActual += actualDiff * actualDiff;
  });
  
  const correlation = num / Math.sqrt(denProj * denActual);
  
  console.log(`Total Predictions: ${predictions.length.toLocaleString()}`);
  console.log(`Cycles: ${cycleNum - 1}`);
  console.log('');
  console.log(`📊 Accuracy Metrics:`);
  console.log(`   MAE: ${mae.toFixed(3)} shots`);
  console.log(`   Bias: ${bias >= 0 ? '+' : ''}${bias.toFixed(3)} shots`);
  console.log(`   Correlation: ${correlation.toFixed(3)}`);
  console.log('');
  
  // Validation
  const maeOK = mae < 1.0;
  const corrOK = correlation > 0.55;
  const biasOK = Math.abs(bias) < 0.15;
  
  console.log('🔍 VALIDATION (No Look-Ahead Bias):');
  console.log(`   MAE < 1.0: ${maeOK ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Correlation > 0.55: ${corrOK ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`   Bias < 0.15: ${biasOK ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
  
  if (maeOK && corrOK && biasOK) {
    console.log('✅ MODEL VALIDATED (No data leakage)');
  } else {
    console.log('⚠️  Model needs improvement');
  }
  console.log('');
  
  // Save results
  const results = {
    totalPredictions: predictions.length,
    cycles: cycleNum - 1,
    config: CONFIG,
    metrics: {
      mae,
      bias,
      correlation
    },
    validation: {
      maePass: maeOK,
      corrPass: corrOK,
      biasPass: biasOK
    },
    metadata: {
      method: 'walk-forward (expanding window)',
      leakagePrevention: 'chronological order, past-only training',
      timestamp: new Date().toISOString()
    }
  };
  
  const outputPath = path.join(REPO_ROOT, 'data/nhl/walkforward_backtest_results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`💾 Results saved to: ${outputPath}`);
  console.log('');
}

// Run
if (import.meta.url === `file://${process.argv[1]}`) {
  runWalkForwardBacktest().catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
}

export { runWalkForwardBacktest };
