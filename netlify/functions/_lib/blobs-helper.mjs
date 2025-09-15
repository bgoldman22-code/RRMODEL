// netlify/functions/_lib/blobs-helper.mjs
// Safe helper that works both in Netlify runtime and locally.
// No top-level await; dynamic import only when called.

export async function openStore({ storeName, siteID, token } = {}) {
  let createClient, getStore;
  try {
    // Dynamic import so it won't crash if the package/bundler isn't available at build time
    ({ createClient, getStore } = await import('@netlify/blobs'));
  } catch (err) {
    return null; // not available in this environment
  }

  // If running on Netlify, these envs are injected automatically.
  const opts = {};
  if (siteID) opts.siteID = siteID;
  if (token) opts.token = token;

  try {
    const client = createClient?.(opts);
    if (!client) return null;

    const store = await getStore?.({ name: storeName || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td' }, opts);
    return store || null;
  } catch (e) {
    return null;
  }
}

export async function saveJSON(store, key, obj) {
  if (!store) return false;
  try {
    await store.set(key, JSON.stringify(obj), { contentType: 'application/json' });
    return true;
  } catch {
    return false;
  }
}

export async function loadJSON(store, key) {
  if (!store) return null;
  try {
    const res = await store.get(key, { type: 'json' });
    return res || null;
  } catch {
    return null;
  }
}
