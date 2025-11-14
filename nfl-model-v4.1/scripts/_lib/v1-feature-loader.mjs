// nfl-model-v4.1/scripts/_lib/v1-feature-loader.mjs
// Multi-Season Feature Loader for V5 Reconstruction
// 
// PURPOSE:
// Load NFLverse game aggregates (2020-2025) and compute time-causal rolling features
// for training spread and total models. All features match V1's conceptual space.
//
// TIME-CAUSALITY:
// For each game, features use ONLY prior games in that season (+ optional prior season seed).
// No future leakage. Rolling windows adjust by week (early/mid/late season).
//
// V1 COMPATIBILITY:
// Features map directly to V1's blobs-nfl.js metrics:
// - EPA per play (offensive/defensive)
// - Success rate (offensive/defensive)
// - Explosive play rate (offensive/defensive)
// - Pace (plays per game)

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../nfl-model-v3/data/nflverse');


// Home field advantage by venue (matches V1 conceptual space)
const HFA_MAP = {
  'DEN': 3.0,   // Mile High altitude
  'GB': 2.7,    // Lambeau mystique
  'KC': 2.5,    // Arrowhead noise
  'SEA': 2.5,   // 12th man
  'NE': 2.3,    // Gillette advantage
  'DEFAULT': 2.0
};

// Rolling window sizes by week
const WINDOW_CONFIG = {
  earlySeasonWeeks: [1, 2, 3, 4],
  midSeasonWeeks: [5, 6, 7, 8, 9],
  lateSeasonWeeks: [10, 11, 12, 13, 14, 15, 16, 17, 18],
  earlyWindow: 'all', // Use all available games in current season
  midWindow: 5,       // 5-game rolling window
  lateWindow: 8       // 8-game rolling window
};

/**
 * Load all game aggregates from NFLverse data
 * @param {Object} options
 * @param {boolean} options.regularSeasonOnly - Filter to weeks 1-18 only
 * @param {boolean} options.includePlayoffs - Include playoff games (weeks 19-22)
 * @returns {Array<Object>} All games with raw aggregates
 */
export async function loadAllGames(options = {}) {
  const { regularSeasonOnly = true, includePlayoffs = false } = options;
  
  const seasons = [2020, 2021, 2022, 2023, 2024, 2025];
  const allGames = [];
  
  for (const season of seasons) {
    const filePath = path.join(DATA_DIR, `game_aggregates_${season}.json`);
    
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const games = JSON.parse(content);
      
      // Filter by week if requested
      const filtered = games.filter(g => {
        const week = parseInt(g.week);
        
        if (regularSeasonOnly && !includePlayoffs) {
          return week >= 1 && week <= 18;
        }
        
        if (regularSeasonOnly && includePlayoffs) {
          return week >= 1 && week <= 22;
        }
        
        return true;
      });
      
      allGames.push(...filtered);
    } catch (err) {
      console.warn(`⚠️  Could not load ${season} data: ${err.message}`);
    }
  }
  
  // Sort by season and week for time-causal processing
  allGames.sort((a, b) => {
    const seasonDiff = parseInt(a.season) - parseInt(b.season);
    if (seasonDiff !== 0) return seasonDiff;
    return parseInt(a.week) - parseInt(b.week);
  });
  
  console.log(`✅ Loaded ${allGames.length} games from ${seasons[0]}-${seasons[seasons.length - 1]}`);
  
  return allGames;
}

/**
 * Get rolling window size for a given week
 * @param {number} week - Week number
 * @returns {number|string} Window size ('all' or number)
 */
function getWindowSize(week) {
  if (WINDOW_CONFIG.earlySeasonWeeks.includes(week)) {
    return WINDOW_CONFIG.earlyWindow;
  }
  if (WINDOW_CONFIG.midSeasonWeeks.includes(week)) {
    return WINDOW_CONFIG.midWindow;
  }
  return WINDOW_CONFIG.lateWindow;
}

/**
 * Compute rolling team metrics using only prior games
 * @param {Array<Object>} allGames - All games sorted by season/week
 * @returns {Map<string, Object>} teamSeasonMetrics[`${game_id}`]
 */
