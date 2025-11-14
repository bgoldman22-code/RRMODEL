#!/usr/bin/env node

/**
 * NHL SOG MODEL COMPARISON - 2025-26 Season Test
 * 
 * Head-to-head comparison of:
 *   1. "Improved" Model (walkforward-backtest-improved)
 *   2. ZINB Elite v3 Model (nhl-elite-projection-v3)
 * 
 * Both tested on SAME games (Oct 15 - Nov 13, 2025) with SAME policy filters.
 * 
 * This definitively answers:
 *   - Which model is more accurate?
 *   - Which model is more profitable with filters?
 *   - Should we deploy "Improved" or ZINB?
 * 
 * Usage:
 *   node scripts/nhl/model-comparison-test.mjs
 *   
 * Output:
 *   - Detailed comparison report
 *   - Predictions saved for each model
 *   - Policy filter results for each model
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

console.log('\n🔬 ========================================');
console.log('🔬 NHL SOG MODEL COMPARISON TEST');
console.log('🔬 2025-26 Season Performance');
console.log('🔬 ========================================\n');

console.log('📋 TEST PARAMETERS:');
console.log('   Date Range: October 15 - November 13, 2025');
console.log('   Models: "Improved" vs ZINB Elite v3');
console.log('   Filters: Identical policy filters applied to both');
console.log('   Goal: Determine which model to deploy\n');

/**
 * Step 1: Check if we have the necessary data files
 */
console.log('📂 STEP 1: Checking data availability...\n');

const requiredFiles = {
  'Player Stats 2025-26': path.join(REPO_ROOT, 'data/nhl/player_stats_20252026.json'),
  'Team Stats 2025-26': path.join(REPO_ROOT, 'data/nhl/team_stats_20252026.json'),
  'Historical Game Data': path.join(REPO_ROOT, 'data/nhl/historical_game_data.json'),
  'Historical Odds Data': path.join(REPO_ROOT, 'data/nhl/historical_odds_data_v2.json'),
  'Learned Parameters': path.join(REPO_ROOT, 'data/nhl/learned_parameters.json'),
};

let allFilesExist = true;

for (const [name, filepath] of Object.entries(requiredFiles)) {
  if (fs.existsSync(filepath)) {
    const stats = fs.statSync(filepath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`   ✅ ${name}: ${sizeMB} MB`);
  } else {
    console.log(`   ❌ ${name}: NOT FOUND`);
    allFilesExist = false;
  }
}

if (!allFilesExist) {
  console.log('\n❌ ERROR: Missing required data files.');
  console.log('   Please ensure all data files are present before running comparison.\n');
  process.exit(1);
}

console.log('\n   ✅ All required files present\n');

/**
 * Step 2: Load and filter data to Oct 15 - Nov 13 range
 */
console.log('📅 STEP 2: Loading 2025-26 season data...\n');

