/**
 * Debug version of generate-daily-predictions
 * Shows exactly where the pipeline is failing
 */

import { getStore } from '@netlify/blobs';

export default async (req, context) => {
  const debug = {
    step: '',
    error: null,
    data: {}
  };

  try {
    // Step 1: Load from Blobs
    debug.step = '1. Loading from Blobs';
    const store = getStore('nba-data');
    
    const [historicalData, currentData] = await Promise.all([
      store.get('player-boxscores-historical', { type: 'json' }),
      store.get('player-boxscores-current', { type: 'json' })
    ]);
    
    debug.data.blobsLoaded = {
      historical: historicalData?.length || 0,
      current: currentData?.length || 0,
      total: (historicalData?.length || 0) + (currentData?.length || 0)
    };
    
    if (!historicalData || !currentData) {
      debug.error = 'Blobs are empty or missing';
      return new Response(JSON.stringify(debug, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Step 2: Check data structure
    debug.step = '2. Checking data structure';
    const boxscores = [...historicalData, ...currentData];
    debug.data.sampleBoxscore = boxscores[0];
    debug.data.dateRange = {
      oldest: boxscores.reduce((min, b) => b.gameDate < min ? b.gameDate : min, boxscores[0].gameDate),
      newest: boxscores.reduce((max, b) => b.gameDate > max ? b.gameDate : max, boxscores[0].gameDate)
    };
    
    // Step 3: Check top-8 calculation
    debug.step = '3. Calculating top-8 players';
    const mostRecentDate = new Date(Math.max(...boxscores.map(b => new Date(b.gameDate))));
    const cutoffDate = new Date(mostRecentDate);
    cutoffDate.setDate(cutoffDate.getDate() - 20);
    
    const recentGames = boxscores.filter(b => new Date(b.gameDate) >= cutoffDate && b.minutes > 0);
    debug.data.recentGamesForRotation = recentGames.length;
    debug.data.mostRecentDate = mostRecentDate.toISOString();
    debug.data.cutoffDate = cutoffDate.toISOString();
    
    const playerMinutesByTeam = {};
    recentGames.forEach(b => {
      if (!playerMinutesByTeam[b.teamTricode]) {
        playerMinutesByTeam[b.teamTricode] = {};
      }
      if (!playerMinutesByTeam[b.teamTricode][b.playerName]) {
        playerMinutesByTeam[b.teamTricode][b.playerName] = [];
      }
      playerMinutesByTeam[b.teamTricode][b.playerName].push(b.minutes);
    });
    
    debug.data.teamsFound = Object.keys(playerMinutesByTeam).length;
    debug.data.sampleTeamPlayers = playerMinutesByTeam['BOS'] ? 
      Object.keys(playerMinutesByTeam['BOS']).length : 'BOS not found';
    
    // Step 4: Check API
    debug.step = '4. Checking Odds API';
    const API_KEY = process.env.ODDS_API_KEY;
    if (!API_KEY) {
      debug.error = 'ODDS_API_KEY not set';
      return new Response(JSON.stringify(debug, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    debug.data.hasApiKey = true;
    
    // Fetch games
    const gamesUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/odds/?apiKey=${API_KEY}&regions=us&oddsFormat=american`;
    const response = await fetch(gamesUrl);
    const allGames = await response.json();
    
    debug.data.oddsApiResponse = {
      status: response.status,
      totalGames: allGames?.length || 0,
      sampleGame: allGames?.[0] || null
    };
    
    // Filter to 18 hours
    const now = new Date();
    const eighteenHoursFromNow = new Date(now.getTime() + 18 * 60 * 60 * 1000);
    const todaysGames = allGames.filter(game => {
      const gameTime = new Date(game.commence_time);
      return gameTime <= eighteenHoursFromNow;
    });
    
    debug.data.gamesIn18Hours = todaysGames.length;
    debug.data.sampleGameTime = todaysGames[0]?.commence_time;
    
    // Step 5: Check player props for first game
    if (todaysGames.length > 0) {
      debug.step = '5. Checking player props';
      const gameId = todaysGames[0].id;
      const propsUrl = `https://api.the-odds-api.com/v4/sports/basketball_nba/events/${gameId}/odds/?apiKey=${API_KEY}&regions=us&markets=player_rebounds&bookmakers=draftkings,fanduel&oddsFormat=american`;
      
      const propsResponse = await fetch(propsUrl);
      const propsData = await propsResponse.json();
      
      debug.data.playerPropsCheck = {
        gameId: gameId,
        status: propsResponse.status,
        hasBookmakers: propsData.bookmakers?.length > 0,
        bookmakerCount: propsData.bookmakers?.length || 0,
        sampleMarket: propsData.bookmakers?.[0]?.markets?.[0] || null,
        samplePlayerCount: propsData.bookmakers?.[0]?.markets?.[0]?.outcomes?.length || 0
      };
    }
    
    debug.step = 'COMPLETE';
    debug.success = true;
    
    return new Response(JSON.stringify(debug, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    debug.error = error.message;
    debug.stack = error.stack;
    
    return new Response(JSON.stringify(debug, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const config = {
  path: '/nba-debug-generate'
};
