/**
 * NBA Predictions - Clean Simple Version
 */

export default async (request, context) => {
  try {
    // Fetch today's games
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const url = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${today}`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (!data.events || data.events.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        games: [],
        message: 'No games today'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate mock predictions
    const predictions = data.events.map(event => {
      const comp = event.competitions[0];
      const home = comp.competitors.find(c => c.homeAway === 'home');
      const away = comp.competitors.find(c => c.homeAway === 'away');
      
      const spread = (Math.random() * 10 - 5).toFixed(1);
      const total = (220 + Math.random() * 20).toFixed(1);
      const conf = Math.floor(60 + Math.random() * 25);
      
      return {
        gameId: event.id,
        game: `${away.team.abbreviation} @ ${home.team.abbreviation}`,
        gameTime: event.date,
        teams: {
          home: {
            name: home.team.displayName,
            abbreviation: home.team.abbreviation,
            record: home.records?.[0]?.summary || ''
          },
          away: {
            name: away.team.displayName,
            abbreviation: away.team.abbreviation,
            record: away.records?.[0]?.summary || ''
          }
        },
        prediction: {
          spread: {
            prediction: parseFloat(spread),
            favorite: spread > 0 ? 'home' : 'away',
            line: Math.abs(parseFloat(spread))
          },
          total: {
            prediction: parseFloat(total),
            over: parseFloat(total) > 220,
            under: parseFloat(total) < 220
          },
          winProbability: {
            home: parseFloat((spread > 0 ? 60 + Math.random() * 15 : 40 - Math.random() * 15).toFixed(1)),
            away: parseFloat((spread < 0 ? 60 + Math.random() * 15 : 40 - Math.random() * 15).toFixed(1))
          },
          confidence: conf
        },
        opportunities: []
      };
    });
    
    return new Response(JSON.stringify({
      ok: true,
      generated: new Date().toISOString(),
      games: predictions.length,
      predictions,
      modelInfo: {
        type: 'Elite Ensemble',
        features: 55,
        spreadMAE: 11.606,
        totalMAE: 14.691,
        note: 'Mock predictions - model integration in progress'
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300'
      }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({
      ok: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
