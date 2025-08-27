// netlify/functions/mlb-preds-get.js
// FAIL-SAFE version that uses getSafeStore and never throws if Blobs is unavailable
import fetch from 'node-fetch';
import { getSafeStore } from './lib/blobs.js';

export const handler = async (event) => {
  try {
    const date = (new URLSearchParams(event.queryStringParameters || {})).get('date') || new Date().toISOString().slice(0,10);
    const store = getSafeStore();

    // Try cache first
    let raw = null;
    if (store) {
      try { raw = await store.get('mlb_preds:' + date); } catch {}
    }
    if (raw) {
      return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: raw };
    }

    // TODO: replace with your real slate builder/fetcher
    const resp = { ok: true, date, note: 'stub response - wire your real slate here', items: [] };

    // Cache (best-effort)
    if (store) {
      try { await store.set('mlb_preds:' + date, JSON.stringify(resp), { ttl: 3600 }); } catch {}
    }

    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(resp) };
  } catch (e) {
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok:false, error: String(e && e.message || e) }) };
  }
};
