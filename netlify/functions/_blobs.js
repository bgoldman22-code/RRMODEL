// Helper to get a Netlify Blobs store robustly (ESM).
// Unifies access for both MLB and NFL codepaths and works with current Netlify runtime.
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';
const DEFAULT_NFL = process.env.NFL_TD_BLOBS || process.env.BLOBS_STORE_NFL || 'nfl-td';

// Normalize call: getStore('name') or getStore({ name, siteID, token })
export function getStore(arg) {
  const name   = (typeof arg === 'string') ? arg : (arg && arg.name) || DEFAULT_MLB;
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  // Prefer modern API if present
  if (real && typeof real.getStore === 'function') {
    // Pass explicit creds in case the environment context isn't injected
    return real.getStore({ name, siteID, token });
  }

  // Fallback: older client API
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }

  // Last resort: throw a helpful error
  throw new Error('Netlify Blobs API not available at runtime.');
}

export function getBlobsStore(name = DEFAULT_MLB) {
  return getStore({ name });
}

export function getNFLStore(name = DEFAULT_NFL) {
  return getStore({ name });
}

// Back-compat aliases some functions referenced earlier
export const getSafeStore = getBlobsStore;
export const openStore   = getStore;
export function makeStore(name) { return getStore({ name }); }

export default { getStore, getBlobsStore, getNFLStore };
