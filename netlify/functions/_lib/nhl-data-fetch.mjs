// netlify/functions/_lib/nhl-data-fetch-improved.mjs
// Elite NHL data aggregation with rate limiting and dual-API fallback

/**
 * NHL API ENDPOINTS
 */
const NHL_API_NEW = 'https://api-web.nhle.com/v1';
const NHL_API_OLD = 'https://statsapi.web.nhl.com/api/v1';
const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';

/**
 * Rate Limiter Class - Prevents API rate limiting
 */
class RateLimiter {
  constructor(callsPerSecond = 2) {
    this.delay = 1000 / callsPerSecond;
    this.lastCall = 0;
  }
  
  async throttle() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCall;
    if (timeSinceLastCall < this.delay) {
      await new Promise(r => setTimeout(r, this.delay - timeSinceLastCall));
    }
    this.lastCall = Date.now();
  }
}

const rateLimiter = new RateLimiter(2); // Max 2 calls per second

/**
 * Fetch with retry and exponential backoff
 */
async function fetchWithRetry(url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      await rateLimiter.throttle();
      
      const response = await fetch(url);
      
      // Handle rate limiting
      if (response.status === 429) {
        const backoffDelay = 2000 * Math.pow(2, i); // Exponential backoff: 2s, 4s, 8s
        console.warn(`⚠️ Rate limited (429), waiting ${backoffDelay}ms before retry ${i + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, backoffDelay));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Validate response is not empty
      if (!data || (Array.isArray(data) && data.length === 0) || Object.keys(data).length === 0) {
        throw new Error('Empty response from API');
      }
      
      return data;
      
    } catch (error) {
      console.warn(`⚠️ Fetch attempt ${i + 1}/${maxRetries} failed: ${error.message}`);
      
      if (i === maxRetries - 1) {
        throw error; // Rethrow on final attempt
      }
      
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

/**
 * Fetch with dual-API fallback strategy
 */
async function fetchWithFallback(newApiUrl, oldApiUrl = null) {
  // Try new API first
  try {
    const data = await fetchWithRetry(newApiUrl);
    console.log('✅ New NHL API success');
    return data;
  } catch (newApiError) {
    console.warn(`⚠️ New NHL API failed: ${newApiError.message}`);
    
    // Fall back to old API if available
    if (oldApiUrl) {
      try {
        console.log('🔄 Falling back to old NHL API...');
        const data = await fetchWithRetry(oldApiUrl);
        console.log('✅ Old NHL API success (fallback)');
        return data;
      } catch (oldApiError) {
        console.error(`❌ Both APIs failed. New: ${newApiError.message}, Old: ${oldApiError.message}`);
        throw new Error('Both NHL APIs failed');
      }
    }
    
    throw newApiError;
  }
}

/**
 * Fetch today's NHL schedule with all game metadata
 */
export async function fetchTodaySchedule() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  
  const newUrl = `${NHL_API_NEW}/schedule/${today}`;
  const oldUrl = `${NHL_API_OLD}/schedule?date=${today}`;
  
  try {
    const data = await fetchWithFallback(newUrl, oldUrl);
    return parseSchedule(data);
  } catch (error) {
    console.error('❌ Error fetching NHL schedule:', error);
    return [];
  }
}

/**
 * Parse schedule data into clean game objects
 * Handles both new and old API formats
 */
function parseSchedule(data) {
  const games = [];
  
  // New API format
  if (data.gameWeek && Array.isArray(data.gameWeek)) {
    for (const day of data.gameWeek) {
      if (!day.games) continue;
      
      for (const game of day.games) {
        games.push({
          gameId: game.id,
          season: game.season,
          gameType: game.gameType, // 2 = regular season, 3 = playoffs
          startTime: game.startTimeUTC,
          venue: game.venue?.default || 'Unknown',
          awayTeam: {
            id: game.awayTeam.id,
            abbrev: game.awayTeam.abbrev,
            name: game.awayTeam.placeName?.default,
            logo: game.awayTeam.logo
          },
          homeTeam: {
            id: game.homeTeam.id,
            abbrev: game.homeTeam.abbrev,
            name: game.homeTeam.placeName?.default,
            logo: game.homeTeam.logo
          },
          gameState: game.gameState, // FUT, LIVE, FINAL, OFF
          neutralSite: game.neutralSite || false
        });
      }
    }
  }
  
  // Old API format (fallback)
  if (data.dates && Array.isArray(data.dates)) {
    for (const date of data.dates) {
      if (!date.games) continue;
      
      for (const game of date.games) {
        games.push({
          gameId: game.gamePk,
          season: game.season,
          gameType: game.gameType,
          startTime: game.gameDate,
          venue: game.venue?.name || 'Unknown',
          awayTeam: {
            id: game.teams.away.team.id,
            abbrev: game.teams.away.team.abbreviation || game.teams.away.team.name.substring(0, 3).toUpperCase(),
            name: game.teams.away.team.name,
            logo: null
          },
          homeTeam: {
            id: game.teams.home.team.id,
            abbrev: game.teams.home.team.abbreviation || game.teams.home.team.name.substring(0, 3).toUpperCase(),
            name: game.teams.home.team.name,
            logo: null
          },
          gameState: game.status.detailedState,
          neutralSite: false
        });
      }
    }
  }
  
  return games;
}

/**
 * Fetch player game log (last N games for SOG trends)
 */
export async function fetchPlayerGameLog(playerId, season = '20252026', limit = 10) {
  const newUrl = `${NHL_API_NEW}/player/${playerId}/game-log/${season}/2`; // 2 = regular season
  const oldUrl = `${NHL_API_OLD}/people/${playerId}/stats?stats=gameLog&season=${season}`;
  
  try {
    const data = await fetchWithFallback(newUrl, oldUrl);
    return parsePlayerGameLog(data, limit);
  } catch (error) {
    console.error(`❌ Error fetching game log for player ${playerId}:`, error);
    return [];
  }
}

/**
 * Parse player game log into SOG-focused stats
 * Handles both new and old API formats
 */
function parsePlayerGameLog(data, limit) {
  let gameLog = [];
  
  // New API format
  if (data.gameLog && Array.isArray(data.gameLog)) {
    gameLog = data.gameLog.slice(0, limit).map(game => ({
      gameId: game.gameId,
      gameDate: game.gameDate,
      homeRoad: game.homeRoadFlag, // H or R
      opponentAbbrev: game.opponentAbbrev,
      goals: game.goals || 0,
      assists: game.assists || 0,
      points: game.points || 0,
      shots: game.shots || 0,
      toi: game.toi, // Time on ice (MM:SS)
      toiSeconds: parseTimeToSeconds(game.toi),
      plusMinus: game.plusMinus || 0,
      powerPlayGoals: game.powerPlayGoals || 0,
      powerPlayPoints: game.powerPlayPoints || 0,
      gameWinningGoals: game.gameWinningGoals || 0,
      otGoals: game.otGoals || 0,
      blockedShots: game.blockedShots || 0,
      hits: game.hits || 0,
      pim: game.pim || 0
    }));
  }
  
  // Old API format (fallback)
  if (data.stats && data.stats[0] && data.stats[0].splits) {
    gameLog = data.stats[0].splits.slice(0, limit).map(game => ({
      gameId: game.game.gamePk,
      gameDate: game.date,
      homeRoad: game.isHome ? 'H' : 'R',
      opponentAbbrev: game.opponent.abbreviation || game.opponent.name.substring(0, 3).toUpperCase(),
      goals: game.stat.goals || 0,
      assists: game.stat.assists || 0,
      points: game.stat.points || 0,
      shots: game.stat.shots || 0,
      toi: game.stat.timeOnIce || '0:00',
      toiSeconds: parseTimeToSeconds(game.stat.timeOnIce || '0:00'),
      plusMinus: game.stat.plusMinus || 0,
      powerPlayGoals: game.stat.powerPlayGoals || 0,
      powerPlayPoints: game.stat.powerPlayPoints || 0,
      gameWinningGoals: game.stat.gameWinningGoals || 0,
      otGoals: game.stat.overTimeGoals || 0,
      blockedShots: game.stat.blocked || 0,
      hits: game.stat.hits || 0,
      pim: game.stat.pim || 0
    }));
  }
  
  return gameLog;
}

/**
 * Fetch team season stats (for opponent adjustments)
 */
export async function fetchTeamStats(teamAbbrev, season = '20252026') {
  const url = `${NHL_STATS_API}/team/summary?cayenneExp=seasonId=${season} and teamAbbrev="${teamAbbrev}"`;
  
  try {
    const data = await fetchWithRetry(url);
    return parseTeamStats(data.data?.[0] || {});
  } catch (error) {
    console.error(`❌ Error fetching team stats for ${teamAbbrev}:`, error);
    return null;
  }
}

/**
 * Parse team stats for defensive metrics (shots allowed, save %)
 */
function parseTeamStats(team) {
  return {
    teamAbbrev: team.teamAbbrev,
    gamesPlayed: team.gamesPlayed || 0,
    wins: team.wins || 0,
    losses: team.losses || 0,
    otLosses: team.otLosses || 0,
    points: team.points || 0,
    goalsFor: team.goalsFor || 0,
    goalsAgainst: team.goalsAgainst || 0,
    shotsForPerGame: team.shotsForPerGame || 0,
    shotsAgainstPerGame: team.shotsAgainstPerGame || 0,
    powerPlayPct: team.powerPlayPct || 0,
    penaltyKillPct: team.penaltyKillPct || 0,
    faceoffWinPct: team.faceoffWinPct || 0,
    savePct: team.savePct || 0,
    shootingPct: team.shootingPct || 0
  };
}

/**
 * Fetch roster for a team (to get all active players)
 */
export async function fetchTeamRoster(teamAbbrev, season = '20252026') {
  const newUrl = `${NHL_API_NEW}/roster/${teamAbbrev}/${season}`;
  const oldUrl = `${NHL_API_OLD}/teams?teamId=${teamAbbrev}&expand=team.roster&season=${season}`;
  
  try {
    const data = await fetchWithFallback(newUrl, oldUrl);
    return parseRoster(data);
  } catch (error) {
    console.error(`❌ Error fetching roster for ${teamAbbrev}:`, error);
    return { forwards: [], defensemen: [], goalies: [] };
  }
}

/**
 * Parse roster into position groups
 * Handles both new and old API formats
 */
function parseRoster(data) {
  const roster = {
    forwards: [],
    defensemen: [],
    goalies: []
  };
  
  // New API format
  if (data.forwards) {
    roster.forwards = data.forwards.map(p => ({
      id: p.id,
      firstName: p.firstName?.default,
      lastName: p.lastName?.default,
      sweaterNumber: p.sweaterNumber,
      positionCode: p.positionCode,
      shootsCatches: p.shootsCatches,
      heightInInches: p.heightInInches,
      weightInPounds: p.weightInPounds,
      birthDate: p.birthDate,
      headshot: p.headshot
    }));
  }
  
  if (data.defensemen) {
    roster.defensemen = data.defensemen.map(p => ({
      id: p.id,
      firstName: p.firstName?.default,
      lastName: p.lastName?.default,
      sweaterNumber: p.sweaterNumber,
      positionCode: p.positionCode,
      shootsCatches: p.shootsCatches,
      heightInInches: p.heightInInches,
      weightInPounds: p.weightInPounds,
      birthDate: p.birthDate,
      headshot: p.headshot
    }));
  }
  
  if (data.goalies) {
    roster.goalies = data.goalies.map(p => ({
      id: p.id,
      firstName: p.firstName?.default,
      lastName: p.lastName?.default,
      sweaterNumber: p.sweaterNumber,
      positionCode: 'G',
      shootsCatches: p.shootsCatches,
      heightInInches: p.heightInInches,
      weightInPounds: p.weightInPounds,
      birthDate: p.birthDate,
      headshot: p.headshot
    }));
  }
  
  // Old API format (fallback)
  if (data.teams && data.teams[0] && data.teams[0].roster) {
    const players = data.teams[0].roster.roster;
    
    for (const p of players) {
      const position = p.position.code;
      const player = {
        id: p.person.id,
        firstName: p.person.firstName,
        lastName: p.person.lastName,
        sweaterNumber: p.jerseyNumber,
        positionCode: position,
        shootsCatches: null,
        heightInInches: null,
        weightInPounds: null,
        birthDate: null,
        headshot: null
      };
      
      if (position === 'G') {
        roster.goalies.push(player);
      } else if (position === 'D') {
        roster.defensemen.push(player);
      } else {
        roster.forwards.push(player);
      }
    }
  }
  
  return roster;
}

/**
 * Helper: Convert time string (MM:SS) to seconds
 */
function parseTimeToSeconds(timeStr) {
  if (!timeStr || timeStr === '0:00') return 0;
  const parts = timeStr.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return 0;
}

/**
 * Export rate limiter for other modules to use
 */
export { rateLimiter };
