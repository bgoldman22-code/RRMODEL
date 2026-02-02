#!/usr/bin/env node
/**
 * MLB Research V1.1 - Full Game Feed Collector
 * 
 * Downloads complete GUMBO game feeds from MLB Stats API for all 2021-2025 regular season games.
 * This is the foundational data collection step for the research dataset.
 * 
 * What this collects:
 * - Lineups with batting order (from boxscore)
 * - Actual first pitch time
 * - Full boxscore stats (H, HR, K, BB, IP, etc.)
 * - Player metadata (handedness, positions)
 * - Weather (if available)
 * - Venue info
 * 
 * Usage:
 *   node scripts/collect_full_game_feeds.mjs [--year 2024] [--resume] [--dry-run]
 * 
 * Options:
 *   --year YYYY     Collect only specific year (default: all 2021-2025)
 *   --resume        Skip games that already have data files
 *   --dry-run       Show what would be collected without making requests
 *   --batch N       Process N games then pause (for testing)
 * 
 * Rate limiting: 100ms between requests (~10 req/sec, well under MLB limits)
 * Expected runtime: ~2-4 hours for all 5 seasons
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Data directories
  RAW_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_research', 'raw', 'statsapi_games'),
  SCHEDULE_DIR: path.join(PROJECT_ROOT, 'data', 'mlb_historical', 'games'),
  
  // MLB Stats API endpoints
  MLB_API_BASE: 'https://statsapi.mlb.com/api/v1.1',
  MLB_API_V1: 'https://statsapi.mlb.com/api/v1',
  
  // Rate limiting (be respectful to MLB servers)
  REQUEST_DELAY_MS: 100,  // 100ms = 10 requests/second
  RETRY_DELAY_MS: 2000,
  MAX_RETRIES: 3,
  
  // Years to collect
  YEARS: [2021, 2022, 2023, 2024, 2025],
  
  // Only regular season games
  GAME_TYPE: 'R'
};

// ============================================================================
// PROGRESS TRACKER
// ============================================================================

class ProgressTracker {
  constructor(name, total) {
    this.name = name;
    this.total = total;
    this.current = 0;
    this.skipped = 0;
    this.errors = [];
    this.startTime = Date.now();
  }

  increment(gamePk, status = 'done') {
    this.current++;
    const pct = ((this.current / this.total) * 100).toFixed(1);
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(0);
    const rate = this.current > 0 ? (this.current / (elapsed / 60)).toFixed(1) : '0';
    const eta = this.current > 0 
      ? Math.round(((this.total - this.current) / (this.current / elapsed)))
      : '?';
    
    const statusIcon = status === 'skip' ? '⏭️' : status === 'error' ? '❌' : '✅';
    
    process.stdout.write(
      `\r${statusIcon} ${this.name}: ${this.current}/${this.total} (${pct}%) | ` +
      `${elapsed}s elapsed | ${rate}/min | ETA: ${eta}s | Game: ${gamePk}`.padEnd(100)
    );
  }

  skip(gamePk, reason) {
    this.skipped++;
    this.increment(gamePk, 'skip');
  }

  error(gamePk, error) {
    this.errors.push({ game_pk: gamePk, error: error.message, time: new Date().toISOString() });
    this.increment(gamePk, 'error');
  }

  complete() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    console.log(`\n\n✅ ${this.name} complete!`);
    console.log(`   Total: ${this.current}/${this.total}`);
    console.log(`   Skipped: ${this.skipped}`);
    console.log(`   Errors: ${this.errors.length}`);
    console.log(`   Time: ${elapsed}s`);
    
    if (this.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      this.errors.slice(0, 10).forEach(e => {
        console.log(`   - Game ${e.game_pk}: ${e.error}`);
      });
      if (this.errors.length > 10) {
        console.log(`   ... and ${this.errors.length - 10} more`);
      }
    }
    
    return {
      total: this.total,
      processed: this.current,
      skipped: this.skipped,
      errors: this.errors
    };
  }
}

// ============================================================================
// HTTP UTILITIES
// ============================================================================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = CONFIG.MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 404) {
        // Game not found - this is expected for some game_pks
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      console.warn(`\n⚠️  Retry ${attempt}/${retries} for ${url}: ${error.message}`);
      await sleep(CONFIG.RETRY_DELAY_MS * attempt);
    }
  }
}

// ============================================================================
// MLB API FUNCTIONS
// ============================================================================

/**
 * Get schedule for a season to find all game_pks
 */
