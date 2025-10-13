/**
 * Training-Specific Feature Builder
 * 
 * Builds features from historical game data WITHOUT calling live APIs
 * Uses rolling averages and season aggregates from collected data
 */

/**
 * Build features for training from historical games
 * Uses only the game data we've collected, no live API calls
 * 
 * @param {Array<object>} allGames - All historical games (sorted chronologically)
 * @param {number} gameIndex - Index of current game to predict
 * @param {number} teamId - Team ID to build features for
 * @param {number} lookbackGames - How many recent games to use (default: 20)
 * @returns {object} Feature vector
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
  
  // Calculate rolling averages
  const features = {};
  
  // Form metrics (L5, L10, L20)
  const last5 = teamGames.slice(-5);
  const last10 = teamGames.slice(-10);
  const last20 = teamGames.slice(-20);
  
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
  
  // Trends
  features.form_trend = features.L5_winPct - features.L20_winPct;
  features.offense_trend = features.L5_ppg - features.L20_ppg;
  features.defense_trend = features.L5_oppPpg - features.L20_oppPpg;
  
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
    form_trend: 0,
    offense_trend: 0,
    defense_trend: 0,
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
 */
export function buildTrainingMatchupFeatures(homeFeatures, awayFeatures) {
  return {
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
