/**
 * Netlify Blobs helper (ESM)
 * Exposes: makeStore, openStore, loadFromBlobs, saveToBlobs, getBlobText, putBlobJSON
 * Fallback store key order: BLOBS_STORE_NFL -> BLOBS_STORE -> rrmodelblobs -> nfl-td
 */
import { getStore, createClient } from '@netlify/blobs';

const STORE_KEY_ENV_ORDER = ['BLOBS_STORE_NFL','BLOBS_STORE','rrmodelblobs'];

/** choose store name */
export function pickStoreName() {
  for (const k of STORE_KEY_ENV_ORDER) {
    if (process.env[k]) return process.env[k];
  }
  return 'nfl-td';
}

/** create a store via Netlify runtime or manual client env */
export function makeStore(storeName) {
  const name = storeName || pickStoreName();
  try {
    // Netlify runtime path
    const s = getStore({ name });
    return s;
  } catch (e) {
    // Try manual client if available (Netlify local dev / build)
    try {
      const siteID = process.env.SITE_ID || process.env.NETLIFY_SITE_ID;
      const token = process.env.NETLIFY_API_TOKEN || process.env.BLOBS_TOKEN;
      if (!createClient || !siteID || !token) {
        throw new Error('[blobs-helper] createClient not available or missing siteID/token');
      }
      const client = createClient({ siteID, token });
      return client.getStore({ name });
    } catch (e2) {
      throw new Error(`[blobs-helper] Unable to open blobs store "${name}": ${e2.message}`);
    }
  }
}

export async function openStore(name) {
  return makeStore(name);
}

export async function getBlobText(key, {storeName} = {}) {
  const store = await openStore(storeName);
  const res = await store.get(key);
  if (!res) return null;
  return typeof res === 'string' ? res : (res.body ? await res.text() : null);
}

export async function putBlobJSON(key, data, {storeName} = {}) {
  const store = await openStore(storeName);
  const body = JSON.stringify(data);
  await store.set(key, body, { contentType: 'application/json' });
  return true;
}

export async function loadFromBlobs(key, opts = {}) {
  try {
    const txt = await getBlobText(key, opts);
    if (!txt) return null;
    return JSON.parse(txt);
  } catch (e) {
    return null;
  }
}

export async function saveToBlobs(key, data, opts = {}) {
  return putBlobJSON(key, data, opts);
}