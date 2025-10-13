// netlify/functions/nfl-picks-lock.mjs
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

export default async (request, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS for CORS
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 200, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers
    });
  }

  try {
    const body = await request.json();
    const { 
      gameId, 
      game_id, 
      action, 
      source = 'kickoff',
      home_team,
      away_team,
      gameData // (optional) full game prediction payload from nfl-predictions-generate
    } = body;
    
    const resolvedGameId = gameId || game_id;
    
    if (action === 'lock' && resolvedGameId) {
      const result = await lockPicksForGame(resolvedGameId, source, false, home_team, away_team, gameData);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers
      });
    }
    
    if (action === 'get' && resolvedGameId) {
      const lockedPicks = await getLockedPicks(resolvedGameId);
      return new Response(JSON.stringify({ gameId: resolvedGameId, lockedPicks }), {
        status: 200,
        headers
      });
    }
    
    if (action === 'batch_safety') {
      const result = await batchSafetyLock();
      return new Response(JSON.stringify(result), {
        status: 200,
        headers
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action or missing gameId' }), {
      status: 400,
      headers
    });

  } catch (error) {
    console.error('Pick locking error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers
    });
  }
};

/**
 * Lock picks for a specific game at kickoff with closing odds
 * Idempotent - won't overwrite existing locks unless force=true
 */
async function lockPicksForGame(gameId, source = 'kickoff', force = false, homeTeam = null, awayTeam = null, gameData = null) {
  // FIX: Use proper Netlify environment variables for blob store
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  const store = (siteID && token) 
    ? getStore({ siteID, token, name: "locked-picks" })
    : getStore("locked-picks");
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

  // Derive home/away from gameData if not explicitly supplied
  // FIX: Support both camelCase (homeTeam) and snake_case (home_team) field names
  if (gameData && (!homeTeam || !awayTeam)) {
    homeTeam = homeTeam || gameData.homeTeam || gameData.home_team || null;
    awayTeam = awayTeam || gameData.awayTeam || gameData.away_team || null;
  }

  // Prefer inline gameData (already contains fresh predictions) to avoid recursive fetches
  let currentPredictions = null;
  if (gameData && gameData.predictions) {
    currentPredictions = extractPredictionsFromGame(gameData);
  } else {
    currentPredictions = await getCurrentPredictions(gameId);
  }

  if (!currentPredictions) {
    throw new Error(`Could not get current predictions for game ${gameId} (no gameData and fetch stub not implemented)`);
  }
  
  // Build a pseudo "closing odds" snapshot from supplied odds if API not implemented
  let closingOdds = await getClosingOdds(gameId);
  if (!closingOdds && gameData?.odds) {
    closingOdds = buildClosingOddsSnapshot(gameData.odds);
    if (closingOdds) {
      console.log(`[LOCK] Using inline odds snapshot for ${gameId} as closing odds (fallback)`);
    }
  }
  if (!closingOdds) {
    console.warn(`[LOCK] Could not get closing odds or fallback snapshot for ${gameId}, proceeding with prediction odds`);
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
 * Extract simplified prediction object from full game payload
 */
function extractPredictionsFromGame(game) {
  try {
    if (!game || !game.predictions) return null;
    return {
      spread: game.predictions.spread || null,
      total: game.predictions.total || null,
      moneyline: game.predictions.moneyline || null,
      odds: game.odds || null
    };
  } catch (e) {
    console.error('[LOCK] Failed to extract predictions from gameData:', e);
    return null;
  }
}

/**
 * Build a closing odds snapshot object from the in-flight odds structure
 * Expected shape consumed downstream:
 * { display_book, spread:{home_line,home_price,away_line,away_price}, total:{over_line,over_price,under_price}, moneyline:{home_price,away_price} }
 */
function buildClosingOddsSnapshot(odds) {
  try {
    // Support both new structured (display + display_book) and legacy formats
    const display = odds.display || odds; // fallback
    const book = odds.display_book || display.bookmaker || 'Unknown';

    const spread = {
      home_line: display.spread?.home_line ?? odds.spread?.home_line ?? odds.spread?.line ?? null,
      home_price: display.spread?.home_price ?? null,
      away_line: display.spread?.away_line ?? null,
      away_price: display.spread?.away_price ?? null
    };
    const total = {
      over_line: display.total?.over?.line ?? null,
      over_price: display.total?.over?.price ?? null,
      under_line: display.total?.under?.line ?? null,
      under_price: display.total?.under?.price ?? null
    };
    const moneyline = {
      home_price: display.h2h?.home ?? odds.moneyline?.home ?? null,
      away_price: display.h2h?.away ?? odds.moneyline?.away ?? null
    };

    // If we have no actual prices/lines, treat as unusable
    const hasAny = [spread.home_line, spread.away_line, total.over_line, moneyline.home_price, moneyline.away_price]
      .some(v => v !== null && v !== undefined);
    if (!hasAny) return null;

    return { display_book: book, spread, total, moneyline };
  } catch (e) {
    console.error('[LOCK] Failed building closing odds snapshot:', e);
    return null;
  }
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
  // FIX: Use proper Netlify environment variables for blob store
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  const store = (siteID && token) 
    ? getStore({ siteID, token, name: "locked-picks" })
    : getStore("locked-picks");
  
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