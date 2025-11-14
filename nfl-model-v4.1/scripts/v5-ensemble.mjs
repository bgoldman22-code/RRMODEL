#!/usr/bin/env node
/**
 * V5 Ensemble Generator
 * Production-ready NFL prediction generator using frozen V5 models
 * 
 * VERSION: V5-Reconstructed-Ridge-ZeroDef-2025-11-14
 * 
 * MODELS USED:
 * ============
 * - V5 Spread Model: Multi-feature EPA (OLS)
 *   · Coefficients: output/v5_coefficients_spread.json
 *   · Training: 2020-2024 regular season (1349 games)
 *   · Validation MAE: 10.62 pts
 *   · Features: epa_diff, success_diff, explosive_diff, hfa
 * 
 * - V5 Total Model: Ridge λ=500 with epa_def_sum zero-weighted
 *   · Coefficients: output/v5_coefficients_total_ridge.json
 *   · Training: 2020-2024 regular season (1349 games)
 *   · Validation MAE: 10.84 pts
 *   · Features: pace_combined, epa_off_sum, epa_def_sum (zero), success_sum, explosive_sum
 * 
 * FEATURE ENGINEERING:
 * ===================
 * Uses V1 feature pipeline exactly (scripts/_lib/v1-feature-loader.mjs):
 * - Rolling 8-game window per team (time-causal, no future leakage)
 * - Success rates: offensive success % for each team (~20% league avg)
 * - Explosive rates: big play % for each team (~2% league avg)
 * - EPA: expected points added per play
 * - Pace: total plays per game (both teams, ~130-180)
 * - HFA: venue-specific home field advantage (DEN=3.0, GB=2.7, KC/SEA=2.5, NE=2.3, default=2.0)
 * 
 * CONSTRAINTS:
 * ============
 * - Models are FROZEN (no refitting, no coefficient changes)
 * - Features match training exactly (verified 100% parity)
 * - Deterministic output (no randomness)
 * - Safe for Netlify deployment (no V1 code dependencies)
 * 
 * USAGE:
 * ======
 *   # Current week (live predictions)
 *   node scripts/v5-ensemble.mjs --season 2025 --week 11
 * 
 *   # Historical week (with actual results for validation)
 *   node scripts/v5-ensemble.mjs --season 2024 --week 10 --historical
 * 
 *   # Custom output path
 *   node scripts/v5-ensemble.mjs --season 2025 --week 11 --output ./custom/path.json
 * 
 * OUTPUT FORMAT:
 * ==============
 *   {
 *     "season": 2025,
 *     "week": 11,
 *     "model_version": "V5-Reconstructed-Ridge-ZeroDef-2025-11-14",
 *     "model_metadata": { spread_model: {...}, total_model: {...} },
 *     "generated_at": "2025-11-14T...",
 *     "games_count": 14,
 *     "games": [
 *       {
 *         "game_id": "2025_11_BUF_KC",
 *         "spread_model": { predicted_spread, line, confidence, features },
 *         "total_model": { p25, p50, p75, spread, features },
 *         "actual": { home_score, away_score, total, margin } // if --historical
 *       }
 *     ]
 *   }
 * 
 * EXIT CODES:
 * ===========
 *   0: Success
 *   1: Invalid arguments or file not found
 *   2: No games found for specified week
 *   3: Prediction generation failed
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { predictSpreadGame, predictSpreadFromFeatures } from './_lib/v5-spread-model.mjs';
import { predictTotalGame, predictTotalFromFeatures } from './_lib/v5-total-model.mjs';
import { loadWeekSchedule } from './_lib/schedule-source.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {
    season: 2025,
    week: 11,
    output: null,
    historical: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--season' && args[i + 1]) {
      parsed.season = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--week' && args[i + 1]) {
      parsed.week = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      parsed.output = args[i + 1];
      i++;
    } else if (args[i] === '--historical') {
      parsed.historical = true;
    }
  }
  
  // Default output path
  if (!parsed.output) {
    parsed.output = path.join(__dirname, '..', 'output', `bundle_v5_${parsed.season}_week${parsed.week}.json`);
  }
  
  return parsed;
}

/**
 * Load game aggregates for a specific season
 */
