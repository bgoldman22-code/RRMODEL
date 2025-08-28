// netlify/functions/_blobs.js (ESM)
import { createClient } from '@netlify/blobs';

function _client() {
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;
  // If both are present, force explicit creds (works in builds & local)
  if (siteID && token) return createClient({ siteID, token });
  // Else fall back to runtime-injected creds on Netlify
  return createClient();
}

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return _client().store(name);
}

// --- Back-compat aliases some of your functions reference ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
