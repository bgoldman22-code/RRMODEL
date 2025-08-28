
// netlify/functions/_blobs.mjs
import { getStore } from './_blobs.js';

/**
 * Returns a Netlify Blobs store for NFL.
 * Falls back to manual auth using NETLIFY_API_TOKEN (+ NETLIFY_SITE_ID) if runtime context is missing.
 */
export function getNFLStore() {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

  try {
    // Prefer implicit runtime context on Netlify Functions
    return getStore({ name });
  } catch (err) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN;
    if (!siteID || !token) {
      const details = `HAS_NETLIFY_BLOBS_CONTEXT=false, HAS_NETLIFY_SITE_ID=${!!siteID}, HAS_NETLIFY_API_TOKEN=${!!token}`;
      const e = new Error(`Blobs unavailable. Enable Netlify Blobs and set NETLIFY_API_TOKEN (and ensure NETLIFY_SITE_ID is available). Detail: ${err?.name||''} ${err?.message||err} • ${details}`);
      e.original = err;
      throw e;
    }
    return getStore({ name, siteID, token });
  }
}

/** Small helper for JSON get/set */
export const blobsJson = {
  async get(store, key, def = null) {
    const raw = await store.get(key, { type: 'json' });
    return raw ?? def;
  },
  async set(store, key, value) {
    await store.setJSON(key, value);
    return true;
  }
};
