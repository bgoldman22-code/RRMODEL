// netlify/functions/_blobs.js  (ESM helper)
// Unifies @netlify/blobs across versions and centralizes credentials.
import * as pkg from '@netlify/blobs';

function getClient() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  // Preferred modern API
  if (typeof pkg.createClient === 'function') {
    try {
      if (siteID && token) return pkg.createClient({ siteID, token });
      return pkg.createClient();
    } catch (e) {
      // Some environments still require explicit creds even if Netlify injects them
      if (siteID && token) return pkg.createClient({ siteID, token });
      throw e;
    }
  }

  // Older API: expose getStore directly if present
  if (typeof pkg.getStore === 'function') {
    return { store: (name) => pkg.getStore(name) };
  }

  throw new Error('Unsupported @netlify/blobs API in this runtime (no createClient/getStore).');
}

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return getClient().store(name);
}

// --- Back-compat aliases referenced by older functions ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name){ return getBlobsStore(name); }

// Optional helpers a few functions use
export async function getJSON(store, key){ return (await store.getJSON?.(key)) ?? null; }
export async function setJSON(store, key, value){ return store.setJSON?.(key, value); }
