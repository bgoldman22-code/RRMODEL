/**
 * NHL PREDICTION LOGGER
 * 
 * Tracks all predictions for:
 * - Historical performance analysis
 * - Machine learning training data
 * - Edge calibration validation
 * - Hit rate tracking by edge bucket
 * 
 * Storage: Netlify Blobs (same as player data)
 */

import { getStore } from '@netlify/blobs';

/**
 * Log a prediction to storage
 * 
 * Stores prediction details for later validation against actual results
 */
export async function logPrediction(opportunity, gameInfo) {
  try {
    const store = getStore('nhl-predictions');
    
    // Create unique key: date_gameId_playerId_line
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `${date}_${gameInfo.gameId}_${opportunity.playerId}_${opportunity.line}`;
    
    const prediction = {
      // Identifiers
      date,
      gameId: gameInfo.gameId,
      playerId: opportunity.playerId,
      playerName: opportunity.playerName,
      team: opportunity.team,
      opponent: gameInfo.opponent,
      
      // Game context
      isHome: gameInfo.isHome,
      venue: gameInfo.venue,
      gameTime: gameInfo.gameTime,
      
      // Prediction details
      line: opportunity.line,
      side: opportunity.side, // 'over' or 'under'
      projection: opportunity.projection,
      modelProbability: opportunity.probability,
      
      // ZINB parameters (for analysis)
      zinbMu: opportunity.zinbMu,
      zinbR: opportunity.zinbR,
      zinbPi: opportunity.zinbPi,
      
      // Market details
      odds: opportunity.odds,
      marketProbability: opportunity.marketProb,
      edge: opportunity.edge,
      kelly: opportunity.kelly,
      
      // Exposure management
      adjustedUnits: opportunity.adjustedUnits,
      correlationPenalty: opportunity.correlationPenalty,
      correlationGroup: opportunity.correlationGroup,
      
      // Metadata
      modelVersion: 'v4.1-elite',
      usingRealOdds: opportunity.usingRealOdds,
      timestamp: new Date().toISOString(),
      
      // Result (to be filled in later)
      actualSOG: null,
      result: null, // 'win', 'loss', 'push'
      resultFetched: false
    };
    
    // Store with TTL of 90 days
    await store.setJSON(key, prediction, {
      metadata: {
        date,
        gameId: gameInfo.gameId,
        edge: opportunity.edge,
        side: opportunity.side
      }
    });
    
    return key;
    
  } catch (error) {
    console.error('❌ Failed to log prediction:', error.message);
    // Don't throw - logging failure shouldn't break scanner
    return null;
  }
}

/**
 * Log all opportunities from a scanner run
 * 
 * Batch logging for efficiency
 */
export async function logScannerRun(opportunities, games) {
  if (!opportunities || opportunities.length === 0) {
    console.log('📝 No predictions to log');
    return;
  }
  
  console.log(`📝 Logging ${opportunities.length} predictions...`);
  
  // Create game lookup
  const gameMap = new Map();
  games.forEach(game => {
    gameMap.set(game.id, {
      gameId: game.id,
      opponent: game.awayTeam?.abbrev || game.awayTeam?.name?.default,
      venue: game.venue?.default,
      gameTime: game.startTimeUTC,
      homeTeam: game.homeTeam?.abbrev || game.homeTeam?.name?.default,
      awayTeam: game.awayTeam?.abbrev || game.awayTeam?.name?.default
    });
  });
  
  // Log each opportunity
  const logPromises = opportunities.map(async (opp) => {
    const gameInfo = gameMap.get(opp.gameId);
    if (!gameInfo) {
      console.warn(`⚠️ No game info for ${opp.gameId}`);
      return null;
    }
    
    // Determine if player's team is home
    const isHome = opp.team === gameInfo.homeTeam;
    const opponent = isHome ? gameInfo.awayTeam : gameInfo.homeTeam;
    
    return logPrediction(opp, {
      ...gameInfo,
      isHome,
      opponent
    });
  });
  
  const results = await Promise.allSettled(logPromises);
  const successful = results.filter(r => r.status === 'fulfilled' && r.value).length;
  
  console.log(`✅ Logged ${successful}/${opportunities.length} predictions`);
  
  return successful;
}

