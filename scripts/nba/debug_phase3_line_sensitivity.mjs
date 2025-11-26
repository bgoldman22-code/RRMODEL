#!/usr/bin/env node
/**
 * Phase 3.5 Line Sensitivity Debugging Script
 * 
 * This script tests how the Phase 3.5 models use the "line" feature by:
 * 1. Loading a real training record for a specific player+market
 * 2. Keeping all other features constant
 * 3. Varying ONLY the line value across a range
 * 4. Running predictions through the production inference engine
 * 5. Outputting a table showing line → probability
 * 
 * Purpose: Prove that the models include line as a feature and show
 * how predicted probability changes as line changes.
 */

import { readFileSync } from 'fs';
import { createInterface } from 'readline';
import { createInferenceEngine } from '../../netlify/functions/_lib/nba-props-engine-v3.mjs';
import { augmentLineAwareFeatures } from './_lib/line-feature-utils.mjs';

const TRAINING_FILE = 'data/nba/training/phase3_training_v1_20251124.jsonl';

const PLAYER_OVERRIDES = {
  player_points: process.env.LINE_TEST_PLAYER_POINTS || 'LeBron',
  player_assists: process.env.LINE_TEST_PLAYER_ASSISTS || 'LeBron',
  player_rebounds: process.env.LINE_TEST_PLAYER_REBOUNDS || 'LeBron'
};

/**
 * Load a specific training record for testing
 * We'll look for a high-volume player with plenty of history
 */
function loadTrainingRecord(market, playerName) {
  const lines = readFileSync(TRAINING_FILE, 'utf-8').split('\n').filter(Boolean);
  
  // Find records matching player + market + Over side
  const candidates = lines
    .map(line => JSON.parse(line))
    .filter(record => 
      record.market === market &&
      record.side === 'Over' &&
      record.player.includes(playerName)
    );
  
  if (candidates.length === 0) {
    throw new Error(`No training records found for ${playerName} + ${market}`);
  }
  
  // Return the first match
  return candidates[0];
}

/**
 * Extract features from a training record
 * Returns the features object exactly as it was during training
 */
function extractFeatures(record) {
  // Training records contain all 60+ features as top-level keys
  // We need to extract them into a features object
  const features = {};
  
  const featureKeys = [
    'games_played',
    'L5_games', 'L5_ppg', 'L5_rpg', 'L5_apg', 'L5_pra', 'L5_minutes', 'L5_fga', 'L5_fta',
    'L10_games', 'L10_ppg', 'L10_rpg', 'L10_apg', 'L10_pra', 'L10_minutes', 'L10_fga', 'L10_fta',
    'L20_games', 'L20_ppg', 'L20_rpg', 'L20_apg', 'L20_pra', 'L20_minutes', 'L20_fga', 'L20_fta',
    'L40_games', 'L40_ppg', 'L40_rpg', 'L40_apg', 'L40_pra', 'L40_minutes', 'L40_fga', 'L40_fta',
    'L999_games', 'L999_ppg', 'L999_rpg', 'L999_apg', 'L999_pra', 'L999_minutes', 'L999_fga', 'L999_fta',
    'season_games_played', 'season_ppg', 'season_rpg', 'season_apg', 'season_pra', 'season_minutes', 'season_fga', 'season_fta',
    'h2h_games_played', 'h2h_ppg', 'h2h_rpg', 'h2h_apg', 'h2h_pra', 'h2h_minutes', 'h2h_fga', 'h2h_fta',
    'opp_def_L5_pra_allowed', 'opp_def_L5_ppg_allowed', 'opp_def_L5_rpg_allowed', 'opp_def_L5_apg_allowed',
    'opp_def_L10_pra_allowed', 'opp_def_L10_ppg_allowed', 'opp_def_L10_rpg_allowed', 'opp_def_L10_apg_allowed',
    'rest_days', 'home', 'line'
  ];
  
  for (const key of featureKeys) {
    features[key] = record[key] !== undefined ? record[key] : 0;
  }
  
  return features;
}

/**
 * Test a specific market
 */
