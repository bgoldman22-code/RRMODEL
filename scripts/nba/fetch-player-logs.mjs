#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════
 * NBA PLAYER GAME LOGS FETCHER - ELITE ESPN API PIPELINE
 * ═══════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Fetch game-by-game player statistics from ESPN API for all NBA players
 * with significant minutes. Used to calculate L5/L10 rolling averages for
 * player props projections.
 * 
 * DATA COLLECTED:
 * - Minutes, Points, Rebounds (O/D/Total), Assists, Steals, Blocks
 * - FG/3PT/FT shooting (makes, attempts, percentage)
 * - Turnovers, Plus/Minus, Fouls
 * - Game context: Home/Away, Opponent, Date
 * 
 * STRATEGY:
 * 1. Load active players from season aggregates (544 players)
 * 2. Filter to players with 15+ MPG (starters + key bench)
 * 3. Fetch last 20 games per player (covers L5/L10 with buffer)
 * 4. Store individual JSON files per player for efficient updates
 * 
 * USAGE:
 * node scripts/nba/fetch-player-logs.mjs
 * node scripts/nba/fetch-player-logs.mjs --player "LeBron James"
 * node scripts/nba/fetch-player-logs.mjs --limit 50
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const DATA_DIR = path.join(PROJECT_ROOT, 'data/nba');

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════

const CONFIG = {
  ESPN_BASE: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba',
  
  MIN_MPG: 15,             // Minimum minutes per game to include
  GAMES_TO_FETCH: 250,     // Number of games per player (covers 3+ full seasons + playoffs)
  RATE_LIMIT_MS: 500,      // Delay between API requests
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,
  
  // Fetch last 5 seasons (2020-21 through 2024-25) - COMPLETE regular + playoffs
  SEASONS: ['2020-21', '2021-22', '2022-23', '2023-24', '2024-25'],
  
  PATHS: {
    SEASON_DATA: path.join(DATA_DIR, 'players/archive/player_seasons_2024_25.json'),
    LOGS_DIR: path.join(DATA_DIR, 'player-logs/multi-season'),
    METADATA_FILE: path.join(DATA_DIR, 'player-logs/multi-season/_metadata.json')
  }
};

// ═══════════════════════════════════════════════════════════════════
// ESPN API HELPERS
// ═══════════════════════════════════════════════════════════════════

/**
 * Fetch ALL games from multiple NBA seasons (2020-21 through 2024-25)
 * This fetches COMPLETE game logs - every regular season + playoff game
 */
async function fetchAllSeasonGames() {
  const allGames = [];
  
  // Define complete season ranges (regular season + playoffs)
  const seasons = [
    { name: '2024-25', start: '20241022', end: '20241231', type: 'regular' }, // Current season (partial)
    { name: '2023-24', start: '20231024', end: '20240414', type: 'regular' },
    { name: '2023-24', start: '20240415', end: '20240620', type: 'playoffs' },
    { name: '2022-23', start: '20221018', end: '20230409', type: 'regular' },
    { name: '2022-23', start: '20230410', end: '20230612', type: 'playoffs' },
    { name: '2021-22', start: '20211019', end: '20220410', type: 'regular' },
    { name: '2021-22', start: '20220411', end: '20220616', type: 'playoffs' },
    { name: '2020-21', start: '20201222', end: '20210516', type: 'regular' },
    { name: '2020-21', start: '20210517', end: '20210720', type: 'playoffs' },
  ];
  
  console.log(`📅 Fetching COMPLETE game logs from 5 NBA seasons (2020-21 through 2024-25)...`);
  console.log(`   This will take several minutes - fetching every game + playoffs\n`);
  
  for (const season of seasons) {
    console.log(`\n🏀 ${season.name} ${season.type === 'playoffs' ? 'PLAYOFFS' : 'Regular Season'}`);
    console.log(`   ${season.start} → ${season.end}`);
    
    // Generate all dates in range
    const dates = generateDateRange(season.start, season.end);
    console.log(`   Fetching ${dates.length} days...`);
    
    let seasonGames = 0;
    
    for (const dateStr of dates) {
      try {
        const url = `${CONFIG.ESPN_BASE}/scoreboard?dates=${dateStr}&limit=50`;
        const response = await fetch(url);
        const data = await response.json();
        
        const events = data?.events || [];
        const completedGames = events
          .filter(e => e.status?.type?.completed === true)
          .map(e => e.id);
        
        if (completedGames.length > 0) {
          allGames.push(...completedGames);
          seasonGames += completedGames.length;
        }
        
        await sleep(100); // Fast but respectful
        
      } catch (error) {
        console.log(`   ⚠️  Failed to fetch ${dateStr}: ${error.message}`);
      }
    }
    
    console.log(`   ✅ Found ${seasonGames} games`);
  }
  
  console.log(`\n📊 TOTAL: ${allGames.length} games across 5 seasons`);
  return allGames;
}