async function getSeasonSchedule(year) {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  
  const url = `${CONFIG.MLB_API_V1}/schedule?sportId=1&startDate=${startDate}&endDate=${endDate}&gameType=R&hydrate=team`;
  
  console.log(`\n📅 Fetching ${year} schedule...`);
  const data = await fetchWithRetry(url);
  
  if (!data || !data.dates) {
    throw new Error(`No schedule data for ${year}`);
  }
  
  const games = [];
  for (const date of data.dates) {
    for (const game of date.games) {
      // Only include completed regular season games
      if (game.gameType === 'R' && game.status.abstractGameState === 'Final') {
        games.push({
          game_pk: game.gamePk,
          game_date: date.date,
          home_team: game.teams.home.team.abbreviation || game.teams.home.team.name,
          away_team: game.teams.away.team.abbreviation || game.teams.away.team.name,
          status: game.status.detailedState
        });
      }
    }
  }
  
  console.log(`   Found ${games.length} completed regular season games`);
  return games;
}

/**
 * Get full game feed (GUMBO) for a specific game
 * This is the main endpoint that has everything
 */
async function getGameFeed(gamePk) {
  const url = `${CONFIG.MLB_API_BASE}/game/${gamePk}/feed/live`;
  return await fetchWithRetry(url);
}

/**
 * Get boxscore for a game (backup source for lineup data)
 */
async function getBoxscore(gamePk) {
  const url = `${CONFIG.MLB_API_V1}/game/${gamePk}/boxscore`;
  return await fetchWithRetry(url);
}

// ============================================================================
// DATA EXTRACTION
// ============================================================================

/**
 * Extract the data we need from the game feed
 * This creates a "raw but structured" version of the game data
 */
function extractGameData(gameFeed, boxscore) {
  const gameData = gameFeed.gameData;
  const liveData = gameFeed.liveData;
  
  // Basic game info
  const extracted = {
    _meta: {
      collected_at: new Date().toISOString(),
      source: 'mlb_statsapi',
      feed_version: gameFeed.metaData?.gameEvents || 'unknown'
    },
    
    game_pk: gameData.game.pk,
    game_date: gameData.datetime.officialDate,
    season: gameData.game.season,
    game_type: gameData.game.type,
    
    // Timestamps - CRITICAL for leakage prevention
    datetime: {
      scheduled_first_pitch_utc: gameData.datetime.dateTime,
      actual_first_pitch_utc: extractActualFirstPitch(liveData),
      day_night: gameData.datetime.dayNight,
      time_zone: gameData.datetime.timeZone
    },
    
    // Teams
    home_team: {
      id: gameData.teams.home.id,
      name: gameData.teams.home.name,
      abbreviation: gameData.teams.home.abbreviation,
      league: gameData.teams.home.league?.name,
      division: gameData.teams.home.division?.name
    },
    away_team: {
      id: gameData.teams.away.id,
      name: gameData.teams.away.name,
      abbreviation: gameData.teams.away.abbreviation,
      league: gameData.teams.away.league?.name,
      division: gameData.teams.away.division?.name
    },
    
    // Venue
    venue: {
      id: gameData.venue.id,
      name: gameData.venue.name,
      city: gameData.venue.location?.city,
      state: gameData.venue.location?.state,
      roof_type: gameData.venue.fieldInfo?.roofType,
      surface: gameData.venue.fieldInfo?.turfType,
      capacity: gameData.venue.fieldInfo?.capacity,
      dimensions: {
        left: gameData.venue.fieldInfo?.leftLine,
        left_center: gameData.venue.fieldInfo?.leftCenter,
        center: gameData.venue.fieldInfo?.center,
        right_center: gameData.venue.fieldInfo?.rightCenter,
        right: gameData.venue.fieldInfo?.rightLine
      }
    },
    
    // Weather (if available)
    weather: gameData.weather ? {
      condition: gameData.weather.condition,
      temp_f: parseFloat(gameData.weather.temp) || null,
      wind: gameData.weather.wind
    } : null,
    
    // Game status
    status: {
      abstract_state: gameData.status.abstractGameState,
      detailed_state: gameData.status.detailedState,
      is_final: gameData.status.abstractGameState === 'Final'
    },
    
    // Lineups - CRITICAL for our schema
    lineups: extractLineups(liveData, boxscore),
    
    // Starting pitchers
    starting_pitchers: extractStartingPitchers(liveData, boxscore, gameData.players),
    
    // Boxscore stats
    boxscore: extractBoxscoreStats(liveData, boxscore),
    
    // Score by inning
    linescore: extractLinescore(liveData),
    
    // Player metadata (handedness, positions)
    players: extractPlayerMetadata(gameData.players)
  };
  
  return extracted;
}

