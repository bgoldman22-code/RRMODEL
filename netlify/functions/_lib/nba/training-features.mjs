/**
 * Training-Specific Feature Builder
 * 
 * Builds features from historical game data WITHOUT calling live APIs
 * Uses rolling averages and season aggregates from collected data
 */

/**
 * Build features for training from historical games
 * Uses only the game data we've collected, no live API calls
 * NOW WITH ADVANCED STATS: Pace, OffRtg, DefRtg, eFG%, TS%, TOV%, ORB%, FT/FGA
 * 
 * @param {Array<object>} allGames - All historical games (sorted chronologically)
 * @param {number} gameIndex - Index of current game to predict
 * @param {number} teamId - Team ID to build features for
 * @param {number} lookbackGames - How many recent games to use (default: 20)
 * @returns {object} Feature vector with 60+ features
 */
export function buildTrainingFeatures(allGames, gameIndex, teamId, lookbackGames = 20) {
  // Get all games BEFORE this one for this team (prevent leakage!)
  const teamGames = allGames
    .slice(0, gameIndex) // Only games before current
    .filter(g => g.homeTeamId === teamId || g.awayTeamId === teamId)
    .slice(-lookbackGames); // Last N games
  
  if (teamGames.length === 0) {
    // Early season - use league averages
    return getLeagueAverageFeatures();
  }
  
  // Check if we have advanced stats
  const hasAdvanced = teamGames[0]?.homeAdvanced !== undefined;
  
  // Calculate rolling averages
  const features = {};
  
  // Form metrics (L5, L10, L20)
  const last5 = teamGames.slice(-5);
  const last10 = teamGames.slice(-10);
  const last20 = teamGames.slice(-20);
  
  // Basic features (always available)
  features.L5_winPct = calculateWinPct(last5, teamId);
  features.L5_ppg = calculatePPG(last5, teamId);
  features.L5_oppPpg = calculateOppPPG(last5, teamId);
  features.L5_netRating = features.L5_ppg - features.L5_oppPpg;
  
  features.L10_winPct = calculateWinPct(last10, teamId);
  features.L10_ppg = calculatePPG(last10, teamId);
  features.L10_oppPpg = calculateOppPPG(last10, teamId);
  features.L10_netRating = features.L10_ppg - features.L10_oppPpg;
  
  features.L20_winPct = calculateWinPct(last20, teamId);
  features.L20_ppg = calculatePPG(last20, teamId);
  features.L20_oppPpg = calculateOppPPG(last20, teamId);
  features.L20_netRating = features.L20_ppg - features.L20_oppPpg;
  
  // ADVANCED STATS (if available)
  if (hasAdvanced) {
    // L5 Advanced
    features.L5_pace = calculateAdvancedAvg(last5, teamId, 'pace');
    features.L5_offRtg = calculateAdvancedAvg(last5, teamId, 'offRtg');
    features.L5_defRtg = calculateAdvancedAvg(last5, teamId, 'defRtg');
    features.L5_netRtg_advanced = features.L5_offRtg - features.L5_defRtg;
    features.L5_efg = calculateAdvancedAvg(last5, teamId, 'efg');
    features.L5_ts = calculateAdvancedAvg(last5, teamId, 'ts');
    features.L5_tovPct = calculateAdvancedAvg(last5, teamId, 'tovPct');
    features.L5_orbPct = calculateAdvancedAvg(last5, teamId, 'orbPct');
    features.L5_ftFga = calculateAdvancedAvg(last5, teamId, 'ftFga');
    
    // L10 Advanced
    features.L10_pace = calculateAdvancedAvg(last10, teamId, 'pace');
    features.L10_offRtg = calculateAdvancedAvg(last10, teamId, 'offRtg');
    features.L10_defRtg = calculateAdvancedAvg(last10, teamId, 'defRtg');
    features.L10_netRtg_advanced = features.L10_offRtg - features.L10_defRtg;
    features.L10_efg = calculateAdvancedAvg(last10, teamId, 'efg');
    features.L10_ts = calculateAdvancedAvg(last10, teamId, 'ts');
    features.L10_tovPct = calculateAdvancedAvg(last10, teamId, 'tovPct');
    features.L10_orbPct = calculateAdvancedAvg(last10, teamId, 'orbPct');
    features.L10_ftFga = calculateAdvancedAvg(last10, teamId, 'ftFga');
    
    // L20 Advanced
    features.L20_pace = calculateAdvancedAvg(last20, teamId, 'pace');
    features.L20_offRtg = calculateAdvancedAvg(last20, teamId, 'offRtg');
    features.L20_defRtg = calculateAdvancedAvg(last20, teamId, 'defRtg');
    features.L20_netRtg_advanced = features.L20_offRtg - features.L20_defRtg;
    features.L20_efg = calculateAdvancedAvg(last20, teamId, 'efg');
    features.L20_ts = calculateAdvancedAvg(last20, teamId, 'ts');
    features.L20_tovPct = calculateAdvancedAvg(last20, teamId, 'tovPct');
    features.L20_orbPct = calculateAdvancedAvg(last20, teamId, 'orbPct');
    features.L20_ftFga = calculateAdvancedAvg(last20, teamId, 'ftFga');
  }
  
  // Trends
  features.form_trend = features.L5_winPct - features.L20_winPct;
  features.offense_trend = features.L5_ppg - features.L20_ppg;
  features.defense_trend = features.L5_oppPpg - features.L20_oppPpg;
  
  if (hasAdvanced) {
    features.pace_trend = features.L5_pace - features.L20_pace;
    features.efficiency_trend = features.L5_offRtg - features.L20_offRtg;
    features.shooting_trend = features.L5_efg - features.L20_efg;
  }
  
  // Momentum (recent performance boost)
  features.momentum = (features.L5_winPct * 0.5) + (features.form_trend * 0.5);
  
  // Home/Away splits
  const homeGames = teamGames.filter(g => g.homeTeamId === teamId);
  const awayGames = teamGames.filter(g => g.awayTeamId === teamId);
  
  features.home_winPct = homeGames.length > 0 ? calculateWinPct(homeGames, teamId) : 0.5;
  features.away_winPct = awayGames.length > 0 ? calculateWinPct(awayGames, teamId) : 0.5;
  features.home_ppg = homeGames.length > 0 ? calculatePPG(homeGames, teamId) : 110;
  features.away_ppg = awayGames.length > 0 ? calculatePPG(awayGames, teamId) : 110;
  
  // Rest days (approximate from game dates)
  if (gameIndex > 0) {
    const lastGame = teamGames[teamGames.length - 1];
    const currentGame = allGames[gameIndex];
    const daysDiff = (new Date(currentGame.date) - new Date(lastGame.date)) / (1000 * 60 * 60 * 24);
    features.rest_days = Math.min(daysDiff, 7);
    features.is_back_to_back = daysDiff <= 1 ? 1 : 0;
  } else {
    features.rest_days = 1;
    features.is_back_to_back = 0;
  }
  
  return features;
}

