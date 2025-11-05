#!/usr/bin/env node
/**
 * NFL Model V3 - Time-Causal Feature Generation with Enhanced Metrics
 * 
 * Generates features for each game using ONLY past data (no future leakage).
 * Critical rule: When predicting game X in week Y, only use data from weeks 1 to Y-1.
 * 
 * V3 FEATURES:
 * - Third down success rates (off/def)
 * - Red zone TD rates (off/def)
 * - Pressure rates (off/def)
 * - QB EPA under pressure
 * - Explosive play rates (off/def)
 * - Pass block/rush win rates (ESPN trench stats)
 * - Differential features for all metrics
 * 
 * Run: node nfl-model-v3/scripts/03-generate-features.mjs
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
const PBP_FEATURES_DIR = path.join(__dirname, '../data/pbp_features');
const DATA_DIR = path.join(__dirname, '../data');
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
 * Load PBP features (third down, RZ, pressure, explosive)
 */
async function loadPBPFeatures() {
  const filename = path.join(PBP_FEATURES_DIR, 'pbp_features_all.json');
  const data = await fs.readFile(filename, 'utf-8');
  const features = JSON.parse(data);
  
  // Index by team-season-week for fast lookup
  const index = {};
  for (const feat of features) {
    const key = `${feat.team}_${feat.season}_${feat.week}`;
    index[key] = feat;
  }
  
  return index;
}

/**
 * Load trench stats (PBWR/PRWR from ESPN)
 */
