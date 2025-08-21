// netlify/functions/nfl-odds.cjs
module.exports.handler = async (event) => {
  const region = process.env.ODDSAPI_REGION_NFL || "us";
  const sport = process.env.ODDSAPI_SPORT_NFL || "americanfootball_nfl";
  const marketOrder = [
    process.env.ODDSAPI_MARKET_NFL || "player_anytime_td",
    "player_anytime_touchdown",
    "player_anytime_td"
  ];
  const bookmaker = process.env.ODDSAPI_BOOKMAKER_NFL || "draftkings";
  const key = process.env.ODDS_API_KEY_NFL || "";
  if (!key) {
    return { statusCode: 200, body: JSON.stringify({ ok:true, usingOddsApi:false, offers:[] }) };
  }
  const base = process.env.ODDSAPI_BASE || "https://api.the-odds-api.com/v4";
  async function fetchJson(url){
    const res = await fetch(url, { headers: { "Accept":"application/json" } });
    if (!res.ok) throw new Error("http "+res.status);
    return await res.json();
  }
  for (const market of marketOrder) {
    try {
      const url = `${base}/sports/${sport}/odds?regions=${region}&markets=${market}&oddsFormat=american&bookmakers=${bookmaker}&apiKey=${key}`;
      const j = await fetchJson(url);
      // Flatten to offers list with player + price
      const offers = [];
      for (const game of j || []) {
        const bm = (game.bookmakers || [])[0];
        const mk = (bm?.markets || [])[0];
        for (const o of mk?.outcomes || []) {
          if (!o?.name || typeof o?.price !== "number") continue;
          offers.push({ player: o.name, price: o.price, gameId: game.id || null, home_team: game.home_team, away_team: game.away_team });
        }
      }
      return { statusCode: 200, body: JSON.stringify({ ok:true, usingOddsApi:true, market, offers, count: offers.length }) };
    } catch(e) {}
  }
  return { statusCode: 200, body: JSON.stringify({ ok:true, usingOddsApi:false, offers:[], count:0 }) };
};
