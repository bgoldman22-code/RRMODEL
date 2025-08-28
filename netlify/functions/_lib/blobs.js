// netlify/functions/_lib/blobs.js
// Unified Blobs helper for NFL. Falls back to readable error if Blobs isn't enabled.
// Usage: const store = await nflStore(); await store.set(...)

import { getStore } from '../_blobs.js';

const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

export async function nflStore() {
  try {
    // If BLOBS_STORE_NFL is configured as an existing store id or a name,
    // Netlify Figures it out. Do NOT pass siteID/token unless you really need manual client.
    const store = getStore({ name: NFL_STORE_NAME, siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
    // cheap smoke test: try list with empty prefix (does not throw if context OK)
    // Some older runtimes throw here; wrap just in case.
    try {
      await store.list({ prefix: 'health/' });
    } catch {}
    return store;
  } catch (err) {
    const hint = `Blobs unavailable. Enable Netlify Blobs for this site and set BLOBS_STORE_NFL or BLOBS_STORE. Detail: ${err?.name||''} ${err?.message||err}`;
    const e = new Error(hint);
    e.statusCode = 500;
    throw e;
  }
}

export function diagBlobsEnv() {
  // capture a few env hints to log in debug
  return {
    NFL_STORE_NAME,
    HAS_NETLIFY_BLOBS_CONTEXT: !!process.env.NETLIFY_BLOBS_CONTEXT,
    HAS_NETLIFY_SITE_ID: !!process.env.NETLIFY_SITE_ID,
  };
}