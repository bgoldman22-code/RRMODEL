// netlify/functions/_blobs.js
// Thin wrapper around @netlify/blobs for JSON get/set/del with consistent error handling.
const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';

let store;
function getStoreSafe() {
  if (store) return store;
  store = getStore({
    name: storeName,
    siteID: process.env.NETLIFY_SITE_ID,
    token: process.env.NETLIFY_BLOBS_TOKEN
  });
  return store;
}

function safeParse(input, fallback = null) {
  try { return JSON.parse(input); } catch { return fallback; }
}

exports.get = async (key) => {
  try {
    const s = await getStoreSafe().get(key, { type: 'text' });
    return s ? safeParse(s, null) : null;
  } catch (e) {
    console.error('[blobs.get] key=%s err=%s', key, e?.message || e);
    return null;
  }
};

exports.set = async (key, value) => {
  try {
    const s = JSON.stringify(value);
    await getStoreSafe().set(key, s);
    return true;
  } catch (e) {
    console.error('[blobs.set] key=%s err=%s', key, e?.message || e);
    return false;
  }
};

exports.del = async (key) => {
  try {
    await getStoreSafe().delete(key);
    return true;
  } catch (e) {
    console.error('[blobs.del] key=%s err=%s', key, e?.message || e);
    return false;
  }
};
