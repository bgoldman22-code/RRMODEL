// netlify/functions/nfl-odds.cjs
// Minimal Odds fetcher with DraftKings + Anytime TD defaults.
// Uses native fetch (Node 20). Returns { ok, usingOddsApi, offers, market, bookmaker }.

const DEFAULT_MARKET_ALIASES = [
  "player_anytime_td",
  "player_anytime_touchdown",
  "anytime_td",
  "touchdown_scorer_anytime"
];

function pickMarket() {
  const env = process.env.ODDSAPI_MARKET_NFL || process.env.ODDS_MARKET_NFL || "";
  const m = (env || "").toLowerCase().trim();
  if (m) return m;
  return "player_anytime_td";
}

function pickBookmaker() {
  const env = process.env.ODDSAPI_BOOKMAKER_NFL || process.env.BOOKMAKER_NFL || "";
  const b = (env || "").toLowerCase().trim();
  return b || "draftkings";
}

function normOffer(o, bookmaker) {
  // Normalize a few fields so the UI/shim can read them.
  const book = bookmaker || (o.bookmaker && o.bookmaker.title) || o.book || "unknown";
  const selection = o.title || o.name || o.player || (o.outcomes && o.outcomes[0] && o.outcomes[0].name) || o.selection;
  let american = o.american || (o.price && o.price.american);
  let decimal = o.decimal || (o.price && o.price.decimal);
  if (!decimal && typeof american === "number") {
    decimal = american > 0 ? 1 + american/100 : 1 + 100/Math.abs(american);
  }
  return { book, selection, american, decimal };
}

module.exports.handler = async (event) => {
  const API_KEY = process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
  const marketEnv = pickMarket();
  const bookmakerEnv = pickBookmaker();
  const marketsToTry = Array.from(new Set([marketEnv, ...DEFAULT_MARKET_ALIASES]));
  const region = "us";

  if (!API_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        usingOddsApi: false,
        offers: [],
        market: marketEnv,
        bookmaker: bookmakerEnv,
        note: "No ODDS_API_KEY_NFL set; returning empty offers."
      })
    };
  }

  const base = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";
  let lastErr = null;

  for (const market of marketsToTry) {
    try {
      const url = `${base}?regions=${region}&markets=${encodeURIComponent(market)}&bookmakers=${encodeURIComponent(bookmakerEnv)}&apiKey=${API_KEY}`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "NetlifyFunctions/odds-fetch"
        }
      });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();
      // data = array of events, each with bookmakers/outcomes
      const offers = [];
      for (const ev of (Array.isArray(data) ? data : [])) {
        for (const bk of (ev.bookmakers || [])) {
          for (const mk of (bk.markets || [])) {
            for (const oc of (mk.outcomes || [])) {
              offers.push(normOffer({ ...oc, book: bk.title }, bk.title));
            }
          }
        }
      }
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          usingOddsApi: true,
          offers,
          market,
          bookmaker: bookmakerEnv
        })
      };
    } catch (e) {
      lastErr = String(e);
      continue; // try next alias
    }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: false,
      usingOddsApi: true,
      offers: [],
      market: marketEnv,
      bookmaker: bookmakerEnv,
      error: lastErr || "unknown fetch error"
    })
  };
};
