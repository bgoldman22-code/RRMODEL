// netlify/functions/_blobs.js
/**
 * Cross-version/cross-module helper for Netlify Blobs.
 * - Uses dynamic import so it works even if @netlify/blobs is ESM-only.
 * - If NETLIFY_SITE_ID + NETLIFY_BLOBS_TOKEN exist, tries explicit-cred path:
 *    a) createClient({ siteID, token }).getStore(name)  (newer API)
 *    b) getStore(name, { siteID, token })               (older-but-supported API)
 * - Falls back to getStore(name) if credentials aren’t present or not supported.
 *
 * NOTE: This helper is ASYNC. Callers must:  const store = await getBlobsStore('nfl-td')
 */

async function _resolveBlobsModule() {
  const mod = await import('@netlify/blobs');
  // Some environments expose named exports; some expose them under default
  const api = {
    getStore: mod.getStore || (mod.default && mod.default.getStore),
    createClient: mod.createClient || (mod.default && mod.default.createClient),
  };
  if (!api.getStore) {
    throw new Error('Unable to load @netlify/blobs.getStore from runtime');
  }
  return api;
}

async function getBlobsStore(name) {
  const { getStore, createClient } = await _resolveBlobsModule();
  const siteID = process.env.NETLIFY_SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN;

  if (siteID && token) {
    // Newer API: client.getStore(name)
    if (typeof createClient === 'function') {
      const client = createClient({ siteID, token });
      return client.getStore(name);
    }
    // Older API: getStore(name, { siteID, token })
    if (getStore && getStore.length >= 2) {
      return getStore(name, { siteID, token });
    }
  }
  // Fallback: auto-injected credentials (prod) or local dev
  return getStore(name);
}

module.exports = { getBlobsStore };
