/**
 * NBA Data Loaders - Elite Pipeline
 * 
 * Fetches data from NBA Stats API, ESPN, and other sources
 * Implements caching, rate limiting, and fallback strategies
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// NBA Stats API base URLs
const NBA_STATS_BASE = 'https://stats.nba.com/stats';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// Headers required by NBA Stats API
const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nba.com/',
  'Origin': 'https://www.nba.com',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true'
};

/**
 * Load team information (local file)
 */
export async function loadTeamInfo() {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const filePath = join(__dirname, '..', '..', '..', '..', 'data', 'nba', 'teams', 'team-info.json');
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content);
    
    // Create lookup maps
    const byAbbr = {};
    const byId = {};
    const byName = {};
    
    for (const team of data.teams) {
      byAbbr[team.abbreviation] = team;
      byId[team.id] = team;
      byName[team.name] = team;
    }
    
    return { teams: data.teams, byAbbr, byId, byName };
  } catch (error) {
    console.error('Error loading team info:', error);
    return { teams: [], byAbbr: {}, byId: {}, byName: {} };
  }
}

/**
 * Fetch team stats from NBA Stats API
 * 
 * @param {string} season - Season in format "2024-25"
 * @param {string} seasonType - "Regular Season" or "Playoffs"
 * @param {string} measureType - "Base", "Advanced", "Four Factors", etc.
 */
