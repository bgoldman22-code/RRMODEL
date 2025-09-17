// netlify/functions/nfl-odds-get/index.cjs
// FIXED: Direct integration with The Odds API with proper error handling

export default async (request, context) => {
  try {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Get API key from environment
    const API_KEY = process.env.ODDS_API_KEY;
    if (!API_KEY) {
      console.error('ODDS_API_KEY environment variable not set');
      return new Response(JSON.stringify({
        error: 'API key not configured',
        games: [],
        fallback: true
      }), {
        status: 200, // Return 200 so predictions can continue without odds
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Parse query parameters
    const url = new URL(request.url);
    const regions = url.searchParams.get('regions') || 'us';
    const markets = url.searchParams.get('markets') || 'h2h,spreads,totals';
    const oddsFormat = url.searchParams.get('oddsFormat') || 'american';

    // Build The Odds API URL
    const oddsApiUrl = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds` +
      `?regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&apiKey=${API_KEY}`;

    console.log('Fetching odds from The Odds API...');

    // Fetch from The Odds API with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const oddsResponse = await fetch(oddsApiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'bgroundrobin-nfl-predictions/1.0',
        'Accept': 'application/json'
      }
    });

    clearTimeout(timeoutId);

    if (!oddsResponse.ok) {
      console.error('The Odds API error:', oddsResponse.status, oddsResponse.statusText);
      
      // Return empty games array to allow predictions to continue
      return new Response(JSON.stringify({
        error: `The Odds API returned ${oddsResponse.status}`,
        games: [],
        fallback: true
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const oddsData = await oddsResponse.json();
    console.log(`Successfully fetched odds for ${oddsData.length} games`);

    // Transform the data to match your expected format
    const transformedGames = oddsData.map(game => {
      // Extract markets for easy access
      const markets = {};
      if (game.bookmakers && game.bookmakers.length > 0) {
        const primaryBook = game.bookmakers[0];
        if (primaryBook.markets) {
          primaryBook.markets.forEach(market => {
            markets[market.key] = market.outcomes || [];
          });
        }
      }

      return {
        id: game.id,
        sport_key: game.sport_key,
        commence_time: game.commence_time,
        home_team: game.home_team,
        away_team: game.away_team,
        bookmakers: game.bookmakers || [],
        markets: {
          h2h: markets.h2h || [],
          spreads: markets.spreads || [],
          totals: markets.totals || []
        }
      };
    });

    // Return transformed data
    return new Response(JSON.stringify({
      success: true,
      timestamp: new Date().toISOString(),
      source: 'the-odds-api',
      count: transformedGames.length,
      games: transformedGames
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300' // 5 minute cache
      }
    });

  } catch (error) {
    console.error('NFL odds fetch error:', error);
    
    // Handle timeout specifically
    if (error.name === 'AbortError') {
      return new Response(JSON.stringify({
        error: 'Request timeout - The Odds API took too long to respond',
        games: [],
        fallback: true
      }), {
        status: 200,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Return empty games to allow predictions to continue
    return new Response(JSON.stringify({
      error: 'Failed to fetch odds',
      message: error.message,
      games: [],
      fallback: true
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};
