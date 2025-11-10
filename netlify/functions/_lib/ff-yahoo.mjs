/**
 * Yahoo Fantasy API Client (Serverless)
 * 
 * Provides functions to interact with Yahoo Fantasy Sports API.
 * Adapted for Netlify Functions (uses passed access tokens, no filesystem).
 * 
 * Key Endpoints:
 * - getCurrentGameKey: Get current NFL season ID
 * - getUserLeagues: List user's leagues for a game
 * - getLeagueSettings: Get scoring rules + roster positions
 * - getLeagueTeams: Get all teams in league
 * - getTeamRoster: Get player roster for specific team + week
 * - getCurrentWeek: Get current week number for league
 * 
 * API Docs: https://developer.yahoo.com/fantasysports/guide/
 */

const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

/**
 * Make authenticated request to Yahoo Fantasy API
 * @param {string} accessToken - OAuth access token
 * @param {string} endpoint - API endpoint (e.g., '/users;use_login=1/games')
 * @returns {Promise<Object>} Parsed JSON response
 */
async function yahooRequest(accessToken, endpoint) {
  const url = `${YAHOO_API_BASE}${endpoint}?format=json`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Yahoo API error (${response.status}): ${errorText}`);
  }

  return response.json();
}

/**
 * Get current NFL game key (e.g., "449" for 2025 season)
 * @param {string} accessToken - OAuth access token
 * @param {number|null} requestedSeason - Optional: specific year to find (e.g., 2024, 2025)
 * @returns {Promise<string>} Game key (e.g., "449")
 */
export async function getCurrentGameKey(accessToken, requestedSeason = null) {
  try {
    const data = await yahooRequest(accessToken, '/users;use_login=1/games;game_codes=nfl');
    
    // Navigate nested response structure
    const games = data.fantasy_content?.users?.[0]?.user?.[1]?.games;
    if (!games) {
      throw new Error('No NFL games found in API response');
    }

    // Games are returned as array with count at [0]
    const gamesArray = Object.values(games).filter(g => typeof g === 'object' && g.game);
    
    if (gamesArray.length === 0) {
      throw new Error('No NFL game data found');
    }

    console.log(`Found ${gamesArray.length} NFL games, checking for ${requestedSeason || 'current'} season...`);

    // Determine target season
    const targetSeason = requestedSeason || new Date().getFullYear();
    let currentGame = null;

    // Look through all games to find target season
    for (const gameObj of gamesArray) {
      const game = gameObj.game[0];
      console.log(`  Game ${game.game_key}: ${game.name} - ${game.season}`);
      
      if (parseInt(game.season) === targetSeason) {
        currentGame = game;
        break;
      }
    }

    // If no matching season found, use the highest game_key (most recent)
    if (!currentGame) {
      console.log(`No ${targetSeason} season found, using most recent game...`);
      // Sort by game_key descending (higher = more recent)
      gamesArray.sort((a, b) => {
        const keyA = parseInt(a.game[0].game_key);
        const keyB = parseInt(b.game[0].game_key);
        return keyB - keyA;
      });
      currentGame = gamesArray[0].game[0];
    }

    const gameKey = currentGame.game_key;
    console.log(`✓ Using NFL game key: ${gameKey} (${currentGame.season} season)`);
    return gameKey;
  } catch (error) {
    console.error('Error fetching current game key:', error.message);
    throw error;
  }
}

/**
 * Get user's fantasy leagues for a specific game
 * According to Yahoo API docs, we should use /teams endpoint, not /leagues
 * @param {string} accessToken - OAuth access token
 * @param {string} gameKey - Game key from getCurrentGameKey (e.g., "449")
 * @returns {Promise<Array>} Array of league objects (derived from teams)
 */
export async function getUserLeagues(accessToken, gameKey) {
  try {
    // Yahoo API: /users;use_login=1/games;game_keys=nfl/teams
    // This returns ALL teams for the user in NFL games, then we filter by game_key
    const data = await yahooRequest(accessToken, `/users;use_login=1/games;game_keys=nfl/teams`);
    
    console.log('Yahoo API teams response:', JSON.stringify(data, null, 2));
    
    const users = data.fantasy_content?.users;
    if (!users) {
      throw new Error('No users found in API response');
    }

    // Navigate: users[0].user[1].games
    const games = users[0]?.user?.[1]?.games;
    if (!games) {
      console.log('No games found in user data');
      return [];
    }

    // Games is an array-like object with count at [0]
    const leagues = [];
    const leaguesSeen = new Set();

    // Iterate through games array (skip [0] which is count)
    for (let i = 0; i < games.count; i++) {
      const gameObj = games[i]?.game;
      if (!gameObj) continue;

      // Check if this is the game we want
      const gameInfo = gameObj[0];
      if (gameInfo.game_key !== gameKey) {
        console.log(`Skipping game ${gameInfo.game_key} (looking for ${gameKey})`);
        continue;
      }

      // Get teams for this game
      const teams = gameObj[1]?.teams;
      if (!teams) continue;

      // Each team has a league - extract unique leagues
      for (let j = 0; j < teams.count; j++) {
        const teamWrapper = teams[j]?.team;
        if (!teamWrapper) continue;

        // Team data is in team[0] as an array of objects
        // Example: team[0] = [{ team_key: "..." }, { team_id: "..." }, { name: "..." }, ...]
        const teamDataArray = teamWrapper[0];
        if (!Array.isArray(teamDataArray)) continue;

        // Extract team_key and name from the array
        let teamKey = null;
        let teamName = null;

        for (const item of teamDataArray) {
          if (item && typeof item === 'object') {
            if (item.team_key) teamKey = item.team_key;
            if (item.name) teamName = item.name;
          }
        }

        if (!teamKey) {
          console.log('Skipping team without team_key');
          continue;
        }

        // Extract league info from team_key (format: game_key.l.league_id.t.team_id)
        const leagueMatch = teamKey.match(/\.l\.(\d+)/);
        if (!leagueMatch) {
          console.log(`Could not parse league from team_key: ${teamKey}`);
          continue;
        }

        const leagueId = leagueMatch[1];
        const leagueKey = `${gameKey}.l.${leagueId}`;

        // Only add each league once
        if (!leaguesSeen.has(leagueKey)) {
          leaguesSeen.add(leagueKey);
          leagues.push({
            league_key: leagueKey,
            league_id: leagueId,
            name: teamName || 'Unknown', // Team name (we'll get real league name later from settings)
            team_key: teamKey,
            team_name: teamName || 'Unknown'
          });
        }
      }
    }

    console.log(`Found ${leagues.length} leagues for game ${gameKey} via teams endpoint`);
    return leagues;
  } catch (error) {
    console.error('Error fetching user leagues via teams:', error.message);
    throw error;
  }
}

/**
 * Get league scoring settings and roster positions
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key (e.g., "449.l.12345")
 * @returns {Promise<Object>} Normalized scoring rules
 */
export async function getLeagueSettings(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/settings`);
    
    const settings = data.fantasy_content?.league?.[1]?.settings?.[0];
    if (!settings) {
      console.warn('No settings found in API response, using defaults');
      // Return defaults if API doesn't provide settings
      return {
        scoringRules: {
          passYards: 0.04,
          passTD: 4,
          passInt: -2,
          rushYards: 0.1,
          rushTD: 6,
          recYards: 0.1,
          reception: 0,
          recTD: 6,
          fumble: -2,
          twoPtConversion: 2
        },
        positionCounts: { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DEF: 1, BN: 6 },
        pprType: 'Standard'
      };
    }

    // Extract scoring rules
    const statCategories = settings.stat_categories?.stats || [];
    console.log(`Found ${statCategories.length} stat categories in league settings`);
    
    const scoringRules = {
      passYards: 0.04,      // Default: 1 pt per 25 yards
      passTD: 4,            // Default: 4 pts per TD
      passInt: -2,          // Default: -2 pts per INT
      rushYards: 0.1,       // Default: 1 pt per 10 yards
      rushTD: 6,            // Default: 6 pts per TD
      recYards: 0.1,        // Default: 1 pt per 10 yards
      reception: 0,         // Default: 0 (Standard), check for PPR
      recTD: 6,             // Default: 6 pts per TD
      fumble: -2,           // Default: -2 pts per fumble
      twoPtConversion: 2    // Default: 2 pts per 2PC
    };

    // Parse stat categories to override defaults
    for (const stat of statCategories) {
      const statInfo = stat.stat;
      if (!statInfo) continue;

      const statId = statInfo.stat_id;
      const value = parseFloat(statInfo.value || 0);

      // Map stat IDs to scoring rules
      // Common Yahoo stat IDs (may vary by league):
      if (statId === 5) scoringRules.passYards = value / 25;           // Passing Yards (per 25)
      if (statId === 4) scoringRules.passTD = value;                   // Passing TD
      if (statId === 19) scoringRules.passInt = value;                 // Interceptions
      if (statId === 9) scoringRules.rushYards = value / 10;           // Rushing Yards (per 10)
      if (statId === 10) scoringRules.rushTD = value;                  // Rushing TD
      if (statId === 12) scoringRules.recYards = value / 10;           // Receiving Yards (per 10)
      if (statId === 11) scoringRules.reception = value;               // Reception (PPR)
      if (statId === 13) scoringRules.recTD = value;                   // Receiving TD
      if (statId === 18) scoringRules.fumble = value;                  // Fumbles Lost
      if (statId === 16) scoringRules.twoPtConversion = value;         // 2-Point Conversions
    }

    // Determine PPR type
    let pprType = 'Standard';
    if (scoringRules.reception === 1) pprType = 'Full PPR';
    else if (scoringRules.reception === 0.5) pprType = 'Half PPR';
    else if (scoringRules.reception > 0) pprType = `${scoringRules.reception} PPR`;

    // Extract roster positions
    const rosterPositions = settings.roster_positions?.roster_position || [];
    const positionCounts = {};
    
    for (const pos of rosterPositions) {
      const position = pos.position;
      const count = parseInt(pos.count, 10) || 0;
      positionCounts[position] = (positionCounts[position] || 0) + count;
    }

    console.log(`League scoring: ${pprType}, passTD=${scoringRules.passTD}, INT=${scoringRules.passInt}, rushTD=${scoringRules.rushTD}, recTD=${scoringRules.recTD}`);
    console.log(`Roster positions:`, positionCounts);

    return {
      scoringRules,
      positionCounts,
      pprType
    };
  } catch (error) {
    console.error('Error fetching league settings:', error.message);
    throw error;
  }
}

