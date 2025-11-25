#!/usr/bin/env node
/**
 * Phase 3.5 - LightGBM Threshold ROI Analyzer
 * 
 * This script performs a comprehensive threshold sweep analysis on the 6 trained
 * LightGBM models (points/rebounds/assists × over/under) to identify:
 * - Optimal confidence thresholds per market
 * - Volume vs accuracy tradeoffs
 * - ROI regions (especially to rediscover the profitable Assists zones)
 * 
 * ZERO-LEAKAGE GUARANTEE:
 * - Only evaluates on TEST SET examples (dates after training cutoff)
 * - Uses pre-trained LightGBM models (no retraining)
 * - Read-only access to training data
 * - Temporal ordering preserved (no shuffling)
 * 
 * Process:
 * 1. Load phase3_training_v1_20251124.jsonl
 * 2. Load all 6 LightGBM models
 * 3. Generate predictions for test set only
 * 4. Sweep thresholds [0.50, 0.52, 0.54, 0.56, 0.58, 0.60]
 * 5. Calculate ROI using actual historical odds
 * 6. Save detailed and summary results
 * 
 * Outputs:
 * - data/nba/backtests/phase3_lgbm_thresholds_raw_v1_YYYYMMDD.json (all bets)
 * - data/nba/backtests/phase3_lgbm_thresholds_summary_v1_YYYYMMDD.json (aggregated)
 * 
 * Usage:
 *   node scripts/nba/backtest-lgbm-thresholds.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.join(__dirname, '..', '..');

// Paths
const TRAINING_FILE = path.join(REPO_ROOT, 'data', 'nba', 'training', 'phase3_training_v1_20251125.jsonl');  // UPDATED
const MODEL_DIR = path.join(REPO_ROOT, 'data', 'nba', 'models', 'phase3_lgbm');
const OUTPUT_DIR = path.join(REPO_ROOT, 'data', 'nba', 'backtests');
const CHECKPOINT_FILE = path.join(REPO_ROOT, 'data', 'nba', 'phase3_checkpoints.json');

// Thresholds to sweep
const THRESHOLDS = [0.50, 0.52, 0.54, 0.56, 0.58, 0.60];

// Test set ratio (must match training script)
const TEST_RATIO = 0.20;

console.log('='.repeat(70));
console.log('Phase 3.5 - LightGBM Threshold ROI Analyzer');
console.log('Sweeping confidence thresholds to find optimal betting regions');
console.log('='.repeat(70));
console.log();

/**
 * Load training data from JSONL
 */
function loadTrainingData() {
  console.log('[1/7] Loading training dataset...');
  
  if (!fs.existsSync(TRAINING_FILE)) {
    throw new Error(`Training file not found: ${TRAINING_FILE}`);
  }
  
  const lines = fs.readFileSync(TRAINING_FILE, 'utf-8').split('\n').filter(l => l.trim());
  const examples = lines.map(line => JSON.parse(line));
  
  console.log(`  ✅ Loaded ${examples.length.toLocaleString()} examples`);
  
  return examples;
}

/**
 * Load LightGBM model metadata
 * Note: We can't load .txt models directly in Node.js, so we'll use Python subprocess
 */
function loadModelMetadata() {
  console.log('\n[2/7] Loading LightGBM model metadata...');
  
  if (!fs.existsSync(MODEL_DIR)) {
    throw new Error(`Model directory not found: ${MODEL_DIR}`);
  }
  
  // Find all JSON metadata files
  const files = fs.readdirSync(MODEL_DIR).filter(f => f.endsWith('.json') && !f.includes('summary'));
  
  const models = {};
  
  for (const file of files) {
    const metadata = JSON.parse(fs.readFileSync(path.join(MODEL_DIR, file), 'utf-8'));
    const key = `${metadata.market}_${metadata.side}`;
    models[key] = metadata;
  }
  
  console.log(`  ✅ Loaded ${Object.keys(models).length} model metadata files`);
  
  return models;
}

/**
 * Generate predictions using Python LightGBM models
 * We create a Python script that loads models and generates predictions
 */