/**
 * Generate all dates between start and end (YYYYMMDD format)
 */
function generateDateRange(startStr, endStr) {
  const dates = [];
  
  // Parse YYYYMMDD strings
  const start = new Date(
    parseInt(startStr.slice(0, 4)),
    parseInt(startStr.slice(4, 6)) - 1,
    parseInt(startStr.slice(6, 8))
  );
  
  const end = new Date(
    parseInt(endStr.slice(0, 4)),
    parseInt(endStr.slice(4, 6)) - 1,
    parseInt(endStr.slice(6, 8))
  );
  
  // Generate all dates in range
  const current = new Date(start);
  while (current <= end) {
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}${month}${day}`);
    
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

/**
 * Fetch player stats from a specific game
 */
async function fetchGamePlayerStats(gameId) {
  const url = `${CONFIG.ESPN_BASE}/summary?event=${gameId}`;
  
  try {
    const response = await fetch(url);
    const data = await response.json();
    
    const boxscore = data?.boxscore;
    if (!boxscore || !boxscore.players) return [];
    
    const gameDate = data?.header?.competitions?.[0]?.date;
    const players = [];
    
    // Both teams
    for (const teamData of boxscore.players) {
      const teamAbbr = teamData.team?.abbreviation || 'UNK';
      
      // Get stat column names
      const statNames = teamData.statistics?.[0]?.names || [];
      const athletes = teamData.statistics?.[0]?.athletes || [];
      
      for (const athleteData of athletes) {
        const athlete = athleteData.athlete || {};
        const statValues = athleteData.stats || [];
        
        // Zip stat names with values
        const statsMap = {};
        statNames.forEach((name, i) => {
          statsMap[name] = statValues[i] || '--';
        });
        
        // Parse FG, 3PT, FT (format: "made-attempts")
        const parseShooting = (str) => {
          if (!str || str === '--') return { made: 0, attempts: 0 };
          const parts = str.split('-');
          return { made: parseInt(parts[0]) || 0, attempts: parseInt(parts[1]) || 0 };
        };
        
        const fg = parseShooting(statsMap['FG']);
        const tp = parseShooting(statsMap['3PT']);
        const ft = parseShooting(statsMap['FT']);
        
        players.push({
          playerId: String(athlete.id), // Ensure string for consistent comparison
          playerName: athlete.displayName,
          team: teamAbbr,
          gameId,
          date: gameDate,
          
          // Core stats
          minutes: parseFloat(statsMap['MIN'] || 0),
          points: parseInt(statsMap['PTS'] || 0),
          rebounds: parseInt(statsMap['REB'] || 0),
          assists: parseInt(statsMap['AST'] || 0),
          steals: parseInt(statsMap['STL'] || 0),
          blocks: parseInt(statsMap['BLK'] || 0),
          turnovers: parseInt(statsMap['TO'] || 0),
          
          // Shooting
          fgm: fg.made,
          fga: fg.attempts,
          tpm: tp.made,
          tpa: tp.attempts,
          ftm: ft.made,
          fta: ft.attempts,
          
          // Advanced
          plusMinus: parseInt(statsMap['+/-'] || 0),
          fouls: parseInt(statsMap['PF'] || 0)
        });
      }
    }
    
    return players;
    
  } catch (error) {
    console.error(`Failed to fetch game ${gameId}: ${error.message}`);
    return [];
  }
}

/**
 * Build game log for specific player from recent games
 */
async function fetchPlayerGames(playerId, playerName) {
  console.log(`Fetching ${playerName} (ID: ${playerId})...`);
  
  try {
    // Get ALL games from last 5 seasons (regular + playoffs)
    const gameIds = await fetchAllSeasonGames();
    
    if (gameIds.length === 0) {
      console.log(`  ⚠️  No completed games found from last 5 seasons`);
      return null;
    }
    
    console.log(`  📅 Checking ${gameIds.length} games from last 5 seasons...`);
    
    const playerGames = [];
    
    // Fetch game summaries and extract this player's stats
    for (const gameId of gameIds) {
      await sleep(CONFIG.RATE_LIMIT_MS);
      
      const gamePlayers = await fetchGamePlayerStats(gameId);
      const playerInGame = gamePlayers.find(p => String(p.playerId) === String(playerId));
      
      if (playerInGame && playerInGame.minutes > 0) {
        playerGames.push(playerInGame);
        if (playerGames.length === 1) {
          console.log(`  ✨ First game found: ${playerInGame.date} vs ${playerInGame.team} - ${playerInGame.points}pts`);
        }
      }
      
      // Stop once we have enough games (~80 = 1 full season)
      if (playerGames.length >= CONFIG.GAMES_TO_FETCH) {
        console.log(`  📊 Reached ${CONFIG.GAMES_TO_FETCH} games, stopping...`);
        break;
      }
    }
    
    if (playerGames.length === 0) {
      console.log(`  ⚠️  Player not found in last 5 seasons (might be traded/injured/retired)`);
      return null;
    }
    
    console.log(`  ✅ Found ${playerGames.length} games from last 5 seasons`);
    return playerGames;
    
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return null;
  }
}

/**
 * Search for player's ESPN ID by name from recent games
 * Uses a lightweight fetch of just a few recent days
 */
async function findPlayerIdByName(playerName) {
  console.log(`\n🔍 Searching for: ${playerName}...`);
  
  try {
    // Get games from last few days (just for player ID lookup)
    const recentDates = [
      '20241225', '20241224', '20241223', '20241222', '20241221',
      '20241220', '20241219', '20241218', '20241217', '20241216'
    ];
    
    const gameIds = [];
    for (const dateStr of recentDates) {
      const url = `${CONFIG.ESPN_BASE}/scoreboard?dates=${dateStr}&limit=50`;
      const response = await fetch(url);
      const data = await response.json();
      
      const events = data?.events || [];
      const completedGames = events
        .filter(e => e.status?.type?.completed === true)
        .map(e => e.id);
      
      gameIds.push(...completedGames);
      await sleep(100);
      
      if (gameIds.length >= 50) break;
    }
    
    console.log(`   Searching through ${gameIds.length} games...`);
    
    // Search through game summaries for player
    for (let i = 0; i < Math.min(gameIds.length, 50); i++) {
      await sleep(CONFIG.RATE_LIMIT_MS);
      
      const players = await fetchGamePlayerStats(gameIds[i]);
      
      // Find player by name match (flexible matching)
      const match = players.find(p => {
        const pName = p.playerName.toLowerCase();
        const searchName = playerName.toLowerCase();
        return pName.includes(searchName) || searchName.includes(pName);
      });
      
      if (match) {
        console.log(`✅ Found: ${match.playerName} (ID: ${match.playerId})\n`);
        return String(match.playerId); // Ensure string
      }
    }
    
    throw new Error(`No players found matching "${playerName}" in recent games`);
    
  } catch (error) {
    throw new Error(`Failed to find player: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════
// DATA PROCESSING
// ═══════════════════════════════════════════════════════════════════

/**
 * Load active players from season aggregates
 */
async function loadActivePlayers() {
  try {
    const data = await fs.readFile(CONFIG.PATHS.SEASON_DATA, 'utf-8');
    const seasonData = JSON.parse(data);
    
    // Extract players array from the data structure
    const players = seasonData.players || seasonData;
    
    // Filter to players with significant minutes
    const activePlayers = players.filter(p => {
      const mpg = p.minutes_played / (p.games_played || 1);
      return mpg >= CONFIG.MIN_MPG && p.games_played >= 5;
    });
    
    console.log(`\n📊 Loaded ${activePlayers.length} active players (${CONFIG.MIN_MPG}+ MPG)\n`);
    
    return activePlayers;
    
  } catch (error) {
    throw new Error(`Failed to load season data: ${error.message}`);
  }
}

/**
 * Save player game logs to individual JSON file
 */
async function savePlayerLogs(playerId, playerName, games) {
  const filename = `${playerId}_${playerName.replace(/[^a-zA-Z0-9]/g, '')}.json`;
  const filepath = path.join(CONFIG.PATHS.LOGS_DIR, filename);
  
  const data = {
    playerId,
    playerName,
    seasons: CONFIG.SEASONS,
    lastUpdated: new Date().toISOString(),
    gamesCount: games.length,
    games: games.sort((a, b) => new Date(b.date) - new Date(a.date)) // Most recent first
  };
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`  ✅ Saved: ${filename}`);
}

