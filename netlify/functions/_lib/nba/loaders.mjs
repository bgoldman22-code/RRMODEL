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
 * Helper: Fetch NBA CDN scoreboard for a specific date
 */
async function fetchNbaCdnScoreboard(dateYmd) {
  const url = `${NBA_CDN_BASE}/scoreboard/scoreboard_${dateYmd}.json`;
  const res = await fetch(url, { headers: NBA_HEADERS });
  if (!res.ok) {
    console.log(`[NBA] Scoreboard ${dateYmd} unavailable`);
    return null;
  }
  return res.json();
}

/**
 * Helper: Convert Date to YYYYMMDD string
 */
function toYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Fetch team's last N games using NBA CDN scoreboard + boxscores
 * Returns all metrics needed for elite model (85 features)
 * 
 * Two-step process:
 * 1. Scan NBA CDN scoreboards backwards to find completed NBA game IDs for this team
 * 2. Fetch detailed box scores from NBA CDN API for each game
 */
export async function fetchTeamLastGames(teamId, season = '2025-26', lastN = 10) {
  try {
    console.log(`[NBA] 📊 Fetching last ${lastN} games for team ${teamId} via NBA CDN...`);
    
    // STEP 1: Find NBA game IDs by scanning NBA CDN scoreboards
    const nbaGameIds = [];
    const maxDaysBack = 60;
    
    for (let daysBack = 1; daysBack <= maxDaysBack && nbaGameIds.length < lastN; daysBack++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - daysBack);
      const ymd = toYmd(dt);
      
      try {
        const sb = await fetchNbaCdnScoreboard(ymd);
        if (!sb?.scoreboard?.games?.length) continue;
        
        for (const g of sb.scoreboard.games) {
          const home = g.homeTeam;
          const away = g.awayTeam;
          const completed = g.gameStatus === 3 || g.gameStatusText?.toLowerCase()?.includes('final');
          if (!completed) continue;
          
          // NBA CDN uses numeric teamId; ensure same type
          const tid = parseInt(teamId, 10);
          if (home?.teamId === tid || away?.teamId === tid) {
            nbaGameIds.push(g.gameId); // e.g., "0022500001"
            if (nbaGameIds.length >= lastN) break;
          }
        }
        await new Promise(r => setTimeout(r, 120));
      } catch (err) {
        console.log(`[NBA] Scoreboard error ${ymd}: ${err.message}`);
      }
    }
    
    if (!nbaGameIds.length) {
      console.log(`[NBA] ⚠️ No completed games found for team ${teamId}`);
      return null;
    }
    
    const recentGames = nbaGameIds.slice(0, lastN);
    console.log(`[NBA] Found ${recentGames.length} games, fetching NBA CDN boxscores...`);
    
    // STEP 2: Fetch NBA CDN boxscores (using NBA gameIds ✅)
    let totalStats = {
      games: 0, wins: 0, points: 0, pointsAllowed: 0, possessions: 0,
      fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
      offReb: 0, defReb: 0, assists: 0, turnovers: 0
    };
    
    for (const gameId of recentGames) {
      try {
        const boxUrl = `${NBA_CDN_BASE}/boxscore/boxscore_${gameId}.json`;
        const boxResponse = await fetch(boxUrl, { headers: NBA_HEADERS });
        
        if (!boxResponse.ok) {
          console.log(`[NBA] CDN boxscore unavailable for ${gameId}`);
          continue;
        }
        
        const boxData = await boxResponse.json();
        const game = boxData.game;
        if (!game) continue;
        
        const isHome = game.homeTeam?.teamId === parseInt(teamId, 10);
        const team = isHome ? game.homeTeam : game.awayTeam;
        const opp = isHome ? game.awayTeam : game.homeTeam;
        
        if (!team?.statistics || !opp?.statistics) continue;
        
        totalStats.games++;
        if ((team.score || 0) > (opp.score || 0)) totalStats.wins++;
        
        totalStats.points += team.score || 0;
        totalStats.pointsAllowed += opp.score || 0;
        
        const ts = team.statistics;
        totalStats.fgm += ts.fieldGoalsMade || 0;
        totalStats.fga += ts.fieldGoalsAttempted || 0;
        totalStats.fg3m += ts.threePointFieldGoalsMade || 0;
        totalStats.fg3a += ts.threePointFieldGoalsAttempted || 0;
        totalStats.ftm += ts.freeThrowsMade || 0;
        totalStats.fta += ts.freeThrowsAttempted || 0;
        totalStats.offReb += ts.reboundsOffensive || 0;
        totalStats.defReb += ts.reboundsDefensive || 0;
        totalStats.assists += ts.assists || 0;
        totalStats.turnovers += ts.turnovers || 0;
        
        const poss = ts.fieldGoalsAttempted + 0.44 * ts.freeThrowsAttempted - ts.reboundsOffensive + ts.turnovers;
        totalStats.possessions += poss;
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (err) {
        console.error(`[NBA] CDN error for ${gameId}: ${err.message}`);
      }
    }
    
    const g = totalStats.games;
    if (!g || g <= 0) {
      console.log(`[NBA] ⚠️ No valid boxscores aggregated for team ${teamId}`);
      return null;
    }
    
    // STEP 3: Calculate advanced metrics (safe because g > 0)
    const pace = (totalStats.possessions / g / 48) * 48;
    const offRtg = (totalStats.points / totalStats.possessions) * 100;
    const defRtg = (totalStats.pointsAllowed / totalStats.possessions) * 100;
    const efg = totalStats.fga > 0 ? (totalStats.fgm + 0.5 * totalStats.fg3m) / totalStats.fga : 0.535;
    const tsa = totalStats.fga + 0.44 * totalStats.fta;
    const ts = tsa > 0 ? totalStats.points / (2 * tsa) : 0.575;
    const tovPct = totalStats.possessions > 0 ? totalStats.turnovers / totalStats.possessions : 0.138;
    const totalRebs = totalStats.offReb + totalStats.defReb;
    const orbPct = totalRebs > 0 ? totalStats.offReb / totalRebs : 0.25;
    const ftFga = totalStats.fga > 0 ? totalStats.fta / totalStats.fga : 0.22;
    
    console.log(`[NBA] ✅ Team ${teamId}: ${g} games, ${offRtg.toFixed(1)} OffRtg, ${defRtg.toFixed(1)} DefRtg`);
    
    return {
      games: g,
      wins: totalStats.wins,
      losses: g - totalStats.wins,
      winPct: totalStats.wins / g,
      pace,
      offRtg,
      defRtg,
      netRtg: offRtg - defRtg,
      efg,
      ts,
      tovPct,
      orbPct,
      ftFga,
      fgPct: totalStats.fga > 0 ? totalStats.fgm / totalStats.fga : 0.47,
      fg3Pct: totalStats.fg3a > 0 ? totalStats.fg3m / totalStats.fg3a : 0.36,
      ftPct: totalStats.fta > 0 ? totalStats.ftm / totalStats.fta : 0.78,
      rebounds: totalRebs / g,
      assists: totalStats.assists / g,
      turnovers: totalStats.turnovers / g,
      offRebounds: totalStats.offReb / g,
      defRebounds: totalStats.defReb / g
    };
    
  } catch (error) {
    console.error(`[NBA] Error for team ${teamId}:`, error.message);
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
    
    // Ensure we don't pass undefined/NaN downstream:
    const safe = (x) => x && Number.isFinite(x.games) && x.games > 0 ? x : null;
    return { l5: safe(l5), l10: safe(l10), l20: safe(l20) };
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
