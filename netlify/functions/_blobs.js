// netlify/functions/_blobs.js  (ESM, dual-API support)
// Drop-in shim that works with both new and old @netlify/blobs versions
import * as nfBlobs from '@netlify/blobs';

/**
 * Return a client compatible with both modern and legacy @netlify/blobs APIs.
 * - Prefers createClient() (v6+).
 * - Falls back to getStore({ name, siteID, token }) if on an older SDK.
 */
function _client() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  // Modern API (v6+): createClient
  if (typeof nfBlobs.createClient === 'function') {
    if (siteID && token) return nfBlobs.createClient({ siteID, token });
    return nfBlobs.createClient();
  }

  // Legacy API fallback: getStore
  if (typeof nfBlobs.getStore === 'function') {
    return {
      store(name) {
        const opts = { name };
        if (siteID) opts.siteID = siteID;
        if (token)  opts.token  = token;
        return nfBlobs.getStore(opts);
      }
    };
  }

  throw new Error('No compatible @netlify/blobs API detected');
}

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return _client().store(name);
}

// --- Back-compat aliases (some functions import these) ---
export const getSafeStore = getBlobsStore;
export const openStore    = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
