// netlify/functions/_blobs.js
import { getStore, blobs } from '@netlify/blobs';

/** Back-compat shim: matches existing imports `getBlobsStore()` */
export function getBlobsStore(nameEnv = 'BLOBS_STORE') {
  const name = process.env[nameEnv] || 'mlb-odds';
  // 1) Bound store
  try {
    const store = getStore(name);
    if (store) return store;
  } catch {}
  // 2) Manual connect (env)
  try {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (siteID && token) return blobs.connect({ siteID, token, name });
  } catch {}
  // 3) Null (caller must guard)
  return null;
}
