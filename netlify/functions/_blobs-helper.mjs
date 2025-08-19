// helper to get a Blobs store robustly
import { getStore as _getStore } from "@netlify/blobs";

function createStore() {
  const NAME = process.env.BLOBS_STORE || "rrmodelblobs";
  try {
    // Works on Netlify when Blobs env is available
    return _getStore(NAME);
  } catch (e) {
    // Fallback to explicit siteID/token if auto env missing
    const siteID = process.env.NETLIFY_BLOBS_SITE_ID || process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (!siteID || !token) {
      const err = new Error("MissingBlobsEnvironmentError: provide NETLIFY_BLOBS_SITE_ID (or SITE_ID) and NETLIFY_BLOBS_TOKEN");
      err.original = e;
      throw err;
    }
    return _getStore({ name: NAME, siteID, token });
  }
}

async function readJSON(store, key) {
  try {
    const rsp = await store.get(key, { type: "json" });
    if (rsp != null) return rsp;
  } catch (_) {}
  const blob = await store.get(key);
  if (!blob) return null;
  const txt = await blob.text();
  try { return JSON.parse(txt); } catch { return null; }
}
async function writeJSON(store, key, obj) {
  await store.set(key, JSON.stringify(obj), { contentType: "application/json" });
}

export { createStore, readJSON, writeJSON };