function loadJson(filepath) {
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

const historicalOdds = loadJson(requiredFiles['Historical Odds Data']);
const historicalGames = loadJson(requiredFiles['Historical Game Data']);

// Filter to our test date range
const startDate = '2025-10-15';
const endDate = '2025-11-13';

const oddsInRange = (historicalOdds.data || []).filter(g => 
  g.gameDate >= startDate && g.gameDate <= endDate && g.oddsAvailable && g.odds?.length > 0
);

const gamesInRange = (historicalGames.games || []).filter(g =>
  g.gameDate >= startDate && g.gameDate <= endDate
);

console.log(`   📊 Games in range: ${gamesInRange.length}`);
console.log(`   💰 Games with odds: ${oddsInRange.length}`);
console.log(`   📆 Date range: ${startDate} to ${endDate}\n`);

if (oddsInRange.length === 0) {
  console.log('⚠️  WARNING: No games with odds found in this date range.');
  console.log('   This test requires historical odds data for Oct 15 - Nov 13, 2025.');
  console.log('   You may need to fetch this data first.\n');
  console.log('💡 NEXT STEPS:');
  console.log('   1. Run: node scripts/nhl/fetch-historical-odds-v2.mjs');
  console.log('   2. Ensure it covers Oct 15 - Nov 13, 2025');
  console.log('   3. Re-run this comparison test\n');
  process.exit(0);
}

/**
 * Step 3: Generate predictions from BOTH models
 */
console.log('🧠 STEP 3: Generating predictions from both models...\n');

console.log('   This step requires:');
console.log('   1. Running walkforward-backtest-improved.mjs for Oct 15 - Nov 13');
console.log('   2. Running ZINB Elite v3 for the same games');
console.log('   3. Saving predictions to separate files\n');

console.log('   ⚠️  This comparison test is a FRAMEWORK.');
console.log('   You need to generate predictions manually first.\n');

console.log('📝 MANUAL STEPS REQUIRED:\n');

console.log('   STEP A: Generate "Improved" Model Predictions');
console.log('   ─────────────────────────────────────────────');
console.log('   1. Modify walkforward-backtest-improved.mjs to:');
console.log('      - Use date range: Oct 15 - Nov 13, 2025');
console.log('      - Output: data/nhl/improved_predictions_test.json');
console.log('');
console.log('   2. Run:');
console.log('      node scripts/nhl/walkforward-backtest-improved.mjs');
console.log('');

console.log('   STEP B: Generate ZINB Elite v3 Predictions');
console.log('   ──────────────────────────────────────────');
console.log('   1. Create new script: generate-zinb-predictions.mjs');
console.log('   2. For each game in Oct 15 - Nov 13:');
console.log('      - Call projectSOGElite(player, opponent, ...)');
console.log('      - Save: { playerId, gameDate, projection, actual }');
console.log('   3. Output: data/nhl/zinb_predictions_test.json');
console.log('');

console.log('   STEP C: Run Policy Backtest on BOTH');
console.log('   ────────────────────────────────────');
console.log('   # Test "Improved" model');
console.log('   node scripts/nhl/policy-backtest.mjs \\');
console.log('     --preds=data/nhl/improved_predictions_test.json \\');
console.log('     --odds=data/nhl/historical_odds_data_v2.json \\');
console.log('     --outJson=data/nhl/improved_policy_results.json \\');
console.log('     --outCsv=data/nhl/improved_policy_bets.csv');
console.log('');
console.log('   # Test ZINB model');
console.log('   node scripts/nhl/policy-backtest.mjs \\');
console.log('     --preds=data/nhl/zinb_predictions_test.json \\');
console.log('     --odds=data/nhl/historical_odds_data_v2.json \\');
console.log('     --outJson=data/nhl/zinb_policy_results.json \\');
console.log('     --outCsv=data/nhl/zinb_policy_bets.csv');
console.log('');

console.log('   STEP D: Compare Results');
console.log('   ───────────────────────');
console.log('   node scripts/nhl/compare-model-results.mjs');
console.log('');

/**
 * Step 4: Check if results already exist
 */
console.log('🔍 STEP 4: Checking for existing test results...\n');

const resultFiles = {
  'Improved Predictions': path.join(REPO_ROOT, 'data/nhl/improved_predictions_test.json'),
  'ZINB Predictions': path.join(REPO_ROOT, 'data/nhl/zinb_predictions_test.json'),
  'Improved Policy Results': path.join(REPO_ROOT, 'data/nhl/improved_policy_results.json'),
  'ZINB Policy Results': path.join(REPO_ROOT, 'data/nhl/zinb_policy_results.json'),
};

let resultsExist = true;

for (const [name, filepath] of Object.entries(resultFiles)) {
  if (fs.existsSync(filepath)) {
    console.log(`   ✅ ${name} found`);
  } else {
    console.log(`   ❌ ${name} missing`);
    resultsExist = false;
  }
}

if (resultsExist) {
  console.log('\n   🎉 All result files found! Generating comparison report...\n');
  
  // Load and compare results
  const improvedPolicyResults = loadJson(resultFiles['Improved Policy Results']);
  const zinbPolicyResults = loadJson(resultFiles['ZINB Policy Results']);
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 MODEL COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Create comparison table
  console.log('┌─────────────────────────────┬──────────────┬──────────────┐');
  console.log('│ Metric                      │   Improved   │  ZINB Elite  │');
  console.log('├─────────────────────────────┼──────────────┼──────────────┤');
  
  const metrics = [
    { key: 'totalBets', label: 'Total Bets Selected', format: (v) => String(v).padStart(4) },
    { key: 'wins', label: 'Wins', format: (v) => String(v).padStart(4) },
    { key: 'losses', label: 'Losses', format: (v) => String(v).padStart(4) },
    { key: 'winRate', label: 'Win Rate', format: (v) => `${(v * 100).toFixed(1)}%`.padStart(6) },
    { key: 'roi', label: 'ROI (Flat)', format: (v) => `${(v * 100).toFixed(1)}%`.padStart(6) },
    { key: 'roiKelly', label: 'ROI (Kelly)', format: (v) => `${(v * 100).toFixed(1)}%`.padStart(6) },
    { key: 'totalStaked', label: 'Total Staked', format: (v) => `${v.toFixed(1)}u`.padStart(7) },
    { key: 'totalProfit', label: 'Total Profit', format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}u`.padStart(7) },
  ];
  
  for (const metric of metrics) {
    const improvedVal = improvedPolicyResults.flat?.[metric.key] ?? improvedPolicyResults[metric.key] ?? 0;
    const zinbVal = zinbPolicyResults.flat?.[metric.key] ?? zinbPolicyResults[metric.key] ?? 0;
    
    const improvedStr = metric.format(improvedVal);
    const zinbStr = metric.format(zinbVal);
    
    console.log(`│ ${metric.label.padEnd(27)} │ ${improvedStr} │ ${zinbStr} │`);
  }
  
  console.log('└─────────────────────────────┴──────────────┴──────────────┘\n');
  
  // Determine winner
  const improvedROI = improvedPolicyResults.flat?.roi ?? improvedPolicyResults.roi ?? 0;
  const zinbROI = zinbPolicyResults.flat?.roi ?? zinbPolicyResults.roi ?? 0;
  
  console.log('🏆 WINNER DETERMINATION:\n');
  
  if (improvedROI > 0.05 && zinbROI > 0.05) {
    const winner = improvedROI > zinbROI ? '"Improved" Model' : 'ZINB Elite v3';
    const winnerROI = Math.max(improvedROI, zinbROI);
    console.log(`   ✅ BOTH models are profitable!`);
    console.log(`   🥇 Best: ${winner} (${(winnerROI * 100).toFixed(1)}% ROI)`);
    console.log(`   📈 Recommendation: Deploy ${winner} to production\n`);
  } else if (improvedROI > 0.05) {
    console.log(`   ✅ "Improved" Model is profitable (${(improvedROI * 100).toFixed(1)}% ROI)`);
    console.log(`   ❌ ZINB Elite v3 is NOT profitable (${(zinbROI * 100).toFixed(1)}% ROI)`);
    console.log(`   📈 Recommendation: Deploy "Improved" Model to production\n`);
  } else if (zinbROI > 0.05) {
    console.log(`   ❌ "Improved" Model is NOT profitable (${(improvedROI * 100).toFixed(1)}% ROI)`);
    console.log(`   ✅ ZINB Elite v3 is profitable (${(zinbROI * 100).toFixed(1)}% ROI)`);
    console.log(`   📈 Recommendation: Deploy ZINB Elite v3 to production\n`);
  } else {
    console.log(`   ❌ NEITHER model is profitable on 2025-26 data`);
    console.log(`   "Improved": ${(improvedROI * 100).toFixed(1)}% ROI`);
    console.log(`   ZINB Elite: ${(zinbROI * 100).toFixed(1)}% ROI`);
    console.log(`   ⚠️  WARNING: Market edge may have eroded`);
    console.log(`   📈 Recommendation: Investigate why both models failing\n`);
  }
  
  // Save comparison report
  const comparisonReport = {
    testDate: new Date().toISOString(),
    dateRange: { start: startDate, end: endDate },
    gamesAnalyzed: oddsInRange.length,
    results: {
      improved: improvedPolicyResults,
      zinb: zinbPolicyResults
    },
    winner: improvedROI > zinbROI ? 'improved' : 'zinb',
    recommendation: improvedROI > 0.05 || zinbROI > 0.05 
      ? `Deploy ${improvedROI > zinbROI ? 'Improved' : 'ZINB'} model`
      : 'Neither model profitable - investigate further'
  };
  
  const reportPath = path.join(REPO_ROOT, 'data/nhl/model_comparison_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(comparisonReport, null, 2));
  
  console.log(`💾 Full comparison report saved to:`);
  console.log(`   ${reportPath}\n`);
  
} else {
  console.log('\n   ℹ️  Result files not yet generated.');
  console.log('   Follow the manual steps above to complete the comparison.\n');
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('🎯 NEXT STEPS');
console.log('═══════════════════════════════════════════════════════════════\n');

if (!resultsExist) {
  console.log('1. Generate "Improved" model predictions for Oct 15 - Nov 13');
  console.log('2. Generate ZINB model predictions for Oct 15 - Nov 13');
  console.log('3. Run policy-backtest.mjs on both prediction sets');
  console.log('4. Re-run this script to see comparison results\n');
} else {
  console.log('✅ Comparison complete!');
  console.log('📊 Review the results above');
  console.log('🚀 Deploy the winning model to production\n');
}

console.log('═══════════════════════════════════════════════════════════════\n');
