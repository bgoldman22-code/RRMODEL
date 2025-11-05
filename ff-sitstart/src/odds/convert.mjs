/**
 * Calculate implied team totals from spread and total
 * 
 * Spread convention: home team perspective (negative = home favored)
 * 
 * @param {Object} game - Game data
 * @param {number} game.total - Game total
 * @param {number} game.spread - Spread from home team perspective (negative = home favored)
 * @param {string} game.homeTeam - Home team abbreviation
 * @param {string} game.awayTeam - Away team abbreviation
 * @returns {Object} - Implied totals and context
 */
export function impliedFromSpreadTotal({ total, spread, homeTeam, awayTeam }) {
  // Spread is from home team perspective
  // Negative spread = home favored
  // Positive spread = away favored
  
  // Calculate implied totals
  const homeIT = (total / 2) - (spread / 2);
  const awayIT = total - homeIT;
  
  // Determine favorite
  const favorite = spread < 0 ? homeTeam : awayTeam;
  const favoriteBy = Math.abs(spread);
  
  return {
    homeTeam,
    awayTeam,
    homeIT: Math.round(homeIT * 10) / 10,
    awayIT: Math.round(awayIT * 10) / 10,
    favorite,
    favoriteBy: Math.round(favoriteBy * 10) / 10,
    spread,
    total
  };
}

/**
 * Calculate script lean (pass-heavy for underdogs, run-heavy for favorites)
 * 
 * @param {Object} context - Team context from impliedFromSpreadTotal
 * @param {string} team - Team abbreviation
 * @param {number} threshold - Spread threshold (default 4.5)
 * @returns {Object} - Script lean values
 */
export function calculateScriptLean(context, team, threshold = 4.5) {
  const isFavorite = context.favorite === team;
  const spreadMagnitude = context.favoriteBy;
  
  // Run lean for favorites (if spread >= threshold)
  const runLean = isFavorite && spreadMagnitude >= threshold ? 1 : 0;
  
  // Pass lean for underdogs (if spread >= threshold)
  const passLean = !isFavorite && spreadMagnitude >= threshold ? 1 : 0;
  
  return {
    runLean,
    passLean,
    isFavorite,
    spreadMagnitude
  };
}
