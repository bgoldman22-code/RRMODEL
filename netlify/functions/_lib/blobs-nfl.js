// netlify/functions/_lib/blobs-nfl.js
// Stable Netlify Blobs helper using getStore() — no context bindings required
import { getStore } from '@netlify/blobs';

const STORE_NAME = process.env.BLOBS_STORE_NFL || 'nfl-td';

function nflStore() {
  return getStore(STORE_NAME);
}

export async function nflBlobsGetJSON(key, fallback = null) {
  try {
    const val = await nflStore().get(key, { type: 'json' });
    return (val === undefined || val === null) ? fallback : val;
  } catch (err) {
    console.warn(`[blobs-nfl] getJSON failed for ${key}:`, err?.message || err);
    return fallback;
  }
}

export async function nflBlobsPutJSON(key, obj) {
  const body = JSON.stringify(obj);
  await nflStore().set(key, body, { contentType: 'application/json; charset=utf-8' });
  return { key, bytes: body.length };
}

export async function nflBlobsGetText(key, fallback = null) {
  try {
    const val = await nflStore().get(key, { type: 'text' });
    return (val === undefined || val === null) ? fallback : val;
  } catch (err) {
    console.warn(`[blobs-nfl] getText failed for ${key}:`, err?.message || err);
    return fallback;
  }
}

export async function nflBlobsPutText(key, text) {
  await nflStore().set(key, text, { contentType: 'text/plain; charset=utf-8' });
  return { key, bytes: text.length };
}

export async function nflBlobsDelete(key) {
  try {
    await nflStore().delete(key);
    return { key, deleted: true };
  } catch (err) {
    return { key, deleted: false, error: String(err?.message || err) };
  }
}