async function testMarket(market, playerName, engine) {
  console.log(`\nTesting Market: ${market.toUpperCase()}`);
  console.log('='.repeat(70));
  
  console.log(`Loading training record for: ${playerName} + ${market}`);
  
  const trainingRecord = loadTrainingRecord(market, playerName);
  console.log(`Found record: ${trainingRecord.date} | ${trainingRecord.player} @ ${trainingRecord.opponent}`);
  console.log(`Original line: ${trainingRecord.line}`);
  console.log(`Actual result: ${trainingRecord.actual_value} (${trainingRecord.result ? 'OVER' : 'UNDER'})`);
  
  // 2. Extract base features
  const baseFeatures = extractFeatures(trainingRecord);
  const originalLine = trainingRecord.line;
  
  // 3. Define line range to test
  const lineRange = [
    originalLine - 5,
    originalLine - 3,
    originalLine - 1,
    originalLine,
    originalLine + 1,
    originalLine + 3,
    originalLine + 5
  ];
  
  // 4. Run predictions for each line value
  console.log('\nPlayer:', trainingRecord.player);
  console.log('Market:', market, '(Over)');
  console.log('Date:', trainingRecord.date);
  console.log('Base features: Taken from training row (all features held constant)');
  console.log('\nLine vs Probability (model\'s output):');
  console.log('-'.repeat(50));
  
  const results = [];
  
  for (const testLine of lineRange) {
    // Clone features and update line
    const testFeatures = { ...baseFeatures, line: testLine };
    augmentLineAwareFeatures(testFeatures, market, testLine);
    
    // Run prediction through production engine
    try {
      const prediction = await engine.predict(
        market,
        testFeatures,
        testLine,
        -110, // Standard odds (not used in model, just for edge calc)
        'Over'
      );
      
      results.push({
        line: testLine,
        probability: prediction.prob_win,
        engine: prediction.engine,
        model: prediction.use_this_model
      });
      
      // Format output
      const lineStr = testLine.toFixed(1).padStart(6);
      const probStr = (prediction.prob_win * 100).toFixed(2) + '%';
      const marker = testLine === originalLine ? ' ← ORIGINAL LINE' : '';
      
      console.log(`${lineStr}  →  p(Over) = ${probStr}${marker}`);
      
    } catch (err) {
      console.error(`ERROR at line ${testLine}:`, err.message);
    }
  }
  
  console.log('-'.repeat(50));
  
  // 5. Summary analysis
  console.log('\nAnalysis:');
  console.log('-'.repeat(50));
  
  if (results.length > 1) {
    const firstProb = results[0].probability;
    const lastProb = results[results.length - 1].probability;
    const change = lastProb - firstProb;
    const percentChange = ((change / firstProb) * 100).toFixed(1);
    
    console.log(`✓ Probability changed from ${(firstProb * 100).toFixed(2)}% to ${(lastProb * 100).toFixed(2)}%`);
    console.log(`✓ Total change: ${(change * 100).toFixed(2)} percentage points (${percentChange}% relative)`);
    console.log(`✓ Direction: ${change < 0 ? 'DECREASING' : 'INCREASING'} as line increases`);
    
    if (Math.abs(change) > 0.01) {
      console.log('✓ CONFIRMED: Model is using "line" as a feature.');
      console.log('  Probability changes meaningfully when line changes.');
    } else {
      console.log('⚠ WARNING: Probability barely changed. Line may not be influential.');
    }
  }
  
  console.log('\nEngine used:', results[0]?.engine || 'unknown');
  console.log(`Model used: ${results[0]?.model || 'unknown'}`);
  console.log('='.repeat(70));
}

/**
 * Main test function - tests multiple markets
 */
async function runLineSensitivityTest() {
  console.log('='.repeat(70));
  console.log('Phase 3.5 Line Sensitivity Test');
  console.log('='.repeat(70));
  
  // Create inference engine once
  console.log('\nLoading Phase 3.5 inference engine...');
  const engine = await createInferenceEngine();
  console.log('✓ Engine loaded\n');
  
  // Test Points (LightGBM)
  await testMarket('player_points', PLAYER_OVERRIDES.player_points, engine);
  
  // Test Assists (Logistic PRA)
  await testMarket('player_assists', PLAYER_OVERRIDES.player_assists, engine);
  
  // Test Rebounds (LightGBM)
  await testMarket('player_rebounds', PLAYER_OVERRIDES.player_rebounds, engine);
}

// Run the test
runLineSensitivityTest().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
