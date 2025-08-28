import { getStore, getJSON, setJSON } from './_blobs.js';

export async function handler(event) {
  try {
    const storeName = event?.queryStringParameters?.store || process.env.BLOBS_STORE || 'mlb-odds';
    const store = getStore(storeName);

    const mask = (v) => (v ? (v.slice(0, 4) + '…' + v.slice(-4)) : null);

    // sanity-probe the store
    const probeKey = 'env-dump-probe.json';
    await setJSON(store, probeKey, { ok: true, ts: Date.now() });
    const got = await getJSON(store, probeKey);

    const real = await import('@netlify/blobs');
    const exportKeys = Object.keys(real).sort();

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ok: true,
        BLOBS_STORE: process.env.BLOBS_STORE,
        BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL,
        NETLIFY_SITE_ID: mask(process.env.NETLIFY_SITE_ID),
        NETLIFY_BLOBS_TOKEN: mask(process.env.NETLIFY_BLOBS_TOKEN),
        NETLIFY_API_TOKEN: mask(process.env.NETLIFY_API_TOKEN),
        NETLIFY_AUTH_TOKEN: mask(process.env.NETLIFY_AUTH_TOKEN),
        ODDS_API_KEY: mask(process.env.ODDS_API_KEY),
        ODDS_API_KEY_NFL: mask(process.env.ODDS_API_KEY_NFL),
        THEODDS_API_KEY: mask(process.env.THEODDS_API_KEY),
        VITE_ODDS_API_KEY: mask(process.env.VITE_ODDS_API_KEY),
        probe: {
          wrote: !!got,
          hasCreateClient: typeof real.createClient === 'function',
          hasGetStore: typeof real.getStore === 'function',
          exportKeys
        }
      })
    };
  } catch (e) {
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ok: false, error: String(e) })
    };
  }
}
