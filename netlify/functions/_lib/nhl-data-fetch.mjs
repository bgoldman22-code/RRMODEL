// netlify/functions/_lib/nhl-data-fetch.mjs
// Elite NHL data aggregation - API, advanced stats, and venue corrections

/**
 * NHL API ENDPOINTS (Official NHL Stats API v1)
 */
const NHL_API_BASE = 'https://api-web.nhle.com/v1';
const NHL_STATS_API = 'https://api.nhle.com/stats/rest/en';

/**
 * Fetch today's NHL schedule with all game metadata
 */
export async function fetchTodaySchedule() {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const url = `${NHL_API_BASE}/schedule/${today}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`NHL schedule fetch failed: ${response.status}`);
    
    const data = await response.json();
    return parseSchedule(data);
  } catch (error) {
    console.error('Error fetching NHL schedule:', error);
    return [];
  }
}

/**
 * Parse schedule data into clean game objects
 */
function parseSchedule(data) {
  const games = [];
  
  if (!data.gameWeek || !Array.isArray(data.gameWeek)) return games;
  
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
  
  return games;
}

/**
 * Fetch player game log (last N games for SOG trends)
 */
export async function fetchPlayerGameLog(playerId, season = '20252026', limit = 10) {
  const url = `${NHL_API_BASE}/player/${playerId}/game-log/${season}/2`; // 2 = regular season
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Player game log failed: ${response.status}`);
    
    const data = await response.json();
    return parsePlayerGameLog(data.gameLog || [], limit);
  } catch (error) {
    console.error(`Error fetching game log for player ${playerId}:`, error);
    return [];
  }
}

/**
 * Parse player game log into SOG-focused stats
 */
