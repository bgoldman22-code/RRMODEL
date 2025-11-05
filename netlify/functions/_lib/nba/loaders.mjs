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
import { getRegressedPrior } from './team-priors-2024-25.mjs';

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
 * Fetch team's recent games from ESPN schedule
 * Returns array of completed games with IDs
 * 
 * @param {string} espnTeamId - ESPN team ID (1-30)
 * @param {number} limit - Max games to return
 * @returns {Promise<Array>} - Array of game objects
 */
async function fetchTeamSchedule(espnTeamId, limit = 20) {
  try {
    const url = `${ESPN_BASE}/teams/${espnTeamId}/schedule`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`[NBA] ESPN schedule error for team ${espnTeamId}:`, response.status);
      return [];
    }
    
    const data = await response.json();
    const events = data.events || [];
    
    // Filter to completed games only
    const completed = events
      .filter(e => e.competitions?.[0]?.status?.type?.completed === true)
      .slice(-limit); // Get most recent N games
    
    return completed.map(event => {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      return {
        espnId: event.id,
        date: event.date,
        homeTeam: {
          abbr: normalizeAbbr(home.team.abbreviation),
          score: parseInt(home.score?.value || home.score || 0)
        },
        awayTeam: {
          abbr: normalizeAbbr(away.team.abbreviation),
          score: parseInt(away.score?.value || away.score || 0)
        }
      };
    });
    
  } catch (error) {
    console.error(`[NBA] Error fetching schedule for team ${espnTeamId}:`, error);
    return [];
  }
}

/**
 * Map ESPN team ID to NBA team ID
 * ESPN uses different IDs than NBA (1-30 vs 1610612737+)
 */
const ESPN_TO_NBA_TEAM_ID = {
  1: 1610612737,  // ATL
  2: 1610612738,  // BOS
  17: 1610612751, // BKN
  30: 1610612766, // CHA
  4: 1610612741,  // CHI
  5: 1610612739,  // CLE
  6: 1610612742,  // DAL
  7: 1610612743,  // DEN
  8: 1610612765,  // DET
  9: 1610612744,  // GSW
  10: 1610612745, // HOU
  11: 1610612754, // IND
  12: 1610612746, // LAC
  13: 1610612747, // LAL
  29: 1610612763, // MEM
  14: 1610612748, // MIA
  15: 1610612749, // MIL
  16: 1610612750, // MIN
  3: 1610612740,  // NOP
  18: 1610612752, // NYK
  25: 1610612760, // OKC
  19: 1610612753, // ORL
  20: 1610612755, // PHI
  21: 1610612756, // PHX
  22: 1610612757, // POR
  23: 1610612758, // SAC
  24: 1610612759, // SAS
  28: 1610612761, // TOR
  26: 1610612762, // UTA
  27: 1610612764  // WAS
};

/**
 * Get ESPN team ID from NBA team ID
 */
function getEspnTeamId(nbaTeamId) {
  for (const [espnId, nbaId] of Object.entries(ESPN_TO_NBA_TEAM_ID)) {
    if (nbaId === nbaTeamId) {
      return espnId;
    }
  }
  return null;
}

/**
 * Fetch NBA CDN game IDs from today's scoreboard
 * Builds a mapping of team abbr pairs + date → NBA game ID
 */
