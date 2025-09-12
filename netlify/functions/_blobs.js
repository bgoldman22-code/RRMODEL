// netlify/functions/_blobs.js
// Minimal, lazy-initialized wrapper around Netlify Blobs that NEVER throws at import time.
let _store = null;

function ensureStore() {
  if (_store) return _store;
  // Lazy require so failures don't crash the function before handler runs
  const { getStore } = require('@netlify/blobs');
  const name = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';
  _store = getStore({ name });
  return _store;
}

function safeParse(txt) {
  try { return JSON.parse(txt); } catch { return null; }
}

async function get(key) {
  try {
    const store = ensureStore();
    const raw = await store.get(key, { type: 'text' });
    if (!raw) return null;
    const data = safeParse(raw);
    return data;
  } catch (e) {
    console.error("[_blobs.get] error:", e && e.message || e);
    return null;
  }
}

async function set(key, value) {
  try {
    const store = ensureStore();
    await store.set(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("[_blobs.set] error:", e && e.message || e);
    return false;
  }
}

async function del(key) {
  try {
    const store = ensureStore();
    await store.delete(key);
    return true;
  } catch (e) {
    console.error("[_blobs.del] error:", e && e.message || e);
    return false;
  }
}

module.exports = { get, set, del };