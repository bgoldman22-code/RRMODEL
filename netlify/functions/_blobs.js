// netlify/functions/_blobs.js  (ESM, compat wrapper)
import * as api from '@netlify/blobs';

/**
 * Returns a client that can create per-store handles.
 * Prefers `createClient` (new API). Falls back to `getStore` (older API).
 */
function _client() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  // Prefer modern API if available
  if (typeof api.createClient === 'function') {
    try {
      if (siteID && token) {
        return api.createClient({ siteID, token });
      }
      return api.createClient();
    } catch (e) {
      // fall through to legacy path
      console.warn('[blobs] createClient failed, falling back to getStore:', e?.message);
    }
  }

  // Legacy shim: expose a minimal shape with .store(name) -> { getJSON, setJSON, get, set }
  if (typeof api.getStore === 'function') {
    return {
      store(name) {
        return api.getStore({ name });
      }
    };
  }

  // As a last resort, provide a dummy that throws a helpful error
  return {
    store() {
      throw new Error('No compatible Netlify Blobs API found. Ensure @netlify/blobs is up to date (or set NETLIFY_SITE_ID and NETLIFY_BLOBS_TOKEN).');
    }
  };
}

/** Primary helper used across functions */
export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  const client = _client();
  return client.store(name);
}

// --- Back-compat aliases some functions reference ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
