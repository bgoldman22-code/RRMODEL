// netlify/functions/_blobs.js  (ESM, compatible with old/new @netlify/blobs)
import * as Blobs from '@netlify/blobs';

/**
 * Returns an object with a .store(name) method.
 * - On new API: uses createClient({ siteID, token }).store(name)
 * - On old API: wraps getStore({ name }) to look like client.store(name)
 */
function _client() {
  const { createClient, getStore } = Blobs;

  // Prefer explicit creds when available (works in build & local dev)
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (typeof createClient === 'function') {
    return createClient(siteID && token ? { siteID, token } : undefined);
  }

  // Legacy Netlify Blobs API
  if (typeof getStore === 'function') {
    return {
      store(name) {
        return getStore({ name });
      },
    };
  }

  throw new Error('No compatible Netlify Blobs API found in @netlify/blobs');
}

export function getBlobsStore(name = (process.env.BLOBS_STORE || 'mlb-odds')) {
  return _client().store(name);
}

// --- Back-compat aliases some existing functions reference ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
