/**
 * NHL Historical Season Stats Fetcher
 * 
 * Fetches player stats for historical seasons to build career baselines
 * Usage: node scripts/nhl/fetch-historical-seasons.mjs --seasons=20222023,20232024
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';

// Parse command line args
const args = process.argv.slice(2);
const seasonsArg = args.find(arg => arg.startsWith('--seasons='));
const SEASONS = seasonsArg 
  ? seasonsArg.split('=')[1].split(',')
  : ['20222023', '20232024']; // Default: last 2 seasons

console.log(`\n🏒 Fetching NHL historical seasons: ${SEASONS.join(', ')}`);

// All 32 NHL teams
const NHL_TEAMS = [
  'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
  'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
  'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
  'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
];

/**
 * Fetch roster for a team in a specific season
 */
async function fetchTeamRosterForSeason(teamAbbrev, season) {
  // Use the same endpoint but filter for season
  const url = `${NHL_API_BASE}/roster/${teamAbbrev}/${season}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      // Try alternate endpoint
      const altUrl = `${NHL_API_BASE}/club-stats/${teamAbbrev}/${season}/2`;
      const altResponse = await fetch(altUrl);
      if (!altResponse.ok) {
        console.warn(`⚠️  No roster data for ${teamAbbrev} in ${season}`);
        return null;
      }
      const altData = await altResponse.json();
      return altData.skaters || [];
    }
    
    const data = await response.json();
    return [
      ...(data.forwards || []),
      ...(data.defensemen || [])
    ];
  } catch (error) {
    console.warn(`❌ Error fetching ${teamAbbrev} roster for ${season}: ${error.message}`);
    return null;
  }
}

/**
 * Fetch season stats for a player
 */
async function fetchPlayerSeasonStats(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/landing`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const data = await response.json();
    
    // Find stats for the requested season
    const seasonStats = data.seasonTotals?.find(s => 
      String(s.season) === String(season) && s.leagueAbbrev === 'NHL'
    );
    
    if (!seasonStats) return null;
    
    return {
      playerId: data.playerId,
      gamesPlayed: seasonStats.gamesPlayed || 0,
      goals: seasonStats.goals || 0,
      assists: seasonStats.assists || 0,
      points: seasonStats.points || 0,
      shots: seasonStats.shots || 0,
      shootingPct: seasonStats.shootingPctg || 0,
      plusMinus: seasonStats.plusMinus || 0,
      powerPlayGoals: seasonStats.powerPlayGoals || 0,
      powerPlayPoints: seasonStats.powerPlayPoints || 0,
      shortHandedGoals: seasonStats.shorthandedGoals || 0,
      gameWinningGoals: seasonStats.gameWinningGoals || 0,
      avgToi: seasonStats.avgToi || '0:00',
      faceoffWinPct: seasonStats.faceoffWinningPctg || 0,
      shotsPerGame: seasonStats.gamesPlayed > 0 
        ? (seasonStats.shots / seasonStats.gamesPlayed).toFixed(2)
        : '0.00',
      pointsPerGame: seasonStats.gamesPlayed > 0
        ? (seasonStats.points / seasonStats.gamesPlayed).toFixed(2)
        : '0.00'
    };
  } catch (error) {
    return null;
  }
}

/**
 * Fetch last 10 games for a player in a season
 */
async function fetchPlayerGameLog(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const data = await response.json();
    const games = data.gameLog || [];
    
    // Get last 10 games
    return games.slice(0, 10).map(game => ({
      gameId: game.gameId,
      date: game.gameDate,
      opponent: game.opponentAbbrev,
      goals: game.goals || 0,
      assists: game.assists || 0,
      shots: game.shots || 0,
      toi: game.toi || '0:00',
      plusMinus: game.plusMinus || 0
    }));
  } catch (error) {
    return [];
  }
}

/**
 * Calculate L5 and L10 averages from game log
 */
function calculateRecentAverages(gameLog) {
  if (!gameLog || gameLog.length === 0) return { L5: null, L10: null };
  
  const L5games = gameLog.slice(0, 5);
  const L10games = gameLog.slice(0, 10);
  
  const calcAvg = (games) => {
    if (games.length === 0) return null;
    const totalShots = games.reduce((sum, g) => sum + g.shots, 0);
    const totalToi = games.reduce((sum, g) => {
      const [mins, secs] = g.toi.split(':').map(Number);
      return sum + (mins || 0) + ((secs || 0) / 60);
    }, 0);
    
    return {
      games: games.length,
      shots: (totalShots / games.length).toFixed(2),
      avgToi: (totalToi / games.length).toFixed(1)
    };
  };
  
  return {
    L5: calcAvg(L5games),
    L10: calcAvg(L10games)
  };
}

/**
 * Main processing function for a season
 */
async function processSeason(season) {
  console.log(`\n📅 Processing season: ${season}`);
  
  const allPlayers = [];
  let teamCount = 0;
  
  for (const team of NHL_TEAMS) {
    teamCount++;
    process.stdout.write(`\r⏳ Processing teams: ${teamCount}/${NHL_TEAMS.length} (${team})...`);
    
    const roster = await fetchTeamRosterForSeason(team, season);
    if (!roster || roster.length === 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
      continue;
    }
    
    for (const player of roster) {
      const playerId = player.id || player.playerId;
      const position = player.positionCode || player.position;
      
      // Skip goalies
      if (position === 'G') continue;
      
      // Fetch season stats
      const seasonStats = await fetchPlayerSeasonStats(playerId, season);
      if (!seasonStats || seasonStats.gamesPlayed === 0) {
        continue;
      }
      
      // Fetch game log
      const gameLog = await fetchPlayerGameLog(playerId, season);
      const { L5, L10 } = calculateRecentAverages(gameLog);
      
      allPlayers.push({
        playerId,
        name: player.name || `${player.firstName?.default} ${player.lastName?.default}`,
        team,
        position,
        sweaterNumber: player.sweaterNumber || player.jerseyNumber,
        season: seasonStats,
        L5,
        L10,
        lastTenGames: gameLog.slice(0, 10)
      });
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Delay between teams
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log(`\n✅ Processed ${allPlayers.length} players for season ${season}`);
  
  // Calculate summary stats
  const avgShots = allPlayers.reduce((sum, p) => 
    sum + parseFloat(p.season.shotsPerGame), 0) / allPlayers.length;
  const playersWithL10 = allPlayers.filter(p => p.L10).length;
  
  console.log(`   📊 Average shots/game: ${avgShots.toFixed(2)}`);
  console.log(`   📈 Players with L10 data: ${playersWithL10}`);
  
  // Save to file
  const output = {
    season,
    generatedAt: new Date().toISOString(),
    totalPlayers: allPlayers.length,
    teams: NHL_TEAMS.length,
    players: allPlayers
  };
  
  const outputPath = path.join(__dirname, '../../data/nhl', `player_stats_${season}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`   💾 Saved to: data/nhl/player_stats_${season}.json`);
  
  return allPlayers.length;
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();
  let totalPlayers = 0;
  
  for (const season of SEASONS) {
    const count = await processSeason(season);
    totalPlayers += count;
  }
  
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log(`\n✅ COMPLETE: Fetched ${totalPlayers} total players across ${SEASONS.length} seasons`);
  console.log(`⏱️  Total time: ${duration} minutes`);
  console.log(`\n📂 Files created:`);
  SEASONS.forEach(s => {
    console.log(`   - data/nhl/player_stats_${s}.json`);
  });
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
