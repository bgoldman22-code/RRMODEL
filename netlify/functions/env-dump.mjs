// netlify/functions/env-dump.mjs
import * as real from '@netlify/blobs';

export async function handler() {
  const mask = (v) => v ? (String(v).slice(0,4) + '…' + String(v).slice(-4)) : null;

  let probe = {
    hasCreateClient: typeof real.createClient === 'function',
    hasGetStore: typeof real.getStore === 'function',
    exportKeys: Object.keys(real || {}),
  };

  let blobsProbe;
  try {
    if (typeof real.getStore === 'function') {
      const store = real.getStore({
        name: process.env.BLOBS_STORE || 'mlb-odds',
        siteID: process.env.NETLIFY_SITE_ID,
        token: process.env.NETLIFY_BLOBS_TOKEN,
      });
      await store.setJSON('env-dump-probe.json', { ok: true, t: Date.now() });
      const got = await store.getJSON('env-dump-probe.json');
      blobsProbe = { ok: true, wrote: !!got };
    } else {
      blobsProbe = { error: 'getStore not available' };
    }
  } catch (e) {
    blobsProbe = { error: e.message || String(e) };
  }

  const body = {
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
    probe,
    blobsProbe,
  };

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}
