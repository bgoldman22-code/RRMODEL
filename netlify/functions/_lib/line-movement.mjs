// netlify/functions/_lib/line-movement.mjs
// Line movement analysis and CLV tracking utilities

import { getStore } from "@netlify/blobs";

/**
 * Get movement metrics for a specific game and market
 * @param {string} gameId - Game identifier
 * @param {string} market - 'moneyline', 'spread', or 'total'
 * @param {string} side - 'home' or 'away' (or 'over'/'under' for totals)
 * @returns {Object} Movement metrics
 */
export async function getMovementMetrics(gameId, market, side) {
  const store = getStore("odds-timeseries");
  
  try {
    // Get all snapshots for this game (last 24h)
    const snapshots = await getRecentSnapshots(store, gameId, hours = 24);
    
    if (snapshots.length === 0) {
      return null;
    }
    
    // Extract implied probabilities for the specific market/side
    const timeSeries = snapshots.map(snap => ({
      timestamp: snap.timestamp,
      implied: getImpliedProbFromSnapshot(snap, market, side)
    })).filter(point => point.implied !== null);
    
    if (timeSeries.length < 2) {
      return null; // Not enough data
    }
    
    // Calculate metrics
    const open = timeSeries[0].implied;
    const current = timeSeries[timeSeries.length - 1].implied;
    const min = Math.min(...timeSeries.map(p => p.implied));
    const max = Math.max(...timeSeries.map(p => p.implied));
    
    const drift_bps = Math.round((current - open) * 10000); // basis points
    
    // Velocity (last 30min and 60min)
    const now = new Date();
    const velocity_30m = calculateVelocity(timeSeries, now, 30);
    const velocity_60m = calculateVelocity(timeSeries, now, 60);
    
    // Breadth (how many books moving same direction in last 30min)
    const breadth = await calculateBreadth(snapshots.slice(-6), market, side); // Last 6 snapshots ≈ 30min
    
    // Volatility (6h standard deviation)
    const volatility_6h = calculateVolatility(timeSeries.slice(-72)); // 72 snapshots ≈ 6h
    
    // Detect steam (broad, fast move)
    const steam_detected = breadth >= 4 && Math.abs(velocity_30m) >= 0.83; // ≥25 bps in 30min
    const steam_direction = velocity_30m > 0 ? side : (side === 'home' ? 'away' : 'home');
    
    // Key number detection (spreads/totals only)
    const key_number_crossed = detectKeyNumberCrossings(timeSeries, market);
    
    return {
      game_id: gameId,
      market,
      side,
      
      // Price history
      open_implied: open,
      current_implied: current,
      low_implied: min,
      high_implied: max,
      close_implied: null, // Filled at kickoff
      
      // Movement signals
      drift_bps,
      velocity_30m,
      velocity_60m,
      breadth,
      volatility_6h,
      
      // Special events
      steam_detected,
      steam_timestamp: steam_detected ? timeSeries[timeSeries.length - 1].timestamp : null,
      steam_direction: steam_detected ? steam_direction : null,
      key_number_crossed,
      
      // Raw data for charting
      timestamps: timeSeries.map(p => p.timestamp),
      implied_probabilities: timeSeries.map(p => p.implied)
    };
    
  } catch (error) {
    console.error(`[MOVEMENT] Error getting metrics for ${gameId}:`, error);
    return null;
  }
}

/**
 * Get recent snapshots for a game
 */
async function getRecentSnapshots(store, gameId, hours = 24) {
  const snapshots = [];
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
  
  try {
    // List all keys for this game
    const { blobs } = await store.list({ prefix: `${gameId}/` });
    
    for (const blob of blobs) {
      if (blob.key.endsWith('/latest')) continue; // Skip latest pointer
      
      const snapshot = await store.get(blob.key, { type: 'json' });
      const snapshotTime = new Date(snapshot.timestamp);
      
      if (snapshotTime >= cutoff) {
        snapshots.push(snapshot);
      }
    }
    
    // Sort by timestamp
    snapshots.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
  } catch (error) {
    console.error(`[MOVEMENT] Error fetching snapshots:`, error);
  }
  
  return snapshots;
}

/**
 * Extract implied probability from snapshot for specific market/side
 */
