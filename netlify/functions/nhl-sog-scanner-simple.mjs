/**
 * NHL SOG SCANNER - SIMPLE DIAGNOSTIC VERSION
 * 
 * Minimal implementation to diagnose 502 errors
 * - Direct NHL API calls
 * - No complex dependencies
 * - Returns actual NHL data or clear error messages
 */

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
    console.log('🏒 NHL Simple Scanner starting...');
    
    // Step 1: Try to fetch today's schedule from NHL API
    const today = new Date().toISOString().split('T')[0];
    console.log(`📅 Fetching schedule for ${today}`);
    
    let schedule;
    try {
      const scheduleUrl = `https://api-web.nhle.com/v1/schedule/${today}`;
      console.log(`Calling: ${scheduleUrl}`);
      
      const scheduleResponse = await fetch(scheduleUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      
      if (!scheduleResponse.ok) {
        throw new Error(`NHL API returned ${scheduleResponse.status}`);
      }
      
      schedule = await scheduleResponse.json();
      console.log(`✅ Schedule fetched: ${JSON.stringify(schedule).substring(0, 200)}...`);
      
    } catch (scheduleError) {
      console.error('❌ Schedule fetch failed:', scheduleError.message);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          opportunities: [],
          metadata: {
            version: 'simple-diagnostic',
            error: 'NHL API unavailable',
            details: scheduleError.message,
            message: 'Could not fetch NHL schedule. API may be down or endpoint changed.',
            timestamp: new Date().toISOString()
          }
        })
      };
    }
    
    // Step 2: Parse games
    const games = schedule.gameWeek?.[0]?.games || [];
    console.log(`📊 Found ${games.length} games`);
    
    if (games.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          opportunities: [],
          metadata: {
            version: 'simple-diagnostic',
            message: games.length === 0 
              ? 'No NHL games scheduled today' 
              : 'NHL API returned no games for today',
            gamesFound: games.length,
            scheduleData: schedule,
            timestamp: new Date().toISOString()
          }
        })
      };
    }
    
    // Step 3: Generate simple mock opportunities for each game
    const opportunities = [];
    
    for (const game of games) {
      const homeTeam = game.homeTeam?.abbrev || 'HOME';
      const awayTeam = game.awayTeam?.abbrev || 'AWAY';
      const gameTime = game.startTimeUTC || new Date().toISOString();
      
      // Create a few mock opportunities per game
      opportunities.push({
        playerId: `mock-${game.id}-1`,
        playerName: 'Connor McDavid',
        position: 'C',
        team: awayTeam,
        opponent: homeTeam,
        gameTime: gameTime,
        direction: 'OVER',
        line: 3.5,
        odds: -115,
        projection: 4.2,
        edge: 8.5,
        ev: 3.4,
        confidence: 75,
        kelly: 0.018,
        variance: 1.8,
        scratchRisk: 0.05,
        mlEnhanced: false
      });
      
      opportunities.push({
        playerId: `mock-${game.id}-2`,
        playerName: 'Nathan MacKinnon',
        position: 'C',
        team: homeTeam,
        opponent: awayTeam,
        gameTime: gameTime,
        direction: 'OVER',
        line: 3.5,
        odds: -120,
        projection: 4.0,
        edge: 7.2,
        ev: 2.9,
        confidence: 72,
        kelly: 0.016,
        variance: 1.9,
        scratchRisk: 0.05,
        mlEnhanced: false
      });
    }
    
    console.log(`✅ Generated ${opportunities.length} mock opportunities`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        opportunities,
        metadata: {
          version: 'simple-diagnostic',
          message: 'MOCK DATA - Real NHL schedule fetched, but projections are placeholders',
          gamesFound: games.length,
          gamesData: games.map(g => ({
            id: g.id,
            home: g.homeTeam?.abbrev,
            away: g.awayTeam?.abbrev,
            time: g.startTimeUTC
          })),
          note: 'This is a diagnostic endpoint. Opportunities are mock data based on real schedule.',
          timestamp: new Date().toISOString()
        }
      })
    };
    
  } catch (error) {
    console.error('❌ Simple scanner error:', error);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        opportunities: [],
        metadata: {
          version: 'simple-diagnostic',
          error: error.message,
          stack: error.stack,
          message: 'Diagnostic endpoint encountered an error',
          timestamp: new Date().toISOString()
        }
      })
    };
  }
}
