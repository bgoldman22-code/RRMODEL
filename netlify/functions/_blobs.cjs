// netlify/functions/_blobs.cjs
// Minimal helper around @netlify/blobs v7 style API.
const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';

let _store;
function store() {
  if (!_store) {
    _store = getStore({
      name: storeName,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
  }
  return _store;
}

const safeJSON = (s) => {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
};

exports.get = async (key) => {
  try {
    const txt = await store().get(key, { type: 'text' });
    return safeJSON(txt);
  } catch (e) {
    console.error('[_blobs.get] error', e);
    return null;
  }
};

exports.set = async (key, obj) => {
  try {
    await store().set(key, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('[_blobs.set] error', e);
    return false;
  }
};

exports.del = async (key) => {
  try {
    await store().delete(key);
    return true;
  } catch (e) {
    console.error('[_blobs.del] error', e);
    return false;
  }
};

exports.storeInfo = () => ({ name: storeName });
