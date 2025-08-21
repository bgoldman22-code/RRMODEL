// netlify/functions/nfl-odds.cjs
// Fetch Anytime TD offers (DraftKings by default) from The Odds API.
// Returns { ok, usingOddsApi, offers, market, bookmaker, error? }
const MARKET_ALIASES = [
  "player_anytime_td",
  "player_anytime_touchdown",
  "player_touchdown_anytime",
  "anytime_td",
  "touchdown_scorer_anytime",
];

function pickMarket(query) {
  const fromQuery = (query && query.market) ? String(query.market).toLowerCase() : "";
  const fromEnv = (process.env.ODDSAPI_MARKET_NFL || process.env.ODDS_MARKET_NFL || "").toLowerCase();
  const m = fromQuery || fromEnv;
  return m || "player_anytime_td";
}

function pickBookmaker(query) {
  const fromQuery = (query && query.book) ? String(query.book).toLowerCase() : "";
  const fromEnv = (process.env.ODDSAPI_BOOKMAKER_NFL || process.env.BOOKMAKER_NFL || "").toLowerCase();
  const b = fromQuery || fromEnv;
  return b || "draftkings";
}

function decimalFromAmerican(a) {
  if (a == null) return null;
  const n = Number(String(a).replace(/[^0-9\-+]/g, ""));
  if (!isFinite(n)) return null;
  return n > 0 ? 1 + n/100 : 1 + 100/Math.abs(n);
}

function normalizeOffer({ book, team, player, name, selection, outcome, price, american, decimal }) {
  const sel = selection || player || name || (outcome && outcome.name) || null;
  let am = american || (price && price.american);
  let dec = decimal || (price && price.decimal);
  if (!dec && am != null) dec = decimalFromAmerican(am);
  return { book: book || "unknown", selection: sel, american: am, decimal: dec };
}

module.exports.handler = async (event) => {
  try {
    const API_KEY = process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
    const query = event && event.queryStringParameters || {};
    const marketPref = pickMarket(query);
    const bookmaker = pickBookmaker(query);
    const region = "us";

    const tried = [];
    const offers = [];

    if (!API_KEY) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          usingOddsApi: false,
          offers,
          market: marketPref,
          bookmaker,
          note: "No ODDS_API_KEY_NFL set; returning empty offers."
        })
      };
    }

    const base = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";
    for (const mk of [marketPref, ...MARKET_ALIASES]) {
      if (tried.includes(mk)) continue;
      tried.push(mk);
      const url = `${base}?regions=${region}&markets=${encodeURIComponent(mk)}&bookmakers=${encodeURIComponent(bookmaker)}&apiKey=${API_KEY}`;
      const res = await fetch(url, { headers: { "Accept": "application/json" } });
      if (!res.ok) continue;
      const data = await res.json();
      for (const ev of (Array.isArray(data) ? data : [])) {
        for (const bk of (ev.bookmakers || [])) {
          for (const m of (bk.markets || [])) {
            for (const oc of (m.outcomes || [])) {
              offers.push(normalizeOffer({ ...oc, book: bk.title }));
            }
          }
        }
      }
      if (offers.length) {
        return {
          statusCode: 200,
          body: JSON.stringify({ ok: true, usingOddsApi: true, offers, market: mk, bookmaker })
        };
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, usingOddsApi: true, offers: [], market: marketPref, bookmaker, error: "no_offers_found" })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, usingOddsApi: false, offers: [], error: String(e) }) };
  }
};