async function fetchNbaGameIdMap() {
  try {
    // Fetch last 7 days of scoreboards to build game ID map
    const gameIdMap = new Map();
    const today = new Date();
    
    for (let daysBack = 0; daysBack < 30; daysBack++) {
      const date = new Date(today);
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().split('T')[0];
      
      // Try today's scoreboard for today, otherwise skip (historical blocked)
      if (daysBack === 0) {
        const url = `${NBA_CDN_BASE}/scoreboard/todaysScoreboard_00.json`;
        const response = await fetch(url, { headers: NBA_CDN_HEADERS });
        
        if (response.ok) {
          const data = await response.json();
          const games = data.scoreboard?.games || [];
          
          for (const game of games) {
            const key = `${game.awayTeam.teamTricode}_${game.homeTeam.teamTricode}_${dateStr}`;
            gameIdMap.set(key, game.gameId);
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100)); // Rate limit
    }
    
    return gameIdMap;
    
  } catch (error) {
    console.error('[NBA] Error building game ID map:', error);
    return new Map();
  }
}

/**
 * Fetch boxscore from NBA CDN
 * 
 * @param {string} nbaGameId - NBA CDN game ID (e.g., "0022500123")
 * @returns {Promise<object|null>} - Boxscore data or null
 */
async function fetchBoxscore(nbaGameId) {
  try {
    const url = `${NBA_CDN_BASE}/boxscore/boxscore_${nbaGameId}.json`;
    
    const response = await rateLimitedFetch(url, { headers: NBA_CDN_HEADERS });
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    return data.game || null;
    
  } catch (error) {
    return null;
  }
}

/**
 * Calculate advanced stats from boxscore data
 * 
 * @param {object} boxscore - NBA CDN boxscore game object
 * @param {string} teamTricode - Team abbreviation (3 letters)
 * @returns {object} - Calculated stats
 */
function calculateBoxscoreStats(boxscore, teamTricode) {
  const isHome = boxscore.homeTeam.teamTricode === teamTricode;
  const team = isHome ? boxscore.homeTeam : boxscore.awayTeam;
  const opp = isHome ? boxscore.awayTeam : boxscore.homeTeam;
  
  const stats = team.statistics || {};
  const oppStats = opp.statistics || {};
  
  // Extract raw stats
  const pts = stats.points || 0;
  const oppPts = oppStats.points || 0;
  const fgm = stats.fieldGoalsMade || 0;
  const fga = stats.fieldGoalsAttempted || 1;
  const fg3m = stats.threePointersMade || 0;
  const ftm = stats.freeThrowsMade || 0;
  const fta = stats.freeThrowsAttempted || 0;
  const oreb = stats.reboundsOffensive || 0;
  const dreb = stats.reboundsDefensive || 0;
  const tov = stats.turnovers || 0;
  const oppDreb = oppStats.reboundsDefensive || 0;
  const oppOreb = oppStats.reboundsOffensive || 0;
  
  // Calculate possessions (standard formula)
  const possessions = fga - oreb + tov + (0.44 * fta);
  const oppPossessions = (oppStats.fieldGoalsAttempted || 1) - oppOreb + (oppStats.turnovers || 0) + (0.44 * (oppStats.freeThrowsAttempted || 0));
  
  // Advanced metrics
  const pace = possessions; // Per game basis
  const offRtg = possessions > 0 ? (pts / possessions) * 100 : 114.5;
  const defRtg = oppPossessions > 0 ? (oppPts / oppPossessions) * 100 : 114.5;
  const netRtg = offRtg - defRtg;
  
  // Four Factors
  const efg = fga > 0 ? (fgm + 0.5 * fg3m) / fga : 0.535;
  const ts = (fga + 0.44 * fta) > 0 ? pts / (2 * (fga + 0.44 * fta)) : 0.575;
  const tovPct = possessions > 0 ? tov / possessions : 0.138;
  const orbPct = (oreb + oppDreb) > 0 ? oreb / (oreb + oppDreb) : 0.25;
  const ftFga = fga > 0 ? fta / fga : 0.22;
  
  return {
    pts,
    oppPts,
    possessions,
    pace,
    offRtg,
    defRtg,
    netRtg,
    efg,
    ts,
    tovPct,
    orbPct,
    ftFga,
    fgPct: fga > 0 ? fgm / fga : 0.47,
    fg3Pct: fg3m > 0 ? fg3m / (stats.threePointersAttempted || 1) : 0.36,
    ftPct: fta > 0 ? ftm / fta : 0.78
  };
}

/**
 * Aggregate stats across multiple games
 * 
 * @param {Array} gameStats - Array of per-game stats objects
 * @returns {object} - Aggregated stats
 */
export function aggregateStats(gameStats) {
  if (!gameStats || gameStats.length === 0) {
    return null;
  }
  
  const games = gameStats.length;
  const totalPts = gameStats.reduce((sum, g) => sum + g.pts, 0);
  const totalOppPts = gameStats.reduce((sum, g) => sum + g.oppPts, 0);
  const totalPoss = gameStats.reduce((sum, g) => sum + g.possessions, 0);
  
  // Average stats
  const pace = totalPoss / games;
  const offRtg = totalPoss > 0 ? (totalPts / totalPoss) * 100 : 114.5;
  const defRtg = totalPoss > 0 ? (totalOppPts / totalPoss) * 100 : 114.5;
  const netRtg = offRtg - defRtg;
  
  // Average Four Factors
  const efg = gameStats.reduce((sum, g) => sum + g.efg, 0) / games;
  const ts = gameStats.reduce((sum, g) => sum + g.ts, 0) / games;
  const tovPct = gameStats.reduce((sum, g) => sum + g.tovPct, 0) / games;
  const orbPct = gameStats.reduce((sum, g) => sum + g.orbPct, 0) / games;
  const ftFga = gameStats.reduce((sum, g) => sum + g.ftFga, 0) / games;
  
  // Count wins/losses
  const wins = gameStats.filter(g => g.pts > g.oppPts).length;
  const losses = games - wins;
  const winPct = games > 0 ? wins / games : 0.5;
  
  // Shooting percentages
  const fgPct = gameStats.reduce((sum, g) => sum + g.fgPct, 0) / games;
  const fg3Pct = gameStats.reduce((sum, g) => sum + g.fg3Pct, 0) / games;
  const ftPct = gameStats.reduce((sum, g) => sum + g.ftPct, 0) / games;
  
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
    rebounds: 0,
    assists: 0,
    turnovers: 0
  };
}

