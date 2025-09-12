// netlify/functions/_blobs.cjs
// Helper wrapper around @netlify/blobs with JSON convenience methods.
// Uses environment variables: BLOBS_STORE_NFL (or rrmodelblobs), NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN

let store;
function getStore() {
  if (store) return store;
  try {
    const { getStore } = require("@netlify/blobs");
    const name  = process.env.BLOBS_STORE_NFL || "rrmodelblobs";
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    store = getStore({ name, siteID, token });
    return store;
  } catch (e) {
    throw new Error("Failed to load @netlify/blobs: " + String(e));
  }
}

async function get(key) {
  try {
    const s = getStore();
    const raw = await s.get(key, { type: "text" });
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  } catch (e) {
    return null;
  }
}

async function set(key, val) {
  try {
    const s = getStore();
    await s.set(key, JSON.stringify(val));
    return true;
  } catch (e) {
    return false;
  }
}

async function del(key) {
  try {
    const s = getStore();
    await s.delete(key);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { get, set, del, getStore };