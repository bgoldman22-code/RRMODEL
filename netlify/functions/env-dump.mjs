import * as real from '@netlify/blobs';
import { getStore } from './_blobs.js';

export async function handler(event) {
  try {
    const qs = event?.queryStringParameters || {};
    const name = qs.store || process.env.BLOBS_STORE || 'mlb-odds';

    const exportKeys = Object.keys(real || {});
    const store = getStore({ name });

    const probeKey = 'env-dump-probe.json';
    const payload = {
      ts: new Date().toISOString(),
      siteID: process.env.NETLIFY_SITE_ID || null,
      tokenSet: !!process.env.NETLIFY_BLOBS_TOKEN,
    };

    await store.set(probeKey, JSON.stringify(payload), { contentType: 'application/json' });
    const got = await store.get(probeKey, { type: 'json' });

    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: true,
        BLOBS_STORE: process.env.BLOBS_STORE || 'mlb-odds',
        BLOBS_STORE_NFL: process.env.BLOBS_STORE_NFL || 'nfl-td',
        NETLIFY_SITE_ID: mask(process.env.NETLIFY_SITE_ID),
        NETLIFY_BLOBS_TOKEN: mask(process.env.NETLIFY_BLOBS_TOKEN),
        NETLIFY_API_TOKEN: mask(process.env.NETLIFY_API_TOKEN),
        NETLIFY_AUTH_TOKEN: mask(process.env.NETLIFY_AUTH_TOKEN),
        ODDS_API_KEY: mask(process.env.ODDS_API_KEY),
        ODDS_API_KEY_NFL: mask(process.env.ODDS_API_KEY_NFL),
        THEODDS_API_KEY: mask(process.env.THEODDS_API_KEY),
        VITE_ODDS_API_KEY: mask(process.env.VITE_ODDS_API_KEY),
        probe: { hasCreateClient: !!real.createClient, hasGetStore: !!real.getStore, exportKeys },
        blobsProbe: { ok: true, wrote: payload, read: got },
      }),
    };
  } catch (e) {
    return { statusCode: 200, body: JSON.stringify({ ok: false, error: String(e) }) };
  }
}

function mask(v) {
  if (!v || typeof v !== 'string' || v.length < 9) return v || null;
  return v.slice(0, 4) + '…' + v.slice(-4);
}
