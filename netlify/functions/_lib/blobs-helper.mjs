/**
 * Blobs helper with safe fallbacks.
 * - If running on Netlify with Managed Blobs, createClient/getStore are injected.
 * - If not available, operations return null/false and NEVER throw.
 */
let createClient, getStore;
try {
  ({ createClient, getStore } = await import('@netlify/blobs'));
} catch (_e) {
  createClient = null;
  getStore = null;
}

const DEFAULT_STORE = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

/** Try to open a store. If not available, return null. */
export async function openStore(name = DEFAULT_STORE) {
  if (!createClient || !getStore) return null;
  try {
    return getStore ? getStore({ name }) : (await createClient()).getStore({ name });
  } catch (_e) {
    return null;
  }
}

export async function saveToBlobs(key, data, storeName = DEFAULT_STORE) {
  const store = await openStore(storeName);
  if (!store) return { ok: false, persisted: false, reason: 'no_blobs' };
  await store.set(key, JSON.stringify(data), { metadata: { contentType: 'application/json' } });
  return { ok: true, persisted: true, store: storeName, key };
}

export async function loadFromBlobs(key, storeName = DEFAULT_STORE) {
  const store = await openStore(storeName);
  if (!store) return null;
  const val = await store.get(key);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return null; }
}

export async function hasKey(key, storeName = DEFAULT_STORE) {
  const store = await openStore(storeName);
  if (!store) return false;
  const val = await store.get(key);
  return !!val;
}
