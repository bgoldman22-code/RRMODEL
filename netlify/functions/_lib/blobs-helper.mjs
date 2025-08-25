// netlify/functions/_lib/blobs-helper.mjs
// Robust helper to obtain a Netlify Blobs store in both local and production,
// with graceful fallback to env-supplied siteID/token if the platform context
// isn't injected (prevents "MissingBlobsEnvironmentError").

import { getStore } from '@netlify/blobs';

/**
 * Returns a Blobs store for the given name.
 * 
 * Priority:
 * 1) Explicit siteID/token from env NETLIFY_BLOBS_SITE_ID / NETLIFY_BLOBS_TOKEN
 * 2) Netlify platform auto-injected credentials (no args)
 * 
 * @param {string} name - store namespace (e.g., 'nfl', 'mlb')
 * @returns {Promise<import('@netlify/blobs').Store>}
 */
export async function blobsStore(name) {
  const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN   || process.env.BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;

  // If env vars are present, explicitly pass them. Otherwise rely on auto context.
  if (siteID && token) {
    return getStore({ name, siteID, token });
  }
  return getStore({ name });
}

/**
 * Convenience helpers for JSON get/put in a store.
 */
export async function blobsGetJSON(store, key) {
  const data = await store.get(key, { type: 'json' });
  return data ?? null;
}

export async function blobsSetJSON(store, key, value) {
  await store.setJSON(key, value);
  return true;
}
