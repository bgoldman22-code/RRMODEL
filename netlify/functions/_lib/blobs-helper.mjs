// netlify/functions/_lib/blobs-helper.mjs
// Safe helper for Netlify Blobs with graceful fallbacks and verbose logging.
import * as blobs from '@netlify/blobs';

function log(...args) {
  console.log('[blobs-helper]', ...args);
}

export async function openStore(storeNameEnvKeys = ['BLOBS_STORE_NFL', 'BLOBS_STORE']) {
  const storeName = process.env[storeNameEnvKeys[0]] || process.env[storeNameEnvKeys[1]] || 'rrmodel-nfl';
  // Try auto-configured environment first
  try {
    const store = await blobs.getStore(storeName);
    log('Opened store via getStore()', { storeName });
    return store;
  } catch (e1) {
    log('getStore() failed, trying manual client…', e1?.name || e1?.message || e1);
  }
  // Fallback to manual client if siteID + token are provided
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token = process.env.NETLIFY_AUTH_TOKEN || process.env.AUTH_TOKEN;
  if (siteID && token) {
    try {
      const client = blobs.default?.createClient
        ? blobs.default.createClient({ siteID, token })
        : (blobs.createClient ? blobs.createClient({ siteID, token }) : null);
      if (!client) throw new Error('createClient not available on @netlify/blobs export');
      const store = client.getStore(storeName);
      log('Opened store via createClient()', { storeName });
      return store;
    } catch (e2) {
      log('createClient fallback failed:', e2?.name || e2?.message || e2);
    }
  } else {
    log('Missing NETLIFY_SITE_ID/NETLIFY_AUTH_TOKEN for manual client fallback');
  }

  // Last resort: in-memory store (non-persistent)
  const mem = new Map();
  log('Using in-memory store (NOT PERSISTED).');
  return {
    async set(key, value, opts={}) { mem.set(key, typeof value === 'string' ? value : JSON.stringify(value)); },
    async get(key) { return mem.get(key) || null; },
    async list() { return Array.from(mem.keys()); }
  };
}
