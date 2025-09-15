// netlify/functions/_lib/blobs-helper.mjs
// ESM module with NO top-level await. Safe for esbuild CJS bundling.
// Supports @netlify/blobs v5+ (createClient) and legacy getStore in Netlify runtime.
// Store name fallback: BLOBS_STORE_NFL -> BLOBS_STORE -> 'nfl-td'

let _blobsMod = null;

async function getBlobsModule() {
  if (_blobsMod) return _blobsMod;
  try {
    // Dynamic import so esbuild can bundle for CJS output without top-level await
    _blobsMod = await import('@netlify/blobs');
  } catch (e) {
    // Leave null; callers will throw a friendly message
    _blobsMod = null;
  }
  return _blobsMod;
}

export function resolveStoreName(name) {
  return name || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
}

export async function getClient() {
  const mod = await getBlobsModule();
  if (!mod) {
    const err = new Error('[blobs-helper] @netlify/blobs is not available. Ensure it is installed and/or running in Netlify.');
    err.code = 'NO_BLOBS_MODULE';
    throw err;
  }
  // Prefer createClient when available (v5+). Fallback to null meaning "use getStore directly".
  return typeof mod.createClient === 'function' ? mod.createClient() : null;
}

export async function makeStore(name) {
  const storeName = resolveStoreName(name);
  const mod = await getBlobsModule();
  if (!mod) {
    const err = new Error('[blobs-helper] @netlify/blobs is not available. Please add it to dependencies or run in Netlify.');
    err.code = 'NO_BLOBS_MODULE';
    throw err;
  }
  const client = await getClient();
  if (client && typeof client.getStore === 'function') {
    return client.getStore(storeName);
  }
  // Legacy fallback: getStore(options) available in Netlify runtime
  if (typeof mod.getStore === 'function') {
    const opts = { name: storeName };
    // Optional manual config via env for local dev
    if (process.env.NETLIFY_SITE_ID) opts.siteID = process.env.NETLIFY_SITE_ID;
    if (process.env.NETLIFY_AUTH_TOKEN) opts.token = process.env.NETLIFY_AUTH_TOKEN;
    return mod.getStore(opts);
  }
  const err = new Error('[blobs-helper] Neither createClient().getStore nor getStore() is available.');
  err.code = 'NO_GETSTORE';
  throw err;
}

export async function openStore(name) {
  return makeStore(name);
}

export async function saveToBlobs(key, data, { contentType = 'application/json', storeName } = {}) {
  const store = await openStore(storeName);
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await store.set(key, body, { contentType });
  return true;
}

export async function loadFromBlobs(key, { type = 'json', storeName } = {}) {
  const store = await openStore(storeName);
  return store.get(key, { type });
}

export async function existsInBlobs(key, { storeName } = {}) {
  const store = await openStore(storeName);
  try {
    const buf = await store.get(key, { type: 'stream' });
    return !!buf;
  } catch {
    return false;
  }
}
