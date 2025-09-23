// netlify/functions/nfl-picks-lock.js
// Lock picks at kickoff with closing odds for honest performance tracking

import { getStore } from "@netlify/blobs";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ODDS_API_BASE = 'https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds';

// Store structure for locked picks
// lock_id: `${gameId}-${market}` (e.g. "BUF@MIA-spread")
// Data: {
//   gameId, market, pick, confidence, 
//   model_line_homePOV, closing_line_homePOV,
//   best_book: { bookmaker, price, line, edge_pct },
//   locked_at, source, closing_fallback,
//   odds_snapshot: { full closing odds }
// }

export const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { 
      gameId, 
      game_id, 
      action, 
      source = 'kickoff',
      home_team,
      away_team 
    } = JSON.parse(event.body || '{}');
    
    const resolvedGameId = gameId || game_id;
    
    if (action === 'lock' && resolvedGameId) {
      const result = await lockPicksForGame(resolvedGameId, source, false, home_team, away_team);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    }
    
    if (action === 'get' && resolvedGameId) {
      const lockedPicks = await getLockedPicks(resolvedGameId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ gameId: resolvedGameId, lockedPicks })
      };
    }
    
    if (action === 'batch_safety') {
      const result = await batchSafetyLock();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    }

    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid action or missing gameId' })
    };

  } catch (error) {
    console.error('Pick locking error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

/**
 * Lock picks for a specific game at kickoff with closing odds
 * Idempotent - won't overwrite existing locks unless force=true
 */
async function lockPicksForGame(gameId, source = 'kickoff', force = false, homeTeam = null, awayTeam = null) {
  const store = getStore("locked-picks");
  const now = new Date();
  
  console.log(`[LOCK] Attempting to lock picks for game ${gameId} from ${source}`);
  
  // Check if already locked (idempotency)
  const existingLocks = await Promise.allSettled([
    store.get(`${gameId}-spread`),
    store.get(`${gameId}-total`), 
    store.get(`${gameId}-moneyline`)
  ]);
  
  const hasExistingLocks = existingLocks.some(result => 
    result.status === 'fulfilled' && result.value !== null
  );
  
  if (hasExistingLocks && !force) {
    console.log(`[LOCK] Game ${gameId} already locked, skipping`);
    return { gameId, status: 'already_locked', existing: true };
  }

  // Get current predictions and odds for this game
  const currentPredictions = await getCurrentPredictions(gameId);
  if (!currentPredictions) {
    throw new Error(`Could not get current predictions for game ${gameId}`);
  }
  
  // Get closing odds from multiple books
  const closingOdds = await getClosingOdds(gameId);
  if (!closingOdds) {
    console.warn(`[LOCK] Could not get closing odds for ${gameId}, using current predictions`);
  }

  const lockedPicks = {};
  
  // Lock spread pick
  if (currentPredictions.spread) {
    const spreadLock = await lockMarketPick({
      gameId,
      market: 'spread',
      prediction: currentPredictions.spread,
      closingOdds: closingOdds?.spread,
      odds: currentPredictions.odds,
      source,
      locked_at: now.toISOString(),
      homeTeam,
      awayTeam
    });
    
    await store.set(`${gameId}-spread`, JSON.stringify(spreadLock));
    lockedPicks.spread = spreadLock;
  }
  
  // Lock total pick  
  if (currentPredictions.total) {
    const totalLock = await lockMarketPick({
      gameId,
      market: 'total',
      prediction: currentPredictions.total,
      closingOdds: closingOdds?.total,
      odds: currentPredictions.odds,
      source,
      locked_at: now.toISOString(),
      homeTeam,
      awayTeam
    });
    
    await store.set(`${gameId}-total`, JSON.stringify(totalLock));
    lockedPicks.total = totalLock;
  }
  
  // Lock moneyline pick
  if (currentPredictions.moneyline) {
    const mlLock = await lockMarketPick({
      gameId,
      market: 'moneyline', 
      prediction: currentPredictions.moneyline,
      closingOdds: closingOdds?.moneyline,
      odds: currentPredictions.odds,
      source,
      locked_at: now.toISOString(),
      homeTeam,
      awayTeam
    });
    
    await store.set(`${gameId}-moneyline`, JSON.stringify(mlLock));
    lockedPicks.moneyline = mlLock;
  }

  console.log(`[LOCK] Successfully locked ${Object.keys(lockedPicks).length} markets for ${gameId}`);
  
  return {
    gameId,
    status: 'locked',
    source,
    locked_at: now.toISOString(),
    markets: lockedPicks
  };
}

/**
 * Lock a specific market pick with closing line data
 * Updated data contract for frontend integration
 */
async function lockMarketPick({ gameId, market, prediction, closingOdds, odds, source, locked_at, homeTeam, awayTeam }) {
  const lockData = {
    pick: prediction.pick,
    confidence: prediction.confidence,
    locked_at,
    trigger_source: source,
    closing_book: null,
    closing_odds: null,
    closing_line: null,        // For spreads - pick POV  
    closing_total: null,       // For totals
    model_home_margin: prediction.model_home_margin || null,
    closing_fallback: !closingOdds
  };
  
  // Add market-specific closing line data
  if (closingOdds) {
    lockData.closing_book = closingOdds.display_book;
    
    if (market === 'spread') {
      // Store in home POV, will convert to pick POV later
      const homeLinePOV = closingOdds.home_line;
      // Convert to picked team POV for frontend display consistency
      if (prediction.pick === homeTeam) {
        lockData.closing_line = homeLinePOV > 0 ? `+${homeLinePOV.toFixed(1)}` : `${homeLinePOV.toFixed(1)}`;
      } else if (prediction.pick === awayTeam) {
        lockData.closing_line = (-homeLinePOV) > 0 ? `+${(-homeLinePOV).toFixed(1)}` : `${(-homeLinePOV).toFixed(1)}`;
      }
      lockData.closing_odds = closingOdds.home_price || closingOdds.away_price || -110;
      
    } else if (market === 'total') {
      lockData.closing_total = closingOdds.over_line;
      lockData.closing_odds = closingOdds.over_price || closingOdds.under_price || -110;
      
    } else if (market === 'moneyline') {
      // Store the odds for the picked team
      if (prediction.pick === homeTeam) {
        lockData.closing_odds = closingOdds.home_price;
      } else if (prediction.pick === awayTeam) {
        lockData.closing_odds = closingOdds.away_price;
      }
    }
  } else {
    // Fallback to current odds structure
    lockData.closing_book = odds?.display_book || 'Unknown';
    
    if (odds?.display) {
      if (market === 'spread') {
        const homeLinePOV = odds.display.spread?.home_line;
        if (homeLinePOV !== undefined && prediction.pick) {
          if (prediction.pick === homeTeam) {
            lockData.closing_line = homeLinePOV > 0 ? `+${homeLinePOV.toFixed(1)}` : `${homeLinePOV.toFixed(1)}`;
          } else if (prediction.pick === awayTeam) {
            lockData.closing_line = (-homeLinePOV) > 0 ? `+${(-homeLinePOV).toFixed(1)}` : `${(-homeLinePOV).toFixed(1)}`;
          }
        }
        lockData.closing_odds = odds.display.spread?.home_price || odds.display.spread?.away_price || -110;
        
      } else if (market === 'total') {
        lockData.closing_total = odds.display.total?.over?.line;
        lockData.closing_odds = odds.display.total?.over?.price || odds.display.total?.under?.price || -110;
        
      } else if (market === 'moneyline') {
        if (prediction.pick === homeTeam) {
          lockData.closing_odds = odds.display.h2h?.home;
        } else if (prediction.pick === awayTeam) {
          lockData.closing_odds = odds.display.h2h?.away;
        }
      }
    }
  }
  
  return lockData;
}

/**
 * Get current predictions for a game (call existing predictions function)
 */
async function getCurrentPredictions(gameId) {
  try {
    // This would call our existing nfl-predictions-generate function
    // For now, return null to indicate we need to integrate this
    console.log(`[LOCK] Getting predictions for ${gameId} - TODO: integrate with existing function`);
    return null;
  } catch (error) {
    console.error(`[LOCK] Failed to get predictions for ${gameId}:`, error);
    return null;
  }
}

/**
 * Get closing odds from The Odds API
 */
async function getClosingOdds(gameId) {
  if (!ODDS_API_KEY) {
    console.warn('[LOCK] No ODDS_API_KEY configured, skipping closing odds fetch');
    return null;
  }
  
  try {
    // This would fetch from The Odds API using the gameId
    // For now, return null to indicate we need to map gameId to API format
    console.log(`[LOCK] Getting closing odds for ${gameId} - TODO: implement API integration`);
    return null;
  } catch (error) {
    console.error(`[LOCK] Failed to get closing odds for ${gameId}:`, error);
    return null;
  }
}

/**
 * Get locked picks for a game
 */
async function getLockedPicks(gameId) {
  const store = getStore("locked-picks");
  
  const [spread, total, moneyline] = await Promise.allSettled([
    store.get(`${gameId}-spread`),
    store.get(`${gameId}-total`),
    store.get(`${gameId}-moneyline`)
  ]);
  
  const picks = {};
  
  if (spread.status === 'fulfilled' && spread.value) {
    picks.spread = JSON.parse(spread.value);
  }
  
  if (total.status === 'fulfilled' && total.value) {
    picks.total = JSON.parse(total.value);
  }
  
  if (moneyline.status === 'fulfilled' && moneyline.value) {
    picks.moneyline = JSON.parse(moneyline.value);
  }
  
  return picks;
}

/**
 * Batch safety lock - catch any games that should be locked but aren't
 * Called by scheduled functions on Sunday at 5PM/8PM/11:59PM
 */
async function batchSafetyLock() {
  console.log('[BATCH] Starting batch safety lock sweep');
  
  // TODO: Get all games for current week that have started but aren't locked
  // This would integrate with our existing schedule/games logic
  
  const results = {
    scanned: 0,
    locked: 0,
    errors: []
  };
  
  console.log('[BATCH] Batch safety lock completed', results);
  return results;
}