function getImpliedProbFromSnapshot(snapshot, market, side) {
  // Average across all allowed books
  const impliedValues = [];
  
  for (const [bookName, bookData] of Object.entries(snapshot.books || {})) {
    let implied = null;
    
    if (market === 'moneyline') {
      implied = side === 'home' ? bookData.moneyline?.home_implied : bookData.moneyline?.away_implied;
    } else if (market === 'spread') {
      implied = side === 'home' ? bookData.spread?.home_implied : bookData.spread?.away_implied;
    } else if (market === 'total') {
      implied = side === 'over' ? bookData.total?.over_implied : bookData.total?.under_implied;
    }
    
    if (implied !== null && implied !== undefined) {
      impliedValues.push(implied);
    }
  }
  
  if (impliedValues.length === 0) return null;
  
  // Return average
  return impliedValues.reduce((a, b) => a + b, 0) / impliedValues.length;
}

/**
 * Calculate velocity (bps per minute) over time window
 */
function calculateVelocity(timeSeries, now, windowMinutes) {
  const cutoff = new Date(now.getTime() - windowMinutes * 60 * 1000);
  const recentPoints = timeSeries.filter(p => new Date(p.timestamp) >= cutoff);
  
  if (recentPoints.length < 2) return 0;
  
  const first = recentPoints[0].implied;
  const last = recentPoints[recentPoints.length - 1].implied;
  const deltaMinutes = (new Date(recentPoints[recentPoints.length - 1].timestamp) - new Date(recentPoints[0].timestamp)) / (60 * 1000);
  
  if (deltaMinutes === 0) return 0;
  
  const deltaBps = (last - first) * 10000;
  return deltaBps / deltaMinutes;
}

/**
 * Calculate how many books moved in same direction
 */
async function calculateBreadth(snapshots, market, side) {
  if (snapshots.length < 2) return 0;
  
  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  
  let booksMoved = 0;
  
  for (const bookName of Object.keys(first.books || {})) {
    if (!last.books?.[bookName]) continue;
    
    const impliedFirst = getImpliedForBook(first.books[bookName], market, side);
    const impliedLast = getImpliedForBook(last.books[bookName], market, side);
    
    if (impliedFirst && impliedLast && Math.abs(impliedLast - impliedFirst) > 0.005) {
      booksMoved++;
    }
  }
  
  return booksMoved;
}

function getImpliedForBook(bookData, market, side) {
  if (market === 'moneyline') {
    return side === 'home' ? bookData.moneyline?.home_implied : bookData.moneyline?.away_implied;
  } else if (market === 'spread') {
    return side === 'home' ? bookData.spread?.home_implied : bookData.spread?.away_implied;
  } else if (market === 'total') {
    return side === 'over' ? bookData.total?.over_implied : bookData.total?.under_implied;
  }
  return null;
}

/**
 * Calculate standard deviation of implied probabilities
 */
function calculateVolatility(timeSeries) {
  if (timeSeries.length < 2) return 0;
  
  const values = timeSeries.map(p => p.implied);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  
  return Math.sqrt(variance);
}

/**
 * Detect key number crossings (spreads/totals)
 */
function detectKeyNumberCrossings(timeSeries, market) {
  const keyNumbers = market === 'spread' ? [3, 7, 10, 14] : [37, 41, 44, 47, 51];
  const crossings = [];
  
  // For simplicity, this assumes spreads are encoded in line values
  // In practice, you'd need to track actual line movements, not just implied prob
  
  return crossings; // Placeholder - needs actual line tracking
}

/**
 * Get rolling CLV statistics
 */
export async function getRollingCLV(market, weeks = 6) {
  const store = getStore("clv-tracking");
  const cutoff = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000);
  
  try {
    const { blobs } = await store.list();
    const recentBets = [];
    
    for (const blob of blobs) {
      const bet = await store.get(blob.key, { type: 'json' });
      const betTime = new Date(bet.entry_timestamp);
      
      if (betTime >= cutoff && bet.market === market && bet.clv_bps !== null) {
        recentBets.push(bet);
      }
    }
    
    if (recentBets.length === 0) {
      return { avg_clv_bps: 0, positive_clv_rate: 0, count: 0 };
    }
    
    const avgCLV = recentBets.reduce((sum, b) => sum + b.clv_bps, 0) / recentBets.length;
    const positiveCLV = recentBets.filter(b => b.clv_bps > 0).length / recentBets.length;
    
    return {
      avg_clv_bps: avgCLV,
      positive_clv_rate: positiveCLV,
      count: recentBets.length
    };
    
  } catch (error) {
    console.error('[CLV] Error getting rolling stats:', error);
    return { avg_clv_bps: 0, positive_clv_rate: 0, count: 0 };
  }
}

/**
 * Get median volatility for a market (historical baseline)
 */
export async function getMedianVolatility(market) {
  // Placeholder - would compute from historical data
  // For now, return reasonable defaults
  return market === 'moneyline' ? 0.015 : 0.012;
}
