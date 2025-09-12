const { getStore } = require('@netlify/blobs');

const storeName = process.env.BLOBS_STORE_NFL || process.env.NFL_TD_BLOBS || "nfl-td";
const store = getStore({
  name: storeName,
  siteID: process.env.NETLIFY_SITE_ID,
  token: process.env.NETLIFY_BLOBS_TOKEN,
});

const safeJSONParse = (input, fallback=null) => {
  try { return JSON.parse(input); } catch { return fallback; }
};

exports.get = async (key) => {
  try {
    const raw = await store.get(key, { type: "text" });
    return raw ? safeJSONParse(raw) : null;
  } catch (err) {
    console.error("Blobs get error:", err);
    return null;
  }
};

exports.set = async (key, value) => {
  try {
    await store.set(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error("Blobs set error:", err);
    return false;
  }
};

exports.del = async (key) => {
  try {
    await store.delete(key);
    return true;
  } catch (err) {
    console.error("Blobs del error:", err);
    return false;
  }
};