async function loadGameAggregates(season) {
  const aggregatePath = path.join(
    __dirname,
    '..',
    '..',
    'nfl-model-v3',
    'data',
    'nflverse',
    `game_aggregates_${season}.json`
  );
  
  try {
    const data = await fs.readFile(aggregatePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`❌ Failed to load game aggregates for ${season}:`, error.message);
    return null;
  }
}

/**
 * Load game list and aggregates based on mode (historical vs future)
 * 
 * HISTORICAL MODE:
 * - Game list comes from aggregates (games already played in that week)
 * - Includes actual scores for validation
 * 
 * FUTURE MODE:
 * - Game list comes from schedule (games not yet played)
 * - No actual scores available
 * - Still uses aggregates for rolling metrics from prior weeks
 * 
 * @param {Object} params - Parameters
 * @param {number} params.season - NFL season
 * @param {number} params.week - Week number
 * @param {boolean} params.historical - True for historical mode, false for future mode
 * @returns {Promise<Object>} { gameList, allAggregates }
 */
async function loadGameListAndAggregates({ season, week, historical }) {
  // Load aggregates (needed for rolling metrics in both modes)
  const allAggregates = await loadGameAggregates(season);
  if (!allAggregates) {
    throw new Error(`Failed to load aggregates for season ${season}`);
  }

  const targetWeek = String(week);

  if (historical) {
    // HISTORICAL MODE: game list from aggregates
    const weekAggregates = allAggregates.filter(
      (g) => String(g.week) === targetWeek
    );

    if (weekAggregates.length === 0) {
      throw new Error(
        `No games found in aggregates for season=${season}, week=${week}. ` +
        `This week may not have been played yet. Use --future mode for predictions.`
      );
    }

    const gameList = weekAggregates.map((g) => ({
      season: Number(season),
      week: Number(g.week),
      home_team: g.home_team,
      away_team: g.away_team,
      kickoff: g.kickoff || g.gametime || null,
      game_id: g.game_id,
      // Include actual scores for validation
      home_score: g.home_score,
      away_score: g.away_score,
    }));

    return { gameList, allAggregates };
  }

  // FUTURE MODE: game list from schedule
  const scheduleGames = await loadWeekSchedule({ season, week });

  if (scheduleGames.length === 0) {
    throw new Error(
      `No games found in schedule for season=${season}, week=${week}`
    );
  }

  // Return schedule games as-is (no actual scores available yet)
  return { gameList: scheduleGames, allAggregates };
}

/**
 * Filter games for specific season and week
 * Excludes preseason and Pro Bowl
 */
function filterGamesForWeek(games, season, week) {
  return games.filter(game => 
    parseInt(game.season, 10) === season &&
    parseInt(game.week, 10) === week &&
    game.week <= 18 // Regular season weeks 1-18
  );
}

/**
 * Compute spread features (matches v1-feature-loader.mjs exactly)
 */
function computeSpreadFeatures(homeMetrics, awayMetrics, game) {
  // EPA Differential: (home_net_epa) - (away_net_epa)
  // where net_epa = off_epa - def_epa
  const epa_diff = homeMetrics.epa_offense_avg - awayMetrics.epa_offense_avg -
                   (homeMetrics.epa_defense_avg - awayMetrics.epa_defense_avg);
  
  // Success rate differential (V1 line 322: use offensive rates, difference first, then scale by 100)
  const success_diff = (homeMetrics.off_success_rate - awayMetrics.off_success_rate) * 100;
  
  // Explosive play differential (V1 line 325: use offensive rates, difference first, then scale by 100)
  const explosive_diff = (homeMetrics.off_explosive_rate - awayMetrics.off_explosive_rate) * 100;
  
  // Home field advantage (venue-specific)
  const hfa = getHomeFieldAdvantage(game.home_team);
  
  return {
    epa_diff,
    success_diff,
    explosive_diff,
    hfa
  };
}