/**
 * Calculate win percentage for a team
 */
function calculateWinPct(games, teamId) {
  if (games.length === 0) return 0.5;
  
  const wins = games.filter(g => {
    const isHome = g.homeTeamId === teamId;
    const won = isHome ? g.homeScore > g.awayScore : g.awayScore > g.homeScore;
    return won;
  }).length;
  
  return wins / games.length;
}

/**
 * Calculate points per game for a team
 */
function calculatePPG(games, teamId) {
  if (games.length === 0) return 110;
  
  const totalPoints = games.reduce((sum, g) => {
    const isHome = g.homeTeamId === teamId;
    return sum + (isHome ? g.homeScore : g.awayScore);
  }, 0);
  
  return totalPoints / games.length;
}

/**
 * Calculate opponent points per game
 */
function calculateOppPPG(games, teamId) {
  if (games.length === 0) return 110;
  
  const totalPoints = games.reduce((sum, g) => {
    const isHome = g.homeTeamId === teamId;
    return sum + (isHome ? g.awayScore : g.homeScore);
  }, 0);
  
  return totalPoints / games.length;
}

/**
 * Calculate advanced stat average for a team
 * Extracts from homeAdvanced/awayAdvanced based on which side team is on
 */
function calculateAdvancedAvg(games, teamId, statName) {
  if (games.length === 0) {
    // Return reasonable defaults
    const defaults = {
      pace: 100,
      offRtg: 110,
      defRtg: 110,
      efg: 52,
      ts: 56,
      tovPct: 13,
      orbPct: 25,
      ftFga: 23
    };
    return defaults[statName] || 0;
  }
  
  const validGames = games.filter(g => {
    const isHome = g.homeTeamId === teamId;
    const advanced = isHome ? g.homeAdvanced : g.awayAdvanced;
    return advanced && advanced[statName] !== undefined && advanced[statName] !== null;
  });
  
  if (validGames.length === 0) {
    const defaults = {
      pace: 100,
      offRtg: 110,
      defRtg: 110,
      efg: 52,
      ts: 56,
      tovPct: 13,
      orbPct: 25,
      ftFga: 23
    };
    return defaults[statName] || 0;
  }
  
  const sum = validGames.reduce((total, g) => {
    const isHome = g.homeTeamId === teamId;
    const advanced = isHome ? g.homeAdvanced : g.awayAdvanced;
    return total + (advanced[statName] || 0);
  }, 0);
  
  return sum / validGames.length;
}

