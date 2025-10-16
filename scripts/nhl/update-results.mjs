/**
 * NHL Results Fetcher
 * 
 * Fetches actual SOG from NHL API for finished games and updates predictions CSV.
 * Run daily after games finish to track performance.
 */

import NHLPredictionLogger from './log-prediction.mjs';

/**
 * Fetch game results from NHL API
 */
async function fetchNHLResults(date) {
  const dateStr = date || new Date().toISOString().split('T')[0];
  
  try {
    const url = `https://api-web.nhle.com/v1/score/${dateStr}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`NHL API returned ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.games || data.games.length === 0) {
      console.log(`📅 No NHL games on ${dateStr}`);
      return [];
    }
    
    console.log(`📊 Found ${data.games.length} games on ${dateStr}`);
    
    // Extract SOG data for each player
    const results = [];
    
    for (const game of data.games) {
      // Skip if game not final
      if (game.gameState !== 'OFF' && game.gameState !== 'FINAL') {
        console.log(`⏳ Game ${game.id} not finished (${game.gameState})`);
        continue;
      }
      
      const nhlGameId = game.id.toString();
      const homeTeam = game.homeTeam.abbrev;
      const awayTeam = game.awayTeam.abbrev;
      
      // Construct game ID in same format as predictions: AWAY_HOME_DATE
      const gameId = `${awayTeam}_${homeTeam}_${dateStr}`;
      
      // Fetch box score for this game (using NHL numeric ID)
      const boxScoreUrl = `https://api-web.nhle.com/v1/gamecenter/${nhlGameId}/boxscore`;
      const boxScoreResponse = await fetch(boxScoreUrl);
      
      if (!boxScoreResponse.ok) {
        console.log(`❌ Failed to fetch box score for game ${gameId}`);
        continue;
      }
      
      const boxScore = await boxScoreResponse.json();
      
      // Extract player stats
      const players = [];
      
      // Home team players
      if (boxScore.playerByGameStats?.homeTeam) {
        for (const position of ['forwards', 'defense']) {
          for (const player of boxScore.playerByGameStats.homeTeam[position] || []) {
            players.push({
              gameId,
              player: `${player.name.default}`,
              team: homeTeam,
              opponent: awayTeam,
              sog: player.sog || 0
            });
          }
        }
      }
      
      // Away team players
      if (boxScore.playerByGameStats?.awayTeam) {
        for (const position of ['forwards', 'defense']) {
          for (const player of boxScore.playerByGameStats.awayTeam[position] || []) {
            players.push({
              gameId,
              player: `${player.name.default}`,
              team: awayTeam,
              opponent: homeTeam,
              sog: player.sog || 0
            });
          }
        }
      }
      
      results.push(...players);
    }
    
    console.log(`✅ Extracted SOG for ${results.length} players`);
    return results;
    
  } catch (error) {
    console.error(`❌ Error fetching NHL results:`, error.message);
    return [];
  }
}

/**
 * Update predictions CSV with actual results
 */
async function updateResults(date) {
  console.log('🏒 NHL Results Updater');
  console.log('=' .repeat(50));
  
  const logger = new NHLPredictionLogger();
  
  // Get pending predictions
  const pending = logger.getPendingPredictions();
  console.log(`📋 ${pending.length} pending predictions to update`);
  
  if (pending.length === 0) {
    console.log('✅ No pending predictions');
    return;
  }
  
  // Fetch results
  const results = await fetchNHLResults(date);
  
  if (results.length === 0) {
    console.log('❌ No results found for date');
    return;
  }
  
  // Match predictions to results
  let updated = 0;
  
  for (const result of results) {
    const matchingPred = pending.find(p => 
      p.game_id === result.gameId && 
      p.player.toLowerCase().includes(result.player.toLowerCase().split(' ').slice(-1)[0])
    );
    
    if (matchingPred) {
      logger.updateResult(result.gameId, matchingPred.player, result.sog);
      updated++;
    }
  }
  
  console.log(`✅ Updated ${updated} predictions with actual results`);
  
  // Show current metrics
  const metrics = logger.calculateRollingMetrics(20);
  if (metrics) {
    console.log('\n📊 Last 20 Games Performance:');
    console.log(`   Win Rate: ${metrics.winRate}%`);
    console.log(`   MAE: ${metrics.mae} SOG`);
    console.log(`   ROI: ${metrics.roi} units/pick (${metrics.totalROI} total)`);
    console.log(`   Overs: ${metrics.overs.winRate}% (${metrics.overs.count} picks)`);
    console.log(`   Unders: ${metrics.unders.winRate}% (${metrics.unders.count} picks)`);
  }
}

// If run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const date = process.argv[2]; // Optional: YYYY-MM-DD
  updateResults(date).catch(console.error);
}

export { updateResults, fetchNHLResults };
