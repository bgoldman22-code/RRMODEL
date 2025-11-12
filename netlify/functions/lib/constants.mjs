/**
 * NBA Player Props Constants & Configuration
 * All timing budgets, thresholds, and feature flags
 * 
 * Updated: November 12, 2025
 * Optimized for <50s execution with operational guardrails
 */

// ============================================================================
// TIME BUDGETS (strict enforcement)
// ============================================================================

export const BUDGETS = {
  GLOBAL: 50_000,        // 50s total function runtime (leave 10s buffer before 60s timeout)
  ACQUIRE: 30_000,       // 30s data acquisition (HARD STOP)
  TRANSFORM: 10_000,     // 10s stats calculation
  MERGE: 10_000          // 10s prediction generation + save
};

// ============================================================================
// BLOB TTL (game-day aware)
// ============================================================================

export const TTL = {
  GAME_DAY_MS: 6 * 60 * 60 * 1000,   // 6h on game days (games within 8h)
  OFF_DAY_MS: 12 * 60 * 60 * 1000,   // 12h on off days
  FORCE_FRESH_HOURS: 4                // Force fresh if <4h to first tip
};

// ============================================================================
// FETCH SETTINGS (concurrent with timeouts)
// ============================================================================

export const FETCH = {
  CONCURRENCY: 6,                     // Parallel requests (Node 20 handles this well)
  PER_REQ_TIMEOUT_MS: 6_000,          // 6s per request (generous for API latency)
  RATE_LIMIT_MS: 300,                 // 300ms between batches (not per-request)
  MAX_RETRIES: 2,                     // Per-request retry limit
  ESPN_TIMEOUT_MS: 30_000,            // 30s total for ESPN (matches ACQUIRE budget)
  NBA_CDN_TIMEOUT_MS: 15_000          // 15s for NBA CDN (faster than ESPN)
};

// ============================================================================
// SANITY CHECKS (data quality gates)
// ============================================================================

export const SANITY = {
  MIN_RECORD_COUNT_RATIO: 0.65,      // 65% of 7-day median (reject if too low)
  ROLLING_HISTORY_DAYS: 7,           // Track last 7 days for median calculation
  MIN_GAMES_PER_TEAM: 5,             // Minimum games needed for L5 stats
  TARGET_GAMES_PER_TEAM: 10,         // Target for L10 stats (stop fetching when satisfied)
  MAX_LOOKBACK_DAYS: 20              // Safety limit (never fetch more than 20 days)
};

// ============================================================================
// BLOB SCHEMA VERSION
// ============================================================================

export const BLOB_SCHEMA_VERSION = 2;

/**
 * Schema v2 includes:
 * - schema: version number
 * - lastUpdated: ISO timestamp
 * - source: 'espn' | 'cdn' | 'hybrid'
 * - teamSet: array of tricodes
 * - gamesSpanDays: calendar days covered
 * - recordCount: total player-game records
 * - boxscores: array of player-game objects
 */

// ============================================================================
// FEATURE FLAGS (env var driven)
// ============================================================================

export const FEATURE_FLAGS = {
  // Force ESPN (bypass Blobs) - for incident recovery
  // Set: NBA_PROPS_FORCE_ESPN=1
  FORCE_ESPN: process.env.NBA_PROPS_FORCE_ESPN === '1',
  
  // Enable NBA CDN (Tier 2.5) - default ON
  // Disable: NBA_PROPS_ENABLE_CDN=0
  ENABLE_CDN: process.env.NBA_PROPS_ENABLE_CDN !== '0',
  
  // Enable concurrent fetching - default ON
  // Disable: NBA_PROPS_CONCURRENCY=0
  ENABLE_CONCURRENCY: process.env.NBA_PROPS_CONCURRENCY !== '0',
  
  // Enable team-scoped fetching (not blind 15 days) - default ON
  // Disable: NBA_PROPS_TEAM_SCOPED=0
  ENABLE_TEAM_SCOPED: process.env.NBA_PROPS_TEAM_SCOPED !== '0',
  
  // Warmup secret (for manual cache prime)
  WARMUP_SECRET: process.env.NBA_WARMUP_SECRET || null
};

// ============================================================================
// OPPONENT ADJUSTMENTS (league averages)
// ============================================================================

export const LEAGUE_AVERAGES = {
  REBOUNDS_PER_100: 52.0,            // League avg rebounds allowed per 100 possessions
  ASSISTS_PER_100: 25.0,             // League avg assists allowed per 100 possessions
  PACE: 99.5                         // League avg pace (possessions per game)
};

// ============================================================================
// PREDICTION THRESHOLDS
// ============================================================================

export const THRESHOLDS = {
  EDGE_THRESHOLD: 4.0,               // Minimum edge over book line (%)
  CONFIDENCE_THRESHOLD: 0.60,        // Minimum confidence for picks
  MIN_KELLY: 0.01,                   // Minimum Kelly bet size
  MIN_MINUTES: 15                    // Minimum minutes played to qualify
};

// ============================================================================
// API ENDPOINTS
// ============================================================================

export const ENDPOINTS = {
  ESPN_SCOREBOARD: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard',
  ESPN_SUMMARY: 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary',
  NBA_CDN_SCOREBOARD: 'https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json',
  NBA_CDN_BOXSCORE: 'https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{GAME_ID}.json',
  ODDS_API_BASE: 'https://api.the-odds-api.com/v4'
};

// ============================================================================
// HELPER: Calculate game-day aware TTL
// ============================================================================

/**
 * Calculate TTL based on next game start time
 * @param {Date|number} nextGameStart - Next game start time (Date or timestamp)
 * @returns {number} TTL in milliseconds
 */
export function calculateBlobsTTL(nextGameStart) {
  if (!nextGameStart) {
    return TTL.OFF_DAY_MS; // Default to 12h if no games scheduled
  }
  
  const now = Date.now();
  const gameTime = nextGameStart instanceof Date ? nextGameStart.getTime() : nextGameStart;
  const hoursToTip = (gameTime - now) / (1000 * 60 * 60);
  
  if (hoursToTip < TTL.FORCE_FRESH_HOURS) {
    return 0; // Force fresh if <4h to tip
  } else if (hoursToTip < 8) {
    return TTL.GAME_DAY_MS; // 6h TTL on game days
  } else {
    return TTL.OFF_DAY_MS; // 12h TTL on off days
  }
}

// ============================================================================
// HELPER: Format date for ESPN API
// ============================================================================

/**
 * Format date as YYYYMMDD for ESPN API
 * @param {Date} date - Date object
 * @returns {string} Formatted date string
 */
export function formatESPNDate(date) {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

// ============================================================================
// HELPER: Get date N days ago
// ============================================================================

/**
 * Get date N days ago
 * @param {number} daysBack - Number of days back
 * @returns {Date} Date object
 */
export function daysAgo(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return date;
}

// ============================================================================
// HELPER: Sleep utility
// ============================================================================

/**
 * Sleep for N milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  BUDGETS,
  TTL,
  FETCH,
  SANITY,
  BLOB_SCHEMA_VERSION,
  FEATURE_FLAGS,
  LEAGUE_AVERAGES,
  THRESHOLDS,
  ENDPOINTS,
  calculateBlobsTTL,
  formatESPNDate,
  daysAgo,
  sleep
};
