/**
 * NBA Game Predictions Verifier
 * 
 * Scheduled to run daily at 6 AM ET (after all games complete)
 * Processes D-1, D-2, D-3 to catch late ESPN corrections
 * Grades using PENDING/WIN/LOSS/PUSH/VOID logic
 */

import { schedule } from '@netlify/functions';
import { getStore } from '@netlify/blobs';

/**
 * Get yesterday in America/New_York timezone
 */
function getYesterdayET() {
  const now = new Date();
  const etOffset = -5 * 60; // EST offset in minutes
  const etTime = new Date(now.getTime() + (etOffset * 60 * 1000));
  etTime.setDate(etTime.getDate() - 1);
  return etTime.toISOString().split('T')[0];
}

/**
 * Get date N days ago in ET timezone
 */
function getDaysAgoET(daysAgo) {
  const now = new Date();
  const etOffset = -5 * 60;
  const etTime = new Date(now.getTime() + (etOffset * 60 * 1000));
  etTime.setDate(etTime.getDate() - daysAgo);
  return etTime.toISOString().split('T')[0];
}

/**
 * Fetch game results from ESPN for a specific date
 */
async function fetchGameResults(date) {
  // ESPN API date format: YYYYMMDD
  const dateStr = date.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateStr}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status}`);
  }
  
  const data = await response.json();
  return data.events || [];
}

/**
 * Grade a single game prediction with robust logic
 */
function gradeGamePrediction(prediction, game) {
  const competition = game.competitions[0];
  const status = competition.status.type;
  
  // Check if game was postponed/cancelled
  if (status.name === 'STATUS_POSTPONED' || status.name === 'STATUS_CANCELED') {
    return {
      ...prediction,
      grade: 'VOID',
      gradeReason: 'Game postponed or cancelled',
      verified: true,
      verifiedAt: new Date().toISOString()
    };
  }
  
  // Check if game is still pending
  if (status.state !== 'post') {
    return {
      ...prediction,
      grade: 'PENDING',
      gradeReason: 'Game not yet final',
      verified: false
    };
  }
  
  const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
  const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
  
  const homeScore = parseInt(homeTeam.score);
  const awayScore = parseInt(awayTeam.score);
  const actualWinner = homeScore > awayScore ? homeTeam.team.displayName : awayTeam.team.displayName;
  const actualMargin = Math.abs(homeScore - awayScore);
  
  // Match prediction to game
  const predictedHome = prediction.homeTeam === homeTeam.team.displayName || 
                        prediction.homeTeam === homeTeam.team.abbreviation;
  
  if (!predictedHome && prediction.homeTeam !== awayTeam.team.displayName && 
      prediction.homeTeam !== awayTeam.team.abbreviation) {
    return {
      ...prediction,
      grade: 'VOID',
      gradeReason: 'Could not match game to prediction',
      verified: false
    };
  }
  
  // Grade the prediction
  let grade, gradeReason;
  
  // Check for push (if spread was provided)
  if (prediction.spread !== null && prediction.spread !== undefined) {
    const spreadResult = predictedHome ? (homeScore + prediction.spread - awayScore) : (awayScore + prediction.spread - homeScore);
    if (Math.abs(spreadResult) < 0.01) {
      grade = 'PUSH';
      gradeReason = 'Spread exactly hit the line';
    }
  }
  
  // If not a push, grade win/loss
  if (!grade) {
    const correct = prediction.predictedWinner === actualWinner;
    grade = correct ? 'WIN' : 'LOSS';
    gradeReason = correct ? 'Predicted winner correct' : 'Predicted winner incorrect';
  }
  
  // Calculate margin error (if we predicted margin)
  let marginError = null;
  if (prediction.predictedMargin !== null && prediction.predictedMargin !== undefined) {
    marginError = Math.abs(prediction.predictedMargin - actualMargin);
  }
  
  return {
    ...prediction,
    result: {
      homeScore,
      awayScore,
      actualWinner,
      actualMargin,
      marginError
    },
    grade,
    gradeReason,
    verified: true,
    verifiedAt: new Date().toISOString()
  };
}

/**
 * Main verification function - processes multiple dates
 */
async function verifyGamePredictions(date) {
  const store = getStore('nba-tracking');
  const key = `games-predictions:${date}`;
  
  console.log(`🔍 Verifying game predictions for ${date}...`);
  
  // Load predictions (keyed by predictionId for idempotency)
  const predictions = await store.get(key, { type: 'json' });
  if (!predictions || predictions.length === 0) {
    console.log(`⚠️  No predictions found for ${date}`);
    return { success: true, verified: 0, message: 'No predictions to verify' };
  }
  
  // Build prediction map by ID
  const predictionMap = new Map();
  predictions.forEach(p => {
    if (p.predictionId) {
      predictionMap.set(p.predictionId, p);
    }
  });
  
  console.log(`📋 Found ${predictions.length} predictions (${predictionMap.size} with IDs)`);
  
  // Fetch game results
  const games = await fetchGameResults(date);
  console.log(`🏀 Found ${games.length} completed games`);
  
  if (games.length === 0) {
    console.log(`⚠️  No games found for ${date} - may not have completed yet`);
    return { success: true, verified: 0, message: 'No completed games found' };
  }
  
  // Grade each prediction (idempotent by ID)
  const gradedPredictions = predictions.map(pred => {
    // Skip if already verified and not pending
    if (pred.verified && pred.grade !== 'PENDING') {
      return pred;
    }
    
    // Try to match with a game
    for (const game of games) {
      const graded = gradeGamePrediction(pred, game);
      if (graded && graded.grade !== 'VOID') {
        return graded;
      }
    }
    // If no match found, mark as void
    return { ...pred, grade: 'VOID', gradeReason: 'Could not match to game', verified: false };
  });
  
  // Calculate stats
  const verifiedCount = gradedPredictions.filter(p => p.verified).length;
  const wins = gradedPredictions.filter(p => p.grade === 'WIN').length;
  const losses = gradedPredictions.filter(p => p.grade === 'LOSS').length;
  const pushes = gradedPredictions.filter(p => p.grade === 'PUSH').length;
  const voids = gradedPredictions.filter(p => p.grade === 'VOID').length;
  const winRate = (wins + losses) > 0 ? (wins / (wins + losses) * 100).toFixed(1) : 0;
  
  // Save updated predictions with results
  const resultsKey = `games-results:${date}`;
  await store.setJSON(resultsKey, gradedPredictions);
  
  // Save daily materialized aggregate
  const dailyStats = {
    date,
    total: verifiedCount,
    wins,
    losses,
    pushes,
    voids,
    winRate: parseFloat(winRate)
  };
  await store.setJSON(`games-stats:${date}`, dailyStats);
  
  // Update summary stats
  await updateGameStats(date, dailyStats);
  
  console.log(`✅ Verified ${verifiedCount}/${predictions.length} predictions`);
  console.log(`📊 Results: ${wins}W-${losses}L-${pushes}P-${voids}V (${winRate}%)`);
  
  return {
    success: true,
    date,
    verified: verifiedCount,
    wins,
    losses,
    pushes,
    voids,
    winRate: parseFloat(winRate)
  };
}

/**
 * Update cumulative stats
 */
async function updateGameStats(date, dayStats) {
  const store = getStore('nba-tracking');
  
  // Get existing stats
  let allStats = await store.get('games-stats-summary', { type: 'json' }) || {
    byDate: {},
    overall: { total: 0, wins: 0, losses: 0, pushes: 0, voids: 0 }
  };
  
  // Add today's stats
  allStats.byDate[date] = dayStats;
  
  // Recalculate overall from all dates
  allStats.overall = { total: 0, wins: 0, losses: 0, pushes: 0, voids: 0 };
  Object.values(allStats.byDate).forEach(stats => {
    allStats.overall.total += stats.total;
    allStats.overall.wins += stats.wins;
    allStats.overall.losses += stats.losses;
    allStats.overall.pushes += stats.pushes || 0;
    allStats.overall.voids += stats.voids || 0;
  });
  
  const gradeable = allStats.overall.wins + allStats.overall.losses;
  allStats.overall.winRate = gradeable > 0 
    ? (allStats.overall.wins / gradeable * 100).toFixed(1)
    : 0;
  allStats.overall.lastUpdated = new Date().toISOString();
  
  await store.setJSON('games-stats-summary', allStats);
  
  console.log(`📈 Overall stats updated: ${allStats.overall.wins}W-${allStats.overall.losses}L-${allStats.overall.pushes}P (${allStats.overall.winRate}%)`);
}

/**
 * Scheduled handler - runs daily at 6 AM ET (11 AM UTC)
 * Processes D-1, D-2, D-3 to catch late corrections
 */
const handler = async (event, context) => {
  try {
    const results = [];
    
    // Process last 3 days to catch late ESPN updates
    for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
      const dateStr = getDaysAgoET(daysAgo);
      console.log(`\n🔄 Processing D-${daysAgo}: ${dateStr}`);
      
      const result = await verifyGamePredictions(dateStr);
      results.push(result);
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        processed: results
      })
    };
  } catch (error) {
    console.error('❌ Verification error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Schedule for 6 AM ET (11 AM UTC) daily
export default schedule('0 11 * * *', handler);

// Export function for manual testing
export { verifyGamePredictions };
