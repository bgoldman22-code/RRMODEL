// netlify/functions/_blobs.cjs - CommonJS helper to unify Netlify Blobs usage
const real = require('@netlify/blobs');

function getBlobsStore(name) {
  const defaultName = process.env.BLOBS_STORE || 'mlb-odds';
  if (real && typeof real.getStore === 'function') {
    // Modern API
    return real.getStore({ name: name || defaultName });
  }
  // Fallback no-op store to avoid crashes
  const noop = {
    async get() { return null; },
    async getJSON() { return null; },
    async set() {},
    async setJSON() {},
    async list() { return { blobs: [] }; },
  };
  return noop;
}

module.exports = {
  getBlobsStore,
  // Back-compat aliases some code expects
  getSafeStore: getBlobsStore,
  openStore: getBlobsStore,
  makeStore: getBlobsStore,
};
