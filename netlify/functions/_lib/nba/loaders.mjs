/**
 * NBA Data Loaders - Elite Pipeline V2
 * 
 * Uses batched stats.nba.com leaguedashteamstats for L5/L10/L20 windows
 * ESPN for schedule, in-memory team data (no filesystem reads in serverless)
 * Implements proper headers, rate limiting, and fallback strategies
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// API base URLs
const NBA_STATS_BASE = 'https://stats.nba.com/stats';
const NBA_CDN_BASE = 'https://cdn.nba.com/static/json/liveData';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// Headers for stats.nba.com (CRITICAL - required for access)
const NBA_STATS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': 'https://www.nba.com',
  'Referer': 'https://www.nba.com/',
  'Connection': 'keep-alive',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

// Simple headers for CDN
const NBA_CDN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json'
};

// ESPN abbreviation normalization (GS→GSW, SA→SAS, etc.)
const ESPN_TO_NBA_ABBR = {
  'GS': 'GSW',
  'SA': 'SAS', 
  'NO': 'NOP',
  'NY': 'NYK',
  'PHO': 'PHX',
  'UTAH': 'UTA'
};

/**
 * Normalize ESPN abbreviation to NBA standard
 */
function normalizeAbbr(abbr) {
  return ESPN_TO_NBA_ABBR[abbr] || abbr;
}

// In-memory team data (30 teams) - avoids fs.readFile in serverless
const NBA_TEAMS = [
  { id: 1610612737, abbreviation: 'ATL', name: 'Atlanta Hawks' },
  { id: 1610612738, abbreviation: 'BOS', name: 'Boston Celtics' },
  { id: 1610612751, abbreviation: 'BKN', name: 'Brooklyn Nets' },
  { id: 1610612766, abbreviation: 'CHA', name: 'Charlotte Hornets' },
  { id: 1610612741, abbreviation: 'CHI', name: 'Chicago Bulls' },
  { id: 1610612739, abbreviation: 'CLE', name: 'Cleveland Cavaliers' },
  { id: 1610612742, abbreviation: 'DAL', name: 'Dallas Mavericks' },
  { id: 1610612743, abbreviation: 'DEN', name: 'Denver Nuggets' },
  { id: 1610612765, abbreviation: 'DET', name: 'Detroit Pistons' },
  { id: 1610612744, abbreviation: 'GSW', name: 'Golden State Warriors' },
  { id: 1610612745, abbreviation: 'HOU', name: 'Houston Rockets' },
  { id: 1610612754, abbreviation: 'IND', name: 'Indiana Pacers' },
  { id: 1610612746, abbreviation: 'LAC', name: 'LA Clippers' },
  { id: 1610612747, abbreviation: 'LAL', name: 'Los Angeles Lakers' },
  { id: 1610612763, abbreviation: 'MEM', name: 'Memphis Grizzlies' },
  { id: 1610612748, abbreviation: 'MIA', name: 'Miami Heat' },
  { id: 1610612749, abbreviation: 'MIL', name: 'Milwaukee Bucks' },
  { id: 1610612750, abbreviation: 'MIN', name: 'Minnesota Timberwolves' },
  { id: 1610612740, abbreviation: 'NOP', name: 'New Orleans Pelicans' },
  { id: 1610612752, abbreviation: 'NYK', name: 'New York Knicks' },
  { id: 1610612760, abbreviation: 'OKC', name: 'Oklahoma City Thunder' },
  { id: 1610612753, abbreviation: 'ORL', name: 'Orlando Magic' },
  { id: 1610612755, abbreviation: 'PHI', name: 'Philadelphia 76ers' },
  { id: 1610612756, abbreviation: 'PHX', name: 'Phoenix Suns' },
  { id: 1610612757, abbreviation: 'POR', name: 'Portland Trail Blazers' },
  { id: 1610612758, abbreviation: 'SAC', name: 'Sacramento Kings' },
  { id: 1610612759, abbreviation: 'SAS', name: 'San Antonio Spurs' },
  { id: 1610612761, abbreviation: 'TOR', name: 'Toronto Raptors' },
  { id: 1610612762, abbreviation: 'UTA', name: 'Utah Jazz' },
  { id: 1610612764, abbreviation: 'WAS', name: 'Washington Wizards' }
];


/**
 * Load team information (in-memory, no filesystem reads)
 */
export function loadTeamInfo() {
  try {
    // Build lookup maps
    const byAbbr = {};
    const byId = {};
    const byName = {};
    
    for (const team of NBA_TEAMS) {
      byAbbr[team.abbreviation] = team;
      byId[team.id] = team;
      byName[team.name] = team;
      // Also add lowercase variants for fuzzy matching
      byName[team.name.toLowerCase()] = team;
    }
    
    console.log(`[NBA] ✅ Loaded ${NBA_TEAMS.length} teams (in-memory)`);
    
    return { teams: NBA_TEAMS, byAbbr, byId, byName };
  } catch (error) {
    console.error('[NBA] Error loading team info:', error);
    return { teams: [], byAbbr: {}, byId: {}, byName: {} };
  }
}

