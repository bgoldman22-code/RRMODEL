// netlify/functions/_blobs.js
// Single source of truth for all blob store access (ESM + CJS callers)
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';

/**
 * Internal: choose the available Blobs API and return a Store instance.
 * In some Netlify runtimes, getStore requires explicit siteID/token.
 */
function getStore(arg) {
  const name   = (typeof arg === 'string') ? arg : (arg && arg.name) || DEFAULT_MLB;
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  // Preferred modern API
  if (real && typeof real.getStore === 'function') {
    return real.getStore({ name, siteID, token });
  }

  // Fallback older API
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }

  throw new Error('Netlify Blobs API not available at runtime.');
}

// Public helpers
export function getBlobsStore(name) {
  return getStore(name);
}

// Back-compat aliases for older codepaths
export const openStore = getBlobsStore;
export const makeStore = getBlobsStore;
export const getSafeStore = getBlobsStore; // extra alias some legacy code referenced
