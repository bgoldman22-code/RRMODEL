// netlify/functions/nfl-odds.cjs
// Returns DraftKings "Anytime TD" offers in a flat list the frontend can consume.
// Env:
//   ODDS_API_KEY_NFL (required for live data)
//   ODDSAPI_BOOKMAKER_NFL (default: draftkings)
//   ODDSAPI_MARKET_NFL (default: player_anytime_td)
// Query params override env: ?book=draftkings&market=player_anytime_td

function pick(param, envKey, def) {
  const qp = param && typeof param === "string" && param.trim() ? param.trim() : "";
  if (qp) return qp;
  const ev = process.env[envKey];
  if (ev && String(ev).trim()) return String(ev).trim();
  return def;
}

function americanToDecimal(american) {
  const a = Number(String(american).replace(/[^\-0-9]/g, ""));
  if (!isFinite(a) || a === 0) return null;
  return a > 0 ? 1 + a / 100 : 1 + 100 / Math.abs(a);
}

function normalizeOutcome(outcome, meta) {
  if (!outcome) return null;
  const name = outcome.name || outcome.title || outcome.player || outcome.selection;
  const american = outcome.price?.american ?? outcome.american ?? outcome.oddsAmerican;
  const decimal = outcome.price?.decimal ?? outcome.decimal ?? americanToDecimal(american);
  return {
    book: meta.book,
    eventId: meta.eventId,
    event: meta.event,
    selection: name,
    american: american ?? null,
    decimal: decimal ?? null,
    market: meta.market,
    commence_time: meta.commence_time || null
  };
}

async function fetchOdds({ apiKey, market, bookmaker }) {
  const base = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds";
  const url = `${base}?regions=us&markets=${encodeURIComponent(market)}&bookmakers=${encodeURIComponent(bookmaker)}&apiKey=${apiKey}`;
  const res = await fetch(url, {
    headers: {
      "Accept": "application/json",
      "User-Agent": "NetlifyFunctions-RROdds/1.0"
    }
  });
  if (!res.ok) throw new Error(`http ${res.status}`);
  const data = await res.json(); // array of events
  const offers = [];
  for (const ev of Array.isArray(data) ? data : []) {
    const meta = { eventId: ev.id, event: ev.home_team && ev.away_team ? `${ev.away_team} @ ${ev.home_team}` : ev.id, commence_time: ev.commence_time, book: bookmaker, market };
    for (const bk of ev.bookmakers || []) {
      if (bk.title && String(bk.title).toLowerCase() !== String(bookmaker).toLowerCase()) continue;
      for (const mk of bk.markets || []) {
        if (mk.key && String(mk.key).toLowerCase() !== String(market).toLowerCase()) continue;
        for (const oc of mk.outcomes || []) {
          const norm = normalizeOutcome(oc, meta);
          if (norm) offers.push(norm);
        }
      }
    }
  }
  return offers;
}

module.exports.handler = async (event) => {
  try {
    const q = event && event.queryStringParameters || {};
    const apiKey = process.env.ODDS_API_KEY_NFL || process.env.VITE_ODDS_API_KEY || process.env.ODDS_API_KEY;
    const bookmaker = pick(q.book, "ODDSAPI_BOOKMAKER_NFL", "draftkings").toLowerCase();
    const market = pick(q.market, "ODDSAPI_MARKET_NFL", "player_anytime_td").toLowerCase();

    if (!apiKey) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          ok: true,
          usingOddsApi: false,
          offers: [],
          market,
          bookmaker,
          note: "No ODDS_API_KEY_NFL set; returning empty offers."
        })
      };
    }

    // Try a couple of aliases for market in case the book uses different keys
    const aliases = Array.from(new Set([market, "player_anytime_td", "player_touchdown_anytime", "anytime_td"]));
    let offers = [];
    let lastErr = null;
    for (const m of aliases) {
      try {
        offers = await fetchOdds({ apiKey, market: m, bookmaker });
        if (offers.length) {
          return {
            statusCode: 200,
            body: JSON.stringify({ ok: true, usingOddsApi: true, offers, market: m, bookmaker })
          };
        }
      } catch (e) {
        lastErr = String(e);
        continue;
      }
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, usingOddsApi: true, offers: [], market, bookmaker, note: lastErr || "no offers returned" })
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
};
