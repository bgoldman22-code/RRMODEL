/**
 * CJS wrapper that mirrors the ESM exports for CJS functions
 */
const blobs = require('@netlify/blobs');

const STORE_KEY_ENV_ORDER = ['BLOBS_STORE_NFL','BLOBS_STORE','rrmodelblobs'];

function pickStoreName() {
  for (const k of STORE_KEY_ENV_ORDER) {
    if (process.env[k]) return process.env[k];
  }
  return 'nfl-td';
}

function makeStore(storeName) {
  const name = storeName || pickStoreName();
  try {
    const s = blobs.getStore({ name });
    return s;
  } catch (e) {
    try {
      const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
      if (!blobs.createClient || !siteID || !token) {
        throw new Error('[blobs-helper] createClient not available or missing siteID/token');
      }
      const client = blobs.createClient({ siteID, token });
      return client.getStore({ name });
    } catch (e2) {
      throw new Error(`[blobs-helper] Unable to open blobs store "${name}": ${e2.message}`);
    }
  }
}

async function openStore(name) { return makeStore(name); }

async function getBlobText(key, {storeName} = {}) {
  const store = await openStore(storeName);
  const res = await store.get(key);
  if (!res) return null;
  if (typeof res === 'string') return res;
  return res.body ? await res.text() : null;
}

async function putBlobJSON(key, data, {storeName} = {}) {
  const store = await openStore(storeName);
  const body = JSON.stringify(data);
  await store.set(key, body, { contentType: 'application/json' });
  return true;
}

async function loadFromBlobs(key, opts = {}) {
  try {
    const txt = await getBlobText(key, opts);
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

async function saveToBlobs(key, data, opts = {}) {
  return putBlobJSON(key, data, opts);
}

module.exports = {
  pickStoreName,
  makeStore,
  openStore,
  getBlobText,
  putBlobJSON,
  loadFromBlobs,
  saveToBlobs,
};