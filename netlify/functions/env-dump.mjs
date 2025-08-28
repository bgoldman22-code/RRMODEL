// netlify/functions/env-dump.mjs
import { getBlobsStore } from './_blobs.js';

export async function handler() {
  // mask middle of secrets safely
  const mask = (v) => v ? (String(v).slice(0,4) + "…" + String(v).slice(-4)) : null;

  const out = {
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
  };

  try {
    const store = getBlobsStore(process.env.BLOBS_STORE || 'mlb-odds');
    // lightweight probe to ensure creds are valid (list keys prefix "props/")
    // If listing isn't permitted, attempt a get of a known key which may 404 but still proves auth.
    const probeKey = 'props/latest_tb.json';
    const val = await store.getJSON(probeKey);
    out.blobsProbe = { key: probeKey, status: val ? 'ok' : 'null' };
  } catch (e) {
    out.blobsProbe = { error: String(e && e.message || e) };
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(out),
  };
}
