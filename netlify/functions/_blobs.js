// netlify/functions/_blobs.js
// Single source of truth for ALL blob access (ESM & CJS consumers).
// Works with modern getStore() and falls back to createClient(). Also exposes
// a few optional/legacy helpers so older files keep working.

import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';
const DEFAULT_NFL = process.env.BLOBS_STORE_NFL || 'nfl-td';

function _resolveName(arg, fallback = DEFAULT_MLB) {
  if (!arg) return fallback;
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object') return arg.name || fallback;
  return fallback;
}

export function getStore(arg) {
  const name   = _resolveName(arg, DEFAULT_MLB);
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  // Prefer modern API if present
  if (real && typeof real.getStore === 'function') {
    // Pass explicit creds to avoid “environment not configured” in some runtimes
    return real.getStore({ name, siteID, token });
  }

  // Fallback: older client API
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }

  throw new Error('Netlify Blobs API not available at runtime.');
}

// Canonical “use this everywhere”
export const getBlobsStore = getStore;

// Aliases for old code paths
export const openStore = getBlobsStore;
export const makeStore = getBlobsStore;

// Optional helper: return null instead of throwing (used by *-optional.mjs callers)
export async function getStoreOrNull(arg) {
  try {
    return getBlobsStore(arg);
  } catch {
    return null;
  }
}

// Optional helper: list keys in a store (used by nfl-rosters-list.mjs)
export async function listKeys(name = DEFAULT_MLB, opts = {}) {
  const store = getBlobsStore(name);
  // Netlify SDK exposes .list() async iterator
  const out = [];
  if (typeof store.list === 'function') {
    for await (const entry of store.list(opts)) {
      // entry.key is the blob key
      out.push(entry.key || entry?.id || entry);
    }
  }
  return out;
}

// Small env diag so imports that expect this don’t fail (used by nfl-bootstrap.js)
export function diagBlobsEnv() {
  const hasCreateClient = !!(real && typeof real.createClient === 'function');
  const hasGetStore     = !!(real && typeof real.getStore === 'function');
  const exportKeys      = Object.keys(real || {});
  return {
    ok: true,
    DEFAULT_MLB,
    DEFAULT_NFL,
    hasCreateClient,
    hasGetStore,
    exportKeys
  };
}

// ---------- CJS interop for .cjs functions ----------
try {
  // @ts-ignore
  if (typeof module !== 'undefined' && module.exports) {
    // @ts-ignore
    module.exports = {
      getStore,
      getBlobsStore,
      openStore,
      makeStore,
      getStoreOrNull,
      listKeys,
      diagBlobsEnv
    };
  }
} catch {}
