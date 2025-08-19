
// netlify/functions/_blobs.js
import { getStore } from "@netlify/blobs";

export function getBlobsStore(name) {
  const STORE = name || process.env.BLOBS_STORE || "rrmodelblobs";
  try {
    return getStore({ name: STORE });
  } catch (e) {
    const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
    const token = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_API_TOKEN;
    if (!siteID || !token) throw e;
    return getStore({ name: STORE, siteID, token });
  }
}