/**
 * Fetch team's last N games and calculate advanced stats
 * Uses ESPN schedule + NBA CDN boxscores
 * 
 * @param {number} teamId - NBA team ID
 * @param {string} season - '2025-26'
 * @param {number} lastN - Number of games
 * @returns {Promise<object|null>} - Aggregated stats
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    // Get ESPN team ID
    const espnTeamId = getEspnTeamId(teamId);
    if (!espnTeamId) {
      console.error(`[NBA] No ESPN ID mapping for NBA team ${teamId}`);
      return null;
    }
    
    // Get team abbreviation
    const team = NBA_TEAMS.find(t => t.id === teamId);
    if (!team) {
      console.error(`[NBA] Unknown team ID: ${teamId}`);
      return null;
    }
    
    console.log(`[NBA] Fetching last ${lastN} games for ${team.abbreviation} (ESPN ID: ${espnTeamId})...`);
    
    // Fetch team's recent games from ESPN
    const recentGames = await fetchTeamSchedule(espnTeamId, lastN);
    
    if (recentGames.length === 0) {
      console.log(`[NBA] No completed games found for ${team.abbreviation}`);
      return null;
    }
    
    console.log(`[NBA] Found ${recentGames.length} completed games for ${team.abbreviation}`);
    
    // Build game ID map from today's scoreboard
    const gameIdMap = await fetchNbaGameIdMap();
    
    // Fetch boxscores and calculate stats
    const gameStats = [];
    
    for (const game of recentGames.slice(-lastN)) {
      // Try to find NBA CDN game ID
      const dateStr = game.date.split('T')[0];
      const key1 = `${game.awayTeam.abbr}_${game.homeTeam.abbr}_${dateStr}`;
      const key2 = `${game.homeTeam.abbr}_${game.awayTeam.abbr}_${dateStr}`; // Try reverse
      
      let nbaGameId = gameIdMap.get(key1) || gameIdMap.get(key2);
      
      if (!nbaGameId) {
        // Fallback: calculate stats from ESPN score data
        const isHome = game.homeTeam.abbr === team.abbreviation;
        const pts = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppPts = isHome ? game.awayTeam.score : game.homeTeam.score;
        
        // Estimate possessions from score (rough approximation)
        const estimatedPoss = (pts + oppPts) / 2.2; // Average NBA possessions ~100
        
        // Use team-specific priors (regressed 70% team + 30% league) from 2024-25 season
        const prior = getRegressedPrior(team.abbreviation);
        console.log(`[NBA FALLBACK] ${team.abbreviation} using prior: efg=${prior.efg.toFixed(3)}, ts=${prior.ts.toFixed(3)}, offRtg=${prior.offRtg.toFixed(1)}`);
        
        gameStats.push({
          pts,
          oppPts,
          possessions: estimatedPoss,
          pace: estimatedPoss,
          offRtg: (pts / estimatedPoss) * 100,
          defRtg: (oppPts / estimatedPoss) * 100,
          netRtg: ((pts - oppPts) / estimatedPoss) * 100,
          efg: prior.efg,     // Team-specific prior, not flat league average
          ts: prior.ts,
          tovPct: prior.tovPct,
          orbPct: prior.orbPct,
          ftFga: prior.ftRate,
          fgPct: prior.efg / 1.1, // Approximate FG% from eFG%
          fg3Pct: 0.36,
          ftPct: 0.78
        });
        
        continue;
      }
      
      // Fetch boxscore from NBA CDN
      const boxscore = await fetchBoxscore(nbaGameId);
      
      if (boxscore) {
        const stats = calculateBoxscoreStats(boxscore, team.abbreviation);
        gameStats.push(stats);
      } else {
        // Fallback: CDN fetch failed, use score estimation with team-specific priors
        console.log(`[NBA] CDN boxscore unavailable for ${nbaGameId}, using score estimation with team priors`);
        const isHome = game.homeTeam.abbr === team.abbreviation;
        const pts = isHome ? game.homeTeam.score : game.awayTeam.score;
        const oppPts = isHome ? game.awayTeam.score : game.homeTeam.score;
        
        // Estimate possessions from score
        const estimatedPoss = (pts + oppPts) / 2.2;
        
        // Use team-specific priors (regressed 70% team + 30% league) from 2024-25 season
        const prior = getRegressedPrior(team.abbreviation);
        
        gameStats.push({
          pts,
          oppPts,
          possessions: estimatedPoss,
          pace: estimatedPoss,
          offRtg: (pts / estimatedPoss) * 100,
          defRtg: (oppPts / estimatedPoss) * 100,
          netRtg: ((pts - oppPts) / estimatedPoss) * 100,
          efg: prior.efg,     // Team-specific prior, not flat league average
          ts: prior.ts,
          tovPct: prior.tovPct,
          orbPct: prior.orbPct,
          ftFga: prior.ftRate,
          fgPct: prior.efg / 1.1, // Approximate FG% from eFG%
          fg3Pct: 0.36,
          ftPct: 0.78
        });
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    if (gameStats.length === 0) {
      console.log(`[NBA] No valid game stats for ${team.abbreviation}`);
      return null;
    }
    
    // Aggregate stats across games
    const aggregated = aggregateStats(gameStats);
    
    // Tag with source for debugging
    aggregated.source = 'mixed'; // Will be cdn, fallback, or mixed
    const cdnCount = gameStats.filter(g => g.source === 'cdn').length;
    const fallbackCount = gameStats.filter(g => g.source === 'fallback').length;
    if (cdnCount === gameStats.length) aggregated.source = 'cdn';
    else if (fallbackCount === gameStats.length) aggregated.source = 'fallback';
    
    console.log(`[NBA] ✅ ${team.abbreviation} L${lastN}: ${aggregated.games} games, OffRtg=${aggregated.offRtg.toFixed(1)}, DefRtg=${aggregated.defRtg.toFixed(1)}, Source=${aggregated.source} (${cdnCount} CDN, ${fallbackCount} fallback)`);
    
    // OPTIMIZATION: Return raw gameStats array so caller can slice for different windows
    aggregated.gameStats = gameStats;
    
    return aggregated;
    
  } catch (error) {
    console.error(`[NBA] Error fetching team last games for ${teamId}:`, error);
    return null;
  }
}

/**
 * Fetch team's rolling window stats (L5, L10, L20)
 * Uses ESPN + NBA CDN approach
 * 
 * @param {number} teamId - NBA team ID
 * @param {string} season - '2025-26'
 * @param {Map} leagueWindows - DEPRECATED (not used in CDN approach)
 * @returns {Promise<{l5, l10, l20}>}
 */
