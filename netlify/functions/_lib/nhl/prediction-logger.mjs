/**
 * NHL Prediction Logger Integration
 * 
 * Production wrapper for NHL predictions that logs every pick to CSV.
 * Logs both OVERS and UNDERS with full details for tracking.
 */

import NHLPredictionLogger from '../../../scripts/nhl/log-prediction.mjs';

// Singleton logger
let logger = null;

function getLogger() {
  if (!logger) {
    logger = new NHLPredictionLogger();
  }
  return logger;
}

/**
 * Log NHL prediction opportunities
 * 
 * @param {Array} opportunities - Array of prediction opportunities
 * @param {Object} metadata - Game metadata (start time, teams, etc.)
 */
export async function logNHLPredictions(opportunities, metadata = {}) {
  try {
    const logger = getLogger();
    
    if (!opportunities || opportunities.length === 0) {
      console.log('⚠️  No NHL opportunities to log');
      return { logged: false, count: 0 };
    }
    
    // Transform opportunities to prediction format
    const predictions = opportunities.map(opp => ({
      date: metadata.date || new Date().toISOString().split('T')[0],
      gameId: opp.gameId || `${opp.team}_${opp.opponent}_${metadata.date}`,
      player: opp.player,
      team: opp.team,
      opponent: opp.opponent,
      position: opp.position || '',
      line: opp.line,
      direction: opp.recommendation?.toUpperCase() || 'OVER', // OVER or UNDER
      predictedSOG: opp.projected || opp.predictedSOG,
      edge: opp.edge,
      edgePercent: opp.edgePercent || ((opp.edge / opp.line) * 100),
      odds: opp.odds || opp.price,
      book: opp.book || opp.sportsbook || 'Average',
      modelProb: opp.modelProb || null,
      impliedProb: opp.impliedProb || null,
      gameStartTime: opp.gameStartTime || metadata.gameStartTime,
      isHome: opp.isHome || false,
      ppUnit: opp.ppUnit || '',
      iceTimeL5: opp.iceTimeL5 || null
    }));
    
    // Log all predictions
    logger.logPredictions(predictions);
    
    return { logged: true, count: predictions.length };
    
  } catch (error) {
    console.error('❌ Error logging NHL predictions:', error.message);
    return { logged: false, error: error.message };
  }
}

/**
 * Get current performance metrics
 */
export function getNHLMetrics(window = 20) {
  try {
    const logger = getLogger();
    return logger.calculateRollingMetrics(window);
  } catch (error) {
    console.error('❌ Error calculating NHL metrics:', error.message);
    return null;
  }
}

export { getLogger };