async function generatePredictions(examples, models) {
  console.log('\n[3/7] Generating LightGBM predictions...');
  console.log('  This will use Python subprocess to load LightGBM models');
  
  // Create temporary Python script
  const pythonScript = `
import json
import sys
import numpy as np
import lightgbm as lgb
from pathlib import Path

# Load models
MODEL_DIR = Path('${MODEL_DIR}')
models = {}

model_configs = [
    ('player_points', 'Over', 'points_over'),
    ('player_points', 'Under', 'points_under'),
    ('player_rebounds', 'Over', 'rebounds_over'),
    ('player_rebounds', 'Under', 'rebounds_under'),
    ('player_assists', 'Over', 'assists_over'),
    ('player_assists', 'Under', 'assists_under'),
]

for market, side, name in model_configs:
    # Find the model file (latest version)
    model_files = list(MODEL_DIR.glob(f'{name}_v1_*.txt'))
    if model_files:
        model_file = sorted(model_files)[-1]  # Latest version
        models[f'{market}_{side}'] = lgb.Booster(model_file=str(model_file))
        print(f'Loaded: {model_file.name}', file=sys.stderr)

# Feature columns (updated with L20, L40, season, H2H)
FEATURE_COLUMNS = [
    # Rolling player stats (L5, L10, L20, L40, L999)
    'L5_ppg', 'L10_ppg', 'L20_ppg', 'L40_ppg', 'L999_ppg',
    'L5_rpg', 'L10_rpg', 'L20_rpg', 'L40_rpg', 'L999_rpg',
    'L5_apg', 'L10_apg', 'L20_apg', 'L40_apg', 'L999_apg',
    'L5_pra', 'L10_pra', 'L20_pra', 'L40_pra', 'L999_pra',
    'L5_minutes', 'L10_minutes', 'L20_minutes', 'L40_minutes',
    'L5_fga', 'L10_fga', 'L20_fga', 'L40_fga',
    'L5_fta', 'L10_fta', 'L20_fta', 'L40_fta',
    
    # Season-to-date stats
    'season_ppg', 'season_rpg', 'season_apg', 'season_pra',
    'season_minutes', 'season_fga', 'season_fta', 'season_games_played',
    
    # Head-to-head stats
    'h2h_ppg', 'h2h_rpg', 'h2h_apg', 'h2h_pra',
    'h2h_minutes', 'h2h_fga', 'h2h_fta', 'h2h_games_played',
    
    # Opponent defense
    'opp_def_L5_pra_allowed', 'opp_def_L10_pra_allowed',
    'opp_def_L5_ppg_allowed', 'opp_def_L10_ppg_allowed',
    'opp_def_L5_rpg_allowed', 'opp_def_L10_rpg_allowed',
    'opp_def_L5_apg_allowed', 'opp_def_L10_apg_allowed',
    
    # Context
    'rest_days', 'home', 'line', 'games_played'
]

# Read examples from stdin
examples = json.load(sys.stdin)

print(f'Processing {len(examples)} examples...', file=sys.stderr)

# Generate predictions
predictions = []

for ex in examples:
    market = ex['market']
    side = ex['side']
    key = f'{market}_{side}'
    
    if key not in models:
        # Model not found, skip
        predictions.append({
            'id': ex.get('id', 'unknown'),
            'p_win_lgbm': None,
            'error': f'Model not found: {key}'
        })
        continue
    
    # Extract features
    features = []
    for col in FEATURE_COLUMNS:
        val = ex.get(col, 0)
        if val is None or (isinstance(val, float) and np.isnan(val)):
            val = 0
        features.append(float(val))
    
    # Predict
    X = np.array([features])
    prob = models[key].predict(X)[0]
    
    predictions.append({
        'id': ex.get('id', 'unknown'),
        'market': market,
        'side': side,
        'p_win_lgbm': float(prob)
    })

# Output predictions as JSON
json.dump(predictions, sys.stdout)
`;

  // Write Python script to temp file
  const tempScript = path.join(REPO_ROOT, 'temp_predict_lgbm.py');
  fs.writeFileSync(tempScript, pythonScript);
  
  // Write examples to temp file
  const tempData = path.join(REPO_ROOT, 'temp_examples.json');
  fs.writeFileSync(tempData, JSON.stringify(examples));
  
  // Run Python script
  const { spawnSync } = await import('child_process');
  const result = spawnSync('python3', [tempScript], {
    input: JSON.stringify(examples),
    encoding: 'utf-8',
    maxBuffer: 1024 * 1024 * 100, // 100MB
    cwd: REPO_ROOT
  });
  
  // Clean up temp files
  fs.unlinkSync(tempScript);
  fs.unlinkSync(tempData);
  
  if (result.error) {
    throw new Error(`Python subprocess error: ${result.error.message}`);
  }
  
  if (result.status !== 0) {
    console.error('Python stderr:', result.stderr);
    throw new Error(`Python script failed with status ${result.status}`);
  }
  
  const predictions = JSON.parse(result.stdout);
  
  console.log(`  ✅ Generated ${predictions.length.toLocaleString()} predictions`);
  
  // Attach predictions to examples
  for (let i = 0; i < examples.length; i++) {
    examples[i].p_win_lgbm = predictions[i].p_win_lgbm;
  }
  
  return examples;
}