/**
 * Fetch today's games from ESPN
 */
export async function fetchTodaysGames(date = null) {
  try {
    // Format: YYYYMMDD
    const dateStr = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `${ESPN_BASE}/scoreboard?dates=${dateStr}`;
    
    console.log('[NBA] Fetching games for:', dateStr);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const games = (data.events || []).map(event => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      return {
        id: event.id,
        date: event.date,
        name: event.name,
        shortName: event.shortName,
        status: competition.status.type.name,
        homeTeam: {
          id: homeTeam.team.id,
          name: homeTeam.team.displayName,
          abbreviation: normalizeAbbr(homeTeam.team.abbreviation),  // Normalize ESPN abbr
          score: parseInt(homeTeam.score) || 0,
          record: homeTeam.records?.[0]?.summary || '0-0'
        },
        awayTeam: {
          id: awayTeam.team.id,
          name: awayTeam.team.displayName,
          abbreviation: normalizeAbbr(awayTeam.team.abbreviation),  // Normalize ESPN abbr
          score: parseInt(awayTeam.score) || 0,
          record: awayTeam.records?.[0]?.summary || '0-0'
        },
        venue: competition.venue?.fullName || 'Unknown',
        broadcasts: competition.broadcasts?.map(b => b.names[0]) || []
      };
    });
    
    console.log(`[NBA] ✅ Loaded ${games.length} games`);
    
    return games;
    
  } catch (error) {
    console.error('[NBA] Error fetching games:', error);
    return [];
  }
}

/**
 * Fetch league-wide stats for a specific window (L5, L10, L20)
 * Uses stats.nba.com leaguedashteamstats with LastNGames parameter
 * Returns map keyed by TeamID for fast lookups
 * 
 * @param {string} measureType - 'Advanced' or 'Four Factors'
 * @param {number} lastN - 5, 10, or 20
 * @param {string} season - '2025-26'
 * @returns {Promise<Map<number, object>>} - Map of teamId → stats
 */
