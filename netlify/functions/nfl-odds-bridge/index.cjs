'use strict';
/**
 * netlify/functions/nfl-odds-bridge/index.cjs
 *
 * Uses TheOddsAPI with shared env var: ODDS_API_KEY
 * Caches normalized rows in Netlify Blobs (TTL).
 */
const { getStore } = require('@netlify/blobs');
const fetch = global.fetch || require('node-fetch');

const DEFAULT_REGION = process.env.ODDS_REGION || 'us';
const DEFAULT_BOOKMAKER = process.env.ODDS_BOOKMAKER || 'fanduel';
const DEFAULT_MARKETS = process.env.ODDS_MARKETS || 'h2h,spreads,totals';
const DEFAULT_TTL = parseInt(process.env.ODDS_TTL_SECONDS || '120', 10);

function getNflStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  const siteID = process.env.NETLIFY_SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN;
  try {
    if (siteID && token) return getStore(name, { siteID, token });
    return getStore(name);
  } catch (e) {
    try {
      if (siteID && token) return getStore({ name, siteID, token });
    } catch(_) {}
    throw e;
  }
}

function normalize(payload) {
  const rows = [];
  for (const ev of payload || []) {
    const home = ev.home_team, away = ev.away_team;
    const commence = ev.commence_time;
    const bk = (ev.bookmakers || []).find(b => b.key === DEFAULT_BOOKMAKER) || (ev.bookmakers || [])[0];
    let ml_home = null, ml_away = null, spread_point = null, spread_home_line = null, spread_away_line = null, total_points = null, over_price = null, under_price = null;
    if (bk) {
      for (const mkt of bk.markets || []) {
        if (mkt.key === 'h2h') {
          for (const oc of mkt.outcomes || []) {
            if (oc.name === home) ml_home = oc.price;
            if (oc.name === away) ml_away = oc.price;
          }
        } else if (mkt.key === 'spreads') {
          const h = (mkt.outcomes || []).find(o => o.name === home);
          const a = (mkt.outcomes || []).find(o => o.name === away);
          if (h) { spread_point = h.point; spread_home_line = h.price; }
          if (a) { spread_away_line = a.price; }
        } else if (mkt.key === 'totals') {
          const over = (mkt.outcomes || []).find(o => (o.name || '').toLowerCase() === 'over');
          const under = (mkt.outcomes || []).find(o => (o.name || '').toLowerCase() === 'under');
          if (over) { total_points = over.point; over_price = over.price; }
          if (under) { if (total_points == null) total_points = under.point; under_price = under.price; }
        }
      }
    }
    rows.push({ id: ev.id, matchup: `${away} @ ${home}`, home, away, commence_time: commence, ml_home, ml_away, spread_point, spread_home_line, spread_away_line, total_points, over_price, under_price });
  }
  return rows;
}

async function fetchOdds() {
  const key = process.env.ODDS_API_KEY;
  if (!key) return { ok: true, payload: [] };
  const url = new URL('https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds');
  url.searchParams.set('apiKey', key);
  url.searchParams.set('regions', DEFAULT_REGION);
  url.searchParams.set('oddsFormat', 'american');
  url.searchParams.set('bookmakers', DEFAULT_BOOKMAKER);
  url.searchParams.set('markets', DEFAULT_MARKETS);
  const res = await fetch(url.toString());
  if (!res.ok) return { ok: false, status: res.status, text: await res.text() };
  return { ok: true, payload: await res.json() };
}

exports.handler = async () => {
  try {
    const store = getNflStore();
    const cacheKey = 'nfl-odds/latest.json';
    const cached = await store.get(cacheKey, { type: 'json' }).catch(() => null);
    const now = Date.now();
    if (cached && cached.fetched_at && now - cached.fetched_at < DEFAULT_TTL * 1000) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, provider: 'theoddsapi', usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: true, rows: cached.rows }) };
    }
    const r = await fetchOdds();
    if (!r.ok) {
      return { statusCode: 200, body: JSON.stringify({ ok: true, provider: 'theoddsapi', usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows: [], warning: r.text || `HTTP ${r.status}` }) };
    }
    const rows = normalize(r.payload);
    await store.setJSON(cacheKey, { fetched_at: now, rows });
    return { statusCode: 200, body: JSON.stringify({ ok: true, provider: 'theoddsapi', usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows }) };
  } catch (error) {
    return { statusCode: 200, body: JSON.stringify({ ok: true, provider: 'theoddsapi', usingOddsApi: !!process.env.ODDS_API_KEY, fromCache: false, rows: [], warning: error.message }) };
  }
};
