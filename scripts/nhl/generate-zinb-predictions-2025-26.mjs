#!/usr/bin/env node

/**
 * Generate ZINB Elite v3 Predictions for 2025-26 Season Test
 * 
 * Creates predictions for Oct 15 - Nov 13, 2025 using ZINB Elite v3 model.
 * Uses the newly collected season_2025-26_games.json data.
 * 
 * Output format matches walkforward-backtest for compatibility with policy-backtest.mjs
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
console.log('🧠 ZINB ELITE V3 - 2025-26 PREDICTIONS');
console.log('🧠 ========================================\n');
console.log(`Date Range: ${START_DATE} to ${END_DATE}\n`);

/**
 * Load required data
 */
console.log('📂 Loading data files...\n');

const playerStatsPath = path.join(REPO_ROOT, 'data/nhl/player_stats_20252026.json');
const teamStatsPath = path.join(REPO_ROOT, 'data/nhl/team_stats_20252026.json');
const seasonGamesPath = path.join(REPO_ROOT, 'data/nhl/season_2025-26_games.json');
const learnedParamsPath = path.join(REPO_ROOT, 'data/nhl/learned_parameters.json');

const playerStats = JSON.parse(fs.readFileSync(playerStatsPath, 'utf8'));
const teamStats = JSON.parse(fs.readFileSync(teamStatsPath, 'utf8'));
const seasonData = JSON.parse(fs.readFileSync(seasonGamesPath, 'utf8'));
const learnedParams = JSON.parse(fs.readFileSync(learnedParamsPath, 'utf8'));

console.log(`   ✅ Player stats: ${playerStats.players?.length || 0} players`);
console.log(`   ✅ Team stats: ${Object.keys(teamStats.teams || {}).length} teams`);
console.log(`   ✅ Season games: ${seasonData.games?.length || 0} player-games`);
console.log(`   ✅ Learned parameters: ${learnedParams.trainingGames} training games\n`);

/**
 * Filter games to test period
 */
console.log('🔍 Filtering to test period...\n');

const testGames = (seasonData.games || []).filter(g => 
  g.gameDate >= START_DATE && g.gameDate <= END_DATE
);

console.log(`   Found ${testGames.length} player-games in test period\n`);

if (testGames.length === 0) {
  console.log('❌ No games found in test period.');
  console.log('   Date range in season_2025-26_games.json:');
  console.log(`   ${seasonData.dateRange?.start} to ${seasonData.dateRange?.end}\n`);
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
let errors = 0;

for (const game of testGames) {
  const player = playerLookup.get(game.playerId);
  
  if (!player) {
    skipped++;
    if (skipped <= 5) {
      console.log(`   ⚠️  Skipped: ${game.playerName} (${game.playerId}) - not in player_stats`);
    }
    continue;
  }
  
  const playerTeam = teamLookup[game.team];
  const opponentTeam = teamLookup[game.opponent];
  
  if (!playerTeam || !opponentTeam) {
    skipped++;
    if (skipped <= 5) {
      console.log(`   ⚠️  Skipped: ${game.playerName} - missing team stats`);
    }
    continue;
  }
  
  try {
    // Generate ZINB projection
    const projection = projectSOGElite(
      game.playerId,
      game.playerName,
      player,
      playerTeam,
      opponentTeam,
      game.isHome,
      learnedParams
    );
    
    // Store in format matching walkforward-backtest output
    predictions.push({
      gameDate: game.gameDate,
      gameId: game.gameId,
      playerId: game.playerId,
      playerName: game.playerName,
      team: game.team,
      opponent: game.opponent,
      isHome: game.isHome,
      
      // Prediction
      projection: projection.mu, // Use ZINB mean (mu)
      
      // Actual result
      actualShots: game.shots,
      
      // Model details
      model: 'ZINB Elite v3',
      mu: projection.mu,
      r: projection.r,
      pi: projection.pi,
      
      // Features (for analysis)
      L10_avg_sog: game.L10_avg_sog,
      L10_toi: game.L10_toi,
      lastGameShots: game.lastGameShots
    });
    
    processed++;
    
    if (processed % 500 === 0) {
      console.log(`   Processed ${processed}/${testGames.length}...`);
    }
    
  } catch (err) {
    errors++;
    if (errors <= 5) {
      console.log(`   ❌ Error: ${game.playerName} - ${err.message}`);
    }
  }
}

console.log(`\n   ✅ Processed ${processed} predictions`);
console.log(`   ⚠️  Skipped ${skipped} games (missing data)`);
console.log(`   ❌ Errors ${errors}\n`);

/**
 * Calculate accuracy metrics
 */
console.log('📊 Calculating accuracy metrics...\n');

const errors_arr = predictions.map(p => p.actualShots - p.projection);
const abs_errors = errors_arr.map(e => Math.abs(e));
const mae = abs_errors.reduce((s, e) => s + e, 0) / abs_errors.length;
const bias = errors_arr.reduce((s, e) => s + e, 0) / errors_arr.length;

const mean_actual = predictions.reduce((s, p) => s + p.actualShots, 0) / predictions.length;
const mean_pred = predictions.reduce((s, p) => s + p.projection, 0) / predictions.length;

// Correlation
const cov = predictions.reduce((s, p) => 
  s + (p.actualShots - mean_actual) * (p.projection - mean_pred), 0
) / predictions.length;

const std_actual = Math.sqrt(
  predictions.reduce((s, p) => s + Math.pow(p.actualShots - mean_actual, 2), 0) / predictions.length
);
const std_pred = Math.sqrt(
  predictions.reduce((s, p) => s + Math.pow(p.projection - mean_pred, 2), 0) / predictions.length
);

const correlation = cov / (std_actual * std_pred);

console.log(`   MAE:         ${mae.toFixed(3)}`);
console.log(`   Bias:        ${bias.toFixed(3)} (${bias > 0 ? 'over' : 'under'}-predicting)`);
console.log(`   Correlation: ${correlation.toFixed(3)}`);
console.log(`   Mean Actual: ${mean_actual.toFixed(2)}`);
console.log(`   Mean Pred:   ${mean_pred.toFixed(2)}\n`);

/**
 * Save predictions
 */
const outputPath = path.join(REPO_ROOT, 'data/nhl/zinb_predictions_2025-26.json');
const output = {
  generatedAt: new Date().toISOString(),
  model: 'ZINB Elite v3',
  dateRange: {
    start: START_DATE,
    end: END_DATE
  },
  totalPredictions: predictions.length,
  metrics: {
    mae: mae,
    bias: bias,
    correlation: correlation,
    meanActual: mean_actual,
    meanPredicted: mean_pred
  },
  trainingGames: learnedParams.trainingGames,
  predictions: predictions
};

fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

console.log('💾 Saved predictions to:');
console.log(`   ${outputPath}\n`);

console.log('🎯 Next Steps:');
console.log('   1. Generate "Improved" model predictions');
console.log('   2. Apply policy filters to both models');
console.log('   3. Compare results\n');
