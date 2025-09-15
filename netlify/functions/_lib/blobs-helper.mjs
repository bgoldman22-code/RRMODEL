// ESM helper for Netlify Blobs with lazy import; no top-level await.
let _createClient = null;
let _getStore = null;

async function ensure() {
  if (_createClient && _getStore) return;
  try {
    const mod = await import('@netlify/blobs');
    _createClient = mod.createClient;
    _getStore = mod.getStore ?? null;
  } catch (e) {
    // Old runtime or missing package
    _createClient = null;
    _getStore = null;
  }
}

export async function makeStore(name) {
  await ensure();
  const storeName = name || process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';
  // If running on Netlify with implicit env, createClient works without siteID/token.
  // Locally, allow optional explicit siteID/token via env.
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN || process.env.TOKEN;
  const opts = {};
  if (siteID && token) opts.siteID = siteID, opts.token = token;

  if (!_createClient) {
    throw new Error('[blobs-helper] @netlify/blobs not available; ensure dependency is installed and runtime is Netlify or provide siteID/token.');
  }
  return _createClient({ ...opts, name: storeName });
}

export async function saveToBlobs(key, data, { contentType = 'application/json', storeName } = {}) {
  const store = await makeStore(storeName);
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await store.set(key, body, { contentType });
  return true;
}

export async function loadFromBlobs(key, { storeName } = {}) {
  const store = await makeStore(storeName);
  const res = await store.get(key);
  return res?.body ?? null;
}