/**
 * Get all teams in a league
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @returns {Promise<Array>} Array of team objects
 */
export async function getLeagueTeams(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/teams`);
    
    const teamsData = data.fantasy_content?.league?.[1]?.teams;
    if (!teamsData) {
      throw new Error('No teams found in API response');
    }

    const teams = [];
    for (let i = 0; i < teamsData.count; i++) {
      const team = teamsData[i]?.team?.[0];
      if (team) {
        teams.push({
          team_key: team.team_key,
          team_id: team.team_id,
          name: team.name,
          manager: team.managers?.[0]?.manager?.nickname
        });
      }
    }

    console.log(`Found ${teams.length} teams in league ${leagueKey}`);
    return teams;
  } catch (error) {
    console.error('Error fetching league teams:', error.message);
    throw error;
  }
}

/**
 * Get team roster for specific week
 * @param {string} accessToken - OAuth access token
 * @param {string} teamKey - Team key (e.g., "449.l.12345.t.1")
 * @param {number} week - Week number
 * @returns {Promise<Array>} Array of player objects with positions
 */
export async function getTeamRoster(accessToken, teamKey, week) {
  try {
    const data = await yahooRequest(accessToken, `/team/${teamKey}/roster;week=${week}`);
    
    const roster = data.fantasy_content?.team?.[1]?.roster;
    if (!roster) {
      throw new Error('No roster found in API response');
    }

    const players = [];
    const playersData = roster[0]?.players;
    
    if (!playersData) {
      console.log('No players found in roster');
      return [];
    }

    for (let i = 0; i < playersData.count; i++) {
      const playerData = playersData[i]?.player;
      if (!playerData) continue;

      const player = playerData[0];
      const position = player.selected_position?.[1]?.position;
      const status = player.status || null;
      const byeWeek = parseInt(player.bye_weeks?.week, 10) || null;

      players.push({
        player_key: player.player_key,
        player_id: player.player_id,
        name: player.name?.full,
        position: player.display_position,
        team: player.editorial_team_abbr,
        status: status,                    // Q, D, O, IR, etc.
        bye_week: byeWeek,
        slot: position || 'BN'             // QB, RB, WR, TE, FLEX, K, DEF, BN
      });
    }

    console.log(`Fetched ${players.length} players from roster for week ${week}`);
    return players;
  } catch (error) {
    console.error('Error fetching team roster:', error.message);
    throw error;
  }
}

/**
 * Get current week number for a league
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @returns {Promise<number>} Current week number
 */
export async function getCurrentWeek(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}`);
    
    const league = data.fantasy_content?.league?.[0];
    if (!league) {
      throw new Error('No league data found in API response');
    }

    const currentWeek = parseInt(league.current_week, 10);
    
    if (isNaN(currentWeek)) {
      throw new Error('Invalid current week in API response');
    }

    console.log(`Current week for league ${leagueKey}: ${currentWeek}`);
    return currentWeek;
  } catch (error) {
    console.error('Error fetching current week:', error.message);
    throw error;
  }
}