/**
 * Compute total features (matches v1-feature-loader.mjs exactly)
 */
function computeTotalFeatures(homeMetrics, awayMetrics) {
  // Match V1 feature loader (lines 347-362):
  // - pace_combined: average of both teams' pace
  // - epa sums: offensive + opponent's offensive (both teams' scoring potential)
  // - success_sum: (home_off + away_off) * 100
  // - explosive_sum: (home_off + away_off) * 100
  
  const pace_combined = (homeMetrics.pace_avg + awayMetrics.pace_avg) / 2;
  const epa_off_sum = homeMetrics.epa_offense_avg + awayMetrics.epa_offense_avg;
  const epa_def_sum = homeMetrics.epa_defense_avg + awayMetrics.epa_defense_avg;
  const success_sum = ((homeMetrics.off_success_rate || 0) + (awayMetrics.off_success_rate || 0)) * 100;
  const explosive_sum = ((homeMetrics.off_explosive_rate || 0) + (awayMetrics.off_explosive_rate || 0)) * 100;
  
  return { pace_combined, epa_off_sum, epa_def_sum, success_sum, explosive_sum };
}

/**
 * Get home field advantage (venue-specific)
 * Matches v1-feature-loader.mjs HFA_MAP exactly
 */
function getHomeFieldAdvantage(team) {
  // V1 HFA_MAP (lines 28-35):
  const HFA_MAP = {
    'DEN': 3.0,   // Mile High altitude
    'GB': 2.7,    // Lambeau mystique
    'KC': 2.5,    // Arrowhead noise
    'SEA': 2.5,   // 12th man
    'NE': 2.3,    // Gillette advantage
    'DEFAULT': 2.0
  };
  
  return HFA_MAP[team] || HFA_MAP.DEFAULT;
}

/**
 * Get default league-average metrics when no team history is available
 * 
 * These values represent NFL league averages circa 2020-2024:
 * - Pace: ~66 plays per team per game
 * - EPA: 0.0 (league average is zero by definition)
 * - Success rate: ~45% of plays gain positive yards toward first down
 * - Explosive rate: ~11% of plays gain 15+ yards
 * 
 * @returns {Object} Default metrics
 */
function getDefaultMetrics() {
  return {
    pace_avg: 66.0,
    epa_offense_avg: 0.0,
    epa_defense_avg: 0.0,
    off_success_rate: 0.45,
    def_success_rate: 0.45,
    off_explosive_rate: 0.11,
    def_explosive_rate: 0.11
  };
}

/**
 * Compute rolling metrics for a team up to (but not including) a specific game
 * 
 * ALGORITHM:
 * ==========
 * 1. Filter to games where team participated BEFORE target week
 * 2. Sort chronologically by game_id
 * 3. Take last N games (default: 8)
 * 4. Compute averages across window
 * 
 * FEATURES COMPUTED:
 * ==================
 * - pace_avg: Average total plays per game (both teams, e.g., ~178)
 * - epa_offense_avg: Average offensive EPA per play (e.g., ~0.05)
 * - epa_defense_avg: Average defensive EPA per play = opponent's offensive EPA (e.g., ~0.00)
 * - off_success_rate: Average offensive success rate (decimal, e.g., 0.20 = 20%)
 * - def_success_rate: Average defensive success rate = opponent's success (decimal, e.g., 0.22 = 22%)
 * - off_explosive_rate: Average offensive explosive play rate (decimal, e.g., 0.02 = 2%)
 * - def_explosive_rate: Average defensive explosive rate = opponent's explosive (decimal, e.g., 0.02 = 2%)
 * 
 * TIME CAUSALITY:
 * ===============
 * - Only uses games BEFORE target week (no future leakage)
 * - For historical mode (week 10): uses weeks 1-9
 * - For future mode (week 11): uses weeks 1-10
 * - Comparison: targetWeek = 11 excludes week 11 and all later games
 * 
 * EDGE CASES:
 * ===========
 * - No history available: Returns league average defaults
 * - Missing fields: Uses defensive defaults (0.0 for EPA, 0.45 for success, 0.11 for explosive)
 * - Invalid values: Filtered out before averaging
 * 
 * @param {Array} games - All games from season
 * @param {string} team - Team abbreviation (e.g., "KC", "BUF")
 * @param {number} season - Season year
 * @param {number} targetWeek - Week to predict (exclusive - only use weeks before this)
 * @param {number} windowSize - Number of recent games to average (default: 16)
 * @returns {Object} Team metrics with pace, EPA, success, explosive rates
 */
