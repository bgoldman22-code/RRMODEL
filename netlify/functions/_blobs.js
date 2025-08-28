// netlify/functions/_blobs.js  (ESM shim that supports both modern & legacy Netlify Blobs APIs)
/*
  Provides a single, stable interface for your functions:
    import { getBlobsStore } from "./_blobs.js";
  and back-compat aliases:
    import { getSafeStore, openStore, makeStore } from "./_blobs.js";

  It prefers explicit creds (NETLIFY_SITE_ID, NETLIFY_BLOBS_TOKEN), else
  falls back to runtime-injected credentials on Netlify.
*/
import * as Blobs from '@netlify/blobs';

function createClientCompat() {
  // Try modern API first (createClient)
  if (typeof Blobs.createClient === 'function') {
    const siteID = process.env.NETLIFY_SITE_ID;
    const token  = process.env.NETLIFY_BLOBS_TOKEN;
    if (siteID && token) return Blobs.createClient({ siteID, token });
    return Blobs.createClient();
  }
  // Legacy API shape (getStore / createStore)
  if (typeof Blobs.getStore === 'function' || typeof Blobs.createStore === 'function') {
    return {
      store(name) {
        if (typeof Blobs.getStore === 'function') return Blobs.getStore(name);
        return Blobs.createStore(name);
      }
    };
  }
  throw new Error('No compatible Netlify Blobs client found in @netlify/blobs');
}

function _client() {
  return createClientCompat();
}

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return _client().store(name);
}

// --- Back-compat aliases your code referenced elsewhere ---
export const getSafeStore = getBlobsStore;
export const openStore   = getBlobsStore;
export function makeStore(name) { return getBlobsStore(name); }
