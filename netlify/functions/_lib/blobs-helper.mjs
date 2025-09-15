// netlify/functions/_lib/blobs-helper.mjs
// Unified helper for Netlify Blobs across local/dev and production.
// Exports: openStore, makeStore, saveToBlobs, loadFromBlobs, putJSON, getJSON

import * as Blobs from '@netlify/blobs';

const DEFAULT_NFL_STORE = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

/**
 * Return the store name to use, honoring nfl-specific fallback.
 */
export function makeStore(preferred) {
  return preferred || DEFAULT_NFL_STORE;
}

/**
 * Get a blobs client store. In Netlify runtime, getStore works automatically.
 * In local/offline builds, support manual client via siteID/token if available.
 */
export async function openStore(name) {
  const storeName = makeStore(name);
  // @netlify/blobs v5+ exports getStore. createClient isn't needed for runtime.
  // If not running in Netlify runtime, getStore will still work provided env vars are present.
  try {
    const store = Blobs.getStore({ name: storeName });
    return store;
  } catch (err) {
    // As a safe fallback, try dynamic import (older shims) or throw a clear error.
    console.warn("[blobs-helper] getStore failed; name=%s err=%s", storeName, err?.message);
    throw err;
  }
}

export async function saveToBlobs(key, data, { storeName } = {}) {
  const store = await openStore(storeName);
  const body = (typeof data === 'string') ? data : JSON.stringify(data);
  await store.set(key, body, { contentType: (typeof data === 'string') ? 'text/plain' : 'application/json' });
  return { ok: true, key, store: storeName || makeStore() };
}

export async function loadFromBlobs(key, { storeName } = {}) {
  const store = await openStore(storeName);
  const res = await store.get(key);
  if (!res) return null;
  const ctype = res.contentType || '';
  if (ctype.includes('application/json') || key.endsWith('.json')) {
    try { return JSON.parse(await res.text()); }
    catch { return await res.text(); }
  }
  // otherwise return raw text
  return await res.text();
}

export async function putJSON(key, obj, opts) {
  return saveToBlobs(key, JSON.stringify(obj), { ...(opts||{}), });
}

export async function getJSON(key, opts) {
  return loadFromBlobs(key, opts);
}