/**
 * Get league scoreboard for a specific week
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @param {number} week - Week number
 * @returns {Promise<Object>} Scoreboard data
 */
export async function getLeagueScoreboard(accessToken, leagueKey, week) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/scoreboard;week=${week}`);
    return data.fantasy_content?.league?.[1]?.scoreboard || {};
  } catch (error) {
    console.error('Error fetching league scoreboard:', error.message);
    throw error;
  }
}

/**
 * Get league standings
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @returns {Promise<Object>} Standings data
 */
export async function getLeagueStandings(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/standings`);
    return data.fantasy_content?.league?.[1]?.standings || {};
  } catch (error) {
    console.error('Error fetching league standings:', error.message);
    throw error;
  }
}

/**
 * Get league transactions
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @returns {Promise<Array>} Transactions array
 */
export async function getLeagueTransactions(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/transactions`);
    const transactions = data.fantasy_content?.league?.[1]?.transactions;
    return Array.isArray(transactions) ? transactions : [];
  } catch (error) {
    console.error('Error fetching league transactions:', error.message);
    return []; // Return empty array on error
  }
}

/**
 * Get team stats for a specific week
 * @param {string} accessToken - OAuth access token
 * @param {string} teamKey - Team key
 * @param {number} week - Week number
 * @returns {Promise<Object>} Team stats
 */
export async function getTeamStats(accessToken, teamKey, week) {
  try {
    const data = await yahooRequest(accessToken, `/team/${teamKey}/stats;type=week;week=${week}`);
    return data.fantasy_content?.team?.[1]?.team_stats || {};
  } catch (error) {
    console.error('Error fetching team stats:', error.message);
    throw error;
  }
}
