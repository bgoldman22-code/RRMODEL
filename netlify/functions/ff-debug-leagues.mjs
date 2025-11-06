/**
 * Debug function to list all Yahoo Fantasy games and leagues
 * 
 * Helps troubleshoot league detection issues
 */

import { ensureAuth } from './_lib/ff-blobs.mjs';

const YAHOO_API_BASE = 'https://fantasysports.yahooapis.com/fantasy/v2';

export const handler = async (event, context) => {
  try {
    // Get access token
    const accessToken = await ensureAuth();
    if (!accessToken) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          error: 'Authentication required',
          message: 'Please complete OAuth flow first'
        })
      };
    }

    console.log('Fetching all games and leagues...');

    // Get ALL games (not just NFL)
    const gamesUrl = `${YAHOO_API_BASE}/users;use_login=1/games?format=json`;
    const gamesResponse = await fetch(gamesUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    });

    if (!gamesResponse.ok) {
      const errorText = await gamesResponse.text();
      throw new Error(`Yahoo API error: ${errorText}`);
    }

    const gamesData = await gamesResponse.json();
    const games = gamesData.fantasy_content?.users?.[0]?.user?.[1]?.games;

    const result = {
      raw_response: gamesData,
      parsed_games: [],
      all_leagues: []
    };

    // Parse games
    if (games) {
      for (let i = 0; i < games.count; i++) {
        const game = games[i]?.game;
        if (game) {
          const gameInfo = game[0];
          result.parsed_games.push({
            game_key: gameInfo.game_key,
            game_id: gameInfo.game_id,
            name: gameInfo.name,
            code: gameInfo.code,
            type: gameInfo.type,
            url: gameInfo.url,
            season: gameInfo.season
          });

          // Try to get leagues for this game
          const leaguesUrl = `${YAHOO_API_BASE}/users;use_login=1/games;game_key=${gameInfo.game_key}/leagues?format=json`;
          try {
            const leaguesResponse = await fetch(leaguesUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Accept': 'application/json'
              }
            });

            if (leaguesResponse.ok) {
              const leaguesData = await leaguesResponse.json();
              const gameData = leaguesData.fantasy_content?.users?.[0]?.user?.[1]?.games?.[0]?.game?.[1]?.leagues;
              
              if (gameData && gameData.count > 0) {
                for (let j = 0; j < gameData.count; j++) {
                  const league = gameData[j]?.league?.[0];
                  if (league) {
                    result.all_leagues.push({
                      game_key: gameInfo.game_key,
                      game_name: gameInfo.name,
                      league_key: league.league_key,
                      league_id: league.league_id,
                      name: league.name,
                      num_teams: league.num_teams,
                      scoring_type: league.scoring_type,
                      season: league.season,
                      url: league.url
                    });
                  }
                }
              }
            }
          } catch (leagueError) {
            console.error(`Error fetching leagues for game ${gameInfo.game_key}:`, leagueError.message);
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify(result, null, 2)
    };

  } catch (error) {
    console.error('Debug error:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