async function loadTrenchStats() {
  const filename = path.join(DATA_DIR, 'trench_stats.json');
  const data = await fs.readFile(filename, 'utf-8');
  const stats = JSON.parse(data);
  
  // Index by team-season-week
  const index = {};
  for (const stat of stats) {
    const key = `${stat.team}_${stat.season}_${stat.week}`;
    index[key] = stat;
  }
  
  return index;
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
 * Calculate rolling averages for PBP-derived features
 */
function calculatePBPRollingStats(pbpHistory) {
  if (pbpHistory.length === 0) return {};
  
  const weights = config.feature_generation.recency_weights;
  const last3 = pbpHistory.slice(-3);
  const last5 = pbpHistory.slice(-5);
  const all = pbpHistory;
  
  const calculateAvg = (games, metric) => {
    if (games.length === 0) return null;
    const sum = games.reduce((acc, g) => acc + (g[metric] || 0), 0);
    return sum / games.length;
  };
  
  const metrics = [
    'third_down_success_rate_off',
    'third_down_success_rate_def',
    'red_zone_td_rate_off',
    'red_zone_td_rate_def',
    'pressure_rate_off',
    'pressure_rate_def',
    'qb_epa_under_pressure',
    'explosive_play_rate_off',
    'explosive_play_rate_def'
  ];
  
  const stats = {};
  
  for (const metric of metrics) {
    const avg3 = calculateAvg(last3, metric);
    const avg5 = calculateAvg(last5, metric);
    const avgAll = calculateAvg(all, metric);
    
    if (avg3 !== null && avg5 !== null && avgAll !== null) {
      stats[metric] = (
        avg3 * weights.last_3_games +
        avg5 * weights.last_5_games +
        avgAll * weights.season_avg
      );
    }
  }
  
  return stats;
}

/**
 * Calculate rolling averages for trench stats
 */
function calculateTrenchRollingStats(trenchHistory) {
  if (trenchHistory.length === 0) return {};
  
  const weights = config.feature_generation.recency_weights;
  const last3 = trenchHistory.slice(-3);
  const last5 = trenchHistory.slice(-5);
  const all = trenchHistory;
  
  const calculateAvg = (games, metric) => {
    if (games.length === 0) return null;
    const sum = games.reduce((acc, g) => acc + (g[metric] || 0), 0);
    return sum / games.length;
  };
  
  const pbwr3 = calculateAvg(last3, 'pass_block_win_rate');
  const pbwr5 = calculateAvg(last5, 'pass_block_win_rate');
  const pbwrAll = calculateAvg(all, 'pass_block_win_rate');
  
  const prwr3 = calculateAvg(last3, 'pass_rush_win_rate');
  const prwr5 = calculateAvg(last5, 'pass_rush_win_rate');
  const prwrAll = calculateAvg(all, 'pass_rush_win_rate');
  
  return {
    pass_block_win_rate: pbwr3 !== null && pbwr5 !== null && pbwrAll !== null
      ? (pbwr3 * weights.last_3_games + pbwr5 * weights.last_5_games + pbwrAll * weights.season_avg)
      : null,
    pass_rush_win_rate: prwr3 !== null && prwr5 !== null && prwrAll !== null
      ? (prwr3 * weights.last_3_games + prwr5 * weights.last_5_games + prwrAll * weights.season_avg)
      : null
  };
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
 * NOW INCLUDES: All V3 enhanced metrics
 */
function buildGameFeatures(game, teamHistories, pbpFeatures, trenchStats, season) {
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
  
  // Calculate rolling stats (basic EPA/SR metrics)
  const homeStats = calculateRollingStats(homeHistory, config.feature_generation.lookback_window);
  const awayStats = calculateRollingStats(awayHistory, config.feature_generation.lookback_window);
  
  // Get PBP-derived features (time-causal: only past weeks)
  const homePBPHistory = [];
  const awayPBPHistory = [];
  
  for (let w = 1; w < week; w++) {
    const homeKey = `${homeTeam}_${season}_${w}`;
    const awayKey = `${awayTeam}_${season}_${w}`;
    
    if (pbpFeatures[homeKey]) homePBPHistory.push(pbpFeatures[homeKey]);
    if (pbpFeatures[awayKey]) awayPBPHistory.push(pbpFeatures[awayKey]);
  }
  
  const homePBPStats = calculatePBPRollingStats(homePBPHistory);
  const awayPBPStats = calculatePBPRollingStats(awayPBPHistory);
  
  // Get trench stats (time-causal: only past weeks)
  const homeTrenchHistory = [];
  const awayTrenchHistory = [];
  
  for (let w = 1; w < week; w++) {
    const homeKey = `${homeTeam}_${season}_${w}`;
    const awayKey = `${awayTeam}_${season}_${w}`;
    
    if (trenchStats[homeKey]) homeTrenchHistory.push(trenchStats[homeKey]);
    if (trenchStats[awayKey]) awayTrenchHistory.push(trenchStats[awayKey]);
  }
  
  const homeTrenchStats = calculateTrenchRollingStats(homeTrenchHistory);
  const awayTrenchStats = calculateTrenchRollingStats(awayTrenchHistory);
  
  // If insufficient data, return null (can't make prediction)
  if (!homeStats || !awayStats || 
      homeStats.games_played < config.feature_generation.min_games_for_prediction ||
      awayStats.games_played < config.feature_generation.min_games_for_prediction) {
    return null;
  }
  
  // Build comprehensive V3 feature vector
  const features = {
    // Game identifiers
    game_id: game.game_id,
    season: season,
    week: week,
    home_team: homeTeam,
    away_team: awayTeam,
    
    // ===== BASE EPA FEATURES =====
    home_epa_offense: homeStats.epa_per_play_offense,
    home_epa_defense: homeStats.epa_per_play_defense,
    away_epa_offense: awayStats.epa_per_play_offense,
    away_epa_defense: awayStats.epa_per_play_defense,
    
    // ===== SUCCESS RATE FEATURES =====
    home_success_rate_offense: homeStats.success_rate_offense,
    home_success_rate_defense: homeStats.success_rate_defense,
    away_success_rate_offense: awayStats.success_rate_offense,
    away_success_rate_defense: awayStats.success_rate_defense,
    
    // ===== EXPLOSIVE PLAY FEATURES (V3) =====
    home_explosive_rate: homePBPStats.explosive_play_rate_off || 0.12,
    away_explosive_rate: awayPBPStats.explosive_play_rate_off || 0.12,
    home_explosive_rate_def: homePBPStats.explosive_play_rate_def || 0.12,
    away_explosive_rate_def: awayPBPStats.explosive_play_rate_def || 0.12,
    
    // ===== THIRD DOWN FEATURES (V3) =====
    home_third_down_success_off: homePBPStats.third_down_success_rate_off || 0.40,
    home_third_down_success_def: homePBPStats.third_down_success_rate_def || 0.60,
    away_third_down_success_off: awayPBPStats.third_down_success_rate_off || 0.40,
    away_third_down_success_def: awayPBPStats.third_down_success_rate_def || 0.60,
    
    // ===== RED ZONE FEATURES (V3) =====
    home_red_zone_td_rate_off: homePBPStats.red_zone_td_rate_off || 0.55,
    home_red_zone_td_rate_def: homePBPStats.red_zone_td_rate_def || 0.45,
    away_red_zone_td_rate_off: awayPBPStats.red_zone_td_rate_off || 0.55,
    away_red_zone_td_rate_def: awayPBPStats.red_zone_td_rate_def || 0.45,
    
    // ===== PRESSURE FEATURES (V3) =====
    home_pressure_rate_off: homePBPStats.pressure_rate_off || 0.25,
    home_pressure_rate_def: homePBPStats.pressure_rate_def || 0.25,
    away_pressure_rate_off: awayPBPStats.pressure_rate_off || 0.25,
    away_pressure_rate_def: awayPBPStats.pressure_rate_def || 0.25,
    home_qb_epa_under_pressure: homePBPStats.qb_epa_under_pressure || -0.3,
    away_qb_epa_under_pressure: awayPBPStats.qb_epa_under_pressure || -0.3,
    
    // ===== TRENCH STATS (V3) =====
    home_pass_block_win_rate: homeTrenchStats.pass_block_win_rate || 0.60,
    home_pass_rush_win_rate: homeTrenchStats.pass_rush_win_rate || 0.45,
    away_pass_block_win_rate: awayTrenchStats.pass_block_win_rate || 0.60,
    away_pass_rush_win_rate: awayTrenchStats.pass_rush_win_rate || 0.45,
    
    // ===== DIFFERENTIAL FEATURES (V3) =====
    epa_offense_diff: homeStats.epa_per_play_offense - awayStats.epa_per_play_offense,
    epa_defense_diff: homeStats.epa_per_play_defense - awayStats.epa_per_play_defense,
    explosive_diff: (homePBPStats.explosive_play_rate_off || 0.12) - (awayPBPStats.explosive_play_rate_off || 0.12),
    third_down_diff: (homePBPStats.third_down_success_rate_off || 0.40) - (awayPBPStats.third_down_success_rate_off || 0.40),
    tds_rz_diff: (homePBPStats.red_zone_td_rate_off || 0.55) - (awayPBPStats.red_zone_td_rate_off || 0.55),
    pressure_diff: (homePBPStats.pressure_rate_off || 0.25) - (awayPBPStats.pressure_rate_off || 0.25),
    
    // ===== HOME FIELD ADVANTAGE =====
    home_field_advantage: config.prediction_engine.home_field_advantage || 2.5,
    
    // ===== MATCHUP FEATURES =====
    home_offense_vs_away_defense: homeStats.epa_per_play_offense - awayStats.epa_per_play_defense,
    away_offense_vs_home_defense: awayStats.epa_per_play_offense - homeStats.epa_per_play_defense,
    
    // ===== METADATA =====
    home_games_played: homeStats.games_played,
    away_games_played: awayStats.games_played,
    feature_timestamp: new Date().toISOString(),
    time_causal: true,
    model_version: 'V3'
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
  console.log('🏈 NFL Model V3 - Time-Causal Feature Generation');
  console.log('='.repeat(60));
  console.log(`Seasons: ${config.seasons.join(', ')}`);
  console.log(`Lookback Window: ${config.feature_generation.lookback_window} games`);
  console.log(`Min Games: ${config.feature_generation.min_games_for_prediction}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Ensure output directory exists
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  
  // Load all data sources
  console.log('\n📥 Loading data sources...');
  
  // 1. Load game aggregates
  const allSeasonGames = {};
  for (const season of config.seasons) {
    const games = await loadGameAggregates(season);
    allSeasonGames[season] = games;
    console.log(`   ✅ ${season}: ${games.length} games`);
  }
  
  // 2. Load PBP features
  console.log('\n📥 Loading PBP features (3rd down, RZ, pressure, explosive)...');
  const pbpFeatures = await loadPBPFeatures();
  console.log(`   ✅ Loaded ${Object.keys(pbpFeatures).length} team-week records`);
  
  // 3. Load trench stats
  console.log('\n📥 Loading trench stats (PBWR/PRWR)...');
  const trenchStats = await loadTrenchStats();
  console.log(`   ✅ Loaded ${Object.keys(trenchStats).length} team-week records`);
  
  // Build team histories
  console.log('\n📊 Building team game histories...');
  const teamHistories = buildTeamHistories(allSeasonGames);
  const teamCount = Object.keys(teamHistories).length;
  console.log(`   ✅ Tracked ${teamCount} teams across all seasons`);
  
  // Generate features for each game
  console.log('\n🔧 Generating V3 time-causal features...');
  let totalGames = 0;
  let featuresGenerated = 0;
  let skippedEarly = 0;
  
  for (const season of config.seasons) {
    console.log(`\n   📅 ${season} Season:`);
    const seasonFeatures = [];
    
    for (const game of allSeasonGames[season]) {
      totalGames++;
      
      const features = buildGameFeatures(game, teamHistories, pbpFeatures, trenchStats, season);
      
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
  console.log('✅ V3 Feature Generation Complete!');
  console.log(`   Total Games: ${totalGames}`);
  console.log(`   Features Generated: ${featuresGenerated}`);
  console.log(`   Skipped (early season): ${skippedEarly}`);
  console.log(`   Coverage: ${((featuresGenerated / totalGames) * 100).toFixed(1)}%`);
  console.log(`   V3 Features Added: 19 new metrics`);
  console.log(`   Saved to: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  
  // Save summary
  const summary = {
    completed_at: new Date().toISOString(),
    model_version: 'V3',
    seasons: config.seasons,
    total_games: totalGames,
    features_generated: featuresGenerated,
    skipped_early_season: skippedEarly,
    coverage_pct: (featuresGenerated / totalGames) * 100,
    time_causal: true,
    lookback_window: config.feature_generation.lookback_window,
    v3_features: [
      'third_down_success_rate (off/def)',
      'red_zone_td_rate (off/def)',
      'pressure_rate (off/def)',
      'qb_epa_under_pressure',
      'explosive_play_rate (off/def)',
      'pass_block_win_rate',
      'pass_rush_win_rate',
      'pressure_diff',
      'tds_rz_diff',
      'third_down_diff',
      'explosive_diff'
    ]
  };
  
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'generation_summary.json'),
    JSON.stringify(summary, null, 2)
  );
  
  console.log('\n📝 Next Step: node nfl-model-v3/scripts/04-predict-games.mjs\n');
}

// Run main function
main().catch(error => {
  console.error('\n❌ Fatal Error:', error);
  process.exit(1);
});
