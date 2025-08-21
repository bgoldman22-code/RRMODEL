// netlify/functions/nfl-odds.cjs
// Odds fetcher with verbose debug logs and robust aliasing for DraftKings Anytime TD.
// Returns { ok, usingOddsApi, offers: [], marketTried: [], bookmaker, debug } when debug=1.

const DEFAULT_MARKETS = [
  "player_anytime_td",
  "player_touchdown_anytime",
  "anytime_td",
  "touchdown_scorer_anytime"
];

function pickBookmaker(event) {
  const q = (event?.queryStringParameters?.book || "").toLowerCase().trim();
  const env = (process.env.ODDSAPI_BOOKMAKER_NFL || "").toLowerCase().trim();
  return q || env || "draftkings";
}

function pickMarkets(event) {
  const q = (event?.queryStringParameters?.market || "").toLowerCase().trim();
  const env = (process.env.ODDSAPI_MARKET_NFL || "").toLowerCase().trim();
  const primary = q || env || "player_anytime_td";
  const list = [primary, ...DEFAULT_MARKETS];
  // ensure unique, lowercase
  return Array.from(new Set(list.map(s => s.toLowerCase().trim())));
}

function normalizeOffer(o, book) {
  const selection = o.title || o.name || o.player || (o.outcomes && o.outcomes[0] && o.outcomes[0].name) || o.selection;
  let american = o.american || (o.price && o.price.american);
  let decimal = o.decimal || (o.price && o.price.decimal);
  if (!decimal && typeof american === "number") {
    decimal = american > 0 ? 1 + american/100 : 1 + 100/Math.abs(american);
  }
  return { book: book || o.book || "DraftKings", selection, american, decimal };
}

module.exports.handler = async (event) => {
  const API_KEY = process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
  const bookmaker = pickBookmaker(event);
  const markets = pickMarkets(event);
  const debug = (event?.queryStringParameters?.debug === "1");
  const sport = "americanfootball_nfl";
  const base = `https://api.the-odds-api.com/v4/sports/${sport}/odds`;
  const region = "us";

  if (!API_KEY) {
    const body = { ok: true, usingOddsApi: false, offers: [], meta: { sport, markets }, note: "No ODDS_API_KEY_NFL set" };
    return { statusCode: 200, body: JSON.stringify(body) };
  }

  let lastErr = null;
  let marketTried = [];
  let firstRawSample = null;
  let offers = [];

  for (const market of markets) {
    const url = `${base}?regions=${region}&markets=${encodeURIComponent(market)}&bookmakers=${encodeURIComponent(bookmaker)}&apiKey=${API_KEY}`;
    marketTried.push(market);
    try {
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      if (debug && firstRawSample === null) {
        firstRawSample = Array.isArray(data) ? data.slice(0,1) : data;
        console.log("[nfl-odds] raw sample", JSON.stringify(firstRawSample).slice(0, 2000));
      }
      if (!Array.isArray(data) || data.length === 0) {
        if (debug) console.log("[nfl-odds] empty data array for market", market);
        continue;
      }
      for (const ev of data) {
        if (debug) console.log("[nfl-odds] event", ev?.id || ev?.commence_time || "no-id");
        const books = ev.bookmakers || [];
        for (const bk of books) {
          const bktitle = (bk.title || bk.key || "").toLowerCase();
          if (!bktitle.includes(bookmaker)) continue;
          const mkts = bk.markets || [];
          for (const mk of mkts) {
            const oc = mk.outcomes || [];
            for (const outcome of oc) {
              offers.push(normalizeOffer(outcome, bk.title));
            }
          }
        }
      }
      if (offers.length > 0) {
        const body = { ok: true, usingOddsApi: true, offers, bookmaker, marketUsed: market, marketTried };
        if (debug) body.debug = { url, sample: firstRawSample };
        return { statusCode: 200, body: JSON.stringify(body) };
      }
    } catch (e) {
      lastErr = String(e);
      if (debug) console.log("[nfl-odds] fetch error", market, lastErr);
      continue;
    }
  }

  const body = { ok: true, usingOddsApi: true, offers: [], meta: { sport, markets: marketTried }, error: lastErr || null };
  return { statusCode: 200, body: JSON.stringify(body) };
};
