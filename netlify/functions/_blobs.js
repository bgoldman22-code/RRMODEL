const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || 'rrmodelblobs';
const store = getStore({
  name: storeName,
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN
});

const safeJSONParse = (s, d=null) => { try { return JSON.parse(s); } catch { return d; } };

exports.get = async (key) => {
  try {
    const raw = await store.get(key, { type: 'text' });
    return raw ? safeJSONParse(raw) : null;
  } catch (e) {
    console.error('blobs.get', key, e.message);
    return null;
  }
};

exports.set = async (key, value) => {
  try {
    await store.set(key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error('blobs.set', key, e.message);
    return false;
  }
};

exports.del = async (key) => {
  try {
    await store.delete(key);
    return true;
  } catch (e) {
    console.error('blobs.del', key, e.message);
    return false;
  }
};