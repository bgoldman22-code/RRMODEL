// netlify/functions/nfl-predictions-refresh.mjs
// Scheduled function to refresh predictions cache every 30 minutes
// Runs on deploy and via cron: */30 * * * *

export default async (request, context) => {
  try {
    const baseUrl = process.env.URL || 'https://bgroundrobin.com';
    
    // Get current week's schedule first
    const currentWeek = getCurrentNFLWeek();
    const season = 2025;
    
    const scheduleUrl = `${baseUrl}/.netlify/functions/nfl-schedule-get?week=${currentWeek}&season=${season}`;
    const scheduleRes = await fetch(scheduleUrl);
    
    if (!scheduleRes.ok) {
      throw new Error(`Schedule fetch failed: ${scheduleRes.status}`);
    }
    
    const scheduleData = await scheduleRes.json();
    const games = (scheduleData.matchups || []).map(game => ({
      home_team: getTeamAbbreviation(game.homeTeam),
      away_team: getTeamAbbreviation(game.awayTeam),
      game_id: game.id || `${game.homeTeam}-${game.awayTeam}`,
      start: game.kickoff
    }));
    
    if (games.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'No games this week, skipping refresh',
        week: currentWeek,
        season
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate predictions and cache them
    const response = await fetch(`${baseUrl}/.netlify/functions/nfl-predictions-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        season: season.toString(),
        games: games,
        refresh: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Generate predictions failed: ${response.status}`);
    }
    
    const result = await response.json();
    
    return new Response(JSON.stringify({
      ok: true,
      message: 'Predictions cache refreshed successfully',
      week: currentWeek,
      season: season,
      predictions_count: result.predictions?.length || 0,
      parlay_suggestions: result.parlaySuggestions?.length || 0,
      updated_at: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
    
  } catch (error) {
    console.error('[REFRESH_ERROR]', error);
    return new Response(JSON.stringify({
      ok: false,
      error: 'Failed to refresh predictions',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Helper functions
function getCurrentNFLWeek() {
  const now = new Date();
  const season2025Start = new Date('2025-09-04T00:00:00Z'); // Week 1 starts Sep 4, 2025
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const weeksSinceStart = Math.floor((now - season2025Start) / msPerWeek);
  return Math.max(1, Math.min(weeksSinceStart + 1, 18));
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