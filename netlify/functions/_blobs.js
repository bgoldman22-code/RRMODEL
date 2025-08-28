// netlify/functions/_blobs.js
// Single source of truth for all blob store access (ESM & CJS friendly)
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';

export function getStore(arg) {
  const name   = (typeof arg === 'string') ? arg : (arg && arg.name) || DEFAULT_MLB;
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  // Prefer modern API if present (your env shows hasGetStore: true)
  if (real && typeof real.getStore === 'function') {
    // Pass explicit creds in case the env context isn’t injected
    return real.getStore({ name, siteID, token });
  }

  // Fallback: older client API
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }

  throw new Error('Netlify Blobs API not available at runtime.');
}

// Back-compat aliases for any code still importing other names
export const getBlobsStore = getStore;
export const openStore     = getStore;
export const makeStore     = getStore;

// Default export so CommonJS `require('./_blobs.js')` can grab methods
export default {
  getStore,
  getBlobsStore: getStore,
  openStore: getStore,
  makeStore: getStore,
};
