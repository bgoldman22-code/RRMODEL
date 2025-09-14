/**
 * Thin helpers around @netlify/blobs that work both with and without
 * explicit siteID/token envs. We only import getStore which exists in all
 * current @netlify/blobs main builds. No createClient usage.
 */
import { getStore } from '@netlify/blobs';

/**
 * openStore(nameOrEnv: string): returns a BlobStore.
 * - If nameOrEnv looks like an env var name (e.g., "BLOBS_STORE_NFL"),
 *   we read process.env[nameOrEnv]; otherwise we treat it as the store name.
 * - Optional siteID/token can be provided via env:
 *   NETLIFY_BLOBS_SITE_ID, NETLIFY_BLOBS_TOKEN
 */
export async function openStore(nameOrEnv) {
  const envName = process.env[nameOrEnv];
  const name = envName && envName.trim() ? envName.trim() : nameOrEnv;
  const options = {};
  if (process.env.NETLIFY_BLOBS_SITE_ID && process.env.NETLIFY_BLOBS_TOKEN) {
    options.siteID = process.env.NETLIFY_BLOBS_SITE_ID;
    options.token = process.env.NETLIFY_BLOBS_TOKEN;
  }
  // getStore is sync but we keep async API to avoid breaking callers
  return getStore({ name, ...options });
}

export async function getJSON(store, key, fallback = null) {
  try {
    const txt = await store.get(key);
    if (!txt) return fallback;
    return JSON.parse(txt);
  } catch (err) {
    return fallback;
  }
}

export async function putJSON(store, key, obj) {
  const body = JSON.stringify(obj);
  return store.set(key, body, { contentType: 'application/json' });
}
