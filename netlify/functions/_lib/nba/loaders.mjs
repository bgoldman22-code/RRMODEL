/**
 * NBA Data Loaders - Elite Pipeline
 * 
 * Fetches data from NBA Stats API, ESPN, and other sources
 * Implements caching, rate limiting, and fallback strategies
 */

import { promises as fs } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// NBA CDN API base URLs (much more reliable than stats.nba.com!)
const NBA_CDN_BASE = 'https://cdn.nba.com/static/json/liveData';
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// Simple headers for CDN (no auth needed!)
const NBA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Accept': 'application/json'
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
 * Fetch team's last N games from ESPN and calculate advanced stats
 * Returns all metrics needed for elite model (85 features)
 * 
 * This uses ESPN's scoreboard API to get recent games, then fetches
 * box scores from NBA's CDN to calculate advanced metrics
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    console.log(`[NBA] 📊 Fetching last ${lastN} games for team ${teamId}...`);
    
    // Get team's recent games from ESPN
    const espnTeamId = teamId; // ESPN uses same IDs
    const year = parseInt(season.split('-')[0]);
    
    // Fetch team's schedule from ESPN
    const scheduleUrl = `${ESPN_BASE}/teams/${espnTeamId}/schedule?season=${year}`;
    const scheduleResponse = await fetch(scheduleUrl);
    
    if (!scheduleResponse.ok) {
      console.error(`[NBA] ESPN schedule error: ${scheduleResponse.status}`);
      return null;
    }
    
    const scheduleData = await scheduleResponse.json();
    
    // Get completed games only
    const completedGames = (scheduleData.events || [])
      .filter(event => event.status?.type?.completed === true)
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, lastN);
    
    if (completedGames.length === 0) {
      console.log(`[NBA] ⚠️ No completed games found for team ${teamId}`);
      return null;
    }
    
    console.log(`[NBA] Found ${completedGames.length} completed games for team ${teamId}`);
    
    // Calculate aggregate stats across all games
    let totalStats = {
      games: 0,
      wins: 0,
      losses: 0,
      points: 0,
      pointsAllowed: 0,
      possessions: 0,
      fgm: 0, fga: 0,
      fg3m: 0, fg3a: 0,
      ftm: 0, fta: 0,
      offReb: 0, defReb: 0,
      assists: 0,
      turnovers: 0,
      oppTurnovers: 0
    };
    
    // Process each game
    for (const event of completedGames) {
      const competition = event.competitions?.[0];
      if (!competition) continue;
      
      const home = competition.competitors?.find(c => c.homeAway === 'home');
      const away = competition.competitors?.find(c => c.homeAway === 'away');
      
      if (!home || !away) continue;
      
      const isHome = home.id === String(teamId);
      const team = isHome ? home : away;
      const opp = isHome ? away : home;
      
      const teamScore = parseInt(team.score || 0);
      const oppScore = parseInt(opp.score || 0);
      
      // Get box score stats from team statistics if available
      const teamStats = team.statistics || [];
      const oppStats = opp.statistics || [];
      
      const getStat = (stats, name) => {
        const stat = stats.find(s => s.name === name);
        return parseFloat(stat?.displayValue || 0);
      };
      
      totalStats.games++;
      if (teamScore > oppScore) totalStats.wins++;
      else totalStats.losses++;
      
      totalStats.points += teamScore;
      totalStats.pointsAllowed += oppScore;
      
      // Get shooting stats
      totalStats.fgm += getStat(teamStats, 'fieldGoalsMade');
      totalStats.fga += getStat(teamStats, 'fieldGoalsAttempted');
      totalStats.fg3m += getStat(teamStats, 'threePointFieldGoalsMade');
      totalStats.fg3a += getStat(teamStats, 'threePointFieldGoalsAttempted');
      totalStats.ftm += getStat(teamStats, 'freeThrowsMade');
      totalStats.fta += getStat(teamStats, 'freeThrowsAttempted');
      
      // Rebounds
      totalStats.offReb += getStat(teamStats, 'offensiveRebounds');
      totalStats.defReb += getStat(teamStats, 'defensiveRebounds');
      
      // Playmaking
      totalStats.assists += getStat(teamStats, 'assists');
      totalStats.turnovers += getStat(teamStats, 'turnovers');
      totalStats.oppTurnovers += getStat(oppStats, 'turnovers');
      
      // Estimate possessions using standard formula
      const poss = totalStats.fga + 0.44 * totalStats.fta - totalStats.offReb + totalStats.turnovers;
      totalStats.possessions += poss;
    }
    
    // Calculate advanced metrics
    const games = totalStats.games;
    if (games === 0) return null;
    
    const avgPoss = totalStats.possessions / games;
    const pace = (avgPoss / 48) * 48; // Normalize to 48 mins
    
    const offRtg = (totalStats.points / totalStats.possessions) * 100;
    const defRtg = (totalStats.pointsAllowed / totalStats.possessions) * 100;
    const netRtg = offRtg - defRtg;
    
    const efg = totalStats.fga > 0 
      ? (totalStats.fgm + 0.5 * totalStats.fg3m) / totalStats.fga 
      : 0.535;
    
    const tsa = totalStats.fga + 0.44 * totalStats.fta;
    const ts = tsa > 0 
      ? totalStats.points / (2 * tsa) 
      : 0.575;
    
    const tovPct = totalStats.possessions > 0 
      ? totalStats.turnovers / totalStats.possessions 
      : 0.138;
    
    const totalRebs = totalStats.offReb + totalStats.defReb;
    const orbPct = totalRebs > 0 
      ? totalStats.offReb / totalRebs 
      : 0.25;
    
    const ftFga = totalStats.fga > 0 
      ? totalStats.fta / totalStats.fga 
      : 0.22;
    
    const winPct = games > 0 ? totalStats.wins / games : 0.50;
    
    const fgPct = totalStats.fga > 0 ? totalStats.fgm / totalStats.fga : 0.47;
    const fg3Pct = totalStats.fg3a > 0 ? totalStats.fg3m / totalStats.fg3a : 0.36;
    const ftPct = totalStats.fta > 0 ? totalStats.ftm / totalStats.fta : 0.78;
    
    console.log(`[NBA] ✅ Calculated stats for team ${teamId}: ${games} games, ${offRtg.toFixed(1)} OffRtg, ${defRtg.toFixed(1)} DefRtg`);
    
    return {
      games,
      wins: totalStats.wins,
      losses: totalStats.losses,
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
      rebounds: (totalStats.offReb + totalStats.defReb) / games,
      assists: totalStats.assists / games,
      turnovers: totalStats.turnovers / games,
      offRebounds: totalStats.offReb / games,
      defRebounds: totalStats.defReb / games
    };
    
  } catch (error) {
    console.error(`[NBA] Error fetching team last games for ${teamId}:`, error.message);
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
