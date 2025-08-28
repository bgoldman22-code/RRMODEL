// helper to get a Blobs store robustly
import { getStore as _getStore } from "./_blobs.js";

function createStore() {
  const NAME = process.env.BLOBS_STORE || "mlb-odds";
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  return _getStore({ name: NAME, siteID, token });
}

export function getSafeStore(name) {
  return _getStore({ name: name || (process.env.BLOBS_STORE || "mlb-odds"), siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
}
export const openStore = getSafeStore;
export function makeStore(name) {
  return _getStore({ name, siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_BLOBS_TOKEN });
}

export default { getSafeStore, openStore, makeStore };
