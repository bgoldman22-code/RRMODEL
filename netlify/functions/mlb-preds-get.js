// netlify/functions/mlb-preds-get.js
// Proxy to mlb-metrics with safe Blobs caching.
// Expects a sibling function mlb-metrics that returns the full slate JSON.
import fetch from 'node-fetch';
import { getSafeStore } from './lib/blobs.js';

export const handler = async (event) => {
  const qs = new URLSearchParams(event.queryStringParameters || {});
  const date = qs.get('date') || new Date().toISOString().slice(0,10);
  const store = getSafeStore();
  const key = 'mlb_preds:' + date;

  try {
    // 1) Cache hit?
    if (store) {
      try {
        const cached = await store.get(key);
        if (cached) {
          return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: cached };
        }
      } catch {}
    }

    // 2) Proxy to local metrics function
    const proto = event.headers['x-forwarded-proto'] || 'https';
    const host  = event.headers.host;
    const base  = `${proto}://${host}`;
    const url   = `${base}/.netlify/functions/mlb-metrics?date=${encodeURIComponent(date)}`;

    let slate = null;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'roundrobin-proxy' }, timeout: 20000 });
      const txt = await r.text();
      slate = JSON.parse(txt);
    } catch (e) {
      // If metrics fails, return a soft error not to crash the app
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:'metrics-unavailable', detail:String(e) }) };
    }

    // 3) Cache best-effort
    if (store) {
      try { await store.set(key, JSON.stringify(slate), { ttl: 600 }); } catch {}
    }

    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(slate) };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error:String(e && e.message || e) }) };
  }
};
