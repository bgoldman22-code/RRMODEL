/**
 * NHL Stats Refresh - Scheduled Function
 * 
 * Populates Netlify Blobs with fresh player/team stats
 * Runs daily at 10am ET to keep production data current
 * 
 * This is the CRITICAL missing piece - production was using empty Blobs!
 */

import { getStore } from '@netlify/blobs';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const CURRENT_SEASON = '20252026';

const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
  'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
];

/**
 * Fetch team roster
 */
async function fetchTeamRoster(teamAbbrev) {
  const url = `${NHL_API_BASE}/roster/${teamAbbrev}/current`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    return {
      team: teamAbbrev,
      forwards: data.forwards || [],
      defensemen: data.defensemen || [],
      goalies: data.goalies || []
    };
  } catch (error) {
    console.error(`Error fetching ${teamAbbrev} roster:`, error.message);
    return null;
  }
}

/**
 * Fetch player season stats
 */
async function fetchPlayerSeasonStats(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/landing`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    const stats = data.featuredStats?.regularSeason?.subSeason || {};
    
    return {
      playerId,
      gamesPlayed: stats.gamesPlayed || 0,
      goals: stats.goals || 0,
      assists: stats.assists || 0,
      points: stats.points || 0,
      shots: stats.shots || 0,
      shootingPct: stats.shootingPct || 0,
      plusMinus: stats.plusMinus || 0,
      powerPlayGoals: stats.powerPlayGoals || 0,
      powerPlayPoints: stats.powerPlayPoints || 0,
      avgToi: stats.avgToi || '0:00',
      faceoffWinPct: stats.faceoffWinningPctg || 0,
      shotsPerGame: stats.gamesPlayed > 0 ? (stats.shots / stats.gamesPlayed).toFixed(2) : 0,
      pointsPerGame: stats.gamesPlayed > 0 ? (stats.points / stats.gamesPlayed).toFixed(2) : 0
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetch player game log
 */
async function fetchPlayerGameLog(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${CURRENT_SEASON}/2`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const gameLog = data.gameLog || [];
    
    return gameLog.slice(0, 10).map(game => ({
      gameId: game.gameId,
      gameDate: game.gameDate,
      opponent: game.opponentAbbrev,
      homeRoad: game.homeRoadFlag,
      goals: game.goals || 0,
      assists: game.assists || 0,
      points: game.points || 0,
      shots: game.shots || 0,
      toi: game.toi || '0:00',
      plusMinus: game.plusMinus || 0,
      powerPlayGoals: game.powerPlayGoals || 0
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Calculate L5/L10 averages
 */
function calculateRecentAverages(gameLog) {
  if (gameLog.length === 0) {
    return {
      L5: { shots: 0, points: 0, toi: 0, games: 0 },
      L10: { shots: 0, points: 0, toi: 0, games: 0 }
    };
  }
  
  const L5games = gameLog.slice(0, Math.min(5, gameLog.length));
  const L10games = gameLog.slice(0, Math.min(10, gameLog.length));
  
  const calcAvg = (games) => {
    if (games.length === 0) return { shots: 0, points: 0, toi: 0, games: 0 };
    
    const totalShots = games.reduce((sum, g) => sum + (g.shots || 0), 0);
    const totalPoints = games.reduce((sum, g) => sum + (g.points || 0), 0);
    const totalToiMins = games.reduce((sum, g) => {
      const [mins, secs] = (g.toi || '0:00').split(':');
      return sum + parseInt(mins) + (parseInt(secs) / 60);
    }, 0);
    
    return {
      shots: (totalShots / games.length).toFixed(2),
      points: (totalPoints / games.length).toFixed(2),
      toi: (totalToiMins / games.length).toFixed(1),
      games: games.length
    };
  };
  
  return {
    L5: calcAvg(L5games),
    L10: calcAvg(L10games)
  };
}

/**
 * Main handler
 */
export async function handler(event, context) {
  console.log('🏒 NHL Stats Refresh - Populating Netlify Blobs');
  
  const startTime = Date.now();
  const allPlayers = [];
  
  // Check if running as background/scheduled function
  const isScheduled = context?.clientContext?.custom?.netlify === 'scheduled';
  const timeLimit = isScheduled ? 600000 : 9000; // 10 min for scheduled, 9 sec for HTTP
  
  try {
    // Fetch all rosters
    console.log('📋 Fetching team rosters...');
    const rosterPromises = NHL_TEAMS.map(team => fetchTeamRoster(team));
    const rosters = await Promise.all(rosterPromises);
    const validRosters = rosters.filter(Boolean);
    
    console.log(`✅ Fetched ${validRosters.length} rosters`);
    
    // For HTTP requests, only process first 8 teams to avoid timeout
    const teamsToProcess = isScheduled ? validRosters : validRosters.slice(0, 8);
    console.log(`⏱️  Processing ${teamsToProcess.length} teams (${isScheduled ? 'scheduled' : 'HTTP'} mode)`);
    
    // Process each team's skaters
    for (const roster of teamsToProcess) {
      // Check time limit
      if (Date.now() - startTime > timeLimit) {
        console.log('⏰ Time limit reached, saving partial data...');
        break;
      }
      
      const skaters = [
        ...roster.forwards.map(p => ({ ...p, position: p.positionCode || 'F', team: roster.team })),
        ...roster.defensemen.map(p => ({ ...p, position: p.positionCode || 'D', team: roster.team }))
      ];
      
      // Fetch stats for each player (with rate limiting)
      for (let i = 0; i < skaters.length; i++) {
        const player = skaters[i];
        
        // Rate limit: max 5 requests per second
        if (i > 0 && i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        const [seasonStats, gameLog] = await Promise.all([
          fetchPlayerSeasonStats(player.id),
          fetchPlayerGameLog(player.id)
        ]);
        
        if (seasonStats) {
          const recentAvgs = calculateRecentAverages(gameLog);
          
          allPlayers.push({
            playerId: player.id,
            name: `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim(),
            team: roster.team,
            position: player.position,
            sweaterNumber: player.sweaterNumber,
            season: seasonStats,
            L5: recentAvgs.L5,
            L10: recentAvgs.L10,
            recentGames: gameLog,
            lastUpdated: new Date().toISOString()
          });
        }
      }
      
      console.log(`  ✅ ${roster.team}: ${skaters.length} players processed`);
    }
    
    console.log(`📊 Total players processed: ${allPlayers.length}`);
    
    // Save to Netlify Blobs
    const store = getStore('nhl-stats');
    
    const playerData = {
      season: CURRENT_SEASON,
      generatedAt: new Date().toISOString(),
      totalPlayers: allPlayers.length,
      teams: validRosters.length,
      players: allPlayers
    };
    
    await store.set(`player_stats_${CURRENT_SEASON}`, JSON.stringify(playerData));
    console.log(`✅ Saved ${allPlayers.length} players to Netlify Blobs`);
    
    // Calculate summary stats
    const avgShotsPerGame = allPlayers.reduce((sum, p) => sum + parseFloat(p.season.shotsPerGame || 0), 0) / allPlayers.length;
    const playersWithL5Data = allPlayers.filter(p => p.L5.games >= 5).length;
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'NHL stats refreshed successfully',
        stats: {
          totalPlayers: allPlayers.length,
          teams: validRosters.length,
          avgShotsPerGame: avgShotsPerGame.toFixed(2),
          playersWithL5Data,
          season: CURRENT_SEASON,
          elapsedSeconds: elapsed
        },
        timestamp: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ NHL stats refresh failed:', error);
    
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
}
