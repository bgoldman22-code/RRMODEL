/**
 * Simple NBA Test Function
 * Just returns today's games to verify deployment works
 */

export default async (request, context) => {
  try {
    // Fetch today's games from ESPN
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const games = data.events?.map(event => {
      const competition = event.competitions[0];
      const homeTeam = competition.competitors.find(c => c.homeAway === 'home');
      const awayTeam = competition.competitors.find(c => c.homeAway === 'away');
      
      return {
        id: event.id,
        date: event.date,
        away: awayTeam.team.abbreviation,
        home: homeTeam.team.abbreviation,
        awayFull: awayTeam.team.displayName,
        homeFull: homeTeam.team.displayName
      };
    }) || [];
    
    return new Response(JSON.stringify({
      ok: true,
      today: new Date().toISOString().split('T')[0],
      games: games.length,
      gameList: games
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message,
      stack: error.stack
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
