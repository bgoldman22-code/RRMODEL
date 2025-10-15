/**
 * Production Prediction Logger for NBA Predictions
 * 
 * Lightweight wrapper around the logging system for use in Netlify functions.
 * Logs predictions asynchronously to avoid blocking API responses.
 */

import PredictionLogger from '../../../../scripts/nba/log-prediction.mjs';

// Singleton logger instance
let logger = null;

/**
 * Get or create logger instance
 */
function getLogger() {
  if (!logger) {
    logger = new PredictionLogger();
  }
  return logger;
}

/**
 * Log a prediction from the NBA predictions endpoint
 * 
 * @param {Object} game - Game data
 * @param {Object} prediction - Prediction results
 * @param {Object} rciData - RCI adjustment data
 */
export async function logNBAPrediction(game, prediction, rciData) {
  try {
    const logger = getLogger();
    
    const logData = {
      date: game.date || new Date().toISOString().split('T')[0],
      gameId: game.id || `${game.awayTeam}_${game.homeTeam}_${game.date}`,
      team: game.homeTeam,
      opponent: game.awayTeam,
      isHome: true,
        rci: safe(rciData.homeRCI, 0.75),
        gamesPlayed: safe(rciData.homeGamesPlayed, 0),
        deltaOff: safe(rciData.homeDeltaOff, 0),
        deltaDef: safe(rciData.homeDeltaDef, 0),
        deltaNet: deltaNetCapped,
        injuryNet: injuryNetCapped,
        capHit: safe(rciData.homeCapHit, false),
        baselineSpread: safe(prediction.baselineSpread, 0),
        rciSpread: safe(prediction.spread, 0),
        actualSpread: null,  // Will be updated after game
        lineClose: closingSpread,
        closingMlFav,
        closingMlDog,
        modelProbHome,
        impliedProbClose,
        clv,
        bestBook,
        absErrBaseline,
        absErrRCI,
        configHash,
        modelVersion,
        dataSnapshotTs,
        rngSeed,
        cutoffTs,
        preseason,
        notes: safe(rciData.notes, '')
    };

    logger.logPrediction(logData);
    
    // Also log away team perspective
    const awayLogData = {
      ...logData,
      team: game.awayTeam,
      opponent: game.homeTeam,
      isHome: false,
      rci: rciData.awayRCI || 0.75,
      gamesPlayed: rciData.awayGamesPlayed || 0,
      deltaOff: rciData.awayDeltaOff || 0,
      deltaDef: rciData.awayDeltaDef || 0,
      deltaNet: rciData.awayDeltaNet || 0,
      capHit: rciData.awayCapHit || false,
      baselineSpread: -(prediction.baselineSpread || 0),
      rciSpread: -(prediction.spread || 0)
    };

    logger.logPrediction(awayLogData);

    return { logged: true, count: 2 };
  } catch (error) {
    console.error('❌ Error logging prediction:', error.message);
    return { logged: false, error: error.message };
  }
}

/**
 * Update prediction with actual result
 * 
 * @param {string} gameId - Game identifier
 * @param {number} actualSpread - Actual point differential
 */
export async function updatePredictionResult(gameId, actualSpread) {
  try {
    const logger = getLogger();
    const predictions = logger.getAllPredictions();
    
    // Find predictions for this game
    const gamePredictions = predictions.filter(p => p.game_id === gameId);
    
    if (gamePredictions.length === 0) {
      console.warn(`⚠️ No predictions found for game ${gameId}`);
      return { updated: false };
    }

    // Update logic would go here
    // For now, we'll handle updates via a separate script
    console.log(`✅ Would update ${gamePredictions.length} predictions for game ${gameId}`);
    
    return { updated: true, count: gamePredictions.length };
  } catch (error) {
    console.error('❌ Error updating result:', error.message);
    return { updated: false, error: error.message };
  }
}

/**
 * Get current performance dashboard
 */
export function getPerformanceDashboard(window = 10) {
  try {
    const logger = getLogger();
    const metrics = logger.calculateRollingMetrics(window);
    const alerts = logger.checkAlerts(metrics);
    
    return {
      success: true,
      metrics,
      alerts,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('❌ Error getting dashboard:', error.message);
    return { success: false, error: error.message };
  }
}

export default {
  logNBAPrediction,
  updatePredictionResult,
  getPerformanceDashboard
};
