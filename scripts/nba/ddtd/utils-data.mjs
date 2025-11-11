/**
 * Data utilities for DD/TD modeling
 * Fetches box scores, lineups, injuries, schedule aligned to ET timezone
 * Integrates with ESPN API and NBA CDN
 */

import https from 'https';

const ET_TIMEZONE = 'America/New_York';

/**
 * Fetch JSON from URL with retry
 * @param {string} url - URL to fetch
 * @param {number} retries - Number of retries
 * @returns {Promise<Object>} Parsed JSON response
 */
export async function fetchJSON(url, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft) => {
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            if (retriesLeft > 0) {
              setTimeout(() => attempt(retriesLeft - 1), 1000);
            } else {
              reject(new Error(`JSON parse failed: ${e.message}`));
            }
          }
        });
      }).on('error', (err) => {
        if (retriesLeft > 0) {
          setTimeout(() => attempt(retriesLeft - 1), 1000);
        } else {
          reject(err);
        }
      });
    };
    attempt(retries);
  });
}

/**
 * Get current date in ET timezone
 * @returns {string} Date string YYYY-MM-DD in ET
 */
export function getCurrentDateET() {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { timeZone: ET_TIMEZONE });
  const etDate = new Date(etString);
  
  const year = etDate.getFullYear();
  const month = String(etDate.getMonth() + 1).padStart(2, '0');
  const day = String(etDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Get ET timestamp string
 * @param {Date} date - Date object
 * @returns {string} ISO string in ET timezone
 */
export function toETTimestamp(date) {
  return date.toLocaleString('en-US', { 
    timeZone: ET_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6');
}

/**
 * Fetch NBA schedule for a specific date
 * @param {string} dateString - Date string YYYY-MM-DD in ET
 * @returns {Promise<Array>} Array of game objects
 */
export async function fetchSchedule(dateString) {
  const [year, month, day] = dateString.split('-');
  const formattedDate = `${year}${month}${day}`;
  
  try {
    // ESPN scoreboard API
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${formattedDate}`;
    const data = await fetchJSON(url);
    
    return (data.events || []).map(event => {
      const competition = event.competitions?.[0] || {};
      const home = competition.competitors?.find(c => c.homeAway === 'home') || {};
      const away = competition.competitors?.find(c => c.homeAway === 'away') || {};
      
      return {
        gameId: event.id,
        date: dateString,
        homeTeam: home.team?.abbreviation || '',
        awayTeam: away.team?.abbreviation || '',
        homeTeamId: home.team?.id || '',
        awayTeamId: away.team?.id || '',
        status: event.status?.type?.name || 'STATUS_SCHEDULED',
        commenceTime: event.date || '',
        homeScore: parseInt(home.score || '0'),
        awayScore: parseInt(away.score || '0')
      };
    });
  } catch (error) {
    console.error(`Error fetching schedule for ${dateString}:`, error.message);
    return [];
  }
}

/**
 * Fetch box score for a specific game
 * @param {string} gameId - ESPN game ID
 * @returns {Promise<Object>} Box score data with player stats
 */
export async function fetchBoxScore(gameId) {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}`;
    const data = await fetchJSON(url);
    
    const boxscore = data.boxscore || {};
    const players = boxscore.players || [];
    
    const stats = [];
    
    for (const team of players) {
      const teamAbbr = team.team?.abbreviation || '';
      
      for (const statGroup of team.statistics || []) {
        for (const athlete of statGroup.athletes || []) {
          const rawStats = athlete.stats || [];
          
          stats.push({
            playerId: athlete.athlete?.id || '',
            playerName: athlete.athlete?.displayName || '',
            team: teamAbbr,
            minutes: parseFloat(rawStats[0] || '0'),
            points: parseInt(rawStats[12] || '0'),
            rebounds: parseInt(rawStats[4] || '0'),
            assists: parseInt(rawStats[3] || '0'),
            steals: parseInt(rawStats[1] || '0'),
            blocks: parseInt(rawStats[2] || '0'),
            turnovers: parseInt(rawStats[11] || '0'),
            fgm: parseInt(rawStats[5] || '0'),
            fga: parseInt(rawStats[6] || '0'),
            tpm: parseInt(rawStats[7] || '0'),
            tpa: parseInt(rawStats[8] || '0'),
            ftm: parseInt(rawStats[9] || '0'),
            fta: parseInt(rawStats[10] || '0')
          });
        }
      }
    }
    
    return {
      gameId,
      players: stats,
      status: data.header?.competitions?.[0]?.status?.type?.name || 'UNKNOWN'
    };
  } catch (error) {
    console.error(`Error fetching box score for ${gameId}:`, error.message);
    return { gameId, players: [], status: 'ERROR' };
  }
}

/**
 * Fetch current injuries for a date
 * @param {string} dateString - Date string YYYY-MM-DD
 * @returns {Promise<Array>} Array of injury objects
 */
export async function fetchInjuries(dateString) {
  try {
    // ESPN injuries endpoint
    const url = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries';
    const data = await fetchJSON(url);
    
    const injuries = [];
    
    for (const teamData of data.injuries || []) {
      const team = teamData.team?.abbreviation || '';
      
      for (const player of teamData.players || []) {
        const injury = player.injury || {};
        
        injuries.push({
          playerId: player.athlete?.id || '',
          playerName: player.athlete?.displayName || '',
          team,
          status: injury.status || 'Unknown',
          description: injury.longComment || injury.type || '',
          type: injury.type || '',
          date: injury.date || dateString
        });
      }
    }
    
    return injuries;
  } catch (error) {
    console.error(`Error fetching injuries:`, error.message);
    return [];
  }
}

/**
 * Fetch starting lineups for games on a date
 * @param {string} dateString - Date string YYYY-MM-DD
 * @returns {Promise<Object>} Map of gameId -> {home: [], away: []} with starter playerIds
 */
export async function fetchLineups(dateString) {
  const games = await fetchSchedule(dateString);
  const lineups = {};
  
  for (const game of games) {
    try {
      // NBA CDN has roster/depth chart data
      const url = `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_${game.gameId}.json`;
      const data = await fetchJSON(url);
      
      // Parse starters from play-by-play (players on court at tip)
      const starters = {
        home: [],
        away: []
      };
      
      // Extract from game.actions where period === 1 and actionType === 'period'
      const actions = data.game?.actions || [];
      const tipAction = actions.find(a => a.period === 1 && a.actionType === 'period');
      
      if (tipAction) {
        starters.home = tipAction.homePlayersOnCourt?.map(p => p.personId) || [];
        starters.away = tipAction.awayPlayersOnCourt?.map(p => p.personId) || [];
      }
      
      lineups[game.gameId] = starters;
    } catch (error) {
      // If CDN fails, fall back to empty starters
      lineups[game.gameId] = { home: [], away: [] };
    }
  }
  
  return lineups;
}

/**
 * Check if game is back-to-back for a team
 * @param {string} team - Team abbreviation
 * @param {string} dateString - Date string YYYY-MM-DD
 * @returns {Promise<boolean>} True if B2B
 */
export async function isBackToBack(team, dateString) {
  const date = new Date(dateString + 'T00:00:00');
  date.setDate(date.getDate() - 1);
  
  const yesterday = date.toISOString().split('T')[0];
  const yesterdayGames = await fetchSchedule(yesterday);
  
  return yesterdayGames.some(g => 
    g.homeTeam === team || g.awayTeam === team
  );
}

/**
 * Fetch recent game logs for a player
 * @param {string} playerId - ESPN player ID
 * @param {number} lastN - Number of recent games to fetch
 * @returns {Promise<Array>} Array of game log objects
 */
export async function fetchPlayerGameLogs(playerId, lastN = 10) {
  try {
    // ESPN player game log endpoint
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/athletes/${playerId}/gamelog`;
    const data = await fetchJSON(url);
    
    const events = data.events || [];
    const logs = events.slice(0, lastN).map(event => {
      const stats = event.statistics || {};
      
      return {
        gameId: event.id || '',
        date: event.gameDate || '',
        opponent: event.opponent?.abbreviation || '',
        minutes: parseFloat(stats.minutes || '0'),
        points: parseInt(stats.points || '0'),
        rebounds: parseInt(stats.totalRebounds || '0'),
        assists: parseInt(stats.assists || '0'),
        started: event.didNotPlay === false && (stats.minutes || 0) > 20
      };
    });
    
    return logs;
  } catch (error) {
    console.error(`Error fetching game logs for player ${playerId}:`, error.message);
    return [];
  }
}

/**
 * Calculate rolling averages from game logs
 * @param {Array} logs - Array of game log objects
 * @param {Array<string>} stats - Stats to average (e.g., ['points', 'rebounds', 'assists'])
 * @returns {Object} Map of stat -> average
 */
export function calculateRollingAverages(logs, stats) {
  const averages = {};
  
  for (const stat of stats) {
    const values = logs.map(log => log[stat] || 0);
    averages[stat] = values.length > 0 
      ? values.reduce((sum, val) => sum + val, 0) / values.length 
      : 0;
  }
  
  return averages;
}

export default {
  fetchJSON,
  getCurrentDateET,
  toETTimestamp,
  fetchSchedule,
  fetchBoxScore,
  fetchInjuries,
  fetchLineups,
  isBackToBack,
  fetchPlayerGameLogs,
  calculateRollingAverages
};
