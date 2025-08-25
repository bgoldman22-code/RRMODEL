// ESM helper for NFL Blobs access
import { getStore } from '@netlify/blobs';

export const NFL_BLOBS_NAME =
  process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-td';

export function nflStore() {
  // If Blobs isn’t enabled, Netlify throws MissingBlobsEnvironmentError here.
  return getStore({ name: NFL_BLOBS_NAME });
}

export async function getJSON(key) {
  const store = nflStore();
  // getJSON returns undefined if missing
  return await store.getJSON(key);
}

export async function setJSON(key, value) {
  const store = nflStore();
  // setJSON automatically writes application/json
  await store.setJSON(key, value);
}
