/**
 * SIMPLE ANYTIME TD API - NO COMPLEX IMPORTS
 * Just fetches odds and returns simple predictions
 */

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Use existing ODDS_API_KEY environment variable
const ODDS_API_KEY = process.env.ODDS_API_KEY;

export async function handler(event) {
  // Validate API key is present
  if (!ODDS_API_KEY) {
    console.error('❌ ODDS_API_KEY not set in environment variables');
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: 'API key not configured'
      })
    };
  }
  
  try {
    console.log('🏈 Simple Anytime TD API called');
    
    // Get all NFL events
    const eventsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${ODDS_API_KEY}`;
    const eventsRes = await fetch(eventsUrl);
    const events = await eventsRes.json();
    
    console.log(`Found ${events.length} NFL events`);
    
    const allPlayers = [];
    
    // For each event, get player TD odds (ALL Week 9 games)
    for (const event of events) {
      console.log(`Fetching odds for ${event.away_team} @ ${event.home_team}`);
      
      const oddsUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${event.id}/odds?markets=player_anytime_td&regions=us&oddsFormat=american&bookmakers=draftkings,fanduel,betmgm&apiKey=${ODDS_API_KEY}`;
      const oddsRes = await fetch(oddsUrl);
      const oddsData = await oddsRes.json();
      
      // Process each bookmaker's odds
      const playerOdds = {};
      for (const bookmaker of oddsData.bookmakers || []) {
        const market = bookmaker.markets?.find(m => m.key === 'player_anytime_td');
        if (!market) continue;
        
        for (const outcome of market.outcomes || []) {
          const playerName = outcome.description;
          if (!playerOdds[playerName]) {
            playerOdds[playerName] = {
              name: playerName,
              allOdds: [],
              bookmakers: []
            };
          }
          playerOdds[playerName].allOdds.push(outcome.price);
          playerOdds[playerName].bookmakers.push(bookmaker.key);
        }
      }
      
      // Convert to array and add game context
      for (const player of Object.values(playerOdds)) {
        // Get unique bookmaker count and best odds
        const uniqueBooks = [...new Set(player.bookmakers)].length;
        const bestOdds = Math.max(...player.allOdds);
        
        if (uniqueBooks >= 2) {  // Only players with 2+ books
          allPlayers.push({
            name: player.name,
            game: `${event.away_team} @ ${event.home_team}`,
            bestOdds: bestOdds,
            books_count: uniqueBooks,
            odds_qualified: true,
            probability: oddsToProb(bestOdds),
            commence_time: event.commence_time
          });
        }
      }
    }
    
    // Sort by probability
    allPlayers.sort((a, b) => b.probability - a.probability);
    
    console.log(`Returning ${allPlayers.length} qualified players`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify({
        success: true,
        count: allPlayers.length,
        players: allPlayers,
        generated_at: new Date().toISOString()
      })
    };
    
  } catch (error) {
    console.error('❌ Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
}

function oddsToProb(americanOdds) {
  if (americanOdds > 0) {
    return 100 / (americanOdds + 100);
  } else {
    return Math.abs(americanOdds) / (Math.abs(americanOdds) + 100);
  }
}
