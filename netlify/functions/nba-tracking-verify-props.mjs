/**
 * NBA Player Props Verifier
 * 
 * Scheduled to run daily at 6 AM ET (after all games complete)
 * Processes D-1, D-2, D-3 to catch late ESPN corrections
 * Grades using HIT/MISS/PUSH/VOID/DNP logic
 */

import { schedule } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

// Get Netlify Blobs store
const store = getStore('nba-tracking');
const getBlob = (key, options) => store.get(key, options);
const setBlob = (key, data, options) => store.setJSON(key, data, options);
const listBlobs = (options) => store.list(options);

/**
 * Get date N days ago in ET timezone
 */
function getDaysAgoET(daysAgo) {
  const now = new Date();
  const etOffset = -5 * 60; // EST offset in minutes
  const etTime = new Date(now.getTime() + (etOffset * 60 * 1000));
  etTime.setDate(etTime.getDate() - daysAgo);
  return etTime.toISOString().split('T')[0];
}

/**
 * Fetch box score for a specific game
 */
async function fetchBoxScore(gameId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error for game ${gameId}: ${response.status}`);
  }
  
  return await response.json();
}

/**
 * Extract player stats from box score - returns player ID too
 */
function getPlayerStats(boxScoreData, playerLastName) {
  const players = boxScoreData.boxscore?.players || [];
  
  for (const team of players) {
    for (const statGroup of team.statistics || []) {
      for (const athlete of statGroup.athletes || []) {
        const name = athlete.athlete.displayName;
        const playerId = athlete.athlete.id;
        
        if (name.toLowerCase().includes(playerLastName.toLowerCase())) {
          const stats = athlete.stats || [];
          const minutes = stats[0] || '0';
          
          // Check if player actually played
          const minPlayed = parseInt(minutes) || 0;
          
          if (stats.length >= 17) {
            return {
              name,
              playerId,
              points: parseInt(stats[1]) || 0,
              rebounds: parseInt(stats[4]) || 0,
              assists: parseInt(stats[3]) || 0,
              minutes: stats[0] || '0',
              minutesPlayed: minPlayed,
              dnp: minPlayed === 0
            };
          }
        }
      }
    }
  }
  
  return null; // Player not found or DNP
}

/**
 * Grade a single prop prediction with robust logic
 */
function gradePropPrediction(prediction, actualStat) {
  if (actualStat === null) {
    return {
      ...prediction,
      grade: 'VOID',
      gradeReason: 'Player not found in box score',
      verified: false
    };
  }
  
  // Persist the ESPN player ID for future lookups
  if (actualStat.playerId && !prediction.espnPlayerId) {
    prediction.espnPlayerId = actualStat.playerId;
  }
  
  // Check if player didn't play
  if (actualStat.dnp || actualStat.minutesPlayed === 0) {
    return {
      ...prediction,
      actualStat: null,
      actualPlayerName: actualStat.name,
      minutesPlayed: 0,
      grade: 'DNP',
      gradeReason: 'Player did not play (0 minutes)',
      verified: true,
      verifiedAt: new Date().toISOString(),
      dnp: true
    };
  }
  
  // Get the relevant stat based on market
  const market = prediction.market || prediction.propType;
  const statValue = market === 'rebounds' ? actualStat.rebounds : actualStat.assists;
  const line = prediction.line || prediction.vegasLine;
  const side = prediction.side || prediction.betSide;
  
  // Grade the prop
  let grade, gradeReason;
  
  if (side === 'OVER') {
    if (statValue > line) {
      grade = 'HIT';
      gradeReason = `${statValue} > ${line}`;
    } else if (statValue === line) {
      grade = 'PUSH';
      gradeReason = `${statValue} = ${line} (exact)`;
    } else {
      grade = 'MISS';
      gradeReason = `${statValue} < ${line}`;
    }
  } else if (side === 'UNDER') {
    if (statValue < line) {
      grade = 'HIT';
      gradeReason = `${statValue} < ${line}`;
    } else if (statValue === line) {
      grade = 'PUSH';
      gradeReason = `${statValue} = ${line} (exact)`;
    } else {
      grade = 'MISS';
      gradeReason = `${statValue} > ${line}`;
    }
  } else {
    return {
      ...prediction,
      grade: 'VOID',
      gradeReason: 'Invalid bet side',
      verified: false
    };
  }
  
  return {
    ...prediction,
    actualStat: statValue,
    actualPlayerName: actualStat.name,
    minutesPlayed: actualStat.minutesPlayed,
    grade,
    gradeReason,
    verified: true,
    verifiedAt: new Date().toISOString(),
    dnp: false
  };
}

/**
 * Verify all prop predictions for a given date
 */
async function verifyPropPredictions(dateString) {
  console.log(`Verifying props for ${dateString}...`);
  
  // Get predictions for this date
  const predictions = await getBlob(`props:${dateString}`, { type: 'json' });
  if (!predictions || predictions.length === 0) {
    console.log(`No predictions found for ${dateString}`);
    return { verified: 0, skipped: 0 };
  }
  
  console.log(`Found ${predictions.length} predictions`);
  
  // Build predictionId map for idempotency
  const predictionMap = new Map();
  predictions.forEach(pred => {
    const id = pred.predictionId || `${dateString}_${pred.playerName}_${pred.market}_${pred.side}_${pred.line}`;
    predictionMap.set(id, pred);
  });
  
  // Get all unique game IDs
  const gameIds = [...new Set(predictions.map(p => p.espnGameId || p.gameId).filter(Boolean))];
  console.log(`Fetching box scores for ${gameIds.length} games`);
  
  // Fetch all box scores
  const boxScores = await Promise.all(
    gameIds.map(async gameId => {
      try {
        const url = `http://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return { gameId, data };
      } catch (error) {
        console.error(`Failed to fetch box score for game ${gameId}:`, error);
        return null;
      }
    })
  );
  
  const boxScoreMap = new Map(
    boxScores.filter(Boolean).map(bs => [bs.gameId, bs.data])
  );
  
  // Verify each prediction
  let hits = 0, misses = 0, pushes = 0, voids = 0, dnps = 0, skipped = 0;
  const verifiedPredictions = [];
  
  for (const prediction of predictions) {
    const predId = prediction.predictionId || `${dateString}_${prediction.playerName}_${prediction.market}_${prediction.side}_${prediction.line}`;
    
    // Skip if already verified (and not PENDING)
    if (prediction.verified && prediction.grade !== 'PENDING') {
      verifiedPredictions.push(prediction);
      skipped++;
      continue;
    }
    
    const gameId = prediction.espnGameId || prediction.gameId;
    const boxScore = boxScoreMap.get(gameId);
    
    if (!boxScore) {
      verifiedPredictions.push({
        ...prediction,
        grade: 'VOID',
        gradeReason: 'Box score not available',
        verified: false
      });
      voids++;
      continue;
    }
    
    // Check if game is final
    const status = boxScore.header?.competitions?.[0]?.status;
    if (status?.type?.state !== 'post') {
      verifiedPredictions.push({
        ...prediction,
        grade: 'PENDING',
        gradeReason: 'Game not yet final',
        verified: false
      });
      continue;
    }
    
    const playerLastName = prediction.playerName?.split(' ').pop() || '';
    const actualStat = getPlayerStats(boxScore, playerLastName);
    const graded = gradePropPrediction(prediction, actualStat);
    
    verifiedPredictions.push(graded);
    
    if (graded.grade === 'HIT') hits++;
    else if (graded.grade === 'MISS') misses++;
    else if (graded.grade === 'PUSH') pushes++;
    else if (graded.grade === 'VOID') voids++;
    else if (graded.grade === 'DNP') dnps++;
  }
  
  // Save verified predictions back
  await setBlob(`props:${dateString}`, verifiedPredictions, { 
    type: 'json',
    metadata: { 
      date: dateString, 
      type: 'props',
      verified: true,
      verifiedAt: new Date().toISOString(),
      schemaVersion: 1
    }
  });
  
  // Calculate and save daily aggregate
  const total = hits + misses + pushes; // Exclude voids and DNPs from record
  const hitRate = total > 0 ? (hits / total) * 100 : 0;
  
  const dailyStats = {
    date: dateString,
    hits,
    misses,
    pushes,
    voids,
    dnps,
    total,
    hitRate: hitRate.toFixed(2),
    generatedAt: new Date().toISOString(),
    schemaVersion: 1
  };
  
  await setBlob(`props-stats:${dateString}`, dailyStats, {
    type: 'json',
    metadata: { date: dateString, type: 'props-stats', schemaVersion: 1 }
  });
  
  console.log(`Verified ${dateString}: ${hits}H ${misses}M ${pushes}P ${voids}V ${dnps}DNP (${hitRate.toFixed(1)}% hit rate)`);
  
  return { 
    verified: verifiedPredictions.length - skipped, 
    skipped,
    hits,
    misses, 
    pushes,
    voids,
    dnps,
    total,
    hitRate: hitRate.toFixed(2)
  };
}

