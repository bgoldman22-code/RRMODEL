/**
 * NHL SOG DEBUG ENDPOINT
 * Minimal endpoint to verify data loading and basic projection flow
 */

import { loadPlayerStats, loadTeamStats, projectSOGElite } from './_lib/nhl-elite-projection-v4.mjs';

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const startTime = Date.now();
    console.log('🔍 Debug: Starting data load');

    // Step 1: Load stats
    const [players, teams] = await Promise.all([
      loadPlayerStats(),
      loadTeamStats()
    ]);

    const loadTime = Date.now() - startTime;
    console.log(`✅ Loaded ${players.length} players, ${Object.keys(teams).length} teams in ${loadTime}ms`);

    // Step 2: Test a sample projection
    let sampleProjection = null;
    if (players.length > 0) {
      const samplePlayer = players.find(p => p.team === 'NYR' && p.position !== 'G');
      if (samplePlayer) {
        console.log(`🧪 Testing projection for ${samplePlayer.name}`);
        sampleProjection = await projectSOGElite(
          samplePlayer.playerId,
          samplePlayer.name,
          samplePlayer.team,
          'BOS',
          true,
          'Madison Square Garden'
        );
        console.log(`✅ Projection ${sampleProjection ? 'succeeded' : 'returned null'}`);
      }
    }

    // Step 3: Get today's schedule
    const todayET = new Date().toLocaleString('en-US', { 
      timeZone: 'America/New_York', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    const [month, day, year] = todayET.split(/[\/,\s]/);
    const today = `${year}-${month}-${day}`;
    
    const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
    const scheduleResponse = await fetch(scheduleUrl);
    const schedule = await scheduleResponse.json();
    
    const allGames = [];
    if (schedule.gameWeek) {
      for (const day of schedule.gameWeek) {
        if (day.games) allGames.push(...day.games);
      }
    }

    const totalTime = Date.now() - startTime;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        diagnostics: {
          playersLoaded: players.length,
          teamsLoaded: Object.keys(teams).length,
          gamesScheduled: allGames.length,
          loadTimeMs: loadTime,
          totalTimeMs: totalTime,
          sampleProjection: sampleProjection ? {
            player: sampleProjection.playerName,
            projection: sampleProjection.mu,
            variance: sampleProjection.r,
            scratchRisk: sampleProjection.pi
          } : null,
          samplePlayer: players[0] ? {
            name: players[0].name,
            team: players[0].team,
            playerId: players[0].playerId,
            gamesPlayed: players[0].season?.gamesPlayed
          } : null
        },
        timestamp: new Date().toISOString()
      }, null, 2)
    };

  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }, null, 2)
    };
  }
}