function computeRollingMetrics(games, team, season, targetWeek, windowSize = 16) {
  // Validate inputs
  if (!games || games.length === 0) {
    console.warn(`⚠️  No games provided for team ${team}`);
    return getDefaultMetrics();
  }
  
  if (!team || !targetWeek) {
    console.warn(`⚠️  Missing team or targetWeek`);
    return getDefaultMetrics();
  }
  
  // Get all games for this team BEFORE the target week
  const teamGames = games
    .filter(g => {
      if (String(g.season) !== String(season)) return false;
      const w = Number(g.week);
      if (!Number.isFinite(w)) return false;
      if (w >= targetWeek) return false; // STRICTLY earlier weeks
      if (w > 18) return false; // Regular season only
      return g.home_team === team || g.away_team === team;
    })
    .sort((a, b) => {
      // Sort by week, then by game_id
      const weekDiff = Number(a.week) - Number(b.week);
      if (weekDiff !== 0) return weekDiff;
      return a.game_id.localeCompare(b.game_id);
    });
  
  // Take last N games
  const recentGames = teamGames.slice(-windowSize);
  
  if (recentGames.length === 0) {
    // No history - use league average defaults
    return getDefaultMetrics();
  }
  
  // Compute averages (keep rates as decimals, match V1 structure with off/def split)
  let pace_sum = 0, epa_off_sum = 0, epa_def_sum = 0;
  let success_off_sum = 0, success_def_sum = 0;
  let explosive_off_sum = 0, explosive_def_sum = 0;
  
  for (const game of recentGames) {
    const isHome = game.home_team === team;
    
    // Pace: Use full game plays (V1 feature loader assigns game.plays to each team)
    const pace = game.plays;
    
    if (isHome) {
      pace_sum += pace;
      epa_off_sum += game.home_epa_per_play || 0.0;
      epa_def_sum += game.away_epa_per_play || 0.0; // Defense = opponent EPA
      success_off_sum += game.home_success_rate || 0.45; // Offensive success (keep as decimal)
      success_def_sum += game.away_success_rate || 0.45; // Defensive success = opponent's rate
      explosive_off_sum += game.home_explosive_rate || 0.11; // Offensive explosive (keep as decimal)
      explosive_def_sum += game.away_explosive_rate || 0.11; // Defensive explosive = opponent's rate
    } else {
      pace_sum += pace;
      epa_off_sum += game.away_epa_per_play || 0.0;
      epa_def_sum += game.home_epa_per_play || 0.0; // Defense = opponent EPA
      success_off_sum += game.away_success_rate || 0.45; // Offensive success (keep as decimal)
      success_def_sum += game.home_success_rate || 0.45; // Defensive success = opponent's rate
      explosive_off_sum += game.away_explosive_rate || 0.11; // Offensive explosive (keep as decimal)
      explosive_def_sum += game.home_explosive_rate || 0.11; // Defensive explosive = opponent's rate
    }
  }
  
  const n = recentGames.length;
  return {
    pace_avg: pace_sum / n,
    epa_offense_avg: epa_off_sum / n,
    epa_defense_avg: epa_def_sum / n,
    off_success_rate: success_off_sum / n, // Average offensive success as decimal (e.g., 0.45)
    def_success_rate: success_def_sum / n, // Average defensive success as decimal (e.g., 0.40)
    off_explosive_rate: explosive_off_sum / n, // Average offensive explosive as decimal (e.g., 0.11)
    def_explosive_rate: explosive_def_sum / n // Average defensive explosive as decimal (e.g., 0.12)
  };
}

