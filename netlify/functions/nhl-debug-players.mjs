/**
 * NHL DEBUG - Check specific players for projections and odds
 * Tests: Beauvillier, Hamilton, McMichael, Monahan
 */

import { projectSOGElite } from './_lib/nhl-elite-projection-v3.mjs';

const NHL_API_BASE = 'https://api-web.nhle.com/v1';

const TEST_PLAYERS = [
  { name: 'Anthony Beauvillier', team: 'CBJ', opponent: 'WSH' },
  { name: 'Dougie Hamilton', team: 'NJD', opponent: 'SJS' },
  { name: 'Connor McMichael', team: 'WSH', opponent: 'CBJ' },
  { name: 'Sean Monahan', team: 'CBJ', opponent: 'WSH' }
];

async function fetchNHLOdds() {
  const apiKey = process.env.THEODDS_API_KEY || process.env.ODDS_API_KEY;
  
  if (!apiKey) {
    return { error: 'No API key' };
  }
  
  try {
    const url = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events?regions=us&dateFormat=iso&apiKey=${apiKey}`;
    const eventsResponse = await fetch(url);
    
    if (!eventsResponse.ok) {
      return { error: `Events API failed: ${eventsResponse.status}` };
    }
    
    const events = await eventsResponse.json();
    
    // Fetch odds for each event
    const oddsPromises = events.map(async (event) => {
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/icehockey_nhl/events/${event.id}/odds?regions=us&markets=player_shots_on_goal&oddsFormat=american&apiKey=${apiKey}`;
      const oddsResponse = await fetch(oddsUrl);
      
      if (!oddsResponse.ok) return null;
      return await oddsResponse.json();
    });
    
    const oddsResults = await Promise.all(oddsPromises);
    return oddsResults.filter(Boolean);
    
  } catch (e) {
    return { error: e.message };
  }
}

function processRealOdds(oddsData) {
  const oddsMap = new Map();
  
  for (const event of oddsData) {
    if (!event?.bookmakers) continue;
    
    for (const book of event.bookmakers) {
      const market = book.markets?.find(m => m.key === 'player_shots_on_goal');
      if (!market) continue;
      
      for (const outcome of market.outcomes) {
        const playerName = outcome.description;
        const line = outcome.point;
        const direction = outcome.name.toLowerCase();
        const price = outcome.price;
        
        const key = `${playerName}_${line}`;
        
        if (!oddsMap.has(key)) {
          oddsMap.set(key, { line, odds: [] });
        }
        
        oddsMap.get(key).odds.push({
          bookmaker: book.key,
          direction,
          price,
          line
        });
      }
    }
  }
  
  return oddsMap;
}

async function findPlayerId(playerName, teamAbbrev) {
  try {
    const url = `${NHL_API_BASE}/roster/${teamAbbrev}/current`;
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const roster = await response.json();
    const allPlayers = [
      ...(roster.forwards || []),
      ...(roster.defensemen || [])
    ];
    
    for (const player of allPlayers) {
      const fullName = `${player.firstName?.default || ''} ${player.lastName?.default || ''}`.trim();
      if (fullName.toLowerCase() === playerName.toLowerCase()) {
        return {
          id: player.id,
          name: fullName,
          position: player.positionCode
        };
      }
    }
    
    return null;
  } catch (e) {
    return null;
  }
}

export async function handler(event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  
  try {
    console.log('🔍 NHL DEBUG - Testing specific players...');
    
    // Fetch odds
    console.log('📊 Fetching odds...');
    const oddsData = await fetchNHLOdds();
    
    if (oddsData.error) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          error: oddsData.error,
          timestamp: new Date().toISOString()
        })
      };
    }
    
    const oddsMap = processRealOdds(oddsData);
    console.log(`✅ Found ${oddsMap.size} unique player/line combinations`);
    
    // Test each player
    const results = [];
    
    for (const testPlayer of TEST_PLAYERS) {
      console.log(`\n🧪 Testing ${testPlayer.name}...`);
      
      // Find player ID
      const playerInfo = await findPlayerId(testPlayer.name, testPlayer.team);
      
      if (!playerInfo) {
        results.push({
          playerName: testPlayer.name,
          team: testPlayer.team,
          status: 'NOT_FOUND',
          message: 'Player not found in roster'
        });
        continue;
      }
      
      console.log(`✅ Found player: ${playerInfo.name} (ID: ${playerInfo.id})`);
      
      // Generate projection
      const projection = await projectSOGElite(
        playerInfo.id,
        playerInfo.name,
        testPlayer.team,
        testPlayer.opponent,
        false, // Assume away for testing
        'Test Arena'
      );
      
      if (!projection) {
        results.push({
          playerName: testPlayer.name,
          playerId: playerInfo.id,
          team: testPlayer.team,
          status: 'NO_PROJECTION',
          message: 'Projection library returned null'
        });
        continue;
      }
      
      console.log(`✅ Generated projection: ${projection.mu.toFixed(2)} SOG`);
      
      // Find matching odds
      const playerOdds = [];
      for (const [key, value] of oddsMap.entries()) {
        if (key.startsWith(testPlayer.name + '_')) {
          playerOdds.push({
            line: value.line,
            oddsCount: value.odds.length,
            odds: value.odds
          });
        }
      }
      
      console.log(`📈 Found ${playerOdds.length} lines with odds`);
      
      results.push({
        playerName: testPlayer.name,
        playerId: playerInfo.id,
        team: testPlayer.team,
        position: playerInfo.position,
        status: 'SUCCESS',
        projection: {
          mu: projection.mu,
          r: projection.r,
          pi: projection.pi,
          position: projection.position,
          gamesPlayed: projection.metadata?.gamesPlayed,
          seasonSOGAvg: projection.metadata?.seasonSOGAvg,
          L5avg: projection.metadata?.L5avg,
          L10avg: projection.metadata?.L10avg
        },
        odds: playerOdds.length > 0 ? playerOdds : null,
        hasOdds: playerOdds.length > 0,
        hasProjection: true
      });
    }
    
    // Summary
    const withProjections = results.filter(r => r.hasProjection).length;
    const withOdds = results.filter(r => r.hasOdds).length;
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        summary: {
          playersTestedTestedested: TEST_PLAYERS.length,
          withProjections,
          withOdds,
          totalOddsLines: oddsMap.size
        },
        results,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message,
        stack: error.stack
      })
    };
  }
}
