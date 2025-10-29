/**
 * TEST: Ultra-simple TD API to verify deployment works
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const ODDS_API_KEY = process.env.ODDS_API_KEY;

export async function handler(event) {
  if (!ODDS_API_KEY) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: 'No API key' })
    };
  }
  
  try {
    // Get NFL events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${ODDS_API_KEY}`;
    const eventsRes = await fetch(eventsUrl);
    const events = await eventsRes.json();
    
    const allPlayers = [];
    
    // Get first game only for testing
    const event = events[0];
    if (!event) {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, players: [], count: 0 })
      };
    }
    
    const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?markets=player_anytime_td&regions=us&oddsFormat=american&bookmakers=draftkings,fanduel&apiKey=${ODDS_API_KEY}`;
    const oddsRes = await fetch(oddsUrl);
    const oddsData = await oddsRes.json();
    
    // Process odds
    for (const bookmaker of oddsData.bookmakers || []) {
      const market = bookmaker.markets?.find(m => m.key === 'player_anytime_td');
      if (!market) continue;
      
      for (const outcome of market.outcomes || []) {
        const impliedProb = outcome.price < 0 
          ? Math.abs(outcome.price) / (Math.abs(outcome.price) + 100)
          : 100 / (outcome.price + 100);
          
        allPlayers.push({
          name: outcome.description,
          game: `${event.away_team} @ ${event.home_team}`,
          bestOdds: outcome.price,
          books_count: 1,
          implied_probability: impliedProb,
          model_probability: null,
          edge: null
        });
      }
    }
    
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        count: allPlayers.length,
        players: allPlayers,
        generated_at: new Date().toISOString()
      })
    };
    
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
}
