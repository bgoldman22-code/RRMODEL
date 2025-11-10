#!/usr/bin/env node
/**
 * NFL Model V2 - Time-Causal Feature Generation
 * 
 * Generates features for each game using ONLY past data (no future leakage).
 * Critical rule: When predicting game X in week Y, only use data from weeks 1 to Y-1.
 * 
 * Run: node nfl-model-v2/scripts/03-generate-features.mjs
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = JSON.parse(
  await fs.readFile(path.join(__dirname, '../config.json'), 'utf-8')
);

const NFLVERSE_DIR = path.join(__dirname, '../data/nflverse');
const OUTPUT_DIR = path.join(__dirname, '../data/processed-features');

/**
 * Load game aggregates for a season
 */
async function loadGameAggregates(season) {
  const filename = path.join(NFLVERSE_DIR, `game_aggregates_${season}.json`);
  const data = await fs.readFile(filename, 'utf-8');
  return JSON.parse(data);
}

/**
 * Calculate team rolling averages using only past games
 */
function calculateRollingStats(teamGames, lookbackWindow = 10) {
  if (teamGames.length === 0) return null;
  
  // Only use the most recent N games
  const recentGames = teamGames.slice(-lookbackWindow);
  
  // Calculate weighted averages (more recent games weighted higher)
  const weights = config.feature_generation.recency_weights;
  const last3 = recentGames.slice(-3);
  const last5 = recentGames.slice(-5);
  const allGames = recentGames;
  
  const calculateAvg = (games, metric) => {
    if (games.length === 0) return 0;
    const sum = games.reduce((acc, g) => acc + (g[metric] || 0), 0);
    return sum / games.length;
  };
  
  const stats = {};
  
  for (const metric of config.feature_generation.metrics) {
    const avg3 = calculateAvg(last3, metric);
    const avg5 = calculateAvg(last5, metric);
    const avgAll = calculateAvg(allGames, metric);
    
    // Weighted average
    stats[metric] = (
      avg3 * weights.last_3_games +
      avg5 * weights.last_5_games +
      avgAll * weights.season_avg
    );
  }
  
  // Add game count for confidence weighting
  stats.games_played = recentGames.length;
  
  return stats;
}

/**
 * Extract team stats from a game (perspective matters)
 */
function extractTeamStats(game, team, isHome) {
  const prefix = isHome ? 'home_' : 'away_';
  
  return {
    epa_per_play_offense: game[`${prefix}epa_per_play`] || 0,
    epa_per_play_defense: game[`${isHome ? 'away_' : 'home_'}epa_per_play`] || 0,
    success_rate_offense: game[`${prefix}success_rate`] || 0,
    success_rate_defense: game[`${isHome ? 'away_' : 'home_'}success_rate`] || 0,
    explosive_play_rate: game[`${prefix}explosive_rate`] || 0,
    points_scored: game[`${prefix}score`] || 0,
    points_allowed: game[`${isHome ? 'away_' : 'home_'}score`] || 0
  };
}

/**
 * Build time-causal features for a specific game
 */
function buildGameFeatures(game, teamHistories, season) {
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const week = parseInt(game.week);
  
  // Get historical games for both teams UP TO (but not including) current week
  const homeHistory = teamHistories[homeTeam]?.[season]?.filter(g => 
    parseInt(g.week) < week
  ) || [];
  
  const awayHistory = teamHistories[awayTeam]?.[season]?.filter(g => 
    parseInt(g.week) < week
  ) || [];
  
  // Calculate rolling stats
  const homeStats = calculateRollingStats(homeHistory, config.feature_generation.lookback_window);
  const awayStats = calculateRollingStats(awayHistory, config.feature_generation.lookback_window);
  
  // If insufficient data, return null (can't make prediction)
  if (!homeStats || !awayStats || 
      homeStats.games_played < config.feature_generation.min_games_for_prediction ||
      awayStats.games_played < config.feature_generation.min_games_for_prediction) {
    return null;
  }
  
  // Build feature vector
  const features = {
    // Game identifiers
    game_id: game.game_id,
    season: season,
    week: week,
    home_team: homeTeam,
    away_team: awayTeam,
    
    // Home team features
    home_epa_offense: homeStats.epa_per_play_offense,
    home_epa_defense: homeStats.epa_per_play_defense,
    home_success_rate_offense: homeStats.success_rate_offense,
    home_success_rate_defense: homeStats.success_rate_defense,
    home_explosive_rate: homeStats.explosive_play_rate,
    home_games_played: homeStats.games_played,
    
    // Away team features
    away_epa_offense: awayStats.epa_per_play_offense,
    away_epa_defense: awayStats.epa_per_play_defense,
    away_success_rate_offense: awayStats.success_rate_offense,
    away_success_rate_defense: awayStats.success_rate_defense,
    away_explosive_rate: awayStats.explosive_play_rate,
    away_games_played: awayStats.games_played,
    
    // Differential features
    epa_offense_diff: homeStats.epa_per_play_offense - awayStats.epa_per_play_offense,
    epa_defense_diff: homeStats.epa_per_play_defense - awayStats.epa_per_play_defense,
    success_rate_diff: homeStats.success_rate_offense - awayStats.success_rate_offense,
    explosive_rate_diff: homeStats.explosive_play_rate - awayStats.explosive_play_rate,
    
    // Home field advantage (constant)
    home_field_advantage: config.prediction_engine.home_field_advantage,
    
    // Matchup-specific features
    home_offense_vs_away_defense: homeStats.epa_per_play_offense - awayStats.epa_per_play_defense,
    away_offense_vs_home_defense: awayStats.epa_per_play_offense - homeStats.epa_per_play_defense,
    
    // Metadata
    feature_timestamp: new Date().toISOString(),
    time_causal: true // Flag indicating this uses only past data
  };
  
  return features;
}

