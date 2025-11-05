/**
 * NFL Model V4 - Mathematical Utilities
 * 
 * Core statistical functions for probability calculations
 */

/**
 * Standard normal cumulative distribution function (CDF)
 * Uses the error function approximation for standard normal
 * 
 * @param {number} x - Input value (z-score)
 * @returns {number} - Cumulative probability P(Z <= x) where Z ~ N(0,1)
 */
export function normalCDF(x) {
  // Use the error function approximation
  return 0.5 * (1.0 + erf(x / Math.sqrt(2)));
}

/**
 * Error function (erf) approximation using Abramowitz and Stegun formula
 * Maximum error: 1.5×10^−7
 * 
 * @param {number} x - Input value
 * @returns {number} - erf(x)
 */
function erf(x) {
  // Constants for approximation
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  
  // Save the sign of x
  const sign = x >= 0 ? 1 : -1;
  x = Math.abs(x);
  
  // Abramowitz and Stegun formula
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return sign * y;
}

/**
 * Convert spread to win probability using normal CDF with custom sigma
 * 
 * @param {number} spread - Point spread (positive = home favored)
 * @param {number} sigma - Standard deviation (game-specific variance)
 * @returns {number} - Home team win probability [0, 1]
 */
export function spreadToWinProbability(spread, sigma = 13.5) {
  // Normalize spread by sigma to get z-score
  // Higher spread relative to sigma = higher win probability
  const zScore = spread / sigma;
  return normalCDF(zScore);
}

/**
 * Convert American odds to implied probability (removing vig)
 * 
 * @param {number} odds - American odds (e.g., -110, +150)
 * @returns {number} - Implied probability [0, 1]
 */
export function oddsToImpliedProbability(odds) {
  if (odds < 0) {
    // Favorite: -110 means bet 110 to win 100
    return Math.abs(odds) / (Math.abs(odds) + 100);
  } else {
    // Underdog: +150 means bet 100 to win 150
    return 100 / (odds + 100);
  }
}

/**
 * Convert probability to American odds
 * 
 * @param {number} probability - Win probability [0, 1]
 * @returns {number} - American odds
 */
export function probabilityToOdds(probability) {
  if (probability >= 0.5) {
    // Favorite
    return -1 * Math.round((probability / (1 - probability)) * 100);
  } else {
    // Underdog
    return Math.round(((1 - probability) / probability) * 100);
  }
}

/**
 * Logistic function (sigmoid) for backward compatibility
 * 
 * @param {number} x - Input value
 * @returns {number} - Output between 0 and 1
 */
export function logistic(x) {
  return 1 / (1 + Math.exp(-x));
}

/**
 * Remove vig from two-sided market using power method
 * 
 * @param {number} prob1 - Implied probability of outcome 1
 * @param {number} prob2 - Implied probability of outcome 2
 * @returns {Object} - Fair probabilities {p1, p2}
 */
export function removeVig(prob1, prob2) {
  const total = prob1 + prob2;
  const k = Math.log(total) / Math.log(2);
  
  const fair1 = Math.pow(prob1, 1 / k);
  const fair2 = Math.pow(prob2, 1 / k);
  const fairTotal = fair1 + fair2;
  
  return {
    p1: fair1 / fairTotal,
    p2: fair2 / fairTotal
  };
}

/**
 * Calculate expected value of a bet
 * 
 * @param {number} probability - True win probability
 * @param {number} odds - American odds offered
 * @returns {number} - Expected value as decimal (0.05 = 5% EV)
 */
export function calculateEV(probability, odds) {
  let payout;
  if (odds < 0) {
    payout = 100 / Math.abs(odds);
  } else {
    payout = odds / 100;
  }
  
  return (probability * payout) - (1 - probability);
}

/**
 * Sharpe ratio for betting (ROI / volatility)
 * 
 * @param {number} roi - Return on investment
 * @param {number} variance - Sample variance of returns
 * @returns {number} - Sharpe ratio (risk-adjusted return)
 */
export function betSharpeRatio(roi, variance) {
  if (variance === 0) return 0;
  return roi / Math.sqrt(variance);
}