function computeRollingMetrics(allGames) {
  const gameMetrics = new Map();
  
  // Group games by season
  const gamesBySeason = new Map();
  allGames.forEach(game => {
    const season = parseInt(game.season);
    if (!gamesBySeason.has(season)) {
      gamesBySeason.set(season, []);
    }
    gamesBySeason.get(season).push(game);
  });
  
  // Process each season
  for (const [season, games] of gamesBySeason) {
    const priorSeason = season - 1;
    
    // Get last 8 games from prior season for Week 1 baseline
    const priorSeasonGames = gamesBySeason.get(priorSeason) || [];
    
    // Track team stats by week
    const teamGameHistory = new Map(); // team -> [games in order]
    
    games.forEach(game => {
      const week = parseInt(game.week);
      const homeTeam = game.home_team;
      const awayTeam = game.away_team;
      
      // Compute rolling metrics for home team BEFORE this game
      const homeMetrics = computeTeamMetrics(
        homeTeam,
        season,
        week,
        teamGameHistory,
        priorSeasonGames
      );
      
      // Compute rolling metrics for away team BEFORE this game
      const awayMetrics = computeTeamMetrics(
        awayTeam,
        season,
        week,
        teamGameHistory,
        priorSeasonGames
      );
      
      // Store metrics for this game
      gameMetrics.set(game.game_id, {
        season,
        week,
        game_id: game.game_id,
        home_team: homeTeam,
        away_team: awayTeam,
        home_metrics: homeMetrics,
        away_metrics: awayMetrics,
        actual_home_score: game.home_score,
        actual_away_score: game.away_score,
        actual_margin: game.home_score - game.away_score,
        actual_total: game.home_score + game.away_score
      });
      
      // Add this game to team history AFTER computing metrics (time-causal)
      if (!teamGameHistory.has(homeTeam)) {
        teamGameHistory.set(homeTeam, []);
      }
      if (!teamGameHistory.has(awayTeam)) {
        teamGameHistory.set(awayTeam, []);
      }
      
      teamGameHistory.get(homeTeam).push({
        ...game,
        team_role: 'home',
        opponent: awayTeam,
        off_epa: game.home_epa_per_play,
        def_epa: game.away_epa_per_play,
        off_success: game.home_success_rate,
        def_success: game.away_success_rate,
        off_explosive: game.home_explosive_rate,
        def_explosive: game.away_explosive_rate,
        pace: game.plays
      });
      
      teamGameHistory.get(awayTeam).push({
        ...game,
        team_role: 'away',
        opponent: homeTeam,
        off_epa: game.away_epa_per_play,
        def_epa: game.home_epa_per_play,
        off_success: game.away_success_rate,
        def_success: game.home_success_rate,
        off_explosive: game.away_explosive_rate,
        def_explosive: game.home_explosive_rate,
        pace: game.plays
      });
    });
  }
  
  return gameMetrics;
}

/**
 * Compute metrics for a single team before a specific game
 * @param {string} team - Team abbreviation
 * @param {number} season - Season year
 * @param {number} week - Week number
 * @param {Map} teamGameHistory - History of team games
 * @param {Array} priorSeasonGames - Games from prior season for baseline
 * @returns {Object} Team metrics
 */