/**
 * Build team game histories organized by season
 */
function buildTeamHistories(allSeasonGames) {
  const histories = {};
  
  for (const [season, games] of Object.entries(allSeasonGames)) {
    for (const game of games) {
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      
      // Initialize team history structure
      if (!histories[homeTeam]) histories[homeTeam] = {};
      if (!histories[awayTeam]) histories[awayTeam] = {};
      if (!histories[homeTeam][season]) histories[homeTeam][season] = [];
      if (!histories[awayTeam][season]) histories[awayTeam][season] = [];
      
      // Add game with extracted stats
      const homeGame = {
        ...extractTeamStats(game, homeTeam, true),
        week: game.week,
        opponent: awayTeam,
        location: 'home'
      };
      
      const awayGame = {
        ...extractTeamStats(game, awayTeam, false),
        week: game.week,
        opponent: homeTeam,
        location: 'away'
      };
      
      histories[homeTeam][season].push(homeGame);
      histories[awayTeam][season].push(awayGame);
    }
    
    // Sort each team's games by week
    for (const team in histories) {
      if (histories[team][season]) {
        histories[team][season].sort((a, b) => 
          parseInt(a.week) - parseInt(b.week)
        );
      }
    }
  }
  
  return histories;
}

/**
 * Main execution
 */
async function main() {
  console.log('🏈 NFL Model V2 - Time-Causal Feature Generation');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Lookback Window: ${config.feature_generation.lookback_window} games`);
  console.log(`Min Games: ${config.feature_generation.min_games_for_prediction}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Load all game aggregates
  console.log('\n📥 Loading NFLVerse game aggregates...');
  const allSeasonGames = {};
  
  for (const season of config.seasons) {
    const games = await loadGameAggregates(season);
    allSeasonGames[season] = games;
    console.log(`   ✅ ${season}: ${games.length} games`);
  }
  
  // Build team histories
  console.log('\n📊 Building team game histories...');
  const teamHistories = buildTeamHistories(allSeasonGames);
  const teamCount = Object.keys(teamHistories).length;
  console.log(`   ✅ Tracked ${teamCount} teams across all seasons`);
  
  // Generate features for each game
  console.log('\n🔧 Generating time-causal features...');
  let totalGames = 0;
  let featuresGenerated = 0;
  let skippedEarly = 0;
  
  for (const season of config.seasons) {
    console.log(`\n   📅 ${season} Season:`);
    const seasonFeatures = [];
    
    for (const game of allSeasonGames[season]) {
      totalGames++;
      
      const features = buildGameFeatures(game, teamHistories, season);
      
      if (features) {
        seasonFeatures.push(features);
        featuresGenerated++;
      } else {
        skippedEarly++;
      }
    }
    
    // Save features for this season
    const outputFile = path.join(OUTPUT_DIR, `features_${season}.json`);
    await fs.writeFile(outputFile, JSON.stringify(seasonFeatures, null, 2));
    
    console.log(`      Generated: ${seasonFeatures.length} games`);
    console.log(`      Skipped: ${allSeasonGames[season].length - seasonFeatures.length} (insufficient history)`);
    console.log(`      ✅ Saved to ${outputFile}`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Feature Generation Complete!');
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Features Generated: ${featuresGenerated}`);
  console.log(`   Skipped (early season): ${skippedEarly}`);
  console.log(`   Coverage: ${((featuresGenerated / totalGames) * 100).toFixed(1)}%`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Save summary
  const summary = {
    completed_at: new Date().toISOString(),
    seasons: config.seasons,
    total_games: totalGames,
    features_generated: featuresGenerated,
    skipped_early_season: skippedEarly,
    coverage_pct: (featuresGenerated / totalGames) * 100,
    time_causal: true,
    lookback_window: config.feature_generation.lookback_window
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'generation_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📝 Next Step: node nfl-model-v2/scripts/04-predict-games.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
