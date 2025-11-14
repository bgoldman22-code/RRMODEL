#!/usr/bin/env node

/**
 * NHL Player Stats Incremental Update Script
 * 
 * DAILY script to update player_stats_20252026.json with yesterday's games only.
 * 
 * Strategy:
 * 1. Load existing player_stats_20252026.json
 * 2. Fetch yesterday's schedule (1 call)
 * 3. For each game, fetch boxscore (~5-15 calls)
 * 4. Update players who played in those games
 * 5. Recompute L5/L10 from stored recentGames
 * 6. Update staleness metadata
 * 7. Write updated file
 * 
 * Expected:
 * - Runtime: < 1 minute
 * - NHL API calls: 6-16 (1 schedule + 5-15 boxscores)
 * - Updates: 100-250 players (those who played yesterday)
 * 
 * Graceful degradation:
 * - If 0 games yesterday (off-day): Log and exit
 * - If one boxscore fails: Log and continue
 * - If schedule fails: FATAL (can't determine what to update)
 * 
 * Usage:
 *   node scripts/nhl/update-player-stats-incremental.mjs [date]
 *   
 *   # Update yesterday's games (default)
 *   node scripts/nhl/update-player-stats-incremental.mjs
 *   
 *   # Update specific date
 *   node scripts/nhl/update-player-stats-incremental.mjs 2025-11-12
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RateLimiter } from './lib/rate-limiter.mjs';
import { fetchWithRetry } from './lib/fetch-with-retry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const SEASON = '20252026';
const DATA_FILE = path.join(__dirname, '../../data/nhl/player_stats_20252026.json');
const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const MAX_GAMES_TO_STORE = 10;

// Rate limiter: 0.5 calls/sec, max 50 calls (should never hit this)
const rateLimiter = new RateLimiter(0.5, {
  maxCallsPerRun: 50,
  maxDurationMinutes: 5
});

/**
 * Main incremental update function
 */
async function updateIncremental() {
  console.log('\n🏒 ========================================');
  console.log('🏒 NHL PLAYER STATS INCREMENTAL UPDATE');
  console.log('🏒 ========================================\n');
  
  const startTime = Date.now();
  
  try {
    // Determine target date (yesterday or specified)
    const targetDate = getTargetDate();
    console.log(`Target date: ${targetDate}\n`);
    
    // Step 1: Load existing data
    console.log('📂 Step 1: Loading existing data...\n');
    const existingData = loadExistingData();
    console.log(`Loaded ${existingData.totalPlayers} players\n`);
    
    // Step 2: Fetch schedule for target date
    console.log('📅 Step 2: Fetching schedule...\n');
    const games = await fetchSchedule(targetDate);
    
    if (games.length === 0) {
      console.log('ℹ️  No games scheduled for this date. This is normal for off-days.');
      console.log('   No updates needed. Exiting.\n');
      return;
    }
    
    console.log(`Found ${games.length} games\n`);
    
    // Step 3: Fetch boxscores
    console.log('📊 Step 3: Fetching boxscores...\n');
    const boxscores = await fetchBoxscores(games);
    console.log(`\nFetched ${boxscores.length} boxscores\n`);
    
    // Step 4: Update player stats
    console.log('🔄 Step 4: Updating player stats...\n');
    const updateCount = updatePlayerStats(existingData, boxscores, targetDate);
    console.log(`Updated ${updateCount} players\n`);
    
    // Step 5: Recompute L5/L10
    console.log('🧮 Step 5: Recomputing L5/L10...\n');
    recomputeStats(existingData);
    
    // Step 6: Update staleness metadata
    console.log('⏱️  Step 6: Updating staleness...\n');
    updateStaleness(existingData);
    
    // Step 7: Write updated file
    console.log('💾 Step 7: Writing updated file...\n');
    writeDataFile(existingData);
    
    // Success report
    const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n✅ ========================================');
    console.log('✅ INCREMENTAL UPDATE COMPLETE');
    console.log('✅ ========================================\n');
    console.log(`Date: ${targetDate}`);
    console.log(`Games processed: ${games.length}`);
    console.log(`Players updated: ${updateCount}`);
    console.log(`Total players: ${existingData.totalPlayers}`);
    console.log(`Elapsed time: ${elapsedSeconds} seconds`);
    console.log(`Max staleness: ${existingData.staleness.maxDaysSinceUpdate} days`);
    console.log(`Stale players (>2 days): ${existingData.staleness.playersStale}\n`);
    
    rateLimiter.report();
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ INCREMENTAL UPDATE FAILED');
    console.error('❌ ========================================\n');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    rateLimiter.report();
    
    process.exit(1);
  }
}