/**
 * Extract actual first pitch time from play-by-play
 */
function extractActualFirstPitch(liveData) {
  if (!liveData?.plays?.allPlays) return null;
  
  // Find the first pitch of the game
  for (const play of liveData.plays.allPlays) {
    if (play.about?.inning === 1 && play.about?.halfInning === 'top') {
      // Look for the first pitch event
      if (play.playEvents) {
        for (const event of play.playEvents) {
          if (event.isPitch && event.startTime) {
            return event.startTime;
          }
        }
      }
    }
  }
  
  return null;
}

/**
 * Extract lineups from boxscore
 * Uses battingOrder field - NEVER PA sequence
 */
function extractLineups(liveData, boxscore) {
  const lineups = {
    home: [],
    away: [],
    source: 'boxscore_batting_order'
  };
  
  const boxscoreData = boxscore || liveData?.boxscore;
  if (!boxscoreData) return lineups;
  
  // Extract from boxscore.teams.home.battingOrder / players
  for (const side of ['home', 'away']) {
    const teamData = boxscoreData.teams?.[side];
    if (!teamData) continue;
    
    // battingOrder is an array of player IDs in batting order
    const battingOrder = teamData.battingOrder || [];
    const players = teamData.players || {};
    
    for (let i = 0; i < battingOrder.length && i < 9; i++) {
      const playerId = battingOrder[i];
      const playerKey = `ID${playerId}`;
      const playerData = players[playerKey];
      
      if (playerData) {
        lineups[side].push({
          batting_order: i + 1,
          player_id: playerId,
          full_name: playerData.person?.fullName,
          position: playerData.position?.abbreviation,
          bats: playerData.battingSide?.code || null,
          throws: playerData.pitchHand?.code || null
        });
      }
    }
  }
  
  return lineups;
}

/**
 * Extract starting pitchers
 */
function extractStartingPitchers(liveData, boxscore, allPlayers) {
  const starters = {
    home: null,
    away: null
  };
  
  const boxscoreData = boxscore || liveData?.boxscore;
  if (!boxscoreData) return starters;
  
  for (const side of ['home', 'away']) {
    const teamData = boxscoreData.teams?.[side];
    if (!teamData?.pitchers || teamData.pitchers.length === 0) continue;
    
    // First pitcher in the list is the starter
    const starterId = teamData.pitchers[0];
    const playerKey = `ID${starterId}`;
    const playerData = teamData.players?.[playerKey];
    
    if (playerData) {
      // Get handedness from allPlayers if available
      const fullPlayerData = allPlayers?.[playerKey];
      
      starters[side] = {
        player_id: starterId,
        full_name: playerData.person?.fullName,
        throws: playerData.pitchHand?.code || fullPlayerData?.pitchHand?.code || null,
        // Stats from this game
        stats: playerData.stats?.pitching || null
      };
    }
  }
  
  return starters;
}

/**
 * Extract boxscore stats for all players
 */
function extractBoxscoreStats(liveData, boxscore) {
  const stats = {
    home: { batters: [], pitchers: [] },
    away: { batters: [], pitchers: [] }
  };
  
  const boxscoreData = boxscore || liveData?.boxscore;
  if (!boxscoreData) return stats;
  
  for (const side of ['home', 'away']) {
    const teamData = boxscoreData.teams?.[side];
    if (!teamData) continue;
    
    // Batters
    for (const batterId of (teamData.batters || [])) {
      const playerKey = `ID${batterId}`;
      const playerData = teamData.players?.[playerKey];
      
      if (playerData?.stats?.batting) {
        const batting = playerData.stats.batting;
        stats[side].batters.push({
          player_id: batterId,
          full_name: playerData.person?.fullName,
          position: playerData.position?.abbreviation,
          batting_order: playerData.battingOrder,
          // Stats
          ab: batting.atBats || 0,
          r: batting.runs || 0,
          h: batting.hits || 0,
          doubles: batting.doubles || 0,
          triples: batting.triples || 0,
          hr: batting.homeRuns || 0,
          rbi: batting.rbi || 0,
          bb: batting.baseOnBalls || 0,
          k: batting.strikeOuts || 0,
          sb: batting.stolenBases || 0,
          cs: batting.caughtStealing || 0,
          hbp: batting.hitByPitch || 0,
          sf: batting.sacFlies || 0,
          // Plate appearances (computed if not provided)
          pa: batting.plateAppearances || 
              (batting.atBats || 0) + (batting.baseOnBalls || 0) + 
              (batting.hitByPitch || 0) + (batting.sacFlies || 0) + (batting.sacBunts || 0)
        });
      }
    }
    
    // Pitchers
    for (const pitcherId of (teamData.pitchers || [])) {
      const playerKey = `ID${pitcherId}`;
      const playerData = teamData.players?.[playerKey];
      
      if (playerData?.stats?.pitching) {
        const pitching = playerData.stats.pitching;
        stats[side].pitchers.push({
          player_id: pitcherId,
          full_name: playerData.person?.fullName,
          // Stats
          ip: pitching.inningsPitched || '0.0',
          h: pitching.hits || 0,
          r: pitching.runs || 0,
          er: pitching.earnedRuns || 0,
          bb: pitching.baseOnBalls || 0,
          k: pitching.strikeOuts || 0,
          hr: pitching.homeRuns || 0,
          pitches: pitching.pitchesThrown || pitching.numberOfPitches || 0,
          strikes: pitching.strikes || 0,
          bf: pitching.battersFaced || 0,
          // Outs recorded (computed from IP)
          outs_recorded: parseInningsPitched(pitching.inningsPitched)
        });
      }
    }
  }
  
  return stats;
}