/**
 * Get league average features for early season
 */
function getLeagueAverageFeatures() {
  return {
    L5_winPct: 0.5,
    L5_ppg: 110,
    L5_oppPpg: 110,
    L5_netRating: 0,
    L10_winPct: 0.5,
    L10_ppg: 110,
    L10_oppPpg: 110,
    L10_netRating: 0,
    L20_winPct: 0.5,
    L20_ppg: 110,
    L20_oppPpg: 110,
    L20_netRating: 0,
    // Advanced stats defaults
    L5_pace: 100,
    L5_offRtg: 110,
    L5_defRtg: 110,
    L5_netRtg_advanced: 0,
    L5_efg: 52,
    L5_ts: 56,
    L5_tovPct: 13,
    L5_orbPct: 25,
    L5_ftFga: 23,
    L10_pace: 100,
    L10_offRtg: 110,
    L10_defRtg: 110,
    L10_netRtg_advanced: 0,
    L10_efg: 52,
    L10_ts: 56,
    L10_tovPct: 13,
    L10_orbPct: 25,
    L10_ftFga: 23,
    L20_pace: 100,
    L20_offRtg: 110,
    L20_defRtg: 110,
    L20_netRtg_advanced: 0,
    L20_efg: 52,
    L20_ts: 56,
    L20_tovPct: 13,
    L20_orbPct: 25,
    L20_ftFga: 23,
    form_trend: 0,
    offense_trend: 0,
    defense_trend: 0,
    pace_trend: 0,
    efficiency_trend: 0,
    shooting_trend: 0,
    momentum: 0,
    home_winPct: 0.5,
    away_winPct: 0.5,
    home_ppg: 110,
    away_ppg: 110,
    rest_days: 1,
    is_back_to_back: 0
  };
}

/**
 * Build matchup features from two team feature sets
 * NOW WITH ADVANCED STATS MATCHUPS
 */
