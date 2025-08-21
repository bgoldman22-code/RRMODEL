// netlify/functions/nfl-odds.cjs
// CommonJS Netlify function to fetch NFL Anytime TD odds from TheOddsAPI.
// Safe-by-default: if env is missing or API errors, returns usingOddsApi:false.

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  const {
    ODDS_API_KEY_NFL,
    ODDSAPI_BASE = 'https://api.the-odds-api.com/v4',
    ODDSAPI_REGION_NFL = 'us',
    ODDSAPI_BOOKMAKER_NFL = 'fanduel',
    ODDSAPI_MARKET_NFL = 'player_anytime_touchdown',
    ODDSAPI_SPORT_NFL = 'americanfootball_nfl'
  } = process.env;

  // Quick guard: no key -> safe off
  if (!ODDS_API_KEY_NFL) {
    return response({
      provider: 'theoddsapi',
      usingOddsApi: false,
      offers: [],
      error: 'Missing ODDS_API_KEY_NFL'
    });
  }

  // Optional query params (for future filtering / caching)
  const params = new URLSearchParams(event.queryStringParameters || {});
  const week = params.get('week') || '';

  // Build URL (single call, single market/bookmaker for credit safety)
  const url = `${ODDSAPI_BASE}/sports/${encodeURIComponent(ODDSAPI_SPORT_NFL)}/odds?` +
    `regions=${encodeURIComponent(ODDSAPI_REGION_NFL)}` +
    `&markets=${encodeURIComponent(ODDSAPI_MARKET_NFL)}` +
    `&bookmakers=${encodeURIComponent(ODDSAPI_BOOKMAKER_NFL)}` +
    `&oddsFormat=american` +
    `&apiKey=${encodeURIComponent(ODDS_API_KEY_NFL)}`;

  try {
    const r = await fetch(url, { timeout: 10000 });
    const status = r.status;
    let dataText = await r.text();
    let data;
    try { data = JSON.parse(dataText); } catch (_) { data = dataText; }

    if (!r.ok) {
      // Common failure: 422 invalid market; 401 auth; 429 rate limit
      return response({
        provider: 'theoddsapi',
        usingOddsApi: false,
        offers: [],
        error: `fetch error ${status}`,
        details: (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 300)
      });
    }

    // Normalize to a flat offer list: [{player, team, game, american, bookmaker, market}]
    const offers = [];
    if (Array.isArray(data)) {
      for (const ev of data) {
        const game = `${ev.away_team} @ ${ev.home_team}`;
        // ev.bookmakers -> markets -> outcomes
        const bks = ev.bookmakers || [];
        for (const bk of bks) {
          const bookmaker = bk.key || bk.title || 'book';
          const markets = bk.markets || [];
          for (const mk of markets) {
            const market = mk.key || mk.market || 'market';
            const outcomes = mk.outcomes || [];
            for (const o of outcomes) {
              // Player name can be in .name or .description depending on sport/market
              const player = o.name || o.description || o.participant || '';
              const american = (o.price !== undefined ? o.price : (o.american ?? null));
              if (!player || american === null) continue;
              offers.push({ player, game, american, bookmaker, market });
            }
          }
        }
      }
    }

    return response({
      provider: 'theoddsapi',
      usingOddsApi: true,
      offers,
      count: offers.length
    });
  } catch (err) {
    return response({
      provider: 'theoddsapi',
      usingOddsApi: false,
      offers: [],
      error: 'exception',
      details: String(err).slice(0, 300)
    });
  }
};

function response(body) {
  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=60'
    },
    body: JSON.stringify(body)
  };
}
