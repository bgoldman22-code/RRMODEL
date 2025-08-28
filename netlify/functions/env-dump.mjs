// netlify/functions/env-dump.mjs
import { getStore, diagBlobsEnv } from './_blobs.js';

export async function handler(event) {
  const env = process.env;
  const payload = {
    ok: true,
    BLOBS_STORE: env.BLOBS_STORE,
    BLOBS_STORE_NFL: env.BLOBS_STORE_NFL || env.NFL_TD_BLOBS,
    NETLIFY_SITE_ID: mask(env.NETLIFY_SITE_ID),
    NETLIFY_BLOBS_TOKEN: mask(env.NETLIFY_BLOBS_TOKEN),
    NETLIFY_API_TOKEN: mask(env.NETLIFY_API_TOKEN),
    NETLIFY_AUTH_TOKEN: mask(env.NETLIFY_AUTH_TOKEN),
    ODDS_API_KEY: mask(env.ODDS_API_KEY),
    ODDS_API_KEY_NFL: mask(env.ODDS_API_KEY_NFL),
    THEODDS_API_KEY: mask(env.THEODDS_API_KEY),
    VITE_ODDS_API_KEY: mask(env.VITE_ODDS_API_KEY),
  };

  function mask(v) { return v ? (v.slice(0,4) + '…' + v.slice(-4)) : v; }

  payload.probe = await diagBlobsEnv();

  // Try a write/read on the configured MLB store
  try {
    const name = env.BLOBS_STORE || 'mlb-odds';
    const store = getStore(name);
    const key = 'env-dump-probe.json';
    const stamp = { ts: Date.now(), name };
    await store.set(key, JSON.stringify(stamp), { contentType: 'application/json' });
    const back = await store.get(key, { type: 'json' });
    payload.blobsProbe = { ok: true, wrote: !!stamp, readBack: back };
  } catch (e) {
    payload.blobsProbe = { ok: false, error: String(e) };
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
