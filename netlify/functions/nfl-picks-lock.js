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
    const { gameId, action, source = 'kickoff' } = JSON.parse(event.body || '{}');
    
    if (action === 'lock' && gameId) {
      const result = await lockPicksForGame(gameId, source);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(result)
      };
    }
    
    if (action === 'get' && gameId) {
      const lockedPicks = await getLockedPicks(gameId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ gameId, lockedPicks })
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
async function lockPicksForGame(gameId, source = 'kickoff', force = false) {
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
      locked_at: now.toISOString()
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
      locked_at: now.toISOString()
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
      locked_at: now.toISOString()
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
 */
async function lockMarketPick({ gameId, market, prediction, closingOdds, odds, source, locked_at }) {
  const lockData = {
    gameId,
    market,
    pick: prediction.pick,
    confidence: prediction.confidence,
    model_line_homePOV: prediction.model_home_margin || prediction.predicted || null,
    closing_line_homePOV: null,
    best_book: prediction.best_book || null,
    locked_at,
    source,
    closing_fallback: !closingOdds
  };
  
  // Add market-specific closing line data
  if (closingOdds) {
    if (market === 'spread') {
      lockData.closing_line_homePOV = closingOdds.home_line;
      lockData.closing_odds_display = closingOdds.display_book;
    } else if (market === 'total') {
      lockData.closing_line_homePOV = closingOdds.over_line;
      lockData.closing_odds_display = closingOdds.display_book;
    } else if (market === 'moneyline') {
      lockData.closing_odds_home = closingOdds.home_price;
      lockData.closing_odds_away = closingOdds.away_price;
      lockData.closing_odds_display = closingOdds.display_book;
    }
  } else {
    // Fallback to current odds structure
    if (odds?.display) {
      if (market === 'spread') {
        lockData.closing_line_homePOV = odds.display.spread?.home_line;
        lockData.closing_odds_display = odds.display_book;
      } else if (market === 'total') {
        lockData.closing_line_homePOV = odds.display.total?.over?.line;
        lockData.closing_odds_display = odds.display_book;
      } else if (market === 'moneyline') {
        lockData.closing_odds_home = odds.display.h2h?.home;
        lockData.closing_odds_away = odds.display.h2h?.away;
        lockData.closing_odds_display = odds.display_book;
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