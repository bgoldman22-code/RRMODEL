// netlify/functions/_lib/blobs-helper.mjs
// Robust helper for Netlify Blobs with graceful fallback.
// Exports: openStore(name), readJSON(store, key), writeJSON(store, key, value)

let blobs;
try {
  blobs = await import('@netlify/blobs');
} catch (e) {
  blobs = null;
}

const inMemoryStores = new Map();

function makeInMemoryStore(name) {
  const data = new Map();
  return {
    name,
    async get(key) {
      const v = data.get(key);
      return typeof v === 'string' ? v : (v == null ? null : JSON.stringify(v));
    },
    async set(key, value) {
      data.set(key, typeof value === 'string' ? value : JSON.stringify(value));
      return { ok: true, persisted: false, backend: 'memory' };
    },
    async getJSON(key) {
      const raw = await this.get(key);
      if (!raw) return null;
      try { return JSON.parse(raw); } catch { return null; }
    },
    async setJSON(key, obj) {
      return this.set(key, JSON.stringify(obj));
    }
  };
}

export async function openStore(name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl') {
  // Prefer Netlify runtime getStore when available (v5+)
  if (blobs && typeof blobs.getStore === 'function') {
    try {
      return blobs.getStore({ name });
    } catch (e) {
      console.warn('[blobs-helper] getStore failed, using memory fallback:', e?.message || e);
    }
  }
  // Older SDKs may export createClient on v5+, but be cautious
  if (blobs && typeof blobs.createClient === 'function') {
    try {
      const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
      const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN || process.env.TOKEN;
      if (!siteID || !token) {
        console.warn('[blobs-helper] createClient available but missing siteID/token; using memory fallback');
      } else {
        const client = blobs.createClient({ siteID, token });
        return client.getStore({ name });
      }
    } catch (e) {
      console.warn('[blobs-helper] createClient failed, using memory fallback:', e?.message || e);
    }
  }
  // Memory fallback
  if (!inMemoryStores.has(name)) inMemoryStores.set(name, makeInMemoryStore(name));
  return inMemoryStores.get(name);
}

export async function readJSON(store, key, def = null) {
  try {
    const v = await store.getJSON ? await store.getJSON(key) : JSON.parse(await store.get(key));
    return v ?? def;
  } catch (e) {
    console.warn('[blobs-helper] readJSON error', e?.message || e);
    return def;
  }
}

export async function writeJSON(store, key, value) {
  try {
    if (store.setJSON) return await store.setJSON(key, value);
    return await store.set(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[blobs-helper] writeJSON error', e?.message || e);
    return { ok: false, error: String(e) };
  }
}
