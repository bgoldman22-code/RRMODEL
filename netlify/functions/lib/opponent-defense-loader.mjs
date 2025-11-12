/**
 * Real-Time Opponent Defense Data Loader
 * 
 * Fetches opponent defensive stats from NBA Stats API and caches locally
 * Updates automatically during each prediction run if data is stale
 * 
 * Features:
 * - In-memory caching with TTL
 * - Automatic refresh if >24h old
 * - Exponential backoff on failures
 * - Saves to Netlify Blobs for persistence
 * - Fallback to last known good data
 * 
 * Updated: November 12, 2025
 */

import { getStore } from '@netlify/blobs';
import fetch from 'node-fetch';
import { normalizeTeamName } from './team-mapper.mjs';

const OPPONENT_DEFENSE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const NBA_STATS_BASE_URL = 'https://stats.nba.com/stats';
const RETRY_DELAYS = [2000, 4000, 8000]; // Exponential backoff

// In-memory cache
let cachedData = null;
let cacheTimestamp = null;

// NBA Stats API requires User-Agent to avoid 403
const NBA_STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'Connection': 'keep-alive'
};

/**
 * Fetch opponent defensive stats from NBA Stats API
 * Uses leaguedashteamstats endpoint with defensive measures
 */
async function fetchFromNBAStatsAPI(retryCount = 0) {
  try {
    console.log('📊 Fetching opponent defense from NBA Stats API...');
    
    // Current season (2025-26)
    const season = '2025-26';
    
    // Build URL for team defensive stats
    const params = new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      MeasureType: 'Opponent',
      PerMode: 'Per100Possessions',
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE_URL}/leaguedashteamstats?${params.toString()}`;
    
    const response = await fetch(url, {
      headers: NBA_STATS_HEADERS,
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`NBA Stats API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.resultSets || data.resultSets.length === 0) {
      throw new Error('No data in NBA Stats API response');
    }
    
    const resultSet = data.resultSets[0];
    const headers = resultSet.headers;
    const rows = resultSet.rowSet;
    
    // Find column indices
    const teamIdIdx = headers.indexOf('TEAM_ID');
    const teamNameIdx = headers.indexOf('TEAM_NAME');
    const defRatingIdx = headers.indexOf('DEF_RATING');
    const oppPtsIdx = headers.indexOf('OPP_PTS');
    const oppFgPctIdx = headers.indexOf('OPP_FG_PCT');
    const oppFg3PctIdx = headers.indexOf('OPP_FG3_PCT');
    const oppRebIdx = headers.indexOf('OPP_REB');
    const oppAstIdx = headers.indexOf('OPP_AST');
    const paceIdx = headers.indexOf('PACE');
    
    // Parse data
    const teams = rows.map(row => {
      const teamName = row[teamNameIdx];
      const tricode = normalizeTeamName(teamName);
      
      return {
        teamId: row[teamIdIdx],
        team: tricode || teamName,
        defRating: parseFloat(row[defRatingIdx]) || 110.0,
        rebsAllowedPer100: parseFloat(row[oppRebIdx]) || 52.0,
        astsAllowedPer100: parseFloat(row[oppAstIdx]) || 25.0,
        pace: parseFloat(row[paceIdx]) || 99.5,
        oppPtsPer100: parseFloat(row[oppPtsIdx]) || 110.0,
        oppFgPct: parseFloat(row[oppFgPctIdx]) || 0.46,
        oppFg3Pct: parseFloat(row[oppFg3PctIdx]) || 0.36,
        lastUpdated: new Date().toISOString()
      };
    });
    
    // Validate - should have 30 teams
    if (teams.length < 25) {
      throw new Error(`Only got ${teams.length} teams (expected 30)`);
    }
    
    console.log(`   ✅ Fetched opponent defense for ${teams.length} teams`);
    return teams;
    
  } catch (err) {
    console.log(`   ❌ NBA Stats API error: ${err.message}`);
    
    // Retry with exponential backoff
    if (retryCount < RETRY_DELAYS.length) {
      const delay = RETRY_DELAYS[retryCount];
      console.log(`   ⏳ Retrying in ${delay / 1000}s... (attempt ${retryCount + 1}/${RETRY_DELAYS.length})`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchFromNBAStatsAPI(retryCount + 1);
    }
    
    throw err;
  }
}

/**
 * Calculate opponent defense from boxscores (fallback method)
 * Uses recent boxscore data to estimate defensive metrics
 */
function calculateFromBoxscores(boxscores) {
  console.log('📊 Calculating opponent defense from boxscores (fallback method)...');
  
  const teamStats = {};
  
  // Group by opponent team
  for (const game of boxscores) {
    const oppTeam = game.opponentTricode;
    
    if (!teamStats[oppTeam]) {
      teamStats[oppTeam] = {
        games: 0,
        totalPoints: 0,
        totalRebs: 0,
        totalAsts: 0,
        totalPoss: 0
      };
    }
    
    // Aggregate stats (these are what the opponent SCORED, which is what team ALLOWED)
    teamStats[oppTeam].games += 1;
    teamStats[oppTeam].totalPoints += game.points || 0;
    teamStats[oppTeam].totalRebs += game.rebounds || 0;
    teamStats[oppTeam].totalAsts += game.assists || 0;
    
    // Estimate possessions from minutes (rough estimate)
    const poss = (game.minutes || 0) * 1.2; // ~1.2 possessions per minute on court
    teamStats[oppTeam].totalPoss += poss;
  }
  
  // Convert to per-100 possessions
  const teams = [];
  for (const [team, stats] of Object.entries(teamStats)) {
    if (stats.games < 5) continue; // Need at least 5 games
    
    const possPerGame = stats.totalPoss / stats.games;
    const factor = possPerGame > 0 ? (100 / possPerGame) : 1;
    
    teams.push({
      teamId: null,
      team,
      defRating: (stats.totalPoints / stats.games) * factor,
      rebsAllowedPer100: (stats.totalRebs / stats.games) * factor,
      astsAllowedPer100: (stats.totalAsts / stats.games) * factor,
      pace: possPerGame,
      oppPtsPer100: (stats.totalPoints / stats.games) * factor,
      oppFgPct: null,
      oppFg3Pct: null,
      lastUpdated: new Date().toISOString(),
      source: 'calculated-from-boxscores'
    });
  }
  
  console.log(`   ✅ Calculated opponent defense for ${teams.length} teams from boxscores`);
  return teams;
}

