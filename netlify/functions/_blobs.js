// netlify/functions/_blobs.js  (ESM helper for Netlify Blobs)
import { blobs } from '@netlify/blobs';

function _client() {
  // In Netlify production, credentials are injected at runtime, so a plain
  // call to `blobs()` works. If you supply both SITE_ID and TOKEN in env,
  // we pass them explicitly (useful for local/preview/serverless builders).
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (siteID && token) {
    return blobs({ siteID, token });
  }
  return blobs();
}

/**
 * Return a handle to the configured store.
 * Prefers BLOBS_STORE, falling back to 'mlb-odds'.
 */
export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return _client().store(name);
}

// --- Back-compat aliases referenced by older functions ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
