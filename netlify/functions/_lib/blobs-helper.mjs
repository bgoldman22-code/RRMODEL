// netlify/functions/_lib/blobs-helper.mjs
// ESM module that wraps @netlify/blobs in a tiny helper with JSON helpers.
// Compatible with Netlify Functions and can be dynamically imported from CJS.

import { getStore } from '@netlify/blobs';

/**
 * Open a Netlify Blobs store.
 * Will prefer BLOBS_STORE_NFL, then BLOBS_STORE, then the provided `fallbackName`.
 */
export async function openStore(fallbackName = "nfl") {
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || fallbackName || "nfl";

  // getStore auto-detects site env in Netlify; no createClient is needed.
  // If you run locally WITHOUT Netlify env, you can pass siteID/token via env:
  // NETLIFY_SITE_ID and NETLIFY_API_TOKEN (Netlify CLI injects these for dev).
  const store = getStore({ name });

  return {
    async getJSON(key, defaultValue = null) {
      const val = await store.get(key, { type: "json" });
      return (typeof val === "undefined" || val === null) ? defaultValue : val;
    },
    async setJSON(key, value) {
      // No random suffix so callers can read a stable key
      await store.setJSON(key, value, { addRandomSuffix: false });
    },
    raw: store,
    name
  };
}
