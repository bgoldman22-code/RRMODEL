/**
 * NBA Data Loaders - Elite Pipeline
 * 
 * Fetches data from NBA Stats API, ESPN, and other sources
 * Implements caching, rate limiting, and fallback strategies
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
 * Fetch team's last N games
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    const params = new URLSearchParams({
      Season: season,
      SeasonType: 'Regular Season',
      TeamID: teamId,
      MeasureType: 'Base',
      PerMode: 'Totals',
      LastNGames: lastN
    });
    
    const url = `${NBA_STATS_BASE}/teamdashboardbygeneralsplits?${params}`;
    
    const response = await fetch(url, { headers: NBA_HEADERS });
    
    if (!response.ok) {
      throw new Error(`NBA API error: ${response.status}`);
    }
    
    const data = await response.json();
    const headers = data.resultSets[0].headers;
    const rows = data.resultSets[0].rowSet;
    
    if (rows.length === 0) return null;
    
    const stats = {};
    headers.forEach((header, i) => {
      stats[header] = rows[0][i];
    });
    
    return stats;
    
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