/**
 * Extract actual game results from game data (historical mode only)
 * 
 * In historical mode, loadGameListAndAggregates includes home_score and away_score
 * directly on the game object (pulled from aggregates).
 * 
 * @param {Object} game - Game object with optional home_score/away_score fields
 * @param {boolean} historical - Whether in historical mode
 * @returns {Object|null} Actual results { total, margin, home_score, away_score } or null
 */
function buildActualFromAggregate(game, historical) {
  // Future mode: no actuals available
  if (!historical) return null;
  
  // Extract scores (populated by loadGameListAndAggregates in historical mode)
  const homeScore = typeof game.home_score === 'number' ? game.home_score : null;
  const awayScore = typeof game.away_score === 'number' ? game.away_score : null;
  
  // Can't compute actuals without both scores
  if (homeScore == null || awayScore == null) {
    return null;
  }
  
  const total = homeScore + awayScore;
  const margin = homeScore - awayScore;
  
  return {
    home_score: homeScore,
    away_score: awayScore,
    total,
    margin
  };
}

/**
 * Generate predictions for a single game
 * 
 * PROCESS:
 * ========
 * 1. Compute rolling metrics for home and away teams
 * 2. Build spread features (epa_diff, success_diff, explosive_diff, hfa)
 * 3. Build total features (pace_combined, epa_off_sum, epa_def_sum, success_sum, explosive_sum)
 * 4. Call V5 frozen models for predictions
 * 5. Format output with features and predictions
 * 
 * ERROR HANDLING:
 * ===============
 * - Returns null if prediction fails (doesn't break entire week)
 * - Logs warning with game_id and error message
 * - Caller should filter out null results
 * 
 * @param {Object} game - Game object with teams, scores, etc.
 * @param {Array} allGames - All games from season (for rolling window)
 * @param {number} season - Season year
 * @param {number} week - Week number (used for rolling metrics cutoff)
 * @param {boolean} historical - Whether in historical mode (for actual results)
 * @returns {Object|null} Prediction object or null if failed
 */