/**
 * Get target date (yesterday or CLI arg)
 * 
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getTargetDate() {
  const dateArg = process.argv[2];
  
  if (dateArg) {
    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
      throw new Error(`Invalid date format: ${dateArg}. Use YYYY-MM-DD`);
    }
    return dateArg;
  }
  
  // Default: yesterday
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  
  const year = yesterday.getFullYear();
  const month = String(yesterday.getMonth() + 1).padStart(2, '0');
  const day = String(yesterday.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Load existing player data
 * 
 * @returns {Object} Existing data
 */
function loadExistingData() {
  if (!fs.existsSync(DATA_FILE)) {
    throw new Error(
      `Data file not found: ${DATA_FILE}\n` +
      `You must run bootstrap first:\n` +
      `  node scripts/nhl/bootstrap-player-stats.mjs`
    );
  }
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  
  // Validate structure
  if (!data.players || !Array.isArray(data.players)) {
    throw new Error('Invalid data file structure: missing players array');
  }
  
  console.log(`✅ Loaded existing data:`);
  console.log(`   Total players: ${data.totalPlayers}`);
  console.log(`   Teams: ${data.teams}`);
  console.log(`   Generated: ${data.generatedAt}`);
  console.log(`   Source: ${data.dataSource || 'unknown'}`);
  
  return data;
}

/**
 * Fetch schedule for target date
 * 
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} Array of game objects
 */
async function fetchSchedule(date) {
  await rateLimiter.wait();
  
  const scheduleUrl = `${NHL_API_BASE}/schedule/${date}`;
  const scheduleData = await fetchWithRetry(scheduleUrl, {
    fatal: true, // Schedule is critical
    label: `Schedule ${date}`
  });
  
  // Extract games
  const games = [];
  
  if (scheduleData.gameWeek && Array.isArray(scheduleData.gameWeek)) {
    for (const day of scheduleData.gameWeek) {
      if (day.games && Array.isArray(day.games)) {
        games.push(...day.games);
      }
    }
  }
  
  console.log(`Found ${games.length} games on ${date}`);
  
  return games;
}

/**
 * Fetch boxscores for all games
 * 
 * @param {Array} games - Array of game objects
 * @returns {Promise<Array>} Array of boxscore objects
 */
async function fetchBoxscores(games) {
  const boxscores = [];
  
  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const gameId = game.id;
    
    await rateLimiter.wait();
    
    console.log(`[${i + 1}/${games.length}] Fetching boxscore ${gameId}...`);
    
    try {
      const boxscoreUrl = `${NHL_API_BASE}/gamecenter/${gameId}/boxscore`;
      const boxscoreData = await fetchWithRetry(boxscoreUrl, {
        fatal: false, // Non-fatal: one failed boxscore OK
        label: `Boxscore ${gameId}`
      });
      
      if (boxscoreData) {
        boxscores.push(boxscoreData);
        console.log(`   ✅ Success`);
      } else {
        console.warn(`   ⚠️  Failed, skipping`);
      }
      
    } catch (error) {
      console.error(`   ❌ Error: ${error.message}`);
      // Continue with other games
    }
  }
  
  return boxscores;
}

/**
 * Update player stats from boxscores
 * 
 * @param {Object} data - Existing data object
 * @param {Array} boxscores - Array of boxscore objects
 * @param {string} date - Date string
 * @returns {number} Count of updated players
 */
