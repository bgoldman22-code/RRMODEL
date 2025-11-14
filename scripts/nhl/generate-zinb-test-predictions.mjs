#!/usr/bin/env node

/**
 * Generate ZINB Elite v3 Predictions for Test Period
 * 
 * Creates predictions for Oct 15 - Nov 13, 2025 using ZINB Elite v3 model
 * to enable fair comparison with "Improved" model.
 * 
 * Output format matches walkforward-backtest output for compatibility
 * with policy-backtest.mjs
 * 
 * Usage:
 *   node scripts/nhl/generate-zinb-test-predictions.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { projectSOGElite } from '../../netlify/functions/_lib/nhl-elite-projection-v3.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

// Test date range
const START_DATE = '2025-10-15';
const END_DATE = '2025-11-13';

console.log('\n🧠 ========================================');
console.log('🧠 ZINB ELITE V3 - TEST PREDICTIONS');
console.log('🧠 ========================================\n');
console.log(`Date Range: ${START_DATE} to ${END_DATE}\n`);

/**
 * Load required data
 */
console.log('📂 Loading data files...\n');

const playerStatsPath = path.join(REPO_ROOT, 'data/nhl/player_stats_20252026.json');
const teamStatsPath = path.join(REPO_ROOT, 'data/nhl/team_stats_20252026.json');
const historicalGamesPath = path.join(REPO_ROOT, 'data/nhl/historical_game_data.json');
const learnedParamsPath = path.join(REPO_ROOT, 'data/nhl/learned_parameters.json');

const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, 'utf8'));
const teamStats = JSON.parse(fs.readFileSync(teamStatsPath, 'utf8'));
const historicalGames = JSON.parse(fs.readFileSync(historicalGamesPath, 'utf8'));
const learnedParams = JSON.parse(fs.readFileSync(learnedParamsPath, 'utf8'));

console.log(`   ✅ Player stats loaded: ${playerStats.players?.length || 0} players`);
console.log(`   ✅ Team stats loaded: ${Object.keys(teamStats.teams || {}).length} teams`);
console.log(`   ✅ Historical games loaded: ${historicalGames.games?.length || 0} games`);
console.log(`   ✅ Learned parameters: ${learnedParams.trainingGames} training games\n`);

/**
 * Filter games to test period
 */
console.log('🔍 Filtering to test period...\n');

const testGames = (historicalGames.games || []).filter(g => 
  g.gameDate >= START_DATE && g.gameDate <= END_DATE
);

console.log(`   Found ${testGames.length} games in test period\n`);

if (testGames.length === 0) {
  console.log('❌ No games found in test period.');
  console.log('   Make sure historical_game_data.json covers Oct 15 - Nov 13, 2025\n');
  process.exit(1);
}

/**
 * Build player lookup
 */
const playerLookup = new Map();
for (const player of playerStats.players || []) {
  playerLookup.set(player.playerId, player);
}

/**
 * Build team lookup
 */
const teamLookup = teamStats.teams || {};

/**
 * Generate predictions
 */
console.log('🧠 Generating ZINB predictions...\n');

const predictions = [];
let processed = 0;
let skipped = 0;

for (const game of testGames) {
  const player = playerLookup.get(game.playerId);
  
  if (!player) {
    skipped++;
    continue;
  }
  
  // Find opponent team
  const opponent = game.opponent || 'UNK';
  const opponentTeam = teamLookup[opponent];
  
  try {
    // Generate ZINB projection
    const projection = await projectSOGElite(
      player,
      opponentTeam || { abbrev: opponent, avgShotsAgainst: 30 },
      learnedParams,
      {
        isHome: game.isHome,
        recentGames: [] // Will be calculated by model from player stats
      }
    );
    
    if (projection && projection.projected !== undefined) {
      predictions.push({
        playerId: game.playerId,
        playerName: game.playerName || player.playerName || 'Unknown',
        position: player.position || game.position || 'F',
        gameDate: game.gameDate,
        projection: projection.projected,
        actual: game.shots,
        error: Math.abs(projection.projected - game.shots),
        mu: projection.mu,
        r: projection.r,
        pi: projection.pi,
        confidence: projection.confidence
      });
      
      processed++;
      
      if (processed % 100 === 0) {
        console.log(`   Processed ${processed} predictions...`);
      }
    } else {
      skipped++;
    }
    
  } catch (error) {
    skipped++;
    if (skipped <= 5) {
      console.log(`   ⚠️  Skipped ${player.playerName}: ${error.message}`);
    }
  }
}

console.log(`\n   ✅ Generated ${predictions.length} predictions`);
console.log(`   ⚠️  Skipped ${skipped} games (missing data or errors)\n`);

/**
 * Calculate metrics
 */
console.log('📊 Calculating metrics...\n');

const errors = predictions.map(p => p.error);
const mae = errors.reduce((sum, e) => sum + e, 0) / errors.length;

const actualMean = predictions.reduce((sum, p) => sum + p.actual, 0) / predictions.length;
const projMean = predictions.reduce((sum, p) => sum + p.projection, 0) / predictions.length;
const bias = projMean - actualMean;

// Calculate correlation
let numerator = 0;
let projDenom = 0;
let actualDenom = 0;

for (const p of predictions) {
  numerator += (p.projection - projMean) * (p.actual - actualMean);
  projDenom += Math.pow(p.projection - projMean, 2);
  actualDenom += Math.pow(p.actual - actualMean, 2);
}

const correlation = numerator / Math.sqrt(projDenom * actualDenom);

console.log(`   MAE: ${mae.toFixed(4)}`);
console.log(`   Bias: ${bias.toFixed(4)} (${bias > 0 ? 'overpredicting' : 'underpredicting'})`);
console.log(`   Correlation: ${correlation.toFixed(4)}`);
console.log(`   Avg Actual: ${actualMean.toFixed(2)} shots`);
console.log(`   Avg Predicted: ${projMean.toFixed(2)} shots\n`);

/**
 * Save output
 */
const output = {
  model: 'zinb-elite-v3',
  timestamp: new Date().toISOString(),
  testPeriod: { start: START_DATE, end: END_DATE },
  totalPredictions: predictions.length,
  metrics: {
    mae: mae,
    bias: bias,
    correlation: correlation,
    actualMean: actualMean,
    projectedMean: projMean
  },
  predictions: predictions
};

const outputPath = path.join(REPO_ROOT, 'data/nhl/zinb_predictions_test.json');
fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('💾 Output saved to:');
console.log(`   ${outputPath}\n`);

console.log('✅ ZINB predictions generated!\n');
console.log('🎯 NEXT STEPS:');
console.log('   1. Run policy-backtest.mjs on these predictions:');
console.log('      node scripts/nhl/policy-backtest.mjs \\');
console.log('        --preds=data/nhl/zinb_predictions_test.json \\');
console.log('        --odds=data/nhl/historical_odds_data_v2.json \\');
console.log('        --outJson=data/nhl/zinb_policy_results.json \\');
console.log('        --outCsv=data/nhl/zinb_policy_bets.csv');
console.log('');
console.log('   2. Compare with "Improved" model results');
console.log('      node scripts/nhl/model-comparison-test.mjs\n');

console.log('═══════════════════════════════════════════════════════════════\n');
