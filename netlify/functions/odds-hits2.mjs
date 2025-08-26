// netlify/functions/odds-hits2.mjs
// Fetch MLB player hits odds (Over 1.5+) from The Odds API and normalize to unified offers.
const ODDS_KEY = process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY;
const REGIONS = process.env.ODDS_REGIONS || "us";
const BOOKS = (process.env.BOOKMAKERS || "").split(",").map(s=>s.trim()).filter(Boolean);
const MARKET = process.env.ODDSMARKET_HITS || "player_hits";
const API_BASE = process.env.THEODDSAPI_BASE || "https://api.the-odds-api.com/v4";

const json = (status, body) => ({ statusCode: status, headers: { "content-type":"application/json" }, body: JSON.stringify(body) });
const ok = (body) => json(200, body);
const fail = (msg, extra={}) => json(200, { ok:false, error: String(msg), ...extra });

async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "odds-hits2/1.0" }, redirect: "follow", cache: "no-store" });
  if (!r.ok) {
    const text = await r.text().catch(()=> "");
    throw new Error(`HTTP ${r.status} for ${url} :: ${text?.slice(0,240)}`);
  }
  return await r.json();
}

function americanFromDecimal(d) {
  const x = Number(d);
  if (!isFinite(x) || x <= 1) return null;
  return x >= 2 ? Math.round((x-1)*100) : Math.round(-100/(x-1));
}

export const handler = async (event) => {
  try {
    const qs = new URLSearchParams(event.queryStringParameters||{});
    const date = qs.get("date") || new Date().toISOString().slice(0,10);

    if (!ODDS_KEY) return fail("missing THEODDSAPI_KEY", { provider:"theoddsapi", usingOddsApi:false, date, count:0, offers:[] });

    const url = `${API_BASE}/sports/baseball_mlb/odds/?apiKey=${encodeURIComponent(ODDS_KEY)}&regions=${encodeURIComponent(REGIONS)}&markets=${encodeURIComponent(MARKET)}&oddsFormat=decimal`;
    const data = await fetchJson(url);

    const offers = [];
    for (const game of data || []) {
      const commence = game.commence_time;
      const home = game.home_team;
      const away = game.away_team;
      const books = game.bookmakers || [];
      for (const bm of books) {
        if (BOOKS.length && !BOOKS.includes(bm.key)) continue;
        const mk = (bm.markets || []).find(m => m.key === MARKET);
        if (!mk) continue;
        for (const o of mk.outcomes || []) {
          // We want Over on 1.5 (or higher if book only posts 2.5 etc.)
          if ((o.name || "").toLowerCase() !== "over") continue;
          const point = Number(o.point);
          if (!(point >= 1.5)) continue;
          const dec = Number(o.price);
          const american = americanFromDecimal(dec);
          // description may contain player name; some books put it in 'description'
          const player = o.description || o.player || o.participant || null;
          if (!player) continue;
          offers.push({
            player,
            team: "", game: `${away}@${home}`,
            bookmaker: bm.key,
            point, decimal: dec, american, commence
          });
        }
      }
    }

    // Deduplicate by (player, best price)
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
