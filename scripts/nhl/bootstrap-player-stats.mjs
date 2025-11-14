#!/usr/bin/env node

/**
 * NHL Player Stats Bootstrap Script
 * 
 * ONE-TIME / MANUAL script to build complete player_stats_20252026.json.
 * 
 * Strategy:
 * 1. Fetch all 32 team rosters (32 calls)
 * 2. For each player:
 *    - Fetch player landing page (1 call per player)
 *    - Fetch recent game logs (1 call per player)
 * 3. Compute season stats, L5, L10, staleness
 * 4. Write complete file with 400+ players
 * 
 * Expected:
 * - Runtime: 30-60 minutes
 * - NHL API calls: ~500 (32 rosters + ~450 players × 2 endpoints)
 * - With rate limiting at 0.5 calls/sec: ~1000 seconds = ~17 minutes
 * 
 * Rate limiting:
 * - 0.5 calls/sec (one call every 2 seconds)
 * - Max 500 calls per run
 * - Max 60 minutes runtime
 * - Jittered delays
 * 
 * Fail-loud policy:
 * - If < 300 players: FATAL error, do not write file
 * - If < 30 teams: FATAL error
 * - If any critical API fails: FATAL error
 * 
 * Usage:
 *   node scripts/nhl/bootstrap-player-stats.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { RateLimiter } from './lib/rate-limiter.mjs';
import { fetchWithRetry, batchFetchWithRetry } from './lib/fetch-with-retry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const SEASON = '20252026';
const OUTPUT_FILE = path.join(__dirname, '../../data/nhl/player_stats_20252026.json');
const MIN_PLAYERS_REQUIRED = 300;
const MIN_TEAMS_REQUIRED = 30;
const MAX_GAMES_TO_STORE = 10;

// NHL API endpoints
const NHL_API_BASE = 'https://api-web.nhle.com/v1';

// Rate limiter: 0.5 calls/sec, max 1600 calls, max 90 min
// Need ~1500 calls total: 32 rosters + 723 player details + 723 game logs
const rateLimiter = new RateLimiter(0.5, {
  maxCallsPerRun: 1600,
  maxDurationMinutes: 90
});

/**
 * Main bootstrap function
 */
