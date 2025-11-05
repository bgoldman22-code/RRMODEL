import { normalizeTeam as normTeamUtil, normalizePlayerName } from '../util/names.mjs';

/**
 * Normalize team name/abbreviation
 */
export function normTeam(nameOrAbbr) {
  return normTeamUtil(nameOrAbbr);
}

/**
 * Normalize player name with team and position context
 */
export function normPlayer(name, team, pos) {
  return {
    normalized: normalizePlayerName(name),
    team: normTeam(team),
    position: pos
  };
}

/**
 * Convert American odds to probability
 * @param {number} odds - American odds (e.g., +120, -145)
 * @returns {number} - Probability [0, 1]
 */
export function probFromAmerican(odds) {
  if (odds >= 0) {
    // Underdog: +120 means you win $120 on $100 bet
    return 100 / (odds + 100);
  } else {
    // Favorite: -145 means you must bet $145 to win $100
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

/**
 * Remove vig from over/under probabilities
 * Renormalizes both sides so they sum to 1.0
 * 
 * @param {number} probOver - Implied probability from Over odds
 * @param {number} probUnder - Implied probability from Under odds
 * @returns {{ over: number, under: number }} - Vig-free probabilities
 */
export function noVig(probOver, probUnder) {
  const total = probOver + probUnder;
  
  if (total === 0) {
    return { over: 0.5, under: 0.5 };
  }
  
  return {
    over: probOver / total,
    under: probUnder / total
  };
}

/**
 * Extract line value from markets (handles both positive and negative)
 * @param {number} line - Line value (can be handicap or total)
 * @returns {number} - Parsed line
 */
export function parseLine(line) {
  return parseFloat(line) || 0;
}