function updatePlayerStats(data, boxscores, date) {
  let updateCount = 0;
  
  // Create lookup map for fast player access
  const playerMap = new Map();
  for (const player of data.players) {
    playerMap.set(player.playerId, player);
  }
  
  // Process each boxscore
  for (const boxscore of boxscores) {
    const gameId = boxscore.id;
    
    // Extract player stats from both teams
    const homeTeam = boxscore.homeTeam || {};
    const awayTeam = boxscore.awayTeam || {};
    
    const homePlayers = [
      ...(homeTeam.forwards || []),
      ...(homeTeam.defense || [])
    ];
    
    const awayPlayers = [
      ...(awayTeam.forwards || []),
      ...(awayTeam.defense || [])
    ];
    
    const allBoxscorePlayers = [...homePlayers, ...awayPlayers];
    
    // Update each player
    for (const boxPlayer of allBoxscorePlayers) {
      const playerId = boxPlayer.playerId;
      const player = playerMap.get(playerId);
      
      if (!player) {
        // New player not in our dataset - this is OK, they might be a call-up
        console.log(`   ℹ️  Skipping new player: ${boxPlayer.name?.default} (${playerId})`);
        continue;
      }
      
      // Create game entry
      const gameEntry = {
        gameId: gameId,
        date: date,
        opponent: boxPlayer.homeRoadFlag === 'H' ? awayTeam.abbrev : homeTeam.abbrev,
        homeRoad: boxPlayer.homeRoadFlag || 'H',
        goals: boxPlayer.goals || 0,
        assists: boxPlayer.assists || 0,
        shots: boxPlayer.shots || 0,
        toi: boxPlayer.toi || '0:00',
        plusMinus: boxPlayer.plusMinus || 0
      };
      
      // Add to recentGames (prepend so newest is first)
      player.recentGames.unshift(gameEntry);
      
      // Keep only MAX_GAMES_TO_STORE
      if (player.recentGames.length > MAX_GAMES_TO_STORE) {
        player.recentGames = player.recentGames.slice(0, MAX_GAMES_TO_STORE);
      }
      
      // Update season stats
      player.season.gamesPlayed = (player.season.gamesPlayed || 0) + 1;
      player.season.goals = (player.season.goals || 0) + gameEntry.goals;
      player.season.assists = (player.season.assists || 0) + gameEntry.assists;
      player.season.shots = (player.season.shots || 0) + gameEntry.shots;
      
      if (player.season.gamesPlayed > 0) {
        player.season.shotsPerGame = (player.season.shots / player.season.gamesPlayed).toFixed(2);
      }
      
      // Update timestamps
      player.lastUpdated = new Date().toISOString();
      player.lastGameDate = date;
      
      updateCount++;
    }
  }
  
  console.log(`Updated ${updateCount} player records`);
  
  return updateCount;
}

/**
 * Recompute L5/L10 stats for all players
 * 
 * @param {Object} data - Data object
 */
function recomputeStats(data) {
  let recomputeCount = 0;
  
  for (const player of data.players) {
    if (player.recentGames.length === 0) {
      continue;
    }
    
    // L5: Last 5 games
    const last5 = player.recentGames.slice(0, 5);
    if (last5.length > 0) {
      const totalShots = last5.reduce((sum, g) => sum + (g.shots || 0), 0);
      const totalToi = last5.reduce((sum, g) => sum + parseToi(g.toi), 0);
      
      player.L5 = {
        games: last5.length,
        shots: (totalShots / last5.length).toFixed(2),
        toi: formatToi(totalToi / last5.length)
      };
    }
    
    // L10: Last 10 games
    const last10 = player.recentGames.slice(0, 10);
    if (last10.length > 0) {
      const totalShots = last10.reduce((sum, g) => sum + (g.shots || 0), 0);
      const totalToi = last10.reduce((sum, g) => sum + parseToi(g.toi), 0);
      
      player.L10 = {
        games: last10.length,
        shots: (totalShots / last10.length).toFixed(2),
        toi: formatToi(totalToi / last10.length)
      };
    }
    
    recomputeCount++;
  }
  
  console.log(`Recomputed L5/L10 for ${recomputeCount} players`);
}

/**
 * Update staleness metadata
 * 
 * @param {Object} data - Data object
 */
function updateStaleness(data) {
  const now = new Date();
  let maxDaysSinceUpdate = 0;
  let playersStale = 0;
  
  for (const player of data.players) {
    if (player.lastGameDate) {
      const lastGame = new Date(player.lastGameDate);
      const daysSince = (now - lastGame) / 1000 / 60 / 60 / 24;
      maxDaysSinceUpdate = Math.max(maxDaysSinceUpdate, daysSince);
      
      if (daysSince > 2) {
        playersStale++;
      }
    }
  }
  
  data.staleness = {
    maxDaysSinceUpdate: parseFloat(maxDaysSinceUpdate.toFixed(1)),
    playersStale,
    teamsStale: 0
  };
  
  data.generatedAt = new Date().toISOString();
  data.dataSource = data.dataSource + '+incremental';
  
  console.log(`Staleness updated:`);
  console.log(`   Max days: ${data.staleness.maxDaysSinceUpdate}`);
  console.log(`   Stale players: ${data.staleness.playersStale}`);
}

/**
 * Write updated data to file
 * 
 * @param {Object} data - Data object
 */
function writeDataFile(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  
  const stats = fs.statSync(DATA_FILE);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`✅ File written: ${DATA_FILE}`);
  console.log(`   Size: ${sizeMB} MB`);
}

/**
 * Parse TOI string to seconds
 * 
 * @param {string} toi - TOI string like "21:45"
 * @returns {number} Seconds
 */
function parseToi(toi) {
  if (!toi || toi === '0:00') return 0;
  const parts = toi.split(':');
  return parseInt(parts[0]) * 60 + parseInt(parts[1] || 0);
}

/**
 * Format seconds to TOI string
 * 
 * @param {number} seconds - Seconds
 * @returns {string} TOI string like "21:45"
 */
function formatToi(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Run incremental update
updateIncremental();
