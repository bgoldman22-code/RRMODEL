
// netlify/functions/_lib/blobs-optional.mjs
// Helpers that make Netlify Blobs strictly optional.
// We only write to blobs if a store can be created; otherwise we continue in "stateless" mode.
import { getStore } from './_blobs.js';

export function hasBlobsEnv() {
  return !!(process.env.NETLIFY && (process.env.NETLIFY_SITE_ID || process.env.SITE_ID));
}

export async function getStoreOrNull(nameEnvCandidates = []) {
  try {
    if (!hasBlobsEnv()) return null;
    const names = [...nameEnvCandidates, "BLOBS_STORE_NFL", "BLOBS_STORE"].filter(Boolean);
    let storeName = null;
    for (const k of names) {
      if (process.env[k]) { storeName = process.env[k]; break; }
    }
    if (!storeName) return null;
    return getStore({ name: storeName });
  } catch (e) {
    return null;
  }
}

export async function putJSONIfStore(store, key, obj) {
  if (!store) return false;
  try {
    await store.set(key, JSON.stringify(obj), { contentType: "application/json" });
    return true;
  } catch (e) {
    return false;
  }
}

export async function listKeys(store, prefix="") {
  if (!store) return { blobs: [], directories: [] };
  try {
    const res = await store.list({ prefix });
    return res;
  } catch (e) {
    return { blobs: [], directories: [] };
  }
}