async function predictGame(game, allGames, season, week, historical = false) {
  try {
    // Validate game object
    if (!game || !game.home_team || !game.away_team) {
      throw new Error('Invalid game object: missing required fields');
    }
    
    // Compute rolling metrics for both teams (only using weeks BEFORE target week)
    const homeMetrics = computeRollingMetrics(allGames, game.home_team, season, week);
    const awayMetrics = computeRollingMetrics(allGames, game.away_team, season, week);
    
    // Validate metrics
    if (!homeMetrics || !awayMetrics) {
      throw new Error('Failed to compute rolling metrics');
    }
    
    // Compute features
    const spreadFeatures = computeSpreadFeatures(homeMetrics, awayMetrics, game);
    const totalFeatures = computeTotalFeatures(homeMetrics, awayMetrics);
    
    // Validate features (check for NaN)
    if (isNaN(spreadFeatures.epa_diff) || isNaN(totalFeatures.pace_combined)) {
      throw new Error('Invalid features computed (NaN detected)');
    }
    
    // Get predictions from V5 models
    const spreadPred = await predictSpreadFromFeatures(spreadFeatures);
    const totalPred = await predictTotalFromFeatures(totalFeatures, false); // No debug
    
    // Validate predictions
    if (!spreadPred || !totalPred || isNaN(totalPred.p50)) {
      throw new Error('Invalid predictions from models');
    }
    
    // Determine favorite (raw_prediction is what model returns)
    const homeFavorite = spreadPred.raw_prediction < 0;
    const favorite = homeFavorite ? game.home_team : game.away_team;
    
    // Extract actual results if historical mode
    const actual = buildActualFromAggregate(game, historical);
    
    return {
      game_id: game.game_id,
      season: parseInt(game.season, 10),
      week: parseInt(game.week, 10),
      gameday: game.gameday || `${game.season}-W${game.week}`,
      home_team: game.home_team,
      away_team: game.away_team,
      
      spread_model: {
        model_name: 'v5_multi_feature_epa',
        predicted_spread: spreadPred.raw_prediction,
        home_favorite: homeFavorite,
        favorite_team: favorite,
        line: spreadPred.line,
        confidence: spreadPred.confidence,
        features: spreadFeatures
      },
      
      total_model: {
        model_name: 'v5_total_ridge_zero_edef',
        p25: totalPred.p25,
        p50: totalPred.p50,
        p75: totalPred.p75,
        spread: totalPred.spread,
        features: totalFeatures
      },
      
      // Include actual results if historical mode (from aggregate data)
      actual
    };
  } catch (error) {
    console.error(`⚠️  Failed to predict game ${game.game_id}:`, error.message);
    return null;
  }
}

/**
 * Main ensemble generation
 */
