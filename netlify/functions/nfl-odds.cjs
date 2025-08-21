// netlify/functions/nfl-odds.cjs
// DraftKings "Anytime TD" odds → normalized offers[]
// Node 20 native fetch. Supports ?book= & ?market= & ?debug=1
const DEFAULT_MARKET_ALIASES = [
  "player_anytime_td",
  "player_touchdown_anytime",
  "anytime_td",
  "touchdown_scorer_anytime"
];

const pick = (q, env, def) => {
  const v = (q ?? env ?? "").toString().trim();
  return v || def;
};

const toDecimal = (american) => {
  const num = Number(String(american ?? "").replace(/[^\-0-9]/g, ""));
  if (!Number.isFinite(num)) return null;
  return num > 0 ? 1 + num / 100 : 1 + 100 / Math.abs(num);
};

const normOffer = (bookTitle, outcome) => {
  const selection = outcome?.name || outcome?.title || outcome?.player || outcome?.label;
  const american = outcome?.price?.american ?? outcome?.american ?? null;
  const decimal = outcome?.price?.decimal ?? outcome?.decimal ?? toDecimal(american);
  return { book: bookTitle || "unknown", selection, american, decimal };
};

exports.handler = async (event) => {
  const qs = event?.queryStringParameters || {};
  const debug = qs.debug === "1" || qs.debug === "true";
  const SPORT = "americanfootball_nfl";
  const API_KEY = process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;

  // Book + market (query overrides env)
  const bookmaker = pick(qs.book, process.env.ODDSAPI_BOOKMAKER_NFL, "draftkings").toLowerCase();
  const marketPref = pick(qs.market, process.env.ODDSAPI_MARKET_NFL, "player_anytime_td").toLowerCase();
  const marketsToTry = Array.from(new Set([marketPref, ...DEFAULT_MARKET_ALIASES]));

  if (!API_KEY) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        usingOddsApi: false,
        offers: [],
        meta: { sport: SPORT, markets: marketsToTry, reason: "no_api_key" }
      })
    };
  }

  const base = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds`;
  let lastError = null;

  for (const market of marketsToTry) {
    try {
      const url = `${base}?regions=us&markets=${encodeURIComponent(market)}&bookmakers=${encodeURIComponent(bookmaker)}&apiKey=${API_KEY}`;
      if (debug) console.log("[nfl-odds] GET", url);
      const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "NetlifyFns/odds" } });
      if (!res.ok) throw new Error(`http ${res.status}`);
      const data = await res.json();

      if (debug) {
        const sample = Array.isArray(data) && data[0] ? data[0] : null;
        console.log("[nfl-odds] raw sample event:", sample ? JSON.stringify(sample).slice(0, 2000) : "null");
      }

      const offers = [];
      for (const ev of (Array.isArray(data) ? data : [])) {
        for (const bk of (ev.bookmakers || [])) {
          const title = (bk.title || bk.key || "").toString().toLowerCase();
          if (!title.includes(bookmaker)) continue;
          if (debug) console.log("[nfl-odds] bookmaker match:", title);
          for (const mk of (bk.markets || [])) {
            const mkey = (mk.key || mk.market || "").toString().toLowerCase();
            const accept = (mkey === market) || DEFAULT_MARKET_ALIASES.includes(mkey) || mkey.includes("anytime");
            if (!accept) continue;
            if (debug) console.log("[nfl-odds] market match:", mkey);
            for (const oc of (mk.outcomes || [])) {
              const o = normOffer(bk.title || title, oc);
              if (o.selection) offers.push(o);
            }
          }
        }
      }

      if (offers.length > 0) {
        return {
          statusCode: 200,
          body: JSON.stringify({
            ok: true,
            usingOddsApi: true,
            offers,
            meta: { sport: SPORT, marketTried: market, bookmaker }
          })
        };
      }

      lastError = `no_offers_for_${bookmaker}_${market}`;
      // continue to next alias
    } catch (e) {
      lastError = String(e);
      if (debug) console.log("[nfl-odds] fetch error:", lastError);
      // continue to next alias
    }
  }

  // Week 1 & shoulder periods can be sparse; return explicit meta so UI can show model-only
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      usingOddsApi: true,
      offers: [],
      meta: {
        sport: SPORT,
        markets: marketsToTry,
        bookmaker,
        message: "no offers found across tried markets; render model-only",
        lastError
      }
    })
  };
};