/**
 * Update cumulative prop stats by recalculating from all dates
 */
async function updatePropStats() {
  console.log('Recalculating overall prop stats from all dates...');
  
  // List all daily stat blobs
  const { blobs } = await listBlobs({ prefix: 'props-stats:' });
  
  if (blobs.length === 0) {
    console.log('No prop stats found');
    return;
  }
  
  // Fetch all daily stats
  const dailyStats = await Promise.all(
    blobs.map(async blob => {
      const stats = await getBlob(blob.key, { type: 'json' });
      return stats;
    })
  );
  
  // Recalculate overall from scratch
  const overall = dailyStats.reduce((acc, day) => ({
    hits: acc.hits + (day.hits || 0),
    misses: acc.misses + (day.misses || 0),
    pushes: acc.pushes + (day.pushes || 0),
    voids: acc.voids + (day.voids || 0),
    dnps: acc.dnps + (day.dnps || 0),
    total: acc.total + (day.total || 0)
  }), { hits: 0, misses: 0, pushes: 0, voids: 0, dnps: 0, total: 0 });
  
  overall.hitRate = overall.total > 0 ? ((overall.hits / overall.total) * 100).toFixed(2) : '0.00';
  overall.lastUpdated = new Date().toISOString();
  overall.schemaVersion = 1;
  
  // Save overall stats
  await setBlob('props-stats', overall, {
    type: 'json',
    metadata: { type: 'props-overall', schemaVersion: 1 }
  });
  
  console.log(`Overall: ${overall.hits}H ${overall.misses}M ${overall.pushes}P ${overall.voids}V ${overall.dnps}DNP / ${overall.total} (${overall.hitRate}% hit rate)`);
}

/**
 * Scheduled handler - runs daily at 6 AM ET (11 AM UTC)
 * Processes D-1, D-2, D-3 to catch late ESPN corrections
 */
const handler = async (event, context) => {
  try {
    const results = [];
    
    // Process last 3 days to catch late corrections
    for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
      const dateStr = getDaysAgoET(daysAgo);
      console.log(`\n=== Processing ${dateStr} (D-${daysAgo}) ===`);
      
      const result = await verifyPropPredictions(dateStr);
      results.push({ date: dateStr, daysAgo, ...result });
    }
    
    // Recalculate overall stats from all dates
    await updatePropStats();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true,
        results,
        timestamp: new Date().toISOString()
      })
    };
  } catch (error) {
    console.error('Verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Schedule for 6 AM ET (11 AM UTC) daily
export default schedule('0 11 * * *', handler);

// Export function for manual testing
export { verifyPropPredictions };