/**
 * Parse innings pitched string to outs
 * "6.2" means 6 innings + 2 outs = 20 outs
 */
function parseInningsPitched(ip) {
  if (!ip) return 0;
  const str = String(ip);
  const parts = str.split('.');
  const fullInnings = parseInt(parts[0]) || 0;
  const partialOuts = parseInt(parts[1]) || 0;
  return (fullInnings * 3) + partialOuts;
}

/**
 * Extract linescore (runs per inning)
 */
function extractLinescore(liveData) {
  const linescore = liveData?.linescore;
  if (!linescore) return null;
  
  return {
    currentInning: linescore.currentInning,
    isTopInning: linescore.isTopInning,
    innings: (linescore.innings || []).map(inn => ({
      num: inn.num,
      home_runs: inn.home?.runs ?? null,
      away_runs: inn.away?.runs ?? null,
      home_hits: inn.home?.hits ?? null,
      away_hits: inn.away?.hits ?? null
    })),
    totals: {
      home: {
        runs: linescore.teams?.home?.runs || 0,
        hits: linescore.teams?.home?.hits || 0,
        errors: linescore.teams?.home?.errors || 0
      },
      away: {
        runs: linescore.teams?.away?.runs || 0,
        hits: linescore.teams?.away?.hits || 0,
        errors: linescore.teams?.away?.errors || 0
      }
    }
  };
}

/**
 * Extract player metadata (handedness, etc.)
 */
function extractPlayerMetadata(players) {
  if (!players) return {};
  
  const metadata = {};
  for (const [key, player] of Object.entries(players)) {
    const playerId = player.id;
    metadata[playerId] = {
      id: playerId,
      full_name: player.fullName,
      first_name: player.firstName,
      last_name: player.lastName,
      primary_number: player.primaryNumber,
      birth_date: player.birthDate,
      birth_city: player.birthCity,
      birth_country: player.birthCountry,
      height: player.height,
      weight: player.weight,
      primary_position: player.primaryPosition?.abbreviation,
      bats: player.batSide?.code,
      throws: player.pitchHand?.code,
      mlb_debut: player.mlbDebutDate,
      active: player.active
    };
  }
  
  return metadata;
}

// ============================================================================
// FILE OPERATIONS
// ============================================================================

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function gameFileExists(year, gamePk) {
  const filePath = path.join(CONFIG.RAW_DIR, String(year), `${gamePk}.json`);
  return fs.existsSync(filePath);
}

