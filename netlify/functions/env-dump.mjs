// netlify/functions/env-dump.mjs
// Shows masked envs and probes Blobs using the unified helper.
import * as pkg from '@netlify/blobs';
import { getBlobsStore } from './_blobs.js';

export const handler = async () => {
  const mask = (v) => v ? (String(v).slice(0,4) + '…' + String(v).slice(-4)) : null;
  const probe = {
    hasCreateClient: typeof pkg.createClient === 'function',
    hasGetStore: typeof pkg.getStore === 'function',
    exportKeys: Object.keys(pkg || {})
  };
  const blobsProbe = {};
  try {
    const store = getBlobsStore();
    await store.setJSON?.('__probe', { t: Date.now() });
    const got = await store.getJSON?.('__probe');
    blobsProbe.ok = !!got;
  } catch (e) {
    blobsProbe.error = String(e?.message || e);
  }

  const body = {
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
    probe,
    blobsProbe
  };
  return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
};
