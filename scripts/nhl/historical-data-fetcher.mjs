/**
 * NHL Historical Game Data Fetcher
 * 
 * Purpose: Build training dataset for parameter optimization
 * Fetches player-level game logs from past 2-3 seasons to learn:
 * - Actual home/away effects per team
 * - Actual venue effects per arena
 * - Actual TOI vs shot rate relationships
 * - Actual PP boost by unit and opponent
 * - Actual streak predictive power
 * - Optimal ZINB dispersion parameters
 * 
 * Output: historical_game_data.json with ~50k+ player-game records
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

// Fetch data from these seasons (more data = better fits)
// 4 seasons for comprehensive backtest
const TRAINING_SEASONS = ['20212022', '20222023', '20232024', '20242025'];

// Rate limiting
const DELAY_MS = 100; // 10 requests/second
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Get all players who played in a season
 */
async function getSeasonRoster(season) {
  console.log(`📋 Fetching roster for ${season}...`);
  
  // We'll build roster from team rosters
  const teams = [
    'ANA', 'BOS', 'BUF', 'CGY', 'CAR', 'CHI', 'COL', 'CBJ',
    'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NSH',
    'NJD', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
    'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WSH', 'WPG'
  ];
  
  const allPlayers = new Set();
  
  for (const team of teams) {
    try {
      const url = `${NHL_API_BASE}/roster/${team}/${season}`;
      const resp = await fetch(url);
      
      if (resp.ok) {
        const data = await resp.json();
        
        // Add forwards
        if (data.forwards) {
          data.forwards.forEach(p => allPlayers.add(p.id));
        }
        
        // Add defensemen
        if (data.defensemen) {
          data.defensemen.forEach(p => allPlayers.add(p.id));
        }
      }
      
      await wait(DELAY_MS);
    } catch (error) {
      console.warn(`⚠️ Error fetching ${team} roster:`, error.message);
    }
  }
  
  console.log(`✅ Found ${allPlayers.size} players for ${season}`);
  return Array.from(allPlayers);
}

/**
 * Fetch full game log for a player in a season
 */
async function fetchPlayerGameLog(playerId, season) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    
    const data = await resp.json();
    return data.gameLog || [];
  } catch (error) {
    console.warn(`⚠️ Error fetching game log for player ${playerId}:`, error.message);
    return [];
  }
}

/**
 * Fetch player career stats to get position, name, etc.
 */
async function fetchPlayerInfo(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/landing`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    
    const data = await resp.json();
    return {
      id: playerId,
      name: `${data.firstName?.default || ''} ${data.lastName?.default || ''}`.trim(),
      position: data.position,
      sweaterNumber: data.sweaterNumber,
      teamAbbrev: data.currentTeamAbbrev
    };
  } catch (error) {
    return null;
  }
}

/**
 * Process game log into structured training data
 */
function processGameLog(playerId, playerInfo, gameLog) {
  return gameLog.map(game => {
    // Determine home/away
    const isHome = game.homeRoadFlag === 'H';
    const team = game.teamAbbrev;
    const opponent = game.opponentAbbrev;
    
    return {
      // Player info
      playerId,
      playerName: playerInfo?.name || 'Unknown',
      position: playerInfo?.position || 'Unknown',
      team,
      
      // Game info
      gameId: game.gameId,
      gameDate: game.gameDate,
      season: game.season,
      opponent,
      isHome,
      
      // Performance
      shots: game.shots || 0,
      goals: game.goals || 0,
      assists: game.assists || 0,
      points: game.points || 0,
      toi: game.toi || '0:00',
      toiMinutes: parseToiMinutes(game.toi),
      
      // Power play
      ppGoals: game.powerPlayGoals || 0,
      ppPoints: game.powerPlayPoints || 0,
      ppToi: game.ppToi || '0:00',
      
      // Plus/minus and game state
      plusMinus: game.plusMinus || 0,
      
      // Team performance
      teamGoalsFor: isHome ? game.homeScore : game.awayScore,
      teamGoalsAgainst: isHome ? game.awayScore : game.homeScore,
      gameResult: game.gameResult // 'W', 'L', 'OTL', etc.
    };
  });
}

/**
 * Convert TOI string to minutes
 */
function parseToiMinutes(toiString) {
  if (!toiString || toiString === '0:00') return 0;
  
  const [mins, secs] = toiString.split(':').map(Number);
  return mins + (secs / 60);
}

/**
 * Main: Fetch all historical data
 */
async function fetchHistoricalData() {
  console.log('🏒 NHL Historical Game Data Fetcher');
  console.log('='.repeat(70));
  console.log(`Training Seasons: ${TRAINING_SEASONS.join(', ')}`);
  console.log('This will take 30-60 minutes depending on API rate limits...\n');
  
  const allGameData = [];
  let totalGames = 0;
  
  for (const season of TRAINING_SEASONS) {
    console.log(`\n📅 Processing ${season}...`);
    console.log('-'.repeat(70));
    
    // Get all players for this season
    const players = await getSeasonRoster(season);
    console.log(`Found ${players.length} players\n`);
    
    let processed = 0;
    let errors = 0;
    const maxErrors = 50; // Stop if too many errors (API issues)
    
    for (const playerId of players) {
      // Stop if too many errors
      if (errors > maxErrors) {
        console.error(`\n⚠️ Stopping due to ${errors} errors - API may have issues`);
        break;
      }
      try {
        // Fetch player info
        const playerInfo = await fetchPlayerInfo(playerId);
        await wait(DELAY_MS);
        
        if (!playerInfo) {
          processed++;
          continue;
        }
        
        // Fetch game log
        const gameLog = await fetchPlayerGameLog(playerId, season);
        await wait(DELAY_MS);
        
        if (gameLog.length === 0) {
          processed++;
          continue;
        }
        
        // Process into training data
        const gameData = processGameLog(playerId, playerInfo, gameLog);
        allGameData.push(...gameData);
        totalGames += gameData.length;
        
        processed++;
        
        if (processed % 50 === 0) {
          console.log(`  Progress: ${processed}/${players.length} players | ${totalGames.toLocaleString()} games | ${errors} errors`);
        }
        
      } catch (error) {
        console.error(`❌ Error processing player ${playerId}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n✅ ${season} complete: ${totalGames.toLocaleString()} total games`);
  }
  
  console.log('\n' + '='.repeat(70));
  console.log(`🎉 Data collection complete!`);
  console.log(`Total games collected: ${totalGames.toLocaleString()}`);
  console.log(`Unique players: ${new Set(allGameData.map(g => g.playerId)).size}`);
  
  // Save to file
  const outputPath = path.join(__dirname, '../../data/nhl/historical_game_data.json');
  const outputDir = path.dirname(outputPath);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const output = {
    generatedAt: new Date().toISOString(),
    seasons: TRAINING_SEASONS,
    totalGames: totalGames,
    uniquePlayers: new Set(allGameData.map(g => g.playerId)).size,
    games: allGameData
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  const fileSizeKB = Math.round(fs.statSync(outputPath).size / 1024);
  console.log(`\n💾 Saved to: ${outputPath}`);
  console.log(`File size: ${fileSizeKB.toLocaleString()} KB`);
  
  return output;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  fetchHistoricalData()
    .then(() => {
      console.log('\n✅ Done!');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Fatal error:', error);
      process.exit(1);
    });
}

export { fetchHistoricalData };