function computeTeamMetrics(team, season, week, teamGameHistory, priorSeasonGames) {
  const windowSize = getWindowSize(week);
  const teamHistory = teamGameHistory.get(team) || [];
  
  // For Week 1, seed with prior season's last N games
  let gamesForWindow = [...teamHistory];
  
  if (week === 1 && priorSeasonGames.length > 0) {
    // Get last 8 games from prior season
    const priorTeamGames = priorSeasonGames
      .filter(g => g.home_team === team || g.away_team === team)
      .slice(-8)
      .map(g => ({
        team_role: g.home_team === team ? 'home' : 'away',
        off_epa: g.home_team === team ? g.home_epa_per_play : g.away_epa_per_play,
        def_epa: g.home_team === team ? g.away_epa_per_play : g.home_epa_per_play,
        off_success: g.home_team === team ? g.home_success_rate : g.away_success_rate,
        def_success: g.home_team === team ? g.away_success_rate : g.home_success_rate,
        off_explosive: g.home_team === team ? g.home_explosive_rate : g.away_explosive_rate,
        def_explosive: g.home_team === team ? g.away_explosive_rate : g.home_explosive_rate,
        pace: g.plays
      }));
    
    // Blend: 30% prior season, 70% current (when current available)
    if (gamesForWindow.length > 0) {
      gamesForWindow = [
        ...priorTeamGames.map(g => ({ ...g, weight: 0.3 / priorTeamGames.length })),
        ...gamesForWindow.map(g => ({ ...g, weight: 0.7 / gamesForWindow.length }))
      ];
    } else {
      gamesForWindow = priorTeamGames.map(g => ({ ...g, weight: 1.0 / priorTeamGames.length }));
    }
  } else {
    // Apply rolling window
    if (typeof windowSize === 'number' && gamesForWindow.length > windowSize) {
      gamesForWindow = gamesForWindow.slice(-windowSize);
    }
    // Equal weighting
    gamesForWindow = gamesForWindow.map(g => ({ ...g, weight: 1.0 / gamesForWindow.length }));
  }
  
  // If no games available, return league average baseline
  if (gamesForWindow.length === 0) {
    return {
      off_epa_per_play: 0.0,
      def_epa_per_play: 0.0,
      off_success_rate: 0.40,
      def_success_rate: 0.40,
      off_explosive_rate: 0.12,
      def_explosive_rate: 0.12,
      pace: 65.0,
      games_in_window: 0
    };
  }
  
  // Compute weighted averages
  const totalWeight = gamesForWindow.reduce((sum, g) => sum + (g.weight || 1.0), 0);
  
  const off_epa = gamesForWindow.reduce((sum, g) => sum + (g.off_epa || 0) * (g.weight || 1.0), 0) / totalWeight;
  const def_epa = gamesForWindow.reduce((sum, g) => sum + (g.def_epa || 0) * (g.weight || 1.0), 0) / totalWeight;
  const off_success = gamesForWindow.reduce((sum, g) => sum + (g.off_success || 0) * (g.weight || 1.0), 0) / totalWeight;
  const def_success = gamesForWindow.reduce((sum, g) => sum + (g.def_success || 0) * (g.weight || 1.0), 0) / totalWeight;
  const off_explosive = gamesForWindow.reduce((sum, g) => sum + (g.off_explosive || 0) * (g.weight || 1.0), 0) / totalWeight;
  const def_explosive = gamesForWindow.reduce((sum, g) => sum + (g.def_explosive || 0) * (g.weight || 1.0), 0) / totalWeight;
  const pace = gamesForWindow.reduce((sum, g) => sum + (g.pace || 65) * (g.weight || 1.0), 0) / totalWeight;
  
  return {
    off_epa_per_play: off_epa,
    def_epa_per_play: def_epa,
    off_success_rate: off_success,
    def_success_rate: def_success,
    off_explosive_rate: off_explosive,
    def_explosive_rate: def_explosive,
    pace,
    games_in_window: gamesForWindow.length
  };
}

/**
 * Build spread model features from team metrics
 * @param {Object} gameMetrics - Metrics for a game
 * @returns {Object} Spread features
 */
function buildSpreadFeatures(gameMetrics) {
  const { home_metrics, away_metrics, home_team } = gameMetrics;
  
  // EPA Differential: (home_net_epa) - (away_net_epa)
  // where net_epa = off_epa - def_epa_allowed
  const home_net_epa = home_metrics.off_epa_per_play - home_metrics.def_epa_per_play;
  const away_net_epa = away_metrics.off_epa_per_play - away_metrics.def_epa_per_play;
  const epa_diff = home_net_epa - away_net_epa;
  
  // Success Rate Differential (scaled to ~0-100 range)
  const success_diff = (home_metrics.off_success_rate - away_metrics.off_success_rate) * 100;
  
  // Explosive Rate Differential (scaled to ~0-100 range)
  const explosive_diff = (home_metrics.off_explosive_rate - away_metrics.off_explosive_rate) * 100;
  
  // Home Field Advantage
  const hfa = HFA_MAP[home_team] || HFA_MAP.DEFAULT;
  
  return {
    epa_diff,
    success_diff,
    explosive_diff,
    hfa
  };
}

/**
 * Build total model features from team metrics
 * @param {Object} gameMetrics - Metrics for a game
 * @returns {Object} Total features
 */
function buildTotalFeatures(gameMetrics) {
  const { home_metrics, away_metrics } = gameMetrics;
  
  // Combined pace (average of both teams)
  const pace_combined = (home_metrics.pace + away_metrics.pace) / 2;
  
  // Offensive EPA sum (both teams' scoring potential)
  const epa_off_sum = home_metrics.off_epa_per_play + away_metrics.off_epa_per_play;
  
  // Defensive EPA sum (both teams' resistance)
  const epa_def_sum = home_metrics.def_epa_per_play + away_metrics.def_epa_per_play;
  
  // Success rate sum
  const success_sum = (home_metrics.off_success_rate + away_metrics.off_success_rate) * 100;
  
  // Explosive rate sum
  const explosive_sum = (home_metrics.off_explosive_rate + away_metrics.off_explosive_rate) * 100;
  
  return {
    pace_combined,
    epa_off_sum,
    epa_def_sum,
    success_sum,
    explosive_sum
  };
}

/**
 * Load training dataset (2020-2024)
 * @param {Object} options
 * @returns {Object} { spreadRows, totalRows }
 */
