// netlify/functions/_blobs.js
// Single source of truth for all blob store access (works in your runtime)
// Exports BOTH getStore and getBlobsStore so legacy imports keep working.

import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';

function _resolveName(arg) {
  if (typeof arg === 'string') return arg;
  if (arg && typeof arg === 'object' && arg.name) return arg.name;
  return DEFAULT_MLB;
}

function _resolveCreds(arg) {
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;
  return { siteID, token };
}

function _getStoreInternal(arg) {
  const name = _resolveName(arg);
  const { siteID, token } = _resolveCreds(arg);

  // Prefer modern API if present
  if (real && typeof real.getStore === 'function') {
    // Pass explicit creds in case env context isn’t auto-injected
    return real.getStore({ name, siteID, token });
  }

  // Fallback: older createClient API
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }

  throw new Error('Netlify Blobs API not available at runtime.');
}

// Named exports (ESM)
export function getStore(arg) {
  return _getStoreInternal(arg);
}
export function getBlobsStore(arg) {
  return _getStoreInternal(arg);
}

// Back-compat aliases some files reference
export const openStore = getBlobsStore;
export const makeStore = getBlobsStore;

// CJS interop (if any `.cjs` does: const { getStore } = require('./_blobs.js'))
// Netlify/rollup will convert ESM default, but we expose common properties too.
const cjs = { getStore, getBlobsStore, openStore, makeStore };
export default cjs;


// unified helper (safe across runtimes)
function _getStoreImpl(arg) {
  const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';
  const name   = (typeof arg === 'string') ? arg : (arg && arg.name) || DEFAULT_MLB;
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  if (real && typeof real.getStore === 'function') {
    return real.getStore({ name, siteID, token });
  }
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }
  throw new Error('Netlify Blobs API not available at runtime.');
}

export const getStore = getBlobsStore;
