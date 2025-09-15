
// netlify/functions/_lib/blobs-helper.cjs
// CommonJS helper for Netlify Blobs with safe fallbacks.
// Uses BLOBS_STORE_NFL (fallback to BLOBS_STORE, then 'nfl-td').
const pkg = (() => {
  try {
    return require('@netlify/blobs');
  } catch (e) {
    return null;
  }
})();

const STORE_ENV = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

function requireClient() {
  if (!pkg || (typeof pkg.getStore !== 'function')) {
    const msg = "[blobs-helper] @netlify/blobs.getStore is not available. Please add '@netlify/blobs' to dependencies, enable Blobs in Netlify UI, or run in Netlify runtime.";
    const err = new Error(msg);
    err.name = "MissingBlobsEnvironmentError";
    throw err;
  }
  return pkg;
}

function openStore() {
  const { getStore } = requireClient();
  const store = getStore({ name: STORE_ENV });
  return store;
}

async function loadFromBlobs(key) {
  try {
    const store = openStore();
    const val = await store.get(key, { type: 'json' });
    return val || null;
  } catch (err) {
    console.warn('[blobs-helper] loadFromBlobs failed', err.message);
    return null;
  }
}

async function saveToBlobs(key, json) {
  const data = (typeof json === 'string') ? json : JSON.stringify(json);
  try {
    const store = openStore();
    await store.set(key, data, { contentType: 'application/json; charset=utf-8' });
    return true;
  } catch (err) {
    console.warn('[blobs-helper] saveToBlobs failed', err.message);
    return false;
  }
}

async function listKeys(prefix="") {
  try {
    const store = openStore();
    const iter = store.list({ prefix });
    const out = [];
    for await (const item of iter) {
      out.push(item.key || item?.name || String(item));
    }
    return out;
  } catch (err) {
    console.warn('[blobs-helper] listKeys failed', err.message);
    return [];
  }
}

module.exports = { openStore, loadFromBlobs, saveToBlobs, listKeys, STORE_ENV };
