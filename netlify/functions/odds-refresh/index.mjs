// odds-refresh (TheOddsAPI-backed)
// - GET: fetches NFL H2H moneylines from TheOddsAPI and caches to Blobs as odds_week_<W>.json
//        query: ?week=1[&force=1][&bookmaker=fanduel]
// - POST: manual override remains supported, but you said you'll use TheOddsAPI.
// Output rows are keyed by (home, away) abbreviations; if you also know your gameIds,
// you can POST a mapping later to enrich them, but schedule-source will join by pair.
//
// Env: THEODDSAPI_KEY must be set in Netlify.

import { blobsPutJSON, blobsGetJSON } from '../_lib/blobs.js';

const SPORT_KEY = 'americanfootball_nfl';

const NAME_TO_ABBR = {
  "Arizona Cardinals": "ARI",
  "Atlanta Falcons": "ATL",
  "Baltimore Ravens": "BAL",
  "Buffalo Bills": "BUF",
  "Carolina Panthers": "CAR",
  "Chicago Bears": "CHI",
  "Cincinnati Bengals": "CIN",
  "Cleveland Browns": "CLE",
  "Dallas Cowboys": "DAL",
  "Denver Broncos": "DEN",
  "Detroit Lions": "DET",
  "Green Bay Packers": "GB",
  "Houston Texans": "HOU",
  "Indianapolis Colts": "IND",
  "Jacksonville Jaguars": "JAX",
  "Kansas City Chiefs": "KC",
  "Los Angeles Rams": "LA",
  "Los Angeles Chargers": "LAC",
  "Las Vegas Raiders": "LV",
  "Miami Dolphins": "MIA",
  "Minnesota Vikings": "MIN",
  "New England Patriots": "NE",
  "New Orleans Saints": "NO",
  "New York Giants": "NYG",
  "New York Jets": "NYJ",
  "Philadelphia Eagles": "PHI",
  "Pittsburgh Steelers": "PIT",
  "Seattle Seahawks": "SEA",
  "San Francisco 49ers": "SF",
  "Tampa Bay Buccaneers": "TB",
  "Tennessee Titans": "TEN",
  "Washington Commanders": "WAS"
};

export default async (req, context) => {
  try {
    if (req.method === 'POST') {
      const payload = await req.json();
      if (!payload?.week || !Array.isArray(payload?.rows)) {
        return new Response(JSON.stringify({ error: 'POST requires { week, rows: [...] }' }), { status: 400 });
      }
      const out = await writeWeekOdds(payload.week, payload.rows, { source: 'manual' });
      return json(out);
    }

    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week'));
    const force = url.searchParams.get('force') === '1';
    const bookmaker = (url.searchParams.get('bookmaker') || 'fanduel').toLowerCase();

    if (!Number.isFinite(week)) {
      return json({ error: 'Missing or invalid ?week' }, 400);
    }

    // Avoid burning credits: if odds already exist and not forcing, exit.
    const existing = await blobsGetJSON(`odds_week_${week}.json`, null);
    if (existing && !force) {
      return json({ ok: true, cached: true, key: `odds_week_${week}.json`, wrote: existing.rows?.length || 0 });
    }

    const KEY = process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY;
    if (!KEY) {
      return json({ error: 'Missing THEODDSAPI_KEY env var' }, 400);
    }

    // Fetch NFL H2H odds (single call). Filter to US region, american prices, ISO dates.
    const apiUrl = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?regions=us&markets=h2h&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(KEY)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `TheOddsAPI error ${res.status}`, body: text }, 502);
    }
    const events = await res.json();

    // Build pair-keyed odds
    const rows = [];
    for (const evt of events || []) {
      const homeName = evt.home_team;
      const awayName = evt.away_team;
      const home = NAME_TO_ABBR[homeName];
      const away = NAME_TO_ABBR[awayName];
      if (!home || !away) continue;

      // Find preferred bookmaker
      let choice = null;
      for (const bk of evt.bookmakers || []) {
        const name = (bk.key || bk.title || '').toLowerCase();
        if (name.includes(bookmaker)) { choice = bk; break; }
      }
      if (!choice && (evt.bookmakers || []).length) {
        choice = evt.bookmakers[0]; // fallback
      }
      if (!choice) continue;

      // Extract H2H prices
      const h2h = (choice.markets || []).find(m => (m.key || '').toLowerCase() === 'h2h');
      if (!h2h) continue;

      // Map outcomes to ml_home/ml_away by home/away teams
      let ml_home = null, ml_away = null;
      for (const o of h2h.outcomes || []) {
        if (o.name === homeName) ml_home = o.price;
        else if (o.name === awayName) ml_away = o.price;
      }
      if (ml_home == null || ml_away == null) continue;

      rows.push({
        // No gameId: we key by pair for robust joining
        home, away,
        ml_home, ml_away,
        event_id: evt.id,
        commence_time: evt.commence_time
      });
    }

    const out = await writeWeekOdds(week, rows, { source: 'theoddsapi', bookmaker });
    return json(out);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

async function writeWeekOdds(week, rows, meta = {}) {
  const data = {
    week,
    updatedAt: new Date().toISOString(),
    meta,
    rows: rows.map(r => ({
      gameId: r.gameId ?? null,
      home: r.home ?? null,
      away: r.away ?? null,
      ml_home: r.ml_home ?? null,
      ml_away: r.ml_away ?? null,
      event_id: r.event_id ?? null,
      commence_time: r.commence_time ?? null
    })),
  };
  await blobsPutJSON(`odds_week_${week}.json`, data);
  return { ok: true, wrote: data.rows.length, key: `odds_week_${week}.json`, meta: data.meta };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
