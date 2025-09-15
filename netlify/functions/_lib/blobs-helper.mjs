// netlify/functions/_lib/blobs-helper.mjs
// Unified helper for Netlify Blobs with safe fallbacks.
// - Prefers Netlify runtime getStore() when available.
// - Falls back to createClient() when running locally, if provided.
// - Env var priority: BLOBS_STORE_NFL -> BLOBS_STORE -> 'nfl-td'

let createClient, getStore;
try {
  // @netlify/blobs v5+ exports these in ESM env
  ({ createClient, getStore } = await import('@netlify/blobs'));
} catch (e) {
  // Non-fatal: local or older envs may not have it, we'll guard below
}

const STORE_FALLBACK = 'nfl-td';

export function resolveStoreName() {
  return process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || STORE_FALLBACK;
}

// Returns a compatible store-like object with put/get/list.
// If Netlify runtime getStore exists, we use that.
// Else if createClient exists, we make a scoped client.
// Else, we throw a descriptive error.
export async function makeStore(name = resolveStoreName()) {
  if (typeof getStore === 'function') {
    const store = getStore({ name });
    return { 
      put: (key, body, opts={}) => store.set(key, body, opts),
      get: (key) => store.get(key),
      list: (opts={}) => store.list(opts),
      meta: { name, mode: 'getStore' }
    };
  }
  if (typeof createClient === 'function') {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN || process.env.TOKEN;
    if (!siteID || !token) {
      const err = new Error('[blobs-helper] @netlify/blobs.createClient is available but missing siteID/token env.');
      err.code = 'MissingBlobsEnvironmentError';
      throw err;
    }
    const client = createClient({ siteID, token });
    const store = client.store(name);
    return {
      put: (key, body, opts={}) => store.set(key, body, opts),
      get: (key) => store.get(key),
      list: (opts={}) => store.list(opts),
      meta: { name, mode: 'createClient' }
    };
  }
  const err = new Error('[blobs-helper] @netlify/blobs not available. Add as dependency or run in Netlify runtime.');
  err.code = 'BlobsUnavailable';
  throw err;
}

export async function saveToBlobs(key, data, { name } = {}) {
  const store = await makeStore(name);
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await store.put(key, body, { contentType: 'application/json; charset=utf-8' });
  return { ok: true, store: store.meta.name, key };
}

export async function loadFromBlobs(key, { name } = {}) {
  const store = await makeStore(name);
  const raw = await store.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
