// netlify/functions/_blobs.js
// Thin wrapper around @netlify/blobs with JSON helpers

const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'rrmodelblobs';

const store = getStore({
  name: storeName,
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN
});

async function get(key) {
  try {
    const raw = await store.get(key, { type: 'text' });
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  } catch (e) {
    console.error('blobs.get error', e);
    return null;
  }
}

async function set(key, obj) {
  try {
    await store.set(key, JSON.stringify(obj));
    return true;
  } catch (e) {
    console.error('blobs.set error', e);
    return false;
  }
}

async function del(key) {
  try {
    await store.delete(key);
    return true;
  } catch (e) {
    console.error('blobs.delete error', e);
    return false;
  }
}

module.exports = { get, set, del, storeName };
