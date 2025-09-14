'use strict';
/**
 * netlify/functions/nfl-odds-bridge/index.cjs
 *
 * NFL odds bridge using TheOddsAPI — uses shared env var with MLB:
 *   ODDS_API_KEY = <your TheOddsAPI key>
 *
 * Pulls team markets: moneyline (h2h), spreads, totals.
 * Caches to Netlify Blobs to reduce API calls.
 *
 * Optional env (defaults shown):
 *   ODDS_REGION=us
 *   ODDS_BOOKMAKER=fanduel
 *   ODDS_MARKETS=h2h,spreads,totals
 *   ODDS_DAYS_FROM=7
 *   ODDS_TTL_SECONDS=120
 *   BLOBS_STORE_NFL=nfl-td
 *   NETLIFY_SITE_ID / NETLIFY_API_TOKEN (manual Blobs auth if needed)
 */
const DEFAULT_REGION = process.env.ODDS_REGION || "us";
const DEFAULT_BOOKMAKER = process.env.ODDS_BOOKMAKER || "fanduel";
const DEFAULT_MARKETS = process.env.ODDS_MARKETS || "h2h,spreads,totals";
const DEFAULT_DAYS_FROM = parseInt(process.env.ODDS_DAYS_FROM || "7", 10);
const DEFAULT_TTL = parseInt(process.env.ODDS_TTL_SECONDS || "120", 10);

const { getStore } = require("@netlify/blobs");

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  if (siteID && token) return getStore(name, { siteID, token });
  return getStore(name);
}

function friendlyMatchup(home, away) {
  return `${away} @ ${home}`;
}

function normalize(theOddsApiPayload) {
  const rows = [];
  for (const ev of theOddsApiPayload || []) {
    const home = ev.home_team;
    const away = ev.away_team;
    const commence = ev.commence_time;

    const bookmaker = (ev.bookmakers || []).find(b => b.key === DEFAULT_BOOKMAKER) || (ev.bookmakers || [])[0];
    if (!bookmaker) {
      rows.push({ matchup: friendlyMatchup(home, away), home, away, commence_time: commence });
      continue;
    }

    let ml_home = null, ml_away = null;
    let spread_point = null, spread_home_line = null, spread_away_line = null;
    let total_points = null, over_price = null, under_price = null;

    for (const mkt of bookmaker.markets || []) {
      if (mkt.key === "h2h") {
        for (const oc of mkt.outcomes || []) {
          if (oc.name === home) ml_home = oc.price;
          if (oc.name === away) ml_away = oc.price;
        }
      } else if (mkt.key === "spreads") {
        const homeOc = (mkt.outcomes || []).find(o => o.name === home);
        const awayOc = (mkt.outcomes || []).find(o => o.name === away);
        if (homeOc) { spread_point = homeOc.point; spread_home_line = homeOc.price; }
        if (awayOc) { spread_away_line = awayOc.price; }
      } else if (mkt.key === "totals") {
        const overOc = (mkt.outcomes || []).find(o => (o.name || "").toLowerCase() === "over");
        const underOc = (mkt.outcomes || []).find(o => (o.name || "").toLowerCase() === "under");
        if (overOc) { total_points = overOc.point; over_price = overOc.price; }
        if (underOc) { if (total_points == null) total_points = underOc.point; under_price = underOc.price; }
      }
    }

    rows.push({
      id: ev.id,
      matchup: friendlyMatchup(home, away),
      home, away,
      commence_time: commence,
      ml_home, ml_away,
      spread_point, spread_home_line, spread_away_line,
      total_points, over_price, under_price
    });
  }
  return rows;
}

async function fetchOdds() {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    return { ok: true, fromCache: false, rows: [], warning: "Missing ODDS_API_KEY; returning empty rows." };
  }

  const url = new URL("https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds");
  url.searchParams.set("apiKey", key);
  url.searchParams.set("regions", DEFAULT_REGION);
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("bookmakers", DEFAULT_BOOKMAKER);
  url.searchParams.set("markets", DEFAULT_MARKETS);
  url.searchParams.set("daysFrom", String(DEFAULT_DAYS_FROM));
  url.searchParams.set("dateFormat", "iso");

  const res = await fetch(url.toString(), { redirect: "follow" });
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, error: text.slice(0, 500), url: url.toString() };
  }
  const remaining = res.headers.get("x-requests-remaining");
  const used = res.headers.get("x-requests-used");
  const payload = await res.json();
  return { ok: true, payload, meta: { remaining, used } };
}

exports.handler = async (event) => {
  try {
    const diag = event && event.queryStringParameters && event.queryStringParameters.diag != null;
    const store = getNflStore();
    const cacheKey = "nfl-odds/latest.json";

    // TTL cache
    const cached = await store.get(cacheKey, { type: "json" }).catch(() => null);
    const now = Date.now();
    if (!diag && cached && cached.fetched_at && now - cached.fetched_at < DEFAULT_TTL * 1000) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, provider: "theoddsapi", usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: true, rows: cached.rows }) };
    }

    const result = await fetchOdds();
    if (!result.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, provider: "theoddsapi", usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows: [], warning: result.error || `HTTP ${result.status}`, url: result.url }) };
    }

    const rows = normalize(result.payload);
    const toCache = { fetched_at: now, rows };
    await store.setJSON(cacheKey, toCache);

    const response = { ok: true, provider: "theoddsapi", usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows };
    if (diag) response.diag = { daysFrom: DEFAULT_DAYS_FROM, region: DEFAULT_REGION, bookmaker: DEFAULT_BOOKMAKER, markets: DEFAULT_MARKETS, meta: result.meta };
    return { statusCode: 200, body: JSON.stringify(response) };
  } catch (error) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, provider: "theoddsapi", usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows: [], warning: error.message }) };
  }
};
