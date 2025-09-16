// NFL Blobs helper using Netlify's official getStore() API.
// Reads the store name from BLOBS_STORE_NFL (default 'nfl-td').
// No context.blobs, no createClient.
import { getStore } from '@netlify/blobs';

function nflStore() {
  const name = process.env.BLOBS_STORE_NFL || 'nfl-td';
  return getStore(name);
}

export async function nflBlobsGetJSON(key, fallback = null) {
  const store = nflStore();
  if (typeof store.getJSON === 'function') {
    const val = await store.getJSON(key);
    return (val === undefined || val === null) ? fallback : val;
  }
  const raw = await store.get(key);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

export async function nflBlobsPutJSON(key, obj) {
  const store = nflStore();
  if (typeof store.setJSON === 'function') {
    await store.setJSON(key, obj);
  } else {
    await store.set(key, JSON.stringify(obj), { contentType: 'application/json' });
  }
  return { key };
}
