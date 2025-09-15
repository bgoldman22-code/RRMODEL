// Safe Netlify Blobs helper (ESM)
let createClient = null;
let getStore = null;
try {
  // Netlify esbuild will bundle this in functions runtime
  const mod = await import('@netlify/blobs');
  createClient = mod.createClient || null;
  getStore = mod.getStore || null;
} catch (e) {
  // running outside Netlify or not installed
}

export function makeStore(storeNameEnv = 'BLOBS_STORE_NFL', fallback = 'nfl-td') {
  const storeName = process.env[storeNameEnv] || process.env.BLOBS_STORE || fallback;
  const opts = {};
  if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_AUTH_TOKEN) {
    opts.siteID = process.env.NETLIFY_SITE_ID;
    opts.token  = process.env.NETLIFY_AUTH_TOKEN;
  }
  if (createClient) {
    try {
      const client = createClient(opts);
      return client.getStore(storeName);
    } catch (err) {
      return null; // fall back to memory/no-op
    }
  }
  if (getStore) {
    try {
      return getStore({ name: storeName, ...opts });
    } catch (err) {
      return null;
    }
  }
  return null;
}

export async function loadFromBlobs(key) {
  const store = makeStore();
  if (!store) return null;
  try {
    const r = await store.get(key, { type: 'json' });
    return r || null;
  } catch (e) {
    return null;
  }
}

export async function saveToBlobs(key, value) {
  const store = makeStore();
  if (!store) return false;
  try {
    await store.setJSON(key, value);
    return true;
  } catch (e) {
    return false;
  }
}
