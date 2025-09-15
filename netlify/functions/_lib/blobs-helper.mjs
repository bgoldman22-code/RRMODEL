import { getStore, createClient } from "@netlify/blobs";

export async function saveToBlobs(name, data) {
  try {
    const store = getStore(process.env.BLOBS_STORE_NFL || "nfl-model");
    await store.set(name, JSON.stringify(data));
  } catch (err) {
    console.warn("[blobs-helper] fallback", err);
    if (process.env.NETLIFY_SITE_ID && process.env.NETLIFY_API_TOKEN) {
      const client = createClient({ siteID: process.env.NETLIFY_SITE_ID, token: process.env.NETLIFY_API_TOKEN });
      const store = client.store(process.env.BLOBS_STORE_NFL || "nfl-model");
      await store.set(name, JSON.stringify(data));
    } else {
      throw err;
    }
  }
}

export async function loadFromBlobs(name) {
  try {
    const store = getStore(process.env.BLOBS_STORE_NFL || "nfl-model");
    const val = await store.get(name);
    return val ? JSON.parse(val) : null;
  } catch (err) {
    console.warn("[blobs-helper] load fallback", err);
    return null;
  }
}