export async function fetchTeamStats(season = '2025-26', seasonType = 'Regular Season', measureType = 'Base') {
  try {
    const params = new URLSearchParams({
      Season: season,
      SeasonType: seasonType,
      MeasureType: measureType,
      PerMode: 'PerGame',
      PaceAdjust: 'N',
      Rank: 'N',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE}/leaguedashteamstats?${params}`;
    
    console.log('[NBA] Fetching team stats:', { season, measureType });
    
    const response = await fetch(url, { headers: NBA_HEADERS });
    
    if (!response.ok) {
      throw new Error(`NBA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse result set
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    const teams = rows.map(row => {
      const team = {};
      headers.forEach((header, i) => {
        team[header] = row[i];
      });
      return team;
    });
    
    console.log(`[NBA] ✅ Loaded ${teams.length} teams (${measureType})`);
    
    return teams;
    
  } catch (error) {
    console.error('[NBA] Error fetching team stats:', error);
    return [];
  }
}

/**
 * Fetch player stats from NBA Stats API
 */
export async function fetchPlayerStats(season = '2025-26', seasonType = 'Regular Season') {
  try {
    const params = new URLSearchParams({
      Season: season,
      SeasonType: seasonType,
      PerMode: 'PerGame',
      LeagueID: '00'
    });
    
    const url = `${NBA_STATS_BASE}/leaguedashplayerstats?${params}`;
    
    console.log('[NBA] Fetching player stats:', { season });
    
    const response = await fetch(url, { headers: NBA_HEADERS });
    
    if (!response.ok) {
      throw new Error(`NBA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    const players = rows.map(row => {
      const player = {};
      headers.forEach((header, i) => {
        player[header] = row[i];
      });
      return player;
    }).filter(p => p.MIN > 10); // Filter: Must average >10 min per game
    
    console.log(`[NBA] ✅ Loaded ${players.length} players with >10 MPG`);
    
    return players;
    
  } catch (error) {
    console.error('[NBA] Error fetching player stats:', error);
    return [];
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
          abbreviation: homeTeam.team.abbreviation,
          score: parseInt(homeTeam.score) || 0,
          record: homeTeam.records?.[0]?.summary || '0-0'
        },
        awayTeam: {
          id: awayTeam.team.id,
          name: awayTeam.team.displayName,
          abbreviation: awayTeam.team.abbreviation,
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
 * Fetch team's last N games with advanced stats
 * Returns all metrics needed for elite model (85 features)
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    // Fetch Advanced stats (pace, offRtg, defRtg, eFG%, TS%, etc.)
    const advancedParams = new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      TeamID: teamId,
      MeasureType: 'Advanced',
      PerMode: 'PerGame',
      LastNGames: lastN
    });
    
    const advancedUrl = `${NBA_STATS_BASE}/teamdashboardbygeneralsplits?${advancedParams}`;
    
    console.log(`[NBA] Fetching L${lastN} stats for team ${teamId}...`);
    
    // Add rate limiting
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const response = await fetch(advancedUrl, { headers: NBA_HEADERS });
    
    if (!response.ok) {
      console.error(`[NBA] API error: ${response.status} ${response.statusText}`);
      throw new Error(`NBA API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.resultSets || !data.resultSets[0]) {
      console.error('[NBA] No resultSets in API response');
      return null;
    }
    
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    if (rows.length === 0) {
      console.log(`[NBA] ⚠️ No stats found for team ${teamId} L${lastN}`);
      return null;
    }
    
    const rawStats = {};
    headers.forEach((header, i) => {
      rawStats[header] = rows[0][i];
    });
    
    console.log(`[NBA] ✅ Fetched L${lastN} stats for team ${teamId}: ${rawStats.GP || 0} games`);
    
    // Map to elite model format
    return {
      games: rawStats.GP || 0,
      wins: rawStats.W || 0,
      losses: rawStats.L || 0,
      winPct: rawStats.W_PCT || 0,
      pace: rawStats.PACE || 100,
      offRtg: rawStats.OFF_RATING || 114.5,
      defRtg: rawStats.DEF_RATING || 114.5,
      netRtg: rawStats.NET_RATING || 0,
      efg: rawStats.EFG_PCT || 0.535,
      ts: rawStats.TS_PCT || 0.575,
      tovPct: rawStats.TM_TOV_PCT || 0.138,
      orbPct: rawStats.OREB_PCT || 0.25,
      ftFga: rawStats.FTA_RATE || 0.22,
      // Additional stats for total model
      fgPct: rawStats.FG_PCT || 0.47,
      fg3Pct: rawStats.FG3_PCT || 0.36,
      ftPct: rawStats.FT_PCT || 0.78,
      rebounds: rawStats.REB || 0,
      assists: rawStats.AST || 0,
      turnovers: rawStats.TOV || 0,
      offRebounds: rawStats.OREB || 0,
      defRebounds: rawStats.DREB || 0
    };
    
  } catch (error) {
    console.error('[NBA] Error fetching team last games:', error);
    return null;
  }
}

/**
 * Fetch injuries from ESPN
 */
export async function fetchInjuries() {
  try {
    // ESPN doesn't have a dedicated injuries endpoint, so we'll parse from team pages
    // For v1, we'll implement a simple scraper or use a third-party API
    
    console.log('[NBA] Fetching injuries (placeholder for v1)');
    
    // TODO: Implement injury scraping or integrate with RotoWire API
    // For now, return empty array
    
    return [];
    
  } catch (error) {
    console.error('[NBA] Error fetching injuries:', error);
    return [];
  }
}

/**
 * Fetch team's rolling window stats (L5, L10, L20)
 * Optimized for elite model - gets all windows in parallel
 */
export async function fetchTeamRollingStats(teamId, season = '2025-26') {
  try {
    console.log(`[NBA] 📊 Fetching rolling stats for team ${teamId}...`);
    
    const [l5, l10, l20] = await Promise.all([
      fetchTeamLastGames(teamId, season, 5),
      fetchTeamLastGames(teamId, season, 10),
      fetchTeamLastGames(teamId, season, 20)
    ]);
    
    if (!l5 && !l10 && !l20) {
      console.error(`[NBA] ❌ All rolling windows failed for team ${teamId}`);
    }
    
    return { l5, l10, l20 };
  } catch (error) {
    console.error(`[NBA] Error fetching rolling stats for team ${teamId}:`, error);
    return { l5: null, l10: null, l20: null };
  }
}

/**
 * Calculate team's last N games stats
 */
export async function calculateRecentForm(teamId, season = '2025-26', windows = [5, 10, 20]) {
  try {
    const form = {};
    
    for (const n of windows) {
      const stats = await fetchTeamLastGames(teamId, season, n);
      if (stats) {
        form[`L${n}`] = {
          games: stats.GP,
          wins: stats.W,
          losses: stats.L,
          winPct: stats.W / stats.GP,
          pts: stats.PTS / stats.GP,
          ptsAllowed: stats.OPP_PTS / stats.GP,
          netRating: ((stats.PTS - stats.OPP_PTS) / stats.GP) * 100 / 100,
          pace: stats.POSS / stats.GP,
          offRating: (stats.PTS / stats.POSS) * 100,
          defRating: (stats.OPP_PTS / stats.POSS) * 100
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
 * Rate limit helper - prevents hammering NBA Stats API
 */
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 600; // 600ms between requests

export async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  return fetch(url, options);
}