async function generateEnsemble(season, week, outputPath, historical = false) {
  console.log('\n' + '='.repeat(70));
  console.log(`V5 ENSEMBLE GENERATOR - ${season} Week ${week} ${historical ? '(Historical)' : '(Future)'}`);
  console.log('='.repeat(70));
  console.log('');
  
  // Load game list and aggregates using unified loader
  console.log(`📂 Loading ${historical ? 'historical games' : 'schedule'} for ${season} Week ${week}...`);
  const { gameList, allAggregates } = await loadGameListAndAggregates({ season, week, historical });
  
  if (!gameList || gameList.length === 0) {
    console.error(`❌ No games found for ${season} week ${week}`);
    console.error(`   Historical mode: ${historical}`);
    process.exit(1);
  }
  
  console.log(`   ✅ Loaded ${gameList.length} games for week ${week}`);
  console.log(`   ✅ Loaded ${allAggregates.length} total games for rolling metrics`);
  console.log('');
  
  // Generate predictions
  console.log('🔮 Generating V5 predictions...');
  const predictions = [];
  
  for (const game of gameList) {
    const pred = await predictGame(game, allAggregates, season, week, historical);
    if (pred) {
      predictions.push(pred);
      console.log(`   ✅ ${game.away_team} @ ${game.home_team}`);
    }
  }
  
  console.log('');
  console.log(`✅ Generated ${predictions.length} predictions`);
  console.log('');
  
  // Compute sanity check stats
  const spreads = predictions.map(p => p.spread_model.predicted_spread).filter(x => !isNaN(x));
  const totals = predictions.map(p => p.total_model.p50).filter(x => !isNaN(x));
  
  console.log('📊 Sanity Checks:');
  if (spreads.length > 0) {
    console.log(`   Spread range: [${Math.min(...spreads).toFixed(1)}, ${Math.max(...spreads).toFixed(1)}]`);
    console.log(`   Avg spread:   ${(spreads.reduce((a,b) => a+b, 0) / spreads.length).toFixed(1)} pts`);
  }
  if (totals.length > 0) {
    console.log(`   Total range:  [${Math.min(...totals).toFixed(1)}, ${Math.max(...totals).toFixed(1)}]`);
    console.log(`   Avg total:    ${(totals.reduce((a,b) => a+b, 0) / totals.length).toFixed(1)} pts`);
  }
  console.log('');
  
  // Historical comparison
  if (historical && predictions.some(p => p.actual)) {
    console.log('📈 Historical Performance:');
    const withActuals = predictions.filter(p => p.actual);
    
    const spreadErrors = withActuals
      .filter(p => p.spread_model.predicted_spread !== undefined && !isNaN(p.spread_model.predicted_spread))
      .map(p => Math.abs(p.spread_model.predicted_spread - p.actual.margin));
      
    const totalErrors = withActuals
      .filter(p => p.total_model.p50 !== undefined && !isNaN(p.total_model.p50))
      .map(p => Math.abs(p.total_model.p50 - p.actual.total));
    
    if (spreadErrors.length > 0) {
      console.log(`   Spread MAE: ${(spreadErrors.reduce((a,b) => a+b, 0) / spreadErrors.length).toFixed(2)} pts`);
    }
    if (totalErrors.length > 0) {
      console.log(`   Total MAE:  ${(totalErrors.reduce((a,b) => a+b, 0) / totalErrors.length).toFixed(2)} pts`);
    }
    console.log('');
    
    // Show sample games
    console.log('   Sample Games (first 3):');
    for (const pred of withActuals.slice(0, 3)) {
      console.log(`   ${pred.game_id}:`);
      const spreadPred = pred.spread_model.predicted_spread;
      const totalPred = pred.total_model.p50;
      if (!isNaN(spreadPred) && !isNaN(totalPred)) {
        console.log(`     Predicted: spread=${spreadPred.toFixed(1)}, total=${totalPred.toFixed(1)}`);
        console.log(`     Actual:    margin=${pred.actual.margin}, total=${pred.actual.total}`);
        console.log(`     Error:     spread=${Math.abs(spreadPred - pred.actual.margin).toFixed(1)}, total=${Math.abs(totalPred - pred.actual.total).toFixed(1)}`);
      }
    }
    console.log('');
  }
  
  // Create output bundle
  const bundle = {
    season,
    week,
    model_version: 'V5-Reconstructed-Ridge-ZeroDef-2025-11-14',
    model_metadata: {
      spread_model: {
        name: 'V5 Multi-Feature EPA',
        method: 'OLS',
        training_window: '2020-2024',
        training_games: 1349,
        mae_validation: 10.62,
        coefficients_file: 'v5_coefficients_spread.json',
        features: ['epa_diff', 'success_diff', 'explosive_diff', 'hfa']
      },
      total_model: {
        name: 'V5 Ridge Regression (λ=500)',
        method: 'Ridge with epa_def_sum zero-weighted in serving',
        training_window: '2020-2024',
        training_games: 1349,
        mae_validation: 10.84,
        coefficients_file: 'v5_coefficients_total_ridge.json',
        features: ['pace_combined', 'epa_off_sum', 'epa_def_sum (zero)', 'success_sum', 'explosive_sum'],
        notes: 'epa_def_sum coefficient set to 0.0 at serving time to prevent defensive leakage'
      }
    },
    generated_at: new Date().toISOString(),
    games_count: predictions.length,
    games: predictions
  };
  
  // Write output
  console.log('💾 Writing output...');
  await fs.writeFile(outputPath, JSON.stringify(bundle, null, 2), 'utf-8');
  console.log(`   ✅ Saved to: ${outputPath}`);
  console.log('');
  
  console.log('='.repeat(70));
  console.log('✅ V5 ENSEMBLE GENERATION COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  
  return bundle;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const args = parseArgs();
    
    console.log('V5 Ensemble Generator');
    console.log('Arguments:');
    console.log(`  Season: ${args.season}`);
    console.log(`  Week: ${args.week}`);
    console.log(`  Output: ${args.output}`);
    console.log(`  Historical: ${args.historical}`);
    
    await generateEnsemble(args.season, args.week, args.output, args.historical);
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
main();
