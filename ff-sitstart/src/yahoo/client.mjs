import axios from 'axios';
import { getAccessToken } from './auth.mjs';
import { logger } from '../util/logger.mjs';
import { CONFIG } from '../config.mjs';

const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

/**
 * Get current NFL game key (e.g., "449" for 2025 season)
 */
export async function getCurrentGameKey() {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/users;use_login=1/games;game_codes=nfl?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const games = response.data?.fantasy_content?.users?.[0]?.user?.[1]?.games;
  if (!games) throw new Error('No NFL games found');
  
  // Get the most recent season (highest game_key)
  const gameList = Array.isArray(games) ? games.filter(g => g?.game) : [games];
  const nflGames = gameList
    .map(g => g.game?.[0])
    .filter(g => g?.code === 'nfl')
    .sort((a, b) => parseInt(b.game_key) - parseInt(a.game_key));
  
  if (nflGames.length === 0) throw new Error('No NFL game found');
  
  return nflGames[0].game_key;
}

/**
 * Get user's leagues for a game
 */
export async function getUserLeagues(gameKey) {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/users;use_login=1/games;game_key=${gameKey}/leagues?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const leagues = response.data?.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;
  if (!leagues) return [];
  
  const leagueList = Array.isArray(leagues) ? leagues.filter(l => l?.league) : [leagues];
  
  return leagueList.map(l => {
    const league = l.league?.[0];
    return {
      key: league?.league_key,
      id: league?.league_id,
      name: league?.name,
      numTeams: parseInt(league?.num_teams) || 0,
      currentWeek: parseInt(league?.current_week) || 1
    };
  });
}

/**
 * Get league settings and normalize scoring rules
 */
export async function getLeagueSettings(leagueKey) {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/league/${leagueKey}/settings?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const settings = response.data?.fantasy_content?.league?.[1]?.settings?.[0];
  if (!settings) throw new Error(`No settings found for league ${leagueKey}`);
  
  // Extract roster positions
  const rosterPositions = settings.roster_positions || [];
  const positions = Array.isArray(rosterPositions) ? rosterPositions.filter(p => p?.roster_position) : [rosterPositions];
  
  const positionCounts = {};
  positions.forEach(p => {
    const pos = p.roster_position;
    positionCounts[pos.position] = parseInt(pos.count) || 0;
  });
  
  // Extract scoring rules
  const statCategories = settings.stat_categories?.stats || [];
  const stats = Array.isArray(statCategories) ? statCategories.filter(s => s?.stat) : [statCategories];
  
  const scoringRules = {
    passYardPoint: 0.04,     // default 1/25
    passTDPts: 4,
    intPts: -2,
    rushYardPoint: 0.1,      // default 1/10
    recYardPoint: 0.1,
    receptionPoint: CONFIG.defaults.pprFallback, // will override if found
    tdPts: 6,
    fumbleLostPts: -2,
    dstPointsAllowedBuckets: CONFIG.dstPointsAllowed
  };
  
  // Map Yahoo stat IDs to our rules
  const statMap = {
    '4': 'passYardPoint',    // Passing Yards (value / points)
    '5': 'passTDPts',        // Passing TD
    '6': 'intPts',           // Interceptions
    '9': 'rushYardPoint',    // Rushing Yards
    '10': 'tdPts',           // Rushing TD (will also use for rec TD)
    '11': 'recYardPoint',    // Receiving Yards
    '12': 'receptionPoint',  // Receptions (PPR)
    '13': 'tdPts',           // Receiving TD (same as rushing)
    '18': 'fumbleLostPts'    // Fumbles Lost
  };
  
  stats.forEach(s => {
    const stat = s.stat;
    const statId = stat?.stat_id?.toString();
    const value = parseFloat(stat?.value);
    
    if (statMap[statId] && !isNaN(value)) {
      const key = statMap[statId];
      
      // For yardage stats, convert to points per yard
      if (key === 'passYardPoint' && value !== 0) {
        scoringRules.passYardPoint = 1 / value; // e.g., 25 yards = 1 pt → 0.04 per yard
      } else if (key === 'rushYardPoint' && value !== 0) {
        scoringRules.rushYardPoint = 1 / value;
      } else if (key === 'recYardPoint' && value !== 0) {
        scoringRules.recYardPoint = 1 / value;
      } else {
        scoringRules[key] = value;
      }
    }
  });
  
  return {
    leagueKey,
    name: response.data?.fantasy_content?.league?.[0]?.name || 'Unknown',
    positionCounts,
    scoringRules
  };
}

/**
 * Get all teams in a league
 */
export async function getLeagueTeams(leagueKey) {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/league/${leagueKey}/teams?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const teams = response.data?.fantasy_content?.league?.[1]?.teams;
  if (!teams) return [];
  
  const teamList = Array.isArray(teams) ? teams.filter(t => t?.team) : [teams];
  
  return teamList.map(t => {
    const team = t.team?.[0];
    return {
      key: team?.team_key,
      id: team?.team_id,
      name: team?.name,
      isOwnedByCurrentUser: team?.is_owned_by_current_user === '1'
    };
  });
}

/**
 * Get roster for a team in a specific week
 */
export async function getTeamRoster(teamKey, week) {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/team/${teamKey}/roster;week=${week}?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const roster = response.data?.fantasy_content?.team?.[1]?.roster;
  if (!roster) return [];
  
  const players = roster?.[0]?.players;
  const playerList = Array.isArray(players) ? players.filter(p => p?.player) : [players];
  
  return playerList.map(p => {
    const player = p.player?.[0];
    const selectedPosition = p.player?.[1]?.selected_position?.[1]?.position || 'BN';
    
    return {
      key: player?.player_key,
      id: player?.player_id,
      full_name: player?.name?.full || '',
      first_name: player?.name?.first || '',
      last_name: player?.name?.last || '',
      positions: player?.eligible_positions?.position || [],
      team_abbr: player?.editorial_team_abbr || '',
      status: player?.status || '',  // Q, D, O, IR, etc.
      is_on_bye: player?.bye_weeks?.week === week.toString(),
      slot: selectedPosition
    };
  });
}

/**
 * Get current week for a league
 */
export async function getCurrentWeek(leagueKey) {
  const token = await getAccessToken();
  const url = `${YAHOO_API_BASE}/league/${leagueKey}?format=json`;
  
  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  const league = response.data?.fantasy_content?.league?.[0];
  return parseInt(league?.current_week) || 1;
}

/**
 * Log scoring summary (one line)
 */
export function logScoringSummary(scoringRules) {
  const ppr = scoringRules.receptionPoint === 1 ? 'Full-PPR (1.0)' :
              scoringRules.receptionPoint === 0.5 ? 'Half-PPR (0.5)' :
              scoringRules.receptionPoint === 0 ? 'Standard (0.0)' :
              `PPR (${scoringRules.receptionPoint.toFixed(1)})`;
  
  const passYards = Math.round(1 / scoringRules.passYardPoint);
  const rushYards = Math.round(1 / scoringRules.rushYardPoint);
  const recYards = Math.round(1 / scoringRules.recYardPoint);
  
  logger.info(
    `Scoring: ${ppr}, passTD=${scoringRules.passTDPts}, INT=${scoringRules.intPts}, ` +
    `yards: pass 1/${passYards}, rush/rec 1/${rushYards}`
  );
}