export async function fetchTeamRollingStats(teamId, season = '2025-26', leagueWindows = null) {
  try {
    console.log(`[NBA] 📊 Fetching rolling stats for team ${teamId}...`);
    
    // OPTIMIZED: Fetch 20 games ONCE, then slice for L5/L10/L20
    // This reduces 3 API calls per team down to 1 (67% reduction)
    // 22 teams × 3 calls = 66 calls → 22 teams × 1 call = 22 calls
    const l20 = await fetchTeamLastGames(teamId, season, 20);
    
    if (!l20 || !l20.gameStats || l20.gameStats.length === 0) {
      console.log(`[NBA] No games found for team ${teamId}, returning nulls`);
      return { l5: null, l10: null, l20: null };
    }
    
    // Derive L5 and L10 from the L20 data (already fetched)
    const allGames = l20.gameStats || [];
    
    // Always use available games, even if less than target window
    // E.g., if team has 7 games, L10 = all 7, L5 = last 5
    const l10Games = allGames.slice(-10);  // Takes up to 10, or whatever is available
    const l5Games = allGames.slice(-5);    // Takes up to 5, or whatever is available
    
    // Aggregate stats for each window (will work with fewer games)
    const l10 = l10Games.length > 0 ? aggregateStats(l10Games) : null;
    const l5 = l5Games.length > 0 ? aggregateStats(l5Games) : null;
    
    // Tag sources
    if (l5) l5.source = l20.source;
    if (l10) l10.source = l20.source;
    
    console.log(`[NBA] ✅ Team ${teamId}: L5=${l5?.games || 0}, L10=${l10?.games || 0}, L20=${l20?.games || 0} games`);
    
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
 * Fetch team stats (LEGACY - for backwards compatibility with features.mjs)
 * Returns league-average stats
 */
export async function fetchTeamStats(season = '2025-26', seasonType = 'Regular Season', measureType = 'Base') {
  console.log(`[NBA] ⚠️  fetchTeamStats is deprecated - returning league averages`);
  
  // Return league average stats for backwards compatibility
  return [{
    TEAM_ID: 0,
    TEAM_NAME: 'League Average',
    GP: 10,
    W: 5,
    L: 5,
    PTS: 114.5,
    FG_PCT: 0.47,
    FG3_PCT: 0.36,
    FT_PCT: 0.78,
    REB: 43,
    AST: 25,
    TOV: 14,
    STL: 8,
    BLK: 5,
    PF: 20
  }];
}

/**
 * Calculate recent form (LEGACY - for backwards compatibility with features.mjs)
 * Uses fetchTeamLastGames under the hood
 */
export async function calculateRecentForm(teamId, season = '2025-26', windows = [5, 10, 20]) {
  try {
    const form = {};
    
    for (const n of windows) {
      const stats = await fetchTeamLastGames(teamId, season, n);
      if (stats) {
        form[`L${n}`] = {
          games: stats.games,
          wins: stats.wins,
          losses: stats.losses,
          winPct: stats.winPct,
          pts: stats.pace * stats.offRtg / 100,
          ptsAllowed: stats.pace * stats.defRtg / 100,
          netRating: stats.netRtg,
          pace: stats.pace,
          offRating: stats.offRtg,
          defRating: stats.defRtg
        };
      }
    }
    
    return form;
    
  } catch (error) {
    console.error('[NBA] Error calculating recent form:', error);
    return {};
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
