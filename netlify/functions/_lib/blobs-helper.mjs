// ESM helper for Netlify Blobs across versions v4–v6, no top-level await.
// Prefers BLOBS_STORE_NFL, then BLOBS_STORE, then 'nfl-td'.
const STORE_ENV_KEYS = ["BLOBS_STORE_NFL", "BLOBS_STORE"];
const DEFAULT_STORE = "nfl-td";

function getStoreName() {
  for (const k of STORE_ENV_KEYS) {
    if (process.env[k] && String(process.env[k]).trim()) return process.env[k];
  }
  return DEFAULT_STORE;
}

// Lazy-load Netlify blobs client in a way that works across versions:
async function getClients() {
  let mod;
  try {
    mod = await import('@netlify/blobs');
  } catch (e) {
    return { createClient: null, getStore: null, error: e };
  }
  // Some versions export createClient, others export getStore
  const createClient = mod.createClient || null;
  const getStore = mod.getStore || null;
  return { createClient, getStore, error: null };
}

// Unified openStore that works across v4–v6, or returns a fall-back store.
async function openStore() {
  const name = getStoreName();
  const { createClient, getStore, error } = await getClients();

  // In Netlify runtime v6+: createClient().store(name)
  if (typeof createClient === 'function') {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_API_TOKEN || process.env.NETLIFY_TOKEN;
    // The client works without siteID/token in runtime; if provided, use them for builds/local.
    const client = siteID && token ? createClient({ siteID, token }) : createClient();
    return client.store(name);
  }

  // Older v4/v5: getStore({name})
  if (typeof getStore === 'function') {
    return getStore({ name });
  }

  // Fallback in dev: in-memory no-op store to avoid crashes
  console.warn('[blobs-helper] @netlify/blobs not available; using in-memory store.');
  const mem = new Map();
  return {
    async get(key) { return mem.get(key) ?? null; },
    async set(key, value) { mem.set(key, value); },
    async delete(key) { mem.delete(key); },
    async list() { return Array.from(mem.keys()); }
  };
}

export async function saveToBlobs(key, data) {
  const store = await openStore();
  const value = typeof data === 'string' ? data : JSON.stringify(data);
  await store.set(key, value);
  return { ok: true, key };
}

export async function loadFromBlobs(key) {
  const store = await openStore();
  const val = await store.get(key);
  if (!val) return null;
  try { return JSON.parse(val); } catch { return val; }
}

export function getStoreNameEffective() {
  return getStoreName();
}
