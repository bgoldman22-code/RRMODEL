/**
 * NBA Predictions Tracking - Save Daily Predictions
 * 
 * Stores predictions to Netlify Blobs for later verification
 * 
 * Storage Structure:
 * - nba-games-predictions:{YYYY-MM-DD} → Array of game predictions
 * - nba-props-predictions:{YYYY-MM-DD} → Array of prop predictions
 * 
 * Called by prediction generation functions to track picks
 */

import { getStore } from '@netlify/blobs';
import { createHash } from 'crypto';

/**
 * Generate deterministic prediction ID for games
 */
function generateGamePredictionId(pred, date) {
  const parts = [
    'nba',
    date,
    pred.gameId || 'unknown',
    pred.homeTeam,
    pred.awayTeam,
    'ML', // Market type
    pred.predictedWinner,
    pred.homeOdds || 0
  ];
  return parts.join('_').replace(/\s+/g, '-');
}

/**
 * Generate deterministic prediction ID for props
 */
function generatePropPredictionId(pred, date) {
  const parts = [
    'nba',
    date,
    pred.gameId || 'unknown',
    pred.player.replace(/\s+/g, '-'),
    pred.propType,
    pred.betSide,
    pred.vegasLine,
    pred.vegasOdds || 0
  ];
  return parts.join('_');
}

/**
 * Save game predictions for a specific date
 */
export async function saveGamePredictions(predictions, date = null) {
  const store = getStore('nba-tracking');
  const predDate = date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const snapshotAt = new Date().toISOString();
  
  const key = `games-predictions:${predDate}`;
  
  // Structure each prediction with identity + versioning
  const structuredPredictions = predictions.map(pred => ({
    // Identity + Versioning
    schemaVersion: 1,
    predictionId: generateGamePredictionId(pred, predDate),
    snapshotAt,
    savedAt: snapshotAt,
    gameDate: predDate,
    
    // Game Identity
    espnGameId: pred.gameId || null,
    gameTime: pred.gameTime,
    homeTeam: pred.homeTeam,
    awayTeam: pred.awayTeam,
    homeTeamId: pred.homeTeamId || null,
    awayTeamId: pred.awayTeamId || null,
    
    // Prediction
    predictedWinner: pred.predictedWinner,
    predictedMargin: pred.predictedMargin || null,
    predictedTotal: pred.predictedTotal || null,
    confidence: pred.confidence || null,
    
    // Odds Snapshot
    lineSource: pred.lineSource || 'TheOddsAPI',
    homeOdds: pred.homeOdds || null,
    awayOdds: pred.awayOdds || null,
    spread: pred.spread || null,
    total: pred.total || null,
    closingLine: null,  // Filled by pre-game updater
    closingPrice: null, // Filled by pre-game updater
    
    // Model metadata
    model: pred.model || 'Unknown',
    recommendationTier: pred.recommendationTier || null,
    
    // Grading (filled by verifier)
    grade: 'PENDING',
    gradeReason: null,
    verified: false
  }));
  
  await store.setJSON(key, structuredPredictions);
  
  console.log(`✅ Saved ${structuredPredictions.length} game predictions for ${predDate}`);
  
  return { success: true, count: structuredPredictions.length, key };
}

/**
 * Save player prop predictions for a specific date
 */
export async function savePropPredictions(predictions, date = null) {
  const store = getStore('nba-tracking');
  const predDate = date || new Date().toISOString().split('T')[0];
  const snapshotAt = new Date().toISOString();
  
  const key = `props-predictions:${predDate}`;
  
  const structuredPredictions = predictions.map(pred => ({
    // Identity + Versioning
    schemaVersion: 1,
    predictionId: generatePropPredictionId(pred, predDate),
    snapshotAt,
    savedAt: snapshotAt,
    gameDate: predDate,
    
    // Player Identity
    player: pred.player,
    espnPlayerId: pred.espnPlayerId || null,
    team: pred.team,
    teamId: pred.teamId || null,
    opponent: pred.opponent,
    opponentId: pred.opponentId || null,
    
    // Prop Details
    market: pred.propType, // 'rebounds' or 'assists'
    propType: pred.propType, // Keep for backwards compat
    side: pred.betSide, // OVER or UNDER
    betSide: pred.betSide, // Keep for backwards compat
    line: pred.vegasLine,
    price: pred.vegasOdds || null,
    prediction: pred.prediction,
    
    // Odds Snapshot
    lineSource: pred.bookmaker || 'TheOddsAPI',
    vegasLine: pred.vegasLine, // Keep for backwards compat
    vegasOdds: pred.vegasOdds || null, // Keep for backwards compat
    impliedProb: pred.impliedProb || null,
    edge: pred.edge || null,
    confidence: pred.confidence || null,
    kellyFraction: pred.kellyFraction || null,
    recommendedUnits: pred.recommendedUnits || null,
    closingLine: null,  // Filled by pre-game updater
    closingPrice: null, // Filled by pre-game updater
    
    // Metadata
    bookmaker: pred.bookmaker || null,
    gameTime: pred.gameTime,
    model: pred.model || 'Baseline v2',
    
    // Grading (filled by verifier)
    actualStat: null,
    minutesPlayed: null,
    grade: 'PENDING', // HIT, MISS, PUSH, VOID, DNP
    gradeReason: null,
    verified: false,
    dnp: false // Keep for backwards compat
  }));
  
  await store.setJSON(key, structuredPredictions);
  
  console.log(`✅ Saved ${structuredPredictions.length} prop predictions for ${predDate}`);
  
  return { success: true, count: structuredPredictions.length, key };
}

/**
 * Netlify Function endpoint (optional - for manual saves)
 */
export default async (req, context) => {
  try {
    const { type, predictions, date } = await req.json();
    
    if (!type || !predictions || !Array.isArray(predictions)) {
      return new Response(JSON.stringify({
        error: 'Missing required fields: type, predictions'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    let result;
    if (type === 'games') {
      result = await saveGamePredictions(predictions, date);
    } else if (type === 'props') {
      result = await savePropPredictions(predictions, date);
    } else {
      return new Response(JSON.stringify({
        error: 'Invalid type. Must be "games" or "props"'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('Error saving predictions:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
