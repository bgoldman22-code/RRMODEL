// netlify/functions/_blobs.js
import * as real from '@netlify/blobs';

const DEFAULT_MLB = process.env.BLOBS_STORE || 'mlb-odds';

function getStore(arg) {
  const name   = (typeof arg === 'string') ? arg : (arg && arg.name) || DEFAULT_MLB;
  const siteID = (arg && arg.siteID) || process.env.NETLIFY_SITE_ID;
  const token  = (arg && arg.token)  || process.env.NETLIFY_BLOBS_TOKEN;

  if (real && typeof real.getStore === 'function') {
    return real.getStore({ name, siteID, token });
  }
  if (real && typeof real.createClient === 'function') {
    const client = real.createClient({ siteID, token });
    return client.store(name);
  }
  throw new Error('Netlify Blobs API not available at runtime.');
}

async function getJSON(store, key) {
  return store.get(key, { type: 'json' });
}
async function setJSON(store, key, value) {
  return store.set(key, JSON.stringify(value), { contentType: 'application/json' });
}

export { getStore, getJSON, setJSON };
export const getBlobsStore = getStore;
export const openStore = getStore;
export const makeStore = getStore;

try {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStore, getBlobsStore: getStore, openStore: getStore, makeStore: getStore, getJSON, setJSON };
  }
} catch {}
