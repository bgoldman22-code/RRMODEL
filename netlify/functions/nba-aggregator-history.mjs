/**
 * NBA Aggregator History — Retrieve saved daily picks
 * 
 * Usage:
 *   GET /nba-aggregator-history                → returns index of all saved dates
 *   GET /nba-aggregator-history?date=2026-03-13 → returns picks for that date
 *   GET /nba-aggregator-history?last=7          → returns last 7 days of picks
 */

import { getStore } from '@netlify/blobs';

const STORE_NAME = 'nba-aggregator';

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=300',
};

export default async (req) => {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const last = parseInt(url.searchParams.get('last') || '0', 10);

  const store = getStore(STORE_NAME);

  // ─── Single date ───────────────────────────────────────────────────────
  if (date) {
    try {
      const data = await store.get(date, { type: 'json' });
      if (!data) {
        return new Response(JSON.stringify({ ok: false, error: 'not-found', date }), {
          status: 404, headers: CORS,
        });
      }
      return new Response(JSON.stringify({ ok: true, ...data }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500, headers: CORS,
      });
    }
  }

  // ─── Last N days ───────────────────────────────────────────────────────
  if (last > 0) {
    try {
      let index = [];
      try {
        const existing = await store.get('_index', { type: 'json' });
        if (Array.isArray(existing)) index = existing;
      } catch { /* empty */ }

      const recent = index.slice(-last);
      const results = await Promise.all(
        recent.map(async d => {
          try {
            const data = await store.get(d, { type: 'json' });
            return data;
          } catch { return null; }
        })
      );

      return new Response(JSON.stringify({
        ok: true,
        dates: recent,
        days: results.filter(Boolean),
      }), { headers: CORS });
    } catch (err) {
      return new Response(JSON.stringify({ ok: false, error: err.message }), {
        status: 500, headers: CORS,
      });
    }
  }

  // ─── Index (default) ──────────────────────────────────────────────────
  try {
    let index = [];
    try {
      const existing = await store.get('_index', { type: 'json' });
      if (Array.isArray(existing)) index = existing;
    } catch { /* empty */ }

    return new Response(JSON.stringify({
      ok: true,
      totalDays: index.length,
      dates: index,
    }), { headers: CORS });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: CORS,
    });
  }
};