async function bootstrap() {
  console.log('\n🏒 ========================================');
  console.log('🏒 NHL PLAYER STATS BOOTSTRAP');
  console.log('🏒 ========================================\n');
  console.log(`Season: ${SEASON}`);
  console.log(`Output: ${OUTPUT_FILE}`);
  console.log(`Min players required: ${MIN_PLAYERS_REQUIRED}`);
  console.log(`Rate limit: 0.5 calls/sec (1 call every 2 seconds)`);
  console.log('');
  
  const startTime = Date.now();
  
  try {
    // Step 1: Fetch all team rosters
    console.log('📋 Step 1: Fetching all team rosters...\n');
    const allPlayers = await fetchAllTeamRosters();
    console.log(`\n✅ Found ${allPlayers.length} players across ${new Set(allPlayers.map(p => p.team)).size} teams\n`);
    
    // Validate minimum players
    if (allPlayers.length < MIN_PLAYERS_REQUIRED) {
      throw new Error(
        `❌ FATAL: Only found ${allPlayers.length} players (need ${MIN_PLAYERS_REQUIRED}+).\n` +
        `This indicates a systemic failure in roster fetching.\n` +
        `NOT writing partial data.`
      );
    }
    
    // Step 2: Fetch player details (landing pages)
    console.log('📊 Step 2: Fetching player details...\n');
    await fetchPlayerDetails(allPlayers);
    
    // Step 3: Fetch player game logs
    console.log('\n🎮 Step 3: Fetching player game logs...\n');
    await fetchPlayerGameLogs(allPlayers);
    
    // Step 4: Compute stats (season, L5, L10)
    console.log('\n🧮 Step 4: Computing statistics...\n');
    computePlayerStats(allPlayers);
    
    // Step 5: Build output object
    console.log('📦 Step 5: Building output...\n');
    const output = buildOutput(allPlayers);
    
    // Final validation
    validateOutput(output);
    
    // Step 6: Write to file
    console.log('💾 Step 6: Writing to file...\n');
    writeOutputFile(output);
    
    // Success report
    const elapsedMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log('\n✅ ========================================');
    console.log('✅ BOOTSTRAP COMPLETE');
    console.log('✅ ========================================\n');
    console.log(`Players: ${output.totalPlayers}`);
    console.log(`Teams: ${output.teams}`);
    console.log(`Elapsed time: ${elapsedMinutes} minutes`);
    console.log(`Output file: ${OUTPUT_FILE}\n`);
    
    rateLimiter.report();
    
    console.log('\n🎯 Next steps:');
    console.log('   1. Run: node scripts/nhl/bootstrap-team-stats.mjs');
    console.log('   2. Test: node scripts/nhl/run-sog-tonight.mjs');
    console.log('   3. Deploy to Netlify Blobs if tests pass\n');
    
  } catch (error) {
    console.error('\n❌ ========================================');
    console.error('❌ BOOTSTRAP FAILED');
    console.error('❌ ========================================\n');
    console.error(error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    
    rateLimiter.report();
    
    process.exit(1);
  }
}

/**
 * Fetch all team rosters
 * 
 * @returns {Promise<Array>} Array of player objects with basic info
 */
async function fetchAllTeamRosters() {
  // NHL team abbreviations (32 teams as of 2025-26)
  const teams = [
    'ANA', 'BOS', 'BUF', 'CAR', 'CBJ', 'CGY', 'CHI', 'COL',
    'DAL', 'DET', 'EDM', 'FLA', 'LAK', 'MIN', 'MTL', 'NJD',
    'NSH', 'NYI', 'NYR', 'OTT', 'PHI', 'PIT', 'SEA', 'SJS',
    'STL', 'TBL', 'TOR', 'UTA', 'VAN', 'VGK', 'WPG', 'WSH'
  ];
  
  if (teams.length < MIN_TEAMS_REQUIRED) {
    throw new Error(`Team list only has ${teams.length} teams (need ${MIN_TEAMS_REQUIRED})`);
  }
  
  console.log(`Fetching rosters for ${teams.length} teams...`);
  
  const allPlayers = [];
  
  for (let i = 0; i < teams.length; i++) {
    const teamAbbr = teams[i];
    
    // Rate limit
    await rateLimiter.wait();
    
    console.log(`[${i + 1}/${teams.length}] Fetching ${teamAbbr} roster...`);
    
    try {
      const rosterUrl = `${NHL_API_BASE}/roster/${teamAbbr}/current`;
      const rosterData = await fetchWithRetry(rosterUrl, {
        fatal: true,
        label: `${teamAbbr} roster`
      });
      
      // Extract forwards and defensemen (skip goalies)
      const skaters = [
        ...(rosterData.forwards || []),
        ...(rosterData.defensemen || [])
      ];
      
      console.log(`   Found ${skaters.length} skaters`);
      
      for (const player of skaters) {
        allPlayers.push({
          playerId: player.id,
          name: player.firstName?.default + ' ' + player.lastName?.default,
          team: teamAbbr,
          position: player.positionCode,
          sweaterNumber: player.sweaterNumber,
          // Will be populated later
          season: {},
          L5: {},
          L10: {},
          recentGames: [],
          lastUpdated: new Date().toISOString(),
          lastGameDate: null
        });
      }
      
    } catch (error) {
      console.error(`   ❌ Failed to fetch ${teamAbbr} roster: ${error.message}`);
      throw new Error(`FATAL: Cannot continue without ${teamAbbr} roster`);
    }
  }
  
  return allPlayers;
}

/**
 * Fetch player details (landing pages) for all players
 * 
 * @param {Array} players - Array of player objects
 */
async function fetchPlayerDetails(players) {
  console.log(`Fetching details for ${players.length} players...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    
    // Rate limit
    await rateLimiter.wait();
    
    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`[${i + 1}/${players.length}] Fetching player details...`);
    }
    
    try {
      const landingUrl = `${NHL_API_BASE}/player/${player.playerId}/landing`;
      const landingData = await fetchWithRetry(landingUrl, {
        fatal: false, // Non-fatal: missing one player OK
        label: `${player.name} (${player.playerId})`
      });
      
      if (!landingData) {
        console.warn(`   ⚠️  No data for ${player.name}, skipping`);
        errorCount++;
        continue;
      }
      
      // Extract season stats (updated API structure: featuredStats.regularSeason.subSeason)
      const seasonStats = landingData.featuredStats?.regularSeason?.subSeason || {};
      
      player.season = {
        gamesPlayed: seasonStats.gamesPlayed || 0,
        goals: seasonStats.goals || 0,
        assists: seasonStats.assists || 0,
        points: seasonStats.points || 0,
        plusMinus: seasonStats.plusMinus || 0,
        pim: seasonStats.pim || 0,
        shots: seasonStats.shots || 0,
        shotsPerGame: seasonStats.gamesPlayed > 0 
          ? (seasonStats.shots / seasonStats.gamesPlayed).toFixed(2)
          : 0,
        avgToi: '0:00', // Not available in this API structure
        ppToi: '0:00'   // Not available in this API structure
      };
      
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Error fetching ${player.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\nPlayer details: ${successCount} succeeded, ${errorCount} failed`);
  
  if (successCount < MIN_PLAYERS_REQUIRED) {
    throw new Error(
      `FATAL: Only ${successCount} player details fetched (need ${MIN_PLAYERS_REQUIRED}+)`
    );
  }
}

/**
 * Fetch game logs for all players
 * 
 * @param {Array} players - Array of player objects
 */
async function fetchPlayerGameLogs(players) {
  console.log(`Fetching game logs for ${players.length} players...`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    
    // Skip if no games played
    if (!player.season.gamesPlayed || player.season.gamesPlayed === 0) {
      continue;
    }
    
    // Rate limit
    await rateLimiter.wait();
    
    if ((i + 1) % 50 === 0 || i === 0) {
      console.log(`[${i + 1}/${players.length}] Fetching game logs...`);
    }
    
    try {
      const gameLogUrl = `${NHL_API_BASE}/player/${player.playerId}/game-log/${SEASON}/2`;
      const gameLogData = await fetchWithRetry(gameLogUrl, {
        fatal: false, // Non-fatal
        label: `${player.name} game log`
      });
      
      if (!gameLogData || !gameLogData.gameLog) {
        errorCount++;
        continue;
      }
      
      // Extract recent games (last 10)
      const games = gameLogData.gameLog.slice(0, MAX_GAMES_TO_STORE);
      
      player.recentGames = games.map(game => ({
        gameId: game.gameId,
        date: game.gameDate,
        opponent: game.opponentAbbrev,
        homeRoad: game.homeRoadFlag,
        goals: game.goals || 0,
        assists: game.assists || 0,
        shots: game.shots || 0,
        toi: game.toi || '0:00',
        plusMinus: game.plusMinus || 0
      }));
      
      // Set last game date
      if (player.recentGames.length > 0) {
        player.lastGameDate = player.recentGames[0].date;
      }
      
      successCount++;
      
    } catch (error) {
      console.error(`   ❌ Error fetching game log for ${player.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\nGame logs: ${successCount} succeeded, ${errorCount} failed`);
}

/**
 * Compute L5, L10, and other derived stats for all players
 * 
 * @param {Array} players - Array of player objects
 */
function computePlayerStats(players) {
  console.log(`Computing L5/L10 for ${players.length} players...`);
  
  for (const player of players) {
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
  }
  
  console.log('✅ Statistics computed');
}

/**
 * Build final output object
 * 
 * @param {Array} players - Array of player objects
 * @returns {Object} Output object
 */
function buildOutput(players) {
  // Filter out players with no data
  // Prioritize season stats (more reliable than game logs)
  const validPlayers = players.filter(p => 
    p.season && p.season.gamesPlayed > 0
  );
  
  const uniqueTeams = new Set(validPlayers.map(p => p.team));
  
  // Calculate staleness
  const now = new Date();
  let maxDaysSinceUpdate = 0;
  let playersStale = 0;
  
  for (const player of validPlayers) {
    if (player.lastGameDate) {
      const lastGame = new Date(player.lastGameDate);
      const daysSince = (now - lastGame) / 1000 / 60 / 60 / 24;
      maxDaysSinceUpdate = Math.max(maxDaysSinceUpdate, daysSince);
      
      if (daysSince > 2) {
        playersStale++;
      }
    }
  }
  
  return {
    season: SEASON,
    generatedAt: new Date().toISOString(),
    totalPlayers: validPlayers.length,
    teams: uniqueTeams.size,
    dataSource: 'bootstrap-nhl-api',
    staleness: {
      maxDaysSinceUpdate: parseFloat(maxDaysSinceUpdate.toFixed(1)),
      playersStale,
      teamsStale: 0
    },
    players: validPlayers
  };
}

/**
 * Validate output before writing
 * 
 * @param {Object} output - Output object
 */
function validateOutput(output) {
  console.log('Validating output...');
  
  // Check player count
  if (output.totalPlayers < MIN_PLAYERS_REQUIRED) {
    throw new Error(
      `❌ FATAL VALIDATION: Only ${output.totalPlayers} players (need ${MIN_PLAYERS_REQUIRED}+).\n` +
      `Will NOT write partial data.`
    );
  }
  
  // Check team count
  if (output.teams < MIN_TEAMS_REQUIRED) {
    throw new Error(
      `❌ FATAL VALIDATION: Only ${output.teams} teams (need ${MIN_TEAMS_REQUIRED}+).\n` +
      `Will NOT write partial data.`
    );
  }
  
  // Check staleness
  if (output.staleness.maxDaysSinceUpdate > 7) {
    console.warn(
      `⚠️  Warning: Max staleness is ${output.staleness.maxDaysSinceUpdate} days.\n` +
      `   This is older than expected. Data may be out of date.`
    );
  }
  
  console.log('✅ Validation passed');
  console.log(`   Players: ${output.totalPlayers} (min: ${MIN_PLAYERS_REQUIRED})`);
  console.log(`   Teams: ${output.teams} (min: ${MIN_TEAMS_REQUIRED})`);
  console.log(`   Staleness: ${output.staleness.maxDaysSinceUpdate} days`);
}

/**
 * Write output to file
 * 
 * @param {Object} output - Output object
 */
function writeOutputFile(output) {
  // Ensure directory exists
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  // Write file
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
  
  // Report file size
  const stats = fs.statSync(OUTPUT_FILE);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  console.log(`✅ File written: ${OUTPUT_FILE}`);
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

// Run bootstrap
bootstrap();
