const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || 'rrmodelblobs';
const store = getStore({
  name: storeName,
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN
});

const safeJSONParse = (s, d=null)=>{ try { return JSON.parse(s); } catch { return d; } };

exports.get = async (key) => {
  try {
    const raw = await store.get(key, { type: 'text' });
    if (!raw) return null;
    return safeJSONParse(raw, null);
  } catch (err) {
    console.error('[blobs.get]', key, err.message);
    return null;
  }
};

exports.set = async (key, value) => {
  try {
    await store.set(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('[blobs.set]', key, err.message);
    return false;
  }
};

exports.del = async (key) => {
  try {
    await store.delete(key);
    return true;
  } catch (err) {
    console.error('[blobs.del]', key, err.message);
    return false;
  }
};
