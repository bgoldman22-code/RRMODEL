import { getBlobsStore, openStore, getSafeStore, makeStore } from './_blobs.js';
// netlify/functions/_blobs.js (ESM)
import pkg from '@netlify/blobs';
const { createClient } = pkg ?? {};

function _client() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  if (createClient) {
    if (siteID && token) return createClient({ siteID, token });
    return createClient();
  }
  // Fallback for older @netlify/blobs versions that export default client
  if (typeof pkg === 'function') {
    return pkg({ siteID, token });
  }
  throw new Error('Blobs client not available: check @netlify/blobs version');
}

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return _client().store(name);
}
// Back-compat aliases
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name){ return getBlobsStore(name); }
