// netlify/functions/_blobs.js
// Single helper for Netlify Blobs across all functions.

// CJS import (Netlify Node functions allow this)
const { getStore } = require('@netlify/blobs');

const STORE_DEFAULT = process.env.BLOBS_STORE_NFL || 'rrmodelblobs';

/**
 * Return a store bound to our site context.
 * If Netlify's implicit context is not available, pass siteID/token explicitly via env.
 */
function getBlobsStore(name = STORE_DEFAULT) {
  const opts = { name };
  const siteID = process.env.NETLIFY_SITE_ID || process.env.SITE_ID;
  const token  = process.env.NETLIFY_BLOBS_TOKEN || process.env.NETLIFY_AUTH_TOKEN;

  // Only attach credentials when the runtime doesn't inject context.
  if (siteID && token) {
    opts.siteID = siteID;
    opts.token  = token;
  }
  const store = getStore(opts);

  // Convenience wrappers (always strings)
  return {
    async get(key) {
      const v = await store.get(key);
      if (!v) return null;
      // v may be string or object w/ body; normalize
      if (typeof v === 'string') return v;
      if (v && typeof v.text === 'function') return await v.text();
      try { return JSON.stringify(v); } catch { return String(v); }
    },
    async set(key, val, meta = {}) {
      const value = typeof val === 'string' ? val : JSON.stringify(val);
      return store.set(key, value, meta);
    },
    async del(key) {
      return store.delete(key);
    },
    // for troubleshooting
    _raw: store,
    name
  };
}

module.exports = { getBlobsStore };