export async function fetchLeagueWindow(measureType = 'Advanced', lastN = 10, season = '2025-26') {
  try {
    const params = new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      MeasureType: measureType,
      PerMode: 'PerGame',
      LastNGames: lastN.toString(),
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE}/leaguedashteamstats?${params}`;
    
    console.log(`[NBA] Fetching league-wide ${measureType} (L${lastN})...`);
    
    const response = await rateLimitedFetch(url, { headers: NBA_STATS_HEADERS });
    
    if (!response.ok) {
      console.error(`[NBA] API error for ${measureType} L${lastN}:`, response.status, response.statusText);
      return new Map();
    }
    
    const data = await response.json();
    
    // Parse result set
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    const statsMap = new Map();
    
    for (const row of rows) {
      const stats = {};
      headers.forEach((header, i) => {
        stats[header] = row[i];
      });
      
      // Key by TEAM_ID for fast lookups
      if (stats.TEAM_ID) {
        statsMap.set(stats.TEAM_ID, stats);
      }
    }
    
    console.log(`[NBA] ✅ Loaded ${statsMap.size} teams (${measureType} L${lastN})`);
    
    return statsMap;
    
  } catch (error) {
    console.error(`[NBA] Error fetching league window (${measureType} L${lastN}):`, error);
    return new Map();
  }
}

/**
 * Fetch all league-wide windows in parallel (6 API calls total)
 * Returns organized by team ID with all windows available
 * 
 * @param {string} season - '2025-26'
 * @returns {Promise<Map<number, {advanced: {l5, l10, l20}, fourFactors: {l5, l10, l20}}>>}
 */
export async function fetchAllLeagueWindows(season = '2025-26') {
  try {
    console.log('[NBA] 📊 Fetching all league-wide windows (6 calls)...');
    
    // Fetch all 6 windows in parallel
    const [
      advL5, advL10, advL20,
      ffL5, ffL10, ffL20
    ] = await Promise.all([
      fetchLeagueWindow('Advanced', 5, season),
      fetchLeagueWindow('Advanced', 10, season),
      fetchLeagueWindow('Advanced', 20, season),
      fetchLeagueWindow('Four Factors', 5, season),
      fetchLeagueWindow('Four Factors', 10, season),
      fetchLeagueWindow('Four Factors', 20, season)
    ]);
    
    // Organize by team ID
    const teamWindows = new Map();
    
    for (const team of NBA_TEAMS) {
      const teamId = team.id;
      
      teamWindows.set(teamId, {
        advanced: {
          l5: advL5.get(teamId) || null,
          l10: advL10.get(teamId) || null,
          l20: advL20.get(teamId) || null
        },
        fourFactors: {
          l5: ffL5.get(teamId) || null,
          l10: ffL10.get(teamId) || null,
          l20: ffL20.get(teamId) || null
        }
      });
    }
    
    console.log(`[NBA] ✅ Organized windows for ${teamWindows.size} teams`);
    
    return teamWindows;
    
  } catch (error) {
    console.error('[NBA] Error fetching all league windows:', error);
    return new Map();
  }
}

/**
 * Convert raw API stats to our model format
 * Combines Advanced and Four Factors into unified stats object
 * 
 * @param {object} advanced - Advanced stats from API
 * @param {object} fourFactors - Four Factors stats from API  
 * @returns {object} - Unified stats matching our model interface
 */
function convertToModelStats(advanced, fourFactors) {
  if (!advanced && !fourFactors) {
    return null;
  }
  
  // Get games played (should be same in both)
  const games = advanced?.GP || fourFactors?.GP || 0;
  const wins = advanced?.W || fourFactors?.W || 0;
  const losses = advanced?.L || fourFactors?.L || 0;
  
  // Extract stats from Advanced
  const pace = advanced?.PACE || 100;
  const offRtg = advanced?.OFF_RATING || 114.5;
  const defRtg = advanced?.DEF_RATING || 114.5;
  const netRtg = advanced?.NET_RATING || 0;
  
  // Extract stats from Four Factors
  const efg = fourFactors?.EFG_PCT || 0.535;
  const tovPct = fourFactors?.TM_TOV_PCT || 0.138;
  const orbPct = fourFactors?.OREB_PCT || 0.25;
  const ftFga = fourFactors?.FTA_RATE || 0.22;
  
  // Calculate additional stats
  const winPct = games > 0 ? wins / games : 0.5;
  
  // True shooting (approximate if not in API)
  const ts = advanced?.TS_PCT || 0.575;
  
  // Base shooting stats (if available)
  const fgPct = fourFactors?.FG_PCT || 0.47;
  const fg3Pct = fourFactors?.FG3_PCT || 0.36;
  const ftPct = fourFactors?.FT_PCT || 0.78;
  
  return {
    games,
    wins,
    losses,
    winPct,
    pace,
    offRtg,
    defRtg,
    netRtg,
    efg,
    ts,
    tovPct,
    orbPct,
    ftFga,
    fgPct,
    fg3Pct,
    ftPct,
    rebounds: 0,  // Not critical for model
    assists: 0,
    turnovers: 0
  };
}

/**
 * Fetch team's last N games stats (DEPRECATED - use fetchTeamRollingStats instead)
 * Kept for backwards compatibility
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  console.log(`[NBA] ⚠️  fetchTeamLastGames is deprecated - use fetchAllLeagueWindows for better performance`);
  return null;
}

/**
 * Fetch team's rolling window stats (L5, L10, L20)
 * NOW USES LEAGUE-WIDE BATCH CALLS (6 API calls for all 30 teams)
 * Much more efficient than per-team fetching
 * 
 * @param {number} teamId - NBA team ID
 * @param {string} season - '2025-26'
 * @param {Map} leagueWindows - Pre-fetched league windows (optional, for efficiency)
 * @returns {Promise<{l5, l10, l20}>}
 */
export async function fetchTeamRollingStats(teamId, season = '2025-26', leagueWindows = null) {
  try {
    // If league windows not provided, fetch them (inefficient for multiple teams)
    const windows = leagueWindows || await fetchAllLeagueWindows(season);
    
    const teamData = windows.get(teamId);
    
    if (!teamData) {
      console.error(`[NBA] ❌ No data found for team ${teamId}`);
      return { l5: null, l10: null, l20: null };
    }
    
    // Merge Advanced + Four Factors for each window
    const l5 = convertToModelStats(teamData.advanced.l5, teamData.fourFactors.l5);
    const l10 = convertToModelStats(teamData.advanced.l10, teamData.fourFactors.l10);
    const l20 = convertToModelStats(teamData.advanced.l20, teamData.fourFactors.l20);
    
    // Log games to verify data
    if (l10) {
      console.log(`[NBA] Team ${teamId} L10: ${l10.games} games, OffRtg=${l10.offRtg.toFixed(1)}, DefRtg=${l10.defRtg.toFixed(1)}`);
    }
    
    return { l5, l10, l20 };
    
  } catch (error) {
    console.error(`[NBA] Error fetching rolling stats for team ${teamId}:`, error);
    return { l5: null, l10: null, l20: null };
  }
}

/**
 * Fetch injuries from ESPN
 */
export async function fetchInjuries() {
  try {
    console.log('[NBA] Fetching injuries (using ESPN injury report)');
    
    // ESPN injury endpoint
    const url = `${ESPN_BASE}/injuries`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log('[NBA] Injuries endpoint unavailable');
      return [];
    }
    
    const data = await response.json();
    
    // Parse injury data
    // TODO: Implement full parser when needed
    
    return [];
    
  } catch (error) {
    console.error('[NBA] Error fetching injuries:', error);
    return [];
  }
}

/**
 * Rate limit helper - prevents hammering stats.nba.com
 * CRITICAL: stats.nba.com will block if requests too frequent
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 600; // 600ms between requests

export async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`[NBA] Rate limiting: waiting ${waitTime}ms...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  return fetch(url, options);
}
