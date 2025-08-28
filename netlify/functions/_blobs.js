// netlify/functions/_blobs.js
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';
const DEFAULT_NFL = process.env.BLOBS_STORE_NFL || process.env.NFL_TD_BLOBS || 'nfl-td';

/**
 * Return a Netlify Blobs store. Always passes credentials for robustness.
 * Accepts either a string store name or an options object { name, siteID, token }.
 */
export function getStore(arg) {
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

// Convenience aliases
export const getBlobsStore = getStore;
export const openStore = getStore;
export const makeStore = getStore;

// Polyfills
export async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}
export async function setJSON(store, key, value) {
  const body = JSON.stringify(value);
  return store.set(key, body, { contentType: 'application/json' });
}

// Diagnostics helper to include in env-dump
export async function diagBlobsEnv() {
  const exports = Object.keys(real || {});
  const probe = {
    hasGetStore: !!(real && typeof real.getStore === 'function'),
    hasCreateClient: !!(real && typeof real.createClient === 'function'),
    exportKeys: exports.slice(0, 20),
  };
  try {
    const store = getStore(DEFAULT_MLB);
    const now = Date.now();
    await setJSON(store, 'diag-probe.json', { t: now });
    const roundtrip = await getJSON(store, 'diag-probe.json');
    probe.roundtrip = !!roundtrip && roundtrip.t === now;
  } catch (e) {
    probe.error = String(e);
  }
  return probe;
}

// CJS interop for the few .cjs functions
try {
  // eslint-disable-next-line no-undef
  module.exports = { getStore, getBlobsStore: getStore, openStore: getStore, makeStore: getStore, getJSON, setJSON, diagBlobsEnv, DEFAULT_MLB, DEFAULT_NFL };
} catch {}
