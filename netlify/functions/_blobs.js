// netlify/functions/_blobs.js
// Canonical helper for Netlify Blobs across ESM & CJS callers.
// - Prefers modern getStore({ name, siteID, token }) when available
// - Falls back to createClient({ siteID, token }).store(name)
// - Forces credentials if present to avoid "environment not configured" issues
// - Exposes both getBlobsStore() and getStore() (alias) for widest compatibility
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';
const DEFAULT_NFL = process.env.BLOBS_STORE_NFL || 'nfl-td';

export function getBlobsStore(name) {
  const resolved = (typeof name === 'string' && name) ||
                   (name && name.name) ||
                   DEFAULT_MLB;
  const siteID = (name && name.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (name && name.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  if (real && typeof real.getStore === 'function') {
    // Modern API – pass explicit creds if available (fixes some runtimes)
    return real.getStore({ name: resolved, siteID, token });
  }
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(resolved);
  }
  throw new Error('Netlify Blobs API not available at runtime.');
}

// Alias to satisfy legacy imports
export const getStore  = getBlobsStore;
export const openStore = getBlobsStore;
export const makeStore = getBlobsStore;

// Convenience wrappers for named stores
export function mlbStore() { return getBlobsStore(DEFAULT_MLB); }
export function nflStore() { return getBlobsStore(DEFAULT_NFL); }

// Lightweight env diagnostics used by env-dump and others
export function diagBlobsEnv() {
  const exp = (real && Object.keys(real)) || [];
  return {
    ok: !!real,
    defaults: { MLB: DEFAULT_MLB, NFL: DEFAULT_NFL },
    hasGetStore: !!(real && typeof real.getStore === 'function'),
    hasCreateClient: !!(real && typeof real.createClient === 'function'),
    exportKeys: exp
  };
}

// --- CommonJS interop ---
try {
  // @ts-ignore
  if (typeof module !== 'undefined' && module.exports) {
    // @ts-ignore
    module.exports = {
      getBlobsStore,
      getStore: getBlobsStore,
      openStore: getBlobsStore,
      makeStore: getBlobsStore,
      mlbStore,
      nflStore,
      diagBlobsEnv
    };
  }
} catch {}