/**
 * Load from Netlify Blobs cache
 */
async function loadFromBlobs() {
  try {
    const store = getStore('nba-data');
    const blob = await store.get('opponent-defense-current', { type: 'json' });
    
    if (!blob || !blob.teams) {
      return null;
    }
    
    const age = Date.now() - new Date(blob.lastUpdated).getTime();
    const ageHours = Math.round(age / 3600000);
    
    console.log(`   📦 Loaded opponent defense from Blobs (${blob.teams.length} teams, ${ageHours}h old)`);
    
    return {
      teams: blob.teams,
      lastUpdated: blob.lastUpdated,
      age
    };
    
  } catch (err) {
    console.log(`   ❌ Could not load from Blobs: ${err.message}`);
    return null;
  }
}

/**
 * Save to Netlify Blobs cache
 */
async function saveToBlobs(teams) {
  try {
    const store = getStore('nba-data');
    const payload = {
      teams,
      lastUpdated: new Date().toISOString(),
      source: 'nba-stats-api',
      teamCount: teams.length
    };
    
    await store.set('opponent-defense-current', JSON.stringify(payload));
    console.log(`   ✅ Saved opponent defense to Blobs (${teams.length} teams)`);
    
  } catch (err) {
    console.log(`   ⚠️  Could not save to Blobs: ${err.message}`);
  }
}

/**
 * Get opponent defense data with auto-refresh
 * @param {Array} boxscores - Optional boxscores for fallback calculation
 * @param {boolean} forceRefresh - Force fetch from API even if cached
 * @returns {Map<string, Object>} - Map of team tricode to defensive stats
 */
export async function getOpponentDefense(boxscores = null, forceRefresh = false) {
  // Check in-memory cache first
  if (!forceRefresh && cachedData && cacheTimestamp) {
    const age = Date.now() - cacheTimestamp;
    if (age < OPPONENT_DEFENSE_TTL_MS) {
      console.log(`✅ Using cached opponent defense (${Math.round(age / 3600000)}h old)`);
      return cachedData;
    } else {
      console.log(`⚠️  Cached opponent defense expired (${Math.round(age / 3600000)}h old), refreshing...`);
    }
  }
  
  let teams = null;
  let source = 'unknown';
  
  // Try 1: Fetch from NBA Stats API
  try {
    teams = await fetchFromNBAStatsAPI();
    source = 'nba-stats-api';
    
    // Save to Blobs for next time
    await saveToBlobs(teams);
    
  } catch (err) {
    console.log(`⚠️  NBA Stats API failed: ${err.message}`);
    
    // Try 2: Load from Blobs cache
    const blobData = await loadFromBlobs();
    if (blobData && blobData.age < OPPONENT_DEFENSE_TTL_MS * 2) { // Allow 48h old from Blobs
      teams = blobData.teams;
      source = 'blobs-cache';
    } else {
      // Try 3: Calculate from boxscores (if provided)
      if (boxscores && boxscores.length > 0) {
        teams = calculateFromBoxscores(boxscores);
        source = 'calculated-from-boxscores';
        
        // Save to Blobs
        await saveToBlobs(teams);
      } else {
        // Try 4: Use very stale Blobs data if available
        if (blobData) {
          console.log(`⚠️  Using stale opponent defense data (${Math.round(blobData.age / 3600000)}h old)`);
          teams = blobData.teams;
          source = 'blobs-cache-stale';
        } else {
          console.warn('⚠️  No opponent defense data available, using league averages');
          teams = [];
          source = 'league-averages';
        }
      }
    }
  }
  
  // Build Map for fast lookup
  const defenseMap = new Map();
  
  for (const team of teams) {
    const tricode = normalizeTeamName(team.team);
    if (tricode) {
      defenseMap.set(tricode, {
        defRating: team.defRating,
        rebsAllowedPer100: team.rebsAllowedPer100,
        astsAllowedPer100: team.astsAllowedPer100,
        pace: team.pace,
        oppPtsPer100: team.oppPtsPer100,
        oppFgPct: team.oppFgPct,
        oppFg3Pct: team.oppFg3Pct
      });
    }
  }
  
  // Update in-memory cache
  cachedData = defenseMap;
  cacheTimestamp = Date.now();
  
  console.log(`✅ Opponent defense ready: ${defenseMap.size} teams (source: ${source})`);
  
  return defenseMap;
}

/**
 * Get league average defensive stats (fallback when no data available)
 */
export function getLeagueAverages() {
  return {
    defRating: 113.5,
    rebsAllowedPer100: 52.0,
    astsAllowedPer100: 25.0,
    pace: 99.5,
    oppPtsPer100: 113.5,
    oppFgPct: 0.466,
    oppFg3Pct: 0.362
  };
}

/**
 * Clear cache (for testing or force refresh)
 */
export function clearCache() {
  cachedData = null;
  cacheTimestamp = null;
  console.log('🗑️  Cleared opponent defense cache');
}

export default {
  getOpponentDefense,
  getLeagueAverages,
  clearCache
};
