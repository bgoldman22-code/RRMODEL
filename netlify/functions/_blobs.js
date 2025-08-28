// netlify/functions/_blobs.js - ESM helper to unify Netlify Blobs usage
import { getStore } from '@netlify/blobs';

export function getBlobsStore(name = process.env.BLOBS_STORE || 'mlb-odds') {
  return getStore({ name });
}

// Back-compat names
export const getSafeStore = getBlobsStore;
export const openStore = getBlobsStore;
export function makeStore(name){ return getBlobsStore(name); }