/**
 * Fetch results for predictions from a specific date
 * 
 * Called after games are finished to update predictions with actual results
 */
export async function fetchPredictionResults(date) {
  try {
    const store = getStore('nhl-predictions');
    
    // Get all predictions for this date
    const { blobs } = await store.list({ prefix: date });
    
    if (blobs.length === 0) {
      console.log(`📊 No predictions found for ${date}`);
      return { updated: 0, total: 0 };
    }
    
    console.log(`📊 Fetching results for ${blobs.length} predictions from ${date}...`);
    
    let updated = 0;
    
    for (const blob of blobs) {
      const prediction = await store.getWithMetadata(blob.key, { type: 'json' });
      
      if (!prediction || prediction.data.resultFetched) {
        continue; // Already processed
      }
      
      // Fetch actual SOG from NHL API
      const actualSOG = await fetchPlayerGameSOG(
        prediction.data.playerId,
        prediction.data.gameId
      );
      
      if (actualSOG === null) {
        continue; // Game not finished yet or data unavailable
      }
      
      // Determine result
      let result;
      if (prediction.data.side === 'over') {
        if (actualSOG > prediction.data.line) result = 'win';
        else if (actualSOG === prediction.data.line) result = 'push';
        else result = 'loss';
      } else { // under
        if (actualSOG < prediction.data.line) result = 'win';
        else if (actualSOG === prediction.data.line) result = 'push';
        else result = 'loss';
      }
      
      // Update prediction with result
      const updatedPrediction = {
        ...prediction.data,
        actualSOG,
        result,
        resultFetched: true,
        resultTimestamp: new Date().toISOString()
      };
      
      await store.setJSON(blob.key, updatedPrediction, {
        metadata: prediction.metadata
      });
      
      updated++;
    }
    
    console.log(`✅ Updated ${updated}/${blobs.length} predictions with results`);
    
    return { updated, total: blobs.length };
    
  } catch (error) {
    console.error('❌ Failed to fetch prediction results:', error.message);
    return { updated: 0, total: 0, error: error.message };
  }
}

/**
 * Fetch player's SOG from a specific game
 */
async function fetchPlayerGameSOG(playerId, gameId) {
  try {
    // Use NHL API game log endpoint
    const url = `https://api-web.nhle.com/v1/player/${playerId}/game-log/now`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Find the specific game
    const game = data.gameLog?.find(g => g.gameId === gameId);
    
    return game?.sog || null;
    
  } catch (error) {
    console.warn(`⚠️ Could not fetch SOG for player ${playerId} in game ${gameId}`);
    return null;
  }
}

/**
 * Get performance statistics for a date range
 * 
 * Returns hit rates, profit, edge calibration, etc.
 */