export function buildTrainingMatchupFeatures(homeFeatures, awayFeatures) {
  const matchup = {
    // Basic matchup features
    winPct_diff: homeFeatures.L10_winPct - awayFeatures.L10_winPct,
    ppg_diff: homeFeatures.L10_ppg - awayFeatures.L10_ppg,
    oppPpg_diff: homeFeatures.L10_oppPpg - awayFeatures.L10_oppPpg,
    netRating_diff: homeFeatures.L10_netRating - awayFeatures.L10_netRating,
    form_diff: homeFeatures.form_trend - awayFeatures.form_trend,
    momentum_diff: homeFeatures.momentum - awayFeatures.momentum,
    home_advantage: 1, // Always 1 for home team features
    rest_advantage: homeFeatures.rest_days - awayFeatures.rest_days,
    
    // Offensive vs defensive matchup
    home_offense_vs_away_defense: homeFeatures.L10_ppg - awayFeatures.L10_oppPpg,
    away_offense_vs_home_defense: awayFeatures.L10_ppg - homeFeatures.L10_oppPpg,
    
    // Pace proxy (total points)
    expected_pace: (homeFeatures.L10_ppg + awayFeatures.L10_ppg) / 2
  };
  
  // ADVANCED STATS MATCHUPS (if available)
  if (homeFeatures.L10_pace !== undefined && awayFeatures.L10_pace !== undefined) {
    // Pace matchup (fast vs slow)
    matchup.pace_diff = homeFeatures.L10_pace - awayFeatures.L10_pace;
    matchup.avg_pace = (homeFeatures.L10_pace + awayFeatures.L10_pace) / 2;
    
    // Efficiency matchup (offense vs defense)
    matchup.home_offRtg_vs_away_defRtg = homeFeatures.L10_offRtg - awayFeatures.L10_defRtg;
    matchup.away_offRtg_vs_home_defRtg = awayFeatures.L10_offRtg - homeFeatures.L10_defRtg;
    matchup.efficiency_advantage = matchup.home_offRtg_vs_away_defRtg - matchup.away_offRtg_vs_home_defRtg;
    
    // Four Factors matchups
    matchup.shooting_diff = homeFeatures.L10_efg - awayFeatures.L10_efg;
    matchup.efficiency_diff = homeFeatures.L10_ts - awayFeatures.L10_ts;
    matchup.turnover_diff = homeFeatures.L10_tovPct - awayFeatures.L10_tovPct; // Lower is better
    matchup.rebounding_diff = homeFeatures.L10_orbPct - awayFeatures.L10_orbPct;
    matchup.freethrow_diff = homeFeatures.L10_ftFga - awayFeatures.L10_ftFga;
    
    // Net rating differential (most important single feature)
    matchup.netRtg_advantage = homeFeatures.L10_netRtg_advanced - awayFeatures.L10_netRtg_advanced;
    
    // Style clash indicators
    matchup.pace_style_clash = Math.abs(matchup.pace_diff); // High = different styles
    matchup.expected_scoring = (homeFeatures.L10_offRtg + awayFeatures.L10_offRtg) / 2;
  }
  
  return matchup;
}

/**
 * Build complete feature vector for a single game
 * 
 * @param {Array<object>} allGames - All games sorted chronologically
 * @param {number} gameIndex - Current game index
 * @returns {object} Complete feature vector
 */
export function buildCompleteTrainingFeatures(allGames, gameIndex) {
  const game = allGames[gameIndex];
  
  // Build features for both teams using only previous games
  const homeFeatures = buildTrainingFeatures(allGames, gameIndex, game.homeTeamId);
  const awayFeatures = buildTrainingFeatures(allGames, gameIndex, game.awayTeamId);
  
  // Build matchup features
  const matchupFeatures = buildTrainingMatchupFeatures(homeFeatures, awayFeatures);
  
  // Combine with prefixes to avoid name collisions
  const combined = {
    ...prefixFeatures(homeFeatures, 'home_'),
    ...prefixFeatures(awayFeatures, 'away_'),
    ...matchupFeatures,
    date: game.date // Keep for time-series splits
  };
  
  return combined;
}

/**
 * Add prefix to feature names
 */
function prefixFeatures(features, prefix) {
  const prefixed = {};
  for (const [key, value] of Object.entries(features)) {
    prefixed[prefix + key] = value;
  }
  return prefixed;
}

/**
 * USAGE IN TRAINING:
 * 
 * const allGames = loadHistoricalGames(['2022-23', '2023-24', '2024-25']);
 * const X = [];
 * const y_spread = [];
 * const y_total = [];
 * 
 * for (let i = 0; i < allGames.length; i++) {
 *   const features = buildCompleteTrainingFeatures(allGames, i);
 *   X.push(features);
 *   
 *   const game = allGames[i];
 *   y_spread.push(game.homeScore - game.awayScore);
 *   y_total.push(game.homeScore + game.awayScore);
 * }
 */
