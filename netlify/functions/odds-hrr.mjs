// netlify/functions/odds-hrr.mjs
// Odds fetcher for MLB Batter Hits+Runs+RBIs market using The Odds API v4.
// Market key: batter_hits_runs_rbis (optionally include alternate via env).
const ODDS_KEY = process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY;
const REGIONS = process.env.ODDS_REGIONS || "us,us2";
const BOOKS = (process.env.BOOKMAKERS || "").split(",").map(s=>s.trim()).filter(Boolean);
const API_BASE = process.env.THEODDSAPI_BASE || "https://api.the-odds-api.com/v4";
const SPORT = "baseball_mlb";
const MARKETS = (process.env.ODDSMARKET_HRR_MULTI || "batter_hits_runs_rbis,batter_hits_runs_rbis_alternate")
  .split(",").map(s=>s.trim()).filter(Boolean);

const json = (status, body) => ({ statusCode: status, headers: { "content-type":"application/json" }, body: JSON.stringify(body) });
const ok = (body) => json(200, body);
const fail = (msg, extra={}) => json(200, { ok:false, error: String(msg), provider:"theoddsapi", usingOddsApi: !!ODDS_KEY, ...extra });

function americanFromDecimal(d) {
  const x = Number(d);
  if (!isFinite(x) || x <= 1) return null;
  return x >= 2 ? Math.round((x-1)*100) : Math.round(-100/(x-1));
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "odds-hrr/1.0" }, redirect: "follow", cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status} for ${url} :: ${text?.slice(0,240)}`);
  }
  return await r.json();
}

export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters||{});
    const date = qs.get("date") || new Date().toISOString().slice(0,10);
    if (!ODDS_KEY) return fail("missing THEODDSAPI_KEY", { date, count:0, offers:[] });

    // 1) List today's events
    const eventsUrl = `${API_BASE}/sports/${SPORT}/events?apiKey=${encodeURIComponent(ODDS_KEY)}`;
    const events = await fetchJson(eventsUrl);
    if (!Array.isArray(events) || !events.length) return ok({ ok:true, provider:"theoddsapi", usingOddsApi:true, date, count:0, offers:[] });

    // 2) Per-event odds
    const offers = [];
    const marketsParam = encodeURIComponent(MARKETS.join(","));
    for (const ev of events) {
      const evId = ev?.id || ev?.event_id;
      if (!evId) continue;
      const evOddsUrl = `${API_BASE}/sports/${SPORT}/events/${evId}/odds?apiKey=${encodeURIComponent(ODDS_KEY)}&regions=${encodeURIComponent(REGIONS)}&markets=${marketsParam}&oddsFormat=decimal`;
      let data;
      try { data = await fetchJson(evOddsUrl); } catch { continue; }
      const bookmakers = data?.bookmakers || [];
      const home = data?.home_team || ev?.home_team || "";
      const away = data?.away_team || ev?.away_team || "";
      const game = `${away}@${home}`;
      for (const bm of bookmakers) {
        if (BOOKS.length && !BOOKS.includes(bm.key)) continue;
        for (const mk of (bm.markets||[])) {
          if (!MARKETS.includes(mk.key)) continue;
          for (const o of (mk.outcomes||[])) {
            const side = (o.name||"").toLowerCase();
            if (side !== "over") continue;
            const point = Number(o.point);
            // We target Over 1.5 (or higher lines allowed; front-end can filter if needed)
            if (!(point >= 1.5)) continue;
            const dec = Number(o.price);
            const american = americanFromDecimal(dec);
            const player = o.description || o.player || o.participant || null;
            if (!player) continue;
            offers.push({ market: mk.key, player, team:"", game, bookmaker: bm.key, point, decimal: dec, american });
          }
        }
      }
    }

    // Best price per player (highest decimal)
    const best = new Map();
    for (const x of offers) {
      const k = x.player.toLowerCase();
      const prev = best.get(k);
      if (!prev || (Number(x.decimal||0) > Number(prev.decimal||0))) best.set(k, x);
    }
    const out = Array.from(best.values());
    out.sort((a,b)=> (b.decimal||0) - (a.decimal||0));

    return ok({ ok:true, provider:"theoddsapi", usingOddsApi:true, date, count: out.length, offers: out });
  } catch (err) {
    return fail(err);
  }
};
