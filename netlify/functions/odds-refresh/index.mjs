// odds-refresh with TheOddsAPI, using context-aware blobs helper (no '@netlify/blobs' imports).
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
        return json({ error: 'POST requires { week, rows: [...] }' }, 400);
      }
      const out = await writeWeekOdds(context, payload.week, payload.rows, { source: 'manual' });
      return json(out);
    }

    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week'));
    const force = url.searchParams.get('force') === '1';
    const bookmaker = (url.searchParams.get('bookmaker') || 'fanduel').toLowerCase();

    if (!Number.isFinite(week)) return json({ error: 'Missing or invalid ?week' }, 400);

    const existing = await blobsGetJSON(context, `odds_week_${week}.json`, null);
    if (existing && !force) {
      return json({ ok: true, cached: true, key: `odds_week_${week}.json`, wrote: existing.rows?.length || 0 });
    }

    const KEY = process.env.ODDS_API_KEY || process.env.THEODDSAPI_KEY;
    if (!KEY) return json({ error: 'Missing ODDS_API_KEY (or THEODDSAPI_KEY) env var' }, 400);

    const apiUrl = `https://api.the-odds-api.com/v4/sports/${SPORT_KEY}/odds?regions=us&markets=h2h&oddsFormat=american&dateFormat=iso&apiKey=${encodeURIComponent(KEY)}`;
    const res = await fetch(apiUrl);
    if (!res.ok) {
      const text = await res.text();
      return json({ error: `TheOddsAPI error ${res.status}`, body: text }, 502);
    }
    const events = await res.json();

    const rows = [];
    for (const evt of events || []) {
      const homeName = evt.home_team;
      const awayName = evt.away_team;
      const home = NAME_TO_ABBR[homeName];
      const away = NAME_TO_ABBR[awayName];
      if (!home || !away) continue;

      // preferred bookmaker
      let choice = null;
      for (const bk of evt.bookmakers || []) {
        const key = (bk.key || bk.title || '').toLowerCase();
        if (key.includes(bookmaker)) { choice = bk; break; }
      }
      if (!choice && (evt.bookmakers || []).length) choice = evt.bookmakers[0];
      if (!choice) continue;

      const h2h = (choice.markets || []).find(m => (m.key || '').toLowerCase() === 'h2h');
      if (!h2h) continue;

      let ml_home = null, ml_away = null;
      for (const o of h2h.outcomes || []) {
        if (o.name === homeName) ml_home = o.price;
        else if (o.name === awayName) ml_away = o.price;
      }
      if (ml_home == null || ml_away == null) continue;

      rows.push({
        home, away,
        ml_home, ml_away,
        event_id: evt.id,
        commence_time: evt.commence_time
      });
    }

    const out = await writeWeekOdds(context, week, rows, { source: 'theoddsapi', bookmaker });
    return json(out);
  } catch (err) {
    return json({ error: String(err?.message || err) }, 500);
  }
};

async function writeWeekOdds(context, week, rows, meta = {}) {
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
  await blobsPutJSON(context, `odds_week_${week}.json`, data);
  return { ok: true, wrote: data.rows.length, key: `odds_week_${week}.json`, meta: data.meta };
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