export async function getPerformanceStats(startDate, endDate) {
  try {
    const store = getStore('nhl-predictions');
    
    console.log(`📊 Analyzing predictions from ${startDate} to ${endDate}...`);
    
    // Get all predictions in range
    const allPredictions = [];
    const { blobs } = await store.list();
    
    for (const blob of blobs) {
      const prediction = await store.getWithMetadata(blob.key, { type: 'json' });
      const predDate = prediction.data.date;
      
      if (predDate >= startDate && predDate <= endDate && prediction.data.resultFetched) {
        allPredictions.push(prediction.data);
      }
    }
    
    if (allPredictions.length === 0) {
      return { error: 'No completed predictions in date range' };
    }
    
    // Calculate overall stats
    const wins = allPredictions.filter(p => p.result === 'win').length;
    const losses = allPredictions.filter(p => p.result === 'loss').length;
    const pushes = allPredictions.filter(p => p.result === 'push').length;
    const total = wins + losses; // Exclude pushes from hit rate
    
    const hitRate = total > 0 ? (wins / total * 100).toFixed(1) : 0;
    
    // Calculate by edge bucket
    const edgeBuckets = {
      '5-10%': [],
      '10-15%': [],
      '15-20%': [],
      '20%+': []
    };
    
    allPredictions.forEach(p => {
      const edge = parseFloat(p.edge);
      if (edge >= 5 && edge < 10) edgeBuckets['5-10%'].push(p);
      else if (edge >= 10 && edge < 15) edgeBuckets['10-15%'].push(p);
      else if (edge >= 15 && edge < 20) edgeBuckets['15-20%'].push(p);
      else if (edge >= 20) edgeBuckets['20%+'].push(p);
    });
    
    const bucketStats = {};
    Object.keys(edgeBuckets).forEach(bucket => {
      const preds = edgeBuckets[bucket];
      const bucketWins = preds.filter(p => p.result === 'win').length;
      const bucketTotal = preds.filter(p => p.result !== 'push').length;
      
      bucketStats[bucket] = {
        count: preds.length,
        hitRate: bucketTotal > 0 ? (bucketWins / bucketTotal * 100).toFixed(1) : 0,
        wins: bucketWins,
        losses: preds.filter(p => p.result === 'loss').length
      };
    });
    
    // Calculate profit (using actual Kelly sizing)
    let profit = 0;
    allPredictions.forEach(p => {
      if (p.result === 'win') {
        // Win: profit = units * odds
        const odds = p.odds;
        const payout = odds > 0 ? (odds / 100) : (100 / Math.abs(odds));
        profit += (p.adjustedUnits || 1) * payout;
      } else if (p.result === 'loss') {
        // Loss: lose units
        profit -= (p.adjustedUnits || 1);
      }
      // Push: no profit/loss
    });
    
    return {
      dateRange: { startDate, endDate },
      overall: {
        total: allPredictions.length,
        wins,
        losses,
        pushes,
        hitRate: `${hitRate}%`,
        profit: profit.toFixed(2),
        roi: total > 0 ? ((profit / total) * 100).toFixed(1) + '%' : '0%'
      },
      byEdgeBucket: bucketStats,
      avgEdge: (allPredictions.reduce((sum, p) => sum + parseFloat(p.edge), 0) / allPredictions.length).toFixed(1) + '%'
    };
    
  } catch (error) {
    console.error('❌ Failed to get performance stats:', error.message);
    return { error: error.message };
  }
}

/**
 * Export predictions to CSV for ML training
 */
export async function exportPredictionsToCSV(startDate, endDate) {
  try {
    const store = getStore('nhl-predictions');
    
    // Get all completed predictions
    const allPredictions = [];
    const { blobs } = await store.list();
    
    for (const blob of blobs) {
      const prediction = await store.getWithMetadata(blob.key, { type: 'json' });
      const predDate = prediction.data.date;
      
      if (predDate >= startDate && predDate <= endDate && prediction.data.resultFetched) {
        allPredictions.push(prediction.data);
      }
    }
    
    if (allPredictions.length === 0) {
      return { error: 'No completed predictions to export' };
    }
    
    // CSV headers
    const headers = [
      'date', 'gameId', 'playerId', 'playerName', 'team', 'opponent', 'isHome',
      'line', 'side', 'projection', 'modelProbability', 'zinbMu', 'zinbR', 'zinbPi',
      'odds', 'marketProbability', 'edge', 'kelly', 'adjustedUnits',
      'actualSOG', 'result'
    ];
    
    // CSV rows
    const rows = allPredictions.map(p => [
      p.date,
      p.gameId,
      p.playerId,
      p.playerName,
      p.team,
      p.opponent,
      p.isHome,
      p.line,
      p.side,
      p.projection,
      p.modelProbability,
      p.zinbMu,
      p.zinbR,
      p.zinbPi,
      p.odds,
      p.marketProbability,
      p.edge,
      p.kelly,
      p.adjustedUnits,
      p.actualSOG,
      p.result
    ].join(','));
    
    const csv = [headers.join(','), ...rows].join('\n');
    
    return {
      csv,
      count: allPredictions.length,
      filename: `nhl_predictions_${startDate}_to_${endDate}.csv`
    };
    
  } catch (error) {
    console.error('❌ Failed to export predictions:', error.message);
    return { error: error.message };
  }
}