function parsePlayerGameLog(gameLog, limit) {
  return gameLog.slice(0, limit).map(game => ({
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

/**
 * Fetch team season stats (for opponent adjustments)
 */
export async function fetchTeamStats(teamAbbrev, season = '20252026') {
  const url = `${NHL_STATS_API}/team/summary?cayenneExp=seasonId=${season} and teamAbbrev="${teamAbbrev}"`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Team stats failed: ${response.status}`);
    
    const data = await response.json();
    return parseTeamStats(data.data?.[0] || {});
  } catch (error) {
    console.error(`Error fetching team stats for ${teamAbbrev}:`, error);
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
  const url = `${NHL_API_BASE}/roster/${teamAbbrev}/${season}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Roster fetch failed: ${response.status}`);
    
    const data = await response.json();
    return parseRoster(data);
  } catch (error) {
    console.error(`Error fetching roster for ${teamAbbrev}:`, error);
    return { forwards: [], defensemen: [], goalies: [] };
  }
}

/**
 * Parse roster into position groups
 */
function parseRoster(data) {
  const roster = {
    forwards: [],
    defensemen: [],
    goalies: []
  };
  
  // Parse forwards
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
  
  // Parse defensemen
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
  
  // Parse goalies
  if (data.goalies) {
    roster.goalies = data.goalies.map(p => ({
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
  
  return roster;
}

/**
 * Fetch player bio and season stats
 */
export async function fetchPlayerStats(playerId) {
  const url = `${NHL_API_BASE}/player/${playerId}/landing`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Player stats failed: ${response.status}`);
    
    const data = await response.json();
    return parsePlayerStats(data);
  } catch (error) {
    console.error(`Error fetching player stats for ${playerId}:`, error);
    return null;
  }
}

/**
 * Parse player season stats
 */
function parsePlayerStats(data) {
  const currentSeason = data.featuredStats?.regularSeason?.subSeason || {};
  
  return {
    playerId: data.playerId,
    firstName: data.firstName?.default,
    lastName: data.lastName?.default,
    fullName: `${data.firstName?.default} ${data.lastName?.default}`,
    sweaterNumber: data.sweaterNumber,
    position: data.position,
    teamAbbrev: data.currentTeamAbbrev,
    headshot: data.headshot,
    heightInInches: data.heightInInches,
    weightInPounds: data.weightInPounds,
    birthDate: data.birthDate,
    shootsCatches: data.shootsCatches,
    
    // Current season stats
    seasonStats: {
      gamesPlayed: currentSeason.gamesPlayed || 0,
      goals: currentSeason.goals || 0,
      assists: currentSeason.assists || 0,
      points: currentSeason.points || 0,
      shots: currentSeason.shots || 0,
      shotsPerGame: currentSeason.gamesPlayed > 0 ? (currentSeason.shots || 0) / currentSeason.gamesPlayed : 0,
      shootingPct: currentSeason.shootingPct || 0,
      plusMinus: currentSeason.plusMinus || 0,
      powerPlayGoals: currentSeason.powerPlayGoals || 0,
      powerPlayPoints: currentSeason.powerPlayPoints || 0,
      avgToi: currentSeason.avgToi || '00:00',
      avgToiSeconds: parseTimeToSeconds(currentSeason.avgToi || '00:00'),
      faceoffWinPct: currentSeason.faceoffWinningPctg || 0,
      pim: currentSeason.pim || 0
    }
  };
}

/**
 * Utility: Parse MM:SS time to total seconds
 */
function parseTimeToSeconds(timeString) {
  if (!timeString || typeof timeString !== 'string') return 0;
  
  const parts = timeString.split(':');
  if (parts.length !== 2) return 0;
  
  const minutes = parseInt(parts[0], 10) || 0;
  const seconds = parseInt(parts[1], 10) || 0;
  
  return (minutes * 60) + seconds;
}

/**
 * ADVANCED: Fetch Money Puck data (shots by location, expected goals)
 * Note: Money Puck doesn't have an official API, so this scrapes their CSV exports
 * For production, you'd cache this daily via a cron job
 */
export async function fetchMoneyPuckPlayerStats(season = '2024-2025') {
  const url = `https://moneypuck.com/moneypuck/playerData/seasonSummary/${season}/regular/skaters.csv`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Money Puck fetch failed: ${response.status}`);
    
    const csvText = await response.text();
    return parseMoneyPuckCSV(csvText);
  } catch (error) {
    console.error('Error fetching Money Puck data:', error);
    return [];
  }
}

/**
 * Parse Money Puck CSV into player objects
 */
function parseMoneyPuckCSV(csvText) {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',');
  const players = [];
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const player = {};
    
    for (let j = 0; j < headers.length; j++) {
      player[headers[j]] = values[j];
    }
    
    players.push({
      name: player.name,
      team: player.team,
      position: player.position,
      gamesPlayed: parseFloat(player.games_played) || 0,
      iceTime: parseFloat(player.icetime) || 0,
      iceTimePerGame: parseFloat(player.icetime) / (parseFloat(player.games_played) || 1),
      shots: parseFloat(player.I_F_shots) || 0,
      shotsPerGame: parseFloat(player.I_F_shots) / (parseFloat(player.games_played) || 1),
      expectedGoals: parseFloat(player.I_F_xGoals) || 0,
      expectedGoalsPerShot: parseFloat(player.I_F_xGoals) / (parseFloat(player.I_F_shots) || 1),
      highDangerShots: parseFloat(player.I_F_highDangerShots) || 0,
      rebounds: parseFloat(player.I_F_reboundShots) || 0,
      rushShots: parseFloat(player.I_F_rushShots) || 0
    });
  }
  
  return players;
}

/**
 * ELITE FEATURE: Rest days detection (back-to-backs kill SOG)
 */
export function calculateRestDays(gameDate, previousGameDate) {
  if (!previousGameDate) return 999; // First game of season
  
  const current = new Date(gameDate);
  const previous = new Date(previousGameDate);
  const diffTime = Math.abs(current - previous);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays - 1; // 0 = back-to-back, 1 = one day rest, etc.
}

/**
 * ELITE FEATURE: Home ice advantage adjustment
 * NHL home teams shoot ~1.5 more shots/game than road
 */
export const HOME_ICE_SOG_BOOST = 1.015; // +1.5% SOG for home players
export const ROAD_SOG_PENALTY = 0.985;   // -1.5% SOG for road players

/**
 * ELITE FEATURE: Venue-specific shot inflation
 * Some arenas track more "shots" than others (scoring bias)
 */
export const VENUE_SOG_ADJUSTMENTS = {
  'Bell Centre': 1.03,        // Montreal - generous shot tracking
  'Canadian Tire Centre': 1.02, // Ottawa
  'Rogers Arena': 1.02,       // Vancouver
  'Scotiabank Arena': 1.01,   // Toronto
  'TD Garden': 0.99,          // Boston - stingy tracking
  'Madison Square Garden': 0.98, // NYR
  'Prudential Center': 0.98   // New Jersey
  // Add more as needed based on historical variance
};

export default {
  fetchTodaySchedule,
  fetchPlayerGameLog,
  fetchTeamStats,
  fetchTeamRoster,
  fetchPlayerStats,
  fetchMoneyPuckPlayerStats,
  calculateRestDays,
  HOME_ICE_SOG_BOOST,
  ROAD_SOG_PENALTY,
  VENUE_SOG_ADJUSTMENTS
};
