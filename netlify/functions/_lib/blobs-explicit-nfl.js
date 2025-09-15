// NFL Blobs helper using EXPLICIT createClient credentials.
// No context.blobs. No getStore().
// Requires env vars for credentials and store name.
//
// Env (set in Netlify UI):
// - SITE_ID or NETLIFY_SITE_ID
// - NETLIFY_API_TOKEN or NETLIFY_BLOBS_TOKEN (token must have Blobs read/write on this site)
// - BLOBS_STORE_NFL (e.g., "nfl-td")
//
import { createClient } from '@netlify/blobs';

function getEnv(nameList, fallback = null) {
  for (const n of nameList) {
    const v = process.env[n];
    if (v) return v;
  }
  return fallback;
}

function getClient() {
  const siteID = getEnv(['NETLIFY_SITE_ID', 'SITE_ID']);
  const token  = getEnv(['NETLIFY_API_TOKEN', 'NETLIFY_BLOBS_TOKEN']);
  if (!siteID || !token) {
    const missing = [];
    if (!siteID) missing.push('SITE_ID or NETLIFY_SITE_ID');
    if (!token)  missing.push('NETLIFY_API_TOKEN or NETLIFY_BLOBS_TOKEN');
    throw new Error('Missing Netlify Blobs credentials: ' + missing.join(', '));
  }
  return createClient({ siteID, token });
}

function getStoreName() {
  return process.env.BLOBS_STORE_NFL || 'nfl-td';
}

function getStore(client) {
  // Prefer official store() if available
  if (typeof client.store === 'function') {
    return client.store(getStoreName());
  }
  // Fallback: emulate a store by prefixing keys
  const prefix = getStoreName().replace(/\/+$/,'') + '/';
  return {
    async get(key){ return client.get(prefix + key); },
    async getJSON(key){ return client.getJSON ? client.getJSON(prefix + key) : JSON.parse(await client.get(prefix + key)); },
    async set(key, body, opts){ return client.set(prefix + key, body, opts); },
    async setJSON(key, obj){ return client.setJSON ? client.setJSON(prefix + key, obj) : client.set(prefix + key, JSON.stringify(obj), { contentType: 'application/json' }); }
  };
}

export function nflBlobs() {
  const client = getClient();
  return getStore(client);
}

export async function nflGetJSON(key, fallback = null) {
  const store = nflBlobs();
  try {
    if (typeof store.getJSON === 'function') {
      const val = await store.getJSON(key);
      return (val === undefined || val === null) ? fallback : val;
    }
    const raw = await store.get(key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export async function nflSetJSON(key, obj) {
  const store = nflBlobs();
  if (typeof store.setJSON === 'function') {
    await store.setJSON(key, obj);
  } else {
    await store.set(key, JSON.stringify(obj), { contentType: 'application/json' });
  }
  return { key };
}
