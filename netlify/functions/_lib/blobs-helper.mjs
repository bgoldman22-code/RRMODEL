
import { createClient } from '@netlify/blobs';

export function getStoreName() {
  return process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || 'nfl-model';
}

export async function openStore() {
  // In Netlify runtime, createClient works without args. Locally, siteID/token required.
  try {
    return createClient({ name: getStoreName() });
  } catch (err) {
    const msg = `[blobs-helper] @netlify/blobs.createClient is not available. Please update @netlify/blobs to v5+ or run in Netlify runtime.`;
    throw new Error(msg);
  }
}

export async function saveToBlobs(key, data) {
  const client = await openStore();
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  await client.set(key, body, { contentType: 'application/json' });
  return true;
}

export async function loadFromBlobs(key) {
  const client = await openStore();
  const res = await client.get(key, { type: 'json' });
  return res ?? null;
}