/**
 * Split examples into train/test using temporal split
 */
function splitTrainTest(examples) {
  console.log('\n[4/7] Splitting train/test (temporal)...');
  
  // Sort by date
  const sorted = examples.slice().sort((a, b) => a.date.localeCompare(b.date));
  
  const splitIdx = Math.floor(sorted.length * (1 - TEST_RATIO));
  
  const train = sorted.slice(0, splitIdx);
  const test = sorted.slice(splitIdx);
  
  console.log(`  Train: ${train.length.toLocaleString()} examples (${train[0].date} to ${train[train.length - 1].date})`);
  console.log(`  Test: ${test.length.toLocaleString()} examples (${test[0].date} to ${test[test.length - 1].date})`);
  
  return { train, test };
}

/**
 * Convert American odds to decimal
 */
function americanToDecimal(american) {
  if (american >= 0) {
    return (american / 100) + 1;
  } else {
    return (100 / Math.abs(american)) + 1;
  }
}

/**
 * Calculate ROI for a set of bets
 */
function calculateROI(bets) {
  if (bets.length === 0) return 0;
  
  let totalWagered = bets.length; // Assume $1 per bet
  let totalProfit = 0;
  
  for (const bet of bets) {
    if (bet.result === 1) {
      // Win: profit = (decimal_odds - 1) * stake
      const decimalOdds = americanToDecimal(bet.odds);
      totalProfit += (decimalOdds - 1);
    } else {
      // Loss: profit = -stake
      totalProfit -= 1;
    }
  }
  
  return totalProfit / totalWagered;
}

/**
 * Run threshold sweep analysis
 */
