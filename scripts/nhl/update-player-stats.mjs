/**
 * NHL Player Stats Daily Refresh
 * 
 * Fetches comprehensive player stats for all active NHL players:
 * - Season stats (GP, G, A, SOG, TOI, etc.)
 * - Last 10 game logs (recency tracking)
 * - PP/PK deployment data
 * 
 * Saves to: data/nhl/player_stats_2024-25.json
 * Run daily at 10am ET to keep data fresh
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';
const CURRENT_SEASON = '20242025';

// All 32 NHL teams
const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
  'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
];

/**
 * Fetch roster for a team
 */
async function fetchTeamRoster(teamAbbrev) {
  const url = `${NHL_API_BASE}/roster/${teamAbbrev}/current`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.warn(`❌ Failed to fetch ${teamAbbrev} roster: ${response.status}`);
      return null;
    }
    
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
      shortHandedGoals: stats.shortHandedGoals || 0,
      gameWinningGoals: stats.gameWinningGoals || 0,
      avgToi: stats.avgToi || '0:00',
      faceoffWinPct: stats.faceoffWinningPctg || 0,
      // Calculate derived metrics
      shotsPerGame: stats.gamesPlayed > 0 ? (stats.shots / stats.gamesPlayed).toFixed(2) : 0,
      pointsPerGame: stats.gamesPlayed > 0 ? (stats.points / stats.gamesPlayed).toFixed(2) : 0
    };
  } catch (error) {
    console.error(`Error fetching stats for player ${playerId}:`, error.message);
    return null;
  }
}

/**
 * Fetch player game log (last 10 games for recency)
 */
async function fetchPlayerGameLog(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${CURRENT_SEASON}/2`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const gameLog = data.gameLog || [];
    
    // Take last 10 games
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
      powerPlayGoals: game.powerPlayGoals || 0,
      powerPlayPoints: game.powerPlayPoints || 0
    }));
  } catch (error) {
    console.error(`Error fetching game log for player ${playerId}:`, error.message);
    return [];
  }
}

/**
 * Calculate L5 and L10 averages from game log
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
 * Main function: Fetch all player stats
 */
async function updatePlayerStats() {
  console.log('🏒 NHL Player Stats Refresh');
  console.log('=' .repeat(60));
  console.log(`Season: ${CURRENT_SEASON}`);
  console.log(`Teams: ${NHL_TEAMS.length}`);
  console.log('');
  
  const allPlayers = [];
  let totalSkaters = 0;
  
  // Fetch all rosters
  console.log('📋 Fetching team rosters...');
  const rosterPromises = NHL_TEAMS.map(team => fetchTeamRoster(team));
  const rosters = await Promise.all(rosterPromises);
  
  const validRosters = rosters.filter(Boolean);
  console.log(`✅ Fetched ${validRosters.length} rosters\n`);
  
  // Process each team's skaters
  for (const roster of validRosters) {
    console.log(`Processing ${roster.team}...`);
    
    const skaters = [
      ...roster.forwards.map(p => ({ ...p, position: p.positionCode || 'F', team: roster.team })),
      ...roster.defensemen.map(p => ({ ...p, position: p.positionCode || 'D', team: roster.team }))
    ];
    
    totalSkaters += skaters.length;
    
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
          
          // Season stats
          season: seasonStats,
          
          // Recent form
          L5: recentAvgs.L5,
          L10: recentAvgs.L10,
          
          // Game log (last 10)
          recentGames: gameLog,
          
          // Metadata
          lastUpdated: new Date().toISOString()
        });
      }
      
      // Progress indicator
      if ((i + 1) % 5 === 0) {
        process.stdout.write(`  ${i + 1}/${skaters.length} players...\r`);
      }
    }
    
    console.log(`  ✅ ${skaters.length} players processed`);
  }
  
  console.log('');
  console.log(`📊 Total players processed: ${allPlayers.length}`);
  
  // Save to file
  const dataDir = path.join(__dirname, '../../data/nhl');
  const statsFile = path.join(dataDir, `player_stats_${CURRENT_SEASON}.json`);
  
  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  const output = {
    season: CURRENT_SEASON,
    generatedAt: new Date().toISOString(),
    totalPlayers: allPlayers.length,
    teams: validRosters.length,
    players: allPlayers
  };
  
  fs.writeFileSync(statsFile, JSON.stringify(output, null, 2));
  console.log(`✅ Saved to: ${statsFile}`);
  
  // Create summary stats
  const avgShotsPerGame = allPlayers.reduce((sum, p) => sum + parseFloat(p.season.shotsPerGame || 0), 0) / allPlayers.length;
  const playersWithL5Data = allPlayers.filter(p => p.L5.games >= 5).length;
  
  console.log('');
  console.log('📈 Summary:');
  console.log(`   Avg shots/game: ${avgShotsPerGame.toFixed(2)}`);
  console.log(`   Players with 5+ games: ${playersWithL5Data}`);
  console.log(`   File size: ${(fs.statSync(statsFile).size / 1024).toFixed(0)} KB`);
  
  return output;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updatePlayerStats().catch(console.error);
}

export { updatePlayerStats };
