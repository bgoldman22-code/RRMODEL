// odds-refresh: cache market odds to Blobs to avoid placeholder prices and save API credits.
// Two modes:
// 1) POST custom odds JSON: { week, rows: [{ gameId, ml_home, ml_away }, ...] }
// 2) GET with ?week=#: tries to fetch from TheOddsAPI if env key present (limited usage), then caches.
//
// Writes to: odds_week_<W>.json with shape { week, updatedAt, rows: [...] }

import { blobsPutJSON } from '../_lib/blobs.js';

export default async (req, context) => {
  try {
    if (req.method === 'POST') {
      const payload = await req.json();
      if (!payload?.week || !Array.isArray(payload?.rows)) {
        return new Response(JSON.stringify({ error: 'POST requires { week, rows: [...] }' }), { status: 400 });
      }
      const out = await writeWeekOdds(payload.week, payload.rows, { source: 'manual' });
      return new Response(JSON.stringify(out, null, 2), { headers: { 'content-type': 'application/json' }});
    }

    const url = new URL(req.url);
    const week = Number(url.searchParams.get('week')) || null;
    const force = url.searchParams.get('force') === '1';
    if (!week && week !== 0) {
      return new Response(JSON.stringify({ error: 'Missing ?week' }), { status: 400 });
    }

    // Minimal TheOddsAPI support (optional). You can expand this to your liking.
    const KEY = process.env.THEODDSAPI_KEY || process.env.ODDS_API_KEY || null;
    if (!KEY) {
      return new Response(JSON.stringify({ ok: false, reason: 'No ODDS API key; use POST mode to write odds.' }, null, 2), { status: 200 });
    }

    // NOTE: This is a placeholder; adapt to your gameId mapping.
    // To keep credits low, you should call this sparingly (e.g., once pre-week) and cache via Blobs.
    // Here we just write an empty shell to illustrate the cache flow.
    const rows = []; // TODO: integrate your schedule mapping + book selection
    const out = await writeWeekOdds(week, rows, { source: 'theoddsapi' });
    return new Response(JSON.stringify(out, null, 2), { headers: { 'content-type': 'application/json' }});
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err?.message || err) }, null, 2), { status: 500 });
  }
};

async function writeWeekOdds(week, rows, meta = {}) {
  const data = {
    week,
    updatedAt: new Date().toISOString(),
    meta,
    rows: rows.map(r => ({
      gameId: r.gameId,
      ml_home: r.ml_home ?? null,
      ml_away: r.ml_away ?? null,
    })),
  };
  await blobsPutJSON(`odds_week_${week}.json`, data);
  return { ok: true, wrote: data.rows.length, key: `odds_week_${week}.json` };
}
