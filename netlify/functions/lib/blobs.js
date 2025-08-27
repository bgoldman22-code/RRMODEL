// netlify/functions/lib/blobs.js
import { getStore, blobs } from '@netlify/blobs';

/**
 * Returns a Netlify Blobs store in the following order:
 * 1) Bound store (preferred)
 * 2) Manual connect using NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN, BLOBS_STORE
 * 3) null (caller must handle null and avoid throwing)
 */
export function getSafeStore(nameEnv = 'BLOBS_STORE') {
  const name = process.env[nameEnv] || 'mlb-odds';
  // 1) Bound
  try {
    const store = getStore(name);
    if (store) return store;
  } catch {}
  // 2) Manual (env-based)
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (siteID && token) {
      return blobs.connect({ siteID, token, name });
    }
  } catch {}
  // 3) Fallback
  return null;
}
