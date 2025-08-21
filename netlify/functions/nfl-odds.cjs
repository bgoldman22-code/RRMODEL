// netlify/functions/nfl-odds.cjs
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

exports.handler = async function(event, context) {
  try {
    const params = event.queryStringParameters || {};
    const week = params.week || '1';
    const apiKey = process.env.ODDS_API_KEY_NFL;
    const base = process.env.ODDSAPI_BASE || 'https://api.the-odds-api.com/v4';
    const sport = process.env.ODDSAPI_SPORT_NFL || 'americanfootball_nfl';
    const market = process.env.ODDSAPI_MARKET_NFL || 'player_anytime_touchdown';
    const region = process.env.ODDSAPI_REGION_NFL || 'us';
    const bookmaker = process.env.ODDSAPI_BOOKMAKER_NFL || 'fanduel';

    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({ provider: 'theoddsapi', usingOddsApi: false, offers: [], count: 0, error: 'Missing ODDS_API_KEY_NFL' })
      };
    }

    // Credit-safe: single request for NFL market/bookmaker; many providers require event-level, but we try the aggregate endpoint first.
    const url = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=${region}&markets=${market}&bookmakers=${bookmaker}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: 200,
        body: JSON.stringify({ provider: 'theoddsapi', usingOddsApi: false, offers: [], count: 0, error: `fetch failed ${resp.status}: ${text.slice(0,200)}` })
      };
    }
    const data = await resp.json();
    // Shape offers as { player, team?, event?, american, bookmaker }
    const offers = [];
    for (const evt of data || []) {
      const eventName = evt?.commence_time ? evt.home_team + ' vs ' + evt.away_team : (evt?.event ?? '');
      const books = evt?.bookmakers || [];
      for (const b of books) {
        if (b?.key !== bookmaker) continue;
        const mkts = b?.markets || [];
        for (const m of mkts) {
          if (m?.key !== market) continue;
          for (const o of (m?.outcomes || [])) {
            // The Odds API often encodes player name in outcome.name
            const player = o.name || o.description || '';
            const price = o.price || o.odds || null;
            const american = typeof price === 'number' ? toAmerican(price) : (o?.price ? o.price : null);
            offers.push({
              player,
              american,
              event: eventName,
              bookmaker: b?.title || bookmaker
            });
          }
        }
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ provider: 'theoddsapi', usingOddsApi: true, offers, count: offers.length })
    };
  } catch (err) {
    return {
      statusCode: 200,
      body: JSON.stringify({ provider: 'theoddsapi', usingOddsApi: false, offers: [], count: 0, error: String(err).slice(0,200) })
    };
  }
};

function toAmerican(decimal) {
  // If decimal odds given, convert to American; but v4 usually returns American directly.
  if (!decimal || decimal <= 1) return null;
  const profit = decimal - 1;
  if (profit >= 1) return Math.round(profit * 100);
  return Math.round(-100 / profit);
}
