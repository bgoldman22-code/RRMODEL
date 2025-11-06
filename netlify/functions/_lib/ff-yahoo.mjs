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
    const statModifiers = settings.stat_modifiers?.stats || [];
    
    console.log(`Found ${statCategories.length} stat categories in league settings`);
    console.log(`Found ${statModifiers.length} stat modifiers (scoring rules)`);
    
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

    // Parse stat MODIFIERS (actual scoring values)
    const statsToCheck = statModifiers.length > 0 ? statModifiers : statCategories;
    
    for (const stat of statsToCheck) {
      // stat could be { stat: {...} } or just the stat object directly
      const statInfo = stat.stat || stat;
      if (!statInfo) continue;

      const statId = statInfo.stat_id;
      // Yahoo returns scoring value in different places - try all possibilities
      const value = parseFloat(
        statInfo.value ||
        statInfo.points ||
        statInfo.bonus_value ||
        statInfo.display_value ||
        (statInfo.stat_position_types?.[0]?.stat_position_type?.value) ||
        (statInfo.stat_position_types?.[0]?.stat_position_type?.bonus_value) ||
        0
      );

      // Log first few stats to debug the structure
      if (statsToCheck.indexOf(stat) < 5) {
        console.log(`  Stat ID ${statId}: value=${value}, statInfo=`, JSON.stringify(statInfo).substring(0, 300));
      }

      // Map stat IDs to scoring rules (Yahoo 2025 stat IDs)
      // Note: Some values are "per X yards" (25 pass, 10 rush/rec), others are per event
      if (statId === 4) {
        // Passing Yards: Yahoo gives points per yard (e.g., 0.04 = 1 pt per 25 yards)
        scoringRules.passYards = value;
      }
      if (statId === 5) scoringRules.passTD = value;                   // Passing TD
      if (statId === 6) scoringRules.passInt = value;                  // Interceptions
      if (statId === 8) {
        // Rushing Yards: Yahoo gives points per yard (e.g., 0.1 = 1 pt per 10 yards)
        scoringRules.rushYards = value;
      }
      if (statId === 9) scoringRules.rushTD = value;                   // Rushing TD
      if (statId === 11) {
        // Receiving Yards: Yahoo gives points per yard
        scoringRules.recYards = value;
      }
      if (statId === 10) scoringRules.reception = value;               // Reception (PPR)
      if (statId === 12) scoringRules.recTD = value;                   // Receiving TD
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

      // Yahoo API returns player data as nested arrays similar to team data
      // playerData is an array: [0] = array of player info objects, [1] = selected_position data
      const playerInfo = playerData[0]; // Array of objects
      const positionInfo = playerData[1]; // Selected position object

      // Extract values from the array of objects
      let playerKey, playerId, playerName, displayPosition, teamAbbr, byeWeek, status;
      
      for (const item of playerInfo) {
        if (item.player_key) playerKey = item.player_key;
        if (item.player_id) playerId = item.player_id;
        if (item.name?.full) playerName = item.name.full;
        if (item.display_position) displayPosition = item.display_position;
        if (item.editorial_team_abbr) teamAbbr = item.editorial_team_abbr;
        if (item.bye_weeks?.week) byeWeek = parseInt(item.bye_weeks.week, 10);
        if (item.status) status = item.status;
      }

      // Get selected position (starting slot)
      const selectedPosition = positionInfo?.selected_position?.[1]?.position || 'BN';

      players.push({
        player_key: playerKey,
        player_id: playerId,
        name: playerName,
        position: displayPosition,
        team: teamAbbr,
        status: status || null,
        bye_week: byeWeek || null,
        slot: selectedPosition
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
 * Get league scoreboard (matchups) for a specific week
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @param {number} week - Week number
 * @returns {Promise<Array>} Array of matchup objects
 */
export async function getLeagueScoreboard(accessToken, leagueKey, week) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/scoreboard;week=${week}`);
    
    const scoreboard = data.fantasy_content?.league?.[1]?.scoreboard?.[0];
    if (!scoreboard) {
      throw new Error('No scoreboard found in API response');
    }

    const matchups = [];
    const matchupsData = scoreboard.matchups;
    
    for (let i = 0; i < matchupsData.count; i++) {
      const matchupData = matchupsData[i]?.matchup;
      if (!matchupData) continue;

      const teamsData = matchupData[0]?.teams;
      if (!teamsData || teamsData.count !== 2) continue;

      const team1Data = teamsData[0]?.team;
      const team2Data = teamsData[1]?.team;

      // Parse team 1
      const team1Info = team1Data[0];
      let team1Key, team1Name, team1Points, team1Projected;
      for (const item of team1Info) {
        if (item.team_key) team1Key = item.team_key;
        if (item.name) team1Name = item.name;
      }
      const team1Stats = team1Data[1]?.team_points;
      if (team1Stats) {
        team1Points = parseFloat(team1Stats.total || 0);
      }
      const team1Proj = team1Data[1]?.team_projected_points;
      if (team1Proj) {
        team1Projected = parseFloat(team1Proj.total || 0);
      }

      // Parse team 2
      const team2Info = team2Data[0];
      let team2Key, team2Name, team2Points, team2Projected;
      for (const item of team2Info) {
        if (item.team_key) team2Key = item.team_key;
        if (item.name) team2Name = item.name;
      }
      const team2Stats = team2Data[1]?.team_points;
      if (team2Stats) {
        team2Points = parseFloat(team2Stats.total || 0);
      }
      const team2Proj = team2Data[1]?.team_projected_points;
      if (team2Proj) {
        team2Projected = parseFloat(team2Proj.total || 0);
      }

      matchups.push({
        week,
        team1: {
          team_key: team1Key,
          name: team1Name,
          points: team1Points,
          projected: team1Projected
        },
        team2: {
          team_key: team2Key,
          name: team2Name,
          points: team2Points,
          projected: team2Projected
        },
        winner: team1Points > team2Points ? team1Key : team2Key
      });
    }

    console.log(`Fetched ${matchups.length} matchups for week ${week}`);
    return matchups;
  } catch (error) {
    console.error('Error fetching league scoreboard:', error.message);
    throw error;
  }
}

/**
 * Get league transactions for a specific week
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @param {number} week - Week number
 * @returns {Promise<Array>} Array of transaction objects
 */
export async function getLeagueTransactions(accessToken, leagueKey, week) {
  try {
    const data = await yahooRequest(
      accessToken, 
      `/league/${leagueKey}/transactions;types=add,drop,trade;week=${week}`
    );
    
    const transactionsData = data.fantasy_content?.league?.[1]?.transactions;
    if (!transactionsData) {
      return [];
    }

    const transactions = [];
    for (let i = 0; i < transactionsData.count; i++) {
      const txData = transactionsData[i]?.transaction;
      if (!txData) continue;

      const txInfo = txData[0];
      let type, timestamp, teamKey;
      
      for (const item of txInfo) {
        if (item.type) type = item.type;
        if (item.timestamp) timestamp = item.timestamp;
      }

      // Get team from players array
      const playersData = txData[1]?.players;
      const players = [];
      
      if (playersData) {
        for (let j = 0; j < playersData.count; j++) {
          const playerData = playersData[j]?.player;
          if (!playerData) continue;

          const playerInfo = playerData[0];
          let playerName, transactionType, destTeam;

          for (const item of playerInfo) {
            if (item.name?.full) playerName = item.name.full;
          }

          const txData = playerData[1]?.transaction_data;
          if (txData) {
            transactionType = txData[0]?.type;
            destTeam = txData[0]?.destination_team_key;
            if (destTeam) teamKey = destTeam;
          }

          players.push({
            name: playerName,
            type: transactionType
          });
        }
      }

      transactions.push({
        type,
        timestamp,
        team_key: teamKey,
        players
      });
    }

    console.log(`Fetched ${transactions.length} transactions for week ${week}`);
    return transactions;
  } catch (error) {
    console.warn('Error fetching league transactions:', error.message);
    return [];
  }
}

/**
 * Get league standings
 * @param {string} accessToken - OAuth access token
 * @param {string} leagueKey - League key
 * @returns {Promise<Array>} Array of team standings
 */
export async function getLeagueStandings(accessToken, leagueKey) {
  try {
    const data = await yahooRequest(accessToken, `/league/${leagueKey}/standings`);
    
    const standings = data.fantasy_content?.league?.[1]?.standings?.[0]?.teams;
    if (!standings) {
      throw new Error('No standings found in API response');
    }

    const teams = [];
    for (let i = 0; i < standings.count; i++) {
      const teamData = standings[i]?.team;
      if (!teamData) continue;

      const teamInfo = teamData[0];
      let teamKey, teamName, rank;

      for (const item of teamInfo) {
        if (item.team_key) teamKey = item.team_key;
        if (item.name) teamName = item.name;
      }

      const standingsData = teamData[1]?.team_standings;
      if (standingsData) {
        rank = parseInt(standingsData.rank || 0, 10);
      }

      const outcomeData = teamData[1]?.team_standings?.outcome_totals;
      let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
      
      if (outcomeData) {
        wins = parseInt(outcomeData.wins || 0, 10);
        losses = parseInt(outcomeData.losses || 0, 10);
        ties = parseInt(outcomeData.ties || 0, 10);
        pointsFor = parseFloat(outcomeData.points_for || 0);
        pointsAgainst = parseFloat(outcomeData.points_against || 0);
      }

      teams.push({
        team_key: teamKey,
        name: teamName,
        rank,
        wins,
        losses,
        ties,
        points_for: pointsFor,
        points_against: pointsAgainst
      });
    }

    console.log(`Fetched standings for ${teams.length} teams`);
    return teams;
  } catch (error) {
    console.error('Error fetching league standings:', error.message);
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