function runThresholdSweep(testExamples) {
  console.log('\n[5/7] Running threshold sweep...');
  console.log(`  Thresholds: ${THRESHOLDS.join(', ')}`);
  
  const results = {
    byMarket: {},
    overall: []
  };
  
  // Get unique markets
  const markets = [...new Set(testExamples.map(ex => ex.market))];
  
  console.log(`  Markets: ${markets.join(', ')}`);
  
  // Sweep thresholds
  for (const threshold of THRESHOLDS) {
    console.log(`\n  Threshold ${threshold.toFixed(2)}:`);
    
    // Overall results
    const overallBets = testExamples.filter(ex => 
      ex.p_win_lgbm !== null && 
      ex.p_win_lgbm !== undefined && 
      ex.p_win_lgbm >= threshold
    );
    
    const overallWins = overallBets.filter(ex => ex.result === 1).length;
    const overallWinRate = overallBets.length > 0 ? overallWins / overallBets.length : 0;
    const overallROI = calculateROI(overallBets);
    const overallAvgProb = overallBets.length > 0 
      ? overallBets.reduce((sum, ex) => sum + ex.p_win_lgbm, 0) / overallBets.length 
      : 0;
    
    results.overall.push({
      threshold,
      bets: overallBets.length,
      wins: overallWins,
      losses: overallBets.length - overallWins,
      win_rate: parseFloat(overallWinRate.toFixed(4)),
      roi: parseFloat(overallROI.toFixed(4)),
      avg_probability: parseFloat(overallAvgProb.toFixed(4))
    });
    
    console.log(`    Overall: ${overallBets.length} bets, ${(overallWinRate * 100).toFixed(1)}% WR, ${(overallROI * 100).toFixed(1)}% ROI`);
    
    // Per-market results
    for (const market of markets) {
      if (!results.byMarket[market]) {
        results.byMarket[market] = [];
      }
      
      const marketBets = testExamples.filter(ex => 
        ex.market === market &&
        ex.p_win_lgbm !== null && 
        ex.p_win_lgbm !== undefined && 
        ex.p_win_lgbm >= threshold
      );
      
      const marketWins = marketBets.filter(ex => ex.result === 1).length;
      const marketWinRate = marketBets.length > 0 ? marketWins / marketBets.length : 0;
      const marketROI = calculateROI(marketBets);
      const marketAvgProb = marketBets.length > 0 
        ? marketBets.reduce((sum, ex) => sum + ex.p_win_lgbm, 0) / marketBets.length 
        : 0;
      
      results.byMarket[market].push({
        threshold,
        bets: marketBets.length,
        wins: marketWins,
        losses: marketBets.length - marketWins,
        win_rate: parseFloat(marketWinRate.toFixed(4)),
        roi: parseFloat(marketROI.toFixed(4)),
        avg_probability: parseFloat(marketAvgProb.toFixed(4))
      });
      
      console.log(`    ${market}: ${marketBets.length} bets, ${(marketWinRate * 100).toFixed(1)}% WR, ${(marketROI * 100).toFixed(1)}% ROI`);
    }
  }
  
  return results;
}

/**
 * Find best threshold combination
 */
function findBestCombination(results) {
  console.log('\n[6/7] Finding best threshold combinations...');
  
  const MIN_BETS = 100; // Minimum bets for consideration
  
  let bestOverall = null;
  let bestByMarket = {};
  
  // Best overall
  for (const result of results.overall) {
    if (result.bets >= MIN_BETS) {
      if (!bestOverall || result.roi > bestOverall.roi) {
        bestOverall = result;
      }
    }
  }
  
  // Best per market
  for (const [market, thresholdResults] of Object.entries(results.byMarket)) {
    for (const result of thresholdResults) {
      if (result.bets >= MIN_BETS) {
        if (!bestByMarket[market] || result.roi > bestByMarket[market].roi) {
          bestByMarket[market] = result;
        }
      }
    }
  }
  
  console.log('\n  🏆 Best Combinations (min 100 bets):');
  
  if (bestOverall) {
    console.log(`\n  Overall:`);
    console.log(`    Threshold: ${bestOverall.threshold.toFixed(2)}`);
    console.log(`    Bets: ${bestOverall.bets}`);
    console.log(`    Win Rate: ${(bestOverall.win_rate * 100).toFixed(1)}%`);
    console.log(`    ROI: ${(bestOverall.roi * 100).toFixed(1)}%`);
  } else {
    console.log('\n  Overall: No threshold met minimum bet requirement');
  }
  
  for (const [market, result] of Object.entries(bestByMarket)) {
    console.log(`\n  ${market}:`);
    console.log(`    Threshold: ${result.threshold.toFixed(2)}`);
    console.log(`    Bets: ${result.bets}`);
    console.log(`    Win Rate: ${(result.win_rate * 100).toFixed(1)}%`);
    console.log(`    ROI: ${(result.roi * 100).toFixed(1)}%`);
  }
  
  return { bestOverall, bestByMarket };
}

/**
 * Save results
 */
