// helper to get a Blobs store robustly
// Uses the same explicit-credentials pattern as odds-get.cjs (which works).
import { getStore as _getStore } from "@netlify/blobs";

// Same fallback credentials used by the working odds-get.cjs function
const SITE_ID = process.env.NETLIFY_SITE_ID
  || process.env.SITE_ID
  || "967be648-eddc-4cc5-a7cc-e2ab7db8ac75";
const BLOBS_TOKEN = process.env.NETLIFY_BLOBS_TOKEN
  || process.env.NETLIFY_AUTH_TOKEN
  || "nfp_UhqxsS88iqAnWCKbegv2w3PApVrYws6K6263";

function createStore() {
  const NAME = process.env.BLOBS_STORE || "rrmodelblobs";
  // Always use explicit credentials — auto-inject is unreliable
  return _getStore({ name: NAME, siteID: SITE_ID, token: BLOBS_TOKEN });
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