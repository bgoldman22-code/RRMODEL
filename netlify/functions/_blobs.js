// netlify/functions/_blobs.js
// Robust, lazy-loaded wrapper around @netlify/blobs that never throws at import time.

let _store = null;

function getStoreSafe() {
  if (_store) return _store;
  try {
    const { getStore } = require('@netlify/blobs');
    const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';
    // When running on Netlify Functions on your own site, siteID/token are auto-inferred.
    // Providing them is still OK if present in env.
    _store = getStore({
      name,
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_BLOBS_TOKEN,
    });
    return _store;
  } catch (e) {
    console.error('[blobs] failed to load @netlify/blobs:', e && e.message ? e.message : e);
    return null;
  }
}

const safeParse = (txt) => {
  try { return JSON.parse(txt); } catch (e) { return null; }
};

exports.get = async (key) => {
  try {
    const store = getStoreSafe();
    if (!store) return null;
    const raw = await store.get(key, { type: 'text' });
    return raw ? safeParse(raw) : null;
  } catch (e) {
    console.error('[blobs.get] key=', key, 'err=', e && e.message ? e.message : e);
    return null;
  }
};

exports.set = async (key, obj) => {
  try {
    const store = getStoreSafe();
    if (!store) return false;
    await store.set(key, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('[blobs.set] key=', key, 'err=', e && e.message ? e.message : e);
    return false;
  }
};

exports.del = async (key) => {
  try {
    const store = getStoreSafe();
    if (!store) return false;
    await store.delete(key);
    return true;
  } catch (e) {
    console.error('[blobs.del] key=', key, 'err=', e && e.message ? e.message : e);
    return false;
  }
};
