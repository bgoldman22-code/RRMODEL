// netlify/functions/props-diagnostics.mjs
import { getBlobsStore } from './_blobs.js';

export const handler = async (event) => {
  try {
    const { model = 'mlb_hits2', date = '' } = Object.fromEntries(new URLSearchParams(event.queryStringParameters || {}));
    const storeName = process.env.BLOBS_STORE || 'mlb-odds';
    const store = getBlobsStore(storeName);

    // round-trip test
    const key = `diag/ping-${Date.now()}`;
    await store.setJSON(key, { ok: true, t: Date.now(), model, date });
    const snap = await store.getJSON(key);

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        store: storeName,
        wroteKey: key,
        roundTripOK: !!snap,
        sample: snap || null
      })
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e && e.message || e) })
    };
  }
};