export async function loadTrainingDataset(options = {}) {
  const allGames = await loadAllGames(options);
  
  // Filter to 2020-2024
  const trainingGames = allGames.filter(g => {
    const season = parseInt(g.season);
    return season >= 2020 && season <= 2024;
  });
  
  console.log(`📊 Training set: ${trainingGames.length} games (2020-2024)`);
  
  // Compute rolling metrics
  const gameMetrics = computeRollingMetrics(trainingGames);
  
  // Build feature rows
  const spreadRows = [];
  const totalRows = [];
  
  for (const [gameId, metrics] of gameMetrics) {
    const spreadFeatures = buildSpreadFeatures(metrics);
    const totalFeatures = buildTotalFeatures(metrics);
    
    spreadRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: spreadFeatures,
      target_margin: metrics.actual_margin,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score,
      home_games_in_window: metrics.home_metrics.games_in_window,
      away_games_in_window: metrics.away_metrics.games_in_window
    });
    
    totalRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: totalFeatures,
      target_total: metrics.actual_total,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score,
      home_games_in_window: metrics.home_metrics.games_in_window,
      away_games_in_window: metrics.away_metrics.games_in_window
    });
  }
  
  console.log(`✅ Generated ${spreadRows.length} spread training rows`);
  console.log(`✅ Generated ${totalRows.length} total training rows`);
  
  return { spreadRows, totalRows };
}

/**
 * Load validation dataset (2025 weeks 1-9)
 * @param {Object} options
 * @returns {Object} { spreadRows, totalRows }
 */
export async function loadValidationDataset2025(options = {}) {
  const allGames = await loadAllGames(options);
  
  // Filter to 2025 weeks 1-9
  const validationGames = allGames.filter(g => {
    const season = parseInt(g.season);
    const week = parseInt(g.week);
    return season === 2025 && week >= 1 && week <= 9;
  });
  
  console.log(`📊 Validation set: ${validationGames.length} games (2025 weeks 1-9)`);
  
  // For validation, compute rolling metrics using ALL prior games (including 2020-2024)
  const gameMetrics = computeRollingMetrics(allGames);
  
  // Build feature rows for 2025 games only
  const spreadRows = [];
  const totalRows = [];
  
  for (const game of validationGames) {
    const metrics = gameMetrics.get(game.game_id);
    if (!metrics) continue;
    
    const spreadFeatures = buildSpreadFeatures(metrics);
    const totalFeatures = buildTotalFeatures(metrics);
    
    spreadRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: spreadFeatures,
      target_margin: metrics.actual_margin,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score,
      home_games_in_window: metrics.home_metrics.games_in_window,
      away_games_in_window: metrics.away_metrics.games_in_window
    });
    
    totalRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: totalFeatures,
      target_total: metrics.actual_total,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score,
      home_games_in_window: metrics.home_metrics.games_in_window,
      away_games_in_window: metrics.away_metrics.games_in_window
    });
  }
  
  console.log(`✅ Generated ${spreadRows.length} spread validation rows`);
  console.log(`✅ Generated ${totalRows.length} total validation rows`);
  
  return { spreadRows, totalRows };
}

/**
 * Load Week 10 spot-check dataset
 * @param {Object} options
 * @returns {Object} { spreadRows, totalRows }
 */
export async function loadWeek10Dataset(options = {}) {
  const allGames = await loadAllGames(options);
  
  // Filter to 2025 Week 10
  const week10Games = allGames.filter(g => {
    const season = parseInt(g.season);
    const week = parseInt(g.week);
    return season === 2025 && week === 10;
  });
  
  console.log(`📊 Week 10 spot-check: ${week10Games.length} games`);
  
  // Compute rolling metrics using ALL prior games
  const gameMetrics = computeRollingMetrics(allGames);
  
  const spreadRows = [];
  const totalRows = [];
  
  for (const game of week10Games) {
    const metrics = gameMetrics.get(game.game_id);
    if (!metrics) continue;
    
    const spreadFeatures = buildSpreadFeatures(metrics);
    const totalFeatures = buildTotalFeatures(metrics);
    
    spreadRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: spreadFeatures,
      target_margin: metrics.actual_margin,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score
    });
    
    totalRows.push({
      game_id: metrics.game_id,
      season: metrics.season,
      week: metrics.week,
      home_team: metrics.home_team,
      away_team: metrics.away_team,
      features: totalFeatures,
      target_total: metrics.actual_total,
      actual_home_score: metrics.actual_home_score,
      actual_away_score: metrics.actual_away_score
    });
  }
  
  return { spreadRows, totalRows };
}
