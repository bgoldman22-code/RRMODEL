// Safe shim around @netlify/blobs so Functions don't crash when Blobs is not configured.
// Exports:
//   - getBlobsStore(name): returns {getJSON,setJSON,list} or null-store if unavailable
//   - createStore(name): alias of getBlobsStore for compatibility
import { getStore } from '@netlify/blobs';

const hasBlobsContext = !!(process.env.NETLIFY && process.env.NETLIFY_SITE_ID);
const NFL_STORE_NAME = process.env.BLOBS_STORE_NFL || process.env.BLOBS_STORE || "nfl-td";

function makeNullStore() {
  return {
    async getJSON(_key){ return null; },
    async setJSON(_key,_val){ return; },
    async list(){ return { blobs:[], directories:[] }; },
  };
}

export function getBlobsStore(name = NFL_STORE_NAME) {
  if (!hasBlobsContext) return makeNullStore();
  try {
    return getStore({ name });
  } catch (e) {
    // If Blobs lib throws missing env/site token, use null-store to avoid hard-crash.
    return makeNullStore();
  }
}

export const createStore = getBlobsStore;