function saveResults(testExamples, results, best) {
  console.log('\n[7/7] Saving results...');
  
  const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
  
  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  
  // Save raw results (all test bets with predictions)
  const rawFile = path.join(OUTPUT_DIR, `phase3_lgbm_thresholds_raw_v1_${dateStr}.json`);
  
  const rawData = {
    generated_at: new Date().toISOString(),
    model_version: 'phase3_lgbm_v1',
    n_test_examples: testExamples.length,
    test_date_range: [testExamples[0].date, testExamples[testExamples.length - 1].date],
    examples: testExamples.map(ex => ({
      date: ex.date,
      player: ex.player,
      team: ex.team,
      opponent: ex.opponent,
      market: ex.market,
      side: ex.side,
      line: ex.line,
      odds: ex.odds,
      result: ex.result,
      p_win_lgbm: ex.p_win_lgbm,
      actual: ex.actual
    }))
  };
  
  fs.writeFileSync(rawFile, JSON.stringify(rawData, null, 2));
  console.log(`  ✅ Saved raw results: ${path.basename(rawFile)}`);
  
  // Save summary results
  const summaryFile = path.join(OUTPUT_DIR, `phase3_lgbm_thresholds_summary_v1_${dateStr}.json`);
  
  const summaryData = {
    generated_at: new Date().toISOString(),
    model_version: 'phase3_lgbm_v1',
    thresholds: THRESHOLDS,
    n_test_examples: testExamples.length,
    test_date_range: [testExamples[0].date, testExamples[testExamples.length - 1].date],
    by_market: results.byMarket,
    overall: results.overall,
    best_combinations: best
  };
  
  fs.writeFileSync(summaryFile, JSON.stringify(summaryData, null, 2));
  console.log(`  ✅ Saved summary: ${path.basename(summaryFile)}`);
  
  // Update checkpoint
  updateCheckpoint([rawFile, summaryFile], best);
  
  return { rawFile, summaryFile };
}

/**
 * Update checkpoint file
 */
function updateCheckpoint(artifacts, best) {
  try {
    let checkpoint = { checkpoints: [] };
    
    if (fs.existsSync(CHECKPOINT_FILE)) {
      checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf-8'));
    }
    
    checkpoint.checkpoints.push({
      timestamp: new Date().toISOString(),
      step: 'backtest_lgbm_thresholds',
      artifacts: artifacts.map(f => path.basename(f)),
      summary: {
        best_overall_roi: best.bestOverall ? best.bestOverall.roi : null,
        best_market_rois: Object.entries(best.bestByMarket).reduce((acc, [market, result]) => {
          acc[market] = result.roi;
          return acc;
        }, {})
      },
      notes: 'LightGBM threshold sweep analysis to identify optimal confidence thresholds per market'
    });
    
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
    console.log('  ✅ Checkpoint updated');
  } catch (error) {
    console.log(`  ⚠️  Checkpoint update failed: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  
  try {
    // Load data
    const examples = loadTrainingData();
    
    // Load models
    const models = loadModelMetadata();
    
    // Generate predictions
    const examplesWithPreds = await generatePredictions(examples, models);
    
    // Split train/test
    const { train, test } = splitTrainTest(examplesWithPreds);
    
    // Run threshold sweep on TEST SET ONLY
    const results = runThresholdSweep(test);
    
    // Find best combinations
    const best = findBestCombination(results);
    
    // Save results
    const { rawFile, summaryFile } = saveResults(test, results, best);
    
    // Final summary
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '='.repeat(70));
    console.log('✅ COMPLETE: LightGBM threshold analysis finished');
    console.log('='.repeat(70));
    console.log(`Total time: ${elapsed} seconds`);
    console.log(`Test examples: ${test.length.toLocaleString()}`);
    console.log(`Thresholds analyzed: ${THRESHOLDS.length}`);
    console.log(`\n📁 Results saved to: ${OUTPUT_DIR}`);
    console.log(`\n🎯 Next step: Review summary to identify best thresholds`);
    console.log(`   Then build meta-strategy model (Step 3)`);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main();
