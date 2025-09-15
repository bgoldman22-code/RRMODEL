
// ESM helper with zero top-level await; compatible with Netlify esbuild.
const STORE_DEFAULT = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";

async function loadClient() {
  try {
    const mod = await import('@netlify/blobs');
    const { createClient, getStore } = mod;
    return { createClient, getStore };
  } catch (e) {
    return { error: e };
  }
}

export async function openStore(storeName = STORE_DEFAULT) {
  const { createClient, getStore, error } = await loadClient();
  if (error) {
    return {
      ok: false,
      reason: "[blobs-helper] @netlify/blobs not available; ensure dependency ^6 is installed or provide siteID/token.",
      get: async () => null,
      set: async () => false,
      list: async () => []
    };
  }
  // Prefer Netlify's automatic env; allow explicit siteID/token if provided.
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_AUTH_TOKEN || process.env.TOKEN;
  let store;
  try {
    if (siteID && token) {
      const client = createClient({ siteID, token });
      store = client.getStore(storeName);
    } else {
      store = getStore(storeName);
    }
    return {
      ok: true,
      get: (key) => store.get(key),
      set: (key, value, opts={}) => store.set(key, value, opts),
      list: (...args) => store.list(...args),
      name: storeName
    };
  } catch (e) {
    return {
      ok: false,
      reason: String(e),
      get: async () => null,
      set: async () => false,
      list: async () => []
    };
  }
}

export async function saveToBlobs(key, value, { contentType="application/json", storeName } = {}) {
  const store = await openStore(storeName);
  if (!store.ok) return { ok: false, reason: store.reason };
  try {
    const body = typeof value === "string" ? value : JSON.stringify(value);
    await store.set(key, body, { contentType });
    return { ok: true, store: store.name, key };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

export async function loadFromBlobs(key, { storeName } = {}) {
  const store = await openStore(storeName);
  if (!store.ok) return null;
  try {
    const v = await store.get(key);
    if (!v) return null;
    try { return JSON.parse(v); } catch { return v; }
  } catch {
    return null;
  }
}
