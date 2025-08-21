// netlify/functions/nfl-odds.cjs
// CommonJS Netlify function to fetch NFL Anytime TD odds with robust bookmaker/market handling.
// Defaults to DraftKings and tries multiple market keys. Returns a flat list of offers.
//
// Env:
//  ODDS_API_KEY_NFL (required)
//  ODDSAPI_BASE (default https://api.the-odds-api.com/v4)
//  ODDSAPI_SPORT_NFL (default americanfootball_nfl)
//  ODDSAPI_MARKET_NFL (default player_anytime_td, fallback player_anytime_touchdown)
//  ODDSAPI_REGION_NFL (default us)
//  ODDSAPI_BOOKMAKER_NFL (default draftkings)
module.exports.handler = async () => {
  const fetch = globalThis.fetch || (await import('node-fetch')).default;
  const BASE = process.env.ODDSAPI_BASE || "https://api.the-odds-api.com/v4";
  const SPORT = process.env.ODDSAPI_SPORT_NFL || "americanfootball_nfl";
  const KEY = process.env.ODDS_API_KEY_NFL;
  const REGION = process.env.ODDSAPI_REGION_NFL || "us";
  const BOOK = (process.env.ODDSAPI_BOOKMAKER_NFL || "draftkings").toLowerCase();
  const MARKET_PRIMARY = process.env.ODDSAPI_MARKET_NFL || "player_anytime_td";
  const MARKETS_TRY = [MARKET_PRIMARY, "player_anytime_touchdown", "player_anytime_td"]; // small safety

  if (!KEY) {
    return { statusCode: 200, body: JSON.stringify({ provider: "theoddsapi", usingOddsApi: false, offers: [], error: "missing ODDS_API_KEY_NFL" }) };
  }

  async function tryMarket(market) {
    const url = `${BASE}/sports/${SPORT}/odds?regions=${REGION}&markets=${market}&bookmakers=${BOOK}&apiKey=${KEY}`;
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error(`http ${res.status}`);
    return await res.json();
  }

  function normName(s) {
    if (!s) return "";
    s = s.toLowerCase();
    s = s.replace(/\./g, "");           // remove dots: D.K. -> DK
    s = s.replace(/,?\s*(jr|sr|iii|ii|iv)\b/g, ""); // drop suffixes
    s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); // strip accents
    s = s.replace(/[^a-z]/g, "");        // letters only
    return s;
  }

  try {
    let data = null;
    let usedMarket = null;
    let error = null;
    for (const m of MARKETS_TRY) {
      try {
        data = await tryMarket(m);
        usedMarket = m;
        if (Array.isArray(data) && data.length) break;
      } catch (e) {
        error = String(e);
      }
    }
    if (!Array.isArray(data)) data = [];

    // Flatten into offers
    // TheOddsAPI returns array of events; each has bookmakers[0].markets[0].outcomes with player names and prices.
    const offers = [];
    for (const ev of data) {
      const home = ev?.home_team || "";
      const away = ev?.away_team || "";
      const game = `${away} @ ${home}`;
      const bk = (ev?.bookmakers || []).find(b => (b?.key || "").toLowerCase() === BOOK);
      const mk = (bk?.markets || [])[0];
      const outs = mk?.outcomes || [];
      for (const o of outs) {
        const player = o?.name || o?.description || "";
        const priceAmerican = o?.price || o?.odds || o?.american_odds || null;
        if (!player || priceAmerican == null) continue;
        // Normalize american odds to number
        let american = null;
        if (typeof priceAmerican === "number") american = priceAmerican;
        else if (typeof priceAmerican === "string") american = parseInt(priceAmerican, 10);
        if (american == null || Number.isNaN(american)) continue;
        offers.push({
          player,
          player_key: normName(player),
          game,
          team_home: home,
          team_away: away,
          bookmaker: BOOK,
          market: usedMarket,
          american
        });
      }
    }

    return { statusCode: 200, body: JSON.stringify({
      provider: "theoddsapi",
      usingOddsApi: true,
      offers,
      count: offers.length,
      market: usedMarket || MARKET_PRIMARY,
      error: offers.length ? null : (error || null)
    }) };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ provider: "theoddsapi", usingOddsApi: false, offers: [], error: String(e) }) };
  }
};