/**
 * Update metadata tracking
 */
async function updateMetadata(stats) {
  const metadata = {
    lastRun: new Date().toISOString(),
    season: CONFIG.SEASON,
    stats,
    config: {
      minMpg: CONFIG.MIN_MPG,
      gamesFetched: CONFIG.GAMES_TO_FETCH
    }
  };
  
  await fs.writeFile(CONFIG.PATHS.METADATA, JSON.stringify(metadata, null, 2));
}

// ═══════════════════════════════════════════════════════════════════
// MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('🏀 NBA PLAYER GAME LOGS FETCHER');
  console.log('═══════════════════════════════════════════════════════════════════\n');
  
  // Parse CLI args
  const args = process.argv.slice(2);
  const playerNameArg = args.find(a => a.startsWith('--player='))?.split('=')[1];
  const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
  
  // Create output directory
  if (!fs.existsSync(CONFIG.PATHS.LOGS_DIR)) {
    fs.mkdirSync(CONFIG.PATHS.LOGS_DIR, { recursive: true });
  }
  
  // Single player mode
  if (playerNameArg) {
    console.log(`🎯 Single Player Mode: ${playerNameArg}\n`);
    
    const playerId = await findPlayerIdByName(playerNameArg);
    await sleep(CONFIG.RATE_LIMIT_MS);
    
    const games = await fetchPlayerGames(playerId, playerNameArg);
    
    if (games) {
      const filename = await savePlayerLogs(playerId, playerNameArg, games);
      console.log(`\n✅ Saved: ${filename}`);
    }
    
    return;
  }
  
  // Batch mode - all active players
  const activePlayers = await loadActivePlayers();
  const limit = limitArg ? parseInt(limitArg) : activePlayers.length;
  const playersToFetch = activePlayers.slice(0, limit);
  
  console.log(`📥 Fetching logs for ${playersToFetch.length} players...\n`);
  
  const stats = {
    total: playersToFetch.length,
    success: 0,
    failed: 0,
    noData: 0,
    startTime: new Date().toISOString()
  };
  
  for (let i = 0; i < playersToFetch.length; i++) {
    const player = playersToFetch[i];
    const progress = `[${i + 1}/${playersToFetch.length}]`;
    
    console.log(`${progress} ${player.player} (${player.team})`);
    
    // ESPN IDs are typically numeric, but we need to search by name
    // For now, we'll need to implement a mapping or search mechanism
    // This is a simplified version - in production, maintain a player ID mapping
    
    try {
      const playerId = await findPlayerIdByName(player.player);
      await sleep(CONFIG.RATE_LIMIT_MS);
      
      const games = await fetchPlayerGames(playerId, player.player);
      await sleep(CONFIG.RATE_LIMIT_MS);
      
      if (games && games.length > 0) {
        await savePlayerLogs(playerId, player.player, games);
        stats.success++;
      } else {
        stats.noData++;
      }
      
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
      stats.failed++;
    }
    
    // Progress update every 10 players
    if ((i + 1) % 10 === 0) {
      console.log(`\n📊 Progress: ${stats.success} success, ${stats.failed} failed, ${stats.noData} no data\n`);
    }
  }
  
  stats.endTime = new Date().toISOString();
  await updateMetadata(stats);
  
  // Final summary
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('📊 FETCH COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`✅ Success: ${stats.success}`);
  console.log(`⚠️  No Data: ${stats.noData}`);
  console.log(`❌ Failed: ${stats.failed}`);
  console.log(`📁 Logs saved: ${CONFIG.PATHS.LOGS_DIR}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');
}

// ═══════════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════════

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error.message);
  process.exit(1);
});
