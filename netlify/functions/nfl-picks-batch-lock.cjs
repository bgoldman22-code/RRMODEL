/**
 * NFL Picks Batch Safety Lock Function
 * 
 * Scheduled batch job to lock picks for games that may have been missed by event-driven triggers.
 * Runs at strategic times on NFL Sundays: 5PM, 8PM, and 11:59PM ET.
 * 
 * This provides bulletproof reliability for the hybrid pick locking system by ensuring
 * all games are locked with closing odds even if event-driven triggers failed.
 */

const { handler: lockHandler } = require('./nfl-picks-lock');

exports.handler = async (event, context) => {
  console.log('🛡️ Batch Safety Lock triggered:', {
    time: new Date().toISOString(),
    trigger: event.type || 'manual',
    headers: event.headers
  });

  try {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const hour = now.getHours();
    
    // Only run on Sundays (0) or if manually triggered
    const isScheduledTime = dayOfWeek === 0 && [17, 20, 23].includes(hour); // 5PM, 8PM, 11PM ET
    const isManualTrigger = event.httpMethod === 'POST' || event.headers?.['x-netlify-trigger'] === 'manual';
    
    if (!isScheduledTime && !isManualTrigger) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Not scheduled time for batch safety lock',
          time: now.toISOString(),
          dayOfWeek,
          hour,
          nextScheduled: getNextScheduledTime()
        })
      };
    }

    console.log('🔄 Running batch safety lock...');
    
    // Get current week for NFL season
    const currentWeek = getCurrentNFLWeek();
    const season = new Date().getFullYear();
    
    // Fetch current week's games
    const games = await fetchNFLSchedule(currentWeek, season);
    
    if (!games || games.length === 0) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'No games found for batch safety lock',
          week: currentWeek,
          season
        })
      };
    }

    // Filter for games that should be locked (started or within 5 minutes)
    const gamesToLock = games.filter(game => {
      const gameTime = new Date(game.start);
      const timeDiff = now - gameTime;
      return timeDiff >= -5 * 60 * 1000; // Started or within 5 minutes
    });

    console.log(`📊 Found ${gamesToLock.length} games to potentially lock out of ${games.length} total games`);

    const results = [];
    
    // Process each game that should be locked
    for (const game of gamesToLock) {
      try {
        console.log(`🔒 Processing batch lock for: ${game.away_team} @ ${game.home_team}`);
        
        // Use the existing lock handler with batch context
        const lockEvent = {
          httpMethod: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-batch-safety': 'true'
          },
          body: JSON.stringify({
            action: 'lock',
            game_id: game.game_id,
            home_team: game.home_team,
            away_team: game.away_team,
            kickoff_time: game.start,
            source: 'batch_safety',
            trigger_time: now.toISOString(),
            week: currentWeek,
            season: season.toString()
          })
        };

        const lockResult = await lockHandler(lockEvent, context);
        const lockData = JSON.parse(lockResult.body);
        
        results.push({
          game: `${game.away_team} @ ${game.home_team}`,
          game_id: game.game_id,
          status: lockResult.statusCode === 200 ? 'success' : 'error',
          message: lockData.message || 'Unknown result',
          already_locked: lockData.already_locked || false,
          markets_locked: lockData.markets_locked || 0
        });
        
        console.log(`✅ Batch lock result for ${game.away_team} @ ${game.home_team}:`, {
          status: lockResult.statusCode,
          already_locked: lockData.already_locked,
          markets: lockData.markets_locked
        });
        
      } catch (gameError) {
        console.error(`❌ Error in batch lock for ${game.away_team} @ ${game.home_team}:`, gameError);
        results.push({
          game: `${game.away_team} @ ${game.home_team}`,
          game_id: game.game_id,
          status: 'error',
          message: gameError.message || 'Unknown error',
          already_locked: false,
          markets_locked: 0
        });
      }
    }

    // Summary statistics
    const successCount = results.filter(r => r.status === 'success').length;
    const alreadyLockedCount = results.filter(r => r.already_locked).length;
    const newlyLockedCount = successCount - alreadyLockedCount;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`📈 Batch safety lock complete:`, {
      total_games: gamesToLock.length,
      newly_locked: newlyLockedCount,
      already_locked: alreadyLockedCount,
      errors: errorCount,
      success_rate: `${Math.round((successCount / gamesToLock.length) * 100)}%`
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Batch safety lock completed',
        summary: {
          total_games: gamesToLock.length,
          newly_locked: newlyLockedCount,
          already_locked: alreadyLockedCount,
          errors: errorCount,
          success_rate: Math.round((successCount / gamesToLock.length) * 100)
        },
        results: results,
        trigger: {
          time: now.toISOString(),
          source: isManualTrigger ? 'manual' : 'scheduled',
          week: currentWeek,
          season
        },
        next_scheduled: getNextScheduledTime()
      })
    };
    
  } catch (error) {
    console.error('❌ Batch safety lock error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Batch safety lock failed',
        message: error.message,
        time: new Date().toISOString()
      })
    };
  }
};

// Helper functions
function getCurrentNFLWeek() {
  const now = new Date();
  const seasonStart = new Date(now.getFullYear(), 8, 1); // Sept 1st approximation
  const weeksSinceStart = Math.floor((now - seasonStart) / (7 * 24 * 60 * 60 * 1000));
  return Math.max(1, Math.min(18, weeksSinceStart + 1));
}

async function fetchNFLSchedule(week, season) {
  try {
    // Use the same schedule endpoint as the predictions
    const scheduleUrl = `/.netlify/functions/nfl-schedule-get?week=${week}&season=${season}`;
    const response = await fetch(`https://${process.env.URL || 'localhost:8888'}${scheduleUrl}`);
    
    if (!response.ok) {
      console.warn(`Schedule fetch failed: ${response.status}, using fallback`);
      return [];
    }
    
    const scheduleData = await response.json();
    return (scheduleData.matchups || []).map(game => ({
      home_team: getTeamAbbreviation(game.homeTeam),
      away_team: getTeamAbbreviation(game.awayTeam),
      game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
      start: game.kickoff
    }));
    
  } catch (error) {
    console.error('Error fetching NFL schedule for batch lock:', error);
    return [];
  }
}

function getTeamAbbreviation(fullName) {
  const nameMap = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Los Angeles Rams": "LAR", "Los Angeles Chargers": "LAC",
    "Las Vegas Raiders": "LV", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "Seattle Seahawks": "SEA", "San Francisco 49ers": "SF", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS"
  };
  return nameMap[fullName] || fullName;
}

function getNextScheduledTime() {
  const now = new Date();
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + (7 - now.getDay()) % 7);
  
  // Next scheduled times: 5PM, 8PM, 11PM ET on Sundays
  const scheduledHours = [17, 20, 23];
  const nextTimes = scheduledHours.map(hour => {
    const time = new Date(nextSunday);
    time.setHours(hour, 0, 0, 0);
    return time;
  });
  
  return nextTimes.map(t => t.toISOString());
}