function saveGameData(year, gamePk, data) {
  const yearDir = path.join(CONFIG.RAW_DIR, String(year));
  ensureDir(yearDir);
  
  const filePath = path.join(yearDir, `${gamePk}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function saveCollectionLog(year, results) {
  const logDir = path.join(PROJECT_ROOT, 'data', 'mlb_research', 'qa');
  ensureDir(logDir);
  
  const logPath = path.join(logDir, `collection_log_${year}.json`);
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
}

// ============================================================================
// MAIN COLLECTION LOGIC
// ============================================================================

async function collectYear(year, options = {}) {
  const { resume = false, dryRun = false, batch = null } = options;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📥 Collecting ${year} season`);
  console.log(`${'='.repeat(60)}`);
  
  // Get schedule
  const schedule = await getSeasonSchedule(year);
  
  if (schedule.length === 0) {
    console.log(`⚠️  No games found for ${year}`);
    return { year, total: 0, processed: 0, skipped: 0, errors: [] };
  }
  
  // Filter to games we need to collect
  let gamesToCollect = schedule;
  if (resume) {
    gamesToCollect = schedule.filter(g => !gameFileExists(year, g.game_pk));
    console.log(`📂 Resume mode: ${schedule.length - gamesToCollect.length} already collected`);
  }
  
  if (batch) {
    gamesToCollect = gamesToCollect.slice(0, batch);
    console.log(`🔢 Batch mode: collecting ${batch} games`);
  }
  
  if (gamesToCollect.length === 0) {
    console.log(`✅ All ${year} games already collected!`);
    return { year, total: schedule.length, processed: 0, skipped: schedule.length, errors: [] };
  }
  
  if (dryRun) {
    console.log(`\n🔍 DRY RUN: Would collect ${gamesToCollect.length} games`);
    gamesToCollect.slice(0, 5).forEach(g => {
      console.log(`   - ${g.game_pk}: ${g.away_team} @ ${g.home_team} (${g.game_date})`);
    });
    if (gamesToCollect.length > 5) {
      console.log(`   ... and ${gamesToCollect.length - 5} more`);
    }
    return { year, total: schedule.length, processed: 0, skipped: 0, errors: [], dryRun: true };
  }
  
  // Collect games
  const tracker = new ProgressTracker(`${year} games`, gamesToCollect.length);
  
  for (const game of gamesToCollect) {
    try {
      // Fetch game feed
      const gameFeed = await getGameFeed(game.game_pk);
      
      if (!gameFeed) {
        tracker.skip(game.game_pk, 'not found');
        continue;
      }
      
      // Also fetch boxscore as backup
      const boxscore = await getBoxscore(game.game_pk);
      
      // Extract structured data
      const extracted = extractGameData(gameFeed, boxscore);
      
      // Save to file
      saveGameData(year, game.game_pk, extracted);
      
      tracker.increment(game.game_pk);
      
      // Rate limiting
      await sleep(CONFIG.REQUEST_DELAY_MS);
      
    } catch (error) {
      tracker.error(game.game_pk, error);
      await sleep(CONFIG.RETRY_DELAY_MS);
    }
  }
  
  const results = tracker.complete();
  results.year = year;
  
  // Save collection log
  saveCollectionLog(year, results);
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  const options = {
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    batch: null,
    years: CONFIG.YEARS
  };
  
  // Check for --year flag
  const yearIndex = args.indexOf('--year');
  if (yearIndex !== -1 && args[yearIndex + 1]) {
    const year = parseInt(args[yearIndex + 1]);
    if (year >= 2021 && year <= 2025) {
      options.years = [year];
    }
  }
  
  // Check for --batch flag
  const batchIndex = args.indexOf('--batch');
  if (batchIndex !== -1 && args[batchIndex + 1]) {
    options.batch = parseInt(args[batchIndex + 1]);
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║         MLB Research V1.1 - Full Game Feed Collector         ║
╠══════════════════════════════════════════════════════════════╣
║  Years: ${options.years.join(', ').padEnd(51)}║
║  Resume: ${options.resume ? 'Yes' : 'No '.padEnd(50)}║
║  Dry Run: ${options.dryRun ? 'Yes' : 'No '.padEnd(49)}║
║  Batch: ${options.batch ? String(options.batch).padEnd(51) : 'All'.padEnd(51)}║
╚══════════════════════════════════════════════════════════════╝
`);
  
  // Ensure output directory exists
  ensureDir(CONFIG.RAW_DIR);
  
  const allResults = [];
  
  for (const year of options.years) {
    const results = await collectYear(year, options);
    allResults.push(results);
  }
  
  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 COLLECTION SUMMARY`);
  console.log(`${'='.repeat(60)}`);
  
  let totalGames = 0;
  let totalProcessed = 0;
  let totalErrors = 0;
  
  for (const r of allResults) {
    console.log(`\n${r.year}:`);
    console.log(`   Total games: ${r.total}`);
    console.log(`   Processed: ${r.processed}`);
    console.log(`   Skipped: ${r.skipped}`);
    console.log(`   Errors: ${r.errors?.length || 0}`);
    
    totalGames += r.total || 0;
    totalProcessed += r.processed || 0;
    totalErrors += r.errors?.length || 0;
  }
  
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`TOTAL: ${totalProcessed} games processed, ${totalErrors} errors`);
  console.log(`\n✅ Data saved to: ${CONFIG.RAW_DIR}`);
}

// Run
main().catch(console.error);
